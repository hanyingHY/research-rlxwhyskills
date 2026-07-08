# Workspace Reentry

## Objective

Handle partially completed workspaces explicitly instead of assuming the existing scaffold should continue untouched.

## Reentry choices

Expose these choices to the user:

1. `continue_current_workspace`
2. `repair_current_workspace`
3. `rebuild_generated_scaffold_keep_raw_corpus`
4. `stop`

## Rule

If the workspace already exists and is only partly complete, ask the user which reentry path to take before continuing.

Do not silently rebuild. Do not silently continue.

## Scope of rebuild

Rebuild applies to generated control, prompt, and scaffold artifacts.

It does not authorize deleting raw corpus files, retained evidence, or user-authored research materials.

## Required control surface

Record the reentry decision in `REENTRY_DECISION.md`.
