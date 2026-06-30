# Candidate Screening Design

Date: 2026-06-29

Status: Approved for implementation planning

## Summary

Candidate screening starts from a published JD. The user clicks a screening action on the JD detail page, the system creates an asynchronous screening run, searches the configured recruiting site, stores candidate resumes, indexes resume chunks in PostgreSQL pgvector, recalls historical candidates, evaluates each candidate with AI, ranks the results, and creates an action plan.

The first version implements the `boss-like` recruiting site only, behind a platform adapter interface. PostgreSQL is the system of record for candidates and JD-specific screening results. pgvector is the vector store for candidate resume recall. Real browser actions are dry-run by default; users must explicitly switch a run into execution mode before chat or collect actions are performed on the recruiting site.

## Approved Decisions

- Entry point: a published JD has a `筛选候选人` button and an `已筛选候选人` link.
- Platform scope: implement `boss-like` first, using a platform adapter boundary for future sites.
- Vector store: use PostgreSQL pgvector for candidate resume chunks.
- Recall strategy: combine live `boss-like` resume search with local vector recall from existing candidates.
- Execution shape: create asynchronous screening runs, with progress shown by polling or SSE.
- Action safety: default to dry-run action plans; real chat and collect require explicit execution mode.
- JD relationship: candidates are global user assets, while screening conclusions and interview progress are stored per JD.
- Interview progress: first version uses app-managed manual progress, with browser actions updating only states they can confirm.

## Goals

- Let recruiters screen candidates from an already published JD.
- Persist candidate profiles and resume snapshots for reuse across multiple JDs.
- Index resumes into pgvector so historical candidates can be recalled without relying only on external platform search.
- Store per-JD candidate tags, scores, rankings, decisions, action plans, and interview stages.
- Show recruiters the candidate resume, AI reasoning, action logs, and current interview progress.
- Keep automatic browser actions observable and idempotent.

## Non-Goals

- Multiple recruiting platforms in the first version.
- Automatic synchronization of all boss-like interview pipeline states.
- Qdrant support for candidate vectors.
- Fully autonomous real outreach without user switching into execution mode.
- Complex reply-probability tuning. Tag statistics are collected first and can influence ranking later.

## User Flows

### Start Screening

1. The recruiter opens a JD detail page.
2. If the JD has been published or is otherwise eligible for screening, the page shows `筛选候选人`.
3. Clicking the button creates a `candidate_screening_runs` row with `mode = dry_run`.
4. The UI navigates to the run progress view or opens the JD candidate results view with the active run pinned.
5. The run progresses through planning, live search, candidate ingest, vector recall, AI evaluation, ranking, and action planning.

### Review Results

1. The recruiter opens `已筛选候选人` from the JD detail page.
2. The page lists candidates linked to this JD.
3. Each row shows candidate identity, company/title, experience, source, score, decision, action status, and interview stage.
4. Filters support decision, interview stage, source, and score range.
5. Opening a candidate shows resume text, tags, scoring details, decision reason, action logs, and notes.

### Execute Actions

1. A completed dry-run contains planned actions such as `chat`, `collect`, or `skip`.
2. The recruiter explicitly chooses execution mode for a run.
3. The system executes eligible actions through the `boss-like` adapter.
4. Each action writes a `candidate_action_logs` row with an idempotency key.
5. Successful collect or chat updates the JD-specific result and the candidate contact summary.

### Maintain Interview Progress

1. The recruiter edits interview stage from the JD candidate detail page.
2. Supported stages are app-managed and scoped to the JD-candidate relationship.
3. Browser actions may advance the stage to `contacted` or `collected` when confirmed.
4. Later stages such as phone screen, interview, offer, rejected, or withdrawn are manual in the first version.

## Architecture

### Modules

`src/lib/candidate-screening/planner`

Builds `EvaluationSchema` and `SearchPlan` from the JD content and existing JD evaluation metadata. It produces keywords, filters, priority tags, and a retrieval query used for vector recall.

`src/lib/candidate-screening/adapters`

Defines `CandidateSourceAdapter`. The first implementation is `boss-like`. The adapter logs in when required, opens the resume list page, applies search input, scrolls and extracts candidate batches, opens resume details when needed, and executes collect/chat actions.

`src/lib/candidate-screening/dedupe`

Normalizes candidate identity. The priority is platform candidate id, profile URL, then a hash of platform, name, company, and title. The dedupe layer checks both the current run memory and persisted database keys.

`src/lib/candidate-screening/ingest`

Upserts candidates and resume snapshots. It chunks resume text, calls the existing `embedDocuments`, validates dimensions, and writes pgvector rows.

`src/lib/candidate-screening/recall`

