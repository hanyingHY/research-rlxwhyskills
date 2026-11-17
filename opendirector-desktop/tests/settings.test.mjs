import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import {
  DEFAULT_SETTINGS,
  createSettingsStore,
  mergeSettings,
  sanitizeSettings,
} from "../src/settings.js";

const temporary = mkdtempSync(join(tmpdir(), "od-settings-"));
after(() => rmSync(temporary, { recursive: true, force: true }));

test("defaults are a complete, frozen shape", () => {
  const value = sanitizeSettings({});
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.onboarding.completed, false);
  assert.equal(value.updates.autoCheck, true);
  assert.equal(value.storage.dataRoot, null);
  assert.deepEqual(value.tips, { dismissed: [], seen: [] });
  assert.equal(Object.isFrozen(DEFAULT_SETTINGS), true);
});

test("merge is deep for objects and replaces arrays", () => {
  const base = sanitizeSettings({});
  const merged = mergeSettings(base, {
    onboarding: { completed: true },
    tips: { dismissed: ["a"] },
  });
  assert.equal(merged.onboarding.completed, true);
  assert.equal(merged.onboarding.tourDone, false);
  assert.deepEqual(merged.tips.dismissed, ["a"]);
  assert.notEqual(merged, base);
  assert.equal(base.onboarding.completed, false);
});

test("sanitize clamps window bounds and rejects unusable data roots", () => {
  const value = sanitizeSettings({
    window: { width: 10, height: 99999, x: 3.6, y: "nope", maximized: true },
    storage: { dataRoot: "relative/path" },
    onboarding: { language: "fr-FR", completed: "yes" },
    tips: { dismissed: ["a", "a", 7, "b"], seen: null },
  });
  assert.equal(value.window.width, 960);
  assert.equal(value.window.height, 10000);
  assert.equal(value.window.x, 4);
  assert.equal(value.window.y, null);
  assert.equal(value.window.maximized, true);
  assert.equal(value.storage.dataRoot, null);
  assert.equal(value.onboarding.language, null);
  assert.equal(value.onboarding.completed, false);
  assert.deepEqual(value.tips.dismissed, ["a", "b"]);
  assert.deepEqual(value.tips.seen, []);
});

test("sanitize accepts absolute POSIX and Windows data roots", () => {
  assert.equal(sanitizeSettings({ storage: { dataRoot: "/srv/projects" } }).storage.dataRoot, "/srv/projects");
  assert.equal(
    sanitizeSettings({ storage: { dataRoot: "D:\\Work\\OpenDirector" } }).storage.dataRoot,
    "D:\\Work\\OpenDirector",
  );
});

test("prototype keys in a patch are ignored", () => {
  const polluted = JSON.parse('{"__proto__": {"polluted": true}}');
  const merged = mergeSettings(sanitizeSettings({}), polluted);
  assert.equal({}.polluted, undefined);
  assert.equal(merged.polluted, undefined);
});

test("store persists atomically and survives a corrupt file", () => {
  const filePath = join(temporary, "settings.json");
  const store = createSettingsStore({ filePath });
  assert.equal(store.get().onboarding.completed, false);

  const updated = store.patch({ onboarding: { completed: true, language: "zh-CN" } });
  assert.equal(updated.onboarding.completed, true);
  const onDisk = JSON.parse(readFileSync(filePath, "utf8"));
  assert.equal(onDisk.onboarding.language, "zh-CN");

  // A new store instance reads the file back.
  assert.equal(createSettingsStore({ filePath }).get().onboarding.completed, true);

  writeFileSync(filePath, "{ not json");
  const warnings = [];
  const recovered = createSettingsStore({ filePath, logger: { warn: (m) => warnings.push(m) } });
  assert.equal(recovered.get().onboarding.completed, false);
  assert.equal(warnings.length, 1);

  recovered.patch({ tips: { seen: ["welcome"] } });
  assert.deepEqual(JSON.parse(readFileSync(filePath, "utf8")).tips.seen, ["welcome"]);

  assert.equal(recovered.reset().tips.seen.length, 0);
});
