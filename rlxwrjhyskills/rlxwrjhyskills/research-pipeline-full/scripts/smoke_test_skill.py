#!/usr/bin/env python3
"""End-to-end smoke test for the research-pipeline-full skill."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True

from profiles import PROFILE_DEFS


def main() -> None:
    skill_root = Path(__file__).resolve().parents[1]
    tmp = Path(tempfile.mkdtemp(prefix="research_pipeline_full_smoke_"))

    init_script = skill_root / "scripts" / "init_research_program.py"
    start_mode_script = skill_root / "scripts" / "recommend_start_mode.py"
    progress_audit_script = skill_root / "scripts" / "assess_workspace_progress.py"
    decision_sync_script = skill_root / "scripts" / "sync_decision_surfaces.py"
    credibility_script = skill_root / "scripts" / "score_research_credibility.py"
    export_script = skill_root / "scripts" / "export_skill_bundle.py"
    entry_prompt_script = skill_root / "scripts" / "generate_entry_prompts.py"
    prompt_pack_script = skill_root / "scripts" / "generate_window_prompt_pack.py"
    local_validator = skill_root / "scripts" / "validate_skill_local.py"
    workspace_validator = skill_root / "scripts" / "validate_windowed_research_program.py"

    profiles = sorted(PROFILE_DEFS.keys())
    profile_runs = []
    for profile in profiles:
        profile_root = tmp / profile
        raw_project_root = tmp / f"{profile}_raw_project"
        raw_project_root.mkdir(parents=True, exist_ok=True)
        (raw_project_root / "notes.md").write_text("# Notes\n\nThis project has early-stage research notes and draft hypotheses.\n", encoding="utf-8")
        (raw_project_root / "search_results.csv").write_text("title,year\nexample,2026\n", encoding="utf-8")
        credibility_payload = tmp / f"{profile}_credibility_payload.json"
        credibility_payload.write_text(
            json.dumps(
                {
                    "label": "sample_retained_claim",
                    "direction": "direction_alpha",
                    "route_board": "stable",
                    "claim_scope": "signal",
                    "scores": {
                        "source_authority": 4,
                        "task_directness": 4,
                        "empirical_strength": 3,
                        "transfer_risk": 3,
                        "reproducibility_readiness": 4,
                        "contradiction_burden": 3,
                        "validation_readiness": 4
                    }
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        credibility_payload_2 = tmp / f"{profile}_credibility_payload_2.json"
        credibility_payload_2.write_text(
            json.dumps(
                {
                    "label": "sample_retained_claim_2",
                    "direction": "direction_beta",
                    "route_board": "aggressive",
                    "claim_scope": "routing",
                    "scores": {
                        "source_authority": 5,
                        "task_directness": 3,
                        "empirical_strength": 4,
                        "transfer_risk": 2,
                        "reproducibility_readiness": 4,
                        "contradiction_burden": 3,
                        "validation_readiness": 4
                    }
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        credibility_report = tmp / f"{profile}_credibility_report.md"
        launch_prompt_path = tmp / f"{profile}_full_launch_prompts.md"
        export_root = tmp / f"{profile}_full_export"
        audit_report_path = tmp / f"{profile}_full_progress_audit.md"
        steps = []
        steps.append(run_step([sys.executable, str(start_mode_script), "--project-root", str(raw_project_root), "--profile", profile], skill_root.parent))
        steps.append(run_step([sys.executable, str(credibility_script), "--input-json", str(credibility_payload), "--output", str(credibility_report), "--format", "markdown"], skill_root.parent))
        steps.append(run_step([sys.executable, str(init_script), "--root", str(profile_root), "--mode", "windowed-search", "--profile", profile, "--overwrite-generated"], skill_root.parent))
        steps.append(run_step([sys.executable, str(credibility_script), "--input-json", str(credibility_payload), "--output", str(profile_root / '06_reports' / 'credibility' / 'credibility_direction_alpha.json')], skill_root.parent))
        steps.append(run_step([sys.executable, str(credibility_script), "--input-json", str(credibility_payload_2), "--output", str(profile_root / '06_reports' / 'credibility' / 'credibility_direction_beta.json')], skill_root.parent))
        steps.append(run_step([sys.executable, str(entry_prompt_script), "--output", str(launch_prompt_path), "--project-root", str(profile_root), "--profile", profile], skill_root.parent))
        steps.append(run_step([sys.executable, str(export_script), "--output-dir", str(export_root), "--manifest-output", str(export_root / 'manifest.json'), "--overwrite"], skill_root.parent))
        steps.append(run_step([sys.executable, str(prompt_pack_script), "--root", str(profile_root), "--profile", profile, "--overwrite"], skill_root.parent))
        steps.append(run_step([sys.executable, str(decision_sync_script), "--workspace-root", str(profile_root), "--source-project-root", str(raw_project_root), "--profile", profile, "--overwrite-generated"], skill_root.parent))
        steps.append(run_step([sys.executable, str(local_validator), str(skill_root)], skill_root.parent))
        steps.append(run_step([sys.executable, str(workspace_validator), str(profile_root), profile], skill_root.parent))
        steps.append(run_step([sys.executable, str(progress_audit_script), "--workspace-root", str(profile_root), "--output", str(audit_report_path), "--format", "markdown"], skill_root.parent))
        auto_root = tmp / f"{profile}_autonomy"
        auto_audit_report_path = tmp / f"{profile}_autonomy_progress_audit.md"
        steps.append(run_step([sys.executable, str(init_script), "--root", str(auto_root), "--mode", "windowed-search", "--profile", profile, "--overwrite-generated", "--experimental-autonomy"], skill_root.parent))
        steps.append(run_step([sys.executable, str(workspace_validator), str(auto_root), profile], skill_root.parent))
        steps.append(run_step([sys.executable, str(progress_audit_script), "--workspace-root", str(auto_root), "--output", str(auto_audit_report_path), "--format", "markdown"], skill_root.parent))
        profile_runs.append({"profile": profile, "workspace_root": str(profile_root), "steps": steps, "status": "ready" if all(step["returncode"] == 0 for step in steps) else "needs_attention"})

    status = "ready" if all(item["status"] == "ready" for item in profile_runs) else "needs_attention"
    result = {
        "skill_root": str(skill_root),
        "workspace_root": str(tmp),
        "profile_runs": profile_runs,
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
