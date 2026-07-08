# Lite Workflow

## Objective

Turn an unstructured research pile into a decision-ready packet quickly.

## Sequence

1. Inventory the workspace.
2. If a lite workspace already exists and is only partly complete, ask whether to continue, repair, rebuild generated scaffold artifacts while keeping the raw corpus, or stop.
3. Identify the main decision question.
4. Build or refresh a source index.
5. Deduplicate by stable URL, DOI, title, and author-year.
6. Extract only the fields that change action.
7. Drop weak or off-scope sources early.
8. Map retained items to concrete actions.
9. End with a short memo.
10. Split the retained shortlist into stable and aggressive option views.
11. Stop and ask the user whether to consolidate, strengthen, move into the full pipeline, choose stable mode, choose aggressive mode, or stop.
12. If the user chooses strengthen, ask which directions, datasets, papers, or claim bundles should be reinforced first.
13. Update the lite `PHASE_STATE.md`, `NEXT_USER_DECISION.md`, and strengthening control files before handing the result forward.

## Suggested decision questions

1. What are the strongest retained claims?
2. Which claims are directly actionable?
3. Which claims require validation before use?
4. Which ideas should be explicitly rejected?

## Retention standard

Keep a source only if it changes at least one of these:

1. ranking of options
2. experiment design
3. risk assessment
4. implementation choice
5. validation standard

## Rejection standard

Reject or downgrade when one or more are true:

1. no clear author or institution
2. no sample or task definition
3. generic thought piece instead of evidence
4. no realistic transfer path to the target problem
5. cannot affect any next-step decision
