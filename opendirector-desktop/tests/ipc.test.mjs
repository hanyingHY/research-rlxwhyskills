import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerIpc } from "../src/ipc.js";
import { createSettingsStore } from "../src/settings.js";

function setupIpc() {
  const handlers = new Map();
  const ipcMain = {
    handle: (channel, fn) => {
      handlers.set(channel, fn);
    },
  };

  const tempRoot = mkdtempSync(join(tmpdir(), "od-ipc-test-"));
  const settingsFile = join(tempRoot, "settings.json");
  const store = createSettingsStore({ filePath: settingsFile });

  const mainFrame = {};
  const webContents = {
    mainFrame,
    send: (ch, ...args) => calls.push({ type: "send", channel: ch, args }),
  };
  const mockWindow = {
    isDestroyed: () => false,
    webContents,
  };

  const calls = [];
  const shell = {
    openPath: async (p) => calls.push({ type: "openPath", path: p }),
  };

  let currentMode = "simple";
  const unregister = registerIpc({
    ipcMain,
    getWindow: () => mockWindow,
    host: { running: false },
    paths: {
      userData: tempRoot,
      appData: tempRoot,
      logs: tempRoot,
    },
    app: {
      getPath: (name) => (name === "home" ? tempRoot : join(tempRoot, name)),
    },
    dialog: {},
    shell,
    clipboard: { writeText: (txt) => calls.push({ type: "clipboard", text: txt }) },
    settings: store,
    locale: () => "zh-CN",
    onModeChanged: (m) => {
      currentMode = m;
      calls.push({ type: "modeChanged", mode: m });
    },
  });

  const trustedEvent = {
    sender: webContents,
    senderFrame: mainFrame,
  };

  const untrustedEvent = {
    sender: webContents,
    senderFrame: {}, // different frame
  };

  return {
    handlers,
    store,
    tempRoot,
    trustedEvent,
    untrustedEvent,
    calls,
    getMode: () => currentMode,
    cleanup: () => {
      unregister();
      rmSync(tempRoot, { recursive: true, force: true });
    },
  };
}

test("ipc rejects calls from untrusted sender frames", async () => {
  const env = setupIpc();
  try {
    const handler = env.handlers.get("od:get-mode");
    assert.ok(handler);
    await assert.rejects(
      () => handler(env.untrustedEvent),
      /Rejected IPC call from an untrusted frame/,
    );
  } finally {
    env.cleanup();
  }
});

test("od:get-mode, od:set-mode and od:toggle-mode work seamlessly and notify listeners", async () => {
  const env = setupIpc();
  try {
    const getMode = env.handlers.get("od:get-mode");
    const setMode = env.handlers.get("od:set-mode");
    const toggleMode = env.handlers.get("od:toggle-mode");

    assert.equal(await getMode(env.trustedEvent), "simple");

    const mode1 = await setMode(env.trustedEvent, "pro");
    assert.equal(mode1, "pro");
    assert.equal(env.store.get().workspace.mode, "pro");
    assert.equal(env.getMode(), "pro");

    const mode2 = await toggleMode(env.trustedEvent);
    assert.equal(mode2, "simple");
    assert.equal(env.store.get().workspace.mode, "simple");
    assert.equal(env.getMode(), "simple");

    const mode3 = await toggleMode(env.trustedEvent);
    assert.equal(mode3, "pro");
  } finally {
    env.cleanup();
  }
});

test("od:create-plugin-template scaffolds python skills and mcp servers", async () => {
  const env = setupIpc();
  try {
    const createTemplate = env.handlers.get("od:create-plugin-template");
    const listPlugins = env.handlers.get("od:list-plugins");
    const openPlugins = env.handlers.get("od:open-plugins-folder");

    // Open plugins folder
    await openPlugins(env.trustedEvent);
    assert.ok(env.calls.some((c) => c.type === "openPath"));

    // Create Python skill template
    const pySkill = await createTemplate(env.trustedEvent, {
      name: "smart-transcriber",
      type: "python",
    });
    assert.equal(pySkill.name, "smart-transcriber");
    assert.ok(existsSync(join(pySkill.path, "skill.yaml")));
    assert.ok(existsSync(join(pySkill.path, "run.py")));
    const pyYaml = readFileSync(join(pySkill.path, "skill.yaml"), "utf-8");
    assert.match(pyYaml, /smart-transcriber/);
    assert.match(pyYaml, /engine:\s*opencode/);

    // Create MCP server template
    const mcpServer = await createTemplate(env.trustedEvent, {
      name: "weather-mcp",
      type: "mcp",
    });
    assert.equal(mcpServer.name, "weather-mcp");
    assert.ok(existsSync(join(mcpServer.path, "skill.yaml")));
    assert.ok(existsSync(join(mcpServer.path, "server.py")));
    const mcpYaml = readFileSync(join(mcpServer.path, "skill.yaml"), "utf-8");
    assert.match(mcpYaml, /weather-mcp/);
    assert.match(mcpYaml, /engine:\s*deepseek/);

    // List plugins
    const list = await listPlugins(env.trustedEvent);
    assert.equal(list.length, 2);
    const pyEntry = list.find((p) => p.name === "smart-transcriber");
    assert.ok(pyEntry);
    assert.equal(pyEntry.engine, "opencode");
    assert.equal(pyEntry.hasManifest, true);

    const mcpEntry = list.find((p) => p.name === "weather-mcp");
    assert.ok(mcpEntry);
    assert.equal(mcpEntry.engine, "deepseek");
    assert.equal(mcpEntry.hasManifest, true);
  } finally {
    env.cleanup();
  }
});
