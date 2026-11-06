# AIBox

AIBox 是中文 AI 图片与视频创作网站。前端使用 Next.js，FastAPI 负责账户、素材和任务，独立 worker 调用 ComfyUI；MySQL 保存业务数据，Redis 缓存任务状态。

## 目录

```text
src/app/                       Next.js 页面和路由
src/components/sites/aibox/    页面、交互和样式
src/lib/backend.ts             前端 API 客户端
public/sites/                  网站图片、示例视频等素材
backend/app/                   API、数据库、迁移和 worker
backend/workflows/             ComfyUI 工作流和模型配置
backend/tests/                 后端自动化测试
backend/docs/                  数据结构和任务交互说明
docs/research/                 页面参考和设计调研记录
backend/storage/uploads/       本地用户上传文件（不提交）
backend/.local/                本机 MySQL、Redis 数据及备份（不提交）
backend/.venv/                 本地 Python 虚拟环境（不提交）
```

本目录不依赖原项目目录。`.env.local` 和 `backend/.env` 保存本机配置和密钥，不能提交到版本控制。`backend/.local/backups` 包含迁移前备份，也应妥善保管。

## 当前本机服务

- 前端：`http://localhost:3001`
- API：`http://127.0.0.1:18000`，接口文档：`http://127.0.0.1:18000/docs`
- 项目独立的 MySQL：`127.0.0.1:13376`，数据位于 `backend/.local/mysql`
- 项目独立的 Redis：`127.0.0.1:16379`，数据位于 `backend/.local/redis`
- ComfyUI：以 `backend/.env` 中 `COMFYUI_URL` 为准

当前项目已迁移原有账号、任务和上传文件。首次在另一台机器运行时，请按照 [后端指南](backend/README.md) 准备 MySQL、Redis 和环境变量；示例配置不含实际凭据，不要直接用于生产环境。

## 安装与启动

需要 Node.js 24 或更新版本、Python 3.11、FFmpeg（用于视频校验），以及可访问的 MySQL、Redis、ComfyUI。

```bash
npm ci
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
```

在配置好并启动 MySQL 和 Redis 后，分别在三个终端执行：

```bash
# 终端 1：API
cd backend
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 18000
```

```bash
# 终端 2：生成任务 worker
cd backend
.venv/bin/python -m app.worker
```

```bash
# 终端 3：前端
npm run dev -- --port 3001
```

前端 `.env.local` 中 `BACKEND_URL` 应与 API 地址一致。`backend/.env` 使用相应 MySQL、Redis 地址及 ComfyUI 地址。数据库结构变更前，停止 API 和 worker，备份数据库及上传目录，然后在 `backend/` 运行 `.venv/bin/python -m app.migrate`。

此 Mac 上如需重新启动已迁移的项目专用数据库，可在项目根目录执行以下命令（要求通过 Homebrew 安装 MySQL 和 Redis，且对应端口未被其他服务占用）：

```bash
mkdir -p backend/.local/redis
mysqld --no-defaults --datadir="$PWD/backend/.local/mysql" \
  --basedir="$(brew --prefix mysql)" --socket="$PWD/backend/.local/mysql.sock" \
  --port=13376 --bind-address=127.0.0.1 \
  --pid-file="$PWD/backend/.local/mysql.pid" --log-error="$PWD/backend/.local/mysql.log" &
redis-server --bind 127.0.0.1 --port 16379 \
  --dir "$PWD/backend/.local/redis" --appendonly yes --daemonize yes
```

已有服务运行时不必重复执行。请勿把其他项目的 MySQL 或 Redis 当作本项目的专用实例。Docker 部署及工作流配置见 [后端指南](backend/README.md)。

## 验证

```bash
npm run check
cd backend
DATABASE_URL=sqlite:////tmp/aibox-test.sqlite3 REDIS_URL=redis://127.0.0.1:6399/0 .venv/bin/python -m pytest -q
```

后端测试会删除测试数据库中的表；必须使用专用测试数据库，不能指向现有业务数据库。测试环境中的 Redis 端口配置为不可用，以验证缓存回退；涉及 MySQL 特性的测试会在 SQLite 下跳过。

目前动作迁移工作流指定的 `wan_animate_2_distill_int8_convrot.safetensors` 尚未在远程 ComfyUI 找到；需要在 ComfyUI 安装该模型后才能实际生成。其余模型能力、素材限制和任务状态说明见 [后端指南](backend/README.md) 与 [数据结构和交互约定](backend/docs/data-model.md)。
