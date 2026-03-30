# Next.js 16 SSR Template

一个现代化、生产就绪的 Next.js 16 SSR 模板，包含完整的技术栈、代码规范、测试配置和工程化配置。

## 技术栈

- **Next.js 16.1.6** - 服务端渲染框架
- **React 19.2.4** - 用户界面库
- **TypeScript 5.7** - 类型安全的 JavaScript 超集
- **Tailwind CSS 4.2.1** - 实用优先的 CSS 框架
- **shadcn/ui 3.8.5** - 现代化的 UI 组件库
- **pnpm 10.9.2** - 快速、节省空间的包管理器
- **Jest** - JavaScript 测试框架
- **Playwright** - 端到端测试工具
- **ESLint 9.15.0** - 代码规范检查工具
- **Prettier** - 代码格式化工具
- **Husky 9.1.7** - Git 钩子工具

## 特性

### 架构设计

- 使用 Next.js 16 App Router 架构
- 服务端渲染 (SSR) 支持
- 静态页面生成 (SSG) 支持
- 深色/浅色主题切换
- 响应式设计

### 开发体验

- 完整的代码规范流程 (ESLint + Prettier + Husky)
- 类型安全开发
- 热重载和快速刷新
- 组件库支持
- 模拟数据支持
- 自动化测试

### UI 组件

- 使用 shadcn/ui 组件库
- 包含常用的 UI 组件 (按钮、卡片、对话框、表单组件等)
- 主题切换组件
- 响应式导航栏

### 性能优化

- 优化的打包配置
- 代码分割和懒加载
- 图片优化
- 缓存策略

## 快速开始

### 环境要求

- Node.js 20+
- pnpm 10.9.2+

### 安装依赖

```bash
pnpm install
```

### 开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000 查看应用。

### 生产构建

```bash
pnpm build
```

### 生产服务器

```bash
pnpm start
```

### 运行测试

```bash
# 运行 Jest 测试
pnpm test

# 运行 Jest 测试并监听文件变化
pnpm test:watch

# 运行 Jest 测试并生成覆盖率报告
pnpm test:coverage

# 运行 Playwright 端到端测试（会自动在 3100 端口拉起 dev，见 playwright.config.ts）
pnpm test:e2e
```

### 代码规范检查

```bash
# 运行 ESLint 检查
pnpm lint

# 运行 Prettier 格式化代码
pnpm format
```

## GitHub OAuth 与集成测试

### 必需环境变量（统一命名）

鉴于当前使用 `next-auth v4`，认证相关环境变量统一使用 `NEXTAUTH_*` 与 `GITHUB_*`。  
完整键名清单与示例值请以 `docs/references/auth-github-oauth.md` 为准（单一权威来源）。

### GitHub OAuth 回调地址

- 本地开发：`http://localhost:3000/api/auth/callback/github`
- 生产环境：`${NEXTAUTH_URL}/api/auth/callback/github`

### 测试环境复制流程

建议先完成 `.env` 到 `.env.test` 的基线复制，再按项目当前加载顺序准备本地文件：

```bash
# 基线流程（计划要求）
cp .env .env.test

# 首次初始化可先从模板生成 .env
cp .env.example .env

# 当前仓库集成测试实际读取的文件
cp .env.example .env.development
cp .env.example .env.local
```

当前仓库中的集成测试会按顺序加载 `.env.development` 和 `.env.local`，`.env.test` 可作为共享基线模板来源。

### 集成测试依赖与命令

- 依赖：可访问的 MySQL、Redis，以及（仅 `test:integration:chat` 需要）可用的 `OPENAI_API_KEY`
- 命令：

```bash
pnpm run test:integration:auth
pnpm run test:integration:chat
```

### MySQL / Redis 健康检查行为

执行集成测试前会自动做以下检查：

- 根据 `MYSQL_*` 推导测试库并追加 `MYSQL_CI_SUFFIX`（默认 `_ci`）
- 自动创建测试数据库（不存在则创建）
- 执行 `pnpm exec prisma migrate deploy` 确保表结构
- MySQL 连通性检查：执行 `SELECT 1`
- Redis 连通性检查：连接后执行 `PING`

## Conversation Markdown RAG（Qdrant）

### 依赖准备

- 需要可访问的 Qdrant 实例（本地或远端）。
- 推荐本地快速启动：

```bash
docker run -p 6333:6333 qdrant/qdrant
```

### 环境变量

