# Direction And Depth Selection

## Objective

Make the user explicitly choose which directions advance and how aggressively each chosen direction should be deepened before expensive search or validation work begins.

## Required user choices

Expose two explicit choice surfaces:

1. direction selection
2. deep-dive depth selection

## Direction selection

The user should be able to decide:

1. which directions move forward now
2. which directions stay deferred
3. which directions need strengthening before promotion

## Depth selection

For the directions that move forward, the user should be able to choose one of these depth profiles:

1. `light_validate`
2. `standard_deep`
3. `aggressive_frontier`

## Suggested meanings

### light_validate

Use when a direction looks interesting but still needs a low-cost confidence check before long deep cycles.

### standard_deep

Use when a direction is strong enough for normal deep evidence building.

### aggressive_frontier

Use when the user explicitly wants maximum expansion or novelty-seeking search despite higher cost.

## Rule

Do not allocate identical deep-search budgets to every retained direction by default.

The user should control both breadth and intensity.
