/** Log files for the desktop host and the backend process.
 *
 * Everything is appended synchronously: a crash or a forced quit must still leave
 * the last lines on disk, because they are what the failure window shows. */

import fs from "node:fs";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  readonly file: string;
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  /** Most recent lines, oldest first; used for the failure window and diagnostics. */
  tail(count: number): string[];
}

export interface LoggerOptions {
  directory: string;
  name: string;
  /** Files kept per name, newest first. */
  keepFiles?: number;
  minimumLevel?: LogLevel;
  /** Wall-clock source, overridable in tests. */
  now?: () => Date;
}

function stamp(date: Date): string {
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function fileStamp(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export class FileLogger implements Logger {
  readonly file: string;
  private readonly ring: string[] = [];
  private readonly ringSize = 500;
  private readonly minimum: number;
  private readonly now: () => Date;

  constructor(options: LoggerOptions) {
    this.minimum = LEVEL_ORDER[options.minimumLevel ?? "info"];
    this.now = options.now ?? (() => new Date());
    fs.mkdirSync(options.directory, { recursive: true });
    this.file = path.join(options.directory, `${options.name}-${fileStamp(this.now())}.log`);
    rotate(options.directory, options.name, options.keepFiles ?? 5);
  }

  private write(level: LogLevel, message: string): void {
    if (LEVEL_ORDER[level] < this.minimum) return;
    const line = `${stamp(this.now())} ${level.toUpperCase().padEnd(5)} ${message}`;
    this.ring.push(line);
    if (this.ring.length > this.ringSize) this.ring.shift();
    try {
      fs.appendFileSync(this.file, `${line}\n`, "utf8");
    } catch {
      // A read-only log directory must not take the application down.
    }
    const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    sink(line);
  }

  debug(message: string): void {
    this.write("debug", message);
  }
  info(message: string): void {
    this.write("info", message);
  }
  warn(message: string): void {
    this.write("warn", message);
  }
  error(message: string): void {
    this.write("error", message);
  }

  tail(count: number): string[] {
    return this.ring.slice(Math.max(0, this.ring.length - count));
  }
}

/** Deletes the oldest `<name>-*.log` files beyond `keep` so logs cannot grow forever. */
export function rotate(directory: string, name: string, keep: number): void {
  try {
    const files = fs
      .readdirSync(directory)
      .filter((entry) => entry.startsWith(`${name}-`) && entry.endsWith(".log"))
      .sort();
    for (const file of files.slice(0, Math.max(0, files.length - keep))) {
      fs.unlinkSync(path.join(directory, file));
    }
  } catch {
    // Rotation is best effort.
  }
}

export function createLogger(options: LoggerOptions): Logger {
  return new FileLogger(options);
}

/** Diagnostics bundle offered by the failure window: facts, not secrets. */
export interface DiagnosticFacts {
  [key: string]: string | number | boolean | null | undefined;
}

export function renderDiagnostics(facts: DiagnosticFacts, logTail: string[]): string {
  const lines: string[] = ["OpenDirector desktop diagnostics", ""];
  for (const [key, value] of Object.entries(facts)) {
    lines.push(`${key}: ${value === undefined ? "" : String(value)}`);
  }
  if (logTail.length) {
    lines.push("", "--- log tail ---", ...logTail);
  }
  return lines.join("\n");
}
