# Workflow Learning — Phase 1.5 Planner-Executor 设计说明

**关联 PRD：** `docs/prd/workflow-learning-system.md`（§四 Execution Loop / §十四 phase 2）
**基于：** `docs/superpowers/specs/2026-03-29-workflow-learning-phase1-design.md`（Phase 1 已实现）
**定稿日期：** 2026-03-30
**状态：** 设计稿

---

## 1. 目标与范围

### 1.1 Phase 1.5 要解决的问题

Phase 1 实现了基本的 Agent + Playwright 工具跑通，但存在以下问题：

1. **无计划机制** — Agent 直接用 ReAct 循环调用 `browser_snapshot`，没有事先规划，用户无法预知执行路径
2. **浏览器生命周期失控** — 每次工具调用独立 `launch → close` Chromium，无法保持登录态，不能跨步骤复用
3. **无用户交互处理** — 遇到登录页等需要人工操作的场景没有通知、等待、恢复机制
4. **关闭时机硬编码** — `finally { browser.close() }` 在代码中写死，而非由 LLM 根据计划决定

### 1.2 Phase 1.5 要达成什么

1. **Planner-Executor 双阶段架构** — Agent 先生成结构化计划（展示在 chat 中），再按计划逐步执行
2. **BrowserSessionManager** — 进程级单例管理浏览器实例，同一用户跨消息复用，有头模式运行
3. **多浏览器工具** — `navigate`、`snapshot`、`click`、`type`、`close` + `wait_for_user`
4. **登录检测与用户交互** — Agent 判断页面需要用户操作时，SSE 通知 chat UI，轮询等待页面变化后自动恢复
5. **Replan 机制** — 执行受阻时回调 Planner 调整计划
6. **Plan Markdown 持久化** — 每次计划写入文件，方便追溯调试

### 1.3 明确不在 Phase 1.5 的内容

- Skill Builder / Skill Validator / Skill 存储（phase 3–5）
- 多标签页 / 多窗口管理
- 自动填写密码、绕过验证码
- 生产环境部署（仍为本机开发环境）

---

## 2. 已确认的决策摘要

| 决策点         | 选择                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 计划粒度       | 两层：任务级大计划 + 浏览器操作级子计划                                                                                |
| 浏览器生命周期 | 跨消息复用，LLM 决定何时关闭，空闲超时兜底回收                                                                         |
| 浏览器模式     | 有头模式（`headless: false`）                                                                                          |
| 登录处理       | Agent 检测 + SSE 通知用户 + 轮询页面变化自动恢复                                                                       |
| 计划可见性     | 展示在 chat 中，自动执行，实时更新步骤状态                                                                             |
| 工具集         | `browser_navigate` / `browser_snapshot` / `browser_click` / `browser_type` / `browser_close` / `browser_wait_for_user` |
| 计划持久化     | Markdown 文件，写入 `data/workflow-plans/`                                                                             |

---

## 3. 整体架构

```text
用户消息
  ↓
POST /api/workflow-learning/chat (传入 userId)
  ↓
┌─────────────────────────────────────────────────┐
│ Phase 1: Planner（单次 LLM structured output）   │
│  - 输入：用户消息 + 当前浏览器状态（如有）         │
│  - 输出：结构化 TaskPlan JSON                    │
│  - 副作用：写 plan 到 Markdown 文件              │
│  - SSE：plan 事件（含所有步骤）                   │
└───────────────────┬─────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ Phase 2: Executor（ReAct agent 循环）             │
│  - 系统 prompt 包含当前 plan                      │
│  - 工具集：6 个浏览器工具                         │
│  - 每完成一步 → plan_step_update SSE 事件         │
│  - 遇到登录页 → user_action_required + 轮询       │
│  - 执行受阻 → 回调 Planner 做 replan              │
└───────────────────┬─────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ BrowserSessionManager（进程级单例）               │
│  - 以 userId 为 key 持有 Browser 实例             │
│  - 跨请求复用（同一用户多条消息共享 session）       │
│  - 有头模式（headless: false）                    │
│  - 空闲超时自动回收（5 分钟）                      │
│  - LLM 调用 browser_close 时显式关闭              │
│  - 应用关闭时兜底清理所有实例                      │
└─────────────────────────────────────────────────┘
```

