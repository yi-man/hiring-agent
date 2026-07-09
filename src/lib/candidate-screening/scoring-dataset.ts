import scoringGoldenSamples from './datasets/scoring-golden-samples.v1.json';
import type {
  CandidateCalibrationCategory,
  CandidateDecisionAction,
  CandidateDecisionPriority,
} from './types';

export type CandidateScoringDatasetSample = {
  id: string;
  category: CandidateCalibrationCategory;
  anchor: string;
  jobTitle: string;
  jdText: string;
  candidateName: string;
  resumeText: string;
  expected: {
    action: CandidateDecisionAction;
    scoreRange: [number, number];
    priority: CandidateDecisionPriority;
  };
  rationale: string;
};

type CandidateScoringDataset = {
  version: string;
  description: string;
  samples: CandidateScoringDatasetSample[];
};

const dataset = scoringGoldenSamples as CandidateScoringDataset;

export const CANDIDATE_SCORING_DATASET_VERSION = dataset.version;
export const CANDIDATE_SCORING_DATASET_DESCRIPTION = dataset.description;
export const CANDIDATE_SCORING_DATASET_SAMPLES = dataset.samples;

export function listCandidateScoringDatasetSamples(params?: {
  category?: CandidateCalibrationCategory;
}): CandidateScoringDatasetSample[] {
  if (!params?.category) {
    return CANDIDATE_SCORING_DATASET_SAMPLES;
  }
  return CANDIDATE_SCORING_DATASET_SAMPLES.filter((sample) => sample.category === params.category);
}
