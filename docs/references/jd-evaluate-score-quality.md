# JD Evaluate 质量校准（Golden Dataset）

本文说明 JD 评估（`jd-agent.evaluate`）如何用内置 golden sample 做低成本回归。设计见 [`docs/superpowers/specs/2026-07-13-jd-evaluate-golden-dataset-design.md`](../superpowers/specs/2026-07-13-jd-evaluate-golden-dataset-design.md)。

## 一句话

固定 16 条合成 JD（优质 / 合格 / 问题 / 编造风险各 4 条），在改 evaluate prompt 或模型时用真实 LLM 小样本回归；日常只跑结构单测，不强制进 CI 调模型。

## 数据集位置

```text
src/lib/validation/jd-evaluate/
├── dataset.ts
├── assert.ts
├── datasets/jd-evaluate-golden-samples.v1.json
└── scripts/
```

## CLI

```bash
bun run validation:jd-evaluate -- dataset
bun run validation:jd-evaluate -- dataset show high_quality
bun run validation:jd-evaluate -- dataset export problematic
bun run validation:jd-evaluate -- run              # 全量 16 条，需 LLM Key
bun run validation:jd-evaluate -- run fabricated_risk
```

`run` 直接调用 `runLLM({ stage: 'evaluate' })`，公司上下文来自样本字段，**不走 RAG**。

## 迭代建议

| 层级                            | 何时                                | 成本                |
| ------------------------------- | ----------------------------------- | ------------------- |
| Jest 结构 / assert 单测         | 改数据集或断言逻辑                  | 无 LLM              |
| `validation:jd-evaluate -- run` | 改 `jd_v*` evaluate prompt 或换模型 | 最多 16 次 evaluate |
| improve / regenerate 闭环       | 二期                                | —                   |
