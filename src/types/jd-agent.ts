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

export type JDAgentResponse = {
  jd: JD;
  evaluation: EvaluationResult;
  decision: JDAgentDecision;
  meta: {
    model: string;
    promptVersion: string;
    action: JDAgentAction;
  };
  warnings?: string[];
};
