# 招聘资源列表设计

**目标：** 为招聘助手新增顶层招聘资源视图：简历列表、面试记录、候选人列表。该功能把现有候选人筛选数据作为跨 JD 可复用资产展示出来，本轮不新增招聘生命周期字段。

## 范围

本轮包含：

- 在功能菜单新增 `简历列表`、`面试记录`、`候选人列表`。
- 新增顶层路由：
  - `/resumes`
  - `/interviews`
  - `/candidates`
- 保持 `/jd-generator/candidates` 可用，作为兼容入口或跳转入口。
- 通过现有 `CandidateResume` 与 `CandidateScreeningResult` 关系展示简历被挂载到哪些 JD。
- 通过现有 `CandidateInterviewFeedback` 展示跨 JD 面试记录，并链接候选人和 JD。
- 仅用现有字段把候选人拆成正在推进和已结束两类视图。

本轮不包含：

- 不做 Prisma 迁移，不新增显式 `hired`、`rejected`、`active` 等状态字段。
- 不做手动上传简历或编辑简历流程。
- 不做新的面试排期流程。
- 不新增独立候选人详情模型，继续使用现有筛选详情和面试推进数据。

## 当前上下文

项目已有支撑这三个列表的数据模型：

- `Candidate`：用户范围内的全局候选人身份。
- `CandidateResume`：候选人的版本化简历快照。
- `CandidateScreeningResult`：JD 与候选人的关系，包含分数、推荐动作、动作状态、面试阶段和备注。
- `CandidateInterviewFeedback`：JD-候选人维度的面试反馈。
- `JobDescription`：JD 上下文和详情页。

项目已有相关页面：

- `/jd-generator/candidates`：跨 JD 候选人跟踪。
- `/jd-generator/[id]/candidates`：单个 JD 的候选人列表。
- `/jd-generator/[id]/candidates/[candidateId]`：候选人详情和简历上下文。

新视图应复用这些关系，不创建并行的招聘 CRM 数据模型。

## 推荐方案

使用顶层招聘资源路由：

- `候选人列表` -> `/candidates`
- `简历列表` -> `/resumes`
- `面试记录` -> `/interviews`

这样候选人、简历、面试记录会成为功能菜单中的一等招聘资产；`JD 工作台` 继续聚焦 JD 生成、发布和单 JD 筛选。

兼容策略：

- `/jd-generator/candidates` 在过渡期保持可用。
- 侧边栏应独立高亮新的顶层资源路由，不再把它们算作 `JD 工作台` 的子页面。
- 工作台中当前指向 `/jd-generator/candidates` 的链接可以调整为 `/candidates`。

## 候选人列表

候选人列表复用现有候选人跟踪数据，但以招聘资源视图呈现。

默认分组：

- `正在推进`：现有字段显示仍处于有效推进中的候选人。
- `已结束`：现有 JD-候选人结果显示已 offer、淘汰、撤回或跳过的候选人。

本轮状态映射：

- `录取/Offer`：`interviewStage === "offer"`。
- `淘汰`：`interviewStage === "rejected"`、`interviewStage === "withdrawn"`，或 `decisionAction === "skip"`。
- `正在推进`：其他所有 `decisionAction !== "skip"` 的候选人。

页面展示字段：

- 候选人姓名。
- 当前职位、公司、地点。
- 关联 JD。
- 最终分数和推荐动作。
- 面试阶段。
- 最新备注。
- 候选人详情、JD 详情、原站资料链接。

筛选项保持接近现有候选人跟踪页：

- JD。
- 范围：`正在推进`、`已结束`、`全部`。
- 面试阶段。
- 推荐动作。

## 简历列表

简历列表展示最新简历快照，以及这些简历被哪些 JD 使用。

每行展示：

- 候选人姓名。
- 候选人职位、公司、地点。
- 简历来源平台。
- 简历抓取时间。
- 简短简历预览。
- 已挂载 JD 链接：来自引用同一候选人且优先引用同一 `resumeId` 的 `CandidateScreeningResult`。
- 每个 JD-候选人关系的候选人详情链接。
- 当 `Candidate.profileUrl` 或 `CandidateResume.profileUrl` 存在时展示原站链接。

数据行为：

- 默认每个候选人只展示最新一份简历。
- 即使同一候选人有多个历史简历快照，也只占一行。
- 如果一份简历关联多个 JD，展示最近的若干个 JD 链接，并对溢出数量做紧凑提示。
- 如果没有 JD 关系，展示 `未挂载 JD`。

