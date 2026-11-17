/** Loopback port allocation for the local API.
 *
 * The workspace keeps its language, theme and last opened project in the storage of
 * its origin, so the port should stay the same between launches whenever it is free.
 * A free port is claimed by binding it, not by connecting to it: the launcher's
 * connect probe cannot see a listener that has not accepted yet. */

import net from "node:net";

export const DEFAULT_PORT = 8000;
export const PORT_SCAN_SPAN = 50;

export type PortProbe = (port: number, host: string) => Promise<boolean>;

export function probePort(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    server.once("error", () => settle(false));
    server.once("listening", () => {
      server.close(() => settle(true));
    });
    try {
      server.listen({ port, host, exclusive: true });
    } catch {
      settle(false);
    }
  });
}

export interface ReserveResult {
  port: number;
  /** True when the requested port, not a fallback, was free. */
  exact: boolean;
}

export interface ReserveOptions {
  preferred: number;
  host?: string;
  span?: number;
  probe?: PortProbe;
}

/** Returns a free port, preferring `preferred` and then the next `span - 1` ports. */
export async function reservePort(options: ReserveOptions): Promise<ReserveResult> {
  const host = options.host ?? "127.0.0.1";
  const span = options.span ?? PORT_SCAN_SPAN;
  const probe = options.probe ?? probePort;
  for (let offset = 0; offset < span; offset += 1) {
    const port = options.preferred + offset;
    if (port > 65535) break;
    if (await probe(port, host)) return { port, exact: offset === 0 };
  }
  const ephemeral = await probe(0, host);
  // Asking the OS for a port returns 0 here; bind again to learn the number it chose.
  const port = ephemeral ? await ephemeralPort(host) : null;
  if (port === null) throw new Error("No free loopback port available.");
  return { port, exact: false };
}

function ephemeralPort(host: string): Promise<number | null> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(null));
    server.once("listening", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : null;
      server.close(() => resolve(port));
    });
    server.listen({ port: 0, host, exclusive: true });
  });
}
