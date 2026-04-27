import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { StreamEvent } from '@langchain/core/tracers/log_stream';
import {
  WORKFLOW_AGENT_MAX_STEPS,
  WORKFLOW_TOOL_RESULT_MAX_CHARS,
} from '@/lib/workflow-learning/constants';
import { runBossWorkflowIntent } from '@/lib/workflow-learning/boss-workflow';
import { tryParseWorkflowDsl, type WorkflowDsl } from '@/lib/workflow-learning/dsl';
import { routeWorkflowIntent } from '@/lib/workflow-learning/intent-router';
import {
  createWorkflowBrowserTools,
  workflowBrowserSessionManager,
} from '@/lib/workflow-learning/tools/browser-tools';
import type { WorkflowSseEvent } from '@/lib/workflow-learning/types';
import { workflowSessionStore } from '@/lib/workflow-learning/workflow-session-store';

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

type WorkflowEventWithoutMetadata<T> = T extends unknown ? Omit<T, 'runId' | 'timestamp'> : never;
type WorkflowEventInput = WorkflowEventWithoutMetadata<WorkflowSseEvent>;

function withWorkflowEventMetadata(
  event: WorkflowEventInput,
  runId: string,
  timestamp: string,
): WorkflowSseEvent {
  return {
    ...event,
    runId,
    timestamp,
  } as WorkflowSseEvent;
}

class AsyncWorkflowEventQueue {
  private readonly events: WorkflowSseEvent[] = [];
  private readonly waiters: Array<(result: IteratorResult<WorkflowSseEvent>) => void> = [];
  private closed = false;

  push(event: WorkflowSseEvent): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value: event, done: false });
      return;
    }
    this.events.push(event);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  async *drain(): AsyncGenerator<WorkflowSseEvent> {
    while (true) {
      const next = await this.next();
      if (next.done) return;
      yield next.value;
    }
  }

  private next(): Promise<IteratorResult<WorkflowSseEvent>> {
    const event = this.events.shift();
    if (event) {
      return Promise.resolve({ value: event, done: false });
    }
    if (this.closed) {
      return Promise.resolve({ value: undefined, done: true });
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
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

function toolOutputText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (output && typeof output === 'object' && 'content' in output) {
    const content = (output as { content?: unknown }).content;
    return typeof content === 'string' ? content : JSON.stringify(content);
  }
  return output === undefined ? '' : JSON.stringify(output);
}

function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1]);
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(text.slice(start, end + 1));
  }

  return null;
}

function tryParseJsonObject(text: string): unknown {
  try {
    return parseJsonObject(text);
  } catch {
    return null;
  }
}

/** Exported for unit tests — extracts the first valid Workflow DSL JSON object from model text. */
export function extractWorkflowDslFromText(text: string): WorkflowDsl | null {
  try {
    const parsed = tryParseJsonObject(text);
    const result = tryParseWorkflowDsl(parsed);
    return result.ok ? result.workflow : null;
  } catch {
    return null;
  }
}

async function repairWorkflowDsl(
  model: ChatOpenAI,
  userText: string,
  assistantText: string,
  validationError: string,
): Promise<WorkflowDsl | null> {
  const response = await model.invoke([
    new HumanMessage(`The user requested this workflow:
${userText}

The previous assistant output did not validate as Workflow DSL:
${assistantText}

Validation error:
${validationError}

Return only a valid JSON object using schemaVersion "1.0", metadata.domain "recruiting", and steps built from check_login, login, browser_action, and assertion.`),
  ]);
  return extractWorkflowDslFromText(extractTextFromMessageContent(response));
}

async function generateWorkflowDslFromTrace(
  model: ChatOpenAI,
  userText: string,
  trace: readonly unknown[],
): Promise<WorkflowDsl | null> {
  const response = await model.invoke([
    new HumanMessage(`Generate Workflow DSL JSON for this completed workflow.

User request:
${userText}

Execution trace:
${JSON.stringify(trace, null, 2)}

Return only a valid JSON object using schemaVersion "1.0", metadata.domain "recruiting", and steps built from check_login, login, browser_action, and assertion.`),
  ]);
  return extractWorkflowDslFromText(extractTextFromMessageContent(response));
}

