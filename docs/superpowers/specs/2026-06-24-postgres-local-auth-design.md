# Postgres Local Auth Migration Design

## Goal

Migrate Hiring Agent from MySQL + GitHub OAuth/NextAuth to PostgreSQL + a local username/password user system. The default local database connection uses user `apple`, an empty password, and otherwise default PostgreSQL settings. The app ships with one default user: username `xxwade`, password `hiring_2026`.

## Scope

This change rebuilds the database migration history as a PostgreSQL baseline. Existing MySQL data is not imported. The application should run against a fresh PostgreSQL database named `bia`, and integration tests should use the same PostgreSQL conventions with a CI/test database suffix.

The local user system replaces GitHub OAuth as the user-facing authentication path. Existing business code should keep depending on a small auth contract: `getServerAuthSession()` returns the current user session or `null`, and `requireAuth()` returns `{ user: { id } }` or throws `UnauthorizedError`.

## Database

Prisma changes:

- Change `datasource db.provider` from `mysql` to `postgresql`.
- Replace the MySQL migration history with one PostgreSQL baseline migration matching the current schema plus the local-auth fields.
- Update `prisma/migrations/migration_lock.toml` to `provider = "postgresql"`.
- Remove MySQL-only native types from `prisma/schema.prisma`, including `@db.VarChar`, `@db.LongText`, `@db.DateTime(3)`, and MySQL-specific index length assumptions.
- Keep physical table names as lowercase snake_case via `@@map`.

Model changes:

- Keep `User`, `Session`, `Conversation`, chat document, and LLM observability models.
- Remove OAuth-only `Account` and `VerificationToken` models because there is no external provider flow.
- Add `User.username` as a required unique identifier.
- Add `User.passwordHash` mapped to `password_hash`.
- Keep optional profile fields such as `name`, `email`, and `image` only if they remain useful to existing UI and tests.
- Use `Session.sessionToken` as the public token hash stored in the cookie-backed session table, with `expires` used for session expiry.

Environment changes:

- Replace `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASS`, `MYSQL_DATABASE`, and `MYSQL_CI_SUFFIX` with `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`, and `POSTGRES_CI_SUFFIX`.
- Defaults are:
  - `POSTGRES_HOST=127.0.0.1`
  - `POSTGRES_PORT=5432`
  - `POSTGRES_USER=apple`
  - `POSTGRES_PASSWORD=`
  - `POSTGRES_DATABASE=bia`
  - `POSTGRES_CI_SUFFIX=_ci`
- `buildDatabaseUrl()` returns `postgresql://apple@127.0.0.1:5432/bia` with proper URL encoding and suffix support.

## Authentication

The app should implement local auth without NextAuth or GitHub provider dependencies in the runtime path.

Core server module:

- Add focused helpers under `src/lib/auth/` for password hashing, session token generation, session lookup, and default user provisioning.
- Passwords are never stored in plain text. Use Node crypto primitives that are available without adding a heavy dependency. Store a salted derived password string containing algorithm, iteration count, salt, and hash.
- `ensureDefaultUser()` creates or updates the `xxwade` user with the configured default password hash when the user does not exist.
- Login verifies the submitted password against `passwordHash`, creates a new `Session`, sets an HTTP-only cookie, and returns a safe user payload.
- Logout deletes the current session when present and clears the cookie.
- Session lookup reads the cookie via `next/headers`, validates expiry, deletes expired sessions opportunistically, and returns `{ user: { id, name, username, email, image } }`.

Routes:

- `POST /api/auth/login`: accepts `{ username, password }`, validates credentials, creates the session cookie, and returns `{ user }`.
- `POST /api/auth/logout`: clears the current session cookie and deletes the database session if it exists.
- `GET /api/auth/session`: returns `{ user }` when authenticated and `{ user: null }` when not.
- Remove or replace the catch-all NextAuth route at `src/app/api/auth/[...nextauth]/route.ts`.

Cookie:

- Use one app-owned cookie, `hiring-agent.session`.
- Use `httpOnly`, `sameSite: "lax"`, `path: "/"`, and `secure` only in production.
- Use a reasonable default session lifetime, such as seven days.

## UI

The visible login experience changes from GitHub OAuth to a first-party login form.

- `/auth/signin` renders a username/password form.
- Default form copy uses local-account language, not GitHub.
- `SignInButton` links to `/auth/signin`.
- `UserMenu` calls the app logout endpoint and refreshes or redirects after logout.
- `Navbar` uses the app-owned session endpoint instead of `next-auth/react`.
- Protected pages such as `/chat`, `/chat-copilotkit`, and `/workflow-learning` keep their server-side auth checks but update copy from "GitHub account" to local account login.
- `AuthSessionProvider` is removed or replaced with a lightweight provider only if the client navbar needs shared state.

## Testing

Use TDD for implementation. Expected coverage:

- Unit tests for password hashing and verification.
- Unit tests for login success, invalid password, missing fields, logout, and session lookup.
- Unit tests for `getServerAuthSession()` and `requireAuth()`.
- Component tests for the sign-in form, sign-in button, user menu, and navbar auth states.
- Update integration test helpers from MySQL to PostgreSQL using a real PostgreSQL database.
- Update E2E tests and seeded-session fixtures to use `hiring-agent.session` and local users.

Verification commands:

- Targeted Jest tests for auth and env/database URL changes.
- `pnpm type-check`.
- Relevant integration tests when PostgreSQL and Redis are reachable.
- Full `pnpm test:ci` before final completion if runtime dependencies allow it.

## Migration Notes

Because the project is switching providers and the user approved a fresh baseline, old MySQL migration directories should be replaced by a PostgreSQL baseline rather than edited in place. Historical docs that describe GitHub OAuth or MySQL may remain as archived design history, but active references such as `.env.example` and `docs/references/database-conventions.md` must reflect PostgreSQL and local auth.

No secrets are committed. The default password is a requested local bootstrap credential; only its derived hash is persisted in the database.

## Open Decisions Resolved

- Existing MySQL data import: not included.
- Database user: `apple`.
- Database password: empty.
- Database host, port, and database name: PostgreSQL defaults with app database `bia`.
- Default app user: `xxwade`.
- Default app password: `hiring_2026`.
