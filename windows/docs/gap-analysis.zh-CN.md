# OpenDirector Windows 桌面端：功能全景与体验一致性差距分析

> 内部决策文档。不属于分发包内容（`build.py` 的 `REQUIRED` 未收录本文件）。
> 研究基准：`ThinkFlowLab/OpenDirector` @ `4360d9e`（v0.1.4 之后的主干）。
> 本文所有"实测"结论均在本次会话中执行过，命令与输出见各条目。

---

## 0. 结论先行

**没有做到"完全一致的体验"。** 当前 Windows 包在**干净机器上根本装不上**，不是"体验有差距"，而是"跑不起来"。

四个阻断级（P0）缺陷，任意一个都足以让首次安装失败：

| # | 缺陷 | 后果 |
| --- | --- | --- |
| P0-1 | 装的是 `pip install opendirector`，而上游**从未发布到 PyPI**，GitHub Releases **五个版本全是 0 个附件** | 首次安装 100% 失败 |
| P0-2 | 运行时用的是 CPython **embeddable** 包，它**不含 `venv` / `ensurepip`** 模块，而 launcher 第一条命令就是 `python -m venv` | 首次安装 100% 失败（在 P0-1 之前触发） |
| P0-3 | 健康检查用默认 `urllib` opener，**不绕过系统代理**；Windows 注册表里的代理设置会让本机回环请求被送去代理 | 已配代理的机器启动必超时 |
| P0-4 | 内置 Agent（Default 引擎）依赖 `opencode.exe`（205 MB 二进制），只有上游 wheel 才有；源码模式拿到的是 stub | AI 对话功能不可用 |

原因是结构性的：**上游目前没有可分发的产物**。它唯一的官方安装方式是 `git clone` 源码 + Node.js 24.22.1+ + `npm ci` 构建（约 2 GB 下载）。我做的这个包是一个"引导安装器"，但它引导下载的那个东西并不存在。

这是我上一轮验证方法的漏洞：沙箱里的"验证通过"全部走了 `--source /tmp/opendirector`，**绕开了真实安装路径**。真实路径的实测结果见 §4.1。

---

## 1. 上游功能全景

先回答"全部所有功能"到底有多少。代码结构上，OpenDirector 是一个三层单体：

- `packages/core/src/opendirector/` — 1 个 CLI + 7 个架构分层（domain / application / ports / infrastructure / integrations / agent / media），**约 80 个 Python 模块**
- `apps/api/src/opendirector_api/` — FastAPI，**88 条 REST 路由 + WebSocket 订阅 + SSE 流**
- `src/` — React 19 + Vite 前端，`src/canvas/` 下 **247 个组件**，**3702 条双语 i18n 消息**

按用户可感知的能力域拆成 13 类：

### 1.1 工程管理
多工程并存、新建 / 重命名 / 删除到回收站 / 恢复、存储占用统计（`GET /creation/storage`）、孤儿清理（`POST /creation/projects/cleanup`）、多窗口租约（`project lease`，重开标签页会重新抢租约，其他窗口会被明确提示冲突）。

### 1.2 画布（Canvas）
无限画布：节点、连线（含唯一源连接持久化到时间线）、分组、框选、缩放、右键菜单、搜索面板、节点版本历史与回滚、节点信息面板、素材缩略图、参考目录（`reference-catalog`）、画布归档（`.canvas`）导入导出。

### 1.3 AI 助手（Assistant）
多会话、流式输出、完整 trace（可 `/?trace=…` 在新标签查看输入与工具调用）、引用（citations）、`@` 引用画布素材、技能（skills）、工具调用、停止 / 重试、模型选择。
**六种 Agent 引擎**：`Default`（内置，走设置里的模型）、`OpenCode`、`JiuwenSwarm`、`DeepSeek Harness`、`Codex`、`Claude Code`。后五种是外部 harness，需要用户自己装 CLI 并登录；`Default` 依赖随包分发的 `opencode.exe`。

### 1.4 模型连接
多家 provider 预设（Atlas Cloud、北京 Qwen、MiniMax、Kling、智谱、vLLM-Omni、FastH3、火山引擎等）、单服务多模型、批量写入（`/model-configs/batch`）、模型发现（`/model-configs/discover`）、连通性测试（`/model-configs/test-agent`）、能力探测（`/model-configs/capabilities`）、**每个服务独立的高级连接设置：直连 / 走系统代理**（README 专门写了一段：代理导致生图超时时改成 Direct）。

