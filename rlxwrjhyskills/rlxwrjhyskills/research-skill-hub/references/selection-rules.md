# Selection Rules

## Objective

Help the user choose the correct local research skill without assuming they already know the skill family.

## Recommended choice logic

1. choose `research-skill-hub` when the user first needs to discover what skills exist
2. choose `research-pipeline-lite` when the project needs fast triage and decision support
3. choose `research-pipeline-full` when the project needs auditability, contradiction handling, or multi-window execution scaffolds

## Role classes

Treat local skills as one of these:

1. `entry`
2. `pipeline`

Use `entry` for discovery or routing skills such as `research-skill-hub`.

Use `pipeline` for skills that should directly own the research work after selection.

## Recommendation contract

When advising the user, classify local skills into:

1. recommended
2. alternative
3. not_recommended_now

For each classification, give one short reason that names the operational tradeoff.

## Rule

If two skills overlap, explain the operational boundary in one or two sentences rather than repeating the metadata mechanically.

When the target AI environment is unknown or mixed, prefer an agent-neutral handoff prompt that points directly at the selected skill's `SKILL.md` path.
