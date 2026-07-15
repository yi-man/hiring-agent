# `screen_candidates` 统一浏览器 DSL 设计

**状态：已确认，待实施计划**<br>
**日期：2026-07-14**

## 背景与结论

`screen_candidates` 的定位与 `publish_jd` 相同：持久化的 Workflow 是浏览器操作的 JSON 表达，类似 Cypress 的步骤图，而不是招聘领域 API 的包装。

因此，`search_candidates`、`enrich_candidate`、`chat_candidate`、`collect_candidate` 与 `extract_candidates` 都不能再作为 DSL action。它们将被 `navigate`、`fill`、`click`、`wait_*`、`observe` 与已有的 `condition/end/next` 替代。

系统只维护 **一个** 名为 `screen_candidates` 的 Workflow artifact。它可以有多个结束节点和从不同步骤开始的可重入段，但不能拆成 search/contact/collect 多份 Workflow，也不新增 `entrypoint` 字段。调用方沿用现有 `currentStepId` 指定从图中哪个已有步骤继续执行。

本设计取代 [2026-07-13-candidate-screening-browser-workflow-design.md](2026-07-13-candidate-screening-browser-workflow-design.md) 中“筛选专用 action + 专用 executor”的设计。旧文档与其 Skill 历史版本保留作审计，不再作为新运行时的实现依据。

## 目标

- 用一个可 Explore、可版本化、可修复的通用浏览器 DSL 完整表达 Boss-like 的候选人筛选操作。
- 搜索每个 keyword 后冻结候选人队列，不依赖返回原列表页或重复搜索来逐个进入简历详情。
- 将详情 HTML 交给现有候选人解析和 AI 评估；AI 判断是否打招呼，但不拥有浏览器操作。
- 对入选候选人执行“打开详情 → 打招呼入口 → 填写并发送消息 → 收藏”。
- 多 keyword 是同一 `screen_candidates` 的多次搜索段调用，不是多份 Workflow。
- 最大化复用 `publish_jd` 的步骤类型、参数插值、`next/currentStepId`、目标修复、版本管理、trace 和 Skill 存储。

## 非目标

- 不新增候选人领域的 DSL action、`for_each_candidate`、`entrypoint` 或第二套 Workflow runtime。
- 不保存可变的浏览器 `Page`、DOM handle 或列表页会话状态作为恢复依据。
- 不改变 AI 评分模型、RAG 召回策略或职位筛选产品策略；本次只改变浏览器执行边界。
- 不删除历史 Skill 或已有 Workflow 版本。

## 方案取舍

| 方案                                                       | 结论   | 原因                                                                  |
| ---------------------------------------------------------- | ------ | --------------------------------------------------------------------- |
| 延续候选人专用 `search_candidates/chat_candidate` executor | 不采用 | 持久化内容不是浏览器 DSL，页面操作仍藏在 adapter。                    |
| 新建候选人专用浏览器 runtime                               | 不采用 | 会复制 `publish_jd` 的图路由、修复、版本和 trace，后续必然漂移。      |
| 抽取现有 JD 的通用浏览器步骤内核                           | 采用   | 一个 DSL 语义、一个执行与修复内核；领域 Runner 只处理业务事实和决策。 |

## DSL 与步骤图

### 通用语义

`PublishSkill`、`PublishStep`、`PublishExecutionContext` 和 `publish_skills` 表继续复用；实现中可补充中性的 `BrowserWorkflow*` 别名以消除新增代码中的 “Publish” 误导，但不改变既有 JD 调用方的公开行为。

新 Skill 的 metadata 标记为 `dsl_version: 'browser-v2'`。新 runtime 只执行该标记的 `screen_candidates` Skill。历史专用 action 的 Skill 仍可在库和详情页中查看，但永不进入新 runtime。

新 action 集合为：

- `navigate`
- `fill`
- `click`
- `wait_for_url`、`wait_for_text`（以及已有、确有必要的通用 wait）
- `observe`

既有 JD Skill 的 `add_keywords` 为兼容保留；新候选人 Skill 不使用它。已有 `condition` 与 `end` Step 保持不变。所有边继续由 `next` 或 condition 的 true/false 分支表示。

`observe` 是唯一新增的通用事实采集 action：

```json
{
  "id": "detail_observe",
  "type": "action",
  "action": "observe",
  "params": {
    "format": "html",
    "saveAs": "profileHtml"
  },
  "next": "detail_complete"
}
```

初始范围只需要整页 HTML。执行器通过已有 `BrowserExecutor.snapshot()` 取得数据，并在 workflow execution result 中按 `saveAs` 返回 observation。后续若有明确需求，可在不引入领域概念的前提下扩展为 `text`、`attribute` 或目标范围观察。`observe` 不解析候选人，也不输出 `RawCandidate`。

### 单一 `screen_candidates` 图

步骤 ID 是实现可读的稳定标识，不是第二层入口协议。实际名称可随项目命名规范微调，连接关系不可改变：

