# 桌面端应用（D1）——设计与验收

[English](desktop-application.md) | 简体中文

路线图：[D1 · 桌面端应用](https://github.com/ThinkFlowLab/OpenDirector/issues/363) ·
父 issue：[RFC #362](https://github.com/ThinkFlowLab/OpenDirector/issues/362)。
外壳/Host 生命周期参考：[DeepSeek Harness Desktop](https://github.com/deepseek-ai/deepseek-harness/tree/39163dd30f703a79079e2d2446545cff3c453738/apps/desktop)。

## 1. 原则：做宿主，不做第二套实现

OpenDirector 已有完整的网页工作区与本地服务，桌面端是套在两者之外的 Electron 外壳：

```
BrowserWindow  ──加载──►  http://127.0.0.1:<port>/
                              │
                              ├── /            ← 构建好的工作区（index.html）
                              ├── /assets      ← 与浏览器相同的 JS/CSS
                              ├── /fonts       ← 内置时间线字体
                              └── /api/...     ← 本地服务（FastAPI + uvicorn）
```

渲染进程通过 HTTP 加载服务端提供的产物，而不是加载一份拷贝，因此“体验一致”是结构性保证，
而不是需要持续维护的承诺：

- 客户端路由（`/ai-canvas/<id>`、`/ai-tool/<id>`、`?traceProject=`）由服务的通配路由提供，
  深链与刷新的行为与浏览器一致；
- 页面的语言、主题、最近项目与布局保存在所属源的存储中，所以外壳会尽量保持端口稳定；
- WebGL（three.js）、WebCodecs 与 MediaRecorder 由 Chromium 提供，Electron 的 Chromium
  自带 MP4 导出所需的专有编解码器（H.264/AAC）。

## 2. 后端生命周期

`src/main/backend/session.ts` 管理一次完整的生命周期，这些阶段同时也是启动窗口显示的文案：

| 阶段 | 工作 |
| --- | --- |
| `resolving-runtime` | 选择解释器：`OPENDIRECTOR_PYTHON` → 内置 → 已创建的虚拟环境 → 源码目录 → 系统 |
| `provisioning-environment` | 仅当任何地方都没有 OpenDirector 时：在用户数据目录创建虚拟环境并安装（优先内置 wheel，其次包索引） |
| `reserving-port` | 优先上次使用的端口，其次往后 49 个，最后用系统临时端口 |
| `starting-backend` | `python -m opendirector_api.server --port <port>`，环境见下表 |
| `waiting-for-backend` | 带 `X-OpenDirector-Request: 1` 轮询 `/api/health`，再确认 `/` 返回 `id="root"` 页面 |
| `opening-window` | 在应用窗口中加载工作区地址 |

传给后端的环境变量：

| 变量 | 取值 | 原因 |
| --- | --- | --- |
| `OPENDIRECTOR_ROOT` | 用户数据目录 | 项目与凭据绝不放在安装目录 |
| `OPENDIRECTOR_API_URL` | 选定的回环地址 | 与 CLI 保持同样的约定 |
| `OPENDIRECTOR_LANGUAGE` | 外壳语言 | 后端回执使用用户语言 |
| `PATH` | `resources/bin` 在最前 | 优先使用内置的 `ffmpeg`/`ffprobe` |
| `PYTHONUTF8`、`PYTHONIOENCODING` | `1`、`utf-8` | 中文 Windows 上日志仍然可读 |
| `NO_PROXY` | 含 `127.0.0.1`、`localhost` | 系统代理不能拦截回环请求 |

外壳同时给 Chromium 传 `--proxy-bypass-list`，原因相同。

关闭时先优雅终止（Windows 用 `taskkill /PID /T`，POSIX 用 `SIGTERM`），四秒宽限期后强杀。
POSIX 下子进程独占进程组，uvicorn 的子进程也会被一起终止。

## 3. 失败处理

所有失败都会落到本地化窗口：失败阶段、原因、处理建议、日志尾部与四个操作按钮。
原因由后端输出自动分类：

| 代码 | 触发条件 |
| --- | --- |
| `runtime_missing` | 没有 Python 3.11+、缺少 `opendirector_api`、解释器无法执行 |
| `runtime_version` | 解释器低于 3.11 |
| `provision_failed` | `python -m venv` 或 `pip install` 失败 |
| `port_unavailable` | 绑定失败 / `EADDRINUSE` / WinError 10048 |
| `dependency_missing` | 依赖 `ModuleNotFoundError`，或缺少 FFmpeg |
| `web_resources_missing` | `/` 没有返回构建好的页面 |
| `backend_timeout` | 超时仍未就绪 |
| `backend_exited` | 进程退出但原因不明 |
| `renderer_failed` | 页面无法加载，或运行中服务消失 |

日志同步写入 `%APPDATA%\OpenDirector\logs`（滚动保留 5 个文件），崩溃后也留有最后几行。

## 4. 安全边界

- 渲染进程：`sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`。
- 页面只能调用六个经过校验的 IPC 处理器（`info`、`openPath`、`restartBackend`、`getLocale`、
  `setLocale`、`onStatus`）。`openPath` 只接受 `data`、`logs`、`resources`；页面不能传路径、
  命令或任意数据。
- 导航仅限回环源；其他地址一律用 `shell.openExternal` 在默认浏览器打开，且仅限 `http`/`https`。
- 任务监控只读取请求 URL 与时间，不读取请求体，因此不会看到提示词和模型凭据。
- 内置运行环境是只读的应用代码：安装依赖只写入用户数据目录，不写 `resources/python-runtime`。

## 5. 后台任务的验收行为

导出与生成由客户端驱动，因此外壳用“回环请求是否在途”判断是否有工作在进行：超过五秒仍未结束的
请求，或指向 tool-task、时间线包、commit、upload 接口的请求，都算进行中。此时关闭窗口会先用
用户语言确认；确认退出后才会停止服务。

## 6. 本次已完成的验证

`apps/desktop` 下 `npm test`（60 项检查）覆盖：运行环境选择顺序与版本门槛、端口稳定性、
就绪探测（成功、超时、进程退出、请求头）、首页校验、失败分类、中英文文案一致性、
数据与安装目录隔离、配置健壮性、退出保护，以及在桩 Electron API 上驱动真实 Python 子进程
完成的启动/关闭全流程。

本环境（需要 Windows 主机、显示环境，以及访问 python.org / gyan.dev 的网络）尚未验证：
安装包实际运行、真实 Electron 窗口行为、代码签名、以及干净机器上的完整走查。
这些都列在 [windows-distribution.zh-CN.md](windows-distribution.zh-CN.md) 的发布门禁中。
