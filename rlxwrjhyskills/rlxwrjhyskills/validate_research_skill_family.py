#!/usr/bin/env python3
"""Validate the top-level research skill family helpers."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True

from research_runtime import python_command, run_command


SKILL_DIRS = ["research-skill-hub", "research-pipeline-full", "research-pipeline-lite"]
LOCAL_VALIDATOR_RELATIVE_PATHS = {
    "research-skill-hub": Path("scripts") / "validate_skill_local.py",
    "research-pipeline-full": Path("scripts") / "validate_skill_local.py",
    "research-pipeline-lite": Path("scripts") / "validate_skill_local.py",
}
FORBIDDEN_TEXT_PATTERNS = [
    r"C:/msys64/ucrt64/bin/python\.exe",
    r"C:\\Users\\Dell\\Desktop\\BDC",
]


def main() -> None:
    root = Path(__file__).resolve().parent
    local_validation = run_local_validators(root)
    referenced_resources = validate_skill_references(root)
    metadata_validation = validate_skill_metadata(root)
    cache_artifacts = find_cache_artifacts(root)
    forbidden_literals = find_forbidden_literals(root)
    checks = {
        "readme_exists": (root / "README.md").exists(),
        "family_metadata_exists": (root / "research_skill_family.json").exists(),
        "family_bundle_name_recorded": family_bundle_name_recorded(root / "research_skill_family.json"),
        "family_metadata_semantics_ok": family_metadata_semantics_ok(root / "research_skill_family.json"),
        "family_prompt_builder_exists": (root / "build_research_skill_prompt.py").exists(),
        "family_exporter_exists": (root / "export_research_skill_family.py").exists(),
        "family_project_preparer_exists": (root / "prepare_research_project.py").exists(),
        "family_runtime_exists": (root / "research_runtime.py").exists(),
        "family_router_exists": (root / "route_research_skill_entry.py").exists(),
        "family_state_assessor_exists": (root / "assess_research_project_state.py").exists(),
        "family_console_exists": (root / "research_skill_console.py").exists(),
        "family_quickstart_exists": (root / "generate_research_skill_quickstart.py").exists(),
        "family_smoke_test_exists": (root / "smoke_test_research_skill_family.py").exists(),
        "hub_skill_exists": (root / "research-skill-hub" / "SKILL.md").exists(),
        "full_skill_exists": (root / "research-pipeline-full" / "SKILL.md").exists(),
        "lite_skill_exists": (root / "research-pipeline-lite" / "SKILL.md").exists(),
        "local_skill_validators_pass": local_validation["all_passed"],
        "skill_references_exist": referenced_resources["all_present"],
        "skill_metadata_valid": metadata_validation["all_valid"],
        "no_cache_artifacts": not cache_artifacts,
        "no_forbidden_local_literals": not forbidden_literals,
    }
    result = {
        "skills_root": str(root),
        "checks": checks,
        "local_validation": local_validation,
        "referenced_resources": referenced_resources,
        "metadata_validation": metadata_validation,
        "cache_artifacts": cache_artifacts,
        "forbidden_literals": forbidden_literals,
        "status": "ready" if all(checks.values()) else "needs_attention",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if result["status"] == "ready" else 1)


def family_bundle_name_recorded(path: Path) -> bool:
    if not path.exists():
        return False
    payload = json.loads(path.read_text(encoding="utf-8"))
    return bool(payload.get("display_name") or payload.get("family_name"))


def family_metadata_semantics_ok(path: Path) -> bool:
    if not path.exists():
        return False
    payload = json.loads(path.read_text(encoding="utf-8"))
    expected_components = sorted(SKILL_DIRS)
    expected_tools = sorted([
        "assess_research_project_state.py",
        "build_research_skill_prompt.py",
        "export_research_skill_family.py",
        "generate_research_skill_quickstart.py",
        "prepare_research_project.py",
        "research_runtime.py",
        "research_skill_console.py",
        "route_research_skill_entry.py",
        "smoke_test_research_skill_family.py",
        "validate_research_skill_family.py",
    ])
    return (
        payload.get("schema_version") == 1
        and payload.get("family_name") == "research-skill-family"
        and sorted(payload.get("components", [])) == expected_components
        and sorted(payload.get("top_level_tools", [])) == expected_tools
        and payload.get("compatibility", {}).get("python") == ">=3.10"
    )


def run_local_validators(root: Path) -> dict:
    results: dict[str, dict] = {}
    all_passed = True
    for skill_dir in SKILL_DIRS:
        validator = root / skill_dir / LOCAL_VALIDATOR_RELATIVE_PATHS[skill_dir]
        skill_root = root / skill_dir
        if not validator.exists():
            results[skill_dir] = {
                "validator": str(validator),
                "returncode": -1,
                "status": "missing_validator",
                "stdout": "",
                "stderr": "validator not found",
            }
            all_passed = False
            continue
        completed = run_command(python_command(validator, skill_root), check=False)
        passed = completed.returncode == 0
        all_passed = all_passed and passed
        results[skill_dir] = {
            "validator": str(validator),
            "returncode": completed.returncode,
            "status": "ready" if passed else "needs_attention",
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
        }
    return {"all_passed": all_passed, "results": results}


def validate_skill_references(root: Path) -> dict:
    results: dict[str, dict] = {}
    all_present = True
    for skill_dir in SKILL_DIRS:
        skill_root = root / skill_dir
        skill_md = skill_root / "SKILL.md"
        missing: list[str] = []
        discovered: list[str] = []
        if skill_md.exists():
            text = skill_md.read_text(encoding="utf-8")
            for match in sorted(set(re.findall(r"`((?:references|scripts|agents|assets)/[^`]+)`", text))):
                discovered.append(match)
                if not (skill_root / Path(match)).exists():
                    missing.append(match)
        status = not missing and skill_md.exists()
        all_present = all_present and status
        results[skill_dir] = {
            "skill_md": str(skill_md),
            "discovered_paths": discovered,
            "missing_paths": missing,
            "status": "ready" if status else "needs_attention",
        }
    return {"all_present": all_present, "results": results}


def validate_skill_metadata(root: Path) -> dict:
    results: dict[str, dict] = {}
    all_valid = True
    for skill_dir in SKILL_DIRS:
        skill_root = root / skill_dir
        skill_md = skill_root / "SKILL.md"
        openai_yaml = skill_root / "agents" / "openai.yaml"
        frontmatter_ok = validate_frontmatter(skill_md)
        openai_ok = validate_openai_yaml(openai_yaml)
        status = frontmatter_ok and openai_ok
        all_valid = all_valid and status
        results[skill_dir] = {
            "skill_md": str(skill_md),
            "openai_yaml": str(openai_yaml),
            "frontmatter_ok": frontmatter_ok,
            "openai_yaml_ok": openai_ok,
            "status": "ready" if status else "needs_attention",
        }
    return {"all_valid": all_valid, "results": results}


def validate_frontmatter(skill_md: Path) -> bool:
    if not skill_md.exists():
        return False
    text = skill_md.read_text(encoding="utf-8")
    match = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
    if not match:
        return False
    frontmatter = match.group(1)
    return bool(re.search(r"^name:\s+[a-z0-9-]+$", frontmatter, re.MULTILINE)) and bool(
        re.search(r"^description:\s+.+$", frontmatter, re.MULTILINE)
    )


def validate_openai_yaml(path: Path) -> bool:
    if not path.exists():
        return False
    text = path.read_text(encoding="utf-8")
    required_patterns = [
        r"^interface:\s*$",
        r'^\s+display_name:\s+"?.+"?\s*$',
        r'^\s+short_description:\s+"?.+"?\s*$',
        r'^\s+default_prompt:\s+"?.+"?\s*$',
        r"^policy:\s*$",
        r"^\s+allow_implicit_invocation:\s+(true|false)\s*$",
    ]
    return all(re.search(pattern, text, re.MULTILINE) for pattern in required_patterns)


def find_cache_artifacts(root: Path) -> list[str]:
    artifacts: list[str] = []
    for path in root.rglob("*"):
        if "__pycache__" in path.parts or path.suffix in {".pyc", ".pyo"}:
            artifacts.append(str(path))
    return sorted(artifacts)


def find_forbidden_literals(root: Path) -> list[dict[str, str]]:
    matches: list[dict[str, str]] = []
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in {".py", ".md", ".json", ".yaml", ".yml", ".txt", ".csv"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            continue
        for pattern in FORBIDDEN_TEXT_PATTERNS:
            if re.search(pattern, text):
                matches.append({"path": str(path), "pattern": pattern})
    return matches


if __name__ == "__main__":
    main()
