# 基线实现说明

本目录的代码是 **D1（#363）的可运行骨架**：它不修改 OpenDirector 业务代码，用一层
Host 包装 + 一个 Electron 壳把现有 Web UI 与 Python 服务装进桌面应用。目标是先把
“生命周期、凭据、origin、数据、退出、打包”这些最容易返工的部分固定下来。

## 1. 文件地图

```
opendirector-desktop/
├── src/
│   ├── main.js          Electron 主进程：单实例、协议注册、Host 启动、退出流程、菜单
│   ├── host.js          Host 子进程管理（纯 Node，可单测）：启动/健康/状态/停止/强杀
│   ├── protocol.js      od://app 代理（纯函数，可单测）：头部注入、Origin 改写、流式转发
│   ├── auth.js          token 生成、比较、日志脱敏
│   ├── config.js        资源/数据/日志路径解析与 Host 环境
│   ├── window.js        窗口 webPreferences、权限、下载
│   ├── ipc.js           窄 IPC 白名单与发送方校验
│   ├── menu.js          中英双语原生菜单
│   ├── localPages.js    启动页/错误页（不依赖后端）
│   └── preload.cjs      sandbox preload，只暴露 contextBridge API
├── runtime/
│   ├── host_entry.py    桌面 Host：动态端口、token、控制通道、状态、优雅退出
│   └── README.md        runtime 载荷布局与上游落地建议
├── scripts/
│   ├── prepare-runtime.mjs   CPython + wheels + FFmpeg + OpenCode → 单平台 runtime
│   └── verify-runtime.mjs    在目标机真实启动 Host 并验收
├── tests/               25 个 Node 测试 + 假 Host 夹具
├── electron-builder.yml 平台打包配置
└── build/entitlements.mac.plist
```

## 2. Host 控制协议（建议上游采纳）

stdout 每行一个 JSON，前缀 `@@OPENDIRECTOR@@ `；uvicorn 日志走 stderr，二者不混：

```json
{"type":"ready","port":52151,"pid":2307,"version":"0.1.4"}
{"type":"fatal","message":"...","detail":"..."}
{"type":"status","pid":2307,"inFlight":2}
{"type":"shutdown-complete","port":52151,"socketClosed":true}
```

stdin：

```json
{"type":"shutdown"}
{"type":"status"}
```

设计理由：

- **不解析日志**：日志格式一变就坏；JSONL 可以单测。
- **先绑定后报告**：`socket.bind(("127.0.0.1", 0))` 拿到真实端口再交给 uvicorn，
  避免“先选端口再启动”之间的竞争。
- **stdin EOF 即退出**：Electron 崩溃时管道关闭，Host 不会变成占着项目锁的孤儿进程。
- **`shutdown-complete` 先于进程退出**：壳可以区分“优雅完成”与“超时强杀”。

## 3. 认证与代理

```
渲染进程 (od://app)
   │  fetch("/api/...") / <img> / <video> / 下载
   ▼
主进程 protocol.handle("od")
   │  去掉 cookie/origin/referer/authorization/accept-encoding
   │  Origin := http://127.0.0.1:<port>
   │  Authorization := Bearer <token>
   │  X-OpenDirector-Request: 1
   ▼
127.0.0.1:<port>  (Python Host)
   │  DesktopAuth（纯 ASGI）：/api/* 必须匹配 Bearer
   ▼
FastAPI 现有中间件：hostname / Origin / X-OpenDirector-Request
```

为什么不在渲染进程里保存 token：

- XSS 或第三方脚本一旦能读 token，就能长期调用本机 API；
- token 进入 URL 会落进历史、日志、崩溃报告；
- Cookie 按域名而不是端口隔离，`127.0.0.1` 的 cookie 会被同机其他服务收到。

为什么用 `od://app` 而不是 `http://127.0.0.1:<port>`：

- 同一 origin 跨启动稳定（主题/语言/草稿/锁）；
- 不产生 localhost cookie；
- 渲染进程无法直接访问任意本机端口，只能访问代理白名单。

代理细节：

| 场景 | 处理 |
| --- | --- |
| SSE / 长回复 | `net.fetch` 返回流，原样交给 Chromium，不缓冲 |
| 视频 Range | 透传 `Range`，返回 206 与 `Content-Range` |
| 下载 | 保留 `Content-Disposition`，通过 `will-download` 弹保存对话框 |
| 302 | `Location` 改写成 `od://app/...`，避免跳出 origin |
| Set-Cookie | 丢弃 |
| 压缩 | 请求去掉 `Accept-Encoding`，响应去掉 `Content-Encoding`，保证字节一致 |
| CSP | 生产环境给 HTML 加 CSP；开发模式（Vite）不加，保留 HMR |

已知需要真机验证的点：Electron `net.fetch` 对 `duplex: "half"` 的接受程度、
Chromium 对自定义协议流式响应/下载命名的行为、`od://app` 下 Web Locks 与
`crypto.randomUUID` 的可用性（`secure: true` + `standard: true` 应当满足）。

## 4. 目录与数据归属

