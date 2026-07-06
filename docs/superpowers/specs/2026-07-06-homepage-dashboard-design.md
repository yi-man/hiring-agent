# 首页工作台设计

## 背景

当前首页是能力介绍页，主要展示智能对话、知识库、JD 工作台、Workflow 学习和 LLM 可观测等模块。用户反馈该首页对日常招聘工作意义不大，希望保留首页 URL `/`，但把首页定位改为招聘运营 Dashboard。

本设计将首页改为“招聘岗位运营台”：登录后直接查看招聘中的 JD、平台发布状态、候选人跟进情况和待处理事项；未登录时显示简洁登录引导。

## 目标

- 首页 URL 保持 `/`，但内容定位从营销/能力介绍改为私有工作台。
- 顶部 Navbar 去掉单独的“首页”入口，避免和品牌入口重复。
- 侧边栏中的“首页”改名为“工作台”，href 仍为 `/`。
- 首页支持按平台查看招聘中的 JD。
- 招聘中口径为 `JobDescription.status === "published"`，并排除 `offline`、`archived` 等非招聘状态。
- 顶部指标、平台项、状态项、异常项都可点击，并能下钻到对应列表或详情。
- 第一版复用现有数据模型，不新增平台发布状态表。

## 非目标

- 不重新设计 JD 生成、候选人筛选、候选人沟通等已有业务流程。
- 不在第一版新增多平台长期上架状态表。
- 不把首页做成新的营销落地页或功能介绍页。
- 不改变 Playwright 端口、认证体系、数据库命名约定或已有 JD 状态枚举。

## 用户体验

### 未登录状态

访问 `/` 时，如果没有本地账号会话，显示一个简洁的登录引导：

- 标题说明需要登录后查看工作台。
- 文案说明工作台包含 JD、发布任务和候选人数据。
- 提供登录按钮，复用现有 `SignInButton`。

### 登录后首页

页面标题为“招聘岗位运营台”或“工作台”。副标题说明该页面用于按平台查看招聘中的 JD，并处理发布、筛选、沟通下一步。

页面提供三个快捷操作：

- `新建 JD`：跳转 `/jd-generator/new`。
- `候选人跟踪`：跳转 `/jd-generator/candidates`。
- `同步沟通`：触发现有候选人沟通同步能力，或在第一版中链接到候选人跟踪页中的沟通同步入口。

### 顶部指标

顶部展示可点击指标：

- `招聘中`：筛选 `published` JD。
- `待发布`：筛选 `ready_to_publish` JD。
- `发布中`：筛选 `publishing` JD。
- `发布异常`：筛选 `publish_failed` JD。
- `待跟进候选人`：进入候选人跟踪，或筛选首页中与待跟进候选人相关的 JD。

点击指标时，首页保持在 `/`，通过 query 更新筛选，例如：

- `/?status=published`
- `/?status=publish_failed`
- `/?platform=boss-like&status=published`

### 主区域布局

首页主区域采用工作台布局，而不是营销卡片布局：

- 左侧：平台和状态筛选。
- 中间：当前筛选下的 JD 列表。
- 右侧：待处理队列。

左侧平台筛选包含：

- `全部平台`
- `BOSS-like`
- `未记录平台`

第一版只有 `boss-like` 平台类型。后续新增平台时，平台列表从聚合数据自动扩展。

中间 JD 列表展示：

- 职位名称和部门。
- JD 标题或摘要。
- 状态。
- 平台归属。
- 候选人数量。
- 活跃候选人数量。
- 面试中数量。
- 最近更新时间。
- 发布异常提示。

右侧待处理队列展示：

- 发布失败 JD。
- 待发布 JD。
- 发布中任务。
- 待沟通或待跟进候选人。
- 最近发布任务。

## 点击与下钻规则

所有首页数字和列表项必须能解释来源，并能到达对应信息：

- 点击顶部状态指标：更新首页列表筛选。
- 点击平台项：更新首页列表筛选。
- 点击 JD 行：进入 `/jd-generator/[id]`。
- 点击候选人数：进入 `/jd-generator/[id]/candidates`。
- 点击待跟进候选人：进入 `/jd-generator/candidates`，或在后续实现中携带筛选 query。
- 点击发布异常：进入对应 JD 详情，并在 JD 详情页查看发布记录；如果实现发布记录锚点或 query，则带上对应定位。
- 点击最近发布任务：进入对应 JD 详情或发布记录区域。

## 数据口径

### JD 状态

首页状态沿用现有 `JD_STATUSES`：

- `created`
- `ready_to_publish`
- `publishing`
- `published`
- `publish_failed`
- `offline`
- `archived`

首页主口径：

- `招聘中` = `published`
- `待发布` = `ready_to_publish`
- `发布中` = `publishing`
- `发布异常` = `publish_failed`

`created` 可以在列表中作为草稿/已创建处理，但不进入“招聘中”统计。

### 平台归属

第一版不新增平台发布状态表，平台归属按现有发布任务推断：

- 如果某 JD 有最近一次成功的 `JobPublishTask`，使用该任务的 `platform`。
- 如果 JD 为 `published`，但没有可识别的成功发布任务，归为 `未记录平台`。
- 如果 JD 有失败发布任务，仍根据任务 `platform` 显示异常来源。

该口径可以支撑第一版按平台查看招聘中 JD，但不是长期多平台精确上架模型。

### 候选人指标

