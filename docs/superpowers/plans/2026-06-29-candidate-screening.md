# Candidate Screening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first JD-linked candidate screening loop: published JD entry, boss-like live resume search, PostgreSQL candidate memory, pgvector resume recall, AI scoring, dry-run action plans, explicit execution actions, and JD-specific interview progress.

**Architecture:** Add a focused `src/lib/candidate-screening/` domain module beside `jd-publishing` and `rag`. PostgreSQL stores candidates, resume snapshots, screening runs, JD-specific results, action logs, and tag stats; pgvector rows live in `candidate_resume_chunks` and reuse the existing embedding client style. UI entry points live under the existing JD workbench so screening feels like a continuation of published JD work.

**Tech Stack:** Next.js 16 App Router, React 18, TypeScript strict mode, Prisma + PostgreSQL + pgvector, Bun, Jest, Playwright browser automation, HeroUI/shadcn-style local UI wrappers, existing OpenAI-compatible embedding and LLM environment.

---

## Scope And Sequencing

This is one feature plan with independent, commit-sized tasks. The plan intentionally lands working software in layers:

1. Types and validation constants.
2. Prisma schema and migration.
3. Pure domain logic.
4. Repository and pgvector SQL.
5. Resume ingest and recall.
6. LLM evaluation seam.
7. Boss-like adapter.
8. Runner orchestration.
9. API routes.
10. UI pages and JD entry points.
11. Integration and browser tests.

Each task must be implemented with TDD. Do not start a task by writing production code. For every test step, first run the targeted test and confirm it fails for the expected reason, then implement the minimal code and rerun.

## File Structure

Create:

- `src/lib/candidate-screening/types.ts` - shared domain types and status unions.
- `src/lib/candidate-screening/constants.ts` - allowed stages, thresholds, defaults, and labels.
- `src/lib/candidate-screening/api.ts` - request parsing helpers for candidate-screening routes.
- `src/lib/candidate-screening/dedupe.ts` - identity key/hash generation and in-run dedupe state.
- `src/lib/candidate-screening/scoring.ts` - score clamp, score formula, decision thresholds.
- `src/lib/candidate-screening/ranking.ts` - merge live/vector candidates, preserve source provenance, rank.
- `src/lib/candidate-screening/actions.ts` - dry-run action plan and idempotency key generation.
- `src/lib/candidate-screening/planner.ts` - JD to search plan/evaluation schema.
- `src/lib/candidate-screening/repo.ts` - Prisma repository and pgvector insert/search SQL.
- `src/lib/candidate-screening/ingest.ts` - upsert candidate/resume and embed resume chunks.
- `src/lib/candidate-screening/recall.ts` - embed JD retrieval query and recall candidates from pgvector.
- `src/lib/candidate-screening/llm.ts` - OpenAI-compatible JSON evaluation call.
- `src/lib/candidate-screening/evaluation.ts` - evaluator orchestration and fallback-safe validation.
- `src/lib/candidate-screening/runner.ts` - persisted screening run orchestration.
- `src/lib/candidate-screening/service.ts` - public service entry points used by routes.
- `src/lib/candidate-screening/adapters/types.ts` - platform adapter interfaces.
- `src/lib/candidate-screening/adapters/boss-like.ts` - boss-like browser adapter.
- `src/lib/candidate-screening/adapters/factory.ts` - creates the first platform adapter.
- `src/lib/candidate-screening/client.ts` - browser-side fetch helpers.
- `src/components/candidate-screening/run-progress.tsx` - run stage and stats view.
- `src/components/candidate-screening/candidate-list.tsx` - JD candidate result list.
- `src/components/candidate-screening/candidate-detail.tsx` - resume, score, actions, progress detail.
- `src/app/jd-generator/[id]/candidates/page.tsx` - JD candidate list page.
- `src/app/jd-generator/[id]/candidates/[candidateId]/page.tsx` - JD candidate detail page.
- `src/app/api/jd/[id]/candidate-screening/runs/route.ts` - create/list JD screening runs.
- `src/app/api/candidate-screening/runs/[runId]/route.ts` - get run progress.
- `src/app/api/candidate-screening/runs/[runId]/stream/route.ts` - SSE progress stream backed by polling.
- `src/app/api/candidate-screening/runs/[runId]/execute-actions/route.ts` - explicit real action execution.
- `src/app/api/jd/[id]/candidates/route.ts` - list JD candidate results.
- `src/app/api/jd/[id]/candidates/[candidateId]/route.ts` - get/update JD candidate detail.
- `prisma/migrations/20260629000000_candidate_screening/migration.sql` - new tables and indexes.
- Unit and route test files are named in the task that creates them.

Modify:

- `prisma/schema.prisma` - add candidate screening models and relations.
- `src/types/index.ts` - export candidate-screening public types.
- `src/lib/env.ts` - add run limits and action limits.
- `.env.example` - document new limit env vars while reusing boss-like URL/credentials.
- `src/components/jd-generator/jd-pages.tsx` - add screening entry points to JD detail.
- `src/lib/jd/client.ts` - add screening client calls or delegate to `candidate-screening/client.ts`.
- `src/components/navbar.tsx` only if a top-level screening link becomes necessary; default plan keeps navigation under JD detail.

## Task 1: Domain Types, Constants, And API Parsers

**Files:**

- Create: `src/lib/candidate-screening/types.ts`
- Create: `src/lib/candidate-screening/constants.ts`
- Create: `src/lib/candidate-screening/api.ts`
- Create test: `src/lib/candidate-screening/api.test.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Write failing parser and constants tests**

Create `src/lib/candidate-screening/api.test.ts`:

```ts
import {
  CANDIDATE_SCREENING_DECISION_ACTIONS,
  CANDIDATE_SCREENING_INTERVIEW_STAGES,
  CANDIDATE_SCREENING_RUN_STAGES,
} from './constants';
import {
  parseCreateScreeningRunPayload,
  parseExecuteActionsPayload,
  parseUpdateCandidateProgressPayload,
} from './api';

