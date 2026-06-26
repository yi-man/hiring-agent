### Project: Hiring Agent（招聘助手）

Next.js 16 App Router SSR 应用，React 18、TypeScript 5.7、Tailwind CSS 4；集成 AI 对话、职位描述（JD）生成、LLM 可观测性、对话文档与 RAG（Prisma + PostgreSQL、Redis、可选 Qdrant）、本地账号认证与 shadcn/HeroUI 组件。

---

### 规范

- 使用 **Bun** 管理依赖；Node ≥ 20、Bun ≥ 1.3；路径别名 **`@/`** 指向 `src/`。
- **TypeScript** 严格类型，避免滥用 `any`；新增逻辑配套测试与类型；遵循 ESLint + Prettier（提交前 lint-staged）。
- **提交**：commitlint 约定式提交（`feat` / `fix` / `docs` / `style` / `refactor` / `test` / `chore`）；pre-commit 会跑 lint-staged、`bun run type-check`、相关 Jest 测试。
- **数据与配置**：数据库与缓存 schema 变更需 **Prisma migrate** 并 `prisma generate`；**表/字段命名、映射、本地连接与迁移步骤**见 [`docs/references/database-conventions.md`](docs/references/database-conventions.md)。环境变量以 `.env.example` 为基准，勿把密钥写入仓库。
- **范围控制**：改动聚焦需求本身，避免无关重构；与现有代码风格、导出方式、目录约定保持一致。

---

### 常用命令

- `bun install`：安装依赖（post-install 会执行 `prisma generate`）。
- `bun run dev`：开发服务器，**Turbopack**，默认 **http://localhost:3000**（勿随意改端口；Playwright 见下）。
- **Workflow Learning**（`/workflow-learning`）：Phase 1 在服务端用 **`playwright`** 包起 Chromium；本机首次需安装浏览器，例如 `bunx playwright install chromium`（与 E2E 的 `@playwright/test` 不同端口/用途，可共用已下载的浏览器缓存）。
- `bun run build` / `bun run start`：生产构建与启动。
- `bun run lint` / `bun run lint:fix` / `bun run format` / `bun run type-check`：规范与类型检查。
- `bun run test`：Jest 单测 + 覆盖率；`bun run test:watch`：监听；`bun run test:ci`：CI 用单测。
- `bun run test:e2e` / `bun run test:e2e:playwright` / `bun run test:e2e:playwright:jd`：Playwright E2E（`playwright.config.ts` 默认在 **3100** 拉起 `next dev`，与日常 `bun run dev` 的 3000 不同）。
- `bun run test:e2e:playwright:workflow`：**Workflow Learning** 真实链路 E2E（需 **PostgreSQL** 会话种子、`OPENAI_API_KEY`、本机已 `playwright install`；与 chat 文档流用例同为 **无 mock**）。Bun 统一使用根目录 `bun.lock`，避免混用其他包管理器锁文件。
- `bun run test:integration:chat` / `bun run test:integration:auth`：真实 PostgreSQL/Redis 等依赖的集成测试。
- `bunx prisma migrate deploy`：部署迁移；`bun run prisma:generate`：仅生成客户端。
- `bun run obs:run` / `bun run obs:realtime` / `bun run obs:retention`：LLM 可观测性运维脚本。
- `bun run clean` / `bun run reinstall`：清理与重装。

---

### 项目架构

```
├── prisma/                    # Prisma schema 与 migrations（PostgreSQL）
├── public/                    # 静态资源
├── src/
│   ├── app/                   # App Router：页面与 API Route
│   │   ├── api/               # REST：chat、conversations、jd、auth、llm-stats、health 等
│   │   ├── chat/              # 对话页
│   │   ├── jd-generator/      # JD 生成工作台
│   │   ├── llm-observability/ # LLM 可观测性看板
│   │   └── …                  # 首页、登录等（无独立营销站页面）
│   ├── components/            # 可复用 UI（含 ui/、auth/、chat/、jd-generator/、llm-observability/）
│   ├── hooks/                 # 自定义 Hooks
│   ├── lib/                   # 工具与领域逻辑（prisma、chat、jd-agent、llm-observability、rag、auth、env）
│   ├── scripts/               # 运维脚本（如 llm-observability-ops）
│   └── types/                 # 类型定义
├── tests/
│   ├── unit/                  # Jest 单元测试
│   ├── integration/           # Jest：真实依赖集成 / API E2E 等
│   └── e2e-playwright/        # Playwright 浏览器 E2E
├── playwright.config.ts
├── jest.config.mjs
├── next.config.mjs
└── 配置文件（eslint、prettier、tailwind、tsconfig 等）
```

---

### 重要说明

- **TDD 驱动**：完善单测与集成测试；新功能优先补测试再改实现。
- **真实环境**：测试尽量对接真实依赖；集成与 real-deps 类用例需真实 **PostgreSQL**、**Redis**（及相应 API Key 时 LLM）；数据库用真实实例而非内存假库。
- **排错与收尾**：遇到问题优先用 systematic-debugging 思路查清根因再改；**改完后须本地验证并跑完相关/全量测试**再视为完成。
- **端口**：日常开发默认 **3000**；Playwright 使用 **3100**（见 `playwright.config.ts`），勿随意改动以免 E2E 失效。
- **数据库与本地依赖**：PostgreSQL / Redis、`DATABASE_URL`、迁移顺序与 Prisma 注意点见 [`docs/references/database-conventions.md`](docs/references/database-conventions.md)。
- **LLM**：OpenAI 兼容接口；运行时 JD 生成需要配置 `OPENAI_API_KEY`，内置 mock 仅用于测试环境；`tests/integration/chat/real-deps.e2e.test.ts` 无真实 Key 可能失败。
