# OpenDirector for Windows — acceptance notes

[中文](acceptance.zh-CN.md) | English

Scope: D1 (desktop app) + D3 (Windows distribution) of
[ThinkFlowLab/OpenDirector#362](https://github.com/ThinkFlowLab/OpenDirector/issues/362).

## 1. What the app is

The desktop app is a thin, stdlib-only Python launcher around the **unmodified**
OpenDirector service and web UI:

```
double-click  →  install runtime (once)  →  start `python -m opendirector_api.server`
              →  open Edge/Chrome --app=http://127.0.0.1:<port>/  →  supervise  →  stop on window close
```

The window loads `http://127.0.0.1:<port>/`, which is exactly the bundle the CLI serves
at `http://127.0.0.1:8000` — the same React build, the same API, the same workflows.
Nothing in the web UI is forked, restyled or wrapped; the launcher only supplies the
things a browser tab cannot: a runtime, a service lifecycle, an app window and uninstall.

It is deliberately **not** Electron: the app window is the browser already installed on
the machine, so the package stays ~140 KB and the UI byte-for-byte matches the web build.

## 2. Declared characteristics

| Item | Value |
| --- | --- |
| Tested OS | Windows 10 21H2+, Windows 11 (see §6 for what was verified where) |
| Architecture | x64 only (arm64 Windows not built or tested) |
| Package formats | `OpenDirector-Windows-x64-<version>.zip`; optional `OpenDirector-Setup.exe` (7-Zip SFX or IExpress, built on Windows via `app\make-exe.ps1`) |
| Bundled runtime | CPython **3.12.10** embeddable (`python-3.12.10-embed-amd64.zip`), fetched at install time |
| Bundled Python packages | OpenDirector `0.1.4` + its dependencies from PyPI; `psutil` for process supervision |
| Bundled media tools | FFmpeg / ffprobe **7.x GPL static build** (`libx264` included), fetched at install time |
| Not bundled | Microsoft Edge / Google Chrome (reused from the machine), any model weights or API keys |
| Code signing | **Unsigned.** SmartScreen will warn on first run; see §7 |
| Install scope | Per-user, no administrator rights, no global PATH or registry entries |
| Data location | `%APPDATA%\OpenDirector\data` (projects, assets, model credentials, caches) |

## 3. Clean-machine walkthrough

Run each step on a Windows 10/11 x64 machine with Edge or Chrome and no Python installed.

1. **Install** — unzip the package, double-click `setup.cmd`. Expect: embeddable Python
   download, pip bootstrap, OpenDirector + FFmpeg install, Desktop and Start Menu
   shortcuts. First run takes a few minutes and needs the network.
2. **Create project** — double-click the Desktop shortcut. The app window opens the
   workspace; create a project and confirm it appears after reopening the app.
3. **Agent workflow** — configure a model connection in Settings → Model connections,
   then run an agent turn in a project. Progress streams into the window.
4. **Edit** — edit canvas items / assets; confirm changes persist (reload, reopen).
5. **Export** — export from the project. FFmpeg is required for MP4 export; it is
   installed by `setup.cmd`.
6. **Reopen** — close the window (the service stops), relaunch; the project, its assets
   and the model connection are all still there.
7. **Update** — double-click `update.cmd`; the runtime is repaired and OpenDirector is
   upgraded in place. Reopen and confirm the same projects and credentials.

## 4. Data preservation

| Scenario | Projects / credentials | How |
| --- | --- | --- |
| App update (`update.cmd`) | **Preserved** | The launcher always sets `OPENDIRECTOR_ROOT` to `%APPDATA%\OpenDirector\data`, so data never lives in the install directory that updates replace. |
| Reinstall / `--install --force` | **Preserved** | Only `runtime\` and `bin\` inside the app directory are rebuilt. |
| Uninstall (`uninstall.ps1`) | **Preserved** | Shortcuts, runtime, `runtime\`, `bin\` and the app folder are removed; `%APPDATA%\OpenDirector\data` is kept. |
| Uninstall with `-RemoveData` | **Deleted** | Requires typing `YES`; removes `%APPDATA%\OpenDirector\data`, `logs` and `state.json`. |
| Manual move | Supported | Set `OPENDIRECTOR_ROOT` before launching to point at another drive. |

## 5. Failure behaviour

Every message below is bilingual (zh-CN / en-US, driven by `--language` or the OS UI
language) and is also written to `%APPDATA%\OpenDirector\logs\launcher-<date>.log`.

| Failure | What the user sees | Exit code |
| --- | --- | --- |
| No usable Python runtime | "重新运行 setup.cmd …" / "Re-run setup.cmd …" | 2 |
| Local port already in use | Which port, plus `--port 8010` as the fix | 3 |
| Installing OpenDirector failed | Network/proxy hint, `OPENDIRECTOR_PIP_INDEX_URL` for mirrors, retry command | 2 |
| Service exited right after starting | The last lines of the service output, then `--install --force` | 4 (5 if it never answers) |
| Web UI files missing (service up, no `/`) | `--install --force` | 6 |
| No Edge and no Chrome installed | The URL to open by hand | 7 |
| Diagnostics requested | One report: runtime, version, data dir, port, FFmpeg, UI bundle, browser | 0 |

**Interrupted running task.** The window is the only client, and closing it stops the
service. Jobs are not silently lost: their state is persisted, so on the next launch the
UI offers the recovery action the job allows (retry, or resume where the provider
supports it). For live progress and streaming events the window must stay open — that is
what the client contributes. Exports additionally need FFmpeg on `PATH` inside the app
runtime (`bin\`), which `setup.cmd` installs; image/video generation needs a configured
model connection, since the package ships no models.

**Failed update.** `update.cmd` reports the pip failure, keeps the previous installation
intact and leaves the data directory untouched; the app remains usable at the old
version. `--install --force` rebuilds the runtime from scratch as the stronger repair.

## 6. Verification status — what was actually run

Verified in the development sandbox (Linux, Python 3.11, upstream `main` at 0.1.4):

- The real OpenDirector web bundle builds (`vite build`) and is served by the real
  `opendirector_api.server`: `GET /` → 200 with `<div id="root">`, hashed assets → 200,
  `GET /api/health` → `{"status":"ok"}`.
- The shipped `opendirector_app.py` starts that service, verifies it, and stops it
  cleanly, using the same code path the Windows package uses.
- 29/29 automated tests (`windows/tests/test_launcher.py`), including five end-to-end
  subprocess runs: start → verify → clean stop; port conflict (exit 3); missing
  dependency (exit 4, names the package); supervision timeout; `--check` report.
- The Windows-only parts that **cannot** run here and must be confirmed on a real
  machine before release: `install.ps1` (embeddable Python + get-pip), shortcut
  creation, `uninstall.ps1`, `make-exe.ps1`, Edge/Chrome `--app` window rendering, and
  the §3 clean-machine walkthrough end to end.

## 7. Known limitations

- **Unsigned binaries.** SmartScreen shows "Windows protected your PC" on the first run
  of any unsigned app; users choose *More info → Run anyway*. Signing needs an
  organisational certificate and an account with the CA — out of scope here.
- **x64 only.** An arm64 build needs the arm64 embeddable Python and arm64 FFmpeg;
  the launcher already parameterises both URLs.
- **Browser required.** Without Edge or Chrome the app starts the service and prints the
  URL instead of opening a window.
- **Installer downloads components.** The ZIP is small because Python and FFmpeg are
  fetched on first install; an offline install is supported by dropping wheels into
  `wheels\` and running `setup.cmd -WheelsDir wheels`.
