# 06 · 桌面产品化：引导、设置、更新与发布

本文记录「可以直接下载安装」这一阶段的实现细节。阶段一的分析与 RFC 判断见
[`01`](01-project-analysis.md)～[`05`](05-issue-comment-draft.md)，本文只写产品化增量。

## 1. 目标与非目标

目标：

1. 用户从 GitHub 下载对应系统的安装包，双击后得到**与网页版完全一致**的创作画布；
2. 第一次打开就能用：不需要终端、不需要自己安装 Python/FFmpeg、不需要读文档；
3. 每个功能在正确的时机获得一次解释，之后不再打扰；
4. 中英文一致，数据留在本机，升级/卸载不丢项目。

非目标（有意留给上游或后续版本）：

- 不复制 Web UI 的代码，也不改上游业务逻辑；
- 不承诺未签名安装包能自动升级；
- 不在桌面壳里重新实现模型调用、时间线或导出。

## 2. 「完全替代网页版」的边界

桌面版与网页版的差异只有外壳：

| 层 | 网页版 | 桌面版 |
| --- | --- | --- |
| 界面与交互 | 浏览器打开 `:8000` | 同一份构建产物，加载在 `od://app/` |
| API | 相对路径 `/api…` + `X-OpenDirector-Request` | 同一请求，经主进程代理到 `127.0.0.1:<随机端口>` |
| 认证 | 无（本机回环） | 每次启动的 Bearer token，只存在于主进程 |
| 存储 | 浏览器 `localStorage` | `od://` 稳定 origin，等价于网页版且跨端口保留 |
| 文件保存 | 浏览器下载 | 系统保存对话框（`will-download` 设置默认路径） |
| 附加能力 | — | 原生菜单、F1 帮助、数据目录、自动更新、诊断复制 |

因此「功能相同」不是承诺，而是结构事实：两端跑的是同一份前端与同一套 API。
桌面壳新增的只有 `window.opendirectorDesktop` 这一组只读能力，Web UI 不使用它也不会退化。

## 3. 引导系统

### 3.1 状态机

```
settings.onboarding = { completed, tourDone, language, startedAt, skipped }

未完成欢迎  ──「开始」──▶  导览  ──完成/跳过──▶  就绪（按需提示）
     │                        ▲
     └──「直接进入」──────────┘（completed=tourDone=true）

F1 / 菜单「重播使用引导」可从任意状态重新进入导览（不改写历史偏好）
```

| 状态 | 触发 | 界面 |
| --- | --- | --- |
| `welcome` | `completed=false` | 居中欢迎卡片：数据位置、四条卖点、语言切换、「开始 / 直接进入」 |
| `tour` | `completed=true && tourDone=false` | 7 步锚定导览（模型已配置时 6 步） |
| `ready` | 两者都为 true | 每 5 秒评估一次提示条件；仅显示第一条符合条件的 |

状态在 `od:guide-settings` 中经主进程 `sanitizeSettings` 落盘，渲染进程无法写入任意键。

### 3.2 导览步骤与锚点

| # | 主题 | 锚点（按优先级） | 位置 |
| --- | --- | --- | --- |
| 1 | 同一套画布 | 无（居中） | center |
| 2 | 工程 | `.cw-project-heading` → `.cw-topbar` | bottom |
| 3 | 连接模型（`!hasModels`） | `.cw-empty button` → `.cw-settings-control button` | right |
| 4 | 对话助手 | `.cw-chat-button` | top |
| 5 | 画布工具栏 | `.cw-rail` | right |
| 6 | 导出 | `.cw-top-actions` → `.cw-topbar` | bottom |
| 7 | 帮助入口 | 无（居中） | center |

- 锚点来自上游已发布的类名，不依赖组件内部状态；`firstVisible` 会跳过隐藏或零尺寸元素；
- 元素不在视口内时先 `scrollIntoView`，卡片定位在 `resize`/`scroll` 时重新计算并夹在视口内；
- 找不到任何锚点 → 卡片居中，引导继续，不阻塞；
- 第 3 步的「打开模型设置」按钮会真的点击目标控件（先关闭引导，再 `click()`），
  用户不会停在「请你自己去找」的提示上。

### 3.3 渐进提示（progressive disclosure）

| 提示 | 条件 | 优先级 |
| --- | --- | --- |
| 还差一步：连接模型 | `!facts.hasModels` | 100 |
| 想先看看效果？（示例工程） | `.cw-empty` 可见 | 90 |
| 渲染前的小提醒 | `.cw-timeline-dialog` 可见 | 80 |
| 让助手直接动手 | `#canvas-assistant` 可见 | 70 |
| 导出文件去了哪里 | 恒定（最后出现） | 40 |

