"""Profile definitions for research-pipeline-full."""

from __future__ import annotations


# Keep only project-agnostic defaults inside the core skill package.
# Project-specific overlays should live outside the core skill and be injected later.
PROFILE_DEFS = {
    "generic": {
        "display_name": "Generic Multi-Window Research Program",
        "recommended_window_count": "10 core windows",
        "optional_window_count": "1-2 optional refinement or audit windows after stabilization",
        "workers": {
            "W01_coordinator": "coordinator",
            "W02_master_tables": "master-table curator",
            "W03_direction_01": "direction lane 01",
            "W04_direction_02": "direction lane 02",
            "W05_direction_03": "direction lane 03",
            "W06_direction_04": "direction lane 04",
            "W07_direction_05": "direction lane 05",
            "W08_intake_metadata": "intake and metadata pipeline",
            "W09_conflict_review": "conflict review and citation chasing",
            "W10_synthesis": "synthesis and experiment mapping",
        },
        "focus": {
            "W01_coordinator": "global coordination, direction promotion, and final outline control",
            "W02_master_tables": "deduplication, direction scoreboard, and research-to-experiment matrix integrity",
            "W03_direction_01": "assigned direction 01 research lane",
            "W04_direction_02": "assigned direction 02 research lane",
            "W05_direction_03": "assigned direction 03 research lane",
            "W06_direction_04": "assigned direction 04 research lane",
            "W07_direction_05": "assigned direction 05 research lane",
            "W08_intake_metadata": "intake, metadata, classification, and quarantine governance",
            "W09_conflict_review": "claim-level conflict review and citation chasing",
            "W10_synthesis": "synthesis, route ranking, and validation-ready direction mapping",
        },
        "role_notes": {
            "W01_coordinator": [
                "track which directions deserve deep-cycle promotion",
                "record overlaps, stale assumptions, and unresolved dependencies",
                "keep the final report outline synchronized to the strongest windows",
                "own the user-facing phase gate and the recommended next step",
                "keep NEXT_USER_DECISION.md and CHECKPOINT_RESPONSE_LOG.md current",
            ],
            "W02_master_tables": [
                "merge retained evidence without duplicating rows",
                "flag weak, duplicate, or contradictory claims for adjudication",
                "keep the research-to-experiment matrix consistent with the latest trusted worker state",
            ],
            "W03_direction_01": [
                "define the lane's direction precisely before deep search",
                "retain only evidence that changes a validation or experiment decision",
                "convert strong claims into explicit downstream hypotheses",
            ],
            "W04_direction_02": [
                "define the lane's direction precisely before deep search",
                "retain only evidence that changes a validation or experiment decision",
                "convert strong claims into explicit downstream hypotheses",
            ],
            "W05_direction_03": [
                "define the lane's direction precisely before deep search",
                "retain only evidence that changes a validation or experiment decision",
                "convert strong claims into explicit downstream hypotheses",
            ],
            "W06_direction_04": [
                "define the lane's direction precisely before deep search",
                "retain only evidence that changes a validation or experiment decision",
                "convert strong claims into explicit downstream hypotheses",
            ],
            "W07_direction_05": [
                "define the lane's direction precisely before deep search",
                "retain only evidence that changes a validation or experiment decision",
                "convert strong claims into explicit downstream hypotheses",
            ],
            "W08_intake_metadata": [
                "route every new item exactly once",
                "attach metadata and disposition state immediately",
                "quarantine suspicious or low-trust intake instead of deleting it",
            ],
            "W09_conflict_review": [
                "adjudicate contradiction at the claim level",
                "explain whether conflicts come from domain, evaluation scope, data, or method",
                "replace weak conflict cases with stronger citation-chased evidence when possible",
            ],
            "W10_synthesis": [
                "rank immediate, dependent, and deferred routes explicitly",
                "keep the final synthesis evidence-first rather than title-first",
                "map retained findings into validation-ready direction slates",
                "prepare coordinator-facing recommendations without self-authorizing the next phase",
            ],
        },
    }
}


def get_profile(name: str) -> dict:
    if name not in PROFILE_DEFS:
        raise KeyError(f"Unknown profile: {name}")
    return PROFILE_DEFS[name]
