/**
 * In-product guidance content: first-run onboarding, the tour, progressive
 * tips and the desktop help centre.
 *
 * Selectors target the published Web UI's stable class names. Every selector
 * list is ordered from most to least specific; a step with no visible anchor is
 * shown centred instead of failing.
 */

const pair = (zh, en) => ({ "zh-CN": zh, "en-US": en });

export function text(locale, value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value[locale] ?? value["en-US"] ?? value["zh-CN"] ?? "";
}

export const APP_NAME = "OpenDirector";

export const MESSAGES = {
  "zh-CN": {
    welcomeTitle: "欢迎使用 OpenDirector 桌面版",
    welcomeSubtitle: "和网页版同一套创作画布，现在是一个完整的桌面应用。",
    welcomeBody:
      "本地服务、Agent 运行时和媒体工具都已经打包在应用里。项目、素材与模型配置只保存在这台电脑上。",
    startSetup: "开始",
    skipSetup: "直接进入",
    tourTitle: "用 3 分钟了解桌面版",
    tourBody: "带你走一遍工程、模型、对话、画布和导出。随时可以按 Esc 退出。",
    startTour: "开始引导",
    later: "稍后",
    next: "下一步",
    back: "上一步",
    done: "开始创作",
    skipTour: "跳过引导",
    stepOf: (index, total) => `第 ${index} 步，共 ${total} 步`,
    helpTitle: "桌面版使用指引",
    helpSubtitle: "渐进式提示、桌面能力与常见问题",
    searchPlaceholder: "搜索功能、快捷键或问题…",
    noResults: "没有找到匹配内容，换个关键词试试。",
    close: "关闭",
    shortcutHint: "按 F1 随时打开，按 Esc 关闭",
    replayTour: "重播使用引导",
    resetTips: "重置所有提示",
    openData: "打开项目数据目录",
    openLogs: "打开日志目录",
    checkUpdates: "检查更新",
    copyDiagnostics: "复制诊断信息",
    copied: "诊断信息已复制",
    version: "版本",
    dataRoot: "项目数据",
    logs: "日志",
    tipDone: "知道了",
    tipLater: "稍后",
    dontShow: "不再显示",
    offlineNote: "生成功能需要网络；除此之外，编辑和整理完全在本机完成。",
    settingsCta: "打开模型设置",
    exampleCta: "打开示例工程",
    diagnosticsTitle: "桌面信息",
  },
  "en-US": {
    welcomeTitle: "Welcome to OpenDirector Desktop",
    welcomeSubtitle: "The same creation canvas as the web app, now a complete desktop application.",
    welcomeBody:
      "The local service, agent runtime and media tools are bundled. Projects, assets and model settings stay on this computer.",
    startSetup: "Get started",
    skipSetup: "Go straight in",
    tourTitle: "Learn the desktop app in 3 minutes",
    tourBody: "A quick walk through projects, models, chat, canvas and export. Press Esc to leave any time.",
    startTour: "Start the tour",
    later: "Later",
    next: "Next",
    back: "Back",
    done: "Start creating",
    skipTour: "Skip the tour",
    stepOf: (index, total) => `Step ${index} of ${total}`,
    helpTitle: "Desktop guide",
    helpSubtitle: "Progressive tips, desktop features and troubleshooting",
    searchPlaceholder: "Search features, shortcuts or problems…",
    noResults: "Nothing matched. Try another keyword.",
    close: "Close",
    shortcutHint: "F1 opens this guide; Esc closes it",
    replayTour: "Replay the tour",
    resetTips: "Reset all tips",
    openData: "Open project data folder",
    openLogs: "Open log folder",
    checkUpdates: "Check for updates",
    copyDiagnostics: "Copy diagnostics",
    copied: "Diagnostics copied",
    version: "Version",
    dataRoot: "Project data",
    logs: "Logs",
    tipDone: "Got it",
    tipLater: "Later",
    dontShow: "Don't show again",
    offlineNote: "Generation needs a network; everything else stays on this machine.",
    settingsCta: "Open model settings",
    exampleCta: "Open the example project",
    diagnosticsTitle: "Desktop information",
  },
};

