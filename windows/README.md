# OpenDirector for Windows

English | [简体中文](README.zh-CN.md)

OpenDirector in a window of its own: double-click the desktop icon and the AI video
workspace opens. The window shows **exactly the same workspace** you would get by
running `opendirector serve` and opening `http://127.0.0.1:8000` in a browser — the
same canvas, timeline, editing panels, presets, agent chat and export. This package
only adds the parts a browser tab cannot do: install the runtime, start the local
service, open the window, and stop everything cleanly when you close it.

You do **not** need to install Python, Node.js, Git or FFmpeg.

## Install (once)

1. Unzip this package somewhere you want to keep it, for example
   `C:\Users\<you>\OpenDirector`.
2. Double-click **`setup.cmd`**.
   It downloads a private Python runtime, installs OpenDirector and FFmpeg, then puts
   **OpenDirector** on your desktop and in the Start Menu. First setup takes a few
   minutes and needs an internet connection.
3. Double-click **OpenDirector** on the desktop.

Nothing is installed system-wide, and no administrator rights are required.

## Use

- Double-click **OpenDirector** → a window opens (Microsoft Edge or Google Chrome in
  application mode: no address bar, no tabs, its own taskbar entry).
- Closing that window stops the local service automatically. Your work is already
  saved in your data folder.
- To see what is happening, or to fix a problem, run **`app\OpenDirector.cmd`**
  instead: it keeps a console window open with progress and errors.

## Where your files are

| What | Where | Removed on uninstall? |
| --- | --- | --- |
| Projects, assets, model credentials, caches | `%APPDATA%\OpenDirector\data` | **No** |
| Logs | `%APPDATA%\OpenDirector\logs` | No |
| Window/interface preferences, last port | `%APPDATA%\OpenDirector\state.json` | No |
| Private Python runtime, FFmpeg | next to the app (`runtime\`, `bin\`) | Yes |

Set the `OPENDIRECTOR_ROOT` environment variable before starting if you want projects
somewhere else.

## Update, repair, uninstall

| Task | How |
| --- | --- |
| Update OpenDirector | double-click **`update.cmd`** |
| Check the installation | `app\OpenDirector.cmd --check` |
| Rebuild the runtime | `app\OpenDirector.cmd --install --force` |
| Uninstall | right-click **`app\uninstall.ps1`** → *Run with PowerShell* (projects are kept) |

## Troubleshooting

Every message the launcher prints is also written to
`%APPDATA%\OpenDirector\logs\launcher-<date>.log`.

| Message | What to do |
| --- | --- |
| *No Python runtime is available* | Run `setup.cmd` again. It downloads a private runtime; without it nothing can start. |
| *The local port is already in use* | Another OpenDirector is probably running: close it, or start with `app\OpenDirector.cmd --port 8010`. |
| *Installing OpenDirector failed* | Check the network/proxy. On a corporate network set a mirror first: `set OPENDIRECTOR_PIP_INDEX_URL=https://your-mirror/simple` then run `setup.cmd`. |
| *The local service exited immediately* | Open the newest log; the last lines name the cause (usually a missing dependency or an unwritable data folder). Then `app\OpenDirector.cmd --install --force`. |
| *The workspace files are missing* | The service runs but has no interface files: `app\OpenDirector.cmd --install --force`. |
| *No supported browser was found* | Install Microsoft Edge or Google Chrome, or open the printed address in any browser. |
| Generation or export is slow | Generation uses the model services you configured in **Settings → Model connections**; this package does not include any model. |

## Advanced

```
app\OpenDirector.cmd --port 8010              # use a fixed port
app\OpenDirector.cmd --data-dir D:\MyFilms    # keep projects on another drive
app\OpenDirector.cmd --check                  # print diagnostics and exit
app\OpenDirector.cmd --install --force        # rebuild the environment
app\OpenDirector.cmd update                   # upgrade OpenDirector
app\OpenDirector.cmd --no-browser             # start the service only
```

Offline installation: put the wheels for OpenDirector and its dependencies in a
`wheels\` folder next to `setup.cmd` and run
`setup.cmd -WheelsDir wheels`. No package index is contacted.

Run from a source checkout (developers):
`python app\opendirector_app.py --source C:\src\OpenDirector`.

## What gets installed

- **Python 3.12 (embeddable)** — private to OpenDirector, PSF licence
- **OpenDirector** and its Python dependencies — Apache-2.0
- **FFmpeg / ffprobe** with `libx264` — GPL v3 (static build); needed to probe media and to export MP4
- **psutil** — BSD-3-Clause; used to stop the service reliably

See `THIRD-PARTY-NOTICES.txt` for the complete list. Microsoft Edge or Google Chrome
are **not** redistributed here; the application window uses the browser already
installed on your computer.

## Building a single-file installer

On a Windows machine with 7-Zip (or IExpress), run from this folder:

```powershell
powershell -ExecutionPolicy Bypass -File app\make-exe.ps1
```

It produces `packages\OpenDirector-Setup.exe`, which does the same thing as `setup.cmd`
after extracting itself.

## Acceptance notes

Tested platforms, what the package installs, data preservation across updates and
uninstall, and the exact behaviour on each failure are documented in
[`docs/acceptance.md`](docs/acceptance.md) ([中文](docs/acceptance.zh-CN.md)).
