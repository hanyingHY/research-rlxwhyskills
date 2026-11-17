import assert from "node:assert/strict";
import test from "node:test";

import { APP_ORIGIN, DOCUMENT_CSP, proxyRequest } from "../src/protocol.js";

const BACKEND = "http://127.0.0.1:43123";
const TOKEN = "Bearer test-token-value";

function appRequest(path, { method = "GET", headers = {}, body = null } = {}) {
  return {
    url: `${APP_ORIGIN}${path}`,
    method,
    headers: new Headers(headers),
    body,
  };
}

function capture(response) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, headers: Object.fromEntries(init.headers) });
    return typeof response === "function" ? response(url, init) : response;
  };
  return { calls, fetchImpl };
}

test("api requests get the launch credential and a backend Origin", async () => {
  const { calls, fetchImpl } = capture(new Response("ok", { status: 200 }));
  const response = await proxyRequest(
    appRequest("/api/health", {
      headers: { cookie: "session=1", authorization: "Bearer attacker", "x-opendirector-session": "s" },
    }),
    { backendUrl: BACKEND, authorization: TOKEN, fetchImpl },
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BACKEND}/api/health`);
  assert.equal(calls[0].headers.authorization, TOKEN);
  assert.equal(calls[0].headers.origin, BACKEND);
  assert.equal(calls[0].headers["x-opendirector-request"], "1");
  assert.equal(calls[0].headers.cookie, undefined, "localhost cookies must not be forwarded");
  assert.equal(calls[0].headers["accept-encoding"], undefined);
});

test("query strings, methods and bodies survive the proxy", async () => {
  const { calls, fetchImpl } = capture(new Response(null, { status: 202 }));
  await proxyRequest(
    appRequest("/api/creation/projects/abc/commands?dry=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{\"hello\":1}",
    }),
    { backendUrl: BACKEND, authorization: TOKEN, fetchImpl },
  );
  assert.equal(calls[0].url, `${BACKEND}/api/creation/projects/abc/commands?dry=1`);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body, "{\"hello\":1}");
  assert.equal(calls[0].init.duplex, "half");
});

test("development mode splits API from static assets and withholds the token", async () => {
  const { calls, fetchImpl } = capture(new Response("<html></html>", {
    status: 200,
    headers: { "content-type": "text/html" },
  }));
  await proxyRequest(appRequest("/assets/app.js"), {
    backendUrl: BACKEND,
    authorization: TOKEN,
    devServerUrl: "http://127.0.0.1:5173",
    fetchImpl,
  });
  assert.equal(calls[0].url, "http://127.0.0.1:5173/assets/app.js");
  assert.equal(calls[0].headers.authorization, undefined);
  assert.equal(calls[0].headers.origin, "http://127.0.0.1:5173");

  await proxyRequest(appRequest("/api/projects"), {
    backendUrl: BACKEND,
    authorization: TOKEN,
    devServerUrl: "http://127.0.0.1:5173",
    fetchImpl,
  });
  assert.equal(calls[1].url, `${BACKEND}/api/projects`);
  assert.equal(calls[1].headers.authorization, TOKEN);
});

test("response hygiene: cookies dropped, redirects rewritten, attachments preserved", async () => {
  const upstreamHeaders = {
    "content-type": "text/html; charset=utf-8",
    "set-cookie": "leak=1",
    "content-encoding": "gzip",
    location: `${BACKEND}/ai-canvas/abc`,
    "content-disposition": "attachment; filename=\"film.mp4\"",
    "transfer-encoding": "chunked",
  };
  const { fetchImpl } = capture(new Response("<html></html>", {
    status: 302,
    headers: upstreamHeaders,
  }));
  const response = await proxyRequest(appRequest("/ai-canvas/abc"), {
    backendUrl: BACKEND,
    authorization: TOKEN,
    fetchImpl,
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("content-encoding"), null);
  assert.equal(response.headers.get("transfer-encoding"), null);
  assert.equal(response.headers.get("location"), `${APP_ORIGIN}/ai-canvas/abc`);
  assert.equal(response.headers.get("content-disposition"), upstreamHeaders["content-disposition"]);
  assert.equal(response.headers.get("content-security-policy"), DOCUMENT_CSP);
  assert.equal(response.headers.get("cache-control"), null);
});

test("documents get a CSP in production but development keeps HMR working", async () => {
  const html = new Response("<html></html>", {
    status: 200,
    headers: { "content-type": "text/html" },
  });
  const { fetchImpl } = capture(html);
  const production = await proxyRequest(appRequest("/"), {
    backendUrl: BACKEND,
    authorization: TOKEN,
    fetchImpl,
  });
  assert.equal(production.headers.get("content-security-policy"), DOCUMENT_CSP);

  const development = await proxyRequest(appRequest("/"), {
    backendUrl: BACKEND,
    authorization: TOKEN,
    devServerUrl: "http://127.0.0.1:5173",
    fetchImpl: async () => new Response("<html></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  });
  assert.equal(development.headers.get("content-security-policy"), null);
});

test("204 and 304 responses never carry a body", async () => {
  for (const status of [204, 304]) {
    const { fetchImpl } = capture(new Response(null, { status }));
    const response = await proxyRequest(appRequest("/api/thing"), {
      backendUrl: BACKEND,
      authorization: TOKEN,
      fetchImpl,
    });
    assert.equal(response.status, status);
    assert.equal(response.body, null);
  }
});

test("backend failures are actionable and shaped for the caller", async () => {
  const failing = async () => {
    throw new Error("ECONNREFUSED");
  };
  const api = await proxyRequest(appRequest("/api/health"), {
    backendUrl: BACKEND,
    authorization: TOKEN,
    fetchImpl: failing,
  });
  assert.equal(api.status, 502);
  assert.equal((await api.json()).code, "desktop_backend_unavailable");

  const document = await proxyRequest(appRequest("/"), {
    backendUrl: BACKEND,
    authorization: TOKEN,
    fetchImpl: failing,
  });
  assert.equal(document.status, 502);
  assert.match(await document.text(), /could not handle this request/i);
});

test("before the Host is ready, API and document calls stay distinct", async () => {
  const api = await proxyRequest(appRequest("/api/health"), { backendUrl: null });
  assert.equal(api.status, 503);
  assert.match(await api.text(), /not ready/i);

  const start = await proxyRequest(appRequest(`/__desktop/start`), { backendUrl: null });
  assert.equal(start.status, 200);
  assert.match(await start.text(), /Starting OpenDirector|正在启动 OpenDirector/);
});

test("only the od://app origin is served", async () => {
  const response = await proxyRequest(
    { url: "https://example.com/api/health", method: "GET", headers: new Headers() },
    { backendUrl: BACKEND },
  );
  assert.equal(response.status, 404);
});
