# HITS 授权登录

登录页和登录弹窗新增 HITS 授权入口。浏览器先进入 HITS 独立授权页面，HITS 登录和授权后，以一次性授权码返回 AIBox。AIBox 服务端用专用客户端密钥和 S256 PKCE 兑换令牌，再读取已验证邮箱及稳定用户 ID。

首次授权只创建 10 分钟有效的待注册记录，尚不建立 AIBox 登录会话；用户必须在 `/auth/hits/setup` 设置并确认独立密码，才会原子创建用户、身份绑定并消费授权。以后既能使用 HITS 登录，也能使用 AIBox 邮箱密码登录。邮箱与已有账号冲突时，必须输入原 AIBox 密码才能绑定，不能覆盖原密码或自动合并用户。HITS 邮箱后续变化不自动同步。

## 配置与上线

HITS 端配置见该项目 `docs/aibox-sso.md`。在 AIBox `backend/.env` 配置：

- `HITS_BASE_URL`：可访问的 HITS 站点地址，生产必须 HTTPS。
- `HITS_CLIENT_ID`：默认 `aibox`，与 HITS 相同。
- `HITS_CLIENT_SECRET`：与 HITS `AIBOX_OAUTH_CLIENT_SECRET` 相同的至少 32 字符随机密钥。
- `HITS_CALLBACK_URL`：浏览器访问的本站完整回调 URL，与 HITS 精确匹配，例如本机 `http://localhost:3001/api/auth/hits/callback`。
- `CORS_ORIGINS`：包含本站实际浏览器来源；生产启用 `COOKIE_SECURE=true`。

默认使用 HITS `https://idiandian.xyz`、AIBox 回调 `https://aibox.idiandian.xyz/api/auth/hits/callback` 和公开测试密钥；默认密钥仅适用于临时测试，未设置或留空时均使用这些默认值，Docker Compose 也会传入默认地址。公开密钥不安全，只能用于临时测试账号；正式环境必须在双方配置一致的独立随机密钥，并确保 HITS 不启用 HTTP 测试配置。已有邮箱密码登录可继续使用。前端始终通过本站 `/api` 代理通信。不要将密钥写入前端或提交仓库。代理应避免在访问日志中长期保留带授权码的回调查询串。

上线前确认任务、备份业务数据库和上传目录，停止 API/worker，执行 `.venv/bin/python -m app.migrate`，然后启动服务。版本化迁移 `20261113_01_hits_identities` 为新增身份和待注册表创建约束，支持重复执行。新增表由增量建表创建，不修改旧用户字段、不回填旧账号。首次在全新数据库启动时也会自动建表。涉及的唯一约束位于新表，身份重复和并发注册冲突由数据库拒绝。

本次没有修改真实 HITS/AIBox 环境配置，也没有迁移业务数据库或启用生产授权；部署时填入双方实际地址、密钥并重启即可启用。不要对现有业务库运行测试。

## API

`GET /api/auth/hits/start` 开始授权；`GET /api/auth/hits/callback` 校验 state、兑换授权码和读取身份；`GET /api/auth/hits/pending` 读取短期待注册邮箱；`POST /api/auth/hits/complete` 提交 `password`、`confirm_password`；`POST /api/auth/hits/bind` 提交原账号 `password`。POST 完成和绑定接口必须具有匹配本站的 Origin。所有中间凭据使用 HttpOnly Cookie，令牌不交给浏览器 JavaScript。

## 功能验证

HITS 项目内启动独立提供方（内存存储、测试账号，不导入 HITS 主应用）：

```sh
.venv/bin/python tests/run_aibox_provider.py
```

AIBox 的 `backend/` 中运行独立测试数据库：

```sh
HITS_TEST_PROVIDER_URL=http://127.0.0.1:18555 DATABASE_URL=sqlite:////tmp/aibox-hits-integration-test.sqlite3 REDIS_URL=redis://127.0.0.1:6399/0 .venv/bin/python -m pytest -q tests/test_hits_sso.py tests/test_sso_models.py
```

集成测试通过真实 HTTP 调用 HITS 提供方，覆盖首次授权、未设置密码禁止登录、密码不一致、完成后本地密码登录、再次 HITS 登录、回调 state 错误及已有邮箱绑定。模型测试覆盖授权过期、重复使用、身份唯一性和旧数据库重复升级。HITS 单独测试覆盖 PKCE、回调地址、CSRF 和授权码重放。未配置 `HITS_TEST_PROVIDER_URL` 时跳过跨站测试。生产代理、真实 HITS 数据库和 Redis 需要部署时验证。

测试默认客户端密钥为公开固定值 `aibox-hits-public-test-default-key-2026`，仅用于测试对接。生产部署必须在双方环境中设置相同的独立随机密钥覆盖默认值；不得用公开默认值保护真实账号。
