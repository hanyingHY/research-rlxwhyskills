#!/usr/bin/env python3
"""Export a portable bundle of research-pipeline-lite."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import tempfile
from pathlib import Path
from zipfile import ZipFile


IGNORE_PATTERNS = shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export a portable bundle of the lite research skill")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--mode", choices=["copy", "zip", "both"], default="both")
    parser.add_argument("--manifest-output")
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    skill_root = Path(__file__).resolve().parents[1]
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    bundle_dir = output_dir / skill_root.name
    archive_path = output_dir / f"{skill_root.name}.zip"

    if bundle_dir.exists() and args.overwrite:
        shutil.rmtree(bundle_dir)
    if archive_path.exists() and args.overwrite:
        archive_path.unlink()

    bundle_fingerprint = None

    if args.mode in {"copy", "both"}:
        if bundle_dir.exists():
            raise FileExistsError(f"Bundle directory already exists: {bundle_dir}")
        shutil.copytree(skill_root, bundle_dir, ignore=IGNORE_PATTERNS)
        bundle_fingerprint = compute_tree_fingerprint(bundle_dir)

    if args.mode == "zip":
        with tempfile.TemporaryDirectory(prefix=f"{skill_root.name}_export_") as temp_dir:
            temp_root = Path(temp_dir)
            temp_bundle = temp_root / skill_root.name
            shutil.copytree(skill_root, temp_bundle, ignore=IGNORE_PATTERNS)
            bundle_fingerprint = compute_tree_fingerprint(temp_bundle)
            archive_result = shutil.make_archive(str(output_dir / skill_root.name), "zip", root_dir=temp_root, base_dir=skill_root.name)
            archive_path = Path(archive_result)
    elif args.mode == "both":
        archive_result = shutil.make_archive(str(output_dir / skill_root.name), "zip", root_dir=output_dir, base_dir=skill_root.name)
        archive_path = Path(archive_result)

    manifest = build_manifest(skill_root.name, args.mode, bundle_dir if bundle_dir.exists() else None, archive_path if archive_path.exists() else None, bundle_fingerprint)
    if args.manifest_output:
        manifest_path = Path(args.manifest_output)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    sys.exit(0 if manifest["status"] == "ready" else 1)


def build_manifest(skill_name: str, mode: str, bundle_dir: Path | None, archive_path: Path | None, bundle_fingerprint: str | None) -> dict:
    required_copy = {
        "skill_md": bool(bundle_dir and (bundle_dir / "SKILL.md").exists()),
        "agents_yaml": bool(bundle_dir and (bundle_dir / "agents" / "openai.yaml").exists()),
        "references_dir": bool(bundle_dir and (bundle_dir / "references").exists()),
        "scripts_dir": bool(bundle_dir and (bundle_dir / "scripts").exists()),
    }
    required_archive = inspect_archive(archive_path, skill_name) if archive_path else {
        "skill_md": False,
        "agents_yaml": False,
        "references_dir": False,
        "scripts_dir": False,
    }
    file_count = sum(1 for path in bundle_dir.rglob("*") if bundle_dir and bundle_dir.exists() and path.is_file()) if bundle_dir else 0
    status_ready = True
    if mode in {"copy", "both"}:
        status_ready = status_ready and all(required_copy.values())
    if mode in {"zip", "both"}:
        status_ready = status_ready and all(required_archive.values())
    return {
        "schema_version": 1,
        "bundle_type": "research_skill_component",
        "family_name": "research-skill-family",
        "skill_name": skill_name,
        "mode": mode,
        "bundle_dir": str(bundle_dir) if bundle_dir else None,
        "archive_path": str(archive_path) if archive_path else None,
        "bundle_fingerprint_sha256": bundle_fingerprint,
        "required_copy": required_copy,
        "required_archive": required_archive,
        "file_count": file_count,
        "status": "ready" if status_ready else "needs_attention",
    }


def inspect_archive(archive_path: Path, skill_name: str) -> dict:
    if not archive_path or not archive_path.exists():
        return {"skill_md": False, "agents_yaml": False, "references_dir": False, "scripts_dir": False}
    with ZipFile(archive_path) as zf:
        names = set(zf.namelist())
    prefix = f"{skill_name}/"
    return {
        "skill_md": f"{prefix}SKILL.md" in names,
        "agents_yaml": f"{prefix}agents/openai.yaml" in names,
        "references_dir": any(name.startswith(f"{prefix}references/") for name in names),
        "scripts_dir": any(name.startswith(f"{prefix}scripts/") for name in names),
    }


def compute_tree_fingerprint(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*")):
        if path.is_dir():
            continue
        rel = path.relative_to(root).as_posix().encode("utf-8")
        digest.update(rel)
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


if __name__ == "__main__":
    main()
