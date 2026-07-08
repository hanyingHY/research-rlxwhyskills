---
name: research-pipeline-full
description: Full research-program orchestration for large, growing, or conflicting corpora, especially when multiple windows or agents must search, grade evidence, adjudicate contradictions, quarantine weak material, and map retained conclusions into validation-ready decisions. Use when an AI agent with skill-loading ability must run a complete auditable research program rather than produce a generic review, including frontier-source expansion, search-round planning, window prompt design, corpus governance, benchmark-aware validation planning, cloud-distributed research execution, explicit user choice over directions to strengthen, and explicit user choice over whether to continue or rebuild an existing half-finished workspace.
---

# Research Pipeline Full

## Overview

Use this skill when research is a program, not a reading task.

The job is to convert a large, messy, or fast-moving knowledge flow into:

1. explicit evidence structure
2. conflict resolution
3. a ranked decision slate
4. a validation roadmap
5. a reusable multi-window operating system

## Program workflow

1. Stabilize the workspace before adding new claims.
2. Separate intake, triage, evidence judgment, synthesis, and validation planning.
3. Build a reusable taxonomy of directions, not just a pile of notes.
4. Grade evidence explicitly and record why weak material was downgraded.
5. Reconcile contradictions rather than averaging them away.
6. Map retained conclusions into experiments, validations, or operating decisions.
7. Freeze a benchmark before expensive execution begins.
8. Compare later execution outputs against the frozen benchmark and the original evidence claims.

## Use full mode when

Choose the full skill when one or more are true:

1. the corpus is large or growing continuously
2. multiple agents or windows are contributing
3. evidence conflicts materially
4. the downstream validation program is expensive
5. you need auditability, provenance, or reproducibility
6. you must convert research into a multi-wave execution roadmap
7. the user wants large frontier-source expansion with strict source trust requirements
8. the user wants direct window prompts, coordinator roles, or corpus-governance rules

## Required output families

1. intake and source indexes
2. direction scoreboard
3. retained evidence matrix
4. conflict or adjudication log
5. experiment or validation matrix
6. benchmark artifact
7. stable route board
8. aggressive route board
9. final synthesis memo

The final synthesis memo should follow the report contract:

1. short objective statement
2. strongest retained evidence
3. conflicts and adjudication
4. executable validation schemes
5. immediate next actions
6. deferred items

## Special operating rules for source-expansion programs

1. Default to a `10`-window layout when the user wants a large but still coordinated multi-window search campaign.
2. Run discovery before deep search. Do not let every window jump directly into long deep-dive loops.
3. Treat deletion as exceptional. Prefer `reject`, `downgrade`, or `quarantine` with logged reasons.
4. If the user wants only research-source accumulation, still map retained conclusions into validation placeholders. Do not drop evidence grading, conflict handling, or benchmark logic.
5. Stop deep-search cycles when they no longer produce retained evidence or change direction ranking.

## User decision gates

Do not silently advance from one major program phase to the next.

After project traversal and audit, after direction discovery, after deep search plus conflict resolution, and after validation planning, stop and make the next decision explicit to the user.

When stopping at a gate, proactively give the user a copy-paste-ready prompt in the main conversation. Do not wait for the user to ask for it and do not force the user to look it up in generated files.

Read `references/user-decision-gates.md` when you need the exact checkpoint rules and the required user-facing options.

## Resource loading

Read `references/workflow.md` for the end-to-end operating sequence.

Read `references/research-program-flow.md` when the user wants the whole path from project traversal through direction discovery, deep search, iterative refinement, structure setup, prompt preparation, and window launch to be explicit.

Read `references/existing-content-audit.md` when the project already contains research notes or prior conclusions that must be checked for authority and accuracy before they are trusted.

Read `references/existing-content-audit-template.md` when you need a reusable output structure for auditing pre-existing claims inside the workspace.

Read `references/skill-flow-report.md` when the user wants a compact explanation of how this skill implements the end-to-end research workflow.

Read `references/evidence-grading.md` when building the retained-evidence and conflict layers.

Read `references/credibility-scoring.md` when the user wants source trust, research trust, or retained-claim credibility turned into an explicit scoring surface.

