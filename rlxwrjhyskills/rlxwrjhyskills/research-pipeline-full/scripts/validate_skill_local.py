#!/usr/bin/env python3
"""Validate the local skill structure without PyYAML."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python validate_skill_local.py <skill_directory>")
        sys.exit(1)

    root = Path(sys.argv[1]).resolve()
    checks = {
        "skill_md_exists": (root / "SKILL.md").exists(),
        "openai_yaml_exists": (root / "agents" / "openai.yaml").exists(),
        "openai_yaml_valid": validate_openai_yaml(root / "agents" / "openai.yaml"),
        "workflow_ref_exists": (root / "references" / "workflow.md").exists(),
        "research_program_flow_ref_exists": (root / "references" / "research-program-flow.md").exists(),
        "skill_flow_report_ref_exists": (root / "references" / "skill-flow-report.md").exists(),
        "evidence_ref_exists": (root / "references" / "evidence-grading.md").exists(),
        "credibility_scoring_ref_exists": (root / "references" / "credibility-scoring.md").exists(),
        "validation_ref_exists": (root / "references" / "validation-programs.md").exists(),
        "cloud_ref_exists": (root / "references" / "cloud-execution.md").exists(),
        "windowed_search_ref_exists": (root / "references" / "windowed-search-programs.md").exists(),
        "frontier_cycles_ref_exists": (root / "references" / "frontier-expansion-cycles.md").exists(),
        "authority_ladder_ref_exists": (root / "references" / "authority-ladder.md").exists(),
        "worker_file_contract_ref_exists": (root / "references" / "worker-file-contract.md").exists(),
        "task_interface_contract_ref_exists": (root / "references" / "task-interface-contract.md").exists(),
        "csv_schema_semantics_ref_exists": (root / "references" / "csv-schema-semantics.md").exists(),
        "existing_content_audit_ref_exists": (root / "references" / "existing-content-audit.md").exists(),
        "existing_content_audit_template_ref_exists": (root / "references" / "existing-content-audit-template.md").exists(),
        "user_decision_gates_ref_exists": (root / "references" / "user-decision-gates.md").exists(),
        "phase_state_contract_ref_exists": (root / "references" / "phase-state-contract.md").exists(),
        "broadcast_template_ref_exists": (root / "references" / "broadcast-template.md").exists(),
        "user_checkpoint_prompts_ref_exists": (root / "references" / "checkpoint-prompt-strata.md").exists(),
        "checkpoint_prompt_strata_ref_exists": (root / "references" / "checkpoint-prompt-strata.md").exists(),
        "solution_modes_ref_exists": (root / "references" / "solution-modes.md").exists(),
        "start_mode_routing_ref_exists": (root / "references" / "start-mode-routing.md").exists(),
        "workspace_progress_audit_ref_exists": (root / "references" / "workspace-progress-audit.md").exists(),
        "direction_depth_selection_ref_exists": (root / "references" / "direction-depth-selection.md").exists(),
        "focused_strengthening_ref_exists": (root / "references" / "focused-strengthening.md").exists(),
        "workspace_reentry_ref_exists": (root / "references" / "workspace-reentry.md").exists(),
        "portability_export_ref_exists": (root / "references" / "portability-export.md").exists(),
        "corpus_bootstrap_layout_ref_exists": (root / "references" / "corpus-bootstrap-layout.md").exists(),
        "literature_only_mode_ref_exists": (root / "references" / "literature-only-mode.md").exists(),
        "corpus_governance_ref_exists": (root / "references" / "corpus-governance.md").exists(),
        "autonomous_execution_pilot_ref_exists": (root / "references" / "autonomous-execution-pilot.md").exists(),
        "prompt_pack_ref_exists": (root / "references" / "prompt-pack-design.md").exists(),
        "report_contract_ref_exists": (root / "references" / "report-contract.md").exists(),
        "init_script_exists": (root / "scripts" / "init_research_program.py").exists(),
        "start_mode_script_exists": (root / "scripts" / "recommend_start_mode.py").exists(),
        "progress_audit_script_exists": (root / "scripts" / "assess_workspace_progress.py").exists(),
        "decision_surface_sync_script_exists": (root / "scripts" / "sync_decision_surfaces.py").exists(),
        "credibility_scoring_script_exists": (root / "scripts" / "score_research_credibility.py").exists(),
        "export_script_exists": (root / "scripts" / "export_skill_bundle.py").exists(),
        "entry_prompt_script_exists": (root / "scripts" / "generate_entry_prompts.py").exists(),
        "prompt_pack_script_exists": (root / "scripts" / "generate_window_prompt_pack.py").exists(),
        "validator_script_exists": (root / "scripts" / "validate_skill_local.py").exists(),
        "workspace_validator_exists": (root / "scripts" / "validate_windowed_research_program.py").exists(),
        "smoke_test_script_exists": (root / "scripts" / "smoke_test_skill.py").exists(),
        "profiles_script_exists": (root / "scripts" / "profiles.py").exists(),
        "skill_references_exist": referenced_paths_exist(root / "SKILL.md", root),
        "no_cache_artifacts": not find_cache_artifacts(root),
    }

    checks["frontmatter_valid"] = validate_frontmatter(root / "SKILL.md")

    result = {
        "skill_root": str(root),
        "checks": checks,
        "status": "ready" if all(checks.values()) else "needs_attention",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if result["status"] == "ready" else 1)


def validate_frontmatter(skill_md: Path) -> bool:
    if not skill_md.exists():
        return False
    text = skill_md.read_text(encoding="utf-8")
    match = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
    if not match:
        return False
    frontmatter = match.group(1)
    return bool(re.search(r"^name:\s+[a-z0-9-]+$", frontmatter, re.MULTILINE)) and bool(
        re.search(r"^description:\s+.+$", frontmatter, re.MULTILINE)
    )


def validate_openai_yaml(path: Path) -> bool:
    if not path.exists():
        return False
    text = path.read_text(encoding="utf-8")
    required_patterns = [
        r"^interface:\s*$",
        r'^\s+display_name:\s+"?.+"?\s*$',
        r'^\s+short_description:\s+"?.+"?\s*$',
        r'^\s+default_prompt:\s+"?.+"?\s*$',
        r"^policy:\s*$",
        r"^\s+allow_implicit_invocation:\s+(true|false)\s*$",
    ]
    return all(re.search(pattern, text, re.MULTILINE) for pattern in required_patterns)


def referenced_paths_exist(skill_md: Path, root: Path) -> bool:
    if not skill_md.exists():
        return False
    text = skill_md.read_text(encoding="utf-8")
    references = set(re.findall(r"`((?:references|scripts|agents|assets)/[^`]+)`", text))
    return all((root / Path(item)).exists() for item in references)


def find_cache_artifacts(root: Path) -> list[str]:
    artifacts: list[str] = []
    for path in root.rglob("*"):
        if "__pycache__" in path.parts or path.suffix in {".pyc", ".pyo"}:
            artifacts.append(str(path))
    return artifacts


if __name__ == "__main__":
    main()
