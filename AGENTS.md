# AGENTS.md

## Cursor Cloud specific instructions

### Services overview

This is a Next.js 16 SSR app with AI features (chat, JD generator, LLM observability). It uses:

- **MySQL 8.0** — Prisma-backed persistence for users, sessions, conversations, messages, LLM call logs
- **Redis 7** — chat history caching with TTL
- **OpenAI-compatible LLM** (optional) — powers chat and JD generation; JD generator falls back to built-in mock when `OPENAI_API_KEY` is unset or `JD_LLM_MOCK=true`

### Starting services

```bash
# MySQL (must run before dev server if chat/auth features are needed)
sudo chmod 755 /var/run/mysqld 2>/dev/null
sudo mysqld --user=mysql --datadir=/var/lib/mysql &
sleep 3

# Redis
sudo redis-server --daemonize yes

# Prisma migrations (idempotent)
pnpm exec prisma migrate deploy

# Dev server (Turbopack)
pnpm dev
```

### Environment files

Copy `.env.example` to `.env`, `.env.development`, `.env.local`, and `.env.test`. Add `DATABASE_URL="mysql://root:mysql1234@127.0.0.1:3306/bia"` to each — this is required by Prisma but not included in `.env.example`.

### Running checks

Standard commands from `CLAUDE.md` / `package.json`:

| Check | Command | Notes |
|---|---|---|
| Lint | `pnpm lint` | 1 pre-existing warning in `postcss.config.js` |
| Type check | `pnpm type-check` | May have pre-existing Prisma-related type issues |
| Unit tests | `pnpm test:ci` | 59/60 suites pass; `tests/integration/chat/real-deps.e2e.test.ts` fails without a real `OPENAI_API_KEY` |
| Build | `pnpm build` | Uses Turbopack |
| E2E (Cypress) | `pnpm test:e2e` | Requires dev server; Cypress binary must be installed |

### Gotchas

- The `pnpm install` post-install step runs `prisma generate` automatically. If Prisma schema changes, `pnpm exec prisma generate` must be run again.
- MySQL root user is configured with `mysql_native_password` and password `mysql1234` for local dev.
- The `pnpm approve-builds` command is interactive and should not be used in CI/automation. Build script warnings during `pnpm install` can be ignored for development.
- Pre-commit hooks (`husky`) run lint-staged, type-check, and related Jest tests. Use `git commit --no-verify` to bypass if needed during development iterations.
- Integration tests (`test:integration:chat`, `test:integration:auth`) require running MySQL and Redis instances.
