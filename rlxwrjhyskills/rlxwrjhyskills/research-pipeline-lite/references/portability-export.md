# Portability And Export

## Objective

Keep the lite skill portable enough that an operator can export and reuse it in another project or another machine context.

## Required exported contents

1. `SKILL.md`
2. `agents/openai.yaml`
3. `references/`
4. `scripts/`

## Exclusions

Do not export transient caches such as:

1. `__pycache__`
2. `*.pyc`

## Rule

The export should be directly reusable, not a loose copy that still depends on the old project tree.
