/** Shell strings for the desktop host.
 *
 * The workspace itself keeps its own bilingual catalog and its own language
 * preference in `localStorage`. These strings cover only what the browser cannot
 * show: startup progress, startup failures, the native menu, and quit guards.
 * Both languages ship together; `missingKeys()` keeps them in step. */

import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  type Locale,
} from "../shared/contracts";

interface Catalog {
  [key: string]: string;
}

/** Interpolates `{name}` placeholders and keeps unknown keys visible instead of blank. */
export function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

const ZH_CN: Catalog = {
  "app.name": "OpenDirector",

  "stage.resolving-runtime": "正在准备本地运行环境…",
  "stage.provisioning-environment": "正在首次安装本地运行环境…",
  "stage.reserving-port": "正在分配本地端口…",
  "stage.starting-backend": "正在启动本地服务…",
  "stage.waiting-for-backend": "正在等待本地服务就绪…",
  "stage.opening-window": "正在打开创作画布…",
  "stage.ready": "就绪",
  "stage.failed": "启动失败",

  "loading.title": "OpenDirector",
  "loading.subtitle": "本地创作画布",
  "loading.firstRun": "首次启动需要安装本地运行环境，请保持网络畅通。",
  "loading.hint": "正在准备本地服务，请稍候…",

  "failure.title": "OpenDirector 无法启动",
  "failure.detail": "技术细节",
  "failure.logTail": "最近的日志",

  "failure.runtime_missing.summary": "没有找到可用的 Python 运行环境，也没有找到 OpenDirector 服务。",
  "failure.runtime_missing.remedy":
    "请重新安装 OpenDirector 桌面版；如果你是从源码运行，请在源码目录执行 pip install -e .，或用 OPENDIRECTOR_PYTHON 指定已安装 opendirector 的 Python。",
  "failure.runtime_version.summary": "Python 版本过低：OpenDirector 需要 Python 3.11 或更高版本。",
  "failure.runtime_version.remedy": "请安装 Python 3.11 或更高版本后重新启动；如需指定解释器，可设置 OPENDIRECTOR_PYTHON。",
  "failure.provision_failed.summary": "首次安装本地运行环境失败。",
  "failure.provision_failed.remedy": "请检查网络与代理设置后重试；企业网络下可用 OPENDIRECTOR_PIP_INDEX_URL 指定镜像源。",
  "failure.port_unavailable.summary": "本地端口被占用，无法启动本地服务。",
  "failure.port_unavailable.remedy": "请关闭占用该端口的程序后重试；若端口被其他 OpenDirector 实例占用，请先退出它。",
  "failure.backend_exited.summary": "本地服务启动后立即退出。",
  "failure.backend_exited.remedy": "请查看下方日志；常见原因是依赖缺失或数据目录不可写。修复后点击重试。",
  "failure.backend_timeout.summary": "等待本地服务就绪超时。",
  "failure.backend_timeout.remedy":
    "本机性能或安全软件可能拖慢了启动。请稍候重试；若持续出现，请查看日志并把日志内容附到问题反馈中。",
  "failure.web_resources_missing.summary": "缺少前端资源，本地服务无法提供页面。",
  "failure.web_resources_missing.remedy": "请重新安装 OpenDirector 桌面版；源码运行请先执行 pip install -e . 以生成前端产物。",
  "failure.dependency_missing.summary": "本地服务缺少依赖模块。",
  "failure.dependency_missing.remedy": "请重新安装 OpenDirector 桌面版；源码运行请在虚拟环境中执行 pip install -e . 后重试。",
  "failure.renderer_failed.summary": "无法连接到本地服务，页面加载失败。",
  "failure.renderer_failed.remedy": "请点击重试重新连接；若服务已退出，桌面端会自动重新启动它。",
  "failure.unknown.summary": "启动过程中出现未知错误。",
  "failure.unknown.remedy": "请点击重试；若仍然失败，请打开日志目录并把最新日志附到问题反馈中。",

  "action.retry": "重试",
  "action.quit": "退出",
  "action.openLogs": "打开日志目录",
  "action.copy": "复制诊断信息",
  "action.guide": "查看安装指南",
  "action.copied": "诊断信息已复制",

  "menu.file": "文件",
  "menu.openData": "打开项目目录",
  "menu.openLogs": "打开日志目录",
  "menu.restartBackend": "重新启动本地服务",
  "menu.quit": "退出",
  "menu.edit": "编辑",
  "menu.undo": "撤销",
  "menu.redo": "重做",
  "menu.cut": "剪切",
  "menu.copy": "复制",
  "menu.paste": "粘贴",
  "menu.selectAll": "全选",
  "menu.view": "视图",
  "menu.reload": "重新加载",
  "menu.forceReload": "强制重新加载",
  "menu.devtools": "切换开发者工具",
  "menu.zoomIn": "放大",
  "menu.zoomOut": "缩小",
  "menu.zoomReset": "实际大小",
  "menu.fullscreen": "切换全屏",
  "menu.language": "界面语言",
  "menu.languageZh": "简体中文",
  "menu.languageEn": "English",
  "menu.window": "窗口",
  "menu.minimize": "最小化",
  "menu.close": "关闭",
  "menu.help": "帮助",
  "menu.guide": "使用指南",
  "menu.issue": "反馈问题",
  "menu.about": "关于 OpenDirector",

  "about.title": "关于 OpenDirector",
  "about.message":
    "OpenDirector {appVersion}\n本地服务：{backendUrl}\n运行环境：{runtime}\n数据目录：{data}",

  "quit.title": "仍有任务在进行",
  "quit.message": "有 {count} 个生成或导出任务尚未结束。现在退出会中断它们。",
  "quit.keepWorking": "继续等待",
  "quit.quitAnyway": "仍然退出",

  "download.title": "保存导出文件",

  "notify.backendRestarted": "本地服务已重新启动。",
  "notify.backendRestartFailed": "本地服务重启失败，请查看日志。",
};

