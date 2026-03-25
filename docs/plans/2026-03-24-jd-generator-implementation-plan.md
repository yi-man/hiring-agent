# JD Generator Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## Source Of Truth (must-follow)

All implementation details in this plan are subordinate to:

- `docs/references/jd-agent-source-design.md`
- `docs/references/jd-agent-prompt-template.md`

Hard rules:

- Do not rewrite prompt semantics; keep source prompt text structure and constraints.
- Keep data structures aligned with source docs (`JobSchema`, `JD`, `JDScore`, `EvaluationResult`).
- Keep agent loop aligned with source docs (`Generate -> Evaluate -> Improve -> Re-evaluate/PickBetter`).

**Goal:** Build a JD Generator Agent feature that supports initial JD generation and human-edited iterative regeneration using Generate -> Evaluate -> Improve decision loop, strictly following the two source docs' process, data structures, and prompt texts.

**Architecture:** Add a dedicated App Router page and a single backend API endpoint (`/api/jd/agent`) with two actions (`initial_generate`, `continue_generate`). Encapsulate prompts, decision logic, and parsing in `src/lib/jd-agent/*` modules with explicit types and test coverage.

**Tech Stack:** Next.js App Router, TypeScript, React, existing fetch/env utils, Jest + Testing Library.

---

### Task 1: Define JD Agent domain types

**Files:**

- Create: `src/types/jd-agent.ts`
- Modify: `src/types/index.ts`
- Test: `tests/unit/types/jd-agent-types.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/types/jd-agent-types.test.ts` with compile-time oriented shape checks for:

- `JobSchema`
- `JD`
- `JDScore`
- `EvaluationResult`
- API request/response payload types

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/types/jd-agent-types.test.ts --runInBand`
Expected: FAIL because file/types do not exist.

**Step 3: Write minimal implementation**

Create `src/types/jd-agent.ts` exporting all required types, then re-export from `src/types/index.ts`.

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/types/jd-agent-types.test.ts --runInBand`
Expected: PASS.

**Step 5: Commit**

Run:
`git add src/types/jd-agent.ts src/types/index.ts tests/unit/types/jd-agent-types.test.ts`
`git commit -m "feat(jd-agent): add domain types for jd workflow"`

---

### Task 2: Add prompt templates and version metadata (source-doc exact)

**Files:**

- Create: `src/lib/jd-agent/prompts.ts`
- Test: `src/lib/jd-agent/prompts.test.ts`

**Step 1: Write the failing test**

Add tests asserting:

- `PROMPT_VERSION === "jd_v3.2"`
- prompt constants preserve source text sections (Generate/Evaluate/Improve)
- output constraints enforce strict JSON in all three phases
- placeholders match source docs (`{{title}}`, `{{jd_text}}`, `{{issues}}`, etc.)

**Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/jd-agent/prompts.test.ts --runInBand`
Expected: FAIL because prompt module is missing.

**Step 3: Write minimal implementation**

Implement prompt constants/builders in `src/lib/jd-agent/prompts.ts` by copying source-doc text verbatim and only interpolating variables.

**Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/jd-agent/prompts.test.ts --runInBand`
Expected: PASS.

**Step 5: Commit**

Run:
`git add src/lib/jd-agent/prompts.ts src/lib/jd-agent/prompts.test.ts`
`git commit -m "feat(jd-agent): add generate evaluate improve prompts"`

**Definition of done for this task:**

- Prompt text is traceable to `docs/references/jd-agent-prompt-template.md` line-by-line.
- `PROMPT_VERSION` equals `jd_v3.2`.
- Output requirements enforce strict JSON for Generate/Evaluate/Improve.

---

### Task 3: Implement decision and pickBetter utilities

**Files:**

- Create: `src/lib/jd-agent/decision.ts`
- Test: `src/lib/jd-agent/decision.test.ts`

**Step 1: Write the failing test**

Cover:

- `needImprove()` returns true when clarity/attractiveness/specificity < 7
- `needImprove()` ignores completeness threshold for gate
- `pickBetter()` returns higher total score JD
- tie-breaking behavior (prefer original on equal score)

**Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/jd-agent/decision.test.ts --runInBand`
Expected: FAIL.

**Step 3: Write minimal implementation**

Add pure functions only; no network calls.

**Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/jd-agent/decision.test.ts --runInBand`
Expected: PASS.

**Step 5: Commit**

Run:
`git add src/lib/jd-agent/decision.ts src/lib/jd-agent/decision.test.ts`
`git commit -m "feat(jd-agent): add quality gate decision logic"`

---

### Task 4: Build instruction parser for continue mode

**Files:**

- Create: `src/lib/jd-agent/instruction-parser.ts`
- Test: `src/lib/jd-agent/instruction-parser.test.ts`

**Step 1: Write the failing test**

Cover:

- parser extracts top block from `#指令:` prefix
- parser extracts top block from `【要求】` prefix
- explicit `extraInstruction` overrides parsed instruction
- returns empty when neither exists

**Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/jd-agent/instruction-parser.test.ts --runInBand`
Expected: FAIL.

**Step 3: Write minimal implementation**

Implement `resolveInstruction(extraInstruction, currentJd)` and keep logic pure.

**Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/jd-agent/instruction-parser.test.ts --runInBand`
Expected: PASS.

**Step 5: Commit**

Run:
`git add src/lib/jd-agent/instruction-parser.ts src/lib/jd-agent/instruction-parser.test.ts`
`git commit -m "feat(jd-agent): add continue instruction resolution"`

---

### Task 5: Implement LLM gateway interface and mocked adapter

**Files:**

- Create: `src/lib/jd-agent/llm.ts`
- Create: `src/lib/jd-agent/llm.mock.ts`
- Test: `src/lib/jd-agent/llm.test.ts`

**Step 1: Write the failing test**

Test interface behavior:

- accepts `systemPrompt` and `userPrompt`
- returns deterministic mocked output in tests
- maps upstream errors to typed domain errors

**Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/jd-agent/llm.test.ts --runInBand`
Expected: FAIL.

**Step 3: Write minimal implementation**

Create a thin abstraction that can later connect OpenAI/Claude without touching orchestration logic.

**Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/jd-agent/llm.test.ts --runInBand`
Expected: PASS.

**Step 5: Commit**

Run:
`git add src/lib/jd-agent/llm.ts src/lib/jd-agent/llm.mock.ts src/lib/jd-agent/llm.test.ts`
`git commit -m "refactor(jd-agent): add llm gateway abstraction"`

---

### Task 6: Implement JD agent orchestration service

**Files:**

- Create: `src/lib/jd-agent/service.ts`
- Test: `src/lib/jd-agent/service.test.ts`

**Step 1: Write the failing test**

Cover end-to-end orchestration in unit form:

- initial action path (generate -> evaluate -> optional improve -> pick)
- continue action path with edited JD and resolved instruction
- fallback when evaluation says no rewrite needed
- response includes `meta.promptVersion`
- all LLM stage outputs are parsed and validated as strict JSON objects matching types

Also assert:

- quality gate follows `clarity < 7 || attractiveness < 7 || specificity < 7`
- `rewrite_required` from Evaluate result controls Improve entry

**Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/jd-agent/service.test.ts --runInBand`
Expected: FAIL.

**Step 3: Write minimal implementation**

Implement orchestration with dependency injection for LLM calls to keep tests deterministic.

**Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/jd-agent/service.test.ts --runInBand`
Expected: PASS.

**Step 5: Commit**

Run:
`git add src/lib/jd-agent/service.ts src/lib/jd-agent/service.test.ts`
`git commit -m "feat(jd-agent): implement agent orchestration service"`

---

### Task 7: Add API route `/api/jd/agent`

**Files:**

- Create: `src/app/api/jd/agent/route.ts`
- Test: `src/app/api/jd/agent/route.test.ts`

**Step 1: Write the failing test**

Cover:

- 400 when required fields are missing by action
- 200 returns `jd`, `evaluation`, `decision`, `meta`
- maps LLM failure to 502
- maps unexpected parsing/runtime failures to 500
- rejects non-JSON or schema-invalid LLM output with retriable handling

