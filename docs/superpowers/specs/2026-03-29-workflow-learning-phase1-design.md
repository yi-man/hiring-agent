# Workflow Learning — Phase 1 设计说明

**关联 PRD：** `docs/prd/workflow-learning-system.md`（§十四 phase 1：Agent + Tool 跑通）  
**定稿日期：** 2026-03-29  
**状态：** 设计稿（实现前需经本仓库评审通过）

---

## 1. 目标与范围

### 1.1 Phase 1 要达成什么

在**本机开发环境**下，提供：

1. **新页面** `/workflow-learning`，交互形态**对齐现有 Chat**（标题区 + 消息列表 + 输入区，多轮对话）。
2. **后端**：基于 LangChain 的 **Agent（或等价的 bindTools + 多步调用链路）**，至少挂载 **一个 Playwright Tool**，能对用户意图做出工具调用并返回可被 UI 展示的回复。
3. **鉴权**：与 `/chat` 一致，**必须登录**（`getServerAuthSession` + 未登录展示 `SignInButton`）。

### 1.2 明确不在 Phase 1 的内容

以下对应 PRD 后续 phase，**本设计不包含实现义务**：

- Execution Loop、RePlanning（phase 2）
- Skill Builder / Skill Validator / Skill 存储（phase 3–5）
- 与现有 `Conversation` / RAG / 文档上传的集成
- 生产环境（Vercel serverless 等）上可稳定运行 Playwright——**不作为 Phase 1 验收标准**

---

## 2. 已确认的决策摘要

| 决策点                 | 选择                                                 |
| ---------------------- | ---------------------------------------------------- |
| Tool 是否含 Playwright | **是**（与 PRD MVP「Agent + Playwright」一致）       |
| 运行与部署             | **本机跑通即可**；生产浏览器基础设施后续单独方案     |
| 产品入口               | **新页面** + **Chat 式交互**（非仅 CLI、非仅裸 API） |
| 鉴权                   | **与 `/chat` 一致，必须登录**                        |

---

## 3. 实现路径对比（2～3 种）

### 方案 A（推荐）：独立页面 + 独立 API + 精简客户端状态

- **页面**：`src/app/workflow-learning/page.tsx` 镜像 `chat/page.tsx` 的鉴权与布局模式。
- **UI**：新建 `WorkflowLearningChat`（或同名）组件——**仅**消息列表、输入、loading/error；**不**复用 `ChatUI` 全量逻辑（会话列表、RAG、文档上传等与 Phase 1 无关）。
- **API**：新建例如 `POST /api/workflow-learning/chat`（命名可微调），Body 为 `{ message: string }` 或与现有习惯一致的形状；返回 `{ reply: string }` 或带 `toolCalls` 摘要的结构（见 §5）。
- **优点**：边界清晰，后续接 Execution Logger / Skill 模块时不易与招聘 Chat 缠在一起。
- **缺点**：与 `ChatUI` 有少量 UI 重复，可用共享 presentational 组件再收敛。

### 方案 B：扩展 `ChatUI` / `/api/chat` 增加「模式」开关

- **优点**：一处 UI。
- **缺点**：招聘对话与 workflow-learning 的产品语义、后端能力差异大，Phase 1 就会把 `chat-ui.tsx` 复杂度推高；**不推荐**。

### 方案 C：仅脚本 + 无页面

- 与当前「新页面 + Chat 交互」决策冲突，**不采纳**。

**结论：采用方案 A。**

---

## 4. 架构概览

```text
Browser (已登录用户)
  → /workflow-learning (Server Component: session 检查)
  → WorkflowLearningChat (Client)
  → POST /api/workflow-learning/chat (requireAuth)
        → LangChain ChatOpenAI + tools
        → Playwright Tool（本机启动 Chromium，执行可审计的有限操作）
        → JSON 响应
```

- **会话状态**：Phase 1 可采用**前端内存**维护 `messages`（刷新即清空），**不强制**写入 `Conversation` 表；若实现时复用现有会话模型，可作为增量，但**非本 spec 必选**。

---

## 5. API 与 Agent 行为

### 5.1 请求 / 响应（建议）

