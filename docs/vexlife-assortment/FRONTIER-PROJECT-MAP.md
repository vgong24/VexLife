# VexLife Assortment — Frontier to Project experiment

[VXG RealForever]

Status: DESIGN QUESTION / source-grounded replacement for the earlier invented lifecycle

## User need

Victor wants to live the common path:

I have an idea
-> preserve it
-> understand / clarify it
-> organize it
-> see when it becomes bounded real work
-> enter a Project/workspace
-> retain origin and history

A kanban-like view may be useful, but KANBAN_VIEW != CANONICAL_STATE.

## Existing canonical state owners

### Intent Queue / Intent Workgraph

registry.vexlife.intent-orchestration.001 owns intent/work lifecycle.

Formation begins at CAPTURED and source-managed transitions include clarification, decomposition, plan validation, dependency waits, readiness, context admission, running, tool/human waits, verification, completion/convergence/closure, recoverable failure, checkpoint pause, supersession, cancellation and held-unknown.

### Furnishing placement

registry.vexlife.furnishing.001 owns placement composition, not work semantics.

Placement posture is independently:
UNPLACED | MULTI_HOME | PLACED | HELD

### Project / workspace

Purpose Workspace and Feature Construction own reusable project/feature construction seams.

## Frontier hypothesis

Do not mint FeatureSeed, BranchRecord, or a new HONING/PLANNED state machine merely because earlier design notes used those candidate terms.

Instead, test whether Frontier can become a human-facing projection over current sources:
- captured / clarification-needed / decomposed intents;
- unplaced / multi-home resources or furnishing decisions;
- why-current / next-review / next-safe-action projections.

The exact bridge is not yet canonical and must be source-mapped before implementation.

## Live practicum

Use Victor's real Home-blueprinting intent as the example.

Conceptual source-grounded journey:

Intent Workgraph: CAPTURED
-> NEEDS_CLARIFICATION or DECOMPOSED as appropriate
-> PLAN_VALIDATED
-> dependency / resource evaluation
-> READY when bounded work is admitted
-> Purpose Workspace / Project experience becomes useful
-> Furnishing placement may still remain UNPLACED
-> Evolution may simulate a Home doorway
-> human/parity review
-> accepted implementation may later earn cutover

This preserves two independent questions:

1. Is the work current/ready? — Intent Workgraph.
2. Where/how should it appear in Home? — Furnishing + Presentation Graph + UX Evolution.

A Project/workspace can therefore exist while its Home placement remains UNPLACED.

## UI experiment

A future Frontier board may group cards with human terms such as New, Needs clarification, Shaping, Ready, Waiting, Parked, Done/Superseded, but every bucket must be a declared projection of current canonical states.

Dragging a card must request a valid source transition; visual movement cannot become hidden state authority.

## Provenance

Promotion must retain origin refs and source lineage. Becoming Project work should link durable work/workspace identity without deleting the originating intent history.

<!-- [VXG RealForever] -->