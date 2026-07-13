import type { BrowserExecutor } from '@/lib/browser/types';
import type { RawCandidate } from '../ingest';
import type { CandidateActionPlan, CandidateScreeningPlatform, SearchPlan } from '../types';
import type { BossLikeScreeningTargets } from '../workflow/types';

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

export type CandidateBrowserActionOptions = {
  targets?: Partial<BossLikeScreeningTargets>;
};

export type CandidateSourceAdapter = {
  platform: CandidateScreeningPlatform;
  getBrowserExecutor(): BrowserExecutor;
  loginIfNeeded(options?: CandidateBrowserActionOptions): Promise<void>;
  searchCandidates(
    plan: SearchPlan,
    options: SearchOptions,
    workflow?: CandidateBrowserActionOptions,
  ): AsyncIterable<RawCandidateBatch>;
  enrichCandidate(
    candidate: RawCandidate,
    options?: CandidateBrowserActionOptions,
  ): Promise<RawCandidate>;
  collectCandidate(
    candidate: StoredCandidateRef,
    options?: CandidateBrowserActionOptions,
  ): Promise<ActionExecutionResult>;
  chatCandidate(
    candidate: StoredCandidateRef,
    plan: CandidateActionPlan,
    options?: CandidateBrowserActionOptions,
  ): Promise<ActionExecutionResult>;
  close(): Promise<void>;
};
