#!/usr/bin/env python3
"""Score research credibility across explicit trust dimensions."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


DIMENSIONS = [
    "source_authority",
    "task_directness",
    "empirical_strength",
    "transfer_risk",
    "reproducibility_readiness",
    "contradiction_burden",
    "validation_readiness",
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Score research credibility explicitly")
    parser.add_argument("--input-json", required=True)
    parser.add_argument("--output")
    parser.add_argument("--format", choices=["json", "markdown"], default="json")
    args = parser.parse_args()

    payload = json.loads(Path(args.input_json).read_text(encoding="utf-8"))
    result = score_payload(payload)

    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        if args.format == "markdown":
            output.write_text(render_markdown(result), encoding="utf-8")
        else:
            output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0)


def score_payload(payload: dict) -> dict:
    scores = payload.get("scores", {})
    normalized_scores = {dimension: int(scores.get(dimension, 0)) for dimension in DIMENSIONS}
    for dimension, value in normalized_scores.items():
        if value < 0 or value > 5:
            raise ValueError(f"Score for {dimension} must be between 0 and 5")

    total = sum(normalized_scores.values())
    band = credibility_band(total)
    blockers = derive_blockers(normalized_scores)
    strengths = derive_strengths(normalized_scores)

    return {
        "label": payload.get("label", "unlabeled_item"),
        "direction": payload.get("direction"),
        "route_board": payload.get("route_board"),
        "claim_scope": payload.get("claim_scope"),
        "source_id": payload.get("source_id"),
        "claim_id": payload.get("claim_id"),
        "credibility_score_35": total,
        "credibility_band": band,
        "scores": normalized_scores,
        "credibility_blockers": blockers,
        "credibility_strengths": strengths,
    }


def credibility_band(total: int) -> str:
    if total < 12:
        return "weak"
    if total < 20:
        return "caveated"
    if total < 28:
        return "actionable"
    return "high_confidence"


def derive_blockers(scores: dict[str, int]) -> list[str]:
    blockers: list[str] = []
    if scores["source_authority"] <= 1:
        blockers.append("source authority is too weak")
    if scores["task_directness"] <= 1:
        blockers.append("task directness is too low")
    if scores["empirical_strength"] <= 1:
        blockers.append("empirical evidence is too weak")
    if scores["validation_readiness"] <= 1:
        blockers.append("validation readiness is too weak")
    if scores["contradiction_burden"] <= 1:
        blockers.append("contradiction burden is too high or unresolved")
    return blockers


def derive_strengths(scores: dict[str, int]) -> list[str]:
    strengths: list[str] = []
    if scores["source_authority"] >= 4:
        strengths.append("source authority is strong")
    if scores["task_directness"] >= 4:
        strengths.append("task alignment is strong")
    if scores["empirical_strength"] >= 4:
        strengths.append("empirical evidence is strong")
    if scores["validation_readiness"] >= 4:
        strengths.append("the claim maps cleanly into validation")
    if scores["reproducibility_readiness"] >= 4:
        strengths.append("the source is reproducible enough to trust operationally")
    return strengths


def render_markdown(result: dict) -> str:
    score_lines = "\n".join(f"- {key}: `{value}`" for key, value in result["scores"].items())
    blocker_lines = "\n".join(f"{idx}. {item}" for idx, item in enumerate(result["credibility_blockers"], start=1)) or "1. none"
    strength_lines = "\n".join(f"{idx}. {item}" for idx, item in enumerate(result["credibility_strengths"], start=1)) or "1. none"
    return f"""# Credibility Score

## Summary

- label: `{result['label']}`
- direction: `{result['direction']}`
- route_board: `{result['route_board']}`
- claim_scope: `{result['claim_scope']}`
- credibility_score_35: `{result['credibility_score_35']}`
- credibility_band: `{result['credibility_band']}`

## Dimension Scores

{score_lines}

## Blockers

{blocker_lines}

## Strengths

{strength_lines}
"""


if __name__ == "__main__":
    main()
