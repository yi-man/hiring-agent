import { ChatOpenAI } from '@langchain/openai';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import {
  appendReplanToMarkdown,
  renderPlanToMarkdown,
  updateStepInMarkdown,
} from './plan-markdown';
import type { StepStatus, TaskPlan } from './types';

const BrowserSubStepSchema = z.object({
  action: z.enum(['navigate', 'snapshot', 'click', 'type', 'close']),
  params: z.record(z.string()),
  description: z.string(),
});

// OpenAI structured outputs ("json_schema") require all fields to be present.
// We therefore define a schema that keeps `browserSubSteps` required but nullable.
const TaskStepSchemaForStructuredOutput = z.object({
  id: z.string(),
  description: z.string(),
  type: z.enum(['browser_action', 'analysis', 'report']),
  // OpenAI structured outputs does not support `.optional()` fields unless marked `.nullable()`.
  // We require the field but allow it to be null, then normalize null -> undefined for our TS types.
  browserSubSteps: z.array(BrowserSubStepSchema).nullable(),
  onFailure: z.enum(['replan', 'skip', 'abort']),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'waiting_user']).default('pending'),
});

const TaskPlanSchemaForStructuredOutput = z.object({
  goal: z.string(),
  steps: z.array(TaskStepSchemaForStructuredOutput),
  fallbackStrategy: z.string(),
});

// Fallback parsing schema for when the provider rejects json_schema.
// Unlike structured output, here we can be more permissive and allow `browserSubSteps` to be missing.
const TaskStepSchemaForParse = z.object({
  id: z.string(),
  description: z.string(),
  type: z.enum(['browser_action', 'analysis', 'report']),
  browserSubSteps: z.array(BrowserSubStepSchema).nullable().optional(),
  onFailure: z.enum(['replan', 'skip', 'abort']),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'waiting_user']).default('pending'),
});

const TaskPlanSchemaForParse = z.object({
  goal: z.string(),
  steps: z.array(TaskStepSchemaForParse),
  fallbackStrategy: z.string(),
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function buildPlannerModel(): ChatOpenAI {
  return new ChatOpenAI({
    apiKey: requireEnv('OPENAI_API_KEY'),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    configuration: { baseURL: process.env.OPENAI_BASE_URL },
    temperature: 0.2,
  });
}

const PLANNER_SYSTEM_PROMPT = `You are a task planner for a browser automation system. Given a user request, produce a structured plan with clear steps.

Rules:
- Each step has an id like "step-1", "step-2", etc.
- Steps of type "browser_action" must include browserSubSteps detailing each browser operation.
- Available browser actions: navigate, snapshot, click, type, close.
- Set onFailure to "replan" for steps that might fail due to page structure, "skip" for optional steps, "abort" for critical steps.
- All steps should have status "pending".
- Provide a fallbackStrategy describing what to do if the overall task cannot be completed.
- Keep plans concise — typically 2-5 steps.`;

export interface GeneratePlanOptions {
  userMessage: string;
  browserStatus: { url: string; title: string } | null;
  runId: string;
  replanContext?: { previousPlan: TaskPlan; error: string; completedStepIds: string[] };
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function isJsonSchemaUnsupportedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /json_schema/i.test(message) && /not supported/i.test(message);
}

export async function generatePlan(options: GeneratePlanOptions): Promise<TaskPlan> {
  const model = buildPlannerModel();

  let userPrompt = options.userMessage;
  if (options.browserStatus) {
    userPrompt += `\n\n[Current browser state: URL=${options.browserStatus.url}, Title="${options.browserStatus.title}"]`;
  }
  if (options.replanContext) {
    const { previousPlan, error, completedStepIds } = options.replanContext;
    userPrompt += `\n\n[REPLAN NEEDED]\nPrevious goal: ${previousPlan.goal}\nCompleted steps: ${completedStepIds.join(', ')}\nError: ${error}\nPlease create a revised plan for the remaining work.`;
  }

  try {
    const structured = model.withStructuredOutput(TaskPlanSchemaForStructuredOutput);
    const parsed = await structured.invoke([
      { role: 'system', content: PLANNER_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ]);

    return {
      ...parsed,
      steps: parsed.steps.map((step) => ({
        ...step,
        status: step.status ?? 'pending',
        browserSubSteps: step.browserSubSteps ?? undefined,
      })),
    };
  } catch (e) {
    if (!isJsonSchemaUnsupportedError(e)) throw e;
  }

  // Fallback: retry using json_object and parse+validate locally.
  const OPENAI_API_KEY = requireEnv('OPENAI_API_KEY');
  const baseURL = requireEnv('OPENAI_BASE_URL').replace(/\/$/, '');
  const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const system = `${PLANNER_SYSTEM_PROMPT}\n\nReturn ONLY a valid JSON object matching the schema. Do not wrap in markdown.`;
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  const data: unknown = await res.json();
  if (!res.ok) {
    const msg = data instanceof Error ? data.message : JSON.stringify(data);
    throw new Error(`Planner fallback LLM request failed: ${res.status} ${msg}`);
  }

  const content =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any)?.choices?.[0]?.message?.content ?? '';

  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Planner fallback LLM returned empty content');
  }

  const jsonText = extractJsonObject(content);
  const raw = JSON.parse(jsonText) as unknown;
  const validated = TaskPlanSchemaForParse.parse(raw);

  return {
    ...validated,
    steps: validated.steps.map((step) => ({
      ...step,
      status: step.status ?? 'pending',
      browserSubSteps: step.browserSubSteps ?? undefined,
    })),
  };
}

const PLANS_DIR = join(process.cwd(), 'data', 'workflow-plans');

export async function savePlanMarkdown(plan: TaskPlan, runId: string): Promise<string> {
  await mkdir(PLANS_DIR, { recursive: true });
  const filePath = join(PLANS_DIR, `${runId}.md`);
  const md = renderPlanToMarkdown({ plan, runId, createdAt: new Date().toISOString() });
  await writeFile(filePath, md, 'utf-8');
  return filePath;
}

export async function updatePlanStepMarkdown(
  runId: string,
  stepId: string,
  status: StepStatus,
  summary?: string,
): Promise<void> {
  const filePath = join(PLANS_DIR, `${runId}.md`);
  try {
    const content = await readFile(filePath, 'utf-8');
    const updated = updateStepInMarkdown(content, stepId, status, summary);
    await writeFile(filePath, updated, 'utf-8');
  } catch (e) {
    if (e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw e;
    }
  }
}

export async function appendReplanMarkdown(
  runId: string,
  reason: string,
  newPlan: TaskPlan,
): Promise<void> {
  const filePath = join(PLANS_DIR, `${runId}.md`);
  try {
    const content = await readFile(filePath, 'utf-8');
    const updated = appendReplanToMarkdown(content, reason, newPlan);
    await writeFile(filePath, updated, 'utf-8');
  } catch {
    // file may not exist
  }
}