function parseToolJson(output: unknown): Record<string, unknown> | null {
  try {
    const text = toolOutputText(output);
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function inputObject(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

type OpenOnlyRequest = { label: string; url: string };

export function resolveOpenOnlyRequest(userText: string): OpenOnlyRequest | null {
  const text = userText.trim().toLowerCase();
  const isOpenIntent = /^(打开|open)\s*/i.test(userText.trim());
  const hasKnownBossTarget = /boss|zhipin|直聘/i.test(userText);
  const hasExtraTask = /消息|查看|读取|第一|列表|生成|workflow|工作流|dsl/i.test(userText);

  if (isOpenIntent && hasKnownBossTarget && !hasExtraTask) {
    return { label: 'Boss 直聘', url: 'https://www.zhipin.com/' };
  }

  const urlMatch = userText.match(/https?:\/\/\S+/i);
  if (isOpenIntent && urlMatch && !hasExtraTask) {
    return { label: urlMatch[0], url: urlMatch[0] };
  }

  return text === 'boss' ? { label: 'Boss 直聘', url: 'https://www.zhipin.com/' } : null;
}

export function shouldAttemptWorkflowDsl(userText: string): boolean {
  void userText;
  return false;
}

const WORKFLOW_SYSTEM_PROMPT = `You are Workflow Learning, a chat assistant that decides whether a user is casually chatting or asking you to learn a browser workflow.

If the user is only chatting, answer normally and do not call tools.

If the user asks you to do or learn a website workflow, you MUST use the browser tools:
- browser_snapshot: first open the requested page in a visible reusable browser session, then inspect requestedUrl, url, urlMatchesRequested, title, and excerpt.
- browser_open_login: open a visible local browser for QR-code/manual login only when you deliberately need to navigate to a known login URL.
- browser_verify_login: after the user logs in, verify login from URL/text before continuing.

For simple requests such as "打开 Boss" or "打开 boss", first call browser_snapshot on the public Boss site URL and check whether urlMatchesRequested is true. Do not assume login is required before opening the page.
If browser_snapshot shows urlMatchesRequested=false because the page redirected to a login page, stop this exploration, keep the current browser page open, and tell the user that this page requires login. Do NOT call browser_open_login after such a redirect; the login page is already open.

Do NOT generate Workflow DSL during the exploration/opening phase. Only generate DSL after the user explicitly confirms the observed browser effect is OK and asks to generate DSL. After DSL is generated, it must be validated and then used for a separate verification run.

When the user explicitly asks to generate DSL after confirming the effect, finish with a valid JSON Workflow DSL object, optionally in a json code fence. The JSON MUST use:
- schemaVersion: "1.0"
- metadata.domain: "recruiting"
- steps: include check_login and login before protected recruiting actions when login may be required.
- browser_action steps for navigation, extraction, clicks, and waits.

Do not invent completed observations if browser tools could verify them.`;

/**
 * Streams LangGraph ReAct execution as workflow SSE events (run_start … run_end).
 * `thought` events are not emitted here — LangGraph stream does not expose chain-of-thought reliably; see design spec §5.3.
 */
export async function* runWorkflowAgentWithEvents(options: {
  runId: string;
  userText: string;
  sessionId?: string;
}): AsyncGenerator<WorkflowSseEvent> {
  const { runId, userText, sessionId = runId } = options;
  const ts = () => new Date().toISOString();

  yield { type: 'run_start', runId, timestamp: ts() };

  const routedIntent = routeWorkflowIntent(userText);
  if (
    routedIntent.type === 'boss_open_home' ||
    routedIntent.type === 'boss_read_first_message' ||
    routedIntent.type === 'login_completed' ||
    routedIntent.type === 'generate_dsl'
  ) {
    const eventQueue = new AsyncWorkflowEventQueue();
    let emittedError = false;
    const workflowPromise = runBossWorkflowIntent({
      intent: routedIntent,
      runId,
      sessionId,
      manager: workflowBrowserSessionManager,
      store: workflowSessionStore,
      emit: (event) => {
        const fullEvent = withWorkflowEventMetadata(event, runId, ts());
        if (fullEvent.type === 'error') {
          emittedError = true;
        }
        eventQueue.push(fullEvent);
      },
      generateDsl: async (trace) => generateWorkflowDslFromTrace(buildModel(), userText, trace),
    })
      .catch((error) => {
        if (!emittedError) {
          const message = error instanceof Error ? error.message : 'Unknown workflow error';
          emittedError = true;
          eventQueue.push({ type: 'error', runId, timestamp: ts(), message });
        }
      })
      .finally(() => {
        eventQueue.close();
      });

    for await (const event of eventQueue.drain()) {
      yield event;
    }
    await workflowPromise;
    yield { type: 'run_end', runId, timestamp: ts() };
    return;
  }

  const openOnly = resolveOpenOnlyRequest(userText);
  if (openOnly) {
    const toolCallId = `${runId}:browser_snapshot`;
    const args = { sessionId, url: openOnly.url };
    yield {
      type: 'tool_call_start',
      runId,
      timestamp: ts(),
      toolCallId,
      toolName: 'browser_snapshot',
      argsPreview: previewJson(args),
    };

    const startedAt = Date.now();
    try {
      const result = await workflowBrowserSessionManager.snapshot(args);
      yield {
        type: 'tool_call_result',
        runId,
        timestamp: ts(),
        toolCallId,
        ok: true,
        resultPreview: resultPreviewFromToolOutput(JSON.stringify(result)),
        durationMs: Date.now() - startedAt,
      };
      const text = result.urlMatchesRequested
        ? `已打开${openOnly.label}：${result.url}。我会保持这个页面打开；请确认页面效果是否 OK，确认后我再生成 DSL。`
        : `已尝试打开${openOnly.label}，但最终停在 ${result.url}，与请求地址不一致。页面会保持在当前状态；如果这是登录页，说明该页面需要登录。请确认下一步，不会自动生成 DSL。`;
      yield { type: 'assistant_final', runId, timestamp: ts(), text };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown browser error';
      yield {
        type: 'tool_call_result',
        runId,
        timestamp: ts(),
        toolCallId,
        ok: false,
        resultPreview: message,
        durationMs: Date.now() - startedAt,
      };
      yield { type: 'error', runId, timestamp: ts(), message };
    } finally {
      yield { type: 'run_end', runId, timestamp: ts() };
    }
    return;
  }

  const model = buildModel();
  const tools = createWorkflowBrowserTools(undefined, sessionId);
  const agent = createReactAgent({
    llm: model,
    tools,
    prompt: WORKFLOW_SYSTEM_PROMPT,
  });

  const toolStartMs = new Map<string, number>();
  let lastAssistantText = '';

  try {
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
        yield {
          type: 'tool_call_start',
          runId,
          timestamp: ts(),
          toolCallId: ev.run_id,
          toolName: ev.name,
          argsPreview: previewJson(ev.data?.input),
        };
        if (ev.name === 'browser_open_login') {
          const input = inputObject(ev.data?.input);
          const loginUrl = typeof input.loginUrl === 'string' ? input.loginUrl : '';
          const eventSessionId = typeof input.sessionId === 'string' ? input.sessionId : sessionId;
          if (loginUrl) {
            yield {
              type: 'awaiting_login',
              runId,
              timestamp: ts(),
              sessionId: eventSessionId,
              loginUrl,
              message: '请在已打开的浏览器窗口中完成登录，完成后我会继续检测登录状态。',
            };
          }
        }
      } else if (ev.event === 'on_tool_end') {
        const start = toolStartMs.get(ev.run_id);
        const durationMs = start !== undefined ? Date.now() - start : undefined;
        const err = ev.data?.error;
        yield {
          type: 'tool_call_result',
          runId,
          timestamp: ts(),
          toolCallId: ev.run_id,
          ok: !err,
          resultPreview: err ? String(err) : resultPreviewFromToolOutput(ev.data?.output),
          durationMs,
        };
        if (!err && ev.name === 'browser_verify_login') {
          const result = parseToolJson(ev.data?.output);
          if (result?.loggedIn === true) {
            yield {
              type: 'login_verified',
              runId,
              timestamp: ts(),
              sessionId: typeof result.sessionId === 'string' ? result.sessionId : sessionId,
            };
          }
        }
      } else if (ev.event === 'on_chat_model_end') {
        const text = extractTextFromMessageContent(ev.data?.output);
        if (text.trim()) {
          lastAssistantText = text;
        }
      }
    }

    if (shouldAttemptWorkflowDsl(userText)) {
      const workflow = extractWorkflowDslFromText(lastAssistantText);
      if (workflow) {
        yield {
          type: 'dsl_validation_result',
          runId,
          timestamp: ts(),
          ok: true,
        };
        yield {
          type: 'workflow_dsl',
          runId,
          timestamp: ts(),
          workflow,
        };
      } else if (lastAssistantText.trim()) {
        const validation = tryParseWorkflowDsl(tryParseJsonObject(lastAssistantText));
        if (!validation.ok) {
          const repaired = await repairWorkflowDsl(
            model,
            userText,
            lastAssistantText,
            validation.error,
          );
          if (repaired) {
            yield {
              type: 'dsl_validation_result',
              runId,
              timestamp: ts(),
              ok: true,
            };
            yield {
              type: 'workflow_dsl',
              runId,
              timestamp: ts(),
              workflow: repaired,
            };
          } else {
            yield {
              type: 'dsl_validation_result',
              runId,
              timestamp: ts(),
              ok: false,
              error: validation.error,
            };
          }
        }
      }
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