Planner 和 Executor 共享同一次 SSE 流，用户在一条消息的响应中先看到计划，再看到逐步执行。

---

## 4. Plan Schema 与 Markdown 持久化

### 4.1 TaskPlan 结构

```typescript
interface TaskPlan {
  goal: string; // 用户意图的一句话总结
  steps: TaskStep[]; // 任务级步骤
  fallbackStrategy: string; // 整体兜底策略描述
}

interface TaskStep {
  id: string; // "step-1", "step-2", ...
  description: string; // 这一步要做什么（自然语言）
  type: 'browser_action' | 'analysis' | 'report';
  browserSubSteps?: BrowserSubStep[]; // 浏览器操作级子计划（仅 browser_action 类型）
  onFailure: 'replan' | 'skip' | 'abort';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'waiting_user';
}

interface BrowserSubStep {
  action: 'navigate' | 'snapshot' | 'click' | 'type' | 'close';
  params: Record<string, string>; // 如 { url: "..." } 或 { selector: "..." }
  description: string;
}
```

### 4.2 Planner LLM 调用方式

单次 `ChatOpenAI.invoke()` + `withStructuredOutput(TaskPlanSchema)`，强制输出符合 Zod schema 的 JSON。不使用 ReAct agent。

Planner 的输入：

- 用户消息
- 当前浏览器状态（如有活跃会话：当前 URL、页面标题）
- 历史执行上下文（如果是 replan：已完成步骤 + 失败原因）

### 4.3 Markdown 持久化

写到 `data/workflow-plans/{runId}.md`，格式：

```markdown
# Workflow Plan: {goal}

**RunId:** {runId}
**Created:** {ISO timestamp}
**Goal:** {goal}

## Steps

### Step 1: {description} [{status}]

- 类型: {type}
- 失败策略: {onFailure}
- 子步骤:
  1. {action} → {params}
  2. ...
- 结果: {执行后追加}

### Step 2: ...
```

执行过程中每完成一步就更新对应步骤的 `[status]` 和结果摘要。Replan 时在文件末尾追加 replan 记录。

---

## 5. BrowserSessionManager

### 5.1 接口

```typescript
class BrowserSessionManager {
  private sessions: Map<string, BrowserSession>;

  async getOrCreate(userId: string): Promise<BrowserSession>;
  async close(userId: string): Promise<void>;
  async shutdownAll(): Promise<void>;
  isActive(userId: string): boolean;
  getStatus(userId: string): { url: string; title: string } | null;
}

interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  userId: string;
  createdAt: Date;
  lastActiveAt: Date;
}
```

### 5.2 设计要点

- **进程级单例**，通过模块级变量实现（不持久化到 DB）
- **有头模式**（`headless: false`），用户可直接看到浏览器窗口并交互（如登录）
- 同一 `userId` 复用同一个 `BrowserContext`（cookies/登录态跨消息保持）
- 每次工具调用更新 `lastActiveAt`，超过 `BROWSER_SESSION_IDLE_TIMEOUT_MS`（默认 300_000，5 分钟）自动回收
- `process.on('beforeExit')` + `process.on('SIGTERM')` 注册 `shutdownAll` 兜底
- 如果 browser 进程意外退出（用户手动关窗口），工具调用时检测 `browser.isConnected() === false`，返回结构化错误给 LLM

---

## 6. 浏览器工具集

### 6.1 工具清单

