/** Preload bridge for the workspace page.
 *
 * The page runs with `sandbox: true` and no Node access. It gets exactly these six
 * calls, each validated in the main process. It also cannot reach the file system,
 * spawn processes, or read other origins: the workspace keeps working purely through
 * the loopback API, exactly as it does in a browser. */

import { contextBridge, ipcRenderer } from "electron";

import {
  DESKTOP_BRIDGE_KEY,
  IPC,
  isLocale,
  isOpenPathTarget,
  type DesktopBridge,
  type DesktopInfo,
  type Locale,
  type OpenPathTarget,
  type RestartResult,
  type StartupStatus,
} from "../shared/contracts";

const bridge: DesktopBridge = {
  info: (): Promise<DesktopInfo> => ipcRenderer.invoke(IPC.info) as Promise<DesktopInfo>,
  openPath: (target: OpenPathTarget): Promise<void> =>
    ipcRenderer.invoke(IPC.openPath, isOpenPathTarget(target) ? target : null) as Promise<void>,
  restartBackend: (): Promise<RestartResult> =>
    ipcRenderer.invoke(IPC.restartBackend) as Promise<RestartResult>,
  getLocale: (): Promise<Locale> => ipcRenderer.invoke(IPC.getLocale) as Promise<Locale>,
  setLocale: (locale: Locale): Promise<Locale> =>
    ipcRenderer.invoke(IPC.setLocale, isLocale(locale) ? locale : null) as Promise<Locale>,
  onStatus: (listener: (status: StartupStatus) => void): (() => void) => {
    const handler = (_event: unknown, status: StartupStatus) => listener(status);
    ipcRenderer.on(IPC.status, handler);
    return () => ipcRenderer.removeListener(IPC.status, handler);
  },
};

contextBridge.exposeInMainWorld(DESKTOP_BRIDGE_KEY, bridge);
