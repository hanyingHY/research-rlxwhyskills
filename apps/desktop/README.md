# OpenDirector desktop shell

English | [简体中文](README.zh-CN.md) · Upstream issue: [desktop RFC #362](https://github.com/ThinkFlowLab/OpenDirector/issues/362) · Windows distribution: [D3](https://github.com/ThinkFlowLab/OpenDirector/issues/365)

An installable Windows client for OpenDirector. It is a **host**, not a second
implementation: it starts the same local API (`python -m opendirector_api.server`),
waits until that API serves the real built workspace, and opens that page in a
native window. Users get the identical canvas, timeline, editing panels, presets
and export they get in a browser, without installing Python, Node.js or FFmpeg.

```
┌─ OpenDirector.exe (Electron shell) ────────────────────────┐
│  startup window → local API (python, bundled) → workspace  │
│  http://127.0.0.1:<port>/   (the same HTML/JS/CSS bundle)  │
└────────────────────────────────────────────────────────────┘
```

## What the shell adds

| Capability | Why it cannot live in the browser page |
| --- | --- |
| Bundled Python runtime and first-run provisioning | Installing runtimes is a native operation |
| Startup window with per-stage progress | The page does not exist until the service is up |
| Bilingual failure window (retry / logs / copy diagnostics / guide) | A blank tab cannot explain a dead service |
| Graceful shutdown of the service and its children | A closed tab cannot stop a spawned process |
| Quit guard while generation or export is in flight | The page loses its requests when the window closes |
| Native save dialog for exports, external links in the default browser, window state, zoom | Browser-only behaviours |
| Single instance lock, taskbar identity, window state | Operating system integration |

## What is unchanged

The workspace page is byte-for-byte the same bundle the browser loads. Client-side
routes (`/ai-canvas/<id>`, `/ai-tool/<id>`), project storage, model credentials,
agent runs, generation receipts and exports all behave exactly as documented in the
[OpenDirector user guide](https://github.com/ThinkFlowLab/OpenDirector/blob/main/docs/guides/user-guide.md).
The shell does not proxy, rewrite or intercept API traffic beyond adding the
`X-OpenDirector-Request` header the local API requires.

## Where your data lives

| Path | Contents | Survives |
| --- | --- | --- |
| `%APPDATA%\OpenDirector\data` | Projects, assets, model credentials, caches | Updates **and** uninstall |
| `%APPDATA%\OpenDirector\logs` | `desktop-*.log`, `backend-*.log` (rotated, 5 kept) | Updates and uninstall |
| `%APPDATA%\OpenDirector\config.json` | Window size/position, zoom, shell language, last port | Updates and uninstall |
| `<install dir>\resources\python-runtime` | Bundled Python and OpenDirector | Replaced by an update |
| `<install dir>\resources\bin` | `ffmpeg.exe`, `ffprobe.exe` | Replaced by an update |

Nothing the user creates is written into the installation directory, which is what
makes "install → update → uninstall" non-destructive. `OPENDIRECTOR_ROOT` still
overrides the data directory, exactly as it does for the CLI.

## Run it from a source checkout

Requirements: Node.js 22.12+, Python 3.11+, and an OpenDirector checkout with
`pip install -e .` already run (or set `OPENDIRECTOR_PYTHON`).

```sh
cd apps/desktop
npm ci
npm start
```

Useful environment variables:

| Variable | Effect |
| --- | --- |
| `OPENDIRECTOR_PYTHON` | Interpreter to run the backend; wins over every other candidate |
| `OPENDIRECTOR_DESKTOP_SOURCE_ROOT` | OpenDirector checkout to run from source (sets `PYTHONPATH` like `opendirector dev`) |
| `OPENDIRECTOR_ROOT` | Project/credential directory (default: user data) |
| `OPENDIRECTOR_PIP_INDEX_URL` | Index used when provisioning a virtual environment |

If no bundled runtime exists and no interpreter has OpenDirector installed, the
shell creates a virtual environment under user data and installs into it, showing
progress in the startup window.

## Build the Windows package

```powershell
cd apps/desktop
powershell -ExecutionPolicy Bypass -File scripts\windows\build-installer.ps1 -SourceRoot ..\..
```

That produces, in `release/`:

- `OpenDirector-<version>-x64.exe` — NSIS installer (per-user by default, Chinese and English installer languages, no elevation required);
- `OpenDirector-<version>-x64-portable.exe` — portable single-file build;
- `OpenDirector-<version>-x64.zip` — archive for managed deployment.

Set `CSC_LINK` (PFX path or base64) and `CSC_KEY_PASSWORD` to sign; without them
the build simply produces unsigned artifacts. See
[docs/desktop/windows-distribution.md](../../docs/desktop/windows-distribution.md)
for the full runbook, including the offline wheel workflow and the release checklist.

Individual stages can be run on their own:

```powershell
scripts\windows\prepare-python-runtime.ps1   # bundled Python + OpenDirector
scripts\windows\fetch-ffmpeg.ps1             # ffmpeg/ffprobe with libx264
scripts\windows\make-icon.ps1                # build/icon.ico from the logo
scripts\windows\verify-package.ps1           # checks release\win-unpacked
node scripts\build-windows.mjs --dir         # packaging check without installers
```

## Tests

```sh
npm test          # tsc + node --test (60 checks)
npm run typecheck
```

The suite covers runtime resolution, port stability, readiness polling, failure
classification, data/install separation, the quit guard, and the full startup
orchestration against a stubbed Electron API plus a real Python child process.

## Layout and upstreaming

This work was developed outside the OpenDirector repository and maps onto it
one-to-one, so it can be copied across without renaming:

| Here | In `ThinkFlowLab/OpenDirector` |
| --- | --- |
| `apps/desktop/` | `apps/desktop/` (new; add `npm ci` to the release checks) |
| `docs/desktop/` | `docs/desktop/` (new) |
| `.github/workflows/desktop-windows.yml` | `.github/workflows/desktop-windows.yml` (new) |

Nothing under `src/`, `packages/`, `apps/api/` or the Python packaging is modified:
the shell consumes the published contracts only, which is why it can be reviewed and
merged without touching the workspace or the backend.

## Known gaps

- **Automatic updates (D5)** are not wired up: `publish` is disabled and no
  updater runs yet. Installers are standalone.
- **macOS (D2) and Linux (D4)** targets are intentionally empty in
  `electron-builder.yml`; the runtime and shutdown code is cross-platform.
- **x64 only.** Windows ARM64 needs an embeddable Python build and is not tested.
- **Signing** depends on the release owner's certificate; see the distribution doc.
