# Lite Broadcast Template

## Objective

Provide one minimal broadcast or handoff prompt for the lite workflow.

## Required elements

1. current phase
2. current mode
3. authoritative files
4. required action
5. explicit warning not to silently broaden scope

## Default template

```text
Current phase: lite_summary_ready
Current mode: wait_for_user_decision

Authoritative files:
1. summary_memo.md
2. NEXT_USER_DECISION.md
3. PHASE_STATE.md

Required action:
1. review the lite result
2. choose consolidate, strengthen, stable, aggressive, full pipeline, or stop

Do not silently broaden scope:
1. do not move into the full pipeline without an explicit user choice
```
