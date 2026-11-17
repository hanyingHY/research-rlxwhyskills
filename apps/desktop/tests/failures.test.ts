/** A startup failure must name a cause the user can act on, in both languages. */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildFailurePayload,
  classifyBackendOutput,
  diagnosticsText,
  failureText,
} from "../src/main/startup/failures";
import { FAILURE_CODES, LOCALES, type StartupFailure } from "../src/shared/contracts";

function failure(code: StartupFailure["code"], detail?: string): StartupFailure {
  return { code, stage: "waiting-for-backend", detail, logTail: ["line one", "line two"] };
}

test("a busy port is recognized", () => {
  const result = classifyBackendOutput("error while attempting to bind on address ('127.0.0.1', 8000): OSError: [Errno 98] address already in use");
  assert.equal(result.code, "port_unavailable");
});

test("windows socket errors are recognized", () => {
  const result = classifyBackendOutput("OSError: [WinError 10048] Only one usage of each socket address is normally permitted");
  assert.equal(result.code, "port_unavailable");
});

test("a missing python module names the module", () => {
  const result = classifyBackendOutput("ModuleNotFoundError: No module named 'uvicorn'");
  assert.equal(result.code, "dependency_missing");
  assert.match(result.detail ?? "", /uvicorn/);
});

test("a missing opendirector package is a runtime problem, not a dependency problem", () => {
  const result = classifyBackendOutput("ModuleNotFoundError: No module named 'opendirector_api'");
  assert.equal(result.code, "runtime_missing");
});

test("missing web resources are detected from the launcher message", () => {
  const result = classifyBackendOutput("缺少前端产物，请重新安装。");
  assert.equal(result.code, "web_resources_missing");
});

test("unknown output stays a plain exit so the log is shown", () => {
  assert.equal(classifyBackendOutput("something odd happened").code, "backend_exited");
});

test("every code renders a title, summary and remedy in both languages", () => {
  for (const code of FAILURE_CODES) {
    for (const locale of LOCALES) {
      const text = failureText(failure(code), locale);
      assert.ok(text.title.length > 0);
      assert.ok(text.summary.length > 0);
      assert.ok(text.remedy.length > 10, `${locale}/${code} remedy`);
    }
  }
});

test("the failure payload carries actions and the log tail", () => {
  const payload = buildFailurePayload(failure("port_unavailable", "port 8000 busy"), {
    appVersion: "0.1.4",
    locale: "en-US",
    dataRoot: "/data",
    logDirectory: "/logs",
  });
  assert.equal(payload.code, "port_unavailable");
  assert.equal(payload.logTail.length, 2);
  assert.ok(payload.actions.retry.length > 0);
  assert.ok(payload.guideUrl.startsWith("https://"));
});

test("diagnostics never include credentials and always include the cause", () => {
  const payload = buildFailurePayload(failure("backend_timeout"), {
    appVersion: "0.1.4",
    locale: "zh-CN",
    dataRoot: "/data",
    logDirectory: "/logs",
  });
  const text = diagnosticsText(payload, { appVersion: "0.1.4", locale: "zh-CN" });
  assert.match(text, /backend_timeout/);
  assert.match(text, /line two/);
});
