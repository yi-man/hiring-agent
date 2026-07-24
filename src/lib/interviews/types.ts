export type InterviewProcessStage = {
  id: string;
  name: string;
  purpose: string;
  sortOrder: number;
};

export type InterviewProcessAutoMatch = {
  departments: string[];
  positionKeywords: string[];
  isFallback: boolean;
};

export type InterviewProcess = {
  id: string;
  positionType: string;
  autoMatch?: InterviewProcessAutoMatch;
  stages: InterviewProcessStage[];
};

export type CandidateInterviewAssignment = {
  stage: string;
  interviewer: string;
};
