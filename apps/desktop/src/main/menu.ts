/** The native application menu, in the shell's language.
 *
 * The workspace has its own in-page controls and its own language preference; this
 * menu only covers window and desktop actions, and follows the same language so the
 * two never disagree on screen. */

import { Menu, MenuItemConstructorOptions, shell } from "electron";

import { translate } from "./i18n";
import { PRODUCT_NAME, type Locale } from "../shared/contracts";

export const ISSUE_URL = "https://github.com/ThinkFlowLab/OpenDirector/issues";
export const GUIDE_URL =
  "https://github.com/ThinkFlowLab/OpenDirector/blob/main/docs/guides/user-guide.md";

export interface MenuActions {
  reload(): void;
  toggleDevTools(): void;
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  openData(): void;
  openLogs(): void;
  restartBackend(): void;
  setLocale(locale: Locale): void;
  about(): void;
}

export interface MenuContext {
  locale: Locale;
  isMac: boolean;
  /** Shown in the About dialog: local service address, runtime, data folder. */
  aboutDetail: () => { backendUrl: string; runtime: string; data: string };
  /** True while the service is unavailable, which disables restart. */
  restartEnabled: () => boolean;
}

export function buildTemplate(context: MenuContext, actions: MenuActions): MenuItemConstructorOptions[] {
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(context.locale, key, params);

  const template: MenuItemConstructorOptions[] = [
    {
      label: t("menu.file"),
      submenu: [
        {
          label: t("menu.openData"),
          click: () => actions.openData(),
        },
        {
          label: t("menu.openLogs"),
          click: () => actions.openLogs(),
        },
        { type: "separator" },
        {
          label: t("menu.restartBackend"),
          enabled: context.restartEnabled(),
          click: () => actions.restartBackend(),
        },
        { type: "separator" },
        { label: t("menu.quit"), role: "quit" },
      ],
    },
    {
      label: t("menu.edit"),
      submenu: [
        { label: t("menu.undo"), role: "undo" },
        { label: t("menu.redo"), role: "redo" },
        { type: "separator" },
        { label: t("menu.cut"), role: "cut" },
        { label: t("menu.copy"), role: "copy" },
        { label: t("menu.paste"), role: "paste" },
        { label: t("menu.selectAll"), role: "selectAll" },
      ],
    },
    {
      label: t("menu.view"),
      submenu: [
        { label: t("menu.reload"), accelerator: "CmdOrCtrl+R", click: () => actions.reload() },
        {
          label: t("menu.forceReload"),
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => actions.reload(),
        },
        { label: t("menu.devtools"), accelerator: "CmdOrCtrl+Shift+I", click: () => actions.toggleDevTools() },
        { type: "separator" },
        { label: t("menu.zoomIn"), accelerator: "CmdOrCtrl+Plus", click: () => actions.zoomIn() },
        { label: t("menu.zoomOut"), accelerator: "CmdOrCtrl+-", click: () => actions.zoomOut() },
        { label: t("menu.zoomReset"), accelerator: "CmdOrCtrl+0", click: () => actions.resetZoom() },
        { type: "separator" },
        { label: t("menu.fullscreen"), role: "togglefullscreen" },
        { type: "separator" },
        {
          label: t("menu.language"),
          submenu: [
            {
              label: t("menu.languageZh"),
              type: "radio",
              checked: context.locale === "zh-CN",
              click: () => actions.setLocale("zh-CN"),
            },
            {
              label: t("menu.languageEn"),
              type: "radio",
              checked: context.locale === "en-US",
              click: () => actions.setLocale("en-US"),
            },
          ],
        },
      ],
    },
    {
      label: t("menu.window"),
      submenu: [
        { label: t("menu.minimize"), role: "minimize" },
        { label: t("menu.close"), role: "close" },
      ],
    },
    {
      label: t("menu.help"),
      submenu: [
        {
          label: t("menu.guide"),
          click: () => void shell.openExternal(GUIDE_URL),
        },
        {
          label: t("menu.issue"),
          click: () => void shell.openExternal(ISSUE_URL),
        },
        { type: "separator" },
        {
          label: t("menu.about"),
          click: () => actions.about(),
        },
      ],
    },
  ];

  if (context.isMac) {
    template.unshift({
      // The package name is a build detail; users see the product name.
      label: PRODUCT_NAME,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { label: t("menu.quit"), role: "quit" },
      ],
    });
  }

  return template;
}

export function applyMenu(context: MenuContext, actions: MenuActions): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildTemplate(context, actions)));
}
