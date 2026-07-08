#!/usr/bin/env python3
"""Create a lightweight research workspace scaffold."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path


FOCUSED_STRENGTHENING_COLUMNS = ["focus_type", "focus_name", "strengthen_goal", "evidence_gap", "preferred_action", "priority", "notes"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Initialize a lightweight research workspace")
    parser.add_argument("--root", required=True)
    args = parser.parse_args()

    root = Path(args.root)
    root.mkdir(parents=True, exist_ok=True)

    for name in ["00_raw", "01_index", "02_retained", "03_output"]:
        (root / name).mkdir(parents=True, exist_ok=True)

    write_csv(root / "01_index" / "source_index.csv", ["source_id", "title", "author_or_org", "year", "source_type", "stable_link", "topic", "status"])
    write_csv(root / "02_retained" / "retained_evidence.csv", ["source_id", "claim", "study_context", "method_summary", "evidence_strength", "transferability", "risk_or_limitation"])
    write_csv(root / "03_output" / "action_map.csv", ["source_id", "action_type", "proposed_action", "confidence", "validation_needed", "priority"])
    write_csv(root / "03_output" / "focused_strengthening_plan.csv", FOCUSED_STRENGTHENING_COLUMNS)
    memo = root / "03_output" / "summary_memo.md"
    if not memo.exists():
        memo.write_text("# Summary Memo\n\n## Main Question\n\n## Strongest Evidence\n\n## Immediate Actions\n\n## Deferred Actions\n\n## Risks\n", encoding="utf-8")
    next_user_decision = root / "03_output" / "NEXT_USER_DECISION.md"
    if not next_user_decision.exists():
        next_user_decision.write_text(
            "# Next User Decision\n\n## Current Lite Result\n\n## Recommended Default\n\n## Recommended Options\n\n1. consolidate\n2. strengthen\n3. choose_stable_mode\n4. choose_aggressive_mode\n5. move_into_full_pipeline\n6. stop\n\n## User Decision\n",
            encoding="utf-8",
        )
    reentry_decision = root / "03_output" / "REENTRY_DECISION.md"
    if not reentry_decision.exists():
        reentry_decision.write_text(
            "# Reentry Decision\n\n## Purpose\n\nMake the user choose how to handle an existing scaffolded or partially completed lite workspace.\n\n## Current Workspace State\n\n## Recommended Default\n\n## Options\n\n1. continue_current_workspace\n2. repair_current_workspace\n3. rebuild_generated_scaffold_keep_raw_corpus\n4. stop\n\n## User Decision\n\n## Notes\n",
            encoding="utf-8",
        )
    phase_state = root / "03_output" / "PHASE_STATE.md"
    if not phase_state.exists():
        phase_state.write_text(
            "# Phase State\n\ncurrent_phase: lite_summary_ready\nstate_status: pending_user_decision\nrecommended_default: consolidate\nallowed_next_actions: consolidate, strengthen, choose_stable_mode, choose_aggressive_mode, move_into_full_pipeline, stop\n",
            encoding="utf-8",
        )
    control_center = root / "03_output" / "LITE_CONTROL_CENTER.md"
    if not control_center.exists():
        control_center.write_text(
            "# Lite Control Center\n\n## Current Operating Posture\n\n1. current phase: see `PHASE_STATE.md`\n2. next user decision: see `NEXT_USER_DECISION.md`\n\n## Primary Operator Files\n\n1. `summary_memo.md`\n2. `NEXT_USER_DECISION.md`\n3. `REENTRY_DECISION.md`\n4. `PHASE_STATE.md`\n5. `USER_CHECKPOINT_PROMPTS.md`\n6. `USER_REENTRY_PROMPTS.md`\n7. `USER_FOCUSED_STRENGTHENING_PROMPTS.md`\n8. `UNIFIED_BROADCAST_PROMPT.md`\n9. `STABLE_OPTIONS.md`\n10. `AGGRESSIVE_OPTIONS.md`\n11. `FOCUSED_STRENGTHENING_SELECTION.md`\n12. `focused_strengthening_plan.csv`\n\n## Control Rules\n\n1. do not silently broaden scope\n2. do not move into the full pipeline without an explicit user choice\n3. keep stable and aggressive options separate when both are present\n4. if the user chooses strengthen, ask what specifically should be strengthened first\n5. if the workspace already exists, ask whether to continue, repair, or rebuild generated scaffold artifacts\n\n## Immediate Use\n\n1. read `summary_memo.md`\n2. read `NEXT_USER_DECISION.md`\n3. if resuming a half-finished lite workspace, review `REENTRY_DECISION.md` first\n4. if strengthen mode is next, review `FOCUSED_STRENGTHENING_SELECTION.md` and `focused_strengthening_plan.csv`\n5. send the copy-paste prompt from `USER_CHECKPOINT_PROMPTS.md`\n",
            encoding="utf-8",
        )
    checkpoint_prompts = root / "03_output" / "USER_CHECKPOINT_PROMPTS.md"
    if not checkpoint_prompts.exists():
        checkpoint_prompts.write_text(
            "# User Checkpoint Prompts\n\n## Lite Prompt\n\nPurpose: decide what to do after the first lite summary is ready.\n\nRecommended default: consolidate if the shortlist is already useful; strengthen if the evidence still feels thin.\n\nOption impact:\n1. consolidate: freeze the current lite result and use it as the working summary\n2. strengthen: improve the evidence base before acting on it, with explicit user-selected strengthening targets\n3. choose_stable_mode: continue with the lower-risk options already supported by direct evidence\n4. choose_aggressive_mode: continue with the higher-upside or more novel options that need more risk tolerance\n5. move_into_full_pipeline: escalate into the full multi-stage research program\n6. stop: pause for review\n\n```text\nWe finished the lite research pass.\n\nRecommended default: consolidate if the current packet is already useful, or strengthen if the evidence still feels thin.\n\nIf you choose strengthen, also specify which directions, datasets, papers, or claim bundles should be reinforced first.\n\nCurrent options:\n1. consolidate the current result\n2. strengthen the evidence base\n3. choose the stable option set\n4. choose the aggressive option set\n5. move into the full research pipeline\n6. stop for review\n```\n",
            encoding="utf-8",
        )
    reentry_prompts = root / "03_output" / "USER_REENTRY_PROMPTS.md"
    if not reentry_prompts.exists():
        reentry_prompts.write_text(
            "# User Reentry Prompts\n\n## Purpose\n\nGive the user a visible choice whenever a lite workspace already exists but may be stale, partial, or inconsistent.\n\n## User Prompt\n\n```text\nThis project already contains a scaffolded or partially completed lite workspace.\n\nPlease choose one:\n1. continue_current_workspace\n2. repair_current_workspace\n3. rebuild_generated_scaffold_keep_raw_corpus\n4. stop\n\nUse continue when the current scaffold is sound enough to keep.\nUse repair when the scaffold is mostly right but some artifacts need correction.\nUse rebuild when the generated lite control artifacts should be refreshed while keeping the raw corpus and non-generated research materials.\n```\n",
            encoding="utf-8",
        )
    strengthening_selection = root / "03_output" / "FOCUSED_STRENGTHENING_SELECTION.md"
    if not strengthening_selection.exists():
        strengthening_selection.write_text(
            "# Focused Strengthening Selection\n\n## Purpose\n\nChoose exactly which directions, datasets, papers, or claim bundles should be strengthened before the lite workflow broadens or escalates.\n\n## Candidate Strengthening Targets\n\n## Recommended Targets\n\n## User Choice\n\n## Notes\n",
            encoding="utf-8",
        )
    strengthening_prompts = root / "03_output" / "USER_FOCUSED_STRENGTHENING_PROMPTS.md"
    if not strengthening_prompts.exists():
        strengthening_prompts.write_text(
            "# User Focused Strengthening Prompts\n\n## Purpose\n\nGive the user a direct way to choose what should be reinforced before the lite workflow broadens or escalates.\n\n## User Prompt\n\n```text\nYou chose strengthen mode.\n\nPlease specify what should be strengthened first. You can target one or more of:\n1. directions\n2. datasets\n3. papers\n4. claim bundles\n\nFor each target, record:\n1. focus_type\n2. focus_name\n3. strengthen_goal\n4. evidence_gap\n5. preferred_action\n6. priority\n7. notes\n\nRecord the final choice in:\n1. FOCUSED_STRENGTHENING_SELECTION.md\n2. focused_strengthening_plan.csv\n```\n",
            encoding="utf-8",
        )
    broadcast_prompt = root / "03_output" / "UNIFIED_BROADCAST_PROMPT.md"
    if not broadcast_prompt.exists():
        broadcast_prompt.write_text(
            "# Unified Broadcast Prompt\n\nCurrent phase: lite_summary_ready\nCurrent mode: wait_for_user_decision\n\nAuthoritative files:\n1. summary_memo.md\n2. NEXT_USER_DECISION.md\n3. PHASE_STATE.md\n\nRequired action:\n1. review the lite result\n2. choose consolidate, strengthen, stable, aggressive, full pipeline, or stop\n3. if strengthen is chosen, ask which directions, datasets, papers, or claim bundles should be reinforced first\n4. if the workspace already exists, ask whether to continue, repair, or rebuild generated scaffold artifacts\n\nDo not silently broaden scope:\n1. do not move into the full pipeline without an explicit user choice\n",
            encoding="utf-8",
        )
    stable_options = root / "03_output" / "STABLE_OPTIONS.md"
    if not stable_options.exists():
        stable_options.write_text(
            "# Stable Options\n\n## Direct Evidence First\n\n## Lower-Risk Choices\n\n## Simpler Next Steps\n",
            encoding="utf-8",
        )
    aggressive_options = root / "03_output" / "AGGRESSIVE_OPTIONS.md"
    if not aggressive_options.exists():
        aggressive_options.write_text(
            "# Aggressive Options\n\n## Higher-Upside Ideas\n\n## More Novel Or Transfer-Heavy Ideas\n\n## Extra Validation Needed\n",
            encoding="utf-8",
        )
    print(root)


def write_csv(path: Path, columns: list[str]) -> None:
    if path.exists():
        return
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()


if __name__ == "__main__":
    main()
