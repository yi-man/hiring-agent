# LLM 调用统计页面设计文档

## 1. 背景与目标

需要建设一个可用于研发排障和管理看板的 LLM 调用统计页面，覆盖以下能力：

- 记录每次 LLM 调用明细：传参、header、response、token、返回时间、状态等
- 对调用次数和 token 数进行汇总统计
- 统计维度至少包含：天、周、总计
- 对异常调用进行明显标注与专项统计

已确认约束：

- 数据来源采用 **新增专用日志表**（非复用现有表）
- 数据存储采用 **全量原文存储**（不做脱敏）
- 页面服务对象为 **研发/运维 + 产品/管理双角色**
- 统计更新策略采用 **方案 1：预聚合统计表 + 准实时更新**

## 2. 方案选型

最终方案：**应用内统一埋点 + 明细表 + 预聚合统计表**

核心理由：

1. 同时满足“明细排障”和“趋势汇总”两类诉求
2. 明细查询与统计查询解耦，性能与稳定性更可控
3. 后续增加维度（业务线、租户、场景）成本低

## 3. 系统架构

### 3.1 组件划分

1. **LLM 调用包装层（Wrapper）**
   - 统一所有模型调用入口
   - 记录请求开始/结束时间
   - 捕获 request/header/response/tokens/异常信息

2. **日志写入层**
   - 将每次调用写入 `llm_call_logs` 明细表
   - 写失败不阻塞主业务（降级记录应用日志）

3. **聚合任务层**
   - 周期性重算并写入 daily/weekly/total 聚合表
   - 保证幂等，避免重复累计

4. **统计查询 API**
   - 提供总览、趋势、异常分布、明细列表接口

5. **统计页面（Dashboard）**
   - 双角色统一入口：总览 + 可钻取明细

### 3.2 数据流

1. 业务代码调用 LLM wrapper
2. wrapper 记录请求上下文与起始时间
3. 调用完成后记录返回体、token、耗时、状态
4. 失败则记录异常类型与错误信息
5. 聚合任务按周期更新日/周/总统计表
6. 前端优先查询聚合表，明细列表查询明细表

## 4. 数据模型设计

### 4.1 明细表：`llm_call_logs`

建议字段：

- `id` (bigint / uuid)
- `trace_id` (varchar) - 链路追踪
- `request_id` (varchar) - 调用请求唯一标识
- `timestamp` (datetime) - 调用发生时间
- `provider` (varchar) - 供应商（openai/anthropic/...）
- `model` (varchar) - 模型名
- `endpoint` (varchar) - 调用接口标识
- `request_headers` (json/text)
- `request_payload` (json/text)
- `response_payload` (json/text)
- `input_tokens` (int)
- `output_tokens` (int)
- `total_tokens` (int)
- `latency_ms` (int)
- `http_status` (int)
- `is_error` (boolean)
- `error_type` (varchar) - timeout/rate_limit/auth/network/model_error/unknown
- `error_message` (text)
- `created_at` (datetime)

推荐索引：

- `(timestamp)`
- `(is_error, timestamp)`
- `(provider, model, timestamp)`
- `(trace_id)` / `(request_id)`（按实际检索场景选）

### 4.2 聚合表

1. `llm_usage_stats_daily`
   - `date`
   - `provider`
   - `model`
   - `call_count`
   - `token_total`
   - `error_count`
   - `avg_latency_ms`
   - `p95_latency_ms`（可选）
   - `updated_at`

2. `llm_usage_stats_weekly`
   - `week_start_date`
   - 其余指标同 daily

3. `llm_usage_stats_total`
   - `provider`
   - `model`
   - `call_count`
   - `token_total`
   - `error_count`
   - `avg_latency_ms`
   - `updated_at`

## 5. 统计更新策略（已确认）

采用“**准实时 + 固化**”双层策略：

1. **准实时更新**
   - 每 5 分钟执行一次聚合任务
   - 重算“当天 + 本周”窗口并覆盖写入（upsert）
   - 页面数据延迟约 0~5 分钟

2. **日维度固化**
   - 每天 00:05 对“昨日”执行最终重算并固化
   - 处理延迟写入日志

3. **周维度固化**
   - 每周一 00:10 对“上周”执行最终重算并固化

4. **总计维度更新**
   - 与 5 分钟任务一并更新
   - 或由 day/week 汇总回填 total（二选一，建议直接随任务更新）

### 5.1 建议 Cron（示例）

- 准实时：`*/5 * * * *`
- 日固化：`5 0 * * *`
- 周固化：`10 0 * * 1`

> 若业务量极大可后续调整为流式聚合或更高频任务。

### 5.2 统计一致性规则（强约束）

为避免延迟写入、重试和补录导致统计漂移，新增以下强约束：

1. **事件时间基准**
   - 聚合一律使用 `timestamp`（wrapper 记录的调用发生时间，UTC）作为事件时间
   - `created_at` 仅用于审计，不参与业务统计口径

2. **去重键**
   - 明细表必须有全局唯一 `call_id`（推荐）或 `(provider, request_id)` 唯一约束
   - 聚合任务只统计去重后的有效记录

