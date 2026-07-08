#!/usr/bin/env python3
"""Validate a windowed-search research workspace scaffold."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True

from profiles import get_profile


EXPECTED_HEADERS = {
    "ingestion_log.csv": ["timestamp", "item_name", "source_path", "primary_direction", "secondary_tags", "disposition", "reason"],
    "claim_verification_log.csv": ["claim_id", "claim_text", "original_source", "authority_assessment", "external_verdict", "disposition", "notes"],
    "DIRECTION_DEPTH_PLAN.csv": ["direction", "selected_state", "depth_profile", "allowed_round_budget", "allowed_cycle_budget", "notes"],
    "FOCUSED_STRENGTHENING_PLAN.csv": ["focus_type", "focus_name", "strengthen_goal", "evidence_gap", "preferred_action", "priority", "notes"],
    "round_log.csv": ["round_id", "search_question", "query_set", "candidate_count", "retained_count", "next_action"],
    "source_index.csv": ["source_id", "title", "authors", "year", "source", "stable_link", "direction", "disposition"],
    "evidence_matrix.csv": ["source_id", "claim", "study_context", "evaluation_scope", "evidence_strength", "transferability", "implementation_value"],
    "experiment_hypotheses.csv": ["hypothesis_id", "mapped_category", "claim", "validation_placeholder", "priority"],
    "master_source_index.csv": ["source_id", "title", "authors", "year", "stable_link", "primary_direction", "disposition"],
    "direction_scoreboard.csv": ["direction", "relevance", "directness", "evidence_strength", "feasibility", "expected_upside", "status"],
    "research_to_experiment_matrix.csv": ["direction", "claim", "mapped_category", "validation_placeholder", "priority"],
}


def main() -> None:
    if len(sys.argv) < 2 or len(sys.argv) > 3:
        print("Usage: python validate_windowed_research_program.py <workspace_root> [profile]")
        sys.exit(1)

    root = Path(sys.argv[1]).resolve()
    profile_name = sys.argv[2] if len(sys.argv) == 3 else detect_profile(root)
    profile = get_profile(profile_name)
    workers = profile["workers"]

    checks = {
        "protocol_dir_exists": (root / "00_protocol").exists(),
        "prompts_dir_exists": (root / "00_protocol" / "prompts").exists(),
        "profile_name_exists": (root / "00_protocol" / "PROFILE_NAME.txt").exists(),
        "program_control_center_exists": (root / "00_protocol" / "PROGRAM_CONTROL_CENTER.md").exists(),
        "program_control_center_sections_ok": markdown_has_sections(root / "00_protocol" / "PROGRAM_CONTROL_CENTER.md", ["## Current Operating Posture", "## Primary Operator Files", "## Control Rules", "## Immediate Use"]),
        "search_objective_exists": (root / "00_protocol" / "SEARCH_OBJECTIVE.md").exists(),
        "existing_content_audit_exists": (root / "00_protocol" / "EXISTING_CONTENT_AUDIT.md").exists(),
        "existing_content_audit_template_exists": (root / "00_protocol" / "EXISTING_CONTENT_AUDIT_TEMPLATE.md").exists(),
        "user_decision_gates_exists": (root / "00_protocol" / "USER_DECISION_GATES.md").exists(),
        "user_decision_gates_gate_d_ok": gate_d_mode_options_ok(root / "00_protocol" / "USER_DECISION_GATES.md"),
        "checkpoint_response_log_exists": (root / "00_protocol" / "CHECKPOINT_RESPONSE_LOG.md").exists(),
        "phase_state_exists": (root / "00_protocol" / "PHASE_STATE.md").exists(),
        "phase_state_fields_ok": phase_state_fields_ok(root / "00_protocol" / "PHASE_STATE.md"),
        "broadcast_prompt_exists": (root / "00_protocol" / "UNIFIED_BROADCAST_PROMPT.md").exists(),
        "broadcast_prompt_sections_ok": markdown_has_sections(root / "00_protocol" / "UNIFIED_BROADCAST_PROMPT.md", ["Current phase:", "Current gate:", "Current mode:", "Authoritative files:", "Required action:", "Do not touch:"]),
        "user_checkpoint_prompts_exists": (root / "00_protocol" / "USER_CHECKPOINT_PROMPTS.md").exists(),
        "user_checkpoint_prompts_sections_ok": user_checkpoint_prompts_structure_ok(root / "00_protocol" / "USER_CHECKPOINT_PROMPTS.md"),
        "workspace_reentry_policy_exists": (root / "00_protocol" / "WORKSPACE_REENTRY_POLICY.md").exists(),
        "workspace_reentry_policy_sections_ok": markdown_has_sections(root / "00_protocol" / "WORKSPACE_REENTRY_POLICY.md", ["## Objective", "## Rule", "## Scope", "## Control File"]),
        "user_reentry_prompts_exists": (root / "00_protocol" / "USER_REENTRY_PROMPTS.md").exists(),
        "user_reentry_prompts_sections_ok": markdown_has_sections(root / "00_protocol" / "USER_REENTRY_PROMPTS.md", ["## Purpose", "## User Prompt", "continue_current_workspace", "repair_current_workspace", "rebuild_generated_scaffold_keep_raw_corpus", "```text"]),
        "direction_depth_policy_exists": (root / "00_protocol" / "DIRECTION_DEPTH_POLICY.md").exists(),
        "direction_depth_policy_sections_ok": markdown_has_sections(root / "00_protocol" / "DIRECTION_DEPTH_POLICY.md", ["## Objective", "## Control File", "## Allowed selected_state values", "## Allowed depth_profile values", "## Budget semantics", "## Rule"]),
        "focused_strengthening_policy_exists": (root / "00_protocol" / "FOCUSED_STRENGTHENING_POLICY.md").exists(),
        "focused_strengthening_policy_sections_ok": markdown_has_sections(root / "00_protocol" / "FOCUSED_STRENGTHENING_POLICY.md", ["## Objective", "## Control Files", "## Allowed focus_type values", "## Rule"]),
        "user_focused_strengthening_prompts_exists": (root / "00_protocol" / "USER_FOCUSED_STRENGTHENING_PROMPTS.md").exists(),
        "user_focused_strengthening_prompts_sections_ok": markdown_has_sections(root / "00_protocol" / "USER_FOCUSED_STRENGTHENING_PROMPTS.md", ["## Purpose", "## User Prompt", "focus_type", "focus_name", "FOCUSED_STRENGTHENING_SELECTION.md", "FOCUSED_STRENGTHENING_PLAN.csv", "```text"]),
        "user_direction_depth_prompts_exists": (root / "00_protocol" / "USER_DIRECTION_DEPTH_PROMPTS.md").exists(),
        "user_direction_depth_prompts_sections_ok": markdown_has_sections(root / "00_protocol" / "USER_DIRECTION_DEPTH_PROMPTS.md", ["## Purpose", "## User Prompt", "## Prompt Purpose Summary", "## Recording Rule", "```text"]),
        "autonomy_artifacts_consistent": autonomy_artifacts_consistent(root),
        "quality_gate_exists": (root / "00_protocol" / "QUALITY_GATE.md").exists(),
        "authority_ladder_exists": (root / "00_protocol" / "AUTHORITY_LADDER.md").exists(),
        "worker_file_contract_exists": (root / "00_protocol" / "WORKER_FILE_CONTRACT.md").exists(),
        "task_interface_contract_exists": (root / "00_protocol" / "TASK_INTERFACE_CONTRACT.md").exists(),
        "window_count_guidance_exists": (root / "00_protocol" / "WINDOW_COUNT_GUIDANCE.md").exists(),
        "all_windows_prompt_pack_exists": (root / "00_protocol" / "ALL_WINDOWS_PROMPT_PACK.md").exists(),
        "master_tables_exists": (root / "05_master_tables").exists(),
        "reports_dir_exists": (root / "06_reports").exists(),
        "next_user_decision_exists": (root / "06_reports" / "NEXT_USER_DECISION.md").exists(),
        "next_user_decision_sections_ok": markdown_has_sections(root / "06_reports" / "NEXT_USER_DECISION.md", ["## Current Gate", "## What Is Ready", "## What Is Not Ready", "## Recommended Default", "## Recommended Options", "## User Decision", "## Notes For User"]),
        "next_user_decision_mode_options_ok": next_user_decision_mode_options_ok(root / "06_reports" / "NEXT_USER_DECISION.md"),
        "reentry_decision_exists": (root / "06_reports" / "REENTRY_DECISION.md").exists(),
        "reentry_decision_sections_ok": markdown_has_sections(root / "06_reports" / "REENTRY_DECISION.md", ["## Purpose", "## Current Workspace State", "## Recommended Default", "## Options", "## User Decision", "## Notes", "continue_current_workspace", "repair_current_workspace", "rebuild_generated_scaffold_keep_raw_corpus", "```text"]),
        "direction_selection_exists": (root / "06_reports" / "DIRECTION_SELECTION.md").exists(),
        "direction_selection_sections_ok": markdown_has_sections(root / "06_reports" / "DIRECTION_SELECTION.md", ["## Purpose", "## Candidate Directions", "## Recommended Core Directions", "## Recommended Deferred Directions", "## User Choice", "## Notes", "```text"]),
        "deep_dive_selection_exists": (root / "06_reports" / "DEEP_DIVE_SELECTION.md").exists(),
        "deep_dive_selection_sections_ok": markdown_has_sections(root / "06_reports" / "DEEP_DIVE_SELECTION.md", ["## Purpose", "## Selected Directions", "## Suggested Depth Profiles", "## User Choice", "## Notes", "light_validate", "standard_deep", "aggressive_frontier"]),
        "direction_depth_plan_exists": (root / "06_reports" / "DIRECTION_DEPTH_PLAN.csv").exists(),
        "direction_depth_plan_header_ok": csv_header_matches(root / "06_reports" / "DIRECTION_DEPTH_PLAN.csv", EXPECTED_HEADERS["DIRECTION_DEPTH_PLAN.csv"]),
        "focused_strengthening_selection_exists": (root / "06_reports" / "FOCUSED_STRENGTHENING_SELECTION.md").exists(),
        "focused_strengthening_selection_sections_ok": markdown_has_sections(root / "06_reports" / "FOCUSED_STRENGTHENING_SELECTION.md", ["## Purpose", "## Candidate Strengthening Targets", "## Recommended Targets", "## User Choice", "## Notes", "```text"]),
        "focused_strengthening_plan_exists": (root / "06_reports" / "FOCUSED_STRENGTHENING_PLAN.csv").exists(),
        "focused_strengthening_plan_header_ok": csv_header_matches(root / "06_reports" / "FOCUSED_STRENGTHENING_PLAN.csv", EXPECTED_HEADERS["FOCUSED_STRENGTHENING_PLAN.csv"]),
        "stable_route_board_exists": (root / "06_reports" / "STABLE_ROUTE_BOARD.md").exists(),
        "stable_route_board_sections_ok": markdown_has_sections(root / "06_reports" / "STABLE_ROUTE_BOARD.md", ["## Direct Evidence First", "## Lower-Risk Options", "## Immediate Stable Candidates"]),
        "aggressive_route_board_exists": (root / "06_reports" / "AGGRESSIVE_ROUTE_BOARD.md").exists(),
        "aggressive_route_board_sections_ok": markdown_has_sections(root / "06_reports" / "AGGRESSIVE_ROUTE_BOARD.md", ["## Higher-Upside Options", "## Transfer-Heavy Or Novel Routes", "## Extra Validation Requirements", "## Deferred Or Stretch Candidates"]),
        "ingestion_log_exists": (root / "12_ingestion_logs" / "ingestion_log.csv").exists(),
        "claim_verification_log_exists": (root / "12_ingestion_logs" / "claim_verification_log.csv").exists(),
        "quarantine_dir_exists": (root / "13_quarantine_reject").exists(),
        "master_table_headers_ok": all(csv_header_matches(root / "05_master_tables" / name, EXPECTED_HEADERS[name]) for name in ["master_source_index.csv", "direction_scoreboard.csv", "research_to_experiment_matrix.csv"]),
        "ingestion_log_header_ok": csv_header_matches(root / "12_ingestion_logs" / "ingestion_log.csv", EXPECTED_HEADERS["ingestion_log.csv"]),
        "claim_verification_log_header_ok": csv_header_matches(root / "12_ingestion_logs" / "claim_verification_log.csv", EXPECTED_HEADERS["claim_verification_log.csv"]),
        "all_windows_prompt_pack_sections_ok": markdown_has_sections(root / "00_protocol" / "ALL_WINDOWS_PROMPT_PACK.md", ["# All Windows Prompt Pack", f"## {list(workers.keys())[0]}", f"## {list(workers.keys())[-1]}"]),
    }

    worker_checks = {}
    for folder_name in workers:
        folder = root / "01_window_runs" / folder_name
        worker_checks[folder_name] = validate_worker_folder(folder_name, folder)

    checks["worker_folders_ready"] = all(item["status"] == "ready" for item in worker_checks.values())

    result = {
        "workspace_root": str(root),
        "profile": profile_name,
        "checks": checks,
        "worker_checks": worker_checks,
        "status": "ready" if all(checks.values()) else "needs_attention",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if result["status"] == "ready" else 1)


def detect_profile(root: Path) -> str:
    profile_file = root / "00_protocol" / "PROFILE_NAME.txt"
    if profile_file.exists():
        return profile_file.read_text(encoding="utf-8").strip() or "generic"
    return "generic"


def validate_worker_folder(folder_name: str, folder: Path) -> dict:
    required = [folder / "direction_report.md", folder / "quality_audit.md", folder / "task_interface.md"]
    if folder_name == "W01_coordinator":
        required.extend([folder / "coordinator_log.md", folder / "final_report_outline.md"])
    elif folder_name == "W02_master_tables":
        required.append(folder / "master_sync_log.md")
    else:
        required.extend([folder / "round_log.csv", folder / "source_index.csv", folder / "evidence_matrix.csv", folder / "experiment_hypotheses.csv"])

    missing = [str(path) for path in required if not path.exists()]
    prompt_path = folder.parent.parent / "00_protocol" / "prompts" / f"{folder_name}.md"
    prompt_sections_ok = prompt_has_sections(prompt_path)
    csv_headers_ok = True
    for name in ["round_log.csv", "source_index.csv", "evidence_matrix.csv", "experiment_hypotheses.csv"]:
        if (folder / name).exists():
            csv_headers_ok = csv_headers_ok and csv_header_matches(folder / name, EXPECTED_HEADERS[name])
    direction_report_sections_ok = markdown_has_sections(folder / "direction_report.md", ["## Strongest Retained Evidence", "## Conflicts and Adjudication", "## Validation Schemes", "## Immediate Next Actions", "## Deferred Items"])
    quality_audit_sections_ok = markdown_has_sections(folder / "quality_audit.md", ["## Status", "## Gaps", "## Repairs"])
    task_interface_sections_ok = markdown_has_sections(folder / "task_interface.md", ["## Role", "## Owned Scope", "## Inputs", "## Outputs", "## Done When", "## Do Not Touch"])
    coordinator_log_sections_ok = True
    final_report_outline_sections_ok = True
    if folder_name == "W01_coordinator":
        coordinator_log_sections_ok = markdown_has_sections(folder / "coordinator_log.md", ["## Current Phase", "## Ready Now", "## Not Ready", "## Recommended Next User Decision", "## Notes"])
        final_report_outline_sections_ok = markdown_has_sections(folder / "final_report_outline.md", ["## Executive Judgment", "## Current Route Board", "## Conflicts To Surface", "## Next User Decision"])
    return {
        "status": "ready" if not missing and prompt_sections_ok and csv_headers_ok and direction_report_sections_ok and quality_audit_sections_ok and task_interface_sections_ok and coordinator_log_sections_ok and final_report_outline_sections_ok else "needs_attention",
        "missing": missing,
        "prompt_path": str(prompt_path),
        "prompt_sections_ok": prompt_sections_ok,
        "csv_headers_ok": csv_headers_ok,
        "direction_report_sections_ok": direction_report_sections_ok,
        "quality_audit_sections_ok": quality_audit_sections_ok,
        "task_interface_sections_ok": task_interface_sections_ok,
        "coordinator_log_sections_ok": coordinator_log_sections_ok,
        "final_report_outline_sections_ok": final_report_outline_sections_ok,
    }


def prompt_has_sections(prompt_path: Path) -> bool:
    if not prompt_path.exists():
        return False
    text = prompt_path.read_text(encoding="utf-8")
    required_markers = [
        "## Read first",
        "## Focus",
        "## Rules",
        "## User-facing checkpoint rule",
        "## Workspace reentry rule",
        "## Direction and depth gate rule",
        "## Focused strengthening rule",
        "## Existing content audit rule",
        "## Literature-only rule",
        "## Evidence ladder",
        "## Promotion threshold",
        "## Disposition states",
        "## Required outputs",
        "## Minimum file contract",
        "## Round output standard",
        "## Direction report contract",
        "## Quality audit contract",
        "## Search cadence",
    ]
    return all(marker in text for marker in required_markers)


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


def extract_section(text: str, heading: str, next_headings: list[str]) -> str:
    start = text.find(heading)
    if start == -1:
        return ""
    start += len(heading)
    end_candidates = [text.find(next_heading, start) for next_heading in next_headings if text.find(next_heading, start) != -1]
    end = min(end_candidates) if end_candidates else len(text)
    return text[start:end]


def section_has_code_block(section: str) -> bool:
    return "```text" in section and "```" in section[section.find("```text") + 7 :]


def user_checkpoint_prompts_structure_ok(path: Path) -> bool:
    if not path.exists():
        return False
    text = path.read_text(encoding="utf-8")
    gates = ["A", "B", "C", "D"]
    for gate in gates:
        user_heading = f"## Gate {gate} User Prompt"
        coordinator_heading = f"## Gate {gate} Coordinator Prompt"
        broadcast_heading = f"## Gate {gate} Broadcast Prompt"
        next_user_heading = f"## Gate {chr(ord(gate) + 1)} User Prompt" if gate != "D" else ""

        user_section = extract_section(text, user_heading, [coordinator_heading, next_user_heading] if next_user_heading else [coordinator_heading])
        coordinator_section = extract_section(text, coordinator_heading, [broadcast_heading])
        next_headings = [next_user_heading] if next_user_heading else []
        broadcast_section = extract_section(text, broadcast_heading, next_headings)

        if not user_section or not coordinator_section or not broadcast_section:
            return False
        if not all(marker in user_section for marker in ["Purpose:", "Recommended default:", "Option impact:"]):
            return False
        if not section_has_code_block(user_section):
            return False
        if not all(marker in coordinator_section for marker in ["Current gate:", "Ready now:", "Not ready:", "Recommended default:", "Ask the user whether"]):
            return False
        if not section_has_code_block(coordinator_section):
            return False
        if not all(marker in broadcast_section for marker in ["Current phase:", "Current gate:", "Current mode:"]):
            return False
        if "do not" not in broadcast_section.lower():
            return False
        if not section_has_code_block(broadcast_section):
            return False
    return True


def phase_state_fields_ok(path: Path) -> bool:
    if not path.exists():
        return False
    fields = parse_kv_file(path)
    allowed_phases = {
        "audit_ready",
        "direction_map_ready",
        "deep_search_ready",
        "scaffold_ready",
        "validation_plan_ready",
        "execution_ready",
    }
    allowed_gates = {"A", "B", "C", "D"}
    allowed_status = {
        "pending_user_decision",
        "ready_to_consolidate",
        "ready_to_strengthen",
        "ready_to_proceed",
        "blocked_by_missing_evidence",
        "blocked_by_missing_inputs",
    }
    allowed_actions = {"consolidate", "strengthen", "choose_stable_mode", "choose_aggressive_mode", "proceed", "stop"}
    current_phase_ok = fields.get("current_phase") in allowed_phases
    current_gate_ok = fields.get("current_gate") in allowed_gates
    state_status_ok = fields.get("state_status") in allowed_status
    recommended_default_ok = fields.get("recommended_default") in allowed_actions
    actions = {item.strip() for item in fields.get("allowed_next_actions", "").split(",") if item.strip()}
    allowed_actions_ok = bool(actions) and actions.issubset(allowed_actions)
    return current_phase_ok and current_gate_ok and state_status_ok and recommended_default_ok and allowed_actions_ok


def next_user_decision_mode_options_ok(path: Path) -> bool:
    if not path.exists():
        return False
    text = path.read_text(encoding="utf-8")
    return "choose_stable_mode" in text and "choose_aggressive_mode" in text


def gate_d_mode_options_ok(path: Path) -> bool:
    if not path.exists():
        return False
    text = path.read_text(encoding="utf-8")
    gate_d = extract_section(text, "## Gate D", [])
    if not gate_d:
        return False
    lowered = gate_d.lower()
    return "stable" in lowered and "aggressive" in lowered


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


def autonomy_artifacts_consistent(root: Path) -> bool:
    consent = root / "00_protocol" / "EXPERIMENTAL_AUTONOMY_CONSENT.md"
    status = root / "00_protocol" / "AUTONOMY_STATUS.md"
    if consent.exists() != status.exists():
        return False
    if not consent.exists() and not status.exists():
        return True
    return markdown_has_sections(consent, ["## Warning", "## User Consent", "## Scope Boundaries", "## Required Manual Stops", "## Stop Conditions"]) and autonomy_status_fields_ok(status)


def autonomy_status_fields_ok(path: Path) -> bool:
    if not path.exists():
        return False
    fields = parse_kv_file(path)
    allowed_modes = {"disabled", "enabled_with_user_consent", "paused_for_user_review", "stopped"}
    allowed_ack = {"pending", "yes", "no"}
    required_authority = {"coordinator_within_approved_scope", "manual_user_control", "paused_pending_review", "stopped"}
    return (
        fields.get("autonomy_mode") in allowed_modes
        and fields.get("autonomy_warning_acknowledged") in allowed_ack
        and fields.get("autonomy_user_consent") in allowed_ack
        and bool(fields.get("autonomy_scope_boundaries"))
        and bool(fields.get("autonomy_required_manual_stops"))
        and bool(fields.get("autonomy_stop_conditions"))
        and fields.get("autonomy_current_authority") in required_authority
        and bool(fields.get("autonomy_last_manual_gate"))
        and bool(fields.get("autonomy_next_mandatory_review"))
    )


if __name__ == "__main__":
    main()
