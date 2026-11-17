/**
 * Guidance UI rendered by the preload script inside a shadow root, so it
 * cannot be styled or broken by the Web UI, and works before the app's own
 * bundles have mounted.
 */
import {
  HELP_SECTIONS,
  MESSAGES,
  WELCOME,
  text,
} from "./content.js";
import {
  completeTour,
  dismissTip,
  eligibleTips,
  markTipSeen,
  resetTips,
  searchHelp,
  stepLabel,
  tourSteps,
} from "./plan.js";

const HOST_ID = "opendirector-guide-root";
const DARK = {
  bg: "#16171b",
  bgSoft: "#1d1f24",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  border: "rgba(255,255,255,.12)",
  accent: "#f5b54a",
  accentText: "#1a1408",
  accentSoft: "rgba(245,181,74,.16)",
  dim: "rgba(8,9,12,.62)",
  ring: "rgba(245,181,74,.55)",
  shadow: "0 24px 60px rgba(0,0,0,.55)",
};
const LIGHT = {
  bg: "#ffffff",
  bgSoft: "#f6f6f7",
  text: "#18181b",
  muted: "#52525b",
  border: "rgba(24,24,27,.12)",
  accent: "#d97706",
  accentText: "#ffffff",
  accentSoft: "rgba(217,119,6,.14)",
  dim: "rgba(24,24,27,.42)",
  ring: "rgba(217,119,6,.45)",
  shadow: "0 24px 60px rgba(24,24,27,.18)",
};

