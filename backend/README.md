# Python 后端

FastAPI 提供账户、图片和视频上传、模型目录与生成任务接口；MySQL 是账户与任务的持久化存储，Redis 是任务状态短期缓存。独立 worker 从 MySQL 领取任务，调用标准 ComfyUI API，并通过 ComfyUI WebSocket 接收节点执行进度、通过 history 确认最终结果。Next.js 通过 `/api/*` 代理访问后端，因此浏览器不需要 ComfyUI 地址或凭据。

## 本地运行

1. 将 `.env.example` 复制为 `.env`，修改 `JWT_SECRET`（至少 32 位随机字符）、数据库密码、Redis 地址和 `COMFYUI_URL`。`CORS_ORIGINS` 填写实际浏览器访问的前端地址，以逗号分隔；HTTPS 部署时设置 `COOKIE_SECURE=true`。Compose 示例的 MySQL 密码建议只使用 URL 安全字符。
2. 安装 Docker 后，在 `backend` 目录运行 `docker compose up --build`。这会启动独立的 MySQL、Redis、API 和 worker。若 ComfyUI 运行在宿主机，macOS/Windows Docker 中可将 `COMFYUI_URL` 设置为 `http://host.docker.internal:8188`；远程服务器填写可达的私有地址。工作流目录以只读方式挂载，上传目录由 API 和 worker 共享。
3. 在项目根目录运行 `npm run dev`；未配置 `BACKEND_URL` 时前端代理访问 `http://127.0.0.1:8000`。根目录 `.env.example` 使用本机开发端口 `18000`；使用此 Compose 示例时应在 `.env.local` 设置 `BACKEND_URL=http://127.0.0.1:8000`。Compose API 文档为 `http://127.0.0.1:8000/docs`。

不使用 Docker 时，在 `backend` 目录创建虚拟环境，执行 `pip install -r requirements.txt`，启动自己的 MySQL 和 Redis，再分别执行 `uvicorn app.main:app --host 127.0.0.1 --port 8000` 和 `python -m app.worker`。首次启动会创建数据表。已有旧版数据时，请先备份并停止 API 和 worker，运行 `python -m app.migrate` 完成增量升级。具体数据结构、交互与升级步骤见 [数据结构与交互约定](docs/data-model.md)。

## 配置工作流

`workflows/registry.json` 配置四个视频模式：图生音视频和文生音视频复用 Pika H3 工作流（提示词必填，图生音视频的两张参考图均可选，文生音视频不接受图片，支持 5 秒或 10 秒）；Wan SCAIL2 角色替换和 Wan Animate2 动作迁移（参考图片和驱动视频必填，提示词选填）。驱动视频支持 MP4、MOV、WebM，最大 100 MB；本地运行需要安装 `ffprobe`，Docker 镜像已安装 FFmpeg。角色替换的两个分段提示词保持一致，人物分割词默认为 person；动作迁移采用工作流设定的动作与人物描述。视频比例、时长及分辨率以相应工作流为准。文生图与图片编辑使用 Qwen Image 2.1 工作流，图片编辑第一张图片必填、第二张选填。

当前前端按注册表展示可选参数：Qwen 文生图可选 16:9、9:16、1:1，分辨率选择节点为 1 MP、尺寸对齐 8 的倍数；图片编辑的尺寸由参考图片和工作流决定。Pika 图生和文生视频可选相同比例及标称 5 秒、10 秒，分辨率选择节点为 0.98 MP、尺寸对齐 32 的倍数，输出为 24 fps。其帧数表达式分别计算为 124 帧和 243 帧，实际视频时长可能约为 5.17 秒和 10.13 秒。角色替换与动作迁移不提供比例或时长选项：提交时通过 `ffprobe` 统计驱动视频帧数，按 81 帧窗口续接并裁剪到输入帧数，最多接受 3805 帧；输出帧率来自驱动视频。动作迁移将画面缩放裁剪到 482×854。长视频会增加处理时间和显存消耗；实际输出帧数、音画同步和分段衔接仍需在目标 ComfyUI 上验证。

