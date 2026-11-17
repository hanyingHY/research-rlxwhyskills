# 对 issue #362（桌面客户端与内置运行时）的判断

> 结论先行：**方向正确，Electron 选型正确，D1 的必要性被低估，D5 的范围被高估，
> 有 6 个必须先定的技术决策在 RFC 里还没有答案。** 下面按“赞同 / 需要补 / 建议改”
> 三部分给出，并附可执行的顺序与验收矩阵。

## 1. 赞同的部分

1. **复用现有 Web UI + 共享 Python 业务服务**。产品价值在画布、时间线、编辑器和 Agent
   编排上，重写界面不会带来收益；后端已经是单进程 FastAPI，天然适合塞进桌面壳。
2. **Electron 作为基线**。这不是“随大流”的选择：MP4 导出依赖 WebCodecs 的 H.264
   编码器，只有 Chromium 在三大平台提供相对一致的实现。Tauri 在 macOS WKWebView、
   Linux WebKitGTK 上无法保证这一点，选 Tauri 等于要重做导出或外挂 FFmpeg 渲染。
3. **对参照实现的选择**。DeepSeek Harness Desktop 的“壳 + Host 生命周期 + 私有凭据 +
   平台签名/更新”模式与 OpenDirector 的结构相近（Node 壳 + 内嵌运行时），可以复用其
   经验，但要把它对 Node/pnpm 的假设换成 CPython/FFmpeg/OpenCode。
4. **验收写“干净环境安装→创建→Agent→编辑→导出→重开→更新”**。这是产品级验收，
   比“能启动”强得多，应该保留。

## 2. 需要补的关键缺口

### 2.1 认证：现在没有“每次启动的凭据”

RFC 要求“Generate a fresh credential per Host launch… exclude it from renderer code,
URLs, logs and shared localhost cookies”，但当前实现只有：

- 只监听 `127.0.0.1`；
- `Origin` 必须是 localhost；
- 请求头 `X-OpenDirector-Request: 1`。

任何本机进程都能发送这个头；恶意网页也能通过简单请求触发（虽然没有 CORS 读不到响应，
但写入类接口仍可能被 CSRF 打穿——`X-OpenDirector-Request` 本身是自定义头，浏览器跨域
请求需要预检，所以现状勉强能挡住网页，但挡不住本机程序）。

**建议实现**（基线代码已做）：

```
主进程: token = randomBytes(32).base64url()
        spawn(python, ["host_entry.py", "--port", "0"], env={OPENDIRECTOR_DESKTOP_TOKEN: token})
Host:   纯 ASGI 中间件，校验 Authorization: Bearer <token>（compare_digest）
主进程: od://app/* 代理时注入 Authorization 与 X-OpenDirector-Request
```

要点：

- 不要用 `BaseHTTPMiddleware`。`apps/api/.../main.py` 里图像预览取消依赖
  浏览器断连信号，而 `BaseHTTPMiddleware` 会破坏 `receive` 流（代码里已有注释）。
  基线用纯 ASGI 中间件，保持了断连语义。
- token 不写文件、不进 URL、不进渲染进程。渲染进程只能通过 `od://app` 同源访问。
- `/api/health` 也要校验 token；不要给健康检查开后门。

### 2.2 动态端口与“稳定 origin”冲突

这是 RFC 没提、实现必踩的坑：

- `src/backend/api.ts` 每个页面加载生成 `sessionId`，用 Web Locks 管理项目租约；
- 主题、语言、草稿存在 `localStorage`；
- 浏览器按 **origin**（含端口）隔离存储。

如果渲染进程直接加载 `http://127.0.0.1:<随机端口>`，每次启动都是新 origin：
主题/语言回到默认、草稿读不到、旧租约的 Web Lock 无法释放（会等过期）。
用户会认为“桌面版比网页版丢数据”。

**建议**：固定 origin + 代理。基线用 `od://app/`（standard + secure scheme），
主进程把 `/api` 与静态资源都代理到当前 Host。这样：

- origin 永远不变，存储稳定；
- 不产生任何 localhost cookie（`Set-Cookie` 在代理层被丢弃）；
- 渲染进程里没有 token，只有同源请求。

