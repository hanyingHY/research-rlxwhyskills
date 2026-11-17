/** Owns one backend lifecycle: resolve runtime, provision, reserve port, spawn, wait, verify, stop.
 *
 * The desktop shell never speaks project business rules; it only hosts the same
 * local API the browser talks to. This class is the whole of that hosting contract:
 * it produces a base URL that serves the real workspace, or a structured failure
 * that names the cause. */

import fs from "node:fs";
import path from "node:path";

import type { Logger } from "../logging";
import type { Layout } from "../paths";
import type {
  BackendInfo,
  FailureCode,
  Locale,
  RuntimeResolution,
  StartupFailure,
  StartupStage,
} from "../../shared/contracts";
import { DEFAULT_PORT, reservePort, type PortProbe } from "./port";
import { resolveRuntime, type CommandRunner, type RuntimeProbeOptions } from "./runtime";
import { provisionEnvironment } from "./provision";
import {
  probeIndex,
  waitForHealth,
  type HealthFetcher,
  type HealthOutcome,
} from "./health";
import { spawnBackend, type BackendProcess, type SpawnBackendOptions } from "./process";
import { classifyBackendOutput } from "../startup/failures";

export const HEALTH_TIMEOUT_MS = 90_000;
export const HEALTH_INTERVAL_MS = 250;

export interface SessionOptions {
  layout: Layout;
  locale: Locale;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  logger: Logger;
  /** Port from the previous launch; the workspace keeps UI state in its origin. */
  preferredPort: number;
  /** Readiness budget; shortened by tests, otherwise 90s to cover cold starts. */
  healthTimeoutMs?: number;
  logLevel?: "debug" | "info" | "warning" | "error" | "critical";
  sourceRoot?: string | null;
  run?: CommandRunner;
  exists?: (candidate: string) => boolean;
  listWheels?: (directory: string) => string[];
  probe?: PortProbe;
  fetcher?: HealthFetcher;
  spawn?: (options: SpawnBackendOptions) => BackendProcess;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onStage?: (stage: StartupStage, detail?: string) => void;
}

export type StartupResult =
  | { ok: true; info: BackendInfo }
  | { ok: false; failure: StartupFailure };

/** Environment for the backend: data outside the app, tools from the app, UTF-8 always. */
export function backendEnvironment(
  options: { layout: Layout; locale: Locale; url: string; pythonPath: string[]; env: NodeJS.ProcessEnv },
): NodeJS.ProcessEnv {
  const { layout, env } = options;
  const pythonPath = [...options.pythonPath];
  const existingPythonPath = env.PYTHONPATH?.trim();
  if (existingPythonPath) pythonPath.push(existingPythonPath);
  const binDirectories = [layout.resources.bin];
  const existingPath = env.PATH ?? env.Path ?? "";
  return {
    ...env,
    // Projects, model credentials and caches live in user data, never in the install directory.
    OPENDIRECTOR_ROOT: layout.user.data,
    OPENDIRECTOR_API_URL: options.url,
    OPENDIRECTOR_LANGUAGE: options.locale,
    OPENDIRECTOR_DESKTOP: "1",
    PYTHONUNBUFFERED: "1",
    PYTHONUTF8: "1",
    PYTHONIOENCODING: "utf-8",
    ...(pythonPath.length ? { PYTHONPATH: pythonPath.join(path.delimiter) } : {}),
    PATH: [...binDirectories, existingPath].filter(Boolean).join(path.delimiter),
    // Local loopback traffic must never be sent to a proxy.
    NO_PROXY: [env.NO_PROXY, "127.0.0.1", "localhost"].filter(Boolean).join(","),
    no_proxy: [env.no_proxy, "127.0.0.1", "localhost"].filter(Boolean).join(","),
  };
}

export class BackendSession {
  private readonly options: SessionOptions;
  private process: BackendProcess | null = null;
  private current: BackendInfo | null = null;

  constructor(options: SessionOptions) {
    this.options = options;
  }

  get info(): BackendInfo | null {
    return this.current;
  }

  get running(): boolean {
    return this.process !== null && !this.process.exited();
  }

  tail(count = 40): string[] {
    return this.process ? this.process.tail(count) : [];
  }

  private stage(stage: StartupStage, detail?: string): void {
    this.options.logger.info(`stage=${stage}${detail ? ` ${detail}` : ""}`);
    this.options.onStage?.(stage, detail);
  }

  private failure(
    code: FailureCode,
    stage: StartupStage,
    detail?: string,
  ): { ok: false; failure: StartupFailure } {
    const failure: StartupFailure = { code, stage, detail, logTail: this.tail(25) };
    this.options.logger.error(`startup failed code=${code} stage=${stage}${detail ? ` detail=${detail}` : ""}`);
    return { ok: false, failure };
  }

