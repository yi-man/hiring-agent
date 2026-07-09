# 候选人评分质量机制

本文说明 JD 筛选里的简历评分如何保持稳定、可解释、可迭代。

Prompt 的统一注册和 LangChain 渲染方式见 [`prompt-management.md`](./prompt-management.md)。

## 一句话版本

评分质量由四层共同保证：

1. 中文证据型 prompt：要求 LLM 只根据 JD 维度和简历事实打分。
2. 岗位类型校准集：根据 JD 自动选择技术、产品、销售等岗位的评分锚点，并维护可回归的简历评分样本。
3. 版本化复用：历史分数只有在简历、JD 和评分质量版本都一致时才复用。
4. 低成本迭代：默认用回放和单测，不每次真实调 LLM；只有 prompt、模型或校准集变化时跑小样本真实回归。

## 版本化具体怎么做

当前评分结果会把质量版本写进 `scoreDetail`：

| 字段                   | 含义                   | 什么时候需要升级                        |
| ---------------------- | ---------------------- | --------------------------------------- |
| `promptVersion`        | LLM 评估提示词版本     | 改 prompt、输出要求、证据要求           |
| `scoringVersion`       | 本地加权公式和阈值版本 | 改公式、权重、`llmBonus` 范围、动作阈值 |
| `calibrationVersion`   | 岗位类型校准集版本     | 改岗位分类、锚点、各类岗位判断标准      |
| `qualityPolicyVersion` | 评分质量迭代策略版本   | 改回归层级、抽样策略、反馈沉淀规则      |

历史评估复用时，runner 会同时检查：

- 候选人是同一个；
- 简历 `resumeId` 是同一个；
- JD 没有更新；
- 上面四个质量版本都等于当前版本。

只要任一项不一致，就会记录“历史评估已过期”，重新评估当前简历。这样可以避免旧 prompt 或旧校准集下的分数混进新排序。

```mermaid
flowchart TD
  A["召回候选人"] --> B["查找 JD + 候选人的历史评分"]
  B --> C{"同一份简历?"}
  C -- 否 --> R["重新评分"]
  C -- 是 --> D{"JD 未更新?"}
  D -- 否 --> R
  D -- 是 --> E{"prompt/scoring/calibration/policy 版本一致?"}
  E -- 否 --> R
  E -- 是 --> F["复用历史评分"]
  R --> G["保存新 scoreDetail 和版本"]
```

## 校准集怎么工作

用户不需要一条条手工录入初始校准样本。系统会根据 JD 文本自动推断岗位类型，并给 LLM 一组紧凑的评分锚点。

当前内置岗位类型：

| 类型         | 适用岗位                                  |
| ------------ | ----------------------------------------- |
| `technical`  | 后端、前端、全栈、架构、DevOps 等研发岗位 |
| `data_ai`    | 算法、数据科学、LLM、RAG、AI Agent 等     |
| `product`    | 产品经理、B 端产品、增长产品等            |
| `sales`      | 销售、商务、BD、大客户等                  |
| `operations` | 用户运营、内容运营、活动运营、增长运营等  |
| `design`     | UI、UX、视觉、交互、设计系统等            |
| `management` | 负责人、经理、总监、主管、团队管理等      |
| `general`    | 无法明确归类的通用岗位                    |

每个类型都有四个锚点：

| 锚点     | 动作      | 分数范围 | 用途                           |
| -------- | --------- | -------- | ------------------------------ |
| 强匹配   | `chat`    | 85-100   | 核心证据充分，值得优先联系     |
| 合格匹配 | `chat`    | 70-84    | 多数要求匹配，少量缺口面试确认 |
| 边界匹配 | `collect` | 61-69    | 信息不足或可迁移，先补充材料   |
| 弱匹配   | `skip`    | 0-60     | 核心证据缺失，暂不联系         |

这些锚点会进入 `evaluationSchema.calibrationProfile`，LLM 评分时必须先判断候选人更接近哪个锚点，再给出分项分数。

## 简历评分数据集

初始 golden sample 数据集已经落在仓库里：

```text
src/lib/validation/resume-scoring/datasets/scoring-golden-samples.v1.json
```

它属于通用验证模块 `src/lib/validation/`：

```text
src/lib/validation/
└── resume-scoring/
    ├── dataset.ts
    ├── datasets/
    │   └── scoring-golden-samples.v1.json
    └── scripts/
        ├── dataset-ops.ts
        └── ops.ts
```

数据集按岗位类型维护，每类 4 条样本：

- 强匹配：预期 `chat`，分数 85-100；
- 合格匹配：预期 `chat`，分数 70-84；
- 边界匹配：预期 `collect`，分数 61-69；
- 弱匹配：预期 `skip`，分数 0-60。

每条样本包含：

| 字段         | 含义                                         |
| ------------ | -------------------------------------------- |
| `category`   | 岗位类型，如 `technical`、`data_ai`、`sales` |
| `anchor`     | 强匹配、合格匹配、边界匹配、弱匹配           |
| `jobTitle`   | 样本 JD 标题                                 |
| `jdText`     | 样本 JD 要点                                 |
| `resumeText` | 样本简历事实                                 |
| `expected`   | 预期动作、分数区间和优先级                   |
| `rationale`  | 为什么这个样本应该落在对应锚点，用于人工复盘 |

