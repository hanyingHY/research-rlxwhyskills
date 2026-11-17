/**
 * Electron main process: single instance, od:// proxy, Host lifecycle, updates.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { release as osRelease } from "node:os";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  shell,
} from "electron";

import { redact } from "./auth.js";
import {
  ConfigError,
  assertRunnable,
  buildHostEnvironment,
  resolvePaths,
} from "./config.js";
import { HostSupervisor } from "./host.js";
import { registerIpc } from "./ipc.js";
import { createLogger } from "./log.js";
import { buildMenu } from "./menu.js";
import { formatDiagnostics } from "./guide/plan.js";
import { APP_ORIGIN, APP_SCHEME, createAppHandler } from "./protocol.js";
import { createSettingsStore } from "./settings.js";
import { createUpdater } from "./updater.js";
import { configureSession, createMainWindow, hardenContents } from "./window.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const PRELOAD = join(REPO_ROOT, "dist", "preload.cjs");
// Official builds read the GitHub provider settings electron-builder writes to
// app-update.yml; UPDATE_FEED_URL overrides them for staging or self-hosting.
const FEED_OVERRIDE = process.env.UPDATE_FEED_URL || null;

// A privileged, standard scheme gives the renderer a stable origin and secure
// context (Web Locks, crypto.randomUUID) across launches with random ports.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
]);

app.setName("OpenDirector");
if (process.platform === "win32") {
  app.setAppUserModelId("com.thinkflowlab.opendirector");
}

// Desktop settings are read before any Chromium session exists: they decide the
// project data root, which must be known before the Host is spawned.
const settings = createSettingsStore({
  filePath: join(app.getPath("userData"), "desktop-settings.json"),
});
const EARLY_SETTINGS = settings.get();

// sessionData must be set before Chromium's default session exists. userData is
// available this early, so paths are resolved once and reused after ready.
const EARLY_PATHS = resolvePaths({
  platform: process.platform,
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  userDataPath: app.getPath("userData"),
  home: app.getPath("home"),
  repoRoot: REPO_ROOT,
  dataRootOverride: EARLY_SETTINGS.storage?.dataRoot ?? null,
  env: process.env,
});
mkdirSync(EARLY_PATHS.sessionDir, { recursive: true });
app.setPath("sessionData", EARLY_PATHS.sessionDir);

const MESSAGES = {
  "zh-CN": {
    startFailed: "OpenDirector 无法启动本地服务。",
    openLogs: "打开日志目录",
    quit: "退出",
    cancel: "取消",
    busyTitle: "仍有任务在运行",
    busyBody:
      "退出会中断正在执行的助手回复、工具任务与导出。已提交到远端的生成任务不会被取消，可稍后重新连接查看。",
    quitAnyway: "仍然退出",
    hostStopped: "本地服务已停止。",
    hostStoppedBody: "可以重新启动本地服务，或退出应用。",
    restart: "重新启动服务",
    detail: "查看日志",
    updateUnavailable: "当前版本无法自动更新。",
    aboutTitle: "关于 OpenDirector",
    aboutBody:
      "与网页版同一套创作画布，运行时、模型代理与媒体工具随应用一起安装。项目保存在本机。",
    restartNow: "立即重启",
    later: "稍后",
    dataRootTitle: "更改项目数据目录",
    dataRootBody:
      "新目录会在重启后生效。已有工程不会自动搬移，请先退出应用并手动复制。",
    updatesNotConfigured: "此版本未配置更新源。",
  },
  "en-US": {
    startFailed: "OpenDirector could not start its local service.",
    openLogs: "Open Log Folder",
    quit: "Quit",
    cancel: "Cancel",
    busyTitle: "Tasks are still running",
    busyBody:
      "Quitting interrupts the current assistant reply, tool tasks and export. Generation already submitted to a remote service is not cancelled and can be inspected after reconnecting.",
    quitAnyway: "Quit Anyway",
    hostStopped: "The local service stopped.",
    hostStoppedBody: "Restart the local service or quit the application.",
    restart: "Restart Service",
    detail: "View Log",
    updateUnavailable: "This build cannot update itself.",
    aboutTitle: "About OpenDirector",
    aboutBody:
      "The same creation canvas as the web app, with the runtime, model proxy and media tools installed alongside it. Projects stay on this computer.",
    restartNow: "Restart now",
    later: "Later",
    dataRootTitle: "Change project data folder",
    dataRootBody:
      "The new folder is used after a restart. Existing projects are not moved automatically; quit and copy them first.",
    updatesNotConfigured: "No update feed is configured for this build.",
  },
};

let paths;
let log;
let host;
let window = null;
let locale = "en-US";
let quitting = false;
let shutdownComplete = false;
let updater = null;
let saveBoundsTimer = null;

function t(key) {
  return (MESSAGES[locale.startsWith("zh") ? "zh-CN" : "en-US"] || MESSAGES["en-US"])[key];
}

function dialogParent() {
  return window && !window.isDestroyed() ? window : null;
}

function coreVersion() {
  try {
    const manifest = JSON.parse(
      readFileSync(join(paths.runtimeRoot, "manifest.json"), "utf8"),
    );
    return manifest.versions?.opendirector ?? manifest.opendirector_version ?? null;
  } catch {
    return null;
  }
}

function desktopInfo() {
  return {
    appName: "OpenDirector Desktop",
    appVersion: app.getVersion(),
    coreVersion: coreVersion() ?? app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    release: osRelease(),
    locale,
    dataRoot: paths?.dataRoot ?? "",
    logDir: paths?.logsDir ?? "",
    hostStatus: host?.running ? "running" : "stopped",
    hostPort: host?.port || null,
    packaged: app.isPackaged,
    updateFeed: updater?.support?.supported ? "configured" : updater?.support?.reason ?? "unknown",
  };
}

function sendGuideCommand(command) {
  window?.webContents.send("od:guide-command", command);
}

async function showFailure(error, { allowRetry = false } = {}) {
  const message = redact(String(error?.message ?? error), [host?.token]);
  const detail = redact(String(error?.detail ?? host?.stderrTail ?? ""), [host?.token]);
  log?.error(`${error?.name ?? "Error"}: ${message}${detail ? `\n${detail}` : ""}`);
  if (window && !window.isDestroyed()) {
    await window.loadURL(`${APP_ORIGIN}/__desktop/error`).catch(() => {});
  }
  const buttons = allowRetry
    ? [t("restart"), t("openLogs"), t("quit")]
    : [t("openLogs"), t("quit")];
  const result = await dialog.showMessageBox(dialogParent(), {
    type: "error",
    title: t("startFailed"),
    message,
    detail: detail ? detail.slice(-2000) : paths?.hostLogPath,
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
    noLink: true,
  });
  const choice = buttons[result.response];
  if (choice === t("openLogs")) {
    await shell.openPath(paths.logsDir);
    return showFailure(error, { allowRetry });
  }
  if (choice === t("restart")) {
    await restartHost();
    return;
  }
  await requestQuit({ force: true });
}

async function startHost() {
  await host.start();
  if (window && !window.isDestroyed()) {
    await window.loadURL(`${APP_ORIGIN}/`);
  }
}

async function restartHost() {
  try {
    await host.stop({ force: true });
    await host.start();
    if (window && !window.isDestroyed()) {
      await window.loadURL(`${APP_ORIGIN}/`);
    }
    window?.webContents.send("od:host-event", { type: "restarted" });
    return { ok: true };
  } catch (error) {
    void showFailure(error, { allowRetry: true });
    return { ok: false };
  }
}

async function requestQuit({ force = false } = {}) {
  if (shutdownComplete) return true;
  if (quitting) return false;
  quitting = true;
  try {
    if (!force && host?.running) {
      const status = await host.status();
      if (status.busy) {
        const result = await dialog.showMessageBox(dialogParent(), {
          type: "warning",
          title: t("busyTitle"),
          message: t("busyTitle"),
          detail: t("busyBody"),
          buttons: [t("cancel"), t("quitAnyway")],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        });
        if (result.response !== 1) {
          quitting = false;
          return false;
        }
      }
    }
    await host?.stop();
  } catch (error) {
    log?.error(`Shutdown failed: ${error?.stack ?? error}`);
  } finally {
    shutdownComplete = true;
    quitting = false;
    app.quit();
  }
  return true;
}

async function chooseDataRoot() {
  const result = await dialog.showOpenDialog(dialogParent(), {
    title: t("dataRootTitle"),
    message: t("dataRootBody"),
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const dataRoot = result.filePaths[0];
  settings.patch({ storage: { dataRoot } });
  const answer = await dialog.showMessageBox(dialogParent(), {
    type: "info",
    title: t("dataRootTitle"),
    message: t("dataRootBody"),
    detail: dataRoot,
    buttons: [t("restartNow"), t("later")],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (answer.response === 0) {
    app.relaunch();
    await requestQuit({ force: true });
  }
  return dataRoot;
}

async function checkForUpdates(options = {}) {
  if (!updater) {
    if (options?.interactive !== false) {
      await dialog.showMessageBox(dialogParent(), {
        type: "info",
        title: "Updates",
        message: t("updateUnavailable"),
        buttons: ["OK"],
      });
    }
    return { status: "unsupported", reason: "updater_missing" };
  }
  const result = await updater.check({ interactive: options?.interactive !== false });
  if (result.status !== "unsupported") {
    settings.patch({ updates: { lastCheck: new Date().toISOString() } });
  }
  return result;
}

async function loadUpdater() {
  try {
    const module = await import("electron-updater");
    const autoUpdater = module.autoUpdater ?? module.default?.autoUpdater;
    if (!autoUpdater) return null;
    return createUpdater({
      app,
      autoUpdater,
      dialog,
      getWindow: dialogParent,
      logger: log,
      feedBaseUrl: FEED_OVERRIDE,
      bundledConfigPath: join(process.resourcesPath, "app-update.yml"),
      channel: () => settings.get().updates.channel,
    });
  } catch (error) {
    log?.warn(`Update module unavailable: ${error?.message ?? error}`);
    return null;
  }
}

function trackWindowState(win) {
  const save = () => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    if (win.isMaximized()) {
      settings.patch({ window: { maximized: true } });
      return;
    }
    const bounds = typeof win.getNormalBounds === "function" ? win.getNormalBounds() : win.getBounds();
    settings.patch({
      window: {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        maximized: false,
      },
    });
  };
  const schedule = () => {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(save, 600);
  };
  win.on("resize", schedule);
  win.on("move", schedule);
  win.on("maximize", schedule);
  win.on("unmaximize", schedule);
  win.on("close", () => {
    clearTimeout(saveBoundsTimer);
    if (!win.isFullScreen()) save();
  });
}

async function bootstrap() {
  locale = settings.get().onboarding.language ?? app.getLocale() ?? "en-US";
  paths = EARLY_PATHS;
  mkdirSync(paths.logsDir, { recursive: true });
  mkdirSync(paths.dataRoot, { recursive: true });

  log = createLogger({
    directory: paths.logsDir,
    fileName: "desktop.log",
    mirrorToConsole: !app.isPackaged,
  });
  log.info(
    `OpenDirector ${app.getVersion()} on ${process.platform}/${process.arch} (packaged=${app.isPackaged})`,
  );
  log.info(`data=${paths.dataRoot} logs=${paths.logsDir} python=${paths.python}`);

  if (process.platform === "darwin") {
    app.setAboutPanelOptions?.({
      applicationName: "OpenDirector",
      applicationVersion: app.getVersion(),
      version: process.versions.electron,
      credits: "ThinkFlowLab",
      website: "https://github.com/ThinkFlowLab/OpenDirector",
    });
  }

  try {
    assertRunnable(paths);
  } catch (error) {
    log.error(`${error.message} ${error.detail ?? ""}`);
    await dialog.showMessageBox({
      type: "error",
      message: error.message,
      detail: error instanceof ConfigError ? error.detail : String(error),
      buttons: [t("quit")],
    });
    app.quit();
    return;
  }

  host = new HostSupervisor({
    python: paths.python,
    hostEntry: paths.hostEntry,
    dataRoot: paths.dataRoot,
    env: buildHostEnvironment(paths, process.env),
    log,
    platform: process.platform,
  });

  updater = await loadUpdater();

  protocol.handle(
    APP_SCHEME,
    createAppHandler({
      getBackendUrl: () => host?.baseUrl ?? null,
      getAuthorization: () => host?.authorization ?? null,
      getDevServerUrl: () => process.env.OPENDIRECTOR_DEV_SERVER || null,
      fetchImpl: net.fetch,
      logger: log,
      locale: () => locale,
    }),
  );

  // The renderer is created before the Host is ready so a slow or failing
  // start is visible in the window instead of a long dock bounce.
  app.on("web-contents-created", (_event, contents) =>
    hardenContents(contents, { appOrigin: APP_ORIGIN, shell, preloadPath: PRELOAD }),
  );
  window = createMainWindow({
    BrowserWindow,
    preloadPath: PRELOAD,
    bounds: settings.get().window,
  });
  configureSession(window.webContents.session, { downloadsDir: app.getPath("downloads") });
  trackWindowState(window);

  window.on("close", (event) => {
    if (shutdownComplete) return;
    if (process.platform === "darwin" && !quitting) {
      event.preventDefault();
      window.hide();
      return;
    }
    event.preventDefault();
    void requestQuit();
  });
  window.on("closed", () => {
    window = null;
  });

  registerIpc({
    ipcMain,
    getWindow: () => window,
    host,
    paths,
    app,
    dialog,
    shell,
    clipboard,
    settings,
    locale: () => locale,
    requestQuit,
    restartHost,
    chooseDataRoot,
    checkForUpdates,
    desktopInfo,
    openDataFolder: () => shell.openPath(paths.dataRoot),
    openLogs: () => shell.openPath(paths.logsDir),
    openExternal: (url) => shell.openExternal(url),
  });

  buildMenu({
    Menu,
    app,
    shell,
    locale,
    actions: {
      requestQuit: () => void requestQuit(),
      openDataFolder: () => void shell.openPath(paths.dataRoot),
      openLogs: () => void shell.openPath(paths.logsDir),
      openGuide: () => sendGuideCommand("help"),
      openTour: () => sendGuideCommand("tour"),
      openShortcuts: () => sendGuideCommand("shortcuts"),
      openCreatorGuide: () => sendGuideCommand("plugins"),
      toggleMode: () => sendGuideCommand("mode:toggle"),
      setMode: (mode) => sendGuideCommand(`mode:${mode}`),
      openPluginsFolder: () => {
        const skillsDir = join(paths.dataRoot, "skills");
        mkdirSync(skillsDir, { recursive: true });
        void shell.openPath(skillsDir);
      },
      checkUpdates: () => void checkForUpdates({ interactive: true }),
      changeDataRoot: () => void chooseDataRoot(),
      about: async () => {
        const info = desktopInfo();
        const answer = await dialog.showMessageBox(dialogParent(), {
          type: "info",
          title: t("aboutTitle"),
          message: `OpenDirector ${info.appVersion}`,
          detail: [
            t("aboutBody"),
            "",
            formatDiagnostics(info),
          ].join("\n"),
          buttons: [t("openLogs")],
          noLink: true,
        });
        if (answer.response === 0) await shell.openPath(paths.logsDir);
      },
    },
  });

  await window.loadURL(`${APP_ORIGIN}/__desktop/start`);

  host.on("exit", ({ code, signal, unexpected, stderr }) => {
    window?.webContents.send("od:host-event", { type: "exit", code, signal });
    if (!unexpected || shutdownComplete) return;
    log?.error(`Host exited unexpectedly (code ${code}, signal ${signal ?? "none"})\n${stderr}`);
    void dialog
      .showMessageBox(dialogParent(), {
        type: "error",
        title: t("hostStopped"),
        message: t("hostStopped"),
        detail: `${t("hostStoppedBody")}\n\n${redact(stderr, [host.token]).slice(-1200)}`,
        buttons: [t("restart"), t("openLogs"), t("quit")],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      })
      .then(async (result) => {
        if (result.response === 0) await restartHost();
        else if (result.response === 1) {
          await shell.openPath(paths.logsDir);
        } else await requestQuit({ force: true });
      });
  });

  try {
    await startHost();
  } catch (error) {
    await showFailure(error, { allowRetry: true });
  }

  if (updater?.support?.supported && settings.get().updates.autoCheck) {
    setTimeout(() => {
      void updater.check({ interactive: false });
    }, 8000).unref?.();
  }
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    sendGuideCommand("focus");
  });

  app.on("before-quit", (event) => {
    if (shutdownComplete) return;
    event.preventDefault();
    void requestQuit();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") void requestQuit();
  });

  app.on("activate", () => {
    if (window) {
      window.show();
      window.focus();
    }
  });

  app.on("will-quit", () => host?.killNow());
  process.on("exit", () => host?.killNow());

  app.whenReady().then(bootstrap).catch((error) => {
    log?.error(`Bootstrap failed: ${error?.stack ?? error}`);
    void dialog
      .showMessageBox({
        type: "error",
        message: "OpenDirector could not start.",
        detail: String(error?.stack ?? error),
        buttons: ["Quit"],
      })
      .finally(() => app.quit());
  });
}
