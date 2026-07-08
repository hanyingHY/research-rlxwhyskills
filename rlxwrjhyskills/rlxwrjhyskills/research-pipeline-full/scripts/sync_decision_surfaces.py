#!/usr/bin/env python3
"""Synchronize user-facing decision surfaces for a full research workspace."""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
from pathlib import Path


STRENGTHENING_COLUMNS = ["focus_type", "focus_name", "strengthen_goal", "evidence_gap", "preferred_action", "priority", "notes"]
DIRECTION_DEPTH_COLUMNS = ["direction", "selected_state", "depth_profile", "allowed_round_budget", "allowed_cycle_budget", "notes"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync decision surfaces for a full research workspace")
    parser.add_argument("--workspace-root", required=True)
    parser.add_argument("--source-project-root")
    parser.add_argument("--profile", default="generic")
    parser.add_argument("--overwrite-generated", action="store_true")
    args = parser.parse_args()

    workspace_root = Path(args.workspace_root).resolve()
    source_project_root = Path(args.source_project_root).resolve() if args.source_project_root else None

    audit = run_json([
        sys.executable,
        str(Path(__file__).resolve().parent / "assess_workspace_progress.py"),
        "--workspace-root",
        str(workspace_root),
    ])
    source_markers = detect_partial_markers(source_project_root) if source_project_root else None
    inventory = collect_top_level_inventory(source_project_root)
    strengthening_rows = recommend_strengthening_rows(inventory)
    direction_rows = recommend_direction_rows(inventory)

    write_text(workspace_root / "06_reports" / "REENTRY_DECISION.md", build_reentry_decision(audit, source_project_root, source_markers), args.overwrite_generated)
    write_text(workspace_root / "06_reports" / "NEXT_USER_DECISION.md", build_next_user_decision(audit, strengthening_rows, direction_rows), args.overwrite_generated)
    write_text(workspace_root / "00_protocol" / "PHASE_STATE.md", build_phase_state(audit), args.overwrite_generated)
    write_text(workspace_root / "00_protocol" / "CHECKPOINT_RESPONSE_LOG.md", build_checkpoint_response_log(audit), args.overwrite_generated)
    write_text(workspace_root / "01_window_runs" / "W01_coordinator" / "coordinator_log.md", build_coordinator_log(audit, strengthening_rows, direction_rows), args.overwrite_generated)

    write_text(workspace_root / "06_reports" / "FOCUSED_STRENGTHENING_SELECTION.md", build_focused_strengthening_selection(strengthening_rows), args.overwrite_generated)
    write_csv_rows(workspace_root / "06_reports" / "FOCUSED_STRENGTHENING_PLAN.csv", STRENGTHENING_COLUMNS, strengthening_rows, args.overwrite_generated)

    write_text(workspace_root / "06_reports" / "DIRECTION_SELECTION.md", build_direction_selection(direction_rows), args.overwrite_generated)
    write_text(workspace_root / "06_reports" / "DEEP_DIVE_SELECTION.md", build_deep_dive_selection(direction_rows), args.overwrite_generated)
    write_csv_rows(workspace_root / "06_reports" / "DIRECTION_DEPTH_PLAN.csv", DIRECTION_DEPTH_COLUMNS, build_direction_depth_rows(direction_rows), args.overwrite_generated)

    result = {
        "workspace_root": str(workspace_root),
        "source_project_root": str(source_project_root) if source_project_root else None,
        "audit_status": audit["status"],
        "reentry_recommended_default": reentry_default(source_markers),
        "next_user_default": next_user_default(audit["status"]),
        "strengthening_target_count": len(strengthening_rows),
        "direction_candidate_count": len(direction_rows),
        "status": "ready",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


def run_json(command: list[str]) -> dict:
    completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", check=True)
    return json.loads(completed.stdout)


def detect_partial_markers(project_root: Path | None) -> dict | None:
    if not project_root:
        return None
    full_markers = ["00_protocol", "01_window_runs", "05_master_tables", "06_reports"]
    lite_markers = ["00_raw", "01_index", "02_retained", "03_output"]
    full_present = [item for item in full_markers if (project_root / item).exists()]
    lite_present = [item for item in lite_markers if (project_root / item).exists()]
    return {
        "partial_full_workspace_detected": len(full_present) >= 2 and len(full_present) < len(full_markers),
        "partial_lite_workspace_detected": len(lite_present) >= 2 and len(lite_present) < len(lite_markers),
        "partial_full_markers_present": full_present,
        "partial_lite_markers_present": lite_present,
    }


def collect_top_level_inventory(project_root: Path | None) -> dict:
    if not project_root or not project_root.exists():
        return {"dirs": [], "files": [], "all_names": []}
    dirs = sorted(path.name for path in project_root.iterdir() if path.is_dir())
    files = sorted(path.name for path in project_root.iterdir() if path.is_file())
    return {"dirs": dirs, "files": files, "all_names": [*dirs, *files]}


def names_match(names: list[str], keywords: list[str]) -> list[str]:
    matches: list[str] = []
    for name in names:
        lowered = name.lower()
        if any(keyword in lowered for keyword in keywords):
            matches.append(name)
    return matches


def reentry_default(source_markers: dict | None) -> str:
    if not source_markers:
        return "continue_current_workspace"
    if source_markers.get("partial_full_workspace_detected") or source_markers.get("partial_lite_workspace_detected"):
        return "rebuild_generated_scaffold_keep_raw_corpus"
    return "continue_current_workspace"


def next_user_default(audit_status: str) -> str:
    if audit_status in {"structural_only", "evidence_building"}:
        return "strengthen"
    if audit_status == "decision_ready":
        return "consolidate"
    if audit_status == "launch_candidate":
        return "choose_stable_mode"
    return "consolidate"


def phase_state_for_status(audit_status: str) -> tuple[str, str, str, str]:
    if audit_status == "structural_only":
        return ("audit_ready", "pending_user_decision", "workspace scaffold is initialized", "evidence intake, retained evidence, and route ranking are not ready")
    if audit_status == "evidence_building":
        return ("audit_ready", "ready_to_strengthen", "initial evidence intake has started", "route ranking and validation mapping are not ready")
    if audit_status == "decision_ready":
        return ("direction_map_ready", "ready_to_consolidate", "the workspace can support a user-facing decision", "launch-level execution is not ready")
    if audit_status == "launch_candidate":
        return ("validation_plan_ready", "ready_to_proceed", "validation planning and decision surfaces are ready", "explicit execution approval is still required")
    return ("audit_ready", "pending_user_decision", "pending", "pending")


def build_reentry_decision(audit: dict, source_project_root: Path | None, source_markers: dict | None) -> str:
    current_state_lines = [
        f"- workspace_status: `{audit['status']}`",
        f"- quality_score_100: `{audit['quality_score_100']}`",
        f"- critical_blocker_count: `{audit['critical_blocker_count']}`",
    ]
    if source_project_root:
        current_state_lines.append(f"- source_project_root: `{source_project_root}`")
    if source_markers and source_markers.get("partial_full_workspace_detected"):
        current_state_lines.append(f"- partial_full_markers_present: `{', '.join(source_markers['partial_full_markers_present'])}`")
    if source_markers and source_markers.get("partial_lite_workspace_detected"):
        current_state_lines.append(f"- partial_lite_markers_present: `{', '.join(source_markers['partial_lite_markers_present'])}`")

    notes = []
    if source_markers and (source_markers.get("partial_full_workspace_detected") or source_markers.get("partial_lite_workspace_detected")):
        notes.append("A partial workspace was detected in the source project. Rebuild is the recommended default when you want the generated scaffold refreshed without deleting the raw corpus.")
    else:
        notes.append("No partial source workspace markers were detected. Continue is the recommended default unless the generated scaffold itself is stale or inconsistent.")

    return "\n".join([
        "# Reentry Decision",
        "",
        "## Purpose",
        "",
        "Make the user choose how to handle an existing scaffolded or partially completed workspace.",
        "",
        "## Current Workspace State",
        "",
        *current_state_lines,
        "",
        "## Recommended Default",
        "",
        reentry_default(source_markers),
        "",
        "## Options",
        "",
        "1. continue_current_workspace",
        "2. repair_current_workspace",
        "3. rebuild_generated_scaffold_keep_raw_corpus",
        "4. stop",
        "",
        "## User Decision",
        "",
        "",
        "## Notes",
        "",
        *[f"- {note}" for note in notes],
        "",
        "```text",
        "This workspace already exists. Please choose whether to continue it, repair it in place, rebuild generated scaffold artifacts while keeping the raw corpus, or stop.",
        "```",
        "",
    ])


def build_next_user_decision(audit: dict, strengthening_rows: list[dict[str, str]], direction_rows: list[dict[str, str]]) -> str:
    blockers = audit.get("blockers", [])[:5]
    strengths = audit.get("strengths", [])[:5]
    ready_lines = [f"- {item}" for item in strengths] if strengths else ["- workspace scaffold and control surfaces are initialized"]
    not_ready_lines = [f"- {item}" for item in blockers] if blockers else ["- no major blockers recorded"]
    strengthening_lines = [f"- `{row['focus_name']}`" for row in strengthening_rows[:3]] or ["- no recommended strengthening targets inferred automatically"]
    direction_lines = [f"- `{row['direction']}`" for row in direction_rows[:3]] or ["- no recommended directions inferred automatically"]
    return "\n".join([
        "# Next User Decision",
        "",
        "## Current Gate",
        "",
        "A",
        "",
        "## What Is Ready",
        "",
        *ready_lines,
        "",
        "## What Is Not Ready",
        "",
        *not_ready_lines,
        "",
        "## Recommended Default",
        "",
        next_user_default(audit["status"]),
        "",
        "## Recommended Options",
        "",
        "1. consolidate",
        "2. strengthen",
        "3. choose_stable_mode",
        "4. choose_aggressive_mode",
        "5. proceed",
        "6. stop",
        "",
        "## User Decision",
        "",
        "",
        "## Notes For User",
        "",
        f"- current_workspace_status: `{audit['status']}`",
        f"- quality_band: `{audit['quality_band']}`",
        "- if you choose strengthen, specify which directions, datasets, papers, or claim bundles should be reinforced first",
        "- if deep work is proposed later, record explicit direction, depth, and budget choices before long deep cycles begin",
        "- recommended strengthening targets:",
        *strengthening_lines,
        "- recommended directions:",
        *direction_lines,
        "",
    ])


def build_phase_state(audit: dict) -> str:
    current_phase, state_status, ready_now, not_ready = phase_state_for_status(audit["status"])
    return "\n".join([
        "# Phase State",
        "",
        f"current_phase: {current_phase}",
        "current_gate: A",
        f"state_status: {state_status}",
        f"ready_now: {ready_now}",
        f"not_ready: {not_ready}",
        f"recommended_default: {next_user_default(audit['status'])}",
        "allowed_next_actions: consolidate, strengthen, choose_stable_mode, choose_aggressive_mode, proceed, stop",
        f"blocking_conditions: {audit['critical_blocker_count']} blocker(s) currently recorded",
        "",
    ])


def build_checkpoint_response_log(audit: dict) -> str:
    notes = "; ".join(audit.get("blockers", [])[:3]) or "no major notes yet"
    return "\n".join([
        "# Checkpoint Response Log",
        "",
        "| Gate | Current State | Recommended Next Step | User Decision | Notes |",
        "|---|---|---|---|---|",
        f"| A | {audit['status']} | {next_user_default(audit['status'])} | pending | {notes} |",
        "| B | pending | pending | pending | |",
        "| C | pending | pending | pending | |",
        "| D | pending | pending | pending | |",
        "",
        "## Usage",
        "",
        "Update this file whenever the coordinator stops at a major phase boundary and asks the user whether to consolidate, strengthen, choose a route board when applicable, proceed, or stop.",
        "",
    ])


def build_coordinator_log(audit: dict, strengthening_rows: list[dict[str, str]], direction_rows: list[dict[str, str]]) -> str:
    ready_lines = [f"- {item}" for item in audit.get("strengths", [])[:5]] or ["- workspace scaffold is initialized"]
    not_ready_lines = [f"- {item}" for item in audit.get("blockers", [])[:5]] or ["- no major blockers recorded"]
    strengthening_lines = [f"- `{row['focus_name']}`" for row in strengthening_rows[:3]] or ["- no recommended strengthening targets inferred automatically"]
    direction_lines = [f"- `{row['direction']}`" for row in direction_rows[:3]] or ["- no recommended directions inferred automatically"]
    return "\n".join([
        "# Coordinator Log",
        "",
        "## Current Phase",
        "",
        phase_state_for_status(audit["status"])[0],
        "",
        "## Ready Now",
        "",
        *ready_lines,
        "",
        "## Not Ready",
        "",
        *not_ready_lines,
        "",
        "## Recommended Next User Decision",
        "",
        next_user_default(audit["status"]),
        "",
        "## Notes",
        "",
        f"- quality_score_100: `{audit['quality_score_100']}`",
        f"- quality_band: `{audit['quality_band']}`",
        f"- critical_blocker_count: `{audit['critical_blocker_count']}`",
        "- recommended strengthening targets:",
        *strengthening_lines,
        "- recommended directions:",
        *direction_lines,
        "",
    ])


def recommend_strengthening_rows(inventory: dict) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []

    decision_matches = names_match(inventory["all_names"], ["decision", "strategy", "summary", "route", "benchmark", "playbook"])
    if decision_matches:
        rows.append({
            "focus_type": "claim_bundle",
            "focus_name": "strategy-and-decision-summaries",
            "strengthen_goal": "verify project-level strategy and decision summaries against retained evidence and active code paths",
            "evidence_gap": "high-level summaries may not align with the latest retained evidence or implementation state",
            "preferred_action": "audit_claim_bundle",
            "priority": "high",
            "notes": f"Matched top-level items: {', '.join(decision_matches[:5])}",
        })

    dataset_matches = names_match(inventory["all_names"], ["dataset", "data", "csv", "parquet", "panel", "scholar"])
    if dataset_matches:
        rows.append({
            "focus_type": "dataset",
            "focus_name": "dataset-and-source-governance",
            "strengthen_goal": "clarify dataset coverage, provenance, and active usage paths",
            "evidence_gap": "dataset semantics and active usage are not yet synchronized into the new workspace",
            "preferred_action": "inventory_and_map",
            "priority": "high",
            "notes": f"Matched top-level items: {', '.join(dataset_matches[:5])}",
        })

    research_matches = names_match(inventory["all_names"], ["research", "study", "note", "literature", "audit", "program", "process"])
    if research_matches:
        rows.append({
            "focus_type": "direction",
            "focus_name": "historical-research-reconciliation",
            "strengthen_goal": "classify and reconcile historical research notes into active versus stale tracks",
            "evidence_gap": "historical notes likely contain mixed-vintage conclusions and inconsistent confidence levels",
            "preferred_action": "classify_and_reconcile",
            "priority": "high",
            "notes": f"Matched top-level items: {', '.join(research_matches[:5])}",
        })

    rules_matches = names_match(inventory["all_names"], ["guide", "handbook", "manual", "submission", "checklist", "faq", "rule"])
    if rules_matches:
        rows.append({
            "focus_type": "paper",
            "focus_name": "rules-and-deliverable-constraints",
            "strengthen_goal": "verify operator assumptions against the latest authoritative rules and deliverable constraints",
            "evidence_gap": "execution assumptions may drift from official constraint documents",
            "preferred_action": "reconfirm_authoritative_rules",
            "priority": "medium",
            "notes": f"Matched top-level items: {', '.join(rules_matches[:5])}",
        })

    implementation_matches = names_match(inventory["all_names"], ["baseline", "model", "engine", "pipeline", "app", "src", "bdc"])
    if implementation_matches:
        rows.append({
            "focus_type": "direction",
            "focus_name": "active-implementation-audit",
            "strengthen_goal": "reconcile the active implementation surface with the documented research claims and current decision program",
            "evidence_gap": "code paths, summaries, and retained evidence may not yet be fully aligned",
            "preferred_action": "map_code_to_claims",
            "priority": "medium",
            "notes": f"Matched top-level items: {', '.join(implementation_matches[:5])}",
        })

    return rows


def recommend_direction_rows(inventory: dict) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []

    def add_row(direction: str, rationale: str, suggested_depth: str, priority: str, evidence_hint: str) -> None:
        rows.append({
            "direction": direction,
            "rationale": rationale,
            "suggested_depth": suggested_depth,
            "priority": priority,
            "evidence_hint": evidence_hint,
        })

    if names_match(inventory["all_names"], ["decision", "strategy", "summary", "route", "benchmark"]):
        add_row("strategy-claim-reconciliation", "Reconcile strategy summaries and route logic with the retained evidence base.", "standard_deep", "high", "Strategy and decision artifacts are present at the project root.")
    if names_match(inventory["all_names"], ["dataset", "data", "csv", "parquet", "panel", "scholar"]):
        add_row("dataset-governance-and-usage", "Map dataset coverage, provenance, and usage assumptions before deeper modeling work.", "standard_deep", "high", "Dataset-like assets are visible in the top-level inventory.")
    if names_match(inventory["all_names"], ["guide", "handbook", "manual", "submission", "checklist", "faq", "rule"]):
        add_row("rules-and-deliverable-constraints", "Reconfirm official rules, submission constraints, and reproducibility requirements.", "light_validate", "high", "Guide and submission-oriented documents are present.")
    if names_match(inventory["all_names"], ["research", "study", "note", "literature", "audit", "program", "process"]):
        add_row("historical-research-reconciliation", "Reconcile mixed-vintage research notes into active, deferred, and stale tracks.", "standard_deep", "medium", "Research-history style directories or files are present.")
    if names_match(inventory["all_names"], ["baseline", "model", "engine", "pipeline", "app", "src", "bdc"]):
        add_row("active-implementation-audit", "Audit active code paths against the documented research and decision surfaces.", "light_validate", "medium", "Implementation-oriented directories or files are present.")

    return rows


def build_focused_strengthening_selection(rows: list[dict[str, str]]) -> str:
    candidate_lines = [f"- `{row['focus_type']}`: `{row['focus_name']}`" for row in rows] or ["- no recommended strengthening targets were inferred automatically"]
    recommended_lines = [f"- `{row['focus_name']}`: {row['strengthen_goal']}" for row in rows] or ["- no recommended strengthening targets were inferred automatically"]
    return "\n".join([
        "# Focused Strengthening Selection",
        "",
        "## Purpose",
        "",
        "Choose exactly which directions, datasets, papers, or claim bundles should be strengthened before the program broadens.",
        "",
        "## Candidate Strengthening Targets",
        "",
        *candidate_lines,
        "",
        "## Recommended Targets",
        "",
        *recommended_lines,
        "",
        "## User Choice",
        "",
        "",
        "## Notes",
        "",
        "```text",
        "Please choose which directions, datasets, papers, or claim bundles should be strengthened first, and record the reasons in the strengthening plan.",
        "```",
        "",
    ])


def build_direction_selection(rows: list[dict[str, str]]) -> str:
    candidate_lines = [f"- `{row['direction']}`: {row['rationale']}" for row in rows] or ["- no candidate directions were inferred automatically"]
    core_lines = [f"- `{row['direction']}`" for row in rows if row["priority"] == "high"] or ["- no core directions inferred automatically"]
    deferred_lines = [f"- `{row['direction']}`" for row in rows if row["priority"] != "high"] or ["- no deferred directions inferred automatically"]
    return "\n".join([
        "# Direction Selection",
        "",
        "## Purpose",
        "",
        "Choose which discovered directions move forward now instead of deepening every direction uniformly.",
        "",
        "## Candidate Directions",
        "",
        *candidate_lines,
        "",
        "## Recommended Core Directions",
        "",
        *core_lines,
        "",
        "## Recommended Deferred Directions",
        "",
        *deferred_lines,
        "",
        "## User Choice",
        "",
        "",
        "## Notes",
        "",
        "```text",
        "We finished direction discovery.",
        "",
        "Please choose:",
        "1. which directions move forward now",
        "2. which directions stay deferred",
        "3. which directions need strengthening before promotion",
        "```",
        "",
    ])


def build_deep_dive_selection(rows: list[dict[str, str]]) -> str:
    selected_lines = [f"- `{row['direction']}` (recommended if selected later)" for row in rows] or ["- no direction candidates were inferred automatically"]
    depth_lines = [f"- `{row['direction']}`: `{row['suggested_depth']}` because {row['evidence_hint']}" for row in rows] or ["- no direction candidates were inferred automatically"]
    return "\n".join([
        "# Deep Dive Selection",
        "",
        "## Purpose",
        "",
        "Choose how deeply each selected direction should be pursued before large search or validation budgets are spent.",
        "",
        "## Selected Directions",
        "",
        *selected_lines,
        "",
        "## Suggested Depth Profiles",
        "",
        "1. light_validate",
        "2. standard_deep",
        "3. aggressive_frontier",
        "",
        *depth_lines,
        "",
        "## User Choice",
        "",
        "",
        "## Notes",
        "",
        "```text",
        "For the directions that move forward, please choose one depth profile for each:",
        "1. light_validate",
        "2. standard_deep",
        "3. aggressive_frontier",
        "```",
        "",
    ])


def build_direction_depth_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    for row in rows:
        selected_state = "advance_now" if row["priority"] == "high" else "defer"
        depth_profile = row["suggested_depth"] if selected_state == "advance_now" else "not_applicable"
        allowed_round_budget = "pending_user_choice"
        allowed_cycle_budget = "pending_user_choice"
        notes = f"Recommended from top-level inventory: {row['evidence_hint']}"
        result.append({
            "direction": row["direction"],
            "selected_state": selected_state,
            "depth_profile": depth_profile,
            "allowed_round_budget": allowed_round_budget,
            "allowed_cycle_budget": allowed_cycle_budget,
            "notes": notes,
        })
    return result


def write_text(path: Path, text: str, overwrite: bool) -> None:
    if path.exists() and not overwrite:
        return
    path.write_text(text, encoding="utf-8")


def write_csv_rows(path: Path, columns: list[str], rows: list[dict[str, str]], overwrite: bool) -> None:
    if path.exists() and not overwrite:
        return
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow({column: row.get(column, "") for column in columns})


if __name__ == "__main__":
    main()
