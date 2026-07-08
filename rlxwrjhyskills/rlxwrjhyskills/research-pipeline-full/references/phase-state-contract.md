# Phase State Contract

## Objective

Make phase readiness machine-readable enough that different windows, later runs, and human operators do not invent their own status vocabulary.

## Required fields

Every phase-state artifact should expose these fields:

1. current_phase
2. current_gate
3. state_status
4. ready_now
5. not_ready
6. recommended_default
7. allowed_next_actions
8. blocking_conditions

## Recommended phase values

Use one of these phase values unless there is a strong local reason to extend them:

1. `audit_ready`
2. `direction_map_ready`
3. `deep_search_ready`
4. `scaffold_ready`
5. `validation_plan_ready`
6. `execution_ready`

## Recommended gate values

1. `A`
2. `B`
3. `C`
4. `D`

## Recommended status values

1. `pending_user_decision`
2. `ready_to_consolidate`
3. `ready_to_strengthen`
4. `ready_to_proceed`
5. `blocked_by_missing_evidence`
6. `blocked_by_missing_inputs`

## Allowed next actions

Use only these next-action labels unless a project has a strong reason to extend them:

1. `consolidate`
2. `strengthen`
3. `choose_stable_mode`
4. `choose_aggressive_mode`
5. `proceed`
6. `stop`

## Rule

If the current state is user-facing, do not leave the phase or gate implicit in prose only. Put the actual phase value and gate value in the artifact.
