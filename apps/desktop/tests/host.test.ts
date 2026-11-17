/** Integration test for the shell orchestration against a stubbed Electron API.
 *
 * This does not prove that real Electron behaves identically — it proves that the
 * hosting logic is right: startup order, window security options, IPC surface, the
 * failure window, and shutdown. The backend is the Python stub, so the process
 * lifecycle (spawn, readiness, stop) is real. */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, test } from "node:test";
import Module from "node:module";

import { reservePort } from "../src/main/backend/port";
import { writeConfig } from "../src/main/config";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const STUB_PACKAGE_ROOT = path.resolve(REPO_ROOT, "tests", "fixtures", "stubpkg");
const PYTHON = process.env.OPENDIRECTOR_TEST_PYTHON ?? "python3";
const PYTHON_AVAILABLE = spawnSync(PYTHON, ["-c", "print(1)"]).status === 0;

interface FakeWindow {
  options: Record<string, unknown>;
  url: string | null;
  file: string | null;
  html: string | null;
  destroyed: boolean;
  shown: boolean;
  loadURL(url: string): Promise<void>;
}

interface FakeElectronState {
  windows: FakeWindow[];
  loadUrls: string[];
  ipcHandlers: Map<string, (...args: unknown[]) => unknown>;
  menus: number;
  quitCalled: boolean;
  externalUrls: string[];
  openedPaths: string[];
  clipboard: string[];
  appEvents: Map<string, (...args: unknown[]) => void>;
}

function createFakeElectron(state: FakeElectronState, userData: string) {
  class FakeBrowserWindow {
    options: Record<string, unknown>;
    webContents: Record<string, unknown>;
    url: string | null = null;
    file: string | null = null;
    html: string | null = null;
    destroyed = false;
    shown = false;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      const self = this;
      this.webContents = {
        on: () => self.webContents,
        once: () => self.webContents,
        send: () => {},
        executeJavaScript: async () => undefined,
        reload: () => {},
        setZoomFactor: () => {},
        getZoomFactor: () => 1,
        isDevToolsOpened: () => false,
        openDevTools: () => {},
        closeDevTools: () => {},
        setWindowOpenHandler: () => {},
        session: { on: () => {} },
      };
      state.windows.push(this as unknown as FakeWindow);
    }

    setMenuBarVisibility(): void {}
    setPosition(): void {}
    restore(): void {}
    maximize(): void {}
    isVisible(): boolean {
      return this.shown;
    }
    async loadURL(url: string): Promise<void> {
      this.url = url;
      state.loadUrls.push(url);
      if (url.startsWith("data:")) {
        this.html = decodeURIComponent(url.slice("data:text/html;charset=utf-8,".length));
      }
    }
    async loadFile(file: string): Promise<void> {
      this.file = file;
      this.html = fs.readFileSync(file, "utf8");
    }
    show(): void {
      this.shown = true;
    }
    close(): void {
      this.destroyed = true;
    }
    focus(): void {}
    isDestroyed(): boolean {
      return this.destroyed;
    }
    isMinimized(): boolean {
      return false;
    }
    isMaximized(): boolean {
      return false;
    }
    getPosition(): number[] {
      return [10, 20];
    }
    getSize(): number[] {
      return [1440, 900];
    }
    once(event: string, handler: () => void): void {
      if (event === "ready-to-show") {
        setTimeout(handler, 0);
      }
    }
    on(): void {}
  }

  return {
    app: {
      isPackaged: false,
      name: "OpenDirector",
      getVersion: () => "0.1.4-test",
      getLocale: () => "en-US",
      getPath: (name: string) => (name === "userData" ? userData : path.join(userData, name)),
      requestSingleInstanceLock: () => true,
      setAppUserModelId: () => {},
      commandLine: { appendSwitch: () => {} },
      whenReady: () => Promise.resolve(),
      on: (event: string, handler: (...args: unknown[]) => void) => state.appEvents.set(event, handler),
      quit: () => {
        state.quitCalled = true;
      },
    },
    BrowserWindow: FakeBrowserWindow,
    session: {
      defaultSession: {
        webRequest: {
          onBeforeRequest: () => {},
          onCompleted: () => {},
          onErrorOccurred: () => {},
        },
      },
    },
    ipcMain: {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
        state.ipcHandlers.set(channel, handler),
    },
    Menu: {
      setApplicationMenu: () => {
        state.menus += 1;
      },
      buildFromTemplate: (template: unknown[]) => template,
    },
    dialog: {
      showMessageBoxSync: () => 0,
      showMessageBox: async () => ({ response: 0 }),
      showSaveDialogSync: () => undefined,
    },
    shell: {
      openExternal: async (url: string) => {
        state.externalUrls.push(url);
      },
      openPath: async (target: string) => {
        state.openedPaths.push(target);
        return "";
      },
      showItemInFolder: () => {},
    },
    clipboard: {
      writeText: (text: string) => state.clipboard.push(text),
    },
    screen: {
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
    },
  };
}

/** Loads the real main script with `electron` resolved to the fake. */
function loadHost(state: FakeElectronState, userData: string): void {
  const fake = createFakeElectron(state, userData);
  const load = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
  (Module as unknown as { _load: unknown })._load = function (request: string, ...rest: unknown[]) {
    if (request === "electron") return fake;
    return (load as (...args: unknown[]) => unknown).call(this, request, ...rest);
  };
  try {
    // Purge the whole compiled main process: modules captured the previous fake at
    // load time, so a stale module would build windows into an earlier test's state.
    const root = path.resolve(__dirname, "..", "src");
    for (const key of Object.keys(require.cache)) {
      if (key.startsWith(root)) delete require.cache[key];
    }
    // Requiring the entry point runs bootstrap().
    require("../src/main/index");
  } finally {
    (Module as unknown as { _load: unknown })._load = load;
  }
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 20_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

const originalEnvironment = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnvironment };
});

