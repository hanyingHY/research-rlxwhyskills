# 06 · 桌面产品化：引导、设置、更新与发布

本文记录「可以直接下载安装」这一阶段的实现细节。阶段一的分析与 RFC 判断见
[`01`](01-project-analysis.md)～[`05`](05-issue-comment-draft.md)，本文只写产品化增量。

## 1. 目标与非目标

目标：

1. 用户从 GitHub 下载对应系统的安装包，双击后得到**与网页版完全一致**的创作画布；
2. 第一次打开就能用：不需要终端、不需要自己安装 Python/FFmpeg、不需要读文档；
3. 每个功能在正确的时机获得一次解释，之后不再打扰；
4. 中英文一致，数据留在本机，升级/卸载不丢项目。

非目标（有意留给上游或后续版本）：

- 不复制 Web UI 的代码，也不改上游业务逻辑；
- 不承诺未签名安装包能自动升级；
- 不在桌面壳里重新实现模型调用、时间线或导出。

## 2. 「完全替代网页版」的边界

桌面版与网页版的差异只有外壳：

| 层 | 网页版 | 桌面版 |
| --- | --- | --- |
| 界面与交互 | 浏览器打开 `:8000` | 同一份构建产物，加载在 `od://app/` |
| API | 相对路径 `/api…` + `X-OpenDirector-Request` | 同一请求，经主进程代理到 `127.0.0.1:<随机端口>` |
| 认证 | 无（本机回环） | 每次启动的 Bearer token，只存在于主进程 |
| 存储 | 浏览器 `localStorage` | `od://` 稳定 origin，等价于网页版且跨端口保留 |
| 文件保存 | 浏览器下载 | 系统保存对话框（`will-download` 设置默认路径） |
| 附加能力 | — | 原生菜单、F1 帮助、数据目录、自动更新、诊断复制 |

因此「功能相同」不是承诺，而是结构事实：两端跑的是同一份前端与同一套 API。
桌面壳新增的只有 `window.opendirectorDesktop` 这一组只读能力，Web UI 不使用它也不会退化。

## 3. 引导系统

### 3.1 状态机

```
settings.onboarding = { completed, tourDone, language, startedAt, skipped }

未完成欢迎  ──「开始」──▶  导览  ──完成/跳过──▶  就绪（按需提示）
     │                        ▲
     └──「直接进入」──────────┘（completed=tourDone=true）

F1 / 菜单「重播使用引导」可从任意状态重新进入导览（不改写历史偏好）
```

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| `welcome` | `completed=false` | 居中欢迎卡片：数据位置、四条卖点、语言切换、「开始 / 直接进入」 |
| `tour` | `completed=true && tourDone=false` | 7 步锚定导览（模型已配置时 6 步） |
| `ready` | 两者都为 true | 每 5 秒评估一次提示条件；仅显示第一条符合条件的 |

状态在 `od:guide-settings` 中经主进程 `sanitizeSettings` 落盘，渲染进程无法写入任意键。

### 3.2 导览步骤与锚点

| # | 主题 | 锚点（按优先级） | 位置 |
| --- | --- | --- | --- |
| 1 | 同一套画布 | 无（居中） | center |
| 2 | 工程 | `.cw-project-heading` → `.cw-topbar` | bottom |
| 3 | 连接模型（`!hasModels`） | `.cw-empty button` → `.cw-settings-control button` | right |
| 4 | 对话助手 | `.cw-chat-button` | top |
| 5 | 画布工具栏 | `.cw-rail` | right |
| 6 | 导出 | `.cw-top-actions` → `.cw-topbar` | bottom |
| 7 | 帮助入口 | 无（居中） | center |

- 锚点来自上游已发布的类名，不依赖组件内部状态；`firstVisible` 会跳过隐藏或零尺寸元素；
- 元素不在视口内时先 `scrollIntoView`，卡片定位在 `resize`/`scroll` 时重新计算并夹在视口内；
- 找不到任何锚点 → 卡片居中，引导继续，不阻塞；
- 第 3 步的「打开模型设置」按钮会真的点击目标控件（先关闭引导，再 `click()`），
  用户不会停在「请你自己去找」的提示上。

### 3.3 渐进提示（progressive disclosure）

