/** End-to-end startup against a stub API: resolve, spawn, wait, verify, stop.
 *
 * The stub answers the same two requests the real backend answers, so this covers
 * the whole hosting contract without installing OpenDirector. The runtime probes are
 * stubbed; the process lifecycle, readiness polling and shutdown are real. */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { BackendSession, backendEnvironment } from "../src/main/backend/session";
import { reservePort } from "../src/main/backend/port";
import { resolveLayout } from "../src/main/paths";
import type { Logger } from "../src/main/logging";

const STUB_PACKAGE_ROOT = path.resolve(__dirname, "..", "..", "tests", "fixtures", "stubpkg");
const PYTHON = process.env.OPENDIRECTOR_TEST_PYTHON ?? "python3";
const available = spawnSync(PYTHON, ["-c", "print(1)"], { encoding: "utf8" });

function silentLogger(): Logger {
  return {
    file: "/dev/null",
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    tail: () => [],
  };
}

function makeLayout(): ReturnType<typeof resolveLayout> {
  return resolveLayout({
    isPackaged: true,
    resourcesPath: "/resources",
    userDataPath: fs.mkdtempSync(path.join(os.tmpdir(), "od-session-")),
    moduleDirectory: "/app/dist/src/main",
    env: {},
  });
}

/** Probes are stubbed: the stub package always answers "3.12.7" and imports. */
function stubRunner() {
  return async (_executable: string, args: string[]) => {
    const script = args[args.length - 1] ?? "";
    if (script.includes("sys.version_info")) return { stdout: "3.12.7\n", stderr: "", code: 0 };
    if (script.includes("opendirector_api")) return { stdout: "ok\n", stderr: "", code: 0 };
    return { stdout: "", stderr: "", code: 1 };
  };
}

function makeSession(
  layout: ReturnType<typeof resolveLayout>,
  overrides: Partial<ConstructorParameters<typeof BackendSession>[0]> = {},
) {
  return new BackendSession({
    layout,
    locale: "en-US",
    platform: process.platform,
    env: {
      ...process.env,
      OPENDIRECTOR_PYTHON: PYTHON,
      PYTHONPATH: STUB_PACKAGE_ROOT,
    } as NodeJS.ProcessEnv,
    logger: silentLogger(),
    preferredPort: 0,
    run: stubRunner(),
    exists: () => true,
    ...overrides,
  });
}

test("the backend starts, serves the workspace, and stops", { skip: available.status !== 0 }, async (t) => {
  const layout = makeLayout();
  const preferred = (await reservePort({ preferred: 18_000 })).port;
  const session = makeSession(layout, { preferredPort: preferred });
  t.after(() => session.stop());

  const result = await session.start();
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.info.port, preferred);
  assert.equal(result.info.url, `http://127.0.0.1:${preferred}`);
  // The test pins an explicit interpreter, which the resolver reports as `system`.
  assert.equal(result.info.runtimeSource, "system");
  assert.equal(result.info.dataRoot, layout.user.data);

  const page = await fetch(`${result.info.url}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /id="root"/);

  assert.equal(session.running, true);
  await session.stop();
  assert.equal(session.running, false);
});

test("a busy port is reported with the remedy code", { skip: available.status !== 0 }, async (t) => {
  const layout = makeLayout();
  const session = makeSession(layout, {
    preferredPort: (await reservePort({ preferred: 18_100 })).port,
    env: {
      ...process.env,
      OPENDIRECTOR_PYTHON: PYTHON,
      PYTHONPATH: STUB_PACKAGE_ROOT,
      STUB_FAIL_MODE: "port_unavailable",
    } as NodeJS.ProcessEnv,
  });
  const result = await session.start();
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.failure.code, "port_unavailable");
  assert.ok(result.failure.logTail.length >= 0);
});

test("a crashing backend is classified from its output", { skip: available.status !== 0 }, async (t) => {
  const layout = makeLayout();
  const session = makeSession(layout, {
    preferredPort: (await reservePort({ preferred: 18_200 })).port,
    env: {
      ...process.env,
      OPENDIRECTOR_PYTHON: PYTHON,
      PYTHONPATH: STUB_PACKAGE_ROOT,
      STUB_FAIL_MODE: "dependency",
    } as NodeJS.ProcessEnv,
  });
  t.after(() => session.stop());
  const result = await session.start();
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.failure.code, "dependency_missing");
  assert.match(result.failure.detail ?? "", /uvicorn/);
});

test("a backend that never becomes ready times out", { skip: available.status !== 0 }, async (t) => {
  const layout = makeLayout();
  const session = makeSession(layout, {
    preferredPort: (await reservePort({ preferred: 18_300 })).port,
    healthTimeoutMs: 3_000,
    env: {
      ...process.env,
      OPENDIRECTOR_PYTHON: PYTHON,
      PYTHONPATH: STUB_PACKAGE_ROOT,
      STUB_DELAY_SECONDS: "30",
    } as NodeJS.ProcessEnv,
  });
  t.after(() => session.stop());
  const result = await session.start();
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.failure.code, "backend_timeout");
});

test("the backend environment keeps data outside the app and tools inside it", () => {
  const layout = makeLayout();
  const environment = backendEnvironment({
    layout,
    locale: "zh-CN",
    url: "http://127.0.0.1:8000",
    pythonPath: ["/src/packages/core/src"],
    env: { PATH: "/usr/bin", PYTHONPATH: "/existing" } as NodeJS.ProcessEnv,
  });
  assert.equal(environment.OPENDIRECTOR_ROOT, layout.user.data);
  assert.equal(environment.OPENDIRECTOR_API_URL, "http://127.0.0.1:8000");
  assert.equal(environment.OPENDIRECTOR_LANGUAGE, "zh-CN");
  assert.equal(environment.OPENDIRECTOR_DESKTOP, "1");
  assert.equal(environment.PYTHONUTF8, "1");
  assert.equal(environment.PYTHONUNBUFFERED, "1");
  assert.match(environment.PYTHONPATH ?? "", /\/src\/packages\/core\/src/);
  assert.match(environment.PYTHONPATH ?? "", /\/existing/);
  assert.match(environment.PATH ?? "", /\/resources\/bin/);
  assert.match(environment.NO_PROXY ?? "", /127\.0\.0\.1/);
});

test("restart returns a usable service again", { skip: available.status !== 0 }, async (t) => {
  const layout = makeLayout();
  const session = makeSession(layout, { preferredPort: (await reservePort({ preferred: 18_400 })).port });
  t.after(() => session.stop());
  const first = await session.start();
  assert.equal(first.ok, true);
  const second = await session.restart();
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const health = await fetch(`${second.info.url}/api/health`);
  assert.equal(health.status, 200);
  await session.stop();
});

after(() => {
  // Nothing to clean: temp layouts live in the OS temp directory.
});
