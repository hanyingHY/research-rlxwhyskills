# User Decision Gates

## Objective

Make major phase transitions explicit and user-visible.

The skill must not silently move from one major stage to the next when that transition changes scope, cost, workspace structure, or execution posture.

## Default rule

After each major phase, stop and ask the user what to do next.

Do not assume that successful completion of one phase means the user wants the next phase started automatically.

## Required gates

### Gate A: after project traversal and existing-content audit

Before moving into broad outward search, ask whether the user wants:

1. consolidate the current understanding first
2. strengthen the audit with more verification
3. proceed into direction discovery
4. stop for review

### Gate B: after direction discovery and first direction map

Before moving into deep multi-direction search, ask whether the user wants:

1. freeze the direction map and review it
2. strengthen weak or ambiguous directions first
3. proceed into deep search for user-selected retained directions
4. stop for review

If the user proceeds, also surface:

1. which directions move forward now
2. which directions remain deferred
3. what deep-dive intensity each chosen direction should use
4. what budget intent each chosen direction should use

Record those choices explicitly in:

1. `DIRECTION_SELECTION.md`
2. `DEEP_DIVE_SELECTION.md`
3. `DIRECTION_DEPTH_PLAN.csv`

### Gate C: after deep search and conflict adjudication

Before moving into structure setup, worker launch, or execution planning, ask whether the user wants:

1. consolidate findings into a report first
2. strengthen or expand specific directions first
3. proceed into workspace scaffolding and prompt-pack generation
4. stop for review

### Gate D: after validation planning or execution design

Before moving into engineering, cloud execution, or experiment launch, ask whether the user wants:

1. consolidate the validation slate first
2. strengthen or revise the plan first
3. proceed with the stable board
4. proceed with the aggressive board
5. stop for review

## Visibility rule

The checkpoint must be visible in the main conversation or in the generated coordinator-facing protocol files.

Do not keep it implicit inside internal reasoning.

## Prompt delivery rule

At every major gate, proactively show the user a direct copy-paste prompt.

Do not wait for the user to ask for the wording.

Do not make the user open files just to find the prompt.

For each prompt, also include one short explanation of what choosing that prompt will do, so the user can judge whether to consolidate, strengthen, proceed, or stop.

When the next phase involves deep work, also show the user the direction-selection and depth-selection artifacts instead of assuming a uniform expansion budget across all directions.

## Generated-workspace contract

The generated workspace should expose the current checkpoint state in visible files.

Minimum files:

1. `00_protocol/USER_DECISION_GATES.md`
2. `00_protocol/CHECKPOINT_RESPONSE_LOG.md`
3. `06_reports/NEXT_USER_DECISION.md`
4. `00_protocol/PHASE_STATE.md`
5. `00_protocol/UNIFIED_BROADCAST_PROMPT.md`
6. `00_protocol/USER_CHECKPOINT_PROMPTS.md`
7. `06_reports/STABLE_ROUTE_BOARD.md`
8. `06_reports/AGGRESSIVE_ROUTE_BOARD.md`
9. `06_reports/DIRECTION_SELECTION.md`
10. `06_reports/DEEP_DIVE_SELECTION.md`
11. `06_reports/DIRECTION_DEPTH_PLAN.csv`

## Suggested user prompt contract

Every user-facing checkpoint artifact should include a direct suggested prompt or question block so the operator can copy or adapt it without inventing language from scratch.

Minimum elements:

1. current gate
2. what is ready
3. what is not ready
4. recommended default
5. allowed choices
6. one short suggested user-facing question
7. one short purpose line for each suggested prompt

## Checkpoint response log

Each entry should record:

1. gate id
2. current state summary
3. recommended next step
4. user decision
5. notes or constraints

If the user has not answered yet, leave the decision explicitly blank or marked pending rather than pretending approval already exists.

## Worker rule

Workers may continue producing evidence inside their owned scope, but they must not treat a phase gate as already approved unless the coordinator or user explicitly says so.

## Coordinator rule

The coordinator owns phase advancement.

If workers make the next phase possible, the coordinator should record:

1. what is ready
2. what is not ready
3. what the next user-facing decision should be

Then stop for the user's choice instead of silently launching the next phase.