代价是要实现流式转发（SSE、视频 Range、下载）。基线的 `src/protocol.js`
已经处理了这些，但正式实现需要补 Electron 真机验证。

### 2.3 任务感知退出：目前没有可查询的统一状态

D1 要求“Inspect Agent, generation and export tasks before quitting”。现状：

- Agent 轮次：`apps/api/src/opendirector_api/agent.py` 里的 `active` 是**闭包变量**，
  没有 HTTP 出口；
- 工具任务：`GET /api/creation/projects/{id}/tool-tasks` 可查（状态 queued/running）；
- 生成任务：在项目快照的 `jobs` 里，但没有“全局正在运行”的查询；
- 导出：完全发生在渲染器，主进程无法从后端得知。

**建议**：

1. 上游新增 `GET /api/desktop/status`，在一次调用里返回：
   `agentTurns[]`、`toolTasks[]`、`generationJobs[]`、`exportSessions[]`（渲染器上报）。
2. 把 Agent 的 `active`、ToolTasks 的活跃任务、Generation 的 running jobs 收敛到一个
   轻量注册表（不要为了这个接口去扫全部项目快照，工程多时会卡退出）。
3. 导出由渲染器在开始/结束时通过 preload IPC 告知主进程；主进程退出对话框据此提示。

基线代码先用“包装层自查询 HTTP API + 在途请求计数”做了可用版本，并明确
`notExposed: ["agentTurns", "generationJobs"]`，不假装知道。

### 2.4 数据根与 CLI 一致性

- wheel CLI 默认 `~/.opendirector`；源码 CLI 默认仓库根；`OPENDIRECTOR_ROOT` 可覆盖。
- 桌面如果用自己的 `userData/data`，用户会发现“CLI 里的项目不见了”。

**建议**：桌面默认 `OPENDIRECTOR_ROOT`，否则 `~/.opendirector`；在“关于/诊断”里显示
实际数据目录并可打开；源码开发用显式环境变量，不自动猜仓库。迁移/导入要单独设计，
不能悄悄复制。

### 2.5 运行时与体积

| 组成 | 量级 | 备注 |
| --- | --- | --- |
| Electron/Chromium | ~200 MB | 平台差异不大 |
| CPython（python-build-standalone） | ~60–100 MB | 需逐平台、逐架构 |
| Python 依赖（Pillow、pillow-heif、numpy 等间接依赖） | ~50–80 MB | 需与目标平台 wheel 对齐 |
| 内置 OpenCode | **180–215 MB/平台** | npm 1.19.5 各平台包解包体积 |
| FFmpeg + ffprobe（静态） | ~70–100 MB | 与许可证决策相关 |

粗估安装后 500–700 MB、下载 200–350 MB。**这应当是 RFC 的显式决策项**：

- 方案 A：全部内置（离线可用、体验最好、包最大）；
- 方案 B：内置 Python/FFmpeg，Agent 首次按需下载（需要完整性校验、代理与失败恢复）；
- 方案 C：内置 Python，FFmpeg 与 Agent 都按需（包最小，但“干净环境”验收需要联网）。

建议先按 A 做 D1 验收，把 B 作为体积优化路线；不要在 D1 同时做按需下载。

### 2.6 许可证与合规（RFC 未提）

- **FFmpeg**：带 `libx264` 的构建是 **GPL**。分发安装包会把 GPL 义务带进来。
  可选：LGPL 构建（不含 libx264）+ 仅支持 H.264 硬编/系统编码；或继续 GPL 并满足
  提供源码等义务；或要求用户自备 FFmpeg（与“干净环境”验收冲突）。
- **OpenCode**：npm 包为 MIT，平台二进制需保留 LICENSE；DSH 参考实现也保留了
  第三方声明。
- **Noto Sans CJK**：OFL，需要随包保留许可证。
- **前端的字体/图标/演示素材**：仓库已有 `NOTICE`，桌面安装包必须在“关于”里可达。

建议：在 D1 里加一项“第三方声明与安装包内许可证清单”，不要留到 D6。

### 2.7 自动更新：Linux 的期望要收窄

`electron-updater` 的现实：

