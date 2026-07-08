#!/usr/bin/env python3
"""Create a full research-program scaffold."""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

sys.dont_write_bytecode = True

from profiles import get_profile


CSV_SCHEMAS = {
    "01_indexes/source_index.csv": ["source_id", "title", "author_or_org", "year", "source_type", "stable_link", "topic", "status"],
    "02_directions/direction_scoreboard.csv": ["direction", "relevance", "directness", "evidence_strength", "feasibility", "expected_upside", "status"],
    "03_evidence/retained_evidence.csv": ["source_id", "claim", "study_context", "method_summary", "evidence_strength", "transferability", "risk_or_limitation"],
    "04_conflicts/adjudication_log.csv": ["conflict_id", "claim_a", "claim_b", "conflict_type", "adjudication", "remaining_uncertainty"],
    "05_validation/validation_matrix.csv": ["scheme_id", "objective", "inputs", "dependencies", "compute_class", "expected_outputs", "success_metrics", "promotion_rule"],
    "06_reports/direction_depth_plan.csv": ["direction", "selected_state", "depth_profile", "allowed_round_budget", "allowed_cycle_budget", "notes"],
    "06_reports/focused_strengthening_plan.csv": ["focus_type", "focus_name", "strengthen_goal", "evidence_gap", "preferred_action", "priority", "notes"],
    "05_master_tables/master_source_index.csv": ["source_id", "title", "authors", "year", "stable_link", "primary_direction", "disposition"],
    "05_master_tables/direction_scoreboard.csv": ["direction", "relevance", "directness", "evidence_strength", "feasibility", "expected_upside", "status"],
    "05_master_tables/research_to_experiment_matrix.csv": ["direction", "claim", "mapped_category", "validation_placeholder", "priority"],
    "12_ingestion_logs/ingestion_log.csv": ["timestamp", "item_name", "source_path", "primary_direction", "secondary_tags", "disposition", "reason"],
    "12_ingestion_logs/claim_verification_log.csv": ["claim_id", "claim_text", "original_source", "authority_assessment", "external_verdict", "disposition", "notes"],
    "worker/round_log.csv": ["round_id", "search_question", "query_set", "candidate_count", "retained_count", "next_action"],
    "worker/source_index.csv": ["source_id", "title", "authors", "year", "source", "stable_link", "direction", "disposition"],
    "worker/evidence_matrix.csv": ["source_id", "claim", "study_context", "evaluation_scope", "evidence_strength", "transferability", "implementation_value"],
    "worker/experiment_hypotheses.csv": ["hypothesis_id", "mapped_category", "claim", "validation_placeholder", "priority"],
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Initialize a full research program workspace")
    parser.add_argument("--root", required=True)
    parser.add_argument("--mode", choices=["standard", "windowed-search"], default="standard")
    parser.add_argument("--profile", default="generic")
    parser.add_argument("--overwrite-generated", action="store_true")
    parser.add_argument("--experimental-autonomy", action="store_true")
    args = parser.parse_args()

    root = Path(args.root)
    root.mkdir(parents=True, exist_ok=True)

    for name in [
        "00_intake",
        "01_indexes",
        "02_directions",
        "03_evidence",
        "04_conflicts",
        "05_validation",
        "06_benchmarks",
        "07_reports",
    ]:
        (root / name).mkdir(parents=True, exist_ok=True)

    if args.mode == "windowed-search":
        for name in [
            "00_protocol",
            "00_protocol" / Path("prompts"),
            "01_window_runs",
            "05_master_tables",
            "06_reports",
            "06_reports" / Path("credibility"),
            "10_inbox_raw" / Path("00_unsorted"),
            "11_classified",
            "12_ingestion_logs",
            "13_quarantine_reject",
        ]:
            (root / name).mkdir(parents=True, exist_ok=True)

        init_windowed_search(root, profile_name=args.profile, overwrite_generated=args.overwrite_generated, experimental_autonomy=args.experimental_autonomy)

    write_csv(root / "01_indexes" / "source_index.csv", CSV_SCHEMAS["01_indexes/source_index.csv"])
    write_csv(root / "02_directions" / "direction_scoreboard.csv", CSV_SCHEMAS["02_directions/direction_scoreboard.csv"])
    write_csv(root / "03_evidence" / "retained_evidence.csv", CSV_SCHEMAS["03_evidence/retained_evidence.csv"])
    write_csv(root / "04_conflicts" / "adjudication_log.csv", CSV_SCHEMAS["04_conflicts/adjudication_log.csv"])
    write_csv(root / "05_validation" / "validation_matrix.csv", CSV_SCHEMAS["05_validation/validation_matrix.csv"])

    benchmark = root / "06_benchmarks" / "benchmark_note.md"
    if not benchmark.exists():
        benchmark.write_text("# Benchmark Note\n\nDescribe the frozen baseline here before expensive validation begins.\n", encoding="utf-8")
    report = root / "07_reports" / "synthesis_memo.md"
    if not report.exists():
        report.write_text("# Synthesis Memo\n\n## Objective\n\n## Strongest Directions\n\n## Conflicts\n\n## Validation Plan\n\n## Risks\n", encoding="utf-8")

    if args.mode == "windowed-search":
        write_csv(root / "12_ingestion_logs" / "ingestion_log.csv", CSV_SCHEMAS["12_ingestion_logs/ingestion_log.csv"])
        write_csv(root / "12_ingestion_logs" / "claim_verification_log.csv", CSV_SCHEMAS["12_ingestion_logs/claim_verification_log.csv"])
        quarantine = root / "13_quarantine_reject" / "README.md"
        if not quarantine.exists():
            quarantine.write_text(
                "# Quarantine Reject\n\nUse this folder for weak, duplicate, suspicious, or off-target material that should not stay in the active retained corpus.\n",
                encoding="utf-8",
            )
    print(root)


def write_csv(path: Path, columns: list[str]) -> None:
    if path.exists():
        return
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()


def init_windowed_search(root: Path, profile_name: str, overwrite_generated: bool, experimental_autonomy: bool = False) -> None:
    profile = get_profile(profile_name)
    workers = profile["workers"]
    focus = profile["focus"]

    protocol_dir = root / "00_protocol"
    prompts_dir = protocol_dir / "prompts"
    write_text(
        protocol_dir / "README.md",
        f"# Protocol\n\nUse the local skill references to populate role prompts, evidence rules, and corpus-governance policies for this program.\n\n## Active profile\n\n`{profile_name}`\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "PROGRAM_CONTROL_CENTER.md",
        "# Program Control Center\n\n## Current Operating Posture\n\n1. current phase: see `PHASE_STATE.md`\n2. current gate: see `PHASE_STATE.md`\n3. next user decision: see `..\\06_reports\\NEXT_USER_DECISION.md`\n\n## Primary Operator Files\n\n1. `SEARCH_OBJECTIVE.md`\n2. `USER_DECISION_GATES.md`\n3. `USER_CHECKPOINT_PROMPTS.md`\n4. `USER_DIRECTION_DEPTH_PROMPTS.md`\n5. `USER_FOCUSED_STRENGTHENING_PROMPTS.md`\n6. `USER_REENTRY_PROMPTS.md`\n7. `UNIFIED_BROADCAST_PROMPT.md`\n8. `WINDOW_ROLE_MAP.md`\n9. `WINDOW_COUNT_GUIDANCE.md`\n10. `DIRECTION_DEPTH_POLICY.md`\n11. `FOCUSED_STRENGTHENING_POLICY.md`\n12. `WORKSPACE_REENTRY_POLICY.md`\n13. `..\\06_reports\\STABLE_ROUTE_BOARD.md`\n14. `..\\06_reports\\AGGRESSIVE_ROUTE_BOARD.md`\n15. `..\\06_reports\\DIRECTION_SELECTION.md`\n16. `..\\06_reports\\DEEP_DIVE_SELECTION.md`\n17. `..\\06_reports\\DIRECTION_DEPTH_PLAN.csv`\n18. `..\\06_reports\\FOCUSED_STRENGTHENING_SELECTION.md`\n19. `..\\06_reports\\FOCUSED_STRENGTHENING_PLAN.csv`\n20. `..\\06_reports\\REENTRY_DECISION.md`\n\n## Control Rules\n\n1. do not silently advance phases\n2. keep stable and aggressive routes separate\n3. keep autonomy experimental and opt-in only\n4. keep workers inside owned scope\n\n## Immediate Use\n\n1. read `PHASE_STATE.md`\n2. read `..\\06_reports\\NEXT_USER_DECISION.md`\n3. if resuming a half-finished workspace, review `..\\06_reports\\REENTRY_DECISION.md` with the user before assuming continue versus rebuild\n4. if strengthen mode is next, review `..\\06_reports\\FOCUSED_STRENGTHENING_SELECTION.md` and `..\\06_reports\\FOCUSED_STRENGTHENING_PLAN.csv` with the user\n5. if deep work is next, review `..\\06_reports\\DIRECTION_SELECTION.md`, `..\\06_reports\\DEEP_DIVE_SELECTION.md`, and `..\\06_reports\\DIRECTION_DEPTH_PLAN.csv` with the user\n6. use the matching user-facing prompt file before asking for a strengthening, reentry, or direction-depth choice\n7. send the appropriate copy-paste prompt from `USER_CHECKPOINT_PROMPTS.md` or `UNIFIED_BROADCAST_PROMPT.md`\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "PROFILE_NAME.txt",
        f"{profile_name}\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "SEARCH_OBJECTIVE.md",
        "# Search Objective\n\n1. Improve the target research objective or downstream decision program, not generic scholarship.\n2. Start with 10 discovery rounds per direction.\n3. Promote only strong directions into 50-round deep cycles.\n4. Run at least 20 follow-up cycles across the strongest directions before declaring saturation.\n5. Map every retained claim to signal or feature, rule or filter, target or label, model or method, routing or control logic, output or selection layer, validation design, or explicit rejection.\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "EXISTING_CONTENT_AUDIT.md",
        "# Existing Content Audit\n\n1. Audit existing research notes, reports, tables, and prior conclusions before treating them as trusted.\n2. Verify each important claim against authoritative external evidence.\n3. Downgrade, quarantine, or rewrite claims that do not survive verification.\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "EXISTING_CONTENT_AUDIT_TEMPLATE.md",
        "# Existing Content Audit Template\n\n## Claim Inventory\n\n## Source or Provenance Check\n\n## Authority Assessment\n\n## External Confirmation or Contradiction\n\n## Disposition Decision\n\n## Rewrite or Quarantine Notes\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "USER_DECISION_GATES.md",
        "# User Decision Gates\n\n## Default rule\n\nDo not silently advance the program across major phases.\n\n## Reentry Gate\n\nIf the workspace already exists and looks half-finished, do not assume continuation. Ask whether to continue the current scaffold, repair it in place, rebuild generated protocol artifacts while keeping the raw corpus, or stop. Record that choice in `..\\06_reports\\REENTRY_DECISION.md`.\n\n## Gate A\n\nAfter project traversal and audit, stop and ask whether to consolidate, strengthen, proceed into discovery, or stop. If the user chooses strengthen, record the explicit strengthening targets in `..\\06_reports\\FOCUSED_STRENGTHENING_SELECTION.md` and `..\\06_reports\\FOCUSED_STRENGTHENING_PLAN.csv`.\n\n## Gate B\n\nAfter direction discovery, stop and ask whether to consolidate, strengthen, proceed into deep search, or stop. If the user chooses strengthen, record the explicit strengthening targets in `..\\06_reports\\FOCUSED_STRENGTHENING_SELECTION.md` and `..\\06_reports\\FOCUSED_STRENGTHENING_PLAN.csv`. If the user proceeds, record direction selection, deep-dive intensity, and per-direction budget intent explicitly in `..\\06_reports\\DIRECTION_SELECTION.md`, `..\\06_reports\\DEEP_DIVE_SELECTION.md`, and `..\\06_reports\\DIRECTION_DEPTH_PLAN.csv` before long deep cycles start.\n\n## Gate C\n\nAfter deep search and conflict adjudication, stop and ask whether to consolidate, strengthen, scaffold, or stop. If the user chooses strengthen, record which directions, datasets, papers, or claim bundles should be reinforced first.\n\n## Gate D\n\nAfter validation planning, stop and ask whether to consolidate, strengthen, choose the stable board, choose the aggressive board, or stop.\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "WORKSPACE_REENTRY_POLICY.md",
        "# Workspace Reentry Policy\n\n## Objective\n\nDo not assume that an existing scaffolded workspace should simply continue as-is.\n\n## Rule\n\nWhen a workspace already exists and is only partially complete, ask the user whether to:\n\n1. `continue_current_workspace`\n2. `repair_current_workspace`\n3. `rebuild_generated_scaffold_keep_raw_corpus`\n4. `stop`\n\n## Scope\n\nRebuild applies to generated protocol, prompt, and control artifacts. It does not authorize deleting raw materials, retained evidence, or user-created notes.\n\n## Control File\n\nRecord the choice in `..\\06_reports\\REENTRY_DECISION.md`.\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "USER_REENTRY_PROMPTS.md",
        "# User Reentry Prompts\n\n## Purpose\n\nGive the user a visible choice whenever a scaffolded workspace already exists but may be stale, partial, or inconsistent.\n\n## User Prompt\n\n```text\nThis project already contains a scaffolded or partially completed research workspace.\n\nPlease choose one:\n1. continue_current_workspace\n2. repair_current_workspace\n3. rebuild_generated_scaffold_keep_raw_corpus\n4. stop\n\nUse continue when the current scaffold is sound enough to keep.\nUse repair when the scaffold is mostly right but some artifacts need correction.\nUse rebuild when the generated protocol and prompt layers should be refreshed, while keeping the raw corpus and non-generated research materials.\n\nRecord the final choice in REENTRY_DECISION.md before proceeding.\n```\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "DIRECTION_DEPTH_POLICY.md",
        "# Direction Depth Policy\n\n## Objective\n\nMake direction selection, deep-dive intensity, and search-budget intent explicit before long deep cycles begin.\n\n## Control File\n\nUse `..\\06_reports\\DIRECTION_DEPTH_PLAN.csv` as the machine-readable control surface for Gate B approval.\n\n## Allowed selected_state values\n\n1. `advance_now`\n2. `defer`\n3. `strengthen_before_promotion`\n\n## Allowed depth_profile values\n\n1. `light_validate`\n2. `standard_deep`\n3. `aggressive_frontier`\n4. `not_applicable` for directions that do not advance now\n\n## Budget semantics\n\n1. `allowed_round_budget` is the intended discovery or validation round budget for the direction\n2. `allowed_cycle_budget` is the intended count of longer deep cycles for the direction\n3. use explicit numbers when the user has chosen them; otherwise record `pending_user_choice`\n\n## Rule\n\nDo not begin long deep cycles for any direction until the user choice is visible in `DIRECTION_SELECTION.md`, `DEEP_DIVE_SELECTION.md`, and `DIRECTION_DEPTH_PLAN.csv`.\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "FOCUSED_STRENGTHENING_POLICY.md",
        "# Focused Strengthening Policy\n\n## Objective\n\nLet the user choose exactly which directions, datasets, papers, or claim bundles should receive extra strengthening work before scope broadens.\n\n## Control Files\n\n1. `..\\06_reports\\FOCUSED_STRENGTHENING_SELECTION.md`\n2. `..\\06_reports\\FOCUSED_STRENGTHENING_PLAN.csv`\n\n## Allowed focus_type values\n\n1. `direction`\n2. `dataset`\n3. `paper`\n4. `claim_bundle`\n\n## Rule\n\nIf the user chooses strengthen, do not broaden outward search arbitrarily. Follow the explicit strengthening targets and goals first.\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "CHECKPOINT_RESPONSE_LOG.md",
        "# Checkpoint Response Log\n\n| Gate | Current State | Recommended Next Step | User Decision | Notes |\n|---|---|---|---|---|\n| A | pending | pending | pending | |\n| B | pending | pending | pending | |\n| C | pending | pending | pending | |\n| D | pending | pending | pending | |\n\n## Usage\n\nUpdate this file whenever the coordinator stops at a major phase boundary and asks the user whether to consolidate, strengthen, choose a route board when applicable, proceed, or stop.\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "PHASE_STATE.md",
        "# Phase State\n\ncurrent_phase: audit_ready\ncurrent_gate: A\nstate_status: pending_user_decision\nready_now: pending\nnot_ready: pending\nrecommended_default: consolidate\nallowed_next_actions: consolidate, strengthen, choose_stable_mode, choose_aggressive_mode, proceed, stop\nblocking_conditions: none_recorded_yet\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "UNIFIED_BROADCAST_PROMPT.md",
        "# Unified Broadcast Prompt\n\nRead your owned prompt and local task interface first.\n\nCurrent phase: <phase_state>\nCurrent gate: <gate_id>\nCurrent mode: <consolidate|strengthen|choose_stable_mode|choose_aggressive_mode|proceed|stop>\n\nAuthoritative files:\n1. <file_a>\n2. <file_b>\n\nRequired action:\n1. update only your owned outputs\n2. record evidence and conflicts explicitly\n3. do not silently advance the next phase\n4. if your work changes phase readiness, update the coordinator-facing checkpoint files\n\nDo not touch:\n1. other worker folders\n2. shared files you do not own\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "USER_CHECKPOINT_PROMPTS.md",
        "# User Checkpoint Prompts\n\n## Gate A User Prompt\n\nPurpose: decide what to do after project traversal and existing-content audit.\n\nRecommended default: consolidate if the audit already surfaced clear conflicts or stale assumptions; strengthen if the current inventory still looks unreliable.\n\nOption impact:\n1. consolidate: freeze the current audit and summarize what is already known\n2. strengthen: continue verifying the existing corpus before broadening scope\n3. proceed: move into direction discovery now\n4. stop: pause for review\n\n```text\nWe finished project traversal and the existing-content audit.\n\nRecommended default: consolidate if you want the current audit summarized first, or strengthen if you want more verification before broadening scope.\n\nCurrent options:\n1. consolidate the current understanding\n2. strengthen the audit with more verification\n3. proceed into direction discovery\n4. stop for review\n```\n\n## Gate A Coordinator Prompt\n\n```text\nCurrent gate: A\nReady now: project traversal and existing-content audit are complete\nNot ready: broad outward discovery is not yet approved\nRecommended default: consolidate\nAsk the user whether to consolidate, strengthen, proceed into discovery, or stop\n```\n\n## Gate A Broadcast Prompt\n\n```text\nCurrent phase: audit_ready\nCurrent gate: A\nCurrent mode: wait_for_user_decision\n\nAll workers: do not move into discovery until the user chooses consolidate, strengthen, proceed, or stop.\n```\n\n## Gate B User Prompt\n\nPurpose: decide what to do after the first direction map is ready and before deep multi-direction work begins.\n\nRecommended default: consolidate when the direction map still needs user review; strengthen when weak directions still need cleanup before budget is assigned.\n\nOption impact:\n1. consolidate: freeze and review the first direction map before assigning deep-work budget\n2. strengthen: improve weak or ambiguous directions before any long deep cycle starts\n3. proceed: choose which directions move forward now, what deep-dive intensity each chosen direction should use, and what budget each chosen direction is allowed to consume\n4. stop: pause for review\n\n```text\nWe finished direction discovery and the first direction map is ready.\n\nRecommended default: consolidate if you want to review the direction map first, or strengthen if weak directions still need cleanup.\n\nIf you proceed, also choose:\n1. which directions move forward now\n2. which directions stay deferred\n3. which directions need strengthening before promotion\n4. whether each chosen direction uses light_validate, standard_deep, or aggressive_frontier\n5. the allowed round budget and allowed cycle budget for each chosen direction\n\nRecord those choices in:\n1. DIRECTION_SELECTION.md\n2. DEEP_DIVE_SELECTION.md\n3. DIRECTION_DEPTH_PLAN.csv\n\nCurrent options:\n1. freeze the direction map and review it\n2. strengthen weak or ambiguous directions\n3. proceed into user-selected deep search with explicit per-direction depth choices and budget intent\n4. stop for review\n```\n\n## Gate B Coordinator Prompt\n\n```text\nCurrent gate: B\nReady now: direction discovery and the first direction map are complete\nNot ready: deep multi-direction search is not yet approved\nRecommended default: consolidate\nIf the user proceeds, require direction and depth choices through DIRECTION_SELECTION.md, DEEP_DIVE_SELECTION.md, and DIRECTION_DEPTH_PLAN.csv before long deep cycles start\nAsk the user whether to consolidate, strengthen, proceed into deep search with explicit direction, depth, and budget choices, or stop\n```\n\n## Gate B Broadcast Prompt\n\n```text\nCurrent phase: direction_map_ready\nCurrent gate: B\nCurrent mode: wait_for_user_decision\n\nAll workers: do not move into deep search until the user chooses consolidate, strengthen, proceed, or stop.\nIf the user proceeds, do not begin long deep cycles until DIRECTION_SELECTION.md, DEEP_DIVE_SELECTION.md, and DIRECTION_DEPTH_PLAN.csv record explicit user choices.\n```\n\n## Gate C User Prompt\n\nPurpose: decide what to do after deep search and conflict adjudication.\n\nRecommended default: consolidate when the retained findings are strong enough to summarize; strengthen when specific directions still need more evidence.\n\nOption impact:\n1. consolidate: summarize current findings into a report\n2. strengthen: deepen or expand specific directions first\n3. proceed: move into workspace scaffolding and prompt-pack generation\n4. stop: pause for review\n\n```text\nWe finished deep search and conflict adjudication.\n\nRecommended default: consolidate if you want a report first, or strengthen if specific directions still need more work.\n\nCurrent options:\n1. consolidate findings into a report\n2. strengthen or expand specific directions\n3. proceed into workspace scaffolding and prompt-pack generation\n4. stop for review\n```\n\n## Gate C Coordinator Prompt\n\n```text\nCurrent gate: C\nReady now: deep search and conflict adjudication are complete\nNot ready: scaffolding or execution planning is not yet approved\nRecommended default: consolidate\nAsk the user whether to consolidate, strengthen, scaffold, or stop\n```\n\n## Gate C Broadcast Prompt\n\n```text\nCurrent phase: deep_search_ready\nCurrent gate: C\nCurrent mode: wait_for_user_decision\n\nAll workers: do not move into scaffolding or execution planning until the user chooses consolidate, strengthen, proceed, or stop.\n```\n\n## Gate D User Prompt\n\nPurpose: decide what to do after validation planning and route-board split.\n\nRecommended default: consolidate when you want the validation slate reviewed first; strengthen when the board split or execution readiness still looks shaky.\n\nOption impact:\n1. consolidate: summarize and review the validation slate and route boards\n2. strengthen: revise validation logic, ranking, or route readiness before launch\n3. choose_stable_mode: move forward with the lower-risk stable board\n4. choose_aggressive_mode: move forward with the higher-upside aggressive board\n5. stop: pause for review\n\n```text\nWe finished validation planning and split the retained routes into stable and aggressive boards.\n\nRecommended default: consolidate if you want to review the boards first, or strengthen if execution readiness still needs work.\n\nCurrent options:\n1. consolidate the validation slate and route boards\n2. strengthen or revise the plan\n3. choose the stable board for lower-risk execution\n4. choose the aggressive board for higher-upside execution\n5. stop for review\n```\n\n## Gate D Coordinator Prompt\n\n```text\nCurrent gate: D\nReady now: validation planning is complete and stable/aggressive boards exist\nNot ready: execution is not yet approved\nRecommended default: consolidate\nAsk the user whether to consolidate, strengthen, choose the stable board, choose the aggressive board, or stop\n```\n\n## Gate D Broadcast Prompt\n\n```text\nCurrent phase: validation_plan_ready\nCurrent gate: D\nCurrent mode: wait_for_user_decision\n\nAll workers: do not move into stable-board or aggressive-board execution until the user chooses consolidate, strengthen, choose_stable_mode, choose_aggressive_mode, or stop.\n```\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "USER_FOCUSED_STRENGTHENING_PROMPTS.md",
        "# User Focused Strengthening Prompts\n\n## Purpose\n\nGive the user a direct way to choose what should be reinforced before the program broadens or deepens.\n\n## User Prompt\n\n```text\nYou chose strengthen mode.\n\nPlease specify what should be strengthened first. You can target one or more of:\n1. directions\n2. datasets\n3. papers\n4. claim bundles\n\nFor each target, record:\n1. focus_type\n2. focus_name\n3. strengthen_goal\n4. evidence_gap\n5. preferred_action\n6. priority\n7. notes\n\nRecord the final choice in:\n1. FOCUSED_STRENGTHENING_SELECTION.md\n2. FOCUSED_STRENGTHENING_PLAN.csv\n\nDo not broaden scope until those strengthening targets are explicit.\n```\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "USER_DIRECTION_DEPTH_PROMPTS.md",
        "# User Direction Depth Prompts\n\n## Purpose\n\nGive the user one visible, copy-paste-ready surface for choosing which directions advance, how deeply each chosen direction should be pursued, and what budget intent each chosen direction should carry.\n\n## User Prompt\n\n```text\nWe are at the direction-and-depth checkpoint.\n\nPlease decide for each direction:\n1. selected_state: advance_now, defer, or strengthen_before_promotion\n2. depth_profile: light_validate, standard_deep, aggressive_frontier, or not_applicable\n3. allowed_round_budget\n4. allowed_cycle_budget\n5. notes or constraints\n\nRecord the final choices in:\n1. DIRECTION_SELECTION.md\n2. DEEP_DIVE_SELECTION.md\n3. DIRECTION_DEPTH_PLAN.csv\n\nDo not start long deep cycles for any direction until those three files reflect the final user choice.\n```\n\n## Prompt Purpose Summary\n\n1. `advance_now` means the direction can consume active deep-work budget now\n2. `defer` means the direction stays visible but does not consume long deep-work budget yet\n3. `strengthen_before_promotion` means the direction needs more cleanup or verification before a long deep cycle\n4. `light_validate`, `standard_deep`, and `aggressive_frontier` separate conservative versus frontier-style depth choices\n\n## Recording Rule\n\nIf the user gives partial direction or depth guidance in chat, normalize the final result into `DIRECTION_DEPTH_PLAN.csv` instead of leaving the budget contract implicit in prose only.\n",
        overwrite=overwrite_generated,
    )
    if experimental_autonomy:
        write_text(
            protocol_dir / "EXPERIMENTAL_AUTONOMY_CONSENT.md",
            "# Experimental Autonomy Consent\n\n## Warning\n\nThis workspace is using an experimental autonomy pilot. It is not the default or safest mode.\n\n## User Consent\n\nRecord the exact user approval here before hands-off progression begins.\n\n## Scope Boundaries\n\nRecord what phases, files, or actions the agent may handle without waiting at every gate.\n\n## Required Manual Stops\n\nRecord the gates or events that still require explicit user review even in this pilot.\n\n## Stop Conditions\n\nRecord hard stops such as destructive actions, major scope jumps, unstable route choice without user approval, or missing evidence.\n",
            overwrite=overwrite_generated,
        )
        write_text(
            protocol_dir / "AUTONOMY_STATUS.md",
            "# Autonomy Status\n\nautonomy_mode: enabled_with_user_consent\nautonomy_warning_acknowledged: pending\nautonomy_user_consent: pending\nautonomy_scope_boundaries: pending\nautonomy_required_manual_stops: pending\nautonomy_stop_conditions: pending\nautonomy_current_authority: coordinator_within_approved_scope\nautonomy_last_manual_gate: pending\nautonomy_next_mandatory_review: pending\n",
            overwrite=overwrite_generated,
        )
    write_text(
        protocol_dir / "QUALITY_GATE.md",
        "# Quality Gate\n\nA direction counts as complete_hq only when retained evidence is strong, source trust is explicit, conflicts are handled, and every conclusion changes a validation or experiment decision.\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "AUTHORITY_LADDER.md",
        "# Authority Ladder\n\n1. domain-leading peer-reviewed journals, flagship conference proceedings, or official standards when the field uses them as primary authority\n2. strong peer-reviewed journals, respected lab or institution reports, and practitioner research with transparent methods and provenance\n3. direct same-domain or same-environment studies with clear sample design or evaluation protocol\n4. strong working papers, preprints, or benchmark-owner publications from recognized institutions, retained only with explicit caveats\n5. discovery indexes, search engines, and aggregators for routing only\n6. unreviewed or weakly sourced material only as inspiration, not as stand-alone core evidence\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "WORKER_FILE_CONTRACT.md",
        "# Worker File Contract\n\nResearch lanes require direction_report.md, quality_audit.md, round_log.csv, source_index.csv, evidence_matrix.csv, and experiment_hypotheses.csv. Coordinator and master-table roles require their role-specific extras.\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "TASK_INTERFACE_CONTRACT.md",
        "# Task Interface Contract\n\nEvery worker folder should contain task_interface.md with sections for role, owned scope, inputs, outputs, done when, and do not touch.\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "WINDOW_ROLE_MAP.md",
        build_window_role_map(workers),
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "WINDOW_PROMPTS.md",
        "# Window Prompts\n\nUse the detailed files under `00_protocol/prompts/` as the operational launch pack.\n\n## Shared instruction\n\n1. Improve the target research objective or downstream decision program, not generic scholarship.\n2. Keep only authoritative or clearly graded evidence.\n3. Map every retained claim to signal or feature, rule or filter, target or label, model or method, routing or control logic, output or selection layer, validation design, or explicit rejection.\n4. Work only in your own folder.\n5. Quarantine weak or suspicious material instead of silently deleting it.\n6. Finish 10 discovery rounds before asking for deep-cycle promotion.\n7. Do not silently advance the overall program into the next major phase; stop at the user decision gate.\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "DISPOSITION_POLICY.md",
        "# Disposition Policy\n\nUse retain_core, retain_support, reject_off_target, reject_weak_evidence, reject_duplicate, quarantine_suspicious, or needs_manual_review. Do not silently delete ambiguous material.\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "BROADCAST_EXPANSION.md",
        "# Broadcast Expansion Instruction\n\n1. Read the local protocol files first.\n2. Stay in your own folder.\n3. Grade evidence explicitly.\n4. Quarantine weak or suspicious material instead of deleting it silently.\n",
        overwrite=overwrite_generated,
    )
    write_text(
        protocol_dir / "WINDOW_COUNT_GUIDANCE.md",
        f"# Window Count Guidance\n\n## Active profile\n\n`{profile_name}`\n\n## Default recommendation\n\n1. use {profile['recommended_window_count']} for the active research program\n2. add {profile['optional_window_count']} only after the core windows are stable\n3. do not increase window count before the coordinator and master-table lanes are synchronized\n",
        overwrite=overwrite_generated,
    )

    write_csv(root / "05_master_tables" / "master_source_index.csv", CSV_SCHEMAS["05_master_tables/master_source_index.csv"])
    write_csv(root / "05_master_tables" / "direction_scoreboard.csv", CSV_SCHEMAS["05_master_tables/direction_scoreboard.csv"])
    write_csv(root / "05_master_tables" / "research_to_experiment_matrix.csv", CSV_SCHEMAS["05_master_tables/research_to_experiment_matrix.csv"])
    write_text_if_missing(
        root / "06_reports" / "final_technical_report.md",
        "# Final Technical Report\n\n## Objective\n\n## Strongest Retained Evidence\n\n## Conflicts and Adjudication\n\n## Validation Schemes\n\n## Immediate Next Actions\n\n## Deferred Items\n",
    )
    write_text_if_missing(
        root / "06_reports" / "NEXT_USER_DECISION.md",
        "# Next User Decision\n\n## Current Gate\n\n## What Is Ready\n\n## What Is Not Ready\n\n## Recommended Default\n\n## Recommended Options\n\n1. consolidate\n2. strengthen\n3. choose_stable_mode\n4. choose_aggressive_mode\n5. proceed\n6. stop\n\n## User Decision\n\n## Notes For User\n",
    )
    write_text_if_missing(
        root / "06_reports" / "REENTRY_DECISION.md",
        "# Reentry Decision\n\n## Purpose\n\nMake the user choose how to handle an existing scaffolded or partially completed workspace.\n\n## Current Workspace State\n\n## Recommended Default\n\n## Options\n\n1. continue_current_workspace\n2. repair_current_workspace\n3. rebuild_generated_scaffold_keep_raw_corpus\n4. stop\n\n## User Decision\n\n## Notes\n\n```text\nThis workspace already exists. Please choose whether to continue it, repair it in place, rebuild generated scaffold artifacts while keeping the raw corpus, or stop.\n```\n",
    )
    write_text_if_missing(
        root / "06_reports" / "STABLE_ROUTE_BOARD.md",
        "# Stable Route Board\n\n## Direct Evidence First\n\n## Lower-Risk Options\n\n## Immediate Stable Candidates\n",
    )
    write_text_if_missing(
        root / "06_reports" / "AGGRESSIVE_ROUTE_BOARD.md",
        "# Aggressive Route Board\n\n## Higher-Upside Options\n\n## Transfer-Heavy Or Novel Routes\n\n## Extra Validation Requirements\n\n## Deferred Or Stretch Candidates\n",
    )
    write_text_if_missing(
        root / "06_reports" / "DIRECTION_SELECTION.md",
        "# Direction Selection\n\n## Purpose\n\nChoose which discovered directions move forward now instead of deepening every direction uniformly.\n\n## Candidate Directions\n\n## Recommended Core Directions\n\n## Recommended Deferred Directions\n\n## User Choice\n\n## Notes\n\n```text\nWe finished direction discovery.\n\nPlease choose:\n1. which directions move forward now\n2. which directions stay deferred\n3. which directions need strengthening before promotion\n```\n",
    )
    write_text_if_missing(
        root / "06_reports" / "DEEP_DIVE_SELECTION.md",
        "# Deep Dive Selection\n\n## Purpose\n\nChoose how deeply each selected direction should be pursued before large search or validation budgets are spent.\n\n## Selected Directions\n\n## Suggested Depth Profiles\n\n1. light_validate\n2. standard_deep\n3. aggressive_frontier\n\n## User Choice\n\n## Notes\n\n```text\nFor the directions that move forward, please choose one depth profile for each:\n1. light_validate\n2. standard_deep\n3. aggressive_frontier\n```\n",
    )
    write_csv(root / "06_reports" / "DIRECTION_DEPTH_PLAN.csv", CSV_SCHEMAS["06_reports/direction_depth_plan.csv"])
    write_text_if_missing(
        root / "06_reports" / "FOCUSED_STRENGTHENING_SELECTION.md",
        "# Focused Strengthening Selection\n\n## Purpose\n\nChoose exactly which directions, datasets, papers, or claim bundles should be strengthened before the program broadens.\n\n## Candidate Strengthening Targets\n\n## Recommended Targets\n\n## User Choice\n\n## Notes\n\n```text\nPlease choose which directions, datasets, papers, or claim bundles should be strengthened first, and record the reasons in the strengthening plan.\n```\n",
    )
    write_csv(root / "06_reports" / "FOCUSED_STRENGTHENING_PLAN.csv", CSV_SCHEMAS["06_reports/focused_strengthening_plan.csv"])
    write_text_if_missing(
        root / "06_reports" / "credibility" / "README.md",
        "# Credibility Reports\n\nStore source-level or claim-bundle credibility score outputs here when explicit trust scoring is used.\n",
    )

    all_prompts = ["# All Windows Prompt Pack", "", f"Use the sections below to dispatch prompts for profile `{profile_name}`."]
    for folder_name, role_name in workers.items():
        prompt_file = prompts_dir / f"{folder_name}.md"
        prompt_text = build_window_prompt(folder_name, role_name, focus[folder_name], profile_name)
        write_text(prompt_file, prompt_text, overwrite=overwrite_generated)
        all_prompts.extend(["", f"## {folder_name}", "", prompt_text])

    write_text(protocol_dir / "ALL_WINDOWS_PROMPT_PACK.md", "\n".join(all_prompts) + "\n", overwrite=overwrite_generated)

    for folder_name, role_name in workers.items():
        folder = root / "01_window_runs" / folder_name
        folder.mkdir(parents=True, exist_ok=True)
        outputs = ["direction_report.md", "quality_audit.md"]
        if folder_name == "W01_coordinator":
            outputs.extend(["coordinator_log.md", "final_report_outline.md"])
        elif folder_name == "W02_master_tables":
            outputs.append("master_sync_log.md")
        else:
            outputs.extend(["round_log.csv", "source_index.csv", "evidence_matrix.csv", "experiment_hypotheses.csv"])
        write_text_if_missing(folder / "direction_report.md", f"# {folder_name}\n\n## Role\n\n{role_name}\n\n## Strongest Retained Evidence\n\n## Conflicts and Adjudication\n\n## Validation Schemes\n\n## Immediate Next Actions\n\n## Deferred Items\n")
        write_text_if_missing(folder / "quality_audit.md", "# Quality Audit\n\n## Status\n\n## Gaps\n\n## Repairs\n")
        write_text_if_missing(folder / "task_interface.md", build_task_interface(folder_name, role_name, outputs))

        if folder_name == "W01_coordinator":
            write_text_if_missing(
                folder / "coordinator_log.md",
                "# Coordinator Log\n\n## Current Phase\n\n## Ready Now\n\n## Not Ready\n\n## Recommended Next User Decision\n\n## Notes\n",
            )
            write_text_if_missing(
                folder / "final_report_outline.md",
                "# Final Report Outline\n\n## Executive Judgment\n\n## Current Route Board\n\n## Conflicts To Surface\n\n## Next User Decision\n",
            )
            continue

        if folder_name == "W02_master_tables":
            write_text_if_missing(folder / "master_sync_log.md", "# Master Sync Log\n")
            continue

        write_csv(folder / "round_log.csv", CSV_SCHEMAS["worker/round_log.csv"])
        write_csv(folder / "source_index.csv", CSV_SCHEMAS["worker/source_index.csv"])
        write_csv(folder / "evidence_matrix.csv", CSV_SCHEMAS["worker/evidence_matrix.csv"])
        write_csv(folder / "experiment_hypotheses.csv", CSV_SCHEMAS["worker/experiment_hypotheses.csv"])


def write_csv(path: Path, columns: list[str]) -> None:
    if path.exists():
        return
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()


def write_text_if_missing(path: Path, text: str) -> None:
    if path.exists():
        return
    path.write_text(text, encoding="utf-8")


def write_text(path: Path, text: str, overwrite: bool) -> None:
    if path.exists() and not overwrite:
        return
    path.write_text(text, encoding="utf-8")


def build_window_role_map(workers: dict[str, str]) -> str:
    lines = ["# Window Role Map", "", "| Window | Folder | Role |", "|---|---|---|"]
    for folder_name, role_name in workers.items():
        window_id = folder_name.split("_", 1)[0]
        lines.append(f"| {window_id} | 01_window_runs/{folder_name} | {role_name} |")
    return "\n".join(lines) + "\n"


def build_window_prompt(folder_name: str, role_name: str, focus: str, profile_name: str) -> str:
    profile = get_profile(profile_name)
    role_notes = profile["role_notes"][folder_name]

    outputs = ["direction_report.md", "quality_audit.md"]
    if folder_name == "W01_coordinator":
        outputs.extend(["coordinator_log.md", "final_report_outline.md"])
    elif folder_name == "W02_master_tables":
        outputs.append("master_sync_log.md")
    else:
        outputs.extend(["round_log.csv", "source_index.csv", "evidence_matrix.csv", "experiment_hypotheses.csv"])

    output_lines = "\n".join(f"{index}. {name}" for index, name in enumerate(outputs, start=1))
    role_note_lines = "\n".join(f"{index}. {note}" for index, note in enumerate(role_notes, start=1))

    return f"# {folder_name} Prompt\n\nYou are {folder_name}.\n\n## Role\n\n{role_name}\n\n## Profile\n\n`{profile_name}`\n\n## Owned folder\n\n`01_window_runs/{folder_name}`\n\n## Read first\n\n1. `00_protocol/SEARCH_OBJECTIVE.md`\n2. `00_protocol/EXISTING_CONTENT_AUDIT.md`\n3. `00_protocol/USER_DECISION_GATES.md`\n4. `00_protocol/QUALITY_GATE.md`\n5. `00_protocol/AUTHORITY_LADDER.md`\n6. `00_protocol/WORKER_FILE_CONTRACT.md`\n7. `00_protocol/TASK_INTERFACE_CONTRACT.md`\n8. `00_protocol/WINDOW_ROLE_MAP.md`\n9. `00_protocol/DISPOSITION_POLICY.md`\n10. `00_protocol/BROADCAST_EXPANSION.md`\n11. `00_protocol/DIRECTION_DEPTH_POLICY.md`\n12. `00_protocol/FOCUSED_STRENGTHENING_POLICY.md`\n13. `00_protocol/WORKSPACE_REENTRY_POLICY.md`\n\n## Focus\n\n{focus}\n\n## Role-specific priorities\n\n{role_note_lines}\n\n## Rules\n\n1. Improve the target research objective or downstream decision program, not generic scholarship.\n2. Work only in your own folder.\n3. Keep only authoritative or clearly graded evidence.\n4. Prefer direct same-domain evidence whenever possible.\n5. Map every retained claim to signal or feature, rule or filter, target or label, model or method, routing or control logic, output or selection layer, validation design, or explicit rejection.\n6. Quarantine weak or suspicious material instead of silently deleting it.\n7. Record contradictions explicitly and adjudicate them.\n8. Do not silently advance the overall program into the next major phase; escalate readiness to the coordinator and wait for the user-facing checkpoint.\n\n## User-facing checkpoint rule\n\nWhen your work makes the next phase possible, update local evidence and then stop. Do not assume approval for the next phase. The coordinator or user must explicitly choose whether to consolidate, strengthen, choose a route board when applicable, proceed, or stop.\n\n## Workspace reentry rule\n\nIf the workspace already exists and is only partly complete, do not assume continuation. Follow the explicit reentry choice recorded in `06_reports/REENTRY_DECISION.md` before broadening or rebuilding generated scaffold artifacts.\n\n## Direction and depth gate rule\n\nIf the next phase would allocate long deep-search budget, do not begin long deep cycles until the user-facing files `06_reports/DIRECTION_SELECTION.md`, `06_reports/DEEP_DIVE_SELECTION.md`, and `06_reports/DIRECTION_DEPTH_PLAN.csv` record explicit choices for direction selection, deep-dive intensity, and budget intent.\n\n## Focused strengthening rule\n\nIf the current mode is strengthen, do not broaden scope arbitrarily. Follow the explicit targets recorded in `06_reports/FOCUSED_STRENGTHENING_SELECTION.md` and `06_reports/FOCUSED_STRENGTHENING_PLAN.csv`.\n\n## Existing content audit rule\n\nIf the project already contains research notes, reports, or prior conclusions in your direction, do not trust them automatically. Verify those claims against authoritative external evidence before treating them as retained knowledge.\n\n## Literature-only rule\n\nUnless the user explicitly asks for engineering or execution, stay in source-accumulation and validation-placeholder mode. Do not write implementation code or run experiments from this window.\n\n## Evidence ladder\n\n1. direct same-domain, same-task, similar-scope evidence\n2. direct adjacent-setting evidence\n3. strong transfer evidence from nearby domains\n4. broad survey or architectural background\n\n## Promotion threshold\n\nOnly ask for long deep-cycle promotion after the direction reaches an average score `>= 4.0` across relevance, directness, evidence strength, feasibility, and expected upside.\n\n## Disposition states\n\nUse only:\n\n1. retain_core\n2. retain_support\n3. reject_off_target\n4. reject_weak_evidence\n5. reject_duplicate\n6. quarantine_suspicious\n7. needs_manual_review\n\n## Required outputs\n\n{output_lines}\n\n## Minimum file contract\n\nYour role is not structurally ready unless every required file for this role exists and is kept current.\n\n## Round output standard\n\nEvery real discovery round should leave behind:\n\n1. one search question\n2. one query set\n3. a candidate-source set\n4. retained items\n5. one experimentable or validation-relevant conclusion\n6. one next action\n\n## Direction report contract\n\nYour `direction_report.md` must end in this shape:\n\n1. objective\n2. strongest retained evidence\n3. conflicts and adjudication\n4. executable validation schemes or validation placeholders\n5. immediate next actions\n6. deferred items\n\n## Quality audit contract\n\nYour `quality_audit.md` must contain:\n\n1. status\n2. gaps\n3. repairs\n\n## Search cadence\n\n1. complete 10 discovery rounds first\n2. score the direction before any long deep cycle\n3. only continue into 50-round deep cycles if the direction is strong enough\n4. stop deep cycles when evidence gain is genuinely exhausted\n"


def build_task_interface(folder_name: str, role_name: str, outputs: list[str]) -> str:
    output_lines = "\n".join(f"{index}. {name}" for index, name in enumerate(outputs, start=1))
    return f"# Task Interface\n\n## Role\n\n{role_name}\n\n## Owned Scope\n\nThis folder owns only `01_window_runs/{folder_name}` and its structured outputs.\n\n## Inputs\n\n1. protocol files under `00_protocol/`\n2. routed research materials relevant to this direction\n3. coordinator or master-table decisions when applicable\n\n## Outputs\n\n{output_lines}\n\n## Done When\n\n1. required files exist and are current\n2. retained evidence is structured and graded\n3. contradictions are logged or adjudicated\n4. the direction report ends in a clear decision shape\n\n## Do Not Touch\n\n1. other worker folders\n2. shared master tables unless your role explicitly owns them\n3. unrelated files outside your owned scope\n"


if __name__ == "__main__":
    main()
