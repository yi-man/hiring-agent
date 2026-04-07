import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MemorySaver } from '@langchain/langgraph';
import { tool } from '@langchain/core/tools';
import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { CompletedStep, WorkflowStep, BridgeMessage } from '../types.js';

type SendFn = (msg: BridgeMessage) => Promise<BridgeMessage>;

// ── 工具工厂（共享给探索和恢复 Agent）────────────────────────────

function makeBrowserTools(sendToPlugin: SendFn) {
  const send = async (tool: string, args: Record<string, unknown>) => {
    const res = await sendToPlugin({
      type: 'exec_single',
      requestId: `req_${Date.now()}`,
      step: { id: `tmp_${Date.now()}`, tool, args, description: '', canBatch: false },
    });
    return res.result?.data ?? res.result?.error ?? '无结果';
  };

  const browserNavigate = tool(
    async ({ url }: { url: string }) => send('browser_navigate', { url }),
    {
      name: 'browser_navigate',
      description: '导航到指定 URL',
      schema: z.object({ url: z.string() }),
    },
  );

  const browserScreenshot = tool(async () => send('browser_screenshot', {}), {
    name: 'browser_screenshot',
    description: '截取当前页面截图，判断页面状态',
    schema: z.object({}),
  });

  const browserGetText = tool(
    async ({ selector, waitFor }: { selector: string; waitFor?: boolean }) =>
      send('browser_get_text', { selector, waitFor }),
    {
      name: 'browser_get_text',
      description: '提取页面元素文本',
      schema: z.object({
        selector: z.string(),
        waitFor: z.boolean().optional().default(false),
      }),
    },
  );

  const browserClick = tool(
    async ({ selector, text }: { selector?: string; text?: string }) =>
      send('browser_click', { selector, text }),
    {
      name: 'browser_click',
      description: '点击页面元素',
      schema: z.object({
        selector: z.string().optional(),
        text: z.string().optional(),
      }),
    },
  );

  const browserGetUrl = tool(async () => send('browser_get_url', {}), {
    name: 'browser_get_url',
    description: '获取当前页面 URL 和标题',
    schema: z.object({}),
  });

  const waitForHuman = tool(
    async ({ reason }: { reason: string }) => {
      console.log(`\n🙋 需要人工介入: ${reason}`);
      console.log('   请在浏览器中操作，完成后按回车继续...');
      await new Promise<void>((resolve) => {
        process.stdin.once('data', () => resolve());
      });
      return '用户已完成操作，请截图确认当前页面状态，然后继续执行。';
    },
    {
      name: 'wait_for_human',
      description: '遇到验证码、登录等需要人工操作时调用',
      schema: z.object({ reason: z.string() }),
    },
  );

  return [
    browserNavigate,
    browserScreenshot,
    browserGetText,
    browserClick,
    browserGetUrl,
    waitForHuman,
  ];
}

// ── 探索 Agent ───────────────────────────────────────────────────

const EXPLORER_SYSTEM = `你是一个浏览器操作 Agent，帮助用户通过操作网页完成任务。

工作原则：
1. 导航到新页面后，先截图查看页面状态，再决定下一步
2. 不确定元素位置时截图分析
3. 遇到登录/验证码调用 wait_for_human
4. 完成任务后，汇报结果并简要说明执行了哪些步骤`;

export async function runExplorer(
  goal: string,
  sendToPlugin: SendFn,
  threadId: string,
): Promise<{
  success: boolean;
  history: Array<{ tool: string; args: Record<string, unknown>; result: string }>;
}> {
  const llm = new ChatOpenAI({ model: 'gpt-4o', temperature: 0 });
  const tools = makeBrowserTools(sendToPlugin);
  const checkpointer = new MemorySaver();

  const agent = createReactAgent({
    llm,
    tools,
    checkpointSaver: checkpointer,
    messageModifier: EXPLORER_SYSTEM,
  });

  // 收集执行历史（从 LangGraph messages 中提取）
  const history: Array<{ tool: string; args: Record<string, unknown>; result: string }> = [];

  const stream = await agent.stream(
    { messages: [new HumanMessage(goal)] },
    { configurable: { thread_id: threadId }, streamMode: 'updates' },
  );

  for await (const chunk of stream) {
    // 收集工具调用记录
    if (chunk.agent?.messages) {
      for (const msg of chunk.agent.messages) {
        if (msg.tool_calls?.length > 0) {
          for (const tc of msg.tool_calls) {
            console.log(`  🔧 ${tc.name}`, JSON.stringify(tc.args).slice(0, 80));
          }
        }
      }
    }
    if (chunk.tools?.messages) {
      for (const msg of chunk.tools.messages) {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        // 找到对应的 tool_call 记录
        const preview = content.slice(0, 100);
        console.log(`  ✅ ${preview}`);
        // 从消息中提取工具名（tool message 有 name 字段）
        if (msg.name) {
          history.push({ tool: msg.name, args: {}, result: content });
        }
      }
    }
  }

  return { success: true, history };
}

// ── 恢复 Agent ───────────────────────────────────────────────────

export async function runRecovery(
  goal: string,
  failedStep: WorkflowStep,
  failedError: string,
  completedSteps: CompletedStep[],
  sendToPlugin: SendFn,
): Promise<{
  success: boolean;
  newHistory: Array<{ tool: string; args: Record<string, unknown>; result: string }>;
}> {
  const llm = new ChatOpenAI({ model: 'gpt-4o', temperature: 0 });
  const tools = makeBrowserTools(sendToPlugin);
  const checkpointer = new MemorySaver();

  // 构建恢复上下文
  const completedSummary = completedSteps
    .map((cs, i) => `  ${i + 1}. ${cs.step.description}（${cs.step.tool}）→ 成功`)
    .join('\n');

  const recoverySystem = `你是一个浏览器操作恢复 Agent。Workflow 执行中途失败，你需要从失败点恢复，完成原始任务目标。

原始任务目标: ${goal}

已成功完成的步骤:
${completedSummary || '（无）'}

失败步骤:
  工具: ${failedStep.tool}
  描述: ${failedStep.description}
  参数: ${JSON.stringify(failedStep.args)}
  错误: ${failedError}

恢复原则：
1. 先截图查看当前页面状态，了解实际情况
2. 分析失败原因（selector 变了？页面结构变了？）
3. 找到替代方案，继续完成任务
4. 完成后汇报结果`;

  const agent = createReactAgent({
    llm,
    tools,
    checkpointSaver: checkpointer,
    messageModifier: recoverySystem,
  });

  const newHistory: Array<{ tool: string; args: Record<string, unknown>; result: string }> = [];

  console.log('\n🔄 LLM 接管恢复中...');

  const stream = await agent.stream(
    { messages: [new HumanMessage(`请从失败步骤恢复，完成任务：${goal}`)] },
    { configurable: { thread_id: `recovery_${Date.now()}` }, streamMode: 'updates' },
  );

  for await (const chunk of stream) {
    if (chunk.agent?.messages) {
      for (const msg of chunk.agent.messages) {
        if (msg.tool_calls?.length > 0) {
          for (const tc of msg.tool_calls) {
            console.log(`  🔧 [恢复] ${tc.name}`, JSON.stringify(tc.args).slice(0, 80));
          }
        }
        if (typeof msg.content === 'string' && msg.content) {
          console.log(`\n  Agent: ${msg.content}`);
        }
      }
    }
    if (chunk.tools?.messages) {
      for (const msg of chunk.tools.messages) {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        if (msg.name) newHistory.push({ tool: msg.name, args: {}, result: content });
      }
    }
  }

  return { success: true, newHistory };
}