Embeds the JD retrieval query and searches `candidate_resume_chunks` for current-user candidates. It excludes candidates that should not be contacted again unless the run explicitly allows already-contacted candidates.

`src/lib/candidate-screening/evaluation`

Extracts tags and scores candidates against the JD evaluation schema. It produces structured tags, score details, risk notes, and explanation text. LLM output is validated before persistence.

`src/lib/candidate-screening/ranking`

Merges live search candidates and vector recall candidates. It removes duplicates, computes a final rank, and keeps source provenance as `live_search`, `vector_recall`, or `both`.

`src/lib/candidate-screening/actions`

Creates dry-run action plans. In execution mode, it calls the platform adapter and writes action logs. It uses idempotency keys to prevent duplicate chat or collect actions for the same JD-candidate pair.

`src/lib/candidate-screening/runner`

Orchestrates the run. It updates run stage, status, stats, and errors after every phase. The first version can run in-process from an API request as long as run state is persisted and the UI reads progress from the database. A worker can replace the runner entry point later without changing the domain model.

### Reused Existing Code

- Existing auth guard and user scoping patterns from JD and knowledge APIs.
- Existing browser executor concepts from JD publishing, while keeping screening-specific adapter methods separate from publish DSL.
- Existing embedding client in `src/lib/rag/embed.ts`.
- Existing pgvector SQL style and dimension filtering from `src/lib/rag/knowledge-repo.ts`.
- Existing JD data model and JD detail/workbench UI.

## Data Model

All new tables use Prisma PascalCase model names, snake_case PostgreSQL table names, and explicit `@map`/`@@map` mappings.

### Candidate

Table: `candidates`

Purpose: global candidate profile for a user.

Key fields:

- `id`
- `userId`
- `displayName`
- `currentTitle`
- `currentCompany`
- `location`
- `experienceYears`
- `sourcePlatform`
- `platformCandidateId`
- `profileUrl`
- `identityKey`
- `identityHash`
- `lastActiveAt`
- `contacted`
- `replied`
- `lastContactAt`
- `createdAt`
- `updatedAt`

Important constraints:

- Unique `(user_id, source_platform, identity_hash)` for persisted dedupe.
- Index `(user_id, updated_at desc)` for candidate library views.
- Index `(user_id, contacted, replied)` for contact filtering.

### CandidateResume

Table: `candidate_resumes`

Purpose: versioned resume snapshots for a candidate.

Key fields:

- `id`
- `userId`
- `candidateId`
- `sourcePlatform`
- `profileUrl`
- `rawText`
- `structuredSummary`
- `resumeHash`
- `fetchedAt`
- `createdAt`

Important constraints:

- Unique `(candidate_id, resume_hash)` to avoid storing identical snapshots.
- Index `(user_id, candidate_id, fetched_at desc)`.

### CandidateResumeChunk

Table: `candidate_resume_chunks`

Purpose: pgvector index for candidate resume recall.

Key fields:

- `id`
- `userId`
- `candidateId`
- `resumeId`
- `chunkIndex`
- `content`
- `tokenEstimate`
- `embeddingModel`
- `embeddingDimension`
- `embedding Unsupported("vector")`
- `createdAt`

Important constraints:

- Unique `(resume_id, chunk_index)`.
- Index `(user_id, embedding_model, embedding_dimension)`.
- Search filters must include `user_id`, `embedding_model`, and `embedding_dimension`.

### CandidateScreeningRun

Table: `candidate_screening_runs`

Purpose: one asynchronous screening execution for a JD.

Key fields:

- `id`
- `userId`
- `jobDescriptionId`
- `platform`
- `mode`: `dry_run` or `execution`
- `status`: `pending`, `running`, `success`, `failed`, `cancelled`
- `currentStage`
- `searchPlan`
- `evaluationSchema`
- `stats`
- `errorMessage`
- `startedAt`
- `finishedAt`
- `createdAt`
- `updatedAt`

Important indexes:

- `(user_id, job_description_id, created_at desc)`.
- `(status, updated_at desc)`.

### CandidateScreeningResult

Table: `candidate_screening_results`

Purpose: JD-specific screening conclusion for a candidate.

Key fields:

- `id`
- `userId`
- `runId`
- `jobDescriptionId`
- `candidateId`
- `resumeId`
- `source`: `live_search`, `vector_recall`, or `both`
- `tags`
- `scoreDetail`
- `finalScore`
- `rank`
- `decisionAction`: `chat`, `collect`, or `skip`
- `decisionPriority`: `high`, `medium`, or `low`
- `decisionReason`
- `actionPlan`
- `actionStatus`
- `interviewStage`
- `notes`
- `createdAt`
- `updatedAt`

Important constraints:

