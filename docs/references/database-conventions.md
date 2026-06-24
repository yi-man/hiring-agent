# 数据库与 Prisma 约定

本仓库使用 **MySQL 8** 与 **Prisma**。新增表、字段或改迁移前请对照本文，与现有 `prisma/schema.prisma`、历史 migration 保持一致。

---

## 1. 命名分层（「首字母大写」指哪一层）

| 层级                  | 约定                     | 说明                                                                       |
| --------------------- | ------------------------ | -------------------------------------------------------------------------- |
| **Prisma `model` 名** | **PascalCase**，单数语义 | 如 `Conversation`、`User`，对应 TypeScript 与领域实体，**首字母大写**。    |
| **MySQL 物理表名**    | **snake_case，全小写**   | 通过 `@@map("table_name")` 显式映射，如 `conversations`、`llm_call_logs`。 |
| **Prisma 字段名**     | **camelCase**            | 如 `userId`、`createdAt`。                                                 |
| **MySQL 列名**        | **snake_case，全小写**   | 通过 `@map("column_name")` 映射，如 `user_id`、`created_at`。              |

**为何物理表不用 PascalCase / 「表名首字母大写」？**

- MySQL 在部分系统上表名会统一成小写，PascalCase 易引发环境差异。
- 需反引号、与多数 MySQL 生态习惯不一致；本仓库已统一为 **小写 snake_case 表名**，**不要再新增 PascalCase 物理表名**。

若将来要整体重命名表，须单独迁移方案（数据迁移、停机窗口、双写等），不在日常功能 PR 中顺带改名。

---

## 2. 表名与模型映射

- 每个 `model` 必须写 **`@@map("...")`**，表名清晰、与历史 migration 对齐。
- 表名建议使用 **复数或领域惯用名称**（如 `users`、`conversation_documents`），避免与 Prisma 保留或常见 ORM 单数模型混淆即可。
- **索引**：优先显式 `map` 名称，与现网一致，例如 `idx_<表简写>_<字段>`（参考已有 `idx_conversations_user_id` 等）。

---

## 3. 主键与时间字段

- 主键：字符串 ID 常用 `uuid()` 或 `cuid()`，与现有模型保持一致；类型与长度用 `@db.VarChar(...)` 等与迁移一致。
- 创建/更新时间：`createdAt` / `updatedAt` 映射 `created_at` / `updated_at`，`DateTime(3)` 等与现表一致。

---

## 4. 变更流程（schema / 迁移）

1. 修改 `prisma/schema.prisma`，遵守上文命名。
2. 本地生成并应用迁移：`bunx prisma migrate dev`（或团队约定命令）。
3. 提交 `prisma/migrations` 与 schema 变更。
4. 生成客户端：`bunx prisma generate`（`bun install` 的 postinstall 也会执行 `prisma generate`）。
5. 若需放开依赖生命周期脚本，先本地审计 `bun pm untrusted`；勿在 CI 中临时信任未经确认的脚本。

---

## 5. 本地环境：连接与依赖服务

- **Prisma** 依赖环境变量 **`DATABASE_URL`**。示例（本地）：`mysql://root:mysql1234@127.0.0.1:3306/bia`。
- 将 `.env.example` 复制为 `.env`、`.env.development`、`.env.local`、`.env.test` 等；若示例中未包含 `DATABASE_URL`，请本地补齐，**勿把含密码的 URL 提交进仓库**。
- 首次或新机器：执行 **`bunx prisma migrate deploy`** 后再 **`bun run dev`**。
- 使用聊天、登录等能力前，还需 **Redis 7** 等（与 MySQL 并列准备，不属于表结构约定，但属于本地联调前提）。

---

## 6. NextAuth 相关表

- `Account` 等模型中部分字段为历史 **`snake_case` Prisma 字段名**（如 `refresh_token`），与 NextAuth 适配层一致。
- **新增业务模型** 请统一使用 **camelCase 字段 + `@map` 蛇形列名**，避免再引入混用风格。

---

## 7. 相关文件

- `prisma/schema.prisma`：唯一表结构真相来源。
- `prisma/migrations/`：已应用迁移历史，勿手改已发布 migration。
