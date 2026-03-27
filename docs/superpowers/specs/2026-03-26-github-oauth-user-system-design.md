# GitHub OAuth User System Design

## Background

The current system has no user model and no authentication flow. The project uses Next.js App Router with Prisma + MySQL, and has existing chat/conversation APIs that currently rely on a nullable string `userId` field without formal user ownership enforcement.

The goal is to introduce a production-ready user system with GitHub OAuth login/register behavior (first login equals registration), while keeping scope MVP-focused and aligned with existing architecture.

## Scope

### In Scope

- Add a persistent user system with Prisma models compatible with Auth.js (NextAuth) Prisma Adapter.
- Add GitHub OAuth login and logout capability.
- Introduce authenticated sessions and server-side auth checks for protected APIs.
- Bind conversation ownership to authenticated users.
- Add integration tests using real MySQL and Redis.
- Reuse environment variable setup by copying from current project `.env` baseline.

### Out of Scope (MVP)

- Email/password login.
- Multi-provider OAuth setup.
- Email conflict merge policy and account-link UX.
- User profile management pages.

## Chosen Approach

Use Auth.js/NextAuth with Prisma Adapter and GitHub provider.

Why this approach:

- Mature and well-supported path for App Router.
- Standardized user/account/session persistence models.
- Lower security and maintenance risk than custom OAuth implementation.
- Easy path to add additional OAuth providers later.

## Architecture

### Layers

- Auth Core Layer: NextAuth handles OAuth handshake, callbacks, session lifecycle.
- Persistence Layer: Prisma persists `User`, `Account`, `Session`, `VerificationToken` and business models.
- Integration Layer:
  - UI components for sign-in/sign-out/session display.
  - API routes that enforce server-side session checks.

### Suggested File Layout

- `src/auth.ts` - NextAuth config (providers, adapter, callbacks).
- `src/app/api/auth/[...nextauth]/route.ts` - Auth route handler.
- `src/lib/auth/session.ts` - Shared server helper for auth session retrieval.
- `src/components/auth/*` - Auth UI components.
- `prisma/schema.prisma` - Auth models + relation updates.

### Session Contract

- Use explicit session strategy: `database` (with Prisma Adapter) for server-side revocable sessions.
- Implement `callbacks.session` to guarantee `session.user.id` is always populated from persisted user ID.
- Add TypeScript module augmentation so `Session.user.id` is typed as `string`.
- Block rollout of protected route logic until `session.user.id` contract is covered by tests.

## Data Model Design

### Auth Models

Add standard models required by Prisma Adapter:

- `User`
- `Account`
- `Session`
- `VerificationToken`

Use Auth.js Prisma canonical model fields/relations for the installed version, including required relation delete/update behavior.
Use standard unique/index constraints, especially:

- `Account(provider, providerAccountId)` unique constraint
- Session lookup index by `sessionToken`
- User lookup indexes required by adapter relations

### Conversation Ownership

Update `Conversation` to formally relate to `User`:

- Keep `Conversation.userId` nullable initially for backward compatibility.
- Add relation:
  - `Conversation.user -> User`
  - `User.conversations -> Conversation[]`
- Add index on `Conversation.userId` for user-scoped queries.

### ID Strategy

- Use string IDs (`cuid()` or `uuid()`) consistently for compatibility with existing schema patterns.

## Auth and Access Flow

### User Login/Register

- User clicks "Sign in with GitHub".
- Redirect to GitHub OAuth authorization.
- Callback returns to NextAuth endpoint.
- First successful login creates user/account/session records automatically.
- Subsequent logins reuse existing account mapping.

### Logout

- `signOut()` clears active session and redirects to `/`.
- Protected pages and API calls must immediately reflect signed-out state.

### Protected APIs

Apply session guard policy to all conversation/chat endpoints. Current known routes:

- `src/app/api/chat/route.ts`
- `src/app/api/conversations/route.ts`
- `src/app/api/conversations/[id]/messages/route.ts`
- `src/app/api/conversations/[id]/messages/stream/route.ts`

