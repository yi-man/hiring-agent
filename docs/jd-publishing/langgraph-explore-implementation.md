# JD Publishing LangGraph Explore Implementation

本文档记录当前 PR 中 JD 发布链路的实现方案。对应需求源自
`docs/superpowers/specs/2026-06-26-jd-publishing-langgraph-explore-design.md`。

## 目标

把 JD 发布从固定 Playwright 脚本升级为可学习、可追踪、可修复的 Skill 执行链路：

- 没有 active skill 时，通过真实浏览器 Explore boss-like 前端页面并生成 Skill DSL。
- 有 active skill 时，复用数据库中的 skill 执行发布。
- DOM 目标变化时，失败 trace 进入 fallback agent，基于当前页面快照修复目标并创建新 skill version。
- 执行只通过浏览器 UI 操作目标站点，不调用 boss-like 后端 API。
- Playwright、Chrome extension、agent-browser 等执行器共享同一个 `BrowserExecutor` 边界。

当前实现范围是 `boss-like` 平台的 JD 发布闭环，不是任意网站的通用自动发布产品。

## 核心运行链路

入口仍是 `publishJobDescriptionToBossLike()`。它读取 boss-like 前端地址与招聘端账号配置，构造：

- `target.loginUrl`
- `target.newJobUrl`
- `credentials.username`
- `credentials.password`

生产环境必须显式配置 `BOSS_LIKE_BASE_URL`、`BOSS_LIKE_EMPLOYER_USERNAME`、
`BOSS_LIKE_EMPLOYER_PASSWORD`。只有 `test`、`development` 或
`BOSS_LIKE_ALLOW_LOCAL_DEFAULTS=true` 时才使用本地默认值。

LangGraph 编排如下：

```text
prepare
  -> explore_or_load_skill
  -> create_task
  -> execute_step
  -> route_after_step
  -> fallback_agent
  -> maybe_upgrade_skill
  -> finalize
```

主要节点职责：

- `prepare`：把 JD 和发布设置转换成 boss-like 表单输入。
- `explore_or_load_skill`：优先加载 active skill；没有 skill 时运行 Explore 并保存新 skill。
- `create_task`：创建 `job_publish_tasks`，记录当前 step。
- `execute_step`：一次只执行一个 Skill step，并追加 trace。
- `fallback_agent`：记录失败上下文，尝试用当前 DOM snapshot 修复目标。
- `maybe_upgrade_skill`：修复成功时创建新版本 skill 并激活。
- `finalize`：持久化最终 task 状态和 `job_publish_traces`。

## Skill DSL

Skill 是数据库中的 `publish_skills` 记录，核心字段包括：

- `name`: 当前为 `publish_jd`
- `platform`: 当前为 `boss-like`
- `version`: 单调递增版本号
- `isActive`: 当前活跃版本
- `inputSchema`: 发布需要的业务输入
- `steps`: 执行步骤 DSL
- `meta`: 来源、成功率、修复来源等元数据

Explore 生成的 skill 使用：

```json
{
  "created_from": "explore",
  "success_rate": 0,
  "usage_count": 0
}
```

fallback 修复生成的 skill 使用：

```json
{
  "created_from": "agent",
  "repaired_from_skill_id": "...",
  "repaired_from_version": 2,
  "failed_step_id": "fill_title",
  "repair_reason": "target re-explore resolved by semantic_proximity"
}
```

数据库样例见：

`docs/jd-publishing/samples/publish-skill-explore-sample.json`

该样例来自本地数据库中的真实 `publish_skills` 记录：

- `id`: `boss-like-publish-jd-explore-a3fa6b8a-16fe-4118-9055-f3e81fab698b`
- `name`: `publish_jd`
- `platform`: `boss-like`
- `version`: `1`
- `meta.created_from`: `explore`

## Explore 生成方案

Explore 不直接持久化任意 CSS/XPath。它通过浏览器页面状态和结构化 DOM 生成
`TargetDescriptor`：

```ts
type TargetDescriptor = {
  kind: 'field' | 'button' | 'link' | 'text' | 'container';
  role?: 'textbox' | 'button' | 'link' | 'form' | 'combobox';
  name: string;
  exact?: boolean;
  valueHint?: 'title' | 'company' | 'salary' | 'location' | 'description' | 'keyword';
  stableAttrs?: {
    testId?: string;
    id?: string;
    name?: string;
    ariaLabel?: string;
    autocomplete?: string;
  };
  scope?: {
    kind: 'form' | 'section' | 'dialog' | 'page';
    name?: string;
  };
};
```

Explore 过程：

1. 打开 `target.newJobUrl`。
2. 如果未看到发布表单，则打开 `target.loginUrl` 并执行登录。
3. 确认页面包含发布职位必需文案。
4. 获取 `StructuredDomSnapshot`。
5. 从 snapshot 中选出发布表单。
6. 按业务字段映射候选 DOM：
   - `input.title` -> 职位名称字段
   - `input.company` -> 公司名称字段
   - `input.salary` -> 薪资范围字段
   - `input.location` -> 工作地点字段
   - `input.description` -> 职位描述字段
   - `input.keywords` -> 技能标签字段和添加按钮
   - submit -> 发布职位按钮
7. 生成 `TargetDescriptor`，包含 `valueHint`、`scope` 和可用稳定属性。
8. 对当前页面可达目标做 dry-run resolve。
9. 只有 resolver 返回 `unique` 时才保存 skill。