const EN_US: Catalog = {
  "app.name": "OpenDirector",

  "stage.resolving-runtime": "Preparing the local runtime…",
  "stage.provisioning-environment": "Installing the local runtime (first launch)…",
  "stage.reserving-port": "Reserving a local port…",
  "stage.starting-backend": "Starting the local service…",
  "stage.waiting-for-backend": "Waiting for the local service…",
  "stage.opening-window": "Opening the creation canvas…",
  "stage.ready": "Ready",
  "stage.failed": "Startup failed",

  "loading.title": "OpenDirector",
  "loading.subtitle": "A local creation canvas",
  "loading.firstRun": "The first launch installs the local runtime; keep the network connected.",
  "loading.hint": "Preparing the local service, please wait…",

  "failure.title": "OpenDirector could not start",
  "failure.detail": "Technical details",
  "failure.logTail": "Recent log output",

  "failure.runtime_missing.summary":
    "No usable Python runtime and no OpenDirector service were found.",
  "failure.runtime_missing.remedy":
    "Reinstall the OpenDirector desktop app. When running from a source checkout, run pip install -e . in that directory, or set OPENDIRECTOR_PYTHON to a Python that already has OpenDirector installed.",
  "failure.runtime_version.summary": "The Python version is too old; OpenDirector needs Python 3.11 or newer.",
  "failure.runtime_version.remedy":
    "Install Python 3.11 or newer and start again, or set OPENDIRECTOR_PYTHON to a supported interpreter.",
  "failure.provision_failed.summary": "Installing the local runtime for the first launch failed.",
  "failure.provision_failed.remedy":
    "Check your network and proxy settings, then retry. On a corporate network set OPENDIRECTOR_PIP_INDEX_URL to a reachable mirror.",
  "failure.port_unavailable.summary": "The local port is already in use, so the local service cannot start.",
  "failure.port_unavailable.remedy":
    "Close the program that holds the port and retry. If another OpenDirector instance owns it, quit that instance first.",
  "failure.backend_exited.summary": "The local service exited immediately after starting.",
  "failure.backend_exited.remedy":
    "Check the log below; missing dependencies and an unwritable data directory are the usual causes. Fix the cause, then choose Retry.",
  "failure.backend_timeout.summary": "Timed out waiting for the local service to become ready.",
  "failure.backend_timeout.remedy":
    "Machine performance or security software may have slowed the start. Wait a moment and retry. If it keeps happening, open the logs and attach the newest file to your issue report.",
  "failure.web_resources_missing.summary": "Web resources are missing, so the local service cannot serve the page.",
  "failure.web_resources_missing.remedy":
    "Reinstall the OpenDirector desktop app. From a source checkout, run pip install -e . first so the web build exists.",
  "failure.dependency_missing.summary": "The local service is missing a dependency module.",
  "failure.dependency_missing.remedy":
    "Reinstall the OpenDirector desktop app. From a source checkout, run pip install -e . inside your virtual environment and retry.",
  "failure.renderer_failed.summary": "The page could not load because the local service is unreachable.",
  "failure.renderer_failed.remedy":
    "Choose Retry to reconnect. If the service has exited, the desktop app restarts it automatically.",
  "failure.unknown.summary": "An unknown error occurred during startup.",
  "failure.unknown.remedy":
    "Choose Retry. If it still fails, open the log directory and attach the newest log to your issue report.",

  "action.retry": "Retry",
  "action.quit": "Quit",
  "action.openLogs": "Open log folder",
  "action.copy": "Copy diagnostics",
  "action.guide": "Installation guide",
  "action.copied": "Diagnostics copied",

  "menu.file": "File",
  "menu.openData": "Open project folder",
  "menu.openLogs": "Open log folder",
  "menu.restartBackend": "Restart local service",
  "menu.quit": "Quit",
  "menu.edit": "Edit",
  "menu.undo": "Undo",
  "menu.redo": "Redo",
  "menu.cut": "Cut",
  "menu.copy": "Copy",
  "menu.paste": "Paste",
  "menu.selectAll": "Select All",
  "menu.view": "View",
  "menu.reload": "Reload",
  "menu.forceReload": "Force Reload",
  "menu.devtools": "Toggle Developer Tools",
  "menu.zoomIn": "Zoom In",
  "menu.zoomOut": "Zoom Out",
  "menu.zoomReset": "Actual Size",
  "menu.fullscreen": "Toggle Full Screen",
  "menu.language": "Interface language",
  "menu.languageZh": "简体中文",
  "menu.languageEn": "English",
  "menu.window": "Window",
  "menu.minimize": "Minimize",
  "menu.close": "Close",
  "menu.help": "Help",
  "menu.guide": "User guide",
  "menu.issue": "Report an issue",
  "menu.about": "About OpenDirector",

  "about.title": "About OpenDirector",
  "about.message":
    "OpenDirector {appVersion}\nLocal service: {backendUrl}\nRuntime: {runtime}\nData folder: {data}",

  "quit.title": "Work is still in progress",
  "quit.message": "{count} generation or export task(s) have not finished. Quitting now interrupts them.",
  "quit.keepWorking": "Keep waiting",
  "quit.quitAnyway": "Quit anyway",

  "download.title": "Save exported file",

  "notify.backendRestarted": "The local service was restarted.",
  "notify.backendRestartFailed": "Restarting the local service failed; check the logs.",
};

