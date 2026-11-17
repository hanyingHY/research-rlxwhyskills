/**
 * Pure guidance logic: which tour steps and tips apply, how settings evolve,
 * and how the help centre is searched. No DOM and no Electron, so it is unit
 * tested directly by Node.
 */
import { HELP_SECTIONS, TIPS, TOUR, text } from "./content.js";

export function normalizeLocale(value) {
  const raw = String(value ?? "").toLowerCase();
  if (raw.startsWith("zh")) return "zh-CN";
  if (raw.startsWith("en")) return "en-US";
  return null;
}

export function pickLocale({ settingsLocale, documentLocale, systemLocale }) {
  return (
    normalizeLocale(settingsLocale) ??
    normalizeLocale(documentLocale) ??
    normalizeLocale(systemLocale) ??
    "en-US"
  );
}

/** `welcome` until the wizard is dismissed, `tour` until the tour ends. */
export function onboardingStage(settings) {
  if (!settings?.onboarding?.completed) return "welcome";
  if (!settings?.onboarding?.tourDone) return "tour";
  return "ready";
}

export function tourSteps({ facts }) {
  return TOUR.filter((step) => (typeof step.when === "function" ? step.when(facts) : true));
}

export function eligibleTips({ facts, settings, isVisible = () => true }) {
  const dismissed = new Set(settings?.tips?.dismissed ?? []);
  const seen = new Set(settings?.tips?.seen ?? []);
  return TIPS.filter((tip) => !dismissed.has(tip.id))
    .filter((tip) => tip.repeatable === true || !seen.has(tip.id))
    .filter((tip) => (typeof tip.when === "function" ? tip.when(facts) : true))
    .filter((tip) => (tip.trigger ? safeVisible(isVisible, tip.trigger) : true))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

function safeVisible(isVisible, selector) {
  try {
    return isVisible(selector) === true;
  } catch {
    return false;
  }
}

/** Record a tip as shown so it does not reappear on the next launch. */
export function markTipSeen(settings, id) {
  const seen = new Set(settings?.tips?.seen ?? []);
  seen.add(id);
  return { ...settings, tips: { ...settings?.tips, seen: [...seen] } };
}

export function dismissTip(settings, id) {
  const dismissed = new Set(settings?.tips?.dismissed ?? []);
  dismissed.add(id);
  return { ...settings, tips: { ...settings?.tips, dismissed: [...dismissed] } };
}

export function resetTips(settings) {
  return { ...settings, tips: { dismissed: [], seen: [] } };
}

/** Settings patch for "finished the tour" or "skipped it". */
export function completeTour(settings, { skipped = false } = {}) {
  return markTipSeen(
    {
      ...settings,
      onboarding: {
        ...settings?.onboarding,
        completed: true,
        tourDone: true,
        startedAt: settings?.onboarding?.startedAt ?? new Date().toISOString(),
        skipped: skipped || undefined,
      },
    },
    "welcome",
  );
}

export function searchHelp(query, { locale = "en-US", sections = HELP_SECTIONS } = {}) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return sections;
  return sections
    .map((section) => {
      const items = section.items.filter((item) => {
        const haystack = [
          text(locale, item.title),
          text(locale, item.body),
          item.keywords ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      });
      return { ...section, items };
    })
    .filter((section) => section.items.length > 0);
}

/**
 * Diagnostics copied from the help centre. Credentials never appear here: the
 * token lives only in the main process and is not passed in.
 */
export function formatDiagnostics(info) {
  const lines = [
    `${info.appName ?? "OpenDirector Desktop"} ${info.appVersion ?? "?"}`,
    `OpenDirector ${info.coreVersion ?? "?"}`,
    `Electron ${info.electron ?? "?"} · Chromium ${info.chrome ?? "?"} · Node ${info.node ?? "?"}`,
    `Platform ${info.platform ?? "?"} ${info.arch ?? ""} (${info.release ?? "?"})`,
    `Locale ${info.locale ?? "?"}`,
    `Data ${info.dataRoot ?? "?"}`,
    `Logs ${info.logDir ?? "?"}`,
    `Host ${info.hostStatus ?? "?"}${info.hostPort ? ` :${info.hostPort}` : ""}`,
  ];
  return lines.join("\n");
}

export function stepLabel(locale, index, total) {
  return locale === "zh-CN" ? `第 ${index} 步，共 ${total} 步` : `Step ${index} of ${total}`;
}
