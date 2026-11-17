/** Runs short diagnostic commands: interpreter probes, venv creation, pip installs. */

import { spawn } from "node:child_process";

export const PACKAGE_CHECK_SCRIPT = "import opendirector_api, opendirector; print('ok')";

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface CommandOptions {
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  /** Receives output lines while the command runs. */
  onLine?: (stream: "stdout" | "stderr", line: string) => void;
}

function collect(chunk: Buffer, sink: string[], onLine?: CommandOptions["onLine"]): void {
  const text = chunk.toString("utf8");
  sink.push(text);
  if (onLine) {
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) onLine("stdout", line);
    }
  }
}

/** Default runner: no shell, captured output, hard timeout, never throws on non-zero exit. */
export function runCommand(
  executable: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(executable, args, {
        env: options.env ?? process.env,
        cwd: options.cwd,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      reject(error);
      return;
    }
    const timer = options.timeoutMs
      ? setTimeout(() => child.kill("SIGKILL"), options.timeoutMs)
      : null;
    let settled = false;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ stdout: stdout.join(""), stderr: stderr.join(""), code });
    };
    child.stdout?.on("data", (chunk: Buffer) => collect(chunk, stdout, options.onLine));
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr.push(text);
      if (options.onLine) {
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) options.onLine("stderr", line);
        }
      }
    });
    child.once("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      // A missing interpreter is a normal probe outcome, not a crash.
      if (error.code === "ENOENT") resolve({ stdout: "", stderr: error.message, code: null });
      else reject(error);
    });
    child.once("close", finish);
  });
}
