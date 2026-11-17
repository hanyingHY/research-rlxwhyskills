/** Finds a Python interpreter able to run `python -m opendirector_api.server`.
 *
 * Order of preference, mirroring how the CLI is installed today:
 *   1. `OPENDIRECTOR_PYTHON` — explicit operator choice.
 *   2. The runtime bundled with the installer (`resources/python-runtime`).
 *   3. A virtual environment the desktop app provisioned on an earlier launch.
 *   4. A source checkout with a system interpreter (editable install, PYTHONPATH).
 *   5. A system interpreter with OpenDirector installed, or one able to install it.
 *
 * The result says whether OpenDirector is importable. When it is not, the session
 * provisions a virtual environment instead of failing. */

import path from "node:path";

import { venvExecutable, type Layout } from "../paths";
import type { FailureCode, RuntimeResolution, RuntimeSource } from "../../shared/contracts";

export const MINIMUM_PYTHON: readonly [number, number] = [3, 11];

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export type CommandRunner = (
  executable: string,
  args: string[],
  options?: { timeoutMs?: number; env?: NodeJS.ProcessEnv; cwd?: string },
) => Promise<CommandResult>;

export interface RuntimeCandidate {
  source: RuntimeSource;
  executable: string;
  /** Arguments before `-m`, for example `-3.12` for the Windows Python launcher. */
  prefix: string[];
  pythonPath: string[];
  /** Skips the existence check because the interpreter is resolved through PATH. */
  onPath?: boolean;
  /** Kept even when no file is found, so an explicit choice is never silently dropped. */
  always?: boolean;
}

export interface RuntimeProbeOptions {
  layout: Layout;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  run: CommandRunner;
  exists?: (candidate: string) => boolean;
  /** OpenDirector checkout root; enables editable-source runs in development. */
  sourceRoot?: string | null;
}

export interface RuntimeResult {
  ok: boolean;
  runtime: RuntimeResolution | null;
  failure: { code: FailureCode; detail: string } | null;
  /** Candidates that were probed, with their outcome, for diagnostics. */
  attempted: string[];
}

const VERSION_SCRIPT = "import sys; print('%d.%d.%d' % sys.version_info[:3])";
const PACKAGE_SCRIPT =
  "import opendirector_api, opendirector; print(opendirector.__file__)";

export function parseVersion(text: string): string | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text.trim());
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

export function meetsMinimum(version: string, minimum: readonly [number, number] = MINIMUM_PYTHON): boolean {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10));
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  return major > minimum[0] || (major === minimum[0] && minor >= minimum[1]);
}

/** An OpenDirector checkout: `packages/core/src` and `apps/api/src` hold the packages. */
export function isSourceCheckout(root: string | null | undefined, exists: (candidate: string) => boolean): boolean {
  if (!root) return false;
  return (
    exists(path.join(root, "package.json")) &&
    exists(path.join(root, "packages", "core", "src", "opendirector")) &&
    exists(path.join(root, "apps", "api", "src", "opendirector_api"))
  );
}

export function sourcePythonPath(root: string): string[] {
  return [path.join(root, "packages", "core", "src"), path.join(root, "apps", "api", "src")];
}

function systemInterpreters(platform: NodeJS.Platform): { executable: string; prefix: string[] }[] {
  if (platform === "win32") {
    // The Windows launcher resolves installed versions without PATH changes.
    return [
      { executable: "py", prefix: ["-3.13"] },
      { executable: "py", prefix: ["-3.12"] },
      { executable: "py", prefix: ["-3.11"] },
      { executable: "py", prefix: ["-3"] },
      { executable: "python", prefix: [] },
    ];
  }
  return [
    { executable: "python3.13", prefix: [] },
    { executable: "python3.12", prefix: [] },
    { executable: "python3.11", prefix: [] },
    { executable: "python3", prefix: [] },
  ];
}

