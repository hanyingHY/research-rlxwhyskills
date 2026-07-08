# Full Workflow

## Objective

Run research as a controlled system that produces auditable decisions, explicit evidence governance, and executable or validation-ready plans.

## Stages

### 1. Stabilize

1. inventory existing files
2. identify stale and active outputs
3. define the current decision objective
4. identify what is intake, what is judgment, and what is already synthesis
5. if the workspace already exists and is only partly complete, ask whether to continue, repair, rebuild generated scaffold artifacts while keeping the raw corpus, or stop
6. if the project is just a loose pile of text or literature, bootstrap a reusable intake and evidence structure before deeper audit begins

### 2. Intake and triage

1. register every source once
2. assign one primary topic or direction
3. mark duplicates, support material, and weak sources
4. decide whether material is retain, reject, quarantine, or needs manual review

### 3. Discovery rounds

When the user wants broad frontier expansion, begin with bounded discovery rather than unconstrained deep search.

Default rule:

1. each active direction or worker runs a `10`-round discovery pass
2. score the direction before allowing long deep-dive cycles
3. only strong directions continue
4. stop for a user decision gate before moving from discovery into deep search

### 4. Evidence judgment

1. extract claims precisely
2. record sample, method, and scope
3. grade strength and transferability
4. record why weak evidence was downgraded

### 5. Conflict handling

1. detect contradiction at the claim level
2. compare domain, evaluation scope, dataset, and method
3. write an explicit adjudication result
4. state what remains unresolved

### 6. Deep retrieval cycles

For directions that qualify after discovery:

1. run deep retrieval in bounded cycles, not infinite searching
2. stop when new rounds no longer change retained evidence or direction ranking
3. escalate only when the marginal evidence is still useful
4. stop for a user decision gate before moving from deep search into structure setup or execution planning

### 6A. Focused strengthening

When the user chooses strengthen mode:

1. ask what should be strengthened first
2. allow the target to be a direction, dataset, paper, or claim bundle
3. record the strengthening target explicitly before broadening the search surface
4. keep the strengthening pass aligned to those explicit targets

### 7. Synthesis

1. rank directions
2. decide what advances now
3. name what remains unproven
4. separate immediate, dependent, and deferred routes
5. split the retained route board into stable and aggressive option sets after the full search surface is understood

### 8. Validation planning

1. convert retained claims into validation schemes or explicit validation placeholders
2. separate immediate, dependent, and deferred jobs
3. define metrics, benchmarks, and promotion rules
4. stop for a user decision gate before moving from validation planning into engineering or experiment launch

### 8A. Experimental autonomy pilot

Only if the user explicitly opts in:

1. record visible user consent and scope boundaries
2. record mandatory manual stop conditions before autonomy starts
3. keep evidence grading, conflict adjudication, and validation logic fully intact
4. stop again when a new scope jump, destructive action, or board-choice decision appears

### 9. Benchmark freeze

Freeze the current best low-cost baseline before heavy execution starts.

### 10. Post-run comparison

Compare execution outputs against:

1. frozen benchmark
2. original retained claims
3. stability requirements
