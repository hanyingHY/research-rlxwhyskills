/**
 * Guards the generated preload bundle: a sandboxed preload may only require
 * "electron", and the guidance layer has to be inside the same file.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = join(root, "dist", "preload.cjs");

test("preload bundle exists and only requires electron", (t) => {
  if (!existsSync(bundlePath)) {
    t.skip("run `npm run build:preload` first");
    return;
  }
  const source = readFileSync(bundlePath, "utf8");
  const requires = [...source.matchAll(/require\(["']([^"']+)["']\)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(requires)], ["electron"]);
  assert.ok(statSync(bundlePath).size > 20_000, "bundle should contain the guidance UI");
});

test("bundle ships both languages and the guide entry points", (t) => {
  if (!existsSync(bundlePath)) {
    t.skip("run `npm run build:preload` first");
    return;
  }
  const source = readFileSync(bundlePath, "utf8");
  for (const needle of [
    "欢迎使用 OpenDirector 桌面版",
    "Welcome to OpenDirector Desktop",
    "opendirector-guide-root",
    "od:guide-state",
    "od-window=main",
  ]) {
    assert.ok(source.includes(needle), `bundle is missing ${needle}`);
  }
  // The token must never be part of anything the renderer can read.
  assert.ok(!source.includes("OPENDIRECTOR_DESKTOP_TOKEN"));
});
