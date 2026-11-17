/** Port allocation keeps the loopback origin stable, because the workspace stores
 *  its language, theme and last project in that origin's storage. */

import assert from "node:assert/strict";
import net from "node:net";
import { test } from "node:test";

import { DEFAULT_PORT, probePort, reservePort } from "../src/main/backend/port";

function occupy(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen({ port, host: "127.0.0.1", exclusive: true }, () => resolve(server));
  });
}

function close(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

test("a free port is reported as free", async () => {
  assert.equal(await probePort(DEFAULT_PORT + 900), true);
});

test("a listening port is reported as busy", async () => {
  const port = DEFAULT_PORT + 901;
  const server = await occupy(port);
  try {
    assert.equal(await probePort(port), false);
  } finally {
    await close(server);
  }
});

test("the preferred port is used when it is free", async () => {
  const port = DEFAULT_PORT + 902;
  const result = await reservePort({ preferred: port, span: 5 });
  assert.deepEqual(result, { port, exact: true });
});

test("a busy preferred port moves to the next free one", async () => {
  const port = DEFAULT_PORT + 903;
  const server = await occupy(port);
  try {
    const result = await reservePort({ preferred: port, span: 5 });
    assert.equal(result.port, port + 1);
    assert.equal(result.exact, false);
  } finally {
    await close(server);
  }
});

test("an injected probe decides, so the policy is testable without sockets", async () => {
  const asked: number[] = [];
  const result = await reservePort({
    preferred: 8000,
    span: 3,
    probe: async (port) => {
      asked.push(port);
      return port === 8002;
    },
  });
  assert.deepEqual(asked, [8000, 8001, 8002]);
  assert.equal(result.port, 8002);
  assert.equal(result.exact, false);
});
