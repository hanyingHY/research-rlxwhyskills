# Windowed Search Programs

## Objective

Run a large source-expansion campaign across multiple windows without losing direction ownership, evidence quality, or synthesis discipline.

## Default recommendation

Use `10` active windows unless there is a strong reason to compress further.

Recommended roles:

1. coordinator
2. master tables and dedup
3. direction lane 01
4. direction lane 02
5. direction lane 03
6. direction lane 04
7. direction lane 05
8. intake and metadata
9. conflict review and citation chasing
10. synthesis and experiment mapping

## Search cadence

### Stage 1

Each direction completes `10` discovery rounds.

Per discovery round require:

1. one search question
2. one query set
3. candidate sources
4. retained items
5. one experimentable or validation-relevant conclusion
6. one next action

### Stage 2

Only directions with strong scores continue into deep cycles.

Default threshold:

- average score `>= 4.0` on relevance, directness, evidence strength, feasibility, and expected upside

### Stage 3

Run deep retrieval in bounded cycles.

Default deep-cycle rule:

1. `50` search or retrieval rounds per cycle
2. up to `10` cycles per promoted direction
3. stop early when two consecutive cycles add no retained evidence

### Stage 4

Across the strongest directions, run at least `20` additional deep-search cycles before declaring the corpus saturated, unless the coordinator confirms that information gain has clearly flattened.

## Ownership rule

1. each worker writes only to its own folder
2. only coordinator or master-table roles touch shared synthesis artifacts
3. disagreements are logged, not silently merged away
4. worker readiness does not automatically authorize the next phase; the coordinator must stop at the user decision gate before launch or escalation
