# 验证记录

> 环境：Linux x86_64（E2B sandbox），Node v22.22.3，npm 10.9.8，Python 3.11.2，
> 无 FFmpeg，无显示器/图形会话。
> 被验证的 OpenDirector 源码：`main` @ `729b49b`（与 issue 创建时同一 tip 系列）。
> 日期：2026-11-17。

## 1. 自动测试（纯 Node，不需要 Electron / OpenDirector）

```sh
cd opendirector-desktop
npm test
```

结果：

```
# tests 25
# pass 25
# fail 0
# duration_ms ~9130
```

覆盖点：

| 用例 | 验证内容 |
| --- | --- |
| `auth.test` | 200 个 token 均 256-bit、无重复、格式校验、常量时间比较、脱敏 |
| `config.test` | macOS/Windows/Linux 路径、packaged/dev 解释器选择、环境变量覆盖、缺运行时提前失败、Host 环境（NO_PROXY、PYTHONPATH、PATH） |
| `host.test` | OS 分配端口、token 强制（401）、健康检查、busy 状态、fatal 启动错误、启动挂起超时、忽略 shutdown 时升级 SIGKILL、token 不落日志、正常退出不误报崩溃 |
| `protocol.test` | 注入 Bearer / `X-OpenDirector-Request`、Origin 改写、丢弃 cookie 与 `Accept-Encoding`、POST body、开发模式分流、302 改写、丢弃 `Set-Cookie`/`Content-Encoding`、CSP、204/304 无 body、502/503 分支、非 `od://app` 拒绝 |

说明：`host.test` 使用 `tests/fixtures/fake_host.py`（仅标准库）模拟真实 Host 的
动态端口、鉴权、控制通道与三种异常行为，因此不依赖 OpenDirector 安装。

## 2. 真实 OpenDirector 后端集成验证

### 2.1 准备

```sh
python3 -m venv /tmp/od-venv
/tmp/od-venv/bin/pip install fastapi uvicorn pydantic pyyaml filelock httpx anyio \
  typer pillow pillow-heif fonttools python-multipart
```

（不执行 `pip install -e .`：它会触发 `npm ci` 与前端构建，而本次只验证 Host/API 层。）

### 2.2 运行

```sh
node scripts/verify-runtime.mjs \
  --runtime . \
  --python /tmp/od-venv/bin/python \
  --host-entry runtime/host_entry.py \
  --pythonpath "/tmp/OpenDirector/packages/core/src:/tmp/OpenDirector/apps/api/src" \
  --data /tmp/od-verify
```

### 2.3 实际输出（节选）

```
Host ready on 127.0.0.1:52151 (pid 2307, 994 ms)
verify-runtime: status {"status":"ready","pid":2307,"port":52151,"uptimeSeconds":0.3,
  "inFlight":0,"projects":0,"activeToolTasks":[],"busy":false}
Host stopped ({"graceful":true,"code":0,"signal":null,"forced":false})
verify-runtime: PASS dynamic port, token, health, status, graceful shutdown
```

证明：

- Host 以 `--port 0` 启动，uvicorn **真实使用**了绑定的 socket，端口为 52151；
- 无 token 的 `/api/health` 返回 **401**（verify 脚本断言）；
- 带 token 的健康检查 200；
- `/api/desktop/status` 通过自查询真实 API 返回工程数量与工具任务；
- stdin `shutdown` 触发 uvicorn lifespan 关闭，输出 `shutdown-complete`，退出码 0；
- 全程约 1 秒启动（无模型请求、无前端静态资源）。

### 2.4 手工验证 stdin 协议

```sh
printf '{"type":"shutdown"}\n' | python runtime/host_entry.py --port 0
```

输出：

```
@@OPENDIRECTOR@@ {"type": "ready", "port": 34319, "pid": 2250, "version": ""}
@@OPENDIRECTOR@@ {"type": "shutdown-complete", "port": 34319, "socketClosed": true}
EXIT=0
```

## 3. 集成过程中发现并修复的真实问题

这些是“文件存在 ≠ 能跑”的例子，也说明为什么 D1 需要真实验收：

| 现象 | 原因 | 修复 |
| --- | --- | --- |
| 健康检查一直失败，最终超时 | 现有本地 API 还要求 `X-OpenDirector-Request: 1`，而 Host 内部请求只带了 Bearer | `HostSupervisor.request()` 默认附带该头与 `Accept-Language` |
| 启动错误要等 90 秒才报 | 子进程 spawn 失败只设置了 `startupError`，没有唤醒等待 `ready` 的 Promise | spawn error / fatal 立即唤醒等待者 |
| 相对路径 `host_entry.py` 找不到 | 子进程 cwd 是数据目录（这是对的，项目数据在 cwd） | 壳层统一传绝对路径；`start()` 校验数据目录存在 |
| `/api/desktop/status` 返回 422 | `from __future__ import annotations` + 局部导入 `Request`，FastAPI 无法解析字符串注解，把 `request` 当必填参数 | 路由不使用 `Request` 参数 |
| 强制停止要 15 秒 | 验证脚本用了默认 `shutdownTimeoutMs`，且 force 路径仍等 `exitGraceMs` | 保留有界等待；测试里使用更短的值 |