```text
search_open (navigate 列表页)
  → auth_ready? (condition)
    ├─ 已登录 → search_fill(keyword)
    └─ 未登录 → login_fill_username → login_fill_password → login_submit → login_wait
                                                        → search_fill(keyword)
  → search_submit → search_wait → search_observe(listHtml) → search_complete (end)

detail_open (navigate profileUrl) → detail_wait → detail_observe(profileHtml)
  → detail_complete (end)

contact_open (navigate profileUrl) → contact_open_greeting → contact_fill_message
  → contact_send → contact_wait_success → collect_click → action_complete (end)

collect_open (navigate profileUrl) → collect_click → action_complete (end)
```

`contact_wait_success` 到 `collect_click` 的固定 `next` 保证 AI 已选中并联系的候选人会在发送后收藏。`collect_open` 仍保留，供已有“只收藏”决策或未来明确的直接收藏需求进入同一个 `collect_click`。登录段同样完全由浏览器 primitive 组成。

## 运行流、队列与 AI 判断

### 一个 keyword 的完整流

1. Runner 使用 `currentStepId = search_open` 和 `{ keyword, filters }` 调用通用执行器。
2. `search_observe` 返回 `listHtml`。Boss-like 领域解析器从 HTML 提取 `platformCandidateId`、完整 `profileUrl` 与列表摘要。
3. Runner 立即复用现有 Candidate、CandidateResume、CandidateScreeningResult 和 run event 进行去重、入库与排序。持久化的候选人 identity、`profileUrl`、rank 与 source keyword 构成队列；它们而非浏览器页面是恢复依据。
4. 对每一位未去重候选人，Runner 用 `{ profileUrl }` 和 `currentStepId = detail_open` 执行详情段。
5. `detail_observe` 返回 `profileHtml`。领域解析器将其合并为完整 `RawCandidate`，再复用现有 ingest、评估和 AI action plan。
6. AI 拒绝时，Runner 进入下一位候选人；AI 入选并决定 `chat` 时，Runner 以 `{ profileUrl, message }` 和 `currentStepId = contact_open` 继续图。浏览器图自动在发送后执行收藏。

AI 不是 DSL step，也不通过隐式“感知页面”控制浏览器。Runner 明确知道自己刚执行到了 `detail_complete`，只消费该调用返回的 `profileHtml`，然后依据现有评估结果选择是否重新进入图的联系段。这一边界同时保证 DSL 通用性与领域决策的可测试性。

### 列表一致性与恢复

不保存列表页的 DOM 或返回历史，也不为每一位候选人重跑搜索。首个观察到的列表转换为稳定 URL/平台 ID 队列，之后直接 `navigate(profileUrl)`。这避免排序变化、新简历插入、浏览器回退或 SPA 状态丢失造成的错位。

每个 keyword 搜索完成后立刻写入候选人和 `search_keyword_completed` run event，事件含 keyword、候选人数、去重数与观察摘要/哈希。恢复时已完成 keyword 不重搜；尚未完成的 keyword 可以安全重试，因为尚未触发外部候选人操作，且候选人 identity 去重。若在写完成事件前进程中断，最多重搜该 keyword 一次，不会导致重复打招呼或收藏。

候选人 action 继续使用现有 `CandidateActionLog` 幂等键。联系与收藏分别产生可审计的 action/event；只有两者均成功时，联系人路径才视为整体成功。消息已发送但收藏失败时，恢复只继续收藏，绝不重发消息。

### 多 keyword

现有 `SearchPlan.keywords` 保持为搜索项集合。Runner 顺序地为每个 keyword 从 `search_open` 调用同一图；过滤条件保持相同。所有结果在详情前按已有平台 ID / 规范化 `profileUrl` 去重，达到现有 `maxCandidates` 即停止剩余搜索。每位候选人的来源 keyword 写入 run event，方便运行详情追溯。

首次发现没有兼容 Skill 时，Explorer 使用第一个实际 keyword 进行真实搜索，并把这次 `listHtml` 作为该 keyword 的搜索结果返回给 Runner；保存新 Skill 后不能再为了“使用新版本”重复执行一次相同搜索。

## 通用执行内核

从 `jd-publishing` 中抽出可复用的 browser workflow runner，而不是把候选人塞入发布 JD 的业务 graph。其最小 API 形如：

```ts
runBrowserWorkflow({
  skill,
  currentStepId,
  context,
  executor,
  onStep,
  onRepair,
});
```

`currentStepId` 是一次调用的运行状态：为空时从首步骤运行，传值时从该 Skill 中已存在的步骤运行。它不写入 DSL schema，亦非 `entrypoint`。Runner 沿 `next` 运行到 `end`，返回 trace、最终状态和 observations。候选人 run 的 `currentWorkflowStep` 继续保存当前步骤，供运行详情与恢复使用。

通用执行器复用现有：

