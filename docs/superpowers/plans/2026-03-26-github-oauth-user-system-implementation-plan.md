# GitHub OAuth User System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub OAuth-based user authentication with persistent user/session models, enforce user-scoped access for chat/conversation APIs, and validate behavior with real MySQL and Redis integration tests.

**Architecture:** Use Auth.js/NextAuth + Prisma Adapter with database sessions. Keep existing API shape, add a shared server auth guard, and migrate conversation ownership from loosely-typed `userId` to a formal relation with `User`. Test with deterministic fixtures against real dependencies (no in-memory replacements, no live GitHub calls in integration tests).

**Tech Stack:** Next.js App Router, TypeScript, Auth.js/NextAuth, Prisma, MySQL, Redis, Jest, Playwright/Cypress.

---

## File Structure (Planned Changes)

- Create: `src/auth.ts`  
  Responsibility: NextAuth config, GitHub provider, Prisma adapter, session callback contract (`session.user.id`).
- Create: `src/app/api/auth/[...nextauth]/route.ts`  
  Responsibility: NextAuth route handlers.
- Create: `src/lib/auth/session.ts`  
  Responsibility: shared `requireAuth()` / `getServerAuthSession()` helpers for API routes.
- Create: `src/types/auth.d.ts`  
  Responsibility: module augmentation for `Session.user.id`.
- Create: `src/components/auth/sign-in-button.tsx`  
  Responsibility: GitHub login entry.
- Create: `src/components/auth/user-menu.tsx`  
  Responsibility: display user/login state + logout action.
- Modify: `prisma/schema.prisma`  
  Responsibility: add `User/Account/Session/VerificationToken` models and conversation relation/index updates.
- Modify: `src/app/api/chat/route.ts`  
  Responsibility: require auth before processing chat.
- Modify: `src/app/api/conversations/route.ts`  
  Responsibility: require auth and scope list/create by current user.
- Modify: `src/app/api/conversations/[id]/messages/route.ts`  
  Responsibility: enforce owner-only access.
- Modify: `src/app/api/conversations/[id]/messages/stream/route.ts`  
  Responsibility: enforce owner-only access for streaming path.
- Modify: `src/components/navbar.tsx`  
  Responsibility: render auth state and login/logout actions.
- Modify: `src/app/chat/page.tsx`  
  Responsibility: unauthenticated UX handling.
- Create: `tests/unit/lib/auth/session.test.ts`
- Create: `tests/unit/api/auth-guard.test.ts`
- Modify: `tests/unit/api/conversations-route.test.ts`
- Create: `tests/integration/auth/real-deps-auth.e2e.test.ts`
- Modify: `tests/integration/chat/real-deps.e2e.test.ts`
- Create: `tests/integration/auth/test-fixtures.ts`

## Task 1: Add Prisma Auth Models and Conversation Relation

**Files:**

- Modify: `prisma/schema.prisma`
- Test: `pnpm exec prisma validate` (schema-level verification)

- [ ] **Step 1: Write a failing schema check expectation**

  Add TODO assertions in task notes:
  - Schema must include `User`, `Account`, `Session`, `VerificationToken`.
  - `Conversation` must reference `User` via `userId`.
  - Index on `Conversation.userId` must exist.

- [ ] **Step 2: Run validation to capture current failure/gap**

  Run: `pnpm exec prisma validate`  
  Expected: currently valid, but required auth models/relations missing per spec checklist.

- [ ] **Step 3: Implement minimal schema changes**

  Update `prisma/schema.prisma` with canonical Auth.js Prisma models for the installed version and conversation relation/index.

- [ ] **Step 4: Re-run schema validation**

  Run: `pnpm exec prisma validate`  
  Expected: PASS.

- [ ] **Step 5: Generate and review migration**

  Run: `pnpm exec prisma migrate dev --name add-auth-models-and-conversation-user-relation`  
  Expected: migration generated successfully and SQL looks safe.

- [ ] **Step 6: Commit**

  Run:
  `git add prisma/schema.prisma prisma/migrations`  
  `git commit -m "feat(auth): add prisma auth models and conversation ownership relation"`

## Task 2: Implement Auth.js Core Setup