- 同一时间只有一张提示卡；`seen` 记录后不再出现，`dismissed` 表示「不再显示」；
- 触发选择器通过 `MutationObserver` 观察，700 ms 去抖，最多每 24 秒出现一次；
- 提示不遮罩页面（`pointer-events: none` 的宿主），点击卡片外部不会误触；
- 帮助中心可「重置所有提示」，用于演示或排障。

### 3.4 帮助中心（F1）

分区：快速开始（5 条）、桌面能力（6 条）、常见问题（4 条）。支持中英文关键词搜索
（标题 + 正文 + 关键词），无结果时给出明确空态。

可执行动作：打开模型设置、打开项目数据目录、打开日志、检查更新、复制诊断、重播导览、
重置提示。诊断文本只含版本、平台、路径与 Host 状态，**不含 token、密钥或请求正文**。

### 3.5 实现方式与降级

- 引导 UI 挂载在 preload 创建的 `#opendirector-guide-root` Shadow DOM 中：不受应用 CSS 影响，
  也不污染应用样式；React 重渲染不会移除它。
- 主进程通过 `od:guide-command` 下发 `help / tour / shortcuts`，菜单与按钮走同一条路径。
- `document.documentElement.dataset.locale` 变化（应用内语言切换）会触发引导同步切换。
- 语言优先级：桌面设置 → `<html data-locale>` → `navigator.language` → `en-US`。
- 浏览器/加载失败时 `waitForApp` 最多等 90 秒；Host 起不来时由错误页接管，引导不叠加弹窗。
- 无障碍：`role="dialog"`、`aria-modal`、焦点进入卡片、Tab 循环、`Esc` 关闭、
  `prefers-reduced-motion` 下关闭动画。

## 4. 设置模型

`src/settings.js`，文件位于应用数据目录的 `desktop-settings.json`。

| 键 | 类型 | 说明 |
| --- | --- | --- |
| `onboarding.completed/tourDone/skipped` | bool | 引导状态 |
| `onboarding.language` | `zh-CN｜en-US｜null` | 用户显式选择；null 表示跟随系统 |
| `onboarding.startedAt` | ISO 字符串 | 首次完成欢迎的时间 |
| `tips.dismissed/seen` | string[] | 去重、限长、只接受字符串 |
| `storage.dataRoot` | 绝对路径｜null | 「更改项目数据目录」写入；重启生效 |
| `window.*` | number/null/bool | 窗口位置与最大化；尺寸夹在 960×640 以上 |
| `updates.autoCheck/channel/lastCheck` | bool/枚举/ISO | 更新通道 `stable｜beta` |

约束：

- 读取时逐字段校验（`sanitizeSettings`），损坏或未知字段回落到默认值并记一条 warning；
- 写入使用 `tmp` + rename，避免断电留下半个 JSON；
- 深合并时拒绝 `__proto__` / `constructor` / `prototype`；
- 文件可删除，删除即重置引导与窗口记忆，不影响项目数据。

## 5. 窗口、单实例与退出

- 单实例锁在读取任何 profile 之前获取；第二次启动只聚焦已有窗口并发送 `focus` 命令。
- 窗口位置/大小/最大化在 `resize/move/close` 时去抖 600 ms 保存；`getNormalBounds()` 避免把最大化尺寸写回。
- `visible` 由 `ready-to-show` 控制，避免白屏闪烁；启动页自带品牌、分阶段文案与进度条（无脚本，CSP 允许内联样式）。
- 关闭窗口：macOS 隐藏窗口保留 Host；其他平台进入退出流程。
- 退出：查 `/api/desktop/status` → 有任务时说明会中断的内容 → 优雅停止 Host（控制通道 → SIGTERM → SIGKILL）。
- `backgroundThrottling: false`：切到其他应用时时间线预览与导出不被节流。

## 6. 自动更新

```
打包时：electron-builder 依据 publish 配置写入 resources/app-update.yml（GitHub provider）
运行中：启动 8 秒后静默检查（可在设置关闭）→ 发现新版 → 询问「下载 / 稍后」
       → 下载完成 → 「重启并安装 / 稍后」
```