| 提示 | 条件 | 优先级 |
| --- | --- | --- |
| 还差一步：连接模型 | `!facts.hasModels` | 100 |
| 想先看看效果？（示例工程） | `.cw-empty` 可见 | 90 |
| 渲染前的小提醒 | `.cw-timeline-dialog` 可见 | 80 |
| 让助手直接动手 | `#canvas-assistant` 可见 | 70 |
| 导出文件去了哪里 | 恒定（最后出现） | 40 |

- 同一时间只有一张提示卡；`seen` 记录后不再出现，`dismissed` 表示「不再显示」；
- 触发选择器通过 `MutationObserver` 观察，700 ms 去抖，最多每 24 秒出现一次；
- 提示不遮罩页面（`pointer-events: none` 的宿主），点击卡片外部不会误触；
- 帮助中心可「重置所有提示」，用于演示或排障。

### 3.4 帮助中心（F1）

分区：快速开始（5 条）、桌面能力（6 条）、常见问题（4 条）。支持中英文关键词搜索
（标题 + 正文 + 关键词），无结果时给出明确空态。

可执行动作：打开模型设置、打开项目数据目录、打开日志、检查更新、复制诊断、重播导览、
重置提示。诊断文本只含版本、平台、路径与 Host 状态，**不含 token、密钥或请求正文**。

### 3.5 实现方式与降级

- 引导 UI 挂载在 preload 创建的 `#opendirector-guide-root` Shadow DOM 中：不受应用 CSS 影响，
  也不污染应用样式；React 重渲染不会移除它。
- 主进程通过 `od:guide-command` 下发 `help / tour / shortcuts`，菜单与按钮走同一条路径。
- `document.documentElement.dataset.locale` 变化（应用内语言切换）会触发引导同步切换。
- 语言优先级：桌面设置 → `<html data-locale>` → `navigator.language` → `en-US`。
- 浏览器/加载失败时 `waitForApp` 最多等 90 秒；Host 起不来时由错误页接管，引导不叠加弹窗。
- 无障碍：`role="dialog"`、`aria-modal`、焦点进入卡片、Tab 循环、`Esc` 关闭、
  `prefers-reduced-motion` 下关闭动画。

## 4. 设置模型

`src/settings.js`，文件位于应用数据目录的 `desktop-settings.json`。

| 键 | 类型 | 说明 |
| --- | --- | --- |
| `onboarding.completed/tourDone/skipped` | bool | 引导状态 |
| `onboarding.language` | `zh-CN｜en-US｜null` | 用户显式选择；null 表示跟随系统 |
| `onboarding.startedAt` | ISO 字符串 | 首次完成欢迎的时间 |
| `tips.dismissed/seen` | string[] | 去重、限长、只接受字符串 |
| `storage.dataRoot` | 绝对路径｜null | 「更改项目数据目录」写入；重启生效 |
| `window.*` | number/null/bool | 窗口位置与最大化；尺寸夹在 960×640 以上 |
| `updates.autoCheck/channel/lastCheck` | bool/枚举/ISO | 更新通道 `stable｜beta` |

约束：

- 读取时逐字段校验（`sanitizeSettings`），损坏或未知字段回落到默认值并记一条 warning；
- 写入使用 `tmp` + rename，避免断电留下半个 JSON；
- 深合并时拒绝 `__proto__` / `constructor` / `prototype`；
- 文件可删除，删除即重置引导与窗口记忆，不影响项目数据。

## 5. 窗口、单实例与退出

- 单实例锁在读取任何 profile 之前获取；第二次启动只聚焦已有窗口并发送 `focus` 命令。
- 窗口位置/大小/最大化在 `resize/move/close` 时去抖 600 ms 保存；`getNormalBounds()` 避免把最大化尺寸写回。
- `visible` 由 `ready-to-show` 控制，避免白屏闪烁；启动页自带品牌、分阶段文案与进度条（无脚本，CSP 允许内联样式）。
- 关闭窗口：macOS 隐藏窗口保留 Host；其他平台进入退出流程。
- 退出：查 `/api/desktop/status` → 有任务时说明会中断的内容 → 优雅停止 Host（控制通道 → SIGTERM → SIGKILL）。
- `backgroundThrottling: false`：切到其他应用时时间线预览与导出不被节流。

## 6. 自动更新

