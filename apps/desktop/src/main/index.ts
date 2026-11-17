/** OpenDirector desktop host.
 *
 * The shell does one job: give the existing OpenDirector workspace a native window.
 * It starts the same local API the browser talks to, waits until it serves the real
 * built page, and loads that page over loopback. No UI is reimplemented here, so the
 * desktop experience cannot drift from the browser experience.
 *
 * What the shell adds on top:
 *   - a bundled runtime and a startup window that explains what is happening;
 *   - bilingual, actionable failures instead of a blank screen;
 *   - graceful shutdown that stops the local service and its children;
 *   - a quit guard while generation or export work is in flight;
 *   - native save dialogs, external links, window state and zoom. */

import path from "node:path";
import fs from "node:fs";

import { app, dialog, session, shell } from "electron";

import { BackendSession, type StartupResult } from "./backend/session";
import { DEFAULT_PORT } from "./backend/port";
import { readConfig, updateConfig, type DesktopConfig, type WindowState } from "./config";
import { registerIpc } from "./ipc";
import { createLogger, type Logger } from "./logging";
import { applyMenu } from "./menu";
import { OperationMonitor } from "./operations";
import { resolveLayout, type Layout } from "./paths";
import { detectShellLocale, translate } from "./i18n";
import { buildFailurePayload, diagnosticsText } from "./startup/failures";
import { createFailureWindow, type FailureWindow } from "./windows/failure";
import { createLoadingWindow, type LoadingWindow } from "./windows/loading";
import { createMainWindow, type MainWindowHandle } from "./windows/main-window";
import {
  DEFAULT_LOCALE,
  IPC,
  WINDOWS_APP_USER_MODEL_ID,
  type BackendInfo,
  type DesktopInfo,
  type FailurePayload,
  type Locale,
  type OpenPathTarget,
  type StartupFailure,
  type StartupStage,
  type StartupStatus,
} from "../shared/contracts";

const WATCHDOG_INTERVAL_MS = 5_000;

class DesktopHost {
  private layout: Layout;
  private config: DesktopConfig;
  private logger!: Logger;
  private session!: BackendSession;
  private monitor = new OperationMonitor();
  private locale: Locale = DEFAULT_LOCALE;
  private loading: LoadingWindow | null = null;
  private main: MainWindowHandle | null = null;
  private failure: FailureWindow | null = null;
  private lastFailure: StartupFailure | null = null;
  private info: BackendInfo | null = null;
  private quitting = false;
  private watchdog: NodeJS.Timeout | null = null;
  private restarting = false;
  private reloadAttempts = 0;
  private lastReloadAt = 0;

  constructor() {
    this.layout = resolveLayout({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      userDataPath: app.getPath("userData"),
      moduleDirectory: __dirname,
      env: process.env,
    });
    this.config = readConfig(this.layout.user.config);
  }

  /** Registers everything that must exist before the first window appears. */
  prepare(): void {
    if (process.platform === "win32") {
      app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
    }
    // The workspace only talks to loopback; a system proxy must not intercept it.
    app.commandLine.appendSwitch("proxy-bypass-list", "<local>;127.0.0.1;localhost");

    for (const directory of [this.layout.user.data, this.layout.user.logs]) {
      fs.mkdirSync(directory, { recursive: true });
    }
    this.logger = createLogger({ directory: this.layout.user.logs, name: "desktop" });
    this.locale = detectShellLocale({
      preferred: this.config.shellLocale,
      systemLocale: app.getLocale(),
    });
    this.logger.info(
      `OpenDirector desktop ${app.getVersion()} starting (electron=${process.versions.electron} node=${process.versions.node})`,
    );
    this.logger.info(`resources=${this.layout.resources.root} data=${this.layout.user.data}`);

    this.session = new BackendSession({
      layout: this.layout,
      locale: this.locale,
      platform: process.platform,
      env: process.env,
      logger: this.logger,
      preferredPort: this.config.lastPort ?? DEFAULT_PORT,
      onStage: (stage, detail) => this.onStage(stage, detail),
    });
  }

  private onStage(stage: StartupStage, detail?: string): void {
    const status: StartupStatus = { stage, detail };
    this.loading?.setStage(translate(this.locale, `stage.${stage}`), detail);
    this.main?.window.webContents.send(IPC.status, status);
  }

