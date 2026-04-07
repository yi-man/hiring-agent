import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import type { WorkflowSseEvent } from '@/lib/workflow-learning/types';
import type { WorkflowStep } from '@/lib/workflow-learning/workflow-types';

const workflowStepSchema = z.object({
  id: z.string().min(1),
  tool: z.string().min(1),
  args: z.record(z.unknown()),
  description: z.string().min(1),
  canBatch: z.boolean(),
  successCondition: z.string().nullable().optional(),
});

const outputSchema = z.object({
  steps: z.array(workflowStepSchema).min(1),
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function buildSolidifyPrompt(goal: string, eventLines: string[]): string {
  return `你是 Workflow 固化器。请把探索事件提炼为可执行、可复用的 Workflow JSON 步骤。

任务目标：
${goal}

探索事件：
${eventLines.join('\n')}

要求：
1. 去掉失败尝试和重复步骤，只保留成功主路径；
2. 每步都要有 id/tool/args/description/canBatch；
3. 当前执行器仅支持 browser_snapshot，请只输出 browser_snapshot 步骤；
4. browser_snapshot 必须设 canBatch=false；
5. 如有明确成功判定，可填 successCondition。`;
}

export function extractEventLines(events: WorkflowSseEvent[]): string[] {
  const lines: string[] = [];
  for (const ev of events) {
    if (ev.type === 'tool_call_start') {
      lines.push(`[start] ${ev.toolName} args=${ev.argsPreview}`);
    } else if (ev.type === 'tool_call_result') {
      lines.push(`[result] ok=${ev.ok} output=${ev.resultPreview}`);
    } else if (ev.type === 'assistant_final') {
      lines.push(`[assistant_final] ${ev.text}`);
    }
  }
  return lines;
}

function extractJsonBlock(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('Model did not return JSON object for workflow steps');
  }
  return text.slice(start, end + 1);
}

function parseStepsFromText(text: string): WorkflowStep[] {
  const jsonBlock = extractJsonBlock(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBlock);
  } catch {
    throw new Error('Failed to parse workflow JSON from model output');
  }
  const validated = outputSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error('Model output does not match workflow schema');
  }
  return validated.data.steps as WorkflowStep[];
}

export async function solidifyWorkflowFromEvents(
  goal: string,
  events: WorkflowSseEvent[],
): Promise<WorkflowStep[]> {
  const model = new ChatOpenAI({
    apiKey: requireEnv('OPENAI_API_KEY'),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0,
    configuration: { baseURL: process.env.OPENAI_BASE_URL },
  });
  const lines = extractEventLines(events);
  const prompt = buildSolidifyPrompt(goal, lines);
  try {
    const chain = model.withStructuredOutput(outputSchema);
    const output = await chain.invoke(prompt);
    return output.steps as WorkflowStep[];
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unsupportedStructuredOutput =
      message.includes('json_schema') || message.includes('response_format.type');
    if (!unsupportedStructuredOutput) throw error;

    const fallbackPrompt = `${prompt}

请仅输出 JSON 对象，格式必须是：
{"steps":[{"id":"step_1","tool":"browser_snapshot","args":{"url":"https://example.com"},"description":"说明","canBatch":false,"successCondition":null}]}
不要输出 markdown 代码块。`;
    const raw = await model.invoke(fallbackPrompt);
    const text =
      typeof raw.content === 'string'
        ? raw.content
        : Array.isArray(raw.content)
          ? raw.content
              .map((item) =>
                typeof item === 'string'
                  ? item
                  : item && typeof item === 'object' && 'text' in item
                    ? String((item as { text?: unknown }).text ?? '')
                    : '',
              )
              .join('')
          : '';
    return parseStepsFromText(text);
  }
}

export const _workflowSolidifierTestOnly = {
  parseStepsFromText,
  extractJsonBlock,
};
