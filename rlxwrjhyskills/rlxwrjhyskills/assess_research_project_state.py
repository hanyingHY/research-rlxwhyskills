#!/usr/bin/env python3
"""Assess any research project root and route to the correct family-level interpretation."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True

from research_runtime import python_command, run_json


def main() -> None:
    parser = argparse.ArgumentParser(description="Assess a research project root and route it to the correct research-skill interpretation")
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--profile", default="generic")
    parser.add_argument("--artifact-dir")
    parser.add_argument("--output")
    parser.add_argument("--format", choices=["json", "markdown"], default="json")
    args = parser.parse_args()

    skills_root = Path(__file__).resolve().parent
    project_root = Path(args.project_root).resolve()
    markers = detect_markers(project_root)

    if markers["has_full_workspace_markers"]:
        result = assess_full_workspace(skills_root, project_root)
    elif markers["has_lite_workspace_markers"]:
        result = assess_lite_workspace(skills_root, project_root)
    else:
        result = assess_raw_project(skills_root, project_root, args.profile, args.artifact_dir)

    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        if args.format == "markdown":
            output.write_text(render_markdown(result), encoding="utf-8")
        else:
            output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(result, ensure_ascii=False, indent=2))


def detect_markers(project_root: Path) -> dict:
    full_markers = ["00_protocol", "01_window_runs", "05_master_tables", "06_reports"]
    lite_markers = ["00_raw", "01_index", "02_retained", "03_output"]
    full_present = [item for item in full_markers if (project_root / item).exists()]
    lite_present = [item for item in lite_markers if (project_root / item).exists()]
    return {
        "has_full_workspace_markers": all((project_root / item).exists() for item in ["00_protocol", "01_window_runs", "05_master_tables"]),
        "has_lite_workspace_markers": all((project_root / item).exists() for item in ["00_raw", "01_index", "03_output"]),
        "partial_full_workspace_detected": len(full_present) >= 2 and len(full_present) < len(full_markers),
        "partial_lite_workspace_detected": len(lite_present) >= 2 and len(lite_present) < len(lite_markers),
        "partial_full_markers_present": full_present,
        "partial_lite_markers_present": lite_present,
    }


def assess_full_workspace(skills_root: Path, project_root: Path) -> dict:
    audit_script = skills_root / "research-pipeline-full" / "scripts" / "assess_workspace_progress.py"
    audit = run_json(python_command(audit_script, "--workspace-root", project_root))
    return {
        "project_root": str(project_root),
        "project_kind": "full_workspace",
        "recommended_tool": "research-pipeline-full",
        "status": audit["status"],
        "quality_score_100": audit["quality_score_100"],
        "quality_band": audit["quality_band"],
        "critical_blocker_count": audit["critical_blocker_count"],
        "credibility_summary": audit["credibility_summary"],
        "strongest_direction_credibility": audit["strongest_direction_credibility"],
        "strongest_route_board_credibility": audit["strongest_route_board_credibility"],
        "weakest_direction_credibility": audit["weakest_direction_credibility"],
        "reentry_decision_path": str(project_root / "06_reports" / "REENTRY_DECISION.md"),
        "focused_strengthening_selection_path": str(project_root / "06_reports" / "FOCUSED_STRENGTHENING_SELECTION.md"),
        "focused_strengthening_plan_path": str(project_root / "06_reports" / "FOCUSED_STRENGTHENING_PLAN.csv"),
        "direction_selection_path": str(project_root / "06_reports" / "DIRECTION_SELECTION.md"),
        "deep_dive_selection_path": str(project_root / "06_reports" / "DEEP_DIVE_SELECTION.md"),
        "direction_depth_plan_path": str(project_root / "06_reports" / "DIRECTION_DEPTH_PLAN.csv"),
        "recommended_next_action": audit["recommended_next_action"],
        "blockers": audit["blockers"],
        "strengths": audit["strengths"],
    }


def assess_lite_workspace(skills_root: Path, project_root: Path) -> dict:
    audit_script = skills_root / "research-pipeline-lite" / "scripts" / "assess_workspace_progress.py"
    audit = run_json(python_command(audit_script, "--workspace-root", project_root))
    return {
        "project_root": str(project_root),
        "project_kind": "lite_workspace",
        "recommended_tool": "research-pipeline-lite",
        "status": audit["status"],
        "quality_score_100": audit["quality_score_100"],
        "quality_band": audit["quality_band"],
        "critical_blocker_count": audit["critical_blocker_count"],
        "escalation_candidate": audit["escalation_candidate"],
        "reentry_decision_path": str(project_root / "03_output" / "REENTRY_DECISION.md"),
        "focused_strengthening_selection_path": str(project_root / "03_output" / "FOCUSED_STRENGTHENING_SELECTION.md"),
        "focused_strengthening_plan_path": str(project_root / "03_output" / "focused_strengthening_plan.csv"),
        "recommended_next_action": audit["recommended_next_action"],
        "blockers": audit["blockers"],
        "strengths": audit["strengths"],
    }


def assess_raw_project(skills_root: Path, project_root: Path, profile: str, artifact_dir: str | None) -> dict:
    route_script = skills_root / "route_research_skill_entry.py"
    markers = detect_markers(project_root)
    command = python_command(route_script, "--project-root", project_root, "--profile", profile)
    if artifact_dir:
        command.extend(["--artifact-dir", artifact_dir])
    route = run_json(command)
    return {
        "project_root": str(project_root),
        "project_kind": "raw_project",
        "recommended_tool": route["recommended_skill"],
        "recommended_track": route["recommended_track"],
        "recommended_start": route["recommended_start"],
        "confidence": route["confidence"],
        "recommended_window_count": route["recommended_window_count"],
        "copy_paste_prompt": route["copy_paste_prompt"],
        "copy_paste_prompt_codex": route["copy_paste_prompt_codex"],
        "recommended_prompt_bundle": route["full_entry_prompt"] if route["recommended_track"] == "full" else route["lite_entry_prompt"],
        "reasons": route["reasons"],
        "partial_full_workspace_detected": markers["partial_full_workspace_detected"],
        "partial_lite_workspace_detected": markers["partial_lite_workspace_detected"],
        "partial_full_markers_present": markers["partial_full_markers_present"],
        "partial_lite_markers_present": markers["partial_lite_markers_present"],
        "artifact_dir": route["artifact_dir"],
    }

def render_markdown(result: dict) -> str:
    if result["project_kind"] == "raw_project":
        reasons = "\n".join(f"{idx}. {item}" for idx, item in enumerate(result["reasons"], start=1))
        return f"""# Research Project State

