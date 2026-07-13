# JD Evaluate Golden Dataset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a resume-scoring-style golden dataset + CLI for JD **evaluate-only** regression (16 samples, optional true-LLM `run`, no default-CI LLM).

**Architecture:** Mirror `src/lib/validation/resume-scoring/`: versioned JSON samples, `dataset.ts` loader, CLI via `src/scripts/validation-jd-evaluate.ts`, optional `run` that calls `runLLM({ stage: 'evaluate', ... })` with fixture `companyContext` (no RAG).

**Tech Stack:** TypeScript, Jest, Bun/`tsx`, existing `jd-agent` evaluate path (`PROMPT_VERSION`, `runLLM`).

## Global Constraints

- Phase 1 evaluate-only; no generate/improve/regenerate closed loop
- Exactly 16 samples, 4 per anchor: `high_quality` | `acceptable` | `problematic` | `fabricated_risk`
- Default CI: structural Jest only (no live LLM)
- `run` needs LLM API env only; fixture context, no embedding/RAG
- Spec: `docs/superpowers/specs/2026-07-13-jd-evaluate-golden-dataset-design.md`

## File map

| Path                                                                         | Responsibility                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------- |
| `src/lib/validation/jd-evaluate/datasets/jd-evaluate-golden-samples.v1.json` | 16 golden samples                                 |
| `src/lib/validation/jd-evaluate/dataset.ts`                                  | Types, load, list/filter                          |
| `src/lib/validation/jd-evaluate/dataset.test.ts`                             | Structural tests                                  |
| `src/lib/validation/jd-evaluate/scripts/dataset-ops.ts`                      | Summary/show/export formatters                    |
| `src/lib/validation/jd-evaluate/scripts/run-ops.ts`                          | True-LLM evaluate + assert                        |
| `src/lib/validation/jd-evaluate/scripts/ops.ts`                              | CLI router                                        |
| `src/lib/validation/jd-evaluate/scripts/ops.test.ts`                         | CLI unit tests (dataset path; mock run if needed) |
| `src/scripts/validation-jd-evaluate.ts`                                      | Entrypoint                                        |
| `package.json`                                                               | `validation:jd-evaluate` script                   |

---

### Task 1: Dataset JSON + loader + structural tests

**Files:**

- Create: `src/lib/validation/jd-evaluate/datasets/jd-evaluate-golden-samples.v1.json`
- Create: `src/lib/validation/jd-evaluate/dataset.ts`
- Create: `src/lib/validation/jd-evaluate/dataset.test.ts`

**Interfaces:**

- Produces: `JdEvaluateAnchor`, `JdEvaluateGoldenSample`, `JD_EVALUATE_DATASET_VERSION`, `listJdEvaluateDatasetSamples({ anchor? })`

- [ ] **Step 1: Write failing structural test**

