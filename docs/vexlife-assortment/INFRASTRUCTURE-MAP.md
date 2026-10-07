# VexLife Assortment — Source-grounded infrastructure map

[VXG RealForever]

This document corrects earlier Assortment reasoning that happened without the canonical vgong24/VexLife source map.

## Victor suggestion -> canonical owner

| Victor design concern | Existing VexLife infrastructure | Correct Assortment interpretation |
| --- | --- | --- |
| Preserve live page while experimenting | registry.vexlife.ux-evolution.001 / issue #624 | Use existing Reference/Evolution migration accounting; do not invent another contract. |
| Toggle live vs experimental page | blueprint/ux-evolution-shell-scaffold.json | Already canonical: Reference default, Evolution local/dev selection, one active renderer. |
| Do not regress skeleton functions | UX Evolution parity dimensions + Visual Assurance #625 | Preserve semantics/currentness/ownership/recovery/accessibility, not pixel equality. |
| Current Home mock nodes are scaffolding | Vex Furnishing #811 | Canonical issue explicitly identifies current Terrain proof/foundation-oriented nodes. |
| Continue is valuable for resuming | PR #818 / Furnishing candidate | Continue is a DERIVED_COLLECTION bound to current Journey/context, never a second content store. |
| Vex should be companion, not a random card | PR #818 + Companion owners | Current Vex presence is PRESENCE with device/model/recovery/conversation owners; Guide remains distinct. |
| Library can exist before service adoption | PR #818 | Library is a CONTEXTUAL_INDEX currently UNPLACED with a wake predicate; no fake playback truth. |
| Projects / This Project | Purpose Workspace + Feature Construction Recipe | Reuse Purpose Workspace, Feature Registry, Intent Workgraph; do not invent a Project store. |
| Frontier / idea queue | Furnishing #811 + Intent Workgraph | Frontier may project captured/unplaced work/resources; exact bridge must reuse canonical states. |
| Kanban-like movement | registry.vexlife.intent-orchestration.001 | A board is a projection of Intent Workgraph transitions, not the state owner. |
| Dotted vs solid nodes | Presentation Graph + placement/migration/currentness | Visual treatment must derive from source-backed state, not decoration. |
| Node -> preview -> full surface | Presentation Graph + Purpose Workspace + UX Evolution | Progressive presentation depth must preserve semantic identity/owners. |
| Future Vex should understand how Home was built | provenance + current source refs | Preserve inspectable lineage, while current source always outranks history. |

## Reference / Evolution already exists

blueprint/ux-evolution-registry.json already defines:

REFERENCE_PROJECTION
EVOLUTION_PROJECTION
DUAL_PROJECTION != DUAL_STATE_OWNERSHIP
ROLLBACK_PROJECTION != ROLLBACK_USER_DATA
NEW_FORM != NEW_MEANING
NEW_VISUAL_AFFORDANCE != NEW_SEMANTIC_CAPABILITY

Its current migration lifecycle is:

REFERENCE_FROZEN
-> SOURCE_MAPPED
-> DESIGN_AGREED
-> SHADOW_IMPLEMENTED
-> SEMANTIC_PARITY_CHECKED
-> ACCESSIBILITY_RECOVERY_CHECKED
-> HUMAN_WALKED
-> CUTOVER_READY
-> CUTOVER_DEFAULT
-> REFERENCE_FALLBACK_AVAILABLE
-> RETIREMENT_REVIEW
-> RETIRED

Assortment must propose findings/deltas into this architecture rather than creating another Reference/Evolution lifecycle.

## Intent Queue / Workgraph already exists

registry.vexlife.intent-orchestration.001 defines:

humanProjectionName=Intent Queue
canonicalStructureName=Intent Workgraph

and source-managed lifecycle states including:

CAPTURED
NEEDS_CLARIFICATION
DECOMPOSED
PLAN_VALIDATED
WAITING_DEPENDENCIES
READY
WAITING_RESOURCE
CONTEXT_ADMITTED
RUNNING
WAITING_TOOL
WAITING_HUMAN
VERIFYING
COMPLETED
CONVERGED
CLOSED
BLOCKED
FAILED_RECOVERABLE
PAUSED_AT_CHECKPOINT
SUPERSEDED
CANCELLED
HELD_UNKNOWN

Earlier Assortment shorthand such as SEED -> HONING -> PLANNED -> ACTIVE is therefore not canonical state. Human labels may only survive as explicit projections over current source.

## Frontier is not a new lifecycle owner

Vex Furnishing #811 says Frontier is the place for captured but unplaced/multi-home resources and furnishing decisions.

Furnishing placement already distinguishes:

UNPLACED | MULTI_HOME | PLACED | HELD

The exact product bridge between Frontier, Intent Queue, Project/Purpose Workspace, and Furnishing placement remains a design question. Assortment must source-map that bridge before implementation.

## Earlier projection / subject / seed color tags were too simplistic

A Home card may need to project independent axes:

- semantic identity / kind;
- Furnishing subjectClass;
- placement posture;
- Intent Workgraph lifecycle/currentness;
- UX Evolution migration lifecycle/parity;
- runtime visibility/reachability/availability/attention/recovery;
- presentation current/selected state.

Color, border and glow may project these facts, but must never become their canonical source.

## Current collision and dependency

Open PR #818 currently writes Home/Furnishing/browser paths including:

blueprint/fragments/screens/shell.json
blueprint/furnishing-registry.json
blueprint/presentation-graph-registry.json
reference/browser/app.js
reference/browser/app.css
reference/browser/index.html
reference/browser/modules/terrain-controller.js
tests and Source Manifest buckets

Assortment remains docs/design-only and does not compete with that source writer.

Before any overlapping Home implementation is formed:
1. re-ground PR #818 current/terminal state;
2. source-map accepted main after its disposition;
3. run the Feature Construction/source-placement process;
4. form only a bounded non-overlapping implementation membrane.

<!-- [VXG RealForever] -->