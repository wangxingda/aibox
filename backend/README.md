# Python 后端

FastAPI 提供账户、图片和视频上传、模型目录与生成任务接口；MySQL 是账户与任务的持久化存储，Redis 是任务状态短期缓存。独立 worker 从 MySQL 领取任务，调用标准 ComfyUI API，并通过 ComfyUI WebSocket 接收节点执行进度、通过 history 确认最终结果。Next.js 通过 `/api/*` 代理访问后端，因此浏览器不需要 ComfyUI 地址或凭据。

## 本地运行

1. 将 `.env.example` 复制为 `.env`，修改 `JWT_SECRET`（至少 32 位随机字符）、数据库密码、Redis 地址和 `COMFYUI_URL`。`CORS_ORIGINS` 填写实际浏览器访问的前端地址，以逗号分隔；HTTPS 部署时设置 `COOKIE_SECURE=true`。Compose 示例的 MySQL 密码建议只使用 URL 安全字符。
2. 安装 Docker 后，在 `backend` 目录运行 `docker compose up --build`。这会启动独立的 MySQL、Redis、API 和 worker。若 ComfyUI 运行在宿主机，macOS/Windows Docker 中可将 `COMFYUI_URL` 设置为 `http://host.docker.internal:8188`；远程服务器填写可达的私有地址。工作流目录以只读方式挂载，上传目录由 API 和 worker 共享。
3. 在项目根目录运行 `npm run dev`；未配置 `BACKEND_URL` 时前端代理访问 `http://127.0.0.1:8000`。根目录 `.env.example` 使用本机开发端口 `18000`；使用此 Compose 示例时应在 `.env.local` 设置 `BACKEND_URL=http://127.0.0.1:8000`。Compose API 文档为 `http://127.0.0.1:8000/docs`。

不使用 Docker 时，在 `backend` 目录创建虚拟环境，执行 `pip install -r requirements.txt`，启动自己的 MySQL 和 Redis，再分别执行 `uvicorn app.main:app --host 127.0.0.1 --port 8000` 和 `python -m app.worker`。首次启动会创建数据表。已有旧版数据时，请先备份并停止 API 和 worker，运行 `python -m app.migrate` 完成增量升级。具体数据结构、交互与升级步骤见 [数据结构与交互约定](docs/data-model.md)。

## 配置工作流

`workflows/registry.json` 配置四个视频模式：图生音视频和文生音视频复用 Pika H3 工作流（提示词必填，图生音视频的两张参考图均可选，文生音视频不接受图片，支持 5 秒、10 秒或 15 秒）；Wan SCAIL2 角色替换和 Wan Animate2 动作迁移（参考图片和驱动视频必填，提示词选填）。驱动视频支持 MP4、MOV、WebM，最大 100 MB；本地运行需要安装 `ffprobe`，Docker 镜像已安装 FFmpeg。角色替换使用新工作流的分段续接逻辑和 person 人物分割词；动作迁移采用工作流设定的动作与人物描述。视频比例、时长及分辨率以相应工作流为准。文生图与图片编辑使用 Qwen Image 2.1 工作流，图片编辑第一张图片必填、第二张选填。

图生音视频的前端页面要求上传或导入第一张参考图；Pika 工作流和后端接口仍允许不传参考图，以支持文生音视频等调用。

当前前端按注册表展示可选参数：Qwen 文生图可选 16:9、9:16、1:1，分辨率选择节点为 1 MP、尺寸对齐 8 的倍数；图片编辑的尺寸由参考图片和工作流决定。Pika 图生和文生视频可选相同比例及标称 5 秒、10 秒、15 秒，分辨率选择节点为 0.98 MP、尺寸对齐 32 的倍数，输出为 24 fps。其帧数表达式分别计算为 124 帧、243 帧和 362 帧，实际视频时长可能约为 5.17 秒、10.13 秒和 15.08 秒。角色替换与动作迁移不提供比例或时长选项：提交时通过 `ffprobe` 统计驱动视频帧数，按 81 帧窗口续接并裁剪到输入帧数，最多接受 3805 帧；输出帧率来自驱动视频。动作迁移将画面缩放裁剪到 482×854。长视频会增加处理时间和显存消耗；实际输出帧数、音画同步和分段衔接仍需在目标 ComfyUI 上验证。角色替换依赖新工作流中的 VHS、Easy Use、KJNodes、SAM3 等自定义节点和相应模型。

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

配置 `value_maps` 可转换比例与时长等枚举值，否则值按前端原样传入，因此若工作流需要数字宽高、帧数或其他类型，需先按具体工作流扩展转换逻辑，不能直接套用示例。参考图片和驱动视频会上传到 ComfyUI 的 `/upload/image`；任务通过 `/prompt` 提交，以 `/history/{prompt_id}` 查询状态；完成后通过 `/view` 下载结果，保存到网站服务器的上传卷 `_outputs/` 目录，再标记任务完成。文生图和图片编辑使用 `comfyui-save-image-pro` 的 `SaveImageSimple` 节点直接输出 JPG（质量 95），ComfyUI 需安装该自定义节点。其他新保存的 PNG、WebP 图片会转为 JPG（质量 90，透明区域铺白色），已有 JPG 直接保存，浏览和下载均返回 `image/jpeg` 与 `.jpg` 文件；已有本地作品保持原格式，视频和 GIF 不转换，ComfyUI 端仍可能保留原始文件。视频工作流必须在 history 的 `videos`、`gifs` 或 `images` 输出中提供 `filename`、`subfolder`、`type`。完成配置后重启 API 和 worker 以刷新配置缓存。

