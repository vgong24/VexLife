# Project Continuity and Board Projection

`[VXG RealForever]`

## Purpose

P0B-B01+B02 establish the smallest source-native project relation and read-only project projection needed to keep long-running VexLife work understandable across fresh human/AI instances without creating another Jira-like truth store.

The human problem is:

```text
one durable outcome
+ several dependent work slices
+ source/proof/currentness changing over time
+ multiple conversations and providers
-> a fresh instance must still know what exists, what is current, what is blocked, and why
```

Current VexLife already owns the underlying truths separately:

```text
Feature Registry
  what a feature is

Intent Workgraph
  work lifecycle, containment, dependencies, assignments, transitions and receipts

Build Health / Orientation / Source Manifest
  proof and source currentness

Purpose Workspace
  human DO / UNDERSTAND / STEWARD projection
```

B01+B02 therefore add only:

```text
ProjectDefinition
  which root Intents belong to one human project outcome
  + optional Feature relationships

ProjectViewDefinition
  how current project truth may be viewed

ProjectContinuitySnapshot
  deterministic read-only join over exact current Workgraphs

Board / Graph / Lane Focus Card
  bounded projections for human/AI orientation
```

They do not own work-state mutation.

## Human question map

```text
WHAT PROJECT AM I IN?
  ProjectDefinition

WHAT OUTCOME(S) DOES IT OWE?
  rootIntentRefs[]

WHAT WORK EXISTS?
  canonical Intent Workgraph nodes

WHAT DEPENDS ON WHAT?
  Workgraph dependencyRequirements / dependencyRefs

WHO ACCEPTED THE WORK?
  Workgraph acceptedAssignments

WHAT FEATURE MEANING DOES THE WORK TOUCH?
  project workFeatureBindings -> canonical Feature refs

WHAT IS TRUE NOW?
  current Workgraph lifecycle + transition/receipt lineage

HOW SHOULD I LOOK AT IT?
  Board / Graph / later Table / Roadmap view definitions

WHAT SHOULD A FRESH EXECUTOR READ?
  Lane Focus Card over one exact work node and its causal neighborhood
```

## Ownership

```text
Intent Workgraph
  canonical work lifecycle owner

Intent Workgraph runtime snapshot
  immutable Workgraph snapshots + atomic CURRENT pointer owner

Project Continuity
  read-only project relation/compiler/projection owner

Project Planning Ledger (B03)
  future iteration membership, shared ordering and WIP policy owner

Repository/proof/GitHub reconciler (B04)
  future provider/source/proof observation -> canonical evidence transition join

Purpose Workspace (B05)
  future rendered Board/Graph interaction consumer
```

Permanent:

```text
PROJECT != FEATURE
FEATURE != EPIC
WORK_NODE != GITHUB_ISSUE
GITHUB_ISSUE != CANONICAL_WORK_STATE
BOARD_COLUMN != WORKGRAPH_LIFECYCLE
PROJECT_VIEW != EFFECT_AUTHORITY
SPRINT_MEMBERSHIP != WORK_STATE
PR_MERGED != WORK_CLOSED
NEWER_TIMESTAMP != STRONGER_TRUTH
```

## Canonical board lanes

The default Board maps every current Intent Workgraph lifecycle state to exactly one human lane. The lifecycle remains source-owned by `registry.vexlife.intent-orchestration.001`; these lanes are only presentation.

```text
Intake
  CAPTURED / NEEDS_CLARIFICATION / DECOMPOSED

Planned
  PLAN_VALIDATED / WAITING_DEPENDENCIES

Ready
  READY

Active
  CONTEXT_ADMITTED / RUNNING / WAITING_TOOL

Waiting
  WAITING_RESOURCE / PAUSED_AT_CHECKPOINT

Needs Human
  WAITING_HUMAN / HELD_UNKNOWN

Verify
  VERIFYING

Attention
  BLOCKED / FAILED_RECOVERABLE

Done
  COMPLETED / CONVERGED / CLOSED

Archive
  SUPERSEDED / CANCELLED
```

