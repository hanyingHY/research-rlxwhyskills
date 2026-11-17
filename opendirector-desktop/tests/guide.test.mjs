import assert from "node:assert/strict";
import { test } from "node:test";

import { HELP_SECTIONS, TIPS, TOUR, WELCOME, text } from "../src/guide/content.js";
import {
  completeTour,
  dismissTip,
  eligibleTips,
  formatDiagnostics,
  markTipSeen,
  normalizeLocale,
  onboardingStage,
  pickLocale,
  resetTips,
  searchHelp,
  tourSteps,
} from "../src/guide/plan.js";
import { sanitizeSettings } from "../src/settings.js";

const settings = () => sanitizeSettings({});

test("locales normalize and prefer the saved choice", () => {
  assert.equal(normalizeLocale("zh-Hans-CN"), "zh-CN");
  assert.equal(normalizeLocale("en-GB"), "en-US");
  assert.equal(normalizeLocale("fr"), null);
  assert.equal(
    pickLocale({ settingsLocale: "en-US", documentLocale: "zh-CN", systemLocale: "zh-CN" }),
    "en-US",
  );
  assert.equal(pickLocale({ documentLocale: "zh-CN", systemLocale: "en-US" }), "zh-CN");
  assert.equal(pickLocale({}), "en-US");
});

test("every tour step is bilingual and ends on a closing step", () => {
  for (const step of TOUR) {
    for (const locale of ["zh-CN", "en-US"]) {
      assert.ok(text(locale, step.title).length > 2, `${step.id} title ${locale}`);
      assert.ok(text(locale, step.body).length > 10, `${step.id} body ${locale}`);
    }
    assert.ok(step.anchor === null || Array.isArray(step.anchor), `${step.id} anchor`);
  }
  assert.equal(TOUR[0].id, "welcome");
  assert.equal(TOUR.at(-1).id, "done");
  for (const locale of ["zh-CN", "en-US"]) {
    assert.ok(text(locale, WELCOME.title).length > 4);
    assert.ok(WELCOME.bullets.length >= 3);
  }
});

test("tour hides the model step once a model is configured", () => {
  const withoutModels = tourSteps({ facts: { hasModels: false } }).map((s) => s.id);
  const withModels = tourSteps({ facts: { hasModels: true } }).map((s) => s.id);
  assert.ok(withoutModels.includes("models"));
  assert.ok(!withModels.includes("models"));
  assert.equal(withoutModels.length, withModels.length + 1);
  // Unknown facts must not silently drop guidance.
  assert.ok(tourSteps({ facts: {} }).some((s) => s.id === "models"));
});

test("tips are ordered, filtered by facts, trigger visibility and dismissals", () => {
  const base = { facts: { hasModels: false, hasProjects: false }, settings: settings() };
  const visible = eligibleTips({ ...base, isVisible: () => true }).map((t) => t.id);
  assert.equal(visible[0], "models-missing");
  assert.ok(visible.includes("assistant-mention"));
  assert.ok(visible.includes("timeline-output"));
  assert.ok(!visible.includes("downloads") === false);

  const hidden = eligibleTips({ ...base, isVisible: () => false }).map((t) => t.id);
  assert.ok(!hidden.includes("assistant-mention"));
  assert.ok(hidden.includes("downloads"));

  const configured = eligibleTips({
    facts: { hasModels: true },
    settings: settings(),
    isVisible: () => true,
  }).map((t) => t.id);
  assert.ok(!configured.includes("models-missing"));

  const priorities = eligibleTips({ ...base, isVisible: () => true }).map((t) => t.priority);
  assert.deepEqual(priorities, [...priorities].sort((a, b) => b - a));
});

test("seen and dismissed tips are not repeated, and reset restores them", () => {
  const once = markTipSeen(settings(), "models-missing");
  const after = eligibleTips({ facts: { hasModels: false }, settings: once, isVisible: () => true }).map(
    (t) => t.id,
  );
  assert.ok(!after.includes("models-missing"));

  const off = dismissTip(settings(), "downloads");
  const still = eligibleTips({ facts: {}, settings: off, isVisible: () => true }).map((t) => t.id);
  assert.ok(!still.includes("downloads"));

  const reset = resetTips(off);
  const back = eligibleTips({ facts: {}, settings: reset, isVisible: () => true }).map((t) => t.id);
  assert.ok(back.includes("downloads"));

  // Immutability: helpers never mutate the input settings.
  assert.deepEqual(off.tips.dismissed, ["downloads"]);
  assert.deepEqual(settings().tips.dismissed, []);
});

test("onboarding stage drives the three first-run surfaces", () => {
  assert.equal(onboardingStage(settings()), "welcome");
  assert.equal(onboardingStage({ onboarding: { completed: true } }), "tour");
  assert.equal(onboardingStage({ onboarding: { completed: true, tourDone: true } }), "ready");

  const done = completeTour(settings());
  assert.equal(done.onboarding.completed, true);
  assert.equal(done.onboarding.tourDone, true);
  assert.ok(done.onboarding.startedAt);
  assert.ok(done.tips.seen.includes("welcome"));

  const skipped = completeTour(settings(), { skipped: true });
  assert.equal(skipped.onboarding.skipped, true);
  assert.equal(sanitizeSettings(skipped).onboarding.skipped, true);
});

test("help search matches both languages and returns grouped results", () => {
  const zh = searchHelp("模型", { locale: "zh-CN" });
  assert.ok(zh.length >= 1);
  assert.ok(zh.some((section) => section.items.some((item) => text("zh-CN", item.title).includes("模型"))));

  const en = searchHelp("update", { locale: "en-US" });
  assert.ok(en.length >= 1);

  assert.deepEqual(searchHelp("zzz-no-such-topic", { locale: "en-US" }), []);
  assert.equal(searchHelp("", { locale: "en-US" }).length, HELP_SECTIONS.length);
  assert.equal(searchHelp("   ", { locale: "zh-CN" }).length, HELP_SECTIONS.length);
});

test("help items declare known actions and non-empty copy", () => {
  const known = new Set([
    "openModels",
    "openData",
    "openLogs",
    "checkUpdates",
    "openPlugins",
    "toggleMode",
  ]);
  for (const section of HELP_SECTIONS) {
    assert.ok(text("zh-CN", section.title) && text("en-US", section.title));
    assert.ok(section.items.length > 0);
    for (const item of section.items) {
      assert.ok(text("zh-CN", item.body).length > 8);
      assert.ok(text("en-US", item.body).length > 8);
      if (item.action) assert.ok(known.has(item.action.type), `unknown action ${item.action.type}`);
    }
  }
  const ids = TIPS.map((tip) => tip.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("diagnostics carry versions and paths but never a token", () => {
  const textValue = formatDiagnostics({
    appName: "OpenDirector Desktop",
    appVersion: "0.1.4",
    coreVersion: "0.1.4",
    electron: "44.0.0",
    chrome: "142",
    node: "22",
    platform: "linux",
    arch: "x64",
    release: "6.8",
    locale: "zh-CN",
    dataRoot: "/home/u/.opendirector",
    logDir: "/home/u/.config/OpenDirector/logs",
    hostStatus: "running",
    hostPort: 41234,
  });
  assert.match(textValue, /0\.1\.4/);
  assert.match(textValue, /41234/);
  assert.match(textValue, /\/home\/u\/\.opendirector/);
  assert.doesNotMatch(textValue, /token|authorization|secret/i);
});