- Unique `(job_description_id, candidate_id)` for the current best result for that JD.
- Index `(user_id, job_description_id, final_score desc)`.
- Index `(user_id, job_description_id, interview_stage)`.

### CandidateActionLog

Table: `candidate_action_logs`

Purpose: planned and executed actions for a screening result.

Key fields:

- `id`
- `userId`
- `runId`
- `screeningResultId`
- `candidateId`
- `jobDescriptionId`
- `platform`
- `mode`: `dry_run` or `execution`
- `action`: `chat`, `collect`, or `skip`
- `message`
- `status`: `planned`, `running`, `success`, `failed`, `skipped`
- `idempotencyKey`
- `browserTrace`
- `errorMessage`
- `createdAt`
- `updatedAt`

Important constraints:

- Unique `(user_id, idempotency_key)`.
- Index `(user_id, job_description_id, candidate_id, created_at desc)`.

### CandidateTagStat

Table: `candidate_tag_stats`

Purpose: user-level tag feedback metrics.

Key fields:

- `id`
- `userId`
- `tagType`
- `tag`
- `seen`
- `chatted`
- `replied`
- `createdAt`
- `updatedAt`

Important constraints:

- Unique `(user_id, tag_type, tag)`.

## Status and Stage Values

Run stages:

- `planning`
- `searching_live`
- `ingesting_live`
- `indexing_resumes`
- `recalling_vectors`
- `evaluating`
- `ranking`
- `planning_actions`
- `executing_actions`
- `finalizing`

Interview stages:

- `sourced`
- `screened`
- `to_contact`
- `collected`
- `contacted`
- `replied`
- `phone_screen`
- `interviewing`
- `offer`
- `rejected`
- `withdrawn`

The first version stores stages as strings to match existing project conventions. TypeScript constants and validators define the allowed values.

## API Design

### Create Screening Run

`POST /api/jd/[id]/candidate-screening/runs`

Body:

```json
{
  "platform": "boss-like",
  "mode": "dry_run",
  "maxCandidates": 50,
  "batchSize": 10,
  "allowAlreadyContacted": false
}
```

Response:

```json
{
  "run": {
    "id": "run-id",
    "jobDescriptionId": "jd-id",
    "status": "pending",
    "mode": "dry_run"
  }
}
```

### List JD Runs

`GET /api/jd/[id]/candidate-screening/runs`

Returns recent runs for a JD.

### Get Run

`GET /api/candidate-screening/runs/[runId]`

Returns run status, current stage, stats, errors, and result summary.

### Stream Run Progress

`GET /api/candidate-screening/runs/[runId]/stream`

Uses SSE for progress updates when practical. Polling `GET /runs/[runId]` remains the fallback.

### List JD Candidates

`GET /api/jd/[id]/candidates`

Query params:

- `decision`
- `interviewStage`
- `source`
- `minScore`
- `page`
- `limit`

Returns screening results with candidate summary.

### Get JD Candidate Detail

`GET /api/jd/[id]/candidates/[candidateId]`

Returns candidate profile, latest resume snapshot, chunks metadata, screening result, score detail, tags, action logs, and JD-specific interview progress.

### Update Interview Progress

`PATCH /api/jd/[id]/candidates/[candidateId]`

Body:

```json
{
  "interviewStage": "phone_screen",
  "notes": "已约电话初筛"
}
```

### Execute Planned Actions

`POST /api/candidate-screening/runs/[runId]/execute-actions`

Body:

```json
{
  "confirmExecution": true,
  "maxChatActions": 10,
  "maxCollectActions": 30
}
```

Creates or resumes execution-mode action logs from a dry-run plan.

## Browser Adapter Design

The screening adapter is separate from JD publishing because it needs domain methods instead of generic publish steps.

```ts
type CandidateSourceAdapter = {
  platform: 'boss-like';
  loginIfNeeded(): Promise<void>;
  searchCandidates(plan: SearchPlan, options: SearchOptions): AsyncIterable<RawCandidateBatch>;
  collectCandidate(candidate: StoredCandidateRef): Promise<ActionExecutionResult>;
  chatCandidate(candidate: StoredCandidateRef, message: string): Promise<ActionExecutionResult>;
  close?(): Promise<void>;
};
```

`boss-like` behavior:

- Reads the same local defaults and required production env style as JD publishing.
- Uses frontend browser operations only.
- Opens the resume list page after login.
- Searches by generated keywords and supported filters.
- Extracts stable fields from list cards first.
- Opens detail pages when the list card does not contain enough resume text.
- Produces `RawCandidate` records with profile URL, raw resume text, name, title, company, experience, location, and activity when available.
- Executes collect/chat only in execution mode.

## Scoring and Decision

`EvaluationSchema`:

```ts
type EvaluationSchema = {
  skills: string[];
  domainKnowledge: string[];
  generalAbility: string[];
  risk: string[];
};
```

