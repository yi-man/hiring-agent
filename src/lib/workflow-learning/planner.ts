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

const TaskStepSchema = z.object({
  id: z.string(),
  description: z.string(),
  type: z.enum(['browser_action', 'analysis', 'report']),
  // OpenAI structured outputs does not support `.optional()` fields unless marked `.nullable()`.
  // We require the field but allow it to be null, then normalize null -> undefined for our TS types.
  browserSubSteps: z.array(BrowserSubStepSchema).nullable(),
  onFailure: z.enum(['replan', 'skip', 'abort']),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'waiting_user']).default('pending'),
});

const TaskPlanSchema = z.object({
  goal: z.string(),
  steps: z.array(TaskStepSchema),
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

export async function generatePlan(options: GeneratePlanOptions): Promise<TaskPlan> {
  const model = buildPlannerModel();
  const structured = model.withStructuredOutput(TaskPlanSchema);

  let userPrompt = options.userMessage;
  if (options.browserStatus) {
    userPrompt += `\n\n[Current browser state: URL=${options.browserStatus.url}, Title="${options.browserStatus.title}"]`;
  }
  if (options.replanContext) {
    const { previousPlan, error, completedStepIds } = options.replanContext;
    userPrompt += `\n\n[REPLAN NEEDED]\nPrevious goal: ${previousPlan.goal}\nCompleted steps: ${completedStepIds.join(', ')}\nError: ${error}\nPlease create a revised plan for the remaining work.`;
  }

  const parsed = await structured.invoke([
    { role: 'system', content: PLANNER_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ]);

  const plan: TaskPlan = {
    ...parsed,
    steps: parsed.steps.map((step) => ({
      ...step,
      status: step.status ?? 'pending',
      browserSubSteps: step.browserSubSteps ?? undefined,
    })),
  };

  return plan;
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
