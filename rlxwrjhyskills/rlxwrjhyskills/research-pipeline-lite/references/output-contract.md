# Lite Output Contract

## Required files

1. `source_index.csv`
2. `retained_evidence.csv`
3. `action_map.csv`
4. `summary_memo.md`

## source_index.csv

Suggested fields:

1. source_id
2. title
3. author_or_org
4. year
5. source_type
6. stable_link
7. topic
8. status (`raw`, `retained`, `rejected`, `needs_review`)

## retained_evidence.csv

Suggested fields:

1. source_id
2. claim
3. study_context
4. method_summary
5. evidence_strength (`high`, `medium`, `low`)
6. transferability
7. risk_or_limitation

## action_map.csv

Suggested fields:

1. source_id
2. action_type
3. proposed_action
4. confidence
5. validation_needed
6. priority

## summary_memo.md

Keep it short and decision-oriented:

1. main question
2. strongest retained evidence
3. immediate actions
4. deferred actions
5. unresolved risks
