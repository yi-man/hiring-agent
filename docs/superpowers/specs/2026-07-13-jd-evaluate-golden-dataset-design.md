# JD Evaluate Golden Dataset Design

**Date:** 2026-07-13  
**Status:** Ready for implementation  
**Goal:** Add a resume-scoring-style golden dataset for **JD evaluate-only** calibration and low-cost regression when `jd-agent.evaluate` prompt / model changes. Phase 1 does **not** cover generate / improve / regenerate end-to-end quality loops.

## Decisions (locked)

| Topic                  | Choice                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 scope          | **Evaluate only** — fixed JD (+ optional company context) → assert score ranges, `rewrite_required`, optional issue keywords                                  |
| Out of scope (phase 1) | `generate`, `improve`, `continue_generate` / regenerate closed loop, `pickBetter`, UI workbench                                                               |
| Layout                 | Mirror `src/lib/validation/resume-scoring/` under `src/lib/validation/jd-evaluate/`                                                                           |
| Sample size            | **16** samples — **4 anchors × 4 samples**                                                                                                                    |
| Anchors                | Quality tiers of the **JD draft**, not job-family categories: `high_quality` / `acceptable` / `problematic` / `fabricated_risk`                               |
| Runtime                | Dataset module + CLI (`dataset` list/show/export) always; optional **`run`** true-LLM regression (requires Key), **not** required in default CI               |
| Pass criteria          | Per-dimension score in expected range; `rewrite_required` exact match; optional `issueMustInclude` substring hits on concatenated issues/evidence/suggestions |
| Versioning             | `datasetVersion` in JSON + report `promptVersion` from `PROMPT_VERSION` (`jd_v3.3` today)                                                                     |
| Company context        | Samples may include `companyContext: string \| null`; runner passes it into evaluate the same way production does                                             |

## Problem

JD quality today depends on LLM evaluate (`jd-agent.evaluate`) plus heuristics (`needImprove` / `rewrite_required`). There is no golden set to detect scoring drift when prompts or models change. Resume screening already has:

- `src/lib/validation/resume-scoring/datasets/scoring-golden-samples.v1.json`
- `bun run validation:resume-scoring -- dataset …`
- Documented low-cost layers: replay → golden-sample → production-monitor (`docs/references/candidate-screening-score-quality.md`)

JD evaluate needs the same pattern before we invest in improve/regenerate quality gates.

## Non-goals (phase 1)

- Asserting that improve raises scores or that regenerate always picks a better JD
- Production online monitoring / user override feedback loops (can mirror resume later)
- Changing evaluate prompt semantics or score thresholds in product code (dataset asserts current contract)
- Shipping a UI for browsing golden samples

## Sample anchors (16 total)

| Anchor id         | Label      | Intent                                                                        | Typical expectations                                           |
| ----------------- | ---------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `high_quality`    | 优质稿     | Specific tech/business, clear highlights, no boilerplate                      | High score bands; `rewrite_required: false`                    |
| `acceptable`      | 合格稿     | Mostly solid, minor gaps                                                      | Mid–high bands; `rewrite_required` true or false per sample    |
| `problematic`     | 问题稿     | Vague language, empty phrases, weak highlights                                | Lower bands; `rewrite_required: true`; `issueMustInclude` hits |
| `fabricated_risk` | 编造风险稿 | Claims company facts **not** supported by provided context (or empty context) | Must flag unsupported facts; `rewrite_required: true`          |

Each anchor has **exactly 4** samples (diverse roles / failure modes within the tier).

## Dataset schema

File: `src/lib/validation/jd-evaluate/datasets/jd-evaluate-golden-samples.v1.json`

```ts
type JdEvaluateAnchor = 'high_quality' | 'acceptable' | 'problematic' | 'fabricated_risk';

type ScoreRange = [number, number]; // inclusive, 1–10 aligned with evaluate prompt

type JdEvaluateGoldenSample = {
  id: string; // stable slug, e.g. problematic-vague-frontend-boilerplate
  anchor: JdEvaluateAnchor;
  label: string; // short Chinese label for CLI
  jd: {
    title: string;
    summary: string;
    responsibilities: string[];
    requirements: string[];
    bonus: string[];
    highlights: string[];
  };
  companyContext: string | null;
  expected: {
    scoreRanges: {
      clarity: ScoreRange;
      completeness: ScoreRange;
      attractiveness: ScoreRange;
      specificity: ScoreRange;
    };
    rewriteRequired: boolean;
    /** Optional: each string must appear in joined issues+evidence+suggestions (case-sensitive substring) */
    issueMustInclude?: string[];
  };
  rationale: string;
};

type JdEvaluateGoldenDataset = {
  version: string; // e.g. jd-evaluate-golden-dataset-v1
  description: string;
  samples: JdEvaluateGoldenSample[];
};
```

### Authoring rules

