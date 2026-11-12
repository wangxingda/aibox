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

首次配置时，将 `.env.example` 复制为 `.env.local`、将 `backend/.env.example` 复制为 `backend/.env`，并按实际环境填写数据库、Redis、JWT 和 ComfyUI 配置；已有配置的环境无需覆盖。`COMFYUI_URL` 可通过环境变量覆盖，应填写服务器可访问的生成服务地址，勿将真实地址提交到仓库。

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

## 功能与数据

- 用户上传素材和生成结果保存在网站服务器的上传数据卷中；新作品在持久化完成后才显示为已完成。文生图和图片编辑直接输出 JPG（质量 95，ComfyUI 需安装 comfyui-save-image-pro）；其他新保存的 PNG、WebP 图片转为 JPG（质量 90，透明区域铺白色），已有本地作品保持原格式；当前版本不会自动补存历史作品。
- 登录后每天可领取 1000 积分，任务价格按模型、视频时长或驱动帧数计算；取消成功或明确失败会全额退款。详见 [积分说明](backend/README.md#积分)。
- 图片功能包括文生图和图片编辑；视频功能包括图生音视频、文生音视频、角色替换和动作迁移。各模式的输入要求以服务端模型目录和 [工作流说明](backend/README.md#配置工作流) 为准。
- 图片和视频参考示例保存在 `public/sites/aibox/`，一键同款会填入对应提示词与可用的参考素材；实际生成效果取决于当前模型和参数。
- 任务在当前页面的“我的作品”中显示状态、进度和结果；已完成任务支持编辑回填、下载和删除。素材按用户隔离，并按文件内容去重。
- “资产”中的作品和元素库均可按图片、视频分类；元素库支持上传、删除未被作品引用的素材，生成时可从作品或元素库导入参考图片和驱动视频。作品导入支持 JPEG、PNG、WebP 图片和 MP4、MOV、WebM 视频。
- 未登录时使用生成、作品和素材导入等账号功能会提示登录或注册；登录后可继续当前页面的操作。
- 工作流注册表是 `backend/workflows/registry.json`；新增或调整工作流后需要重启 API 与 worker。任务创建时会保存工作流快照，已排队任务不随注册表变更。

## 容器部署

单机容器部署配置位于 `deploy/`，包括前后端镜像、MySQL、Redis、Nginx 和服务管理脚本。部署步骤、环境变量以及启动、停止、重启和检查命令见 [部署指南](deploy/README.md)。生产环境必须按实际域名配置 HTTPS 和允许的访问来源。

## 验证

```bash
npm run check
cd backend
DATABASE_URL=sqlite:////tmp/aibox-test.sqlite3 REDIS_URL=redis://127.0.0.1:6399/0 .venv/bin/python -m pytest -q
```

后端测试会删除测试数据库中的表；必须使用专用测试数据库，不能指向现有业务数据库。测试环境中的 Redis 端口配置为不可用，以验证缓存回退；涉及 MySQL 特性的测试会在 SQLite 下跳过。

模型能力、素材限制和任务状态说明见 [后端指南](backend/README.md) 与 [数据结构和交互约定](backend/docs/data-model.md)。

## 工作室工具

工作室目录包含营销工作室、Avatar Studio 和 15 个工具入口。产品海报、试穿、美颜、室内设计通过图片编辑工作流实现；广告视频、数字人、商品数字人和佛罗里达梗使用文生或图生视频近似生成；动作迁移使用现有动作迁移工作流。试穿需要人物图与服装图；生成效果取决于通用模型，不能保证商品、人物或服装细节及精确口型。

视频魔改、广告视频复刻、无限机位、口型同步、视频延长和视频画质增强尚无对应工作流，页面说明了需要接入的能力；数字人指定台词和口型、广告模板编排、视频美颜及专用试穿能力也尚未实现。工作室缩略图来自参考站点资源，实际功能和生成结果以本项目接入的工作流为准。

玩法模板仅在访问页面时加载目录，默认展示 24 个，滚动时分批加载更多图片。模板收录 LightX2V 公开探索页的图片、视频、动作迁移和数字人素材；按来源编号、画面及提示词和参考素材去重，卡片使用中文名称并提供来源链接。文生图、图片编辑、文生视频、图生视频和素材齐全的动作迁移模板可一键填入创作页；数字人、音频及其他尚无对应功能的模板保留素材并标记为待支持。部分源站素材不可用，无法保证示例复现原站模型的生成效果；本地模板参考素材通过后端只读目录导入。
 ## 声音创作

声音创作工作台提供声音克隆：上传 WAV/MP3 或录制样本，输入文字后可试听并下载生成音频。需要登录并配置独立 TTS 推理服务；配置和限制见 [后端说明](backend/README.md#声音克隆)。音频结果不会自动保存到作品库。

系统音色分类与素材从 vbox 移植至 `public/sites/aibox/voices/`，目录清单为 `catalog.json`，支持分类选择、试听并作为克隆样本提交。本机工作区检查地址为 http://localhost:3002/voice-clone，API 端口 18001；原有 3001/18000 服务保持运行。TTS 使用 vbox 配置的接口地址（保存在本地私有环境配置中），实际推理结果仍需验证。

声音克隆页的系统音色按名称及音频文件内容去重；音色卡片使用本地角色头像，缺少头像时显示人物图标。

声音工作台与图片、视频页共用双栏布局：左侧选择音色并输入文案，右侧提供参考示例与我的作品。示例试听播放对应内置音色克隆生成的卡片文案音频，使用示例会填入音色及文案；我的作品仅保留本次页面会话内生成的结果，刷新或离开页面前需下载。缺失头像使用本地默认头像。

录音区提供朗读参考文字；录音中展示状态动画、剩余秒数和时长进度，最长 10 秒自动停止，可提前结束。动画仅表示录音状态，不表示实时音量。

声音页使用 `react-h5-audio-player` 自定义深色播放器，提供播放/暂停、进度拖动和时间显示；播放新音频时暂停页面内其他声音播放器。

参考示例生成音频保存在 `public/sites/aibox/voices/examples/`，该目录的 `catalog.json` 绑定音色、原始样本、文案及生成音频；调整示例文案时需同步重新生成音频。

声音资产：`POST /api/uploads/audio` 接收最多 3 MB 的 WAV、MP3、WebM，使用 ffprobe 校验音频，复用 uploads 表及用户内摘要去重；列表支持 `kind=audio`，`kind=all` 包含声音。读取和删除沿用所属账号校验。声音工作台可将上传或录制样本保存到资产，并从声音资产导入；录音仍最长 10 秒，资产无新增数据字段。

创作首页提供视频、图片和声音入口；原灵感页面已移除，旧地址 `/explore` 跳转至创作首页。

创作首页提供图生音视频、角色替换、文生图和图片编辑示例，点击后进入对应页面并填入示例素材和提示词。视频创作默认打开图生音视频。

声音录制最长 10 秒，完成后可试听、重新录制，选择直接用于当前创作，或命名保存到元素库并用于当前创作。直接使用的录音仅保存在当前页面会话中。