- **POST** `/api/workflow-learning/chat`
- **鉴权**：与 `src/app/api/chat/route.ts` 类似，使用 `requireAuth()`；未授权返回 401。
- **请求体**：`{ "message": string }`（必填，trim 非空）。
- **响应体（最小）**：`{ "reply": string }`。
- **可选扩展**（便于调试与后续接 Execution Logger）：`{ "reply": string, "toolCalls"?: { name: string; args: unknown }[] }`——若增加字段，前端需在 UI 上以可折叠「工具调用」块展示或仅开发环境展示，避免干扰普通用户。

### 5.2 Agent 与 Playwright Tool

- 使用项目已有 **OpenAI 兼容**配置（`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL` 等），与现有 JD/Chat 对齐。
- **Tool 设计原则（Phase 1）**：
  - 数量：**至少 1 个**面向 Playwright 的工具（例如「在受控 URL 上执行：打开页面 + 抓取标题或可见文本片段」），参数需严格 schema（避免任意代码执行）。
  - **禁止**：任意 URL 无界访问、任意时长无超时、无最大步数——须在实现中设 **allowlist（如仅 `localhost` + 应用 `NEXT_PUBLIC_APP_URL`）**、**超时**、**最大操作步数**（具体数值在实现 plan 中写死为常量并单测）。
- **运行环境**：仅在 **Node 运行时**（`pnpm dev` 下的 Route Handler）中启动 Playwright；**不在 Edge Runtime** 跑该 Route。

### 5.3 与现有 `POST /api/chat` 的关系

- **不修改**现有简单 `invoke` 聊天路径的行为；workflow-learning **独立 API**，避免影响招聘 Chat 的稳定性。

---

## 6. 前端（页面与交互）

### 6.1 路由与布局

- **路径**：`/workflow-learning`。
- **布局**：与 `chat/page.tsx` 类似——`container`、标题、副标题说明「Workflow Learning / Agent + Playwright（Phase 1 本机验证）」。
- **未登录**：与 Chat 相同，展示登录引导 + `SignInButton`。

### 6.2 交互

- 用户输入一条消息 → 展示 user bubble → loading → assistant bubble。
- **流式输出**：Phase 1 **不强制** SSE；可采用**整段 JSON 返回**以降低范围。若后续与 Chat 体验拉齐，再在实现 plan 中增加流式。

---

## 7. 安全与运维

- **鉴权**：已登录用户才可调用 Playwright Tool API。
- **Playwright 滥用面**：通过 URL allowlist、超时、单请求内最大浏览器操作次数限制；日志中避免打印完整页面 HTML（可打 hash 或长度）。
- **本机依赖**：开发者需安装 Playwright 浏览器（`pnpm exec playwright install` 或文档说明）；CI 中 Phase 1 相关测试可采用 **mock 工具层** 或 **可选 job**，避免默认 CI 必装浏览器。

---

## 8. 错误处理（用户可见）

- **401**：未登录。
- **503 / 依赖不可用**：与现有 `DEPENDENCY_OUTAGE_MESSAGE` 模式对齐（若适用）。
- **Playwright 启动失败 / 超时**：返回明确错误文案（例如「浏览器自动化不可用，请确认本机已安装 Playwright 浏览器且未在受限环境运行」），前端 `error` state 展示。

---

## 9. 测试策略（Phase 1）

- **单元测试**：Tool 参数校验、URL allowlist 逻辑、mock LLM 时不启动真实浏览器。
- **可选集成**：本机有浏览器时的冒烟；默认 `pnpm test:ci` 不强制依赖 Chromium。

---

## 10. 与后续 Phase 的衔接点

- API 层预留：未来可在同一 Route 或子模块挂 **Execution Logger**、**Skill Builder** 输入（执行步骤、errors、replans）。
- 响应中可选 `toolCalls` 字段便于后续落库与重放验证（Validator）。

---

## 11. Spec 自检（定稿前）

- [x] 无「TBD」占位；范围与 PRD phase 1 对齐。
- [x] 与「必须登录」「本机 Playwright」「独立页面」决策一致。
- [x] 生产 serverless 明确排除在 Phase 1 验收外。

---

## 12. 下一步

经评审同意后，使用 **writing-plans** 产出 Phase 1 **实现计划**（文件、任务顺序、环境变量与验收清单），再进入编码。
