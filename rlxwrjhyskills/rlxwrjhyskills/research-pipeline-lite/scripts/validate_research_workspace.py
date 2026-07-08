#!/usr/bin/env python3
"""Validate a lightweight research workspace scaffold."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path


EXPECTED_HEADERS = {
    "source_index.csv": ["source_id", "title", "author_or_org", "year", "source_type", "stable_link", "topic", "status"],
    "retained_evidence.csv": ["source_id", "claim", "study_context", "method_summary", "evidence_strength", "transferability", "risk_or_limitation"],
    "action_map.csv": ["source_id", "action_type", "proposed_action", "confidence", "validation_needed", "priority"],
    "focused_strengthening_plan.csv": ["focus_type", "focus_name", "strengthen_goal", "evidence_gap", "preferred_action", "priority", "notes"],
}


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python validate_research_workspace.py <workspace_root>")
        sys.exit(1)

    root = Path(sys.argv[1]).resolve()
    checks = {
        "raw_dir_exists": (root / "00_raw").exists(),
        "index_dir_exists": (root / "01_index").exists(),
        "retained_dir_exists": (root / "02_retained").exists(),
        "output_dir_exists": (root / "03_output").exists(),
        "source_index_ok": csv_header_matches(root / "01_index" / "source_index.csv", EXPECTED_HEADERS["source_index.csv"]),
        "retained_evidence_ok": csv_header_matches(root / "02_retained" / "retained_evidence.csv", EXPECTED_HEADERS["retained_evidence.csv"]),
        "action_map_ok": csv_header_matches(root / "03_output" / "action_map.csv", EXPECTED_HEADERS["action_map.csv"]),
        "focused_strengthening_plan_ok": csv_header_matches(root / "03_output" / "focused_strengthening_plan.csv", EXPECTED_HEADERS["focused_strengthening_plan.csv"]),
        "summary_memo_exists": (root / "03_output" / "summary_memo.md").exists(),
        "next_user_decision_exists": (root / "03_output" / "NEXT_USER_DECISION.md").exists(),
        "next_user_decision_sections_ok": markdown_has_sections(root / "03_output" / "NEXT_USER_DECISION.md", ["## Current Lite Result", "## Recommended Default", "## Recommended Options", "## User Decision"]),
        "reentry_decision_exists": (root / "03_output" / "REENTRY_DECISION.md").exists(),
        "reentry_decision_sections_ok": markdown_has_sections(root / "03_output" / "REENTRY_DECISION.md", ["## Purpose", "## Current Workspace State", "## Recommended Default", "## Options", "## User Decision", "## Notes", "continue_current_workspace", "repair_current_workspace", "rebuild_generated_scaffold_keep_raw_corpus"]),
        "phase_state_exists": (root / "03_output" / "PHASE_STATE.md").exists(),
        "phase_state_fields_ok": lite_phase_state_fields_ok(root / "03_output" / "PHASE_STATE.md"),
        "control_center_exists": (root / "03_output" / "LITE_CONTROL_CENTER.md").exists(),
        "control_center_sections_ok": markdown_has_sections(root / "03_output" / "LITE_CONTROL_CENTER.md", ["## Current Operating Posture", "## Primary Operator Files", "## Control Rules", "## Immediate Use"]),
        "user_checkpoint_prompts_exists": (root / "03_output" / "USER_CHECKPOINT_PROMPTS.md").exists(),
        "user_checkpoint_prompts_sections_ok": markdown_has_sections(root / "03_output" / "USER_CHECKPOINT_PROMPTS.md", ["## Lite Prompt", "Purpose:", "Recommended default:", "Option impact:", "```text"]),
        "user_reentry_prompts_exists": (root / "03_output" / "USER_REENTRY_PROMPTS.md").exists(),
        "user_reentry_prompts_sections_ok": markdown_has_sections(root / "03_output" / "USER_REENTRY_PROMPTS.md", ["## Purpose", "## User Prompt", "continue_current_workspace", "repair_current_workspace", "rebuild_generated_scaffold_keep_raw_corpus", "```text"]),
        "focused_strengthening_selection_exists": (root / "03_output" / "FOCUSED_STRENGTHENING_SELECTION.md").exists(),
        "focused_strengthening_selection_sections_ok": markdown_has_sections(root / "03_output" / "FOCUSED_STRENGTHENING_SELECTION.md", ["## Purpose", "## Candidate Strengthening Targets", "## Recommended Targets", "## User Choice", "## Notes"]),
        "user_focused_strengthening_prompts_exists": (root / "03_output" / "USER_FOCUSED_STRENGTHENING_PROMPTS.md").exists(),
        "user_focused_strengthening_prompts_sections_ok": markdown_has_sections(root / "03_output" / "USER_FOCUSED_STRENGTHENING_PROMPTS.md", ["## Purpose", "## User Prompt", "focus_type", "focus_name", "focused_strengthening_plan.csv", "```text"]),
        "broadcast_prompt_exists": (root / "03_output" / "UNIFIED_BROADCAST_PROMPT.md").exists(),
        "broadcast_prompt_sections_ok": markdown_has_sections(root / "03_output" / "UNIFIED_BROADCAST_PROMPT.md", ["Current phase:", "Current mode:", "Authoritative files:", "Required action:", "Do not silently broaden scope:"]),
        "stable_options_exists": (root / "03_output" / "STABLE_OPTIONS.md").exists(),
        "aggressive_options_exists": (root / "03_output" / "AGGRESSIVE_OPTIONS.md").exists(),
    }

    result = {
        "workspace_root": str(root),
        "checks": checks,
        "status": "ready" if all(checks.values()) else "needs_attention",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if result["status"] == "ready" else 1)


def csv_header_matches(path: Path, expected: list[str]) -> bool:
    if not path.exists():
        return False
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        try:
            header = next(reader)
        except StopIteration:
            return False
    return header == expected


def markdown_has_sections(path: Path, sections: list[str]) -> bool:
    if not path.exists():
        return False
    text = path.read_text(encoding="utf-8")
    return all(section in text for section in sections)


def lite_phase_state_fields_ok(path: Path) -> bool:
    if not path.exists():
        return False
    fields = parse_kv_file(path)
    allowed_actions = {"consolidate", "strengthen", "choose_stable_mode", "choose_aggressive_mode", "move_into_full_pipeline", "stop"}
    current_phase_ok = fields.get("current_phase") == "lite_summary_ready"
    state_status_ok = fields.get("state_status") == "pending_user_decision"
    recommended_default_ok = fields.get("recommended_default") in allowed_actions
    actions = {item.strip() for item in fields.get("allowed_next_actions", "").split(",") if item.strip()}
    allowed_actions_ok = bool(actions) and actions.issubset(allowed_actions)
    return current_phase_ok and state_status_ok and recommended_default_ok and allowed_actions_ok


def parse_kv_file(path: Path) -> dict[str, str]:
    fields: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        fields[key.strip()] = value.strip()
    return fields


if __name__ == "__main__":
    main()