```
打包时：electron-builder 依据 publish 配置写入 resources/app-update.yml（GitHub provider）
运行中：启动 8 秒后静默检查（可在设置关闭）→ 发现新版 → 询问「下载 / 稍后」
       → 下载完成 → 「重启并安装 / 稍后」
```

| 场景 | 行为 |
| --- | --- |
| 开发运行（未打包） | 不支持，提示原因 |
| 安装了 `app-update.yml` | 走 GitHub Releases；`channel=beta` 时允许预发布 |
| 设置了 `UPDATE_FEED_URL` | 覆盖为 generic provider（`…/beta` 子目录用于 beta 通道） |
| Linux 非 AppImage | 明确提示「请下载新安装包」，不假装支持 |
| 未签名 | 校验失败时提示「安装已签名版本」，不静默失败 |

更新检查不会在下载/安装前中断任务；`quitAndInstall` 只在用户确认后调用。

## 7. 构建与发布流水线

脚本职责（均可用 `node scripts/<name>.mjs --help` 查看头部注释）：

| 脚本 | 输入 | 输出 |
| --- | --- | --- |
| `prepare-source.mjs` | 上游 tag | `runtime/src/OpenDirector-<ver>`（审计/开发用） |
| `fetch-python.mjs` | target | `runtime/dist/.python/<target>-python` |
| `fetch-ffmpeg.mjs` | target 或 `--from` | `runtime/dist/.ffmpeg/<target>-bin` |
| `prepare-runtime.mjs` | python + wheels + ffmpeg + target | `runtime/dist/<target>/`（含 `manifest.json`） |
| `verify-runtime.mjs` | runtime | 真实启动 Host 的 PASS/FAIL |
| `build-preload.mjs` | `src/preload` + `src/guide` | `dist/preload.cjs` |

`prepare-runtime` 会校验解释器可执行、`import opendirector, opendirector_api` 成功、
记录 Python/OpenDirector/FFmpeg 版本与文件清单；跨平台构建必须显式 `--cross`，并标注未验证。

发布矩阵（`.github/workflows/desktop-release.yml`）：

| Runner | target | 产物 |
| --- | --- | --- |
| ubuntu-22.04 | linux-x64 | AppImage / deb / rpm |
| ubuntu-24.04-arm | linux-arm64 | AppImage / deb / rpm |
| macos-15-intel | mac-x64 | dmg / zip |
| macos-14 | mac-arm64 | dmg / zip |
| windows-2022 | win-x64 | NSIS exe |

每个 job 单独 checkout 上游并 `pip wheel`（因为 wheel 内含平台相关的 OpenCode 二进制），
因此不能交叉复用 wheel；`runtime/dist` 不进入 Git。

产物命名：`OpenDirector-<version>-<os>-<arch>.<ext>`；同时上传 `latest.yml` /
`latest-mac.yml` / `latest-linux.yml` 供自动更新使用。

发布步骤：

1. 改 `package.json` 版本（与内置上游版本一致）；
2. `git tag v<version> && git push origin v<version>`；
3. 等工作流结束，release 从 draft 转正；
4. 下载页（GitHub Pages 部署 `site/index.html`）与自动更新同时生效。

> `electron-builder` 默认按 `v<version>` 创建 release。若你的 fork 已存在同名 tag，
> 会复用该 release，把桌面产物作为附件上传。

## 8. 真机验收清单

发布前在一台干净机器上逐项确认（对照 RFC 验收；自动化覆盖情况详见 [`04-verification.md`](04-verification.md)）：

