# Broadcast Template

## Objective

Provide one coordinator-owned broadcast prompt that can be sent to all windows when the user wants a unified refresh, final audit, or last-pass optimization message.

## Required broadcast elements

1. current authoritative phase state
2. live gate id
3. what is authoritative now
4. what files each worker must treat as primary
5. what each worker must not do
6. whether the goal is consolidate, strengthen, choose stable mode, choose aggressive mode, proceed, or stop
7. one explicit user-facing question when the broadcast is meant to stop at a gate
8. one copy-paste-ready broadcast block that can be sent to all windows directly

## Default broadcast template

Use this shape:

```text
Read your owned prompt and local task interface first.

Current phase: <phase_state>
Current gate: <gate_id>
Current mode: <consolidate|strengthen|choose_stable_mode|choose_aggressive_mode|proceed|stop>

Authoritative files:
1. <file_a>
2. <file_b>

Required action:
1. update only your owned outputs
2. record evidence and conflicts explicitly
3. do not silently advance the next phase
4. if your work changes phase readiness, update the coordinator-facing checkpoint files

Do not touch:
1. other worker folders
2. shared files you do not own
```

## When to use it

Use the unified broadcast template when:

1. many windows need the same final instruction
2. the user says it is hard to distinguish windows manually
3. the coordinator wants one last synchronized pass
4. a phase gate has just changed and every worker must see the same state
