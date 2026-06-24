# Bun Package Manager Migration Design

## Goal

Move the active project toolchain from pnpm to Bun as the package manager, while keeping the Next.js app runtime, ports, test framework, and deployment shape unchanged.

## Scope

This migration updates active development and deployment entry points only:

- Root package metadata, scripts, engines, and lockfile.
- CI, Husky, Playwright web server, and Vercel commands.
- README, AGENTS instructions, active reference docs, page-visible setup copy, and matching tests.

Historical implementation plans under `docs/plans` and older `docs/superpowers/plans` remain unchanged because they describe past work.

## Architecture

The app remains a Next.js App Router project running on Node-compatible tooling. Bun is used for dependency installation, script execution, and local binary dispatch. Existing npm package dependencies remain unchanged unless Bun resolution requires a lockfile-only adjustment.

## Migration Details

- Replace `packageManager: pnpm@...` with `bun@1.3.11`.
- Replace the pnpm engine constraint with a Bun engine constraint.
- Convert scripts that shell out to `pnpm` or `pnpm exec` to `bun run` or `bunx`.
- Move pnpm patch declarations from `.npmrc` into `package.json` `patchedDependencies`.
- Pin direct dependency versions to the versions already resolved in the old pnpm lockfile to avoid a package-manager migration also becoming a dependency upgrade.
- Remove pnpm-only workspace and lock files after generating `bun.lock`.
- Keep Playwright on port 3100 and daily development on port 3000.

## Error Handling

If `bun install` cannot migrate the pnpm lockfile cleanly, regenerate the Bun lockfile from `package.json` after pinning direct dependencies to the versions already resolved in the old lockfile. Preserve the existing HeroUI package patches through Bun `patchedDependencies`. If verification fails because of missing external services, report the exact command and failure instead of hiding the gap.

## Testing

Verification should include:

- `bun install`
- `bun run type-check`
- `bun run lint`
- Focused Jest tests covering changed page copy.
- `bun run test:ci` when the local environment can satisfy the suite.
