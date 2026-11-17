/** Readiness polling: the only signal the packaged backend offers. */

import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";

import { LOCAL_REQUEST_HEADER, probeIndex, waitForHealth } from "../src/main/backend/health";

interface FakeServer {
  url: string;
  close: () => Promise<void>;
  hits: { path: string; header: string | undefined }[];
}

/** Serves `/api/health` only after `delayMs`, and `/` with the real page marker. */
async function startServer(options: { delayMs?: number; serveIndex?: boolean } = {}): Promise<FakeServer> {
  const started = Date.now();
  const hits: { path: string; header: string | undefined }[] = [];
  const server = http.createServer((request, response) => {
    hits.push({ path: request.url ?? "/", header: request.headers[LOCAL_REQUEST_HEADER.toLowerCase()] as string | undefined });
    if ((request.url ?? "").startsWith("/api/health")) {
      if (Date.now() - started < (options.delayMs ?? 0)) {
        response.writeHead(503).end("starting");
        return;
      }
      response.writeHead(200, { "content-type": "application/json" }).end('{"status":"ok"}');
      return;
    }
    if (request.url === "/") {
      response
        .writeHead(200, { "content-type": "text/html" })
        .end(options.serveIndex === false ? "not built" : '<!doctype html><div id="root"></div>');
      return;
    }
    response.writeHead(404).end("no");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    hits,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test("health succeeds once the service answers", async () => {
  const server = await startServer({ delayMs: 200 });
  try {
    const outcome = await waitForHealth({
      url: server.url,
      timeoutMs: 5_000,
      intervalMs: 50,
    });
    assert.equal(outcome.ok, true);
    assert.ok(outcome.elapsedMs >= 150);
  } finally {
    await server.close();
  }
});

test("the probe sends the header the loopback middleware requires", async () => {
  const server = await startServer();
  try {
    await waitForHealth({ url: server.url, timeoutMs: 2_000, intervalMs: 30 });
    assert.ok(server.hits.length > 0);
    assert.equal(server.hits[0]?.header, "1");
    assert.equal(server.hits[0]?.path, "/api/health");
  } finally {
    await server.close();
  }
});

test("a service that never becomes ready times out", async () => {
  const server = await startServer({ delayMs: 60_000 });
  try {
    const outcome = await waitForHealth({
      url: server.url,
      timeoutMs: 300,
      intervalMs: 50,
    });
    assert.deepEqual(outcome, { ok: false, reason: "timeout", elapsedMs: outcome.elapsedMs });
    assert.ok(outcome.elapsedMs >= 300);
  } finally {
    await server.close();
  }
});

test("a service that exits is reported as exited, not timed out", async () => {
  const outcome = await waitForHealth({
    url: "http://127.0.0.1:1",
    timeoutMs: 10_000,
    intervalMs: 20,
    isAlive: () => false,
  });
  assert.deepEqual(outcome, { ok: false, reason: "exited", elapsedMs: 0 });
});

test("the index probe only accepts the built application", async () => {
  const good = await startServer();
  try {
    const result = await probeIndex(good.url);
    assert.deepEqual(result, { ok: true, status: 200, isApplication: true });
  } finally {
    await good.close();
  }
  const empty = await startServer({ serveIndex: false });
  try {
    const result = await probeIndex(empty.url);
    assert.equal(result.isApplication, false);
  } finally {
    await empty.close();
  }
  const missing = await probeIndex("http://127.0.0.1:1");
  assert.equal(missing.ok, false);
});
