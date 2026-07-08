# Skill Flow Report

## Objective

Explain how `research-pipeline-full` implements a full 11-step research-program flow that can be reused across research domains.

## 1. Strongest retained evidence

### Step-by-step mapping

1. **Traverse all project files and identify the existing research content**
   - `workflow.md`
   - `research-program-flow.md`
   - `existing-content-audit.md`
   - `existing-content-audit-template.md`

2. **Search outward to discover all meaningful research directions until direction-level increment flattens**
   - `windowed-search-programs.md`
   - `frontier-expansion-cycles.md`

3. **Verify that newly found material is authoritative and credible**
   - `evidence-grading.md`
   - `authority-ladder.md`

4. **Deepen each retained direction until information gain is exhausted**
   - `frontier-expansion-cycles.md`
   - generated worker prompts with discovery and deep-cycle rules

5. **Relate directions to each other and produce a report plus preparation files**
   - `report-contract.md`
   - `validation-programs.md`
   - generated `direction_report.md` and `final_technical_report.md` templates

6. **Iterate repeatedly until no meaningful new problem is found**
   - `research-program-flow.md`
   - `QUALITY_GATE.md`
   - `quality_audit.md`
   - `user-decision-gates.md`

7. **Build structure, per-direction folders, per-direction prompts, and unique task interfaces**
   - `init_research_program.py`
   - `generate_window_prompt_pack.py`
   - `worker-file-contract.md`
   - `task-interface-contract.md`
   - generated `task_interface.md`
   - generated `USER_DECISION_GATES.md`, `CHECKPOINT_RESPONSE_LOG.md`, and `NEXT_USER_DECISION.md`
   - generated `PHASE_STATE.md` and `UNIFIED_BROADCAST_PROMPT.md`
   - generated `DIRECTION_DEPTH_POLICY.md` and `USER_DIRECTION_DEPTH_PROMPTS.md`
   - generated `DIRECTION_DEPTH_PLAN.csv`
   - generated suggested user-facing checkpoint wording

8. **Run 50-round deep dives per promoted direction and prepare prompt outputs for the user**
   - `frontier-expansion-cycles.md`
   - generated worker prompts

9. **Recommend how many windows to open, including optional refinement windows**
   - `windowed-search-programs.md`
   - `research-program-flow.md`

10. **Report each window's direction and provide prompts that connect each window to its interface**
   - `prompt-pack-design.md`
   - generated `00_protocol/prompts/W01-W10.md`
   - generated `task_interface.md`

11. **Start work only after protocol, prompt, and interface contracts are stable**
   - `validate_windowed_research_program.py`
   - `smoke_test_skill.py`
   - explicit user checkpoint before phase advancement
   - proactive copy-paste prompt delivery to the user at every gate

## 2. Conflicts and adjudication

Key adjudications encoded in the skill:

1. do not treat vague deletion requests as default hard-delete authority
2. prefer reject, downgrade, quarantine, and review states with provenance
3. audit existing on-disk research before trusting it as retained evidence
4. keep a 10-window core as default and add only `1-2` optional refinement windows after the core lanes stabilize
5. do not let literature-only mode collapse into vague summaries; retain validation placeholders and direction-level decision structure
6. do not let successful completion of one stage silently authorize the next; stop and ask the user at major decision gates
7. do not let deep multi-direction work begin until the user has explicitly chosen direction selection, depth profile, and budget intent

## 3. Executable validation schemes

The skill now provides these executable checks:

1. `validate_skill_local.py`
   - validates the skill folder, key references, and script presence

2. `validate_windowed_research_program.py`
   - validates generated protocol files, worker folders, prompt sections, markdown report sections, CSV headers, task interfaces, and the direction-depth control surfaces

3. `smoke_test_skill.py`
   - runs init, prompt-pack generation, local skill validation, and workspace validation end to end

## 4. Immediate next actions

1. extend CSV contracts from header-level to value-level semantics and examples
2. add minimum non-empty-content checks for CSV rows and markdown sections
3. add more parameterized prompt-pack generation modes

## 5. Deferred items

1. mode-specific prompt generation such as `literature-only` vs `execution-linked`
2. richer disposition-log templates
3. deeper master-table contracts and program audit helpers
