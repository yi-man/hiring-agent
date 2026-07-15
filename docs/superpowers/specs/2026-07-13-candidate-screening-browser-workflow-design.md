# Candidate Screening Browser Workflow Design

Date: 2026-07-13

Status: Approved for specification review

## Summary

Candidate screening already runs asynchronously and records domain-stage events, but its browser automation is fixed inside the `boss-like` adapter. It does not select, persist, display, or repair a reusable Workflow. This design makes the complete browser portion of screening behave like JD publishing: the first usable run explores the target site and persists an active Workflow, later runs reuse that version, and locator failures repair the Workflow from a fresh browser snapshot before a single retry.

The Workflow covers browser login, resume search, candidate-detail enrichment, greeting, and collect. Candidate ingestion, vector recall, LLM evaluation, ranking, and decision planning remain in the existing screening domain graph.

## Goals

- Add a `screen_candidates` Workflow for the `boss-like` platform.
- Explore and persist the first complete Workflow version from a real browser session when no active version exists.
- Reuse the active version for subsequent screening runs.
- Automatically repair browser targets, create a new active version, and retry the failed browser step once.
- Cover login, search, detail enrichment, greeting, and collect actions.
- Link a screening run to its actual Workflow and show the Workflow version and browser-step progress on the screening execution page.
- Verify the flow through unit, integration, and Playwright E2E tests.

## Non-Goals

- Replacing the candidate screening domain graph, persistence, ranking, vector recall, or LLM evaluation.
- Adding a manual Workflow editor.
- Supporting recruiting platforms other than `boss-like`.
- Changing the existing JD publishing behavior, routes, tables, or APIs.
- Retrying a browser step more than once after an automatic repair.
- Persisting an incomplete Workflow when the first search has no usable candidate detail page.

## Existing Context

- JD publishing persists structured workflows in `publish_skills`, selects the active version, stores its `skillId` on the publish run, and exposes it in `/workflows`.
- JD publishing can explore a Workflow when none exists and can repair browser targets from a snapshot, publishing a new active version.
- Candidate screening has `candidate_screening_runs`, run events, an asynchronous LangGraph runner, and an execution page at `/jd-generator/[id]/screening-runs/[runId]`.
- Candidate screening browser interactions currently call `BossLikeCandidateSourceAdapter` directly for login, searching, candidate enrichment, greeting, and collect operations.
- `publish_skills` is already keyed by a workflow `name`, platform, and version. It can store `screen_candidates` without a second definition table.

## Recommended Architecture

### Workflow Storage and Shared Capabilities

Retain the existing Prisma `PublishSkill` model and `publish_skills` database table. The table is already a generic versioned store despite its historical name. Do not rename the database model or table in this feature.

Extract the shared repository and versioning operations used by JD publishing behind a workflow-name-aware interface:

- load the active Workflow by `{ name, platform }`;
- create the first explored active version;
- deactivate the previous active version and create a repaired successor;
- return workflow metadata for the existing Workflow library.

The existing `publish_jd` callers retain their public APIs and behavior. Candidate screening calls the same shared operations with `{ name: 'screen_candidates', platform: 'boss-like' }`.

Extend the shared step representation only as far as required for screening-specific browser actions. JD publishing actions remain unchanged. Screening actions are:

- `ensure_login`
- `search_candidates`
- `enrich_candidate`
- `chat_candidate`
- `collect_candidate`

The Workflow library continues to render the persisted steps and their graph. It will show both `publish_jd` and `screen_candidates` active Workflows and their version history.

### Screening Workflow Explorer

Add a screening-specific explorer that uses the same `BrowserExecutor` session as the screening run.

When no active `screen_candidates` Workflow exists:

1. The screening graph creates its search plan as it does today.
2. It opens the resume list and discovers the login state and targets.
3. It discovers the resume search input and submit control, then performs the run's first real search.
4. It discovers a candidate-card/detail target and opens a real candidate profile.
5. It discovers detail-resume content, the greeting trigger, message input, send control, and collect control without sending a greeting or collecting during exploration.
6. It persists `screen_candidates` v1 only when all required targets are discoverable.
7. It continues the same run using v1 and the current browser session.

If a first search returns no usable candidate detail page, the run completes using the existing no-result semantics. No incomplete Workflow is persisted, so a later eligible run explores again.

### Screening Workflow Runtime

Add a screening Workflow executor that dispatches the five high-level steps to the existing browser executor and adapter primitives. It owns browser target interpolation, command context, per-step trace data, and repair/retry behavior. It does not own candidate persistence or evaluation.

The existing screening LangGraph becomes the orchestration boundary:

1. Plan the search.
2. Resolve or explore `screen_candidates`.
3. Use the Workflow executor to log in, search, and enrich candidates.
4. Continue existing ingest, recall, evaluate, rank, and action-planning nodes unchanged.
5. In execution mode, use the same Workflow executor to greet or collect each planned candidate action.