export const MESSAGES: Record<Locale, Catalog> = {
  "zh-CN": ZH_CN,
  "en-US": EN_US,
};

/** Translate a shell string; a missing key falls back to the other language, then to the key. */
export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
): string {
  const template = MESSAGES[locale][key] ?? MESSAGES[DEFAULT_LOCALE][key] ?? key;
  return format(template, params);
}

/** Keys that exist in one language but not the other; empty means the catalogs agree. */
export function missingKeys(): string[] {
  const reference = Object.keys(MESSAGES[DEFAULT_LOCALE]).sort();
  const problems: string[] = [];
  for (const locale of LOCALES) {
    const keys = new Set(Object.keys(MESSAGES[locale]));
    for (const key of reference) {
      if (!keys.has(key)) problems.push(`${locale}:${key}`);
    }
    for (const key of keys) {
      if (!(key in MESSAGES[DEFAULT_LOCALE])) problems.push(`${locale}:${key}`);
    }
  }
  return problems;
}

/** Shell language: an explicit choice wins, otherwise follow the operating system. */
export function detectShellLocale(
  options: { preferred?: unknown; systemLocale?: string | undefined } = {},
): Locale {
  if (isLocale(options.preferred)) return options.preferred;
  const system = options.systemLocale ?? "";
  return /^zh\b/i.test(system) ? "zh-CN" : "en-US";
}

/** `zh-CN` for Chinese systems, so `OPENDIRECTOR_LANGUAGE` matches the shell. */
export function backendLanguage(locale: Locale): string {
  return locale;
}
