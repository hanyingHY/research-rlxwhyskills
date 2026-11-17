/** The startup failure window.
 *
 * When the local service cannot start there is no workspace to show, so the shell
 * renders this window. It names the stage that failed, explains the remedy in the
 * user's language, and offers the four things a user actually needs: retry, open the
 * logs, copy diagnostics, read the installation guide. It is written to user data and
 * loaded over `file://` so the preload bridge (and only that bridge) can run. */

import fs from "node:fs";
import path from "node:path";

import { BrowserWindow } from "electron";

import { escapeHtml, shellDocument } from "./html";
import type { FailurePayload } from "../../shared/contracts";

export interface FailureWindowOptions {
  /** Absolute path of the HTML file to write; must be inside user data. */
  documentPath: string;
  /** Compiled preload that exposes `window.opendirectorDesktopFailure`. */
  preloadPath: string;
  iconPath?: string;
}

export interface FailureWindow {
  window: BrowserWindow;
  show(): void;
  close(): void;
}

const WIDTH = 620;
const HEIGHT = 560;

const EXTRA_STYLES = `
  .message { display: flex; flex-direction: column; gap: 12px; }
  .summary { font-size: 15px; font-weight: 600; }
  .remedy { font-size: 13px; opacity: 0.82; }
  .badge {
    align-self: flex-start; font-size: 11px; letter-spacing: 0.4px; text-transform: uppercase;
    padding: 2px 8px; border-radius: 999px; background: rgba(240, 120, 198, 0.16); color: #f0a6d8;
  }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
  button {
    padding: 8px 16px; border-radius: 8px; font-size: 13px;
    border: 1px solid rgba(232, 225, 237, 0.18); background: rgba(232, 225, 237, 0.06);
    color: inherit; cursor: pointer;
  }
  button:hover { background: rgba(232, 225, 237, 0.12); }
  button.primary {
    border-color: transparent; color: #0c0c0e;
    background: linear-gradient(140deg, #8d7cff, #f078c6); font-weight: 600;
  }
  button:focus-visible { outline: 2px solid #8d7cff; outline-offset: 2px; }
  details { margin-top: 6px; font-size: 12px; }
  summary { cursor: pointer; opacity: 0.7; }
  pre {
    max-height: 150px; overflow: auto; padding: 10px; border-radius: 8px; font-size: 11px;
    background: #141417; border: 1px solid rgba(232, 225, 237, 0.1); white-space: pre-wrap;
  }
  .toast { min-height: 18px; font-size: 12px; opacity: 0.7; }
`;

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

export function renderFailureDocument(payload: FailurePayload): string {
  const logTail = payload.logTail.length
    ? `<pre>${escapeHtml(payload.logTail.join("\n"))}</pre>`
    : `<pre>${escapeHtml("(no output)")}</pre>`;
  const body = `
    <div class="shell">
      <div class="brand">
        <div class="mark" aria-hidden="true"></div>
        <div>
          <div class="title">${escapeHtml(payload.title)}</div>
          <div class="subtitle">OpenDirector</div>
        </div>
      </div>
      <div class="body">
        <div class="message">
          <span class="badge">${escapeHtml(payload.code)}</span>
          <div class="summary" id="summary">${escapeHtml(payload.summary)}</div>
          <div class="remedy" id="remedy">${escapeHtml(payload.remedy)}</div>
        </div>
        <div class="actions">
          <button class="primary" id="retry">${escapeAttribute(payload.actions.retry)}</button>
          <button id="logs">${escapeAttribute(payload.actions.openLogs)}</button>
          <button id="copy">${escapeAttribute(payload.actions.copy)}</button>
          <button id="guide">${escapeAttribute(payload.actions.guide)}</button>
          <button id="quit">${escapeAttribute(payload.actions.quit)}</button>
        </div>
        <div class="toast" id="toast" role="status" aria-live="polite"></div>
        <details>
          <summary>${escapeHtml(payload.detail ? "detail" : "log")}</summary>
          ${payload.detail ? `<pre>${escapeHtml(payload.detail)}</pre>` : ""}
          ${logTail}
        </details>
      </div>
    </div>
    <script>
      (() => {
        const bridge = window.opendirectorDesktopFailure;
        if (!bridge) return;
        const toast = document.getElementById('toast');
        const say = (message) => { if (toast) toast.textContent = message || ''; };
        const busy = (button, running) => {
          button.disabled = Boolean(running);
          button.style.opacity = running ? '0.6' : '';
        };
        const retry = document.getElementById('retry');
        retry.addEventListener('click', async () => {
          busy(retry, true);
          say('');
          await bridge.retry();
          busy(retry, false);
        });
        document.getElementById('logs').addEventListener('click', async () => say(await bridge.openLogs()));
        document.getElementById('copy').addEventListener('click', async () => say(await bridge.copy()));
        document.getElementById('guide').addEventListener('click', async () => say(await bridge.openGuide()));
        document.getElementById('quit').addEventListener('click', () => bridge.quit());
      })();
    </script>`;
  return shellDocument(payload.title, body, EXTRA_STYLES);
}

export async function createFailureWindow(
  options: FailureWindowOptions,
  payload: FailurePayload,
): Promise<FailureWindow> {
  fs.mkdirSync(path.dirname(options.documentPath), { recursive: true });
  fs.writeFileSync(options.documentPath, renderFailureDocument(payload), "utf8");

  const window = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    center: true,
    resizable: true,
    show: false,
    backgroundColor: "#0c0c0e",
    title: payload.title,
    ...(options.iconPath ? { icon: options.iconPath } : {}),
    webPreferences: {
      preload: options.preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  window.setMenuBarVisibility(false);
  await window.loadFile(options.documentPath);
  window.once("ready-to-show", () => window.show());
  window.show();

  return {
    window,
    show(): void {
      if (window.isDestroyed()) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    },
    close(): void {
      if (!window.isDestroyed()) window.close();
    },
  };
}