角色替换根据驱动视频的宽高确定横竖方向，长边不超过 896、短边不超过 512，并向下对齐 32 的倍数；对齐可能造成少量裁剪或比例偏差。此配置对新创建任务生效，已有任务继续使用创建时保存的工作流快照。

如需添加其他模型，从 ComfyUI 导出 **API 格式**的工作流 JSON，放入 `workflows/`，再为每个模型添加条目。例如（节点编号和字段仅为示例，必须按实际工作流修改）：

```json
{
  "我的图片模型": {
    "kind": "image",
    "file": "my-image-workflow.json",
    "requires_image": false,
    "inputs": { "prompt": "6.text", "image": "10.image" }
  },
  "我的视频模型": {
    "kind": "video",
    "file": "my-video-workflow.json",
    "requires_image": true,
    "inputs": { "prompt": "6.text", "image": "10.image" }
  }
}
```

`inputs` 的值是 `节点ID.输入字段`，也可使用目标数组将同一个值写入多个节点。支持 `prompt`、`image`、`image2`、`video`、`seed`、`quality`、`ratio`、`duration`；`seed` 自动随机生成。`requires_prompt`、`requires_image`、`requires_second_image`、`requires_video` 定义必填项；`default_prompt`、`optional_input_defaults` 和 `static_inputs` 分别设置默认提示词、可选输入默认值和固定节点值。`modes` 控制前端展示，`hidden` 可保留旧工作流兼容性，`output_nodes` 限定需要收集的输出节点。

配置 `value_maps` 可转换比例与时长等枚举值，否则值按前端原样传入，因此若工作流需要数字宽高、帧数或其他类型，需先按具体工作流扩展转换逻辑，不能直接套用示例。参考图片和驱动视频会上传到 ComfyUI 的 `/upload/image`；任务通过 `/prompt` 提交，以 `/history/{prompt_id}` 查询状态并由 `/view` 代理输出。视频工作流必须在 history 的 `videos`、`gifs` 或 `images` 输出中提供 `filename`、`subfolder`、`type`。完成配置后重启 API 和 worker 以刷新配置缓存。

## 主要 API

接口的完整参数以运行中的 `/docs` 为准。注册、登录、登出和当前账户接口位于 `/api/auth/`；`GET /api/models` 返回当前可见模型及输入要求。`POST /api/uploads` 上传图片，`POST /api/uploads/video` 上传驱动视频，`GET /api/uploads` 返回当前用户的图片素材；素材内容通过 `/api/uploads/{id}/content` 读取。重复素材按用户和文件内容去重。

`POST /api/tasks` 创建任务，可通过 `Idempotency-Key` 防止重复提交；`GET /api/tasks` 和 `GET /api/tasks/{id}` 获取列表及详情，`/events` 获取状态事件，`/outputs/{index}` 读取或下载结果。`DELETE /api/tasks/{id}` 仅允许所有者删除已完成任务的站内记录；上传素材和 ComfyUI 输出文件不会随之删除。所有素材、任务及结果接口均校验账号归属。

一个任务只尝试提交一次 `/prompt`。若连接中断、返回 5xx、worker 在提交时退出或任务超时，状态会变成“待确认”；请在 ComfyUI 侧按数据库里的 `comfy_prompt_id` 核对，系统不会自动重试以避免重复生成。数据库中的 `queued` 和 `running` 任务可在 worker 重启后继续处理。输出目前保存在 ComfyUI，结果访问依赖其文件保留策略；本服务不会清理 ComfyUI 文件。

账户为邮箱+密码，密码使用 Argon2 哈希，登录状态存放在 HttpOnly、SameSite=Lax cookie 中；用户只能访问自己的上传、任务和输出。该版本没有邮件验证、密码找回、限流、通用迁移框架、共享对象存储或商业支付，部署到公网前需补齐相应功能并使用 HTTPS、受保护的 MySQL/Redis 和专用的 ComfyUI 网络。

## 测试

`python -m pytest -q` 默认用临时 SQLite 和不可用 Redis 测试回退；也可通过 `DATABASE_URL` 与 `REDIS_URL` 指向**专用测试数据库**运行。测试会删除该数据库中本项目的数据表，切勿指向正式数据库。