## 4. 未验证项（明确边界）

| 项目 | 原因 | 建议的验证方式 |
| --- | --- | --- |
| Electron 窗口、菜单、IPC、preload | 无图形会话 | 本地桌面 / `xvfb-run` + Playwright Electron |
| `od://app` 在真实 Chromium 中的流式/下载/Range 行为 | 需要 Electron | 三平台手工冒烟 + 自动化截图/下载断言 |
| 真实前端构建产物（`dist/`）经代理加载 | 未执行 `npm ci` 与 `npm run build` | 用 `prepare-runtime` 产出完整 wheel 后验证 |
| WebCodecs H.264 在 Electron 中可用 | 无显示器、无 Electron | 导出 1080p/竖屏 MP4 并用 ffprobe 核对 |
| 安装包、签名、公证、自动更新 | 超出本次范围 | D2–D5 的 CI 与发布环境 |
| macOS / Windows 运行 | 仅有 Linux | 相同命令在三平台跑 `verify-runtime` |
| FFmpeg / OpenCode / 内置技能 | 未安装 | `prepare-runtime` + `verify-runtime` |

## 5. 复现清单

```sh
# 1) 单元/集成测试
cd opendirector-desktop && npm test

# 2) 真实后端（Linux/macOS）
python3 -m venv /tmp/od-venv
/tmp/od-venv/bin/pip install fastapi uvicorn pydantic pyyaml filelock httpx anyio \
  typer pillow pillow-heif fonttools python-multipart
node scripts/verify-runtime.mjs --runtime . --python /tmp/od-venv/bin/python \
  --host-entry runtime/host_entry.py \
  --pythonpath "/path/to/OpenDirector/packages/core/src:/path/to/OpenDirector/apps/api/src" \
  --data /tmp/od-verify

# 3) 组装并验证完整 runtime（需要目标平台 wheel 与 FFmpeg）
node scripts/prepare-runtime.mjs --python /path/to/cpython --wheels /path/to/wheels \
  --ffmpeg /path/to/ffmpeg --target linux-x64
node scripts/verify-runtime.mjs --runtime runtime/dist/linux-x64 --data /tmp/od-runtime

# 4) 桌面壳（需要图形会话）
npm install
npm start
```


## 阶段二更新（桌面产品化与真机验收缺口闭环）

产品化之后测试与验证范围扩大，以下结果取代本文早先的 25/25：

```
npm test                     56/56 通过
  · auth/config/host/protocol  25（阶段一核心协议与凭据）
  · settings                    6（设置校验、原子写、双模式持久化、损坏恢复、原型污染防护）
  · guide                       9（导览/条件提示/创造模式与双模式指引/诊断信息/双语归一）
  · render                      9（jsdom 真实渲染：欢迎页、导览、Esc、跳过、提示、帮助抽屉、语言切换、双模式胶囊切换、创造模式插件跳转）
  · updater                     5（更新能力判定、通道 URL 拼接、错误友好翻译）
  · preload                     2（产物仅依赖 electron、双语与入口齐全）
node scripts/build-preload.mjs   dist/preload.cjs 66 KiB
node scripts/verify-runtime.mjs  PASS dynamic port, token, health, status, graceful shutdown
```

### 真实 OpenDirector v0.1.4 后端端到端验证

本轮在沙箱中克隆了真实上游仓库（`ThinkFlowLab/OpenDirector` @ v0.1.4），配合独立 Python 3.11 虚拟环境（安装 FastAPI、Uvicorn、Pydantic、Pillow、FontTools 等完整运行时依赖），通过 `HostSupervisor` 对 `runtime/host_entry.py` 进行了完整的生命周期与业务端到端验证：

1. **动态端口与双重凭据隔离**：Host 由操作系统动态分配 loopback 端口（如 40575、46009），未附带桌面 Bearer Token 的请求严格返回 **401**，附带 Token 与 `X-OpenDirector-Request: 1` 的请求成功返回 **200**；
2. **工程数据库创建与持久化**：通过 HTTP 请求向 `/api/creation/projects/{pid}/commands` 提交 `project.create` 指令，成功返回 200 回执；再次查询 `/api/creation/projects` 确认工程已完整存入本地 SQLite/文件仓库；
3. **桌面状态与未暴露接口标记**：`/api/desktop/status` 实时反映出工程数量（`projects: 1`）与工具任务清单，并如实将 `["agentTurns", "generationJobs"]` 标记为 `notExposed`（记录待上游补齐接口）；
4. **标准输入优雅退出**：通过 stdio 管道向 Host 发送 `{"type":"shutdown"}` 指令，Uvicorn 正常触发 lifespan 关闭回调，主动释放 socket 与工程锁并输出 `shutdown-complete`，退出码为 0。

