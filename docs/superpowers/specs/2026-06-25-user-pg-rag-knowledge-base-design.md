# 用户级 PostgreSQL RAG 知识库设计

## 1. 背景与目标

当前项目已有会话级 Markdown RAG：

- 文档绑定 `Conversation`
- 原文与 chunk 存 PostgreSQL
- 向量存 Qdrant
- 发送消息时只有显式选择某个 ready 文档才检索

本次新增的是**用户级知识库 RAG**，用于招聘助手的长期背景资料。核心要求：

- 文档绑定 `User`，不是绑定某个会话。
- 上传页面可以上传文档并完成索引。
- 向量直接存 PostgreSQL，使用 `pgvector` 做相似度检索。
- 聊天时可自动按当前登录用户检索这些知识，辅助招聘问答。
- 为默认用户 `xxwade` 提供一份较长的合成字节跳动招聘知识文档，作为可重复导入的演示数据。

该功能与已有会话级 RAG 并存，避免破坏现有聊天文档流和测试。

## 2. 方案选择

采用方案：**新增用户级 PG RAG，与现有会话级 Qdrant RAG 并行**。

原因：

1. 用户级知识库最符合“绑定用户”和“之后看情况使用”的使用方式。
2. 保留现有 conversation document 逻辑，降低回归风险。
3. PostgreSQL 作为文档、chunk、向量的唯一真相源，便于本地开发、备份、权限控制和测试。
4. `pgvector` 查询可以天然带 `user_id` 过滤，避免跨用户知识串用。

不采用的方案：

- 直接改造现有会话级表为用户级：会影响已存在的上传、消息记录、E2E 测试。
- 让同一张文档表同时 nullable `conversation_id` 和 `user_id`：短期代码少，但权限边界更模糊。

## 3. 数据模型

### 3.1 Prisma 模型

新增 `KnowledgeDocument`：

- `id`
- `userId`
- `filename`
- `title`
- `sourceLabel`
- `contentMarkdown`
- `status`: `processing` / `ready` / `failed`
- `errorMessage`
- `version`
- `createdAt`
- `updatedAt`
- relation: `user`, `chunks`, `jobs`

新增 `KnowledgeDocumentChunk`：

- `id`
- `documentId`
- `userId`
- `chunkIndex`
- `content`
- `tokenEstimate`
- `embeddingModel`
- `embeddingDimension`
- `embedding`: nullable `Unsupported("vector")`
- `createdAt`
- relation: `document`, `user`

新增 `KnowledgeDocumentIndexJob`：

- `id`
- `documentId`
- `status`: `pending` / `running` / `success` / `failed`
- `attempts`
- `lastError`
- `startedAt`
- `finishedAt`
- `createdAt`
- `updatedAt`

在 `User` 上新增：

- `knowledgeDocuments`
- `knowledgeDocumentChunks`

### 3.2 PostgreSQL 迁移

新增 migration 做以下事情：

1. `CREATE EXTENSION IF NOT EXISTS vector;`
2. 创建 `knowledge_documents`
3. 创建 `knowledge_document_chunks`
4. 创建 `knowledge_document_index_jobs`
5. `knowledge_document_chunks.embedding` 使用 `vector` 类型
6. 建索引：
   - `idx_knowledge_documents_user_id`
   - `idx_knowledge_documents_status`
   - `idx_knowledge_document_chunks_user_id`
   - `idx_knowledge_document_chunks_document_id`
   - unique `knowledge_document_chunks_document_id_chunk_index_key`
   - 向量索引优先使用 HNSW cosine，如本地 pgvector 版本不支持则保留顺序扫描可运行

Prisma 对 `vector` 类型支持有限，因此相似度检索走 `$queryRaw`，schema 中用 `Unsupported("vector")` 表达列。

## 4. 后端组件

### 4.1 Repository

新增 `src/lib/rag/knowledge-repo.ts`：

- 创建用户知识文档
- 查询用户知识文档列表与详情
- 删除用户知识文档及 chunks
- claim / complete / fail ingest
- 替换 chunks
- raw SQL 写入 embedding
- raw SQL 按用户检索 topK chunks

写入 embedding 时需要把 `number[]` 转换成 pgvector 文本格式，例如 `[0.1,0.2,0.3]`，并使用参数化 SQL。

### 4.2 Ingest

新增 `src/lib/rag/knowledge-ingest.ts`：

1. claim 文档索引任务，避免并发重复索引。
2. 读取 `contentMarkdown`。
3. 复用 `splitMarkdownToChunks`。
4. 复用 `embedDocuments`。
5. 删除旧 chunk。
6. 写入新 chunk 与 embedding。
7. 成功标记 `ready`，失败标记 `failed` 并记录错误。

与现有会话 RAG 一样，使用租约避免卡在 `processing`。

### 4.3 Retrieval

新增 `retrieveUserKnowledgeContext`：

输入：

- `userId`
- `query`
- `topK`
- 可选 `documentId`

流程：

1. 空 query 直接返回空上下文。
2. `embedQuery(query)`。
3. `$queryRaw` 在 `knowledge_document_chunks` 中按 `user_id` 和 ready 文档过滤。
4. 使用 cosine distance 排序。
5. 按 `RAG_MIN_SCORE` 与 `RAG_CONTEXT_MAX_CHARS` 过滤和裁剪。
6. 输出带来源标记的 context：

