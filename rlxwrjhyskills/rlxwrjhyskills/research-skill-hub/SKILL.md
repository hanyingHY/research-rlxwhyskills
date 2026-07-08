---
name: research-skill-hub
description: Discover, explain, and route between local research-operation skills inside the current project or skill family. Use when an AI agent with skill-loading ability needs to inspect which research skills are available, describe what each one does, help the user choose among them, or generate a direct handoff prompt into a selected skill.
---

# Research Skill Hub

## Overview

Use this skill as the unified entry point when a project or repository contains multiple research skills and the user should not need to know their paths in advance.

The job is to:

1. discover available local skills
2. describe each skill clearly
3. help the user choose the correct one
4. generate a direct handoff prompt into the chosen skill
5. provide a recommended, alternative, and not-recommended-now view when the user is choosing between local skills
6. default to agent-neutral handoff wording when the user wants the skill family to work across different AI environments

## Workflow

1. inspect the local skill family first
2. list every callable skill with name, path, and short function summary
3. group overlapping skills by role rather than repeating raw folder names only
4. explain the decision boundary between similar skills
5. classify skills into recommended, alternative, and not-recommended-now when appropriate
6. once the user chooses a skill, provide a copy-paste-ready prompt that routes directly into it
7. if the user wants broad portability, prefer a prompt that tells the target AI to read the selected skill's `SKILL.md` and local resources directly
8. support the minimal invocation contract: one task statement plus one `SKILL.md` file address should be enough to trigger correct skill loading in any skill-capable agent environment

## Resource loading

Use `scripts/discover_local_skills.py` when you need a structured list of the local skills.

Read `references/selection-rules.md` when the user is unsure which skill to choose or when multiple skills overlap.

Use `scripts/recommend_local_skill.py` when you need a concrete recommendation among the local skills instead of only a raw listing.

Use `scripts/build_skill_selection_prompt.py` when you need a direct handoff prompt into a chosen local skill.
