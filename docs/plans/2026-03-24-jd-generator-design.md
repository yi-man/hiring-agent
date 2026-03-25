# JD Generator Agent 设计文档

## 源文档引用（执行基准）

以下两个文件是本设计与后续实现的唯一基准，必须优先于本文件中的摘要描述：

- `docs/references/jd-agent-source-design.md`
- `docs/references/jd-agent-prompt-template.md`

执行要求：

- 流程按 `Generate -> Evaluate -> Improve -> Decision/Re-evaluate`
- 数据结构按 `JobSchema/JD/JDScore/EvaluationResult`
- Prompt 文本按引用文件原文落地（含 JSON 约束、扣分规则、rewrite_required）

## 概述

本设计文档定义 JD Generator Agent 的首版产品与工程方案，目标是实现：
用户输入岗位需求 -> LLM 生成 JD -> 用户可直接编辑 -> 用户追加要求继续生成。

本方案严格参考外部设计资料中的 Agent 闭环与 Prompt 体系，保留 Generate / Evaluate / Improve / Decision 的核心能力；Memory、多平台适配、多 Agent 等扩展能力暂不纳入首版。

## 目标与范围

### 目标

- 支持通过自然语言岗位需求创建首版 JD
- 支持用户编辑生成结果
- 支持基于编辑后 JD + 追加要求继续生成
- 在继续生成流程中保留 Agent 的质量评估与定向优化机制

### 非目标（首版不做）

- 长期记忆（Memory）与历史最优样本学习
- 多平台 JD 风格自动适配（Boss、LinkedIn 等）
- 真实业务指标闭环（点击率、回复率、面试率）
- 多 Agent 拆分编排

## Agent 架构（首版）

### 模块划分

```text
JD Agent
 ├── Input Parser
 ├── JD Generator
 ├── JD Evaluator
 ├── JD Optimizer
 ├── Decision Engine
 └── Version Metadata (prompt_version/model)
```

### 核心流程

```text
[initial_generate]
岗位需求输入 -> Input Parser -> Generate -> Evaluate -> Decision
  -> (需要优化) Improve -> Re-evaluate -> PickBetter -> 返回 JD
  -> (无需优化) 直接返回 JD

[continue_generate]
用户编辑后的 JD + 追加要求 -> Evaluate -> Decision
  -> (需要优化) Improve -> Re-evaluate -> PickBetter -> 返回 JD
  -> (无需优化) 按追加要求做轻量改写后返回
```

### Human-in-the-loop 交互闭环

```text
AI 生成 JD
  -> 用户修改 JD 文本
  -> 用户输入追加要求
  -> Agent 再次评估并优化
```

## 数据结构

首版沿用标准结构，落地在 TypeScript 类型中。

```ts
type JobSchema = {
  title: string;
  seniority: string;
  skills: string[];
  responsibilities: string[];
  companyHighlights?: string[];
  tone?: 'startup' | 'tech' | 'formal';
};

type JD = {
  title: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  bonus: string[];
  highlights: string[];
};

type JDScore = {
  clarity: number;
  completeness: number;
  attractiveness: number;
  specificity: number;
};

type EvaluationResult = {
  scores: JDScore;
  issues: string[];
  evidence: string[];
  suggestions: string[];
  rewrite_required: boolean;
};
```

## Prompt 设计（以源文档为准，不做改写）

### Prompt 版本策略

- 使用你给定模板中的版本号：`prompt_version = "jd_v3.2"`
- 实现时将 Generate / Evaluate / Improve 的 System Prompt 与 User Prompt 按原文逐段落入代码常量，不做语义改写。

### 1) Generate Prompt

- 使用模板文档中的最终版 System Prompt 与 User Prompt
- 输入字段：`title/seniority/skills/responsibilities/company_highlights/tone`
- 输出要求：严格 JSON，结构必须为 `title/summary/responsibilities/requirements/bonus/highlights`

### 2) Evaluate Prompt

