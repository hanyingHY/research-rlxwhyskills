/** Tracks work that a window close would interrupt.
 *
 * The workspace runs generation, tool and export work against the local API. The
 * desktop shell must not silently quit in the middle of it, so it watches in-flight
 * loopback requests and downloads and asks before quitting. Nothing here inspects
 * request bodies: only URLs and timings, so no prompt or credential is observed. */

import { OPERATION_GRACE_MS, OPERATION_URL_PATTERNS } from "../shared/contracts";

export interface PendingOperation {
  id: number;
  url: string;
  startedAt: number;
}

/** The slice of Electron's `WebRequest` this monitor needs; tests supply a stub. */
export interface WebRequestLike {
  onBeforeRequest(
    filter: { urls: string[] },
    listener: (details: { id: number; url: string }) => void,
  ): void;
  onCompleted(filter: { urls: string[] }, listener: (details: { id: number }) => void): void;
  onErrorOccurred(filter: { urls: string[] }, listener: (details: { id: number }) => void): void;
}

export interface OperationMonitorOptions {
  now?: () => number;
  /** Requests younger than this are treated as ordinary polling traffic. */
  graceMs?: number;
  patterns?: readonly RegExp[];
}

export class OperationMonitor {
  private readonly now: () => number;
  private readonly graceMs: number;
  private readonly patterns: readonly RegExp[];
  private readonly requests = new Map<number, PendingOperation>();
  private readonly downloads = new Map<number, { filename: string; startedAt: number }>();

  constructor(options: OperationMonitorOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.graceMs = options.graceMs ?? OPERATION_GRACE_MS;
    this.patterns = options.patterns ?? OPERATION_URL_PATTERNS;
  }

  /** Electron offers no removal for these listeners; a session is watched for its lifetime. */
  attach(webRequest: WebRequestLike, urlPatterns: string[] = ["http://127.0.0.1:*/*"]): void {
    webRequest.onBeforeRequest({ urls: urlPatterns }, (details) => {
      this.requests.set(details.id, { id: details.id, url: details.url, startedAt: this.now() });
    });
    const done = (details: { id: number }) => this.requests.delete(details.id);
    webRequest.onCompleted({ urls: urlPatterns }, done);
    webRequest.onErrorOccurred({ urls: urlPatterns }, done);
  }

  /** Long-running export and generation endpoints, plus anything old enough to matter. */
  get active(): PendingOperation[] {
    const now = this.now();
    return [...this.requests.values()].filter(
      (request) =>
        now - request.startedAt >= this.graceMs ||
        this.patterns.some((pattern) => pattern.test(request.url)),
    );
  }

  get pendingRequests(): number {
    return this.requests.size;
  }

  trackDownload(id: number, filename: string): void {
    this.downloads.set(id, { filename, startedAt: this.now() });
  }

  finishDownload(id: number): void {
    this.downloads.delete(id);
  }

  get activeDownloads(): number {
    return this.downloads.size;
  }

  /** Work the user would lose by quitting now. */
  get count(): number {
    return this.active.length + this.activeDownloads;
  }

  reset(): void {
    this.requests.clear();
    this.downloads.clear();
  }
}
