import { PROMPT_VERSION } from '@/lib/jd-agent/prompts';
import { runLLM } from '@/lib/jd-agent/llm';
import type { EvaluationResult, JD } from '@/types';
import { assertJdEvaluateSample } from '../assert';
import {
  JD_EVALUATE_DATASET_VERSION,
  listJdEvaluateDatasetSamples,
  type JdEvaluateAnchor,
  type JdEvaluateGoldenSample,
} from '../dataset';

export type JdEvaluateRunner = (input: {
  jd: JD;
  companyContext?: string;
}) => Promise<EvaluationResult>;

async function defaultEvaluate(input: {
  jd: JD;
  companyContext?: string;
}): Promise<EvaluationResult> {
  const result = await runLLM({
    stage: 'evaluate',
    jd: input.jd,
    companyContext: input.companyContext,
  });
  return result.output as EvaluationResult;
}

export async function runJdEvaluateGoldenRegression(params?: {
  anchor?: JdEvaluateAnchor;
  evaluate?: JdEvaluateRunner;
}): Promise<{ detail: string; exitCode: 0 | 1 }> {
  const evaluate = params?.evaluate ?? defaultEvaluate;
  const samples: JdEvaluateGoldenSample[] = listJdEvaluateDatasetSamples({
    anchor: params?.anchor,
  });

  const lines = [
    `dataset: ${JD_EVALUATE_DATASET_VERSION}`,
    `promptVersion: ${PROMPT_VERSION}`,
    `samples: ${samples.length}`,
    '',
  ];

  let failed = 0;
  for (const sample of samples) {
    const evaluation = await evaluate({
      jd: sample.jd,
      companyContext: sample.companyContext ?? undefined,
    });
    const asserted = assertJdEvaluateSample(sample, evaluation);
    const scoreText = [
      `c=${evaluation.scores.clarity}`,
      `comp=${evaluation.scores.completeness}`,
      `a=${evaluation.scores.attractiveness}`,
      `s=${evaluation.scores.specificity}`,
      `rewrite=${evaluation.rewrite_required}`,
    ].join(' ');

    if (asserted.ok) {
      lines.push(`PASS ${sample.id} ${scoreText}`);
    } else {
      failed += 1;
      lines.push(`FAIL ${sample.id} ${scoreText}`);
      for (const failure of asserted.failures) {
        lines.push(`  - ${failure.field}: ${failure.message}`);
      }
    }
  }

  lines.push('');
  lines.push(failed === 0 ? 'All samples passed.' : `${failed} sample(s) failed.`);
  return { detail: lines.join('\n'), exitCode: failed === 0 ? 0 : 1 };
}
