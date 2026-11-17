/** Native application menu, localized to the shell language. */
const STRINGS = {
  "zh-CN": {
    about: "关于 OpenDirector",
    services: "服务",
    hide: "隐藏 OpenDirector",
    hideOthers: "隐藏其他",
    showAll: "全部显示",
    quit: "退出 OpenDirector",
    file: "文件",
    openData: "打开项目数据目录",
    changeData: "更改项目数据目录…",
    openLogs: "打开日志目录",
    close: "关闭窗口",
    edit: "编辑",
    view: "视图",
    reload: "重新载入",
    devTools: "开发者工具",
    help: "帮助",
    project: "项目主页",
    guide: "使用指引",
    tour: "重播使用引导",
    shortcuts: "键盘快捷键",
    updates: "检查更新…",
    settings: "桌面设置",
  },
  "en-US": {
    about: "About OpenDirector",
    services: "Services",
    hide: "Hide OpenDirector",
    hideOthers: "Hide Others",
    showAll: "Show All",
    quit: "Quit OpenDirector",
    file: "File",
    openData: "Open Project Data Folder",
    changeData: "Change Project Data Folder…",
    openLogs: "Open Log Folder",
    close: "Close Window",
    edit: "Edit",
    view: "View",
    reload: "Reload",
    devTools: "Developer Tools",
    help: "Help",
    project: "Project Home",
    guide: "Desktop Guide",
    tour: "Replay the Tour",
    shortcuts: "Keyboard Shortcuts",
    updates: "Check for Updates…",
    settings: "Desktop Settings",
  },
};

export function menuStrings(locale) {
  return locale.startsWith("zh") ? STRINGS["zh-CN"] : STRINGS["en-US"];
}

export function buildMenu({ Menu, app, shell, locale = "en-US", actions }) {
  const t = menuStrings(locale);
  const isMac = process.platform === "darwin";

  const template = [];
  if (isMac) {
    template.push({
      label: "OpenDirector",
      submenu: [
        { role: "about", label: t.about },
        { type: "separator" },
        { label: t.updates, click: () => actions.checkUpdates() },
        { type: "separator" },
        { role: "services", label: t.services },
        { type: "separator" },
        { role: "hide", label: t.hide },
        { role: "hideOthers", label: t.hideOthers },
        { role: "unhide", label: t.showAll },
        { type: "separator" },
        { label: t.quit, accelerator: "Command+Q", click: () => actions.requestQuit() },
      ],
    });
  }

  template.push({
    label: t.file,
    submenu: [
      { label: t.openData, click: () => actions.openDataFolder() },
      { label: t.changeData, click: () => actions.changeDataRoot() },
      { label: t.openLogs, click: () => actions.openLogs() },
      { type: "separator" },
      isMac
        ? { role: "close", label: t.close }
        : { label: t.quit, accelerator: "Ctrl+Q", click: () => actions.requestQuit() },
    ],
  });

  template.push({
    label: t.edit,
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  });

  template.push({
    label: t.view,
    submenu: [
      { role: "reload", label: t.reload },
      { role: "toggleDevTools", label: t.devTools },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  });

  // The guide lives under Help with F1, and every entry point is mirrored in
  // the in-app help centre so keyboard and mouse users find the same things.
  const helpSubmenu = [
    { label: t.guide, accelerator: "F1", click: () => actions.openGuide() },
    { label: t.tour, click: () => actions.openTour() },
    { label: t.shortcuts, accelerator: "Shift+F1", click: () => actions.openShortcuts() },
    { type: "separator" },
    { label: t.updates, click: () => actions.checkUpdates() },
    { type: "separator" },
    {
      label: t.project,
      click: () => shell.openExternal("https://github.com/ThinkFlowLab/OpenDirector"),
    },
  ];
  if (!isMac) {
    helpSubmenu.push({ type: "separator" }, { label: t.about, click: () => actions.about() });
  }

  template.push({ role: "help", label: t.help, submenu: helpSubmenu });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
