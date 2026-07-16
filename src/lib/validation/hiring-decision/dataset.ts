import hiringDecisionGoldenSamples from './datasets/hiring-decision-golden-samples.v1.json';
import type {
  CandidateDecisionDimensionKey,
  CandidateDecisionResultDto,
} from '@/lib/candidate-screening/hiring-decision';
import type {
  CandidateDecisionIntentLevel,
  CandidateDecisionRiskLevel,
  CandidateHireDecision,
  CandidateInterviewFeedbackDecision,
  CandidateInterviewFeedbackStage,
  CandidateInterviewDimensionRating,
} from '@/lib/candidate-screening/types';

export const HIRING_DECISION_ANCHORS = ['strong_hire', 'cautious_hire', 'reject'] as const;
export type HiringDecisionAnchor = (typeof HIRING_DECISION_ANCHORS)[number];

export type HiringDecisionGoldenSample = {
  id: string;
  anchor: HiringDecisionAnchor;
  label: string;
  input: {
    job: {
      title: string;
      description: string;
      requirements: string[];
      requiredYears: number;
    };
    candidate: {
      skillScore: number;
      years: number;
      contacted: boolean;
      replied: boolean;
      notes: string;
      skills: string[];
      domainKnowledge: string[];
      generalAbility: string[];
      risks: string[];
    };
    feedbacks: Array<{
      stage: CandidateInterviewFeedbackStage;
      rating: number;
      decision: CandidateInterviewFeedbackDecision;
      pros: string[];
      cons: string[];
      dimensionRatings?: CandidateInterviewDimensionRating[];
    }>;
  };
  expected: {
    hireDecision: CandidateHireDecision;
    decisionScope: CandidateDecisionResultDto['decisionScope'];
    riskLevel: CandidateDecisionRiskLevel;
    intentLevel: CandidateDecisionIntentLevel;
    weightedScoreRange: [number, number];
    confidenceRange: [number, number];
    dimensionScoreRanges: Partial<Record<CandidateDecisionDimensionKey, [number, number]>>;
  };
  rationale: string;
};

type HiringDecisionGoldenDataset = {
  version: string;
  description: string;
  samples: HiringDecisionGoldenSample[];
};

const dataset = hiringDecisionGoldenSamples as unknown as HiringDecisionGoldenDataset;

export const HIRING_DECISION_DATASET_VERSION = dataset.version;
export const HIRING_DECISION_DATASET_DESCRIPTION = dataset.description;
export const HIRING_DECISION_DATASET_SAMPLES = dataset.samples;

export function listHiringDecisionDatasetSamples(params?: {
  anchor?: HiringDecisionAnchor;
}): HiringDecisionGoldenSample[] {
  if (!params?.anchor) return HIRING_DECISION_DATASET_SAMPLES;
  return HIRING_DECISION_DATASET_SAMPLES.filter((sample) => sample.anchor === params.anchor);
}
