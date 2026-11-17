/**
 * `od://app/*` — the renderer's stable origin.
 *
 * Why a proxy instead of loading http://127.0.0.1:<port>:
 *   - the origin stays constant across launches, so theme, language and drafts
 *     in localStorage/sessionStorage survive a new random port;
 *   - no localhost cookie is created, so other local services never receive
 *     this application's credential;
 *   - the per-launch token stays in the main process and is attached only to
 *     requests for the owned Host.
 *
 * Everything is same-origin for the renderer, so the app's relative fetches,
 * media elements, Web Locks and downloads keep working unchanged.
 */
import { errorPage, startPage } from "./localPages.js";

export const APP_SCHEME = "od";
export const APP_ORIGIN = "od://app";
export const LOCAL_PREFIX = "/__desktop/";

const REQUEST_BLOCKED = new Set([
  "host",
  "origin",
  "referer",
  "cookie",
  "authorization",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "accept-encoding",
]);

const RESPONSE_BLOCKED = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "set-cookie",
  "content-encoding",
]);

export const DOCUMENT_CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: data:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  // The upstream index.html boots theme and locale from two inline scripts.
  // Move those to an external file before tightening this to a nonce.
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
].join("; ");

function html(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function apiError(status, message, code) {
  return new Response(JSON.stringify({ detail: message, code }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/**
 * Pure proxy step. `fetchImpl` is injected so the mapping can be tested without
 * Electron; production passes Electron's `net.fetch`.
 */
export async function proxyRequest(
  request,
  { backendUrl, authorization, devServerUrl = null, fetchImpl, logger = null, locale = "en-US" } = {},
) {
  const url = new URL(request.url);
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== "app") {
    return html(errorPage({ locale, message: "Unknown application origin." }), 404);
  }
  if (url.pathname === `${LOCAL_PREFIX}start`) return html(startPage({ locale }));
  if (url.pathname === `${LOCAL_PREFIX}error`) {
    return html(errorPage({ locale }));
  }

  if (!backendUrl) {
    return html(errorPage({ locale, message: "The local service is not ready." }), 503);
  }

  const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
  const targetBase = devServerUrl && !isApi ? devServerUrl : backendUrl;
  let targetOrigin;
  try {
    targetOrigin = new URL(targetBase).origin;
  } catch {
    return html(errorPage({ locale, message: "Invalid backend address." }), 500);
  }

  const headers = new Headers();
  for (const [key, value] of request.headers) {
    if (!REQUEST_BLOCKED.has(key.toLowerCase())) headers.set(key, value);
  }
  headers.set("origin", targetOrigin);
  if (targetBase === backendUrl) {
    if (authorization) headers.set("authorization", authorization);
    if (isApi) headers.set("x-opendirector-request", "1");
  }

  const hasBody = !["GET", "HEAD"].includes(request.method);
  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (hasBody && request.body) {
    init.body = request.body;
    init.duplex = "half";
  }

  let upstream;
  try {
    upstream = await fetchImpl(`${targetBase}${url.pathname}${url.search}`, init);
  } catch (error) {
    logger?.warn(`Proxy request failed: ${request.method} ${url.pathname} (${error?.message ?? error})`);
    if (isApi) {
      return apiError(
        502,
        "The local OpenDirector service is not reachable.",
        "desktop_backend_unavailable",
      );
    }
    return html(
      errorPage({ locale, message: "The local service could not handle this request." }),
      502,
    );
  }

  const responseHeaders = new Headers();
  for (const [key, value] of upstream.headers) {
    if (!RESPONSE_BLOCKED.has(key.toLowerCase())) responseHeaders.set(key, value);
  }

  const location = responseHeaders.get("location");
  if (location) {
    try {
      const resolved = new URL(location, targetBase);
      if (resolved.origin === targetOrigin) {
        responseHeaders.set("location", `${APP_ORIGIN}${resolved.pathname}${resolved.search}`);
      }
    } catch {
      responseHeaders.delete("location");
    }
  }

  const contentType = responseHeaders.get("content-type") || "";
  if (contentType.includes("text/html")) {
    // Development assets need inline scripts and HMR; shipped builds do not.
    if (!devServerUrl) {
      responseHeaders.set("content-security-policy", DOCUMENT_CSP);
      responseHeaders.set("referrer-policy", "no-referrer");
    }
    responseHeaders.set("x-content-type-options", "nosniff");
  }

  const noBody =
    request.method === "HEAD" ||
    upstream.status === 204 ||
    upstream.status === 304 ||
    !upstream.body;
  return new Response(noBody ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

/**
 * Electron protocol handler factory. `getBackendUrl` and `getAuthorization`
 * are read per request so a Host restart does not need a new registration.
 */
export function createAppHandler({
  getBackendUrl,
  getAuthorization,
  getDevServerUrl = () => null,
  fetchImpl,
  logger,
  locale = () => "en-US",
}) {
  return async (request) => {
    try {
      return await proxyRequest(request, {
        backendUrl: getBackendUrl(),
        authorization: getAuthorization(),
        devServerUrl: getDevServerUrl(),
        fetchImpl,
        logger,
        locale: typeof locale === "function" ? locale() : locale,
      });
    } catch (error) {
      logger?.error(`Unhandled protocol error: ${error?.stack ?? error}`);
      return apiError(500, "The desktop proxy failed.", "desktop_proxy_failed");
    }
  };
}
