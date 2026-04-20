# Hiring Agent（招聘助手）

面向招聘与 HR 场景的 Next.js 应用：**AI 对话与文档 RAG**、**JD 生成与评估**、**Workflow 学习**、**LLM 可观测性**，以及 NextAuth 与 Prisma/MySQL/Redis 等基础设施。

详细命令、端口、测试约定与架构说明见 [`CLAUDE.md`](CLAUDE.md)（与 [`AGENTS.md`](AGENTS.md) 同步）。

## 技术栈（摘要）

- Next.js 16 App Router、React 18、TypeScript、Tailwind CSS 4
- Prisma + MySQL、Redis、可选 Qdrant；NextAuth
- Jest、Playwright；pnpm

## 快速开始

```bash
pnpm install
pnpm dev
```

浏览器打开 <http://localhost:3000>。Playwright E2E 默认在 **3100** 端口拉起 dev 服务器（见 `playwright.config.ts`）。

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
