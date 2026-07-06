# JD Workbench Status and Screening Design

Date: 2026-07-06

Status: Draft for user review

## Summary

The JD workbench should behave like a status-aware recruiting operations list, not a generic JD editor. The list defaults to published JDs, supports status filtering, and shows whether each published JD has screening activity. Published JDs are immutable in the detail editor: recruiters can view content, screen candidates, continue screening, and review candidates, but they cannot silently edit or regenerate the already-published JD.

Screening progress should be derived from existing candidate screening runs and results instead of being folded into `JobDescription.status`. A JD remains `published` after screening. The UI can show a separate screening state such as `未筛选`, `筛选中`, `已筛选`, or `筛选失败` by aggregating `candidate_screening_runs` and `candidate_screening_results`.

The product threshold for a qualified resume is 70 points. Candidates below 70 may remain persisted for traceability, but they do not count as satisfying the JD and should not appear in the default qualified candidate view.

## Goals

- Make `/jd-generator` a JD list page with a clear status filter.
- Default the list filter to `published`.
- Keep `JobDescription.status` focused on the JD publish lifecycle.
- Show screening state and qualified candidate counts separately from JD publish status.
- Prevent content, publish settings, status, and regenerate edits after a JD reaches `published`.
- Move primary detail actions to the top of the detail page.
- Let published JDs continue screening without duplicating previously screened candidates.
- Treat `finalScore >= 70` as the qualified threshold for counts and default candidate display.

## Non-Goals

- Adding a new database column for screening state.
- Changing the existing JD publish lifecycle status names.
- Removing low-score persisted screening results.
- Reworking the entire candidate tracking dashboard.
- Changing the current 70-point qualification threshold.

## Current Findings

- `GET /api/jd` already accepts a `status` query parameter and validates it with `isJDStatus`.
- `JDListView` currently calls `fetchJobDescriptions()` without passing a status, so it loads all statuses.
- `JDDetailView` currently allows saving, status changes, publish-setting changes, and regeneration even when the JD is `published`.
- Candidate screening runs are stored in `candidate_screening_runs`.
- Candidate screening results are stored in `candidate_screening_results`.
- Existing result persistence already dedupes by user, JD, and candidate through the repository lookup and the database uniqueness around `jobDescriptionId + candidateId`.
- Candidate scoring currently maps 70 and above to outreach, so 70 is the correct minimum for "qualified".

## State Model

### JD Publish Status

Keep the existing `JobDescription.status` values:

- `created`
- `ready_to_publish`
- `publishing`
- `published`
- `publish_failed`
- `offline`
- `archived`

These values describe the JD document and publish lifecycle only.

### Derived Screening Status

Expose a derived summary for list and detail pages:

```ts
type JDScreeningStatus = 'not_started' | 'running' | 'screened' | 'failed';

type JDScreeningSummary = {
  status: JDScreeningStatus;
  totalCandidateCount: number;
  qualifiedCandidateCount: number;
  latestRunId: string | null;
  latestRunStatus: CandidateScreeningRunStatus | null;
  latestRunUpdatedAt: string | null;
};
```

Rules:

- No runs and no results -> `not_started`.
- Latest run is `pending` or `running` -> `running`.
- Latest run is `failed` and there are no qualified results -> `failed`.
- Any persisted results or a successful latest run -> `screened`.
- `qualifiedCandidateCount` counts only `finalScore >= 70`.
- `totalCandidateCount` counts all persisted screening results for auditability.

## Backend Design

### JD List API

`GET /api/jd` should keep accepting `status`, `page`, and `limit`. The route should include screening summaries for returned JDs by aggregating existing screening tables for the returned JD ids.

The preferred implementation is a small repository helper that accepts `{ userId, jobDescriptionIds }` and returns a map of screening summaries. This keeps the aggregation reusable by list and detail pages and avoids N+1 requests.

No Prisma migration is needed.

### JD Detail API

`GET /api/jd/[id]` can either include the same screening summary or the detail page can fetch it through the existing screening-runs and candidates APIs. Prefer including it in the JD response if this stays small; it gives the page one stable source of truth.

### Update and Regenerate Guards

Server routes must enforce immutability, not only the UI.

- `PATCH /api/jd/[id]` should reject content, publish-setting, tone, and status changes when the current JD is `published`.
- `POST /api/jd/[id]/regenerate` should reject published JDs.
- Screening and candidate review endpoints remain allowed for `published` JDs.

The response should use `409` with a clear message such as `published job descriptions cannot be modified`.

## Frontend Design

### JD List

The list page should show a compact status filter near the list header. Default selected status is `published`.

Recommended status filter order:

- `published`
- `created`
- `ready_to_publish`
- `publish_failed`
- `publishing`
- `offline`
- `archived`
- `all`

Each row should show:

- JD title and position.
- Publish status chip.
- Screening status chip.
- Qualified and total candidate counts, for example `合格 5 / 全部 12`.
- Updated time.
- Contextual action:
  - `查看` for all statuses.
  - `继续筛选` for published JDs with screening activity.
  - `筛选并执行` for published JDs without screening activity.

### JD Detail

Move primary actions to the top action bar next to the title area.

For editable statuses (`created`, `ready_to_publish`, `publish_failed`):

- Save changes.
- Publish.
- Regenerate.

For `published`:

- View candidates.
- Screen and execute.
- Continue screening.
- Start communication sync, if the existing communication flow remains eligible.

The JD content form should render as read-only when `status === 'published'`. Inputs and textareas should either be disabled/read-only or replaced with read-only text blocks following the existing design style.

The status select should not be available for `published` JDs.

### Candidate List Default

Candidate result pages for a JD should default to qualified candidates (`finalScore >= 70`). Low-score results remain accessible through an explicit filter such as `全部` or `低于 70`.

This makes stored low-score records visible for investigation without counting them as satisfying the JD.

## Continue Screening and Dedupe

Continue screening should create a new screening run for the same published JD.

Existing dedupe remains based on:

- Candidate identity dedupe during ingestion.
- `candidate_screening_results` upsert scoped by user, JD, and candidate.

If a later run sees the same candidate again, it refreshes that candidate's result instead of creating a duplicate row. Existing progress fields such as contacted/interview stage should not be reset unless the update explicitly asks to change them.

## Testing Strategy

### Unit Tests

- `JDListView` defaults to requesting `/api/jd?status=published`.
- `JDListView` changes the query when the status filter changes.
- `JDListView` renders screening summary chips and qualified/total counts.
- `JDDetailView` renders published JDs read-only and hides or disables edit-only actions.
- `JDDetailView` shows top action buttons for published screening actions.
- `PATCH /api/jd/[id]` rejects published JD modifications with `409`.
- `POST /api/jd/[id]/regenerate` rejects published JDs with `409`.
- Screening summary aggregation counts only `finalScore >= 70` as qualified.
- Candidate list default filters to `minScore = 70`.

### Existing Tests To Preserve

- JD creation and editing for non-published statuses.
- JD publishing flow.
- Candidate screening run creation.
- Candidate screening result upsert dedupe.
- Result refresh without resetting progress.

## Acceptance Criteria

- Opening `/jd-generator` initially lists only published JDs.
- The user can switch status filters and see matching JDs.
- Published JD details cannot be edited, saved, regenerated, or manually re-statused.
- Published JD primary actions are visible at the top of the detail page.
- Published JDs can start screening and continue screening.
- Screening summaries show separate publish status and screening status.
- Qualified counts include only candidates with `finalScore >= 70`.
- Candidate result views default to qualified candidates while still allowing low-score records to be inspected.
- Re-running screening for the same JD does not create duplicate candidate rows for candidates already screened.
