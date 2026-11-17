import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizationHeader,
  createToken,
  isWellFormedToken,
  redact,
  tokensMatch,
} from "../src/auth.js";

test("tokens carry 256 bits and are accepted only in canonical form", () => {
  const seen = new Set();
  for (let index = 0; index < 200; index += 1) {
    const token = createToken();
    assert.equal(isWellFormedToken(token), true, token);
    assert.equal(token.length, 43);
    assert.equal(seen.has(token), false, "duplicate token");
    seen.add(token);
  }
  assert.equal(isWellFormedToken("short"), false);
  assert.equal(isWellFormedToken(`${createToken()}!`), false);
  assert.equal(authorizationHeader("abc"), "Bearer abc");
});

test("comparison is exact and length-safe", () => {
  const token = createToken();
  assert.equal(tokensMatch(token, token), true);
  assert.equal(tokensMatch(token, createToken()), false);
  assert.equal(tokensMatch(token, `${token}x`), false);
  assert.equal(tokensMatch(token, undefined), false);
});

test("redaction removes every secret but keeps short text intact", () => {
  const token = createToken();
  const message = `boot ${token} then ${token} done`;
  assert.equal(redact(message, [token]), "boot [redacted] then [redacted] done");
  assert.equal(redact(message, ["", "abc"]), message);
  assert.equal(redact(message, [token, token]), "boot [redacted] then [redacted] done");
});
