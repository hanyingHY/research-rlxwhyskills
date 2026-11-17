import assert from "node:assert/strict";
import { test } from "node:test";

import { describeUpdateSupport, feedUrlFor, formatUpdateError } from "../src/updater.js";

test("development builds never claim update support", () => {
  const support = describeUpdateSupport({
    isPackaged: false,
    platform: "darwin",
    appImagePath: null,
    feedUrl: "https://example.test/updates",
    bundledConfig: true,
  });
  assert.equal(support.supported, false);
  assert.equal(support.reason, "development");
});

test("packaged builds need a feed or the generated app-update.yml", () => {
  assert.equal(
    describeUpdateSupport({ isPackaged: true, platform: "win32", bundledConfig: false }).reason,
    "feed_missing",
  );
  assert.equal(
    describeUpdateSupport({ isPackaged: true, platform: "win32", bundledConfig: true }).supported,
    true,
  );
  assert.equal(
    describeUpdateSupport({
      isPackaged: true,
      platform: "darwin",
      feedUrl: "https://example.test/updates",
    }).supported,
    true,
  );
});

test("Linux only updates the AppImage build", () => {
  const deb = describeUpdateSupport({
    isPackaged: true,
    platform: "linux",
    bundledConfig: true,
    appImagePath: null,
  });
  assert.equal(deb.supported, false);
  assert.equal(deb.reason, "linux_not_appimage");

  const appImage = describeUpdateSupport({
    isPackaged: true,
    platform: "linux",
    bundledConfig: true,
    appImagePath: "/tmp/OpenDirector.AppImage",
  });
  assert.equal(appImage.supported, true);
});

test("generic feed URLs get a channel suffix only for beta", () => {
  assert.equal(feedUrlFor("https://updates.test/od/", "stable"), "https://updates.test/od");
  assert.equal(feedUrlFor("https://updates.test/od", "beta"), "https://updates.test/od/beta");
  assert.equal(feedUrlFor(null, "stable"), null);
});

test("update errors are translated without leaking stack traces", () => {
  assert.match(
    formatUpdateError(new Error("HttpError: 404 Not Found")),
    /no release for this platform/,
  );
  assert.match(
    formatUpdateError(new Error("getaddrinfo ENOTFOUND api.github.com")),
    /could not be reached/,
  );
  assert.match(
    formatUpdateError(new Error("code signature validation failed")),
    /not signed/,
  );
  const generic = formatUpdateError(new Error("boom\n    at somewhere.js:1:1"));
  assert.equal(generic, "boom");
});
