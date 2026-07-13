import {
  JD_EVALUATE_ANCHORS,
  JD_EVALUATE_DATASET_DESCRIPTION,
  JD_EVALUATE_DATASET_VERSION,
  listJdEvaluateDatasetSamples,
  type JdEvaluateAnchor,
} from '../dataset';

export function formatJdEvaluateDatasetSummary(): string {
  const lines = [`评估数据集: ${JD_EVALUATE_DATASET_VERSION}`, JD_EVALUATE_DATASET_DESCRIPTION, ''];

  for (const anchor of JD_EVALUATE_ANCHORS) {
    const samples = listJdEvaluateDatasetSamples({ anchor });
    const labels = samples.map((sample) => sample.label).join(' · ');
    lines.push(`${anchor}\t${samples.length} samples\t${labels}`);
  }

  return lines.join('\n');
}

export function formatJdEvaluateDatasetSamples(anchor: JdEvaluateAnchor): string {
  const samples = listJdEvaluateDatasetSamples({ anchor });
  const formattedSamples = samples
    .map(
      (sample) => `- ${sample.id} ${sample.label}
  rewriteRequired: ${sample.expected.rewriteRequired}
  scoreRanges: clarity ${sample.expected.scoreRanges.clarity.join('-')}, completeness ${sample.expected.scoreRanges.completeness.join('-')}, attractiveness ${sample.expected.scoreRanges.attractiveness.join('-')}, specificity ${sample.expected.scoreRanges.specificity.join('-')}
  JD: ${sample.jd.title}｜${sample.jd.summary}
  rationale: ${sample.rationale}`,
    )
    .join('\n');

  return `anchor: ${anchor}
dataset: ${JD_EVALUATE_DATASET_VERSION}
samples: ${samples.length}

${formattedSamples}`;
}

export function exportJdEvaluateDatasetSamples(anchor: JdEvaluateAnchor): string {
  return JSON.stringify(
    {
      version: JD_EVALUATE_DATASET_VERSION,
      anchor,
      samples: listJdEvaluateDatasetSamples({ anchor }),
    },
    null,
    2,
  );
}