**Files:**

- Create: `src/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/types/auth.d.ts`
- Test: `tests/unit/lib/auth/session.test.ts`

- [ ] **Step 1: Write failing unit test for session contract**

  In `tests/unit/lib/auth/session.test.ts`, assert the session callback returns `session.user.id` when user exists.

- [ ] **Step 2: Run test to verify failure**

  Run: `pnpm exec jest tests/unit/lib/auth/session.test.ts --runInBand`  
  Expected: FAIL (files/config not implemented yet).

- [ ] **Step 3: Implement Auth.js config and route handlers**
  - Add GitHub provider.
  - Add Prisma adapter.
  - Set database session strategy.
  - Implement `callbacks.session` to guarantee `session.user.id`.
  - Export route handlers for App Router auth endpoint.

- [ ] **Step 4: Add TS module augmentation**

  Ensure `Session.user.id: string` typing in `src/types/auth.d.ts`.

- [ ] **Step 5: Re-run test**

  Run: `pnpm exec jest tests/unit/lib/auth/session.test.ts --runInBand`  
  Expected: PASS.

- [ ] **Step 6: Commit**

  Run:
  `git add src/auth.ts src/app/api/auth/[...nextauth]/route.ts src/types/auth.d.ts tests/unit/lib/auth/session.test.ts`  
  `git commit -m "feat(auth): configure github oauth with prisma adapter"`

## Task 3: Build Shared Server Auth Guard

**Files:**

- Create: `src/lib/auth/session.ts`
- Create: `tests/unit/api/auth-guard.test.ts`

- [ ] **Step 1: Write failing tests for auth guard behavior**

  Validate:
  - unauthenticated => throws/returns unauthorized signal
  - authenticated => returns normalized user/session context with `user.id`

- [ ] **Step 2: Run tests to verify failure**

  Run: `pnpm exec jest tests/unit/api/auth-guard.test.ts --runInBand`  
  Expected: FAIL.

- [ ] **Step 3: Implement minimal guard helper**

  Add `getServerAuthSession()` and `requireAuth()` helper(s) in `src/lib/auth/session.ts`.

- [ ] **Step 4: Re-run tests**

  Run: `pnpm exec jest tests/unit/api/auth-guard.test.ts --runInBand`  
  Expected: PASS.

- [ ] **Step 5: Commit**

  Run:
  `git add src/lib/auth/session.ts tests/unit/api/auth-guard.test.ts`  
  `git commit -m "feat(auth): add shared server auth guard helpers"`

## Task 4: Enforce Auth + Ownership in Conversation/Chat APIs

Intentional order note: API authorization is implemented before UI polish to close backend exposure risk as early as possible. UI updates follow immediately in Task 5.

**Files:**

- Modify: `src/app/api/chat/route.ts`
- Modify: `src/app/api/conversations/route.ts`
- Modify: `src/app/api/conversations/[id]/messages/route.ts`
- Modify: `src/app/api/conversations/[id]/messages/stream/route.ts`
- Modify: `tests/unit/api/conversations-route.test.ts`
- Create: `tests/unit/api/chat-auth-route.test.ts`

- [ ] **Step 1: Add failing tests for API auth/ownership**

  Cover:
  - no session => `401`
  - owner access => success
  - non-owner access => `404`
  - create conversation writes `userId = session.user.id`

- [ ] **Step 2: Run tests to verify failure**

  Run:  
  `pnpm exec jest tests/unit/api/conversations-route.test.ts tests/unit/api/chat-auth-route.test.ts --runInBand`  
  Expected: FAIL.

- [ ] **Step 3: Implement minimal route changes**

  Use shared auth guard and enforce user-scoped filters/writes.

- [ ] **Step 4: Re-run tests**

  Run:  
  `pnpm exec jest tests/unit/api/conversations-route.test.ts tests/unit/api/chat-auth-route.test.ts --runInBand`  
  Expected: PASS.

- [ ] **Step 5: Commit**

  Run:
  `git add src/app/api/chat/route.ts src/app/api/conversations/route.ts src/app/api/conversations/[id]/messages/route.ts src/app/api/conversations/[id]/messages/stream/route.ts tests/unit/api/conversations-route.test.ts tests/unit/api/chat-auth-route.test.ts`  
  `git commit -m "feat(api): enforce auth and ownership for chat routes"`