### 1.5 生成（Generation）
文生图、图生图、文生视频、首帧生视频、语音合成；参考图管理（增 / 改 / 恢复 / 删）；生成规格（`generation-spec`）；结果采纳（`result`）；任务队列：提交、轮询、等待、取消、断线恢复、进程死亡后重新认领。

### 1.6 图片预设（Presets）
角色三视图、面部三视图、产品三视图、故事板、多机位。三视图各出一张参考表；故事板与多机位各出 **4 张独立图片**（横版），并保留与源素材的连接。

### 1.7 媒体编辑
图片编辑器（裁剪、调色、图层板）、视频编辑器（裁切、拼接、变速、音量）、时间线可编辑文本（字幕）。
**22 个本地/AI 工具**（实测 `/api/tools` 返回的完整清单）：`smart-edit`、`outpaint`、`image-hd`、`inpainting-remove`、`view-control`、`lighting`、`panorama`、`image-presets`、`multi-size`、`product-replacement`、`dynamic-poster`、`video-partial-reshoot`、`video-edit`、`video-subtitle-erasure`、`audio-separation`、`video-upscale`、`video-frame-interpolation`、`cutout`、`layer-decompose`、`video-matting`、`video-depth-capture`。
其中**不依赖任何模型**、装完即可用的是 6 个：`image-hd`、`audio-separation`、`video-upscale`、`video-frame-interpolation`、`cutout`（需 FFmpeg）。

### 1.8 时间线
多时间线并存、片段起止 / 速度 / 音量、画中画、字幕轨、实时预览、**MP4 渲染**（浏览器侧 WebCodecs + `mediabunny`，H.264 + AAC，软件 AAC 编码器保证一致性）、导出 JSON、FCPXML、素材包、`.timeline.zip` 可编辑包导入导出。

### 1.9 素材库
`items`（素材条目）、`subjects`（主体库）、`canvases`（画布源）、回收站（批量删除 / 恢复 / 清空）、上传、从画布 / 主体创建、主体媒体多槽位（三视图等）。

### 1.10 音色库
按服务列出音色、上传授权录音创建音色、删除、试听、收藏（本地）。MiniMax 系统音色、MOSS 大音色库分页。

### 1.11 业务 CLI（`opendirector`）
Typer 应用，16 个命令组、**60+ 子命令**：`serve`、`dev`、`project show/list`、`model list/show`、`voice list/create/delete`、`asset import`、`canvas add-material`、`canvas text create/show/update/resize`、`video create`、`job show/wait`、`artifact`、`generation-spec`、`reference`、`generation`、`result`、`editor`、`timeline export/import/default-font`、`history`、`creation`、`query`。
这是给 Agent / 脚本用的入口，`--url`、`--project`、`--session` 走 HTTP，等价于操作界面。

### 1.12 设置与本地化
通用设置（去水印等）、明 / 暗主题、**zh-CN / en-US 双语文案 3702 条**（错误消息由 API 按 `Accept-Language` 返回对应语言）、助手面板宽度记忆、生成耗时统计。

### 1.13 导出与归档
画布归档、zip 归档、时间线包、MP4、JSON、FCPXML、素材批量下载。**MP4 导出依赖 WebCodecs H.264** —— 只有 Chrome / Edge 有，Firefox 不能导出（官方文档明确写死这条）。

---

## 2. 一致性对照表

图例：✅ 一致 ｜ ⚠️ 有条件一致 ｜ ❌ 不一致 ｜ 🚫 当前根本不可达

