# Lite Phase State

## Objective

Keep the lightweight workflow explicit enough that the operator can see the current lite phase without inferring it from memory.

## Required fields

1. current_phase
2. state_status
3. recommended_default
4. allowed_next_actions

## Default values

1. `current_phase: lite_summary_ready`
2. `state_status: pending_user_decision`

## Allowed next actions

1. `consolidate`
2. `strengthen`
3. `choose_stable_mode`
4. `choose_aggressive_mode`
5. `move_into_full_pipeline`
6. `stop`
