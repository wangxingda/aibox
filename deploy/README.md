# 单机容器部署

此配置使用独立的 MySQL、Redis、FastAPI、worker、Next.js 和 Nginx 容器。只有 Nginx 的 80 和 443 端口发布到宿主机；数据库、缓存和 API 只在容器网络中通信。MySQL 数据和用户上传及生成文件保存在 Docker 命名卷中，Redis 是可丢弃的缓存。

## 准备

需要 Docker Engine、Docker Compose、Git LFS 和 Python 3（用于检查证书路径），服务器能够访问配置的 ComfyUI。克隆前执行 `git lfs install`；`build` 和 `update` 会下载并检查 Git LFS 素材，下载失败或素材仍是指针时不会构建或停止服务。直接使用 Docker Compose 构建时需先自行执行 `git lfs pull`。历史迁移后，旧检出与新历史无法快进，应备份本地改动并重新克隆。`Dockerfile.frontend` 使用 npm 国内镜像；`Dockerfile.backend` 优先使用阿里云 Debian 和 PyPI 镜像，PyPI 失败时回退到官方源；容器基础镜像通过 DaoCloud 镜像拉取。

在服务器创建位于仓库之外、仅部署用户可读取的环境文件，参考 `deploy/.env.example`，为 MySQL 和 JWT 生成独立的随机值。MySQL 密码应使用 URL 安全字符。`CORS_ORIGINS` 设置为实际访问地址（包括协议和必要端口），多个来源用逗号分隔。不要把环境文件或备份提交到 Git。

## 启动与检查

从项目根目录运行。`deploy/manage.sh` 默认读取项目目录同级的 `shared/.env`；如果环境文件在其他位置，可设置 `AIBOX_ENV_FILE`：

```bash
deploy/manage.sh build    # 首次部署或代码更新后构建镜像
deploy/manage.sh start    # 使用已有镜像启动
deploy/manage.sh stop     # 停止容器，保留数据卷
deploy/manage.sh restart  # 仅重启 API、worker 和前端
deploy/manage.sh update   # 拉取当前分支、构建镜像并更新服务
deploy/manage.sh status   # 查看容器状态
deploy/manage.sh logs api # 查看 API 日志，Ctrl+C 退出
# 环境文件不在默认位置时：
AIBOX_ENV_FILE=/path/to/aibox.env deploy/manage.sh status
curl -fsS https://aibox.idiandian.xyz/api/health
```

`update` 要求工作区干净、当前分支已配置上游，并且服务器的 SSH 密钥已获 GitHub 仓库访问授权。更新只通过 SSH 拉取：如果上游是 GitHub HTTPS 地址，脚本会自动将其改为对应的 SSH 地址；其他非 SSH 地址需要先手动配置。首次连接前请按照 [GitHub 官方指纹](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints) 校验并配置主机密钥。更新只允许快进拉取。脚本先拉取代码并构建镜像，再停止 API 与 worker，将 MySQL、上传素材及生成结果（同属上传目录）备份到项目目录同级的 `backups/`（可通过 `AIBOX_BACKUP_DIR` 修改），检查备份压缩包，然后使用新镜像执行 `python -m app.migrate`，成功后才启动新服务并等待健康检查。备份包含敏感数据，目录仅对运行用户可读；请按实际容量管理和保留备份，并定期演练恢复。备份或迁移失败时 API 与 worker 保持停止，备份文件保留供排查；MySQL DDL 无法整体回滚，修复后可按迁移文档恢复备份或重新运行迁移。更新期间网站短暂不可用；排队任务和已提交给独立 ComfyUI 的任务保存在数据库中，worker 启动后继续跟踪和保存结果。worker 会等待当前提交或轮询结束，最多等待 5 分钟；超时或异常退出时，提交中的任务会根据 ComfyUI 的队列和历史核对，无法确认的任务需人工处理。ComfyUI 自身必须持续运行并保留任务和历史；长时间停机还可能触发任务超时。

迁移会根据模型自动创建新表，并向已有表添加普通可空字段或带数据库端默认值的非空字段；不会自动修改或删除已有字段。涉及主键、外键、唯一约束或索引的新字段，以及类型修改、重命名和数据回填，必须编写可重复执行的显式迁移并测试旧数据升级。服务成功更新后，脚本仅清理本次更新前的 AIBox 应用镜像中已无标签、且没有任何容器使用的旧镜像；保留其他项目的镜像、数据卷和构建缓存。清理失败会显示提示，但不会回滚已启动的服务。