- 使用模板文档中的最终强化版 System Prompt 与 User Prompt
- 必须执行：列问题 -> 引证据 -> 扣分
- 输出要求：严格 JSON，包含 `scores/issues/evidence/suggestions/rewrite_required`
- 决策规则：任一维度 < 7 -> `rewrite_required = true`

### 3) Improve Prompt

- 使用模板文档中的最终版 System Prompt 与 User Prompt
- 目标：不是整稿重写，而是针对 `issues/suggestions` 定向优化
- 输出要求：返回完整优化后的 JSON JD（结构不变）
- 输入：`jd_json/suggestions/issues` + 用户追加要求

## 决策与选择策略

```ts
function needImprove(e: EvaluationResult): boolean {
  return e.scores.clarity < 7 || e.scores.attractiveness < 7 || e.scores.specificity < 7;
}

function pickBetter(jd1: JD, jd2: JD, e1: EvaluationResult, e2: EvaluationResult): JD {
  const score1 =
    e1.scores.clarity + e1.scores.completeness + e1.scores.attractiveness + e1.scores.specificity;
  const score2 =
    e2.scores.clarity + e2.scores.completeness + e2.scores.attractiveness + e2.scores.specificity;
  return score2 > score1 ? jd2 : jd1;
}
```

## API 设计

### 路由

- `POST /api/jd/agent`

### 请求体

```ts
type JDAgentRequest = {
  action: 'initial_generate' | 'continue_generate';
  jobInput?: string;
  currentJd?: string;
  extraInstruction?: string;
  tone?: 'startup' | 'tech' | 'formal';
};
```

### 继续生成兼容策略

- 默认优先使用 `extraInstruction`
- 当 `extraInstruction` 为空时，解析 `currentJd` 顶部指令块：
  - `#指令:`
  - `【要求】`
- 若两者都存在，始终以输入框 `extraInstruction` 为准

### 响应体

```ts
type JDAgentResponse = {
  jd: JD;
  evaluation: EvaluationResult;
  decision: {
    improved: boolean;
    picked: 'original' | 'improved';
  };
  meta: {
    model: string;
    promptVersion: string;
    action: 'initial_generate' | 'continue_generate';
  };
  warnings?: string[];
};
```

### JSON 严格校验

- API 层对 LLM 输出执行 JSON schema 校验（Generate/Evaluate/Improve 均校验）
- 任一阶段输出不满足结构时，触发重试；重试仍失败则返回可读错误与 `warnings`
- 首版禁止把主输出降级为非结构化文本

## 前端交互设计（单页）

### 页面信息架构

- 输入区
  - 岗位需求输入（必填，多行）
  - 风格选择（startup/tech/formal，默认 tech）
- 结果区
  - JD 编辑框（可直接修改）
  - 追加要求输入框（用于继续生成）
- 操作区
  - 生成 JD
  - 继续生成

### 状态机

- `idle`：未生成
- `generating`：首次生成中
- `ready`：可编辑可继续生成
- `continuing`：继续生成中
- `error`：请求失败（保留用户输入与编辑内容）

## 错误处理

- 参数校验错误 -> 400（缺少必要字段）
- LLM 调用失败/超时 -> 502（可读错误）
- 输出解析失败 -> 500（提示重试）
- 任意错误场景不清空编辑框，防止用户内容丢失

## 测试策略

### API 测试

- `initial_generate` 正常路径
- `continue_generate` 正常路径（带用户改稿）
- `extraInstruction` 与正文指令冲突优先级验证
- 缺失参数返回 400

### 页面测试

- 输入岗位需求后可生成 JD
- 编辑 JD + 追加要求后可继续生成
- 接口报错时保留文本内容
- loading/disabled 状态正确

## 验收标准

- 可以创建 JD
- 可以编辑生成结果
- 可以输入追加要求并继续生成
- 继续生成基于用户编辑后的内容，不是忽略用户改动重新写
- 返回包含评估与决策元数据，便于后续优化

---

_设计文档版本: 1.0_
_创建日期: 2026-03-24_
_最后更新: 2026-03-24_
