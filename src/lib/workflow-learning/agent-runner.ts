import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { StreamEvent } from '@langchain/core/tracers/log_stream';
import {
  WORKFLOW_AGENT_MAX_STEPS,
  WORKFLOW_TOOL_RESULT_MAX_CHARS,
} from '@/lib/workflow-learning/constants';
import { getBrowserSessionManager } from '@/lib/workflow-learning/browser-session-manager';
import { createBrowserClickTool } from '@/lib/workflow-learning/tools/browser-click-tool';
import { createBrowserCloseTool } from '@/lib/workflow-learning/tools/browser-close-tool';
import { createBrowserNavigateTool } from '@/lib/workflow-learning/tools/browser-navigate-tool';
import { createBrowserSnapshotTool } from '@/lib/workflow-learning/tools/browser-snapshot-tool';
import { createBrowserTypeTool } from '@/lib/workflow-learning/tools/browser-type-tool';
import { createBrowserWaitForUserTool } from '@/lib/workflow-learning/tools/browser-wait-for-user-tool';
import {
  generatePlan,
  savePlanMarkdown,
  updatePlanStepMarkdown,
} from '@/lib/workflow-learning/planner';
import type { ToolContext } from '@/lib/workflow-learning/tools/tool-context';
import type { TaskPlan, StepStatus, WorkflowSseEvent } from '@/lib/workflow-learning/types';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildModel(): ChatOpenAI {
  const DEFAULT_MODEL = 'gpt-4o-mini';
  return new ChatOpenAI({
    apiKey: requireEnv('OPENAI_API_KEY'),
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
    },
    temperature: 0.2,
  });
}

/** Exported for unit tests — extracts assistant-visible text from LangChain message objects. */
export function extractTextFromMessageContent(msg: unknown): string {
  if (!msg || typeof msg !== 'object') return '';
  const m = msg as { content?: unknown };
  const c = m.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map((block) => {
        if (typeof block === 'string') return block;
        if (block && typeof block === 'object' && block !== null && 'text' in block) {
          return String((block as { text: unknown }).text);
        }
        return '';
      })
      .join('');
  }
  return '';
}

function previewJson(value: unknown, max = 500): string {
  try {
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return String(value);
  }
}

function resultPreviewFromToolOutput(output: unknown): string {
  if (output === undefined || output === null) return '';
  let text: string;
  if (typeof output === 'string') {
    text = output;
  } else {
    text = JSON.stringify(output);
  }
  return text.length > WORKFLOW_TOOL_RESULT_MAX_CHARS
    ? `${text.slice(0, WORKFLOW_TOOL_RESULT_MAX_CHARS)}…`
    : text;
}

function buildExecutorSystemPrompt(plan: TaskPlan): string {
  const stepsText = plan.steps
    .map(
      (s, i) => `${i + 1}. [${s.id}] ${s.description} (type: ${s.type}, onFailure: ${s.onFailure})`,
    )
    .join('\n');

  return `You are executing a workflow plan. Follow the steps in order.

PLAN:
Goal: ${plan.goal}
Fallback: ${plan.fallbackStrategy}

Steps:
${stepsText}

RULES:
- Use browser_navigate to open URLs. Use browser_snapshot to read the current page content.
- When you detect a login/auth page (page content has login forms, "sign in", "登录", etc.), call browser_wait_for_user with a clear reason explaining what the user needs to do.
- Do NOT try to fill in passwords or bypass authentication yourself.
- Use browser_click and browser_type for interacting with page elements.
- Only call browser_close when the plan is fully complete or explicitly requires closing the browser.
- After completing each plan step, summarize what you accomplished.
- If a step fails and its onFailure is "replan", describe what went wrong clearly.`;
}

/**
 * Streams the Planner → Executor pipeline as workflow SSE events.
 *
 * Phase 1 — Planner: generates a structured TaskPlan via LLM.
 * Phase 2 — Executor: runs a ReAct agent with plan-aware system prompt and all 6 browser tools.
 *
 * TODO(phase-2): Implement replan — when a step fails with onFailure='replan',
 * re-invoke generatePlan with replanContext and continue execution. Functions
 * appendReplanMarkdown and plan_update SSE are already wired for this.
 */
