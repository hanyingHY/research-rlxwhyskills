/**
 * Desktop-only settings (onboarding, dismissals, window state, updates).
 *
 * Separate from OpenDirector's own project/model data: these describe this
 * installation and are safe to delete. Writes are atomic and tolerant of a
 * corrupt or partially written file.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function isAbsolutePath(value) {
  return typeof value === "string" && (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value));
}

export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: SETTINGS_VERSION,
  workspace: {
    mode: "simple", // "simple" (简洁模式/Agent优先) | "pro" (专业模式/全功能画布)
  },
  onboarding: {
    completed: false,
    tourDone: false,
    language: null,
    startedAt: null,
  },
  tips: { dismissed: [], seen: [] },
  storage: { dataRoot: null },
  window: { width: 1440, height: 900, x: null, y: null, maximized: false },
  updates: { autoCheck: true, channel: "stable", lastCheck: null },
  help: { seen: false },
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function mergeSettings(base, patch) {
  if (!isPlainObject(patch)) return base;
  const output = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    output[key] = isPlainObject(value) && isPlainObject(base[key])
      ? mergeSettings(base[key], value)
      : value;
  }
  return output;
}

function stringArray(value, limit = 200) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === "string" && item.length <= 120))].slice(-limit);
}

/** Clamp anything that came from disk or the renderer before it is trusted. */
export function sanitizeSettings(value) {
  const input = isPlainObject(value) ? value : {};
  const workspace = isPlainObject(input.workspace) ? input.workspace : {};
  const onboarding = isPlainObject(input.onboarding) ? input.onboarding : {};
  const tips = isPlainObject(input.tips) ? input.tips : {};
  const windowValue = isPlainObject(input.window) ? input.window : {};
  const storage = isPlainObject(input.storage) ? input.storage : {};
  const updates = isPlainObject(input.updates) ? input.updates : {};

  const clampInt = (candidate, minimum, maximum, fallback) =>
    Number.isFinite(candidate) ? Math.min(maximum, Math.max(minimum, Math.round(candidate))) : fallback;

  return {
    schemaVersion: SETTINGS_VERSION,
    workspace: {
      mode: workspace.mode === "pro" ? "pro" : "simple",
    },
    onboarding: {
      completed: onboarding.completed === true,
      tourDone: onboarding.tourDone === true,
      language:
        onboarding.language === "zh-CN" || onboarding.language === "en-US"
          ? onboarding.language
          : null,
      startedAt: typeof onboarding.startedAt === "string" ? onboarding.startedAt : null,
      skipped: onboarding.skipped === true,
    },
    tips: {
      dismissed: stringArray(tips.dismissed),
      seen: stringArray(tips.seen),
    },
    storage: {
      // Only an absolute path is meaningful; a relative one would resolve
      // against the app bundle when packaged.
      dataRoot: isAbsolutePath(storage.dataRoot) ? storage.dataRoot : null,
    },
    window: {
      width: clampInt(windowValue.width, 960, 10000, DEFAULT_SETTINGS.window.width),
      height: clampInt(windowValue.height, 640, 10000, DEFAULT_SETTINGS.window.height),
      x: Number.isFinite(windowValue.x) ? Math.round(windowValue.x) : null,
      y: Number.isFinite(windowValue.y) ? Math.round(windowValue.y) : null,
      maximized: windowValue.maximized === true,
    },
    updates: {
      autoCheck: updates.autoCheck !== false,
      channel: updates.channel === "beta" ? "beta" : "stable",
      lastCheck: typeof updates.lastCheck === "string" ? updates.lastCheck : null,
    },
    help: { seen: input.help?.seen === true },
  };
}

export function createSettingsStore({ filePath, logger = null }) {
  let current = null;

  function load() {
    if (current) return current;
    try {
      if (!existsSync(filePath)) {
        current = sanitizeSettings(DEFAULT_SETTINGS);
        return current;
      }
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));
      current = sanitizeSettings(parsed);
    } catch (error) {
      logger?.warn?.(`Settings could not be read; using defaults (${error?.message ?? error})`);
      current = sanitizeSettings(DEFAULT_SETTINGS);
    }
    return current;
  }

  function persist() {
    mkdirSync(dirname(filePath), { recursive: true });
    const temporary = `${filePath}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, filePath);
  }

  return {
    filePath,
    get: () => load(),
    /** Deep-merge a patch and return the new settings. */
    patch(patch) {
      current = sanitizeSettings(mergeSettings(load(), patch));
      persist();
      return current;
    },
    reset() {
      current = sanitizeSettings(DEFAULT_SETTINGS);
      persist();
      return current;
    },
  };
}