| 能力域 | 浏览器（上游标准） | 当前 Windows 包 | 判定 |
| --- | --- | --- | --- |
| 安装 | `git clone` + `pip install -e .`（需 Node 24.22.1+） | `setup.cmd` → `pip install opendirector` | 🚫 P0-1/2 |
| 启动 | `opendirector serve` | 双击快捷方式 | ✅ 设计对，实现被 P0 阻断 |
| 界面 | `http://127.0.0.1:8000` | 同一 bundle，Edge/Chrome `--app` 窗口 | ✅ |
| 画布 / 节点 / 连线 | ✅ | 同一前端 | ✅ |
| 素材上传 / 编辑 | ✅ | 同一前端 | ✅ |
| 本地工具（`cutout`、`video-upscale` 等） | 需 FFmpeg | 包内 `bin\` + 注入 PATH | ⚠️ 依赖 P0-1 修好 |
| 时间线 + MP4 导出 | 需 Chrome/Edge | 用 Edge/Chrome `--app` | ✅ |
| 模型连接 / 生成 | ✅ | 同一前端 | ✅（需用户自己的模型服务） |
| **AI 助手（Default 引擎）** | wheel 内置 `opencode.exe` | 无二进制 | 🚫 P0-4 |
| 外部 harness（Codex/Claude 等） | 用户自装 | 用户自装 | ✅ |
| **业务 CLI** | ✅ | **未暴露** | ❌ P1-6 |
| 多窗口 / 多实例 | 服务端租约隔离 | 每次双击新起一个后端 | ❌ P1-7 |
| 下载文件落点 | 浏览器默认下载目录 | 专用 profile 的下载目录 | ⚠️ P2-8 |
| 系统集成（托盘/单实例/自启） | 无（也不需要） | 无 | ⚠️ P2-8 |
| 中英文 | 跟随浏览器语言 | 跟随新 profile 的系统语言 | ✅ |
| 退出时停服 | Ctrl+C | 关窗即停 | ✅ |

**净结论**：界面上"完全一致"这一半是真的——因为窗口里跑的就是同一份 bundle、同一个 API。不一致的全部集中在**外壳（安装、分发、进程模型、Agent 二进制、CLI）**。

---

## 3. 缺陷清单

### P0-1 ｜ 安装源不存在

**现象**：干净机器双击 `setup.cmd`，最后停在 `Installing OpenDirector failed`。

**证据**（本次实测）：
```
$ pip index versions opendirector
ERROR: No matching distribution found for opendirector

$ curl -sL https://pypi.org/simple/opendirector/
404 Not Found

$ gh api repos/ThinkFlowLab/OpenDirector/releases/tags/v0.1.4 --jq '.assets | length'
0
# v0.1.0 ~ v0.1.4 五个 Release，全部 0 个附件
```

**上游自己承认**：
- `docs/guides/installation.md`：「Once published… **until then**, obtain a wheel matching your OS and architecture from a trusted project release… **This does not claim the version is already available on PyPI.**」
- `docs/development/packaging.md`：「**当前没有自动上传 PyPI 的发布动作。**」
- 上游依赖 `opencode-ai` 1.19.5 的 postinstall 落地平台二进制，因此 wheel 是 `py3-none-win_amd64` 平台标签，**不能**跨平台，发布必须在 Windows 上分别构建验证。

**根因**：我的 `ensure_runtime()` 在无 `--source` 时执行 `pip install opendirector psutil`，假设了 PyPI 存在。这个假设从未验证。

**实测复现**：
```
$ python app/opendirector_app.py install --data-dir /tmp/cleaninstall/data
Installing OpenDirector into /tmp/cleaninstall/data/runtime/venv (first run, takes a few minutes)...
ERROR: Could not find a version that satisfies the requirement opendirector (from versions: none)
ERROR err.install_failed
```

---

### P0-2 ｜ 嵌入式 Python 没有 `venv` 模块

**现象**：即使 P0-1 解决（假设 PyPI 有包），安装仍然失败，且失败点更早。

**证据**（CPython 上游源码）：
```
# PC/layout/support/options.py
PRESETS = {
  "embed": {"help": "embeddable package",
            "options": ["stable", "zip-lib", "flat-dlls", "underpth", "precompile"]},
}

# PC/layout/main.py
VENV_DIRS_ONLY = FileNameSet("venv", "ensurepip")
...
if f in VENV_DIRS_ONLY:
    return ns.include_venv      # embed 预设从不开启 → venv/ 与 ensurepip/ 被排除出 python312.zip
