#!/usr/bin/env python3
"""Export the full research skill family as a portable bundle."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import tempfile
from pathlib import Path
from zipfile import ZipFile


SKILL_FOLDERS = ["research-skill-hub", "research-pipeline-full", "research-pipeline-lite"]
TOP_LEVEL_FILES = [
    "README.md",
    "research_skill_family.json",
    "build_research_skill_prompt.py",
    "export_research_skill_family.py",
    "prepare_research_project.py",
    "research_runtime.py",
    "route_research_skill_entry.py",
    "assess_research_project_state.py",
    "research_skill_console.py",
    "generate_research_skill_quickstart.py",
    "validate_research_skill_family.py",
    "smoke_test_research_skill_family.py",
]
IGNORE_PATTERNS = shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo")


def main() -> None:
    parser = argparse.ArgumentParser(description="Export the research skill family")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--bundle-name", default="research-skill-family")
    parser.add_argument("--mode", choices=["copy", "zip", "both"], default="both")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--manifest-output")
    args = parser.parse_args()

    family_root = Path(__file__).resolve().parent
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    bundle_name = args.bundle_name
    bundle_dir = output_dir / bundle_name
    archive_path = output_dir / f"{bundle_name}.zip"

    if bundle_dir.exists() and args.overwrite:
        shutil.rmtree(bundle_dir)
    if archive_path.exists() and args.overwrite:
        archive_path.unlink()

    bundle_fingerprint = None
    component_fingerprints = None

    if args.mode in {"copy", "both"}:
        if bundle_dir.exists():
            raise FileExistsError(f"Bundle directory already exists: {bundle_dir}")
        bundle_dir.mkdir(parents=True, exist_ok=False)
        copy_family_contents(family_root, bundle_dir)
        write_bundle_identity(bundle_dir, bundle_name)
        bundle_fingerprint = compute_tree_fingerprint(bundle_dir)
        component_fingerprints = compute_component_fingerprints(bundle_dir)

    if args.mode == "zip":
        with tempfile.TemporaryDirectory(prefix="research_skill_family_") as temp_dir:
            temp_root = Path(temp_dir)
            temp_bundle = temp_root / bundle_name
            temp_bundle.mkdir(parents=True, exist_ok=False)
            copy_family_contents(family_root, temp_bundle)
            write_bundle_identity(temp_bundle, bundle_name)
            bundle_fingerprint = compute_tree_fingerprint(temp_bundle)
            component_fingerprints = compute_component_fingerprints(temp_bundle)
            archive_result = shutil.make_archive(str(output_dir / bundle_name), "zip", root_dir=temp_root, base_dir=bundle_name)
            archive_path = Path(archive_result)
    elif args.mode == "both":
        archive_result = shutil.make_archive(str(output_dir / bundle_name), "zip", root_dir=output_dir, base_dir=bundle_name)
        archive_path = Path(archive_result)

    manifest = build_manifest(args.mode, bundle_name, bundle_dir if bundle_dir.exists() else None, archive_path if archive_path.exists() else None, bundle_fingerprint, component_fingerprints)
    if args.manifest_output:
        manifest_path = Path(args.manifest_output)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    sys.exit(0 if manifest["status"] == "ready" else 1)


def copy_family_contents(family_root: Path, bundle_dir: Path) -> None:
    for name in [*TOP_LEVEL_FILES, *SKILL_FOLDERS]:
        src = family_root / name
        dst = bundle_dir / name
        if src.is_dir():
            shutil.copytree(src, dst, ignore=IGNORE_PATTERNS)
        else:
            shutil.copy2(src, dst)


def write_bundle_identity(bundle_dir: Path, bundle_name: str) -> None:
    family_metadata_path = bundle_dir / "research_skill_family.json"
    family_metadata = json.loads(family_metadata_path.read_text(encoding="utf-8"))
    family_metadata["exported_bundle_name"] = bundle_name
    family_metadata["display_name"] = bundle_name
    family_metadata_path.write_text(json.dumps(family_metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    readme_path = bundle_dir / "README.md"
    readme_text = readme_path.read_text(encoding="utf-8")
    if not readme_text.startswith(f"# {bundle_name}\n"):
        readme_text = f"# {bundle_name}\n\nMigrated research skill family bundle.\n\n" + readme_text
        readme_path.write_text(readme_text, encoding="utf-8")


def build_manifest(mode: str, bundle_name: str, bundle_dir: Path | None, archive_path: Path | None, bundle_fingerprint: str | None, component_fingerprints: dict | None) -> dict:
    required_keys = ["readme", "family_metadata", "family_prompt_builder", "family_exporter", "family_project_preparer", "family_runtime", "family_router", "family_state_assessor", "family_console", "family_quickstart", "family_validator", "family_smoke_test", *SKILL_FOLDERS]
    required_copy = inspect_bundle(bundle_dir) if bundle_dir else {key: False for key in required_keys}
    required_archive = inspect_archive(archive_path, bundle_name) if archive_path else {key: False for key in required_keys}
    family_metadata = json.loads((Path(__file__).resolve().parent / "research_skill_family.json").read_text(encoding="utf-8"))
    status_ready = True
    if mode in {"copy", "both"}:
        status_ready = status_ready and all(required_copy.values())
    if mode in {"zip", "both"}:
        status_ready = status_ready and all(required_archive.values())
    file_count = sum(1 for path in bundle_dir.rglob("*") if path.is_file()) if bundle_dir and bundle_dir.exists() else 0
    return {
        "schema_version": 1,
        "bundle_type": "research_skill_family",
        "family_name": family_metadata["family_name"],
        "family_version": family_metadata["family_version"],
        "bundle_name": bundle_name,
        "mode": mode,
        "bundle_dir": str(bundle_dir) if bundle_dir else None,
        "archive_path": str(archive_path) if archive_path else None,
        "bundle_fingerprint_sha256": bundle_fingerprint,
        "component_fingerprints": component_fingerprints,
        "required_copy": required_copy,
        "required_archive": required_archive,
        "file_count": file_count,
        "status": "ready" if status_ready else "needs_attention",
    }


def inspect_bundle(bundle_dir: Path) -> dict:
    return {
        "readme": (bundle_dir / "README.md").exists(),
        "family_metadata": (bundle_dir / "research_skill_family.json").exists(),
        "family_prompt_builder": (bundle_dir / "build_research_skill_prompt.py").exists(),
        "family_exporter": (bundle_dir / "export_research_skill_family.py").exists(),
        "family_project_preparer": (bundle_dir / "prepare_research_project.py").exists(),
        "family_runtime": (bundle_dir / "research_runtime.py").exists(),
        "family_router": (bundle_dir / "route_research_skill_entry.py").exists(),
        "family_state_assessor": (bundle_dir / "assess_research_project_state.py").exists(),
        "family_console": (bundle_dir / "research_skill_console.py").exists(),
        "family_quickstart": (bundle_dir / "generate_research_skill_quickstart.py").exists(),
        "family_validator": (bundle_dir / "validate_research_skill_family.py").exists(),
        "family_smoke_test": (bundle_dir / "smoke_test_research_skill_family.py").exists(),
        "research-skill-hub": (bundle_dir / "research-skill-hub" / "SKILL.md").exists(),
        "research-pipeline-full": (bundle_dir / "research-pipeline-full" / "SKILL.md").exists(),
        "research-pipeline-lite": (bundle_dir / "research-pipeline-lite" / "SKILL.md").exists(),
    }


def inspect_archive(archive_path: Path, bundle_name: str) -> dict:
    if not archive_path or not archive_path.exists():
        return {"readme": False, "research-pipeline-full": False, "research-pipeline-lite": False}
    with ZipFile(archive_path) as zf:
        names = set(zf.namelist())
    prefix = f"{bundle_name}/"
    return {
        "readme": f"{prefix}README.md" in names,
        "family_metadata": f"{prefix}research_skill_family.json" in names,
        "family_prompt_builder": f"{prefix}build_research_skill_prompt.py" in names,
        "family_exporter": f"{prefix}export_research_skill_family.py" in names,
        "family_project_preparer": f"{prefix}prepare_research_project.py" in names,
        "family_runtime": f"{prefix}research_runtime.py" in names,
        "family_router": f"{prefix}route_research_skill_entry.py" in names,
        "family_state_assessor": f"{prefix}assess_research_project_state.py" in names,
        "family_console": f"{prefix}research_skill_console.py" in names,
        "family_quickstart": f"{prefix}generate_research_skill_quickstart.py" in names,
        "family_validator": f"{prefix}validate_research_skill_family.py" in names,
        "family_smoke_test": f"{prefix}smoke_test_research_skill_family.py" in names,
        "research-skill-hub": f"{prefix}research-skill-hub/SKILL.md" in names,
        "research-pipeline-full": f"{prefix}research-pipeline-full/SKILL.md" in names,
        "research-pipeline-lite": f"{prefix}research-pipeline-lite/SKILL.md" in names,
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


def compute_component_fingerprints(bundle_dir: Path) -> dict:
    return {
        "research-skill-hub": compute_tree_fingerprint(bundle_dir / "research-skill-hub"),
        "research-pipeline-full": compute_tree_fingerprint(bundle_dir / "research-pipeline-full"),
        "research-pipeline-lite": compute_tree_fingerprint(bundle_dir / "research-pipeline-lite"),
    }


if __name__ == "__main__":
    main()
