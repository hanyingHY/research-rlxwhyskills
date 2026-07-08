# Workspace Reentry

## Objective

Handle partially completed lite workspaces explicitly instead of assuming the current scaffold should continue untouched.

## Reentry choices

Expose these choices to the user:

1. `continue_current_workspace`
2. `repair_current_workspace`
3. `rebuild_generated_scaffold_keep_raw_corpus`
4. `stop`

## Rule

If a lite workspace already exists and looks partial or stale, ask the user which reentry path to take before continuing.