1. Samples are **synthetic / anonymized**; no real confidential JD text.
2. `scoreRanges` should be **wide enough** for LLM variance (prefer ±1–2 around intended band) but still separate anchors (e.g. high_quality clarity `[8,10]`, problematic clarity `[1,6]`).
3. `issueMustInclude` only on samples where a specific failure mode must be cited (especially `problematic` / `fabricated_risk`).
4. For `fabricated_risk`, either omit supporting context or provide context that **contradicts / lacks** the JD’s company claims.
5. Keep JSON the source of truth; bump `version` string when sample semantics change incompatibly.

## Module layout

```text
src/lib/validation/jd-evaluate/
  dataset.ts              # load + list/filter by anchor
  dataset.test.ts         # structural checks: 16 samples, 4 per anchor, schema sanity
  datasets/
    jd-evaluate-golden-samples.v1.json
  scripts/
    dataset-ops.ts        # list / show / export
    run-ops.ts            # optional true-LLM evaluate + assert
    ops.ts                # CLI entry
```

Package script (mirror resume):

- `validation:jd-evaluate` → `tsx src/lib/validation/jd-evaluate/scripts/ops.ts`

CLI:

| Command                   | Behavior                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dataset`                 | Overview: version, counts per anchor                                                                                                                                     |
| `dataset show <anchor>`   | Print samples for one anchor                                                                                                                                             |
| `dataset export <anchor>` | JSON dump for external / notebook use                                                                                                                                    |
| `run` / `run <anchor>`    | Call real evaluate LLM; print pass/fail report (needs embedding/LLM env as production evaluate does — **company context is passed through**, no RAG retrieval in runner) |
| `usage`                   | Help text                                                                                                                                                                |

Default CI: only Jest structural tests on the dataset module (no live LLM). Document that `run` is manual / optional workflow when changing `jd-agent.evaluate` or model.

## Evaluate runner contract

`run` invokes the same path production uses for evaluate stage (managed prompt `jd-agent.evaluate` / `PROMPT_VERSION`), **not** the full LangGraph:

1. Load samples (optional anchor filter).
2. For each sample, call evaluate with `jd` + `companyContext` (empty section rules apply when null/empty).
3. Compare:
   - each of 4 scores ∈ expected range
   - `rewrite_required === expected.rewriteRequired`
   - every `issueMustInclude` substring found in joined `issues`/`evidence`/`suggestions` (if present)
4. Exit non-zero if any sample fails; print table: id, scores, rewrite, missing keywords, pass/fail.
5. Report header includes `datasetVersion` + `promptVersion`.

Do **not** call knowledge retrieval inside the runner — context is fixture-owned so regressions are deterministic w.r.t. RAG.

## Quality iteration (aligned with resume doc)

| Layer                | Trigger                                          | LLM cost              | What                            |
| -------------------- | ------------------------------------------------ | --------------------- | ------------------------------- |
| `replay`             | Change dataset loader / CLI / assert helpers     | None                  | Jest structural + unit tests    |
| `golden-sample`      | Change evaluate prompt, model, or expected bands | 16 (or one anchor ×4) | `validation:jd-evaluate -- run` |
| `production-monitor` | Later                                            | —                     | Out of scope phase 1            |

When evaluate prompt text or output contract changes: bump `PROMPT_VERSION` in product code as today, re-run golden `run`, adjust sample expectations only with rationale.

## Relationship to product code

| Concern                      | Phase 1 action                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `needImprove` / `pickBetter` | Unchanged; dataset does not assert them                                                              |
| Regenerate always-improve    | Unchanged; phase 2 candidate                                                                         |
| `docs/references/`           | Optional short reference page or section pointing at this module (nice-to-have in implementation PR) |

## Phase 2 (explicitly deferred)

- Improve / regenerate closed-loop samples (input JD + `extraInstruction` → assert score non-decrease or `pickBetter`)
- Wire regenerate finalize to `pickBetter` using reevaluate scores
- Production monitoring of evaluate score distributions

## Implementation outline

1. Add JSON dataset (16 samples) + `dataset.ts` + structural Jest tests.
2. Add CLI `dataset` / `usage` (parity with resume-scoring ops style).
3. Add `run` ops calling evaluate LLM + pass/fail report.
4. Wire `package.json` script `validation:jd-evaluate`.
5. (Optional) Add `docs/references/jd-evaluate-score-quality.md` summarizing usage like the resume doc.

## Success criteria

- [ ] 16 samples committed, 4 per anchor, schema validated by Jest
- [ ] `bun run validation:jd-evaluate -- dataset` works
- [ ] `bun run validation:jd-evaluate -- run` works locally with configured LLM and reports `promptVersion` + pass/fail
- [ ] Default unit CI does not require live LLM
- [ ] Spec reviewed; phase 2 not implemented in the same PR unless explicitly requested
