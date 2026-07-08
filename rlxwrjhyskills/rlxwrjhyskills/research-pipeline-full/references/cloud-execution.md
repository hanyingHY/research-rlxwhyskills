# Cloud Execution

## Goal

Use cloud machines or multiple accelerators to validate more ideas without losing control of dependencies or comparison logic.

The same dependency discipline also applies when using many search windows or research workers.

## Planning sequence

1. freeze the baseline benchmark
2. group validation schemes by dependency layer
3. assign independent jobs to separate machines or GPUs
4. keep output contracts identical across routes
5. centralize comparison and winner selection

## Recommended layers

### Layer A

Environment bootstrap, preflight, and dataset or panel build.

For research-only or source-accumulation programs, the analogous layer is:

1. coordinator setup
2. master-table setup
3. intake and triage stabilization

### Layer B

Independent baseline model routes.

### Layer C

Policy, gating, selection, and output-layer jobs that depend on a chosen upstream choice.

### Layer D

Heavy challengers and broad ablations.

## Per-job fields

1. job_id
2. route or scheme name
3. dependency status
4. machine or GPU assignment
5. entry command
6. required inputs
7. expected artifacts
8. comparison target

## Failure rule

Do not merge results into the winner board when:

1. output contract is incomplete
2. benchmark comparison is missing
3. environment fingerprint is inconsistent

For research-only or source-accumulation programs, also do not merge results when:

4. evidence grading is missing
5. disposition state is missing
6. contradiction handling is absent
