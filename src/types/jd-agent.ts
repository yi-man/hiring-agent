export type JDTone = 'startup' | 'tech' | 'formal';

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
  };
  warnings?: string[];
};