```

`python.org` 的 `python-3.12.x-embed-amd64.zip` 正是 embed 预设产物。CPython 文档同页也写明：embeddable 是「a minimal package of Python suitable for embedding into a larger application」，**不含 pip**、**不含 venv**，且明确「Using pip to manage dependencies as for a regular Python installation is **not supported** with this distribution」。

**我们的代码第 446 行**：
```python
created = run([*runtime.executable.split(" "), "-m", "venv", str(venv_dir)], timeout=600)
```
→ `No module named venv` → `venv_py` 不存在 → `err.install_failed`。

**为什么之前没发现**：沙箱里用的是 `/tmp/venv`（完整 CPython），不是 embeddable 包。而 `python.org` 在本沙箱不可达（`curl` 全部 `SSL_ERROR_SYSCALL` / `000`），所以这一条是**读源码 + 读 CPython 构建脚本推出来的**，附带了验证建议（见 §6）。

**修法（便宜）**：不建 venv，直接 `get-pip.py` 装进 embed 自己的 `Lib/site-packages`（`install.ps1` 已经写好了 `._pth` 含 `Lib\site-packages` + `import site`，路径是通的）。`--install --force` 改成清空 `site-packages` 而不是删 venv。
**修法（更稳）**：改用 NuGet 的 `python.3.12.10.nupkg`，其预设为 `["dev","pip","stable","venv",…]`，含 venv + pip。代价是包体从 15 MB 变 ~40 MB，且 nuget.org 的可达性需确认。

---

### P0-3 ｜ 系统代理会把本机健康检查送去代理

**现象**：公司网络 / 开了代理软件的 Windows 机器，双击快捷方式后窗口一直不出现，120 秒后报「服务启动超时」，但其实后端已经跑起来了。

**证据**（本次实测，模拟死代理）：
```
no proxy                                   → OK 200
HTTP_PROXY=http://127.0.0.1:9              → FAILED URLError [Errno 111] Connection refused
```
服务是健康的，是**探测端**被代理劫持了。

**根因**：`wait_for_health()` 与 `serves_workspace()` 用默认 `urllib.request.urlopen`。默认 opener 挂载 `ProxyHandler()`，它会读环境变量**以及 Windows 注册表的 `ProxyEnable` / `ProxyServer`**。
`Backend.environment()` 里设置的 `NO_PROXY=127.0.0.1,localhost` 只作用于**子进程（服务本身）**，launcher 自己的 `os.environ` 没被改。

**上游是怎么做的**（`packages/core/src/opendirector/launcher.py`）：
```python
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))   # 显式禁用代理
with opener.open(request, timeout=0.3) as response:
```
这个细节我照抄时漏了。

**影响面**：`wait_for_health`、`serves_workspace` 两处。修法一行：两处都改用 `build_opener(ProxyHandler({}))`。**这条必须修，成本极低、危害极大。**

---

### P0-4 ｜ 内置 Agent 引擎缺二进制

**现象**：界面能开，能看到 Agent 面板，但一发消息就报「内置 Agent 依赖安装不完整或无法运行」，并且 `opencode` / `jiuwenswarm` / `deepseek` / `codex` / `claude` 五个 harness 全部 `not_installed`。

**证据**（对本次会话运行中的真实实例实测）：
```
$ curl .../api/creation/projects/<id>/assistant/skills
{"detail":"内置 Agent 依赖安装不完整或无法运行，请重新执行 pip install --force-reinstall opendirector…",
 "code":"agent_dependency_unavailable"}

