# Solution Modes

## Objective

Support two explicit post-search decision modes without weakening the requirement for full search.

The search program should still expand the corpus until direction-level or claim-level information gain has flattened.

Only after that full search and evidence grading pass should the retained options be split into stable and aggressive solution boards.

## Stable mode

Stable mode prioritizes:

1. direct evidence
2. stronger authority
3. lower implementation risk
4. simpler dependency chains
5. lower operational fragility
6. more reproducible validation paths

## Aggressive mode

Aggressive mode prioritizes:

1. higher upside
2. more novel or transfer-heavy ideas
3. broader challenge routes
4. methods that may be harder or riskier but still pass minimum evidence and feasibility gates

## Rule

Do not let aggressive mode bypass evidence grading.

Aggressive routes may tolerate more transfer risk or engineering complexity, but they still need explicit provenance, conflict handling, and a real validation path.

## Required output split

After the full search and synthesis pass, produce:

1. a stable route board
2. an aggressive route board
3. one user-facing choice point where the user can decide which board to use next

## User choice rule

When the program reaches the point of execution design, explicitly ask the user whether to:

1. proceed with the stable board
2. proceed with the aggressive board
3. strengthen one or both boards first
4. stop for review