```
<userData>/                       平台应用数据（macOS: ~/Library/Application Support/OpenDirector）
├── logs/desktop.log              壳日志，4 MB 轮转
├── logs/host.log                 （建议）Host 日志，正式实现由 Host 自己写
├── session/                      Chromium sessionData（缓存/Cookie/LocalStorage）
└── cache/

<resources>/runtime/              只读，安装包内
├── python/                       CPython
├── site-packages/                opendirector + 依赖
├── bin/ffmpeg, ffprobe, opencode
└── host_entry.py

~/.opendirector/                  项目数据（与 wheel CLI 共享）
├── projects/
└── .opendirector/
```

原则：

- 程序资源只读，更新时整体替换；
- 项目数据独立，更新/卸载默认不动；
- 日志与缓存可删，便于排障；
- 凭据（模型 API Key）仍在 `.opendirector/models.json`（0600），**尚未接系统钥匙串**，
  这是 D1 应该评估的后续项。

## 5. 退出流程

```
用户关闭窗口 / Cmd+Q / 菜单退出
        │ (macOS: 关闭窗口 = 隐藏；Cmd+Q = 退出)
        ▼
GET /api/desktop/status
        │  busy? → 对话框说明会中断什么（助手回复/工具任务/导出），远端任务不取消
        ▼
stdin {"type":"shutdown"}
        │  等 shutdown-complete（15 s）
        ▼
SIGTERM（进程组） → 5 s → SIGKILL
        ▼
app.exit()
```

- `backgroundThrottling: false`：窗口失焦时导出/预览不被节流；但**关闭窗口仍会中断导出**，
  对话框必须说清楚。
- 崩溃恢复：Host 意外退出时弹“重启服务 / 查看日志 / 退出”，重启后重新加载页面。
- `process.on("exit")` 里同步 `killNow()` 作为最后兜底（Windows 上 `taskkill` 是异步的，
  这一项在 Windows 仍需真机验证）。

## 6. 安全基线

- `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`、`webviewTag: false`；
- 只允许 `od://app` 导航；`window.open` 一律拒绝，https 链接交给系统浏览器；
- 权限请求默认拒绝，只允许 `clipboard-sanitized-write`；
- IPC 只接受主窗口主 frame，且参数不由渲染进程指定路径；
- 下载必须经过保存对话框；
- 日志统一脱敏（token、可扩展为 API Key）。

## 7. 打包与运行时装配

`prepare-runtime.mjs`：

1. 复制 CPython（python-build-standalone 目录）到 `runtime/dist/<target>/python`；
2. `pip install --no-index --find-links <wheels> --target site-packages opendirector`；
3. 复制 `ffmpeg`/`ffprobe` 与 wheel 内置的 OpenCode 到 `bin/`；
4. 复制 `host_entry.py`；
5. 写 `manifest.json`（Python/OpenDirector/FFmpeg 版本、bin 文件大小、文件数）；
6. 立刻用该解释器 import `opendirector` 与 `opendirector_api`，失败即退出。

`verify-runtime.mjs`：真实启动 Host → 健康检查 → 无 token 必须 401 → 状态接口 →
优雅退出。这一条对应 #363 的“dependency files alone do not establish a working
installation”。

`electron-builder.yml`：`extraResources: runtime/dist/${os}-${arch} → resources/runtime`；
macOS 出 dmg+zip（zip 用于更新），Windows NSIS，Linux AppImage/deb/rpm。
签名与公证不在基线范围。

## 8. 正式落地到上游时怎么改

基线把 Host 包装和壳分开，是为了**不阻塞上游评审**。正式实现建议：

| 基线位置 | 上游位置 | 说明 |
| --- | --- | --- |
| `runtime/host_entry.py` | `apps/api/src/opendirector_api/desktop.py` + `cli.py desktop` | 作为正式入口，纳入 pytest |
| Host 控制协议 | `docs/architecture/desktop-host.md` | 先写契约再并行平台 |
| `/api/desktop/status` | `main.py` 内 `create_app` | 需要访问 `agent.active`、`tool_tasks`、`jobs` |
| token 中间件 | `apps/api/.../main.py` 或 `desktop.py` | 仅在 `OPENDIRECTOR_DESKTOP=1` 时启用，CLI 行为不变 |
| `od://app` 代理 | `apps/desktop/src/protocol.*` | 成为独立 workspace 包，纳入 lint/typecheck |
| 退出状态 | 渲染器 → preload → 主进程 | 导出/后台任务由渲染器上报，Host 不猜 |

上游改动原则：

- 不改变 `opendirector serve` 的现有行为（固定端口、无 token），避免影响 CLI 用户；
- 桌面模式通过环境变量/参数显式开启；
- 新接口要有 Python 测试（启动失败、401、优雅退出、状态 JSON）；
- 前端只加“桌面桥存在时”的可选能力（打开目录、导出上报），Web 端不受影响。

## 9. 基线没做的事

- 没有托盘图标、Dock 菜单、最近项目、文件关联；
- 没有自动更新、签名、公证、崩溃上报；
- 只有同源 `_blank` 链接会开一个同样沙箱化的子窗口（用于助手轨迹），没有按项目多窗口；
- 没有把 Agent 轮次/生成任务/导出纳入状态；
- 没有把模型 Key 迁到系统钥匙串；
- 没有真正跑过 Electron GUI（本环境无显示器）。

这些是 D1 的后续工作，不是基线遗漏。
