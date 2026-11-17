# Windows distribution (D3) — build and release runbook

English | [简体中文](windows-distribution.zh-CN.md)

Roadmap: [D3 · Windows distribution](https://github.com/ThinkFlowLab/OpenDirector/issues/365).

## 1. Scope of this iteration

| Item | Status |
| --- | --- |
| Architecture | x64 only. Windows ARM64 is blocked on an embeddable CPython build and is untested. |
| Formats | NSIS installer (per-user), portable executable, zip archive |
| Installer languages | English, Simplified Chinese (`installerLanguages`) |
| Bundled runtime | CPython 3.12 embeddable + OpenDirector + FFmpeg/ffprobe (libx264) |
| Signing | Optional, env-driven (`CSC_LINK` + `CSC_KEY_PASSWORD`); **unsigned in CI** |
| Automatic updates | Not wired (D5). `publish: null`, no updater in the shell. |
| Verified on a Windows host | Not yet — see §5 for the gate that has to be run before release |

## 2. Build once, from a clean machine

```powershell
git clone https://github.com/ThinkFlowLab/OpenDirector.git
cd OpenDirector\apps\desktop
powershell -ExecutionPolicy Bypass -File scripts\windows\build-installer.ps1 -SourceRoot ..\..
```

What the script does, in order:

1. checks Node.js ≥ 22.12.0;
2. `npm ci`;
3. `prepare-python-runtime.ps1` — downloads the embeddable CPython, enables
   `site-packages` in `python312._pth`, installs pip, builds a wheel from
   `-SourceRoot` (or installs `opendirector` from the index, or installs from
   `-WheelsDir`), prunes `__pycache__`/pip/setuptools/wheel, then verifies
   `import opendirector_api, opendirector`;
4. `fetch-ffmpeg.ps1` — downloads a static build with libx264 into `resources/bin`
   and verifies `-encoders` lists `libx264`;
5. `make-icon.ps1` — converts the logo to `build/icon.ico` (Pillow or ImageMagick);
6. `npm run build` then `electron-builder --win --x64`;
7. `verify-package.ps1` against `release\win-unpacked`.

Artifacts land in `release/`:

```
OpenDirector-<version>-x64.exe                 # NSIS installer
OpenDirector-<version>-x64-portable.exe        # portable
OpenDirector-<version>-x64.zip                 # managed deployment
win-unpacked\                                  # unpacked application (verified)
```

## 3. Offline / air-gapped builds

```powershell
# On a machine with network access:
python -m pip wheel -w C:\wheels C:\src\OpenDirector
# On the build machine:
.\scripts\windows\prepare-python-runtime.ps1 -WheelsDir C:\wheels
.\scripts\windows\build-installer.ps1 -SkipMediaTools
```

`-WheelsDir` installs with `--no-index --find-links`, so no package index is
contacted. FFmpeg still has to be provided; copy `ffmpeg.exe`/`ffprobe.exe` into
`resources\bin` and use `-SkipMediaTools`.

## 4. Signing

```powershell
$env:CSC_LINK = 'C:\certs\opendirector.pfx'   # or base64 contents
$env:CSC_KEY_PASSWORD = '<password>'          # omit for a PFX without a password
.\scripts\windows\build-installer.ps1
```

electron-builder signs the installers, the application executable and the unpacked
binaries (`signAndEditExecutable: true`). CI must not hold the certificate: the
workflow sets `CSC_IDENTITY_AUTO_DISCOVERY=false` and only produces unsigned
artifacts. Signing in a release pipeline should use a dedicated runner or an EV
certificate on hardware.

## 5. Release gate (run on clean Windows machines)

Evidence to attach to the D3 issue: Windows versions and builds tested, architecture,
package format, bundled runtime versions (`resources\python-runtime\RUNTIME.txt`,
`resources\bin\MEDIA-TOOLS.txt`), and signing status.

1. **Install.** Run the NSIS installer as a standard (non-admin) user; confirm the
   desktop/Start Menu shortcuts and that the app starts without any prior Python,
   Node.js or FFmpeg installation.
2. **Create → generate → edit → export.** Create a project, run one agent-assisted
   workflow with a configured model, edit an asset, export an MP4 (confirm the save
   dialog and that `libx264` is used), export JSON/FCPXML.
3. **Reopen.** Quit, relaunch, confirm the project, the last opened canvas, the theme
   and the interface language are unchanged (they live in the loopback origin and in
   `%APPDATA%\OpenDirector`).
4. **Chinese and English.** Switch **View → Interface language**, restart: menus,
   startup stages, failures and backend receipts follow the choice. Run one failure
   (occupy the port with `netsh` or stop the service) and confirm the message is
   localized and the four actions work.
5. **Update.** Install the previous version, create a project, install the new one
   over it, confirm the project and the model credentials survive and that the data
   directory did not move.
6. **Uninstall.** Uninstall, confirm `%APPDATA%\OpenDirector\data` and `logs` remain,
   then reinstall and reopen the project.
7. **Interruption.** Start a generation or export, close the window: the quit guard
   appears; choosing *Quit anyway* stops the service and leaves no orphan
   `python.exe`/`ffmpeg.exe` (check Task Manager).
8. **Startup failure.** Rename `resources\python-runtime` and start: the failure
   window appears with `runtime_missing` and the remedy; **Retry** after restoring
   the directory works.
9. **Portable build.** Run `OpenDirector-<version>-x64-portable.exe` from a USB
   drive: it writes user data to `%APPDATA%\OpenDirector`, not next to the executable.

## 6. Licensing to mirror in the release NOTICE

- CPython (PSF licence) — `resources\python-runtime`
- FFmpeg/ffprobe (GPL v3 for the default gyan.dev *essentials* build — switch to an
  LGPL build if the project requires it)
- Electron and Chromium (MIT and bundled third-party licences)
- All licences already listed in the repository `NOTICE` for the web bundle

## 7. Open decisions for the RFC

- Initial OS/architecture matrix beyond Windows x64 (ARM64? Windows 10 support?).
- Signing certificate ownership and whether to ship unsigned nightlies.
- Update channel and hosting for D5 (`publish` is currently disabled).