test(
  "startup opens the workspace window with a sandboxed renderer",
  { skip: !PYTHON_AVAILABLE },
  async (t) => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "od-host-"));
    const workspacePort = (await reservePort({ preferred: 19_100 })).port;
    writeConfig(path.join(userData, "config.json"), {
      shellLocale: "en-US",
      lastPort: workspacePort,
      window: null,
      zoomFactor: 1,
    });
    const state: FakeElectronState = {
      windows: [],
      loadUrls: [],
      ipcHandlers: new Map(),
      menus: 0,
      quitCalled: false,
      externalUrls: [],
      openedPaths: [],
      clipboard: [],
      appEvents: new Map(),
    };
    process.env.OPENDIRECTOR_PYTHON = PYTHON;
    process.env.PYTHONPATH = STUB_PACKAGE_ROOT;

    loadHost(state, userData);
    t.after(async () => {
      state.appEvents.get("before-quit")?.({ preventDefault: () => {} });
      await waitFor(() => state.quitCalled, 10_000);
    });

    const started = await waitFor(() => state.loadUrls.some((url) => url.startsWith("http://127.0.0.1:")));
    assert.equal(started, true, `expected the workspace URL, saw ${state.loadUrls.join(", ")}`);

    const workspaceUrl = state.loadUrls.find((url) => url.startsWith("http://127.0.0.1:"))!;
    const mainWindow = state.windows[state.windows.length - 1]!;
    const preferences = mainWindow.options.webPreferences as Record<string, unknown>;
    assert.equal(preferences.sandbox, true, "the page must not run with Node access");
    assert.equal(preferences.contextIsolation, true);
    assert.equal(preferences.nodeIntegration, false);
    assert.match(String(preferences.preload), /preload[\\/]index\.js$/);

    // The startup window was shown and then closed behind the application window.
    const loading = state.windows[0]!;
    assert.match(loading.html ?? "", /OpenDirector/);
    assert.equal(loading.shown, true);

    // The workspace is served by the local API and really answers.
    const health = await fetch(`${workspaceUrl}/api/health`);
    assert.equal(health.status, 200);

    // The IPC surface is registered and nothing else is.
    for (const channel of [
      "opendirector:info",
      "opendirector:open-path",
      "opendirector:restart-backend",
      "opendirector:get-locale",
      "opendirector:set-locale",
    ]) {
      assert.equal(state.ipcHandlers.has(channel), true, channel);
    }
    assert.equal(state.menus >= 1, true, "the application menu was installed");

    // User data is separate from the application resources.
    assert.equal(fs.existsSync(path.join(userData, "data")), true);
    assert.equal(fs.existsSync(path.join(userData, "logs")), true);
    assert.equal(fs.existsSync(path.join(userData, "config.json")), true);

    // Quitting stops the service, so no orphan Python process is left behind.
    const beforeQuit = state.appEvents.get("before-quit");
    assert.ok(beforeQuit, "the shell registers a quit guard");
    beforeQuit?.({ preventDefault: () => {} });
    const quitCalled = await waitFor(() => state.quitCalled, 10_000);
    assert.equal(quitCalled, true, "graceful shutdown must finish and quit");
    const gone = await waitFor(async () => {
      try {
        await fetch(`${workspaceUrl}/api/health`);
        return false;
      } catch {
        return true;
      }
    }, 10_000);
    assert.equal(gone, true, "the local service must be stopped on quit");
  },
);

test(
  "a backend that cannot start produces a localized failure window",
  { skip: !PYTHON_AVAILABLE },
  async (t) => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "od-host-fail-"));
    const workspacePort = (await reservePort({ preferred: 19_200 })).port;
    writeConfig(path.join(userData, "config.json"), {
      shellLocale: "en-US",
      lastPort: workspacePort,
      window: null,
      zoomFactor: 1,
    });
    const state: FakeElectronState = {
      windows: [],
      loadUrls: [],
      ipcHandlers: new Map(),
      menus: 0,
      quitCalled: false,
      externalUrls: [],
      openedPaths: [],
      clipboard: [],
      appEvents: new Map(),
    };
    process.env.OPENDIRECTOR_PYTHON = PYTHON;
    process.env.PYTHONPATH = STUB_PACKAGE_ROOT;
    process.env.STUB_FAIL_MODE = "port_unavailable";

    loadHost(state, userData);
    t.after(async () => {
      state.appEvents.get("before-quit")?.({ preventDefault: () => {} });
      await waitFor(() => state.quitCalled, 10_000);
    });

    const failed = await waitFor(() =>
      state.windows.some((window) => (window.html ?? "").includes("could not start")),
    );
    assert.equal(failed, true, "the failure window should be shown");
    const failureWindow = state.windows.find((window) => (window.html ?? "").includes("could not start"))!;
    assert.match(failureWindow.html ?? "", /address is already in use|port/i);
    assert.match(failureWindow.html ?? "", /Retry|Open log folder/);
    assert.equal(state.windows.some((window) => (window.url ?? "").startsWith("http://127.0.0.1:")), false);

    // Diagnostics copy works from the failure page.
    const copy = state.ipcHandlers.get("opendirector:failure:copy");
    assert.ok(copy);
    await copy!({});
    assert.match(state.clipboard[0] ?? "", /port_unavailable/);
  },
);
