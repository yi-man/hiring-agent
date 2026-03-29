# Conversation Markdown RAG 设计文档

## 1. 背景与目标

当前项目已具备：

- 基于 `conversation` 的多会话聊天
- 流式回复
- MySQL 持久化消息
- Redis 会话历史记忆

本次目标是在现有架构上新增**会话级 Markdown RAG**能力，支持：

- 在聊天页为当前会话上传 Markdown 文档
- 对文档做切分与向量索引
- 在提问时检索当前会话文档并增强回答
- 保持现有流式问答体验不变

已确认关键约束：

- 知识域为**会话级隔离**（按 `conversationId`）
- 一期采用 **MySQL + Qdrant**
- 二期引入 **Neo4j** 做图检索融合
- 技术路线优先复用现有基础设施与代码风格

## 2. 方案选型

最终采用方案：**一期 MySQL + Qdrant，二期 Neo4j 融合检索**。

对比结论：

1. 相比一期直接三库联动，分阶段方案上线风险更低，迭代节奏可控。
2. 相比更重型向量方案，一期 Qdrant 更匹配当前工程规模与交付效率。
3. 在保留效果上限的同时，不破坏现有 `messages/stream` 主链路。

## 3. 系统架构

### 3.1 组件边界

1. **Markdown Ingest Service**
   - 处理上传文件、解析 Markdown、切分 chunk、写入索引。
   - 负责文档状态流转（`processing/ready/failed`）。

2. **Conversation Retrieval Service**
   - 输入 `conversationId + query`。
   - 一期执行向量检索；二期扩展图检索与融合重排。

3. **Chat Orchestrator（复用现有流式接口）**
   - 在调用模型前注入检索上下文。
   - 保持当前流式输出与消息落库行为。

### 3.2 数据分层

- **MySQL**：文档原文、chunk 元数据、索引任务状态（系统真相源）
- **Qdrant**：chunk 向量与检索 payload（一期）
- **Neo4j**：实体关系图谱及来源映射（二期）

### 3.3 主链路与异步链路

问答主链路：

1. 用户在会话内提问
2. 校验用户对会话的访问权限
3. 对问题向量化并检索 `conversationId` 作用域下的相关 chunk
4. 组装上下文并调用现有流式模型链路
5. 输出流式结果并沿用既有消息持久化

上传异步链路：

1. 上传 Markdown 文件到会话
2. MySQL 写入文档与状态 `processing`
3. 后台执行切分、embedding、Qdrant upsert（对 `running` 任务启用租约恢复，租约时长由 `RAG_INGEST_LEASE_MS` 控制）
4. 成功标记 `ready`；失败标记 `failed` 并记录错误

## 4. 数据模型设计

### 4.1 MySQL 表结构（一期）

1. `conversation_documents`
   - `id` uuid pk
   - `conversation_id` fk -> `conversations.id`（索引）
   - `filename` varchar
   - `content_markdown` longtext
   - `status` enum(`processing`,`ready`,`failed`)（索引）
   - `error_message` text nullable
   - `version` int default 1
   - `created_at` / `updated_at`

2. `conversation_document_chunks`
   - `id` uuid pk
   - `document_id` fk -> `conversation_documents.id`（索引）
   - `conversation_id`（冗余并建索引，用于高频过滤与校验）
   - `chunk_index` int
   - `content` text
   - `token_estimate` int nullable
   - `qdrant_point_id` varchar unique nullable
   - `created_at`
   - unique(`document_id`, `chunk_index`)

3. `conversation_document_index_jobs`（建议）
   - `id` uuid pk
   - `document_id` fk
   - `status` enum(`pending`,`running`,`success`,`failed`)
   - `attempts` int
   - `last_error` text nullable
   - `started_at` / `finished_at`

### 4.2 Qdrant Collection（一期）

Collection：默认 `conversation_markdown_chunks`，可通过 `QDRANT_COLLECTION_NAME` 配置。

- vector：文档 chunk embedding
- payload：
  - `conversationId`
  - `documentId`
  - `chunkId`
  - `chunkIndex`
  - `filename`
  - `version`

检索必须带过滤条件：`conversationId == 当前会话`。

连接配置通过环境变量提供：

- `QDRANT_URL`
- `QDRANT_API_KEY`
- `QDRANT_COLLECTION_NAME`

### 4.3 文档生命周期