在 `.env.development` / `.env.local` 中配置以下键（示例值见 `.env.example`）：

- `QDRANT_URL`
- `QDRANT_API_KEY`
- `QDRANT_COLLECTION_NAME`
- `RAG_TOP_K`
- `RAG_MIN_SCORE`
- `RAG_CONTEXT_MAX_CHARS`
- `RAG_INGEST_LEASE_MS`

### 使用方式（会话级 Markdown RAG）

1. 进入聊天页面并打开一个会话。
2. 在会话内上传 `.md` 文档，等待状态变为 `ready`。
3. 在同一会话提问，系统会检索该会话文档并增强流式回答。
4. 若检索链路异常，聊天会自动降级为普通对话（不中断流式输出）。

## 项目结构

```
├── src/
│   ├── app/                          # 应用路由和页面
│   │   ├── layout.tsx               # 根布局
│   │   ├── page.tsx                 # 首页
│   │   ├── about/
│   │   │   └── page.tsx
│   │   ├── blog/
│   │   │   ├── page.tsx
│   │   │   └── [slug]/
│   │   │       └── page.tsx
│   │   ├── contact/
│   │   │   └── page.tsx
│   │   ├── services/
│   │   │   └── page.tsx
│   │   └── globals.css              # 全局样式
│   ├── components/                  # 可复用组件
│   │   ├── ui/                      # shadcn/ui 组件
│   │   ├── navbar.tsx               # 导航栏组件
│   │   └── theme-provider.tsx       # 主题提供商
│   ├── hooks/                       # 自定义 Hooks
│   │   ├── use-debounce.ts
│   │   ├── use-local-storage.ts
│   │   ├── use-media-query.ts
│   │   ├── use-scroll-position.ts
│   │   ├── use-throttle.ts
│   │   └── use-viewport-size.ts
│   ├── lib/                         # 工具函数
│   │   └── utils.ts                 # 通用工具函数
│   └── types/                       # 类型定义
│       └── index.ts
├── public/                           # 静态资源
├── .env.development                  # 开发环境变量
├── .env.production                   # 生产环境变量
├── .env.test                        # 测试环境变量
├── .env.example                     # 环境变量示例
├── components.json                  # shadcn/ui 配置
├── eslint.config.mjs                # ESLint 配置
├── jest.config.cjs                  # Jest 配置
├── jest.setup.ts                    # Jest 启动文件
├── next.config.mjs                  # Next.js 配置
├── package.json                     # 项目依赖配置
├── postcss.config.js                # PostCSS 配置
├── tailwind.config.ts               # Tailwind CSS 配置
└── tsconfig.json                    # TypeScript 配置
```

## 开发流程

### 创建新页面

在 `src/app/` 目录下创建新的文件夹，然后添加 `page.tsx` 文件。

```typescript
// src/app/new-page/page.tsx
export default function NewPage() {
  return <h1>New Page</h1>;
}
```

### 创建新组件

在 `src/components/` 目录下创建新的组件文件。

```typescript
// src/components/MyComponent.tsx
interface MyComponentProps {
  title: string;
}

export function MyComponent({ title }: MyComponentProps) {
  return <h2>{title}</h2>;
}
```

### 样式

使用 Tailwind CSS 类名进行样式开发。

### 数据获取

使用 Next.js 的数据获取方法：

```typescript
// 服务器端数据获取
export async function getServerSideProps() {
  const data = await fetch('https://api.example.com/data');
  return { props: { data } };
}

// 静态数据获取
export async function getStaticProps() {
  const data = await fetch('https://api.example.com/data');
  return { props: { data } };
}

// 静态路径生成
export async function getStaticPaths() {
  return {
    paths: [{ params: { slug: 'post-1' } }, { params: { slug: 'post-2' } }],
    fallback: false,
  };
}
```

## 部署

### Vercel 部署

1. 安装 Vercel CLI
2. 登录 Vercel 账号
3. 运行 `vercel` 命令

### 其他部署方式

可以使用 Docker 或其他方式部署。

## LLM 可观测性运行手册（安全与保留）

### 敏感数据访问控制

- `GET /api/llm-stats/logs` 默认只返回聚合友好的非敏感字段。
- 仅当 `includeDetails=true` 时才会返回 `requestHeaders` / `requestPayload` / `responsePayload`。
- 访问明细必须提供请求头 `x-llm-observability-admin-token`，并且值与服务端环境变量 `LLM_OBSERVABILITY_ADMIN_TOKEN` 一致。
- 任何明细访问（允许/拒绝）都会写入审计日志事件，便于后续安全排查。