| 场景 | 行为 |
| --- | --- |
| 开发运行（未打包） | 不支持，提示原因 |
| 安装了 `app-update.yml` | 走 GitHub Releases；`channel=beta` 时允许预发布 |
| 设置了 `UPDATE_FEED_URL` | 覆盖为 generic provider（`…/beta` 子目录用于 beta 通道） |
| Linux 非 AppImage | 明确提示「请下载新安装包」，不假装支持 |
| 未签名 | 校验失败时提示「安装已签名版本」，不静默失败 |

更新检查不会在下载/安装前中断任务；`quitAndInstall` 只在用户确认后调用。

## 7. 构建与发布流水线

脚本职责（均可用 `node scripts/<name>.mjs --help` 查看头部注释）：

| 脚本 | 输入 | 输出 |
| --- | --- | --- |
| `prepare-source.mjs` | 上游 tag | `runtime/src/OpenDirector-<ver>`（审计/开发用） |
| `fetch-python.mjs` | target | `runtime/dist/.python/<target>-python` |
| `fetch-ffmpeg.mjs` | target 或 `--from` | `runtime/dist/.ffmpeg/<target>-bin` |
| `prepare-runtime.mjs` | python + wheels + ffmpeg + target | `runtime/dist/<target>/`（含 `manifest.json`） |
| `verify-runtime.mjs` | runtime | 真实启动 Host 的 PASS/FAIL |
| `build-preload.mjs` | `src/preload` + `src/guide` | `dist/preload.cjs` |

`prepare-runtime` 会校验解释器可执行、`import opendirector, opendirector_api` 成功、
记录 Python/OpenDirector/FFmpeg 版本与文件清单；跨平台构建必须显式 `--cross`，并标注未验证。

发布矩阵（`.github/workflows/desktop-release.yml`）：

| Runner | target | 产物 |
| --- | --- | --- |
| ubuntu-22.04 | linux-x64 | AppImage / deb / rpm |
| ubuntu-24.04-arm | linux-arm64 | AppImage / deb / rpm |
| macos-15-intel | mac-x64 | dmg / zip |
| macos-14 | mac-arm64 | dmg / zip |
| windows-2022 | win-x64 | NSIS exe |

每个 job 单独 checkout 上游并 `pip wheel`（因为 wheel 内含平台相关的 OpenCode 二进制），
因此不能交叉复用 wheel；`runtime/dist` 不进入 Git。

产物命名：`OpenDirector-<version>-<os>-<arch>.<ext>`；同时上传 `latest.yml` /
`latest-mac.yml` / `latest-linux.yml` 供自动更新使用。

发布步骤：

1. 改 `package.json` 版本（与内置上游版本一致）；
2. `git tag v<version> && git push origin v<version>`；
3. 等工作流结束，release 从 draft 转正；
4. 下载页（GitHub Pages 部署 `site/index.html`）与自动更新同时生效。

> `electron-builder` 默认按 `v<version>` 创建 release。若你的 fork 已存在同名 tag，
> 会复用该 release，把桌面产物作为附件上传。

## 8. 真机验收清单

发布前在一台干净机器上逐项确认（对照 RFC 验收）：

- [ ] 安装包签名/未签名提示符合预期，首次启动 < 10 秒（SSD）；
- [ ] 欢迎页 → 导览 → 画布，不跳过任何一步也能继续；
- [ ] 未配置模型时有提示且能直接打开设置；配置后不再出现；
- [ ] 新建工程 → 生成一张图 → 拖入时间线 → 导出 MP4 → 重开应用工程仍在；
- [ ] 导出期间切到其他应用不中断；退出时若有任务会提示；
- [ ] 更改数据目录后重启，工程仍在旧目录（提示语义正确）；
- [ ] `F1` / `?` / 菜单三处入口一致；英文系统下全英文；
- [ ] 升级到新版本后引导不重复、窗口位置保留、项目未变；
- [ ] 卸载后 `~/.opendirector` 仍在；日志目录可单独删除；
- [ ] Linux 下 AppImage 能自更新，deb 安装版提示手动更新。

## 9. 需要上游配合的部分

1. **稳定选择器**：给工程标题、设置入口、助手按钮、工具栏、导出区加 `data-guide="…"`，
   避免类名重构破坏导览（当前已做居中降级）。
2. **任务状态接口**：`/api/desktop/status` 目前只有工具任务；Agent 轮次与生成任务需要正式字段，
   退出提示才能完整。
3. **版本映射**：若桌面壳需要独立版本号，需约定 `desktopVersion` 与 `coreVersion` 的兼容矩阵；
   当前选择「两者相等」以简化升级与支持判断。
4. **签名与公证**：正式分发需要 Apple Developer ID 与 Windows 代码签名证书；
   未签名版本无法验证自动更新链路。
