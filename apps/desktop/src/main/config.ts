/** Desktop preferences that are not project data: window shape, last port, shell language. */

import fs from "node:fs";
import path from "node:path";

import { isLocale, type Locale } from "../shared/contracts";

export interface WindowState {
  x: number | undefined;
  y: number | undefined;
  width: number;
  height: number;
  maximized: boolean;
}

export interface DesktopConfig {
  /** Keeps the loopback origin stable between launches; the workspace stores UI state there. */
  lastPort: number | null;
  shellLocale: Locale | null;
  window: WindowState | null;
  zoomFactor: number;
}

export const DEFAULT_CONFIG: DesktopConfig = {
  lastPort: null,
  shellLocale: null,
  window: null,
  zoomFactor: 1,
};

function sanitize(value: unknown): DesktopConfig {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_CONFIG };
  const raw = value as Record<string, unknown>;
  const window = raw.window as Record<string, unknown> | undefined;
  return {
    lastPort:
      typeof raw.lastPort === "number" && Number.isInteger(raw.lastPort) && raw.lastPort > 0 && raw.lastPort < 65536
        ? raw.lastPort
        : null,
    shellLocale: isLocale(raw.shellLocale) ? raw.shellLocale : null,
    window:
      window && typeof window.width === "number" && typeof window.height === "number"
        ? {
            x: typeof window.x === "number" ? window.x : undefined,
            y: typeof window.y === "number" ? window.y : undefined,
            width: Math.max(640, Math.round(window.width)),
            height: Math.max(480, Math.round(window.height)),
            maximized: window.maximized === true,
          }
        : null,
    zoomFactor:
      typeof raw.zoomFactor === "number" && raw.zoomFactor >= 0.5 && raw.zoomFactor <= 3
        ? raw.zoomFactor
        : 1,
  };
}

export function readConfig(file: string): DesktopConfig {
  try {
    return sanitize(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    // A damaged preference file must never block startup.
    return { ...DEFAULT_CONFIG };
  }
}

/** Atomic write: preferences are small, and a half-written file must not lose them. */
export function writeConfig(file: string, config: DesktopConfig): DesktopConfig {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
  return config;
}

export function updateConfig(file: string, patch: Partial<DesktopConfig>): DesktopConfig {
  return writeConfig(file, { ...readConfig(file), ...patch });
}
