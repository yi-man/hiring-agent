# Hiring Agent（招聘助手）

面向招聘与 HR 场景的 Next.js 应用：**AI 对话与文档 RAG**、**JD 生成与评估**、**Workflow 学习**、**LLM 可观测性**，以及本地账号认证与 Prisma/PostgreSQL/Redis 等基础设施。

详细命令、端口、测试约定与架构说明见 [`CLAUDE.md`](CLAUDE.md)（与 [`AGENTS.md`](AGENTS.md) 同步）。

## 技术栈（摘要）

- Next.js 16 App Router、React 18、TypeScript、Tailwind CSS 4
- Prisma + PostgreSQL、Redis、可选 Qdrant；本地用户名密码认证
- Jest、Playwright；pnpm

## 快速开始

```bash
pnpm install
pnpm dev
```

浏览器打开 <http://localhost:3000>。Playwright E2E 默认在 **3100** 端口拉起 dev 服务器（见 `playwright.config.ts`）。

本地默认数据库连接为 `postgresql://apple@127.0.0.1:5432/bia`。首次启动前请创建 `bia` 数据库并执行 `pnpm exec prisma migrate deploy`。默认登录账号为 `xxwade`，密码为 `hiring_2026`。

## 常用脚本

| 命令                            | 说明                  |
| ------------------------------- | --------------------- |
| `pnpm dev`                      | 本地开发（Turbopack） |
| `pnpm build` / `pnpm start`     | 生产构建与启动        |
| `pnpm lint` / `pnpm type-check` | 规范与类型检查        |
| `pnpm test` / `pnpm test:ci`    | Jest 单测             |
| `pnpm test:e2e`                 | Playwright E2E        |

更多脚本（集成测试、Workflow E2E、LLM 运维等）见 `package.json` 与 `CLAUDE.md`。

## 许可证

MIT