## Task 5: Add Auth UI Entry and Session State Surfaces

**Files:**

- Create: `src/components/auth/sign-in-button.tsx`
- Create: `src/components/auth/user-menu.tsx`
- Modify: `src/components/navbar.tsx`
- Modify: `src/app/chat/page.tsx`
- Test: `src/components/navbar.test.tsx` (create if absent)

- [ ] **Step 1: Write failing UI tests**

  Validate:
  - unauthenticated navbar shows GitHub sign-in
  - authenticated navbar shows user menu + logout
  - chat page prompts login when unauthenticated

- [ ] **Step 2: Run tests to verify failure**

  Run: `pnpm exec jest src/components/navbar.test.tsx --runInBand`  
  Expected: FAIL.

- [ ] **Step 3: Implement minimal UI changes**

  Wire Auth.js client actions (`signIn('github')`, `signOut()`), keep UI consistent with existing design.

- [ ] **Step 4: Re-run tests**

  Run: `pnpm exec jest src/components/navbar.test.tsx --runInBand`  
  Expected: PASS.

- [ ] **Step 5: Commit**

  Run:
  `git add src/components/auth/sign-in-button.tsx src/components/auth/user-menu.tsx src/components/navbar.tsx src/app/chat/page.tsx src/components/navbar.test.tsx`  
  `git commit -m "feat(ui): add github login state to navbar and chat page"`

## Task 6: Real-Dependency Integration Tests (MySQL + Redis)

**Files:**

- Create: `tests/integration/auth/test-fixtures.ts`
- Create: `tests/integration/auth/real-deps-auth.e2e.test.ts`
- Modify: `tests/integration/chat/real-deps.e2e.test.ts`
- Modify: `tests/integration/chat/test-env.ts`

- [ ] **Step 1: Write failing integration tests first**

  Add tests for:
  - seeded auth session can access protected conversation routes
  - non-owner session gets `404`
  - unauthenticated call gets `401`
  - legacy `Conversation.userId = null` rows are excluded from authenticated reads
  - Redis-dependent auth/chat flow failure-mode coverage

- [ ] **Step 2: Run integration tests and capture failing baseline**

  Run:  
  `pnpm exec jest tests/integration/auth/real-deps-auth.e2e.test.ts --runInBand --coverage=false`  
  Expected: FAIL before fixture/helper wiring.

- [ ] **Step 3: Implement deterministic fixtures and env handling**
  - Use real MySQL/Redis.
  - Avoid live GitHub calls by seeding `User/Account/Session` directly.
  - Require `.env` baseline copy for test env and fail fast on missing required keys.
  - Add explicit MySQL/Redis connectivity health checks (ping/query) with deterministic fail-fast error messages.

- [ ] **Step 4: Re-run integration suites**

  Run:  
  `pnpm run test:integration:chat`  
  `pnpm exec jest tests/integration/auth/real-deps-auth.e2e.test.ts --runInBand --coverage=false`  
  Expected: PASS with real dependencies.

- [ ] **Step 5: Commit**

  Run:
  `git add tests/integration/auth/test-fixtures.ts tests/integration/auth/real-deps-auth.e2e.test.ts tests/integration/chat/real-deps.e2e.test.ts tests/integration/chat/test-env.ts`  
  `git commit -m "test(integration): cover auth ownership with real mysql and redis"`

## Task 7: E2E Auth Coverage

**Files:**

- Create: `tests/e2e-playwright/auth-github.spec.ts`

- [ ] **Step 1: Write failing E2E tests**

  Cover:
  - login entry is visible for unauthenticated users
  - protected chat page blocks unauthenticated access
  - logout resets UI and protected API access is denied

- [ ] **Step 2: Run E2E to verify failure**

  Run: `pnpm exec playwright test tests/e2e-playwright/auth-github.spec.ts`  
  Expected: FAIL before implementation/wiring is complete.

