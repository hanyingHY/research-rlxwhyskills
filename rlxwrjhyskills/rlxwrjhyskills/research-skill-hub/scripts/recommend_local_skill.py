#!/usr/bin/env python3
"""Recommend the best local research skill for a given project root."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from research_runtime import python_command, run_json


def main() -> None:
    parser = argparse.ArgumentParser(description="Recommend the best local research skill")
    parser.add_argument("--skills-root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--profile", default="generic")
    parser.add_argument("--output")
    parser.add_argument("--format", choices=["json", "markdown"], default="json")
    args = parser.parse_args()

    skills_root = Path(args.skills_root).resolve()
    state = run_json(
        python_command(
            skills_root / "assess_research_project_state.py",
            "--project-root",
            Path(args.project_root).resolve(),
            "--profile",
            args.profile,
        )
    )
    result = build_result(skills_root, state)

    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        if args.format == "markdown":
            output.write_text(render_markdown(result), encoding="utf-8")
        else:
            output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(result, ensure_ascii=False, indent=2))


def build_result(skills_root: Path, state: dict) -> dict:
    recommended = state["recommended_tool"]
    recommendation = {
        "recommended": {
            "skill_name": recommended,
            "reason": recommended_reason(state),
        },
        "alternatives": alternatives_for(state),
        "not_recommended_now": not_recommended_for(state),
    }
    return {
        "project_root": state["project_root"],
        "project_kind": state["project_kind"],
        "recommendation": recommendation,
        "selected_skill_file": str(skills_root / recommended / "SKILL.md") if recommended != "research-skill-hub" else str(skills_root / "research-skill-hub" / "SKILL.md"),
        "selection_prompt": f"Use the reusable skill described at {skills_root / 'research-skill-hub' / 'SKILL.md'}.\n\nProject root: {state['project_root']}\n\nA single task statement plus this SKILL.md address should be enough. Start by reading that SKILL.md completely, discover the local research skills, explain the differences, and then route into {recommended}.",
        "selection_prompt_codex": f"Use $research-skill-hub at {skills_root / 'research-skill-hub'} to inspect the local skills, then route into {recommended}.",
        "selection_prompt_minimal": f"Task: <TASK_STATEMENT>\nSkill file: {skills_root / 'research-skill-hub' / 'SKILL.md'}\nInstruction: Read that SKILL.md completely first, discover the local research skills, and route into {recommended}.",
        "direct_recommended_prompt": build_generic_handoff_prompt(skills_root, recommended, state["project_root"]),
    }


def recommended_reason(state: dict) -> str:
    if state["project_kind"] == "raw_project":
        return f"best match for starting posture `{state['recommended_start']}` with current confidence `{state['confidence']}`"
    return f"matches the current workspace kind `{state['project_kind']}` and status `{state['status']}`"


def alternatives_for(state: dict) -> list[dict]:
    if state["recommended_tool"] == "research-pipeline-lite":
        return [
            {"skill_name": "research-pipeline-full", "reason": "use it if the corpus grows, conflicts multiply, or validation planning becomes central"},
            {"skill_name": "research-skill-hub", "reason": "use it if the user still wants to browse and compare all local skills before committing"},
        ]
    if state["recommended_tool"] == "research-pipeline-full":
        return [
            {"skill_name": "research-pipeline-lite", "reason": "use it only when you deliberately want a smaller triage-first pass instead of a full program"},
            {"skill_name": "research-skill-hub", "reason": "use it if the user still wants discovery and explanation before committing"},
        ]
    return []


def not_recommended_for(state: dict) -> list[dict]:
    if state["project_kind"] == "full_workspace":
        return [
            {"skill_name": "research-pipeline-lite", "reason": "it would underfit a project that already has a full-workspace structure"},
            {"skill_name": "research-skill-hub", "reason": "the project has already moved past discovery and should stay inside the full workspace"},
        ]
    if state["project_kind"] == "lite_workspace":
        return [{"skill_name": "research-skill-hub", "reason": "discovery is already done; the project now needs execution inside the active workspace"}]
    return []


def build_generic_handoff_prompt(skills_root: Path, skill_name: str, project_root: str) -> str:
    skill_path = skills_root / skill_name / "SKILL.md"
    return (
        f"Use the reusable skill described at {skill_path}.\n\n"
        f"Project root: {project_root}\n\n"
        "A single task statement plus this SKILL.md address should be enough. Read that SKILL.md completely first, then follow its local resources and bundled scripts to continue the research task."
    )


def render_markdown(result: dict) -> str:
    alt_lines = "\n".join(f"1. `{item['skill_name']}`: {item['reason']}" for item in result["recommendation"]["alternatives"]) or "1. none"
    not_lines = "\n".join(f"1. `{item['skill_name']}`: {item['reason']}" for item in result["recommendation"]["not_recommended_now"]) or "1. none"
    return f"""# Skill Recommendation

## Recommended

- skill: `{result['recommendation']['recommended']['skill_name']}`
- reason: {result['recommendation']['recommended']['reason']}

## Alternatives

{alt_lines}

## Not Recommended Now

{not_lines}

## Selection Prompt

```text
{result['selection_prompt']}
```

## Minimal Selection Prompt

```text
{result['selection_prompt_minimal']}
```

## Selection Prompt For Codex

```text
{result.get('selection_prompt_codex', '')}
```

## Direct Recommended Prompt

```text
{result['direct_recommended_prompt']}
```
"""


if __name__ == "__main__":
    main()
