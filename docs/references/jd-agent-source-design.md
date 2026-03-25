# 一、背景与目标

## 1.1 背景

在招聘流程中，JD（职位描述）质量直接影响：

- 候选人点击率
- 回复率
- 面试转化率

传统方式存在问题：

- JD 质量不稳定（依赖招聘人员经验）
- 表达模板化、缺乏吸引力
- 难以持续优化

---

## 1.2 目标

设计一个 **JD 生成 Agent**，实现：

> 从非结构化招聘需求 -> 高质量结构化 JD -> 自动评估与优化 -> 持续改进

---

## 1.3 核心能力

- ✅ 语义理解（自然语言 -> Job Schema）
- ✅ 高质量 JD 生成（结构化 + 可控风格）
- ✅ 自动质量评估（LLM Scoring）
- ✅ 闭环优化（Generate -> Evaluate -> Improve）
- ✅ Human-in-the-loop（人工可编辑）

---

# 二、系统定位（Agent视角）

> JD Agent 是招聘 AI Agent 系统中的“内容生成与优化决策模块”

---

## 2.1 Agent 定义

JD Agent 具备以下能力：

- **Task Decomposition**：将 JD 生成拆分为多个子任务
- **Decision Making**：根据评分判断是否优化
- **Tool Use**：调用 LLM（生成 / 评分 / 优化）
- **Feedback Loop**：基于评估结果持续优化

---

# 三、系统架构设计

---

## 3.1 模块划分

```
JD Agent
 ├── Input Parser（输入解析）
 ├── JD Generator（生成）
 ├── JD Evaluator（评分）
 ├── JD Optimizer（优化）
 ├── Decision Engine（决策）
 └── Memory（可选）
```

---

## 3.2 数据流（核心流程）

```
用户输入
   ↓
[1] 结构化解析（Job Schema）
   ↓
[2] JD生成（LLM）
   ↓
[3] JD评分（LLM）
   ↓
[4] 决策（是否优化）
   ↓
[5] JD优化（LLM）
   ↓
[6] 再评分（可选）
   ↓
输出最终JD
```

---

# 四、核心数据结构

---

## 4.1 Job Schema（输入标准化）

```ts
type JobSchema = {
  title: string;
  seniority: string;
  skills: string[];
  responsibilities: string[];
  companyHighlights?: string[];
  tone?: 'startup' | 'tech' | 'formal';
};
```

---

## 4.2 JD结构（输出）

```ts
type JD = {
  title: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  bonus: string[];
  highlights: string[];
};
```

---

## 4.3 评分结构

```ts
type JDScore = {
  clarity: number;
  completeness: number;
  attractiveness: number;
  specificity: number;
};
```

---

## 4.4 评估结果

```ts
type EvaluationResult = {
  scores: JDScore;
  issues: string[];
  evidence: string[];
  suggestions: string[];
  rewrite_required: boolean;
};
```

---

# 五、核心流程设计（Agent Loop）

---

## 5.1 主流程（伪代码）

```ts
async function jdAgent(input) {
  const schema = await parseInput(input);

  const jd = await generateJD(schema);

  const eval1 = await evaluateJD(jd);

  if (eval1.rewrite_required) {
    const improved = await improveJD(jd, eval1);

    const eval2 = await evaluateJD(improved);

    return pickBetter(jd, improved, eval1, eval2);
  }

  return jd;
}
```

---

## 5.2 决策策略（Decision Engine）

```ts
function needImprove(evalResult) {
  return (
    evalResult.scores.clarity < 7 ||
    evalResult.scores.attractiveness < 7 ||
    evalResult.scores.specificity < 7
  );
}
```

---

## 5.3 选择策略（Best JD）

```ts
function pickBetter(jd1, jd2, e1, e2) {
  const score1 = sum(e1.scores);
  const score2 = sum(e2.scores);

  return score2 > score1 ? jd2 : jd1;
}
```

---

# 六、Prompt 设计（核心）

---

## 6.1 三段式 Prompt 架构

| 阶段     | 作用     |
| -------- | -------- |
| Generate | 生成 JD  |
| Evaluate | 严格评分 |
| Improve  | 定向优化 |

---

## 6.2 设计原则

- 明确质量标准（好/坏）
- 强约束输出格式（JSON）
- 引入扣分机制（避免虚高）
- 输出可用于决策（rewrite_required）

---

## 6.3 Prompt 特点（总结）

- ✅ 结构化输出
- ✅ 可控风格（tone）
- ✅ 评分可解释（evidence）
- ✅ 可驱动自动优化

---

# 七、质量控制体系（关键）

---

## 7.1 LLM评分机制

评估维度：

- clarity（清晰度）
- completeness（完整性）
- attractiveness（吸引力）
- specificity（具体性）

---

## 7.2 质量门控（Quality Gate）

```ts
if (clarity < 7 || attractiveness < 7 || specificity < 7) {
  triggerImprove();
}
```

---

## 7.3 防止评分失真策略

- 强制扣分规则（空话 ≤6）
- 证据引用（evidence）
- 先分析再打分
- 可选：多模型评估

---

# 八、扩展能力设计

---

## 8.1 Memory（长期优化）

记录：

```ts
memory = {
  bestJD: [],
  companyTone: string,
  highConversionPatterns: [],
};
```

作用：

- 提升生成质量
- 个性化 JD

---

## 8.2 数据闭环（高级）

引入真实指标：

```ts
finalScore = LLMScore * 0.5 + replyRate * 0.3 + interviewRate * 0.2;
```

---

## 8.3 多平台适配

支持：

- Boss直聘（口语化）
- LinkedIn（专业化）

---

## 8.4 Multi-Agent 扩展

未来可拆分：

- JD Agent
- Publish Agent
- Screening Agent

---

# 九、Human-in-the-loop 设计

---

## 9.1 交互流程

```
AI生成JD
   ↓
用户修改
   ↓
Agent再次优化
```

---

## 9.2 价值

- 提高可控性
- 降低错误风险
- 提升用户信任

---

# 十、工程实现建议

---

## 10.1 技术栈

- 前端：React
- 后端：Node.js
- LLM：OpenAI / Claude
- 自动化：Chrome Extension（后续发布用）

---

## 10.2 关键工程点

- Prompt版本管理（A/B测试）
- 重试机制（LLM不稳定）
- JSON校验（防输出错误）
- 日志与评估记录

---

# 十一、总结（核心价值）

> JD Agent 将传统“手写JD”升级为“可控生成系统”，通过生成-评估-优化闭环，实现 JD 质量的稳定提升，并为招聘全链路提供高质量输入。

---

# 十二、面试一句话版本（强烈建议记住）

> 我设计了一个 JD 生成 Agent，通过结构化输入解析、LLM生成、严格评分与定向优化，构建了一个生成-评估-优化闭环，并引入质量门控机制，使 JD 输出从一次性生成升级为可控的高质量生产系统。
