# Windows 分发（D3）——构建与发布手册

[English](windows-distribution.md) | 简体中文

路线图：[D3 · Windows 分发](https://github.com/ThinkFlowLab/OpenDirector/issues/365)。

## 1. 本轮范围

| 项目 | 状态 |
| --- | --- |
| 架构 | 仅 x64。Windows ARM64 受限于嵌入式 CPython 构建，尚未验证 |
| 格式 | NSIS 安装包（按用户）、免安装版、zip 压缩包 |
| 安装界面语言 | 英文、简体中文（`installerLanguages`） |
| 内置运行环境 | CPython 3.12 嵌入式版 + OpenDirector + FFmpeg/ffprobe（含 libx264） |
| 签名 | 可选，由环境变量驱动（`CSC_LINK` + `CSC_KEY_PASSWORD`）；**CI 不签名** |
| 自动更新 | 未接入（D5）。`publish: null`，外壳不含更新器 |
| Windows 主机实测 | 尚未进行——发布前必须跑通第 5 节的门禁 |

## 2. 在一台干净的机器上构建

```powershell
git clone https://github.com/ThinkFlowLab/OpenDirector.git
cd OpenDirector\apps\desktop
powershell -ExecutionPolicy Bypass -File scripts\windows\build-installer.ps1 -SourceRoot ..\..
```

脚本按顺序执行：

1. 检查 Node.js ≥ 22.12.0；
2. `npm ci`；
3. `prepare-python-runtime.ps1` —— 下载嵌入式 CPython，在 `python312._pth` 中启用
   `site-packages`，安装 pip，从 `-SourceRoot` 构建 wheel（或从索引安装 `opendirector`、
   或用 `-WheelsDir` 离线安装），清理 `__pycache__`/pip/setuptools/wheel，最后校验
   `import opendirector_api, opendirector`；
4. `fetch-ffmpeg.ps1` —— 下载含 libx264 的静态构建到 `resources\bin`，并校验
   `-encoders` 输出包含 `libx264`；
5. `make-icon.ps1` —— 用 Pillow 或 ImageMagick 从 logo 生成 `build/icon.ico`；
6. `npm run build`，然后 `electron-builder --win --x64`；
7. 对 `release\win-unpacked` 执行 `verify-package.ps1`。

产物位于 `release/`：

```
OpenDirector-<version>-x64.exe                 # NSIS 安装包
OpenDirector-<version>-x64-portable.exe        # 免安装版
OpenDirector-<version>-x64.zip                 # 集中分发用压缩包
win-unpacked\                                  # 解包后的应用（已校验）
```

## 3. 离线 / 内网构建

```powershell
# 在有网络的机器上：
python -m pip wheel -w C:\wheels C:\src\OpenDirector
# 在构建机上：
.\scripts\windows\prepare-python-runtime.ps1 -WheelsDir C:\wheels
.\scripts\windows\build-installer.ps1 -SkipMediaTools
```

`-WheelsDir` 使用 `--no-index --find-links` 安装，不访问任何包索引。FFmpeg 需另行提供：
把 `ffmpeg.exe`/`ffprobe.exe` 复制到 `resources\bin`，并使用 `-SkipMediaTools`。

## 4. 签名

```powershell
$env:CSC_LINK = 'C:\certs\opendirector.pfx'   # 也可以是 base64 内容
$env:CSC_KEY_PASSWORD = '<password>'          # PFX 无密码时可省略
.\scripts\windows\build-installer.ps1
```

electron-builder 会为安装包、应用主程序以及解包后的二进制文件签名
（`signAndEditExecutable: true`）。CI 不得持有证书：工作流设置
`CSC_IDENTITY_AUTO_DISCOVERY=false`，只产出未签名产物。发布流水线中的签名应使用专用
runner，或采用硬件 EV 证书。

## 5. 发布门禁（在干净的 Windows 机器上执行）

需要附到 D3 issue 的证据：测试过的 Windows 版本与内部版本号、架构、包格式、
内置运行环境版本（`resources\python-runtime\RUNTIME.txt`、`resources\bin\MEDIA-TOOLS.txt`）
以及签名状态。

1. **安装**：以标准用户（非管理员）运行 NSIS 安装包；确认桌面/开始菜单快捷方式，
   并且在未预装 Python、Node.js、FFmpeg 的情况下可以启动。
2. **创建 → 生成 → 编辑 → 导出**：创建项目，配置模型后跑通一次 Agent 辅助流程，
   编辑素材，导出 MP4（确认保存对话框，且使用 `libx264`），再导出 JSON/FCPXML。
3. **重新打开**：退出后再次启动，确认项目、上次打开的画布、主题与界面语言均未变化
   （它们保存在回环源与 `%APPDATA%\OpenDirector` 中）。
4. **中英文**：切换“视图 → 界面语言”并重启，菜单、启动阶段、失败提示与后端回执都随
   之变化；制造一次失败（用 `netsh` 占用端口或停掉服务），确认提示已本地化且四个按钮可用。
5. **升级**：安装旧版本并创建项目，再覆盖安装新版本，确认项目与模型凭据保留、
   数据目录没有迁移。
6. **卸载**：卸载后确认 `%APPDATA%\OpenDirector\data` 与 `logs` 仍然存在，
   重新安装后可以再次打开项目。
7. **中断**：启动生成或导出后关闭窗口，应出现退出保护提示；选择“仍然退出”会停止服务，
   且任务管理器中没有残留的 `python.exe`/`ffmpeg.exe`。
8. **启动失败**：重命名 `resources\python-runtime` 后启动，应出现 `runtime_missing`
   失败窗口与处理建议；恢复目录后点“重试”即可启动。
9. **免安装版**：从 U 盘运行 `OpenDirector-<version>-x64-portable.exe`，用户数据写入
   `%APPDATA%\OpenDirector`，而不是可执行文件旁边。

## 6. 发布 NOTICE 中需要同步的许可信息

- CPython（PSF 许可）—— `resources\python-runtime`
- FFmpeg/ffprobe（默认 gyan.dev essentials 构建为 GPL v3；若项目有要求，请改用 LGPL 构建）
- Electron 与 Chromium（MIT 及随附的第三方许可）
- 仓库 `NOTICE` 中已列出的网页产物相关许可

## 7. 留给 RFC 决策的问题

- 除 Windows x64 之外的初始操作系统与架构矩阵（是否支持 ARM64？是否支持 Windows 10？）
- 签名证书归属，以及是否发布未签名的 nightly 构建
- D5 的更新通道与托管方式（当前 `publish` 已关闭）