建议接口：

- `GET /api/resumes?limit=200`
- Repository 函数：`listCandidateResumeLibrary({ userId, limit })`

## 面试记录

面试记录列表展示所有 JD 下的 `CandidateInterviewFeedback`。

每行展示：

- 候选人姓名和副标题。
- 关联 JD 职位。
- 面试阶段。
- 面试官。
- 评分。
- 结论。
- 优势和风险摘要。
- 备注。
- 更新时间。
- 候选人详情和 JD 详情链接。

筛选项：

- JD。
- 面试阶段。
- 面试结论。

建议接口：

- `GET /api/interviews?limit=200`
- Repository 函数：`listCandidateInterviewRecords({ userId, limit })`

## UI 设计

沿用现有招聘运营后台风格：

- 信息密度较高的列表区域。
- 克制的边框和间距。
- 按钮使用 lucide 图标辅助识别。
- 筛选控件沿用现有原生 select 或 HeroUI 组件风格。
- 不做营销型 hero 页面。
- 空状态文案：
  - `暂无简历记录`
  - `暂无面试记录`
  - `暂无候选人`

菜单图标：

- `候选人列表`：`Users`
- `简历列表`：`FileText` 或 `Files`
- `面试记录`：`ClipboardList` 或 `MessagesSquare`

页面路由使用与现有候选人跟踪页一致的服务端鉴权：服务端先检查本地登录态，登录后渲染客户端列表组件以支持刷新和筛选交互。

## 数据流

简历列表：

1. 页面服务端检查本地登录态。
2. 客户端组件请求 `/api/resumes`。
3. API 通过 `requireAuth` 获取用户身份。
4. API 调用 `listCandidateResumeLibrary`。
5. Repository 查询用户范围内的候选人、最新简历、JD 筛选结果。
6. UI 渲染简历行和 JD 挂载链接。

面试记录：

1. 页面服务端检查本地登录态。
2. 客户端组件请求 `/api/interviews`。
3. API 通过 `requireAuth` 获取用户身份。
4. API 调用 `listCandidateInterviewRecords`。
5. Repository 查询用户范围内的面试反馈，并带出候选人和 JD 关系。
6. UI 渲染面试记录行及 JD、候选人链接。

候选人列表：

1. `/candidates` 在新顶层路由渲染现有候选人跟踪能力。
2. 页面请求 `/api/candidate-screening/tracking`。
3. UI 使用本设计中的映射规则在客户端拆分 `正在推进` 和 `已结束`。

## 错误处理

- API 路由沿用现有 `requireAuth` 模式，未登录返回 `401`。
- API 路由遇到非预期异常时返回 `500` 和简短错误信息，风格与现有候选人跟踪 API 一致。
- 客户端列表组件展示 destructive 风格错误提示；刷新失败时尽量保留已有列表状态。
- 缺少可选关联时渲染稳定兜底文案，不让页面崩溃。

## 测试

实现阶段使用 TDD。

Repository 测试：

- `listCandidateResumeLibrary` 返回候选人最新简历，并包含已挂载 JD 摘要。
- `listCandidateResumeLibrary` 能处理未挂载 JD 的简历。
- `listCandidateInterviewRecords` 返回包含候选人、JD 和反馈信息的记录。
- 查询必须按 `userId` 限定，并按最近活动排序。

API 测试：

- `/api/resumes` 需要登录，并返回 `{ resumes }`。
- `/api/interviews` 需要登录，并返回 `{ interviews }`。
- `limit` 参数需要处理非法值并限制最大值。

组件测试：

- 侧边栏展示三个新菜单项，并能正确处理 active 状态。
- 简历列表展示候选人、JD 挂载链接和原站资料按钮。
- 面试记录列表展示候选人链接和 JD 链接。
- 候选人列表按已确认的现有字段映射展示正在推进和已结束候选人。

验证命令：

- `bun run test -- src/lib/candidate-screening/repo.test.ts`
- `bun run test -- tests/unit/api/candidate-screening-routes.test.ts`
- `bun run test -- tests/unit/components/CandidateScreening.test.tsx`
- `bun run test -- tests/unit/components/AppSidebar.test.tsx` 或最接近的侧边栏/导航测试。
- `bun run type-check`

## 已确认决策

- 本轮候选人状态只使用现有字段映射。
- `offer` 展示为 `录取/Offer`，但不新增独立最终录用字段。
- `/jd-generator/candidates` 保持兼容；主菜单入口使用 `/candidates`。
