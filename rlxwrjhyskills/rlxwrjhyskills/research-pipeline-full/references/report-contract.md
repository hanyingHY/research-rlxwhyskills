# Report Contract

## Objective

Standardize the final synthesis so the output is decision-oriented, auditable, and directly usable by downstream validation or execution planners.

## Required top-level shape

Every final synthesis memo should:

1. start with a short objective statement
2. then provide the following sections in order:
   - strongest retained evidence
   - conflicts and adjudication
   - executable validation schemes
   - immediate next actions
   - deferred items

## Section expectations

### Strongest retained evidence

Require:

1. direct evidence first
2. explicit provenance
3. evidence-grade language
4. practical interpretation for the target task

### Conflicts and adjudication

Require:

1. contradiction at claim level
2. likely cause of disagreement
3. explicit winner, split verdict, or unresolved status

### Executable validation schemes

Every scheme must name:

1. objective
2. inputs
3. dependencies
4. expected outputs
5. metrics
6. promotion rule

If the user wants source accumulation only, still produce validation placeholders instead of skipping this section.

### Immediate next actions

Require:

1. a short prioritized list
2. only actions that should happen now
3. direct connection to retained evidence and validation design

### Deferred items

Require:

1. ideas that are useful but not ready
2. explicit reason for deferral
3. what would change that status later

## Prohibited output patterns

Do not:

1. produce a vague source review
2. list many titles with no action mapping
3. average contradictions away
4. propose execution with no validation contract
