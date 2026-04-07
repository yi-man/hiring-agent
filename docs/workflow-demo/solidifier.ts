import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { WorkflowStep } from '../types.js';

// Zod schema for structured output
const WorkflowStepSchema = z.object({
  id: z.string().describe('步骤唯一 ID，格式如 step_1, step_2'),
  tool: z.string().describe('工具名称'),
  args: z.record(z.unknown()).describe('工具参数'),
  description: z.string().describe('步骤的中文说明，用于调试和日志'),
  canBatch: z
    .boolean()
    .describe(
      '是否可与下一步打包发送。navigate/click/wait 类为 true；screenshot/get_text 类为 false（需要结果才能继续）',
    ),
  successCondition: z
    .string()
    .optional()
    .describe('（可选）期望的结果特征，如"返回文本不为空"，用于软错误检测'),
});

const SolidifyOutputSchema = z.object({
  steps: z.array(WorkflowStepSchema),
});

export interface ExecutionRecord {
  tool: string;
  args: Record<string, unknown>;
  result: string;
}

export class Solidifier {
  private llm: ReturnType<typeof ChatOpenAI.prototype.withStructuredOutput>;

  constructor() {
    const model = new ChatOpenAI({
      model: 'gpt-4o',
      temperature: 0,
    });
    this.llm = model.withStructuredOutput(SolidifyOutputSchema);
  }

  async solidify(goal: string, history: ExecutionRecord[]): Promise<WorkflowStep[]> {
    const historyText = history
      .map(
        (h, i) =>
          `步骤 ${i + 1}:\n  工具: ${h.tool}\n  参数: ${JSON.stringify(h.args)}\n  结果: ${h.result.slice(0, 200)}`,
      )
      .join('\n\n');

    const prompt = `你是一个 Workflow 优化专家。用户已通过 AI Agent 成功完成了一个浏览器任务，现在需要将执行历史提炼为可复用的 Workflow。

任务目标: ${goal}

完整执行历史:
${historyText}

请提炼出最精简、稳定的步骤序列，遵守以下规则：
1. 去除纯探索性的多余步骤（如失败的尝试、重复的截图）
2. 保留关键的截图步骤作为"检查点"（至少在导航后保留一次）
3. navigate/click/wait 类步骤 canBatch 设为 true
4. screenshot/get_text 类步骤 canBatch 设为 false（需要回传结果）
5. 为每步写清晰的中文 description
6. 如果某步有明确的成功标准（如"文本不为空"），填写 successCondition`;

    const result = await this.llm.invoke(prompt);
    return result.steps as WorkflowStep[];
  }
}
