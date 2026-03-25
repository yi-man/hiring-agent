import type { JDAgentAction, JDAgentStageTiming } from '@/types';

export function buildTimingSuggestions(
  stages: JDAgentStageTiming[],
  totalMs: number,
  ctx: { didImprovePath: boolean; action: JDAgentAction },
): string[] {
  const suggestions: string[] = [];
  const byId = Object.fromEntries(stages.map((s) => [s.id, s.ms])) as Record<string, number>;
  const llmStages = stages.filter((s) => s.id !== 'parse' && s.id !== 'instruction');

  if (totalMs >= 120_000) {
    suggestions.push(
      `总耗时 ${formatSec(totalMs)}，已偏长；可尝试更快模型、或检查上游网关/网络延迟（参见 JD_LLM_TIMEOUT_MS）。`,
    );
  }

  if (totalMs > 0 && llmStages.length > 0) {
    const bottleneck = llmStages.reduce((a, b) => (a.ms >= b.ms ? a : b));
    const ratio = bottleneck.ms / totalMs;
    if (ratio >= 0.4 && bottleneck.ms >= 15_000) {
      suggestions.push(
        `主要耗时在「${bottleneck.label}」（约 ${pct(ratio)}，${formatMs(bottleneck.ms)}）；优先优化该阶段 prompt 长度或换低延迟模型。`,
      );
    }
  }

  const evalMs = (byId.evaluate ?? 0) + (byId.reevaluate ?? 0);
  const genMs = byId.generate ?? 0;
  if (ctx.action === 'initial_generate' && genMs > 0 && evalMs > genMs * 1.5) {
    suggestions.push(
      '评估阶段总耗时高于生成阶段；若更关注速度，可后续考虑「仅生成、延后评估」或简化评估 prompt。',
    );
  }

  if (ctx.didImprovePath) {
    const improveBlock = (byId.improve ?? 0) + (byId.reevaluate ?? 0);
    if (improveBlock > totalMs * 0.3 && totalMs > 0) {
      suggestions.push(
        `已进入改写链路（改写 + 再评估约 ${formatMs(improveBlock)}）。若希望缩短耗时，可调高评估分数阈值或放宽 rewrite_required，减少进入改写。`,
      );
    }
  }

  const llmCallCount = llmStages.length;
  if (llmCallCount >= 4) {
    suggestions.push(
      `本次共 ${llmCallCount} 次 LLM 调用，属完整流水线；若只需草稿 JD，可增加「仅 initial 两轮」等产品模式以省时间。`,
    );
  }

  if (suggestions.length === 0) {
    suggestions.push('耗时分布较均衡；若仍偏慢，请优先对比各阶段 ms 与模型/网关延迟。');
  }

  return suggestions.slice(0, 8);
}

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function formatMs(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatSec(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