  async run(): Promise<void> {
    // `session` is only usable once the app is ready; requests are watched from here on.
    this.monitor.attach(session.defaultSession.webRequest);
    this.registerHandlers();
    registerIpc(this.createIpcHandlers());
    this.rebuildMenu();

    this.loading = createLoadingWindow({
      initialStage: translate(this.locale, "stage.resolving-runtime"),
      subtitle: translate(this.locale, "loading.subtitle"),
      hint: translate(this.locale, "loading.hint"),
    });

    const result = await this.session.start();
    if (!result.ok) {
      this.loading.close();
      this.loading = null;
      await this.showFailure(result.failure);
      return;
    }
    this.info = result.info;
    this.config = updateConfig(this.layout.user.config, { lastPort: result.info.port });
    await this.openWorkspace(result.info.url);
    this.loading?.close();
    this.loading = null;
    this.startWatchdog();
  }

  private async openWorkspace(url: string): Promise<void> {
    if (this.main) {
      this.main.reload();
      return;
    }
    this.onStage("opening-window");
    this.main = createMainWindow({
      url,
      preloadPath: path.join(__dirname, "..", "preload", "index.js"),
      locale: this.locale,
      state: this.config.window,
      zoomFactor: this.config.zoomFactor,
      monitor: this.monitor,
      logger: this.logger,
      onStateChange: (state: WindowState) => {
        this.config = updateConfig(this.layout.user.config, { window: state });
      },
      onZoomChange: (factor: number) => {
        this.config = updateConfig(this.layout.user.config, { zoomFactor: factor });
      },
      onLoadFailure: (description: string) => void this.handleLoadFailure(description),
      onClosed: () => {
        this.main = null;
      },
    });
    try {
      await this.main.load(url);
      this.reloadAttempts = 0;
    } catch (error) {
      this.logger.error(`load failed: ${String(error)}`);
      await this.showFailure({
        code: "renderer_failed",
        stage: "opening-window",
        detail: String(error),
        logTail: this.session.tail(25),
      });
    }
  }

  /** The page lost the service: restart it rather than leaving a dead window. */
  private async handleLoadFailure(description: string): Promise<void> {
    if (this.restarting) return;
    // A page that keeps failing must not be reloaded forever.
    const now = Date.now();
    this.reloadAttempts = now - this.lastReloadAt < 30_000 ? this.reloadAttempts + 1 : 1;
    this.lastReloadAt = now;
    if (this.reloadAttempts > 3) {
      this.logger.error(`page keeps failing (${description}); showing the failure window`);
      await this.showFailure({
        code: "renderer_failed",
        stage: "opening-window",
        detail: description,
        logTail: this.session.tail(25),
      });
      return;
    }
    this.restarting = true;
    try {
      if (this.session.running) {
        this.logger.warn(`page load failed (${description}); reloading`);
        this.main?.reload();
        return;
      }
      this.logger.warn(`service is gone (${description}); restarting backend`);
      const result = await this.session.restart();
      if (!result.ok) {
        await this.showFailure(result.failure);
        return;
      }
      this.info = result.info;
      await this.openWorkspace(result.info.url);
    } finally {
      this.restarting = false;
    }
  }