- [x] **自动化测试基线**：54/54 用例全绿（含 7 项 jsdom 真实 DOM 渲染测试、主进程协议校验、设置原子写入与更新逻辑）；
- [x] **后端 API 端到端闭环**：以真实 OpenDirector v0.1.4 源码 + Python 3.11 运行 `host_entry.py`，验证了动态分配端口、401/200 凭据鉴权、`/api/creation/projects` 工程创建与持久化、`/api/desktop/status` 状态汇报与 stdin `shutdown` 优雅退出；
- [ ] **物理机终验点（需带显示器与 GPU 的真实桌面）**：
  - [ ] 安装包签名/未签名提示符合预期（macOS Gatekeeper / Windows SmartScreen），首次启动 < 10 秒（SSD）；
  - [ ] 欢迎页 → 导览 → 画布，不跳过任何一步也能继续，遮罩高亮动画与元素定位精准；
  - [ ] 未配置模型时有提示且能直接打开设置；配置后不再出现；
  - [ ] 新建工程 → 生成一张图 → 拖入时间线 → 导出 MP4 → 重开应用工程仍在；
  - [ ] 导出期间切到其他应用不中断（`backgroundThrottling: false` 生效）；退出时若有任务会提示；
  - [ ] 更改数据目录后重启，工程仍在旧目录（提示语义正确，新工程存入新目录）；
  - [ ] `F1` / `?` / 菜单三处入口一致；英文系统下全英文；
  - [ ] 升级到新版本后引导不重复、窗口位置保留、项目未变；
  - [ ] 卸载后 `~/.opendirector` 仍在；日志目录可单独删除；
  - [ ] Linux 下 AppImage 能自更新，deb 安装版提示手动更新。

## 9. 运行时包装逻辑与上游落地（apps/api）

### 9.1 `runtime/host_entry.py` 包装逻辑说明

桌面壳不直接调用 `opendirector serve`，而是使用专用的 `host_entry.py` 启动服务，核心原因如下：

1. **操作系统动态端口分配（Port 0）**：
   在启动 Uvicorn 前先通过 Python `socket.bind(("127.0.0.1", 0))` 绑定本地端口并监听，随后将预绑定的套接字直接传给 `uvicorn.Server.run(sockets=[listener])`。端口绑定成功后才向 stdout 打印 `ready` 控制帧，彻底消除传统扫描日志或竞争固定端口的脆弱性。
2. **纯 ASGI 凭据网关（`DesktopAuth`）**：
   桌面壳启动时生成 256 位随机 Bearer Token 并注入子进程环境变量 `OPENDIRECTOR_DESKTOP_TOKEN`。`DesktopAuth` 作为纯 ASGI 中间件工作，**不使用** `starlette.middleware.base.BaseHTTPMiddleware`——因为画板在做图像选择预览时依赖浏览器断开连接信号来取消推理任务，而 `BaseHTTPMiddleware` 的内部缓冲机制会掩盖该断开信号。
3. **在途请求计数（`InFlight`）**：
   通过纯 ASGI 中间件跟踪尚未完成的 HTTP 请求数（含长流式响应），确保应用在退出前能感知正在传输的任务。
4. **确定性控制协议（stdio）**：
   在 stdout 输出以 `@@OPENDIRECTOR@@ ` 为前缀的单行 JSON 帧（`ready`、`status`、`fatal`、`shutdown-complete`），所有标准 Uvicorn/FastAPI 日志输出到 stderr，实现业务日志与生命周期控制信号的解耦。
5. **父进程生命周期守护（stdin EOF 保护）**：
   子进程主线程通过专用监听线程阻塞读取 stdin。当 Electron 壳层因异常崩溃或被 SIGKILL 终止导致管道破裂（EOF）时，监听线程主动向 Uvicorn 发送退出信号，触发 lifespan 关闭回调，确保释放项目 SQLite 事务锁与文件句柄，杜绝后台孤儿进程。

### 9.2 上游 landing 建议（落地至 `apps/api/`）

当前 `runtime/host_entry.py` 作为桌面项目内的独立包装脚本运行。正式生产化时，建议干净地合并进上游代码库：

- **建议位置**：`apps/api/src/opendirector_api/desktop.py`；
- **CLI 入口**：在 `opendirector` CLI 中增加 `opendirector desktop-serve --port 0` 子命令；
- **进程内状态查询**：当前 `host_entry.py` 里的 `collect_busy` 是通过内部 `httpx.Client` 向自身环回端口发起 HTTP 调用的。落地上游后，可以直接在 Python 内部访问 `create_app` 绑定的 `creation_projects` 和 `tool_tasks` 实例，消除进程内发 HTTP 的开销与可能在关闭阶段引发的死锁风险。

### 9.3 任务状态接口与 `notExposed` 记录

在当前实现中，退出状态检查接口 `/api/desktop/status` 只能获取工具任务（`tool-tasks`），返回结构显式标注：

```json
{
  "projects": 1,
  "activeToolTasks": [],
  "busy": false,
  "notExposed": ["agentTurns", "generationJobs"]
}
```

需要上游进一步配合暴露的接口：

