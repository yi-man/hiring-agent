import { isJdEvaluateAnchor } from '../dataset';
import {
  exportJdEvaluateDatasetSamples,
  formatJdEvaluateDatasetSamples,
  formatJdEvaluateDatasetSummary,
} from './dataset-ops';
import { runJdEvaluateGoldenRegression } from './run-ops';

export type JdEvaluateValidationOpResult = {
  operation: 'dataset' | 'run' | 'usage';
  detail: string;
  exitCode: 0 | 1;
};

export function getJdEvaluateValidationOpsUsage(): string {
  return `Usage: validation-jd-evaluate <command>

Commands:
  dataset
    查看 JD evaluate golden sample 数据集概览。

  dataset show <anchor>
    查看某个质量锚点的样本（high_quality|acceptable|problematic|fabricated_risk）。

  dataset export <anchor>
    以 JSON 导出某个锚点的样本。

  run [anchor]
    对样本真实调用 jd-agent.evaluate 并断言分数区间 / rewrite_required / issue 关键词。
    需要可用的 LLM API；默认 CI 不跑此命令。`;
}

function runDatasetOp(args: string[]): JdEvaluateValidationOpResult {
  const [command, anchorArg] = args;

  if (!command) {
    return {
      operation: 'dataset',
      detail: formatJdEvaluateDatasetSummary(),
      exitCode: 0,
    };
  }

  if (command === 'show' || command === 'export') {
    if (!anchorArg || !isJdEvaluateAnchor(anchorArg)) {
      return {
        operation: 'usage',
        detail: `Unknown anchor: ${anchorArg ?? '<missing>'}\n\n${getJdEvaluateValidationOpsUsage()}`,
        exitCode: 1,
      };
    }
    return {
      operation: 'dataset',
      detail:
        command === 'show'
          ? formatJdEvaluateDatasetSamples(anchorArg)
          : exportJdEvaluateDatasetSamples(anchorArg),
      exitCode: 0,
    };
  }

  return {
    operation: 'usage',
    detail: `Unknown dataset command: ${command}\n\n${getJdEvaluateValidationOpsUsage()}`,
    exitCode: 1,
  };
}

export async function runJdEvaluateValidationOp(
  args: string[],
): Promise<JdEvaluateValidationOpResult> {
  const [command, ...rest] = args;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    return { operation: 'usage', detail: getJdEvaluateValidationOpsUsage(), exitCode: 0 };
  }

  if (command === 'dataset') {
    return runDatasetOp(rest);
  }

  if (command === 'run') {
    const anchorArg = rest[0];
    if (anchorArg && !isJdEvaluateAnchor(anchorArg)) {
      return {
        operation: 'usage',
        detail: `Unknown anchor: ${anchorArg}\n\n${getJdEvaluateValidationOpsUsage()}`,
        exitCode: 1,
      };
    }
    const result = await runJdEvaluateGoldenRegression({
      anchor: anchorArg && isJdEvaluateAnchor(anchorArg) ? anchorArg : undefined,
    });
    return { operation: 'run', ...result };
  }

  return {
    operation: 'usage',
    detail: `Unknown command: ${command}\n\n${getJdEvaluateValidationOpsUsage()}`,
    exitCode: 1,
  };
}