  private startWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = setInterval(() => {
      if (this.quitting || !this.info) return;
      if (this.session.running) return;
      this.logger.error("backend stopped unexpectedly");
      const choice = dialog.showMessageBoxSync(this.main?.window ?? undefined!, {
        type: "error",
        buttons: [translate(this.locale, "action.retry"), translate(this.locale, "action.quit")],
        defaultId: 0,
        cancelId: 1,
        title: translate(this.locale, "failure.title"),
        message: translate(this.locale, "failure.renderer_failed.summary"),
        detail: translate(this.locale, "failure.renderer_failed.remedy"),
      });
      if (choice === 0) {
        void this.handleLoadFailure("backend exited");
      } else {
        void this.shutdown(true);
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  private async showFailure(failure: StartupFailure): Promise<void> {
    this.lastFailure = failure;
    this.logger.error(`showing failure window code=${failure.code}`);
    if (this.failure) {
      this.failure.show();
      return;
    }
    this.failure = await createFailureWindow(
      {
        documentPath: path.join(this.layout.user.root, "ui", "failure.html"),
        preloadPath: path.join(__dirname, "..", "preload", "failure.js"),
      },
      this.failurePayload(failure),
    );
    this.failure.window.once("closed", () => {
      this.failure = null;
    });
  }

  private failurePayload(failure: StartupFailure): FailurePayload {
    return buildFailurePayload(failure, {
      appVersion: app.getVersion(),
      locale: this.locale,
      dataRoot: this.layout.user.data,
      logDirectory: this.layout.user.logs,
    });
  }

  private createIpcHandlers() {
    return {
      getInfo: async (): Promise<DesktopInfo> => ({
        appVersion: app.getVersion(),
        electronVersion: process.versions.electron ?? "",
        chromeVersion: process.versions.chrome ?? "",
        nodeVersion: process.versions.node ?? "",
        locale: this.locale,
        backend: this.info,
        paths: {
          resources: this.layout.resources.root,
          data: this.layout.user.data,
          logs: this.layout.user.logs,
          config: this.layout.user.config,
        },
        activeOperations: this.monitor.count,
      }),
      openPath: async (target: OpenPathTarget): Promise<void> => this.openPath(target),
      restartBackend: async () => {
        const result = await this.restartBackend();
        return result;
      },
      getLocale: (): Locale => this.locale,
      setLocale: (locale: Locale): void => this.setLocale(locale),
      getFailurePayload: (): FailurePayload | null =>
        this.lastFailure ? this.failurePayload(this.lastFailure) : null,
      retry: (): void => {
        void this.retryStartup();
      },
      quit: (): void => {
        void this.shutdown(true);
      },
      openLogs: (): void => this.openPath("logs"),
      buildDiagnostics: (): string => {
        const failure = this.lastFailure;
        if (!failure) return "";
        const payload = this.failurePayload(failure);
        return diagnosticsText(payload, {
          appVersion: app.getVersion(),
          electron: process.versions.electron,
          platform: `${process.platform} ${process.arch}`,
          locale: this.locale,
          dataRoot: this.layout.user.data,
          logDirectory: this.layout.user.logs,
          logFile: this.logger.file,
        });
      },
    };
  }

  private async restartBackend(): Promise<{ ok: boolean; message: string }> {
    this.logger.info("restart requested");
    const result: StartupResult = await this.session.restart();
    if (!result.ok) {
      await this.showFailure(result.failure);
      return { ok: false, message: translate(this.locale, "notify.backendRestartFailed") };
    }
    this.info = result.info;
    this.config = updateConfig(this.layout.user.config, { lastPort: result.info.port });
    await this.openWorkspace(result.info.url);
    return { ok: true, message: translate(this.locale, "notify.backendRestarted") };
  }

  private async retryStartup(): Promise<void> {
    this.failure?.close();
    this.loading = createLoadingWindow({
      initialStage: translate(this.locale, "stage.resolving-runtime"),
      subtitle: translate(this.locale, "loading.subtitle"),
      hint: translate(this.locale, "loading.hint"),
    });
    const result = await this.session.start();
    if (!result.ok) {
      this.loading.close();
      this.loading = null;
      await this.showFailure(result.failure);
      return;
    }
    this.info = result.info;
    this.config = updateConfig(this.layout.user.config, { lastPort: result.info.port });
    await this.openWorkspace(result.info.url);
    this.loading?.close();
    this.loading = null;
    this.startWatchdog();
  }

  private openPath(target: OpenPathTarget): void {
    const directory =
      target === "data"
        ? this.layout.user.data
        : target === "logs"
          ? this.layout.user.logs
          : this.layout.resources.root;
    fs.mkdirSync(directory, { recursive: true });
    void shell.openPath(directory);
  }

  private setLocale(locale: Locale): void {
    if (locale === this.locale) return;
    this.locale = locale;
    this.config = updateConfig(this.layout.user.config, { shellLocale: locale });
    this.rebuildMenu();
  }

  private rebuildMenu(): void {
    applyMenu(
      {
        locale: this.locale,
        isMac: process.platform === "darwin",
        aboutDetail: () => ({
          backendUrl: this.info?.url ?? translate(this.locale, "stage.failed"),
          runtime: this.info
            ? `${this.info.runtimeSource} · Python ${this.info.pythonVersion ?? ""}`.trim()
            : "-",
          data: this.layout.user.data,
        }),
        restartEnabled: () => this.session !== undefined,
      },
      {
        reload: () => this.main?.reload(),
        toggleDevTools: () => this.main?.toggleDevTools(),
        zoomIn: () => this.main?.changeZoom(0.1),
        zoomOut: () => this.main?.changeZoom(-0.1),
        resetZoom: () => this.main?.resetZoom(),
        openData: () => this.openPath("data"),
        openLogs: () => this.openPath("logs"),
        restartBackend: () => void this.restartBackend(),
        setLocale: (locale: Locale) => this.setLocale(locale),
        about: () => this.showAbout(),
      },
    );
  }

  private showAbout(): void {
    const detail = {
      backendUrl: this.info?.url ?? "-",
      runtime: this.info ? `${this.info.runtimeSource} · Python ${this.info.pythonVersion ?? ""}`.trim() : "-",
      data: this.layout.user.data,
    };
    void dialog.showMessageBox(this.main?.window ?? undefined!, {
      type: "info",
      title: translate(this.locale, "about.title"),
      message: translate(this.locale, "about.message", {
        appVersion: app.getVersion(),
        backendUrl: detail.backendUrl,
        runtime: detail.runtime,
        data: detail.data,
      }),
      buttons: [translate(this.locale, "menu.close")],
    });
  }

  private registerHandlers(): void {
    app.on("second-instance", () => {
      const window = this.main?.window;
      if (!window) return;
      if (window.isMinimized()) window.restore();
      window.focus();
    });

    app.on("activate", () => {
      // macOS: clicking the dock icon with no window open.
      if (this.main) return;
      if (this.info) void this.openWorkspace(this.info.url);
      else void this.retryStartup();
    });

    app.on("window-all-closed", () => {
      // Windows and Linux close the application with the window, like any desktop app.
      if (process.platform === "darwin") return;
      void this.handleAllClosed();
    });

    app.on("before-quit", (event) => {
      if (this.quitting) return;
      // Shutdown is asynchronous; hold the quit, clean up, then quit again.
      event.preventDefault();
      void this.shutdown();
    });
  }

  /** Last window closed: ask about unfinished work, then either reopen or quit. */
  private async handleAllClosed(): Promise<void> {
    if (this.monitor.count > 0) {
      const choice = dialog.showMessageBoxSync(undefined!, {
        type: "warning",
        buttons: [
          translate(this.locale, "quit.keepWorking"),
          translate(this.locale, "quit.quitAnyway"),
        ],
        defaultId: 0,
        cancelId: 0,
        title: translate(this.locale, "quit.title"),
        message: translate(this.locale, "quit.message", { count: this.monitor.count }),
      });
      // Choosing to keep working with no window left would strand the application.
      if (choice === 0 && this.info) {
        await this.openWorkspace(this.info.url);
        return;
      }
      if (choice === 0) return;
    }
    await this.shutdown(true);
  }

  /** Stops the service, then quits. Asks first when work would be interrupted. */
  async shutdown(force = false): Promise<void> {
    if (this.quitting) return;
    if (!force) {
      const count = this.monitor.count;
      if (count > 0) {
        const choice = dialog.showMessageBoxSync(this.main?.window ?? undefined!, {
          type: "warning",
          buttons: [
            translate(this.locale, "quit.keepWorking"),
            translate(this.locale, "quit.quitAnyway"),
          ],
          defaultId: 0,
          cancelId: 0,
          title: translate(this.locale, "quit.title"),
          message: translate(this.locale, "quit.message", { count }),
        });
        if (choice === 0) return;
      }
    }
    this.quitting = true;
    if (this.watchdog) clearInterval(this.watchdog);
    this.loading?.close();
    this.failure?.close();
    await this.session.stop();
    this.logger.info("quitting");
    app.quit();
  }
}

function bootstrap(): void {
  const hasLock = app.requestSingleInstanceLock();
  if (!hasLock) {
    // Another instance owns the workspace; it will focus its own window.
    app.quit();
    return;
  }

  const host = new DesktopHost();
  host.prepare();

  process.on("uncaughtException", (error) => {
    console.error("uncaught exception", error);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("unhandled rejection", reason);
  });

  void app.whenReady().then(() => host.run());
}

bootstrap();