  async start(): Promise<StartupResult> {
    const { options } = this;
    if (this.running) await this.stop();

    this.stage("resolving-runtime");
    const probeOptions: RuntimeProbeOptions = {
      layout: options.layout,
      platform: options.platform,
      env: options.env,
      run: options.run ?? (await defaultRunner()),
      exists: options.exists,
      sourceRoot: options.sourceRoot ?? options.env.OPENDIRECTOR_DESKTOP_SOURCE_ROOT ?? null,
    };
    const resolved = await resolveRuntime(probeOptions);
    if (!resolved.ok || !resolved.runtime) {
      return this.failure(
        resolved.failure?.code ?? "runtime_missing",
        "resolving-runtime",
        [resolved.failure?.detail, ...resolved.attempted].filter(Boolean).join(" | "),
      );
    }

    let runtime: RuntimeResolution = resolved.runtime;
    if (!runtime.hasPackage) {
      // Only a system interpreter reaches this point; the bundled runtime is never mutated.
      this.stage("provisioning-environment", `python ${runtime.version}`);
      const provisioned = await provisionEnvironment({
        runtime,
        venvRoot: options.layout.user.venv,
        platform: options.platform,
        env: options.env,
        run: probeOptions.run,
        wheelsDirectory: options.layout.resources.wheels,
        listWheels: options.listWheels,
        exists: options.exists,
        log: (line) => options.logger.info(`provision: ${line}`),
      });
      if (!provisioned.ok || !provisioned.runtime) {
        return this.failure(
          provisioned.failure?.code ?? "provision_failed",
          "provisioning-environment",
          [provisioned.failure?.detail, ...provisioned.output.slice(-10)].filter(Boolean).join(" | "),
        );
      }
      runtime = provisioned.runtime;
    }

    this.stage("reserving-port");
    let port: number;
    try {
      const reserved = await reservePort({
        preferred: options.preferredPort || DEFAULT_PORT,
        probe: options.probe,
      });
      port = reserved.port;
      if (!reserved.exact) {
        options.logger.warn(`preferred port unavailable, using ${port}`);
      }
    } catch (error) {
      return this.failure("port_unavailable", "reserving-port", String(error));
    }

    // The backend is spawned with the workspace as its working directory; a missing
    // directory would surface as a bare spawn ENOENT.
    for (const directory of [options.layout.user.data, options.layout.user.logs]) {
      fs.mkdirSync(directory, { recursive: true });
    }

    const url = `http://127.0.0.1:${port}`;
    this.stage("starting-backend", `${runtime.source} python=${runtime.version} port=${port}`);
    const spawn = options.spawn ?? spawnBackend;
    try {
      this.process = spawn({
        executable: runtime.executable,
        args: [
          "-m",
          "opendirector_api.server",
          "--port",
          String(port),
          "--log-level",
          options.logLevel ?? "info",
        ],
        env: backendEnvironment({
          layout: options.layout,
          locale: options.locale,
          url,
          pythonPath: runtime.pythonPath,
          env: options.env,
        }),
        cwd: options.layout.user.data,
        platform: options.platform,
        onLine: (line) => options.logger.info(`backend: ${line}`),
        onExit: (info) => options.logger.warn(`backend exited code=${info.code} signal=${info.signal}`),
        sleep: options.sleep,
      });
    } catch (error) {
      return this.failure("backend_exited", "starting-backend", String(error));
    }

    this.stage("waiting-for-backend", url);
    const outcome: HealthOutcome = await waitForHealth({
      url,
      timeoutMs: options.healthTimeoutMs ?? HEALTH_TIMEOUT_MS,
      intervalMs: HEALTH_INTERVAL_MS,
      fetcher: options.fetcher,
      isAlive: () => !this.process?.exited(),
      sleep: options.sleep,
      now: options.now,
    });

    if (!outcome.ok) {
      const output = this.tail(25).join("\n");
      if (outcome.reason === "exited") {
        const classified = classifyBackendOutput(output);
        return this.failure(classified.code, "waiting-for-backend", classified.detail ?? output.slice(-500));
      }
      if (outcome.reason === "timeout") {
        return this.failure(
          "backend_timeout",
          "waiting-for-backend",
          `no health response in ${options.healthTimeoutMs ?? HEALTH_TIMEOUT_MS}ms`,
        );
      }
      return this.failure("backend_exited", "waiting-for-backend", "startup aborted");
    }

    // The API only mounts the workspace when the built web resources exist.
    const index = await probeIndex(url, { fetcher: options.fetcher });
    if (!index.ok || !index.isApplication) {
      return this.failure(
        "web_resources_missing",
        "waiting-for-backend",
        `index responded status=${index.status} application=${index.isApplication}`,
      );
    }

    this.current = {
      url,
      port,
      runtimeSource: runtime.source,
      pythonVersion: runtime.version,
      dataRoot: options.layout.user.data,
      webRoot: null,
      pid: this.process.pid,
      readyInMs: outcome.elapsedMs,
    };
    options.logger.info(`backend ready at ${url} in ${outcome.elapsedMs}ms`);
    return { ok: true, info: this.current };
  }

  async stop(): Promise<void> {
    const child = this.process;
    this.process = null;
    this.current = null;
    if (!child) return;
    this.options.logger.info("stopping backend");
    await child.stop();
  }

  /** Used by the failure window's Retry and the shell's restart action. */
  async restart(): Promise<StartupResult> {
    await this.stop();
    return this.start();
  }
}

async function defaultRunner(): Promise<CommandRunner> {
  const { runCommand } = await import("./runner");
  return runCommand;
}
