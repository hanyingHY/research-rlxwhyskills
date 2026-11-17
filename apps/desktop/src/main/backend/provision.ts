/** Creates the Python environment when the installer did not ship one.
 *
 * Packaged Windows builds carry `resources/python-runtime`, so this path is the
 * fallback used by development checkouts and by packages built without a runtime.
 * It creates a virtual environment under user data, installs OpenDirector into it
 * from bundled wheels when present, and verifies the import before reporting success.
 * Nothing is installed into the application directory. */

import { venvExecutable } from "../paths";
import type { RuntimeResolution } from "../../shared/contracts";
import type { CommandRunner } from "./runtime";
import { PACKAGE_CHECK_SCRIPT } from "./runner";

export interface ProvisionOptions {
  /** Interpreter used to create the environment; it must support `venv`. */
  runtime: RuntimeResolution;
  venvRoot: string;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  run: CommandRunner;
  /** Directory holding bundled wheels for offline installs. */
  wheelsDirectory?: string;
  /** Extra requirements file, for example a checkout's `requirements.txt`. */
  requirementsFile?: string;
  indexUrl?: string;
  exists?: (candidate: string) => boolean;
  listWheels?: (directory: string) => string[];
  log?: (line: string) => void;
}

export interface ProvisionResult {
  ok: boolean;
  runtime: RuntimeResolution | null;
  failure: { code: "provision_failed" | "runtime_missing"; detail: string } | null;
  output: string[];
}

const MAX_OUTPUT_LINES = 40;

function record(sink: string[], log: ((line: string) => void) | undefined, text: string): void {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;
    sink.push(trimmed);
    log?.(trimmed);
  }
  if (sink.length > MAX_OUTPUT_LINES) sink.splice(0, sink.length - MAX_OUTPUT_LINES);
}

export async function provisionEnvironment(options: ProvisionOptions): Promise<ProvisionResult> {
  const output: string[] = [];
  const log = (line: string) => record(output, options.log, line);
  const exists = options.exists ?? (() => false);
  const venvPython = venvExecutable(options.venvRoot, options.platform);

  if (!exists(venvPython)) {
    log(`creating virtual environment at ${options.venvRoot}`);
    const created = await options.run(options.runtime.executable, ["-m", "venv", options.venvRoot], {
      timeoutMs: 180_000,
      env: options.env,
    });
    record(output, options.log, created.stdout);
    record(output, options.log, created.stderr);
    if (created.code !== 0 || !exists(venvPython)) {
      return {
        ok: false,
        runtime: null,
        failure: { code: "provision_failed", detail: "python -m venv failed." },
        output,
      };
    }
  }

  const already = await options.run(venvPython, ["-c", PACKAGE_CHECK_SCRIPT], {
    timeoutMs: 60_000,
    env: options.env,
  });
  if (already.code === 0) {
    log("existing environment already provides opendirector");
    return {
      ok: true,
      runtime: {
        source: "venv",
        executable: venvPython,
        version: options.runtime.version,
        hasPackage: true,
        pythonPath: [],
      },
      failure: null,
      output,
    };
  }

  const wheels = options.listWheels
    ? options.listWheels(options.wheelsDirectory ?? "")
    : [];
  const install: string[] = ["-m", "pip", "install", "--disable-pip-version-check", "--no-input"];
  if (wheels.length) {
    // Offline install: only what the package shipped, no index lookups.
    install.push("--no-index", "--find-links", options.wheelsDirectory ?? "");
  } else if (options.indexUrl) {
    install.push("--index-url", options.indexUrl);
  } else if (options.env.OPENDIRECTOR_PIP_INDEX_URL) {
    install.push("--index-url", options.env.OPENDIRECTOR_PIP_INDEX_URL);
  }
  if (options.requirementsFile && exists(options.requirementsFile)) {
    install.push("-r", options.requirementsFile);
  }
  install.push("opendirector");

  log(`installing opendirector (${install.join(" ")})`);
  const installed = await options.run(venvPython, install, {
    timeoutMs: 900_000,
    env: options.env,
  });
  record(output, options.log, installed.stdout);
  record(output, options.log, installed.stderr);
  if (installed.code !== 0) {
    return {
      ok: false,
      runtime: null,
      failure: { code: "provision_failed", detail: "pip install opendirector failed." },
      output,
    };
  }

  const verified = await options.run(venvPython, ["-c", PACKAGE_CHECK_SCRIPT], {
    timeoutMs: 60_000,
    env: options.env,
  });
  if (verified.code !== 0) {
    return {
      ok: false,
      runtime: null,
      failure: { code: "provision_failed", detail: "opendirector is still not importable." },
      output,
    };
  }
  log("environment ready");
  return {
    ok: true,
    runtime: {
      source: "venv",
      executable: venvPython,
      version: options.runtime.version,
      hasPackage: true,
      pythonPath: [],
    },
    failure: null,
    output,
  };
}