这份数据集的定位是“初始校准集 + 小样本真实回归集”。后续真实招聘中发现误判时，不建议直接改 prompt；优先把误判样本沉淀进这个数据集或调整对应岗位类型的锚点。

## 校准集与验证命令

本地提供了两个命令入口：

- `candidate-screening:calibration`：查看岗位校准锚点、诊断 JD 会落到哪个岗位类型。
- `validation:resume-scoring`：查看和导出简历评分 golden sample 数据集，作为小样本回归输入。

```bash
bun run candidate-screening:calibration -- list
bun run candidate-screening:calibration -- show technical
bun run candidate-screening:calibration -- doctor 高级后端工程师 Java Spring Boot 高并发
bun run candidate-screening:calibration -- export sales

bun run validation:resume-scoring -- dataset
bun run validation:resume-scoring -- dataset show technical
bun run validation:resume-scoring -- dataset export data_ai
```

命令用途：

| 命令                        | 用途                                                |
| --------------------------- | --------------------------------------------------- |
| `list`                      | 查看所有内置岗位类型                                |
| `show <category>`           | 查看某个岗位类型的强匹配、合格、边界、弱匹配锚点    |
| `doctor <jd text...>`       | 输入一段 JD 文本，诊断系统会自动选哪个岗位校准类型  |
| `export <category>`         | 导出完整 JSON profile，方便评审和留档               |
| `dataset`                   | 查看简历评分 golden sample 数据集概览               |
| `dataset show <category>`   | 查看某个岗位类型的评分样本                          |
| `dataset export <category>` | 导出某个岗位类型的评分样本 JSON，用于真实小样本回归 |

推荐使用方式：

1. 新增或调整一个岗位前，先用 `doctor` 看系统会归到哪个类型。
2. 如果归类不符合预期，优先调整 `src/lib/candidate-screening/calibration.ts` 的类型识别规则。
3. 如果归类正确但评分偏差高，调整对应岗位类型的锚点和 guidance。
4. 锚点或分类变化后，升级 `CANDIDATE_SCREENING_CALIBRATION_VERSION`。
5. 用 `bun run validation:resume-scoring -- dataset show <category>` 找到最接近的强匹配、边界或弱匹配样本。
6. 如果真实误判无法被现有样本覆盖，把匿名化后的 JD + 简历 + 人工预期动作加入数据集。
7. 用 `bun run validation:resume-scoring -- dataset export <category>` 作为 prompt、模型或校准集变化后的真实小样本回归输入。

## 低成本迭代机制

系统内置三层回归策略：

| 层级                 | 触发                            | LLM 成本   | 做什么                                           |
| -------------------- | ------------------------------- | ---------- | ------------------------------------------------ |
| `replay`             | 每次改评分代码                  | 无         | 用单测和录制输出回放，验证解析、公式、排序、复用 |
| `golden-sample`      | 改 prompt、模型、校准集、rubric | 小样本     | 每类岗位抽 5-10 条强匹配/边界/弱匹配真实调用     |
| `production-monitor` | 每次真实筛选                    | 无额外成本 | 记录分数分布、用户改判、联系和面试结果           |

推荐的迭代节奏：

1. 真实运行后收集用户改判、是否联系、是否回复、面试结果、最终录用结果。
2. 每周按岗位类型复盘误报、漏报和边界样本。
3. 高频错误先沉淀为校准锚点或硬规则，不急着调大 prompt。
4. 只有当规则变化影响评分结果时，升级对应版本号。
5. 版本升级后跑小样本真实回归；通过后再让历史评分自动失效并重评。

## 后续怎么调整

常见修改对应文件：

| 想调整什么                          | 文件                                         |
| ----------------------------------- | -------------------------------------------- |
| 岗位类型识别、默认校准锚点          | `src/lib/candidate-screening/calibration.ts` |
| 简历评分验证模块与数据集            | `src/lib/validation/resume-scoring/`         |
| prompt 文案和输出约束               | `src/lib/candidate-screening/prompts.ts`     |
| 评分公式、`llmBonus` 范围、版本写入 | `src/lib/candidate-screening/scoring.ts`     |
| 历史评分复用判断                    | `src/lib/candidate-screening/runner.ts`      |
| 质量版本常量                        | `src/lib/candidate-screening/constants.ts`   |

版本升级规则：

- 改 prompt：升级 `CANDIDATE_EVALUATION_PROMPT_VERSION`。
- 改公式或阈值：升级 `CANDIDATE_SCREENING_SCORING_VERSION`。
- 改岗位分类或锚点：升级 `CANDIDATE_SCREENING_CALIBRATION_VERSION`。
- 改回归和反馈策略：升级 `CANDIDATE_SCREENING_QUALITY_POLICY_VERSION`。

这样做的好处是：每次改动都能明确影响范围，旧评分不会悄悄污染新结果，也不会为了每次小改动都全量调用 LLM。
