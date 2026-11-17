# Desktop runtime payload

`prepare-runtime.mjs` produces one directory per target:

```
runtime/dist/<mac|win|linux>-<arch>/
├── python/                 relocatable CPython (python-build-standalone layout)
├── site-packages/          opendirector + dependencies installed with --target
├── bin/ffmpeg, ffprobe     media tools (GPL/LGPL choice still open)
├── bin/opencode            bundled agent (from opendirector/_bundled/bin)
├── host_entry.py           desktop Host wrapper
└── manifest.json           versions, binary sizes, file count
```

`electron-builder.yml` copies this directory to `resources/runtime`, which is where
`src/config.js` expects it in a packaged build.

## Commands

```sh
# Build for the current host
node scripts/prepare-runtime.mjs \
  --python /opt/cpython-3.12.7-x86_64-unknown-linux-gnu \
  --wheels /tmp/wheels-linux-x64 \
  --ffmpeg /usr/local/bin \
  --target linux-x64

# Cross-build: pip needs an explicit platform tag
node scripts/prepare-runtime.mjs ... --cross --pip-platform manylinux2014_x86_64

# Verify on the target machine
node scripts/verify-runtime.mjs --runtime runtime/dist/linux-x64 --data /tmp/od-runtime
```

## What the wheel must contain

- `opendirector` distribution for the target platform (`py3-none-<platform>`), which
  already carries the web build, built-in skills and the OpenCode binary. The build must
  run on that platform; a wheel built on Linux cannot serve macOS.
- Every transitive dependency as a wheel for the target interpreter/ABI.

## Deliberate omissions

- No code signing, notarization or entitlements per file. macOS requires signing every
  Mach-O inside `python/` before the app will launch reliably with hardened runtime.
- No Windows ARM64 or Linux musl payload; both need separate interpreter and wheel sets.
- No first-run download path for the agent runtime; see the size decision in
  `docs/02-issue-362-assessment.md`.

## Where this should live upstream

Move `host_entry.py` to `apps/api/src/opendirector_api/desktop.py`, expose it as
`opendirector desktop --port 0`, and cover it with the repository's Python suite:
startup failure, 401 without a token, status JSON, and graceful shutdown. Keep
`opendirector serve` unchanged for browser users.