/** First-run wizard: one screen, two choices, no dead ends. */
export const WELCOME = {
  title: pair("欢迎使用 OpenDirector 桌面版", "Welcome to OpenDirector Desktop"),
  subtitle: pair(
    "和网页版同一套创作画布，现在是一个完整的桌面应用。",
    "The same creation canvas as the web app, now a complete desktop application.",
  ),
  body: pair(
    "本地服务、Agent 运行时和媒体工具都已经打包在应用里。项目、素材与模型配置只保存在这台电脑上。",
    "The local service, agent runtime and media tools are bundled. Projects, assets and model settings stay on this computer.",
  ),
  bullets: [
    pair("不需要打开终端或浏览器", "No terminal or browser setup"),
    pair("项目默认保存在该用户的主目录，可在帮助中打开", "Projects live in your home folder; open the folder from Help"),
    pair("中英文界面，跟随系统或随时切换", "Chinese and English, following the system or switched any time"),
    pair("所有提示都可以随时重播或关闭", "Every tip can be replayed or turned off"),
  ],
  primary: pair("开始", "Get started"),
  secondary: pair("直接进入", "Go straight in"),
};

/**
 * The tour. `when` hides a step that does not apply (for example model setup
 * when models are already configured). `cta` clicks a real control.
 */
export const TOUR = [
  {
    id: "welcome",
    title: pair("这是同一套画布，换了一个更省心的外壳", "Same canvas, a calmer shell"),
    body: pair(
      "桌面版加载的就是网页版的界面与业务逻辑，所以功能完全一致；不同的是它自带运行时，不需要你自己装环境。",
      "The desktop app loads the identical interface and business logic, so the feature set matches. What changes is that the runtime ships with the app.",
    ),
    anchor: null,
    placement: "center",
  },
  {
    id: "project",
    title: pair("工程：创作从一次新建开始", "Projects: everything starts here"),
    body: pair(
      "左上角切换或新建工程。修改会自动保存到本机；桌面版和命令行共享同一个数据目录，可以接着编辑。",
      "Switch or create projects at the top left. Changes save automatically, and the desktop app and CLI share one data folder.",
    ),
    anchor: [".cw-project-heading", ".cw-topbar"],
    placement: "bottom",
  },
  {
    id: "models",
    when: (facts) => !facts?.hasModels,
    title: pair("连接模型，才能生成内容", "Connect a model to generate"),
    body: pair(
      "在设置里添加一个模型服务（对话、图像、视频或语音）。没有配置也能导入和剪辑本地素材，但生成功能需要模型。",
      "Add a model service in Settings (chat, image, video or speech). Importing and editing local media works without one; generation needs it.",
    ),
    anchor: [".cw-empty button", ".cw-settings-control button"],
    placement: "right",
    cta: pair("打开模型设置", "Open model settings"),
  },
  {
    id: "assistant",
    title: pair("用对话完成创作", "Create through conversation"),
    body: pair(
      "右侧 AI 助手可以生成素材、查询工程、编排时间线。输入 @ 引用画布素材；连按两次 Shift 也能打开对话。",
      "The assistant can generate assets, inspect the project and edit timelines. Type @ to reference canvas assets; press Shift twice to open it.",
    ),
    anchor: [".cw-chat-button"],
    placement: "top",
  },
  {
    id: "tools",
    title: pair("画布工具：从文本到时间线", "Canvas tools, from text to timeline"),
    body: pair(
      "左侧工具栏添加节点。按 T 快速加文本，把文件拖进窗口即可导入；双击画布空白处也能创建节点。",
      "Add nodes from the left rail. Press T for text, drop files into the window to import, or double-click empty canvas space.",
    ),
    anchor: [".cw-rail"],
    placement: "right",
  },
  {
    id: "export",
    title: pair("导出成片", "Export the finished film"),
    body: pair(
      "把素材拖进时间线节点并打开时间线，点击「输出视频」渲染 MP4。渲染使用本机浏览器内核，请保持窗口打开；右上角还可以导出画布与素材包。",
      "Drop media into a timeline node, open it and choose Output video to render an MP4. Rendering uses the local Chromium engine, so keep the window open. The top right also exports the canvas and asset bundle.",
    ),
    anchor: [".cw-top-actions", ".cw-topbar"],
    placement: "bottom",
  },
  {
    id: "done",
    title: pair("需要的时候，指引都在", "Help is always one key away"),
    body: pair(
      "按 F1 打开桌面版使用指引，按 ? 打开画布快捷键。你也可以在帮助里重播这次引导。",
      "Press F1 for this desktop guide and ? for canvas shortcuts. You can replay this tour from the guide any time.",
    ),
    anchor: null,
    placement: "center",
  },
];

