#!/usr/bin/env python3
"""Prepare a research project end to end using the family-level skill toolchain."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True

from research_runtime import python_command, run_command, run_json


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare a project into a research workspace using the skill family")
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--profile", default="generic")
    parser.add_argument("--workspace-kind", choices=["auto", "full", "lite"], default="auto")
    parser.add_argument("--workspace-root")
    parser.add_argument("--quickstart-output")
    parser.add_argument("--output")
    parser.add_argument("--format", choices=["json", "markdown"], default="json")
    parser.add_argument("--overwrite-generated", action="store_true")
    args = parser.parse_args()

    skills_root = Path(__file__).resolve().parent
    project_root = Path(args.project_root).resolve()
    quickstart_output = Path(args.quickstart_output).resolve() if args.quickstart_output else project_root / "research_skill_quickstart.md"

    state_payload = run_json([
        *python_command(
            skills_root / "assess_research_project_state.py",
            "--project-root",
            project_root,
            "--profile",
            args.profile,
        )
    ])

    workspace_kind = resolve_workspace_kind(args.workspace_kind, state_payload)
    workspace_root = resolve_workspace_root(project_root, args.workspace_root, workspace_kind)

    run_command(
        python_command(
            skills_root / "generate_research_skill_quickstart.py",
            "--project-root",
            project_root,
            "--profile",
            args.profile,
            "--output",
            quickstart_output,
            "--format",
            "markdown",
        )
    )

    if workspace_kind == "full":
        prepare_full_workspace(skills_root, project_root, workspace_root, args.profile, args.overwrite_generated)
        validation_payload = run_json([
            *python_command(
                skills_root / "research-pipeline-full" / "scripts" / "validate_windowed_research_program.py",
                workspace_root,
                args.profile,
            )
        ])
        audit_payload = run_json([
            *python_command(
                skills_root / "research-pipeline-full" / "scripts" / "assess_workspace_progress.py",
                "--workspace-root",
                workspace_root,
            )
        ])
    else:
        prepare_lite_workspace(skills_root, project_root, workspace_root, args.overwrite_generated)
        validation_payload = run_json([
            *python_command(
                skills_root / "research-pipeline-lite" / "scripts" / "validate_research_workspace.py",
                workspace_root,
            )
        ])
        audit_payload = run_json([
            *python_command(
                skills_root / "research-pipeline-lite" / "scripts" / "assess_workspace_progress.py",
                "--workspace-root",
                workspace_root,
            )
        ])

    result = {
        "schema_version": 1,
        "project_root": str(project_root),
        "profile": args.profile,
        "workspace_kind": workspace_kind,
        "workspace_root": str(workspace_root),
        "quickstart_output": str(quickstart_output),
        "initial_state": state_payload,
        "validation": validation_payload,
        "audit": audit_payload,
        "status": "ready" if validation_payload.get("status") == "ready" else "needs_attention",
    }

    if args.output:
        output = Path(args.output).resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        if args.format == "markdown":
            output.write_text(render_markdown(result), encoding="utf-8")
        else:
            output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(result, ensure_ascii=False, indent=2))


def resolve_workspace_kind(requested: str, state_payload: dict) -> str:
    if requested == "full":
        return "full"
    if requested == "lite":
        return "lite"
    recommended_tool = state_payload.get("recommended_tool")
    return "full" if recommended_tool == "research-pipeline-full" else "lite"


def resolve_workspace_root(project_root: Path, workspace_root: str | None, workspace_kind: str) -> Path:
    if workspace_root:
        return Path(workspace_root).resolve()
    return project_root / ("research_program" if workspace_kind == "full" else "research_lite")


def prepare_full_workspace(skills_root: Path, project_root: Path, workspace_root: Path, profile: str, overwrite_generated: bool) -> None:
    command = [
        *python_command(
            skills_root / "research-pipeline-full" / "scripts" / "init_research_program.py",
            "--root",
            workspace_root,
            "--mode",
            "windowed-search",
            "--profile",
            profile,
        )
    ]
    if overwrite_generated:
        command.append("--overwrite-generated")
    run_command(command)

    sync_command = [
        *python_command(
            skills_root / "research-pipeline-full" / "scripts" / "sync_decision_surfaces.py",
            "--workspace-root",
            workspace_root,
            "--source-project-root",
            project_root,
            "--profile",
            profile,
        )
    ]
    if overwrite_generated:
        sync_command.append("--overwrite-generated")
    run_command(sync_command)


def prepare_lite_workspace(skills_root: Path, project_root: Path, workspace_root: Path, overwrite_generated: bool) -> None:
    run_command(
        python_command(
            skills_root / "research-pipeline-lite" / "scripts" / "init_research_workspace.py",
            "--root",
            workspace_root,
        )
    )

    sync_command = [
        *python_command(
            skills_root / "research-pipeline-lite" / "scripts" / "sync_decision_surfaces.py",
            "--workspace-root",
            workspace_root,
            "--source-project-root",
            project_root,
        )
    ]
    if overwrite_generated:
        sync_command.append("--overwrite-generated")
    run_command(sync_command)

def render_markdown(result: dict) -> str:
    return f"""# Research Project Preparation

## Summary

- workspace_kind: `{result['workspace_kind']}`
- workspace_root: `{result['workspace_root']}`
- quickstart_output: `{result['quickstart_output']}`
- status: `{result['status']}`

## Initial State

```json
{json.dumps(result['initial_state'], ensure_ascii=False, indent=2)}
```

## Validation

```json
{json.dumps(result['validation'], ensure_ascii=False, indent=2)}
```

## Audit

```json
{json.dumps(result['audit'], ensure_ascii=False, indent=2)}
```
"""


if __name__ == "__main__":
    main()
