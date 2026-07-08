#!/usr/bin/env python3
"""Assess the real progress quality of a full research workspace."""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path


PLACEHOLDER_PATTERNS = {
    "pending",
    "none_recorded_yet",
    "tbd",
    "todo",
    "objective",
    "strongest retained evidence",
    "conflicts and adjudication",
    "validation schemes",
    "immediate next actions",
    "deferred items",
    "current gate",
    "what is ready",
    "what is not ready",
    "recommended default",
    "recommended options",
    "user decision",
    "notes for user",
    "direct evidence first",
    "lower-risk options",
    "immediate stable candidates",
    "higher-upside options",
    "transfer-heavy or novel routes",
    "extra validation requirements",
    "deferred or stretch candidates",
    "purpose",
    "candidate directions",
    "recommended core directions",
    "recommended deferred directions",
    "selected directions",
    "suggested depth profiles",
    "prompt purpose summary",
    "recording rule",
}

PLACEHOLDER_LINE_PATTERNS = [
    re.compile(r"^\d+\.\s+(consolidate|strengthen|choose_stable_mode|choose_aggressive_mode|proceed|stop)$", re.IGNORECASE),
    re.compile(r"^\d+\.\s+(direct evidence first|lower-risk options|immediate stable candidates|higher-upside options|transfer-heavy or novel routes|extra validation requirements|deferred or stretch candidates)$", re.IGNORECASE),
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Assess progress quality for a full research workspace")
    parser.add_argument("--workspace-root", required=True)
    parser.add_argument("--output")
    parser.add_argument("--format", choices=["json", "markdown"], default="json")
    args = parser.parse_args()

    root = Path(args.workspace_root).resolve()
    if not looks_like_full_workspace(root):
        print(json.dumps({"workspace_root": str(root), "status": "invalid_scaffold"}, ensure_ascii=False, indent=2))
        sys.exit(1)

    result = assess(root)
    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        if args.format == "markdown":
            output.write_text(render_markdown(result), encoding="utf-8")
        else:
            output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


def looks_like_full_workspace(root: Path) -> bool:
    required = [root / "00_protocol", root / "01_window_runs", root / "05_master_tables", root / "06_reports"]
    return all(path.exists() for path in required)


def assess(root: Path) -> dict:
    master_rows = {
        "master_source_index": csv_row_count(root / "05_master_tables" / "master_source_index.csv"),
        "direction_scoreboard": csv_row_count(root / "05_master_tables" / "direction_scoreboard.csv"),
        "research_to_experiment_matrix": csv_row_count(root / "05_master_tables" / "research_to_experiment_matrix.csv"),
        "validation_matrix": csv_row_count(root / "05_validation" / "validation_matrix.csv"),
    }

    worker_dirs = sorted((root / "01_window_runs").glob("W*_*"))
    worker_stats = []
    worker_evidence_lanes = 0
    worker_report_lanes = 0
    total_evidence_rows = 0
    total_round_rows = 0
    for worker_dir in worker_dirs:
        evidence_rows = csv_row_count(worker_dir / "evidence_matrix.csv")
        round_rows = csv_row_count(worker_dir / "round_log.csv")
        report_meaningful = meaningful_text_length(worker_dir / "direction_report.md") >= 120
        quality_audit_meaningful = meaningful_text_length(worker_dir / "quality_audit.md") >= 60
        total_evidence_rows += evidence_rows
        total_round_rows += round_rows
        if evidence_rows > 0:
            worker_evidence_lanes += 1
        if report_meaningful:
            worker_report_lanes += 1
        worker_stats.append(
            {
                "worker": worker_dir.name,
                "evidence_rows": evidence_rows,
                "round_rows": round_rows,
                "direction_report_meaningful": report_meaningful,
                "quality_audit_meaningful": quality_audit_meaningful,
            }
        )

    route_boards = {
        "stable_route_board_meaningful": meaningful_text_length(root / "06_reports" / "STABLE_ROUTE_BOARD.md") >= 80,
        "aggressive_route_board_meaningful": meaningful_text_length(root / "06_reports" / "AGGRESSIVE_ROUTE_BOARD.md") >= 80,
        "final_report_meaningful": meaningful_text_length(root / "06_reports" / "final_technical_report.md") >= 120,
        "next_user_decision_meaningful": meaningful_text_length(root / "06_reports" / "NEXT_USER_DECISION.md") >= 80,
        "reentry_decision_meaningful": section_meaningful_text_length(root / "06_reports" / "REENTRY_DECISION.md", "## User Decision", ["## Notes"]) >= 20,
        "direction_selection_meaningful": section_meaningful_text_length(root / "06_reports" / "DIRECTION_SELECTION.md", "## User Choice", ["## Notes"]) >= 30,
        "deep_dive_selection_meaningful": section_meaningful_text_length(root / "06_reports" / "DEEP_DIVE_SELECTION.md", "## User Choice", ["## Notes"]) >= 30,
        "direction_depth_plan_rows": csv_row_count(root / "06_reports" / "DIRECTION_DEPTH_PLAN.csv"),
        "focused_strengthening_selection_meaningful": section_meaningful_text_length(root / "06_reports" / "FOCUSED_STRENGTHENING_SELECTION.md", "## User Choice", ["## Notes"]) >= 20,
        "focused_strengthening_plan_rows": csv_row_count(root / "06_reports" / "FOCUSED_STRENGTHENING_PLAN.csv"),
    }
    route_boards["direction_depth_plan_confirmed_rows"] = route_boards["direction_depth_plan_rows"] if route_boards["direction_selection_meaningful"] and route_boards["deep_dive_selection_meaningful"] else 0
    route_boards["focused_strengthening_plan_confirmed_rows"] = route_boards["focused_strengthening_plan_rows"] if route_boards["focused_strengthening_selection_meaningful"] else 0

    credibility_summary = credibility_overview(root / "06_reports" / "credibility")

    score_breakdown = compute_score_breakdown(master_rows, total_evidence_rows, total_round_rows, worker_evidence_lanes, worker_report_lanes, route_boards, credibility_summary)
    quality_score_100 = sum(score_breakdown.values())
    blockers, strengths = derive_findings(master_rows, worker_evidence_lanes, total_evidence_rows, route_boards, credibility_summary)
    status, recommended_next_action = classify_progress(quality_score_100, worker_evidence_lanes, master_rows, route_boards, credibility_summary)

    return {
        "workspace_root": str(root),
        "status": status,
        "quality_score_100": quality_score_100,
        "quality_band": quality_band(quality_score_100),
        "critical_blocker_count": len(blockers),
        "score_breakdown": score_breakdown,
        "master_rows": master_rows,
        "worker_summary": {
            "worker_count": len(worker_stats),
            "workers_with_evidence": worker_evidence_lanes,
            "workers_with_meaningful_reports": worker_report_lanes,
            "total_evidence_rows": total_evidence_rows,
            "total_round_rows": total_round_rows,
        },
        "route_boards": route_boards,
        "credibility_summary": credibility_summary,
        "strongest_direction_credibility": credibility_summary["strongest_direction"],
        "strongest_route_board_credibility": credibility_summary["strongest_route_board"],
        "weakest_direction_credibility": credibility_summary["weakest_direction"],
        "blockers": blockers,
        "strengths": strengths,
        "recommended_next_action": recommended_next_action,
        "worker_stats": worker_stats,
    }


def compute_score_breakdown(master_rows: dict, total_evidence_rows: int, total_round_rows: int, worker_evidence_lanes: int, worker_report_lanes: int, route_boards: dict, credibility_summary: dict) -> dict:
    evidence_score = min(15, master_rows["master_source_index"] // 2) + min(12, total_evidence_rows // 3) + min(8, total_round_rows // 4)
    synthesis_score = (8 if route_boards["final_report_meaningful"] else 0) + (5 if route_boards["stable_route_board_meaningful"] else 0) + (5 if route_boards["aggressive_route_board_meaningful"] else 0) + min(7, worker_report_lanes)
    decision_surface_score = (
        (4 if route_boards["next_user_decision_meaningful"] else 0)
        + (4 if route_boards["reentry_decision_meaningful"] else 0)
        + (4 if route_boards["direction_selection_meaningful"] else 0)
        + (4 if route_boards["deep_dive_selection_meaningful"] else 0)
        + min(4, route_boards["direction_depth_plan_confirmed_rows"])
        + (2 if route_boards["focused_strengthening_selection_meaningful"] else 0)
        + min(2, route_boards["focused_strengthening_plan_confirmed_rows"])
        + min(6, master_rows["research_to_experiment_matrix"] // 2)
        + min(4, master_rows["validation_matrix"] // 2)
    )
    launch_readiness_score = min(10, worker_evidence_lanes * 2) + min(6, master_rows["direction_scoreboard"] // 2) + min(4, master_rows["validation_matrix"])
    credibility_score = min(8, credibility_summary["report_count"] * 2)
    if credibility_summary["average_score_35"] >= 28:
        credibility_score += 5
    elif credibility_summary["average_score_35"] >= 20:
        credibility_score += 3
    credibility_score += min(6, credibility_summary["direction_coverage_count"] * 2)
    credibility_score += 6 if credibility_summary["route_board_coverage_count"] >= 2 else (3 if credibility_summary["route_board_coverage_count"] == 1 else 0)
    return {
        "evidence_score": evidence_score,
        "synthesis_score": synthesis_score,
        "decision_surface_score": decision_surface_score,
        "launch_readiness_score": launch_readiness_score,
        "credibility_score": credibility_score,
    }


def derive_findings(master_rows: dict, worker_evidence_lanes: int, total_evidence_rows: int, route_boards: dict, credibility_summary: dict) -> tuple[list[str], list[str]]:
    blockers: list[str] = []
    strengths: list[str] = []

    if total_evidence_rows == 0:
        blockers.append("no worker evidence rows are present yet")
    if master_rows["master_source_index"] == 0:
        blockers.append("master source index is still empty")
    if not route_boards["stable_route_board_meaningful"] and not route_boards["aggressive_route_board_meaningful"]:
        blockers.append("route boards are still placeholders")
    if not route_boards["reentry_decision_meaningful"]:
        blockers.append("workspace reentry decision is still placeholder-level or missing explicit user choice")
    if not route_boards["direction_selection_meaningful"]:
        blockers.append("direction selection is still placeholder-level or missing explicit user choices")
    if not route_boards["deep_dive_selection_meaningful"]:
        blockers.append("deep-dive selection is still placeholder-level or missing explicit user choices")
    if route_boards["direction_depth_plan_rows"] == 0:
        blockers.append("direction-depth budget plan is still empty")
    if master_rows["research_to_experiment_matrix"] == 0:
        blockers.append("research-to-experiment mapping is still missing")
    if credibility_summary["report_count"] == 0:
        blockers.append("no explicit credibility reports are present yet")
    elif credibility_summary["average_score_35"] < 20:
        blockers.append("average credibility remains too caveated for confident promotion")
    if credibility_summary["direction_coverage_count"] == 0 and credibility_summary["report_count"] > 0:
        blockers.append("credibility reports are missing direction metadata")
    if credibility_summary["route_board_coverage_count"] == 0 and credibility_summary["report_count"] > 0:
        blockers.append("credibility reports are missing route-board metadata")

    if total_evidence_rows > 0:
        strengths.append(f"worker evidence accumulation has started with {total_evidence_rows} retained-evidence rows")
    if worker_evidence_lanes > 0:
        strengths.append(f"{worker_evidence_lanes} worker lanes already contain evidence")
    if route_boards["stable_route_board_meaningful"] or route_boards["aggressive_route_board_meaningful"]:
        strengths.append("at least one route board now has meaningful content")
    if route_boards["reentry_decision_meaningful"]:
        strengths.append("workspace reentry handling is explicit")
    if route_boards["direction_selection_meaningful"]:
        strengths.append("direction selection now records a meaningful user-facing prioritization")
    if route_boards["deep_dive_selection_meaningful"]:
        strengths.append("deep-dive selection now records meaningful depth choices")
    if route_boards["direction_depth_plan_confirmed_rows"] > 0:
        strengths.append(f"direction-depth budget intent is confirmed for {route_boards['direction_depth_plan_confirmed_rows']} row(s)")
    elif route_boards["direction_depth_plan_rows"] > 0:
        strengths.append(f"direction-depth draft recommendations exist for {route_boards['direction_depth_plan_rows']} row(s)")
    if route_boards["focused_strengthening_selection_meaningful"]:
        strengths.append("focused strengthening targets are explicitly recorded")
    if route_boards["focused_strengthening_plan_confirmed_rows"] > 0:
        strengths.append(f"focused strengthening plan is confirmed for {route_boards['focused_strengthening_plan_confirmed_rows']} row(s)")
    elif route_boards["focused_strengthening_plan_rows"] > 0:
        strengths.append(f"focused strengthening draft recommendations exist for {route_boards['focused_strengthening_plan_rows']} row(s)")
    if master_rows["research_to_experiment_matrix"] > 0:
        strengths.append("research findings are starting to map into executable validation placeholders")
    if credibility_summary["report_count"] > 0:
        strengths.append(f"explicit credibility scoring exists for {credibility_summary['report_count']} item(s)")
    if credibility_summary["average_score_35"] >= 28:
        strengths.append("average credibility is in the high-confidence band")
    if credibility_summary["strongest_direction"]:
        strengths.append(f"strongest credibility direction is {credibility_summary['strongest_direction']['direction']}")
    if credibility_summary["strongest_route_board"]:
        strengths.append(f"strongest route-board credibility is {credibility_summary['strongest_route_board']['route_board']}")

    return blockers, strengths


def classify_progress(quality_score_100: int, worker_evidence_lanes: int, master_rows: dict, route_boards: dict, credibility_summary: dict) -> tuple[str, str]:
    if quality_score_100 < 20:
        return "structural_only", "begin evidence intake and populate worker logs"
    if quality_score_100 < 55:
        return "evidence_building", "continue intake, claim extraction, and conflict handling until route ranking becomes meaningful"
    if quality_score_100 < 80 or worker_evidence_lanes < 3 or master_rows["research_to_experiment_matrix"] == 0 or credibility_summary["average_score_35"] < 20 or route_boards["direction_depth_plan_confirmed_rows"] == 0:
        return "decision_ready", "surface the next user decision and confirm which route board or strengthening action should advance"
    if route_boards["next_user_decision_meaningful"]:
        return "launch_candidate", "confirm launch or execution posture with the user before opening or escalating worker lanes"
    return "decision_ready", "tighten the decision surface before launch"


def quality_band(score: int) -> str:
    if score < 20:
        return "empty_shell"
    if score < 55:
        return "building"
    if score < 80:
        return "operator_ready"
    return "launch_grade"


def render_markdown(result: dict) -> str:
    blockers = "\n".join(f"{idx}. {item}" for idx, item in enumerate(result["blockers"], start=1)) or "1. none"
    strengths = "\n".join(f"{idx}. {item}" for idx, item in enumerate(result["strengths"], start=1)) or "1. none"
    score_breakdown = "\n".join(f"- {key}: `{value}`" for key, value in result["score_breakdown"].items())
    return f"""# Full Workspace Progress Audit

## Status

- status: `{result['status']}`
- quality_score_100: `{result['quality_score_100']}`
- quality_band: `{result['quality_band']}`
- critical_blocker_count: `{result['critical_blocker_count']}`

## Score Breakdown

{score_breakdown}

## Credibility Summary

- report_count: `{result['credibility_summary']['report_count']}`
- average_score_35: `{result['credibility_summary']['average_score_35']}`
- strongest_band: `{result['credibility_summary']['strongest_band']}`
- direction_coverage_count: `{result['credibility_summary']['direction_coverage_count']}`
- route_board_coverage_count: `{result['credibility_summary']['route_board_coverage_count']}`
- strongest_direction: `{result['strongest_direction_credibility']}`
- strongest_route_board: `{result['strongest_route_board_credibility']}`
- weakest_direction: `{result['weakest_direction_credibility']}`

## Blockers

{blockers}

## Strengths

{strengths}

## Recommended Next Action

{result['recommended_next_action']}
"""


def credibility_overview(directory: Path) -> dict:
    if not directory.exists():
        return {
            "report_count": 0,
            "average_score_35": 0,
            "strongest_band": "none",
            "direction_coverage_count": 0,
            "route_board_coverage_count": 0,
            "strongest_direction": None,
            "weakest_direction": None,
            "strongest_route_board": None,
        }

    scores: list[int] = []
    strongest_band = "none"
    band_rank = {"none": 0, "weak": 1, "caveated": 2, "actionable": 3, "high_confidence": 4}
    by_direction: dict[str, list[int]] = {}
    by_route_board: dict[str, list[int]] = {}

    for path in directory.rglob("*.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if "credibility_score_35" not in payload:
            continue
        score = int(payload["credibility_score_35"])
        scores.append(score)
        band = payload.get("credibility_band", "none")
        if band_rank.get(band, 0) > band_rank.get(strongest_band, 0):
            strongest_band = band
        direction = payload.get("direction")
        route_board = payload.get("route_board")
        if direction:
            by_direction.setdefault(str(direction), []).append(score)
        if route_board:
            by_route_board.setdefault(str(route_board), []).append(score)

    if not scores:
        return {
            "report_count": 0,
            "average_score_35": 0,
            "strongest_band": "none",
            "direction_coverage_count": 0,
            "route_board_coverage_count": 0,
            "strongest_direction": None,
            "weakest_direction": None,
            "strongest_route_board": None,
        }

    strongest_direction = summarize_best_group(by_direction)
    weakest_direction = summarize_worst_group(by_direction)
    strongest_route_board = summarize_best_group(by_route_board, field_name="route_board")

    return {
        "report_count": len(scores),
        "average_score_35": round(sum(scores) / len(scores), 2),
        "strongest_band": strongest_band,
        "direction_coverage_count": len(by_direction),
        "route_board_coverage_count": len(by_route_board),
        "strongest_direction": strongest_direction,
        "weakest_direction": weakest_direction,
        "strongest_route_board": strongest_route_board,
    }


def summarize_best_group(groups: dict[str, list[int]], field_name: str = "direction") -> dict | None:
    if not groups:
        return None
    best_name, best_scores = max(groups.items(), key=lambda item: (sum(item[1]) / len(item[1]), len(item[1])))
    return {
        field_name: best_name,
        "average_score_35": round(sum(best_scores) / len(best_scores), 2),
        "report_count": len(best_scores),
    }


def summarize_worst_group(groups: dict[str, list[int]], field_name: str = "direction") -> dict | None:
    if not groups:
        return None
    worst_name, worst_scores = min(groups.items(), key=lambda item: (sum(item[1]) / len(item[1]), -len(item[1])))
    return {
        field_name: worst_name,
        "average_score_35": round(sum(worst_scores) / len(worst_scores), 2),
        "report_count": len(worst_scores),
    }


def csv_row_count(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        try:
            next(reader)
        except StopIteration:
            return 0
        return sum(1 for _ in reader)


def meaningful_text_length(path: Path) -> int:
    if not path.exists():
        return 0
    text = path.read_text(encoding="utf-8")
    return meaningful_text_length_from_text(text)


def section_meaningful_text_length(path: Path, heading: str, next_headings: list[str]) -> int:
    if not path.exists():
        return 0
    text = path.read_text(encoding="utf-8")
    section = extract_section(text, heading, next_headings)
    return meaningful_text_length_from_text(section)


def extract_section(text: str, heading: str, next_headings: list[str]) -> str:
    start = text.find(heading)
    if start == -1:
        return ""
    start += len(heading)
    end_candidates = [text.find(next_heading, start) for next_heading in next_headings if text.find(next_heading, start) != -1]
    end = min(end_candidates) if end_candidates else len(text)
    return text[start:end]


def meaningful_text_length_from_text(text: str) -> int:
    lines = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#"):
            continue
        if line.startswith("|"):
            continue
        if re.fullmatch(r"`.*`", line):
            continue
        lowered = line.lower().strip(":")
        if lowered in PLACEHOLDER_PATTERNS:
            continue
        if any(pattern.fullmatch(lowered) for pattern in PLACEHOLDER_LINE_PATTERNS):
            continue
        lines.append(line)
    return len(" ".join(lines))


if __name__ == "__main__":
    main()