**Step 2: Run test to verify it fails**

Run: `pnpm test src/app/api/jd/agent/route.test.ts --runInBand`
Expected: FAIL.

**Step 3: Write minimal implementation**

Use existing project response style, validate payload, call service, normalize errors.

**Step 4: Run test to verify it passes**

Run: `pnpm test src/app/api/jd/agent/route.test.ts --runInBand`
Expected: PASS.

**Step 5: Commit**

Run:
`git add src/app/api/jd/agent/route.ts src/app/api/jd/agent/route.test.ts`
`git commit -m "feat(api): add jd agent endpoint with action modes"`

---

### Task 8: Build JD generator page UI

**Files:**

- Create: `src/app/jd-generator/page.tsx`
- Create: `src/components/jd-generator/editor.tsx`
- Create: `src/components/jd-generator/form.tsx`
- Create: `src/components/jd-generator/actions.tsx`
- Test: `tests/unit/pages/JDGeneratorPage.test.tsx`

**Step 1: Write the failing test**

Cover UI behavior:

- can input `jobInput` and click generate
- receives and displays generated JD
- user edits JD, adds `extraInstruction`, clicks continue
- continue result overwrites editor text
- error state keeps editor content unchanged

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/pages/JDGeneratorPage.test.tsx --runInBand`
Expected: FAIL.

**Step 3: Write minimal implementation**

Implement single-page workflow with state machine:
`idle` -> `generating` -> `ready` -> `continuing` / `error`.

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/pages/JDGeneratorPage.test.tsx --runInBand`
Expected: PASS.

**Step 5: Commit**

Run:
`git add src/app/jd-generator/page.tsx src/components/jd-generator tests/unit/pages/JDGeneratorPage.test.tsx`
`git commit -m "feat(jd-agent): add jd generator interactive page"`

---

### Task 9: Navigation entry and UX polish

**Files:**

- Modify: `src/components/navbar.tsx`
- Test: `tests/unit/components/Navbar.test.tsx`

**Step 1: Write the failing test**

Add assertion that navbar includes link to JD Generator page.

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/components/Navbar.test.tsx --runInBand`
Expected: FAIL.

**Step 3: Write minimal implementation**

Add link/menu entry with existing UI style conventions.

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/components/Navbar.test.tsx --runInBand`
Expected: PASS.

**Step 5: Commit**

Run:
`git add src/components/navbar.tsx tests/unit/components/Navbar.test.tsx`
`git commit -m "feat(nav): add jd generator entry"`

---

### Task 10: End-to-end verification and documentation sync

**Files:**

- Modify: `README.md`
- Modify: `docs/plans/2026-03-24-jd-generator-design.md`
- Test: `tests/integration/e2e/jd-generator.cy.ts` (create if e2e coverage is required now)

**Step 1: Write the failing test (if e2e added now)**

Create Cypress scenario:

- visit page
- generate JD
- edit JD
- continue generate
- verify updated output

**Step 2: Run checks to verify failing/passing progression**

Run:

- `pnpm lint`
- `pnpm type-check`
- `pnpm test:ci`
- `pnpm cypress:run --spec tests/integration/e2e/jd-generator.cy.ts` (optional for this phase)

Expected:

- all mandatory checks PASS
- optional e2e PASS if implemented

**Step 3: Write minimal implementation/docs updates**

Update README usage section and finalize design doc status notes.

**Step 4: Run all checks again**

Repeat command set above; all mandatory checks must pass.

**Step 5: Commit**

Run:
`git add README.md docs/plans/2026-03-24-jd-generator-design.md tests/integration/e2e/jd-generator.cy.ts`
`git commit -m "docs(jd-agent): add usage and verification notes"`

---

## Notes For Execution

- Follow DRY/YAGNI strictly; do not add memory/analytics/multi-agent in this plan.
- Prefer pure functions for parser/decision/prompt modules to maximize testability.
- Keep API contract stable; UI should only depend on route response schema, not provider-specific output.
- Prompt/process/data structure authority is the two source docs provided by user; implementation docs in repo must not contradict them.
