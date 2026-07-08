#!/usr/bin/env python3
"""Discover local skills under the current family root."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Discover local research skills")
    parser.add_argument("--skills-root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--output")
    parser.add_argument("--format", choices=["json", "markdown"], default="json")
    args = parser.parse_args()

    skills_root = Path(args.skills_root).resolve()
    skills = discover_skills(skills_root)
    result = {"skills_root": str(skills_root), "skills": skills, "skill_count": len(skills)}

    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        if args.format == "markdown":
            output.write_text(render_markdown(result), encoding="utf-8")
        else:
            output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(result, ensure_ascii=False, indent=2))


def discover_skills(skills_root: Path) -> list[dict]:
    results = []
    for path in sorted(skills_root.iterdir()):
        if not path.is_dir():
            continue
        skill_md = path / "SKILL.md"
        if not skill_md.exists():
            continue
        text = skill_md.read_text(encoding="utf-8")
        openai_yaml = path / "agents" / "openai.yaml"
        name = extract_frontmatter_field(text, "name") or path.name
        description = extract_frontmatter_field(text, "description") or ""
        display_name = extract_openai_field(openai_yaml, "display_name") if openai_yaml.exists() else None
        short_description = extract_openai_field(openai_yaml, "short_description") if openai_yaml.exists() else None
        results.append({
            "name": name,
            "path": str(skill_md),
            "description": description,
            "display_name": display_name or name,
            "short_description": short_description or description,
            "role_class": classify_skill(name),
            "direct_selectable": classify_skill(name) == "pipeline",
        })
    return results


def extract_frontmatter_field(text: str, field: str) -> str | None:
    match = re.search(rf"^{field}:\s+(.+)$", text, re.MULTILINE)
    if not match:
        return None
    return match.group(1).strip().strip('"')


def extract_openai_field(path: Path, field: str) -> str | None:
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"^\s*{field}:\s+\"?(.*?)\"?$", text, re.MULTILINE)
    if not match:
        return None
    return match.group(1).strip()


def classify_skill(name: str) -> str:
    if name == "research-skill-hub":
        return "entry"
    return "pipeline"


def render_markdown(result: dict) -> str:
    lines = ["# Local Skills", "", f"Skill count: `{result['skill_count']}`", ""]
    for item in result["skills"]:
        lines.extend([
            f"## {item['display_name']}",
            "",
            f"- skill_name: `{item['name']}`",
            f"- path: `{item['path']}`",
            f"- role_class: `{item['role_class']}`",
            f"- direct_selectable: `{item['direct_selectable']}`",
            f"- description: {item['short_description']}",
            "",
        ])
    return "\n".join(lines)


if __name__ == "__main__":
    main()
