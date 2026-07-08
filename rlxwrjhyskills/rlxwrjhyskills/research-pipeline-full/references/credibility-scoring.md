# Credibility Scoring

## Objective

Turn source-trust and evidence-trust judgments into an explicit scoring surface instead of leaving them implicit in prose.

## Score dimensions

Score each important source or claim bundle on these dimensions:

1. source authority
2. task directness
3. empirical strength
4. transfer risk
5. reproducibility readiness
6. contradiction burden
7. validation readiness

## Suggested score range

Use `0-5` per dimension.

Interpretation:

1. `0-1`: weak or unreliable
2. `2`: fragile or caveated
3. `3`: usable with explicit caveats
4. `4`: strong
5. `5`: exceptionally strong for the target problem

## Practical interpretation

### source authority

Prefer the authority ladder:

1. flagship peer-reviewed or official standard sources
2. strong peer-reviewed or respected institution reports
3. direct same-domain studies with clear design
4. credible preprints or benchmark-owner materials with caveats
5. discovery-only routing sources should score low here

### task directness

Higher when the evidence matches:

1. same domain
2. same task
3. similar operating context
4. similar evaluation scope

### empirical strength

Higher when the source provides:

1. measurable outcomes
2. clear sample or evaluation period
3. explicit comparisons or ablations
4. stable methodology

### transfer risk

Higher score means lower transfer risk.

Lower the score when the method requires a large leap across domains, tasks, or infrastructure.

### reproducibility readiness

Higher when the source provides enough detail to recreate the logic, data assumptions, or evaluation path.

### contradiction burden

Higher score means fewer unresolved contradictions.

Lower the score when competing sources materially disagree and adjudication is weak.

### validation readiness

Higher when the claim maps cleanly into a benchmark, insertion test, ablation, or route comparison.

## Derived output fields

For each scored item, compute or record:

1. `credibility_score_35`
2. `credibility_band`
3. `credibility_blockers`
4. `credibility_strengths`

## Optional metadata fields

When available, keep these alongside the score so workspace-level tools can aggregate credibility by direction or route:

1. `direction`
2. `route_board`
3. `claim_scope`
4. `source_id`
5. `claim_id`

These fields are optional, but using them makes route-level credibility summaries much stronger.

## Suggested credibility bands

1. `weak` for totals below `12`
2. `caveated` for totals `12-19`
3. `actionable` for totals `20-27`
4. `high_confidence` for totals `28-35`

## Rule

Do not let a high authority source automatically receive a high total if directness, empirical strength, or validation readiness are poor.

Credibility is multi-factor, not prestige-only.