1. **`agentTurns`（助手流式轮次）**：
   上游 `opendirector_api/agent.py` 的对话轮次以 SSE/NDJSON 形式流式传输，在底层由 `asyncio.create_task` 执行，但目前缺少全局轮次注册表或查询端点。建议上游在 `AgentRuntimes` 中维护活跃轮次集合，并提供 `GET /api/agent/active-turns` 或内部查询方法。
2. **`generationJobs`（生成任务）**：
   上游 `opendirector/application/creation_generation.py` 内部维护了生成任务执行，但没有开放公共的活跃任务轮询接口。建议上游暴露 `GET /api/creation/active-jobs` 或提供 `creation_generation.active_jobs()` 方法。

桌面壳在收到上游这两个接口后，即可将 `notExposed` 移除，实现全业务任务感知。

## 10. 签名、合规与第三方声明

### 10.1 代码签名与公证（结构确认）

本项目运行环境无私有代码签名证书与苹果开发者凭据，本节确认签名与合规的配置结构完整性：

- **macOS**：
  - 配置文件：`opendirector-desktop/build/entitlements.mac.plist`，开启了 `com.apple.security.cs.allow-jit`、`allow-unsigned-executable-memory` 与 `disable-library-validation`（Python C 扩展加载必需）；
  - 打包工具：`electron-builder.yml` 配置了 `hardenedRuntime: true`、`gatekeeperAssess: false`，在环境变量提供 `CSC_LINK`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD` 时自动执行签名与公证。
- **Windows**：
  - `electron-builder.yml` 中 NSIS 配置了 `oneClick: false`、`allowToChangeInstallationDirectory: true`、`deleteAppDataOnUninstall: false`（卸载不丢项目数据）；在提供 `CSC_LINK` 与 `CSC_KEY_PASSWORD` 时自动签名可执行文件与卸载器。

### 10.2 FFmpeg 与 libx264 的 GPL 合规义务

桌面客户端打包分发了用于视频时间线合成与 MP4 导出的 FFmpeg 二进制工具（通过 `scripts/fetch-ffmpeg.mjs` 获取）：

1. **GPL 衍生性质**：
   BtbN 预构建版本启用了 `libx264` 编码器库，使得分发的 `ffmpeg` / `ffprobe` 二进制整体受 **GNU General Public License (GPL) v3** 约束。
2. **架构边界与进程隔离**：
   OpenDirector 桌面应用与 Python 后端**均未通过动态链接（dlopen/C bindings）使用 FFmpeg 库**，而是通过独立的操作系统子进程命令行调用（`execFile` / `subprocess.run`）与管道进行数据交换。根据 FSF 官方解释，通过常规操作系统命令行作为独立程序调用，主应用程序保留其本身的 **Apache 2.0** 许可证独立性，不会导致主程序源码被迫“传染”为 GPL。
3. **再分发合规要求**：
   - 随应用分发时必须包含完整的 GPL 许可证文本副本；
   - 必须提供获取对应 FFmpeg 构建源代码的指引（BtbN/FFmpeg-Builds 仓库与构建脚本）。
4. **专有分发分支可选方案（LGPL）**：
   如果下游分发者对 GPL 存在严格合规顾虑，可改用 `--disable-gpl --disable-libx264` 的 LGPL 构建版本（通过系统自带硬件编码器或 OpenH264），代价是部分平台上的 H.264 导出兼容性受限。

### 10.3 字体、OpenCode 与第三方组件声明

随应用包含或打包的第三方资源许可证如下：

| 组件 | 许可证 | 来源与声明方式 |
| --- | --- | --- |
| **Noto Sans CJK SC** | SIL OFL 1.1 / Apache 2.0 | 位于前端静态资源 `public/fonts/`，附带完整 `LICENSE.txt` |
| **mediabunny** | MPL 2.0 | 未修改直接使用 npm 依赖，在 `NOTICE` 文件中声明源码地址 |
| **@xyflow/react** | MIT | 流程图画布组件，遵循 MIT 许可证声明 |
| **OpenCode** | Apache 2.0 / MIT | 内置代码生成与执行代理，携带上游版权声明 |

### 10.4 许可证在安装包与界面中的可达性

为确保最终用户与合规审计人员能直接在运行的应用中查阅第三方声明：

1. **macOS 原生关于面板**：`main.js` 调用 `app.setAboutPanelOptions`，包含版权所有者 ThinkFlowLab、主仓库链接与版本号；
2. **Windows / Linux 关于对话框**：在主菜单「帮助 → 关于 OpenDirector」中弹出模态框，直观显示版本号、运行环境诊断信息与日志目录快捷入口；
3. **F1 桌面指引中心（所有平台）**：在预加载层（Preload）渲染的 F1 帮助中心内，专门收录「**开源许可与第三方声明 / Licenses and third-party notices**」条目，向用户明确说明 Apache 2.0、GPL、SIL OFL 与 MPL 2.0 的边界与仓库内 `LICENSE`、`NOTICE` 的获取方式。

## 11. 双模式设计（简洁模式 vs 专业模式）

借鉴 Cursor（Composer/Agent 对话优先 vs IDE 编辑器全功能）与即梦（灵感生图 vs 专业画板）的设计哲学，OpenDirector 桌面版实现了**简洁模式**与**专业模式**的双模式工作流：

### 11.1 模式定位

| 模式 | 核心理念 | 界面表现 | 适用场景 |
| --- | --- | --- | --- |
| **简洁模式 (Simple / Agent Mode)** | 对话优先，提示词驱动生成，渐进式披露 | 默认自动展开并拓宽右侧 Agent 对话面板（`#canvas-assistant`），主视觉聚焦于创作对话；左侧轨道（`.cw-rail`）弱化收敛，画布保持清爽背景 | 初次上手、灵感发散、自然语言全流程编排、快速生成素材与粗剪 |
| **专业模式 (Pro / Studio Canvas)** | 细节微调，无限节点连接，精准参数调校 | 保留左侧完整工具栏（Text、Image、Video、Audio、Subject、Timeline），全屏无限画布节点连接，支持复杂的属性检查与精准时间线编排 | 专业视觉创作者、手动连线控制、精确关键帧调整、复杂分镜微调 |

