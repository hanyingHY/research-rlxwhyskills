# Validation Programs

## Goal

Convert research conclusions into an execution program that can be parallelized and judged cleanly.

## Validation scheme types

1. baseline replication
2. direct signal, feature, or rule insertion
3. ablation
4. routing, gating, or control-logic comparison
5. selection, aggregation, or output-layer comparison
6. benchmark challenge
7. heavy challenger route

## Per-scheme contract

Every scheme should name:

1. scheme_id
2. objective
3. inputs
4. dependencies
5. compute class
6. expected outputs
7. success metrics
8. promotion rule

## Literature-only mode

When the user explicitly wants corpus expansion rather than engineering, still produce validation-ready placeholders.

Minimum placeholder fields:

1. scheme_id
2. objective
3. retained claims that motivate it
4. required inputs
5. dependency level
6. expected comparison target
7. promotion rule if later executed

This keeps the retained research base decision-oriented without forcing premature implementation.

## Parallelization rule

Parallelize only after identifying dependencies.

1. independent baselines go first
2. dependent branches wait for parent outputs
3. expensive challengers wait until the benchmark and simple routes are frozen

## Promotion rule

Promote only when a scheme:

1. beats the benchmark on the intended layer
2. remains stable enough across slices
3. does not introduce unjustified operational fragility
