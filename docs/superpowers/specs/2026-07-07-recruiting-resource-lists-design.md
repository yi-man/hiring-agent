# Recruiting Resource Lists Design

**Goal:** Add top-level recruiting resource views for resumes, interview records, and candidates. The feature exposes existing candidate screening data as reusable assets across JDs without adding a new lifecycle schema in this iteration.

## Scope

In scope:

- Add menu entries for `简历列表`, `面试记录`, and `候选人列表`.
- Add top-level routes:
  - `/resumes`
  - `/interviews`
  - `/candidates`
- Keep `/jd-generator/candidates` working as a compatibility route or redirect path.
- Show resume-to-JD usage from existing `CandidateResume` and `CandidateScreeningResult` relations.
- Show interview records from existing `CandidateInterviewFeedback` rows, linked to candidate and JD context.
- Split the candidate list by current progress using existing fields only.

Out of scope:

- No Prisma migration for explicit `hired`, `rejected`, or `active` status fields.
- No manual resume upload or resume editing flow.
- No new interview scheduling workflow.
- No new candidate detail model beyond existing screening and interview progress.

## Current Context

The project already stores the needed recruiting objects:

- `Candidate`: global user-scoped candidate identity.
- `CandidateResume`: versioned resume snapshots for a candidate.
- `CandidateScreeningResult`: JD-specific candidate relation, score, decision action, action status, interview stage, and notes.
- `CandidateInterviewFeedback`: JD-candidate interview feedback records.
- `JobDescription`: JD context and detail route.

Existing pages already include:

- `/jd-generator/candidates`: cross-JD candidate tracking.
- `/jd-generator/[id]/candidates`: candidates for one JD.
- `/jd-generator/[id]/candidates/[candidateId]`: candidate detail and resume context.

The new views should reuse these relationships instead of creating a parallel recruiting CRM model.

## Recommended Approach

Use top-level recruiting resource routes:

- `候选人列表` -> `/candidates`
- `简历列表` -> `/resumes`
- `面试记录` -> `/interviews`

This makes candidates, resumes, and interviews first-class assets in the menu while JD generation remains focused on JD authoring, publishing, and per-JD screening.

Compatibility:

- Keep `/jd-generator/candidates` available during the transition.
- The sidebar should highlight the new top-level routes independently from `JD 工作台`.
- Dashboard links that currently point to `/jd-generator/candidates` can move to `/candidates`.

## Candidate List

The candidate list reuses the existing candidate tracking overview but presents it as a candidate resource view.

Default grouping:

- `正在推进`: candidates whose existing data suggests they are still active.
- `已结束`: candidates whose current JD-specific result indicates offer, rejection, withdrawal, or skip.

Status mapping for this iteration:

- `录取/Offer`: `interviewStage === "offer"`.
- `淘汰`: `interviewStage === "rejected"`, `interviewStage === "withdrawn"`, or `decisionAction === "skip"`.
- `正在推进`: any other candidate where `decisionAction !== "skip"`.

The page should show:

- Candidate name.
- Current title, company, location.
- Linked JD.
- Final score and decision action.
- Interview stage.
- Latest notes when present.
- Links to candidate detail, JD detail, and original source profile when available.

Filters should stay close to the existing tracking dashboard:

- JD.
- Scope: `正在推进`, `已结束`, `全部`.
- Interview stage.
- Recommended action.

## Resume List

The resume list shows latest resume snapshots and where they are currently used.

Each row should show:

- Candidate name.
- Candidate title, company, location.
- Resume source platform.
- Resume fetched time.
- Short resume preview.
- Mounted JD links derived from `CandidateScreeningResult` rows that reference the same candidate and, when available, the same `resumeId`.
- Candidate detail links for JD-candidate pairs.
- Original profile link when `Candidate.profileUrl` or `CandidateResume.profileUrl` exists.

Data behavior:

- The default list shows the latest resume per candidate.
- A candidate can appear once with the latest resume, even if multiple identical historical resume snapshots exist.
- If a resume is linked to multiple JDs, show all recent linked JDs up to a compact limit, with a count for overflow.
- If no JD relation exists, show it as `未挂载 JD`.

