/** Turns a startup failure into a bilingual, actionable message.
 *
 * A generic "failed to start" is the worst possible outcome for an installed app:
 * the user cannot act on it. Every code below names what stopped and what to do,
 * in the same language the shell is showing. */

import { missingKeys, translate } from "../i18n";
import type {
  FailureCode,
  FailurePayload,
  Locale,
  StartupFailure,
} from "../../shared/contracts";

export const INSTALLATION_GUIDE_URL =
  "https://github.com/ThinkFlowLab/OpenDirector/blob/main/docs/guides/installation.md";

interface Rule {
  code: FailureCode;
  pattern: RegExp;
  detail?: (match: RegExpExecArray) => string;
}

/** Ordered: the first match wins, so specific rules come before generic ones. */
const RULES: Rule[] = [
  {
    code: "port_unavailable",
    pattern: /address already in use|Address already in use|Only one usage of each socket|EADDRINUSE|10048/i,
  },
  {
    code: "web_resources_missing",
    pattern: /缺少前端产物|Web resources missing|web_root/i,
  },
  {
    code: "runtime_missing",
    pattern: /No module named '?(opendirector[^\s']*)'?/i,
    detail: (match) => `opendirector is not importable (${match[1] ?? "opendirector"}).`,
  },
  {
    code: "dependency_missing",
    pattern: /ModuleNotFoundError: No module named '?([^\s']+)'?/i,
    detail: (match) => `Missing Python module: ${match[1] ?? "unknown"}.`,
  },
  {
    code: "dependency_missing",
    pattern: /ImportError: ([^\n]+)/i,
    detail: (match) => `Import error: ${match[1] ?? "unknown"}.`,
  },
  {
    code: "dependency_missing",
    pattern: /ffmpeg|ffprobe/i,
    detail: () => "FFmpeg or ffprobe could not be executed.",
  },
  {
    code: "port_unavailable",
    pattern: /error while attempting to bind on address/i,
  },
  {
    code: "runtime_missing",
    pattern: /spawn error|ENOENT|No such file or directory|\u627e\u4e0d\u5230\u6587\u4ef6/i,
    detail: () => "The interpreter or module could not be executed.",
  },
];

/** Maps backend output to a failure code; unknown output stays `backend_exited`. */
export function classifyBackendOutput(text: string): { code: FailureCode; detail?: string } {
  for (const rule of RULES) {
    const match = rule.pattern.exec(text);
    if (match) return { code: rule.code, detail: rule.detail?.(match) };
  }
  return { code: "backend_exited" };
}

export interface FailureText {
  title: string;
  summary: string;
  remedy: string;
}

export function failureText(failure: StartupFailure, locale: Locale): FailureText {
  return {
    title: translate(locale, "failure.title"),
    summary: translate(locale, `failure.${failure.code}.summary`),
    remedy: translate(locale, `failure.${failure.code}.remedy`),
  };
}

export interface FailureContext {
  appVersion: string;
  locale: Locale;
  dataRoot: string;
  logDirectory: string;
}

export function buildFailurePayload(failure: StartupFailure, context: FailureContext): FailurePayload {
  const text = failureText(failure, context.locale);
  return {
    locale: context.locale,
    code: failure.code,
    stage: failure.stage,
    title: text.title,
    summary: text.summary,
    remedy: text.remedy,
    detail: failure.detail,
    logTail: failure.logTail,
    actions: {
      retry: translate(context.locale, "action.retry"),
      quit: translate(context.locale, "action.quit"),
      openLogs: translate(context.locale, "action.openLogs"),
      copy: translate(context.locale, "action.copy"),
      guide: translate(context.locale, "action.guide"),
    },
    guideUrl: INSTALLATION_GUIDE_URL,
  };
}

/** Startup failures are only useful when the user can send them: no credentials, no prompts. */
export function diagnosticsText(
  payload: FailurePayload,
  facts: Record<string, string | number | boolean | null | undefined>,
): string {
  const lines = [
    "OpenDirector desktop diagnostics",
    `code: ${payload.code}`,
    `stage: ${payload.stage}`,
    ...Object.entries(facts).map(([key, value]) => `${key}: ${value === undefined ? "" : String(value)}`),
    "",
    `summary: ${payload.summary}`,
  ];
  if (payload.detail) lines.push(`detail: ${payload.detail}`);
  if (payload.logTail.length) lines.push("", "--- log tail ---", ...payload.logTail);
  return lines.join("\n");
}

/** Exposed for the localization parity check. */
export function catalogProblems(): string[] {
  return missingKeys();
}