Unauthenticated requests return `401` JSON.
All future conversation/chat mutation endpoints must use the same shared auth-guard utility.

### Authorization Rules

- Conversation access must be scoped by current authenticated user:
  - Query filter includes `userId = session.user.id`.
- Conversation creation writes `userId = session.user.id`.
- Access to conversations owned by others should return `404` (preferred to reduce resource existence leakage).

## Error Handling

- OAuth failure: redirect to sign-in entry with user-friendly message.
- Missing/expired session: return `401` for APIs and present login prompt for UI.
- Dependency outage (MySQL/Redis): return `503` for impacted endpoints and log root cause.
- Authorization failure on foreign resource: return `404`.

## Testing Strategy

### Unit Tests

- NextAuth callbacks/session mapping behavior.
- API auth guard branching for unauthorized requests.

### Integration Tests (Required: Real Dependencies)

- Use real MySQL and Redis (no in-memory substitutes).
- Integration tests must not depend on live GitHub network calls.
- Validate end-to-end persistence and ownership behavior:
  - Auth persistence behavior using controlled fixtures (seeded user/account/session) or an internal test hook.
  - Authenticated conversation creation binds correct `userId`.
  - Protected route responses for unauthenticated vs authenticated requests.
  - Authorization rejection for non-owner access.
  - Redis-backed flows explicitly covered (at least one success case and one failure-mode case per flow).
- Add deterministic fixture setup/cleanup per test run.

### E2E Tests

- Sign-in entry and authenticated UI state.
- Chat page protected access behavior.
- Logout and post-logout protected API denial.

## Environment Strategy

- Copy from existing project `.env` as baseline.
- Test env source-of-truth: copy baseline into `.env.test` (or project-standard test env file) and add minimal auth keys.
- Use one naming convention based on installed auth package version, without mixing aliases:
  - Auth.js v5 style: `AUTH_SECRET`, `AUTH_URL` (if required by deployment/runtime)
  - NextAuth legacy naming (only if project version requires): `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- Required keys to verify/present:
  - `GITHUB_ID`, `GITHUB_SECRET`, `DATABASE_URL`, `REDIS_URL`
  - plus auth secret/url keys for the chosen naming convention
- Integration test startup should include dependency health checks for MySQL and Redis, and fail fast if unavailable.

## Security Notes (MVP)

- Use secure session cookie defaults via NextAuth.
- Keep secrets only in environment variables.
- Log auth failures with safe redaction (no token leakage).
- Defer account-link and email-conflict policy to post-MVP.

## Rollout Plan (High-Level)

1. Schema update and Prisma migration for auth models + conversation relation.
2. NextAuth setup with GitHub provider and adapter wiring.
3. UI auth entry points and login-state surface.
4. API guard and ownership enforcement updates.
5. Real MySQL/Redis integration test coverage and validation.
6. Incremental verification in local dev and CI.

## Acceptance Criteria

- GitHub login works and first login creates a persistent user identity.
- Authenticated session is available on server routes.
- `session.user.id` is guaranteed in runtime and type system.
- Protected API routes reject unauthenticated access with `401`.
- Conversation reads/writes are user-scoped and block cross-user access.
- Legacy `Conversation.userId = null` records are not exposed to authenticated user data paths unless explicitly backfilled.
- Integration tests run against real MySQL and Redis.
- `.env`-based configuration follows existing project baseline with minimal additions.

## Risks and Mitigations

- OAuth app misconfiguration -> provide explicit setup checklist and callback URL validation.
- Existing null `userId` conversations -> keep nullable initially, hide from user-scoped reads, and run controlled backfill later.
- Test flakiness from external dependencies -> add health checks and deterministic fixtures.

## Future Enhancements

- Add Google provider and multi-provider account linking.
- Define and implement email conflict/merge policy.
- Add explicit user settings/profile management.
- Add role-based authorization where needed.
