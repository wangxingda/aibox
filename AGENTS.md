<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AIBox 项目约定

- `src/app` 为 Next.js 路由；`src/components/sites/aibox` 为站点组件；`public/sites` 为站点素材。
- `backend/app` 为 FastAPI、MySQL、Redis 和 ComfyUI worker；`backend/workflows` 为工作流；`backend/docs/data-model.md` 记录数据设计。
- 浏览器只调用本站 API；账号、任务、上传和输出都必须按用户校验权限。
- 任务提交保持幂等，保留工作流快照，对 ComfyUI 提交结果不确定时不得盲目重试。
- 数据库变更使用可重复执行的迁移，运行前备份数据库与上传目录。测试必须使用独立测试数据库，测试会删除其中的表。
- `.env.local`、`backend/.env`、`backend/.local`、`backend/storage` 和 `.venv` 是本地私有数据，不要提交或在日志中输出凭据。
- 变更服务前先确认进程、端口和运行中任务，不要停止无关服务。依赖和运行命令见 `README.md`。