const STYLE = `
.od{position:fixed;inset:0;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.55;color:var(--od-text);-webkit-font-smoothing:antialiased}
.od *{box-sizing:border-box}
.od-blocker{position:fixed;inset:0;background:var(--od-dim);animation:od-fade .18s ease-out}
.od-spot{position:fixed;border-radius:12px;box-shadow:0 0 0 2px var(--od-accent),0 0 0 9999px var(--od-dim);pointer-events:none;transition:all .2s ease-out}
.od-card{position:fixed;width:min(380px,calc(100vw - 32px));background:var(--od-bg);color:var(--od-text);border:1px solid var(--od-border);border-radius:16px;box-shadow:var(--od-shadow);padding:20px 20px 16px;animation:od-rise .22s cubic-bezier(.2,.8,.2,1)}
.od-card.od-center{left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,calc(100vw - 32px))}
.od-eyebrow{display:inline-flex;align-items:center;gap:6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--od-muted)}
.od-dot{width:6px;height:6px;border-radius:50%;background:var(--od-accent)}
.od-title{font-size:17px;font-weight:650;margin:10px 0 6px;letter-spacing:-.01em}
.od-body{color:var(--od-muted);font-size:13.5px;white-space:pre-wrap}
.od-bullets{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:8px}
.od-bullets li{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:var(--od-text)}
.od-bullets li::before{content:"";flex:0 0 auto;width:16px;height:16px;margin-top:1px;border-radius:50%;background:var(--od-accent-soft);background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M4.5 8.4l2.2 2.2 4.6-4.9' fill='none' stroke='%23f5b54a' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg>")}
.od-actions{display:flex;align-items:center;gap:8px;margin-top:18px;flex-wrap:wrap}
.od-actions .od-spacer{flex:1}
.od-btn{appearance:none;border:1px solid var(--od-border);background:transparent;color:var(--od-text);font:inherit;font-size:13px;font-weight:550;padding:8px 13px;border-radius:9px;cursor:pointer;transition:background .15s,color .15s,transform .1s}
.od-btn:hover{background:var(--od-bg-soft)}
.od-btn:active{transform:translateY(1px)}
.od-btn.od-primary{background:var(--od-accent);border-color:transparent;color:var(--od-accent-text)}
.od-btn.od-primary:hover{filter:brightness(1.06)}
.od-btn.od-ghost{border-color:transparent;color:var(--od-muted);padding:8px 6px}
.od-btn.od-ghost:hover{color:var(--od-text);background:transparent;text-decoration:underline}
.od-btn:focus-visible{outline:2px solid var(--od-accent);outline-offset:2px}
.od-foot{display:flex;align-items:center;justify-content:space-between;margin-top:14px;font-size:12px;color:var(--od-muted)}
.od-dots{display:flex;gap:5px}
.od-dots i{width:6px;height:6px;border-radius:50%;background:var(--od-border)}
.od-dots i.on{background:var(--od-accent);width:16px;border-radius:3px}
.od-kbd{display:inline-flex;align-items:center;border:1px solid var(--od-border);border-bottom-width:2px;border-radius:5px;padding:0 5px;font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--od-muted)}
.od-lang{display:flex;gap:6px;margin-top:16px}
.od-chip{border:1px solid var(--od-border);background:transparent;color:var(--od-muted);font:inherit;font-size:12px;padding:3px 10px;border-radius:999px;cursor:pointer}
.od-chip.on{color:var(--od-text);border-color:var(--od-accent)}
.od-drawer-wrap{position:fixed;inset:0;display:flex;justify-content:flex-end;background:rgba(8,8,10,.45);animation:od-fade .18s ease-out}
.od-drawer{width:min(460px,100vw);height:100%;background:var(--od-bg);border-left:1px solid var(--od-border);box-shadow:var(--od-shadow);display:flex;flex-direction:column;animation:od-slide .24s cubic-bezier(.2,.8,.2,1)}
.od-drawer-head{padding:20px 20px 12px;border-bottom:1px solid var(--od-border)}
.od-drawer-head .od-eyebrow{text-transform:none;letter-spacing:.02em;font-size:12px}
.od-drawer-head h2{margin:6px 0 2px;font-size:18px;font-weight:650;letter-spacing:-.01em}
.od-drawer-head p{margin:0;color:var(--od-muted);font-size:12.5px}
.od-search{margin:12px 20px 0;display:flex;align-items:center;gap:8px;border:1px solid var(--od-border);background:var(--od-bg-soft);border-radius:10px;padding:7px 10px}
.od-search input{flex:1;border:0;background:transparent;color:var(--od-text);font:inherit;font-size:13px;outline:none}
.od-search input::placeholder{color:var(--od-muted)}
.od-scroll{overflow:auto;padding:16px 20px 28px;flex:1;overscroll-behavior:contain}
.od-section{margin-bottom:22px}
.od-section>h3{margin:0 0 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--od-muted);font-weight:600}
.od-item{padding:10px 0;border-bottom:1px solid var(--od-border)}
.od-item:last-child{border-bottom:0}
.od-item h4{margin:0 0 3px;font-size:13.5px;font-weight:600}
.od-item p{margin:0;color:var(--od-muted);font-size:12.5px}
.od-item .od-btn{margin-top:8px;font-size:12px;padding:5px 10px}
.od-empty{color:var(--od-muted);font-size:13px;padding:24px 0;text-align:center}
.od-drawer-foot{border-top:1px solid var(--od-border);padding:12px 20px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.od-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:var(--od-muted);word-break:break-all}
.od-close{position:absolute;right:12px;top:12px;width:28px;height:28px;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--od-muted);cursor:pointer;font-size:16px;line-height:1}
.od-close:hover{background:var(--od-bg-soft);color:var(--od-text)}
.od-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:var(--od-bg);border:1px solid var(--od-border);color:var(--od-text);padding:9px 14px;border-radius:10px;box-shadow:var(--od-shadow);font-size:13px;animation:od-rise .2s ease-out}
.od-mode-pill{position:fixed;top:10px;right:72px;z-index:2147482000;display:inline-flex;align-items:center;background:var(--od-bg);border:1px solid var(--od-border);border-radius:999px;padding:2px 3px;gap:2px;box-shadow:0 4px 16px rgba(0,0,0,.28);backdrop-filter:blur(10px);pointer-events:auto}
.od-mode-btn{appearance:none;border:1px solid transparent;background:transparent;color:var(--od-muted);font:inherit;font-size:12px;font-weight:550;padding:4px 11px;border-radius:999px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:all .15s ease}
.od-mode-btn:hover{color:var(--od-text);background:var(--od-bg-soft)}
.od-mode-btn.on{background:var(--od-accent);color:var(--od-accent-text);border-color:transparent;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.od-mode-btn:focus-visible{outline:2px solid var(--od-accent);outline-offset:1px}
.od-tip .od-title{font-size:15px}
@keyframes od-fade{from{opacity:0}to{opacity:1}}
@keyframes od-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.od-card.od-center{animation:od-pop .22s cubic-bezier(.2,.8,.2,1)}
@keyframes od-pop{from{opacity:0;transform:translate(-50%,-46%) scale(.97)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
@keyframes od-slide{from{transform:translateX(24px);opacity:.6}to{transform:translateX(0);opacity:1}}
@media (prefers-reduced-motion:reduce){.od *{animation:none!important;transition:none!important}}
`;

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function firstVisible(selectors) {
  for (const selector of selectors ?? []) {
    try {
      const node = document.querySelector(selector);
      if (node && node.getBoundingClientRect().width > 0) return node;
    } catch {
      /* invalid selector in a future app version: ignore */
    }
  }
  return null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createGuide({ api, state, locale: initialLocale, systemLocale, onSettingsChange }) {
  let locale = initialLocale;
  let facts = state?.facts ?? {};
  let settings = state?.settings ?? {};
  let mode = settings?.workspace?.mode ?? "simple";
  let modePill = null;
  let onKeydownMode = null;
  let mounted = null;
  let layer = null;
  let layerCleanup = null;
  let tour = null;
  let dismissedForSession = new Set();
  let observer = null;
  let tipTimer = null;
  let currentTip = null;

  const msgs = () => MESSAGES[locale] ?? MESSAGES["en-US"];
  const t = (value) => text(locale, value);

  function ensureModeStyle() {
    if (document.getElementById("od-mode-style")) return;
    const style = document.createElement("style");
    style.id = "od-mode-style";
    style.textContent = `
      [data-od-mode="simple"] #canvas-assistant {
        width: min(540px, 44vw) !important;
        max-width: 90vw !important;
        box-shadow: -8px 0 32px rgba(0,0,0,.42) !important;
        border-left: 1px solid rgba(245, 181, 74, 0.28) !important;
        transition: width .2s ease-out !important;
      }
      [data-od-mode="simple"] .cw-rail {
        opacity: 0.72;
        transition: opacity .2s ease;
      }
      [data-od-mode="simple"] .cw-rail:hover {
        opacity: 1;
      }
    `;
    document.head?.append(style);
  }

  function applyModeUI(nextMode) {
    ensureModeStyle();
    document.documentElement.setAttribute("data-od-mode", nextMode);
    if (nextMode === "simple") {
      document.body?.classList?.add("od-mode-simple");
      document.body?.classList?.remove("od-mode-pro");
      const assistant = document.getElementById("canvas-assistant");
      if (assistant) {
        assistant.removeAttribute("hidden");
        assistant.setAttribute("data-od-expanded", "true");
      }
      const chatBtn = document.querySelector(".cw-chat-button");
      if (chatBtn && assistant?.getAttribute("hidden") !== null) {
        chatBtn.click();
      }
    } else {
      document.body?.classList?.remove("od-mode-simple");
      document.body?.classList?.add("od-mode-pro");
      const assistant = document.getElementById("canvas-assistant");
      assistant?.removeAttribute("data-od-expanded");
    }
    updateModePill();
  }

  function updateModePill() {
    if (!modePill) return;
    const isZh = locale.startsWith("zh");
    modePill.innerHTML = `
      <button class="od-mode-btn ${mode === "simple" ? "on" : ""}" data-mode="simple" title="${isZh ? "简洁模式：Agent 优先对话创作" : "Simple mode: prompt-first agent creation"}">
        <span>✦</span><span>${isZh ? "简洁模式" : "Simple"}</span>
      </button>
      <button class="od-mode-btn ${mode === "pro" ? "on" : ""}" data-mode="pro" title="${isZh ? "专业模式：全功能节点画布" : "Pro mode: full node canvas"}">
        <span>⚡</span><span>${isZh ? "专业模式" : "Pro Studio"}</span>
      </button>
    `;
    modePill.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => setMode(btn.dataset.mode));
    });
  }

  function renderModePill() {
    if (modePill && modePill.isConnected) return modePill;
    const host = ensureHost();
    modePill = el("div", "od-mode-pill");
    modePill.setAttribute("role", "group");
    modePill.setAttribute("aria-label", "Workspace Mode");
    host.append(modePill);
    updateModePill();
    return modePill;
  }

  function setMode(newMode, { persist: shouldPersist = true } = {}) {
    const next = newMode === "pro" ? "pro" : "simple";
    mode = next;
    applyModeUI(mode);
    if (shouldPersist) {
      persist({ workspace: { mode } });
    }
  }

  function toggleMode() {
    setMode(mode === "simple" ? "pro" : "simple");
    const isZh = locale.startsWith("zh");
    toast(
      mode === "simple"
        ? (isZh ? "已切换至简洁模式 (Agent 优先)" : "Switched to Simple Mode (Agent first)")
        : (isZh ? "已切换至专业模式 (画布编辑)" : "Switched to Pro Mode (Canvas studio)"),
    );
  }

  function initMode() {
    applyModeUI(mode);
    renderModePill();
    if (!onKeydownMode) {
      onKeydownMode = (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "m") {
          event.preventDefault();
          toggleMode();
        }
      };
      window.addEventListener("keydown", onKeydownMode, true);
    }
  }

  function theme() {
    return document.documentElement.dataset.theme === "light" ? LIGHT : DARK;
  }

  function applyTheme() {
    const palette = theme();
    const root = mounted;
    if (!root) return;
    for (const [key, value] of Object.entries(palette)) {
      root.style.setProperty(`--od-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`, value);
    }
  }

  function ensureHost() {
    if (mounted && mounted.isConnected) return mounted;
    let host = document.getElementById(HOST_ID);
    if (!host) host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483000;pointer-events:none;";
    document.body.append(host);
    const root = host.attachShadow ? host.shadowRoot ?? host.attachShadow({ mode: "open" }) : host;
    root.replaceChildren();
    const style = el("style");
    style.textContent = STYLE;
    const view = el("div", "od");
    view.style.pointerEvents = "none";
    root.append(style, view);
    mounted = view;
    mounted.hostElement = host;
    applyTheme();
    const observerTheme = new MutationObserver(applyTheme);
    observerTheme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return mounted;
  }

  function clearLayer() {
    layerCleanup?.();
    layerCleanup = null;
    if (!layer) return;
    layer.remove();
    layer = null;
    mounted.hostElement.style.pointerEvents = "none";
    mounted.style.pointerEvents = "none";
    document.removeEventListener("keydown", onKeydown, true);
  }

  function mountLayer(content, { block = true } = {}) {
    const host = ensureHost();
    clearLayer();
    layer = el("div");
    layer.style.pointerEvents = block ? "auto" : "none";
    host.append(layer);
    host.hostElement.style.pointerEvents = "auto";
    for (const node of content) layer.append(node);
    return layer;
  }

  function onKeydown(event) {
    if (!tour) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      tour.finish({ skipped: true });
    } else if (event.key === "ArrowRight" || event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      tour.go(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      tour.go(-1);
    } else if (event.key === "Tab") {
      const focusables = layer?.querySelectorAll("button, [href], input");
      if (!focusables?.length) return;
      const list = [...focusables];
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function persist(patch) {
    settings = { ...settings, ...patch };
    onSettingsChange?.(patch);
    api.guide.updateSettings(patch).catch(() => {});
  }

  /* ---------------------------------------------------------------- welcome */

  function showWelcome() {
    const card = el("div", "od-card od-center");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");

    const bullets = WELCOME.bullets.map((item) => `<li>${escapeHtml(t(item))}</li>`).join("");
    card.innerHTML = `
      <div class="od-eyebrow"><span class="od-dot"></span>OpenDirector Desktop</div>
      <div class="od-title">${escapeHtml(t(WELCOME.title))}</div>
      <div class="od-body">${escapeHtml(t(WELCOME.subtitle))}</div>
      <ul class="od-bullets">${bullets}</ul>
      <div class="od-lang">
        <button class="od-chip ${locale === "zh-CN" ? "on" : ""}" data-lang="zh-CN">中文</button>
        <button class="od-chip ${locale === "en-US" ? "on" : ""}" data-lang="en-US">English</button>
      </div>
      <div class="od-actions">
        <button class="od-btn od-primary" data-act="start">${escapeHtml(t(WELCOME.primary))}</button>
        <button class="od-btn od-ghost" data-act="skip">${escapeHtml(t(WELCOME.secondary))}</button>
      </div>
    `;
    mountLayer([el("div", "od-blocker"), card]);
    card.querySelector('[data-act="start"]').focus();
    card.querySelectorAll("[data-lang]").forEach((button) => {
      button.addEventListener("click", () => setLocale(button.dataset.lang, { persist: true }));
    });
    card.querySelector('[data-act="start"]').addEventListener("click", () => {
      persist({ onboarding: { ...settings.onboarding, completed: true, startedAt: new Date().toISOString() } });
      startTour();
    });
    card.querySelector('[data-act="skip"]').addEventListener("click", () => {
      clearLayer();
      const next = completeTour(settings, { skipped: true });
      settings = next;
      persist({ onboarding: next.onboarding, tips: next.tips });
      scheduleTip(1200);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target === card) card.querySelector('[data-act="start"]').click();
    });
  }

  /* -------------------------------------------------------------------- tour */

  function startTour({ force = false } = {}) {
    if (tour) return;
    const steps = tourSteps({ facts });
    if (!steps.length) return;
    persist({ onboarding: { ...settings.onboarding, completed: true } });
    let index = 0;
    let ctaSelector = null;
    let anchorNode = null;

    function finish({ skipped = false } = {}) {
      clearLayer();
      tour = null;
      anchorNode = null;
      const next = completeTour(settings, { skipped });
      settings = next;
      persist({ onboarding: next.onboarding, tips: next.tips });
      if (!skipped) scheduleTip(1400);
    }

    function currentStep() {
      return steps[index];
    }

    function go(delta) {
      const target = index + delta;
      if (target < 0) return;
      if (target >= steps.length) {
        finish();
        return;
      }
      index = target;
      draw();
    }

    function draw() {
      const step = currentStep();
      anchorNode = firstVisible(step.anchor);
      ctaSelector = step.ctaSelector ?? step.anchor ?? null;
      if (anchorNode) {
        const rect = anchorNode.getBoundingClientRect();
        if (rect.top < 8 || rect.bottom > window.innerHeight - 8) {
          anchorNode.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
      const nodes = [el("div", "od-blocker")];
      let spot = null;
      if (anchorNode) {
        const rect = anchorNode.getBoundingClientRect();
        spot = el("div", "od-spot");
        spot.style.cssText += `left:${rect.left - 6}px;top:${rect.top - 6}px;width:${rect.width + 12}px;height:${rect.height + 12}px;z-index:2`;
        nodes.push(spot);
      }
      const card = el("div", "od-card");
      card.style.zIndex = "3";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-modal", "true");
      card.setAttribute("aria-live", "polite");
      const dots = steps.map((_, i) => `<i class="${i === index ? "on" : ""}"></i>`).join("");
      card.innerHTML = `
        <div class="od-eyebrow"><span class="od-dot"></span>${escapeHtml(locale === "zh-CN" ? "桌面版引导" : "Desktop tour")}</div>
        <div class="od-title">${escapeHtml(t(step.title))}</div>
        <div class="od-body">${escapeHtml(t(step.body))}</div>
        <div class="od-actions">
          ${step.cta ? `<button class="od-btn" data-act="cta">${escapeHtml(t(step.cta))}</button>` : ""}
          <span class="od-spacer"></span>
          ${index > 0 ? `<button class="od-btn" data-act="back">${escapeHtml(msgs().back)}</button>` : ""}
          <button class="od-btn od-primary" data-act="next">${escapeHtml(index === steps.length - 1 ? msgs().done : msgs().next)}</button>
        </div>
        <div class="od-foot">
          <span>${escapeHtml(stepLabel(locale, index + 1, steps.length))}</span>
          <span class="od-dots">${dots}</span>
          <button class="od-btn od-ghost" data-act="skip">${escapeHtml(msgs().skipTour)}</button>
        </div>
      `;
      nodes.push(card);
      mountLayer(nodes);
      tour = { go, finish, draw };

      const position = () => {
        if (!anchorNode || !anchorNode.isConnected) {
          card.classList.add("od-center");
          card.style.removeProperty("left");
          card.style.removeProperty("top");
          return;
        }
        const rect = anchorNode.getBoundingClientRect();
        if (spot) {
          spot.style.left = `${rect.left - 6}px`;
          spot.style.top = `${rect.top - 6}px`;
          spot.style.width = `${rect.width + 12}px`;
          spot.style.height = `${rect.height + 12}px`;
        }
        card.classList.remove("od-center");
        Object.assign(card.style, place(card, rect, step.placement));
      };
      position();
      if (!anchorNode) card.classList.add("od-center");
      const onViewportChange = () => position();
      window.addEventListener("resize", onViewportChange);
      window.addEventListener("scroll", onViewportChange, true);
      layerCleanup = () => {
        window.removeEventListener("resize", onViewportChange);
        window.removeEventListener("scroll", onViewportChange, true);
      };

      card.querySelector('[data-act="next"]').addEventListener("click", () => go(1));
      card.querySelector('[data-act="back"]')?.addEventListener("click", () => go(-1));
      card.querySelector('[data-act="skip"]').addEventListener("click", () => finish({ skipped: true }));
      card.querySelector('[data-act="cta"]')?.addEventListener("click", () => {
        const target = firstVisible(ctaSelector ?? []);
        finish();
        if (target) setTimeout(() => target.click(), 80);
      });
      card.tabIndex = -1;
      card.focus({ preventScroll: true });
      document.addEventListener("keydown", onKeydown, true);
    }

    tour = { go, finish, draw };
    draw();
  }

  function place(card, rect, placement) {
    const margin = 14;
    const gap = 16;
    const width = Math.min(380, window.innerWidth - 32);
    card.style.width = `${width}px`;
    // Measure after mount is not available; approximate height from content.
    const height = card.offsetHeight || 220;
    let order = [placement, "bottom", "top", "right", "left"].filter(Boolean);
    for (const side of order) {
      let left;
      let top;
      if (side === "bottom") {
        left = rect.left + rect.width / 2 - width / 2;
        top = rect.bottom + gap;
        if (top + height > window.innerHeight - margin) continue;
      } else if (side === "top") {
        left = rect.left + rect.width / 2 - width / 2;
        top = rect.top - height - gap;
        if (top < margin) continue;
      } else if (side === "right") {
        left = rect.right + gap;
        top = rect.top + rect.height / 2 - height / 2;
        if (left + width > window.innerWidth - margin) continue;
      } else if (side === "left") {
        left = rect.left - width - gap;
        top = rect.top + rect.height / 2 - height / 2;
        if (left < margin) continue;
      } else {
        continue;
      }
      return {
        left: `${clamp(left, margin, window.innerWidth - width - margin)}px`,
        top: `${clamp(top, margin, window.innerHeight - height - margin)}px`,
      };
    }
    return {
      left: `${clamp(rect.left + rect.width / 2 - width / 2, margin, window.innerWidth - width - margin)}px`,
      top: `${rect.bottom + gap + height > window.innerHeight - margin ? Math.max(margin, rect.top - height - gap) : rect.bottom + gap}px`,
    };
  }

  /* --------------------------------------------------------------------- tip */

  function showTip(tip) {
    currentTip = tip;
    const card = el("div", "od-card od-tip");
    card.setAttribute("role", "dialog");
    card.innerHTML = `
      <div class="od-eyebrow"><span class="od-dot"></span>${escapeHtml(locale === "zh-CN" ? "小提示" : "Tip")}</div>
      <div class="od-title">${escapeHtml(t(tip.title))}</div>
      <div class="od-body">${escapeHtml(t(tip.body))}</div>
      <div class="od-actions">
        ${tip.cta ? `<button class="od-btn" data-act="cta">${escapeHtml(t(tip.cta))}</button>` : ""}
        <span class="od-spacer"></span>
        <button class="od-btn od-ghost" data-act="never">${escapeHtml(msgs().dontShow)}</button>
        <button class="od-btn od-primary" data-act="done">${escapeHtml(msgs().tipDone)}</button>
      </div>
    `;
    const anchor = firstVisible(tip.anchor);
    const nodes = [];
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      Object.assign(card.style, place(card, rect, tip.placement));
    } else {
      card.classList.add("od-center");
    }
    nodes.push(card);
    mountLayer(nodes, { block: false });
    if (anchor) {
      const reposition = () => {
        if (!anchor.isConnected) return;
        Object.assign(card.style, place(card, anchor.getBoundingClientRect(), tip.placement));
      };
      window.addEventListener("resize", reposition);
      window.addEventListener("scroll", reposition, true);
      layerCleanup = () => {
        window.removeEventListener("resize", reposition);
        window.removeEventListener("scroll", reposition, true);
      };
    }
    card.querySelector('[data-act="done"]').addEventListener("click", () => {
      clearLayer();
      const next = markTipSeen(settings, tip.id);
      settings = next;
      persist({ tips: next.tips });
      scheduleTip(24000);
    });
    card.querySelector('[data-act="never"]').addEventListener("click", () => {
      clearLayer();
      const next = dismissTip(settings, tip.id);
      settings = next;
      persist({ tips: next.tips });
      scheduleTip(6000);
    });
    card.querySelector('[data-act="cta"]')?.addEventListener("click", () => {
      const target = firstVisible(tip.ctaSelector ?? tip.anchor ?? []);
      clearLayer();
      const next = markTipSeen(settings, tip.id);
      settings = next;
      persist({ tips: next.tips });
      if (target) setTimeout(() => target.click(), 80);
    });
    card.querySelector('[data-act="done"]').focus({ preventScroll: true });
  }

  function scheduleTip(delay = 2500) {
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => maybeShowTip(), delay);
  }

  function maybeShowTip() {
    if (tour || layer) return;
    // Wait for the real workspace, not the splash page, before offering tips.
    if (!document.querySelector(".cw-topbar, .cw-rail, #root")) return;
    const tips = eligibleTips({
      facts,
      settings,
      isVisible: (selector) => Boolean(firstVisible([selector])),
    }).filter((tip) => !dismissedForSession.has(tip.id));
    if (!tips.length) return;
    showTip(tips[0]);
    dismissedForSession.add(tips[0].id);
  }

  /* -------------------------------------------------------------------- help */

  function openHelp({ section } = {}) {
    if (tour) tour.finish({ skipped: true });
    const wrap = el("div", "od-drawer-wrap");
    const drawer = el("div", "od-drawer");
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    const head = el("div", "od-drawer-head");
    head.innerHTML = `
      <button class="od-close" data-act="close" aria-label="${escapeHtml(msgs().close)}">✕</button>
      <div class="od-eyebrow">OpenDirector Desktop</div>
      <h2>${escapeHtml(msgs().helpTitle)}</h2>
      <p>${escapeHtml(msgs().helpSubtitle)}</p>
    `;
    const search = el("div", "od-search");
    search.innerHTML = `<span aria-hidden="true">⌕</span><input type="search" placeholder="${escapeHtml(msgs().searchPlaceholder)}" aria-label="${escapeHtml(msgs().searchPlaceholder)}" />`;
    const scroll = el("div", "od-scroll");
    scroll.id = "od-help-scroll";
    const foot = el("div", "od-drawer-foot");
    foot.innerHTML = `
      <button class="od-btn" data-act="tour">${escapeHtml(msgs().replayTour)}</button>
      <button class="od-btn" data-act="reset">${escapeHtml(msgs().resetTips)}</button>
      <button class="od-btn od-ghost" data-act="diag">${escapeHtml(msgs().copyDiagnostics)}</button>
      <span class="od-spacer" style="flex:1"></span>
      <span class="od-mono" data-version>v${escapeHtml(state?.appVersion ?? "")}</span>
    `;
    drawer.append(head, search, scroll, foot);
    wrap.append(drawer);
    mountLayer([wrap]);
    drawer.addEventListener("click", (event) => event.stopPropagation());
    wrap.addEventListener("click", (event) => {
      if (event.target === wrap) clearLayer();
    });

    const input = search.querySelector("input");
    let currentSection = section ?? null;

    function render(query = "") {
      const sections = searchHelp(query, { locale, sections: HELP_SECTIONS });
      if (!sections.length) {
        scroll.innerHTML = `<div class="od-empty">${escapeHtml(msgs().noResults)}</div>`;
        return;
      }
      scroll.innerHTML = sections
        .map(
          (group) => `
          <div class="od-section">
            <h3>${escapeHtml(t(group.title))}</h3>
            ${group.items
              .map(
                (item) => `
              <div class="od-item">
                <h4>${escapeHtml(t(item.title))}</h4>
                <p>${escapeHtml(t(item.body))}</p>
                ${
                  item.action
                    ? `<button class="od-btn" data-action="${item.action.type}">${escapeHtml(t(item.action.label))}</button>`
                    : ""
                }
              </div>`,
              )
              .join("")}
          </div>`,
        )
        .join("");
    }

    render();
    if (currentSection) {
      const index = HELP_SECTIONS.findIndex((group) => group.id === currentSection);
      if (index > 0) {
        const target = scroll.querySelectorAll(".od-section")[index];
        target?.scrollIntoView?.({ block: "start" });
      }
    }
    input.addEventListener("input", () => render(input.value));
    input.focus();

    drawer.addEventListener("click", async (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const action = button.dataset.action;
      const act = button.dataset.act;
      if (act === "close") {
        clearLayer();
        return;
      }
      if (act === "tour") {
        clearLayer();
        startTour({ force: true });
        return;
      }
      if (act === "reset") {
        const next = resetTips(settings);
        settings = next;
        dismissedForSession = new Set();
        persist({ tips: next.tips });
        toast(locale === "zh-CN" ? "提示已重置" : "Tips reset");
        return;
      }
      if (act === "diag") {
        try {
          await api.copyDiagnostics();
          toast(msgs().copied);
        } catch {
          toast(locale === "zh-CN" ? "复制失败" : "Copy failed");
        }
        return;
      }
      if (action === "openModels") {
        clearLayer();
        const target = firstVisible([".cw-settings-control button", ".cw-empty button"]);
        target?.click();
        return;
      }
      if (action === "openData") {
        await api.openDataFolder();
        return;
      }
      if (action === "openPlugins") {
        clearLayer();
        await (api.plugins?.openFolder?.() ?? api.openPluginsFolder?.() ?? api.openDataFolder?.());
        return;
      }
      if (action === "toggleMode") {
        clearLayer();
        toggleMode();
        return;
      }
      if (action === "openLogs") {
        await api.openLogs();
        return;
      }
      if (action === "checkUpdates") {
        clearLayer();
        await api.checkForUpdates({ interactive: true });
        return;
      }
    });
  }

  function toast(message) {
    layer?.querySelector(".od-toast")?.remove();
    const node = el("div", "od-toast", escapeHtml(message));
    (layer ?? mountLayer([], { block: false })).append(node);
    setTimeout(() => node.remove(), 2600);
  }

  /* ------------------------------------------------------------------ events */

  function setLocale(next, { persist: shouldPersist = false } = {}) {
    const normalized = next === "zh-CN" ? "zh-CN" : "en-US";
    if (normalized === locale) return;
    locale = normalized;
    if (shouldPersist) {
      persist({ onboarding: { ...settings.onboarding, language: normalized } });
    }
    updateModePill();
    // Re-render the topmost surface in place.
    if (layer) {
      if (layer.querySelector(".od-drawer")) openHelp();
      else if (tour) tour.draw();
      else if (layer.querySelector(".od-tip") && currentTip) {
        const tip = currentTip;
        clearLayer();
        showTip(tip);
      } else showWelcome();
    }
  }

  function observe() {
    if (observer) return;
    observer = new MutationObserver(() => {
      clearTimeout(observe.timer);
      observe.timer = setTimeout(() => {
        if (!tour && !layer) maybeShowTip();
      }, 700);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function watchLocale() {
    let last = locale;
    const check = () => {
      const declared =
        document.documentElement.dataset.locale ||
        document.documentElement.lang ||
        null;
      if (!declared) return;
      const normalized = String(declared).toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
      if (normalized !== last && document.documentElement.dataset.locale) {
        last = normalized;
        setLocale(normalized);
      }
    };
    new MutationObserver(check).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang", "data-locale"],
    });
  }

  function setFacts(next) {
    facts = next ?? {};
  }

  return {
    get locale() {
      return locale;
    },
    get mode() {
      return mode;
    },
    getMode() {
      return mode;
    },
    setMode,
    toggleMode,
    initMode,
    renderModePill,
    showWelcome,
    startTour,
    openHelp,
    maybeShowTip,
    setLocale,
    setFacts,
    observe,
    watchLocale,
    systemLocale,
    scheduleTip,
    close: clearLayer,
    dispose() {
      clearTimeout(tipTimer);
      tipTimer = null;
      observer?.disconnect();
      observer = null;
      if (layer) clearLayer();
      if (onKeydownMode) {
        window.removeEventListener("keydown", onKeydownMode, true);
        onKeydownMode = null;
      }
      modePill?.remove?.();
      modePill = null;
    },
  };
}
