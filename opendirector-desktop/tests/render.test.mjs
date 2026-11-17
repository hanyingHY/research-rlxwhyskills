/**
 * DOM smoke tests for the guidance layer. These run against jsdom so the
 * welcome, tour, tips and help centre are exercised before Electron is involved.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { JSDOM } from "jsdom";

import { createGuide } from "../src/guide/render.js";
import { sanitizeSettings } from "../src/settings.js";

const guides = [];
after(() => {
  for (const guide of guides) guide.dispose();
});

function rect(left, top, width, height) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
  };
}

function setup({ locale = "zh-CN", facts = { hasModels: false, hasProjects: false } } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html lang="${locale}" data-locale="${locale}" data-theme="dark"><body>
      <div class="cw-topbar">
        <div class="cw-project-heading">Demo</div>
        <div class="cw-top-actions"><button id="export">Export</button></div>
      </div>
      <nav class="cw-rail"><button class="cw-rail-button">Text</button></nav>
      <div class="cw-empty"><button id="configure">Configure</button><button id="example">Example</button></div>
      <button class="cw-chat-button" aria-controls="canvas-assistant">Chat</button>
      <aside id="canvas-assistant" hidden></aside>
      <div class="cw-settings-control"><button id="settings">Settings</button></div>
    </body></html>`,
    { url: "https://od.test/", pretendToBeVisual: true },
  );
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.MutationObserver = window.MutationObserver;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.KeyboardEvent = window.KeyboardEvent;

  for (const node of window.document.querySelectorAll("*")) {
    node.getBoundingClientRect = () => rect(40, 120, 180, 36);
  }

  const calls = [];
  const api = {
    guide: {
      updateSettings: async (patch) => {
        calls.push({ type: "settings", patch });
        return patch;
      },
    },
    copyDiagnostics: async () => calls.push({ type: "diagnostics" }),
    openDataFolder: async () => calls.push({ type: "data" }),
    openLogs: async () => calls.push({ type: "logs" }),
    checkForUpdates: async () => calls.push({ type: "updates" }),
  };

  const state = {
    settings: sanitizeSettings({}),
    facts,
    locale,
    appVersion: "0.1.4",
  };
  const guide = createGuide({
    api,
    state,
    locale,
    systemLocale: "zh-CN",
    onSettingsChange: (patch) => {
      state.settings = { ...state.settings, ...patch };
    },
  });
  guides.push(guide);
  const overlay = () =>
    window.document.getElementById("opendirector-guide-root")?.shadowRoot ?? null;
  const query = (selector) => overlay()?.querySelector(selector) ?? null;
  const click = (selector) => {
    const node = query(selector);
    assert.ok(node, `expected ${selector} in the guide`);
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    return node;
  };
  return { window, document: window.document, guide, calls, state, query, click, overlay };
}

function lastPatch(calls) {
  return [...calls].reverse().find((call) => call.type === "settings")?.patch;
}

test("welcome screen renders, switches language and starts the tour", () => {
  const { guide, query, click, calls, window } = setup();
  guide.showWelcome();

  assert.match(query(".od-card").textContent, /欢迎使用 OpenDirector 桌面版/);
  const chips = [...query(".od-lang").querySelectorAll("button")];
  assert.equal(chips.length, 2);

  chips[1].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.match(query(".od-card").textContent, /Welcome to OpenDirector Desktop/);

  click('[data-act="start"]');
  assert.match(query(".od-card").textContent, /Same canvas, a calmer shell/);
  assert.equal(lastPatch(calls).onboarding.completed, true, "welcome completion is persisted");
});

test("tour walks every step, highlights anchors and records completion", () => {
  const { guide, query, click, calls } = setup();
  guide.showWelcome();
  click('[data-act="start"]');

  // Steps: welcome, project, models, assistant, tools, export, done.
  const seen = [];
  for (let i = 0; i < 6; i += 1) {
    seen.push(query(".od-title").textContent);
    if (i === 1) assert.ok(query(".od-spot"), "the project step highlights a real element");
    click('[data-act="next"]');
  }
  assert.equal(seen.length, 6);
  assert.match(seen[0], /同一套画布/);
  assert.match(seen[2], /连接模型/);
  assert.match(seen[3], /对话/);
  assert.match(seen[5], /导出成片/);

  // The final step closes the tour and persists both flags.
  click('[data-act="next"]');
  assert.equal(query(".od-card"), null);
  const patch = lastPatch(calls);
  assert.equal(patch.onboarding.tourDone, true);
  assert.ok(patch.tips.seen.includes("welcome"));
});

test("Escape and skip both leave the tour without losing the app", () => {
  const first = setup();
  first.guide.startTour();
  first.document.dispatchEvent(new first.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(first.query(".od-card"), null);
  assert.equal(lastPatch(first.calls).onboarding.tourDone, true);

  const second = setup();
  second.guide.showWelcome();
  second.click('[data-act="skip"]');
  assert.equal(second.query(".od-card"), null);
  const patch = lastPatch(second.calls);
  assert.equal(patch.onboarding.completed, true);
  assert.equal(patch.onboarding.tourDone, true);
});

test("model step disappears once a model exists", () => {
  const { guide, query, click } = setup({ locale: "en-US", facts: { hasModels: true } });
  guide.startTour();
  const titles = [];
  for (let i = 0; i < 6; i += 1) {
    titles.push(query(".od-title").textContent);
    const next = query('[data-act="next"]');
    if (!next) break;
    click('[data-act="next"]');
  }
  assert.ok(!titles.some((title) => /Connect a model/.test(title)), titles.join(" | "));
  assert.ok(titles.some((title) => /Create through conversation/.test(title)));
});

test("tips show once, can be dismissed for good and call their action", () => {
  const { guide, query, click, calls } = setup();
  guide.maybeShowTip();
  assert.match(query(".od-tip .od-title").textContent, /还差一步/);

  click('[data-act="done"]');
  assert.equal(query(".od-tip"), null);
  assert.ok(lastPatch(calls).tips.seen.includes("models-missing"));

  const second = setup();
  second.guide.maybeShowTip();
  second.click('[data-act="never"]');
  assert.deepEqual(lastPatch(second.calls).tips.dismissed, ["models-missing"]);

  const third = setup();
  third.guide.maybeShowTip();
  third.click('[data-act="cta"]');
  assert.ok(lastPatch(third.calls).tips.seen.includes("models-missing"));
});

test("help centre searches, runs desktop actions and closes", () => {
  const { guide, query, click, calls, window, overlay } = setup();
  guide.openHelp();
  assert.match(query(".od-drawer").textContent, /桌面版使用指引/);
  assert.ok(overlay().querySelectorAll(".od-item").length >= 10);

  const input = query(".od-search input");
  input.value = "日志";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  const items = overlay().querySelectorAll(".od-item");
  assert.ok(items.length >= 1 && items.length < 10, `filtered to ${items.length}`);

  click('[data-action="openLogs"]');
  assert.ok(calls.some((call) => call.type === "logs"));

  const diag = query('[data-act="diag"]');
  diag.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.ok(calls.some((call) => call.type === "diagnostics"));

  click('[data-act="close"]');
  assert.equal(query(".od-drawer"), null);
});

test("guide follows a language switch made in the app", () => {
  const { guide, document, query } = setup();
  guide.openHelp();
  assert.match(query(".od-drawer").textContent, /桌面版使用指引/);
  document.documentElement.dataset.locale = "en-US";
  guide.setLocale("en-US");
  assert.match(query(".od-drawer").textContent, /Desktop guide/);
});
