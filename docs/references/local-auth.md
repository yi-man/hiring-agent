# 本地账号认证

项目使用自有用户名密码登录，不依赖外部 OAuth 提供商或第三方认证框架。

- 登录页：`/auth/signin`
- 登录接口：`POST /api/auth/login`
- 登出接口：`POST /api/auth/logout`
- 会话接口：`GET /api/auth/session`
- 会话 Cookie：`hiring-agent.session`
- 默认用户：`xxwade`
- 默认密码：`hiring_2026`

密码只以派生 hash 存入数据库；不要在迁移或种子数据里写入明文密码。
