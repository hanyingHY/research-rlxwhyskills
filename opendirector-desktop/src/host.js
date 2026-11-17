/**
 * Lifecycle of the bundled Python Host.
 *
 * Contract (both sides):
 *   stdout, one JSON object per line, prefixed with "@@OPENDIRECTOR@@ "
 *     {"type":"ready","port":<int>,"pid":<int>,"version":"..."}
 *     {"type":"fatal","message":"...","detail":"..."}
 *     {"type":"status", ...}
 *     {"type":"shutdown-complete"}
 *   stdin, one JSON object per line
 *     {"type":"shutdown"}
 *     {"type":"status"}
 *
 * The Host binds 127.0.0.1 on an OS-assigned port and refuses every /api request
 * without the per-launch bearer token. The token is created here, kept in main
 * process memory, and never written to the renderer, URLs, logs or disk.
 */
import { spawn as nodeSpawn, execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { StringDecoder } from "node:string_decoder";
import { authorizationHeader, createToken, redact } from "./auth.js";

export const CONTROL_PREFIX = "@@OPENDIRECTOR@@ ";
const STDERR_TAIL_BYTES = 32 * 1024;
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export class HostError extends Error {
  constructor(message, { code = "desktop_host", detail = "", logPath = "" } = {}) {
    super(message);
    this.name = "HostError";
    this.code = code;
    this.detail = detail;
    this.logPath = logPath;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function terminateTree(child, { force = false, platform = process.platform } = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  if (platform === "win32") {
    const args = ["/PID", String(child.pid), "/T"];
    if (force) args.push("/F");
    execFile("taskkill", args, { windowsHide: true }, () => {});
    return;
  }
  // The child is started as a process-group leader; a group signal also reaps
  // agent harnesses it spawned, not just uvicorn.
  try {
    process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM");
  } catch {
    try {
      child.kill(force ? "SIGKILL" : "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

export class HostSupervisor extends EventEmitter {
  #token = "";
  #port = 0;
  #child = null;
  #exit = null;
  #stdoutBuffer = "";
  #stderrTail = "";
  #controlWaiters = new Map();
  #stdoutDecoder = new StringDecoder("utf8");
  #stderrDecoder = new StringDecoder("utf8");
  #startedAt = 0;
  #stopping = false;
  #fatal = null;

  constructor({
    python,
    hostEntry,
    dataRoot,
    env = process.env,
    log,
    platform = process.platform,
    startupTimeoutMs = 90_000,
    shutdownTimeoutMs = 15_000,
    exitGraceMs = 5_000,
    forceGraceMs = 3_000,
    spawnImpl = nodeSpawn,
  }) {
    super();
    this.python = python;
    this.hostEntry = hostEntry;
    this.dataRoot = dataRoot;
    this.env = env;
    this.log = log;
    this.platform = platform;
    this.startupTimeoutMs = startupTimeoutMs;
    this.shutdownTimeoutMs = shutdownTimeoutMs;
    this.exitGraceMs = exitGraceMs;
    this.forceGraceMs = forceGraceMs;
    this.spawnImpl = spawnImpl;
  }

  get port() {
    return this.#port;
  }

  get token() {
    return this.#token;
  }

  get pid() {
    return this.#child?.pid ?? null;
  }

  get running() {
    return Boolean(this.#child) && this.#exit === null;
  }

  get baseUrl() {
    return this.#port ? `http://127.0.0.1:${this.#port}` : null;
  }

  get authorization() {
    return this.#token ? authorizationHeader(this.#token) : null;
  }

  get stderrTail() {
    return redact(this.#stderrTail, [this.#token]);
  }

  #logPath() {
    return this.log?.path ?? "";
  }

  #emitControl(message) {
    const waiters = this.#controlWaiters.get(message.type);
    if (waiters?.length) {
      const waiter = waiters.shift();
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
    this.emit("control", message);
    if (message.type === "fatal") {
      this.#fatal = message;
      this.emit("fatal", message);
      // Do not wait for the process to exit: report the reason immediately.
      const waiters = this.#controlWaiters.get("ready") || [];
      this.#controlWaiters.set("ready", []);
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.resolve(null);
      }
    }
  }

  #waitForControl(type, timeoutMs) {
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        const list = this.#controlWaiters.get(type) || [];
        const index = list.indexOf(waiter);
        if (index >= 0) list.splice(index, 1);
        resolve(null);
      }, timeoutMs);
      const list = this.#controlWaiters.get(type) || [];
      list.push(waiter);
      this.#controlWaiters.set(type, list);
    });
  }

  #onStdout(chunk) {
    this.#stdoutBuffer += this.#stdoutDecoder.write(chunk);
    let index;
    while ((index = this.#stdoutBuffer.indexOf("\n")) >= 0) {
      const line = this.#stdoutBuffer.slice(0, index).replace(/\r$/, "");
      this.#stdoutBuffer = this.#stdoutBuffer.slice(index + 1);
      if (!line) continue;
      if (line.startsWith(CONTROL_PREFIX)) {
        try {
          this.#emitControl(JSON.parse(line.slice(CONTROL_PREFIX.length)));
        } catch {
          this.log?.warn("Host wrote an unreadable control line");
        }
        continue;
      }
      this.log?.debug(`[host] ${line}`);
    }
  }

  #onStderr(chunk) {
    this.#stderrTail += this.#stderrDecoder.write(chunk);
    if (this.#stderrTail.length > STDERR_TAIL_BYTES) {
      this.#stderrTail = this.#stderrTail.slice(-STDERR_TAIL_BYTES);
    }
    this.log?.debug(`[host:stderr] ${chunk.toString("utf8").trimEnd()}`);
  }

  /**
   * Start the Host and wait until it reports `ready` and answers an
   * authenticated health check.
   */
  async start() {
    if (this.running) throw new HostError("Host is already running", { code: "host_running" });
    if (!existsSync(this.dataRoot)) {
      throw new HostError("The OpenDirector data directory is missing.", {
        code: "data_root_missing",
        detail: this.dataRoot,
        logPath: this.#logPath(),
      });
    }

    this.#token = createToken();
    this.log?.addSecret?.(this.#token);
    this.#stopping = false;
    this.#fatal = null;
    this.#exit = null;
    this.#stdoutBuffer = "";
    this.#stderrTail = "";
    this.#startedAt = Date.now();
    this.log?.info(`Starting Host: ${this.python} ${this.hostEntry}`);

    let child;
    try {
      child = this.spawnImpl(this.python, [this.hostEntry, "--port", "0"], {
        cwd: this.dataRoot,
        env: { ...this.env, OPENDIRECTOR_DESKTOP_TOKEN: this.#token },
        stdio: ["pipe", "pipe", "pipe"],
        detached: this.platform !== "win32",
        windowsHide: true,
      });
    } catch (error) {
      throw new HostError("The bundled Python runtime could not be started.", {
        code: "host_spawn_failed",
        detail: String(error?.message ?? error),
        logPath: this.#logPath(),
      });
    }
    this.#child = child;
    child.stdout.on("data", (chunk) => this.#onStdout(chunk));
    child.stderr.on("data", (chunk) => this.#onStderr(chunk));
    child.stdin.on("error", () => {
      // EPIPE means the Host exited first; the exit handler reports why.
    });

    const ready = this.#waitForControl("ready", this.startupTimeoutMs);
    let startupError = null;

    child.on("error", (error) => {
      startupError = new HostError("The bundled Python runtime could not be started.", {
        code: "host_spawn_failed",
        detail: String(error?.message ?? error),
        logPath: this.#logPath(),
      });
      const waiters = this.#controlWaiters.get("ready") || [];
      this.#controlWaiters.set("ready", []);
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        waiter.resolve(null);
      }
    });

    child.on("exit", (code, signal) => {
      const wasRunning = this.#exit === null;
      this.#exit = { code, signal };
      if (wasRunning) {
        if (code === 0 && this.#port) {
          this.log?.info(`Host exited (code 0)`);
        } else {
          this.log?.warn(`Host exited (code ${code}, signal ${signal ?? "none"})`);
        }
        this.emit("exit", { code, signal, unexpected: !this.#stopping, stderr: this.stderrTail });
      }
      const remaining = [...this.#controlWaiters.values()].flat();
      this.#controlWaiters.clear();
      for (const waiter of remaining) {
        clearTimeout(waiter.timer);
        waiter.resolve(null);
      }
    });

    const message = await ready;
    if (!message) {
      if (startupError) throw startupError;
      if (this.#fatal) {
        await this.stop({ force: true });
        throw new HostError(
          String(this.#fatal.message ?? "The Host reported a fatal error."),
          {
            code: this.#fatal.code ?? "host_fatal",
            detail: redact(String(this.#fatal.detail ?? ""), [this.#token]),
            logPath: this.#logPath(),
          },
        );
      }
      await this.stop({ force: true });
      throw new HostError(
        this.#exit
          ? "The Host exited before it became ready."
          : "The Host did not become ready in time.",
        {
          code: this.#exit ? "host_exited" : "host_start_timeout",
          detail: this.stderrTail.slice(-4000),
          logPath: this.#logPath(),
        },
      );
    }

    this.#port = Number(message.port);
    if (!Number.isInteger(this.#port) || this.#port <= 0 || this.#port > 65535) {
      await this.stop({ force: true });
      throw new HostError("The Host reported an invalid port.", {
        code: "host_invalid_port",
        detail: JSON.stringify(message),
        logPath: this.#logPath(),
      });
    }

    try {
      await this.#waitHealthy();
    } catch (error) {
      await this.stop({ force: true });
      throw error;
    }

    this.log?.info(
      `Host ready on 127.0.0.1:${this.#port} (pid ${child.pid}, ${Date.now() - this.#startedAt} ms)`,
    );
    this.emit("ready", { port: this.#port, pid: child.pid });
    return { port: this.#port, pid: child.pid };
  }

  async #waitHealthy() {
    const deadline = Date.now() + 10_000;
    let lastError = "";
    while (Date.now() < deadline) {
      if (this.#exit) {
        throw new HostError("The Host exited during startup.", {
          code: "host_exited",
          detail: this.stderrTail.slice(-4000),
          logPath: this.#logPath(),
        });
      }
      try {
        const response = await this.request("/api/health", { timeout: 1_500 });
        if (response.status === 200) return;
        lastError = `HTTP ${response.status}`;
      } catch (error) {
        lastError = String(error?.message ?? error);
      }
      await wait(100);
    }
    throw new HostError("The Host did not answer an authenticated health check.", {
      code: "host_unhealthy",
      detail: redact(lastError, [this.#token]),
      logPath: this.#logPath(),
    });
  }

  /**
   * One authenticated request to the loopback Host. Used for health, quit
   * inspection and tests; the renderer goes through the od:// proxy instead.
   */
  request(
    path,
    { method = "GET", headers = {}, body = null, timeout = 5_000 } = {},
  ) {
    if (!this.baseUrl) {
      return Promise.reject(new HostError("Host is not running", { code: "host_not_running" }));
    }
    const requestHeaders = {
      // The upstream local API rejects requests without this marker.
      "x-opendirector-request": "1",
      "accept-language": "en-US",
      ...headers,
    };
    if (this.#token) requestHeaders.authorization = this.authorization;
    for (const [key, value] of Object.entries(requestHeaders)) {
      if (HOP_BY_HOP.has(key.toLowerCase())) delete requestHeaders[key];
    }
    return new Promise((resolve, reject) => {
      const request = httpRequest(
        {
          host: "127.0.0.1",
          port: this.#port,
          path,
          method,
          headers: requestHeaders,
          agent: false,
          timeout,
        },
        (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => {
            const raw = Buffer.concat(chunks);
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers,
              body: raw,
              json() {
                return JSON.parse(raw.toString("utf8"));
              },
            });
          });
        },
      );
      request.on("timeout", () => request.destroy(new Error("request timed out")));
      request.on("error", reject);
      if (body) request.write(body);
      request.end();
    });
  }

  /**
   * Ask the Host what is running. Never throws: an unreadable status is
   * reported as unknown so quitting is not blocked by diagnostics.
   */
  async status() {
    try {
      const response = await this.request("/api/desktop/status", { timeout: 4_000 });
      if ([404, 405].includes(response.status)) {
        return { busy: false, unknown: true, reason: "status_endpoint_unavailable" };
      }
      if (response.status !== 200) {
        return { busy: false, unknown: true, reason: `http_${response.status}` };
      }
      return { ...response.json(), unknown: false };
    } catch (error) {
      return {
        busy: false,
        unknown: true,
        reason: redact(String(error?.message ?? error), [this.#token]),
      };
    }
  }

  /**
   * Facts the guidance layer needs to avoid telling a user to do something they
   * have already done. Never throws; unknown counts as "not configured" only
   * when the API truly says so.
   */
  async facts() {
    const result = {
      ok: false,
      hasModels: false,
      hasProjects: false,
      modelCount: 0,
      projectCount: 0,
      error: null,
    };
    try {
      const [models, projects] = await Promise.all([
        this.request("/api/models", { timeout: 4_000 }),
        this.request("/api/projects", { timeout: 4_000 }),
      ]);
      if (models.status === 200) {
        const list = models.json();
        result.modelCount = Array.isArray(list) ? list.length : 0;
        result.hasModels = result.modelCount > 0;
      }
      if (projects.status === 200) {
        const payload = projects.json();
        const list = Array.isArray(payload) ? payload : payload?.projects;
        result.projectCount = Array.isArray(list) ? list.length : 0;
        result.hasProjects = result.projectCount > 0;
      }
      result.ok = models.status === 200 || projects.status === 200;
    } catch (error) {
      result.error = redact(String(error?.message ?? error), [this.#token]);
    }
    return result;
  }

  /**
   * Graceful shutdown: ask over the control channel, then escalate to SIGTERM
   * and finally SIGKILL with bounded waits. Resolves once the process is gone.
   */
  async stop({ force = false } = {}) {
    const child = this.#child;
    if (!child) return { graceful: true, code: 0, already: true };
    if (this.#exit) {
      this.#dispose();
      return { graceful: true, code: this.#exit.code, already: true };
    }

    this.#stopping = true;
    const exited = new Promise((resolve) => {
      const listener = () => {
        child.off("exit", listener);
        resolve(true);
      };
      child.once("exit", listener);
    });

    let acknowledged = false;
    if (!force) {
      const complete = this.#waitForControl("shutdown-complete", this.shutdownTimeoutMs);
      try {
        child.stdin.write(`${JSON.stringify({ type: "shutdown" })}\n`);
      } catch {
        // The process may already be gone; the exit check below decides.
      }
      acknowledged = Boolean(await complete);
    }

    if (!this.#exit) {
      await Promise.race([exited, wait(acknowledged ? 2_000 : this.exitGraceMs)]);
    }
    if (!this.#exit) {
      this.log?.warn("Host did not exit after shutdown request; sending SIGTERM");
      terminateTree(child, { force: false, platform: this.platform });
      await Promise.race([exited, wait(this.exitGraceMs)]);
    }
    if (!this.#exit) {
      this.log?.warn("Host ignored SIGTERM; sending SIGKILL");
      terminateTree(child, { force: true, platform: this.platform });
      await Promise.race([exited, wait(this.forceGraceMs)]);
    }

    const result = {
      graceful: acknowledged && this.#exit !== null,
      code: this.#exit?.code ?? null,
      signal: this.#exit?.signal ?? null,
      forced: !acknowledged,
    };
    this.#dispose();
    this.log?.info(`Host stopped (${JSON.stringify(result)})`);
    return result;
  }

  /** Synchronous last resort for `process.on("exit")`. */
  killNow() {
    if (!this.#child || this.#exit) return;
    terminateTree(this.#child, { force: true, platform: this.platform });
  }

  #dispose() {
    const child = this.#child;
    this.#child = null;
    this.#port = 0;
    this.#token = "";
    if (!child) return;
    try {
      child.stdin.end();
    } catch {
      // Ignore a pipe that is already closed.
    }
    child.stdout?.removeAllListeners();
    child.stderr?.removeAllListeners();
  }
}
