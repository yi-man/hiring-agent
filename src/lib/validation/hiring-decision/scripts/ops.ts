import {
  HIRING_DECISION_DATASET_DESCRIPTION,
  HIRING_DECISION_DATASET_SAMPLES,
  HIRING_DECISION_DATASET_VERSION,
} from '../dataset';
import { runHiringDecisionGoldenDataset } from '../runner';

export type HiringDecisionValidationOpResult = {
  operation: 'dataset' | 'run' | 'usage';
  detail: string;
  exitCode: 0 | 1;
};

export function getHiringDecisionValidationOpsUsage() {
  return `Usage: validation-hiring-decision <command>

Commands:
  dataset  查看录用建议 golden sample 验证集。
  run      执行全部固定样本并校验建议、风险、置信度和维度分数。`;
}

function formatDataset() {
  return [
    `录用建议验证集: ${HIRING_DECISION_DATASET_VERSION}`,
    HIRING_DECISION_DATASET_DESCRIPTION,
    '',
    ...HIRING_DECISION_DATASET_SAMPLES.map(
      (sample) =>
        `${sample.anchor}\t${sample.id}\t${sample.expected.hireDecision}\t${sample.rationale}`,
    ),
  ].join('\n');
}

function formatRun() {
  const result = runHiringDecisionGoldenDataset();
  const lines = result.samples.map((item) =>
    item.assertion.ok
      ? `PASS ${item.sample.id} ${item.decision.hireDecision} score=${item.decision.decisionTrace.weightedScore}`
      : `FAIL ${item.sample.id} ${item.assertion.failures.map((failure) => failure.message).join('；')}`,
  );
  lines.push(
    result.failed === 0
      ? `全部通过：${result.passed}/${result.samples.length}`
      : `验证失败：${result.failed}/${result.samples.length}`,
  );
  return { detail: lines.join('\n'), exitCode: result.failed === 0 ? (0 as const) : (1 as const) };
}

export function runHiringDecisionValidationOp(args: string[]): HiringDecisionValidationOpResult {
  const [command] = args;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    return { operation: 'usage', detail: getHiringDecisionValidationOpsUsage(), exitCode: 0 };
  }
  if (command === 'dataset') return { operation: 'dataset', detail: formatDataset(), exitCode: 0 };
  if (command === 'run') return { operation: 'run', ...formatRun() };
  return {
    operation: 'usage',
    detail: `Unknown command: ${command}\n\n${getHiringDecisionValidationOpsUsage()}`,
    exitCode: 1,
  };
}