```ts
/** @jest-environment node */
import {
  JD_EVALUATE_ANCHORS,
  JD_EVALUATE_DATASET_VERSION,
  listJdEvaluateDatasetSamples,
} from './dataset';

describe('jd evaluate golden dataset', () => {
  it('exposes 16 samples with 4 per anchor', () => {
    expect(JD_EVALUATE_DATASET_VERSION).toBe('jd-evaluate-golden-dataset-v1');
    const all = listJdEvaluateDatasetSamples();
    expect(all).toHaveLength(16);
    for (const anchor of JD_EVALUATE_ANCHORS) {
      expect(listJdEvaluateDatasetSamples({ anchor })).toHaveLength(4);
    }
  });

  it('keeps score ranges valid and rewriteRequired boolean', () => {
    for (const sample of listJdEvaluateDatasetSamples()) {
      for (const key of ['clarity', 'completeness', 'attractiveness', 'specificity'] as const) {
        const [lo, hi] = sample.expected.scoreRanges[key];
        expect(lo).toBeGreaterThanOrEqual(1);
        expect(hi).toBeLessThanOrEqual(10);
        expect(lo).toBeLessThanOrEqual(hi);
      }
      expect(typeof sample.expected.rewriteRequired).toBe('boolean');
      expect(sample.jd.title.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `bunx jest src/lib/validation/jd-evaluate/dataset.test.ts --coverage=false`

- [ ] **Step 3: Implement JSON (16 samples) + `dataset.ts`**

Loader pattern like resume-scoring `dataset.ts`. Anchors must encode clear quality differences (wide ranges for LLM variance). Fabricated samples must claim unsupported company facts relative to `companyContext`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit** `feat: add JD evaluate golden dataset samples`

---

### Task 2: Dataset CLI (list/show/export) + package script

**Files:**

- Create: `src/lib/validation/jd-evaluate/scripts/dataset-ops.ts`
- Create: `src/lib/validation/jd-evaluate/scripts/ops.ts`
- Create: `src/lib/validation/jd-evaluate/scripts/ops.test.ts`
- Create: `src/scripts/validation-jd-evaluate.ts`
- Modify: `package.json` (add `validation:jd-evaluate`)

**Interfaces:**

- Produces: `runJdEvaluateValidationOp(args: string[]): { operation; detail; exitCode }`
- Consumes: `listJdEvaluateDatasetSamples`

- [ ] **Step 1: Write failing CLI tests** for `dataset` summary containing version and `dataset show high_quality`

- [ ] **Step 2: Implement dataset-ops + ops + script entry** (mirror resume-scoring; include `usage`; reject unknown anchors with exit 1)

- [ ] **Step 3: Wire package.json** `"validation:jd-evaluate": "bunx tsx src/scripts/validation-jd-evaluate.ts"`

- [ ] **Step 4: Run** `bun run validation:jd-evaluate -- dataset` — expect version + 4 anchors × 4

- [ ] **Step 5: Commit** `feat: add JD evaluate validation CLI`

---

### Task 3: Optional true-LLM `run` command

**Files:**

- Create: `src/lib/validation/jd-evaluate/scripts/run-ops.ts`
- Create: `src/lib/validation/jd-evaluate/assert.ts` (pure compare helpers + unit tests)
- Modify: `ops.ts` to route `run` / `run <anchor>`
- Test: `assert.test.ts` without live LLM

**Interfaces:**

- Produces: `assertJdEvaluateSample(sample, evaluation) -> { ok, failures[] }`, `runJdEvaluateGoldenRegression({ anchor?, evaluate })`
- `evaluate` injectable for tests; default uses `runLLM({ stage: 'evaluate', jd, companyContext })`

- [ ] **Step 1: Unit-test assert helper** (in-range / rewrite / issueMustInclude)

- [ ] **Step 2: Implement run-ops** — print `datasetVersion` + `PROMPT_VERSION`; per-sample pass/fail; exit 1 on any fail

- [ ] **Step 3: Wire `run` in ops.ts**

- [ ] **Step 4: Smoke** `bun run validation:jd-evaluate -- run high_quality` only if LLM key present; otherwise skip with note in commit message / don't fail CI

- [ ] **Step 5: Commit** `feat: add JD evaluate golden sample LLM runner`

---

### Task 4: Spec success criteria + optional reference snippet

**Files:**

- Optional: `docs/references/jd-evaluate-score-quality.md` (short, link from prompt-management or AGENTS only if needed — prefer one short reference)

- [ ] **Step 1: Add short reference doc** describing dataset path, CLI, when to run `run`

- [ ] **Step 2: Commit** `docs: document JD evaluate golden validation`

- [ ] **Step 3: Verify** Jest for `jd-evaluate` all pass; `validation:jd-evaluate -- dataset` works

---

## Spec coverage check

| Spec item                    | Task                  |
| ---------------------------- | --------------------- |
| 16 samples / 4 anchors       | Task 1                |
| dataset.ts + structural Jest | Task 1                |
| CLI dataset show/export      | Task 2                |
| package script               | Task 2                |
| run true-LLM, no RAG         | Task 3                |
| CI without live LLM          | Tasks 1–3 (Jest only) |
| Reference doc nice-to-have   | Task 4                |
