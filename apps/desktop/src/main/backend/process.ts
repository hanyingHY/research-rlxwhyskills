/** The backend child process: `python -m opendirector_api.server --port <port>`.
 *
 * Output is captured into a ring buffer and a log file, because the last lines are
 * the only explanation available when startup fails. Shutdown is graceful first
 * (the backend finishes commits and releases project locks) and forceful only after
 * a grace period; on Windows the whole process tree is terminated, since uvicorn
 * and the media tools it spawns would otherwise outlive the window. */

import { spawn, type ChildProcess } from "node:child_process";

export interface SpawnBackendOptions {
  executable: string;
  /** Arguments before `-m`, for example `-3.12` for the Windows Python launcher. */
  prefix?: string[];
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
  platform: NodeJS.Platform;
  onLine?: (line: string) => void;
  onExit?: (info: { code: number | null; signal: string | null }) => void;
  /** Replaces `taskkill`, so tests never touch the real process table. */
  killTree?: (pid: number, force: boolean) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
}

export const STOP_GRACE_MS = 4_000;

export interface BackendProcess {
  readonly pid: number | null;
  exited(): boolean;
  exitCode(): number | null;
  tail(count: number): string[];
  stop(graceMs?: number): Promise<void>;
  whenExited(): Promise<number | null>;
}

const RING_SIZE = 400;

export function spawnBackend(options: SpawnBackendOptions): BackendProcess {
  const ring: string[] = [];
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const push = (text: string) => {
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      ring.push(line);
      if (ring.length > RING_SIZE) ring.shift();
      options.onLine?.(line);
    }
  };

  const child: ChildProcess = spawn(
    options.executable,
    [...(options.prefix ?? []), ...options.args],
    {
      env: options.env,
      cwd: options.cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      // Own process group on POSIX so `kill(-pid)` reaches uvicorn's children.
      detached: options.platform !== "win32",
    },
  );

  child.stdout?.on("data", (chunk: Buffer) => push(chunk.toString("utf8")));
  child.stderr?.on("data", (chunk: Buffer) => push(chunk.toString("utf8")));

  let exited = false;
  let code: number | null = null;
  const exitedPromise = new Promise<number | null>((resolve) => {
    child.once("exit", (value, signal) => {
      exited = true;
      code = value;
      options.onExit?.({ code: value, signal });
      resolve(value);
    });
    child.once("error", (error: NodeJS.ErrnoException) => {
      // Without this line an unusable interpreter fails with a completely empty log.
      push(`spawn error: ${error.message}`);
      exited = true;
      code = null;
      resolve(null);
    });
  });

  const killTree =
    options.killTree ??
    (async (pid: number, force: boolean) => {
      if (options.platform === "win32") {
        // /T reaches children (uvicorn workers, ffmpeg): /F only after the grace period.
        await runTaskkill(pid, force);
        return;
      }
      try {
        process.kill(pid, force ? "SIGKILL" : "SIGTERM");
      } catch {
        // Already gone.
      }
      if (!force) {
        try {
          process.kill(-pid, "SIGTERM");
        } catch {
          // Process group may not exist on every platform.
        }
      }
    });

  async function runTaskkill(pid: number, force: boolean): Promise<void> {
    const { spawn: spawnKill } = await import("node:child_process");
    const args = ["/PID", String(pid), "/T"];
    if (force) args.push("/F");
    await new Promise<void>((resolve) => {
      const killer = spawnKill("taskkill", args, { windowsHide: true, stdio: "ignore" });
      killer.once("error", () => resolve());
      killer.once("close", () => resolve());
    });
  }

  return {
    pid: child.pid ?? null,
    exited: () => exited,
    exitCode: () => code,
    tail: (count: number) => ring.slice(Math.max(0, ring.length - count)),
    whenExited: () => exitedPromise,
    async stop(graceMs: number = STOP_GRACE_MS): Promise<void> {
      const pid = child.pid ?? null;
      if (exited || pid === null) return;
      await killTree(pid, false);
      const deadline = Date.now() + graceMs;
      while (!exited && Date.now() < deadline) {
        await sleep(100);
      }
      if (!exited) {
        await killTree(pid, true);
        const hardDeadline = Date.now() + 2_000;
        while (!exited && Date.now() < hardDeadline) {
          await sleep(100);
        }
        if (!exited) {
          try {
            child.kill("SIGKILL");
          } catch {
            // Nothing left to do.
          }
        }
      }
    },
  };
}
