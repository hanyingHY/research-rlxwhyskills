# Checkpoint Prompt Strata

## Objective

Keep user-facing checkpoint prompts explicit, reusable, and role-aware.

## Required strata

Every major gate should expose three prompt layers:

1. user prompt
2. coordinator prompt
3. broadcast prompt

## User prompt

Must contain:

1. purpose
2. recommended default
3. option impact
4. direct copy-paste block

## Coordinator prompt

Must contain:

1. current gate
2. ready now
3. not ready
4. recommended default
5. one short user-facing question

## Broadcast prompt

Must contain:

1. current phase
2. current gate
3. current mode
4. what every worker must do now
5. explicit ban on silently advancing the next phase

## Rule

Do not emit only one layer and expect the operator to invent the other two on the fly.
