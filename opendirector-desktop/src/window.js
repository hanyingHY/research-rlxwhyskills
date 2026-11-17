/** Renderer window and its security policy. */
import { join } from "node:path";

/**
 * A single sandboxed renderer. `backgroundThrottling: false` keeps timeline
 * export and preview work running while the window is not focused; export still
 * requires the window to stay open, which the quit dialog explains.
 */
export function createMainWindow({ BrowserWindow, preloadPath, backgroundColor = "#111214" }) {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor,
    title: "OpenDirector",
    webPreferences: {
      preload: preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
      backgroundThrottling: false,
      navigateOnDragDrop: false,
    },
  });
  window.once("ready-to-show", () => window.show());
  return window;
}

/** Downloads go through a native save dialog; no silent write to disk. */
export function configureSession(session, { downloadsDir }) {
  session.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === "clipboard-sanitized-write");
  });
  session.setPermissionCheckHandler((_contents, permission) =>
    permission === "clipboard-sanitized-write",
  );
  session.setSpellCheckerEnabled?.(false);
  session.on("will-download", (_event, item) => {
    item.setSaveDialogOptions({
      defaultPath: join(downloadsDir, item.getFilename()),
    });
  });
}

/**
 * Keep every web contents inside the application origin.
 *
 * Same-origin popups (the assistant's "open trace" links) stay in the app but
 * get the same sandbox and preload; everything else goes to the system browser
 * or is denied.
 */
export function hardenContents(contents, { appOrigin, shell, preloadPath }) {
  if (contents.getType() !== "window") return;
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(appOrigin)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 1200,
          height: 800,
          autoHideMenuBar: true,
          webPreferences: {
            preload: preloadPath,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: false,
            backgroundThrottling: false,
          },
        },
      };
    }
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (url.startsWith(appOrigin)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
}
