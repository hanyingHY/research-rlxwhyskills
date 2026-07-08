#!/usr/bin/env python3
"""Synchronize user-facing decision surfaces for a lite research workspace."""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
from pathlib import Path


STRENGTHENING_COLUMNS = ["focus_type", "focus_name", "strengthen_goal", "evidence_gap", "preferred_action", "priority", "notes"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync decision surfaces for a lite research workspace")
    parser.add_argument("--workspace-root", required=True)
    parser.add_argument("--source-project-root")
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

    write_text(
        workspace_root / "03_output" / "REENTRY_DECISION.md",
        build_reentry_decision(audit, source_project_root, source_markers),
        overwrite=args.overwrite_generated,
    )
    write_text(
        workspace_root / "03_output" / "NEXT_USER_DECISION.md",
        build_next_user_decision(audit),
        overwrite=args.overwrite_generated,
    )
    write_text(
        workspace_root / "03_output" / "PHASE_STATE.md",
        build_phase_state(audit),
        overwrite=args.overwrite_generated,
    )
    write_text(
        workspace_root / "03_output" / "FOCUSED_STRENGTHENING_SELECTION.md",
        build_focused_strengthening_selection(strengthening_rows),
        overwrite=args.overwrite_generated,
    )
    write_csv_rows(
        workspace_root / "03_output" / "focused_strengthening_plan.csv",
        STRENGTHENING_COLUMNS,
        strengthening_rows,
        overwrite=args.overwrite_generated,
    )

    result = {
        "workspace_root": str(workspace_root),
        "source_project_root": str(source_project_root) if source_project_root else None,
        "audit_status": audit["status"],
        "reentry_recommended_default": reentry_default(source_markers),
        "next_user_default": next_user_default(audit["status"]),
        "strengthening_target_count": len(strengthening_rows),
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
    return "consolidate"


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
        notes.append("A partial workspace was detected in the source project. Rebuild is the recommended default when you want the generated lite scaffold refreshed without deleting the raw corpus.")
    else:
        notes.append("No partial source workspace markers were detected. Continue is the recommended default unless the generated lite scaffold itself is stale or inconsistent.")

    return "\n".join([
        "# Reentry Decision",
        "",
        "## Purpose",
        "",
        "Make the user choose how to handle an existing scaffolded or partially completed lite workspace.",
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
    ])


def build_next_user_decision(audit: dict) -> str:
    blockers = audit.get("blockers", [])[:5]
    strengths = audit.get("strengths", [])[:5]
    ready_lines = [f"- {item}" for item in strengths] if strengths else ["- lite workspace scaffold is initialized"]
    not_ready_lines = [f"- {item}" for item in blockers] if blockers else ["- no major blockers recorded"]
    return "\n".join([
        "# Next User Decision",
        "",
        "## Current Lite Result",
        "",
        *ready_lines,
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
        "5. move_into_full_pipeline",
        "6. stop",
        "",
        "## User Decision",
        "",
        "",
        "## Notes",
        "",
        *not_ready_lines,
        "- if you choose strengthen, specify which directions, datasets, papers, or claim bundles should be reinforced first",
        "",
    ])


def build_phase_state(audit: dict) -> str:
    return "\n".join([
        "# Phase State",
        "",
        "current_phase: lite_summary_ready",
        f"state_status: {'pending_user_decision' if audit['status'] == 'structural_only' else 'ready_to_strengthen'}",
        f"recommended_default: {next_user_default(audit['status'])}",
        "allowed_next_actions: consolidate, strengthen, choose_stable_mode, choose_aggressive_mode, move_into_full_pipeline, stop",
        "",
    ])


def recommend_strengthening_rows(inventory: dict) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []

    decision_matches = names_match(inventory["all_names"], ["decision", "strategy", "summary", "route", "benchmark", "playbook"])
    if decision_matches:
        rows.append({
            "focus_type": "claim_bundle",
            "focus_name": "strategy-and-decision-summaries",
            "strengthen_goal": "verify high-level strategy and decision summaries before acting on the lite shortlist",
            "evidence_gap": "high-level summaries may not align with the latest retained evidence",
            "preferred_action": "audit_claim_bundle",
            "priority": "high",
            "notes": f"Matched top-level items: {', '.join(decision_matches[:5])}",
        })

    dataset_matches = names_match(inventory["all_names"], ["dataset", "data", "csv", "parquet", "panel", "scholar"])
    if dataset_matches:
        rows.append({
            "focus_type": "dataset",
            "focus_name": "dataset-and-source-governance",
            "strengthen_goal": "clarify dataset provenance and which datasets actually affect the next decision",
            "evidence_gap": "dataset semantics may still be unclear at the lite stage",
            "preferred_action": "inventory_and_map",
            "priority": "high",
            "notes": f"Matched top-level items: {', '.join(dataset_matches[:5])}",
        })

    research_matches = names_match(inventory["all_names"], ["research", "study", "note", "literature", "audit", "program", "process"])
    if research_matches:
        rows.append({
            "focus_type": "direction",
            "focus_name": "historical-research-reconciliation",
            "strengthen_goal": "reconcile historical research notes into active versus stale conclusions before escalation",
            "evidence_gap": "mixed-vintage notes may still blur what is currently actionable",
            "preferred_action": "classify_and_reconcile",
            "priority": "medium",
            "notes": f"Matched top-level items: {', '.join(research_matches[:5])}",
        })

    rules_matches = names_match(inventory["all_names"], ["guide", "handbook", "manual", "submission", "checklist", "faq", "rule"])
    if rules_matches:
        rows.append({
            "focus_type": "paper",
            "focus_name": "rules-and-deliverable-constraints",
            "strengthen_goal": "reconfirm official constraints before acting on the lite shortlist",
            "evidence_gap": "operator assumptions may drift from guide and submission documents",
            "preferred_action": "reconfirm_authoritative_rules",
            "priority": "medium",
            "notes": f"Matched top-level items: {', '.join(rules_matches[:5])}",
        })

    return rows


def build_focused_strengthening_selection(rows: list[dict[str, str]]) -> str:
    candidate_lines = [f"- `{row['focus_type']}`: `{row['focus_name']}`" for row in rows] or ["- no recommended strengthening targets were inferred automatically"]
    recommended_lines = [f"- `{row['focus_name']}`: {row['strengthen_goal']}" for row in rows] or ["- no recommended strengthening targets were inferred automatically"]
    return "\n".join([
        "# Focused Strengthening Selection",
        "",
        "## Purpose",
        "",
        "Choose exactly which directions, datasets, papers, or claim bundles should be strengthened before the lite workflow broadens or escalates.",
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
    ])


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