候选人聚合复用现有候选人筛选结果：

- 总候选人数：按 JD 统计筛选结果数量。
- 活跃候选人：排除 `skip`、`rejected`、`withdrawn` 等不再推进的人。
- 面试中：使用候选人跟踪中已有面试阶段口径。
- 待跟进：优先统计推荐动作或沟通状态仍需要处理的候选人；实现时应复用或抽取现有 `CandidateTrackingDashboard` 里的活跃候选人判断。

## 数据层设计

新增 `src/lib/dashboard/`，聚合逻辑放在服务端数据层，而不是散落在页面组件中。

建议导出：

- `getDashboardOverview(params)`
- `parseDashboardFilters(searchParams)`
- `inferJobPlatform(tasks)`
- `mapDashboardJob(row)`

返回结构建议：

```ts
type DashboardOverviewDto = {
  summary: {
    recruitingJobs: number;
    readyToPublishJobs: number;
    publishingJobs: number;
    publishFailedJobs: number;
    activeCandidates: number;
  };
  statusCounts: Array<{
    status: JDStatus;
    label: string;
    count: number;
  }>;
  platforms: Array<{
    platform: string;
    label: string;
    recruitingJobs: number;
    failedJobs: number;
  }>;
  jobs: DashboardJobDto[];
  recentTasks: DashboardPublishTaskDto[];
  filters: {
    status?: JDStatus;
    platform?: string;
    limit: number;
  };
};
```

`DashboardJobDto` 应包含 JD 基本信息、平台归属、候选人聚合和最近发布任务摘要。

## API 设计

新增：

```txt
GET /api/dashboard?status=&platform=&limit=
```

职责：

- 使用 `requireAuth()` 校验登录状态。
- 解析并校验 `status`，只接受 `JD_STATUSES`。
- 解析 `platform`，第一版支持 `boss-like`、`untracked` 或空值。
- 限制 `limit` 上限，避免首页一次加载过多数据。
- 返回 `DashboardOverviewDto`。

错误处理：

- 未登录返回 401，前端页面显示登录引导。
- 非法状态返回 400。
- 服务端异常返回 500，并在页面显示可恢复错误提示。

## 组件设计

建议新增：

- `src/components/dashboard/dashboard-page.tsx`
- `src/components/dashboard/summary-cards.tsx`
- `src/components/dashboard/platform-filter.tsx`
- `src/components/dashboard/job-list.tsx`
- `src/components/dashboard/action-queue.tsx`
- `src/lib/dashboard/client.ts`

`src/app/page.tsx` 保持为入口：

- 服务端读取 session。
- 未登录渲染登录引导。
- 登录后渲染 Dashboard 客户端组件或服务端传入初始数据。

组件风格应贴近现有 JD 管理和候选人跟踪页面：紧凑、工具型、可扫描，避免营销 hero、装饰性渐变和大面积介绍文案。

## 空状态与错误状态

- 无 JD：提示“还没有 JD”，提供 `新建 JD`。
- 无招聘中 JD 但有待发布 JD：主列表提示当前无招聘中岗位，并提供切换到待发布的入口。
- 发布失败：在右侧待处理队列突出显示，点击进入对应 JD。
- 无候选人数据：显示“还没有候选人筛选记录”，不影响 JD 列表。
- API 加载失败：展示错误 banner，保留快捷入口。
- 平台无数据：平台项显示 0，不隐藏，便于用户理解当前只接入或只使用了哪些平台。

## 导航调整

Navbar：

- 移除 `navigation = [{ name: "首页", href: "/" }]` 的渲染。
- 保留品牌 Logo 链接 `/`。
- 保留登录/用户菜单和主题切换。
- 移动端菜单中也不再显示单独“首页”项。

AppSidebar：

- 将 label 从“首页”改为“工作台”。
- description 保持或调整为“招聘运营总览”。
- href 保持 `/`。
- 图标可以从 `Circle` 改为更符合 Dashboard 的图标，例如 `LayoutDashboard`。

Footer：

- 可以将 footerLinks 中的“首页”改为“工作台”，href 仍为 `/`。

## 测试计划

单元测试：

- `src/lib/dashboard` 聚合 helper：
  - 正确统计 `published` 为招聘中。
  - 正确统计待发布、发布中、发布失败。
  - 成功发布任务可推断平台。
  - 无成功发布任务的 published JD 归为未记录平台。
  - 候选人聚合与活跃候选人口径正确。

API 测试：

- 未登录返回 401。
- 非法 status 返回 400。
- status/platform/limit 筛选生效。
- 空数据返回空数组和 0 计数。
- 发布失败任务出现在 recentTasks 或待处理数据中。

页面/组件测试：

- 首页不再渲染营销文案。
- 未登录显示登录引导。
- 登录后显示“工作台”或“招聘岗位运营台”。
- 顶部指标、平台筛选、JD 行、候选人数具备对应链接或按钮。
- Navbar 不显示单独“首页”导航项。
- Sidebar 显示“工作台”并指向 `/`。

## 后续迭代

当接入多个真实平台，并需要精确表示同一 JD 在不同平台的独立上架状态时，再新增平台发布状态模型，例如：

```txt
job_platform_publications
```

建议字段：

- `jobDescriptionId`
- `platform`
- `platformJobUrl`
- `status`
- `publishedAt`
- `offlineAt`
- `lastSyncAt`
- `lastError`

该模型不属于第一版首页工作台范围。
