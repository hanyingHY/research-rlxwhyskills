/**
 * Small rotating file log for the shell and the Host child process.
 *
 * Logs stay in the platform application-data directory, never next to projects
 * or application resources. Every write is redacted first.
 */
import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { redact } from "./auth.js";

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const TAIL_LINES = 400;

function timestamp() {
  return new Date().toISOString();
}

export function createLogger({
  directory,
  fileName = "desktop.log",
  maxBytes = DEFAULT_MAX_BYTES,
  secrets = [],
  mirrorToConsole = false,
}) {
  mkdirSync(directory, { recursive: true });
  const filePath = join(directory, fileName);
  const tail = [];
  const knownSecrets = [...secrets];

  function rotate() {
    try {
      if (statSync(filePath).size >= maxBytes) {
        renameSync(filePath, `${filePath}.1`);
      }
    } catch {
      // A missing or unreadable file only means there is nothing to rotate.
    }
  }

  function write(level, message) {
    const line = `${timestamp()} ${level.padEnd(5)} ${redact(String(message), knownSecrets)}`;
    rotate();
    try {
      appendFileSync(filePath, `${line}\n`);
    } catch {
      // Logging must never take the application down.
    }
    tail.push(line);
    if (tail.length > TAIL_LINES) tail.shift();
    if (mirrorToConsole) {
      const sink = level === "ERROR" ? console.error : console.log;
      sink(line);
    }
  }

  return {
    path: filePath,
    debug: (message) => write("DEBUG", message),
    info: (message) => write("INFO", message),
    warn: (message) => write("WARN", message),
    error: (message) => write("ERROR", message),
    /** Register a runtime secret (for example the per-launch Host token). */
    addSecret: (secret) => {
      if (typeof secret === "string" && secret.length >= 8 && !knownSecrets.includes(secret)) {
        knownSecrets.push(secret);
      }
    },
    /** Recent lines, for startup-failure dialogs and issue reports. */
    tail: (count = 60) => tail.slice(-count).join("\n"),
  };
}
