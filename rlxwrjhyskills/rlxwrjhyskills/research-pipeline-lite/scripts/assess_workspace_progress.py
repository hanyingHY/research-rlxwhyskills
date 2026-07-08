#!/usr/bin/env python3
"""Assess the real progress quality of a lite research workspace."""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path


PLACEHOLDER_PATTERNS = {
    "main question",
    "strongest evidence",
    "immediate actions",
    "deferred actions",
    "risks",
    "pending",
    "todo",
    "tbd",
    "current lite result",
    "recommended default",
    "recommended options",
    "user decision",
    "direct evidence first",
    "lower-risk choices",
    "simpler next steps",
    "higher-upside ideas",
    "more novel or transfer-heavy ideas",
    "extra validation needed",
}

PLACEHOLDER_LINE_PATTERNS = [
    re.compile(r"^\d+\.\s+(consolidate|strengthen|choose_stable_mode|choose_aggressive_mode|move_into_full_pipeline|stop)$", re.IGNORECASE),
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Assess progress quality for a lite research workspace")
    parser.add_argument("--workspace-root", required=True)
    parser.add_argument("--output")
    parser.add_argument("--format", choices=["json", "markdown"], default="json")
    args = parser.parse_args()

    root = Path(args.workspace_root).resolve()
    if not looks_like_lite_workspace(root):
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


def looks_like_lite_workspace(root: Path) -> bool:
    required = [root / "00_raw", root / "01_index", root / "02_retained", root / "03_output"]
    return all(path.exists() for path in required)


def assess(root: Path) -> dict:
    source_rows = csv_row_count(root / "01_index" / "source_index.csv")
    retained_rows = csv_row_count(root / "02_retained" / "retained_evidence.csv")
    action_rows = csv_row_count(root / "03_output" / "action_map.csv")
    summary_meaningful = meaningful_text_length(root / "03_output" / "summary_memo.md") >= 80
    next_decision_meaningful = section_meaningful_text_length(root / "03_output" / "NEXT_USER_DECISION.md", "## User Decision", []) >= 20
    reentry_decision_meaningful = section_meaningful_text_length(root / "03_output" / "REENTRY_DECISION.md", "## User Decision", ["## Notes"]) >= 20
    strengthening_selection_meaningful = section_meaningful_text_length(root / "03_output" / "FOCUSED_STRENGTHENING_SELECTION.md", "## User Choice", ["## Notes"]) >= 20
    strengthening_plan_rows = csv_row_count(root / "03_output" / "focused_strengthening_plan.csv")
    strengthening_plan_confirmed_rows = strengthening_plan_rows if strengthening_selection_meaningful else 0
    stable_meaningful = meaningful_text_length(root / "03_output" / "STABLE_OPTIONS.md") >= 40
    aggressive_meaningful = meaningful_text_length(root / "03_output" / "AGGRESSIVE_OPTIONS.md") >= 40

    score_breakdown = compute_score_breakdown(source_rows, retained_rows, action_rows, summary_meaningful, next_decision_meaningful, reentry_decision_meaningful, strengthening_selection_meaningful, strengthening_plan_confirmed_rows, stable_meaningful, aggressive_meaningful)
    quality_score_100 = sum(score_breakdown.values())
    blockers, strengths = derive_findings(source_rows, retained_rows, action_rows, summary_meaningful, next_decision_meaningful, reentry_decision_meaningful, strengthening_selection_meaningful, strengthening_plan_rows, strengthening_plan_confirmed_rows, stable_meaningful, aggressive_meaningful)
    status, recommended_next_action = classify_progress(quality_score_100, action_rows, summary_meaningful, next_decision_meaningful)

    return {
        "workspace_root": str(root),
        "status": status,
        "quality_score_100": quality_score_100,
        "quality_band": quality_band(quality_score_100),
        "critical_blocker_count": len(blockers),
        "score_breakdown": score_breakdown,
        "source_rows": source_rows,
        "retained_rows": retained_rows,
        "action_rows": action_rows,
        "summary_meaningful": summary_meaningful,
        "next_user_decision_meaningful": next_decision_meaningful,
        "reentry_decision_meaningful": reentry_decision_meaningful,
        "focused_strengthening_selection_meaningful": strengthening_selection_meaningful,
        "focused_strengthening_plan_rows": strengthening_plan_rows,
        "focused_strengthening_plan_confirmed_rows": strengthening_plan_confirmed_rows,
        "stable_options_meaningful": stable_meaningful,
        "aggressive_options_meaningful": aggressive_meaningful,
        "escalation_candidate": retained_rows >= 20 or action_rows >= 15,
        "blockers": blockers,
        "strengths": strengths,
        "recommended_next_action": recommended_next_action,
    }


def compute_score_breakdown(source_rows: int, retained_rows: int, action_rows: int, summary_meaningful: bool, next_decision_meaningful: bool, reentry_decision_meaningful: bool, strengthening_selection_meaningful: bool, strengthening_plan_rows: int, stable_meaningful: bool, aggressive_meaningful: bool) -> dict:
    evidence_score = min(18, source_rows // 2) + min(22, retained_rows // 2)
    actionability_score = min(20, action_rows * 2) + (15 if summary_meaningful else 0)
    decision_surface_score = (8 if next_decision_meaningful else 0) + (4 if reentry_decision_meaningful else 0) + (4 if strengthening_selection_meaningful else 0) + min(4, strengthening_plan_rows) + (4 if stable_meaningful else 0) + (4 if aggressive_meaningful else 0) + (1 if stable_meaningful or aggressive_meaningful else 0)
    return {
        "evidence_score": evidence_score,
        "actionability_score": actionability_score,
        "decision_surface_score": decision_surface_score,
    }


def derive_findings(source_rows: int, retained_rows: int, action_rows: int, summary_meaningful: bool, next_decision_meaningful: bool, reentry_decision_meaningful: bool, strengthening_selection_meaningful: bool, strengthening_plan_rows: int, strengthening_plan_confirmed_rows: int, stable_meaningful: bool, aggressive_meaningful: bool) -> tuple[list[str], list[str]]:
    blockers: list[str] = []
    strengths: list[str] = []

    if source_rows == 0:
        blockers.append("source index is still empty")
    if retained_rows == 0:
        blockers.append("retained evidence table is still empty")
    if action_rows == 0:
        blockers.append("action map has not been populated yet")
    if not summary_meaningful:
        blockers.append("summary memo is still mostly placeholder text")
    if not reentry_decision_meaningful:
        blockers.append("reentry decision is still placeholder-level or missing explicit user choice")

    if source_rows > 0:
        strengths.append(f"source indexing has started with {source_rows} rows")
    if retained_rows > 0:
        strengths.append(f"retained evidence extraction has started with {retained_rows} rows")
    if action_rows > 0:
        strengths.append(f"action map already contains {action_rows} actionable rows")
    if next_decision_meaningful:
        strengths.append("the next-user-decision surface contains meaningful guidance")
    if reentry_decision_meaningful:
        strengths.append("the workspace reentry decision is explicit")
    if strengthening_selection_meaningful:
        strengths.append("focused strengthening targets are recorded")
    if strengthening_plan_confirmed_rows > 0:
        strengths.append(f"focused strengthening plan is confirmed for {strengthening_plan_confirmed_rows} row(s)")
    elif strengthening_plan_rows > 0:
        strengths.append(f"focused strengthening draft recommendations exist for {strengthening_plan_rows} row(s)")
    if stable_meaningful or aggressive_meaningful:
        strengths.append("at least one option board has meaningful content")

    return blockers, strengths


def classify_progress(quality_score_100: int, action_rows: int, summary_meaningful: bool, next_decision_meaningful: bool) -> tuple[str, str]:
    if quality_score_100 < 20:
        return "structural_only", "begin source indexing and retained-evidence extraction"
    if quality_score_100 < 55 or action_rows == 0:
        return "evidence_building", "keep tightening the shortlist until the action map and summary become strong enough for a user choice"
    if summary_meaningful and next_decision_meaningful:
        return "decision_ready", "present the lite checkpoint and decide whether to stay lite, choose a mode, or escalate into the full pipeline"
    return "evidence_building", "improve the summary and the next-user-decision surface before asking for a choice"


def quality_band(score: int) -> str:
    if score < 20:
        return "empty_shell"
    if score < 55:
        return "building"
    return "operator_ready"


def render_markdown(result: dict) -> str:
    blockers = "\n".join(f"{idx}. {item}" for idx, item in enumerate(result["blockers"], start=1)) or "1. none"
    strengths = "\n".join(f"{idx}. {item}" for idx, item in enumerate(result["strengths"], start=1)) or "1. none"
    score_breakdown = "\n".join(f"- {key}: `{value}`" for key, value in result["score_breakdown"].items())
    return f"""# Lite Workspace Progress Audit

## Status

- status: `{result['status']}`
- quality_score_100: `{result['quality_score_100']}`
- quality_band: `{result['quality_band']}`
- critical_blocker_count: `{result['critical_blocker_count']}`

## Score Breakdown

{score_breakdown}

## Blockers

{blockers}

## Strengths

{strengths}

## Recommended Next Action

{result['recommended_next_action']}
"""


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
        lowered = line.lower().strip(":")
        if lowered in PLACEHOLDER_PATTERNS:
            continue
        if any(pattern.fullmatch(lowered) for pattern in PLACEHOLDER_LINE_PATTERNS):
            continue
        lines.append(line)
    return len(" ".join(lines))


if __name__ == "__main__":
    main()