/**
 * Progressive tips: one card at a time, each dismissible, most valuable first.
 * `trigger` is a selector that must be present; tips without one are eligible
 * immediately.
 */
export const TIPS = [
  {
    id: "models-missing",
    priority: 100,
    when: (facts) => !facts?.hasModels,
    title: pair("还差一步：连接模型", "One step left: connect a model"),
    body: pair(
      "配置一个模型服务后，就能在对话或画布中生成图像、视频和语音。整个过程只需要服务地址、模型名和密钥。",
      "Add one model service to generate images, video or speech from chat or the canvas. You only need a URL, model name and key.",
    ),
    anchor: [".cw-empty button", ".cw-settings-control button"],
    placement: "right",
    cta: pair("打开模型设置", "Open model settings"),
  },
  {
    id: "example-project",
    priority: 90,
    trigger: ".cw-empty",
    title: pair("想先看看效果？", "Want to see it working first?"),
    body: pair(
      "打开示例工程，可以直接看到分镜、素材、时间线和成片是怎么组织的。",
      "Open the example project to see how shots, assets, a timeline and a finished film fit together.",
    ),
    anchor: [".cw-empty"],
    placement: "bottom",
    cta: pair("打开示例工程", "Open example project"),
    ctaSelector: [".cw-empty button:nth-of-type(2)"],
  },
  {
    id: "assistant-mention",
    priority: 70,
    trigger: "#canvas-assistant:not([hidden])",
    title: pair("让助手直接动手", "Let the assistant do the work"),
    body: pair(
      "试试「用已配置的图像模型生成一张夜景，并放到画布上」，或者输入 @ 引用现有素材再提要求。",
      "Try “generate a night scene with my image model and place it on the canvas”, or type @ to reference existing assets.",
    ),
    anchor: ["#canvas-assistant"],
    placement: "left",
  },
  {
    id: "timeline-output",
    priority: 80,
    trigger: ".cw-timeline-dialog",
    title: pair("渲染前的小提醒", "Before you render"),
    body: pair(
      "点击「输出视频」后请保持窗口打开，渲染在本地完成。桌面版已经关闭后台节流，切到别的应用也不会中断。",
      "Keep the window open after choosing Output video: rendering happens locally. Background throttling is off, so switching apps is fine.",
    ),
    anchor: [".cw-timeline-dialog"],
    placement: "center",
  },
  {
    id: "downloads",
    priority: 40,
    title: pair("导出文件去了哪里？", "Where do exports go?"),
    body: pair(
      "每次下载都会弹出系统保存对话框，默认位置是「下载」文件夹。可以在帮助里打开项目数据目录查看全部素材。",
      "Every download asks where to save, starting in your Downloads folder. The project data folder is available from Help.",
    ),
    anchor: [".cw-top-actions"],
    placement: "bottom",
  },
];

