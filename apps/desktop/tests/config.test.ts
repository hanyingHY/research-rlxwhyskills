/** Desktop preferences are small, damaged files must never block startup. */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { DEFAULT_CONFIG, readConfig, updateConfig, writeConfig } from "../src/main/config";

function temporaryFile(name: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "od-config-"));
  return path.join(directory, name);
}

test("a missing file yields defaults", () => {
  assert.deepEqual(readConfig(temporaryFile("config.json")), DEFAULT_CONFIG);
});

test("a damaged file yields defaults instead of throwing", () => {
  const file = temporaryFile("config.json");
  fs.writeFileSync(file, "{not json");
  assert.deepEqual(readConfig(file), DEFAULT_CONFIG);
});

test("values round-trip", () => {
  const file = temporaryFile("config.json");
  writeConfig(file, {
    lastPort: 8123,
    shellLocale: "en-US",
    window: { x: 10, y: 20, width: 1280, height: 800, maximized: true },
    zoomFactor: 1.2,
  });
  assert.deepEqual(readConfig(file), {
    lastPort: 8123,
    shellLocale: "en-US",
    window: { x: 10, y: 20, width: 1280, height: 800, maximized: true },
    zoomFactor: 1.2,
  });
});

test("out-of-range values are rejected, not trusted", () => {
  const file = temporaryFile("config.json");
  fs.writeFileSync(
    file,
    JSON.stringify({ lastPort: 99999, shellLocale: "fr-FR", zoomFactor: 42, window: { width: 10, height: 10 } }),
  );
  const config = readConfig(file);
  assert.equal(config.lastPort, null);
  assert.equal(config.shellLocale, null);
  assert.equal(config.zoomFactor, 1);
  assert.equal(config.window?.width, 640);
});

test("updates keep the other fields", () => {
  const file = temporaryFile("config.json");
  updateConfig(file, { lastPort: 8000 });
  const updated = updateConfig(file, { zoomFactor: 1.5 });
  assert.equal(updated.lastPort, 8000);
  assert.equal(updated.zoomFactor, 1.5);
});

test("writes are atomic: no temporary file is left behind", () => {
  const file = temporaryFile("config.json");
  updateConfig(file, { lastPort: 8001 });
  assert.equal(fs.existsSync(`${file}.tmp`), false);
  assert.equal(fs.readdirSync(path.dirname(file)).filter((entry) => entry !== "config.json").length, 0);
});