- 上传：新建文档并索引
- 覆盖更新：`version + 1`，新版本生效，旧版本向量异步清理
- 删除：先标记删除，再异步清理向量点

## 5. API 与前端交互设计

### 5.1 新增 API（一期）

1. `POST /api/conversations/:id/documents`
   - `multipart/form-data` 上传 `.md`
   - 返回 `documentId` 与初始状态

2. `GET /api/conversations/:id/documents`
   - 查询会话文档列表与索引状态

3. `GET /api/conversations/:id/documents/:documentId`
   - 查询文档详情（含状态、错误信息、可选预览）

4. `DELETE /api/conversations/:id/documents/:documentId`
   - 删除文档并触发向量清理

### 5.2 现有流式消息 API 改造

保持 `POST /api/conversations/:id/messages/stream` 的前端调用方式不变，在服务端内部增加：

1. query embedding
2. Qdrant topK 检索（会话级过滤）
3. 上下文拼装与 token 预算裁剪
4. 注入现有模型调用

若检索系统失败，降级为普通对话（不中断流式回复）。

### 5.3 前端交互（`chat-ui`）

- 在当前会话区域新增“上传 Markdown”入口
- 展示文档列表与状态标签
- `processing` 状态下轮询刷新
- `failed` 展示错误原因并支持重传
- 聊天输入与流式展示保持不变

## 6. 检索与提示词策略

### 6.1 检索策略（一期）

- `topK` 默认 6（可配置）
- 通过 `minScore` 过滤低相关片段
- 去重并按分值排序
- 受限于上下文长度预算（`RAG_CONTEXT_MAX_CHARS`，默认 6000 字符）

一期检索相关环境变量：

- `RAG_TOP_K`
- `RAG_MIN_SCORE`
- `RAG_CONTEXT_MAX_CHARS`

### 6.2 Chunk 策略

- 先按 Markdown 标题结构切分
- 再按长度进行二次切分
- 建议参数：
  - `targetTokens`: 400~700
  - `overlapTokens`: 60~100

### 6.3 Prompt 注入规则

保持现有 `system + history + human` 架构，仅改造 human 输入模板，加入：

- `User Question`
- `Retrieved Context`（带文件名与 chunk 序号）
- 回答约束：优先基于上下文；上下文不足时明确说明不确定

### 6.4 二期图检索扩展位

检索层接口预留：

- `vectorRetrieve(query, conversationId)`
- `graphRetrieve(query, conversationId)`
- `fuseAndRerank(vectorHits, graphHits)`

一期仅实现向量检索分支，二期插入图检索与融合逻辑。

## 7. 错误处理与降级策略

1. 上传校验失败（格式、大小、空文件）-> `400`
2. 会话不存在或无权限 -> `404/403`
3. 索引失败 -> 文档状态 `failed`，记录可读错误
4. Qdrant 不可用 -> 问答降级到非 RAG
5. LLM 调用失败 -> 沿用现有错误映射与状态码策略

## 8. 测试策略

### 8.1 Unit

- Markdown 切分逻辑
- 检索过滤逻辑（强制会话隔离）
- Prompt 构建与 token 裁剪

### 8.2 Integration（真实依赖）

1. 上传 -> 索引 -> 提问命中文档内容
2. A/B 两个会话互不串知识
3. 索引失败文档不参与召回
4. Qdrant 故障时聊天可降级继续

### 8.3 E2E（可选）

- 聊天页上传文档，状态从 `processing` 变为 `ready`
- 提问后回答体现文档信息

## 9. 里程碑与验收标准

### 9.1 里程碑

1. **M1（一期）**
   - 会话内上传 Markdown
   - MySQL 文档/chunk 落库
   - Qdrant 检索增强接入流式聊天
   - 一期测试通过

2. **M2（二期）**
   - Neo4j 图谱入库
   - 图检索 + 向量检索融合重排
   - 回答来源可解释性增强

### 9.2 验收标准（一期）

- 会话知识严格隔离
- 文档状态可观测且可恢复
- 命中时回答可利用文档信息
- 向量检索异常不阻断基础聊天
- 一期单元与集成测试全部通过

## 10. 非目标（一期）

- 不在一期实现图检索在线融合
- 不引入复杂多租户文档权限模型（沿用现有会话权限）
- 不在一期支持 Markdown 以外文件格式

---

该文档为已确认设计版本，后续进入 implementation plan 阶段时基于本设计拆分执行任务。
