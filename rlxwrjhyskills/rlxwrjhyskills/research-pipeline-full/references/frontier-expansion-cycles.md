# Frontier Expansion Cycles

## Objective

Turn a vague request for "search more sources" into a bounded, auditable frontier-expansion program.

## Default cycle structure

### Stage 1: direction discovery

For each active direction:

1. run `10` discovery rounds
2. record the search question, query set, candidate set, retained sources, and next action each round
3. score the direction before any long deep-dive starts

### Stage 2: deep search cycles

For each promoted direction:

1. run deep retrieval in cycles of `50` search or retrieval rounds
2. allow up to `10` deep cycles per direction
3. stop early if two consecutive cycles add no retained evidence or do not change the direction judgment

### Stage 3: global follow-up minimum

Across the best directions:

1. run at least `20` additional follow-up cycles of `50` rounds each
2. stop only when the coordinator confirms that marginal evidence no longer changes ranking, adjudication, or validation priorities

## Promotion thresholds

After discovery, promote only when the average score on these dimensions is `>= 4.0`:

1. objective relevance
2. directness to the target domain or decision environment
3. evidence strength
4. implementation feasibility
5. expected upside

## Saturation stop rule

Declare a direction saturated only when all are true:

1. new rounds produce mainly duplicates or weaker restatements
2. conflict adjudication is stable
3. retained claims no longer change the validation slate
4. new evidence does not improve task directness or authority level

## What not to do

1. do not launch all directions directly into 50-round deep search
2. do not keep searching a weak direction just to satisfy a quota
3. do not count retrieval volume as progress unless retained evidence changed
