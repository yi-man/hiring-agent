# Workflow Agent 系统

## 设计文档 v1.0

探索 · 固化 · 执行 · 自愈

## 1. 系统概览

本系统实现了一套 Browser Agent Workflow 管理机制，核心目标是：

- 首次执行任务时，通过 LLM 自主探索完成路径
- 将探索出的步骤固化为可复用的 Workflow
- 后续执行完全不依赖 LLM，零 token 消耗
- 执行失败时，LLM 自动接管恢复，并更新 Workflow

### 1.1 四个核心阶段

| 阶段   | 触发时机              | LLM 参与                | 输出                |
| ------ | --------------------- | ----------------------- | ------------------- |
| ① 探索 | 首次执行新任务        | 全程参与，ReAct 循环    | 完成任务 + 执行历史 |
| ② 固化 | 探索成功后            | 一次调用，提炼步骤      | Workflow JSON 文件  |
| ③ 执行 | 每次运行已有 Workflow | 不参与（零 token）      | 任务结果            |
| ④ 自愈 | 执行失败时            | 接管恢复，更新 Workflow | 新 Workflow 版本    |

### 1.2 系统架构

| 后端（Node.js）              | Chrome 插件        |
| ---------------------------- | ------------------ |
| LangGraph ReAct Agent        | DOM 操作执行器     |
| WorkflowManager（存取/版本） | 截图 & 文本提取    |
| WorkflowRunner（调度执行）   | WebSocket 通信     |
| RecoveryEngine（自愈）       | 复用用户真实登录态 |

后端持有 LLM 和 Workflow 逻辑，插件只负责执行浏览器操作。API Key 不暴露给客户端。

## 2. 探索阶段

探索阶段使用标准 LangGraph ReAct Agent，LLM 通过调用浏览器工具自主完成任务。

### 2.1 可用工具

| 工具名             | 功能           | 备注                      |
| ------------------ | -------------- | ------------------------- |
| browser_navigate   | 导航到指定 URL | 自动处理登录跳转          |
| browser_screenshot | 截取当前页面   | 返回 base64，LLM 可直接看 |
| browser_get_text   | 提取元素文本   | 支持 CSS selector         |
| browser_click      | 点击元素       | 支持 selector 或文字      |
| browser_get_url    | 获取当前 URL   | 确认页面状态              |
| wait_for_human     | 等待人工介入   | 验证码、滑块等场景        |

### 2.2 探索流程

1. 用户输入任务描述
2. LangGraph ReAct Agent 开始推理
3. Agent 调用工具（先截图 → 分析页面 → 执行操作）
4. 循环执行直到任务完成
5. 系统自动收集完整执行历史

### 2.3 执行历史格式

探索完成后，系统收集的原始执行历史结构如下：

```typescript
interface ExecutionHistory {
  goal: string;              // 原始任务描述
  steps: ExecutionStep[];   // 所有工具调用记录
  success: boolean;         // 是否成功完成
}

interface ExecutionStep {
  tool: string;             // 工具名
  args: Record<string, any>;// 调用参数
  result: string;           // 执行结果
  timestamp: number;        // 执行时间戳
}
```

## 3. 固化阶段

探索成功后，系统调用 LLM 一次，将执行历史提炼为结构化的 Workflow JSON，后续执行不再需要 LLM。

### 3.1 Workflow 数据结构

```typescript
interface Workflow {
  id: string;               // 唯一 ID
  name: string;             // 用户命名（如"读第一条消息"）
  goal: string;             // 任务描述
  version: number;          // 当前版本号
  steps: WorkflowStep[];    // 固化的步骤列表
  createdAt: string;
  updatedAt: string;
  history: WorkflowVersion[];  // 历史版本
}

interface WorkflowStep {
  id: string;               // 步骤 ID（恢复时用）
  tool: string;             // 工具名
  args: Record<string, any>;// 参数
  description: string;      // 步骤说明（调试用）
  canBatch: boolean;        // 是否可与下一步合并发送
  successCondition?: string;// 软错误判断条件（可选）
}
```

### 3.2 canBatch 优化

并非每步都需要后端确认，系统将步骤分为两类以减少网络往返：

| 类型       | canBatch | 代表工具              | 说明                       |
| ---------- | -------- | --------------------- | -------------------------- |
| 确定性步骤 | true     | navigate, click, wait | 打包连续发送，插件直接执行 |
| 感知步骤   | false    | screenshot, get_text  | 必须回传后端，作为恢复断点 |

感知步骤（canBatch: false）是重要的"检查点"，执行结果会被后端记录，是自愈时的恢复起点。

### 3.3 固化提示词要点

- 去除纯探索性步骤（多余的截图、失败的尝试）
- 保留必要的截图步骤作为检查点
- 为每步生成清晰的 description
- 判断每步的 canBatch 属性
- 提取成功条件（successCondition）用于软错误检测

## 4. 执行阶段

执行阶段后端只是一个状态机调度器，不调用 LLM，零 token 消耗。

### 4.1 执行状态机