`CandidateTags`:

```ts
type CandidateTags = {
  skills: string[];
  domainKnowledge: string[];
  generalAbility: string[];
  risk: string[];
  activity: string[];
  custom: string[];
};
```

Score detail:

```ts
type ScoreDetail = {
  skill: number;
  domain: number;
  ability: number;
  risk: number;
  llmBonus: number;
  total: number;
};
```

Initial scoring formula:

```ts
total = skill * 0.4 + domain * 0.2 + ability * 0.3 - risk * 0.1 + llmBonus;
```

The score is clamped to `0..100`.

Decision thresholds:

- `> 85`: `chat`, `high`
- `> 70`: `chat`, `medium`
- `> 60`: `collect`, `low`
- otherwise: `skip`, `low`

Ranking formula:

```ts
finalScore = matchScore * 0.6 + replyProbability * 0.2 + freshness * 0.1 + diversity * 0.1;
```

The first version may use neutral defaults for reply probability and diversity if tag stats are sparse.

## Safety and Idempotency

- New runs default to `dry_run`.
- Real browser actions require `confirmExecution: true`.
- Every action has an idempotency key derived from user, JD, candidate, platform, and action type.
- If a candidate has already been contacted for this JD, chat is skipped unless the request explicitly allows re-execution.
- Run-level limits cap candidate search, chat actions, and collect actions.
- Action failures are recorded and shown. The first version does not repeatedly retry failed chat actions automatically.
- Browser trace summaries are stored with action logs for debugging without dumping unbounded DOM content.

## UI Design

### JD Detail

- Add `筛选候选人` button near publish status/actions.
- Add `已筛选候选人` link showing candidate count and latest run status.
- Disable or explain screening when the JD is not published or not eligible.

### Run Progress View

- Show stage timeline: planning, live search, ingest, vector recall, evaluation, ranking, action planning, execution.
- Show stats: fetched, deduped, stored, vector-recalled, evaluated, recommended chat, recommended collect, skipped, failed.
- Show current mode: dry-run or execution.
- Show errors with retry guidance when the run fails.

### JD Candidate List

- Dense workbench layout, not a marketing page.
- Top filters: decision, interview stage, source, minimum score.
- Table or list rows show name, title, company, experience, source, score, tags, decision, action status, interview stage.
- Primary row action opens the JD candidate detail.
- Secondary actions update interview stage or execute selected planned action when allowed.

### JD Candidate Detail

- Left pane: resume snapshot and source metadata.
- Right pane: AI score detail, tags, decision reason, action plan, action logs, interview stage, notes.
- Interview stage control is manual and writes to the JD-specific screening result.

## Testing Strategy

Follow TDD for implementation.

Unit tests:

- dedupe key generation and persisted duplicate detection.
- score and decision thresholds.
- ranking source merge and duplicate handling.
- action idempotency key generation.
- run stage transitions.

Repository tests:

- user-scoped candidate create/update.
- unique identity behavior.
- resume snapshot hash behavior.
- pgvector insert SQL validation.
- vector recall filters by user, model, dimension, and candidate status.
- JD-scoped screening result queries.

API route tests:

- auth required.
- JD ownership checks.
- run creation validation.
- candidate list filtering.
- candidate detail ownership.
- interview stage update validation.
- execute-actions confirmation requirement.

Adapter tests:

- boss-like fixture search extracts candidates from the resume list.
- detail page extraction fills missing resume text.
- collect/chat operations target the correct candidate.
- login branch works when the resume list redirects to login.

Integration tests:

- PostgreSQL with pgvector migration applies.
- Dry-run screening against a local boss-like fixture stores candidates, resumes, chunks, run stats, and JD screening results.
- Execution mode writes action logs and advances action/interview state without duplicating actions.

Frontend tests:

- JD detail shows screening entry points.
- JD candidate list loads, filters, and opens detail.
- Candidate detail updates interview stage and notes.
- Run progress renders stage and stats.

## Implementation Notes

- Keep schema changes in a new Prisma migration and run `prisma generate`.
- Add environment documentation to `.env.example` only for any new screening-specific limits or URLs. Reuse existing boss-like env variables where possible.
- Keep `boss-like` defaults limited to local/test/development, consistent with JD publishing.
- Do not call boss-like backend APIs from hiring-agent; browser automation operates through the frontend.
- Keep `.superpowers/` ignored because visual brainstorming artifacts are local working files.

## Future Work

- Add additional recruiting site adapters.
- Add automatic state sync from recruiting platforms.
- Use tag reply statistics in ranking once enough feedback exists.
- Add candidate library views independent of JD.
- Add cancellation/resume semantics for long-running screening jobs.
