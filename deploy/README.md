# 单机容器部署

此配置使用独立的 MySQL、Redis、FastAPI、worker、Next.js 和 Nginx 容器。只有 Nginx 的 80 端口发布到宿主机；数据库、缓存和 API 只在容器网络中通信。MySQL 数据和用户上传文件保存在 Docker 命名卷中，Redis 是可丢弃的缓存。

## 准备

需要 Docker Engine 和 Docker Compose，服务器能够访问配置的 ComfyUI。`Dockerfile.frontend` 使用 npm 国内镜像；`Dockerfile.backend` 优先使用阿里云 Debian 和 PyPI 镜像，PyPI 失败时回退到官方源；容器基础镜像通过 DaoCloud 镜像拉取。

在服务器创建位于仓库之外、仅部署用户可读取的环境文件，参考 `deploy/.env.example`，为 MySQL 和 JWT 生成独立的随机值。MySQL 密码应使用 URL 安全字符。`CORS_ORIGINS` 设置为实际访问地址（包括协议和必要端口），多个来源用逗号分隔。不要把环境文件或备份提交到 Git。

## 启动与检查

从项目根目录运行。`deploy/manage.sh` 默认读取项目目录同级的 `shared/.env`；如果环境文件在其他位置，可设置 `AIBOX_ENV_FILE`：

```bash
deploy/manage.sh build    # 首次部署或代码更新后构建镜像
deploy/manage.sh start    # 使用已有镜像启动
deploy/manage.sh stop     # 停止容器，保留数据卷
deploy/manage.sh restart  # 使用已有镜像停止并重新启动
deploy/manage.sh update   # 拉取当前分支、构建镜像并更新服务
deploy/manage.sh status   # 查看容器状态
deploy/manage.sh logs api # 查看 API 日志，Ctrl+C 退出
# 环境文件不在默认位置时：
AIBOX_ENV_FILE=/path/to/aibox.env deploy/manage.sh status
curl -fsS http://127.0.0.1/api/health
```

`update` 要求工作区干净且当前分支已配置上游，只允许快进拉取；拉取或构建失败时不会更新运行中的容器。更新会重建变化的服务并可能中断正在执行的生成任务，操作前请先检查任务；涉及数据库结构变化时先按下方流程备份和迁移。`update` 不会自动执行数据库迁移。

脚本优先使用当前用户的 Docker 权限，无法直接访问时使用 `sudo docker`；`restart` 会中断正在执行的任务，请先检查任务状态。构建和更新镜像需要访问镜像源，日常启动与重启使用本机已有镜像。脚本不会执行 `down -v` 或删除数据卷。Compose 配置可通过 `docker compose --env-file /path/to/aibox.env -f deploy/compose.yml config --quiet` 检查，不要输出包含密钥的完整配置。

首次启动会初始化全新数据库。若需要迁移现有数据库或上传素材，先备份并验证备份，再按 [数据结构与交互约定](../backend/docs/data-model.md) 操作；不要在运行中的数据库上直接覆盖数据文件。升级数据库结构前应停止 API 与 worker，备份数据库和上传卷，然后用新版本执行 `python -m app.migrate`，确认成功后再启动服务。

生成任务依赖远端 ComfyUI 的 HTTP 和 WebSocket 接口，服务器必须能访问配置地址。站点的账号密码需要 HTTPS 保护：本配置仅提供 HTTP 入口，如需公网正式使用，应配置域名和 TLS，并将 `CORS_ORIGINS` 和 `COOKIE_SECURE` 调整为实际 HTTPS 配置。