### 加密与存储控制（Encryption at Rest）

- 所有 LLM 原始 payload 与 headers 落在应用数据库（`llm_call_logs`）中，需依赖数据库层开启磁盘加密（例如云盘 KMS、MySQL TDE 或底层卷加密）。
- 生产环境检查项：
  - **数据库存储卷已启用加密**（云平台控制台或 IaC 证明）；
  - **数据库备份已启用加密**（快照/备份策略）；
  - **KMS 密钥轮换策略已配置**（按组织安全基线）；
  - **最小权限访问**：仅应用服务账号可读写业务库。
- 应用侧默认限制超大 payload 写入体积（见 `LLM_OBSERVABILITY_MAX_PAYLOAD_CHARS`），避免异常大响应导致敏感信息扩散和存储膨胀。

### 数据保留策略（TTL）

- 原始调用日志（含 payload）与聚合数据分开保留：
  - `LLM_OBSERVABILITY_RAW_PAYLOAD_RETENTION_DAYS`（默认 `7`）；
  - `LLM_OBSERVABILITY_AGGREGATE_RETENTION_DAYS`（默认 `90`）。
- 保留清理任务由聚合 cron 触发，调度时间可配置：
  - `LLM_OBSERVABILITY_RETENTION_CLEANUP_HOUR_UTC`（默认 `1`）；
  - `LLM_OBSERVABILITY_RETENTION_CLEANUP_MINUTE_UTC`（默认 `0`）。
- 清理实现为幂等删除（`deleteMany where < cutoff`），重复执行不会产生副作用。

### 运维执行命令（realtime / daily / weekly / backfill / retention）

- 统一入口脚本：`src/scripts/llm-observability-ops.ts`
- 快捷命令（`package.json`）：
  - `pnpm obs:realtime`
  - `pnpm obs:retention`
- 全量运维命令（推荐，参数显式）：

```bash
# 1) 准实时聚合（按 now-水位线 重新计算 D-2/D-1/D）
pnpm obs:run -- realtime

# 2) 日固化（重算指定 UTC 自然日）
pnpm obs:run -- daily --date 2026-03-29T00:00:00.000Z

# 3) 周固化（重算指定周，传入该周任意时间或周起始时间均可）
pnpm obs:run -- weekly --week-start 2026-03-23T00:00:00.000Z

# 4) 历史回填（闭区间 [startDate, endDate]，按天+按周重算）
pnpm obs:run -- backfill --start-date 2026-03-01T00:00:00.000Z --end-date 2026-03-15T00:00:00.000Z

# 5) 保留清理（可选指定 now；不传则使用当前 UTC 时间）
pnpm obs:run -- retention --now 2026-03-30T01:00:00.000Z
```

### Task 8 最新验证结果（PASS / FAIL 分离）

> 以下结果来自最近一次本地执行（Task 8 验证轮次）：

- **PASS**
  - `pnpm exec eslint src/lib/llm-observability/ops-runner.ts src/scripts/llm-observability-ops.ts tests/integration/llm-observability/ops-runner.e2e.test.ts`
  - `pnpm exec eslint tests/e2e-playwright/llm-observability.spec.ts`（Playwright 新增 spec 的静态检查通过）
  - `tests/integration/llm-observability/ops-runner.e2e.test.ts` 已在 `pnpm test:ci` 中通过。
  - `tests/e2e-playwright/llm-observability.spec.ts` 已新增（基于 Playwright 路由拦截的稳定化验证流）。
- **FAIL**
  - `pnpm lint`：仓库存在大量既有格式/规则问题（跨多个非 Task 8 文件）。
  - `pnpm type-check`：存在既有类型/Prisma 问题（例如 `message-repo.ts` 隐式 any、`src/lib/prisma.ts` PrismaClient 导出异常）。
  - `pnpm test:ci`：主体验证通过但有 2 个既有失败套件，报错为 Prisma 生成产物缺失（`.prisma/client/*`）。
  - `pnpm exec playwright test tests/e2e-playwright/llm-observability.spec.ts`：在当前环境执行失败（`/llm-observability` 返回 `404`，可能复用了旧 dev server）。
  - 可重试命令：`PLAYWRIGHT_REUSE_SERVER=false pnpm exec playwright test tests/e2e-playwright/llm-observability.spec.ts`（强制使用当前工作区代码启动 webServer）。

## 许可证

MIT
