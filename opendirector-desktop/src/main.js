/**
 * Electron main process: single instance, od:// proxy, Host lifecycle, quit.
 */
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
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
import { APP_ORIGIN, APP_SCHEME, createAppHandler } from "./protocol.js";
import { configureSession, createMainWindow, hardenContents } from "./window.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const PRELOAD = join(HERE, "preload.cjs");

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

// sessionData must be set before Chromium's default session exists. userData is
// available this early, so paths are resolved once and reused after ready.
const EARLY_PATHS = resolvePaths({
  platform: process.platform,
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  userDataPath: app.getPath("userData"),
  home: app.getPath("home"),
  repoRoot: REPO_ROOT,
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
  },
};

let paths;
let log;
let host;
let window = null;
let locale = "en-US";
let quitting = false;
let shutdownComplete = false;

function t(key) {
  return (MESSAGES[locale.startsWith("zh") ? "zh-CN" : "en-US"] || MESSAGES["en-US"])[key];
}

function dialogParent() {
  return window && !window.isDestroyed() ? window : null;
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

function bootIpc() {
  registerIpc({
    ipcMain,
    getWindow: () => window,
    host,
    paths,
    app,
    dialog,
    shell,
    locale: () => locale,
    requestQuit,
    restartHost,
  });
}

async function bootstrap() {
  locale = app.getLocale() || "en-US";
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
  window = createMainWindow({ BrowserWindow, preloadPath: PRELOAD });
  configureSession(window.webContents.session, { downloadsDir: app.getPath("downloads") });

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

  await window.loadURL(`${APP_ORIGIN}/__desktop/start`);

  bootIpc();
  buildMenu({
    Menu,
    app,
    shell,
    locale,
    actions: {
      requestQuit: () => void requestQuit(),
      openDataFolder: () => void shell.openPath(paths.dataRoot),
      openLogs: () => void shell.openPath(paths.logsDir),
    },
  });

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
