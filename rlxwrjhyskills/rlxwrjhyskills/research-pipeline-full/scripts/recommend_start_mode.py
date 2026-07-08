#!/usr/bin/env python3
"""Recommend a starting research posture for an arbitrary project root."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True

from profiles import get_profile


IGNORE_DIRS = {
    ".git",
    ".hg",
    ".svn",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    ".mypy_cache",
    ".pytest_cache",
}

DOC_EXTS = {".md", ".txt", ".rst", ".pdf", ".doc", ".docx", ".ppt", ".pptx"}
DATA_EXTS = {".csv", ".tsv", ".parquet", ".json", ".jsonl", ".xlsx", ".xls"}
CODE_EXTS = {".py", ".ipynb", ".r", ".jl", ".m", ".cpp", ".c", ".ts", ".js", ".java", ".go", ".rs"}
TEXT_EXTS = DOC_EXTS | DATA_EXTS | CODE_EXTS | {".yaml", ".yml", ".toml", ".ini", ".cfg"}


def main() -> None:
    parser = argparse.ArgumentParser(description="Recommend a start mode for a research project")
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--profile", default="generic")
    parser.add_argument("--output")
    args = parser.parse_args()

    project_root = Path(args.project_root).resolve()
    profile = get_profile(args.profile)
    result = recommend_mode(project_root, args.profile, profile)

    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(render_markdown(result), encoding="utf-8")

    print(json.dumps(result, ensure_ascii=False, indent=2))


def recommend_mode(project_root: Path, profile_name: str, profile: dict) -> dict:
    stats = collect_stats(project_root)
    markers = detect_markers(project_root)
    recommended_track = "full"
    recommended_start = "bootstrap_then_full"
    confidence = "medium"
    reasons: list[str] = []

    if markers["has_full_workspace_markers"]:
        recommended_track = "full"
        recommended_start = "continue_full_workspace"
        confidence = "high"
        reasons.append("existing full-workspace protocol markers already exist")
    elif markers["has_lite_workspace_markers"]:
        recommended_track = "lite"
        recommended_start = "continue_lite_workspace"
        confidence = "high"
        reasons.append("existing lite-workspace packet markers already exist")
    elif stats["total_files"] == 0:
        recommended_track = "lite"
        recommended_start = "bootstrap_then_lite"
        confidence = "medium"
        reasons.append("the project root is nearly empty, so a lightweight bootstrap is the cheapest safe start")
    else:
        if markers["partial_full_workspace_detected"]:
            reasons.append(f"partial full-workspace markers already exist: {', '.join(markers['partial_full_markers_present'])}")
        if markers["partial_lite_workspace_detected"]:
            reasons.append(f"partial lite-workspace markers already exist: {', '.join(markers['partial_lite_markers_present'])}")
        high_scale = stats["total_files"] >= 150 or stats["doc_files"] >= 40 or stats["data_files"] >= 20 or stats["code_files"] >= 25
        high_conflict = stats["version_signal_count"] >= 3
        research_heavy = stats["text_like_files"] >= 50 or stats["research_named_files"] >= 12
        if high_scale or high_conflict or research_heavy:
            recommended_track = "full"
            recommended_start = "bootstrap_then_full"
            confidence = "high" if high_scale or high_conflict else "medium"
            if high_scale:
                reasons.append("the corpus already looks too large for a casual lightweight pass")
            if high_conflict:
                reasons.append("multiple version or draft signals suggest audit and conflict handling are needed early")
            if research_heavy:
                reasons.append("the file mix already looks like a sustained research program rather than a small intake batch")
        else:
            recommended_track = "lite"
            recommended_start = "bootstrap_then_lite"
            confidence = "medium"
            reasons.append("the project appears small enough to justify fast triage before a heavier program")

    if not reasons:
        reasons.append("default conservative routing selected because the file mix is ambiguous")

    return {
        "project_root": str(project_root),
        "profile": profile_name,
        "markers": markers,
        "stats": stats,
        "recommended_track": recommended_track,
        "recommended_start": recommended_start,
        "confidence": confidence,
        "recommended_window_count": profile["recommended_window_count"] if recommended_track == "full" else "not_applicable_yet",
        "reasons": reasons,
        "copy_paste_prompt": build_copy_paste_prompt(recommended_track, recommended_start, project_root, profile_name),
        "copy_paste_prompt_codex": build_copy_paste_prompt_codex(recommended_track, recommended_start, project_root, profile_name),
    }


def collect_stats(project_root: Path) -> dict:
    total_files = 0
    text_like_files = 0
    doc_files = 0
    data_files = 0
    code_files = 0
    nested_dirs: set[Path] = set()
    version_signal_count = 0
    research_named_files = 0

    version_pattern = re.compile(r"(?:^|[_\-.])(old|draft|final|archive|backup|v\d+|rev\d+)(?:$|[_\-.])", re.IGNORECASE)
    research_pattern = re.compile(r"research|paper|literature|survey|report|note|study|experiment|benchmark|prompt|search", re.IGNORECASE)

    for path in project_root.rglob("*"):
        if any(part in IGNORE_DIRS for part in path.parts):
            continue
        if path.is_dir():
            nested_dirs.add(path)
            continue
        total_files += 1
        suffix = path.suffix.lower()
        if suffix in TEXT_EXTS:
            text_like_files += 1
        if suffix in DOC_EXTS:
            doc_files += 1
        if suffix in DATA_EXTS:
            data_files += 1
        if suffix in CODE_EXTS:
            code_files += 1
        name = path.name
        if version_pattern.search(name):
            version_signal_count += 1
        if research_pattern.search(name):
            research_named_files += 1

    return {
        "total_files": total_files,
        "text_like_files": text_like_files,
        "doc_files": doc_files,
        "data_files": data_files,
        "code_files": code_files,
        "nested_dir_count": len(nested_dirs),
        "version_signal_count": version_signal_count,
        "research_named_files": research_named_files,
    }


def detect_markers(project_root: Path) -> dict:
    full_markers = ["00_protocol", "01_window_runs", "05_master_tables", "06_reports"]
    lite_markers = ["00_raw", "01_index", "02_retained", "03_output"]
    full_present = [item for item in full_markers if (project_root / item).exists()]
    lite_present = [item for item in lite_markers if (project_root / item).exists()]
    return {
        "has_full_workspace_markers": all((project_root / item).exists() for item in ["00_protocol", "01_window_runs", "05_master_tables"]),
        "has_lite_workspace_markers": all((project_root / item).exists() for item in ["00_raw", "01_index", "03_output"]),
        "partial_full_workspace_detected": len(full_present) >= 2 and len(full_present) < len(full_markers),
        "partial_lite_workspace_detected": len(lite_present) >= 2 and len(lite_present) < len(lite_markers),
        "partial_full_markers_present": full_present,
        "partial_lite_markers_present": lite_present,
    }


def build_copy_paste_prompt(track: str, start: str, project_root: Path, profile_name: str) -> str:
    skills_root = Path(__file__).resolve().parents[2]
    if track == "lite":
        return (
            f"Use the reusable skill described at {skills_root / 'research-pipeline-lite' / 'SKILL.md'}.\n\n"
            f"Project root: {project_root}\n\n"
            f"Recommended start: {start}\n"
            "Read that SKILL.md completely first, run a lightweight triage-first research pass, ask whether any partial workspace should be continued, repaired, or rebuilt before proceeding, ask what should be strengthened first if the user chooses strengthen mode, keep the result user-visible, and stop with a copy-paste checkpoint prompt when the first decision packet is ready."
        )
    return (
        f"Use the reusable skill described at {skills_root / 'research-pipeline-full' / 'SKILL.md'}.\n\n"
        f"Project root: {project_root}\n"
        f"Active profile: {profile_name}\n\n"
        f"Recommended start: {start}\n"
        "Read that SKILL.md completely first. Then run the project as a full research program, ask whether any partial workspace should be continued, repaired, or rebuilt before proceeding, ask what should be strengthened first if the user chooses strengthen mode, bootstrap structure if needed, audit existing content before trusting it, and keep every major phase gate explicit and user-visible."
    )


def build_copy_paste_prompt_codex(track: str, start: str, project_root: Path, profile_name: str) -> str:
    skills_root = Path(__file__).resolve().parents[2]
    if track == "lite":
        return (
            f"Use $research-pipeline-lite at {skills_root / 'research-pipeline-lite' / 'SKILL.md'} for this research project.\n\n"
            f"Project root: {project_root}\n\n"
            f"Recommended start: {start}\n"
            "Run a lightweight triage-first research pass, ask whether any partial workspace should be continued, repaired, or rebuilt before proceeding, ask what should be strengthened first if the user chooses strengthen mode, keep the result user-visible, and stop with a copy-paste checkpoint prompt when the first decision packet is ready."
        )
    return (
        f"Use $research-pipeline-full at {skills_root / 'research-pipeline-full' / 'SKILL.md'} for this research project.\n\n"
        f"Project root: {project_root}\n"
        f"Active profile: {profile_name}\n\n"
        f"Recommended start: {start}\n"
        "Run the project as a full research program, ask whether any partial workspace should be continued, repaired, or rebuilt before proceeding, ask what should be strengthened first if the user chooses strengthen mode, bootstrap structure if needed, audit existing content before trusting it, and keep every major phase gate explicit and user-visible."
    )


def render_markdown(result: dict) -> str:
    reasons = "\n".join(f"{idx}. {reason}" for idx, reason in enumerate(result["reasons"], start=1))
    stats = result["stats"]
    return f"""# Start Mode Recommendation

## Recommendation

- track: `{result['recommended_track']}`
- start: `{result['recommended_start']}`
- confidence: `{result['confidence']}`

## Reasons

{reasons}

## File Summary

- total files: `{stats['total_files']}`
- text-like files: `{stats['text_like_files']}`
- document files: `{stats['doc_files']}`
- data files: `{stats['data_files']}`
- code files: `{stats['code_files']}`
- version signals: `{stats['version_signal_count']}`
- research-named files: `{stats['research_named_files']}`

## Copy-Paste Prompt

```text
{result['copy_paste_prompt']}
```

## Copy-Paste Prompt For Codex

```text
{result.get('copy_paste_prompt_codex', '')}
```
"""


if __name__ == "__main__":
    main()
