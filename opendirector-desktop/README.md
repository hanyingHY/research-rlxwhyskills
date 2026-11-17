# OpenDirector Desktop

与网页版**同一套创作画布**的桌面应用：自带本地服务、Agent 运行时与媒体工具，
双击安装即可使用，不需要终端、Python 或 FFmpeg。项目、素材和模型密钥只保存在本机。

- **功能一致**：桌面版加载上游同一份 Web 构建与 `/api`，不是精简版，也没有另写一套业务逻辑。
- **按系统分发**：Windows（NSIS）、macOS（DMG/ZIP，Apple silicon 与 Intel）、Linux（AppImage/deb/rpm，x64 与 arm64）。
- **渐进式引导**：首次欢迎页 → 3 分钟导览 → 按需提示 → F1 帮助中心，全部可跳过、可重播、可关闭。
- **自动更新**：macOS / Windows / Linux AppImage 使用 electron-updater + GitHub Releases，更新不打断任务。

```
┌─ Electron 主进程 ─────────────────────────────────────────────┐
│ 单实例 · 原生菜单 · 设置(JSON) · 自动更新 · 退出协调          │
│ 每次启动生成 256 bit token（只留在主进程）                     │
│ od://app  ← 代理 →  127.0.0.1:<OS 分配的随机端口>              │
│      │                    │                                   │
│  ┌───┴──────────┐   ┌─────┴──────────────┐                    │
│  │ 沙箱渲染进程 │   │ Python Host        │                    │
│  │ 上游 Web UI  │   │ FastAPI + OpenCode │                    │
│  │ preload:     │   │ + FFmpeg            │                   │
│  │ 窄 IPC + 引导│   └────────────────────┘                    │
│  └──────────────┘                                             │
└───────────────────────────────────────────────────────────────┘
```

## 下载与安装

发布页：`https://github.com/ThinkFlowLab/OpenDirector/releases/latest`
（下载页模板见 [`site/index.html`](site/index.html)，按系统识别并说明安装步骤。）

| 系统 | 架构 | 安装包 | 说明 |
| --- | --- | --- | --- |
| Windows 10/11 | x64 | `OpenDirector-<ver>-win-x64.exe` | 可选安装位置，卸载保留项目数据 |
| macOS 11+ | Apple silicon | `OpenDirector-<ver>-mac-arm64.dmg` | 拖入「应用程序」 |
| macOS 11+ | Intel | `OpenDirector-<ver>-mac-x64.dmg` | 同上 |
| Linux | x64 / arm64 | `.AppImage` / `.deb` / `.rpm` | AppImage 免安装且支持自动更新 |

首次启动：欢迎页说明数据位置 → 开始导览（工程、模型、助手、画布、导出）→ 进入画布。
未配置模型时会有一次提示指向设置；每条提示都能「不再显示」。按 `F1` 随时打开帮助中心，
按 `?` 打开画布快捷键。

## 桌面版做了什么（相对上游）

| 能力 | 实现 |
| --- | --- |
| 稳定来源 | 渲染进程加载 `od://app/`，主进程代理到随机端口，`localStorage`（主题、语言、草稿）跨启动保留 |
| 每次启动的凭据 | 256 bit token 只在主进程；Host 用纯 ASGI 中间件校验；渲染进程、URL、日志、cookie 都拿不到 |
| Host 生命周期 | `python host_entry.py --port 0`，stdout 控制通道 `ready/fatal/shutdown-complete`，SIGTERM → SIGKILL 兜底 |
| 进程安全 | 单实例锁；`contextIsolation` + `sandbox` + 禁用 Node；同一 origin 的弹窗继承沙箱，其余交给系统浏览器 |
| 任务感知退出 | 退出前查 `/api/desktop/status`，说明会中断什么；远端生成任务不被取消 |
| 数据分离 | 程序资源只读；项目/素材默认 `~/.opendirector`（与 CLI 共享）；日志、session、缓存放应用数据目录 |
| 桌面设置 | `desktop-settings.json`：引导进度、提示偏好、窗口位置、数据目录、更新通道；原子写入并逐字段校验 |
| 引导层 | preload 内的 Shadow DOM 界面：欢迎页、锚定导览、渐进提示、帮助中心、诊断复制；中英双语 |
| 更新 | electron-updater + GitHub Releases（也支持 `UPDATE_FEED_URL` 自定义 feed）；Linux 仅 AppImage |
| 分发 | 三平台构建矩阵，按 `os-arch` 组装运行时，产物名带版本/系统/架构，附带 `latest*.yml` 更新元数据 |

