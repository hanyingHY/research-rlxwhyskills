# Portability And Export

## Objective

Keep the skill portable enough that an operator can export, back up, and relocate it without manual cleanup.

## Export modes

Support these export forms:

1. copied folder bundle
2. zip archive bundle

## Export expectations

An exported bundle should keep:

1. `SKILL.md`
2. `agents/openai.yaml`
3. `references/`
4. `scripts/`

## Exclusions

Do not carry over transient clutter such as:

1. `__pycache__`
2. `*.pyc`
3. temporary test artifacts

## Rule

If portability matters, verify the exported bundle structurally before trusting the backup.
