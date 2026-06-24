# Bun Package Manager Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the active project package manager from pnpm to Bun without changing the Next.js runtime or application behavior.

**Architecture:** Bun owns dependency installation, script execution, lockfile state, CI entry points, and deployment commands. Existing Next.js, Jest, Playwright, Prisma, and Vercel workflows keep their current responsibilities and ports.

**Tech Stack:** Bun 1.3.11, Next.js 16, React 18, TypeScript 5.7, Jest, Playwright, Prisma, MySQL, Redis.

---

### Task 1: Package Manager Metadata And Scripts

**Files:**

- Modify: `package.json`
- Modify: `package/package.json`
- Delete: `.npmrc`
- Delete: `pnpm-workspace.yaml`

- [ ] Change scripts in `package.json` from pnpm invocations to Bun invocations:
  - `test:integration:chat`: `bunx jest tests/integration/chat/real-deps.e2e.test.ts --runInBand --coverage=false`
  - `obs:run`: `bunx tsx src/scripts/llm-observability-ops.ts`
  - `obs:realtime`: `bun run obs:run -- realtime`
  - `obs:retention`: `bun run obs:run -- retention`
  - `test:integration:auth`: `bunx jest tests/integration/auth/real-deps-auth.e2e.test.ts --runInBand --coverage=false`
  - `reinstall`: `bun run clean && bun install`
- [ ] Replace the `engines.pnpm` field with `engines.bun: ">=1.3.0"`.
- [ ] Replace `packageManager` with `bun@1.3.11`.
- [ ] Add `patchedDependencies` for `@heroui/react-utils` and `@heroui/use-viewport-size`.
- [ ] Pin direct dependency and devDependency versions to the versions already resolved in the old pnpm lockfile, avoiding unrelated dependency upgrades during the package-manager migration.
- [ ] Change `package/package.json` script `dev` to `bun run build:fast --watch`.
- [ ] Delete `.npmrc` because it only contains pnpm-specific hoist and patch configuration.
- [ ] Delete `pnpm-workspace.yaml` after Bun lockfile generation confirms the workspace package is represented.

### Task 2: Active Automation Entrypoints

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.husky/pre-commit`
- Modify: `.husky/commit-msg`
- Modify: `playwright.config.ts`
- Modify: `vercel.json`
- Modify: `tests/integration/chat/test-env.ts`

- [ ] Replace CI pnpm setup with `oven-sh/setup-bun@v2` plus the existing Node 20 setup.
- [ ] Replace `pnpm install --frozen-lockfile` with `bun install --frozen-lockfile`.
- [ ] Replace CI `pnpm lint`, `pnpm type-check`, and `pnpm exec jest ...` commands with `bun run lint`, `bun run type-check`, and `bunx jest ...`.
- [ ] Replace Husky `pnpx` with `bunx`.
- [ ] Replace Husky script commands with `bun run type-check` and `bun run test ...`.
- [ ] Replace Playwright web server command with `NODE_ENV=development bunx next dev --turbopack -p 3100`.
- [ ] Replace Vercel build, dev, and install commands with Bun equivalents.
- [ ] Replace integration schema migration command with `bunx prisma migrate deploy`.

### Task 3: Active Documentation And Visible Copy

**Files:**

- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/references/database-conventions.md`
- Modify: `docs/references/auth-github-oauth.md`
- Modify: `src/app/page.tsx`
- Modify: `src/app/workflow-learning/page.tsx`
- Modify: `tests/unit/pages/Home.test.tsx`

- [ ] Update active docs from pnpm commands to Bun commands.
- [ ] Remove the pnpm public-hoist note from AGENTS and replace it with a Bun lockfile note.
- [ ] Update the home page local development command to `bun install && bun run dev`.
- [ ] Update the workflow learning Chromium install command to `bunx playwright install chromium`.
- [ ] Update the home page unit test assertion to match the new command.

### Task 4: Lockfile Migration And Verification

**Files:**

- Create: `bun.lock`
- Delete: `pnpm-lock.yaml`

- [ ] Run `bun install` from the repository root.
- [ ] Confirm `bun.lock` exists.
- [ ] Delete `pnpm-lock.yaml`.
- [ ] Run `bun run type-check`.
- [ ] Run `bun run lint`.
- [ ] Run `bun run test tests/unit/pages/Home.test.tsx --runInBand`.
- [ ] Run `bun run test:ci` if local dependencies allow it.
- [ ] Search the active scope for remaining pnpm references:
      `rg -n "\\bpnpm\\b|pnpx|pnpm-lock|pnpm-workspace|public-hoist" README.md AGENTS.md .github .husky package.json package/package.json playwright.config.ts vercel.json src tests docs/references`