脚本优先使用当前用户的 Docker 权限，无法直接访问时使用 `sudo docker`；`restart` 只重启 API、worker 和前端，不重启 Nginx、MySQL 和 Redis；任务恢复与上述更新流程相同。构建和更新镜像需要访问镜像源，日常启动与重启使用本机已有镜像。脚本不会执行 `down -v` 或删除数据卷。Compose 配置可通过 `docker compose --env-file /path/to/aibox.env -f deploy/compose.yml config --quiet` 检查，不要输出包含密钥的完整配置。

首次启动会初始化全新数据库。若需要迁移现有数据库或上传素材，先备份并验证备份，再按 [数据结构与交互约定](../backend/docs/data-model.md) 操作；不要在运行中的数据库上直接覆盖数据文件。使用 `update` 会自动完成停服务、备份和迁移；手动升级时仍需按相同顺序操作。

生成任务依赖远端 ComfyUI 的 HTTP 和 WebSocket 接口，服务器必须能访问配置地址。

## HTTPS 部署

在执行新版本的 `update` **之前**完成以下准备，否则 Nginx 找不到证书时无法启动。确认域名 `aibox.idiandian.xyz` 的 DNS 指向此服务器，云安全组和服务器防火墙允许 TCP 80、443，且 443 未被其他服务占用。Nginx 将 HTTP 请求重定向到 HTTPS。

将证书完整链和私钥放在项目目录同级的 `shared/tls/`，文件名分别为 `aibox.idiandian.xyz.crt` 和 `aibox.idiandian.xyz.key`。Nginx 会直接以只读方式挂载该目录，无需复制或重命名。若证书由其他工具维护，请使用实际文件，不要使用指向挂载目录外的符号链接。

也可以在部署环境文件中设置 `AIBOX_TLS_DIR` 为证书目录的绝对路径，目录内仍需使用上述文件名。`start` 和 `update` 会在启动或停止应用服务前检查两个文件是否存在。证书必须包含完整证书链并覆盖该域名，且运行部署脚本的用户能访问证书目录、Nginx 容器内的 root 能读取私钥；不要提交私钥。

在 `shared/.env`（或 `AIBOX_ENV_FILE` 指定的文件）设置：

```dotenv
CORS_ORIGINS=https://aibox.idiandian.xyz
COOKIE_SECURE=true
HITS_BASE_URL=https://idiandian.xyz
HITS_CALLBACK_URL=https://aibox.idiandian.xyz/api/auth/hits/callback
HITS_CLIENT_SECRET=替换为与点点网一致的独立随机密钥
```

同时在点点网所有 Web 实例设置完全一致的 `AIBOX_OAUTH_REDIRECT_URI` 和 `AIBOX_OAUTH_CLIENT_SECRET`，并确保未设置 `AUTHLIB_INSECURE_TRANSPORT`；重启点点网服务使其生效。两个站点须部署包含 HTTPS 回调支持的版本。AIBox 配置完成后运行 `deploy/manage.sh update`，脚本会重新创建服务并加载配置；`restart` 不会更新容器环境变量。然后验证：

```sh
curl -I http://aibox.idiandian.xyz/
curl -fsS https://aibox.idiandian.xyz/api/health
docker compose --env-file "${AIBOX_ENV_FILE:-../shared/.env}" -f deploy/compose.yml exec nginx nginx -t
```

更新证书后替换 `shared/tls/` 中上述两个文件，再运行 `docker compose --env-file "${AIBOX_ENV_FILE:-../shared/.env}" -f deploy/compose.yml exec nginx nginx -t`，确认通过后执行相同命令但将 `nginx -t` 替换为 `nginx -s reload`。如果校验失败，不要 reload；修复证书后重新校验。请定期续期并实际验证 TLS 和登录流程。

HITS 授权登录的 `HITS_BASE_URL`、`HITS_CLIENT_ID`、`HITS_CLIENT_SECRET` 和 `HITS_CALLBACK_URL` 可在部署环境文件中设置，Compose 会传入 API 容器；配置和迁移步骤见 [HITS 登录对接](../backend/docs/hits-sso.md)。生产环境需为两个站点配置有效的 HTTPS。