- macOS：需要签名 + 公证的 **zip**（dmg 用于首次安装），Squirrel.Mac 才能更新；
- Windows：NSIS 可用，但仍需签名，否则 SmartScreen 报警；
- Linux：**只有 AppImage** 有官方支持（依赖 `APPIMAGE` 环境变量与 zsync）；
  deb/rpm 不会自动更新。

而 RFC 的 D4/D5 写的是“Linux distribution automatic updates”。建议二选一：

1. 只承诺 AppImage 自动更新，deb/rpm 提供“检查新版本 → 打开下载页”；
2. 自建 deb/rpm 通道（apt/dnf 仓库或自研下载安装），成本明显更高。

另外，仓库的发布策略是“单一 SemVer 流、不可重打 tag、不要浮动 latest tag”。
桌面产物应挂在同一个 GitHub Release 上，shell 与内置运行时使用**同一个版本号**
（DSH 的做法），避免出现“壳 1.2.0 + 运行时 1.1.3”的未测组合。

### 2.8 导出与窗口语义

- 导出是渲染器行为，关闭窗口 = 中断；隐藏窗口仍可继续（`backgroundThrottling: false`）。
- 最小化到托盘、关闭窗口、退出应用三者要在 UI 上区分清楚，并写进验收。
- 远端生成任务：退出不会取消，但重开后需要能看到状态并恢复。当前“任务恢复”
  依赖项目快照与 tool-tasks 状态，需要在桌面退出/重启场景下专门验证。

### 2.9 HarmonyOS

Electron 不支持 HarmonyOS。能共享的是 Web UI、HTTP 契约、项目格式与 Agent 工具协议；
壳层必须是 ArkUI/ArkWeb 或 WebView 方案。建议把 #252 明确定义为“独立客户端适配”，
只共享契约，不共享构建产物与验收矩阵。

## 3. 建议调整的交付方式

RFC 的 6 个工作项、60 个子项，跨度接近一个平台团队一个季度的量。当前的主要问题是
**D1 的契约没有先冻结**，一旦 D2–D4 并行就会各自发明启动参数、日志位置、错误码。

建议：

### Phase 0（1–2 周）：冻结“桌面 Host 契约”

先做一份 1–2 页的契约，D1–D6 都以它为准：

| 契约项 | 建议值 |
| --- | --- |
| 端口 | Host 绑定 `127.0.0.1:0`，由 OS 分配；就绪后才告知壳 |
| 认证 | 每启动 256-bit token，`POST/GET /api/*` 全部要求 Bearer；纯 ASGI 校验 |
| 控制通道 | stdout JSONL：`ready` / `fatal` / `status` / `shutdown-complete`；stdin：`shutdown` |
| 数据根 | `OPENDIRECTOR_ROOT` 或 `~/.opendirector`；桌面与 CLI 一致 |
| 日志 | `userData/logs/{desktop,host}.log`，轮转 4 MB，token 永不落盘 |
| 退出 | 查询 `/api/desktop/status`；有任务先确认；5 s 优雅 → SIGTERM → SIGKILL 整组 |
| 错误码 | 壳层错误码与 Host 错误码分开，UI 用双语键映射，不直接显示栈 |
| origin | `od://app`（或等价固定 scheme），不使用随机端口作为页面 origin |

### Phase 1（D1）：把骨架做成产品壳

- 启动、重启、崩溃恢复、单实例、窗口/托盘语义；
- 下载与保存对话框、打开数据/日志目录、诊断信息复制；
- 中英双语（含错误与对话框）、无障碍基础；
- 三平台开发态跑通 `verify-runtime` + 手工验收清单。

### Phase 2（D2–D4）：平台分发，先无签名产物再签名

- CI 矩阵：`macos-14`(arm64)、`macos-13`(x64)、`windows-2022`(x64)、
  `ubuntu-22.04`(x64)、`ubuntu-22.04-arm`(arm64)；
- 先产出 unsigned 安装包做冒烟（安装→启动→创建→导出→重开），再补签名；
- macOS 公证需要 Apple 凭据与网络出口；Windows 签名建议 Azure Trusted Signing/EV；
- Linux 明确 glibc 基线（建议 Ubuntu 22.04 = glibc 2.35），Alpine/musl 不在首版范围。