| 工具名                  | 输入 Schema                                                                                    | 行为                                                        | 返回给 LLM                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| `browser_navigate`      | `{ url: string }`                                                                              | `assertUrlAllowed` → `page.goto(url)` → 等 domcontentloaded | `{ title, url, status }`                     |
| `browser_snapshot`      | `{}`                                                                                           | `page.title()` + `body.innerText` 截断                      | `{ title, url, excerpt }`                    |
| `browser_click`         | `{ selector: string }`                                                                         | `page.locator(selector).click()` → 等待导航或 500ms         | `{ success, newUrl, newTitle }`              |
| `browser_type`          | `{ selector: string, text: string }`                                                           | `page.locator(selector).fill(text)`                         | `{ success }`                                |
| `browser_close`         | `{}`                                                                                           | `BrowserSessionManager.close(userId)`                       | `{ closed: true }`                           |
| `browser_wait_for_user` | `{ reason: string, waitForUrlChange?: boolean, waitForSelector?: string, timeoutMs?: number }` | 发 SSE → 轮询 → 返回新页面状态                              | `{ resolved, newUrl?, newTitle?, excerpt? }` |

### 6.2 与 Phase 1 的关系

- 现有 `browser_snapshot` 工具升级拆分，旧的每次 launch/close 模式废弃
- 所有工具共享 `BrowserSessionManager` 提供的同一个 `page` 实例
- URL allowlist 只在 `browser_navigate` 中校验

### 6.3 工具与 SSE 流的通信

`browser_wait_for_user` 等工具需要在执行期间向 SSE 流推送事件（`user_action_required` / `user_action_resolved`），但工具运行在 Executor 的 ReAct 循环内部。解决方式：

- 创建工具时通过闭包注入一个 `emitEvent: (event: WorkflowSseEvent) => void` 回调
- 该回调由 `agent-runner.ts` 在构建工具时提供，直接 yield 到外层的 SSE generator
- 同理，`plan_step_update` 事件也通过此回调在 Executor 循环中适时发送

### 6.4 工具错误处理

- 所有工具 try-catch，超时返回结构化错误给 LLM（不崩溃 agent）
- 浏览器断连（`browser.isConnected() === false`）返回错误并建议 replan
- 选择器未找到、点击超时等返回描述性错误信息

---

## 7. 登录检测与用户交互

### 7.1 检测策略

由 Executor agent 自行判断。Agent 调用 `browser_navigate` 或 `browser_snapshot` 后拿到页面内容，如果判断当前页面是登录/注册/验证页面，应调用 `browser_wait_for_user`。

### 7.2 `browser_wait_for_user` 工具流程

```text
Agent 调用 browser_navigate("https://xx.com/dashboard")
  → 返回: { title: "登录 - XX平台", excerpt: "请输入用户名和密码..." }
Agent 判断：这是登录页
  → 调用 browser_wait_for_user({ reason: "请在浏览器窗口中完成登录", waitForUrlChange: true, timeoutMs: 120000 })
工具内部：
  1. 发送 SSE: { type: "user_action_required", reason: "..." }
  2. UI 显示黄色提示卡片
  3. 轮询（每 2 秒）：检查 page.url() / waitForSelector / excerpt 变化
  4. 检测到变化 → 发送 SSE: { type: "user_action_resolved" }
  5. 返回新页面状态给 agent
Agent 继续执行计划
```

### 7.3 超时处理

- 默认等待 120_000ms（2 分钟），agent 可在调用时指定
- 超时返回 `{ resolved: false, reason: 'timeout' }`
- Agent 根据 plan 的 `onFailure` 策略决定 replan / skip / abort

### 7.4 系统 prompt 指引

> 当你通过 browser_snapshot 发现当前页面是登录页、验证码页或需要用户手动操作的页面时，必须调用 browser_wait_for_user 工具并说明原因，让用户在浏览器窗口中完成操作。不要尝试自动填写密码或绕过认证。

---

## 8. Replan 机制

当 Executor 遇到无法处理的情况（页面结构与预期不符、步骤失败且 `onFailure: 'replan'`）：

1. Executor 暂停，收集执行上下文（已完成步骤、当前页面状态、错误信息）
2. 回调 Planner，输入 = 原计划 + 执行上下文 + 错误原因
3. Planner 输出修订后的 plan（剩余步骤）
4. SSE 推送 `plan_update` 事件，UI 刷新计划展示
5. Executor 继续执行新计划
6. Markdown 文件追加 replan 记录

---

## 9. SSE 事件模型

