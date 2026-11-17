import assert from "node:assert/strict";
import test from "node:test";

import {
  ConfigError,
  assertRunnable,
  buildHostEnvironment,
  pythonCandidates,
  resolvePaths,
} from "../src/config.js";

const existsYes = () => true;
const existsNo = () => false;

test("packaged builds resolve resources and Python from the app bundle", () => {
  const paths = resolvePaths({
    platform: "darwin",
    isPackaged: true,
    resourcesPath: "/Applications/OpenDirector.app/Contents/Resources",
    userDataPath: "/Users/me/Library/Application Support/OpenDirector",
    home: "/Users/me",
    env: {},
  });
  assert.equal(paths.runtimeRoot, "/Applications/OpenDirector.app/Contents/Resources/runtime");
  assert.equal(paths.python, "/Applications/OpenDirector.app/Contents/Resources/runtime/python/bin/python3");
  assert.equal(paths.hostEntry, "/Applications/OpenDirector.app/Contents/Resources/runtime/host_entry.py");
  assert.equal(paths.dataRoot, "/Users/me/.opendirector");
  assert.equal(paths.logsDir, "/Users/me/Library/Application Support/OpenDirector/logs");
});

test("Windows uses Scripts/python.exe and never a POSIX path", () => {
  const paths = resolvePaths({
    platform: "win32",
    isPackaged: true,
    resourcesPath: "C:\\Program Files\\OpenDirector\\resources",
    userDataPath: "C:\\Users\\me\\AppData\\Roaming\\OpenDirector",
    home: "C:\\Users\\me",
    env: {},
    exists: existsYes,
  });
  assert.match(paths.python, /python\\python\.exe$/);
  assert.match(paths.logsDir, /\\logs$/);
  assert.equal(paths.dataRoot, "C:\\Users\\me\\.opendirector");
});

test("development prefers the checkout venv, then the bundled runtime", () => {
  const candidates = pythonCandidates({
    platform: "linux",
    isPackaged: false,
    runtimeRoot: "/repo/runtime",
    repoRoot: "/repo",
    env: {},
  });
  assert.equal(candidates[0], "/repo/runtime/python/bin/python3");
  assert.equal(candidates[1], "/repo/.venv/bin/python");
  assert.ok(candidates.includes("python3"));

  const chosen = resolvePaths({
    platform: "linux",
    isPackaged: false,
    repoRoot: "/repo",
    userDataPath: "/home/me/.config/OpenDirector",
    home: "/home/me",
    env: {},
    exists: (path) => path === "/repo/.venv/bin/python",
  });
  assert.equal(chosen.python, "/repo/.venv/bin/python");
});

test("explicit environment overrides win and are documented by tests", () => {
  const paths = resolvePaths({
    platform: "linux",
    isPackaged: true,
    resourcesPath: "/app/resources",
    userDataPath: "/home/me/.config/OpenDirector",
    home: "/home/me",
    env: {
      OPENDIRECTOR_PYTHON: "/opt/python/bin/python3",
      OPENDIRECTOR_ROOT: "/data/od",
      OPENDIRECTOR_DESKTOP_LOGS: "/var/log/od",
      OPENDIRECTOR_DEV_SERVER: "http://127.0.0.1:5173",
    },
    exists: existsYes,
  });
  assert.equal(paths.python, "/opt/python/bin/python3");
  assert.equal(paths.dataRoot, "/data/od");
  assert.equal(paths.logsDir, "/var/log/od");
  assert.equal(paths.hostLogPath, "/var/log/od/host.log");
});

test("missing runtime pieces fail before any process is spawned", () => {
  const paths = resolvePaths({
    platform: "linux",
    isPackaged: true,
    resourcesPath: "/app/resources",
    userDataPath: "/home/me/.config/OpenDirector",
    home: "/home/me",
    env: {},
  });
  assert.throws(
    () => assertRunnable(paths, { exists: existsNo }),
    (error) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.code, "runtime_missing");
      assert.match(error.detail, /python/);
      return true;
    },
  );
});

test("the Host environment bypasses proxies for loopback and pins its runtime", () => {
  const paths = resolvePaths({
    platform: "linux",
    isPackaged: true,
    resourcesPath: "/app/resources",
    userDataPath: "/home/me/.config/OpenDirector",
    home: "/home/me",
    env: {},
  });
  const env = buildHostEnvironment(paths, {
    PATH: "/usr/bin",
    NO_PROXY: "example.com",
    HTTPS_PROXY: "http://proxy:3128",
  });
  assert.equal(env.OPENDIRECTOR_ROOT, "/home/me/.opendirector");
  assert.equal(env.PYTHONNOUSERSITE, "1");
  assert.equal(env.PYTHONPATH, "/app/resources/runtime/site-packages");
  assert.match(env.PATH, /^\/app\/resources\/runtime\/bin:/);
  assert.match(env.PATH, /\/app\/resources\/runtime\/python\/bin:/);
  assert.match(env.NO_PROXY, /example\.com/);
  assert.match(env.NO_PROXY, /127\.0\.0\.1/);
  assert.equal(env.HTTPS_PROXY, "http://proxy:3128");
});
