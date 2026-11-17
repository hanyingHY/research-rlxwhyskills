# OpenDirector 项目分析

> 仓库：[ThinkFlowLab/OpenDirector](https://github.com/ThinkFlowLab/OpenDirector)
> 分析对象：`main` @ `729b49b`（2026-11-16，v0.1.4）
> 分析日期：2026-11-17

## 1. 一句话结论

OpenDirector 是一个**本地优先的 AI 视频创作工作台**：React 画布 + 本地 FastAPI 服务 +
可插拔 Agent 运行时 + 模型服务适配层 + FFmpeg 媒体处理 + 浏览器内时间线导出。
它已经是一个完整可安装的应用，而不是原型；`serve` 一条命令即可在浏览器使用。
因此 #362 的桌面化本质上是**交付工程问题**（运行时捆绑、进程与凭据、签名、更新），
不是重写产品。

## 2. 产品范围与典型工作流

README 与用户指南描述的工作流：

```
连接模型服务 → 对话生成/导入素材 → 画布整理与引用 → 图像/视频/音频编辑
            → 时间线编排 → 预览 → 导出 MP4 / JSON / FCPXML / .timeline.zip
```

- **画布**：节点式素材与生成关系，支持上传、连线、`@` 引用、版本历史、隐藏、锁定。
- **生成**：图像、视频、语音；多供应商（BigModel/CogVideoX、Kling、MiniMax、MOSS、
  GLM、vLLM-Omni/FastH3、OpenAI 兼容等）。
- **编辑**：裁剪、调色、图层、片段；AI 工具（扩图、擦除、抠图）取决于模型能力。
- **时间线**：起止点、速度、音量、文字层、字体、导出 MP4（浏览器 WebCodecs，
  Chrome/Edge 才有 H.264 编码器），也可导出 JSON/FCPXML/可编辑包。
- **本地优先**：项目、素材、模型配置都在本机；生成才访问用户配置的远端或自建服务。

这条链路决定了桌面化的关键约束：**MP4 导出发生在渲染器**，不是 Python 后端；
所以 Electron 的 Chromium 版本、窗口存活时间、后台节流策略都是验收项，而不是外观细节。

## 3. 仓库结构与技术栈

```
OpenDirector/
├── src/                     React 19 + Vite 6 前端（画布、时间线、聊天、i18n）
├── apps/api/                FastAPI 本地 API（HTTP 边界、路由、本地化错误）
├── packages/core/           Python 核心：domain / application / infrastructure / ports / agent
├── packages/agent/skills/   内置技能（character-replacement）
├── plugins/deepseek-harness DSH 插件（把 OpenDirector 工具暴露给 DSH）
├── tools/fasth3/            自建视频模型服务相关工具
├── scripts/                 安装校验、CI、i18n、浏览器验收
├── docs/                    架构、开发、指南（中英）
└── tests/                   109 个 Python 测试文件 + 127 个 TS 测试文件
```

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 前端 | React 19.3、Vite 6.4、TypeScript 5.8、@xyflow/react、three、mediabunny | 单页应用，所有 API 都用相对路径 `/api/...` |
| 本地 API | FastAPI 0.143、uvicorn 0.54、Pydantic 2.14 | `create_app()` 组合根，静态托管 `dist/` |
| 核心 | 纯 Python 3.11+，Typer CLI | 分层由 import-linter 强制：domain 不依赖外层 |
| 存储 | 文件 + SQLite 目录索引 + `filelock` | `projects/<id>`，`.opendirector/` 放配置与会话 |
| Agent | 内置 OpenCode 二进制 + 外部 CLI（Codex/Claude/OpenCode/JiuwenSwarm/DeepSeek ACP） | 每轮独立工作目录 + 本地 socket 业务桥 |
| 媒体 | FFmpeg/ffprobe（外部依赖）、Pillow、pillow-heif、fonttools | 探测、缩略图、转码、字体校验 |
| 打包 | PEP 517 自定义 backend + 平台 wheel | wheel 内带前端产物、技能、OpenCode 可执行文件 |

规模参考：Python 约 2.5 万行，前端 `src/` 约 8.2 万行；`main` 约 294 次提交。

## 4. 运行时是怎么跑起来的

### 4.1 安装与启动

```
python -m pip install -e .     # build_backend.py: npm ci → npm run build → 校验 opencode
opendirector serve             # uvicorn 127.0.0.1:8000，托管 dist/index.html
opendirector dev               # 额外启动 Vite 5173，前端代理 /api 到 8000
```

`build_backend.py` 把 `dist/`、内置技能、当前平台的 OpenCode 二进制复制进
`packages/core/src/opendirector/_bundled/`，wheel 标签是 `py3-none-<platform>`。
安装 wheel 的用户不需要 Node.js。目前没有自动发布到 PyPI 的动作。

### 4.2 本地 API 的访问控制

`apps/api/src/opendirector_api/main.py` 的 `local_requests` 中间件要求：

1. `request.url.hostname ∈ {localhost, 127.0.0.1, ::1}`；
2. 如果有 `Origin`，其 hostname 也必须是上述本机名；
3. 请求头 `X-OpenDirector-Request: 1`。

这三条是**同源/本机约束**，不是身份认证：本机任何进程都能伪造该请求头，
也没有每次启动的随机凭据。端口默认固定 8000（`server.py` 绑定 `127.0.0.1`）。

### 4.3 Agent 运行机制

- `packages/core/src/opendirector/agent/runtime.py`：运行时目录（default/opencode/codex/
  claude/jiuwenswarm/deepseek），`Default` 使用仓库内置 OpenCode。
- `agent/native.py`：每轮在 `agent-runs/<turn-id>/work/` 建工作目录，启动 harness，
  通过 JSONL 读事件；业务写入走 `opendirector` CLI。
- `agent/cli_transport.py`：POSIX 用 Unix socket；Windows 自动退回 `127.0.0.1` TCP，
  并把本轮网关地址通过环境变量注入。
- `agent/process.py`：POSIX 用进程组信号，Windows 用 `taskkill /T`，说明作者已经
  考虑过跨平台子进程清理。
- 外部 CLI 只使用自己的登录与模型配置，不读 OpenDirector 保存的模型密钥。

这一点对桌面壳很重要：**Host 进程会派生子进程**，退出/崩溃时必须整组回收，
否则会在 `agent-runs/` 留下孤儿进程并占用项目锁。

### 4.4 数据布局

```
<data-root>/
├── projects/<project-id>/        项目快照、素材、编辑文档、agent-runs、tool-tasks
└── .opendirector/
    ├── models.json               模型服务与 API Key（POSIX 权限 0600）
    ├── catalog.sqlite3           工程目录索引、会话租约
    ├── *.lock                    filelock 跨进程锁
    └── skills/                   用户/工程技能
```

- 源码安装默认 data root = 仓库根；wheel 安装默认 `~/.opendirector`；
  `OPENDIRECTOR_ROOT` 可覆盖。
- 写入使用提交日志、修订号、幂等回执；跨进程通过文件锁协调。
- `models.json` 里的 API Key 是**明文存储**（仅靠 0600 权限），没有接系统钥匙串。

### 4.5 前端状态与 origin 的耦合

前端完全用相对路径 `/api`，并大量使用浏览器存储：

- `localStorage`：主题（`opendirector.theme.v1`）、语言（`opendirector.locale.v1`）、草稿等；
- `sessionStorage` + Web Locks：每个页面一个会话 ID，用于项目租约与崩溃恢复；
- `crypto.randomUUID()` 与 Web Locks 需要 secure context。

这些能力都按 **origin** 隔离。桌面壳如果用 `http://127.0.0.1:<随机端口>` 直接加载页面，
每次启动端口变化都会变成新的 origin：主题、语言、草稿会“丢失”（实际是读不到），
项目租约的 Web Lock 语义也会跟着变。这是 RFC 没有写、但实现时一定会撞到的问题。

## 5. 工程成熟度：哪些地方值得信任

1. **分层有机器约束**：`pyproject.toml` 的 import-linter 合约禁止 domain/application/
   infrastructure 互相反向依赖，CI 会跑 `lint-imports`。
2. **契约生成**：`scripts/generate_contracts.py --check` 对比前后端类型契约，CI 门禁。
3. **测试面广**：109 个 Python 测试文件覆盖工具任务、时间线、生成、语音、Agent 运行时；
   127 个 TS 测试文件覆盖画布、时间线、聊天、引用、i18n。
4. **CI 完整**：静态检查、Python 分层与全量测试、浏览器验收、CodeQL、夜间基准、
   DSH 插件工作流；PR 模板要求真实证据（截图/视频或明确 N/A）。
5. **i18n 是硬约束**：中英双语文案、检查脚本、错误码到英文的映射在 HTTP 边界完成，
   Python 领域层保持中文文案给 CLI/轨迹使用。
6. **安装隔离验收**：`scripts/verify_install.py` 在临时目录、移除 `PYTHONPATH`、
   收窄 `PATH` 的条件下验证 wheel 的 CLI、OpenCode、技能、健康接口、首页、静态资源。

这些说明：**桌面壳不需要重新发明业务能力**，重要的是不要破坏这些边界。

## 6. 桌面化会遇到的真实约束

| 约束 | 证据 / 位置 | 影响 |
| --- | --- | --- |
| 固定端口、无启动凭据 | `apps/api/.../server.py`、`main.py` 中间件 | 桌面必须补动态端口 + 每启动 token，否则任何本机网页/进程都能调用 |
| 导出在渲染器完成 | 用户指南“keep the page open while rendering”；时间线导出用 WebCodecs | Electron 的 Chromium 编码能力、窗口存活、后台节流都要验证；不能用系统浏览器替代 |
| 内置 Agent 体积大 | `opencode-ai@1.19.5` 各平台包解包约 180–215 MB | 安装包显著变大；需要决定“内置”还是“首次按需下载” |
| FFmpeg 是外部依赖 | 安装指南要求系统 FFmpeg + libx264 | 打包必须自带；而 libx264 是 GPL，分发义务要单独决策 |
| 数据根因安装方式而异 | `installation.py`：源码=仓库，wheel=`~/.opendirector` | 桌面默认值必须与 CLI 对齐，否则用户“看不到自己的项目” |
| Agent 子进程与锁 | `native.py`、`cli_transport.py`、`filelock` | 崩溃/强杀会留孤儿进程；桌面必须整组回收并处理锁恢复 |
| 单实例假设 | `LocalProjects` 的会话租约、目录锁 | 桌面必须单实例；同时开两个会互相报“工程在其他窗口打开” |
| 外部 harness 依赖登录 | `runtime_readiness` 返回 not_installed / needs_login | 桌面要能展示这些状态，而不是启动失败 |
| 安装包签名 | 目前只有 wheel，无桌面安装包 | macOS 公证、Windows 签名、Linux 仓库均是新工作 |

## 7. 对“桌面 vs Web”的判断

- **保留 Web UI 是正确选择**：产品复杂度集中在画布/时间线/编辑器，重写等于重做产品。
- **Electron 比 Tauri 更合适**（详见 #362 评估）：MP4 导出的 WebCodecs H.264 编码器
  在 Chromium 中一致可用；Tauri 在 macOS WKWebView、Linux WebKitGTK 上的编码支持
  不一致，会直接破坏“导出”这一核心验收项。
- **HarmonyOS 不共享同一运行时**：Electron 不支持 HarmonyOS。可共享的是 Web UI、
  HTTP 契约与数据格式，#252 应该是独立适配（WebView/ArkWeb + 原生壳），不要混进
  Electron 构建矩阵。

## 8. 与 issue #362 的关系

#362 把工作拆成 D1 桌面应用 + D2/D3/D4 三平台分发 + D5 自动更新 + D6 下载页。
从上面的约束看：

- **D1 是真正的风险集中点**：Host 生命周期、凭据、动态端口、数据根、任务感知退出、
  运行时布局。平台分发（D2–D4）主要是签名与 CI 矩阵的重复劳动。
- **D5 的期望需要修正**：electron-updater 在 Linux 只可靠支持 AppImage；deb/rpm
  自动更新要自建机制。RFC 里“Linux distribution automatic updates”必须先定义范围。
- **D6 依赖真实产物与校验和**，应最后做，并且必须与 release 流程（单一 SemVer 流）
  对齐；不能引入浮动 `latest` tag。

具体的方案缺口、建议顺序与验收矩阵见 [`02-issue-362-assessment.md`](02-issue-362-assessment.md)。