Read `references/validation-programs.md` when converting conclusions into executable validation plans or validation placeholders.

Read `references/solution-modes.md` when the user wants stable versus aggressive option sets, or when the full search result must be split into conservative and novelty-seeking execution boards.

Read `references/start-mode-routing.md` when the user wants to know whether the next project should start in lite mode, full mode, or with a bootstrap-first posture.

Read `references/workspace-progress-audit.md` when the user wants to know whether a current workspace is only structurally initialized or actually decision-ready.

Read `references/direction-depth-selection.md` when the user wants explicit control over which directions advance and how aggressively each chosen direction should be deepened.

Read `references/focused-strengthening.md` when the user wants to strengthen specific directions, datasets, papers, or claim bundles instead of broadening the whole search surface.

Read `references/workspace-reentry.md` when the project already contains a half-finished scaffold and the user should choose whether to continue, repair, or rebuild generated scaffold artifacts.

Read `references/portability-export.md` when the user wants to export, back up, or relocate the skill for reuse elsewhere.

Read `references/cloud-execution.md` when the user wants to distribute work across cloud machines, multiple accelerators, or parallel research windows.

Read `references/windowed-search-programs.md` when the user wants to launch multiple windows, assign window roles, or define discovery/deep-search quotas.

Read `references/prompt-pack-design.md` when the user wants direct per-window prompts or reusable launch prompts for parallel workers.

Read `references/checkpoint-prompt-strata.md` when you need to generate or audit the user, coordinator, and broadcast prompt layers for major checkpoints.

Read `references/phase-state-contract.md` when the user wants phase readiness to be explicit, machine-readable, or durable across many windows and many handoffs.

Read `references/broadcast-template.md` when the user wants one unified instruction that can be sent to many windows at once.

Read `references/corpus-bootstrap-layout.md` when the project begins as a loose pile of papers, notes, transcripts, or exports and you need to scaffold a reusable research structure before deeper audit or search.

Read `references/autonomous-execution-pilot.md` only when the user explicitly asks for a more hands-off mode or says they do not want to confirm every stage manually. Treat it as an experimental opt-in layer, not the default behavior.

Read `references/frontier-expansion-cycles.md` when the user asks for explicit large-count search plans such as repeated 50-round discovery, deep cycles, or saturation-stop rules.

Read `references/authority-ladder.md` when the user asks for strictly reliable, high-authority sources or when source credibility is a central decision variable.

Read `references/worker-file-contract.md` when the user wants per-window deliverables to be uniform and machine-checkable.

Read `references/task-interface-contract.md` when the user wants each worker to expose a stable handoff surface or a unique downstream interface.

Read `references/csv-schema-semantics.md` when the user wants exact field meanings for worker CSV outputs or when many windows must keep their structured outputs semantically aligned.

Read `references/literature-only-mode.md` when the user wants corpus expansion, evidence accumulation, or prompt-pack preparation without engineering work.

Read `references/corpus-governance.md` when the user asks to delete, purge, quarantine, downgrade, or otherwise clean the corpus.

Read `references/user-decision-gates.md` when the process is about to change phase or when you need to decide whether to consolidate, strengthen, scaffold, or execute next.

Use `scripts/init_research_program.py` to scaffold a new research program workspace.

Use `scripts/generate_entry_prompts.py` when the user wants immediately reusable copy-paste launch prompts for another project, another thread, or another operator.

Use `scripts/recommend_start_mode.py` when the user wants a deterministic recommendation for how a new project should start.

Use `scripts/assess_workspace_progress.py` when the user wants a quality audit of an existing full workspace rather than just a structure check.

Use `scripts/sync_decision_surfaces.py` when you want the current full-workspace audit written back into `REENTRY_DECISION.md` and `NEXT_USER_DECISION.md` so the operator does not have to fill those control files from scratch.

Use `scripts/score_research_credibility.py` when the user wants a specific source, paper, or retained claim bundle scored across explicit credibility dimensions.

Use `scripts/export_skill_bundle.py` when the user wants a portable copy or zip backup of the skill.