| 状态             | 触发条件     | 下一状态         | 说明          |
| ---------------- | ------------ | ---------------- | ------------- |
| IDLE             | 用户发起执行 | RUNNING          | 开始执行      |
| RUNNING          | 步骤执行成功 | RUNNING / DONE   | 继续或完成    |
| RUNNING          | 步骤执行失败 | RECOVERING       | 触发自愈      |
| RECOVERING       | LLM 恢复成功 | PROMPTING_UPDATE | 询问更新      |
| RECOVERING       | LLM 恢复失败 | FAILED           | 报告失败      |
| PROMPTING_UPDATE | 用户确认     | UPDATING         | 更新 Workflow |
| PROMPTING_UPDATE | 用户拒绝     | DONE             | 保持原版本    |

### 4.2 步骤发送策略

后端按 canBatch 属性决定如何向插件发送步骤：

```javascript
// 连续的 canBatch:true 步骤打包发送
batch: [
  { tool: "browser_navigate", args: { url: "..." } },
  { tool: "browser_click",    args: { selector: ".btn" } },
]

// canBatch:false 步骤单独发送，等待结果
single: { tool: "browser_screenshot", args: {} }
```

### 4.3 错误类型与处理

| 错误类型 | 判断方式                    | 处理                      |
| -------- | --------------------------- | ------------------------- |
| 硬错误   | 工具执行抛出异常            | 立即触发 RECOVERING       |
| 软错误   | 结果不满足 successCondition | 后端检测后触发 RECOVERING |
| 超时     | 步骤执行超过 30s            | 触发 RECOVERING           |

## 5. 自愈阶段

执行失败时，系统构建恢复上下文，将控制权交还给 LLM，从断点处继续探索。

### 5.1 恢复上下文

LLM 接管时，系统提供以下信息：

- 原始任务目标（goal）
- 已成功执行的步骤及其结果
- 出错步骤的名称、参数、错误信息
- 当前页面截图（最重要的上下文）

```javascript
const recoveryContext = {
  goal: workflow.goal,
  completedSteps: stepsBeforeError,
  failedStep: { ...step, error: errorMsg },
  currentScreenshot: await takeScreenshot(),
};
```

### 5.2 自愈流程

1. 捕获失败步骤，记录已完成步骤
2. 截取当前页面截图
3. 构建恢复上下文，切换到 Agent 模式
4. LLM 从失败步骤处开始重新探索
5. 任务完成后，询问用户是否更新 Workflow
6. 用户确认后，合并新路径并保存新版本

### 5.3 Workflow 版本管理

每次恢复更新都生成新版本，旧版本保留在 history 中：

```typescript
interface WorkflowVersion {
  version: number;
  steps: WorkflowStep[];
  reason: string;       // 更新原因（如"step_2 失败，selector 变更"）
  createdAt: string;
}
```

版本保留策略：默认保留最近 10 个版本，支持手动回滚到任意历史版本。

## 6. 实现指南（LangChain + OpenAI）

### 6.1 依赖安装

```bash
npm install @langchain/openai @langchain/langgraph
         @langchain/core zod ws dotenv
npm install playwright  # 本地调试用
```

### 6.2 项目结构

```
src/
├── index.ts              # 入口：聊天 REPL
├── agent/
│   ├── explorer.ts       # 探索 Agent（LangGraph ReAct）
│   └── recovery.ts       # 恢复 Agent（LangGraph ReAct）
├── workflow/
│   ├── manager.ts        # Workflow 存取 & 版本管理
│   ├── runner.ts         # 执行状态机（无 LLM）
│   └── solidifier.ts     # 探索历史 → Workflow JSON
├── bridge/
│   └── websocket.ts      # 后端 ↔ 插件通信
└── tools/
    └── browser-tools.ts  # 工具定义（Zod schema）
```

### 6.3 关键实现要点

#### 探索 Agent

- 使用 createReactAgent + MemorySaver，保持多轮对话上下文
- stream 模式输出，实时展示每步工具调用
- 执行历史通过 LangGraph 的 messages state 自动保留

#### 固化（Solidifier）

- 单次 LLM 调用，structured output 直接输出 WorkflowStep[]
- 使用 Zod schema 约束输出格式，避免解析错误
- canBatch 判断规则内置在 prompt 中

#### 执行 Runner

- 纯状态机，不依赖 LLM，按 canBatch 打包或单发步骤给插件
- 感知步骤结果存入 checkpoints，作为自愈恢复起点
- 超时、硬错误、软错误统一收敛到 RECOVERING 状态

#### 恢复 Agent

- 复用 explorer 的工具集和 Agent 配置
- System prompt 注入断点上下文和已完成步骤
- 恢复成功后自动提取新路径，调用 solidifier 更新 Workflow

#### WebSocket 通信协议

- 后端 → 插件：{ type: "exec_batch" | "exec_single", steps }
- 插件 → 后端：{ type: "result", stepId, success, data, error }
- 截图以 base64 形式回传，后端转发给 LLM

### 6.4 Token 消耗模型

| 操作              | LLM 调用次数       | 说明                          |
| ----------------- | ------------------ | ----------------------------- |
| 首次探索任务      | 多次（ReAct 循环） | 每个工具调用约 1 次，只做一次 |
| 固化 Workflow     | 1 次               | 探索完成后调用一次            |
| 正常执行 Workflow | 0 次 ✅            | 纯状态机调度，零 token 消耗   |
| 自愈恢复          | 数次（偶发）       | 仅在执行失败时触发            |
