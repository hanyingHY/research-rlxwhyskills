#!/usr/bin/env python3
"""Assembles the downloadable Windows package.

    python3 windows/build.py                 # build dist/OpenDirector-Windows-x64-<version>.zip
    python3 windows/build.py --version 0.1.4

The zip contains only text files, the generated icon and (optionally) wheels: it is a
bootstrap installer of a few dozen kilobytes. Unzipping it and double-clicking
setup.cmd is the whole installation; OpenDirector itself is downloaded on first setup,
because the Python runtime and FFmpeg are platform binaries that have to match the
user's machine.

Building the single-file .exe variant is done on Windows with app/make-exe.ps1.
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP = ROOT / "app"
DIST = ROOT / "packages"

REQUIRED = [
    APP / "opendirector_app.py",
    APP / "lib" / "strings.json",
    APP / "lib" / "opendirector.ico",
    APP / "OpenDirector.cmd",
    APP / "OpenDirector.vbs",
    APP / "install.ps1",
    APP / "uninstall.ps1",
    ROOT / "update.cmd",
    APP / "make-exe.ps1",
    ROOT / "setup.cmd",
    ROOT / "README.md",
    ROOT / "README.zh-CN.md",
    ROOT / "THIRD-PARTY-NOTICES.txt",
    ROOT / "docs" / "acceptance.md",
    ROOT / "docs" / "acceptance.zh-CN.md",
]

OPTIONAL_WHEELS = ROOT / "wheels"


def build(version: str) -> Path:
    missing = [str(path.relative_to(ROOT)) for path in REQUIRED if not path.is_file()]
    if missing:
        raise SystemExit(f"missing files, cannot build: {', '.join(missing)}")

    staging = DIST / "OpenDirector"
    if staging.exists():
        shutil.rmtree(staging)
    (staging / "app" / "lib").mkdir(parents=True)
    (staging / "app").mkdir(exist_ok=True)

    (staging / "VERSION").write_text(f"{version}\n", encoding="utf-8")
    for path in REQUIRED:
        target = staging / path.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)

    if OPTIONAL_WHEELS.is_dir() and any(OPTIONAL_WHEELS.glob("*.whl")):
        wheels = staging / "wheels"
        wheels.mkdir(exist_ok=True)
        for wheel in OPTIONAL_WHEELS.glob("*.whl"):
            shutil.copy2(wheel, wheels / wheel.name)
        print(f"included {len(list(OPTIONAL_WHEELS.glob('*.whl')))} wheel(s) for offline install")

    DIST.mkdir(parents=True, exist_ok=True)
    archive_path = DIST / f"OpenDirector-Windows-x64-{version}.zip"
    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(staging.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(DIST))

    digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    size = archive_path.stat().st_size
    print(f"built {archive_path} ({size / 1024:.1f} KiB)")
    print(f"sha256 {digest}")
    return archive_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the OpenDirector Windows package")
    parser.add_argument("--version", default="0.1.4")
    args = parser.parse_args()
    path = build(args.version)
    print(f"\nDownloadable package: {path}")
    print("Users: unzip it, then double-click setup.cmd, then OpenDirector on the desktop.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
