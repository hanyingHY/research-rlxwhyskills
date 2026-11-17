/**
 * Narrow, validated IPC surface.
 *
 * The renderer never receives a filesystem API, a shell, the Host credential or
 * arbitrary dialog arguments. Every handler rejects calls from any frame other
 * than the main frame of the application window.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ALLOWED_LINK_HOSTS = new Set([
  "github.com",
  "thinkflowlab.github.io",
  "opendirector.dev",
  "www.opendirector.dev",
]);

function allowedLink(raw) {
  try {
    const url = new URL(String(raw));
    if (url.protocol !== "https:") return null;
    if (!ALLOWED_LINK_HOSTS.has(url.hostname)) return null;
    if (url.hostname === "github.com" && !url.pathname.startsWith("/ThinkFlowLab/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function registerIpc({
  ipcMain,
  getWindow,
  host,
  paths,
  app,
  dialog,
  shell,
  clipboard,
  settings,
  locale = () => "en-US",
  requestQuit,
  restartHost,
  chooseDataRoot,
  checkForUpdates,
  desktopInfo,
  openDataFolder,
  openLogs,
  openExternal,
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

  async function currentFacts() {
    if (!host?.running) {
      return { ok: false, hasModels: false, hasProjects: false, modelCount: 0, projectCount: 0 };
    }
    return host.facts();
  }

  handle("od:boot", () => ({
    appVersion: app.getVersion(),
    locale: locale(),
    platform: process.platform,
    arch: process.arch,
    dataRoot: paths.dataRoot,
    logsDir: paths.logsDir,
    host: { running: host.running, port: host.port || null },
    features: { chooseDirectory: true, openDataFolder: true, restartHost: true },
  }));

  handle("od:guide-state", async () => ({
    settings: settings.get(),
    facts: await currentFacts(),
    locale: locale(),
    appVersion: app.getVersion(),
    coreVersion: desktopInfo?.().coreVersion ?? app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    paths: { dataRoot: paths.dataRoot, logsDir: paths.logsDir },
  }));

  /** Renderer-owned preferences (welcome, tour, tips). Values are sanitized. */
  handle("od:guide-settings", (patch) => {
    if (!patch || typeof patch !== "object") throw new Error("Invalid settings patch.");
    return settings.patch(patch);
  });

  handle("od:guide-complete", (payload = {}) => {
    const onboarding = settings.get().onboarding;
    return settings.patch({
      onboarding: {
        ...onboarding,
        completed: true,
        tourDone: true,
        skipped: payload?.skipped === true,
        startedAt: onboarding.startedAt ?? new Date().toISOString(),
      },
    });
  });

  handle("od:desktop-info", () => desktopInfo());

  handle("od:open-logs", async () => {
    await openLogs();
    return true;
  });

  handle("od:open-data-folder", async () => {
    await openDataFolder();
    return true;
  });

  handle("od:choose-directory", async () => {
    const window = getWindow();
    const result = await dialog.showOpenDialog(window, {
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  handle("od:choose-data-root", () => chooseDataRoot());

  handle("od:copy-diagnostics", async () => {
    const { formatDiagnostics } = await import("./guide/plan.js");
    clipboard.writeText(formatDiagnostics(desktopInfo()));
    return true;
  });

  handle("od:check-updates", (options) => checkForUpdates(options ?? {}));

  handle("od:open-external", async (raw) => {
    const url = allowedLink(raw);
    if (!url) return false;
    await openExternal(url);
    return true;
  });

  handle("od:status", () => host.status());

  handle("od:restart-host", () => restartHost());

  handle("od:quit", () => requestQuit());

  handle("od:get-mode", () => settings.get().workspace?.mode ?? "simple");

  handle("od:set-mode", (raw) => {
    const mode = raw === "pro" ? "pro" : "simple";
    return settings.patch({ workspace: { mode } });
  });

  handle("od:toggle-mode", () => {
    const current = settings.get().workspace?.mode ?? "simple";
    const next = current === "simple" ? "pro" : "simple";
    settings.patch({ workspace: { mode: next } });
    return next;
  });

  handle("od:open-plugins-folder", async () => {
    const skillsDir = join(paths.dataRoot, "skills");
    mkdirSync(skillsDir, { recursive: true });
    await shell.openPath(skillsDir);
    return skillsDir;
  });

  handle("od:create-plugin-template", async (pluginName) => {
    const safeName = String(pluginName || "custom-skill").replace(/[^a-zA-Z0-9_-]/g, "-");
    const pluginDir = join(paths.dataRoot, "skills", safeName);
    mkdirSync(pluginDir, { recursive: true });
    const manifestPath = join(pluginDir, "skill.yaml");
    if (!existsSync(manifestPath)) {
      writeFileSync(
        manifestPath,
        `name: ${safeName}\ndescription: Custom agent skill created with OpenDirector Desktop\nengine: opencode\nentrypoint: run.py\n`,
        "utf8",
      );
    }
    const scriptPath = join(pluginDir, "run.py");
    if (!existsSync(scriptPath)) {
      writeFileSync(
        scriptPath,
        `#!/usr/bin/env python3\n"""Sample OpenDirector custom skill / DeepSeek Harness plugin."""\nimport sys\n\ndef main():\n    print("Hello from custom skill ${safeName}!")\n\nif __name__ == "__main__":\n    main()\n`,
        "utf8",
      );
    }
    await shell.openPath(pluginDir);
    return pluginDir;
  });

  handle("od:list-plugins", () => {
    const skillsDir = join(paths.dataRoot, "skills");
    if (!existsSync(skillsDir)) return [];
    try {
      return readdirSync(skillsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => ({ name: d.name, path: join(skillsDir, d.name) }));
    } catch {
      return [];
    }
  });
}
