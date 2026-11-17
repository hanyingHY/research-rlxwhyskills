/** Preload bridge for the startup failure page.
 *
 * The page is a local document; it still runs sandboxed and can only call these
 * handlers, which the main process treats as user intent to retry, quit, or look
 * at diagnostics. */

import { contextBridge, ipcRenderer } from "electron";

import {
  FAILURE_BRIDGE_KEY,
  IPC,
  type FailureBridge,
  type FailurePayload,
} from "../shared/contracts";

const bridge: FailureBridge = {
  payload: (): Promise<FailurePayload | null> =>
    ipcRenderer.invoke(IPC.failurePayload) as Promise<FailurePayload | null>,
  retry: (): Promise<void> => ipcRenderer.invoke(IPC.failureRetry) as Promise<void>,
  quit: (): Promise<void> => ipcRenderer.invoke(IPC.failureQuit) as Promise<void>,
  openLogs: (): Promise<string> => ipcRenderer.invoke(IPC.failureOpenLogs) as Promise<string>,
  copy: (): Promise<string> => ipcRenderer.invoke(IPC.failureCopy) as Promise<string>,
  openGuide: (): Promise<string> => ipcRenderer.invoke(IPC.failureGuide) as Promise<string>,
};

contextBridge.exposeInMainWorld(FAILURE_BRIDGE_KEY, bridge);
