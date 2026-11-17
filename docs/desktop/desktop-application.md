# Desktop application (D1) — design and acceptance

English | [简体中文](desktop-application.zh-CN.md)

Roadmap: [D1 · Desktop application](https://github.com/ThinkFlowLab/OpenDirector/issues/363) ·
parent [RFC #362](https://github.com/ThinkFlowLab/OpenDirector/issues/362).
Reference for shell/Host lifecycle patterns:
[DeepSeek Harness Desktop](https://github.com/deepseek-ai/deepseek-harness/tree/39163dd30f703a79079e2d2446545cff3c453738/apps/desktop).

## 1. Principle: host, do not reimplement

OpenDirector already has a complete web workspace and a complete local API. The
desktop client is an Electron shell around both:

```
BrowserWindow  ──loads──►  http://127.0.0.1:<port>/
                              │
                              ├── /            ← the built workspace (index.html)
                              ├── /assets      ← the same JS/CSS the browser loads
                              ├── /fonts       ← the bundled timeline font
                              └── /api/...     ← the local API (FastAPI + uvicorn)
```

Because the renderer loads the served bundle over HTTP rather than a copy of it,
"the same experience" is a structural property, not a promise to maintain:

- client-side routes (`/ai-canvas/<id>`, `/ai-tool/<id>`, `?traceProject=`) are served
  by the API's own catch-all routes, so deep links and reloads behave as in a browser;
- the page keeps its language, theme, last project and layout in the storage of its
  origin — which is why the shell keeps the port stable between launches;
- WebGL (three.js), WebCodecs and MediaRecorder are provided by Chromium, and
  Electron's Chromium ships the proprietary codecs (H.264/AAC) that MP4 export needs.

## 2. Backend lifecycle

`src/main/backend/session.ts` owns one lifecycle. Its stages are also the labels
shown in the startup window:

| Stage | Work |
| --- | --- |
| `resolving-runtime` | Pick an interpreter: `OPENDIRECTOR_PYTHON` → bundled → provisioned venv → source checkout → system |
| `provisioning-environment` | Only when nothing has OpenDirector: create a venv under user data and install (bundled wheels first, index as fallback) |
| `reserving-port` | Prefer the port used last time, then the next 49, then an ephemeral port |
| `starting-backend` | `python -m opendirector_api.server --port <port>` with the environment below |
| `waiting-for-backend` | Poll `/api/health` with `X-OpenDirector-Request: 1`, then confirm `/` serves `id="root"` |
| `opening-window` | Load the workspace URL in the application window |

Environment handed to the backend:

| Variable | Value | Reason |
| --- | --- | --- |
| `OPENDIRECTOR_ROOT` | user data directory | Projects and credentials never live in the install directory |
| `OPENDIRECTOR_API_URL` | the chosen loopback URL | Same contract the CLI uses |
| `OPENDIRECTOR_LANGUAGE` | shell locale | Backend receipts in the user's language |
| `PATH` | `resources/bin` first | Bundled `ffmpeg`/`ffprobe` win over any system copy |
| `PYTHONUTF8`, `PYTHONIOENCODING` | `1`, `utf-8` | Logs stay readable on Chinese Windows |
| `NO_PROXY` | includes `127.0.0.1`, `localhost` | A system proxy must not intercept loopback |

The shell also passes `--proxy-bypass-list` to Chromium for the same reason.

Shutdown is graceful first (`taskkill /PID /T` on Windows, `SIGTERM` on POSIX), then
forceful after a four-second grace period. On POSIX the child owns a process group so
uvicorn's children terminate too.

## 3. Failure handling

Every failure path ends in a localized window with the failing stage, the cause, the
remedy, the log tail and four actions. Causes are classified from backend output:

| Code | Trigger |
| --- | --- |
| `runtime_missing` | No Python 3.11+, `opendirector_api` missing, interpreter cannot be executed |
| `runtime_version` | Interpreter older than 3.11 |
| `provision_failed` | `python -m venv` or `pip install` failed |
| `port_unavailable` | Bind error / `EADDRINUSE` / WinError 10048 |
| `dependency_missing` | `ModuleNotFoundError` for a dependency, or FFmpeg missing |
| `web_resources_missing` | `/` does not serve the built page |
| `backend_timeout` | No health response within the budget |
| `backend_exited` | Process exited for an unrecognised reason |
| `renderer_failed` | Page could not load, or the service died while running |

Logs are written synchronously to `%APPDATA%\OpenDirector\logs` (five files rotated),
so the last lines exist even after a crash.

## 4. Security boundaries

- The renderer runs with `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`.
- The page can call six validated IPC handlers (`info`, `openPath`, `restartBackend`,
  `getLocale`, `setLocale`, `onStatus`). `openPath` accepts only `data`, `logs`,
  `resources`; nothing accepts a path, a command or arbitrary data from the page.
- Navigation is restricted to the loopback origin; anything else opens in the default
  browser through `shell.openExternal`, and only for `http`/`https`.
- The operation monitor inspects request URLs and timings only — never bodies — so
  prompts and model credentials are not observed.
- The bundled runtime is read-only application code: provisioning installs into user
  data, never into `resources/python-runtime`.

## 5. Accepting behaviour for background work

Export and generation work is client-driven, so the shell derives "work in progress"
from in-flight loopback requests: any request older than five seconds, or any request
to the tool-task, timeline-package, commit or upload endpoints, counts as active.
Closing the window while work is active asks first, in the user's language, and
quitting stops the service only after the user confirms.

## 6. Verification performed here

`npm test` in `apps/desktop` (60 checks) covers: runtime selection order and version
gating, port stability, health polling (success, timeout, exit, header), index
verification, failure classification, i18n parity, data/install separation, config
robustness, the quit guard, and the complete startup/shutdown orchestration against a
stubbed Electron API driving a real Python child process.

Not verified in this environment (needs a Windows host, a display and network access
to python.org / gyan.dev): the installer run, real Electron window behaviour, code
signing, and the clean-machine walkthrough. The distribution runbook in
[windows-distribution.md](windows-distribution.md) lists those checks as the release
gate.
