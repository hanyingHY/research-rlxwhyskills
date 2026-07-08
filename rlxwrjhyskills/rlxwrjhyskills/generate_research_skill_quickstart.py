#!/usr/bin/env python3
"""Generate a cross-agent quickstart pack for the research skill family."""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True

from research_runtime import python_command, run_command, run_json


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a quickstart prompt pack for the research skill family")
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--profile", default="generic")
    parser.add_argument("--output")
    parser.add_argument("--format", choices=["json", "markdown"], default="json")
    args = parser.parse_args()

    skills_root = Path(__file__).resolve().parent
    project_root = str(Path(args.project_root).resolve())

    result = build_quickstart_pack(skills_root, project_root, args.profile)

    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        if args.format == "markdown":
            output.write_text(render_markdown(result), encoding="utf-8")
        else:
            output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(result, ensure_ascii=False, indent=2))


def build_quickstart_pack(skills_root: Path, project_root: str, profile: str) -> dict:
    hub_prompt_script = skills_root / "research-skill-hub" / "scripts" / "build_skill_selection_prompt.py"
    route_script = skills_root / "route_research_skill_entry.py"
    full_entry_script = skills_root / "research-pipeline-full" / "scripts" / "generate_entry_prompts.py"
    lite_entry_script = skills_root / "research-pipeline-lite" / "scripts" / "generate_entry_prompts.py"

    route_payload = run_json(python_command(route_script, "--project-root", project_root, "--profile", profile))

    with tempfile.TemporaryDirectory(prefix="research_skill_quickstart_") as temp_dir:
        temp_root = Path(temp_dir)
        full_bundle_path = temp_root / "full_prompts.md"
        lite_bundle_path = temp_root / "lite_prompts.md"
        run_command(python_command(full_entry_script, "--output", full_bundle_path, "--project-root", project_root, "--profile", profile))
        run_command(python_command(lite_entry_script, "--output", lite_bundle_path, "--project-root", project_root))
        full_bundle = full_bundle_path.read_text(encoding="utf-8")
        lite_bundle = lite_bundle_path.read_text(encoding="utf-8")

    hub_universal = build_selection_prompt(hub_prompt_script, skills_root, "research-skill-hub", project_root, "universal")
    hub_codex = build_selection_prompt(hub_prompt_script, skills_root, "research-skill-hub", project_root, "codex")
    full_universal = build_selection_prompt(hub_prompt_script, skills_root, "research-pipeline-full", project_root, "universal")
    full_codex = build_selection_prompt(hub_prompt_script, skills_root, "research-pipeline-full", project_root, "codex")
    lite_universal = build_selection_prompt(hub_prompt_script, skills_root, "research-pipeline-lite", project_root, "universal")
    lite_codex = build_selection_prompt(hub_prompt_script, skills_root, "research-pipeline-lite", project_root, "codex")

    return {
        "schema_version": 1,
        "project_root": project_root,
        "profile": profile,
        "invocation_contract": "One task statement plus one reachable SKILL.md file address must be enough for a skill-capable agent to load and use the skill correctly.",
        "minimal_invocation_template": "Task: <TASK_STATEMENT>\nSkill file: <ABSOLUTE_PATH_TO_SKILL_MD>\nInstruction: Read that SKILL.md completely first, then follow its referenced local resources and bundled scripts before continuing the task.",
        "recommended_track": route_payload["recommended_track"],
        "recommended_skill": route_payload["recommended_skill"],
        "recommended_skill_file": str(skills_root / route_payload["recommended_skill"] / "SKILL.md"),
        "recommended_start": route_payload["recommended_start"],
        "recommended_window_count": route_payload["recommended_window_count"],
        "recommended_prompt": route_payload["copy_paste_prompt"],
        "recommended_prompt_codex": route_payload["copy_paste_prompt_codex"],
        "hub_prompts": {
            "universal": hub_universal,
            "codex": hub_codex,
        },
        "full_prompts": {
            "universal": full_universal,
            "codex": full_codex,
            "bundle": full_bundle,
        },
        "lite_prompts": {
            "universal": lite_universal,
            "codex": lite_codex,
            "bundle": lite_bundle,
        },
    }


def build_selection_prompt(script: Path, skills_root: Path, skill_name: str, project_root: str, style: str) -> str:
    payload = run_json([
        *python_command(
            script,
            "--skill-name",
            skill_name,
            "--skills-root",
            skills_root,
            "--project-root",
            project_root,
            "--style",
            style,
        )
    ])
    return payload["prompt"]


def render_markdown(result: dict) -> str:
    return f"""# Research Skill Quickstart

## Recommendation

- invocation_contract: {result['invocation_contract']}
- minimal_invocation_template:

```text
{result['minimal_invocation_template']}
```
- recommended_track: `{result['recommended_track']}`
- recommended_skill: `{result['recommended_skill']}`
- recommended_skill_file: `{result['recommended_skill_file']}`
- recommended_start: `{result['recommended_start']}`
- recommended_window_count: `{result['recommended_window_count']}`

## Recommended Prompt

```text
{result['recommended_prompt']}
```

## Recommended Prompt For Codex

```text
{result['recommended_prompt_codex']}
```

## Hub Prompt

```text
{result['hub_prompts']['universal']}
```

## Hub Prompt For Codex

```text
{result['hub_prompts']['codex']}
```

## Full Prompt

```text
{result['full_prompts']['universal']}
```

## Full Prompt For Codex

```text
{result['full_prompts']['codex']}
```

## Full Prompt Bundle

````text
{result['full_prompts']['bundle']}
````

## Lite Prompt

```text
{result['lite_prompts']['universal']}
```

## Lite Prompt For Codex

```text
{result['lite_prompts']['codex']}
```

## Lite Prompt Bundle

````text
{result['lite_prompts']['bundle']}
````
"""


if __name__ == "__main__":
    main()