A later user-configurable Board may regroup these states, but it may not redefine the lifecycle or make a visual move authoritative by itself.

## Timestamp law

B01+B02 preserve the timestamps they actually consume:

```text
ProjectDefinition.formedAt
WorkNode.createdAt
last accepted Workgraph transition.createdAt
accepted assignment.acceptedAt
```

The projection does not use wall-clock recency to decide truth.

```text
NEWER_TIMESTAMP != STRONGER_TRUTH
LATEST_COMMENT != CURRENT_STATE
UPDATED_AT != ACCEPTED_TRANSITION
VALID_WORKGRAPH != RUNTIME_CURRENT_WORKGRAPH
CURRENT_POINTER_OBSERVED != CURRENT_FOREVER
```

Causal ordering remains Workgraph sequence + source fingerprints + current receipts.

## Read-only compiler

`compileProjectContinuity(...)` requires:

```text
one valid project definition
+ one or more canonical Intent Workgraphs each bound to the existing runtime CURRENT pointer
+ current Intent trust snapshot + canonical process/role registries
+ full existing validateIntentWorkgraph(...) PASS
+ exact projectRef match
+ exact rootIntentRefs coverage
+ globally unique workNodeRefs
+ Feature refs present in the current canonical Feature Registry
```

It does not invent a lighter project-local Workgraph validator or a second currentness store. Each graph must first satisfy the existing canonical Workgraph validator and must match the exact content-addressed CURRENT pointer owned by `owner.vexlife.intent-workgraph`; the project snapshot binds both the validation state/hash and the pointer identity.

The normal CLI reads that CURRENT-pointer surface directly from Vex Home. An arbitrary historical Workgraph JSON is not sufficient to earn `currentness=CURRENT`.

It returns one content-addressed snapshot containing cards and relationship edges:

```text
CONTAINS
DEPENDS_ON
RELATES_TO_FEATURE
```

Every output is explicitly:

```text
effects=false
executionAuthority=NONE
```

## Lane Focus Card

A Lane Focus Card gives a fresh worker one bounded causal neighborhood:

```text
selected work node
parent
children
dependencies
dependents
assignment
feature refs
current receipts
source refs
last transition
possible canonical next lifecycle states
```

`possibleLifecycleTransitions[]` is explanatory only.

```text
POSSIBLE_TRANSITION != TRANSITION_AUTHORITY
```

B03 must later own validated transition/planning transactions with optimistic currentness.

## CLI

Read-only project projections use source-managed Project/View definitions and the existing Vex Home Workgraph CURRENT-pointer surface:

```bash
npm run project:status -- \
  --project <project-definition.json> \
  --home <vex-home> \
  --format board \
  --view <board-view.json>

npm run project:status -- \
  --project <project-definition.json> \
  --home <vex-home> \
  --format graph

npm run project:status -- \
  --project <project-definition.json> \
  --home <vex-home> \
  --format focus \
  --work-node <work.node.ref>
```

The command reads Project/View source from repository-relative regular files, obtains Workgraphs only through the existing Vex Home runtime CURRENT-pointer owner, and prints JSON. It performs no mutation.

## Held successors

P0B-B03 is still required for:

```text
IterationDefinition / membership ledger
shared ordering
WIP policy
validated lifecycle transition requests
optimistic-currentness mutations
```

P0B-B04 remains required for:

```text
Git / PR / check / Build Health observation
provider relation records
deterministic reconciliation
stale proof -> work attention/reverification
post-merge proof -> earned completion
```

P0B-B05 remains required for:

```text
Purpose Workspace Board / Graph rendering
drag/drop request projection
keyboard/screen-reader semantic equivalents
stale drag rejection / snap-back
```

P0B-B06 remains required before P1:

```text
import actual VexLife ToCompletion project
persist current Workgraph
exercise Board/Graph/Focus projections
prove one real project-state walkthrough
```

B01+B02 do not begin Heretic model, runtime, Home, Memory, training, publication or GitHub Project mutations.

<!-- [VXG RealForever][VEXLIFE][TOCOMPLETION][P0B][PROJECT-CONTINUITY][B01-B02] -->