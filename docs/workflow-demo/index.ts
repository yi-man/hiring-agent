import * as readline from 'readline';
import { WorkflowManager } from './workflow/manager.js';
import { Solidifier } from './workflow/solidifier.js';
import { WorkflowRunner } from './workflow/runner.js';
import { runExplorer, runRecovery } from './agent/agents.js';
import { BridgeMessage, WorkflowStep, CompletedStep } from './types.js';

// ── Mock：本地调试用，生产替换为 WebSocket 插件通信 ─────────────
// 生产环境中 sendToPlugin 会通过 WebSocket 发消息给 Chrome 插件
async function mockSendToPlugin(msg: BridgeMessage): Promise<BridgeMessage> {
  console.log(`    [Mock插件] 收到: ${msg.type}`);
  const fakeResult = { stepId: 'mock', success: true, data: 'mock result' };
  return {
    type: 'result',
    requestId: msg.requestId,
    result: fakeResult,
    results: msg.steps?.map((s) => ({ stepId: s.id, success: true, data: 'ok' })),
  };
}

// ── 主程序 ───────────────────────────────────────────────────────

const manager = new WorkflowManager();
const solidifier = new Solidifier();
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

async function handleExplore(goal: string) {
  console.log('\n🔍 进入探索模式（LLM 自主执行）...\n');
  const threadId = `explore_${Date.now()}`;

  const { history } = await runExplorer(goal, mockSendToPlugin, threadId);

  // 询问是否固化
  const save = await ask('\n✅ 任务完成！是否将步骤固化为 Workflow？(y/n) ');
  if (save.trim().toLowerCase() !== 'y') return;

  const name = await ask('给这个 Workflow 起个名字: ');
  console.log('\n⚙️  正在提炼步骤...');
  const steps = await solidifier.solidify(goal, history);
  manager.create(name.trim(), goal, steps);
  console.log(`\n🎉 Workflow "${name.trim()}" 创建完成（${steps.length} 步）`);
}

async function handleRun(nameOrId: string) {
  const workflow = manager.load(nameOrId);
  if (!workflow) {
    console.log(`❌ 未找到 Workflow: ${nameOrId}`);
    return;
  }

  const runner = new WorkflowRunner(mockSendToPlugin);

  // 监听失败事件 → 触发自愈
  runner.on(
    'failed',
    async (failedStep: WorkflowStep, error: string, completedSteps: CompletedStep[]) => {
      console.log(`\n❌ 步骤 "${failedStep.description}" 执行失败: ${error}`);
      console.log('🔄 切换到 LLM 恢复模式...\n');

      const { success, newHistory } = await runRecovery(
        workflow.goal,
        failedStep,
        error,
        completedSteps,
        mockSendToPlugin,
      );

      if (!success) {
        console.log('❌ 自愈失败，请手动检查');
        return;
      }

      // 询问是否更新 Workflow
      const update = await ask('\n✅ 恢复成功！是否用新路径更新 Workflow？(y/n) ');
      if (update.trim().toLowerCase() !== 'y') return;

      console.log('\n⚙️  正在提炼新步骤...');

      // 合并：已完成步骤 + 新的恢复步骤
      const fullHistory = [
        ...completedSteps.map((cs) => ({
          tool: cs.step.tool,
          args: cs.step.args as Record<string, unknown>,
          result: cs.result.data ?? '',
        })),
        ...newHistory,
      ];

      const newSteps = await solidifier.solidify(workflow.goal, fullHistory);
      manager.updateSteps(workflow.id, newSteps, `步骤 "${failedStep.description}" 失败后自愈更新`);
    },
  );

  await runner.run(workflow);
}

function handleList() {
  const workflows = manager.list();
  if (workflows.length === 0) {
    console.log('暂无已保存的 Workflow。');
    return;
  }
  console.log('\n📋 已保存的 Workflow:');
  for (const w of workflows) {
    console.log(`  • ${w.name} (v${w.version}, ${w.steps.length} 步) — ${w.goal}`);
  }
}

// ── 命令解析 ────────────────────────────────────────────────────

async function dispatch(input: string) {
  const trimmed = input.trim();

  // 执行 workflow
  const runMatch = trimmed.match(/^执行[「""](.+)[」""]$/);
  if (runMatch) {
    await handleRun(runMatch[1]);
    return;
  }

  // 列出 workflow
  if (trimmed === '列出workflow' || trimmed === '列出 workflow') {
    handleList();
    return;
  }

  // 其他输入 → 探索模式
  await handleExplore(trimmed);
}

// ── 入口 ─────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Workflow Agent 已启动');
  console.log('  输入任务描述 → 进入探索模式');
  console.log('  输入「执行"workflow名"」 → 直接执行（零 token）');
  console.log('  输入「列出 workflow」 → 查看已保存的 Workflow');
  console.log('  输入 exit → 退出\n');

  const loop = async () => {
    const input = await ask('你: ');
    if (input.trim() === 'exit') {
      rl.close();
      return;
    }
    await dispatch(input);
    loop();
  };

  loop();
}

main().catch(console.error);
