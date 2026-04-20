import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { StreamEvent } from '@langchain/core/tracers/log_stream';
import {
  WORKFLOW_AGENT_MAX_STEPS,
  WORKFLOW_TOOL_RESULT_MAX_CHARS,
} from '@/lib/workflow-learning/constants';
import {
  createBrowserInspectSessionTool,
  createBrowserObserveCurrentTool,
  createBrowserProbeAuthTool,
  createBrowserSnapshotTool,
} from '@/lib/workflow-learning/tools/browser-snapshot-tool';
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

const WORKFLOW_SYSTEM_PROMPT = `You are a workflow learning assistant using ReAct.
You have browser tools:
- browser_inspect_session(targetUrl, loginUrl): inspect current browser session facts for a site without navigating.
- browser_probe_auth(targetUrl, loginUrl): navigate to the protected target page once and return factual auth results.
- browser_snapshot(url): navigate to a full http(s) URL and report facts.
- browser_observe_current(): inspect the currently open page without navigating.

In allowlisted mode, any URL you navigate to must target localhost/127.0.0.1 or the app origin.

Decision rules (LLM decides, tools only execute and report facts):
1) Read tool output as facts only: requestedUrl, currentUrl, title, excerpt, documentResponse, signals, navigationAttempted, redirected, navigationError.
2) Before opening an external website, first call browser_inspect_session with the task's targetUrl and loginUrl.
3) If browser_inspect_session already says pageKind=login, do not navigate away. Ask the user to complete login first.
4) If browser_inspect_session already says pageKind=target, continue the task on the target page without visiting the login page.
5) If login state is unknown, call browser_probe_auth exactly once. Use requiresLogin, accessGranted, currentUrl, pageKind, documentResponse.status, and documentResponse.redirectChain before relying on page text.
6) If browser_probe_auth says requiresLogin=true, stop and ask the user to log in. Do not alternate between login URL and target URL in the same turn.
7) After the user may have logged in, first call browser_inspect_session again. If it now says pageKind=target, continue the task. If it still says pageKind=login, ask the user to finish login.
8) Never call browser_probe_auth or browser_snapshot repeatedly on the same target URL in one turn unless the user explicitly asks you to retry.
9) For BOSS Zhipin tasks, treat https://www.zhipin.com/web/geek/chat as the target page and https://www.zhipin.com/web/user/ as the login page.
10) Always summarize the observed browser facts before the final answer.
`;

/**
 * Streams LangGraph ReAct execution as workflow SSE events (run_start … run_end).
 * `thought` events are not emitted here — LangGraph stream does not expose chain-of-thought reliably; see design spec §5.3.
 */
export async function* runWorkflowAgentWithEvents(options: {
  runId: string;
  userText: string;
}): AsyncGenerator<WorkflowSseEvent> {
  const { runId, userText } = options;
  const ts = () => new Date().toISOString();

  yield { type: 'run_start', runId, timestamp: ts() };

  const model = buildModel();
  const turnGuard: { blockedOrigin?: string; reason?: string } = {};
  const tools = [
    createBrowserInspectSessionTool(),
    createBrowserProbeAuthTool({ guard: turnGuard }),
    createBrowserSnapshotTool({ guard: turnGuard }),
    createBrowserObserveCurrentTool(),
  ];
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
      } else if (ev.event === 'on_chat_model_end') {
        const text = extractTextFromMessageContent(ev.data?.output);
        if (text.trim()) {
          lastAssistantText = text;
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
