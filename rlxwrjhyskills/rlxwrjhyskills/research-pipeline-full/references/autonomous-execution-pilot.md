# Autonomous Execution Pilot

## Status

Experimental pilot only.

Do not treat this mode as the default research-program behavior.

## Objective

Allow a user to opt into a more hands-off mode only when they explicitly prefer reduced checkpoint frequency.

## Default rule

The default skill behavior remains user-checkpoint-first.

This pilot may be used only when the user explicitly authorizes more autonomous execution.

## Required warnings

Before enabling this pilot, clearly warn the user that:

1. the agent may advance across multiple stages without waiting at every gate
2. execution cost, scope drift, and cleanup risk increase
3. the pilot is not the default or safest mode

## Minimum consent requirements

Do not enable autonomous execution unless all are true:

1. the user explicitly says they want hands-off or autonomous progression
2. the workspace records that consent in a visible file
3. the current phase and stop conditions are recorded before autonomy starts
4. the approved scope boundary is recorded before autonomy starts
5. the next mandatory manual review point is recorded before autonomy starts

## Guardrails

Even in autonomous mode:

1. do not skip evidence grading
2. do not skip conflict adjudication
3. do not skip benchmark or validation logic
4. do not take destructive cleanup action without explicit user approval
5. stop and ask again if a new major scope jump appears
6. stop and ask again before stable-versus-aggressive execution selection if the user has not already chosen one explicitly

## Generated-workspace contract

If autonomous mode is enabled, the workspace should expose:

1. `00_protocol/EXPERIMENTAL_AUTONOMY_CONSENT.md`
2. `00_protocol/AUTONOMY_STATUS.md`

The consent artifact should visibly record:

1. warning acknowledgement
2. explicit user consent
3. approved scope boundaries
4. required manual stops
5. hard stop conditions

The status artifact should visibly record:

1. autonomy mode
2. whether warnings were acknowledged
3. whether explicit consent was granted
4. approved scope boundaries
5. required manual stops
6. stop conditions
7. current operating authority
8. last manual gate
9. next mandatory review

## Suggested autonomy states

1. `disabled`
2. `enabled_with_user_consent`
3. `paused_for_user_review`
4. `stopped`