The same browser session is retained throughout a normal execution run. This keeps login state and target repair context available for both search/detail operations and later candidate actions.

### Run Data and Compatibility

Add these nullable fields to `CandidateScreeningRun`:

- `skillId` mapped to `skill_id`: the exact persisted Workflow ID used by the run.
- `currentWorkflowStep` mapped to `current_workflow_step`: the currently executing browser Workflow step ID.

The candidate screening run itself is the task record for this Workflow. Do not add a duplicate generic task table. Its existing status, timestamps, statistics, and event stream already supply the required task lifecycle and audit surface.

Expose the new nullable fields in `CandidateScreeningRunDto` and related repository mapping. Existing runs retain `null` values and remain readable.

### Browser Failure and Repair Semantics

On a browser target or locator failure:

1. Record the workflow step, candidate context when relevant, target, error, and structured/raw browser snapshot in the current run event stream.
2. Resolve a unique replacement target from the current page snapshot.
3. When resolution is unique, create a new active `screen_candidates` version with the repaired target and record old/new workflow IDs in an event.
4. Update the run to use the new `skillId` and retry the failed step once.
5. Record the retry result in the event stream.

No repair is attempted when resolution is ambiguous, missing, or the failure is unrelated to target resolution. A repaired step is never retried more than once.

Failure boundaries are:

- Login, search, and candidate-detail enrichment failures are pipeline failures and mark the screening run failed.
- A greeting or collect failure after repair and retry marks that action and candidate result failed, then continues processing the other planned candidates.
- LLM, vector, dedupe, and persistence failures keep their existing domain failure behavior and are not relabeled as Workflow errors.

## User Experience

Keep the existing screening execution page and its domain-stage timeline. Add a Workflow card aligned with the JD publish execution page:

- linked Workflow name and version when `skillId` is available;
- a link to `/workflows/[skillId]`;
- the current browser step while a run is active;
- an explicit `历史任务未关联 Workflow` state for older runs;
- user-readable events for first exploration, active-version reuse, automatic repair, version upgrade, retry success, and retry failure.

The page continues to show candidate results, run statistics, and non-browser domain events. The Workflow card is additive rather than a page redesign.

## Testing Strategy

### Unit Tests

- The screening explorer persists a complete first `screen_candidates` v1 only after discovering the required list, detail, greeting, and collect targets.
- A no-result exploration does not persist an incomplete Workflow.
- A later run loads and uses the active screening Workflow rather than exploring again.
- The executor sends correct parameters for `ensure_login`, `search_candidates`, `enrich_candidate`, `chat_candidate`, and `collect_candidate`.
- A target failure with one unique replacement creates v2, updates the run's `skillId`, and retries exactly once.
- Ambiguous or unresolved targets do not create a new version or retry indefinitely.
- A candidate-action failure is persisted and does not abort subsequent candidate actions.
- Repository and DTO tests cover nullable `skillId` and `currentWorkflowStep` for new and historical runs.
- Component tests cover the Workflow link, workflow-step display, repair/version events, and the historical-run compatibility message.

### Integration Tests

Use real PostgreSQL and Redis with the existing `boss-like` fixture:

- First execution-mode screening run explores, persists, and associates `screen_candidates` v1.
- The fixture receives real browser requests for search, candidate detail, greeting, and collect.
- A subsequent run reuses the active Workflow.
- A controlled locator change triggers repair, creates v2, and completes the one permitted retry.
- Persisted screening run, action logs, results, and events contain the expected Workflow IDs and action outcomes.

### Playwright E2E / Dance Validation

Add browser-facing E2E coverage on the existing Playwright port and fixture setup:

- Start screening from the JD list and JD detail pages, then land on the screening execution page.
- Observe the workflow association and link to the Workflow detail page.
- Verify progress through search, detail capture, candidate action, completion, and candidate result display.
- Exercise the repaired-workflow path with a controlled fixture DOM variation and verify the new version is displayed.

The full real-dependency Workflow E2E command remains an opt-in local validation because it requires PostgreSQL, Redis, `OPENAI_API_KEY`, and the installed Playwright Chromium browser. Focused unit and fixture integration suites must be deterministic and runnable without a live LLM.

## Acceptance Criteria

- A screening run with no active workflow explores the complete `boss-like` browser flow and persists `screen_candidates` v1.
- Existing active screening Workflows are reused for later runs.
- Login, search, candidate detail, greeting, and collect all execute through the screening Workflow runtime.
- A resolvable target failure produces a new active Workflow version and retries the step once.
- Unrepairable pipeline browser errors fail the run; unrepairable candidate-action errors fail only that action and processing continues.
- Each new run persists and exposes its Workflow ID and current browser step; historical runs remain compatible.
- Screening execution pages link to the exact Workflow version and expose exploration/repair/retry events.
- The Workflow library presents the screening Workflow and version history alongside JD publishing Workflows.
- Relevant unit, integration, Playwright E2E, type-check, and applicable real-dependency validation pass.
