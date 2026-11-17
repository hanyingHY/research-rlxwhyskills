/** Backend readiness: poll `/api/health` until it answers, the process dies, or time runs out.
 *
 * The API's loopback middleware requires `X-OpenDirector-Request`, so the probe sends
 * it like the web client does. Polling is the only readiness signal the packaged
 * backend offers; uvicorn prints its banner before the app object exists. */

export const LOCAL_REQUEST_HEADER = "X-OpenDirector-Request";

export interface HealthResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

export type HealthFetcher = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<HealthResponse>;

export interface HealthOptions {
  /** Base URL of the local API, without a trailing slash. */
  url: string;
  timeoutMs: number;
  intervalMs?: number;
  /** Extra header value; defaults to the value the web client sends. */
  headerValue?: string;
  fetcher?: HealthFetcher;
  /** Returns false once the backend process has exited. */
  isAlive?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
  now?: () => number;
}

export type HealthOutcome =
  | { ok: true; elapsedMs: number }
  | { ok: false; reason: "timeout" | "exited" | "aborted"; elapsedMs: number };

function defaultFetcher(url: string, init: { headers: Record<string, string>; signal: AbortSignal }): Promise<HealthResponse> {
  return fetch(url, init).then((response) => ({
    ok: response.ok,
    status: response.status,
    text: () => response.text(),
  }));
}

export async function waitForHealth(options: HealthOptions): Promise<HealthOutcome> {
  const intervalMs = options.intervalMs ?? 250;
  const fetcher = options.fetcher ?? defaultFetcher;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => Date.now());
  const isAlive = options.isAlive ?? (() => true);
  const started = now();
  const target = `${options.url.replace(/\/$/, "")}/api/health`;

  while (true) {
    if (options.signal?.aborted) {
      return { ok: false, reason: "aborted", elapsedMs: now() - started };
    }
    if (!isAlive()) {
      return { ok: false, reason: "exited", elapsedMs: now() - started };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(500, intervalMs * 2));
    try {
      const response = await fetcher(target, {
        headers: { [LOCAL_REQUEST_HEADER]: options.headerValue ?? "1" },
        signal: controller.signal,
      });
      if (response.ok) {
        return { ok: true, elapsedMs: now() - started };
      }
    } catch {
      // Connection refused while uvicorn binds: normal, keep polling.
    } finally {
      clearTimeout(timer);
    }
    if (now() - started >= options.timeoutMs) {
      return { ok: false, reason: "timeout", elapsedMs: now() - started };
    }
    await sleep(intervalMs);
  }
}

export interface IndexProbeResult {
  ok: boolean;
  status: number;
  /** True when the response looks like the built OpenDirector page. */
  isApplication: boolean;
}

/** Confirms the API actually serves the built workspace before the window opens. */
export async function probeIndex(
  url: string,
  options: { fetcher?: HealthFetcher; timeoutMs?: number } = {},
): Promise<IndexProbeResult> {
  const fetcher = options.fetcher ?? defaultFetcher;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000);
  try {
    const response = await fetcher(`${url.replace(/\/$/, "")}/`, {
      headers: { [LOCAL_REQUEST_HEADER]: "1" },
      signal: controller.signal,
    });
    let isApplication = false;
    try {
      const body = await response.text();
      isApplication = body.includes('id="root"');
    } catch {
      isApplication = false;
    }
    return { ok: response.ok, status: response.status, isApplication };
  } catch {
    return { ok: false, status: 0, isApplication: false };
  } finally {
    clearTimeout(timer);
  }
}
