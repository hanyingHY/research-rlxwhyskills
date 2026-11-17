import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { isWellFormedToken } from "../src/auth.js";
import { HostSupervisor } from "../src/host.js";
import { createLogger } from "../src/log.js";

const PYTHON =
  process.env.OPENDIRECTOR_TEST_PYTHON || (process.platform === "win32" ? "python" : "python3");
const FAKE_HOST = fileURLToPath(new URL("./fixtures/fake_host.py", import.meta.url));
const TOKEN_PATTERN = /[A-Za-z0-9_-]{43}/;

function harness(env = {}) {
  const directory = mkdtempSync(join(tmpdir(), "od-desktop-test-"));
  const log = createLogger({ directory, fileName: "desktop.log" });
  const host = new HostSupervisor({
    python: PYTHON,
    hostEntry: FAKE_HOST,
    dataRoot: directory,
    env: { ...process.env, ...env },
    log,
    startupTimeoutMs: 8_000,
    shutdownTimeoutMs: 1_500,
    exitGraceMs: 800,
    forceGraceMs: 2_000,
  });
  return { host, directory, log };
}

test("starts on an OS-assigned port and requires the launch token", async (t) => {
  const { host } = harness();
  t.after(() => host.killNow());

  const ready = await host.start();
  assert.equal(isWellFormedToken(host.token), true);
  assert.ok(ready.port > 1023 && ready.port <= 65535);
  assert.equal(host.baseUrl, `http://127.0.0.1:${ready.port}`);

  const health = await host.request("/api/health");
  assert.equal(health.status, 200);
  assert.deepEqual(health.json(), { status: "ok" });

  // Same URL, no credential: the Host must refuse it even though it is loopback.
  const anonymous = await fetch(`http://127.0.0.1:${ready.port}/api/health`);
  assert.equal(anonymous.status, 401);
  const wrong = await fetch(`http://127.0.0.1:${ready.port}/api/health`, {
    headers: { authorization: "Bearer not-the-real-token-but-long-enough-xxxxxxxxx" },
  });
  assert.equal(wrong.status, 401);

  const result = await host.stop();
  assert.equal(result.graceful, true);
  assert.equal(result.code, 0);
  assert.equal(host.running, false);
});

test("reports busy work so quit can ask before interrupting", async (t) => {
  const { host } = harness({ FAKE_HOST_MODE: "busy" });
  t.after(() => host.killNow());
  await host.start();
  const status = await host.status();
  assert.equal(status.busy, true);
  assert.equal(status.unknown, false);
  assert.equal(status.activeToolTasks.length, 1);
  await host.stop();
});

test("a fatal startup message rejects with the Host's explanation", async () => {
  const { host } = harness({ FAKE_HOST_MODE: "fail-start" });
  await assert.rejects(host.start(), (error) => {
    assert.match(error.code, /host_fatal|host_exited/);
    assert.match(error.message, /refused to start/);
    assert.match(error.detail, /induced failure/);
    return true;
  });
  assert.equal(host.running, false);
});

test("a Host that never becomes ready is killed and reported", async () => {
  const { host } = harness({ FAKE_HOST_MODE: "start-hang" });
  host.startupTimeoutMs = 400;
  try {
    await assert.rejects(host.start(), (error) => {
      assert.match(error.code, /host_start_timeout|host_exited/);
      return true;
    });
  } finally {
    await host.stop({ force: true });
  }
  assert.equal(host.running, false);
});

test("a Host that ignores shutdown is escalated to SIGKILL", async (t) => {
  const { host } = harness({ FAKE_HOST_MODE: "ignore-shutdown" });
  t.after(() => host.killNow());
  await host.start();
  const started = Date.now();
  const result = await host.stop();
  assert.equal(result.graceful, false);
  assert.equal(result.forced, true);
  assert.equal(host.running, false);
  assert.ok(Date.now() - started < 10_000, "shutdown escalation must be bounded");
});

test("the launch token never reaches the log file", async (t) => {
  const { host, directory, log } = harness({ FAKE_HOST_MODE: "echo-secret" });
  t.after(() => host.killNow());
  await host.start();
  const token = host.token;
  assert.ok(token);
  await host.stop();
  const contents = readFileSync(log.path, "utf8");
  assert.equal(contents.includes(token), false, "token leaked into desktop.log");
  assert.match(contents, /\[redacted\]/);
  assert.ok(directory.length > 0);
});

test("normal shutdown does not look like a crash", async (t) => {
  const { host } = harness();
  t.after(() => host.killNow());
  await host.start();
  const events = [];
  host.on("exit", (event) => events.push(event));
  await host.stop();
  assert.equal(events.length, 1);
  assert.equal(events[0].unexpected, false);
});
