# One-Click Candidate Screening Execution Design

Date: 2026-06-30

Status: Approved for implementation planning

## Summary

Candidate screening should run as a real end-to-end recruiting workflow from a single user action. When the recruiter starts screening from an eligible JD, the system creates an `execution` run, uses browser automation to collect real candidate resumes from `boss-like`, evaluates those resumes with the configured LLM, ranks candidates, plans actions, and immediately executes eligible `chat` or `collect` actions through the same browser adapter.

This document updates the earlier candidate screening design, which defaulted to dry-run planning and required a second explicit execution step. The new expected product behavior is one-click execution: screening is not complete until real resume collection, real evaluation, and real recommended actions have been attempted and persisted.

## Updated Decisions

- The primary JD detail button starts an `execution` screening run, not a `dry_run` run.
- The run completes the full flow in one backend state machine: live search, ingest, recall, LLM evaluation, ranking, action planning, and action execution.
- Real resume collection continues to use the `CandidateSourceAdapter` and default `PlaywrightBrowserExecutor` path.
- Real evaluation means execution runs must call the configured LLM. If the LLM call fails or `OPENAI_API_KEY` is missing, the execution run fails instead of silently falling back to rule-based scoring.
- The rule-based evaluation fallback may remain available for dry-run or test-only flows, but it must not be used for one-click execution.
- Planned actions are transient within an execution run. After planning, the runner immediately claims and executes eligible `chat` or `collect` actions.
- The existing `/execute-actions` API remains supported for compatibility and manual retries, but the one-click JD flow does not require a second user action.
- UI copy should make the consequence clear. The primary action should read like `筛选并执行`, not merely `筛选候选人`.

## Goals

- Make the default JD screening path match the real recruiting workflow.
- Ensure resumes shown in the app come from real browser-collected candidate pages.
- Ensure candidate scores and reasons in execution mode come from the configured LLM.
- Ensure recommended outreach or collection actions are actually performed on `boss-like` during the run.
- Persist enough action trace and error state to understand which candidates were contacted, collected, skipped, or failed.

## Non-Goals

- Removing dry-run support entirely.
- Adding a second confirmation modal in this iteration.
- Changing the platform adapter interface beyond what is needed for strict evaluation and automatic execution.
- Implementing reply detection or downstream interview-state synchronization from `boss-like`.
- Broadly redesigning the candidate list or tracking dashboard.

## User Flow

1. The recruiter opens a published or ready-to-publish JD.
2. The JD detail page shows a primary `筛选并执行` action and a link to existing screened candidates.
3. Clicking `筛选并执行` creates a `candidate_screening_runs` row with `mode = execution`.
4. The run starts asynchronously and records stage changes as it progresses.
5. The runner logs in to `boss-like` with browser automation when needed.
6. The runner searches candidates on the resume list page and reads browser snapshots.
7. Short list-card resumes are enriched by navigating to candidate detail pages and reading their snapshots.
8. Candidate profiles and resumes are persisted and indexed.
9. Existing candidate resumes are recalled from pgvector.
10. Each candidate is evaluated with the configured LLM. Any LLM failure fails the execution run.
11. Candidates are ranked and action plans are created.
12. Eligible `chat` and `collect` actions are immediately executed by the adapter.
13. Successful chat actions update result status to `success`, interview stage to `contacted`, and candidate contact fields.
14. Successful collect actions update result status to `success` and interview stage to `collected`.
15. Failed actions are recorded per action. Non-action candidates remain planned, skipped, or failed according to their decision and execution result.

## Backend Design

### Run Mode

`createAndStartCandidateScreeningRun` should create execution runs when called from the JD detail one-click flow. The API already accepts `mode`, so the UI can pass:

```json
{
  "platform": "boss-like",
  "mode": "execution"
}
```

`parseCreateScreeningRunPayload` already accepts `execution`, so the main implementation work is ensuring the UI sends it and the runner honors it.

### Strict Evaluation

`evaluateCandidateForJd` should accept a strict option, such as:

```ts
strict?: boolean;
```

When `strict` is true, any LLM error should be rethrown. When `strict` is false or absent, the current rule-based fallback can continue to support dry-run and isolated tests.

`runCandidateScreening` should pass `strict: params.request.mode === 'execution'` into the evaluation dependency. This keeps the strict behavior tied to domain mode rather than environment heuristics.

### Action Planning

Action logs created during an execution run should use `mode: params.request.mode` instead of hard-coded `dry_run`.

The action plan message generation can keep the existing conservative template for now. Message quality improvements can be a separate feature.

### Automatic Execution

After `createPlannedActions` completes, `runCandidateScreening` should branch on mode:

- `dry_run`: keep the current behavior and finish after action planning.
- `execution`: transition to `executing_actions`, list planned `chat` and `collect` results for the current run, claim each planned action log idempotently, execute through the adapter, and persist success or failure using the existing action result persistence helpers.

The code should avoid creating a second adapter if the screening adapter is still open. The same browser session can be reused for action execution.

`executeScreeningRunActions` can remain as the manual endpoint and should continue to work for retry or administrative flows.

### Failure Semantics

Execution run failures should be clear:

- Browser login/search/snapshot failures fail the run.
- LLM evaluation failure fails the run.
- Candidate-specific chat or collect failures should mark that action and result as failed, increment failure stats, and continue with other eligible candidates.
- If all candidate actions fail, the run may still finish with `success` if the pipeline completed and failures are captured per action. The run-level `failed` status is reserved for pipeline-level failures.

## Frontend Design

`JDDetailView` should change the candidate screening primary button copy to `筛选并执行`.

The click handler should call:

```ts
createCandidateScreeningRun(jobDescription.id, {
  platform: 'boss-like',
  mode: 'execution',
});
```

Existing progress display can remain unchanged. The run card should show the returned mode or status if available; detailed status remains available on candidate result pages and action logs.

Candidate list and detail views do not need new controls for this iteration. They should naturally show `success`, `failed`, `contacted`, and `collected` after execution runs complete.

## Testing Strategy

### Unit Tests

- `evaluation.test.ts`: strict mode rethrows LLM failures and non-strict mode still uses the current fallback.
- `runner.test.ts`: execution mode creates action logs with `mode = execution` and automatically calls `chatCandidate` or `collectCandidate` after planning.
- `runner.test.ts`: dry-run mode does not execute actions.
- `CandidateScreening.test.tsx`: JD detail button copy is `筛选并执行` and sends `mode: 'execution'`.

### Integration Tests

Extend the existing candidate screening integration fixture or add a focused integration case that proves:

- Browser search still requests `/employer/resumes`.
- Execution mode action logs are not left as dry-run.
- The fake `boss-like` fixture receives candidate detail page requests for chat or collect actions.
- The persisted result reaches `actionStatus = success` and `interviewStage = contacted` for a successful chat action.

Real LLM integration remains environment-dependent. Unit tests should inject a deterministic LLM function; local real-dependency validation can be run with `OPENAI_API_KEY` configured.

## Acceptance Criteria

- Clicking the JD detail screening action starts an execution-mode run.
- Execution-mode runs use browser automation to collect candidate resume content.
- Execution-mode runs fail on missing or failed LLM evaluation instead of using rule fallback.
- Execution-mode runs automatically execute planned `chat` and `collect` actions.
- Persisted action logs reflect `mode = execution` and final `success` or `failed` status.
- Candidate results reflect contacted or collected stages after successful actions.
- Relevant unit tests pass locally.
