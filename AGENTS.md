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
- 更新时自动创建新模型表并为旧表添加安全的普通字段；非空字段需要数据库端默认值。涉及索引、外键、唯一约束、已有字段变更或数据回填时必须编写可重复执行的版本化迁移，并测试旧数据升级。运行前备份数据库与上传目录。测试必须使用独立测试数据库，测试会删除其中的表。
- `.env.local`、`backend/.env`、`backend/.local`、`backend/storage` 和 `.venv` 是本地私有数据，不要提交或在日志中输出凭据。
- 变更服务前先确认进程、端口和运行中任务，不要停止无关服务。依赖和运行命令见 `README.md`。

## 文档同步

- 完成修改前，检查本次变更是否与现有文档冲突。重大功能、行为、接口、配置、部署方式、数据结构、工作流、依赖或测试流程发生变化时，在同一改动中更新相关文档；修复发现的过时说明。
- 按影响范围更新根目录 `README.md`、`backend/README.md`、`backend/docs/data-model.md`、环境变量示例或其他相关文档。文档应与实际实现和验证结果一致，明确尚未实现或未验证的部分，不要将计划写成已经完成的功能。
- 不能完成必要的文档更新时，在交付说明中指出遗漏及原因；文档中不得写入真实密钥、用户数据或未经确认的部署信息。