- 参数插值和 `PublishExecutionContext` 的 `input/credentials/target` 结构；
- `BrowserExecutor`、`TargetDescriptor`、command context 和结构化快照；
- `executePublishingStep` 的 action/condition 路由语义；
- JD graph 已有的 step trace、当前步骤持久化、目标解析、Skill 版本升级和单次重试约束。

候选人 Runner 与 `BossLikeCandidateSourceAdapter` 重构后只保留 HTML 解析、profile URL 规范化、身份去重和候选人领域数据转换。正常运行路径不再由 adapter 拥有 `navigate/fill/click`。

## Explore、修复与版本

Explorer 是平台特有的学习策略，不是正常执行器。它使用真实浏览器会话完成以下有限操作：访问列表页、处理登录状态、寻找搜索控件、以首个 keyword 执行真实搜索、从结果中打开一份详情以学习详情/打招呼/发送/收藏 target。它不得发送消息或收藏候选人。

Explorer 产出的是上文 browser primitive graph 与 `TargetDescriptor`，只有所有必要 target 都唯一可解析时才存储版本。`publish_skills`、`getActivePublishSkillByName`、`createExploredPublishSkill` 与 successor version 创建逻辑继续复用；需要将查询收敛为“选择 active 的 browser-v2 Skill”。当当前 active 版本是旧专用 DSL 时，首次新运行原子地创建 browser-v2 后继版本并停用旧 active 版本。

任一 browser target 失败时，通用内核记录 failed step、当前快照、target key 和 trace，并只允许一次修复/重试。Boss-like relearner 基于当前页面的 structured snapshot 产生 replacement target；内核创建后继 Skill、更新本次 run 的 `skillId/currentWorkflowStep` 后，从失败步骤重试。聊天 composer 的打招呼入口、消息输入和发送按钮属于同一上下文：其中任意一个漂移时必须一起重学并一并写入新版本。无法唯一解析、修复后仍失败或第二次失败时，停止该候选人的该项操作并记录错误，不无限重试。

## 兼容性与界面

- `screen_candidates` 历史 v1–v4 和所有旧高层 action 只读保留；新运行时显式拒绝把它们当成 `browser-v2` 执行。
- 既有 `publish_jd` Skill 和 API 保持可运行；其历史 `add_keywords` action 不被本次重写破坏。
- 继续使用现有 Workflow Library、版本历史、CandidateScreeningRun、run events 和筛选运行详情页。新图应直接显示 primitive action、`next` 连线、observe 输出名称和版本来源。
- 除 metadata JSON 标记与已有 JSON 运行状态的扩展外，不引入新的持久化表；无需 Prisma migration。

## 验证与验收

### 单元测试

- 通用执行器可从首步骤或任意合法 `currentStepId` 恢复，并严格按 `next`/condition 路由。
- `observe` 返回 `saveAs` 的 HTML，参数插值和 trace 正确；领域解析只接收 observation，不接收 browser executor。
- Explorer 产出的 `screen_candidates` 仅含 browser primitive action，不能含旧 screening action。
- 多 keyword 顺序调用同一搜索段、跨 keyword 去重、完成标记和 `maxCandidates` 截止正确。
- AI 拒绝时不进入联系；AI 入选时严格为 greeting/fill/send/成功等待/收藏；消息成功、收藏失败时恢复不重发。
- target 漂移创建一个 successor、更新 run 并只重试一次；composer 的三个 target 同时更新。
- legacy v1–v4 永不被 browser-v2 runtime 选择，`publish_jd` 历史 action 仍兼容。

### 集成与真实页面验收

- 使用真实 PostgreSQL、Redis 和 Boss-like fixture 执行首个无 Skill 的筛选 run：Explore 生成并持久化 primitive browser-v2 Skill，首个 keyword 不重复搜索。
- 使用至少两个 keyword，验证候选人按稳定 `profileUrl` 进入详情、全局去重、AI 判断和入选后的真实发送+收藏。
- 控制搜索/聊天 composer target 漂移，验证版本升级、一次重试和消息中心/收藏状态。
- 使用本地真实 Boss-like 页面完成一次筛选页面验收：Workflow 详情展示 primitive steps，运行记录可追溯 keyword、候选人、AI 决策、发送与收藏。
- 最终运行相关 Jest、Workflow integration、`bun run type-check`、`bun run lint`、pre-commit 所需校验；声称完成前保存实际命令输出。

## 验收标准

1. 数据库中只有一个活跃 `screen_candidates` browser-v2 artifact，且其步骤均为通用浏览器 primitive/condition/end。
2. 每个 keyword 的列表只在其首次搜索时作为事实来源；候选人详情和后续操作通过持久化的 `profileUrl` 定位，不依赖回退或重新搜索。
3. AI 只能在 `profileHtml` 观察完成后决定是否联系；拒绝者没有消息或收藏副作用。
4. 入选者在同一图的 `next` 路径中完成消息发送后收藏，并具有可恢复、幂等的记录。
5. Explore、repair、版本历史、运行 trace 和浏览器页面验收均可证明执行来自 DSL，而非 adapter 中隐藏的页面操作。
