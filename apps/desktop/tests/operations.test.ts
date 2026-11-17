/** The quit guard: work in flight must be visible, ordinary polling must not be. */

import assert from "node:assert/strict";
import { test } from "node:test";

import { OperationMonitor, type WebRequestLike } from "../src/main/operations";

interface Listener {
  (details: { id: number; url: string }): void;
}

class FakeWebRequest implements WebRequestLike {
  before: Listener | null = null;
  completed: ((details: { id: number }) => void) | null = null;
  failed: ((details: { id: number }) => void) | null = null;
  filters: { urls: string[] }[] = [];

  onBeforeRequest(filter: { urls: string[] }, listener: Listener): void {
    this.filters.push(filter);
    this.before = listener;
  }
  onCompleted(_filter: { urls: string[] }, listener: (details: { id: number }) => void): void {
    this.completed = listener;
  }
  onErrorOccurred(_filter: { urls: string[] }, listener: (details: { id: number }) => void): void {
    this.failed = listener;
  }

  start(id: number, url: string): void {
    this.before?.({ id, url });
  }
  end(id: number): void {
    this.completed?.({ id });
  }
}

function monitorAt(time: number): { monitor: OperationMonitor; advance: (ms: number) => void } {
  let now = time;
  const monitor = new OperationMonitor({ now: () => now, graceMs: 5_000 });
  return { monitor, advance: (ms: number) => (now += ms) };
}

test("only loopback traffic is watched", () => {
  const { monitor } = monitorAt(0);
  const webRequest = new FakeWebRequest();
  monitor.attach(webRequest);
  assert.deepEqual(webRequest.filters[0], { urls: ["http://127.0.0.1:*/*"] });
});

test("a short request is not reported as active work", () => {
  const { monitor, advance } = monitorAt(1_000);
  const webRequest = new FakeWebRequest();
  monitor.attach(webRequest);
  webRequest.start(1, "http://127.0.0.1:8000/api/creation/projects/x/queries");
  advance(500);
  assert.equal(monitor.count, 0);
  assert.equal(monitor.pendingRequests, 1);
});

test("a long-running request is reported", () => {
  const { monitor, advance } = monitorAt(1_000);
  const webRequest = new FakeWebRequest();
  monitor.attach(webRequest);
  webRequest.start(2, "http://127.0.0.1:8000/api/creation/projects/x/queries");
  advance(6_000);
  assert.equal(monitor.count, 1);
  webRequest.end(2);
  assert.equal(monitor.count, 0);
});

test("export and generation endpoints count immediately", () => {
  const { monitor } = monitorAt(1_000);
  const webRequest = new FakeWebRequest();
  monitor.attach(webRequest);
  webRequest.start(3, "http://127.0.0.1:8000/api/creation/projects/x/timelines/y/package?revision=2");
  assert.equal(monitor.count, 1);
  webRequest.failed?.({ id: 3 });
  assert.equal(monitor.count, 0);
});

test("downloads count until they finish", () => {
  const { monitor } = monitorAt(1_000);
  monitor.trackDownload(1, "film.mp4");
  assert.equal(monitor.activeDownloads, 1);
  assert.equal(monitor.count, 1);
  monitor.finishDownload(1);
  assert.equal(monitor.count, 0);
});

test("a reload clears everything", () => {
  const { monitor, advance } = monitorAt(1_000);
  const webRequest = new FakeWebRequest();
  monitor.attach(webRequest);
  webRequest.start(4, "http://127.0.0.1:8000/api/creation/projects/x/tool-tasks");
  advance(9_000);
  monitor.trackDownload(9, "film.mp4");
  assert.equal(monitor.count, 2);
  monitor.reset();
  assert.equal(monitor.count, 0);
});
