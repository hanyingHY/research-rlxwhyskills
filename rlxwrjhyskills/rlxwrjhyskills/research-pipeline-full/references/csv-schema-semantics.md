# CSV Schema Semantics

## Objective

Define not only the required CSV headers, but also what each field means so parallel windows produce consistently interpretable structured data.

## round_log.csv

- `round_id`: stable round identifier
- `search_question`: the exact question pursued in the round
- `query_set`: the search query family or compressed query description
- `candidate_count`: number of candidate items reviewed
- `retained_count`: number of retained items after filtering
- `next_action`: what the next round should try

## source_index.csv

- `source_id`: local stable identifier
- `title`: exact source title
- `authors`: author or institution string
- `year`: publication, release, or document year
- `source`: journal, conference, series, or repository label
- `stable_link`: DOI or stable URL
- `direction`: one primary direction only
- `disposition`: approved disposition state

## evidence_matrix.csv

- `source_id`: foreign key into source index
- `claim`: claim precise enough to adjudicate
- `study_context`: domain, environment, population, or universe actually studied
- `evaluation_scope`: prediction horizon, intervention scope, operating regime, or analogous evaluation frame
- `evidence_strength`: confidence or grade label
- `transferability`: how well the evidence transfers to the target task
- `implementation_value`: practical usefulness if retained

## experiment_hypotheses.csv

- `hypothesis_id`: stable local hypothesis identifier
- `mapped_category`: signal or feature, rule or filter, target or label, model or method, routing or control logic, output or selection layer, validation design, or explicit rejection
- `claim`: retained claim being mapped forward
- `validation_placeholder`: future validation or experiment stub
- `priority`: immediate, dependent, or deferred

## ingestion_log.csv

- `timestamp`: time the item was classified or dispositioned
- `item_name`: original file or item name
- `source_path`: original intake location
- `primary_direction`: single primary routing bucket
- `secondary_tags`: optional supporting tags
- `disposition`: retain, reject, quarantine, or review state
- `reason`: why the disposition was applied
