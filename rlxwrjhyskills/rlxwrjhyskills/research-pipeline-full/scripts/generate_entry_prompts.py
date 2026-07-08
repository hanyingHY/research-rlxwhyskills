#!/usr/bin/env python3
"""Generate reusable cross-project entry prompts for research-pipeline-full."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.dont_write_bytecode = True

from profiles import get_profile


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate entry prompts for research-pipeline-full")
    parser.add_argument("--output", required=True, help="Output markdown file path")
    parser.add_argument("--project-root", default="<PROJECT_ROOT>", help="Target project root placeholder or concrete path")
    parser.add_argument("--profile", default="generic")
    args = parser.parse_args()

    skill_root = Path(__file__).resolve().parents[1]
    profile = get_profile(args.profile)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    text = build_prompt_bundle(skill_root, args.project_root, args.profile, profile)
    output.write_text(text, encoding="utf-8")
    print(output)


def build_prompt_bundle(skill_root: Path, project_root: str, profile_name: str, profile: dict) -> str:
    skill_path = str(skill_root).replace("\\", "/")
    window_count = profile["recommended_window_count"]
    optional_windows = profile["optional_window_count"]

    return f"""# Research Pipeline Full Entry Prompts

## Universal Mode Router

Use this when the target AI environment is unknown, mixed, or not Codex-specific.

```text
Use the reusable skill described at {skill_path}/SKILL.md.

Project root: {project_root}
Active profile: {profile_name}

Your job is to decide the correct operating posture for this project, not to jump blindly into search.

Required behavior:
1. treat the task statement plus this SKILL.md address as the complete invocation contract
2. read that SKILL.md completely first
3. traverse the project root first
4. decide whether the project needs bootstrap, lite handling, or full research-program handling
5. if a partial workspace already exists, ask whether to continue it, repair it, or rebuild generated scaffold artifacts while keeping the raw corpus
6. audit existing research content before trusting it
7. keep the process explicit and user-visible
8. stop at major phase gates and proactively provide copy-paste prompts
9. if the user chooses strengthen mode, ask which directions, datasets, papers, or claim bundles should be reinforced first
10. if multi-window work is appropriate, prepare the workspace, prompt packs, and task interfaces

Output order:
1. objective
2. current operating mode recommendation
3. strongest retained evidence about the project state
4. conflicts or uncertainty
5. executable next actions
6. direct copy-paste prompt for the next user decision
```

## Codex Mode Router

Use this when you want Codex to decide whether to bootstrap, audit, discover, deepen, scaffold, or prepare launch prompts.

```text
Use $research-pipeline-full at {skill_path} for this research project.

Project root: {project_root}
Active profile: {profile_name}

Your job is to decide the correct operating posture for this project, not to jump blindly into search.

Required behavior:
1. traverse the project root first
2. decide whether the project needs bootstrap, lite handling, or full research-program handling
3. audit existing research content before trusting it
4. keep the process explicit and user-visible
5. stop at major phase gates and proactively provide copy-paste prompts
6. if multi-window work is appropriate, prepare the workspace, prompt packs, and task interfaces

Output order:
1. objective
2. current operating mode recommendation
3. strongest retained evidence about the project state
4. conflicts or uncertainty
5. executable next actions
6. direct copy-paste prompt for the next user decision
```

## Universal Full Program Launch

Use this when the corpus is large, conflicting, or execution-linked, and the target AI may not support Codex skill syntax.

```text
Use the reusable skill described at {skill_path}/SKILL.md.

Project root: {project_root}
Active profile: {profile_name}

Run this as a full research program.

Mandatory instructions:
1. treat the task statement plus this SKILL.md address as the complete invocation contract
2. read that SKILL.md completely first
3. traverse and audit the project before trusting existing conclusions
4. if a partial workspace already exists, ask whether to continue it, repair it, or rebuild generated scaffold artifacts while keeping the raw corpus
5. bootstrap structure first if the project is still a loose file pile
6. separate intake, evidence judgment, conflict handling, synthesis, and validation planning
7. saturate discovery before splitting stable versus aggressive boards
8. do not silently advance phases
9. proactively give direct copy-paste prompts at every major gate
10. if the user chooses strengthen mode, ask which directions, datasets, papers, or claim bundles should be reinforced first before broadening scope
11. when deep work is proposed, require explicit user choices for direction selection, deep-dive intensity, and per-direction budget intent before long deep cycles begin
12. scaffold a reusable workspace if the current project does not yet expose one

Required output shape:
1. objective
2. strongest retained evidence
3. conflicts and adjudication
4. executable validation schemes
5. immediate next actions
6. deferred items
```

## Codex Full Program Launch

Use this when the corpus is large, conflicting, or execution-linked.