- [ ] **Step 3: Implement minimal E2E harness setup**
  - Use deterministic seeded auth state where possible for CI reliability.
  - Keep live provider flow as optional manual smoke path, not CI blocker.

- [ ] **Step 4: Re-run E2E**

  Run: `pnpm exec playwright test tests/e2e-playwright/auth-github.spec.ts`  
  Expected: PASS in configured environment.

- [ ] **Step 5: Commit**

  Run:
  `git add tests/e2e-playwright/auth-github.spec.ts`  
  `git commit -m "test(e2e): add auth entry and logout protection coverage"`

## Task 8: Environment and Documentation Finalization

**Files:**

- Modify: `.env.example`
- Modify: `README.md`
- Create: `docs/references/auth-github-oauth.md`

- [ ] **Step 1: Write failing doc checklist**

  Checklist:
  - required env vars listed exactly once with chosen naming convention
  - test env copy flow documented
  - GitHub OAuth callback URL documented

- [ ] **Step 2: Implement minimal docs updates**

  Document:
  - required keys (`GITHUB_ID`, `GITHUB_SECRET`, auth secret/url keys, `DATABASE_URL`, `REDIS_URL`)
  - `.env` -> `.env.test` copy workflow
  - integration test prerequisites and commands
  - health-check behavior for MySQL/Redis in integration tests

- [ ] **Step 3: Run final verification command set**

  Run:  
  `pnpm run lint && pnpm run type-check && pnpm run test && pnpm run test:integration:chat`  
  Expected: all PASS in configured environment.

- [ ] **Step 4: Commit**

  Run:
  `git add README.md .env.example docs/references/auth-github-oauth.md`  
  `git commit -m "docs(auth): document github oauth setup and real-deps testing"`

## Task 9: Resilience and Security Requirements

**Files:**

- Modify: `src/app/api/chat/route.ts`
- Modify: `src/app/api/conversations/route.ts`
- Modify: `src/app/api/conversations/[id]/messages/route.ts`
- Modify: `src/app/api/conversations/[id]/messages/stream/route.ts`
- Modify: `src/auth.ts`
- Create: `tests/unit/api/dependency-outage-status.test.ts`
- Create: `tests/unit/auth/oauth-error-flow.test.ts`

- [ ] **Step 1: Write failing tests for outage/error-handling**

  Cover:
  - DB or Redis dependency outage returns `503` on impacted endpoints.
  - OAuth failure redirects to sign-in entry and exposes a user-friendly error message.
  - auth-failure logging redacts tokens/secrets.

- [ ] **Step 2: Run tests to verify failure**

  Run:  
  `pnpm exec jest tests/unit/api/dependency-outage-status.test.ts tests/unit/auth/oauth-error-flow.test.ts --runInBand`  
  Expected: FAIL.

- [ ] **Step 3: Implement minimal resilience/security handling**
  - Map dependency-availability failures to deterministic `503` responses.
  - Configure auth error route/handling for OAuth failure UX path.
  - Add redacted logging helper and route all auth failure logs through it.

- [ ] **Step 4: Re-run tests**

  Run:  
  `pnpm exec jest tests/unit/api/dependency-outage-status.test.ts tests/unit/auth/oauth-error-flow.test.ts --runInBand`  
  Expected: PASS.

- [ ] **Step 5: Commit**

  Run:
  `git add src/auth.ts src/app/api/chat/route.ts src/app/api/conversations/route.ts src/app/api/conversations/[id]/messages/route.ts src/app/api/conversations/[id]/messages/stream/route.ts tests/unit/api/dependency-outage-status.test.ts tests/unit/auth/oauth-error-flow.test.ts`  
  `git commit -m "fix(auth): add oauth error ux and dependency outage handling"`

## Final Validation Checklist

- [ ] Prisma migrations apply cleanly on a fresh database.
- [ ] Auth route works and creates persistent user/session records.
- [ ] `session.user.id` available in runtime + type system.
- [ ] Protected APIs return correct status codes (`401`, `404`, success).
- [ ] Protected APIs return `503` for dependency outages where applicable.
- [ ] Conversation ownership isolation enforced.
- [ ] Integration tests pass against real MySQL and Redis.
- [ ] Env setup follows `.env` baseline copy rule.
