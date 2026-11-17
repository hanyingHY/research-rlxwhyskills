# OpenDirector 桌面端外壳

[English](README.md) | 简体中文 · 上游 issue：[desktop RFC #362](https://github.com/ThinkFlowLab/OpenDirector/issues/362) · Windows 分发：[D3](https://github.com/ThinkFlowLab/OpenDirector/issues/365)

OpenDirector 的 Windows 安装包客户端。它是**宿主**，不是第二套实现：启动同一个本地服务
（`python -m opendirector_api.server`），等服务真正提供前端产物后，用原生窗口打开这个页面。
用户无需安装 Python、Node.js 或 FFmpeg，就能获得与浏览器中完全一致的画布、时间线、编辑面板、
预设与导出能力。

```
┌─ OpenDirector.exe（Electron 外壳）──────────────────────┐
│  启动窗口 → 本地服务（内置 Python）→ 创作画布           │
│  http://127.0.0.1:<port>/  （同一份 HTML/JS/CSS 产物）  │
└──────────────────────────────────────────────────────────┘
```

## 外壳新增的能力

| 能力 | 为什么不能放在网页里 |
| --- | --- |
| 内置 Python 运行环境与首次安装 | 安装运行环境是原生操作 |
| 分阶段显示进度的启动窗口 | 服务未就绪时页面还不存在 |
| 双语失败窗口（重试 / 日志 / 复制诊断信息 / 指南） | 空白标签页无法解释服务已死 |
| 优雅关闭本地服务及其子进程 | 关闭标签页无法终止已派生的进程 |
| 生成或导出进行中时的退出保护 | 窗口关闭会丢掉正在进行的请求 |
| 导出的原生保存对话框、外链用默认浏览器打开、窗口状态、缩放 | 浏览器自身的行为 |
| 单实例锁、任务栏标识、窗口状态持久化 | 操作系统集成 |

## 保持不变的部分

页面与浏览器加载的是同一份产物。客户端路由（`/ai-canvas/<id>`、`/ai-tool/<id>`）、项目存储、
模型凭据、Agent 运行、生成回执和导出行为，均与
[OpenDirector 使用指南](https://github.com/ThinkFlowLab/OpenDirector/blob/main/docs/guides/user-guide.md)
一致。外壳不会改写 API 流量，只补充本地服务要求的 `X-OpenDirector-Request` 请求头。

## 数据存放位置

| 路径 | 内容 | 是否保留 |
| --- | --- | --- |
| `%APPDATA%\OpenDirector\data` | 项目、素材、模型凭据、缓存 | 升级**和卸载**都保留 |
| `%APPDATA%\OpenDirector\logs` | `desktop-*.log`、`backend-*.log`（滚动保留 5 个） | 升级和卸载保留 |
| `%APPDATA%\OpenDirector\config.json` | 窗口大小位置、缩放、界面语言、上次端口 | 升级和卸载保留 |
| `<安装目录>\resources\python-runtime` | 内置 Python 与 OpenDirector | 升级时替换 |
| `<安装目录>\resources\bin` | `ffmpeg.exe`、`ffprobe.exe` | 升级时替换 |

用户数据绝不写入安装目录，这是“安装 → 升级 → 卸载”不会破坏项目的原因。`OPENDIRECTOR_ROOT`
仍然可以覆盖数据目录，行为与 CLI 完全一致。

## 从源码运行

要求：Node.js 22.12+、Python 3.11+，以及已执行 `pip install -e .` 的 OpenDirector 源码目录
（或设置 `OPENDIRECTOR_PYTHON`）。

```sh
cd apps/desktop
npm ci
npm start
```

可用环境变量：

| 变量 | 作用 |
| --- | --- |
| `OPENDIRECTOR_PYTHON` | 运行后端的解释器，优先级最高 |
| `OPENDIRECTOR_DESKTOP_SOURCE_ROOT` | 从源码目录运行（按 `opendirector dev` 的方式设置 `PYTHONPATH`） |
| `OPENDIRECTOR_ROOT` | 项目与凭据目录（默认为用户数据目录） |
| `OPENDIRECTOR_PIP_INDEX_URL` | 创建虚拟环境时使用的包索引 |

若既没有内置运行环境、也没有装好 OpenDirector 的解释器，外壳会在用户数据目录下创建虚拟环境
并自动安装，同时在启动窗口中显示进度。

## 构建 Windows 安装包

```powershell
cd apps/desktop
powershell -ExecutionPolicy Bypass -File scripts\windows\build-installer.ps1 -SourceRoot ..\..
```

产物位于 `release/`：

- `OpenDirector-<version>-x64.exe` —— NSIS 安装包（默认按用户安装，安装界面支持中英文，无需提权）；
- `OpenDirector-<version>-x64-portable.exe` —— 免安装单文件版；
- `OpenDirector-<version>-x64.zip` —— 便于集中分发的压缩包。

设置 `CSC_LINK`（PFX 路径或 base64）与 `CSC_KEY_PASSWORD` 即可签名；未设置时只产出未签名产物。
完整流程（含离线 wheel 方案与发布检查清单）见
[docs/desktop/windows-distribution.zh-CN.md](../../docs/desktop/windows-distribution.zh-CN.md)。

各阶段也可单独执行：

```powershell
scripts\windows\prepare-python-runtime.ps1   # 内置 Python + OpenDirector
scripts\windows\fetch-ffmpeg.ps1             # 带 libx264 的 ffmpeg/ffprobe
scripts\windows\make-icon.ps1                # 从 logo 生成 build/icon.ico
scripts\windows\verify-package.ps1           # 检查 release\win-unpacked
node scripts\build-windows.mjs --dir         # 只做打包检查，不生成安装包
```

## 测试

```sh
npm test          # tsc + node --test（共 60 项检查）
npm run typecheck
```

覆盖内容：运行环境选择、端口稳定性、就绪探测、失败分类、数据与安装目录隔离、退出保护，
以及在桩 Electron API 与真实 Python 子进程之上的完整启动流程。

## 已知缺口

- **自动更新（D5）未接入**：`publish` 关闭，尚未内置更新器，安装包目前是独立的。
- **macOS（D2）与 Linux（D4）** 在 `electron-builder.yml` 中故意留空；运行环境与关闭逻辑本身是跨平台的。
- **仅 x64**：Windows ARM64 需要对应的嵌入式 Python 构建，尚未验证。
- **签名**取决于发布者的证书，详见分发文档。
