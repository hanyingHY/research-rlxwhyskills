/**
 * Narrow, validated IPC surface.
 *
 * The renderer never receives a filesystem API, a shell, the Host credential or
 * arbitrary dialog arguments. Every handler rejects calls from any frame other
 * than the main frame of the application window.
 */
export function registerIpc({
  ipcMain,
  getWindow,
  host,
  paths,
  app,
  dialog,
  shell,
  locale = () => "en-US",
  requestQuit,
  restartHost,
}) {
  function trusted(event) {
    const window = getWindow();
    if (!window || window.isDestroyed()) return false;
    if (event.sender !== window.webContents) return false;
    const frame = event.senderFrame;
    return Boolean(frame) && frame === window.webContents.mainFrame;
  }

  function handle(channel, callback) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!trusted(event)) throw new Error("Rejected IPC call from an untrusted frame.");
      return callback(...args);
    });
  }

  handle("od:boot", () => ({
    appVersion: app.getVersion(),
    locale: locale(),
    platform: process.platform,
    arch: process.arch,
    dataRoot: paths.dataRoot,
    logsDir: paths.logsDir,
    host: { running: host.running, port: host.port || null },
    /**
     * Capabilities the shell knows it can perform. The renderer can hide an
     * action instead of offering a broken button.
     */
    features: { chooseDirectory: true, openDataFolder: true, restartHost: true },
  }));

  handle("od:open-logs", async () => {
    await shell.openPath(paths.logsDir);
    return true;
  });

  handle("od:open-data-folder", async () => {
    await shell.openPath(paths.dataRoot);
    return true;
  });

  handle("od:choose-directory", async () => {
    const window = getWindow();
    const result = await dialog.showOpenDialog(window, {
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  handle("od:status", () => host.status());

  handle("od:restart-host", () => restartHost());

  handle("od:quit", () => requestQuit());
}
