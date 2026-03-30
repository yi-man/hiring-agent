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
3. **可观测执行（核心 UX）**：用户下发任务后，**不是仅在结束后展示一句结论**，而是类似 **Cursor 聊天框**的体验——**规划、探索、工具调用、中间状态与执行信息**在页面中**持续可见、按时间推进**（可折叠块、时间线或流式追加），与后续 PRD 中的 Execution Logger / 多步闭环对齐。
4. **鉴权**：与 `/chat` 一致，**必须登录**（`getServerAuthSession` + 未登录展示 `SignInButton`）。

### 1.2 明确不在 Phase 1 的内容

以下对应 PRD 后续 phase，**本设计不包含实现义务**：

- Execution Loop、RePlanning（phase 2）
- Skill Builder / Skill Validator / Skill 存储（phase 3–5）
- 与现有 `Conversation` / RAG / 文档上传的集成
- 生产环境（Vercel serverless 等）上可稳定运行 Playwright——**不作为 Phase 1 验收标准**

**与 PRD phase 2 的边界**：Phase 1 的「多步」强调 **对用户可见的观测与展示**（SSE 事件 + 时间线）。PRD §十四 **phase 2** 的 **Execution Loop + RePlanning** 指 **失败分析、自动改计划、持久化执行日志等完整引擎**；本阶段不强制实现该引擎，但 **事件模型应便于未来接 Logger / Replan**。

---

## 2. 已确认的决策摘要

| 决策点                 | 选择                                                  |
| ---------------------- | ----------------------------------------------------- |
| Tool 是否含 Playwright | **是**（与 PRD MVP「Agent + Playwright」一致）        |
| 运行与部署             | **本机跑通即可**；生产浏览器基础设施后续单独方案      |
| 产品入口               | **新页面** + **Chat 式交互**（非仅 CLI、非仅裸 API）  |
| 鉴权                   | **与 `/chat` 一致，必须登录**                         |
| 执行过程可见性         | **类 Cursor**：多步过程在页面内展示，**非**仅最终回复 |

---

## 3. 实现路径对比（2～3 种）

### 方案 A（推荐）：独立页面 + 独立 API + 精简客户端状态

- **页面**：`src/app/workflow-learning/page.tsx` 镜像 `chat/page.tsx` 的鉴权与布局模式。
- **UI**：新建 `WorkflowLearningChat`（或同名）组件——消息列表、输入、**执行时间线 / 步骤卡片**（见 §6.3）；**不**复用 `ChatUI` 全量逻辑（会话列表、RAG、文档上传等与 Phase 1 无关）。
- **API**：新建例如 `POST /api/workflow-learning/chat`（命名可微调），Body 为 `{ message: string }`；**响应以流式事件为主**（见 §5），使前端能增量渲染规划与工具执行过程。
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
        → LangChain Agent + tools（多步：规划 → 调用工具 → 再推理 …）
        → 执行过程中持续产出「事件」→ SSE（或等价 chunked 流）
        → 前端按事件追加 UI（时间线 / 步骤块），最后可有 summary 事件