## 主要 API

接口的完整参数以运行中的 `/docs` 为准。注册、登录、登出和当前账户接口位于 `/api/auth/`；`GET /api/models` 返回当前可见模型及输入要求。`POST /api/uploads` 上传图片，`POST /api/uploads/video` 上传驱动视频，`GET /api/uploads` 返回当前用户的图片素材；素材内容通过 `/api/uploads/{id}/content` 读取。重复素材按用户和文件内容去重。

`GET /api/uploads?kind=image` 和 `?kind=video` 分别列出当前用户的图片和视频，`?kind=all` 按创建时间列出两类素材，省略 `kind` 时保持返回图片的兼容行为。`DELETE /api/uploads/{id}` 删除当前用户未被作品引用的素材及其本地文件；被作品引用时返回 409，须先删除相关作品。生成页面可以从元素库选择参考素材，提交时仍进行归属及类型校验。

`POST /api/tasks` 创建任务，可通过 `Idempotency-Key` 防止重复提交；`GET /api/tasks` 和 `GET /api/tasks/{id}` 获取列表及详情，`/events` 获取状态事件，`/outputs/{index}` 读取或下载结果。`POST /api/tasks/{id}/cancel` 取消排队中或生成中的任务并删除站内记录；正在提交时需稍后重试。生成中的任务要求 ComfyUI 支持按任务 ID 取消的 `/api/jobs/{id}/cancel` 接口，服务未确认取消时保留任务。`DELETE /api/tasks/{id}` 允许所有者删除已完成、失败或待确认任务的站内记录；上传素材及已保存输出文件不会随之删除。所有素材、任务及结果接口均校验账号归属。

任务列表会查询 ComfyUI 队列并显示排队位置，数量表示前方任务数（不是人数）；队列不可用时显示已有状态。一个任务只尝试提交一次 `/prompt`。若连接中断、返回 5xx、worker 在提交时退出或任务超时，状态会变成“待确认”；请在 ComfyUI 侧按数据库里的 `comfy_prompt_id` 核对，系统不会自动重试以避免重复生成。数据库中的 `queued` 和 `running` 任务可在 worker 重启后继续处理。新作品在标记完成前保存到网站服务器；当前版本不补存历史作品，访问未保存在本地的旧测试作品会显示为不存在。生成服务可能仍保留自己的输出副本。

账户为邮箱+密码，密码使用 Argon2 哈希，登录状态存放在 HttpOnly、SameSite=Lax cookie 中；用户只能访问自己的上传、任务和输出。该版本没有邮件验证、密码找回、限流、通用迁移框架、共享对象存储或商业支付，部署到公网前需补齐相应功能并使用 HTTPS、受保护的 MySQL/Redis 和专用的 ComfyUI 网络。

## 测试

`python -m pytest -q` 默认用临时 SQLite 和不可用 Redis 测试回退；也可通过 `DATABASE_URL` 与 `REDIS_URL` 指向**专用测试数据库**运行。测试会删除该数据库中本项目的数据表，切勿指向正式数据库。

## 积分

登录后在右上角手动领取每日 1000 积分；按北京时间自然日重置，未使用的每日积分不累计。文生图和图片编辑每次 100 分；Pika 5 秒 330 分、10 秒 660 分、15 秒 990 分；角色替换和动作迁移按 81 帧首段、后续每 76 帧一个分段计费，每段 165 分。工作流分辨率固定，当前价格按对应工作流估算，并非实际 GPU 测量值。

提交任务时由服务端重新计算并原子扣除，余额不足会拒绝提交；幂等请求不会重复扣费。取消成功或任务明确失败时全额退还，跨日退款在下一次领取时补入余额；提交结果不确定的任务需核实，系统不会假定失败退款。`GET /api/credits` 查询余额，`POST /api/credits/claim` 领取，`GET /api/credits/quote` 按模型、时长及用户已有驱动视频素材报价。驱动视频报价由服务端统计帧数；系统视频示例由后端从只读示例目录直接导入，无需浏览器上传。Docker Compose 已挂载该目录，本机路径可通过 `EXAMPLE_DIR` 设置。

积分使用新表，已有任务没有历史扣款。更新前按数据结构文档备份数据库和上传目录，并在停止 API 与 worker 后运行迁移；新规则不会追溯扣费。实际算力消耗与模型、节点、硬件和素材有关，价格需要根据运行数据调整。

工作室工具复用上述注册表中的图片编辑、文生/图生视频和动作迁移工作流；对应功能及尚未接入的专用工作流见根目录 [工作室工具说明](../README.md#工作室工具)。现有模型不提供音频驱动口型同步、视频续写、超分辨率或通用视频重绘。

玩法模板的系统参考素材位于 `public/sites/aibox/templates/`，可通过 `TEMPLATE_DIR` 指定后端读取目录；Compose 将该目录只读挂载。仅允许导入符合命名规则的本地参考图片和视频，导入后按当前用户保存和校验。Pika 视频提示词上限为 8000 字；图像工作流仍为 3000 字，较长的图片模板需先由用户缩短。

`POST /api/tasks/{id}/retry` 按原任务的素材、提示词和参数直接创建新任务，使用当前注册表构建工作流并重新计费；请求需提供幂等键，重复请求不会重复扣费。待确认任务必须核实为执行失败后才允许重试。编辑通过 `GET /api/uploads/{id}` 读取自有素材信息并复用上传记录，用户修改后再手动提交。
