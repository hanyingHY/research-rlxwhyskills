/** The application window: a native frame around the same workspace the browser shows.
 *
 * Everything inside is the built web application served by the local API, so the
 * experience cannot drift from the browser version. The shell adds only what a
 * browser tab cannot do: window state, downloads that ask where to save, external
 * links in the default browser, zoom persistence, and reconnect handling. */

import path from "node:path";

import { BrowserWindow, app, dialog, shell, type WebContents } from "electron";

import type { OperationMonitor } from "../operations";
import type { Logger } from "../logging";
import type { WindowState } from "../config";
import type { Locale } from "../../shared/contracts";

export const MINIMUM_WIDTH = 1024;
export const MINIMUM_HEIGHT = 680;
export const DEFAULT_WIDTH = 1440;
export const DEFAULT_HEIGHT = 900;

export interface MainWindowOptions {
  url: string;
  preloadPath: string;
  locale: Locale;
  state: WindowState | null;
  zoomFactor: number;
  monitor: OperationMonitor;
  logger: Logger;
  iconPath?: string;
  onStateChange?: (state: WindowState) => void;
  onZoomChange?: (factor: number) => void;
  /** The page could not load; the shell decides whether to restart the service. */
  onLoadFailure?: (description: string) => void;
  onClosed?: () => void;
}

export interface MainWindowHandle {
  window: BrowserWindow;
  load(url: string): Promise<void>;
  reload(): void;
  toggleDevTools(): void;
  changeZoom(delta: number): void;
  resetZoom(): void;
  setZoom(factor: number): void;
}

function isLoopback(url: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(url);
}

function sameOrigin(candidate: string, base: string): boolean {
  return candidate.startsWith(base.replace(/\/$/, ""));
}

export function createMainWindow(options: MainWindowOptions): MainWindowHandle {
  const { logger, monitor } = options;
  const bounds = options.state;
  const window = new BrowserWindow({
    width: bounds?.width ?? DEFAULT_WIDTH,
    height: bounds?.height ?? DEFAULT_HEIGHT,
    ...(bounds?.x !== undefined && bounds?.y !== undefined ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: MINIMUM_WIDTH,
    minHeight: MINIMUM_HEIGHT,
    show: false,
    backgroundColor: "#0c0c0e",
    title: "OpenDirector",
    autoHideMenuBar: false,
    ...(options.iconPath ? { icon: options.iconPath } : {}),
    webPreferences: {
      preload: options.preloadPath,
      // The workspace is untrusted enough that it must not reach Node: it is a
      // normal web page talking to a loopback API through the preload bridge only.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  if (bounds?.maximized) window.maximize();

  const persistState = () => {
    if (window.isDestroyed() || window.isMinimized()) return;
    const [x, y] = window.getPosition();
    const [width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT] = window.getSize();
    options.onStateChange?.({
      x,
      y,
      width,
      height,
      maximized: window.isMaximized(),
    });
  };
  let persistTimer: NodeJS.Timeout | null = null;
  const schedulePersist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persistState, 400);
  };
  window.on("resize", schedulePersist);
  window.on("move", schedulePersist);
  window.on("maximize", persistState);
  window.on("unmaximize", persistState);
  window.once("closed", () => {
    if (persistTimer) clearTimeout(persistTimer);
    options.onClosed?.();
  });

  // Links to documentation and provider consoles belong in the user's browser.
  const openExternal = (url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  };
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isLoopback(url)) {
      return { action: "allow" };
    }
    openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (isLoopback(url) && sameOrigin(url, options.url)) return;
    event.preventDefault();
    openExternal(url);
  });
  window.webContents.on("will-frame-navigate", (event) => {
    const url = event.url;
    if (isLoopback(url) && sameOrigin(url, options.url)) return;
    event.preventDefault();
    openExternal(url);
  });

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    // -3 is ERR_ABORTED: a navigation we cancelled ourselves, not a real failure.
    if (errorCode === -3) return;
    logger.error(`page failed to load ${validatedURL} (${errorCode} ${errorDescription})`);
    options.onLoadFailure?.(errorDescription || `error ${errorCode}`);
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    logger.error(`renderer gone: ${details.reason} ${details.exitCode}`);
    options.onLoadFailure?.(`renderer ${details.reason}`);
  });

  window.webContents.on("zoom-changed", (_event, direction: "in" | "out") => {
    const factor = window.webContents.getZoomFactor();
    logger.info(`zoom ${direction} factor=${factor.toFixed(2)}`);
    options.onZoomChange?.(factor);
  });

  // Downloads (exports, timeline packages, asset bundles) ask where to save.
  let downloadId = 0;
  window.webContents.session.on("will-download", (_event, item) => {
    const suggested = item.getFilename() || "opendirector-export";
    const target = path.join(app.getPath("downloads"), suggested);
    const savePath = dialog.showSaveDialogSync(window, {
      title: options.locale === "zh-CN" ? "保存导出文件" : "Save exported file",
      defaultPath: target,
      buttonLabel: options.locale === "zh-CN" ? "保存" : "Save",
    });
    if (!savePath) {
      item.cancel();
      return;
    }
    item.setSavePath(savePath);
    downloadId += 1;
    const id = downloadId;
    monitor.trackDownload(id, suggested);
    item.once("done", (_doneEvent, state) => {
      monitor.finishDownload(id);
      logger.info(`download ${state}: ${savePath}`);
      if (state === "completed") shell.showItemInFolder(savePath);
    });
  });

  window.webContents.once("did-finish-load", () => {
    window.webContents.setZoomFactor(options.zoomFactor);
  });

  return {
    window,
    async load(url: string): Promise<void> {
      await window.loadURL(url);
      window.show();
    },
    reload(): void {
      if (!window.isDestroyed()) window.webContents.reload();
    },
    toggleDevTools(): void {
      const contents: WebContents = window.webContents;
      if (contents.isDevToolsOpened()) contents.closeDevTools();
      else contents.openDevTools({ mode: "detach" });
    },
    changeZoom(delta: number): void {
      const next = Math.min(3, Math.max(0.5, window.webContents.getZoomFactor() + delta));
      this.setZoom(next);
    },
    resetZoom(): void {
      this.setZoom(1);
    },
    setZoom(factor: number): void {
      const clamped = Math.min(3, Math.max(0.5, factor));
      window.webContents.setZoomFactor(clamped);
      options.onZoomChange?.(clamped);
    },
  };
}
