# Evidence Grading

## Grade dimensions

Score or label each retained source on:

1. directness to the target task
2. evidence strength
3. implementation feasibility
4. transferability
5. downside risk if wrong

## Practical ladder

Highest confidence:

1. direct evidence for the same domain or operating context, same task, similar evaluation scope
2. direct evidence for the same task in adjacent settings
3. strong transfer evidence from nearby domains
4. broad survey or architecture inspiration

## Downgrade triggers

1. unclear data provenance
2. no sample period
3. no task alignment
4. generic enthusiasm without measurable outcome
5. method too costly relative to likely payoff

## Disposition statuses

Every reviewed source should end in one of these states:

1. `retain_core`
2. `retain_support`
3. `reject_off_target`
4. `reject_weak_evidence`
5. `reject_duplicate`
6. `quarantine_suspicious`
7. `needs_manual_review`

Use these states instead of vague labels such as `maybe` or `interesting`.

## Authority preference rule

Prefer in this order whenever possible:

1. direct same-domain, same-task, similar-scope evidence
2. strong direct adjacent-setting evidence
3. strong transfer evidence from nearby domains
4. broad survey or architectural background

Do not let source count outrank directness.

## Conflict record fields

1. claim_a
2. claim_b
3. conflict_type
4. likely cause of conflict
5. adjudication result
6. remaining uncertainty