describe('candidate screening API parsing', () => {
  it('parses a default dry-run create request', () => {
    expect(parseCreateScreeningRunPayload({ platform: 'boss-like' })).toEqual({
      ok: true,
      value: {
        platform: 'boss-like',
        mode: 'dry_run',
        maxCandidates: 50,
        batchSize: 10,
        allowAlreadyContacted: false,
      },
    });
  });

  it('rejects unsupported platform and unsafe limits', () => {
    expect(parseCreateScreeningRunPayload({ platform: 'x' })).toEqual({
      ok: false,
      error: 'platform is invalid',
    });
    expect(parseCreateScreeningRunPayload({ platform: 'boss-like', maxCandidates: 501 })).toEqual({
      ok: false,
      error: 'maxCandidates must be between 1 and 200',
    });
  });

  it('requires explicit execution confirmation', () => {
    expect(parseExecuteActionsPayload({ confirmExecution: false })).toEqual({
      ok: false,
      error: 'confirmExecution must be true',
    });
    expect(parseExecuteActionsPayload({ confirmExecution: true })).toEqual({
      ok: true,
      value: { confirmExecution: true, maxChatActions: 10, maxCollectActions: 30 },
    });
  });

  it('parses interview progress updates', () => {
    expect(parseUpdateCandidateProgressPayload({ interviewStage: 'phone_screen', notes: '约电话' })).toEqual({
      ok: true,
      value: { interviewStage: 'phone_screen', notes: '约电话' },
    });
    expect(parseUpdateCandidateProgressPayload({ interviewStage: 'unknown' })).toEqual({
      ok: false,
      error: 'interviewStage is invalid',
    });
  });

  it('exports stable stage and decision constants', () => {
    expect(CANDIDATE_SCREENING_RUN_STAGES).toContain('searching_live');
    expect(CANDIDATE_SCREENING_INTERVIEW_STAGES).toContain('interviewing');
    expect(CANDIDATE_SCREENING_DECISION_ACTIONS).toEqual(['chat', 'collect', 'skip']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bunx jest src/lib/candidate-screening/api.test.ts --runInBand --coverage=false
```

Expected: FAIL because `src/lib/candidate-screening/api.ts` and constants do not exist.

- [ ] **Step 3: Add types and constants**

Create `src/lib/candidate-screening/types.ts` with these exports:

```ts
export type CandidateScreeningPlatform = 'boss-like';
export type CandidateScreeningMode = 'dry_run' | 'execution';
export type CandidateScreeningRunStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
export type CandidateScreeningRunStage =
  | 'planning'
  | 'searching_live'
  | 'ingesting_live'
  | 'indexing_resumes'
  | 'recalling_vectors'
  | 'evaluating'
  | 'ranking'
  | 'planning_actions'
  | 'executing_actions'
  | 'finalizing';
export type CandidateScreeningSource = 'live_search' | 'vector_recall' | 'both';
export type CandidateDecisionAction = 'chat' | 'collect' | 'skip';
export type CandidateDecisionPriority = 'high' | 'medium' | 'low';
export type CandidateActionStatus = 'planned' | 'running' | 'success' | 'failed' | 'skipped';
export type CandidateInterviewStage =
  | 'sourced'
  | 'screened'
  | 'to_contact'
  | 'collected'
  | 'contacted'
  | 'replied'
  | 'phone_screen'
  | 'interviewing'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export type EvaluationSchema = {
  skills: string[];
  domainKnowledge: string[];
  generalAbility: string[];
  risk: string[];
};

export type SearchPlan = {
  keywords: string[];
  filters: {
    experience?: string;
    location?: string;
  };
  priorityTags: string[];
  retrievalQuery: string;
};

export type CandidateTags = {
  skills: string[];
  domainKnowledge: string[];
  generalAbility: string[];
  risk: string[];
  activity: string[];
  custom: string[];
};

export type ScoreDetail = {
  skill: number;
  domain: number;
  ability: number;
  risk: number;
  llmBonus: number;
  total: number;
};

export type CandidateActionPlan = {
  action: CandidateDecisionAction;
  priority: CandidateDecisionPriority;
  message: string | null;
  reason: string;
};

export type ScreeningRunStats = {
  fetched: number;
  deduped: number;
  stored: number;
  vectorRecalled: number;
  evaluated: number;
  recommendedChat: number;
  recommendedCollect: number;
  skipped: number;
  failed: number;
};

export type CreateScreeningRunRequest = {
  platform: CandidateScreeningPlatform;
  mode: CandidateScreeningMode;
  maxCandidates: number;
  batchSize: number;
  allowAlreadyContacted: boolean;
};

export type ExecuteActionsRequest = {
  confirmExecution: true;
  maxChatActions: number;
  maxCollectActions: number;
};

export type UpdateCandidateProgressRequest = {
  interviewStage?: CandidateInterviewStage;
  notes?: string;
};
```

Create `src/lib/candidate-screening/constants.ts`:

```ts
import type {
  CandidateDecisionAction,
  CandidateInterviewStage,
  CandidateScreeningRunStage,
  CandidateScreeningRunStatus,
} from './types';

export const CANDIDATE_SCREENING_RUN_STAGES = [
  'planning',
  'searching_live',
  'ingesting_live',
  'indexing_resumes',
  'recalling_vectors',
  'evaluating',
  'ranking',
  'planning_actions',
  'executing_actions',
  'finalizing',
] as const satisfies readonly CandidateScreeningRunStage[];

export const CANDIDATE_SCREENING_RUN_STATUSES = [
  'pending',
  'running',
  'success',
  'failed',
  'cancelled',
] as const satisfies readonly CandidateScreeningRunStatus[];

export const CANDIDATE_SCREENING_INTERVIEW_STAGES = [
  'sourced',
  'screened',
  'to_contact',
  'collected',
  'contacted',
  'replied',
  'phone_screen',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
] as const satisfies readonly CandidateInterviewStage[];

export const CANDIDATE_SCREENING_DECISION_ACTIONS = [
  'chat',
  'collect',
  'skip',
] as const satisfies readonly CandidateDecisionAction[];

export const DEFAULT_SCREENING_BATCH_SIZE = 10;
export const DEFAULT_SCREENING_MAX_CANDIDATES = 50;
export const MAX_SCREENING_MAX_CANDIDATES = 200;
export const DEFAULT_MAX_CHAT_ACTIONS = 10;
export const DEFAULT_MAX_COLLECT_ACTIONS = 30;
```

- [ ] **Step 4: Add request parsers**

Create `src/lib/candidate-screening/api.ts`:

```ts
import {
  CANDIDATE_SCREENING_INTERVIEW_STAGES,
  DEFAULT_MAX_CHAT_ACTIONS,
  DEFAULT_MAX_COLLECT_ACTIONS,
  DEFAULT_SCREENING_BATCH_SIZE,
  DEFAULT_SCREENING_MAX_CANDIDATES,
  MAX_SCREENING_MAX_CANDIDATES,
} from './constants';
import type {
  CandidateInterviewStage,
  CandidateScreeningMode,
  CreateScreeningRunRequest,
  ExecuteActionsRequest,
  UpdateCandidateProgressRequest,
} from './types';

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalPositiveInt(value: unknown, fallback: number, max: number, name: string): ValidationResult<number> {
  if (value === undefined) return { ok: true, value: fallback };
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    return { ok: false, error: `${name} must be between 1 and ${max}` };
  }
  return { ok: true, value: parsed };
}

export function parseCreateScreeningRunPayload(body: unknown): ValidationResult<CreateScreeningRunRequest> {
  if (!isRecord(body)) return { ok: false, error: 'invalid JSON body' };
  if (body.platform !== 'boss-like') return { ok: false, error: 'platform is invalid' };
  const mode: CandidateScreeningMode = body.mode === 'execution' ? 'execution' : 'dry_run';
  const maxCandidates = optionalPositiveInt(
    body.maxCandidates,
    DEFAULT_SCREENING_MAX_CANDIDATES,
    MAX_SCREENING_MAX_CANDIDATES,
    'maxCandidates',
  );
  if (!maxCandidates.ok) return maxCandidates;
  const batchSize = optionalPositiveInt(body.batchSize, DEFAULT_SCREENING_BATCH_SIZE, 50, 'batchSize');
  if (!batchSize.ok) return batchSize;
  return {
    ok: true,
    value: {
      platform: 'boss-like',
      mode,
      maxCandidates: maxCandidates.value,
      batchSize: batchSize.value,
      allowAlreadyContacted: body.allowAlreadyContacted === true,
    },
  };
}

export function parseExecuteActionsPayload(body: unknown): ValidationResult<ExecuteActionsRequest> {
  if (!isRecord(body)) return { ok: false, error: 'invalid JSON body' };
  if (body.confirmExecution !== true) return { ok: false, error: 'confirmExecution must be true' };
  const maxChatActions = optionalPositiveInt(body.maxChatActions, DEFAULT_MAX_CHAT_ACTIONS, 100, 'maxChatActions');
  if (!maxChatActions.ok) return maxChatActions;
  const maxCollectActions = optionalPositiveInt(body.maxCollectActions, DEFAULT_MAX_COLLECT_ACTIONS, 200, 'maxCollectActions');
  if (!maxCollectActions.ok) return maxCollectActions;
  return {
    ok: true,
    value: {
      confirmExecution: true,
      maxChatActions: maxChatActions.value,
      maxCollectActions: maxCollectActions.value,
    },
  };
}

export function parseUpdateCandidateProgressPayload(body: unknown): ValidationResult<UpdateCandidateProgressRequest> {
  if (!isRecord(body)) return { ok: false, error: 'invalid JSON body' };
  const value: UpdateCandidateProgressRequest = {};
  if (body.interviewStage !== undefined) {
    if (
      typeof body.interviewStage !== 'string' ||
      !CANDIDATE_SCREENING_INTERVIEW_STAGES.includes(body.interviewStage as CandidateInterviewStage)
    ) {
      return { ok: false, error: 'interviewStage is invalid' };
    }
    value.interviewStage = body.interviewStage as CandidateInterviewStage;
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string') return { ok: false, error: 'notes must be a string' };
    value.notes = body.notes.trim();
  }
  if (Object.keys(value).length === 0) return { ok: false, error: 'at least one field is required' };
  return { ok: true, value };
}
```

- [ ] **Step 5: Export public types**

Modify `src/types/index.ts` by adding:

```ts
export type {
  CandidateActionPlan,
  CandidateActionStatus,
  CandidateDecisionAction,
  CandidateDecisionPriority,
  CandidateInterviewStage,
  CandidateScreeningMode,
  CandidateScreeningPlatform,
  CandidateScreeningRunStage,
  CandidateScreeningRunStatus,
  CandidateScreeningSource,
  CandidateTags,
  CreateScreeningRunRequest,
  EvaluationSchema,
  ExecuteActionsRequest,
  ScoreDetail,
  ScreeningRunStats,
  SearchPlan,
  UpdateCandidateProgressRequest,
} from '@/lib/candidate-screening/types';
```

- [ ] **Step 6: Run tests and type check**

Run:

```bash
bunx jest src/lib/candidate-screening/api.test.ts --runInBand --coverage=false
bun run type-check
```

Expected: both commands pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/candidate-screening src/types/index.ts
git commit -m "feat: add candidate screening domain contracts"
```

## Task 2: Prisma Schema And Migration

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260629000000_candidate_screening/migration.sql`
- Test: `bunx prisma validate`

- [ ] **Step 1: Add Prisma models**

Modify `prisma/schema.prisma`:

```prisma
model User {
  id                      String                   @id @default(cuid())
  username                String                   @unique
  passwordHash            String                   @map("password_hash")
  name                    String?
  email                   String?                  @unique
  emailVerified           DateTime?                @map("email_verified")
  image                   String?
  sessions                Session[]
  conversations           Conversation[]
  jobDescriptions         JobDescription[]
  jobPublishTasks         JobPublishTask[]
  knowledgeDocuments      KnowledgeDocument[]
  knowledgeDocumentChunks KnowledgeDocumentChunk[]
  candidates              Candidate[]
  candidateResumes        CandidateResume[]
  candidateResumeChunks   CandidateResumeChunk[]
  candidateScreeningRuns  CandidateScreeningRun[]
  candidateTagStats       CandidateTagStat[]

  @@map("users")
}

model JobDescription {
  id                        String                     @id @default(uuid())
  userId                    String                     @map("user_id")
  department                String
  position                  String
  positionDescription       String                     @map("position_description")
  tone                      String                     @default("tech")
  status                    String                     @default("created")
  content                   Json
  evaluation                Json?
  generationMeta            Json?                      @map("generation_meta")
  createdAt                 DateTime                   @default(now()) @map("created_at")
  updatedAt                 DateTime                   @updatedAt @map("updated_at")
  user                      User                       @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  publishTasks              JobPublishTask[]
  candidateScreeningRuns    CandidateScreeningRun[]
  candidateScreeningResults CandidateScreeningResult[]
  candidateActionLogs       CandidateActionLog[]

  @@index([userId], map: "idx_job_descriptions_user_id")
  @@index([status], map: "idx_job_descriptions_status")
  @@index([updatedAt(sort: Desc)], map: "idx_job_descriptions_updated_at")
  @@index([userId, status], map: "idx_job_descriptions_user_status")
  @@map("job_descriptions")
}

model Candidate {
  id                        String                     @id @default(uuid())
  userId                    String                     @map("user_id")
  displayName               String                     @map("display_name")
  currentTitle              String?                    @map("current_title")
  currentCompany            String?                    @map("current_company")
  location                  String?
  experienceYears           Float?                     @map("experience_years")
  sourcePlatform            String                     @map("source_platform")
  platformCandidateId       String?                    @map("platform_candidate_id")
  profileUrl                String?                    @map("profile_url")
  identityKey               String                     @map("identity_key")
  identityHash              String                     @map("identity_hash")
  lastActiveAt              DateTime?                  @map("last_active_at")
  contacted                 Boolean                    @default(false)
  replied                   Boolean                    @default(false)
  lastContactAt             DateTime?                  @map("last_contact_at")
  createdAt                 DateTime                   @default(now()) @map("created_at")
  updatedAt                 DateTime                   @updatedAt @map("updated_at")
  user                      User                       @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  resumes                   CandidateResume[]
  chunks                    CandidateResumeChunk[]
  screeningResults          CandidateScreeningResult[]
  actionLogs                CandidateActionLog[]

  @@unique([userId, sourcePlatform, identityHash], map: "candidates_user_source_identity_hash_key")
  @@index([userId, updatedAt(sort: Desc)], map: "idx_candidates_user_updated_at")
  @@index([userId, contacted, replied], map: "idx_candidates_user_contacted_replied")
  @@map("candidates")
}

model CandidateResume {
  id               String                  @id @default(uuid())
  userId           String                  @map("user_id")
  candidateId      String                  @map("candidate_id")
  sourcePlatform   String                  @map("source_platform")
  profileUrl       String?                 @map("profile_url")
  rawText          String                  @map("raw_text")
  structuredSummary Json?                  @map("structured_summary")
  resumeHash       String                  @map("resume_hash")
  fetchedAt        DateTime                @map("fetched_at")
  createdAt        DateTime                @default(now()) @map("created_at")
  user             User                    @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  candidate        Candidate               @relation(fields: [candidateId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  chunks           CandidateResumeChunk[]
  screeningResults CandidateScreeningResult[]

  @@unique([candidateId, resumeHash], map: "candidate_resumes_candidate_hash_key")
  @@index([userId, candidateId, fetchedAt(sort: Desc)], map: "idx_candidate_resumes_user_candidate_fetched")
  @@map("candidate_resumes")
}

model CandidateResumeChunk {
  id                 String              @id @default(uuid())
  userId             String              @map("user_id")
  candidateId        String              @map("candidate_id")
  resumeId           String              @map("resume_id")
  chunkIndex         Int                 @map("chunk_index")
  content            String
  tokenEstimate      Int?                @map("token_estimate")
  embeddingModel     String              @map("embedding_model")
  embeddingDimension Int                 @map("embedding_dimension")
  embedding          Unsupported("vector")?
  createdAt          DateTime            @default(now()) @map("created_at")
  user               User                @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  candidate          Candidate           @relation(fields: [candidateId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  resume             CandidateResume     @relation(fields: [resumeId], references: [id], onDelete: Cascade, onUpdate: Restrict)

  @@unique([resumeId, chunkIndex], map: "candidate_resume_chunks_resume_chunk_key")
  @@index([candidateId], map: "idx_candidate_resume_chunks_candidate_id")
  @@index([userId, embeddingModel, embeddingDimension], map: "idx_candidate_resume_chunks_user_embedding")
  @@map("candidate_resume_chunks")
}

model CandidateScreeningRun {
  id               String                     @id @default(uuid())
  userId           String                     @map("user_id")
  jobDescriptionId String                     @map("job_description_id")
  platform         String
  mode             String                     @default("dry_run")
  status           String                     @default("pending")
  currentStage     String?                    @map("current_stage")
  searchPlan       Json?                      @map("search_plan")
  evaluationSchema Json?                      @map("evaluation_schema")
  stats            Json?
  errorMessage     String?                    @map("error_message")
  startedAt        DateTime?                  @map("started_at")
  finishedAt       DateTime?                  @map("finished_at")
  createdAt        DateTime                   @default(now()) @map("created_at")
  updatedAt        DateTime                   @updatedAt @map("updated_at")
  user             User                       @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  jobDescription   JobDescription             @relation(fields: [jobDescriptionId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  results          CandidateScreeningResult[]
  actionLogs       CandidateActionLog[]

  @@index([userId, jobDescriptionId, createdAt(sort: Desc)], map: "idx_candidate_screening_runs_user_jd_created")
  @@index([status, updatedAt(sort: Desc)], map: "idx_candidate_screening_runs_status_updated")
  @@map("candidate_screening_runs")
}

model CandidateScreeningResult {
  id               String                 @id @default(uuid())
  userId           String                 @map("user_id")
  runId            String                 @map("run_id")
  jobDescriptionId String                 @map("job_description_id")
  candidateId      String                 @map("candidate_id")
  resumeId         String?                @map("resume_id")
  source           String
  tags             Json
  scoreDetail      Json                   @map("score_detail")
  finalScore       Float                  @map("final_score")
  rank             Int
  decisionAction   String                 @map("decision_action")
  decisionPriority String                 @map("decision_priority")
  decisionReason   String                 @map("decision_reason")
  actionPlan       Json?                  @map("action_plan")
  actionStatus     String                 @default("planned") @map("action_status")
  interviewStage   String                 @default("screened") @map("interview_stage")
  notes            String?
  createdAt        DateTime               @default(now()) @map("created_at")
  updatedAt        DateTime               @updatedAt @map("updated_at")
  run              CandidateScreeningRun  @relation(fields: [runId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  jobDescription   JobDescription         @relation(fields: [jobDescriptionId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  candidate        Candidate              @relation(fields: [candidateId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  resume           CandidateResume?       @relation(fields: [resumeId], references: [id], onDelete: SetNull, onUpdate: Restrict)
  actionLogs       CandidateActionLog[]

  @@unique([jobDescriptionId, candidateId], map: "candidate_screening_results_jd_candidate_key")
  @@index([userId, jobDescriptionId, finalScore(sort: Desc)], map: "idx_candidate_screening_results_user_jd_score")
  @@index([userId, jobDescriptionId, interviewStage], map: "idx_candidate_screening_results_user_jd_stage")
  @@map("candidate_screening_results")
}

model CandidateActionLog {
  id                String                   @id @default(uuid())
  userId            String                   @map("user_id")
  runId             String                   @map("run_id")
  screeningResultId String                   @map("screening_result_id")
  candidateId       String                   @map("candidate_id")
  jobDescriptionId  String                   @map("job_description_id")
  platform          String
  mode              String
  action            String
  message           String?
  status            String
  idempotencyKey    String                   @map("idempotency_key")
  browserTrace      Json?                    @map("browser_trace")
  errorMessage      String?                  @map("error_message")
  createdAt         DateTime                 @default(now()) @map("created_at")
  updatedAt         DateTime                 @updatedAt @map("updated_at")
  run               CandidateScreeningRun    @relation(fields: [runId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  screeningResult   CandidateScreeningResult @relation(fields: [screeningResultId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  candidate         Candidate                @relation(fields: [candidateId], references: [id], onDelete: Cascade, onUpdate: Restrict)
  jobDescription    JobDescription           @relation(fields: [jobDescriptionId], references: [id], onDelete: Cascade, onUpdate: Restrict)

  @@unique([userId, idempotencyKey], map: "candidate_action_logs_user_idempotency_key")
  @@index([userId, jobDescriptionId, candidateId, createdAt(sort: Desc)], map: "idx_candidate_action_logs_user_jd_candidate_created")
  @@map("candidate_action_logs")
}

model CandidateTagStat {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  tagType   String   @map("tag_type")
  tag       String
  seen      Int      @default(0)
  chatted   Int      @default(0)
  replied   Int      @default(0)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Restrict)

  @@unique([userId, tagType, tag], map: "candidate_tag_stats_user_type_tag_key")
  @@map("candidate_tag_stats")
}
```

- [ ] **Step 2: Add SQL migration**

Create `prisma/migrations/20260629000000_candidate_screening/migration.sql` from the updated Prisma schema. Use Prisma to generate the SQL rather than hand-copying table definitions:

```bash
bunx prisma migrate dev --name candidate_screening --create-only
```

Expected: Prisma creates a directory named like `prisma/migrations/<timestamp>_candidate_screening`. Rename that directory to `prisma/migrations/20260629000000_candidate_screening` if the timestamp differs, keeping the generated `migration.sql` content.

After generation, inspect the migration:

```bash
rg -n "CREATE TABLE|candidate_resume_chunks|vector|candidate_screening_results_jd_candidate_key|candidate_action_logs_user_idempotency_key" prisma/migrations/20260629000000_candidate_screening/migration.sql
```

Expected: output includes all seven new `CREATE TABLE` statements, the `candidate_resume_chunks` table has an `embedding vector` column, and the named unique indexes for JD-candidate results and action idempotency exist. If `CREATE EXTENSION IF NOT EXISTS vector;` is absent, add it as the first line of the migration because `candidate_resume_chunks.embedding` uses pgvector.

- [ ] **Step 3: Validate Prisma schema**

Run:

```bash
bunx prisma validate
```

Expected: validates successfully.

- [ ] **Step 4: Generate Prisma client**

Run:

```bash
bun run prisma:generate
```

Expected: Prisma Client generated successfully.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260629000000_candidate_screening/migration.sql
git commit -m "feat: add candidate screening database schema"
```

## Task 3: Pure Domain Logic

**Files:**

- Create: `src/lib/candidate-screening/dedupe.ts`
- Create: `src/lib/candidate-screening/scoring.ts`
- Create: `src/lib/candidate-screening/ranking.ts`
- Create: `src/lib/candidate-screening/actions.ts`
- Create: `src/lib/candidate-screening/planner.ts`
- Create tests: `src/lib/candidate-screening/dedupe.test.ts`, `scoring.test.ts`, `ranking.test.ts`, `actions.test.ts`, `planner.test.ts`

- [ ] **Step 1: Write failing dedupe test**

Create `src/lib/candidate-screening/dedupe.test.ts`:

```ts
import { createCandidateIdentity, createInMemoryDedupeState } from './dedupe';

describe('candidate dedupe', () => {
  it('prefers platform id over URL and fallback fields', () => {
    const identity = createCandidateIdentity({
      sourcePlatform: 'boss-like',
      platformCandidateId: 'boss-123',
      profileUrl: 'https://example.com/c/abc',
      name: '王小明',
      company: '星河智能',
      title: '后端工程师',
    });

    expect(identity.identityKey).toBe('platform_id:boss-like:boss-123');
    expect(identity.identityHash).toHaveLength(64);
  });

  it('uses normalized profile URL when platform id is missing', () => {
    const identity = createCandidateIdentity({
      sourcePlatform: 'boss-like',
      profileUrl: 'https://example.com/c/abc?from=list',
      name: '王小明',
      company: '星河智能',
      title: '后端工程师',
    });

    expect(identity.identityKey).toBe('profile_url:boss-like:https://example.com/c/abc');
  });

  it('tracks duplicates inside one run', () => {
    const state = createInMemoryDedupeState();
    expect(state.markSeen('hash-1')).toBe(true);
    expect(state.markSeen('hash-1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run dedupe test to verify it fails**

Run:

```bash
bunx jest src/lib/candidate-screening/dedupe.test.ts --runInBand --coverage=false
```

Expected: FAIL because `dedupe.ts` does not exist.

- [ ] **Step 3: Implement dedupe**

Create `src/lib/candidate-screening/dedupe.ts`:

```ts
import { createHash } from 'node:crypto';
import type { CandidateScreeningPlatform } from './types';

type IdentityInput = {
  sourcePlatform: CandidateScreeningPlatform;
  platformCandidateId?: string | null;
  profileUrl?: string | null;
  name: string;
  company?: string | null;
  title?: string | null;
};

function clean(value?: string | null): string {
  return value?.trim().replace(/\s+/g, ' ') ?? '';
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return value.trim().replace(/[?#].*$/, '').replace(/\/$/, '');
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createCandidateIdentity(input: IdentityInput): {
  identityKey: string;
  identityHash: string;
} {
  const platformId = clean(input.platformCandidateId);
  if (platformId) {
    const identityKey = `platform_id:${input.sourcePlatform}:${platformId}`;
    return { identityKey, identityHash: sha256(identityKey) };
  }

  const profileUrl = clean(input.profileUrl);
  if (profileUrl) {
    const identityKey = `profile_url:${input.sourcePlatform}:${normalizeUrl(profileUrl)}`;
    return { identityKey, identityHash: sha256(identityKey) };
  }

  const parts = [input.sourcePlatform, clean(input.name), clean(input.company), clean(input.title)]
    .map((part) => part.toLowerCase())
    .join('|');
  const identityKey = `fallback:${parts}`;
  return { identityKey, identityHash: sha256(identityKey) };
}

export function createInMemoryDedupeState(): {
  markSeen(identityHash: string): boolean;
} {
  const seen = new Set<string>();
  return {
    markSeen(identityHash: string) {
      if (seen.has(identityHash)) return false;
      seen.add(identityHash);
      return true;
    },
  };
}
```

- [ ] **Step 4: Write scoring, ranking, action, and planner tests**

Create the tests below.

`src/lib/candidate-screening/scoring.test.ts`:

```ts
import { decideCandidateAction, scoreCandidate } from './scoring';

describe('candidate scoring', () => {
  it('computes weighted total and clamps it', () => {
    expect(scoreCandidate({ skill: 90, domain: 80, ability: 70, risk: 20, llmBonus: 5 }).total).toBe(76);
    expect(scoreCandidate({ skill: 200, domain: 100, ability: 100, risk: -50, llmBonus: 30 }).total).toBe(100);
  });

  it('maps scores to decisions', () => {
    expect(decideCandidateAction(86)).toMatchObject({ action: 'chat', priority: 'high' });
    expect(decideCandidateAction(71)).toMatchObject({ action: 'chat', priority: 'medium' });
    expect(decideCandidateAction(61)).toMatchObject({ action: 'collect', priority: 'low' });
    expect(decideCandidateAction(60)).toMatchObject({ action: 'skip', priority: 'low' });
  });
});
```

`src/lib/candidate-screening/ranking.test.ts`:

```ts
import { mergeAndRankCandidates } from './ranking';

describe('candidate ranking', () => {
  it('merges live and vector candidates by candidate id and marks both sources', () => {
    const rows = mergeAndRankCandidates({
      live: [{ candidateId: 'c1', matchScore: 80 }, { candidateId: 'c2', matchScore: 75 }],
      vector: [{ candidateId: 'c1', matchScore: 90 }, { candidateId: 'c3', matchScore: 70 }],
    });

    expect(rows.map((row) => row.candidateId)).toEqual(['c1', 'c2', 'c3']);
    expect(rows[0]).toMatchObject({ source: 'both', rank: 1 });
  });
});
```

`src/lib/candidate-screening/actions.test.ts`:

```ts
import { createActionIdempotencyKey, createDryRunActionPlan } from './actions';

describe('candidate actions', () => {
  it('creates deterministic idempotency keys', () => {
    expect(
      createActionIdempotencyKey({
        userId: 'u1',
        jobDescriptionId: 'jd1',
        candidateId: 'c1',
        platform: 'boss-like',
        action: 'chat',
      }),
    ).toBe(
      createActionIdempotencyKey({
        userId: 'u1',
        jobDescriptionId: 'jd1',
        candidateId: 'c1',
        platform: 'boss-like',
        action: 'chat',
      }),
    );
  });

  it('creates a dry-run chat message for recommended candidates', () => {
    const plan = createDryRunActionPlan({
      action: 'chat',
      priority: 'high',
      candidateName: '王小明',
      jobTitle: '高级后端工程师',
      reason: '技能匹配度高',
    });

    expect(plan.message).toContain('王小明');
    expect(plan.message).toContain('高级后端工程师');
  });
});
```

`src/lib/candidate-screening/planner.test.ts`:

```ts
import { buildScreeningPlanFromJd } from './planner';
import type { JobDescriptionDto } from '@/types';

const jd = {
  id: 'jd1',
  userId: 'u1',
  department: '技术部',
  position: '高级后端工程师',
  positionDescription: '负责 Java 微服务和高并发系统',
  tone: 'tech',
  status: 'published',
  content: {
    title: '高级后端工程师',
    summary: '负责交易链路',
    responsibilities: ['建设 Java 微服务', '优化高并发性能'],
    requirements: ['Java', 'Spring Boot', 'PostgreSQL'],
    bonus: ['消息队列'],
    highlights: ['核心系统'],
  },
  evaluation: null,
  generationMeta: null,
  createdAt: '2026-06-29T00:00:00.000Z',
  updatedAt: '2026-06-29T00:00:00.000Z',
} satisfies JobDescriptionDto;

describe('candidate screening planner', () => {
  it('builds keywords, schema and retrieval query from a JD', () => {
    const result = buildScreeningPlanFromJd(jd);
    expect(result.searchPlan.keywords).toEqual(expect.arrayContaining(['高级后端工程师', 'Java', 'Spring Boot']));
    expect(result.evaluationSchema.skills).toEqual(expect.arrayContaining(['Java', 'Spring Boot', 'PostgreSQL']));
    expect(result.searchPlan.retrievalQuery).toContain('高级后端工程师');
  });
});
```

- [ ] **Step 5: Implement pure domain files**

Create `scoring.ts`, `ranking.ts`, `actions.ts`, and `planner.ts` matching the tests. Use these exact public functions:

```ts
export function scoreCandidate(input: Omit<ScoreDetail, 'total'>): ScoreDetail;
export function decideCandidateAction(totalScore: number): CandidateActionPlan;
export function mergeAndRankCandidates(params: { live: RankInput[]; vector: RankInput[] }): RankedCandidate[];
export function createActionIdempotencyKey(input: ActionKeyInput): string;
export function createDryRunActionPlan(input: DryRunActionInput): CandidateActionPlan;
export function buildScreeningPlanFromJd(jobDescription: JobDescriptionDto): {
  searchPlan: SearchPlan;
  evaluationSchema: EvaluationSchema;
};
```

For `scoreCandidate`, clamp each numeric component to `0..100` before the formula:

```ts
total = skill * 0.4 + domain * 0.2 + ability * 0.3 - risk * 0.1 + llmBonus;
```

Clamp final total to `0..100` and round to two decimals with `Math.round(value * 100) / 100`.

- [ ] **Step 6: Run pure domain tests**

Run:

```bash
bunx jest src/lib/candidate-screening/dedupe.test.ts src/lib/candidate-screening/scoring.test.ts src/lib/candidate-screening/ranking.test.ts src/lib/candidate-screening/actions.test.ts src/lib/candidate-screening/planner.test.ts --runInBand --coverage=false
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/candidate-screening
git commit -m "feat: add candidate screening domain logic"
```

## Task 4: Repository And pgvector SQL

**Files:**

- Create: `src/lib/candidate-screening/repo.ts`
- Create test: `src/lib/candidate-screening/repo.test.ts`

- [ ] **Step 1: Write failing repository tests**

Create `src/lib/candidate-screening/repo.test.ts` with Prisma mocked like `src/lib/rag/knowledge-repo.test.ts`. Cover:

```ts
it('creates a screening run scoped to user and JD');
it('upserts candidates by user, platform, and identity hash');
it('reuses identical resume snapshots by candidate and resume hash');
it('replaces resume chunks with raw pgvector inserts inside a transaction');
it('searches candidate chunks with user, model, dimension, and contact filters');
it('upserts JD screening results by job description and candidate');
it('updates interview progress only in user and JD scope');
it('creates action logs with idempotency key');
```

Use this concrete assertion for vector search:

```ts
const sqlText = String(prismaMock.$queryRaw.mock.calls[0][0].strings.join(' '));
expect(sqlText).toContain('c.user_id =');
expect(sqlText).toContain('c.embedding_model =');
expect(sqlText).toContain('c.embedding_dimension =');
expect(sqlText).toContain('candidate.contacted = false');
expect(sqlText).toContain('ORDER BY c.embedding <=>');
```

- [ ] **Step 2: Run repository tests to verify they fail**

Run:

```bash
bunx jest src/lib/candidate-screening/repo.test.ts --runInBand --coverage=false
```

Expected: FAIL because `repo.ts` does not exist.

- [ ] **Step 3: Implement repository functions**

Create `src/lib/candidate-screening/repo.ts` with these exports:

```ts
export { vectorToPgLiteral } from '@/lib/rag/knowledge-repo';

export async function createCandidateScreeningRun(params: CreateRunParams): Promise<CandidateScreeningRunDto>;
export async function listCandidateScreeningRuns(params: { userId: string; jobDescriptionId: string; limit: number }): Promise<CandidateScreeningRunDto[]>;
export async function getCandidateScreeningRun(params: { userId: string; runId: string }): Promise<CandidateScreeningRunDto | null>;
export async function updateCandidateScreeningRun(params: UpdateRunParams): Promise<CandidateScreeningRunDto | null>;
export async function upsertCandidateWithIdentity(params: UpsertCandidateParams): Promise<CandidateDto>;
export async function findCandidateByIdentity(params: { userId: string; sourcePlatform: string; identityHash: string }): Promise<CandidateDto | null>;
export async function createOrReuseCandidateResume(params: CreateResumeParams): Promise<CandidateResumeDto>;
export async function replaceCandidateResumeChunks(params: ReplaceCandidateChunksParams): Promise<number>;
export async function searchCandidateResumeChunks(params: CandidateVectorSearchParams): Promise<CandidateVectorSearchResult[]>;
export async function upsertCandidateScreeningResult(params: UpsertScreeningResultParams): Promise<CandidateScreeningResultDto>;
export async function listCandidateScreeningResults(params: ListCandidateResultsParams): Promise<CandidateScreeningResultListItem[]>;
export async function getCandidateScreeningDetail(params: { userId: string; jobDescriptionId: string; candidateId: string }): Promise<CandidateScreeningDetailDto | null>;
export async function updateCandidateInterviewProgress(params: UpdateCandidateProgressRepoParams): Promise<CandidateScreeningResultDto | null>;
export async function createCandidateActionLog(params: CreateActionLogParams): Promise<CandidateActionLogDto>;
export async function updateCandidateActionLog(params: UpdateActionLogParams): Promise<CandidateActionLogDto | null>;
```

Use repository-local DTO mappers that convert dates to ISO strings and JSON fields to the domain JSON types. For pgvector inserts, follow the exact raw insert pattern used by `replaceKnowledgeDocumentChunks`, changing table and columns:

```ts
await tx.$executeRaw`
  INSERT INTO "public"."candidate_resume_chunks"
    ("id", "user_id", "candidate_id", "resume_id", "chunk_index", "content", "token_estimate",
     "embedding_model", "embedding_dimension", "embedding", "created_at")
  VALUES
    (${id}, ${params.userId}, ${params.candidateId}, ${params.resumeId}, ${chunk.chunkIndex},
     ${chunk.content}, ${chunk.tokenEstimate ?? null}, ${params.embeddingModel},
     ${chunk.embedding.length}, ${vectorLiteral}::vector, CURRENT_TIMESTAMP)
`;
```

Vector search must join `candidate_resume_chunks c`, `candidate_resumes r`, and `candidates candidate`, filter by user, model, dimension, and optionally exclude contacted candidates:

```sql
AND (${params.allowAlreadyContacted} = true OR candidate.contacted = false)
```

- [ ] **Step 4: Run repository tests**

Run:

```bash
bunx jest src/lib/candidate-screening/repo.test.ts --runInBand --coverage=false
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/candidate-screening/repo.ts src/lib/candidate-screening/repo.test.ts
git commit -m "feat: add candidate screening repository"
```

## Task 5: Resume Ingest And Vector Recall

**Files:**

- Create: `src/lib/candidate-screening/ingest.ts`
- Create: `src/lib/candidate-screening/recall.ts`
- Create tests: `src/lib/candidate-screening/ingest.test.ts`, `src/lib/candidate-screening/recall.test.ts`

- [ ] **Step 1: Write failing ingest test**

Create `ingest.test.ts` with mocks for `embedDocuments`, `splitMarkdownToChunks`, and repo functions:

```ts
it('upserts candidate, stores resume snapshot, embeds chunks, and writes vectors');
it('rejects empty resume text before calling embeddings');
it('rejects mismatched embedding counts');
it('returns existing resume when raw text hash is unchanged');
```

The first test must assert:

```ts
expect(upsertCandidateWithIdentityMock).toHaveBeenCalledWith(expect.objectContaining({
  userId: 'u1',
  sourcePlatform: 'boss-like',
  displayName: '王小明',
}));
expect(replaceCandidateResumeChunksMock).toHaveBeenCalledWith(expect.objectContaining({
  embeddingModel: 'text-embedding-3-small',
  chunks: [
    expect.objectContaining({ chunkIndex: 0, content: 'Java Spring Boot' }),
  ],
}));
```

- [ ] **Step 2: Write failing recall test**

Create `recall.test.ts`:

```ts
it('embeds the JD retrieval query and searches candidate resume chunks');
it('returns empty results when retrieval query is blank');
it('passes allowAlreadyContacted to repository search');
```

- [ ] **Step 3: Run ingest and recall tests to verify they fail**

Run:

```bash
bunx jest src/lib/candidate-screening/ingest.test.ts src/lib/candidate-screening/recall.test.ts --runInBand --coverage=false
```

Expected: FAIL because `ingest.ts` and `recall.ts` do not exist.

- [ ] **Step 4: Implement ingest**

Create `src/lib/candidate-screening/ingest.ts`:

```ts
import { createHash, randomUUID } from 'node:crypto';
import { env } from '@/lib/env';
import { embedDocuments } from '@/lib/rag/embed';
import { splitMarkdownToChunks } from '@/lib/rag/markdown';
import { createCandidateIdentity } from './dedupe';
import {
  createOrReuseCandidateResume,
  replaceCandidateResumeChunks,
  upsertCandidateWithIdentity,
} from './repo';
import type { CandidateScreeningPlatform } from './types';

export type RawCandidate = {
  platformCandidateId?: string | null;
  name: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  experienceYears?: number | null;
  resumeText: string;
  profileUrl?: string | null;
  lastActiveAt?: string | null;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function ingestRawCandidate(params: {
  userId: string;
  sourcePlatform: CandidateScreeningPlatform;
  rawCandidate: RawCandidate;
}): Promise<{ candidateId: string; resumeId: string; identityHash: string; chunkCount: number }> {
  const resumeText = params.rawCandidate.resumeText.trim();
  if (!resumeText) throw new Error('resume text must not be empty');
  const identity = createCandidateIdentity({
    sourcePlatform: params.sourcePlatform,
    platformCandidateId: params.rawCandidate.platformCandidateId,
    profileUrl: params.rawCandidate.profileUrl,
    name: params.rawCandidate.name,
    company: params.rawCandidate.company,
    title: params.rawCandidate.title,
  });
  const candidate = await upsertCandidateWithIdentity({
    userId: params.userId,
    sourcePlatform: params.sourcePlatform,
    displayName: params.rawCandidate.name,
    currentTitle: params.rawCandidate.title ?? null,
    currentCompany: params.rawCandidate.company ?? null,
    location: params.rawCandidate.location ?? null,
    experienceYears: params.rawCandidate.experienceYears ?? null,
    platformCandidateId: params.rawCandidate.platformCandidateId ?? null,
    profileUrl: params.rawCandidate.profileUrl ?? null,
    identityKey: identity.identityKey,
    identityHash: identity.identityHash,
    lastActiveAt: params.rawCandidate.lastActiveAt ? new Date(params.rawCandidate.lastActiveAt) : null,
  });
  const resume = await createOrReuseCandidateResume({
    userId: params.userId,
    candidateId: candidate.id,
    sourcePlatform: params.sourcePlatform,
    profileUrl: params.rawCandidate.profileUrl ?? null,
    rawText: resumeText,
    structuredSummary: null,
    resumeHash: sha256(resumeText),
    fetchedAt: new Date(),
  });
  const chunks = await splitMarkdownToChunks(resumeText);
  if (chunks.length === 0) throw new Error('resume produced no indexable chunks');
  const embeddings = await embedDocuments(chunks.map((chunk) => chunk.content));
  if (embeddings.length !== chunks.length) throw new Error('embedding count does not match resume chunks');
  await replaceCandidateResumeChunks({
    userId: params.userId,
    candidateId: candidate.id,
    resumeId: resume.id,
    embeddingModel: env.OPENAI_EMBEDDING_MODEL,
    chunks: chunks.map((chunk, index) => ({
      id: randomUUID(),
      chunkIndex: chunk.index,
      content: chunk.content,
      tokenEstimate: null,
      embedding: embeddings[index] ?? [],
    })),
  });
  return { candidateId: candidate.id, resumeId: resume.id, identityHash: identity.identityHash, chunkCount: chunks.length };
}
```

- [ ] **Step 5: Implement recall**

Create `src/lib/candidate-screening/recall.ts`:

```ts
import { env } from '@/lib/env';
import { embedQuery } from '@/lib/rag/embed';
import { searchCandidateResumeChunks } from './repo';

export async function recallCandidatesForJd(params: {
  userId: string;
  retrievalQuery: string;
  topK: number;
  allowAlreadyContacted: boolean;
}) {
  const query = params.retrievalQuery.trim();
  if (!query || params.topK <= 0) return [];
  const queryVector = await embedQuery(query);
  return searchCandidateResumeChunks({
    userId: params.userId,
    queryVector,
    embeddingModel: env.OPENAI_EMBEDDING_MODEL,
    topK: params.topK,
    allowAlreadyContacted: params.allowAlreadyContacted,
  });
}
```

- [ ] **Step 6: Run ingest and recall tests**

Run:

```bash
bunx jest src/lib/candidate-screening/ingest.test.ts src/lib/candidate-screening/recall.test.ts --runInBand --coverage=false
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/candidate-screening/ingest.ts src/lib/candidate-screening/recall.ts src/lib/candidate-screening/ingest.test.ts src/lib/candidate-screening/recall.test.ts
git commit -m "feat: ingest and recall candidate resumes"
```

## Task 6: Candidate Evaluation Seam

**Files:**

- Create: `src/lib/candidate-screening/llm.ts`
- Create: `src/lib/candidate-screening/evaluation.ts`
- Create tests: `src/lib/candidate-screening/evaluation.test.ts`, `src/lib/candidate-screening/llm.test.ts`

- [ ] **Step 1: Write failing evaluation tests**

Create tests asserting:

```ts
it('uses LLM tags and score components to produce a decision');
it('falls back to rule-based tags when LLM is unavailable');
it('validates malformed LLM output and records risk');
```

Use an injected LLM function:

```ts
const result = await evaluateCandidateForJd({
  jobTitle: '高级后端工程师',
  evaluationSchema,
  resumeText: 'Java Spring Boot 高并发',
  candidateName: '王小明',
  runLLM: async () => ({
    tags: { skills: ['Java'], domainKnowledge: [], generalAbility: ['owner'], risk: [], activity: [], custom: [] },
    score: { skill: 90, domain: 70, ability: 80, risk: 10, llmBonus: 5 },
    reason: 'Java 和高并发匹配',
  }),
});
expect(result.decision.action).toBe('chat');
expect(result.tags.skills).toContain('Java');
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
bunx jest src/lib/candidate-screening/evaluation.test.ts src/lib/candidate-screening/llm.test.ts --runInBand --coverage=false
```

Expected: FAIL because files do not exist.

- [ ] **Step 3: Implement LLM client**

Create `llm.ts` with:

```ts
import { z } from 'zod';
import { env } from '@/lib/env';
import type { CandidateTags, EvaluationSchema, ScoreDetail } from './types';

const candidateEvaluationSchema = z.object({
  tags: z.object({
    skills: z.array(z.string()),
    domainKnowledge: z.array(z.string()),
    generalAbility: z.array(z.string()),
    risk: z.array(z.string()),
    activity: z.array(z.string()),
    custom: z.array(z.string()),
  }),
  score: z.object({
    skill: z.number(),
    domain: z.number(),
    ability: z.number(),
    risk: z.number(),
    llmBonus: z.number(),
  }),
  reason: z.string(),
});

export type CandidateEvaluationLlmOutput = {
  tags: CandidateTags;
  score: Omit<ScoreDetail, 'total'>;
  reason: string;
};

export async function runCandidateEvaluationLLM(params: {
  jobTitle: string;
  evaluationSchema: EvaluationSchema;
  resumeText: string;
  candidateName: string;
}): Promise<CandidateEvaluationLlmOutput> {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.JD_LLM_TIMEOUT_MS);
  try {
    const response = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        ...(env.OPENAI_JSON_MODE ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          {
            role: 'system',
            content:
              'You evaluate recruiting candidates. Return strict JSON with tags, score, and reason.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              jobTitle: params.jobTitle,
              evaluationSchema: params.evaluationSchema,
              candidateName: params.candidateName,
              resumeText: params.resumeText.slice(0, 12000),
            }),
          },
        ],
      }),
      signal: controller.signal,
    });
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(payload.error?.message ?? `Candidate evaluation HTTP ${response.status}`);
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Candidate evaluation returned empty content');
    return candidateEvaluationSchema.parse(JSON.parse(content));
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 4: Implement evaluation orchestration**

Create `evaluation.ts`:

```ts
import { decideCandidateAction, scoreCandidate } from './scoring';
import { runCandidateEvaluationLLM, type CandidateEvaluationLlmOutput } from './llm';

type RunCandidateLLM = typeof runCandidateEvaluationLLM;

export async function evaluateCandidateForJd(params: {
  jobTitle: string;
  evaluationSchema: EvaluationSchema;
  resumeText: string;
  candidateName: string;
  runLLM?: RunCandidateLLM;
}) {
  const runLLM = params.runLLM ?? runCandidateEvaluationLLM;
  let output: CandidateEvaluationLlmOutput;
  try {
    output = await runLLM(params);
  } catch (error) {
    const skillTags = params.evaluationSchema.skills.filter((skill) =>
      params.resumeText.toLowerCase().includes(skill.toLowerCase()),
    );
    output = {
      tags: {
        skills: skillTags,
        domainKnowledge: [],
        generalAbility: [],
        risk: ['llm_evaluation_unavailable'],
        activity: [],
        custom: [],
      },
      score: { skill: skillTags.length > 0 ? 65 : 40, domain: 50, ability: 50, risk: 30, llmBonus: 0 },
      reason: error instanceof Error ? `LLM 评估失败，已使用规则兜底：${error.message}` : 'LLM 评估失败，已使用规则兜底',
    };
  }
  const score = scoreCandidate(output.score);
  const decision = decideCandidateAction(score.total);
  return { tags: output.tags, score, decision: { ...decision, reason: output.reason } };
}
```

- [ ] **Step 5: Run evaluation tests**

Run:

```bash
bunx jest src/lib/candidate-screening/evaluation.test.ts src/lib/candidate-screening/llm.test.ts --runInBand --coverage=false
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/candidate-screening/llm.ts src/lib/candidate-screening/evaluation.ts src/lib/candidate-screening/evaluation.test.ts src/lib/candidate-screening/llm.test.ts
git commit -m "feat: evaluate candidate fit for a JD"
```

## Task 7: Boss-like Candidate Source Adapter

**Files:**

- Create: `src/lib/candidate-screening/adapters/types.ts`
- Create: `src/lib/candidate-screening/adapters/boss-like.ts`
- Create: `src/lib/candidate-screening/adapters/factory.ts`
- Create tests: `src/lib/candidate-screening/adapters/boss-like.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Use a fake `BrowserExecutor` and assert:

```ts
it('logs in and opens the resume list page');
it('extracts candidate cards from a structured resume list snapshot');
it('opens detail pages when list cards have short resume text');
it('executes collect and chat only through explicit adapter methods');
it('requires boss-like env config outside local runtimes');
```

Use a simple page HTML fixture containing:

```html
<article data-candidate-id="boss-1" data-profile-url="/employer/resumes/boss-1">
  <h2>王小明</h2>
  <p data-field="title">高级后端工程师</p>
  <p data-field="company">星河智能</p>
  <p data-field="experience">5年</p>
  <p data-field="resume">Java Spring Boot 高并发 微服务</p>
  <button>收藏</button>
  <button>打招呼</button>
</article>
```

- [ ] **Step 2: Run adapter tests to verify they fail**

Run:

```bash
bunx jest src/lib/candidate-screening/adapters/boss-like.test.ts --runInBand --coverage=false
```

Expected: FAIL because adapter files do not exist.

- [ ] **Step 3: Define adapter interface**

Create `adapters/types.ts`:

```ts
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
  chatCandidate(candidate: StoredCandidateRef, plan: CandidateActionPlan): Promise<ActionExecutionResult>;
  close?(): Promise<void>;
};
```

- [ ] **Step 4: Implement boss-like adapter**

Create `boss-like.ts`. Reuse config behavior from `src/lib/jd-publishing/service.ts`:

```ts
const DEFAULT_BOSS_LIKE_BASE_URL = 'http://localhost:6183';
const DEFAULT_BOSS_LIKE_USERNAME = 'admin';
const DEFAULT_BOSS_LIKE_PASSWORD = 'boss123';
```

Methods:

- `loginIfNeeded()` navigates to `/employer/resumes`; if snapshot or URL indicates login, fill username/password and wait for `/employer/resumes`.
- `searchCandidates()` navigates to resume list, fills a search field with each keyword, waits for visible resume content, extracts candidate cards from `snapshot()` HTML, yields batches of `batchSize`.
- `collectCandidate()` opens profile URL when present and clicks the `收藏` button.
- `chatCandidate()` opens profile URL, clicks `打招呼`, fills the message field, and submits.

Keep extraction deterministic for the first version:

```ts
export function extractBossLikeCandidatesFromHtml(html: string): RawCandidate[] {
  return Array.from(html.matchAll(/<article\b([\s\S]*?)<\/article>/gi)).map((match) => {
    const article = match[0];
    const attrs = match[1] ?? '';
    const readAttr = (name: string) =>
      attrs.match(new RegExp(`${name}="([^"]+)"`, 'i'))?.[1]?.trim() ?? null;
    const readTag = (tag: string) =>
      article.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
    const readField = (field: string) =>
      article
        .match(new RegExp(`<[^>]+data-field="${field}"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'))?.[1]
        ?.replace(/<[^>]+>/g, '')
        .trim() ?? '';
    const experienceText = readField('experience');
    const years = Number(experienceText.match(/\d+(?:\.\d+)?/)?.[0] ?? Number.NaN);
    return {
      platformCandidateId: readAttr('data-candidate-id'),
      profileUrl: readAttr('data-profile-url'),
      name: readTag('h2'),
      title: readField('title'),
      company: readField('company'),
      experienceYears: Number.isFinite(years) ? years : null,
      resumeText: readField('resume'),
    };
  });
}
```

Use structured Playwright methods when running against real pages, but tests may call the extraction helper directly.

- [ ] **Step 5: Implement adapter factory**

Create `factory.ts`:

```ts
import { createBrowserExecutorFromEnv } from '@/lib/jd-publishing/executors/browser-executor-factory';
import { BossLikeCandidateSourceAdapter } from './boss-like';
import type { CandidateSourceAdapter } from './types';
import type { CandidateScreeningPlatform } from '../types';

export function createCandidateSourceAdapter(platform: CandidateScreeningPlatform): CandidateSourceAdapter {
  if (platform !== 'boss-like') throw new Error(`unsupported candidate source platform: ${platform}`);
  return new BossLikeCandidateSourceAdapter({ executor: createBrowserExecutorFromEnv() });
}
```

- [ ] **Step 6: Run adapter tests**

Run:

```bash
bunx jest src/lib/candidate-screening/adapters/boss-like.test.ts --runInBand --coverage=false
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/candidate-screening/adapters
git commit -m "feat: add boss-like candidate source adapter"
```

## Task 8: Screening Runner And Service

**Files:**

- Create: `src/lib/candidate-screening/runner.ts`
- Create: `src/lib/candidate-screening/service.ts`
- Create tests: `src/lib/candidate-screening/runner.test.ts`, `src/lib/candidate-screening/service.test.ts`

- [ ] **Step 1: Write failing runner tests**

Write tests with all dependencies injected:

```ts
it('advances a dry-run through planning, live search, ingest, vector recall, evaluation, ranking, and action planning');
it('records failed status and error message when adapter search fails');
it('skips duplicate candidates inside the same run');
it('executes planned actions only through executeScreeningRunActions');
it('updates contacted state after successful chat action');
```

The success test must assert stage order:

```ts
expect(updateRunMock.mock.calls.map((call) => call[0].currentStage).filter(Boolean)).toEqual([
  'planning',
  'searching_live',
  'ingesting_live',
  'recalling_vectors',
  'evaluating',
  'ranking',
  'planning_actions',
  'finalizing',
]);
```

- [ ] **Step 2: Run runner tests to verify they fail**

Run:

```bash
bunx jest src/lib/candidate-screening/runner.test.ts src/lib/candidate-screening/service.test.ts --runInBand --coverage=false
```

Expected: FAIL because runner and service do not exist.

- [ ] **Step 3: Implement runner**

Create `runner.ts` with injected dependencies:

```ts
export type ScreeningRunnerDependencies = {
  buildPlan: typeof buildScreeningPlanFromJd;
  createAdapter: typeof createCandidateSourceAdapter;
  ingestCandidate: typeof ingestRawCandidate;
  recallCandidates: typeof recallCandidatesForJd;
  evaluateCandidate: typeof evaluateCandidateForJd;
  mergeAndRank: typeof mergeAndRankCandidates;
  repo: {
    getRun: typeof getCandidateScreeningRun;
    updateRun: typeof updateCandidateScreeningRun;
    upsertResult: typeof upsertCandidateScreeningResult;
    createActionLog: typeof createCandidateActionLog;
  };
};

export async function runCandidateScreening(params: {
  runId: string;
  userId: string;
  jobDescription: JobDescriptionDto;
  request: CreateScreeningRunRequest;
  dependencies?: Partial<ScreeningRunnerDependencies>;
}): Promise<void>;

export async function executeScreeningRunActions(params: {
  runId: string;
  userId: string;
  request: ExecuteActionsRequest;
  dependencies?: Partial<ScreeningRunnerDependencies>;
}): Promise<void>;
```

Runner behavior:

- Mark run `running`, stage `planning`, and `startedAt`.
- Build plan and save `searchPlan` and `evaluationSchema`.
- Iterate `adapter.searchCandidates`.
- Use `createInMemoryDedupeState` to skip same-run duplicates.
- Ingest live candidates and add them to live rank inputs.
- Recall vector candidates and add them to vector rank inputs.
- Merge and rank.
- Evaluate each candidate and upsert JD screening result.
- Create planned action logs with `mode = dry_run`, `status = planned`.
- Mark run `success`, stage `finalizing`, and `finishedAt`.
- On error, mark run `failed` with `errorMessage`.

- [ ] **Step 4: Implement service**

Create `service.ts`:

```ts
export async function createAndStartCandidateScreeningRun(params: {
  userId: string;
  jobDescription: JobDescriptionDto;
  request: CreateScreeningRunRequest;
}): Promise<CandidateScreeningRunDto> {
  const run = await createCandidateScreeningRun({
    userId: params.userId,
    jobDescriptionId: params.jobDescription.id,
    platform: params.request.platform,
    mode: params.request.mode,
    status: 'pending',
    stats: createEmptyStats(),
  });
  void runCandidateScreening({
    runId: run.id,
    userId: params.userId,
    jobDescription: params.jobDescription,
    request: params.request,
  });
  return run;
}
```

In tests, mock `runCandidateScreening` and assert it is scheduled after run creation.

- [ ] **Step 5: Run runner and service tests**

Run:

```bash
bunx jest src/lib/candidate-screening/runner.test.ts src/lib/candidate-screening/service.test.ts --runInBand --coverage=false
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/candidate-screening/runner.ts src/lib/candidate-screening/service.ts src/lib/candidate-screening/runner.test.ts src/lib/candidate-screening/service.test.ts
git commit -m "feat: orchestrate candidate screening runs"
```

## Task 9: API Routes

**Files:**

- Create: `src/app/api/jd/[id]/candidate-screening/runs/route.ts`
- Create: `src/app/api/candidate-screening/runs/[runId]/route.ts`
- Create: `src/app/api/candidate-screening/runs/[runId]/stream/route.ts`
- Create: `src/app/api/candidate-screening/runs/[runId]/execute-actions/route.ts`
- Create: `src/app/api/jd/[id]/candidates/route.ts`
- Create: `src/app/api/jd/[id]/candidates/[candidateId]/route.ts`
- Create tests: `tests/unit/api/candidate-screening-routes.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `tests/unit/api/candidate-screening-routes.test.ts`. Mock `requireAuth`, `getJobDescriptionById`, and candidate-screening service/repo functions. Cover:

```ts
it('creates a screening run for an owned published JD');
it('rejects screening when JD does not exist');
it('lists runs scoped to the current user and JD');
it('returns run progress by run id');
it('requires confirmExecution for execute-actions');
it('lists JD candidates with filters');
it('returns JD candidate detail');
it('updates interview progress and notes');
it('rejects invalid interview stage');
```

Use the same `NextResponse` mock style as `tests/unit/api/jd-routes.test.ts`.

- [ ] **Step 2: Run route tests to verify they fail**

Run:

```bash
bunx jest tests/unit/api/candidate-screening-routes.test.ts --runInBand --coverage=false
```

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Implement create/list run route**

Create `src/app/api/jd/[id]/candidate-screening/runs/route.ts`:

```ts
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  const { id } = await context.params;
  const parsed = parseCreateScreeningRunPayload(await request.json());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const jobDescription = await getJobDescriptionById(auth.user.id, id);
  if (!jobDescription) return NextResponse.json({ error: 'job description not found' }, { status: 404 });
  if (!['published', 'ready_to_publish'].includes(jobDescription.status)) {
    return NextResponse.json({ error: 'job description is not eligible for screening' }, { status: 409 });
  }
  const run = await createAndStartCandidateScreeningRun({ userId: auth.user.id, jobDescription, request: parsed.value });
  return NextResponse.json({ run }, { status: 202 });
}
```

Also implement `GET` with `listCandidateScreeningRuns({ userId, jobDescriptionId, limit: 10 })`.

- [ ] **Step 4: Implement run, stream, execute, candidate list, and detail routes**

Create:

- `src/app/api/candidate-screening/runs/[runId]/route.ts`
- `src/app/api/candidate-screening/runs/[runId]/stream/route.ts`
- `src/app/api/candidate-screening/runs/[runId]/execute-actions/route.ts`
- `src/app/api/jd/[id]/candidates/route.ts`
- `src/app/api/jd/[id]/candidates/[candidateId]/route.ts`

All routes must:

- Call `requireAuth()`.
- Scope queries by `auth.user.id`.
- Return `400` for parser errors.
- Return `404` for missing scoped resources.
- Use `NextResponse.json({ error: message }, { status })` for errors.

The stream route can poll the run every second for up to 30 seconds:

```ts
return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  },
});
```

Emit JSON lines as `data: ${JSON.stringify({ run })}\n\n`.

- [ ] **Step 5: Run route tests**

Run:

```bash
bunx jest tests/unit/api/candidate-screening-routes.test.ts --runInBand --coverage=false
```

Expected: all route tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api tests/unit/api/candidate-screening-routes.test.ts
git commit -m "feat: add candidate screening API routes"
```

## Task 10: UI And Client Integration

**Files:**

- Create: `src/lib/candidate-screening/client.ts`
- Create: `src/components/candidate-screening/run-progress.tsx`
- Create: `src/components/candidate-screening/candidate-list.tsx`
- Create: `src/components/candidate-screening/candidate-detail.tsx`
- Create: `src/app/jd-generator/[id]/candidates/page.tsx`
- Create: `src/app/jd-generator/[id]/candidates/[candidateId]/page.tsx`
- Modify: `src/components/jd-generator/jd-pages.tsx`
- Create tests: `tests/unit/components/CandidateScreening.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Create `tests/unit/components/CandidateScreening.test.tsx` with fetch mocks. Cover:

```ts
it('JD detail shows screening button and screened candidates link when published');
it('starts a dry-run screening run and shows the run id');
it('candidate list renders score, decision, source, action status, and interview stage');
it('candidate detail renders resume text and score reason');
it('candidate detail updates interview stage');
```

- [ ] **Step 2: Run UI tests to verify they fail**

Run:

```bash
bunx jest tests/unit/components/CandidateScreening.test.tsx --runInBand --coverage=false
```

Expected: FAIL because components and client functions do not exist.

- [ ] **Step 3: Implement browser client**

Create `src/lib/candidate-screening/client.ts` with fetch helpers:

```ts
export async function createCandidateScreeningRun(jobDescriptionId: string, payload: Partial<CreateScreeningRunRequest>);
export async function fetchCandidateScreeningRuns(jobDescriptionId: string);
export async function fetchCandidateScreeningRun(runId: string);
export async function executeCandidateScreeningActions(runId: string, payload: ExecuteActionsRequest);
export async function fetchJdCandidates(jobDescriptionId: string, filters?: CandidateListFilters);
export async function fetchJdCandidateDetail(jobDescriptionId: string, candidateId: string);
export async function updateJdCandidateProgress(jobDescriptionId: string, candidateId: string, payload: UpdateCandidateProgressRequest);
```

Use the same `readJson` pattern from `src/lib/jd/client.ts`.

- [ ] **Step 4: Implement JD entry points**

Modify `src/components/jd-generator/jd-pages.tsx` in `JDDetailView`:

- Add state for latest screening run.
- Add a `筛选候选人` button beside publish actions when status is `published` or `ready_to_publish`.
- Add a link to `/jd-generator/${jobDescription.id}/candidates`.
- On click, call `createCandidateScreeningRun(jobDescription.id, { platform: 'boss-like' })`.
- Show the created run id and a link to the candidate results page.

The visible copy:

```tsx
<Button type="button" color="primary" onClick={() => void handleStartScreening()}>
  筛选候选人
</Button>
<Button as={Link} href={`/jd-generator/${jobDescription.id}/candidates`} variant="bordered">
  已筛选候选人
</Button>
```

- [ ] **Step 5: Implement run progress, candidate list, and detail components**

Create components with dense workbench layout:

- `RunProgress` props: `{ runId: string }`; poll every 1500ms until terminal status.
- `CandidateList` props: `{ jobDescriptionId: string }`; filters decision, interview stage, source, min score.
- `CandidateDetail` props: `{ jobDescriptionId: string; candidateId: string }`; show resume and update stage.

Use `Button`, `Card`, `CardBody`, `Chip`, `Input` from `src/components/ui`.

- [ ] **Step 6: Implement app pages**

Create:

```tsx
// src/app/jd-generator/[id]/candidates/page.tsx
import { CandidateList } from '@/components/candidate-screening/candidate-list';
import { getServerAuthSession } from '@/lib/auth/session';

export default async function JDCandidatesPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  const { id } = await params;
  if (!session?.user) return <section className="container mx-auto px-4 py-8">请先登录后继续</section>;
  return <CandidateList jobDescriptionId={id} />;
}
```

Create detail page with `CandidateDetail`.

- [ ] **Step 7: Run UI tests**

Run:

```bash
bunx jest tests/unit/components/CandidateScreening.test.tsx --runInBand --coverage=false
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/candidate-screening/client.ts src/components/candidate-screening src/app/jd-generator src/components/jd-generator/jd-pages.tsx tests/unit/components/CandidateScreening.test.tsx
git commit -m "feat: add candidate screening UI"
```

## Task 11: Integration And End-To-End Coverage

**Files:**

- Create: `tests/integration/candidate-screening/screening-flow.e2e.test.ts`
- Create: `tests/e2e-playwright/candidate-screening.spec.ts`

- [ ] **Step 1: Write failing integration test**

Create a local boss-like HTML server with `/employer/login`, `/employer/resumes`, `/employer/resumes/:id`, and UI buttons for collect/chat. Seed a user and published JD in PostgreSQL. Mock OpenAI embedding and LLM fetch responses if the test environment does not provide keys.

Assert:

```ts
expect(run.status).toBe('success');
expect(candidates).toHaveLength(2);
expect(results[0].jobDescriptionId).toBe(jd.id);
expect(chunks.length).toBeGreaterThan(0);
expect(actionLogs.every((log) => log.mode === 'dry_run')).toBe(true);
```

- [ ] **Step 2: Run integration test to verify it fails**

Run:

```bash
bunx jest tests/integration/candidate-screening/screening-flow.e2e.test.ts --runInBand --coverage=false
```

Expected: FAIL because `tests/integration/candidate-screening/screening-flow.e2e.test.ts` calls routes and runner behavior before the integration fixture is wired.

- [ ] **Step 3: Make integration test pass**

Use real PostgreSQL and pgvector through Prisma. Use deterministic fixture HTML and mocked fetch for embeddings/LLM. Ensure cleanup deletes rows from:

```ts
candidateActionLog
candidateScreeningResult
candidateScreeningRun
candidateResumeChunk
candidateResume
candidate
jobDescription
user
```

- [ ] **Step 4: Write Playwright UI test**

Create `tests/e2e-playwright/candidate-screening.spec.ts`:

```ts
test('published JD links to candidate screening results', async ({ page }) => {
  await page.route('**/api/jd/jd-screening-1', async (route) => {
    await route.fulfill({
      json: {
        jobDescription: {
          id: 'jd-screening-1',
          userId: 'u1',
          department: '技术部',
          position: '高级后端工程师',
          positionDescription: '负责 Java 微服务',
          tone: 'tech',
          status: 'published',
          content: {
            title: '高级后端工程师',
            summary: '负责核心系统',
            responsibilities: ['建设 Java 微服务'],
            requirements: ['Java'],
            bonus: [],
            highlights: [],
          },
          evaluation: null,
          generationMeta: null,
          createdAt: '2026-06-29T00:00:00.000Z',
          updatedAt: '2026-06-29T00:00:00.000Z',
        },
      },
    });
  });
  await page.route('**/api/jd/jd-screening-1/publish', async (route) => {
    await route.fulfill({ json: { tasks: [] } });
  });
  await page.route('**/api/jd/jd-screening-1/candidate-screening/runs', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 202, json: { run: { id: 'run-1', status: 'pending', mode: 'dry_run' } } });
      return;
    }
    await route.fulfill({ json: { runs: [] } });
  });
  await page.goto('/jd-generator/jd-screening-1');
  await expect(page.getByRole('button', { name: '筛选候选人' })).toBeVisible();
  await expect(page.getByRole('link', { name: '已筛选候选人' })).toBeVisible();
});
```

If direct DB seeding is needed, follow existing `tests/e2e-playwright/load-repo-env.ts` patterns.

- [ ] **Step 5: Run targeted verification**

Run:

```bash
bunx jest src/lib/candidate-screening --runInBand --coverage=false
bunx jest tests/unit/api/candidate-screening-routes.test.ts tests/unit/components/CandidateScreening.test.tsx --runInBand --coverage=false
bunx jest tests/integration/candidate-screening/screening-flow.e2e.test.ts --runInBand --coverage=false
bun run type-check
bun run lint
```

Expected: all commands pass. If integration dependencies are missing, record the exact missing dependency and the command output.

- [ ] **Step 6: Commit**

```bash
git add tests/integration/candidate-screening tests/e2e-playwright package.json
git commit -m "test: cover candidate screening flow"
```

## Final Verification

After all tasks are complete, run:

```bash
bunx prisma validate
bun run prisma:generate
bun run type-check
bun run lint
bunx jest src/lib/candidate-screening tests/unit/api/candidate-screening-routes.test.ts tests/unit/components/CandidateScreening.test.tsx --runInBand --coverage=false
bun run test:ci
```

If PostgreSQL and boss-like fixtures are available, also run:

```bash
bunx jest tests/integration/candidate-screening/screening-flow.e2e.test.ts --runInBand --coverage=false
bun run test:e2e:playwright
```

Before claiming completion, inspect:

```bash
git status --short
git log --oneline -12
```

Confirm only intended files changed and every task commit is present.

## Self-Review Notes

- Spec coverage: the plan covers published JD entry, boss-like adapter, candidate persistence, pgvector chunks, live plus vector recall, AI evaluation, dry-run default, explicit execution actions, JD-candidate results, action logs, interview progress, API routes, UI pages, and tests.
- Scope boundary: the first implementation keeps platform scope to boss-like and vector storage to PostgreSQL pgvector.
- Execution boundary: automatic chat/collect is isolated behind `execute-actions` and requires `confirmExecution: true`.
- Progress boundary: polling and SSE route are both planned; UI can use polling first and stream later without changing persisted run state.
