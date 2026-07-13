import jdEvaluateGoldenSamples from './datasets/jd-evaluate-golden-samples.v1.json';
import type { JD } from '@/types';

export const JD_EVALUATE_ANCHORS = [
  'high_quality',
  'acceptable',
  'problematic',
  'fabricated_risk',
] as const;

export type JdEvaluateAnchor = (typeof JD_EVALUATE_ANCHORS)[number];

export type JdEvaluateScoreRange = [number, number];

export type JdEvaluateGoldenSample = {
  id: string;
  anchor: JdEvaluateAnchor;
  label: string;
  jd: JD;
  companyContext: string | null;
  expected: {
    scoreRanges: {
      clarity: JdEvaluateScoreRange;
      completeness: JdEvaluateScoreRange;
      attractiveness: JdEvaluateScoreRange;
      specificity: JdEvaluateScoreRange;
    };
    /** `null` skips rewrite_required assertion (LLM variance on strong drafts). */
    rewriteRequired: boolean | null;
    issueMustInclude?: string[];
  };
  rationale: string;
};

type JdEvaluateGoldenDataset = {
  version: string;
  description: string;
  samples: JdEvaluateGoldenSample[];
};

const dataset = jdEvaluateGoldenSamples as JdEvaluateGoldenDataset;

export const JD_EVALUATE_DATASET_VERSION = dataset.version;
export const JD_EVALUATE_DATASET_DESCRIPTION = dataset.description;
export const JD_EVALUATE_DATASET_SAMPLES = dataset.samples;

export function listJdEvaluateDatasetSamples(params?: {
  anchor?: JdEvaluateAnchor;
}): JdEvaluateGoldenSample[] {
  if (!params?.anchor) {
    return JD_EVALUATE_DATASET_SAMPLES;
  }
  return JD_EVALUATE_DATASET_SAMPLES.filter((sample) => sample.anchor === params.anchor);
}

export function isJdEvaluateAnchor(value: string): value is JdEvaluateAnchor {
  return (JD_EVALUATE_ANCHORS as readonly string[]).includes(value);
}
