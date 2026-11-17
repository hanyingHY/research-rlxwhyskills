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