3. **水位线（Watermark）**
   - 准实时任务默认只统计 `timestamp <= now_utc - 10m` 的记录
   - 处理写入抖动和跨系统延迟，避免短时间窗口反复跳变

4. **回补策略**
   - 每日固定执行 `D-2 ~ D` 回补重算（幂等 upsert）
   - 支持手动触发任意时间段 backfill（按日期范围重算）

## 6. 页面信息架构

### 6.1 顶部筛选区

- 时间范围（今天/近7天/近30天/自定义）
- provider
- model
- 是否仅看异常

### 6.2 总览卡片

- 今日：调用数、token、异常数、异常率、平均耗时
- 本周：调用数、token、异常数、异常率、平均耗时
- 累计：调用数、token、异常数、异常率、平均耗时

### 6.3 趋势图

- 按天调用次数趋势
- 按天 token 趋势
- 异常次数趋势（可叠加）

### 6.4 异常面板

- 异常类型分布（timeout/rate_limit/...）
- 最近异常调用列表
- 高频异常模型/接口排行

### 6.5 明细列表

列建议：

- 时间
- provider/model
- token（in/out/total）
- latency
- 状态（success/error）
- 错误类型
- 操作（展开）

展开内容：

- request headers
- request payload
- response payload
- error message（若失败）

## 7. 异常标注规范

1. 列表行显著高亮（红色状态点 + `ERROR` 标签）
2. 卡片显示异常率，超过阈值时告警色展示
3. 趋势图中异常峰值节点标记
4. 支持“一键仅看异常”筛选

## 8. API 设计草案

1. `GET /api/llm-stats/overview`
   - 入参：时间范围 + provider/model 筛选
   - 出参：today/week/total 汇总指标

2. `GET /api/llm-stats/trend`
   - 入参：时间范围 + 粒度（day/week）
   - 出参：时间序列（calls/tokens/errors/latency）

3. `GET /api/llm-stats/errors`
   - 入参：时间范围 + 筛选
   - 出参：错误分布、最近异常、异常排行

4. `GET /api/llm-stats/logs`
   - 入参：分页 + 筛选（时间、provider、model、is_error）
   - 出参：调用明细分页数据

### 8.1 时区与周边界约定（强约束）

1. **存储口径**
   - 数据库存储与聚合统一使用 UTC

2. **展示口径**
   - API 支持传入 `timezone`（IANA 时区，如 `Asia/Shanghai`）
   - 不传时默认 `Asia/Shanghai`

3. **周定义**
   - 周口径采用 ISO 周（周一为一周开始）
   - `week_start_date` 按展示时区换算后回传

## 9. 可靠性与性能

1. 明细写入失败不影响主流程（记录系统日志 + 监控报警）
2. 聚合任务采用幂等 upsert，支持重跑
3. 明细表按时间分区（可选，数据量增长后启用）
4. 大 response 在 UI 侧折叠+懒加载，避免页面卡顿
5. 给统计接口增加缓存（短 TTL）降低高并发压力

### 9.1 原文存储治理（在“全量存储”前提下）

虽然当前要求全量原文存储，但必须增加治理措施：

1. **权限控制（RBAC）**
   - 只有管理员/授权研发可查看 `request_headers/request_payload/response_payload`
   - 普通角色仅查看统计和受限明细字段

2. **留存分层**
   - 原文 payload 留存 30~90 天（按合规要求可配置）
   - 聚合统计留存 >= 1 年

3. **大对象策略**
   - 超大 response 可落对象存储，明细表存引用地址与摘要
   - 前端默认展示截断预览，按需展开加载

4. **安全审计**
   - 明细原文读取需审计日志（操作者、时间、查询条件）
   - 数据库开启静态加密（at rest）

### 9.2 异常分类规范（可演进）

将当前 `error_type` 扩展为可分析、可演进模型：

- `error_domain`: `transport | provider | application | timeout | rate_limit | auth | unknown`
- `error_code`: 稳定机器码（如 `OPENAI_RATE_LIMIT`）
- `retry_count`: 重试次数
- `final_outcome`: `success_after_retry | failed`
- `provider_status`: 供应商错误码（若有）

## 10. 测试方案

1. 单元测试
   - wrapper 在成功/异常/超时下记录字段正确
2. 集成测试
   - 明细入库完整性
   - 聚合结果准确性（对照明细）
3. 页面测试
   - 筛选联动、异常高亮、明细展开
   - 总览数值与后端返回一致
4. 回归测试
   - 多 provider 多 model 混合场景
   - 超大响应体与 token 缺失场景

## 11. 非目标（当前阶段）

- 不引入外部 OLAP 基础设施
- 不做自动脱敏（当前明确全量原文存储）
- 不做跨系统统一观测平台整合

## 12. 里程碑建议

1. M1：落地 wrapper + 明细表 + 明细列表页
2. M2：聚合任务 + 总览卡片 + 趋势图
3. M3：异常中心（分布/排行/告警阈值）
4. M4：性能优化与监控补齐

---

该文档为已确认版本，后续实现阶段可基于此拆分任务并编写实施计划。
