---
name: research-pipeline-lite
description: Fast intake, triage, evidence extraction, and action mapping for any research task. Use when an AI agent with skill-loading ability needs to turn a mixed pile of papers, links, notes, exports, interviews, or reports into a clean shortlist, a lightweight evidence view, and an immediate next-step plan without running a full multi-agent research program, while still giving the user explicit control over what to strengthen next and whether to continue or rebuild an existing half-finished lite workspace.
---

# Research Pipeline Lite

## Overview

Use this skill for fast, decision-oriented research handling. The goal is not a perfect knowledge system. The goal is to get from raw material to a usable shortlist, explicit evidence notes, and an action plan with minimum ceremony.

## Core workflow

1. Inventory what already exists before adding new files or judgments.
2. Separate intake from evidence judgment.
3. Deduplicate aggressively.
4. Retain only sources that change a decision, design, or experiment.
5. Map retained evidence to one of these action types:
   - claim to test
   - feature or factor
   - filter or rule
   - target or label
   - model or method
   - validation or benchmark
   - explicit rejection
6. Finish with a short decision memo that names:
   - what to do now
   - what to defer
   - what is still unproven

## User checkpoint

Do not silently move from quick intake and triage into a heavier next phase.

After the first shortlist and decision memo are ready, stop and ask the user whether to:

1. consolidate the current result
2. strengthen the evidence base
3. move into the full research pipeline
4. stop for review

If the user chooses strengthen mode, ask what should be strengthened first instead of broadening effort blindly. The strengthening target may be a direction, dataset, paper, or claim bundle.

If the workspace already exists and is only partially complete, ask whether to continue it, repair it, rebuild generated scaffold artifacts while keeping the raw corpus, or stop.

Use the generated `NEXT_USER_DECISION.md` and `PHASE_STATE.md` files as the visible lite handoff surface.

## When to keep this lightweight

Stay in lite mode when most of these are true:

1. one main question or a small bundle of related questions
2. one operator or one agent is enough
3. fewer than roughly 100 source items
4. low need for conflict adjudication across teams
5. no need to schedule a large parallel validation program yet

Move to the full skill when the corpus is large, contradictory, multi-stage, or tied to expensive execution.

## Outputs to leave behind

Use `references/output-contract.md` for exact fields.

Minimum deliverables:

1. source index
2. retained evidence table
3. action map
4. one-page summary memo

## Resource loading

Read `references/workflow.md` for the operational sequence.

Read `references/output-contract.md` when creating or auditing the final tables and memo.

Read `references/solution-modes.md` when the user wants the lite result split into stable and aggressive option sets instead of one undifferentiated shortlist.

Read `references/focused-strengthening.md` when the user wants to strengthen a specific direction, dataset, paper, or claim bundle before broadening the lite workflow.

Read `references/workspace-reentry.md` when the project already contains a half-finished lite workspace and the user should choose whether to continue, repair, or rebuild generated scaffold artifacts.

Read `references/workspace-progress-audit.md` when the user wants to know whether the current lite workspace is only scaffolded or actually decision-ready.

Read `references/portability-export.md` when the user wants to export, back up, or relocate the lite skill for reuse elsewhere.

Read `references/workflow.md` with the user checkpoint rule in mind: finish the lite packet, then stop and ask before broadening scope.

Use `scripts/init_research_workspace.py` when you need a clean workspace scaffold for a new research thread.

Use `scripts/validate_research_workspace.py` when you want to confirm that the lightweight scaffold, its CSV contracts, and the visible next-user-decision file are present.

Use `scripts/smoke_test_lite_skill.py` when you want an end-to-end sanity check that the lite skill can still initialize and validate a fresh workspace.

Use `scripts/generate_entry_prompts.py` when the user wants immediately reusable copy-paste launch prompts for another project or a fresh thread.

Use `scripts/assess_workspace_progress.py` when the user wants a quality audit of an existing lite workspace rather than just a structure check.

Use `scripts/sync_decision_surfaces.py` when you want the current lite-workspace audit written back into `REENTRY_DECISION.md`, `NEXT_USER_DECISION.md`, and `PHASE_STATE.md` so the operator does not have to fill those control files from scratch.

Use `scripts/export_skill_bundle.py` when the user wants a portable copy or zip backup of the skill.

The generated lite workspace now exposes `NEXT_USER_DECISION.md`, `REENTRY_DECISION.md`, `PHASE_STATE.md`, `USER_CHECKPOINT_PROMPTS.md`, `USER_REENTRY_PROMPTS.md`, `USER_FOCUSED_STRENGTHENING_PROMPTS.md`, and `UNIFIED_BROADCAST_PROMPT.md` as the visible handoff surface.
