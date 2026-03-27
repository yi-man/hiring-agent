# GitHub OAuth 与认证集成测试参考

## 命名约定

项目当前使用 `next-auth v4`，认证环境变量统一采用：

- `NEXTAUTH_*`
- `GITHUB_*`

## 必需环境变量（单次声明）

- `GITHUB_ID`
- `GITHUB_SECRET`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASS` / `MYSQL_DATABASE`
- `REDIS_URL`

> 说明：`test:integration:chat` 还要求 `OPENAI_API_KEY`。

## 推荐本地配置流程

```bash
# 基线流程（计划要求）
cp .env .env.test

# 首次初始化可先从模板生成 .env
cp .env.example .env

# 当前仓库集成测试实际读取的文件
cp .env.example .env.development
cp .env.example .env.local
```

随后按本机实际值填写上述变量。`.env.test` 作为共享基线模板；当前集成测试会优先读取 `.env.development`，再读取 `.env.local` 进行覆盖。

## GitHub OAuth 回调地址

- 本地开发：`http://localhost:3000/api/auth/callback/github`
- 生产环境：`${NEXTAUTH_URL}/api/auth/callback/github`

## 集成前置条件与命令

前置条件：

- 本机可访问 MySQL
- 本机可访问 Redis
- 已安装依赖（`pnpm install`）

执行命令：

```bash
pnpm run test:integration:auth
pnpm run test:integration:chat
```

## MySQL / Redis 健康检查行为

集成测试启动阶段会执行：

1. 根据 `MYSQL_*` 推导测试数据库名，并追加 `MYSQL_CI_SUFFIX`（默认 `_ci`）
2. 自动创建测试数据库（不存在则创建）
3. 执行 `pnpm exec prisma migrate deploy`
4. MySQL 健康检查：`SELECT 1`
5. Redis 健康检查：`PING`
