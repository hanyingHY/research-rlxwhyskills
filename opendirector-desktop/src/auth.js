/**
 * Per-launch credentials shared by the Electron main process and the Host.
 *
 * The renderer never receives this value: the main process attaches it while
 * proxying `od://app/*` to the loopback Host.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";

export const TOKEN_BYTES = 32;

/** 256 bits of entropy, URL-safe so it survives headers and logs without quoting. */
export function createToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function authorizationHeader(token) {
  return `Bearer ${token}`;
}

export function isWellFormedToken(token) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** Constant-time comparison; used by tests and by the Host-side fallback. */
export function tokensMatch(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Remove every secret from a string before it reaches a log, dialog or crash
 * report. Secrets are matched literally; empty values are ignored so a missing
 * credential cannot turn every character into `[redacted]`.
 */
export function redact(text, secrets = []) {
  if (typeof text !== "string") return text;
  let output = text;
  for (const secret of secrets) {
    if (typeof secret !== "string" || secret.length < 8) continue;
    output = output.split(secret).join("[redacted]");
  }
  return output;
}
