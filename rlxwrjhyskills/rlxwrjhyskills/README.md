# rlxwrjhyskills

Migrated research skill family bundle.

# Research Skills Guide

This directory contains reusable research-operation skills for future handoffs and new tasks.

## Available skills

### 0. Research Skill Hub

Path: `research-skill-hub/SKILL.md`

Use it when:

1. the user first needs to discover what local research skills are available
2. the user wants a unified keyword or unified entry into the skill family
3. the user wants to choose one local skill and then jump directly into it

What it gives you:

1. local skill discovery
2. local skill comparison
3. direct handoff prompt generation into the chosen skill
4. universal-first prompt variants plus optional Codex-specific prompt variants for cross-agent reuse
5. corrected UI metadata discovery from `agents/openai.yaml` so skill listings expose the intended display names and concise summaries

### 1. Research Pipeline Lite

Path: `research-pipeline-lite/SKILL.md`

Use it when:

1. the corpus is small or medium
2. one operator or one window is enough
3. the goal is to move quickly from raw material to a shortlist and action plan

What it gives you:

1. fast intake workflow
2. retained evidence table
3. action mapping
4. lightweight workspace scaffold script
5. universal-first entry prompts plus optional Codex-specific variants for reuse in other AI environments

### 2. Research Pipeline Full

Path: `research-pipeline-full/SKILL.md`

Use it when:

1. the corpus is large, growing, or contradictory
2. multiple agents or windows are contributing
3. the research must drive experiments, validation plans, or cloud execution
4. provenance and benchmark freezing matter
5. you need a multi-window frontier-source expansion program with strict evidence control

What it gives you:

1. full research program workflow
2. evidence grading rules
3. validation-program design references
4. cloud-execution planning references
5. full research-program scaffold script
6. multi-window search-program guidance
7. corpus governance and quarantine-over-delete rules
8. report contract for final synthesis output
9. generated 10-window prompt-pack and role-map scaffold in `windowed-search` mode
10. local non-PyYAML skill validator and windowed-workspace validator
11. explicit user-controlled direction selection, depth selection, and direction-depth budget planning before long deep cycles
12. universal-first launch prompts plus optional Codex-specific variants for cross-agent reuse
13. bytecode-safe smoke and validation flow that keeps exported or source skills free of `__pycache__` and `*.pyc` pollution

## Which one to choose

Use `lite` if you need speed.

Use `full` if you need auditability, coordination, and downstream execution planning.

## Minimal Invocation Contract

This skill family is designed around one portable activation rule:

1. one task statement
2. one reachable `SKILL.md` file address

That should be enough for a skill-capable agent to load the selected skill, read its referenced local resources, and continue correctly.

Minimal template:

```text
Task: <TASK_STATEMENT>
Skill file: <ABSOLUTE_PATH_TO_SKILL_MD>
Instruction: Read that SKILL.md completely first, then follow its referenced local resources and bundled scripts before continuing the task.
```

## Family-level tools

This directory now also contains shared family-level helpers:

1. `export_research_skill_family.py`
   - export both research skills together as a reusable copy and/or zip bundle
2. `build_research_skill_prompt.py`
   - build a reusable activation prompt directly from a `SKILL.md` file path, without requiring local skill discovery first
3. `prepare_research_project.py`
   - prepare a project end to end by chaining state assessment, quickstart generation, recommended full/lite workspace initialization, and decision-surface synchronization
4. `route_research_skill_entry.py`
   - inspect a new project and recommend the best research-skill entry path, while also generating entry prompt bundles
5. `assess_research_project_state.py`
   - classify any project root as raw, lite-workspace, or full-workspace and return the right high-level judgment
6. `research_skill_console.py`
   - provide a single-entry command surface that combines project-state judgment, recommended prompts, runnable commands, review checkpoints, and portable command templates
7. `generate_research_skill_quickstart.py`
   - emit a ready-to-copy quickstart pack containing hub/full/lite prompts in universal-first form plus optional Codex-specific variants
8. `research-skill-hub/`
   - a local skill-discovery and selection hub skill for open or shared skill families
9. deeper family and local validators
   - detect missing referenced resources, invalid `openai.yaml` metadata, cache artifacts, and nonportable local hardcoding before export or reuse

## Local examples

This repository may also contain project-specific notes or execution plans near these skills. Treat those as local examples, not as part of the reusable skill contract.
