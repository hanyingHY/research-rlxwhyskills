/** Localization: both languages ship together and agree on every key. */

import assert from "node:assert/strict";
import { test } from "node:test";

import { detectShellLocale, format, missingKeys, translate } from "../src/main/i18n";
import { FAILURE_CODES, LOCALES } from "../src/shared/contracts";

test("both locales define the same keys", () => {
  assert.deepEqual(missingKeys(), []);
});

test("every failure code has a summary and a remedy in both languages", () => {
  for (const code of FAILURE_CODES) {
    for (const locale of LOCALES) {
      for (const part of ["summary", "remedy"]) {
        const value = translate(locale, `failure.${code}.${part}`);
        assert.notEqual(value, `failure.${code}.${part}`, `${locale} ${code} ${part}`);
        assert.ok(value.length > 10, `${locale} ${code} ${part} is too short`);
      }
    }
  }
});

test("every startup stage has a label in both languages", () => {
  const stages = [
    "resolving-runtime",
    "provisioning-environment",
    "reserving-port",
    "starting-backend",
    "waiting-for-backend",
    "opening-window",
    "ready",
    "failed",
  ];
  for (const stage of stages) {
    for (const locale of LOCALES) {
      assert.notEqual(translate(locale, `stage.${stage}`), `stage.${stage}`);
    }
  }
});

test("missing keys fall back instead of rendering blank", () => {
  assert.equal(translate("en-US", "does.not.exist"), "does.not.exist");
});

test("interpolation fills placeholders and leaves unknown ones visible", () => {
  assert.equal(format("a {x} b", { x: 1 }), "a 1 b");
  assert.equal(format("a {x} b", {}), "a {x} b");
  assert.equal(
    translate("en-US", "quit.message", { count: 3 }).includes("3"),
    true,
  );
});

test("Chinese systems get Chinese, everything else English", () => {
  assert.equal(detectShellLocale({ systemLocale: "zh-CN" }), "zh-CN");
  assert.equal(detectShellLocale({ systemLocale: "en-US" }), "en-US");
  assert.equal(detectShellLocale({ systemLocale: "ja-JP" }), "en-US");
  assert.equal(detectShellLocale({ systemLocale: "zh-CN", preferred: "en-US" }), "en-US");
  assert.equal(detectShellLocale({ preferred: "nonsense" }), "en-US");
});