### 11.2 模式切换与持久化

- **顶部悬浮切换胶囊 (`.od-mode-pill`)**：在画布顶部右侧无侵入注入双段式切换按钮 `[ ✦ 简洁模式 | ⚡ 专业模式 ]`，带高斯模糊与暗色主题；
- **键盘快捷键**：全局支持 `Command/Ctrl + M`，单键毫秒级无缝往返切换；
- **原生应用菜单**：主菜单「视图」中包含「切换工作区模式 (Ctrl/Cmd+M)」、「简洁模式 (Agent 对话)」与「专业模式 (全功能画布)」；
- **设置持久化**：用户选择的模式自动原子化写入 `desktop-settings.json` 的 `workspace.mode`（`"simple" | "pro"`），下次打开应用自动还原。

## 12. 创造模式（类比 DeepSeek Harness 自定义插件体系）

类比 DeepSeek Harness 与 OpenCode MCP 协议，桌面版引入“创造模式”，允许高阶用户与开发者创造自己的插件、自定义技能与自动化工作流：

### 12.1 插件存储与上游自动发现

- **统一插件目录**：位于应用数据目录下的 `~/.opendirector/skills/`（与上游 `opendirector.agent.skills` 自动发现机制路径无缝对齐）；
- **标准插件结构**：
  ```
  ~/.opendirector/skills/<plugin-name>/
  ├── skill.yaml (或 plugin.json)   # 插件元数据、输入参数 schema、执行引擎
  └── run.py (或 run.sh / index.js)  # 插件执行体或 MCP Server 入口
  ```
- **执行契约**：上游 OpenCode 引擎在启动时通过原生加载器自动扫描 `~/.opendirector/skills`，并在助手对话上下文（`@` 引用）中动态提供该工具调用。

### 12.2 桌面端能力与引导支持

- **一键直达**：主菜单「文件 → 打开自定义插件目录」与 F1 帮助中心「创造模式 (插件与技能)」均提供直达入口；
- **脚手架生成**：提供 `od:create-plugin-template` IPC 通道，可一键在插件目录下生成标准 `skill.yaml` 与 Python 样例代码；
- **安全隔离**：插件作为本地独立脚本由 Agent 框架调度运行，桌面壳严控渲染层 IPC，杜绝任意第三方代码在 Chromium 渲染进程执行。