Suggested route/API shape:

- `GET /api/resumes?limit=200`
- Repository function: `listCandidateResumeLibrary({ userId, limit })`

## Interview Records

The interview records list exposes `CandidateInterviewFeedback` across all JDs.

Each row should show:

- Candidate name and subtitle.
- Linked JD position.
- Stage.
- Interviewer.
- Rating.
- Decision.
- Pros and cons summary.
- Notes when present.
- Updated time.
- Links to candidate detail and JD detail.

Filters:

- JD.
- Stage.
- Decision.

Suggested route/API shape:

- `GET /api/interviews?limit=200`
- Repository function: `listCandidateInterviewRecords({ userId, limit })`

## UI Design

Use the existing operational dashboard style:

- Dense list sections with restrained borders.
- Small icon-led actions using lucide icons.
- Native selects or existing HeroUI controls consistent with nearby pages.
- No marketing hero page.
- Clear empty states:
  - `暂无简历记录`
  - `暂无面试记录`
  - `暂无候选人`

Menu icons:

- `候选人列表`: `Users`
- `简历列表`: `FileText` or `Files`
- `面试记录`: `ClipboardList` or `MessagesSquare`

Page routes should use server auth gating like the existing candidate tracking page, then render client list components for refresh/filter interactions.

## Data Flow

Resumes:

1. The page checks local auth server-side.
2. Client component fetches `/api/resumes`.
3. API requires auth and calls `listCandidateResumeLibrary`.
4. Repository queries user-scoped candidates, resumes, and screening results.
5. UI renders resume rows with JD mount links.

Interviews:

1. The page checks local auth server-side.
2. Client component fetches `/api/interviews`.
3. API requires auth and calls `listCandidateInterviewRecords`.
4. Repository queries user-scoped feedbacks with candidate and JD relations.
5. UI renders interview record rows with JD and candidate links.

Candidates:

1. `/candidates` renders the existing tracking dashboard behavior under the new top-level route.
2. The dashboard fetches `/api/candidate-screening/tracking`.
3. UI applies the `正在推进` and `已结束` mapping client-side using existing fields.

## Error Handling

- API routes return `401` for unauthenticated access through the existing `requireAuth` pattern.
- API routes return `500` with a concise error message for unexpected failures, following existing candidate tracking routes.
- Client components show a bordered destructive error banner and keep the previous list state where possible on refresh failures.
- Rows with missing optional relations should render stable fallback text instead of crashing.

## Testing

Use TDD for implementation.

Repository tests:

- `listCandidateResumeLibrary` returns latest resume rows with mounted JD summaries.
- `listCandidateResumeLibrary` handles resumes without mounted JDs.
- `listCandidateInterviewRecords` returns candidate and JD links with feedback data.
- Queries are user-scoped and ordered by recent activity.

API tests:

- `/api/resumes` requires auth and returns `{ resumes }`.
- `/api/interviews` requires auth and returns `{ interviews }`.
- Limit parsing clamps invalid and large limits.

Component tests:

- Sidebar renders the three new menu entries and active states.
- Resume list renders candidate, JD mount links, and original profile action.
- Interview list renders candidate and JD links.
- Candidate list route groups active and ended candidates using the agreed existing-field mapping.

Verification commands:

- `bun run test -- src/lib/candidate-screening/repo.test.ts`
- `bun run test -- tests/unit/api/candidate-screening-routes.test.ts`
- `bun run test -- tests/unit/components/CandidateScreening.test.tsx`
- `bun run test -- tests/unit/components/AppSidebar.test.tsx` or the nearest existing sidebar/navigation test.
- `bun run type-check`

## Confirmed Decisions

- Candidate status uses existing fields only for this iteration.
- `offer` is displayed as `录取/Offer`, but no separate final hire field is created.
- `/jd-generator/candidates` remains available for compatibility; the primary menu route becomes `/candidates`.