### 9.1 完整事件类型

在 Phase 1 已有事件基础上新增 5 种：

```typescript
export type WorkflowSseEvent =
  // Phase 1 已有
  | { type: 'run_start' }
  | { type: 'tool_call_start'; toolCallId: string; toolName: string; argsPreview: string }
  | {
      type: 'tool_call_result';
      toolCallId: string;
      ok: boolean;
      resultPreview: string;
      durationMs?: number;
    }
  | { type: 'thought'; text: string }
  | { type: 'assistant_delta'; text: string }
  | { type: 'assistant_final'; text: string }
  | { type: 'error'; message: string }
  | { type: 'run_end' }
  // Phase 1.5 新增
  | { type: 'plan'; plan: TaskPlan }
  | { type: 'plan_step_update'; stepId: string; status: StepStatus; summary?: string }
  | { type: 'plan_update'; plan: TaskPlan; reason: string }
  | { type: 'user_action_required'; reason: string }
  | { type: 'user_action_resolved' };
```

所有事件均包含 `runId: string` 和 `timestamp: string` 基础字段。

### 9.2 典型事件流

```text
run_start
  → plan { goal, steps }
  → plan_step_update { stepId: "step-1", status: "running" }
  → tool_call_start { toolName: "browser_navigate" }
  → tool_call_result { ok: true }
  → user_action_required { reason: "请在浏览器窗口中完成登录" }
  → user_action_resolved
  → plan_step_update { stepId: "step-1", status: "completed" }
  → plan_step_update { stepId: "step-2", status: "running" }
  → tool_call_start { toolName: "browser_snapshot" }
  → tool_call_result { ok: true }
  → plan_step_update { stepId: "step-2", status: "completed" }
  → assistant_final { text: "..." }
→ run_end
```

---

## 10. 前端 UI

### 10.1 助手消息三层结构

```text
┌─────────────────────────────────────────┐
│ 📋 执行计划                              │
│  ✅ Step 1: 打开竞品官网                  │
│  🔄 Step 2: 查找功能页 (执行中...)        │
│  ⏳ Step 3: 总结分析                      │
├─────────────────────────────────────────┤
│ 🔍 执行轨迹 (默认折叠)                   │
│  ├ 🔧 browser_navigate → https://xx.com │
│  ├ ✅ 结果: { title: "XX平台" }          │
│  ├ ⚠️ 请在浏览器窗口中完成登录            │
│  ├ ✅ 登录已完成                          │
│  └ ...                                  │
├─────────────────────────────────────────┤
│ 💬 回答                                  │
│  竞品XX的招聘功能包括...                  │
└─────────────────────────────────────────┘
```

### 10.2 交互细节

- **计划区**：始终可见，步骤状态实时更新（pending → running → completed/failed/waiting_user），不同状态不同图标
- **执行轨迹**：默认折叠，只显示摘要（如"4 个工具调用"），可展开查看详情
- **`user_action_required`**：渲染为黄色提醒卡片
- **Replan**：`plan_update` 事件触发计划区刷新，旧步骤保留历史状态，新步骤追加
- **最终回答区**：`assistant_final` 后显示，与 Phase 1 一致

---

## 11. 代码改动清单

### 11.1 重构/修改

| 文件                                                          | 操作     | 说明                               |
| ------------------------------------------------------------- | -------- | ---------------------------------- |
| `src/lib/workflow-learning/agent-runner.ts`                   | 重构     | 拆为 Planner + Executor 两阶段     |
| `src/lib/workflow-learning/tools/browser-snapshot-tool.ts`    | 拆分替换 | 拆为 6 个独立工具文件              |
| `src/lib/workflow-learning/types.ts`                          | 扩展     | 新增 5 种 SSE 事件 + TaskPlan 类型 |
| `src/lib/workflow-learning/constants.ts`                      | 扩展     | 新增超时/轮询常量                  |
| `src/components/workflow-learning/workflow-learning-chat.tsx` | 重构     | 三层展示 + 处理新事件              |
| `src/app/api/workflow-learning/chat/route.ts`                 | 微调     | 传 userId                          |
| `.gitignore`                                                  | 追加     | `data/workflow-plans/`             |

