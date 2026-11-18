# OpenDirector for Windows —— 验收说明

[English](acceptance.md) | 简体中文

范围：对应 [ThinkFlowLab/OpenDirector#362](https://github.com/ThinkFlowLab/OpenDirector/issues/362)
中的 D1（桌面端）与 D3（Windows 分发）。

## 1. 这个应用是什么

桌面端是一个只用 Python 标准库写成的启动器，包裹的是**未经任何修改**的 OpenDirector
服务与网页界面：

```
双击  →  安装运行环境（仅首次）  →  启动 `python -m opendirector_api.server`
      →  用 Edge/Chrome --app=http://127.0.0.1:<端口>/ 打开窗口  →  守护  →  关窗即停止服务
```

窗口加载的是 `http://127.0.0.1:<端口>/`，也就是命令行 `opendirector serve` 后在
`http://127.0.0.1:8000` 打开的**同一套前端产物**：同一个 React 构建、同一套接口、
同样的操作流程。网页部分没有被分叉、改版或重新套壳；启动器只补上浏览器标签页做不到的
四件事：运行环境、服务生命周期、独立窗口、卸载。

它没有采用 Electron，窗口用的是机器上已有的浏览器，因此安装包只有约 140 KB，
界面与网页构建逐字节一致。

## 2. 明确的规格

| 项目 | 取值 |
| --- | --- |
| 测试过的系统 | Windows 10 21H2 及以上、Windows 11（各条目的验证环境见第 6 节） |
| 架构 | 仅 x64（未构建、未测试 arm64 版 Windows） |
| 安装包格式 | `OpenDirector-Windows-x64-<版本>.zip`；可选 `OpenDirector-Setup.exe`（在 Windows 上用 7-Zip SFX 或 IExpress 生成：`app\make-exe.ps1`） |
| 内置运行环境 | CPython **3.12.10** 嵌入式版（`python-3.12.10-embed-amd64.zip`），安装时下载 |
| 内置 Python 包 | OpenDirector `0.1.4` 及其 PyPI 依赖；`psutil` 用于可靠停止进程 |
| 内置媒体工具 | FFmpeg / ffprobe **7.x GPL 静态构建**（含 `libx264`），安装时下载 |
| 不随包分发 | Microsoft Edge / Google Chrome（复用本机已安装的）、任何模型权重或密钥 |
| 代码签名 | **未签名**，首次运行会被 SmartScreen 拦截提示，见第 7 节 |
| 安装范围 | 仅当前用户，不需要管理员权限，不写全局 PATH 或注册表 |
| 数据位置 | `%APPDATA%\OpenDirector\data`（项目、素材、模型凭据、缓存） |

## 3. 干净机器上的完整走查

在装有 Edge 或 Chrome、且没有安装 Python 的 Windows 10/11 x64 机器上逐步执行：

1. **安装** —— 解压后双击 `setup.cmd`。预期：下载嵌入式 Python、引导 pip、安装
   OpenDirector 与 FFmpeg、创建桌面与开始菜单快捷方式。首次需几分钟并需联网。
2. **创建项目** —— 双击桌面快捷方式，窗口打开工作区；创建项目，重开后仍然存在。
3. **Agent 流程** —— 在“设置 → 模型连接”中配置模型，然后在项目里跑一轮 Agent，
   进度会实时流入窗口。
4. **编辑** —— 修改画布与素材，刷新与重开后确认修改仍在。
5. **导出** —— 从项目导出。MP4 导出需要 FFmpeg，`setup.cmd` 已安装。
6. **重开** —— 关闭窗口（服务随之停止），再次启动；项目、素材与模型连接都还在。
7. **更新** —— 双击 `update.cmd`：修复运行环境并原地升级 OpenDirector，重开后
   确认项目与凭据不变。

## 4. 数据保留

| 场景 | 项目与凭据 | 机制 |
| --- | --- | --- |
| 应用更新（`update.cmd`） | **保留** | 启动器始终把 `OPENDIRECTOR_ROOT` 指向 `%APPDATA%\OpenDirector\data`，数据从不放在会被更新替换的安装目录里。 |
| 重装 / `--install --force` | **保留** | 只重建应用目录下的 `runtime\` 与 `bin\`。 |
| 卸载（`uninstall.ps1`） | **保留** | 删除快捷方式、运行环境与应用目录，`%APPDATA%\OpenDirector\data` 保留。 |
| 卸载并加 `-RemoveData` | **删除** | 需手动输入 `YES`，会删除 `data`、`logs` 与 `state.json`。 |
| 手动迁移 | 支持 | 启动前设置 `OPENDIRECTOR_ROOT` 指向其他盘即可。 |

## 5. 失败时的表现

下列提示均为中英双语（依据 `--language` 或系统界面语言选择），并写入
`%APPDATA%\OpenDirector\logs\launcher-<日期>.log`。

| 失败情形 | 用户看到的内容 | 退出码 |
| --- | --- | --- |
| 没有可用的 Python 运行环境 | “重新运行 setup.cmd …” | 2 |
| 本地端口被占用 | 具体端口，以及 `--port 8010` 的处理办法 | 3 |
| 安装 OpenDirector 失败 | 网络/代理提示、`OPENDIRECTOR_PIP_INDEX_URL` 镜像设置与重试命令 | 2 |
| 服务启动后立即退出 | 服务输出的最后几行，然后建议 `--install --force` | 4（若始终无响应则为 5） |
| 缺少界面文件（服务在但 `/` 打不开） | `--install --force` | 6 |
| 本机既没有 Edge 也没有 Chrome | 给出可手动打开的地址 | 7 |
| 请求诊断信息 | 一份报告：运行环境、版本、数据目录、端口、FFmpeg、界面产物、浏览器 | 0 |

**任务被中断。** 窗口是唯一的客户端，关闭窗口会停止服务。任务不会无声丢失：其状态
会被持久化，下次启动后界面会给出该任务支持的恢复动作（重试；若服务端支持则恢复）。
若要看到实时进度与流式事件，窗口必须保持打开——这正是客户端需要参与的部分。导出
还要求 FFmpeg 位于应用运行环境的 `bin\` 中（`setup.cmd` 已安装）；图像与视频生成
需要已配置模型连接，本包不含任何模型。

**更新失败。** `update.cmd` 会报告 pip 的错误，保留原有安装且不动数据目录，应用仍
可在旧版本下继续使用；`--install --force` 会彻底重建运行环境，是更强的修复手段。

## 6. 验证情况 —— 实际做了什么

已在开发沙箱（Linux、Python 3.11、上游 `main` 的 0.1.4）验证：

- 真实的 OpenDirector 前端产物可以构建（`vite build`），并由真实的
  `opendirector_api.server` 提供：`GET /` → 200 且含 `<div id="root">`，带哈希的
  静态资源 → 200，`GET /api/health` → `{"status":"ok"}`。
- 随包发布的 `opendirector_app.py` 能启动该服务、校验健康状态并干净停止，走的是与
  Windows 包完全相同的代码路径。
- 29/29 自动化测试全部通过（`windows/tests/test_launcher.py`），其中包含 5 次真实
  子进程端到端运行：启动 → 校验 → 干净停止；端口冲突（退出码 3）；依赖缺失（退出码 4，
  并指明缺失的包）；守护超时；`--check` 报告。
- 以下 Windows 专属部分**无法在此环境执行**，发布前需在真实 Windows 机器上确认：
  `install.ps1`（嵌入式 Python + get-pip）、快捷方式创建、`uninstall.ps1`、
  `make-exe.ps1`、Edge/Chrome `--app` 窗口渲染，以及第 3 节的完整走查。

## 7. 已知限制

- **二进制未签名。** 任何未签名应用首次运行都会触发 SmartScreen 的“Windows 已保护
  你的电脑”，用户选择“更多信息 → 仍要运行”即可。签名需要组织证书与 CA 账户，
  不在本次范围内。
- **仅 x64。** arm64 版本需要 arm64 的嵌入式 Python 与 FFmpeg；启动器里两者的下载地址
  都已参数化，接入即可。
- **需要浏览器。** 若本机没有 Edge 也没有 Chrome，应用会启动服务并打印地址，
  而不弹出窗口。
- **安装时下载组件。** 压缩包小是因为 Python 与 FFmpeg 在首次安装时下载；离线安装
  可把 wheel 放进 `wheels\` 后运行 `setup.cmd -WheelsDir wheels`。
