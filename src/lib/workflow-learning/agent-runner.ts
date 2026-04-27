import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { StreamEvent } from '@langchain/core/tracers/log_stream';
import {
  WORKFLOW_AGENT_MAX_STEPS,
  WORKFLOW_TOOL_RESULT_MAX_CHARS,
} from '@/lib/workflow-learning/constants';
import { tryParseWorkflowDsl, type WorkflowDsl } from '@/lib/workflow-learning/dsl';
import { createWorkflowBrowserTools } from '@/lib/workflow-learning/tools/browser-tools';
import type { WorkflowSseEvent } from '@/lib/workflow-learning/types';

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

const WORKFLOW_SYSTEM_PROMPT = `You are Workflow Learning, a chat assistant that decides whether a user is casually chatting or asking you to learn a browser workflow.

If the user is only chatting, answer normally and do not call tools.

If the user asks you to do or learn a website workflow, you MUST use the browser tools:
- browser_snapshot: inspect pages in a reusable browser session.
- browser_open_login: open a visible local browser for QR-code/manual login when a page redirects to login or visible text indicates login is required.
- browser_verify_login: after the user logs in, verify login from URL/text before continuing.

For workflow tasks, finish with a valid JSON Workflow DSL object, optionally in a json code fence. The JSON MUST use:
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
      if (!validation.ok && /workflow|流程|打开|登录|boss|直聘|消息/i.test(userText)) {
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
