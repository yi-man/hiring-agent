import { HumanMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { StreamEvent } from '@langchain/core/tracers/log_stream';
import {
  WORKFLOW_AGENT_MAX_STEPS,
  WORKFLOW_TOOL_RESULT_MAX_CHARS,
} from '@/lib/workflow-learning/constants';
import { createBrowserSnapshotTool } from '@/lib/workflow-learning/tools/browser-snapshot-tool';
import type { WorkflowSseEvent } from '@/lib/workflow-learning/types';
import { createLangChainChatModel } from '@/lib/llm/langchain';
import {
  WORKFLOW_LEARNING_SYSTEM_PROMPT,
  workflowLearningAgentPromptDefinition,
} from '@/lib/workflow-learning/prompts';

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

  const model = createLangChainChatModel({
    temperature: workflowLearningAgentPromptDefinition.options.temperature,
  });
  const tools = [createBrowserSnapshotTool()];
  const agent = createReactAgent({
    llm: model,
    tools,
    prompt: WORKFLOW_LEARNING_SYSTEM_PROMPT,
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
