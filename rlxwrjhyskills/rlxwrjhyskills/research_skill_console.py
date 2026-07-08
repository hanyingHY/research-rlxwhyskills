#!/usr/bin/env python3
"""Single-entry console for the research skill family."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True

from research_runtime import (
    format_portable_python_command,
    format_powershell_python_command,
    python_command,
    run_json,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Single-entry console for the research skill family")
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--profile", default="generic")
    parser.add_argument("--artifact-dir")
    parser.add_argument("--output")
    parser.add_argument("--format", choices=["json", "markdown"], default="json")
    args = parser.parse_args()

    skills_root = Path(__file__).resolve().parent
    state_script = skills_root / "assess_research_project_state.py"
    hub_recommend_script = skills_root / "research-skill-hub" / "scripts" / "recommend_local_skill.py"
    command = python_command(state_script, "--project-root", args.project_root, "--profile", args.profile)
    if args.artifact_dir:
        command.extend(["--artifact-dir", args.artifact_dir])
    state = run_json(command)
    hub_recommendation = run_json(python_command(hub_recommend_script, "--skills-root", skills_root, "--project-root", args.project_root, "--profile", args.profile))
    result = build_console_result(skills_root, Path(args.project_root).resolve(), args.profile, state, hub_recommendation)

    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        if args.format == "markdown":
            output.write_text(render_markdown(result), encoding="utf-8")
        else:
            output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(result, ensure_ascii=False, indent=2))


def build_console_result(skills_root: Path, project_root: Path, profile: str, state: dict, hub_recommendation: dict) -> dict:
    commands = {
        "family_export": format_powershell_python_command(skills_root / "export_research_skill_family.py", "--output-dir", project_root / "research_skill_family_export", "--overwrite"),
        "family_validate": format_powershell_python_command(skills_root / "validate_research_skill_family.py"),
        "family_quickstart": format_powershell_python_command(skills_root / "generate_research_skill_quickstart.py", "--project-root", project_root, "--profile", profile, "--output", project_root / "research_skill_quickstart.md", "--format", "markdown"),
        "family_project_prepare": format_powershell_python_command(skills_root / "prepare_research_project.py", "--project-root", project_root, "--profile", profile, "--overwrite-generated"),
        "project_state_assess": format_powershell_python_command(skills_root / "assess_research_project_state.py", "--project-root", project_root, "--profile", profile),
    }
    portable_templates = {
        "family_export": format_portable_python_command(skills_root / "export_research_skill_family.py", "--output-dir", project_root / "research_skill_family_export", "--overwrite"),
        "family_validate": format_portable_python_command(skills_root / "validate_research_skill_family.py"),
        "family_quickstart": format_portable_python_command(skills_root / "generate_research_skill_quickstart.py", "--project-root", project_root, "--profile", profile, "--output", project_root / "research_skill_quickstart.md", "--format", "markdown"),
        "family_project_prepare": format_portable_python_command(skills_root / "prepare_research_project.py", "--project-root", project_root, "--profile", profile, "--overwrite-generated"),
        "project_state_assess": format_portable_python_command(skills_root / "assess_research_project_state.py", "--project-root", project_root, "--profile", profile),
    }
    review_checkpoints: dict[str, str] = {}

    prompt = state.get("copy_paste_prompt")
    prompt_bundle = state.get("recommended_prompt_bundle")
    recommended_window_count = state.get("recommended_window_count", "not_applicable_yet")
    recommended_tool = state["recommended_tool"]
    recommended_track = state.get("recommended_track")
    use_full_pipeline = recommended_track == "full" or recommended_tool == "research-pipeline-full"

    if state["project_kind"] == "raw_project":
        if use_full_pipeline:
            commands["workspace_init"] = format_powershell_python_command(skills_root / "research-pipeline-full" / "scripts" / "init_research_program.py", "--root", project_root / "research_program", "--mode", "windowed-search", "--profile", profile, "--overwrite-generated")
            portable_templates["workspace_init"] = format_portable_python_command(skills_root / "research-pipeline-full" / "scripts" / "init_research_program.py", "--root", project_root / "research_program", "--mode", "windowed-search", "--profile", profile, "--overwrite-generated")
            commands["decision_surface_sync"] = format_powershell_python_command(skills_root / "research-pipeline-full" / "scripts" / "sync_decision_surfaces.py", "--workspace-root", project_root / "research_program", "--source-project-root", project_root, "--profile", profile, "--overwrite-generated")
            portable_templates["decision_surface_sync"] = format_portable_python_command(skills_root / "research-pipeline-full" / "scripts" / "sync_decision_surfaces.py", "--workspace-root", project_root / "research_program", "--source-project-root", project_root, "--profile", profile, "--overwrite-generated")
            commands["credibility_score"] = format_powershell_python_command(skills_root / "research-pipeline-full" / "scripts" / "score_research_credibility.py", "--input-json", "<CREDIBILITY_INPUT.json>")
            portable_templates["credibility_score"] = format_portable_python_command(skills_root / "research-pipeline-full" / "scripts" / "score_research_credibility.py", "--input-json", "<CREDIBILITY_INPUT.json>")
        else:
            commands["workspace_init"] = format_powershell_python_command(skills_root / "research-pipeline-lite" / "scripts" / "init_research_workspace.py", "--root", project_root / "research_lite")
            portable_templates["workspace_init"] = format_portable_python_command(skills_root / "research-pipeline-lite" / "scripts" / "init_research_workspace.py", "--root", project_root / "research_lite")
            commands["decision_surface_sync"] = format_powershell_python_command(skills_root / "research-pipeline-lite" / "scripts" / "sync_decision_surfaces.py", "--workspace-root", project_root / "research_lite", "--source-project-root", project_root, "--overwrite-generated")
            portable_templates["decision_surface_sync"] = format_portable_python_command(skills_root / "research-pipeline-lite" / "scripts" / "sync_decision_surfaces.py", "--workspace-root", project_root / "research_lite", "--source-project-root", project_root, "--overwrite-generated")
        if state.get("partial_full_workspace_detected") or state.get("partial_lite_workspace_detected"):
            review_checkpoints["partial_workspace_reentry_review"] = "Before reinitializing, review whether the partial workspace should be continued, repaired, or rebuilt while keeping the raw corpus."
            commands["partial_workspace_reentry_review"] = review_checkpoints["partial_workspace_reentry_review"]
    elif state["project_kind"] == "lite_workspace":
        commands["workspace_audit"] = format_powershell_python_command(skills_root / "research-pipeline-lite" / "scripts" / "assess_workspace_progress.py", "--workspace-root", project_root)
        portable_templates["workspace_audit"] = format_portable_python_command(skills_root / "research-pipeline-lite" / "scripts" / "assess_workspace_progress.py", "--workspace-root", project_root)
        commands["decision_surface_sync"] = format_powershell_python_command(skills_root / "research-pipeline-lite" / "scripts" / "sync_decision_surfaces.py", "--workspace-root", project_root, "--source-project-root", project_root, "--overwrite-generated")
        portable_templates["decision_surface_sync"] = format_portable_python_command(skills_root / "research-pipeline-lite" / "scripts" / "sync_decision_surfaces.py", "--workspace-root", project_root, "--source-project-root", project_root, "--overwrite-generated")
        review_checkpoints["reentry_decision_review"] = f"Review '{project_root / '03_output' / 'REENTRY_DECISION.md'}' with the user before assuming continue versus rebuild."
        review_checkpoints["focused_strengthening_review"] = f"Review '{project_root / '03_output' / 'FOCUSED_STRENGTHENING_SELECTION.md'}' and '{project_root / '03_output' / 'focused_strengthening_plan.csv'}' with the user before broadening strengthen mode."
        commands["reentry_decision_review"] = review_checkpoints["reentry_decision_review"]
        commands["focused_strengthening_review"] = review_checkpoints["focused_strengthening_review"]
    elif state["project_kind"] == "full_workspace":
        commands["workspace_audit"] = format_powershell_python_command(skills_root / "research-pipeline-full" / "scripts" / "assess_workspace_progress.py", "--workspace-root", project_root)
        portable_templates["workspace_audit"] = format_portable_python_command(skills_root / "research-pipeline-full" / "scripts" / "assess_workspace_progress.py", "--workspace-root", project_root)
        commands["decision_surface_sync"] = format_powershell_python_command(skills_root / "research-pipeline-full" / "scripts" / "sync_decision_surfaces.py", "--workspace-root", project_root, "--source-project-root", project_root, "--profile", profile, "--overwrite-generated")
        portable_templates["decision_surface_sync"] = format_portable_python_command(skills_root / "research-pipeline-full" / "scripts" / "sync_decision_surfaces.py", "--workspace-root", project_root, "--source-project-root", project_root, "--profile", profile, "--overwrite-generated")
        commands["credibility_score"] = format_powershell_python_command(skills_root / "research-pipeline-full" / "scripts" / "score_research_credibility.py", "--input-json", "<CREDIBILITY_INPUT.json>", "--output", project_root / "06_reports" / "credibility" / "credibility_report.json")
        portable_templates["credibility_score"] = format_portable_python_command(skills_root / "research-pipeline-full" / "scripts" / "score_research_credibility.py", "--input-json", "<CREDIBILITY_INPUT.json>", "--output", project_root / "06_reports" / "credibility" / "credibility_report.json")
        commands["prompt_pack_refresh"] = format_powershell_python_command(skills_root / "research-pipeline-full" / "scripts" / "generate_window_prompt_pack.py", "--root", project_root, "--profile", profile, "--overwrite")
        portable_templates["prompt_pack_refresh"] = format_portable_python_command(skills_root / "research-pipeline-full" / "scripts" / "generate_window_prompt_pack.py", "--root", project_root, "--profile", profile, "--overwrite")
        review_checkpoints["reentry_decision_review"] = f"Review '{project_root / '06_reports' / 'REENTRY_DECISION.md'}' with the user before assuming continue versus rebuild."
        review_checkpoints["focused_strengthening_review"] = f"Review '{project_root / '06_reports' / 'FOCUSED_STRENGTHENING_SELECTION.md'}' and '{project_root / '06_reports' / 'FOCUSED_STRENGTHENING_PLAN.csv'}' with the user before broadening strengthen mode."
        review_checkpoints["direction_selection_review"] = f"Review '{project_root / '06_reports' / 'DIRECTION_SELECTION.md'}' with the user before deep search proceeds."
        review_checkpoints["deep_dive_selection_review"] = f"Review '{project_root / '06_reports' / 'DEEP_DIVE_SELECTION.md'}' with the user before large deep-dive budgets are assigned."
        review_checkpoints["direction_depth_plan_review"] = f"Review '{project_root / '06_reports' / 'DIRECTION_DEPTH_PLAN.csv'}' with the user before large deep-dive budgets are assigned."
        commands["reentry_decision_review"] = review_checkpoints["reentry_decision_review"]
        commands["focused_strengthening_review"] = review_checkpoints["focused_strengthening_review"]
        commands["direction_selection_review"] = review_checkpoints["direction_selection_review"]
        commands["deep_dive_selection_review"] = review_checkpoints["deep_dive_selection_review"]
        commands["direction_depth_plan_review"] = review_checkpoints["direction_depth_plan_review"]

    return {
        "console_schema_version": 1,
        "project_root": str(project_root),
        "profile": profile,
        "runtime_python": sys.executable,
        "project_kind": state["project_kind"],
        "recommended_track": recommended_track,
        "recommended_tool": recommended_tool,
        "recommended_window_count": recommended_window_count,
        "summary": summarize_state(state),
        "credibility_overview": credibility_overview_from_state(state),
        "hub_recommendation": hub_recommendation,
        "primary_prompt": prompt,
        "primary_prompt_codex": state.get("copy_paste_prompt_codex"),
        "recommended_prompt_bundle": prompt_bundle,
        "recommended_commands": commands,
        "portable_command_templates": portable_templates,
        "review_checkpoints": review_checkpoints,
        "recommended_command_sequence": build_command_sequence(state["project_kind"], commands),
        "state_payload": state,
    }


def build_command_sequence(project_kind: str, commands: dict[str, str]) -> list[str]:
    preferred_order = [
        "family_validate",
        "project_state_assess",
        "family_quickstart",
        "family_project_prepare",
        "partial_workspace_reentry_review",
        "workspace_init",
        "decision_surface_sync",
        "workspace_audit",
        "reentry_decision_review",
        "focused_strengthening_review",
        "direction_selection_review",
        "deep_dive_selection_review",
        "direction_depth_plan_review",
        "credibility_score",
        "prompt_pack_refresh",
        "family_export",
    ]
    ordered = [key for key in preferred_order if key in commands]
    extras = [key for key in commands if key not in ordered]
    return ordered + extras


def summarize_state(state: dict) -> str:
    if state["project_kind"] == "raw_project":
        return f"Start with {state['recommended_tool']} in mode {state['recommended_start']} at confidence {state['confidence']}."
    return f"Current workspace status is {state['status']} with quality band {state['quality_band']}."


def credibility_overview_from_state(state: dict) -> dict:
    if state["project_kind"] != "full_workspace":
        return {"available": False}
    return {
        "available": True,
        "quality_score_100": state.get("quality_score_100"),
        "credibility_summary": state.get("credibility_summary"),
        "strongest_direction_credibility": state.get("strongest_direction_credibility"),
        "strongest_route_board_credibility": state.get("strongest_route_board_credibility"),
        "weakest_direction_credibility": state.get("weakest_direction_credibility"),
    }
def render_markdown(result: dict) -> str:
    commands = "\n".join(f"- {key}: `{value}`" for key, value in result["recommended_commands"].items())
    portable_templates = "\n".join(f"- {key}: `{value}`" for key, value in result.get("portable_command_templates", {}).items())
    review_checkpoints = "\n".join(f"- {key}: {value}" for key, value in result.get("review_checkpoints", {}).items()) or "- none"
    command_sequence = "\n".join(f"1. `{value}`" for value in result.get("recommended_command_sequence", [])) or "1. none"
    prompt_bundle = result.get("recommended_prompt_bundle") or ""
    primary_prompt = result.get("primary_prompt") or ""
    primary_prompt_codex = result.get("primary_prompt_codex") or ""
    return f"""# Research Skill Console

## Summary

- project_kind: `{result['project_kind']}`
- recommended_track: `{result.get('recommended_track')}`
- recommended_tool: `{result['recommended_tool']}`
- recommended_window_count: `{result['recommended_window_count']}`
- runtime_python: `{result['runtime_python']}`
- summary: {result['summary']}

## Credibility Overview

```json
{json.dumps(result['credibility_overview'], ensure_ascii=False, indent=2)}
```

## Hub Recommendation

```json
{json.dumps(result['hub_recommendation'], ensure_ascii=False, indent=2)}
```

## Direct Recommended Prompt

```text
{result['hub_recommendation'].get('direct_recommended_prompt', '')}
```

## Primary Prompt

```text
{primary_prompt}
```

## Primary Prompt For Codex

```text
{primary_prompt_codex}
```

## Recommended Command Sequence

{command_sequence}

## Recommended Commands

{commands}

## Portable Command Templates

{portable_templates}

## Review Checkpoints

{review_checkpoints}

## Recommended Prompt Bundle

````text
{prompt_bundle}
````
"""


if __name__ == "__main__":
    main()
