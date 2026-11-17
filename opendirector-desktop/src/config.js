/**
 * Resource, data and log locations for the desktop shell.
 *
 * Deliberate split:
 *   application resources (read-only)  -> resources/runtime
 *   projects + CLI state (shared)      -> OPENDIRECTOR_ROOT (default ~/.opendirector)
 *   logs, Chromium session and caches  -> platform application-data directory
 *
 * The default data root matches the wheel-installed CLI, so desktop and CLI see
 * the same projects, locks and revisions. `OPENDIRECTOR_ROOT` overrides it.
 */
import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";

export class ConfigError extends Error {
  constructor(message, { detail = "", code = "desktop_configuration" } = {}) {
    super(message);
    this.name = "ConfigError";
    this.detail = detail;
    this.code = code;
  }
}

function pathApi(platform) {
  return platform === "win32" ? win32 : posix;
}

function pythonRelative(platform) {
  return platform === "win32"
    ? ["python", "python.exe"]
    : ["python", "bin", "python3"];
}

/**
 * Candidate interpreters, most specific first. A packaged build must never
 * silently fall back to a system Python; a development build may.
 */
export function pythonCandidates({ platform, isPackaged, runtimeRoot, repoRoot, env }) {
  const p = pathApi(platform);
  const relative = p.join(...pythonRelative(platform));
  const candidates = [];

  if (env.OPENDIRECTOR_PYTHON) candidates.push(env.OPENDIRECTOR_PYTHON);
  candidates.push(p.join(runtimeRoot, relative));

  if (!isPackaged && repoRoot) {
    candidates.push(
      p.join(repoRoot, ".venv", platform === "win32" ? "Scripts/python.exe" : "bin/python"),
    );
  }
  if (!isPackaged) {
    candidates.push(platform === "win32" ? "python.exe" : "python3", "python");
  }
  return [...new Set(candidates)];
}

export function resolvePaths({
  platform = process.platform,
  isPackaged = false,
  resourcesPath = "",
  userDataPath = "",
  home = "",
  repoRoot = "",
  env = {},
  exists = existsSync,
} = {}) {
  const p = pathApi(platform);
  const runtimeRoot =
    env.OPENDIRECTOR_DESKTOP_RUNTIME ||
    (isPackaged ? p.join(resourcesPath, "runtime") : p.join(repoRoot, "runtime"));

  const candidates = pythonCandidates({ platform, isPackaged, runtimeRoot, repoRoot, env });
  const python = candidates.find((candidate) => exists(candidate)) || candidates[0];

  return {
    platform,
    isPackaged,
    runtimeRoot,
    python,
    pythonCandidates: candidates,
    hostEntry: env.OPENDIRECTOR_HOST_ENTRY || p.join(runtimeRoot, "host_entry.py"),
    binDir: p.join(runtimeRoot, "bin"),
    pythonPath:
      env.OPENDIRECTOR_PYTHONPATH ??
      (isPackaged
        ? p.join(runtimeRoot, "site-packages")
        : [p.join(repoRoot, "packages/core/src"), p.join(repoRoot, "apps/api/src")].join(
            p.delimiter,
          )),
    dataRoot: env.OPENDIRECTOR_ROOT || p.join(home, ".opendirector"),
    logsDir: env.OPENDIRECTOR_DESKTOP_LOGS || p.join(userDataPath, "logs"),
    sessionDir: p.join(userDataPath, "session"),
    cacheDir: p.join(userDataPath, "cache"),
    hostLogPath: p.join(env.OPENDIRECTOR_DESKTOP_LOGS || p.join(userDataPath, "logs"), "host.log"),
  };
}

/** Assert the pieces a packaged launch cannot invent at runtime. */
export function assertRunnable(paths, { exists = existsSync } = {}) {
  if (!exists(paths.python)) {
    throw new ConfigError(
      "The bundled Python runtime is missing. Reinstall OpenDirector.",
      { detail: `Expected interpreter: ${paths.python}`, code: "runtime_missing" },
    );
  }
  if (!exists(paths.hostEntry)) {
    throw new ConfigError(
      "The desktop Host entry point is missing. Reinstall OpenDirector.",
      { detail: `Expected file: ${paths.hostEntry}`, code: "host_entry_missing" },
    );
  }
}

/**
 * Environment for the Host process. Proxy variables are bypassed for loopback:
 * a system proxy must not intercept the desktop's own authenticated traffic.
 */
export function buildHostEnvironment(paths, baseEnv = process.env) {
  const env = { ...baseEnv };
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH") || "PATH";
  const parts = [paths.binDir, posix.dirname(paths.python), env[pathKey]].filter(Boolean);

  env[pathKey] = parts.join(paths.platform === "win32" ? ";" : ":");
  env.OPENDIRECTOR_DESKTOP = "1";
  env.OPENDIRECTOR_ROOT = paths.dataRoot;
  env.PYTHONNOUSERSITE = "1";
  env.PYTHONUNBUFFERED = "1";
  env.PYTHONUTF8 = "1";
  env.PYTHONDONTWRITEBYTECODE = "1";
  if (paths.pythonPath) env.PYTHONPATH = paths.pythonPath;

  const bypass = ["127.0.0.1", "localhost", "::1"];
  env.NO_PROXY = [env.NO_PROXY, ...bypass].filter(Boolean).join(",");
  env.no_proxy = [env.no_proxy, ...bypass].filter(Boolean).join(",");
  return env;
}