## Classification

- project_kind: `{result['project_kind']}`
- recommended_tool: `{result['recommended_tool']}`
- recommended_start: `{result['recommended_start']}`
- confidence: `{result['confidence']}`

## Reasons

{reasons}

## Primary Prompt

```text
{result['copy_paste_prompt']}
```

## Primary Prompt For Codex

```text
{result.get('copy_paste_prompt_codex', '')}
```
"""

    blockers = "\n".join(f"{idx}. {item}" for idx, item in enumerate(result["blockers"], start=1)) or "1. none"
    strengths = "\n".join(f"{idx}. {item}" for idx, item in enumerate(result["strengths"], start=1)) or "1. none"
    extra = f"- escalation_candidate: `{result['escalation_candidate']}`\n" if "escalation_candidate" in result else ""
    return f"""# Research Project State

## Classification

- project_kind: `{result['project_kind']}`
- recommended_tool: `{result['recommended_tool']}`
- status: `{result['status']}`
- quality_score_100: `{result['quality_score_100']}`
- quality_band: `{result['quality_band']}`
- critical_blocker_count: `{result['critical_blocker_count']}`
{extra}
## Credibility Summary

```json
{json.dumps(result.get('credibility_summary', {}), ensure_ascii=False, indent=2)}
```

## Blockers

{blockers}

## Strengths

{strengths}

## Recommended Next Action

{result['recommended_next_action']}
"""


if __name__ == "__main__":
    main()