```text
Use $research-pipeline-full at {skill_path} for this research project.

Project root: {project_root}
Active profile: {profile_name}

Run this as a full research program.

Mandatory instructions:
1. traverse and audit the project before trusting existing conclusions
2. bootstrap structure first if the project is still a loose file pile
3. separate intake, evidence judgment, conflict handling, synthesis, and validation planning
4. saturate discovery before splitting stable versus aggressive boards
5. do not silently advance phases
6. proactively give direct copy-paste prompts at every major gate
7. scaffold a reusable workspace if the current project does not yet expose one

Required output shape:
1. objective
2. strongest retained evidence
3. conflicts and adjudication
4. executable validation schemes
5. immediate next actions
6. deferred items
```

## Universal Multi-Window Launch Preparation

Use this when the project is ready for coordinated parallel search and the target AI may not support Codex skill syntax.

Recommended core layout: {window_count}
Optional extension after stabilization: {optional_windows}

```text
Use the reusable skill described at {skill_path}/SKILL.md.

Project root: {project_root}
Active profile: {profile_name}

Prepare this project for coordinated multi-window research.

Mandatory instructions:
1. treat the task statement plus this SKILL.md address as the complete invocation contract
2. read that SKILL.md completely first
3. if a partial workspace already exists, ask whether to continue it, repair it, or rebuild generated scaffold artifacts while keeping the raw corpus
4. do not launch workers until direction mapping and evidence grading are stable enough
5. scaffold the workspace and expose explicit protocol files
6. generate per-window prompts, role map, task interfaces, and user checkpoint prompts
7. keep each worker inside its owned scope
8. keep stable and aggressive route boards separate
9. if the user chooses strengthen mode, ask which directions, datasets, papers, or claim bundles should be reinforced first before broadening scope
10. do not start long deep cycles until the user has chosen direction selection, deep-dive intensity, and budget intent explicitly
11. give the user direct copy-paste prompts for dispatch and checkpoint control

Required output shape:
1. objective
2. workspace readiness judgment
3. prompt-pack readiness judgment
4. recommended window count and why
5. immediate launch blockers
6. copy-paste prompt set for the next step
```

## Codex Multi-Window Launch Preparation

Use this when the project is ready for coordinated parallel search.

Recommended core layout: {window_count}
Optional extension after stabilization: {optional_windows}

```text
Use $research-pipeline-full at {skill_path} for this research project.

Project root: {project_root}
Active profile: {profile_name}

Prepare this project for coordinated multi-window research.

Mandatory instructions:
1. do not launch workers until direction mapping and evidence grading are stable enough
2. scaffold the workspace and expose explicit protocol files
3. generate per-window prompts, role map, task interfaces, and user checkpoint prompts
4. keep each worker inside its owned scope
5. keep stable and aggressive route boards separate
6. give the user direct copy-paste prompts for dispatch and checkpoint control

Required output shape:
1. objective
2. workspace readiness judgment
3. prompt-pack readiness judgment
4. recommended window count and why
5. immediate launch blockers
6. copy-paste prompt set for the next step
```

## Universal Experimental Autonomy Pilot

Use this only when the user explicitly wants reduced checkpoint frequency and the target AI may not support Codex skill syntax.

```text
Use the reusable skill described at {skill_path}/SKILL.md.

Project root: {project_root}
Active profile: {profile_name}

The user is considering the experimental autonomy pilot.

Mandatory instructions:
1. treat the task statement plus this SKILL.md address as the complete invocation contract
2. read that SKILL.md completely first
3. treat autonomy as experimental and opt-in only
4. warn about scope drift, cleanup risk, and reduced manual review
5. record visible consent, scope boundaries, required manual stops, and stop conditions before enabling it
6. do not skip evidence grading, conflict handling, or validation logic
7. stop again if a destructive action, new major scope jump, or route-board choice appears without explicit approval

Required output shape:
1. objective
2. autonomy suitability judgment
3. required warnings
4. required consent fields
5. safe next action
6. direct copy-paste autonomy consent prompt
```

## Codex Experimental Autonomy Pilot

Use this only when the user explicitly wants reduced checkpoint frequency.

```text
Use $research-pipeline-full at {skill_path} for this research project.

Project root: {project_root}
Active profile: {profile_name}

The user is considering the experimental autonomy pilot.

Mandatory instructions:
1. treat autonomy as experimental and opt-in only
2. warn about scope drift, cleanup risk, and reduced manual review
3. record visible consent, scope boundaries, required manual stops, and stop conditions before enabling it
4. do not skip evidence grading, conflict handling, or validation logic
5. stop again if a destructive action, new major scope jump, or route-board choice appears without explicit approval

Required output shape:
1. objective
2. autonomy suitability judgment
3. required warnings
4. required consent fields
5. safe next action
6. direct copy-paste autonomy consent prompt
```
"""


if __name__ == "__main__":
    main()
