/** Runtime selection: bundled first, then provisioned, then system, then a useful failure. */

import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import {
  MINIMUM_PYTHON,
  candidateRuntimes,
  isSourceCheckout,
  meetsMinimum,
  parseVersion,
  resolveRuntime,
  sourcePythonPath,
  type CommandResult,
  type RuntimeProbeOptions,
} from "../src/main/backend/runtime";
import { resolveLayout } from "../src/main/paths";

const layout = resolveLayout({
  isPackaged: true,
  resourcesPath: "/app/resources",
  userDataPath: "/user/data",
  moduleDirectory: "/app/dist/src/main",
  env: {},
});

function ok(stdout: string, code = 0): CommandResult {
  return { stdout, stderr: "", code };
}

function runner(answers: Record<string, CommandResult>): RuntimeProbeOptions["run"] {
  return async (executable: string, args: string[]) => {
    const script = args[args.length - 1] ?? "";
    if (script.includes("opendirector_api")) {
      return answers.package ?? { stdout: "", stderr: "ModuleNotFoundError", code: 1 };
    }
    if (script.includes("sys.version_info")) {
      return answers.version ?? { stdout: "", stderr: "", code: 1 };
    }
    return { stdout: "", stderr: "", code: 1 };
  };
}

function options(overrides: Partial<RuntimeProbeOptions> = {}): RuntimeProbeOptions {
  return {
    layout,
    platform: "linux",
    env: {},
    run: runner({ version: ok("3.12.7") }),
    exists: (candidate: string) => candidate.startsWith("/app/resources") || candidate === "/user/data/runtime/venv/bin/python",
    ...overrides,
  };
}

test("version parsing and the minimum gate", () => {
  assert.equal(parseVersion("3.12.7\n"), "3.12.7");
  assert.equal(parseVersion("nonsense"), null);
  assert.equal(meetsMinimum("3.12.7", MINIMUM_PYTHON), true);
  assert.equal(meetsMinimum("3.11.0", MINIMUM_PYTHON), true);
  assert.equal(meetsMinimum("3.10.9", MINIMUM_PYTHON), false);
  assert.equal(meetsMinimum("2.7.18", MINIMUM_PYTHON), false);
});

test("a source checkout is recognized by its package directories", () => {
  const exists = (candidate: string) =>
    ["/src/package.json", "/src/packages/core/src/opendirector", "/src/apps/api/src/opendirector_api"].includes(
      candidate,
    );
  assert.equal(isSourceCheckout("/src", exists), true);
  assert.equal(isSourceCheckout("/elsewhere", exists), false);
  assert.equal(isSourceCheckout(null, exists), false);
  assert.deepEqual(sourcePythonPath("/src"), ["/src/packages/core/src", "/src/apps/api/src"]);
});

test("candidates are ordered: explicit, bundled, venv, source, system", () => {
  const candidates = candidateRuntimes(
    options({
      env: { OPENDIRECTOR_PYTHON: "/opt/python" },
      sourceRoot: "/src",
      exists: (candidate: string) =>
        candidate.startsWith("/app/resources") ||
        candidate === "/user/data/runtime/venv/bin/python" ||
        candidate.startsWith("/src/"),
    }),
  );
  assert.equal(candidates[0]?.executable, "/opt/python");
  assert.equal(candidates[1]?.source, "bundled");
  assert.equal(candidates[1]?.executable, path.join("/app/resources", "python-runtime", "python.exe"));
  assert.equal(candidates.some((candidate) => candidate.source === "venv"), true);
  assert.equal(candidates.some((candidate) => candidate.source === "source"), true);
});

test("the bundled runtime wins when it has the package", async () => {
  const result = await resolveRuntime(
    options({
      run: runner({ version: ok("3.12.7"), package: ok("ok") }),
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.runtime?.source, "bundled");
  assert.equal(result.runtime?.hasPackage, true);
});

test("an interpreter without the package is accepted for provisioning", async () => {
  const result = await resolveRuntime(
    options({
      run: runner({ version: ok("3.12.7"), package: { stdout: "", stderr: "no module", code: 1 } }),
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.runtime?.hasPackage, false);
  // Provisioning installs into user data: never into the read-only bundled runtime.
  assert.equal(result.runtime?.source, "venv");
  assert.ok(result.attempted.length > 0);
});

test("an explicitly configured interpreter is never dropped", () => {
  const candidates = candidateRuntimes(
    options({ env: { OPENDIRECTOR_PYTHON: "/opt/venv/bin/python" }, exists: () => false }),
  );
  assert.equal(candidates[0]?.executable, "/opt/venv/bin/python");
});

test("an old interpreter alone is reported as a version failure", async () => {
  const result = await resolveRuntime(
    options({
      run: runner({ version: ok("3.9.6") }),
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.failure?.code, "runtime_version");
  assert.match(result.failure?.detail ?? "", /3\.9\.6/);
});

test("nothing at all is reported as a missing runtime", async () => {
  const result = await resolveRuntime(
    options({
      run: async () => ({ stdout: "", stderr: "ENOENT", code: null }),
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.failure?.code, "runtime_missing");
});
