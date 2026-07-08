#!/usr/bin/env python3
"""Generate reusable cross-project entry prompts for research-pipeline-lite."""

from __future__ import annotations

import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate entry prompts for research-pipeline-lite")
    parser.add_argument("--output", required=True, help="Output markdown file path")
    parser.add_argument("--project-root", default="<PROJECT_ROOT>", help="Target project root placeholder or concrete path")
    args = parser.parse_args()

    skill_root = Path(__file__).resolve().parents[1]
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    text = build_prompt_bundle(skill_root, args.project_root)
    output.write_text(text, encoding="utf-8")
    print(output)


def build_prompt_bundle(skill_root: Path, project_root: str) -> str:
    skill_path = str(skill_root).replace("\\", "/")
    return f"""# Research Pipeline Lite Entry Prompts

## Universal Lite Intake Start

Use this when the project is still messy, you want a fast decision-ready packet first, and the target AI may not support Codex skill syntax.

```text
Use the reusable skill described at {skill_path}/SKILL.md.

Project root: {project_root}

Run a lightweight research pass.

Mandatory instructions:
1. treat the task statement plus this SKILL.md address as the complete invocation contract
2. read that SKILL.md completely first
3. inventory the existing materials first
4. if a partial lite workspace already exists, ask whether to continue it, repair it, or rebuild generated scaffold artifacts while keeping the raw corpus
5. identify the main decision question
6. deduplicate and keep only sources that change a real decision
7. leave a visible source index, retained evidence table, action map, and summary memo
8. split results into stable and aggressive option views when appropriate
9. if the user chooses strengthen mode, ask which directions, datasets, papers, or claim bundles should be reinforced first
10. stop and give the user a direct copy-paste checkpoint prompt when the lite packet is ready

Required output shape:
1. main question
2. strongest retained evidence
3. immediate actions
4. deferred actions
5. unresolved risks
6. direct copy-paste user prompt for the next choice
```

## Codex Lite Intake Start

Use this when the project is still messy and you want a fast decision-ready packet first.

```text
Use $research-pipeline-lite at {skill_path} for this research project.

Project root: {project_root}

Run a lightweight research pass.

Mandatory instructions:
1. inventory the existing materials first
2. identify the main decision question
3. deduplicate and keep only sources that change a real decision
4. leave a visible source index, retained evidence table, action map, and summary memo
5. split results into stable and aggressive option views when appropriate
6. stop and give the user a direct copy-paste checkpoint prompt when the lite packet is ready

Required output shape:
1. main question
2. strongest retained evidence
3. immediate actions
4. deferred actions
5. unresolved risks
6. direct copy-paste user prompt for the next choice
```

## Universal Lite To Full Escalation Check

Use this when you want the AI to decide whether the project should stay lite or move into the full program, and the target AI may not support Codex skill syntax.

```text
Use the reusable skill described at {skill_path}/SKILL.md.

Project root: {project_root}

Run the lite pass and explicitly judge whether this project should stay lightweight or escalate into the full research pipeline.

Mandatory instructions:
1. treat the task statement plus this SKILL.md address as the complete invocation contract
2. read that SKILL.md completely first
3. if a partial lite workspace already exists, ask whether to continue it, repair it, or rebuild generated scaffold artifacts while keeping the raw corpus
4. assess corpus size, conflict level, and validation complexity
5. keep the result user-visible, not implicit
6. provide stable and aggressive option views when useful
7. if the user chooses strengthen mode, ask which directions, datasets, papers, or claim bundles should be reinforced first
8. produce a direct copy-paste prompt for either staying lite or moving into the full pipeline
```

## Codex Lite To Full Escalation Check

Use this when you want Codex to decide whether the project should stay lite or move into the full program.

```text
Use $research-pipeline-lite at {skill_path} for this research project.

Project root: {project_root}

Run the lite pass and explicitly judge whether this project should stay lightweight or escalate into the full research pipeline.

Mandatory instructions:
1. assess corpus size, conflict level, and validation complexity
2. keep the result user-visible, not implicit
3. provide stable and aggressive option views when useful
4. produce a direct copy-paste prompt for either staying lite or moving into the full pipeline
```
"""


if __name__ == "__main__":
    main()