## 使用指引的设计

| 时机 | 界面 | 行为 |
| --- | --- | --- |
| 第一次启动 | 欢迎页 | 说明数据位置与本机特性；可选「开始」或「直接进入」；语言可当场切换 |
| 完成欢迎 | 导览（7 步，模型已配置则 6 步） | 高亮真实控件（工程标题、设置、助手按钮、工具栏、导出区），`Esc` 跳过，`←/→/Enter` 导航 |
| 之后 | 单张提示 | 仅在条件成立时出现一次：未配置模型、空画布、首次打开助手/时间线；可「知道了 / 不再显示」 |
| 任何时候 | `F1` 帮助中心 | 搜索、桌面能力、常见问题、复制诊断、打开数据/日志、重播导览、重置提示 |
| 系统菜单 | 帮助菜单 | 使用指引、重播引导、快捷键、检查更新、关于 |

引导状态写入 `desktop-settings.json`（`onboarding` / `tips`），因此升级、重启、切换语言都不会重复打扰。
所有锚点都是上游已发布的类名（`.cw-topbar`、`.cw-rail`、`.cw-chat-button`、`#canvas-assistant` 等）；
找不到锚点时卡片自动居中，不会因为上游改版而卡住。语言跟随 `<html data-locale>`，在应用内切换语言后引导同步切换。

## 从源码运行

```sh
cd opendirector-desktop
npm ci
npm run build:preload        # 生成 dist/preload.cjs（引导层 + IPC 桥）
```

需要一个可用的 Host。两种方式：

```sh
# A. 指向已有的 OpenDirector 源码 + venv
OPENDIRECTOR_PYTHON=/path/to/.venv/bin/python \
OPENDIRECTOR_PYTHONPATH=/path/to/OpenDirector/packages/core/src:/path/to/OpenDirector/apps/api/src \
OPENDIRECTOR_ROOT=/tmp/od-data \
npm start

# B. 组装完整运行时（与发布包一致）
node scripts/fetch-python.mjs  --target linux-x64
node scripts/fetch-ffmpeg.mjs  --target linux-x64
python -m pip wheel /path/to/OpenDirector -w runtime/wheels
node scripts/prepare-runtime.mjs --target linux-x64
node scripts/verify-runtime.mjs --runtime runtime/dist/linux-x64
npm start
```

`npm start` 需要图形会话（Linux 可用 `xvfb-run`）。纯逻辑与引导层的测试不需要 Electron：

```sh
npm test                                        # 54 个测试：生命周期、鉴权、代理、设置、更新、引导、渲染
node --test tests/render.test.mjs               # 其中引导界面用 jsdom 真实渲染
```

## 构建与发布

```sh
npm run build:preload
npm run dist:linux        # 或 dist:win / dist:mac；需先准备 runtime/dist/<os>-<arch>
```

完整的按系统发布由 [`.github/workflows/desktop-release.yml`](../.github/workflows/desktop-release.yml) 完成：

1. 校验 tag 与 `package.json` 版本一致，跑契约测试；
2. 每个系统/架构各自 checkout 上游源码，`npm ci` + `pip wheel` 得到该平台的 wheel 集；
3. `fetch-python` / `fetch-ffmpeg` / `prepare-runtime` 组装 `runtime/dist/<os>-<arch>`；
4. `electron-builder --publish always` 上传安装包与 `latest*.yml` 到 GitHub Release；
5. 最后一个 job 把 draft release 转正（`--latest`），下载页与自动更新立即生效。

```sh
git tag v0.1.4 && git push origin v0.1.4      # 版本必须与 package.json 相同
```

> 桌面版本号刻意与内置 OpenDirector 版本保持一致（RFC 决策 7）。升级上游时，同时改
> `package.json` 与本目录版本，再打新 tag。

### 签名、公证与许可证

- 默认构建**不签名**：可以安装运行，但 macOS/Windows 会提示一次，且自动更新需要签名校验
  （未签名版本请手动下载新包）。在仓库 secrets 里配置 `CSC_LINK`、`CSC_KEY_PASSWORD`、
  `APPLE_ID` 等即可让 electron-builder 走签名流程。
- FFmpeg 使用 libx264（GPL）构建，随包分发需遵守 GPL；介意的发行版可换成 LGPL 构建，
  但 MP4/H.264 导出能力会受影响。许可证文本随安装包分发；客户端通过独立子进程命令行调用以保持架构隔离。
