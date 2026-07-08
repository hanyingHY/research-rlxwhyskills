#!/usr/bin/env python3
"""Build a direct handoff prompt into a chosen local skill."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a direct prompt into a selected local skill")
    parser.add_argument("--skill-name")
    parser.add_argument("--skill-path")
    parser.add_argument("--skills-root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--style", choices=["generic", "universal", "codex"], default="generic")
    parser.add_argument("--output")
    parser.add_argument("--format", choices=["json", "markdown"], default="json")
    args = parser.parse_args()

    if not args.skill_name and not args.skill_path:
        raise ValueError("Provide --skill-name or --skill-path")

    skill_path = Path(args.skill_path).resolve() if args.skill_path else resolve_skill_path(Path(args.skills_root).resolve(), args.skill_name)
    skill_name = args.skill_name or infer_skill_name(skill_path)

    result = {
        "skill_name": skill_name,
        "skill_path": str(skill_path),
        "style": args.style,
        "project_root": args.project_root,
        "prompt": build_prompt(skill_name, str(skill_path), args.project_root, args.style),
    }

    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        if args.format == "markdown":
            output.write_text(render_markdown(result), encoding="utf-8")
        else:
            output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(result, ensure_ascii=False, indent=2))


def resolve_skill_path(skills_root: Path, skill_name: str) -> Path:
    candidate = skills_root / skill_name / "SKILL.md"
    if not candidate.exists():
        raise FileNotFoundError(f"Could not resolve skill path for {skill_name} under {skills_root}")
    return candidate


def infer_skill_name(skill_path: Path) -> str:
    if not skill_path.exists():
        raise FileNotFoundError(f"Could not resolve skill path: {skill_path}")
    text = skill_path.read_text(encoding="utf-8")
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("name:"):
            return stripped.split(":", 1)[1].strip()
    return skill_path.parent.name


def build_prompt(skill_name: str, skill_path: str, project_root: str, style: str) -> str:
    if style == "codex":
        return (
            f"Use ${skill_name} at {skill_path} for this research project.\n\n"
            f"Project root: {project_root}\n\n"
            "Continue by following the selected skill directly, staying consistent with its workflow and output contract."
        )
    if style == "universal":
        return (
            f"Use the reusable skill described at {skill_path}.\n\n"
            f"Project root: {project_root}\n\n"
            "A single task statement plus this SKILL.md address should be enough. Read that SKILL.md completely first. Then read every referenced local resource it requires, run or reuse its bundled scripts when needed, keep the process user-visible at major gates, and continue the research task without assuming Codex-only syntax or tooling."
        )
    return (
        f"Use the reusable skill described at {skill_path}.\n\n"
        f"Project root: {project_root}\n\n"
        "A single task statement plus this SKILL.md address should be enough. Start by reading that SKILL.md completely, then follow its referenced local resources and bundled scripts before continuing the research task."
    )


def render_markdown(result: dict) -> str:
    return f"""# Skill Selection Prompt

- skill_name: `{result['skill_name']}`
- skill_path: `{result['skill_path']}`
- style: `{result['style']}`

```text
{result['prompt']}
```
"""


if __name__ == "__main__":
    main()
