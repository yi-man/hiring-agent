import type { BrowserExecutor, BrowserStepResult, BrowserTargetInput } from '@/lib/browser/types';
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
  /**
   * Retained for direct legacy adapter callers. Browser-v2 screening receives
   * list/profile HTML observations through the shared workflow runner instead.
   */
  deferEnrichment?: boolean;
};

export type StoredCandidateRef = {
  candidateId: string;
  profileUrl?: string | null;
  displayName: string;
};

export type CandidateAdapterTargetKey = keyof BossLikeScreeningTargets;

export class CandidateAdapterTargetError extends Error {
  readonly result: BrowserStepResult;
  readonly target: BrowserTargetInput;
  readonly targetKey: CandidateAdapterTargetKey;

  constructor(params: {
    result: BrowserStepResult;
    target: BrowserTargetInput;
    targetKey: CandidateAdapterTargetKey;
  }) {
    super(params.result.error ?? `browser target failed: ${params.targetKey}`);
    this.name = 'CandidateAdapterTargetError';
    this.result = params.result;
    this.target = params.target;
    this.targetKey = params.targetKey;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type ActionExecutionResult = {
  success: boolean;
  error?: string;
  browserTrace?: Record<string, unknown>;
  targetError?: CandidateAdapterTargetError;
};

export type CandidateBrowserActionOptions = {
  targets?: Partial<BossLikeScreeningTargets>;
};

export type CandidateWorkflowExploreContext = {
  baseUrl: string;
  resumeListPath?: string;
  siteFingerprint?: string;
  credentials: {
    username: string;
    password: string;
  };
};

export type CandidateSourceAdapter = {
  platform: CandidateScreeningPlatform;
  getBrowserExecutor(): BrowserExecutor;
  getWorkflowExploreContext?(): CandidateWorkflowExploreContext;
  /** Legacy and Candidate Communication browser boundary; browser-v2 uses getBrowserExecutor(). */
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
