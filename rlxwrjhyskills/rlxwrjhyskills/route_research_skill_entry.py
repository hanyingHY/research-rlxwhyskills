#!/usr/bin/env python3
"""Route a new project into the best research-skill entry path."""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True

from research_runtime import python_command, run_command, run_json


def main() -> None:
    parser = argparse.ArgumentParser(description="Route a project into the best research-skill entry path")
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--profile", default="generic")
    parser.add_argument("--output")
    parser.add_argument("--artifact-dir")
    args = parser.parse_args()

    skills_root = Path(__file__).resolve().parent
    full_skill_root = skills_root / "research-pipeline-full"
    lite_skill_root = skills_root / "research-pipeline-lite"
    start_mode_script = full_skill_root / "scripts" / "recommend_start_mode.py"
    full_entry_script = full_skill_root / "scripts" / "generate_entry_prompts.py"
    lite_entry_script = lite_skill_root / "scripts" / "generate_entry_prompts.py"

    start_mode = run_json(python_command(start_mode_script, "--project-root", args.project_root, "--profile", args.profile))

    if args.artifact_dir:
        artifact_dir = Path(args.artifact_dir).resolve()
        artifact_dir.mkdir(parents=True, exist_ok=True)
        full_prompt_path = artifact_dir / "full_entry_prompts.md"
        lite_prompt_path = artifact_dir / "lite_entry_prompts.md"
        run_command(python_command(full_entry_script, "--output", full_prompt_path, "--project-root", args.project_root, "--profile", args.profile))
        run_command(python_command(lite_entry_script, "--output", lite_prompt_path, "--project-root", args.project_root))
        full_prompt_text = full_prompt_path.read_text(encoding="utf-8")
        lite_prompt_text = lite_prompt_path.read_text(encoding="utf-8")
        artifact_dir_value = str(artifact_dir)
    else:
        with tempfile.TemporaryDirectory(prefix="research_skill_route_") as temp_dir:
            temp_root = Path(temp_dir)
            full_prompt_path = temp_root / "full_entry_prompts.md"
            lite_prompt_path = temp_root / "lite_entry_prompts.md"
            run_command(python_command(full_entry_script, "--output", full_prompt_path, "--project-root", args.project_root, "--profile", args.profile))
            run_command(python_command(lite_entry_script, "--output", lite_prompt_path, "--project-root", args.project_root))
            full_prompt_text = full_prompt_path.read_text(encoding="utf-8")
            lite_prompt_text = lite_prompt_path.read_text(encoding="utf-8")
        artifact_dir_value = None

    result = {
        "project_root": str(Path(args.project_root).resolve()),
        "profile": args.profile,
        "recommended_track": start_mode["recommended_track"],
        "recommended_skill": resolve_skill_name(start_mode["recommended_track"]),
        "recommended_start": start_mode["recommended_start"],
        "confidence": start_mode["confidence"],
        "recommended_window_count": start_mode["recommended_window_count"],
        "reasons": start_mode["reasons"],
        "copy_paste_prompt": build_universal_prompt(skills_root, resolve_skill_name(start_mode["recommended_track"]), args.project_root, args.profile),
        "copy_paste_prompt_codex": build_codex_prompt(skills_root, resolve_skill_name(start_mode["recommended_track"]), args.project_root, args.profile),
        "artifact_dir": artifact_dir_value,
        "full_entry_prompt_path": str(full_prompt_path) if artifact_dir_value else None,
        "lite_entry_prompt_path": str(lite_prompt_path) if artifact_dir_value else None,
        "full_entry_prompt": full_prompt_text,
        "lite_entry_prompt": lite_prompt_text,
    }

    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(render_markdown(result), encoding="utf-8")

    print(json.dumps(result, ensure_ascii=False, indent=2))

def resolve_skill_name(track: str) -> str:
    if track == "full":
        return "research-pipeline-full"
    if track == "lite":
        return "research-pipeline-lite"
    return track


def build_universal_prompt(skills_root: Path, skill_name: str, project_root: str, profile: str) -> str:
    skill_path = skills_root / skill_name / "SKILL.md"
    profile_line = f"Active profile: {profile}\n" if skill_name == "research-pipeline-full" else ""
    extra_rule = (
        "If the workspace already exists and is only partly complete, ask whether to continue, repair, or rebuild generated scaffold artifacts before proceeding. If the user chooses strengthen mode, ask what specific directions, datasets, papers, or claim bundles should be reinforced first."
        if skill_name == "research-pipeline-full"
        else "If the workspace already exists and is only partly complete, ask whether to continue, repair, or rebuild generated scaffold artifacts before proceeding. If the user chooses strengthen mode, ask what specific directions, datasets, papers, or claim bundles should be reinforced first."
    )
    return (
        f"Use the reusable skill described at {skill_path}.\n\n"
        f"Project root: {Path(project_root).resolve()}\n"
        f"{profile_line}\n"
        f"A single task statement plus this SKILL.md address should be enough. Read that SKILL.md completely first. Then read every local reference it requires, use its bundled scripts when they fit the task, keep phase changes user-visible, and continue in a way that remains compatible with non-Codex AI environments. {extra_rule}"
    )


def build_codex_prompt(skills_root: Path, skill_name: str, project_root: str, profile: str) -> str:
    skill_path = skills_root / skill_name / "SKILL.md"
    profile_line = f"Active profile: {profile}\n" if skill_name == "research-pipeline-full" else ""
    return (
        f"Use ${skill_name} at {skill_path} for this research project.\n\n"
        f"Project root: {Path(project_root).resolve()}\n"
        f"{profile_line}\n"
        "Continue by following the selected skill directly and keep its workflow, gate rules, and output contract intact."
    )


def render_markdown(result: dict) -> str:
    reasons = "\n".join(f"{idx}. {item}" for idx, item in enumerate(result["reasons"], start=1))
    return f"""# Research Skill Entry Routing

## Recommendation

- track: `{result['recommended_track']}`
- skill: `{result['recommended_skill']}`
- start: `{result['recommended_start']}`
- confidence: `{result['confidence']}`
- recommended_window_count: `{result['recommended_window_count']}`

## Reasons

{reasons}

## Primary Copy-Paste Prompt

```text
{result['copy_paste_prompt']}
```

## Primary Copy-Paste Prompt For Codex

```text
{result['copy_paste_prompt_codex']}
```

## Supporting Prompt Bundles

- artifact_dir: `{result['artifact_dir']}`

## Recommended Prompt Bundle

````text
{result['full_entry_prompt'] if result['recommended_track'] == 'full' else result['lite_entry_prompt']}
````
"""


if __name__ == "__main__":
    main()
