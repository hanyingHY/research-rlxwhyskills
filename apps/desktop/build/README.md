# Build resources

`electron-builder` reads this directory for packaging assets.

## `icon.ico` (Windows)

The installer, the taskbar icon and the window icon come from `build/icon.ico`.
It is **not** checked in: generate it from the OpenDirector logo before building a
release package.

```powershell
cd apps/desktop
powershell -ExecutionPolicy Bypass -File scripts/windows/make-icon.ps1 -Source ../../src/assets/open_director_logo.png
```

`make-icon.ps1` needs Pillow (`python -m pip install pillow`) or ImageMagick
(`magick`). If neither is available it prints a warning and `electron-builder`
falls back to the default Electron icon, which is fine for local builds.

## Notes

- Keep the icon at 256×256 with 16/24/32/48/64/128/256 entries so it looks
  correct in the taskbar, the installer and Explorer.
- Do not commit generated media tools (`resources/bin`, `resources/python-runtime`,
  `resources/wheels`); they are produced by the scripts under `scripts/windows/`
  and are ignored by git.
