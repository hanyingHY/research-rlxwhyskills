/** Contracts shared by the desktop main process, the preload bridge and the renderer.
 *
 * The desktop shell never re-implements the OpenDirector workspace. It starts the
 * same local API, loads the same built web application from `http://127.0.0.1:<port>/`
 * and gives that page a native window. Everything in this file therefore describes
 * hosting concerns only: runtime selection, readiness, failures, native paths. */

export const PRODUCT_NAME = "OpenDirector";

/** Windows AppUserModelID: keeps taskbar grouping and notifications stable across updates. */
export const WINDOWS_APP_USER_MODEL_ID = "ThinkFlowLab.OpenDirector.Desktop";

export const DESKTOP_BRIDGE_KEY = "opendirectorDesktop";
export const FAILURE_BRIDGE_KEY = "opendirectorDesktopFailure";

export type Locale = "zh-CN" | "en-US";

export const LOCALES: readonly Locale[] = ["zh-CN", "en-US"] as const;

/** Matches the web application default: Chinese browsers stay Chinese. */
export const DEFAULT_LOCALE: Locale = "zh-CN";

export function isLocale(value: unknown): value is Locale {
  return value === "zh-CN" || value === "en-US";
}

/** Where the Python interpreter that runs the backend came from. */
export type RuntimeSource = "bundled" | "venv" | "source" | "system";

export interface RuntimeResolution {
  source: RuntimeSource;
  /** Absolute path of the interpreter that should run `-m opendirector_api.server`. */
  executable: string;
  /** `3.12.7` style version string reported by the interpreter. */
  version: string;
  /** True when `opendirector_api` imports cleanly from this interpreter. */
  hasPackage: boolean;
  /** Extra `PYTHONPATH` entries, used by editable source checkouts. */
  pythonPath: string[];
}

export type StartupStage =
  | "resolving-runtime"
  | "provisioning-environment"
  | "reserving-port"
  | "starting-backend"
  | "waiting-for-backend"
  | "opening-window"
  | "ready"
  | "failed";

export type FailureCode =
  | "runtime_missing"
  | "runtime_version"
  | "provision_failed"
  | "port_unavailable"
  | "backend_exited"
  | "backend_timeout"
  | "web_resources_missing"
  | "dependency_missing"
  | "renderer_failed"
  | "unknown";

export const FAILURE_CODES: readonly FailureCode[] = [
  "runtime_missing",
  "runtime_version",
  "provision_failed",
  "port_unavailable",
  "backend_exited",
  "backend_timeout",
  "web_resources_missing",
  "dependency_missing",
  "renderer_failed",
  "unknown",
];

export interface StartupFailure {
  code: FailureCode;
  /** Short technical detail, already localized when produced by a known rule. */
  detail?: string;
  /** Last backend log lines, most recent last. */
  logTail: string[];
  /** Stage the startup reached, so the message can say where it stopped. */
  stage: StartupStage;
}

export interface BackendInfo {
  url: string;
  port: number;
  runtimeSource: RuntimeSource;
  pythonVersion: string | null;
  /** Workspace root: projects, credentials and caches. Never inside the install directory. */
  dataRoot: string;
  /** Directory the backend serves `index.html` from, when it could be resolved. */
  webRoot: string | null;
  pid: number | null;
  /** Milliseconds between spawn and the first successful health response. */
  readyInMs: number;
}

export interface DesktopPaths {
  /** Application resources (read-only, replaced by an update). */
  resources: string;
  /** Projects, model credentials and caches (survives updates and uninstall). */
  data: string;
  /** Desktop and backend log files. */
  logs: string;
  /** Persisted desktop preferences (window bounds, last port, shell language). */
  config: string;
}

export interface DesktopInfo {
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  locale: Locale;
  backend: BackendInfo | null;
  paths: DesktopPaths;
  activeOperations: number;
}

export interface StartupStatus {
  stage: StartupStage;
  detail?: string;
  failure?: StartupFailure;
}

/** IPC channels. The preload bridge exposes only these, with validated payloads. */
export const IPC = {
  info: "opendirector:info",
  openPath: "opendirector:open-path",
  restartBackend: "opendirector:restart-backend",
  getLocale: "opendirector:get-locale",
  setLocale: "opendirector:set-locale",
  status: "opendirector:status",
  failurePayload: "opendirector:failure:payload",
  failureRetry: "opendirector:failure:retry",
  failureQuit: "opendirector:failure:quit",
  failureOpenLogs: "opendirector:failure:open-logs",
  failureCopy: "opendirector:failure:copy",
  failureGuide: "opendirector:failure:open-guide",
} as const;

export interface LocaleChangeResult {
  locale: Locale;
}

export interface RestartResult {
  ok: boolean;
  message: string;
}

/** What the workspace page can ask the shell to do. Nothing else is exposed. */
export interface DesktopBridge {
  info(): Promise<DesktopInfo>;
  openPath(target: OpenPathTarget): Promise<void>;
  restartBackend(): Promise<RestartResult>;
  getLocale(): Promise<Locale>;
  setLocale(locale: Locale): Promise<Locale>;
  onStatus(listener: (status: StartupStatus) => void): () => void;
}

/** What the startup failure page can ask the shell to do. */
export interface FailureBridge {
  payload(): Promise<FailurePayload | null>;
  retry(): Promise<void>;
  quit(): Promise<void>;
  openLogs(): Promise<string>;
  copy(): Promise<string>;
  openGuide(): Promise<string>;
}

/** Targets accepted by `openPath`. Anything else is rejected by the main process. */
export const OPEN_PATH_TARGETS = ["data", "logs", "resources"] as const;

export type OpenPathTarget = (typeof OPEN_PATH_TARGETS)[number];

export function isOpenPathTarget(value: unknown): value is OpenPathTarget {
  return (
    typeof value === "string" &&
    (OPEN_PATH_TARGETS as readonly string[]).includes(value)
  );
}

export interface FailurePayload {
  locale: Locale;
  code: FailureCode;
  stage: StartupStage;
  title: string;
  summary: string;
  remedy: string;
  detail?: string;
  logTail: string[];
  actions: {
    retry: string;
    quit: string;
    openLogs: string;
    copy: string;
    guide: string;
  };
  guideUrl: string;
}

/** Endpoints whose in-flight requests mean "work would be lost if the window closed".
 *
 * Generation and tool runs are the long ones; the timeline package export streams
 * from the API. A pending request to any `/api/` path older than the grace period
 * is reported the same way, so new endpoints are covered without a code change. */
export const OPERATION_URL_PATTERNS: readonly RegExp[] = [
  /\/api\/creation\/projects\/[^/]+\/tool-tasks(\/|$|\?)/,
  /\/api\/creation\/projects\/[^/]+\/timelines\/[^/]+\/package(\/|$|\?)/,
  /\/api\/creation\/projects\/[^/]+\/commits(\/|$|\?)/,
  /\/api\/creation\/projects\/[^/]+\/uploads(\/|$|\?)/,
];

/** A request is only "work in progress" once it outlives routine polling traffic. */
export const OPERATION_GRACE_MS = 5_000;
