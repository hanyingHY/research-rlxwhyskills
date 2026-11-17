/** The startup window: shown while the local service is being prepared.
 *
 * It exists so a first launch (which may install a Python environment) does not
 * look like a hung application, and so the user always knows which step is running. */

import { BrowserWindow, screen } from "electron";

import { escapeHtml, shellDocument } from "./html";

export interface LoadingWindowOptions {
  /** Localized stage line shown immediately. */
  initialStage: string;
  hint?: string;
  subtitle?: string;
  iconPath?: string;
}

export interface LoadingWindow {
  window: BrowserWindow;
  setStage(stage: string, detail?: string): void;
  close(): void;
}

const WIDTH = 460;
const HEIGHT = 260;

export function createLoadingWindow(options: LoadingWindowOptions): LoadingWindow {
  const window = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    center: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    show: false,
    backgroundColor: "#0c0c0e",
    title: "OpenDirector",
    ...(options.iconPath ? { icon: options.iconPath } : {}),
    webPreferences: {
      // The document is generated locally and has no remote content or Node access.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  window.setMenuBarVisibility(false);
  // Move out of the way on multi-monitor setups: follow the cursor's display.
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  window.setPosition(
    Math.round(display.workArea.x + (display.workArea.width - WIDTH) / 2),
    Math.round(display.workArea.y + (display.workArea.height - HEIGHT) / 2),
  );

  const body = `
    <div class="shell">
      <div class="brand">
        <div class="mark" aria-hidden="true"></div>
        <div>
          <div class="title">OpenDirector</div>
          <div class="subtitle">${escapeHtml(options.subtitle ?? "")}</div>
        </div>
      </div>
      <div class="body">
        <div class="stage" id="stage">${escapeHtml(options.initialStage)}</div>
        <div class="bar"><i></i></div>
        <div class="detail" id="detail"></div>
        <div class="hint">${escapeHtml(options.hint ?? "")}</div>
      </div>
    </div>`;

  void window.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(shellDocument("OpenDirector", body))}`,
  );
  window.once("ready-to-show", () => window.show());

  return {
    window,
    setStage(stage: string, detail?: string): void {
      if (window.isDestroyed()) return;
      const script = `
        (() => {
          const stage = document.getElementById('stage');
          const detail = document.getElementById('detail');
          if (stage) stage.textContent = ${JSON.stringify(stage)};
          if (detail) detail.textContent = ${JSON.stringify(detail ?? "")};
        })()`;
      void window.webContents.executeJavaScript(script).catch(() => {
        // The window can close between the check and the call.
      });
    },
    close(): void {
      if (window.isDestroyed()) return;
      if (!window.isVisible()) {
        window.close();
        return;
      }
      // Avoid a flash: let the app window paint before the loader disappears.
      setTimeout(() => {
        if (!window.isDestroyed()) window.close();
      }, 120);
    },
  };
}