export async function* runWorkflowAgentWithEvents(options: {
  runId: string;
  userText: string;
  userId: string;
}): AsyncGenerator<WorkflowSseEvent> {
  const { runId, userText, userId } = options;
  const ts = () => new Date().toISOString();

  yield { type: 'run_start', runId, timestamp: ts() };

  const pendingEvents: WorkflowSseEvent[] = [];
  const emitEvent = (event: WorkflowSseEvent) => {
    pendingEvents.push(event);
  };

  const model = buildModel();
  const sessionManager = getBrowserSessionManager();
  const toolCtx: ToolContext = {
    sessionManager,
    userId,
    emitEvent,
    runId,
  };

  try {
    // ── Phase 1: Planner ──
    const browserStatus = sessionManager.getStatus(userId);
    const plan = await generatePlan({ userMessage: userText, browserStatus, runId });

    yield { type: 'plan', plan, runId, timestamp: ts() };

    savePlanMarkdown(plan, runId).catch((e) => {
      console.error(`[workflow-learning] Failed to save plan markdown for ${runId}:`, e);
    });

    // ── Phase 2: Executor ──
    const tools = [
      createBrowserNavigateTool(toolCtx),
      createBrowserSnapshotTool(toolCtx),
      createBrowserClickTool(toolCtx),
      createBrowserTypeTool(toolCtx),
      createBrowserCloseTool(toolCtx),
      createBrowserWaitForUserTool(toolCtx),
    ];

    const agent = createReactAgent({
      llm: model,
      tools,
      prompt: buildExecutorSystemPrompt(plan),
    });

    const toolStartMs = new Map<string, number>();
    let lastAssistantText = '';

    const browserSteps = plan.steps.filter((s) => s.type === 'browser_action');
    let currentStepIdx = 0;
    let stepMarkedRunning = false;

    const emitStepUpdate = (stepId: string, status: StepStatus, summary?: string) => {
      emitEvent({
        type: 'plan_step_update',
        runId,
        timestamp: ts(),
        stepId,
        status,
        summary,
      });
      updatePlanStepMarkdown(runId, stepId, status, summary).catch(() => {});
    };

    const stream = agent.streamEvents(
      { messages: [new HumanMessage(userText.trim())] },
      {
        version: 'v2',
        recursionLimit: WORKFLOW_AGENT_MAX_STEPS,
      },
    );

    for await (const ev of stream as AsyncIterable<StreamEvent>) {
      if (ev.event === 'on_tool_start') {
        toolStartMs.set(ev.run_id, Date.now());

        if (!stepMarkedRunning && currentStepIdx < browserSteps.length) {
          emitStepUpdate(browserSteps[currentStepIdx].id, 'running');
          stepMarkedRunning = true;
        }

        yield {
          type: 'tool_call_start',
          runId,
          timestamp: ts(),
          toolCallId: ev.run_id,
          toolName: ev.name,
          argsPreview: previewJson(ev.data?.input),
        };
      } else if (ev.event === 'on_tool_end') {
        const start = toolStartMs.get(ev.run_id);
        const durationMs = start !== undefined ? Date.now() - start : undefined;
        const err = ev.data?.error;

        if (err && stepMarkedRunning && currentStepIdx < browserSteps.length) {
          const step = browserSteps[currentStepIdx];
          emitStepUpdate(step.id, 'failed', String(err));
          stepMarkedRunning = false;
          currentStepIdx++;
        }

        yield {
          type: 'tool_call_result',
          runId,
          timestamp: ts(),
          toolCallId: ev.run_id,
          ok: !err,
          resultPreview: err ? String(err) : resultPreviewFromToolOutput(ev.data?.output),
          durationMs,
        };
      } else if (ev.event === 'on_chat_model_end') {
        const text = extractTextFromMessageContent(ev.data?.output);
        if (text.trim()) {
          lastAssistantText = text;
          if (stepMarkedRunning && currentStepIdx < browserSteps.length) {
            emitStepUpdate(browserSteps[currentStepIdx].id, 'completed', text.trim().slice(0, 200));
            stepMarkedRunning = false;
            currentStepIdx++;
          }
        }
      }

      while (pendingEvents.length > 0) {
        yield pendingEvents.shift()!;
      }
    }

    for (const step of plan.steps) {
      if (step.type !== 'browser_action') {
        emitStepUpdate(step.id, 'completed');
      }
    }

    while (pendingEvents.length > 0) {
      yield pendingEvents.shift()!;
    }

    yield {
      type: 'assistant_final',
      runId,
      timestamp: ts(),
      text: lastAssistantText.trim() || '（模型未返回可见文本）',
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    yield { type: 'error', runId, timestamp: ts(), message };
  } finally {
    yield { type: 'run_end', runId, timestamp: ts() };
  }
}
