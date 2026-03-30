# 一、系统定义

## 1.1 一句话定义

> **Workflow Learning System = 能执行任务 → 动态调整 → 自动沉淀 → 再验证 → 才入库的自进化Agent系统**

---

## 1.2 核心闭环（最重要）

```text
执行任务 → 记录过程 → 生成Skill → 验证Skill → 成功才存储
                                 ↓
                              失败
                                 ↓
                           修复 / Replan
                                 ↓
                           再验证（循环）
```

---

# 二、系统架构（最终版）

```text
User
 ↓
Task Interpreter
 ↓
Skill Retriever
 ↓
┌───────────────┐
│ Skill命中？    │
└──────┬────────┘
       ↓
   YES │ NO
       ↓
Skill Runner     Agent Executor（带RePlanning）
       ↓                 ↓
       └──────→ Execution Logger ←──────┘
                          ↓
                   Skill Builder
                          ↓
                   Skill Validator ⭐（新增）
                          ↓
        ┌───────────────┬───────────────┐
        │               │               │
     成功存储        修复Skill        丢弃
        ↓               ↓
   Skill Store      再验证循环
```

---

# 三、核心流程（增强版）

## 3.1 主流程

```text
1. 用户输入
2. 检索 Skill
3. 命中：
      → 执行 Skill（含 fallback）
4. 未命中：
      → Agent执行（带RePlanning）
5. 记录完整执行过程
6. 生成 Skill
7. ❗验证 Skill（新增核心步骤）
8. 验证成功 → 存储
9. 验证失败 → 修复 or 丢弃
```

---

# 四、Execution Loop（执行引擎）

## 4.1 执行循环（带自适应）

```text
while not done:

    action = LLM决定
    result = 执行tool

    if result失败:
        error = 分析错误
        plan = RePlanning
    else:
        更新状态

    if 达成目标:
        done = true
```

---

## 4.2 状态结构（必须有）

```json
{
  "goal": "找AI招聘工具",
  "status": "running",
  "history": [],
  "context": {},
  "last_error": null
}
```

---

# 五、Skill 设计（最终结构）

## 5.1 Skill Schema

```json
{
  "id": "uuid",
  "name": "search_ai_tools",
  "description": "搜索AI招聘工具并总结",
  "strategy": "搜索 → 打开 → 提取 → fallback",
  "steps": [
    {
      "action": "search",
      "params": { "query": "{input}" }
    }
  ],
  "fallbacks": [
    {
      "condition": "no_result",
      "action": "retry_search"
    }
  ],
  "validation_rules": ["返回至少3个工具", "每个工具包含名称和描述"]
}
```

---

# 六、Skill Builder（生成）

## 6.1 输入

- execution steps
- errors
- replans

---

## 6.2 输出

```json
{
  "steps": [...],
  "strategy": "...",
  "fallbacks": [...]
}
```

---

## 6.3 Prompt（关键）

```text
根据执行过程：

1. 提取稳定 workflow
2. 抽象参数
3. 提取失败处理逻辑
4. 输出 skill JSON
```

---

# 七、⭐ Skill Validator（核心新增模块）

这是你这次新增的重点 👇

---

## 7.1 为什么必须有

否则会出现：

- skill 不可执行
- tool 参数错误
- 页面变化导致失效

---

## 7.2 验证方式（本质）

> 👉 **用 Skill 再跑一遍任务（Replay）**

---

## 7.3 验证流程

```text
Skill → Skill Runner → 执行 → 判断结果是否符合 criteria
```

---

## 7.4 Validator 输入

```json
{
  "skill": {...},
  "test_input": "找AI招聘工具"
}
```

---

## 7.5 Validator 输出

```json
{
  "success": true,
  "errors": [],
  "score": 0.92
}
```

---

## 7.6 验证规则

来源：

```json
"validation_rules": [
  "至少3个结果",
  "包含名称"
]
```

---

## 7.7 验证实现方式

### 方法1（推荐）：规则 + LLM

```text
1. 用代码判断结构
2. 用LLM判断质量
```

---

## 7.8 LLM验证 Prompt

```text
以下是执行结果：

{result}

请判断是否满足：
1. 至少3个AI招聘工具
2. 每个包含描述

输出：
{ success: true/false, reason }
```

---

# 八、Skill 验证失败后的处理（核心逻辑）

## 8.1 分支逻辑

```text
验证失败 →
   ↓
分析原因 →
   ↓
选择：
   - 修复 Skill
   - 重新生成
   - 丢弃
```

---

## 8.2 修复流程（推荐）

```text
失败 skill + 执行日志 → LLM → 修复 skill
```

---

## 8.3 修复 Prompt

```text
这个 skill 执行失败：

原因：
{error}

请修复：
- 参数问题
- 步骤顺序
- fallback逻辑
```

---

## 8.4 再验证（闭环）

```text
修复 → 再执行 → 再验证
```

---

# 九、Skill Runner（执行器）

## 9.1 执行逻辑

```ts
for step in steps:
    try:
        result = tool(step)
    except:
        run fallback
```

---

## 9.2 支持变量

```text
{input}
{result[0]}
{previous.output}
```

---

# 十、Skill 存储策略（重要）

## 10.1 只存“验证通过”的 Skill

```text
if validator.success:
    store
else:
    discard / retry
```

---

## 10.2 数据结构

```sql
skills(
  id,
  name,
  description,
  steps,
  embedding,
  score,
  created_at
)
```

---

# 十一、完整系统闭环（最终版）

```text
用户输入
 ↓
Skill检索
 ↓
执行（Skill or Agent）
 ↓
记录 steps + errors + replans
 ↓
生成 Skill
 ↓
⭐ Skill Validator
 ↓
成功？ ──────────────┐
 ↓ YES               ↓ NO
存储            修复 Skill
 ↓               ↓
结束        再验证（循环）
```

---

# 十二、关键设计原则（最终版）

## ✅ 原则1：Skill ≠ 执行过程，而是“可复用策略”

---

## ✅ 原则2：必须验证，否则Skill系统必崩

---

## ✅ 原则3：失败数据比成功更有价值

---

## ✅ 原则4：系统必须是闭环

```text
执行 → 学习 → 验证 → 修复 → 再验证
```

---

# 十三、MVP实现范围（最终）

## 必须实现

- Agent + Playwright
- RePlanning
- Execution Log
- Skill Builder
- ⭐ Skill Validator
- Skill Runner

---

## 可以延后

- Skill DSL
- Skill版本
- 多Agent

---

# 十四、落地开发顺序（强执行版）

## phase 1

- Agent + Tool 跑通

## phase 2

- Execution Loop + RePlanning

## phase 3

- Skill Builder

## phase 4

- ⭐ Skill Validator（核心）

## phase 5

- Skill 修复机制

---

# 十五、最终本质（你这个系统是什么）

不是：

❌ Agent
❌ 自动化脚本

而是：

> ✅ **Self-Improving, Self-Verifying Workflow System**

---

# 最后给你一个非常关键的建议（经验级）

👉 第一版 Validator 不要复杂：

只做：

```text
再跑一遍 + LLM判断是否OK
```

你就已经超过绝大多数 Agent 系统了。

---