export function candidateRuntimes(options: RuntimeProbeOptions): RuntimeCandidate[] {
  const exists = options.exists ?? ((candidate: string) => true);
  const candidates: RuntimeCandidate[] = [];
  const explicit = options.env.OPENDIRECTOR_PYTHON?.trim();
  if (explicit) {
    candidates.push({
      source: "system",
      executable: explicit,
      prefix: [],
      pythonPath: [],
      always: true,
    });
  }
  const bundled = options.layout.resources.pythonRuntime;
  candidates.push(
    { source: "bundled", executable: path.join(bundled, "python.exe"), prefix: [], pythonPath: [] },
    { source: "bundled", executable: path.join(bundled, "bin", "python3"), prefix: [], pythonPath: [] },
  );
  candidates.push({
    source: "venv",
    executable: venvExecutable(options.layout.user.venv, options.platform),
    prefix: [],
    pythonPath: [],
  });
  const sourceRoot = options.sourceRoot ?? options.env.OPENDIRECTOR_DESKTOP_SOURCE_ROOT ?? null;
  const hasSource = isSourceCheckout(sourceRoot, exists);
  for (const interpreter of systemInterpreters(options.platform)) {
    if (hasSource && sourceRoot) {
      candidates.push({
        source: "source",
        executable: interpreter.executable,
        prefix: interpreter.prefix,
        pythonPath: sourcePythonPath(sourceRoot),
        onPath: true,
      });
    }
    candidates.push({
      source: "system",
      executable: interpreter.executable,
      prefix: interpreter.prefix,
      pythonPath: [],
      onPath: true,
    });
  }
  return candidates.filter(
    (candidate) => candidate.always === true || candidate.onPath === true || exists(candidate.executable),
  );
}

async function probe(
  candidate: RuntimeCandidate,
  options: RuntimeProbeOptions,
): Promise<{ version: string | null; hasPackage: boolean }> {
  const env = { ...options.env };
  if (candidate.pythonPath.length) {
    const existing = env.PYTHONPATH?.trim();
    env.PYTHONPATH = [...candidate.pythonPath, ...(existing ? [existing] : [])].join(path.delimiter);
  }
  const version = await options.run(candidate.executable, [...candidate.prefix, "-c", VERSION_SCRIPT], {
    timeoutMs: 20_000,
    env,
  });
  if (version.code !== 0) return { version: null, hasPackage: false };
  const parsed = parseVersion(version.stdout);
  if (!parsed) return { version: null, hasPackage: false };
  const packageProbe = await options.run(candidate.executable, [...candidate.prefix, "-c", PACKAGE_SCRIPT], {
    timeoutMs: 30_000,
    env,
  });
  return { version: parsed, hasPackage: packageProbe.code === 0 };
}

/** Chooses the interpreter, or explains why none can be used. */
export async function resolveRuntime(options: RuntimeProbeOptions): Promise<RuntimeResult> {
  const attempted: string[] = [];
  const candidates = candidateRuntimes(options);
  let fallback: { candidate: RuntimeCandidate; version: string } | null = null;
  let tooOld: string | null = null;

  for (const candidate of candidates) {
    const outcome = await probe(candidate, options);
    attempted.push(`${candidate.source}:${candidate.executable}${candidate.prefix.length ? ` ${candidate.prefix.join(" ")}` : ""}${outcome.version ? ` python=${outcome.version}` : " unavailable"}${outcome.hasPackage ? " package=ok" : ""}`);
    if (!outcome.version) continue;
    if (!meetsMinimum(outcome.version)) {
      if (!tooOld) tooOld = `${candidate.executable} (${outcome.version})`;
      continue;
    }
    if (outcome.hasPackage) {
      return {
        ok: true,
        runtime: {
          source: candidate.source,
          executable: candidate.executable,
          version: outcome.version,
          hasPackage: true,
          pythonPath: candidate.pythonPath,
        },
        failure: null,
        attempted,
      };
    }
    // A usable interpreter without the package can still be provisioned; prefer
    // bundled or venv interpreters for that, and never provision into the app bundle.
    if (!fallback && candidate.source !== "bundled") {
      fallback = { candidate, version: outcome.version };
    }
  }

  if (fallback) {
    return {
      ok: true,
      runtime: {
        source: fallback.candidate.source,
        executable: fallback.candidate.executable,
        version: fallback.version,
        hasPackage: false,
        pythonPath: fallback.candidate.pythonPath,
      },
      failure: null,
      attempted,
    };
  }

  if (tooOld) {
    return {
      ok: false,
      runtime: null,
      failure: {
        code: "runtime_version",
        detail: `Python 3.11 or newer is required; found ${tooOld}.`,
      },
      attempted,
    };
  }

  return {
    ok: false,
    runtime: null,
    failure: {
      code: "runtime_missing",
      detail: "No Python 3.11+ interpreter and no bundled runtime were found.",
    },
    attempted,
  };
}
