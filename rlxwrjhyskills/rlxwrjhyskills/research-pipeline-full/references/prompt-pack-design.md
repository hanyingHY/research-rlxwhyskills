# Prompt Pack Design

## Objective

Create per-window prompts that are strict enough to prevent drift, duplication, and low-quality collection while still leaving each worker enough freedom to reason.

## Every prompt should specify

1. role name
2. owned folder
3. primary direction or responsibility
4. required protocol files to read first
5. discovery-round requirement
6. deep-search escalation rule
7. required local outputs
8. disposition and conflict rules
9. explicit ban on editing other workers' files
10. explicit phase-escalation rule that requires coordinator or user approval before advancing to the next major phase
11. explicit direction on where to record the next user-facing checkpoint
12. explicit direction on where to read the current coordinator broadcast if one exists
13. a short suggested user-facing question when the prompt reaches a gate boundary
14. a copy-paste-ready prompt block with one-line purpose text when the user must make a choice

## Shared worker instruction core

Every worker prompt should contain these rules in plain language:

1. improve the target research objective or downstream decision program, not generic scholarship
2. keep only authoritative or clearly graded evidence
3. map every retained claim to signal or feature, rule or filter, target or label, model or method, routing or control logic, output or selection layer, validation design, or explicit rejection
4. write structured files continuously
5. quarantine weak or suspicious material instead of silently deleting it
6. do not silently advance the program across major phases; escalate readiness to the coordinator and wait for the user-facing checkpoint

## Prompt family structure

### W01

Coordinator prompt should emphasize:

1. search saturation tracking
2. direction promotion and stopping decisions
3. overlap and conflict routing
4. final report outline maintenance

### W02

Master-table prompt should emphasize:

1. deduplication discipline
2. scoreboard accuracy
3. experiment-matrix consistency

### W03-W07

Research-lane prompts should emphasize:

1. strong retained evidence only
2. concrete experiment mapping
3. go or no-go judgments after discovery

### W08

Intake prompt should emphasize:

1. routing new files once
2. metadata completeness
3. quarantine and review handling

### W09

Conflict prompt should emphasize:

1. claim-level contradiction logs
2. citation chasing toward stronger evidence
3. explicit downgrade decisions

### W10

Synthesis prompt should emphasize:

1. route prioritization
2. dependency ordering
3. validation-ready summary output
