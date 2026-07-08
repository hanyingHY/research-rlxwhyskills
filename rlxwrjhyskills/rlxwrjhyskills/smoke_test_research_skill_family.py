#!/usr/bin/env python3
"""Smoke test the top-level research skill family helpers."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True

from research_runtime import python_command, run_command


def main() -> None:
    skills_root = Path(__file__).resolve().parent
    tmp = Path(tempfile.mkdtemp(prefix="research_skill_family_smoke_"))

    validate_script = skills_root / "validate_research_skill_family.py"
    export_script = skills_root / "export_research_skill_family.py"
    route_script = skills_root / "route_research_skill_entry.py"
    state_script = skills_root / "assess_research_project_state.py"
    console_script = skills_root / "research_skill_console.py"
    quickstart_script = skills_root / "generate_research_skill_quickstart.py"
    prompt_from_path_script = skills_root / "build_research_skill_prompt.py"
    prepare_project_script = skills_root / "prepare_research_project.py"
    hub_discover_script = skills_root / "research-skill-hub" / "scripts" / "discover_local_skills.py"
    hub_recommend_script = skills_root / "research-skill-hub" / "scripts" / "recommend_local_skill.py"
    hub_select_script = skills_root / "research-skill-hub" / "scripts" / "build_skill_selection_prompt.py"
    hub_validate_script = skills_root / "research-skill-hub" / "scripts" / "validate_skill_local.py"
    hub_smoke_script = skills_root / "research-skill-hub" / "scripts" / "smoke_test_skill.py"
    full_init_script = skills_root / "research-pipeline-full" / "scripts" / "init_research_program.py"
    lite_init_script = skills_root / "research-pipeline-lite" / "scripts" / "init_research_workspace.py"

    raw_project = tmp / "raw_project"
    raw_project.mkdir(parents=True, exist_ok=True)
    (raw_project / "notes.md").write_text("# Notes\n\nEarly research notes.\n", encoding="utf-8")
    (raw_project / "sources.csv").write_text("title,year\nexample,2026\n", encoding="utf-8")
    raw_large_project = tmp / "raw_large_project"
    raw_large_project.mkdir(parents=True, exist_ok=True)
    for idx in range(45):
        (raw_large_project / f"research_note_{idx:02d}.md").write_text(f"# Research Note {idx}\n\nLarge-corpus placeholder content.\n", encoding="utf-8")
    for idx in range(25):
        (raw_large_project / f"data_export_v{idx}.csv").write_text("col_a,col_b\n1,2\n", encoding="utf-8")
    for idx in range(8):
        (raw_large_project / f"draft_model_v{idx}.py").write_text("print('placeholder')\n", encoding="utf-8")
    full_workspace = tmp / "full_workspace"
    lite_workspace = tmp / "lite_workspace"

    export_root = tmp / "family_export"
    bundle_name = "research-skill-family-renamed"
    route_report = tmp / "route_report.md"
    route_artifacts = tmp / "route_artifacts"
    state_report_raw = tmp / "state_raw.md"
    state_report_raw_large = tmp / "state_raw_large.md"
    state_report_lite = tmp / "state_lite.md"
    state_report_full = tmp / "state_full.md"
    console_report_raw = tmp / "console_raw.md"
    console_report_raw_large = tmp / "console_raw_large.md"
    quickstart_report_raw_large = tmp / "quickstart_raw_large.md"
    prompt_from_path_report = tmp / "prompt_from_path.md"
    prepared_workspace_report = tmp / "prepared_workspace.md"
    hub_discover_report = tmp / "hub_discover.md"
    hub_recommend_report = tmp / "hub_recommend.md"
    hub_select_report = tmp / "hub_select.md"
    hub_select_path_only_report = tmp / "hub_select_path_only.md"

    steps = [
        run_step(python_command(validate_script), skills_root),
        run_step(python_command(hub_validate_script, skills_root / 'research-skill-hub'), skills_root),
        run_step(python_command(hub_smoke_script), skills_root),
        run_step(python_command(hub_discover_script, "--skills-root", skills_root, "--output", hub_discover_report, "--format", "markdown"), skills_root),
        run_step(python_command(hub_recommend_script, "--skills-root", skills_root, "--project-root", raw_project, "--output", hub_recommend_report, "--format", "markdown"), skills_root),
        run_step(python_command(hub_select_script, "--skill-name", "research-pipeline-lite", "--skills-root", skills_root, "--project-root", raw_project, "--output", hub_select_report, "--format", "markdown"), skills_root),
        run_step(python_command(hub_select_script, "--skill-path", skills_root / 'research-pipeline-full' / 'SKILL.md', "--project-root", raw_large_project, "--style", "universal", "--output", hub_select_path_only_report, "--format", "markdown"), skills_root),
        run_step(python_command(export_script, "--output-dir", export_root, "--bundle-name", bundle_name, "--manifest-output", export_root / "manifest.json", "--overwrite"), skills_root),
        run_step(python_command(export_root / bundle_name / 'validate_research_skill_family.py'), export_root / bundle_name),
        run_step(python_command(route_script, "--project-root", raw_project, "--output", route_report, "--artifact-dir", route_artifacts), skills_root),
        run_step(python_command(state_script, "--project-root", raw_project, "--output", state_report_raw, "--format", "markdown", "--artifact-dir", route_artifacts), skills_root),
        run_step(python_command(console_script, "--project-root", raw_project, "--output", console_report_raw, "--format", "markdown", "--artifact-dir", route_artifacts), skills_root),
        run_step(python_command(state_script, "--project-root", raw_large_project, "--output", state_report_raw_large, "--format", "markdown"), skills_root),
        run_step(python_command(console_script, "--project-root", raw_large_project, "--output", console_report_raw_large, "--format", "markdown"), skills_root),
        run_step(python_command(quickstart_script, "--project-root", raw_large_project, "--output", quickstart_report_raw_large, "--format", "markdown"), skills_root),
        run_step(python_command(prompt_from_path_script, "--skill-path", skills_root / 'research-pipeline-full' / 'SKILL.md', "--project-root", raw_large_project, "--style", "universal", "--output", prompt_from_path_report, "--format", "markdown"), skills_root),
        run_step(python_command(prepare_project_script, "--project-root", raw_large_project, "--profile", "generic", "--output", prepared_workspace_report, "--format", "markdown", "--overwrite-generated"), skills_root),
        run_step(python_command(lite_init_script, "--root", lite_workspace), skills_root),
        run_step(python_command(state_script, "--project-root", lite_workspace, "--output", state_report_lite, "--format", "markdown"), skills_root),
        run_step(python_command(full_init_script, "--root", full_workspace, "--mode", "windowed-search", "--profile", "generic", "--overwrite-generated"), skills_root),
        run_step(python_command(state_script, "--project-root", full_workspace, "--output", state_report_full, "--format", "markdown"), skills_root),
    ]

    raw_console_payload = parse_json_stdout(steps[11])
    raw_large_state_payload = parse_json_stdout(steps[12])
    raw_large_console_payload = parse_json_stdout(steps[13])
    raw_large_quickstart_payload = parse_json_stdout(steps[14])
    prompt_from_path_payload = parse_json_stdout(steps[15])
    prepared_workspace_payload = parse_json_stdout(steps[16])
    path_only_payload = parse_json_stdout(steps[6])
    hub_discover_payload = parse_json_stdout(steps[3])
    hub_recommend_payload = parse_json_stdout(steps[4])
    content_checks = {
        "raw_small_routes_lite": raw_console_payload.get("recommended_tool") == "research-pipeline-lite",
        "raw_large_routes_full": raw_large_state_payload.get("recommended_tool") == "research-pipeline-full",
        "raw_large_console_full_init": "init_research_program.py" in json.dumps(raw_large_console_payload, ensure_ascii=False),
        "raw_large_quickstart_full": raw_large_quickstart_payload.get("recommended_skill") == "research-pipeline-full",
        "path_only_prompt_works": path_only_payload.get("skill_name") == "research-pipeline-full" and "A single task statement plus this SKILL.md address should be enough." in path_only_payload.get("prompt", ""),
        "top_level_prompt_builder_works": prompt_from_path_payload.get("skill_name") == "research-pipeline-full" and prompt_from_path_payload.get("invocation_contract", "").startswith("One task statement plus one reachable SKILL.md file address"),
        "project_prepare_works": prepared_workspace_payload.get("workspace_kind") == "full" and prepared_workspace_payload.get("status") == "ready",
        "hub_discover_display_names_ok": [item.get("display_name") for item in hub_discover_payload.get("skills", [])] == ["Research Pipeline Full", "Research Pipeline Lite", "Research Skill Hub"],
        "hub_recommend_selected_skill_file_ok": hub_recommend_payload.get("selected_skill_file", "").endswith("research-pipeline-lite\\SKILL.md"),
        "hub_recommend_minimal_prompt_ok": "Skill file:" in hub_recommend_payload.get("selection_prompt_minimal", ""),
        "quickstart_recommended_skill_file_ok": raw_large_quickstart_payload.get("recommended_skill_file", "").endswith("research-pipeline-full\\SKILL.md"),
        "console_portable_templates_use_dash_b": all(str(value).startswith('python "-B"') for value in raw_large_console_payload.get("portable_command_templates", {}).values()),
        "console_powershell_commands_use_dash_b": "'-B'" in json.dumps(raw_large_console_payload.get("recommended_commands", {}), ensure_ascii=False),
    }

    status = "ready" if all(step["returncode"] == 0 for step in steps) and all(content_checks.values()) else "needs_attention"
    result = {
        "skills_root": str(skills_root),
        "workspace_root": str(tmp),
        "steps": steps,
        "content_checks": content_checks,
        "status": status,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if status == "ready" else 1)


def run_step(command: list[str], cwd: Path) -> dict:
    try:
        completed = run_command(command, cwd=cwd, check=False)
        return {
            "command": command,
            "returncode": completed.returncode,
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
        }
    except Exception as exc:
        return {
            "command": command,
            "returncode": -1,
            "stdout": "",
            "stderr": f"{type(exc).__name__}: {exc}",
        }


def parse_json_stdout(step: dict) -> dict:
    try:
        return json.loads(step.get("stdout") or "{}")
    except json.JSONDecodeError:
        return {}


if __name__ == "__main__":
    main()