/** Desktop help centre. Items are filtered by the search box. */
export const HELP_SECTIONS = [
  {
    id: "start",
    title: pair("快速开始", "Quick start"),
    items: [
      {
        title: pair("1 · 连接模型", "1 · Connect a model"),
        body: pair(
          "设置 → 模型连接 → 添加服务。填写服务地址、模型名和密钥，测试通过后保存。多个模型可以随时切换。",
          "Settings → Model connections → Add service. Enter the URL, model name and key, test it, then save. You can switch models at any time.",
        ),
        action: { type: "openModels", label: pair("打开设置", "Open settings") },
        keywords: "model api key 模型 密钥",
      },
      {
        title: pair("2 · 建立工程", "2 · Create a project"),
        body: pair(
          "左上角工程菜单可以新建、重命名、删除工程。工程保存在本机，桌面版与命令行共用。",
          "The project menu at the top left creates, renames and deletes projects. Projects are local and shared with the CLI.",
        ),
        keywords: "project 工程 新建",
      },
      {
        title: pair("3 · 在画布上创作", "3 · Create on the canvas"),
        body: pair(
          "从左侧工具栏添加文本、图片、视频、音频、主体或时间线节点；拖入文件即可导入素材。",
          "Add text, image, video, audio, subject or timeline nodes from the left rail, or drop files in to import.",
        ),
        keywords: "canvas node 画布 节点 素材",
      },
      {
        title: pair("4 · 用对话加速", "4 · Move faster with chat"),
        body: pair(
          "右侧助手可以生成素材、整理画布、修改时间线。输入 @ 引用素材；连按两次 Shift 打开。",
          "The assistant generates assets, organises the canvas and edits timelines. Type @ to reference assets; Shift twice opens it.",
        ),
        keywords: "assistant chat 助手 对话 @",
      },
      {
        title: pair("5 · 时间线与导出", "5 · Timeline and export"),
        body: pair(
          "把素材拖进时间线，调整起止点、速度与音量，点击「输出视频」渲染 MP4。渲染期间保持窗口打开。",
          "Drop media into a timeline, adjust timing, speed and volume, then choose Output video to render an MP4. Keep the window open while it renders.",
        ),
        keywords: "timeline export mp4 时间线 导出",
      },
    ],
  },
  {
    id: "desktop",
    title: pair("桌面能力", "Desktop features"),
    items: [
      {
        title: pair("项目数据目录", "Project data folder"),
        body: pair(
          "默认位于用户主目录下的 .opendirector，和命令行安装共享。修改前请先退出应用，避免同时写入。",
          "Lives in .opendirector in your home folder and is shared with the CLI. Quit the app before moving or editing it.",
        ),
        action: { type: "openData", label: pair("打开目录", "Open folder") },
        keywords: "data folder 数据 目录 备份 backup",
      },
      {
        title: pair("保存与下载", "Saving and downloads"),
        body: pair(
          "导出画布、素材包或成片时都会弹出系统保存对话框；取消不会留下半个文件。",
          "Exporting a canvas, asset bundle or film opens the system save dialog; cancelling leaves no partial file.",
        ),
        keywords: "download save 下载 保存",
      },
      {
        title: pair("日志与诊断", "Logs and diagnostics"),
        body: pair(
          "遇到启动或导出问题时，打开日志目录，或用「复制诊断信息」生成一份不含密钥的说明。",
          "If startup or export fails, open the log folder or copy diagnostics: it contains versions and paths, never credentials.",
        ),
        action: { type: "openLogs", label: pair("打开日志", "Open logs") },
        keywords: "log debug 日志 诊断 troubleshooting",
      },
      {
        title: pair("更新", "Updates"),
        body: pair(
          "安装包版本检查更新时不会打断正在进行的任务；macOS 与 Windows 会提示重启安装，Linux 请使用 AppImage 版本。",
          "Update checks never interrupt running work. macOS and Windows ask before restarting; on Linux use the AppImage build for updates.",
        ),
        action: { type: "checkUpdates", label: pair("检查更新", "Check now") },
        keywords: "update 更新 升级 version",
      },
      {
        title: pair("快捷键", "Keyboard shortcuts"),
        body: pair(
          "F1 打开本指引，? 打开画布帮助，T 添加文本，⌘/Ctrl + O 导入，连按两次 Shift 打开助手，Esc 关闭浮层。",
          "F1 opens this guide, ? opens canvas help, T adds text, ⌘/Ctrl + O imports, Shift twice opens the assistant, Esc closes overlays.",
        ),
        keywords: "shortcut keyboard 快捷键 f1",
      },
      {
        title: pair("单实例与数据安全", "One instance, safe data"),
        body: pair(
          "再次启动只会聚焦已有窗口，避免两个进程同时写同一个工程。退出前会检查是否有任务在运行。",
          "Launching again focuses the existing window so two processes never write one project. Quitting checks for running tasks first.",
        ),
        keywords: "instance lock 单实例 锁 安全",
      },
      {
        title: pair("开源许可与第三方声明", "Licenses and third-party notices"),
        body: pair(
          "OpenDirector 核心遵循 Apache 2.0 协议；内置多媒体工具 FFmpeg（含 libx264）遵循 GPL 协议，通过独立子进程调用；Noto Sans 字体遵循 SIL OFL 协议；mediabunny 遵循 MPL 2.0 协议。所有声明在源码 LICENSE 与 NOTICE 文件中完整提供。",
          "OpenDirector core is licensed under Apache 2.0. Bundled FFmpeg with libx264 is under GPL and invoked as an independent subprocess; Noto Sans font is under SIL OFL; mediabunny is under MPL 2.0. Full declarations are provided in the LICENSE and NOTICE files.",
        ),
        keywords: "license notice gpl ffmpeg apache mpl ofl 许可证 版权 声明 第三方",
      },
    ],
  },
  {
    id: "creator",
    title: pair("创造模式 (插件与技能)", "Creator Mode (Plugins & Skills)"),
    items: [
      {
        title: pair("自定义技能与 DeepSeek Harness 插件", "Custom skills and DeepSeek Harness plugins"),
        body: pair(
          "类比 DeepSeek Harness 与 OpenCode 插件标准，你可以在项目数据目录的 skills/ 文件夹下定义自己的插件。每个插件包含声明文件 skill.yaml 或 plugin.json 以及执行脚本，助手会自动识别并在创作中调用。",
          "Analogous to DeepSeek Harness and OpenCode plugin standards, you can create custom plugins in the skills/ folder inside your data directory. Each plugin includes a skill.yaml manifest and an executable script, which the assistant discovers automatically.",
        ),
        action: { type: "openPlugins", label: pair("打开插件目录", "Open plugins folder") },
        keywords: "plugin skill harness deepseek 插件 技能 创造",
      },
      {
        title: pair("双模式工作流切换 (简洁 / 专业)", "Dual-mode workflow switching (Simple / Pro)"),
        body: pair(
          "简洁模式默认放大右侧 Agent 对话框，通过自然语言表达需求并渐进式披露高级功能；专业模式保留完整左侧菜单与无限节点画布，供微调连线与时间线细节。按 Ctrl/Cmd+M 可随时无缝切换。",
          "Simple mode enlarges the right Agent panel for prompt-first creation with progressive disclosure; Pro mode preserves the full left rail and infinite canvas nodes for manual fine-tuning. Press Ctrl/Cmd+M to switch seamlessly.",
        ),
        action: { type: "toggleMode", label: pair("切换工作区模式", "Toggle mode") },
        keywords: "mode simple pro agent ide 模式 简洁 专业",
      },
    ],
  },
  {
    id: "faq",
    title: pair("常见问题", "Troubleshooting"),
    items: [
      {
        title: pair("导出失败或按钮不可用", "Export fails or is unavailable"),
        body: pair(
          "确认窗口在前台且没有关闭；检查素材是否可读、磁盘是否有空间。具体原因见日志目录中的 host.log 与 desktop.log。",
          "Keep the window open and in the foreground, check that media is readable and the disk has space. Details are in host.log and desktop.log.",
        ),
        keywords: "export fail 导出 失败 mp4",
      },
      {
        title: pair("生成超时或连接失败", "Generation times out"),
        body: pair(
          "如果系统代理影响了模型请求，在设置 → 模型连接 → 编辑服务 → 高级连接中改为「直连（不使用代理）」。",
          "If a system proxy interferes, open Settings → Model connections → Edit service → Advanced connection and choose Direct (no proxy).",
        ),
        keywords: "proxy timeout 代理 超时 网络",
      },
      {
        title: pair("找不到之前的工程", "A project is missing"),
        body: pair(
          "先确认数据目录：帮助里显示的实际路径。命令行安装默认也是 ~/.opendirector；源码安装可能指向仓库目录。",
          "Check the data folder shown in Help. CLI installs default to ~/.opendirector; a source checkout may store projects in the repository.",
        ),
        action: { type: "openData", label: pair("打开数据目录", "Open data folder") },
        keywords: "missing project 工程 丢失 路径",
      },
      {
        title: pair("隐私", "Privacy"),
        body: pair(
          "项目与素材不上传；只有你配置的模型服务会收到生成请求。日志不记录密钥与请求正文。",
          "Projects and media are never uploaded. Only the model services you configure receive requests. Logs contain no keys or request bodies.",
        ),
        keywords: "privacy 隐私 上传 安全",
      },
    ],
  },
];