### Phase 3（D5/D6）：更新与下载页

- 先 macOS/Windows；Linux 只做 AppImage；
- 更新源用同一 Release 的 `latest.yml`/`latest-mac.yml`/`latest-linux.yml`，
  稳定/测试通道用不同仓库或不同 channel 字段，不新增浮动 tag；
- D6 只展示已签名、已校验和、已验证的产物。

## 4. 验收矩阵建议

| 平台 | 架构 | 首版包格式 | 更新 | 签名 |
| --- | --- | --- | --- | --- |
| macOS 13+ | arm64 | dmg + zip | Squirrel.Mac（zip） | Developer ID + 公证 |
| macOS 13+ | x64 | dmg + zip | 同上 | 同上 |
| Windows 10 22H2/11 | x64 | NSIS | electron-updater | 代码签名（EV/云签名） |
| Windows 11 | arm64 | NSIS（可选） | 同 x64 | 同上 |
| Ubuntu 22.04/24.04、Debian 12、Fedora 40+ | x64 | AppImage（更新）+ deb | AppImage 自动；deb 手动 | GPG 签名 |
| 同上 | arm64 | AppImage + deb | 同上 | 同上 |

每个组合的必测项（对应 #362 验收）：

1. 干净机器安装 → 启动（无系统 Python/Node/FFmpeg）；
2. 创建工程 → Agent 对话与工具调用 → 编辑 → 导出 MP4 → 重开；
3. 启动失败（缺运行时/端口占用/权限）有可操作提示与日志位置；
4. 重复启动只聚焦已有窗口；项目锁与“其他窗口打开”提示正确；
5. 任务运行中退出：提示中断范围；远端任务不被取消；重开可恢复；
6. 更新：保留项目与凭据；更新失败可回退；
7. 中英文界面、文件对话框、错误提示；
8. 安装包许可证/第三方声明可访问。

## 5. 主要风险（按严重度）

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| FFmpeg/libx264 许可证 | 无法合法分发 / 返工 | 先定许可证策略，再选 FFmpeg 构建 |
| 内置 OpenCode 体积 | 安装包 500 MB+，更新流量大 | 先内置验收，再做按需下载 |
| 渲染器 origin/存储 | 主题语言草稿丢失、租约异常 | 固定 `od://app` origin（本基线） |
| 任务状态不完整 | 退出静默中断任务 | 上游 `/api/desktop/status` + 导出上报 |
| Python 运行时 relocatable/签名 | macOS 打不开、Windows 被杀软拦截 | 逐文件签名、干净 VM 验收、固定 python-build-standalone 版本 |
| Linux 更新预期 | 承诺无法实现 | 首版只承诺 AppImage |
| 数据根不一致 | 用户看不到 CLI 项目 | 默认 `~/.opendirector` + 显示/切换 |
| 退出时子进程残留 | 项目锁卡死 | 进程组/`taskkill /T`，崩溃后锁恢复验证 |
| 无显示器 CI | UI 验收缺失 | xvfb + Playwright/Electron 驱动，或平台 runner |
| 60 个子项并行 | 契约漂移、集成返工 | 先冻结契约，按矩阵推进 |

## 6. 需要 maintainer 明确的决策

1. 首版 OS/架构矩阵是否就是第 4 节的表？
2. Linux 是否接受“只有 AppImage 自动更新”？deb/rpm 是否首版必须？
3. FFmpeg 许可证策略：GPL 构建 / LGPL 构建 / 用户自备？
4. 内置 Agent 是否必须离线可用，还是允许首次按需下载？
5. 数据根默认值与迁移策略（源码安装用户如何切换到桌面版）？
6. 签名证书与更新托管由谁持有（Apple/Windows/Linux GPG）？
7. 桌面版本号是否与 OpenDirector 版本号绑定（建议绑定）？
8. HarmonyOS（#252）是否明确为独立客户端，仅共享 Web UI 与 HTTP 契约？

回答了这 8 个问题，D1–D6 的边界基本就清楚了；其中 1–5 会直接改变实现，建议在开工前
写进 #362 的正文，而不是留到 PR 里讨论。