### 11.2 新增

| 文件                                                            | 说明                            |
| --------------------------------------------------------------- | ------------------------------- |
| `src/lib/workflow-learning/browser-session-manager.ts`          | 进程级单例                      |
| `src/lib/workflow-learning/planner.ts`                          | Planner LLM + structured output |
| `src/lib/workflow-learning/plan-markdown.ts`                    | Plan ↔ Markdown                 |
| `src/lib/workflow-learning/tools/browser-navigate-tool.ts`      | 导航                            |
| `src/lib/workflow-learning/tools/browser-click-tool.ts`         | 点击                            |
| `src/lib/workflow-learning/tools/browser-type-tool.ts`          | 输入                            |
| `src/lib/workflow-learning/tools/browser-close-tool.ts`         | 关闭                            |
| `src/lib/workflow-learning/tools/browser-wait-for-user-tool.ts` | 等待用户                        |

### 11.3 不改动

- `src/app/api/chat/route.ts`、`src/components/chat/` — 招聘 Chat 不受影响
- `src/lib/workflow-learning/url-allowlist.ts` — 逻辑不变
- `src/lib/workflow-learning/sse.ts`、`parse-sse.ts`、`client.ts` — 格式不变

---

## 12. 新增常量

| 常量                              | 默认值            | 用途                   |
| --------------------------------- | ----------------- | ---------------------- |
| `BROWSER_SESSION_IDLE_TIMEOUT_MS` | `300_000` (5 min) | 浏览器空闲自动回收     |
| `BROWSER_WAIT_POLL_INTERVAL_MS`   | `2_000` (2s)      | 等待用户操作时轮询间隔 |
| `BROWSER_WAIT_DEFAULT_TIMEOUT_MS` | `120_000` (2 min) | 等待用户操作默认超时   |

---

## 13. 测试策略

| 层级 | 覆盖范围                       | 方式                                              |
| ---- | ------------------------------ | ------------------------------------------------- |
| 单元 | Planner 输出 schema 校验       | Mock LLM，断言符合 TaskPlan Zod schema            |
| 单元 | BrowserSessionManager 生命周期 | Mock Playwright，测试复用、idle 回收、shutdownAll |
| 单元 | Plan Markdown 序列化           | 纯函数，snapshot 对比                             |
| 单元 | 各浏览器工具错误处理           | Mock page，测试超时/选择器不存在/断连             |
| 单元 | SSE 事件序列                   | Mock Planner + Executor，断言事件流顺序           |
| 集成 | 完整 Planner-Executor 链路     | 真实 LLM + headless 浏览器，访问 localhost        |
| E2E  | 浏览器 UI 测试                 | 扩展现有 workflow-learning.spec.ts                |

CI 注意：单元测试全部 mock 浏览器，`pnpm test:ci` 不依赖 Chromium。

---

## 14. 与后续 Phase 的衔接

- **结构化 Plan** 是 Skill Builder（phase 3）的关键输入 — Plan 的 steps + 执行结果可直接转化为 Skill 的 steps + fallbacks
- **Markdown 文件** 作为 Execution Logger 的雏形，后续可改写入 DB
- **Replan 机制** 对齐 PRD §四 Execution Loop 的自适应设计
- **BrowserSessionManager** 为后续 Skill Runner 复用浏览器会话提供基础

---

## 15. Spec 自检

- [x] 无 TBD / TODO 占位
- [x] Plan Schema 各字段明确，无歧义
- [x] 事件类型完整覆盖所有用户可见状态变化
- [x] 与 Phase 1 现有代码的改动关系清晰，不影响招聘 Chat
- [x] 登录处理流程完整：检测 → 通知 → 轮询 → 恢复 → 超时兜底
- [x] 浏览器生命周期有明确的创建、复用、空闲回收、显式关闭、兜底清理五条路径
- [x] Replan 触发条件和流程明确
- [x] 测试策略按层级覆盖，CI 不依赖 Chromium
