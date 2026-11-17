/**
 * The only preload. Exposes a narrow, promise-based bridge and drives the
 * desktop guidance layer (welcome, tour, tips, help centre).
 *
 * Bundled to CommonJS by scripts/build-preload.mjs so it can be loaded as a
 * sandboxed preload; it intentionally imports nothing but electron.
 */
const { contextBridge, ipcRenderer } = require("electron");
const { createGuide } = require("../guide/render.js");
const { pickLocale } = require("../guide/plan.js");

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);
// Guidance belongs to the primary window only. Popups share the bridge (and the
// sandbox) but must not duplicate the welcome screen or the tour. The marker is
// additive: if argv is unavailable, the guide still mounts, and main-process
// IPC trust checks remain the real guard against untrusted frames.
function windowRole() {
  try {
    const marker = (process.argv ?? []).find((argument) => argument.startsWith("--od-window="));
    return marker ? marker.slice("--od-window=".length) : "main";
  } catch {
    return "main";
  }
}

const IS_PRIMARY_WINDOW = windowRole() !== "popup";

const bridge = {
  platform: process.platform,
  appVersion: null,
  guide: {
    getState: () => invoke("od:guide-state"),
    updateSettings: (patch) => invoke("od:guide-settings", patch),
    completeOnboarding: (payload) => invoke("od:guide-complete", payload),
  },
  desktopInfo: () => invoke("od:desktop-info"),
  openDataFolder: () => invoke("od:open-data-folder"),
  openLogs: () => invoke("od:open-logs"),
  copyDiagnostics: () => invoke("od:copy-diagnostics"),
  checkForUpdates: (options) => invoke("od:check-updates", options),
  openExternal: (url) => invoke("od:open-external", url),
  onGuideCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("od:guide-command", listener);
    return () => ipcRenderer.removeListener("od:guide-command", listener);
  },
};

try {
  contextBridge.exposeInMainWorld("opendirectorDesktop", Object.freeze(bridge));
} catch (error) {
  console.warn("[guide] bridge unavailable", error);
}

function waitForApp({ timeout = 90000, selector = ".cw-topbar" } = {}) {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      resolve(true);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => {
      if (document.querySelector(selector)) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        resolve(false);
      }
    }, 250);
  });
}

async function boot() {
  let state;
  try {
    state = await bridge.guide.getState();
  } catch (error) {
    console.warn("[guide] state unavailable", error);
    return;
  }
  if (!state?.settings) return;

  const locale = pickLocale({
    settingsLocale: state.settings.onboarding?.language,
    documentLocale: document.documentElement.dataset.locale,
    systemLocale: navigator.language,
  });

  const guide = createGuide({
    api: bridge,
    state,
    locale,
    systemLocale: navigator.language,
    onSettingsChange: (patch) => {
      state.settings = { ...state.settings, ...patch };
    },
  });

  bridge.onGuideCommand((command) => {
    if (command === "help") guide.openHelp();
    else if (command === "tour") guide.startTour({ force: true });
    else if (command === "shortcuts") guide.openHelp({ section: "desktop" });
    else if (command === "close") guide.close();
  });

  const ready = await waitForApp();
  guide.observe();
  guide.watchLocale();
  if (!ready) {
    // The app never painted (host failure surfaces in its own error page).
    // Stay out of the way rather than stacking dialogs on a broken shell.
    return;
  }

  const stage = state.settings.onboarding ?? {};
  if (!stage.completed) {
    guide.showWelcome();
  } else if (!stage.tourDone) {
    guide.startTour();
  } else {
    guide.scheduleTip(5000);
  }
}

if (IS_PRIMARY_WINDOW) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void boot(), { once: true });
  } else {
    void boot();
  }
}