```text
[knowledge source filename="bytedance-recruiting-handbook.md" chunkIndex=3]
...
```

检索必须始终带 `user_id = 当前登录用户`。

### 4.4 Chat 集成

修改 `POST /api/conversations/:id/messages/stream`：

- 继续校验当前用户拥有该 conversation。
- 如果用户显式选择会话文档，保留现有会话 RAG 检索。
- 默认额外检索用户级知识库。
- 将会话文档上下文和用户知识上下文合并后传入 `streamChatReply`。
- 如果用户知识检索失败，返回 `502 RAG_RETRIEVAL_FAILED`，与现有会话检索错误策略保持一致。

为避免用户上传内容变成指令，继续使用现有 untrusted context 包装策略。

## 5. API 与页面

### 5.1 API

新增用户级知识库 API：

- `GET /api/knowledge/documents`
  - 返回当前用户的知识文档列表。
- `POST /api/knowledge/documents`
  - multipart 上传 `.md`。
  - 创建文档并同步完成索引。
  - 返回文档最新状态。
- `GET /api/knowledge/documents/:documentId`
  - 返回当前用户拥有的文档详情。
- `DELETE /api/knowledge/documents/:documentId`
  - 删除当前用户拥有的文档与 chunks。

一期只支持 Markdown。文件大小沿用 5MB 上限。

### 5.2 页面

新增 `/knowledge` 页面：

- 仅登录用户可用。
- 顶部提供上传入口。
- 下方展示文档列表：
  - 文件名
  - 来源标签
  - 状态
  - 大小
  - 更新时间
  - 删除按钮
- `processing` 状态显示刷新入口。
- `failed` 状态显示错误摘要。

导航栏增加“知识库”入口。

页面风格应保持运营工具感：紧凑、信息清楚，不做营销式布局。

## 6. xxwade 合成种子文档

新增一份 Markdown fixture：

- 路径建议：`src/lib/rag/fixtures/bytedance-recruiting-handbook.synthetic.md`
- 文件名：`bytedance-recruiting-handbook.synthetic.md`
- 标题：`字节跳动招聘知识手册（合成样例）`
- sourceLabel：`synthetic-bytedance-recruiting-handbook`
- 归属用户：`xxwade`

内容必须明确标注为**合成样例**，不是字节跳动真实内部文件。文档内容要足够丰富，帮助招聘问答覆盖：

- 公司定位、愿景和价值观
- 组织结构与业务线
- 全球和中国区协作模式
- 近年经营数据样例
- 今年绩效要求与团队 OKR
- 发展方向
- 上班作息时间和协作规则
- 福利待遇
- 招聘画像
- 面试流程
- 候选人常见问答
- 不同职级能力要求
- offer 沟通注意事项

新增 seed 脚本：

- `src/scripts/seed-xxwade-knowledge.ts`
- 确保默认用户 `xxwade` 存在。
- 如果同 sourceLabel 文档已存在，可更新原文并重建 chunks。
- 调用 ingest 后将状态变为 ready。

package script：

- `seed:knowledge:xxwade`

## 7. 测试策略

### 7.1 Unit

- pgvector 文本格式转换。
- user knowledge repository 的权限过滤参数。
- retrieval 按 `userId` 检索，不返回其他用户 chunk。
- context 组装包含 source 标记，遵守 `RAG_CONTEXT_MAX_CHARS`。
- chat stream route 在未指定会话文档时仍调用用户知识检索。

### 7.2 Integration

在真实 PostgreSQL 环境下：

1. 创建 `xxwade`。
2. 导入合成字节跳动文档。
3. 验证 chunks 与 embedding 写入 PostgreSQL。
4. 查询“今年绩效要求是什么”能召回绩效相关 chunk。
5. 创建另一个用户，验证不能召回 `xxwade` 文档。

如测试数据库没有安装 pgvector，则集成测试应显式 skip 并输出原因；单元测试仍覆盖 SQL 组装与权限边界。

### 7.3 E2E

可选增加 Playwright：

- 登录。
- 进入知识库页面上传 `.md`。
- 等状态 ready。
- 回到聊天页面提问文档中的福利或作息问题。
- 验证回答包含文档事实。

## 8. 验收标准

- `xxwade` 的合成字节跳动文档可通过脚本导入。
- PostgreSQL 中可以看到文档、chunks 和 vector embedding。
- 聊天时当前用户可自动使用自己的知识库。
- 其他用户无法检索或访问 `xxwade` 的知识库。
- 上传失败、嵌入失败、索引失败都有可读错误。
- 现有会话级文档 RAG 仍可工作。
- 相关单测、类型检查、目标集成测试通过。

## 9. 非目标

- 本次不迁移或删除 Qdrant 会话 RAG。
- 本次不支持 PDF、Word、网页抓取。
- 本次不做后台异步队列服务，上传 API 可先同步索引。
- 本次不做多用户共享知识库或团队空间。
- 本次不做来源引用 UI，只在模型上下文中保留来源标记。
