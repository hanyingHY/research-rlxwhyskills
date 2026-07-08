#!/usr/bin/env python3
"""Smoke test for research-skill-hub."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True


def main() -> None:
    skill_root = Path(__file__).resolve().parents[1]
    skills_root = skill_root.parent
    tmp = Path(tempfile.mkdtemp(prefix="research_skill_hub_smoke_"))

    validate_script = skill_root / "scripts" / "validate_skill_local.py"
    discover_script = skill_root / "scripts" / "discover_local_skills.py"
    recommend_script = skill_root / "scripts" / "recommend_local_skill.py"
    select_script = skill_root / "scripts" / "build_skill_selection_prompt.py"

    raw_project = tmp / "raw_project"
    raw_project.mkdir(parents=True, exist_ok=True)
    (raw_project / "notes.md").write_text("# Notes\n\nEarly research notes.\n", encoding="utf-8")

    discover_report = tmp / "discover.md"
    recommend_report = tmp / "recommend.md"
    select_report = tmp / "select.md"

    steps = [
        run_step([sys.executable, str(validate_script), str(skill_root)], skills_root),
        run_step([sys.executable, str(discover_script), "--skills-root", str(skills_root), "--output", str(discover_report), "--format", "markdown"], skills_root),
        run_step([sys.executable, str(recommend_script), "--skills-root", str(skills_root), "--project-root", str(raw_project), "--output", str(recommend_report), "--format", "markdown"], skills_root),
        run_step([sys.executable, str(select_script), "--skill-name", "research-pipeline-lite", "--skills-root", str(skills_root), "--project-root", str(raw_project), "--output", str(select_report), "--format", "markdown"], skills_root),
    ]

    discover_payload = parse_json_stdout(steps[1])
    recommend_payload = parse_json_stdout(steps[2])
    content_checks = {
        "discover_display_names_ok": [item.get("display_name") for item in discover_payload.get("skills", [])] == ["Research Pipeline Full", "Research Pipeline Lite", "Research Skill Hub"],
        "recommend_selected_skill_file_ok": recommend_payload.get("selected_skill_file", "").endswith("research-pipeline-lite\\SKILL.md"),
        "recommend_minimal_prompt_ok": "Skill file:" in recommend_payload.get("selection_prompt_minimal", ""),
    }

    status = "ready" if all(step["returncode"] == 0 for step in steps) and all(content_checks.values()) else "needs_attention"
    result = {
        "skill_root": str(skill_root),
        "workspace_root": str(tmp),
        "steps": steps,
        "content_checks": content_checks,
        "status": status,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if status == "ready" else 1)


def run_step(command: list[str], cwd: Path) -> dict:
    completed = subprocess.run(command, cwd=cwd, capture_output=True, text=True, encoding="utf-8", env=child_env())
    return {
        "command": command,
        "returncode": completed.returncode,
        "stdout": completed.stdout.strip(),
        "stderr": completed.stderr.strip(),
    }


def child_env() -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    return env


def parse_json_stdout(step: dict) -> dict:
    try:
        return json.loads(step.get("stdout") or "{}")
    except json.JSONDecodeError:
        return {}


if __name__ == "__main__":
    main()
