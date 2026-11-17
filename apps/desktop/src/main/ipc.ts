/** IPC handlers: a small, validated surface for the two local pages.
 *
 * Every handler re-checks its arguments, even though the preload also validates
 * them: a sandboxed renderer is still untrusted input. No handler accepts a path,
 * a command, or arbitrary data from the page. */

import { clipboard, ipcMain, shell } from "electron";

import { translate } from "./i18n";
import { INSTALLATION_GUIDE_URL } from "./startup/failures";
import {
  IPC,
  isLocale,
  isOpenPathTarget,
  type DesktopInfo,
  type FailurePayload,
  type Locale,
  type OpenPathTarget,
  type RestartResult,
} from "../shared/contracts";

export interface IpcHandlers {
  getInfo(): Promise<DesktopInfo>;
  openPath(target: OpenPathTarget): Promise<void>;
  restartBackend(): Promise<RestartResult>;
  getLocale(): Locale;
  setLocale(locale: Locale): void;
  getFailurePayload(): FailurePayload | null;
  retry(): void;
  quit(): void;
  openLogs(): void;
  buildDiagnostics(): string;
}

export function registerIpc(handlers: IpcHandlers): void {
  ipcMain.handle(IPC.info, async () => handlers.getInfo());

  ipcMain.handle(IPC.openPath, async (_event, target: unknown) => {
    if (!isOpenPathTarget(target)) return;
    await handlers.openPath(target);
  });

  ipcMain.handle(IPC.restartBackend, async () => handlers.restartBackend());

  ipcMain.handle(IPC.getLocale, () => handlers.getLocale());

  ipcMain.handle(IPC.setLocale, (_event, locale: unknown) => {
    if (!isLocale(locale)) return handlers.getLocale();
    handlers.setLocale(locale);
    return handlers.getLocale();
  });

  ipcMain.handle(IPC.failurePayload, () => handlers.getFailurePayload());

  ipcMain.handle(IPC.failureRetry, () => {
    handlers.retry();
  });

  ipcMain.handle(IPC.failureQuit, () => {
    handlers.quit();
  });

  ipcMain.handle(IPC.failureOpenLogs, async () => {
    handlers.openLogs();
    return "";
  });

  ipcMain.handle(IPC.failureCopy, () => {
    const text = handlers.buildDiagnostics();
    clipboard.writeText(text);
    return translate(handlers.getLocale(), "action.copied");
  });

  ipcMain.handle(IPC.failureGuide, async () => {
    await shell.openExternal(INSTALLATION_GUIDE_URL);
    return "";
  });
}
