/**
 * Sandboxed preload. Only these calls exist for the page; no `ipcRenderer`,
 * no filesystem, no shell, no Host credential.
 */
const { contextBridge, ipcRenderer } = require("electron");

const api = {
  getBootInfo: () => ipcRenderer.invoke("od:boot"),
  chooseDirectory: () => ipcRenderer.invoke("od:choose-directory"),
  openDataFolder: () => ipcRenderer.invoke("od:open-data-folder"),
  openLogs: () => ipcRenderer.invoke("od:open-logs"),
  status: () => ipcRenderer.invoke("od:status"),
  restartHost: () => ipcRenderer.invoke("od:restart-host"),
  quit: () => ipcRenderer.invoke("od:quit"),
  onHostEvent: (listener) => {
    if (typeof listener !== "function") return () => {};
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("od:host-event", handler);
    return () => ipcRenderer.removeListener("od:host-event", handler);
  },
};

contextBridge.exposeInMainWorld("opendirectorDesktop", Object.freeze(api));
