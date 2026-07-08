#!/usr/bin/env python3
"""End-to-end smoke test for research-pipeline-lite."""

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
    tmp = Path(tempfile.mkdtemp(prefix="research_pipeline_lite_smoke_"))

    init_script = skill_root / "scripts" / "init_research_workspace.py"
    entry_prompt_script = skill_root / "scripts" / "generate_entry_prompts.py"
    progress_audit_script = skill_root / "scripts" / "assess_workspace_progress.py"
    decision_sync_script = skill_root / "scripts" / "sync_decision_surfaces.py"
    export_script = skill_root / "scripts" / "export_skill_bundle.py"
    local_validator = skill_root / "scripts" / "validate_skill_local.py"
    validator_script = skill_root / "scripts" / "validate_research_workspace.py"
    launch_prompt_path = tmp / "lite_launch_prompts.md"
    export_root = tmp / "lite_export"
    audit_report_path = tmp / "lite_progress_audit.md"

    local_validate_step = run_step([sys.executable, str(local_validator), str(skill_root)], skill_root.parent)
    prompt_step = run_step([sys.executable, str(entry_prompt_script), "--output", str(launch_prompt_path), "--project-root", str(tmp)], skill_root.parent)
    export_step = run_step([sys.executable, str(export_script), "--output-dir", str(export_root), "--manifest-output", str(export_root / 'manifest.json'), "--overwrite"], skill_root.parent)
    init_step = run_step([sys.executable, str(init_script), "--root", str(tmp)], skill_root.parent)
    validate_step = run_step([sys.executable, str(validator_script), str(tmp)], skill_root.parent)
    progress_step = run_step([sys.executable, str(progress_audit_script), "--workspace-root", str(tmp), "--output", str(audit_report_path), "--format", "markdown"], skill_root.parent)
    sync_step = run_step([sys.executable, str(decision_sync_script), "--workspace-root", str(tmp), "--source-project-root", str(tmp), "--overwrite-generated"], skill_root.parent)

    status = "ready" if local_validate_step["returncode"] == 0 and prompt_step["returncode"] == 0 and export_step["returncode"] == 0 and init_step["returncode"] == 0 and validate_step["returncode"] == 0 and progress_step["returncode"] == 0 and sync_step["returncode"] == 0 else "needs_attention"
    result = {
        "skill_root": str(skill_root),
        "workspace_root": str(tmp),
        "steps": [local_validate_step, prompt_step, export_step, init_step, validate_step, progress_step, sync_step],
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


if __name__ == "__main__":
    main()
