# Workflow Learning Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted workflow JSON generation, deterministic execution, and automatic recovery update for `workflow-learning`.

**Architecture:** Keep existing SSE explore path intact and add a workflow lifecycle module (`solidify`, `store`, `runner`, `recovery`) plus authenticated APIs for generate/list/run. The UI gets a lightweight workflow panel to save and execute generated workflows.

**Tech Stack:** Next.js App Router, Prisma/MySQL, LangChain/OpenAI, Jest unit/API tests, existing workflow-learning SSE components.

---

### Task 1: Persistence models and core types

- [ ] Add Prisma models for workflow/workflow versions/workflow runs and run steps.
- [ ] Add workflow lifecycle types under `src/lib/workflow-learning/workflow-types.ts`.
- [ ] Generate Prisma client and verify type-check.

### Task 2: Workflow lifecycle services

- [ ] Add solidifier service that converts exploration events to workflow JSON steps.
- [ ] Add store service for create/list/get/version-update.
- [ ] Add deterministic runner with error capture and recovery hook.

### Task 3: API routes (auth required)

- [ ] Add generate endpoint to produce and persist workflow JSON from goal.
- [ ] Add list endpoint and detail endpoint.
- [ ] Add run endpoint to execute workflow and auto-recover on failure.

### Task 4: Workflow learning UI panel

- [ ] Extend `/workflow-learning` client to generate workflow JSON with a name.
- [ ] Add list + execute actions and display run/recovery result.

### Task 5: Tests and verification

- [ ] Add unit tests for solidifier/runner pure logic.
- [ ] Add API tests for auth + generate/list/run shape.
- [ ] Run target tests plus lint/type-check on modified scope.