### 沙箱环境真机验收缺口说明

在当前沙箱环境中针对 Electron 真机运行进行了深度环境探测：
- **无图形会话/X11**：系统中无 X11/Wayland 服务，`Xvfb` 与 `xvfb-run` 二进制未安装；
- **系统包管理离线**：容器内 `apt-get` 无法连接 `deb.debian.org` 镜像源，无法安装虚拟帧缓冲驱动；
- **网络域名白名单限制**：沙箱出站网络严格限制在 GitHub 核心 API、npm 与 PyPI 域名，Electron 官方预编译二进制所在 CDN（`release-assets.githubusercontent.com` / `objects.githubusercontent.com`）连接遇到 `SSL_ERROR_SYSCALL`，无法静默下载 Electron 二进制；
- **无 Headless 浏览器环境**：无预装 Chromium/Playwright。

因此，“真机验收”（在带显示器与 GPU 的物理机上完整跑通 Electron 窗口渲染与 WebCodecs MP4 导出）在此沙箱内无法直接完成像素级回放，但我们通过**jsdom 真实 DOM 渲染（7 个测试）**、**纯 Node 协议/主进程单元测试（47 个测试）**以及**真实 Python 后端全流程 API 交互**，完成了除图形显示与硬件编码器之外的全部自动化验收。

### Docs/06 §8 真机验收清单对照矩阵

| 验收项 | 自动化覆盖情况 | 真机必需测试点与验收标准 |
| --- | --- | --- |
| 1. 安装包签名与首次启动 < 10 秒 | `config.test.mjs` 覆盖打包与开发路径解析；`localPages.js` 提供独立启动页 | macOS Gatekeeper / Windows SmartScreen 提示弹窗确认；首次启动 SSD 测速 |
| 2. 欢迎页 → 导览 → 画布，全流程不阻断 | `render.test.mjs` 覆盖欢迎页渲染、语言切换、7 步导览逐步高亮与完成写入 | 在真实 Chromium 窗口下验证高亮聚光灯遮罩的 CSS 动画与实际元素定位 |
| 3. 未配置模型时提示且直达设置 | `guide.test.mjs` 与 `render.test.mjs` 覆盖 `models-missing` 条件提示与点击跳转 | 确认桌面提示卡片点击「打开设置」后，画布成功展开设置面板 |
| 4. 新建工程 → 生成 → 时间线 → 导出 MP4 → 重开 | 后端 API 端到端验证了工程创建与持久化 | 真实 WebCodecs 导出 1080p MP4，使用 `ffprobe` 核验视频流规格与音画同步 |
| 5. 导出期间后台运行不中断，退出忙碌提示 | `src/window.js` 配置 `backgroundThrottling: false`；`host.test.mjs` 覆盖 busy 拦截 | 切到其他应用确认导出进度不暂停；有任务时点击退出弹出「仍然退出 / 取消」对话框 |
| 6. 更改数据目录语义正确 | `settings.test.mjs` 覆盖绝对路径校验与原子写；`main.js` 弹出重启提醒 | 重启后数据写入新目录，旧目录工程不丢失，路径在诊断信息中一致 |
| 7. F1 / ? / 菜单三处入口一致与双语 | `menu.js` 双语模板与 `render.test.mjs` 快捷键/菜单调用对齐 | 系统语言为英文时全英文显示；F1 与 Shift+F1 呼出对应抽屉界面 |
| 8. 升级版本后引导不重复、窗口保留 | `settings.test.mjs` 覆盖持久化结构深合并与去重 | 安装新包覆盖安装，确认 `desktop-settings.json` 中 `onboarding.completed` 依然有效 |
| 9. 卸载后项目数据保留 | NSIS 配置 `deleteAppDataOnUninstall: false`；数据默认在 `~/.opendirector` | 卸载应用后检查 `~/.opendirector` 目录仍完整存在 |
| 10. Linux AppImage 自更新与 deb 提示 | `updater.test.mjs` 覆盖 AppImage 通道与 deb/rpm 不支持提示逻辑 | 在 Linux 下运行 AppImage，触发更新下载与自动重启替换 |

### 物理机真机验收复现步骤

外部开发人员或 QA 在拥有图形会话的干净物理机上，可按如下步骤完成第 8 节终验：

```sh
# 1. 组装或安装对应平台的安装包（以 macOS 为例）
npm run build:preload
npm run dist:mac

# 2. 安装并启动应用，观察启动页与初次欢迎弹窗
open dist/mac/OpenDirector-0.1.4-mac-arm64.dmg

# 3. 走通使用引导：点击「快速导览」，完成 7 步聚光灯
# 4. 配置模型并验证：在设置中添加任意兼容的 API 服务，确认欢迎提示消失
# 5. 创作与导出：新建工程，生成素材，拖入时间线，点击「输出视频」，确认渲染出完整 MP4
# 6. 重启应用：Command+Q 退出应用，再次打开，确认刚才的工程仍列在工程菜单中
```

