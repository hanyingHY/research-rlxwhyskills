#!/usr/bin/env python3
"""Build a reusable skill-activation prompt directly from a SKILL.md path."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True

from research_runtime import python_command, run_json


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a reusable skill-activation prompt from a SKILL.md path")
    parser.add_argument("--skill-path", required=True)
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--style", choices=["generic", "universal", "codex"], default="universal")
    parser.add_argument("--output")
    parser.add_argument("--format", choices=["json", "markdown"], default="json")
    args = parser.parse_args()

    family_root = Path(__file__).resolve().parent
    hub_script = family_root / "research-skill-hub" / "scripts" / "build_skill_selection_prompt.py"

    payload = run_json([
        *python_command(
            hub_script,
            "--skill-path",
            Path(args.skill_path).resolve(),
            "--project-root",
            Path(args.project_root).resolve(),
            "--style",
            args.style,
        )
    ])

    payload["invocation_contract"] = "One task statement plus one reachable SKILL.md file address must be enough for a skill-capable agent to load and use the skill correctly."

    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        if args.format == "markdown":
            output.write_text(render_markdown(payload), encoding="utf-8")
        else:
            output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(payload, ensure_ascii=False, indent=2))

def render_markdown(payload: dict) -> str:
    return f"""# Research Skill Prompt

- skill_name: `{payload['skill_name']}`
- skill_path: `{payload['skill_path']}`
- style: `{payload['style']}`
- invocation_contract: {payload['invocation_contract']}

```text
{payload['prompt']}
```
"""


if __name__ == "__main__":
    main()
