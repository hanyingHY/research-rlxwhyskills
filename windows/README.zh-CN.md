# OpenDirector for Windows（Windows 桌面版）

[English](README.md) | 简体中文

双击桌面图标，OpenDirector 就会在自己的窗口里打开。窗口里显示的，与你在命令行执行
`opendirector serve` 后浏览器打开 `http://127.0.0.1:8000` 看到的**完全相同**：同一套画布、
时间线、编辑面板、图像预设、Agent 对话与导出功能。这个安装包只补上了浏览器标签页做不到的事：
安装运行环境、启动本地服务、打开窗口、关闭窗口时干净地收尾。

**不需要**你自己安装 Python、Node.js、Git 或 FFmpeg。

## 安装（只需一次）

1. 把本压缩包解压到一个你想长期保留的位置，例如 `C:\Users\<你>\OpenDirector`。
2. 双击 **`setup.cmd`**。
   它会下载一份专属的 Python 运行环境，安装 OpenDirector 与 FFmpeg，然后在桌面和开始菜单
   创建 **OpenDirector** 快捷方式。首次安装需要几分钟，并需要联网。
3. 双击桌面上的 **OpenDirector**。

不会向系统全局安装任何东西，也不需要管理员权限。

## 使用

- 双击桌面 **OpenDirector** → 打开一个独立窗口（Microsoft Edge 或 Google Chrome 的应用模式：
  没有地址栏、没有标签页，任务栏上是独立条目）。
- 关闭该窗口会自动停止本地服务。你的内容已经保存在数据目录中。
- 想看到启动过程或排查问题，请运行 **`app\OpenDirector.cmd`**：它会保留一个控制台窗口，
  显示进度和错误。

## 文件都存在哪里

| 内容 | 位置 | 卸载时会删除吗 |
| --- | --- | --- |
| 项目、素材、模型凭据、缓存 | `%APPDATA%\OpenDirector\data` | **不会** |
| 日志 | `%APPDATA%\OpenDirector\logs` | 不会 |
| 界面偏好、上次使用的端口 | `%APPDATA%\OpenDirector\state.json` | 不会 |
| 专属 Python 运行环境、FFmpeg | 应用目录下的 `runtime\`、`bin\` | 会 |

如果你想把项目放到别处，启动前设置 `OPENDIRECTOR_ROOT` 环境变量即可。

## 更新、修复、卸载

| 需求 | 做法 |
| --- | --- |
| 更新 OpenDirector | 双击 **`update.cmd`** |
| 检查安装状态 | `app\OpenDirector.cmd --check` |
| 重建运行环境 | `app\OpenDirector.cmd --install --force` |
| 卸载 | 右键 **`app\uninstall.ps1`** →“使用 PowerShell 运行”（项目会保留） |

## 常见问题

启动器输出的所有信息都会写入 `%APPDATA%\OpenDirector\logs\launcher-<日期>.log`。

| 提示 | 处理办法 |
| --- | --- |
| 没有可用的 Python 运行环境 | 重新运行 `setup.cmd`。它会下载专属运行环境；没有它就无法启动。 |
| 本地端口被占用 | 多半是另一个 OpenDirector 还在运行：关掉它，或用 `app\OpenDirector.cmd --port 8010` 启动。 |
| 安装 OpenDirector 失败 | 检查网络与代理。企业网络下先设置镜像：`set OPENDIRECTOR_PIP_INDEX_URL=https://your-mirror/simple`，再运行 `setup.cmd`。 |
| 本地服务启动后立即退出 | 打开最新日志，最后几行就是原因（通常是依赖缺失或数据目录不可写），然后执行 `app\OpenDirector.cmd --install --force`。 |
| 缺少界面文件 | 服务在运行但没有界面产物：`app\OpenDirector.cmd --install --force`。 |
| 没有找到可用的浏览器 | 安装 Microsoft Edge 或 Google Chrome，或自行打开提示中的地址。 |
| 生成或导出很慢 | 生成使用你在“设置 → 模型连接”里配置的服务；本安装包不包含任何模型。 |

## 进阶用法

```
app\OpenDirector.cmd --port 8010              # 固定端口
app\OpenDirector.cmd --data-dir D:\MyFilms    # 项目放到其他盘
app\OpenDirector.cmd --check                  # 输出诊断信息后退出
app\OpenDirector.cmd --install --force        # 重建运行环境
app\OpenDirector.cmd update                   # 升级 OpenDirector
app\OpenDirector.cmd --no-browser             # 只启动本地服务
```

离线安装：把 OpenDirector 及其依赖的 wheel 放到 `setup.cmd` 旁边的 `wheels\` 目录，
然后执行 `setup.cmd -WheelsDir wheels`，整个过程不会访问任何包索引。

从源码运行（开发者）：`python app\opendirector_app.py --source C:\src\OpenDirector`

## 会安装哪些东西

- **Python 3.12（嵌入式版）** —— 仅 OpenDirector 使用，PSF 许可
- **OpenDirector** 及其 Python 依赖 —— Apache-2.0
- **FFmpeg / ffprobe**（含 `libx264`） —— GPL v3 静态构建；用于媒体探测与 MP4 导出
- **psutil** —— BSD-3-Clause；用于可靠地停止本地服务

完整清单见 `THIRD-PARTY-NOTICES.txt`。本包**不**分发 Microsoft Edge 或 Google Chrome，
应用窗口使用的是你电脑上已安装的浏览器。

## 生成单文件安装程序

在装有 7-Zip（或 IExpress）的 Windows 机器上，在本目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File app\make-exe.ps1
```

会生成 `packages\OpenDirector-Setup.exe`，自解压后执行的内容与 `setup.cmd` 完全一致。

## 验收说明

测试过的平台、安装包会安装哪些组件、升级与卸载时的数据保留策略，以及每种失败情形下
的确切表现，都记录在 [`docs/acceptance.zh-CN.md`](docs/acceptance.zh-CN.md)
（[English](docs/acceptance.md)）。
