# Worker File Contract

## Objective

Keep every window output structurally consistent so synthesis and validation layers can trust worker folders.

## Universal worker files

Every worker folder should contain:

1. `direction_report.md`
2. `quality_audit.md`

Minimum markdown section contracts:

1. `direction_report.md` should contain headings for:
   - objective
   - strongest retained evidence
   - conflicts and adjudication
   - validation schemes or validation placeholders
   - immediate next actions
   - deferred items
2. `quality_audit.md` should contain headings for:
   - status
   - gaps
   - repairs

## Research-lane worker files

For research lanes, also require:

1. `round_log.csv`
2. `source_index.csv`
3. `evidence_matrix.csv`
4. `experiment_hypotheses.csv`

Minimum CSV header contracts:

1. `round_log.csv`: `round_id,search_question,query_set,candidate_count,retained_count,next_action`
2. `source_index.csv`: `source_id,title,authors,year,source,stable_link,direction,disposition`
3. `evidence_matrix.csv`: `source_id,claim,study_context,evaluation_scope,evidence_strength,transferability,implementation_value`
4. `experiment_hypotheses.csv`: `hypothesis_id,mapped_category,claim,validation_placeholder,priority`

## Coordinator extras

For the coordinator, require:

1. `coordinator_log.md`
2. `final_report_outline.md`

## Master-table extras

For the master-table lane, require:

1. `master_sync_log.md`

Master-table CSV header contracts:

1. `master_source_index.csv`: `source_id,title,authors,year,stable_link,primary_direction,disposition`
2. `direction_scoreboard.csv`: `direction,relevance,directness,evidence_strength,feasibility,expected_upside,status`
3. `research_to_experiment_matrix.csv`: `direction,claim,mapped_category,validation_placeholder,priority`

## Minimum contract rule

A worker is not structurally ready unless all required files for its role exist and are non-empty.

For CSV outputs, a file is not structurally ready if its header does not match the contract.
