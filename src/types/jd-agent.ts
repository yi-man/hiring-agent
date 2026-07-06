export type JDTone = 'startup' | 'tech' | 'formal';

export const JD_STATUSES = [
  'created',
  'ready_to_publish',
  'publishing',
  'published',
  'publish_failed',
  'offline',
  'archived',
] as const;

export type JDStatus = (typeof JD_STATUSES)[number];

export type JobSchema = {
  title: string;
  seniority: string;
  skills: string[];
  responsibilities: string[];
  companyHighlights?: string[];
  tone?: JDTone;
};

export type JD = {
  title: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  bonus: string[];
  highlights: string[];
};

export type JDScore = {
  clarity: number;
  completeness: number;
  attractiveness: number;
  specificity: number;
};

export type JDSearchProfile = {
  mustHaveKeywords: string[];
  niceToHaveKeywords: string[];
  broadKeywords: string[];
  negativeKeywords: string[];
  seniority?: string | null;
  searchQueries: string[];
};

export type EvaluationResult = {
  scores: JDScore;
  issues: string[];
  evidence: string[];
  suggestions: string[];
  rewrite_required: boolean;
};

export type JDAgentAction = 'initial_generate' | 'continue_generate';

export type JDAgentRequest = {
  action: JDAgentAction;
  jobInput?: string;
  currentJd?: JD;
  extraInstruction?: string;
  tone?: JDTone;
};

export type JDAgentDecision = {
  improved: boolean;
  picked: 'original' | 'improved';
};

/** 单次请求内各阶段耗时（服务端 performance.now） */
export type JDAgentStageTiming = {
  id: string;
  label: string;
  ms: number;
};

export type JDAgentTimingMeta = {
  totalMs: number;
  stages: JDAgentStageTiming[];
  suggestions: string[];
};

export type JDAgentTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type JDAgentStageTokenUsage = {
  id: string;
  label: string;
  usage: JDAgentTokenUsage;
};

export type JDAgentTokenMeta = {
  total: JDAgentTokenUsage;
  stages: JDAgentStageTokenUsage[];
};

export type JDAgentContextMatch = {
  score: number;
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  filename: string;
  title: string | null;
  sourceLabel: string | null;
};

export type JDAgentContextMeta = {
  used: boolean;
  query: string;
  textLength: number;
  matches: JDAgentContextMatch[];
  warnings: string[];
};

export type JDAgentResponse = {
  jd: JD;
  evaluation: EvaluationResult;
  decision: JDAgentDecision;
  meta: {
    model: string;
    promptVersion: string;
    action: JDAgentAction;
    timing?: JDAgentTimingMeta;
    tokens?: JDAgentTokenMeta;
    context?: JDAgentContextMeta;
    searchProfile?: JDSearchProfile;
  };
  warnings?: string[];
};

export type JobDescriptionDto = {
  id: string;
  userId: string;
  department: string;
  position: string;
  positionDescription: string;
  salaryRange: string | null;
  workLocations: string[];
  tone: JDTone;
  status: JDStatus;
  content: JD;
  evaluation: EvaluationResult | null;
  generationMeta: JDAgentResponse['meta'] | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateJobDescriptionRequest = {
  department: string;
  position: string;
  positionDescription: string;
  salaryRange: string;
  workLocations: string[];
  tone?: JDTone;
};

export type UpdateJobDescriptionRequest = Partial<{
  department: string;
  position: string;
  positionDescription: string;
  salaryRange: string | null;
  workLocations: string[];
  tone: JDTone;
  status: JDStatus;
  content: JD;
  evaluation: EvaluationResult | null;
  generationMeta: JDAgentResponse['meta'] | null;
}>;

export type RegenerateJobDescriptionRequest = {
  currentJd?: JD;
  extraInstruction?: string;
  tone?: JDTone;
};