```

- **会话状态**：Phase 1 可采用**前端内存**维护 `messages` + **当前轮次的「执行轨迹」**（见 §6.3）；刷新即清空，**不强制**写入 `Conversation` 表。

---

## 5. API 与 Agent 行为

### 5.1 请求与传输形态（建议）

- **POST** `/api/workflow-learning/chat`
- **鉴权**：与 `src/app/api/chat/route.ts` 类似，使用 `requireAuth()`；未授权返回 401。
- **请求体**：`{ "message": string }`（必填，trim 非空）。
- **响应**：**推荐 Server-Sent Events (SSE)**，`Content-Type: text/event-stream`（与项目现有 `streamConversationMessage` 模式对齐，便于复用客户端解析习惯）。若实现阶段有约束，可采用 **NDJSON 分块** 等等价方案，但语义须与下表一致。
- **原则**：**禁止**仅返回最终 `{ "reply": string }` 作为唯一用户可见结果；最终回复须作为流中的 **`assistant_final`**（或 `assistant_delta` 结束）等事件；**若本轮发生了工具调用**，则**必须**在最终回复前发出对应的 `tool_call_*` 事件。若本轮无工具、纯文本，仍须至少发出 **`run_start` → `assistant_final` → `run_end`**（或等价最小序列），见 §6.3。

### 5.2 事件模型（供 UI 与后续 Logger 对齐）

每条事件为 JSON 一行（SSE 的 `data:` 负载），**至少**包含 `type` 与 `timestamp`（ISO 或序号）。建议类型（可随实现微调名称，但语义保留）：

| type（示例）       | 含义                                        | UI 提示                      |
| ------------------ | ------------------------------------------- | ---------------------------- |
| `run_start`        | 本轮任务开始                                | 可选：显示 request id        |
| `plan` / `thought` | 模型内部规划或中间推理（若模型/框架可暴露） | 灰色辅助文本或可折叠「思考」 |
| `tool_call_start`  | 即将调用某工具                              | 显示工具名、参数摘要         |
| `tool_call_result` | 工具返回（成功或结构化错误）                | 展开显示截断后的结果、耗时   |
| `browser_step`     | Playwright 子步骤（可选细分）               | 与 tool 结果合并或单独一条   |
| `warning`          | 非致命告警                                  | 黄色提示条                   |
| `error`            | 致命失败                                    | 红色；可结束本轮             |
| `assistant_delta`  | 最终回答的 token/片段流式（可选）           | 主气泡内打字机效果           |
| `assistant_final`  | 最终完整回答（若未用 delta）                | 主气泡                       |
| `run_end`          | 本轮结束                                    | 解除 loading、允许新输入     |

- **顺序**：客户端按到达顺序**追加**到当前用户消息对应的「执行面板」或「助手消息」下的时间线，**不**依赖全部完成后再一次性渲染。
- **敏感信息**：`tool_call_result` 中对 URL、HTML 做长度截断与脱敏策略（见 §7）。

### 5.3 与 LangChain / Agent 的对接说明

- Agent 每选一次 tool、每收到一次 tool message，应映射为至少一对 **`tool_call_start` / `tool_call_result`**（或合并为带状态的单条，但须可区分开始/结束时刻）。
- 若框架提供 **on_llm_new_token** / **on_tool_start** 等回调，应桥接到上述事件；Phase 1 若某类 `thought` 无法稳定取得，可仅展示 **tool 与最终回复**，但须在实现计划中写明缺口与后续补齐方式。

### 5.4 非流式降级（仅开发或故障）

- 仅在 **SSE 不可用时**（如代理缓冲问题）允许临时降级为单次 JSON，且 body 须包含 **`events: [...]` 数组** 模拟顺序，**不得**作为默认产品路径。

---

### 5.5 Agent 与 Playwright Tool

- 使用项目已有 **OpenAI 兼容**配置（`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL` 等），与现有 JD/Chat 对齐。
- **Tool 设计原则（Phase 1）**：
  - 数量：**至少 1 个**面向 Playwright 的工具（例如「在受控 URL 上执行：打开页面 + 抓取标题或可见文本片段」），参数需严格 schema（避免任意代码执行）。
  - **禁止**：任意 URL 无界访问、任意时长无超时、无最大步数——须在实现中设 **allowlist（如仅 `localhost` + 应用 `NEXT_PUBLIC_APP_URL`）**、**超时**、**最大操作步数**（具体数值在实现 plan 中写死为常量并单测）。
- **运行环境**：仅在 **Node 运行时**（`pnpm dev` 下的 Route Handler）中启动 Playwright；**不在 Edge Runtime** 跑该 Route。

### 5.6 与现有 `POST /api/chat` 的关系

- **不修改**现有简单 `invoke` 聊天路径的行为；workflow-learning **独立 API**，避免影响招聘 Chat 的稳定性。

---

## 6. 前端（页面与交互）

### 6.1 路由与布局

- **路径**：`/workflow-learning`。
- **布局**：与 `chat/page.tsx` 类似——`container`、标题、副标题说明「Workflow Learning / Agent + Playwright（Phase 1 本机验证）」。
- **未登录**：与 Chat 相同，展示登录引导 + `SignInButton`。

### 6.2 交互（主路径）

- 用户输入一条任务/需求 → 展示 **user** 气泡。
- 助手侧**不是**单一 loading 转一句结论，而是呈现 **「执行过程 + 最终回复」**：
  - 在助手区域内先出现 **可扩展的时间线 / 步骤列表**（见 §6.3），随 SSE 事件**实时追加**；
  - 最终结论出现在时间线下方或同一助手气泡的底部（`assistant_final` / `assistant_delta`）。
- **输入**：在 `run_end` 或 `error` 之前，输入区可置灰或显示「执行中…」，防止重复提交（具体交互在实现 plan 中细化）。

### 6.3 类 Cursor 的可视化结构（建议）

目标：用户能感知 **LLM 在规划 → 调用工具 → 根据结果再推理** 的链条，而非黑盒。

- **助手消息容器**内建议分三层（视觉可合并，但信息层次分离）：
  1. **执行轨迹（Execution trace）**：按时间顺序列出事件卡片——工具名、参数摘要、状态（进行中/成功/失败）、耗时、结果摘要（截断）。
  2. **可选「思考 / 规划」折叠区**：映射 `thought` / `plan` 事件；默认折叠，避免刷屏。
  3. **最终回答区**：自然语言总结，可流式打字。
- **样式参考**：Cursor 聊天中「工具调用块」「进行中状态」——**本项目用自有 UI 组件实现**，不依赖外部产品截图；关键信息密度与可读性优先于装饰。
- **空状态**：若某轮仅产生最终回复（无工具事件），可只显示最终回答区，但**不得**破坏 API 的流式契约（仍应发送 `run_start` / `run_end` 或等价最小事件）。

---

## 7. 安全与运维

- **鉴权**：已登录用户才可调用 Playwright Tool API。
- **Playwright 滥用面**：通过 URL allowlist、超时、单请求内最大浏览器操作次数限制；日志中避免打印完整页面 HTML（可打 hash 或长度）。
- **本机依赖**：开发者需安装 Playwright 浏览器（`pnpm exec playwright install` 或文档说明）；CI 中 Phase 1 相关测试可采用 **mock 工具层** 或 **可选 job**，避免默认 CI 必装浏览器。

---

## 8. 错误处理（用户可见）

- **401**：未登录。
- **503 / 依赖不可用**：与现有 `DEPENDENCY_OUTAGE_MESSAGE` 模式对齐（若适用）。
- **Playwright 启动失败 / 超时**：通过 SSE 发送 `error` 事件 + 明确文案（例如「浏览器自动化不可用…」）；前端在时间线中展示为 **失败步骤**，并保留此前已成功步骤的可见性。

---

## 9. 测试策略（Phase 1）

- **单元测试**：Tool 参数校验、URL allowlist 逻辑、mock LLM 时不启动真实浏览器；**SSE 事件序列**的解析与排序（可用固定 `events[]` 夹具）。
- **可选集成**：本机有浏览器时的冒烟（验证端到端可见多步事件）；默认 `pnpm test:ci` 不强制依赖 Chromium。

---

## 10. 与后续 Phase 的衔接点

- **事件流即 Execution Logger 的雏形**：`tool_call_*` / `error` / `run_end` 等序列可直接对应 PRD 中的「记录完整执行过程」，后续落库、重放、Skill Validator 时以同一 schema 扩展即可。
- 最终 `assistant_final` 与轨迹一并构成 **Skill Builder** 的输入素材（phase 3+）。

---

## 11. Spec 自检（定稿前）

- [x] 无「TBD」占位；范围与 PRD phase 1 对齐。
- [x] 与「必须登录」「本机 Playwright」「独立页面」决策一致。
- [x] 生产 serverless 明确排除在 Phase 1 验收外。
- [x] **可观测执行**：已要求 SSE（或等价）+ 事件模型 + 类 Cursor 的 UI 层次，**禁止**仅最终 JSON 作为唯一交付。

---

## 12. 下一步

经评审同意后，使用 **writing-plans** 产出 Phase 1 **实现计划**（文件、任务顺序、环境变量与验收清单），再进入编码。