- 第三方组件（Noto Sans 字体 SIL OFL、mediabunny MPL-2.0、OpenCode 与前端依赖）均在源码 `NOTICE`
  完整声明，并在桌面端主菜单「关于」及 F1 帮助中心「开源许可与第三方声明」中直接可查阅（详见 [`docs/06-desktop-product.md`](docs/06-desktop-product.md) §10）。
- Linux 自动更新只支持 AppImage；deb/rpm 用户会看到「请下载新安装包」的提示。

## 数据位置

| 内容 | 路径 |
| --- | --- |
| 项目、素材、模型配置 | `~/.opendirector`（可用「文件 → 更改项目数据目录」修改，与 CLI 共享） |
| 桌面设置（引导进度、窗口、更新通道） | Windows `%APPDATA%/OpenDirector/desktop-settings.json`；macOS `~/Library/Application Support/OpenDirector/`；Linux `~/.config/OpenDirector/` |
| 日志 | 同上目录下的 `logs/desktop.log`、`logs/host.log` |
| Chromium session / 缓存 | 同上目录下的 `session/`、`cache/` |

卸载不会删除项目数据；`logs/` 与 `desktop-settings.json` 可安全删除以重置引导。

## 本机验证（Linux x86_64）

```
npm test                              56/56 通过（含 9 个 jsdom 引导界面、双模式切换与创造模式测试）
node scripts/build-preload.mjs        dist/preload.cjs 66 KiB
node scripts/verify-runtime.mjs       PASS dynamic port, token, health, status, graceful shutdown
```

未覆盖：Electron 图形界面与安装包（本环境无显示器/无 Electron 二进制）、真实 WebCodecs
MP4 导出、macOS/Windows 安装体验、签名与自动更新的端到端升级。发布前请在一台干净机器上跑
[RFC 验收清单](#验收对照)。

## 验收对照（RFC #362 与扩展特性）

| 验收项 | 状态 | 实现/缺口 |
| --- | --- | --- |
| 干净环境安装 → 建工程 → Agent → 编辑 → 导出 → 重开 | 代码就绪 | 需在带显示器的真机跑通并记录 |
| 双模式设计（简洁模式 vs 专业模式） | 已实现 | Cursor/即梦式双模式；简洁模式放大 Agent 对话框，专业模式保留全功能画布，顶部胶囊与 Ctrl/Cmd+M 无缝切换 |
| 创造模式（自定义插件与 DeepSeek Harness） | 已实现 | 插件存放于 `~/.opendirector/skills`，提供一键打开目录、脚手架生成与 F1 指引中心集成 |
| 更新与卸载不丢数据 | 已实现 | 数据在 `~/.opendirector`，NSIS `deleteAppDataOnUninstall: false` |
| 中英双语 | 已实现 | 界面跟随上游；引导/帮助中心自带双语并跟随切换 |
| 声明系统/架构/格式 | 已实现 | 下载页 + 产物命名 + 本文档矩阵 |
| 自动更新 | 已实现 | electron-updater；需签名后才能验证升级链路 |
| 渐进式指引 | 已实现 | 欢迎页、导览、提示、帮助中心、菜单入口 |

## 文档

| 文档 | 内容 |
| --- | --- |
| [`docs/01-project-analysis.md`](docs/01-project-analysis.md) | 上游项目分析（阶段一） |
| [`docs/02-issue-362-assessment.md`](docs/02-issue-362-assessment.md) | 对 RFC #362 的判断与 8 个待决问题 |
| [`docs/03-baseline-design.md`](docs/03-baseline-design.md) | 桌面壳设计：协议、认证、代理、退出、打包 |
| [`docs/04-verification.md`](docs/04-verification.md) | 本机验证记录与未覆盖项 |
| [`docs/05-issue-comment-draft.md`](docs/05-issue-comment-draft.md) | 可直接贴到 issue 的评论草稿 |
| [`docs/06-desktop-product.md`](docs/06-desktop-product.md) | 产品化细节：引导状态机、设置模型、更新与发布 |

## 边界

- 未修改上游任何业务代码；Host 包装层（`runtime/host_entry.py`）是独立文件，正式实现仍应落到
  `apps/api/` 并由上游测试覆盖。
- 退出检查目前只能看到工具任务；Agent 轮次与生成任务需要上游补接口（`notExposed` 字段已如实上报）。
- 上游改类名会影响导览锚点；已做「找不到就居中」降级，但建议上游给关键控件加 `data-*` 稳定标记。
