import type { RawCandidate } from '../ingest';
import type { CandidateActionPlan, CandidateScreeningPlatform, SearchPlan } from '../types';

export type RawCandidateBatch = {
  candidates: RawCandidate[];
  cursor?: string | null;
};

export type SearchOptions = {
  maxCandidates: number;
  batchSize: number;
};

export type StoredCandidateRef = {
  candidateId: string;
  profileUrl?: string | null;
  displayName: string;
};

export type ActionExecutionResult = {
  success: boolean;
  error?: string;
  browserTrace?: Record<string, unknown>;
};

export type CandidateSourceAdapter = {
  platform: CandidateScreeningPlatform;
  loginIfNeeded(): Promise<void>;
  searchCandidates(plan: SearchPlan, options: SearchOptions): AsyncIterable<RawCandidateBatch>;
  collectCandidate(candidate: StoredCandidateRef): Promise<ActionExecutionResult>;
  chatCandidate(
    candidate: StoredCandidateRef,
    plan: CandidateActionPlan,
  ): Promise<ActionExecutionResult>;
  close(): Promise<void>;
};
