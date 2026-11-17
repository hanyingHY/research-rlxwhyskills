# OpenDirector Desktop —— RFC #362 / D1 #363 分析与可运行基线

本目录包含三部分内容：

| 内容 | 位置 |
| --- | --- |
| 项目分析（它是什么、怎么运转、工程成熟度、桌面化约束） | [`docs/01-project-analysis.md`](docs/01-project-analysis.md) |
| 对 issue #362 的判断、方案缺口、落地顺序、验收矩阵 | [`docs/02-issue-362-assessment.md`](docs/02-issue-362-assessment.md) |
| 基线代码设计说明（模块、协议、认证、代理、退出、打包） | [`docs/03-baseline-design.md`](docs/03-baseline-design.md) |
| 本机实际验证记录（跑了什么、结果、未覆盖项） | [`docs/04-verification.md`](docs/04-verification.md) |
| 可直接贴到 issue 的英文评论草稿 | [`docs/05-issue-comment-draft.md`](docs/05-issue-comment-draft.md) |

## 基线代码做了什么

一个可以在 macOS / Windows / Linux 上跑通的 Electron + Python 桌面壳骨架，围绕
OpenDirector 现有的 Web UI 与本地 API，不修改上游业务代码：

- **Host 生命周期**：主进程拉起 `python runtime/host_entry.py --port 0`，由操作系统分配端口，
  通过 stdout 控制通道收到 `ready / fatal / status / shutdown-complete`，而不是解析日志。
- **每次启动的凭据**：主进程生成 256 bit token，只存在于主进程内存；Host 侧用纯 ASGI
  中间件校验 `Authorization: Bearer`，渲染进程、URL、日志、cookie 都拿不到。
- **稳定 origin**：渲染进程加载 `od://app/`，主进程把请求代理到 `127.0.0.1:<随机端口>`。
  这样主题、语言、草稿等 `localStorage` 数据不会因为端口变化而丢失，也不会产生
  localhost cookie 泄漏给其他本机服务。
- **沙箱渲染进程 + 窄 IPC**：`contextIsolation`、`sandbox`、禁用 Node；preload 只暴露
  选目录、打开数据/日志目录、状态、重启、退出等少数操作，并且只接受主窗口主 frame。
- **任务感知退出**：退出前查询 `/api/desktop/status`；有工具任务时提示会中断什么，
  远端生成任务不会被取消。关闭窗口与退出应用在 macOS 上区分处理。
- **资源/数据分离**：程序资源只读；项目数据默认 `~/.opendirector`（与 wheel 安装的 CLI 一致）；
  日志、Chromium session、缓存放在平台应用数据目录。
- **可验证的打包路径**：`electron-builder.yml`（dmg/zip、nsis、AppImage/deb/rpm）+
  `scripts/prepare-runtime.mjs`（CPython + wheels + FFmpeg + OpenCode → 单平台 runtime）+
  `scripts/verify-runtime.mjs`（在目标机真实启动 Host，验证动态端口、token、健康检查、状态、优雅退出）。

## 本机验证结果（Linux x86_64）

```
npm test                                 25/25 通过
node scripts/verify-runtime.mjs ...      PASS（真实 OpenDirector 后端，启动约 1.0 s）
```

`verify-runtime` 的实际输出：

```
Host ready on 127.0.0.1:52151 (pid 2307, 994 ms)
status {"status":"ready","port":52151,"inFlight":0,"projects":0,"activeToolTasks":[],"busy":false}
PASS dynamic port, token, health, status, graceful shutdown
```

未验证：Electron 图形界面（本环境无显示器）、真实前端构建、Electron 内 WebCodecs MP4 导出、
安装包、macOS/Windows、签名公证、自动更新。详见验证文档。

`ci/desktop-tests.yml` 是三平台（ubuntu-22.04 / windows-2022 / macos-14）× Node 22/24
的契约测试矩阵，复制到仓库 `.github/workflows/` 即可启用；它不依赖 Electron 与图形会话，
因此能在 CI 上真正跑“多端”的生命周期、鉴权、代理与路径解析。

## 如何运行

### 1. 单元/集成测试（任意 Node ≥ 22，无需 Electron、无需 OpenDirector）

```sh
cd opendirector-desktop
npm test
```

### 2. 对着真实 OpenDirector 源码验证 Host（不需要 Electron）

```sh
python3 -m venv /tmp/od-venv
/tmp/od-venv/bin/pip install fastapi uvicorn pydantic pyyaml filelock httpx anyio \
  typer pillow pillow-heif fonttools python-multipart

node scripts/verify-runtime.mjs \
  --runtime . \
  --python /tmp/od-venv/bin/python \
  --host-entry runtime/host_entry.py \
  --pythonpath "/path/to/OpenDirector/packages/core/src:/path/to/OpenDirector/apps/api/src" \
  --data /tmp/od-verify
```

### 3. 启动 Electron 壳（开发模式）

```sh
cd opendirector-desktop
npm install                 # 会下载 Electron
node scripts/prepare-runtime.mjs \
  --python /path/to/python-build-standalone \
  --wheels /path/to/target/wheels \
  --ffmpeg /path/to/ffmpeg-dir \
  --target linux-x64
npm start
```

没有组装 runtime 时，也可以指向一个 venv：

```sh
OPENDIRECTOR_PYTHON=/path/to/.venv/bin/python \
OPENDIRECTOR_PYTHONPATH=/path/to/OpenDirector/packages/core/src:/path/to/OpenDirector/apps/api/src \
OPENDIRECTOR_ROOT=/tmp/od-data \
npm start
```

> `npm start` 需要图形会话。CI 里可以用 `xvfb-run`（Linux）或对应平台的 runner。

### 4. 打包

```sh
npm run pack:dir     # 只产出目录，便于冒烟
npm run dist         # dmg/zip、nsis、AppImage/deb/rpm
```

打包前 `runtime/dist/<mac|win|linux>-<arch>/` 必须存在且已通过 `verify-runtime`。
平台矩阵与签名步骤见设计文档。

## 边界声明

这是**基线骨架**，不是可直接合并的 D1 交付：

- 没有改 OpenDirector 上游任何代码；Host 包装层独立存在，正式实现应落到
  `apps/api/src/opendirector_api/` 并由仓库测试覆盖。
- 任务状态目前只能看到工具任务；Agent 轮次与生成任务需要上游补一个正式接口。
- 自动更新、公证、代码签名、Windows ARM64、Linux musl 均未实现。
- 安装包体积、许可证合规（尤其 FFmpeg/libx264）需要产品与法务决策。