$ curl .../assistant/runtimes?probe=false
default: available=true, status=checking      ← 误报
opencode: available=false, status=not_installed
（其余 4 个同样 not_installed）
```

**根因**：上游 `native.executable('default')` 先找 `ROOT/node_modules/opencode-ai/bin/opencode.exe`，再找 `BUNDLED/bin/opencode.exe`。
- 源码模式：`node_modules/opencode-ai/bin/opencode.exe` 是个**479 字节的 stub shell 脚本**（postinstall 才下载真二进制），所以 `available=true` 是误报，实际调用即失败。
- wheel 模式：`_bundled/bin/opencode.exe` 才是真二进制，由 `build_backend.py` 在构建时从 `node_modules/opencode-ai` 拷入。

也就是说：**AI 助手能不能用，取决于是否有"在 Windows 上构建出来的 wheel"**。二进制体积：`opencode-windows-x64` 解包 **213 MB**。

---

### P1-5 ｜ 包体与分发形态错配

上游构建产物实测量级：
```
dist/（web bundle）        23 MB
opencode-windows-x64      213 MB（解包）
CPython embed             ~15 MB
FFmpeg essentials         ~80 MB
```

而当前分发包 **149 KB**。它是个"下载器"，首启要下 300 MB+。
更要命的是**下载源**：`python.org`、`bootstrap.pypa.io`、`gyan.dev`。本次会话实测这三个域名在沙箱里全部不可达（`000` / `SSL_ERROR_SYSCALL`）——沙箱的网络白名单虽然不覆盖真实用户环境，但**它恰好复现了国内企业网/校园网的典型可达性**。上游 README 自己也在讲"代理导致生图超时"。

结论：即使 P0-1/2 修好，绝大多数中文用户仍会在"下载 Python / 下载 FFmpeg"这一步失败。

---

### P1-6 ｜ 业务 CLI 未暴露

上游有 60+ 子命令的 `opendirector` CLI，是本项目对 Agent / 脚本场景的核心接口，也是「用 AI 装 OpenDirector」那个 skill 的操作面。
当前包只跑 `opendirector_api.server`，用户打开终端敲 `opendirector` 什么也得不到（wheel 装在私有 venv/embed 里，PATH 不注入）。

**如果"完全一致的体验"包含 CLI，这是缺口。** 修法：在 `app\` 下加 `opendirector.cmd` 薄封装（设置 PATH 指向私有运行时后转发），并在 README 说明。

---

### P1-7 ｜ 没有单实例控制

每次双击快捷方式 → 新起一个后端（端口 8000→8001…）→ 同一工程被两个后端同时持有。
上游有 project lease，会给出"另一个窗口"的冲突提示，但那是**同一后端**内的保护。跨后端的并发写会落在同一份磁盘状态上，属于未定义行为。
修法：`state.json` 里存 pid + 端口，启动时探测是否已有存活实例，有则直接复用（把窗口指过去）而不是重开。

---

### P2-8 ｜ 缺少桌面端应有的系统集成

- 无托盘图标：最小化 / 关窗即停服，**长任务（MP4 渲染、视频生成）中途关窗就断**。上游文档明确要求"keep the page and editor open while rendering"——浏览器里这是常识，桌面应用里这是缺陷。
- 无开机自启、无协议处理器、无"在文件夹中显示"。
- 导出文件落在专用 profile 的下载目录（`<data>\browser-profile\Downloads`），用户找不到。应该在 `Backend.stop` 前提示落点，或改成系统"下载"文件夹。
- 快捷方式指向 `wscript.exe` 调 `.vbs`，图标是 `.ico`——**任务栏图标会显示成 wscript 的图标**，不是 OpenDirector 的（`.vbs` 无法设置 AppUserModelID）。

---

### P2-9 ｜ 语言环境不一致

launcher 给服务设 `OPENDIRECTOR_LANGUAGE: "en-US"`（`Backend.environment()`），但 launcher 自己的界面文案走 `system_locale()`。中文系统用户会看到"中文外壳 + 英文 API 错误"的混搭。
实际上前端每次请求都带 `Accept-Language`（`setRequestLocale`），会把 API 错误改写回中文，所以影响有限——但 `OPENDIRECTOR_LANGUAGE` 这一行是**凭空猜的**，上游代码里它只被 CLI 用，服务端不读。应该删掉。

---

### P2-10 ｜ 文档与小工具的不一致

- `make-exe.ps1` 的 `$Output` 默认值仍是 `..\dist\OpenDirector-Setup.exe`，但两个 README 和验收文档都写 `packages\OpenDirector-Setup.exe`。上一轮改目录时漏了这一处。
- `docs/acceptance.md` 的「Verified in this environment」段落现在**不成立**：它暗示"随包 launcher 走的是 Windows 包用的同一条代码路径"。真实情况是走了 `--source`，绕过了 P0-1/P0-2。这一段必须改写。

---

## 4. 复盘：为什么上一轮没抓到

1. **验证路径与用户路径不同**。我在沙箱里永远带 `--source /tmp/opendirector --python /tmp/venv/bin/python`，这既绕过了"包从哪来"（P0-1），也绕过了"运行时是什么"（P0-2）。
2. **只测了"能起来"，没测"装得上"**。`--check` 显示 `OpenDirector package MISSING` 时我把它读成"沙箱没装而已"，而不是"默认安装路径是坏的"。
3. **代理只在代码里看了一眼 `NO_PROXY`**，没做交叉验证，也没对照上游 `launcher.py` 的 `ProxyHandler({})`。
4. **Agent 可用性没探**。`/api/health` 200 + 首页 200 就认为"服务可用"，没去探 `/assistant/skills`。

这四条以后应该固化成一个"干净机器冒烟脚本"，作为发布前门禁。

---

## 5. 三条修复路线

| 路线 | 做法 | 用户拿到什么 | 首启下载 | 工作量 | 风险 |
| --- | --- | --- | --- | --- | --- |
| **A. 等上游发 wheel** | 修 P0-2/3/4 的代码，安装逻辑改为"从固定 URL 下 wheel" | 官方 wheel，签名与来源可信 | 400 MB+ | 1 天（等上游另计） | 上游无时间表；发不发、发在哪个平台都不确定 |
| **B. 我们自建 Windows wheel 并作为 release 附件** | 在 Windows 上 `python -m build`（需 Node 24.22.1 + 213 MB opencode）；产物 `py3-none-win_amd64` | 一次下 400 MB 的完整安装器，可离线 | 0（含在安装器里） | 3–5 天（含 CI） | wheel 里含 213 MB 第三方二进制，**许可证与体积需评估**；无代码签名证书时 SmartScreen 仍拦 |
| **C. 源码模式**（`git clone` + 构建） | 包改成引导 clone + `npm ci` + `pip install -e .` | 官方最正统的路径 | 2 GB+ 且要 Node | 2 天 | 需要 Git + Node 24.22.1；构建 10–20 分钟；对普通用户等于劝退 |

**无论走哪条，下面四项都必须先修**（与路线无关，纯代码缺陷）：
- P0-3 代理绕过（1 行 × 2 处）
- P0-2 不建 venv、直接装进 embed（~30 行）
- P1-7 单实例（~40 行）
- P2-10 文档纠错 + 「验证状态」章节如实改写

估算 **1 天**可完成，完成后至少"有 wheel 就能装上"。

---

## 6. 待你在 Windows 上确认的两件事

我这台沙箱碰不到 `python.org` / `nuget.org` / `gyan.dev`，所以有两条结论是"读源码推出"而非"跑出来"：

1. **embed 包确实没有 `venv`**：解压 `python-3.12.10-embed-amd64.zip`，`tar -tf python312.zip | findstr venv` 应为空；`python -m venv x` 应报 `No module named venv`。
2. **FFmpeg essentials 含 `libx264`**：`ffmpeg -hide_banner -encoders | findstr libx264`。上游要求 libx264（`processing.py` 里 `-c:v libx264` 硬编码）；gyan.dev 的 essentials 通常有，但需实测，否则把 `FFMPEG_ZIP` 换成 `ffmpeg-release-full`。

---

## 7. 我的建议

**不要按当前形态发布。** 它现在是一个"看起来能用、实际装不上"的包，对用户时间的浪费比对不提供更糟。

如果目标是"让中文 Windows 用户三步做出第一条短片"，我建议 **B + 先修四项 P0/P1**：
- B 路线一次性解决 400 MB 下载、离线、可达性三个问题；
- 代价是仓库要放 400 MB 附件（GitHub Release 单文件上限 2 GB，可行），以及要核对 `opencode` 的许可证（上游 `THIRD-PARTY-NOTICES` 里已有 opencode 的 MIT 声明，可直接沿用）。

如果目标只是"给已经有 Python/Node 的开发者一个快捷入口"，那 **A + 四项修复** 就够，不必背 400 MB。

两条路的差别不在代码量，在**你要不要替用户承担那 400 MB 的分发**。

---

## 8. 附录：结论的实测状态

| 结论 | 怎么得出的 | 可信度 |
| --- | --- | --- |
| PyPI 无 `opendirector` | `pip index versions` + `pypi.org/simple/` 404 | **实测** |
| GitHub Release 五个版本 0 附件 | `gh api …/releases/tags/v0.1.x --jq '.assets\|length'` | **实测** |
| 干净安装失败于 `err.install_failed` | 新建 venv + 跑 `install` 子命令，复现报错 | **实测** |
| 代理会把健康检查送去代理 | 死代理下 `urlopen` 失败、`ProxyHandler({})` 成功 | **实测** |
| `ProxyHandler({})` 是正确修法 | 同上，返回 `200 {"status":"ok"}` | **实测** |
| Default 引擎缺 `opencode.exe` | `/assistant/skills` → `agent_dependency_unavailable`；`opencode.exe` 是 479 B stub | **实测** |
| 五个外部 harness 全不可用 | `/assistant/runtimes?probe=false` 全 `not_installed` | **实测** |
| 路由 88 条 / i18n 3702 键 / 组件 247 个 / 工具 22 个 | openapi.json、`grep -c`、`ls`、`/api/tools` | **实测** |
| 上游面板与 CLI 清单（13 域 / 60+ 子命令） | 读 `cli.py`、`runtime.py`、`src/canvas/` | **读码** |
| embed 包不含 `venv` / `ensurepip` | CPython `PC/layout/support/options.py` 与 `main.py` | **读码**（沙箱到不了 python.org，见 §6） |
| FFmpeg essentials 含 libx264 | 未验证 | **待验** |