如果目标缺失或不唯一，Explore 会失败并返回明确诊断，不会静默保存不可用 skill。

## DOM Resolver

Explore 和执行共用同一套 resolver。执行器不会直接 `.first()` 操作页面元素。

策略顺序：

1. 稳定属性：`data-testid`、`data-e2e`、`id`、`name`、`aria-label`、`autocomplete`
2. ARIA role + accessible name
3. label 关联
4. placeholder
5. text
6. semantic proximity
7. safe CSS
8. legacy locator
9. XPath diagnostic fallback

候选过滤：

- 必须 visible
- 必须 enabled
- fill/add_keywords 必须 editable
- 必须匹配目标 kind/role
- 如果指定 scope，必须位于对应 form/section/dialog 内

唯一性判断：

- 0 个候选：`not_found`
- 1 个候选：`unique`
- 多个候选且分数差距足够：`unique`
- 多个候选且分数差距不足：`ambiguous`

每次 DOM action 的结果会携带 `LocatorMatchReport`，用于 trace 和 fallback。

## 执行器边界

`BrowserExecutor` 是 graph 和真实浏览器之间的稳定接口：

- `navigate`
- `fill`
- `click`
- `waitForUrl`
- `check`
- `waitForText`
- `addKeywords`
- `snapshotStructured`
- `resolveTarget`

当前默认执行器是 `PlaywrightBrowserExecutor`：

- 默认 headed，测试可传 `headless: true`。
- `fill`、`click`、`addKeywords` 都先 resolve，再操作。
- 目标不是 `unique` 时不执行页面动作。
- 失败结果包含 error、structured DOM snapshot、match report、failed target key。

adapter 机制已接入运行时入口。默认配置使用 `PlaywrightBrowserExecutor`；如果配置：

```bash
JD_PUBLISHING_BROWSER_EXECUTOR=http-command
JD_PUBLISHING_BROWSER_COMMAND_ENDPOINT=http://127.0.0.1:4100/browser-command
```

service 会创建 `CommandTransportBrowserExecutor`，并用 `HttpBrowserCommandTransport`
把每个浏览器动作 POST 到外部浏览器运行时。该外部运行时可以是 Chrome extension、
agent-browser server 或其它实现，只要接受 `BrowserCommand` 并返回 `BrowserCommandResult`。
graph 不依赖具体执行器实现。

`BrowserCommand` envelope：

```ts
type BrowserCommand = {
  id: string;
  taskId: string;
  stepId: string;
  action:
    | 'navigate'
    | 'fill'
    | 'click'
    | 'wait_for_url'
    | 'wait_for_text'
    | 'add_keywords'
    | 'check'
    | 'snapshot_structured'
    | 'resolve_target';
  target?: TargetDescriptor;
  params: Record<string, unknown>;
  timeoutMs: number;
};
```

`BrowserCommandResult` envelope：

```ts
type BrowserCommandResult = {
  commandId: string;
  success: boolean;
  error?: string;
  domSnapshot?: StructuredDomSnapshot;
  match?: LocatorMatchReport;
  failedTargetKey?: 'target' | 'submitTarget';
};
```

LangGraph 会在执行前调用 executor 的 command context hook，把当前 `taskId` 和 `stepId`
传给 command adapter。Explore 阶段还没有 task，因此会使用空 taskId 和
`stepId = "explore_or_load_skill"`；task 创建后每个 action command 都带真实 task/step。

## Fallback 和自动修复

当某一步失败且 `onFail.type = "fallback_agent"`：

1. `execute_step` 将失败 step、错误、match report、DOM snapshot 写入 trace。
2. `fallback_agent` 读取失败目标和 `failedTargetKey`。
3. 如果原 target 在当前页面重新 resolve 为 `unique`，直接用该 target 修复。
4. 如果原 target 不可用，则基于当前 `StructuredDomSnapshot` 和 step/valueHint 推导新 target。
5. 新 target 必须再次通过 resolver 且状态为 `unique`。
6. 只 patch 失败 step 的 `target` 或 `submitTarget`。
7. `maybe_upgrade_skill` 创建新 skill version，旧版本保留并置为 inactive，新版本 active。
8. 当前失败 task 以 failed 结束，下一次发布会自动使用修复后的 active skill。

当前设计选择是“失败任务生成修复版 skill，下一次发布使用修复版成功”，不是在同一个失败 task 中继续发布。

## 已验证场景

本 PR 已覆盖自动化和真实本地链路：

- 无 active skill：Explore 生成 skill 后发布成功。
- 有 active skill：复用 skill 发布成功。
- skill 单点目标失效：首次发布失败并生成修复版 skill，再次发布成功。
- `add_keywords.submitTarget` 失败时能修复正确字段，而不是错误 patch 主输入框。
- ambiguous 目标不会点击或填充第一个候选。
- 每个 DOM action trace 包含 `LocatorMatchReport`。
- Playwright 不调用 boss-like 后端 API，只操作前端页面。

## 当前边界

- 当前平台类型仍是 `boss-like`。
- Explore 的字段映射基于 boss-like 发布表单业务语义。
- 当前没有引入 LLM 对未知页面做开放式 authoring。
- Chrome extension 和 agent-browser 的真实外部 transport 尚未接入生产流，但服务端 adapter 边界已经存在。
