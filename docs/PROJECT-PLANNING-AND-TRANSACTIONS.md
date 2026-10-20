# Project Planning and Validated Transactions

`[VXG RealForever]`

## Purpose

P0B-B03 adds the smallest durable planning and transaction layer needed to make the read-only Project Continuity foundation usable without turning the Board into another Workgraph.

The human need is:

```text
I can see the project
-> I need to plan an iteration
-> I need to place work into it
-> I may share a manual order or WIP policy
-> I need to request a real work transition
-> two writers must not silently overwrite each other
-> a process crash must have an explicit safe recovery route
```

B03 deliberately separates two kinds of truth:

```text
PROJECT PLANNING TRUTH
  iteration definitions and closure
  iteration membership
  shared manual ordering
  WIP policy
  selected Project view

WORKGRAPH TRUTH
  work lifecycle state
  transition legality and sequence
  receipts
  accepted assignments
  dependency state
```

Permanent:

```text
PROJECT_PLANNING != WORKGRAPH
ITERATION_MEMBERSHIP != WORK_STATE
SHARED_ORDER != LIFECYCLE_ORDER
WIP_POLICY != EXECUTION_AUTHORITY
TRANSITION_REQUEST != TRANSITION_ACCEPTED
EXPECTED_CURRENT_POINTER != ATOMIC_CURRENTNESS
BOARD_DRAG != DIRECT_MUTATION
PLANNING_EVENT != PROVIDER_EVENT
```

## Canonical owners

```text
registry.vexlife.project-continuity.001
  exact current Project / Board / Graph / Focus projection

registry.vexlife.project-planning.001
  planning event vocabulary and planning transaction contract

owner.vexlife.project-planning
  Vex Home planning event/snapshot/current-pointer persistence

registry.vexlife.intent-orchestration.001
  Workgraph lifecycle vocabulary and transition legality

owner.vexlife.intent-workgraph
  immutable Workgraph snapshots, CURRENT pointer and serialized Workgraph writer

B04
  later Git / PR / proof / provider reconciliation

B05
  later Purpose Workspace interaction projection
```

B03 does not copy Workgraph transition rules. A work-transition transaction is only a request until the canonical Workgraph owner admits it under its own writer lease.

## Planning event ledger

Every planning mutation is one append-only `vexlife.project-planning-event/v1` event.

The initial bounded vocabulary is:

```text
ITERATION_DEFINED
ITERATION_CLOSED
ITERATION_MEMBERSHIP_SET
SHARED_ORDER_SET
WIP_POLICY_SET
VIEW_SELECTED
```

Each event carries:

```text
eventRef
transactionRef
projectRef
sequence
priorEventRefOrNull
priorEventFingerprintOrNull
eventClass
typed payload
actorRef
sourceRefs
formedAt
semanticFingerprint
```

Sequence and prior-event binding are causal. Wall-clock recency does not replace ledger identity.

```text
NEWER_TIMESTAMP != STRONGER_PLANNING_TRUTH
EVENT_SEQUENCE + PRIOR_FINGERPRINT = PLANNING_CAUSAL_ORDER
```

## Iteration semantics

An iteration is defined with:

```text
iterationRef
label
startsAt
endsAt
closedAtOrNull
finalWorkNodeRefs[]
```

`startsAt` and `endsAt` describe the planning interval. Time passing does not close the iteration.

```text
ENDS_AT_REACHED != ITERATION_CLOSED
```

Closure is an explicit `ITERATION_CLOSED` event. At closure, the current membership of that iteration is frozen into `finalWorkNodeRefs[]`.

After closure:

- new work cannot be added to that closed iteration;
- final membership is not rewritten;
- unfinished work may be explicitly placed into another iteration by a later membership event;
- moving to another iteration does not erase the closed iteration's final membership.

This preserves:

```text
SPRINT_END != WORK_COMPLETION
CARRY_FORWARD != HISTORY_REWRITE
```

## Membership, shared ordering, and WIP

Iteration membership is planning truth only.

```text
WORK_IN_ITERATION_X != WORK_RUNNING
WORK_NOT_IN_ITERATION != CANCELLED
```

Shared order is one explicit manual order for a named scope. It does not change lifecycle order or dependency truth.

WIP policy stores a positive limit for one registered Project Board lane. It is policy/projection truth, not direct execution authority. B03 does not silently mutate Workgraph state merely because a lane exceeds a WIP policy.

```text
WIP_POLICY != WORKGRAPH_GATE_BY_IMPLICATION
```

B05 may later render violations and use a drag/move request to form a typed transaction, while Workgraph admission remains separately authoritative.

## Project Planning runtime persistence

Planning truth persists under the selected Vex Home:

```text
<VexHome>/runtime/project-planning/<project-address>/
  events/
    <sequence>-<event-fingerprint>.json
  snapshots/
    <snapshot-fingerprint>.json
  current.json
  writer.lock
```

The runtime owner provides:

- immutable event files;
- content-addressed snapshots;
- one atomic CURRENT pointer;
- exclusive writer lease;
- exact expected-pointer compare under the writer lease;
- token-checked writer release;
- explicit abandoned-writer recovery.

A planning transaction binds both:

```text
expectedPlanningPointerSha256OrNull
expectedPlanningSnapshotFingerprintOrNull
```

The pointer comparison happens after writer acquisition. A stale request therefore fails before another writer's current planning truth can be overwritten.

```text
CHECK_THEN_WRITE_WITHOUT_LOCK != OPTIMISTIC_TRANSACTION
```

## Writer recovery

A process crash may leave a writer lease. Recovery is not "delete the lock and hope."

The recovery call requires the exact observed lease SHA-256 and succeeds only when the recorded PID is proven absent. Active or unverifiable writers remain protected. Recovery is a real Vex Home mutation because it deletes the exact abandoned writer lease; its returned effect receipt therefore records `homeMutationPerformed=true` and `writerLeaseDeletionPerformed=true`. `RECOVERY_NOT_REQUIRED` records both as false.

```text
ABANDONED_WRITER -> EXACT_LEASE_RECOVERY
ACTIVE_WRITER -> CONFLICT
UNVERIFIABLE_WRITER -> CONFLICT
STALE_RECOVERY_DIGEST -> REJECT
```

The same bounded recovery rule is added to the existing Workgraph runtime owner because B03 now relies on its serialized transition writer.

## Workgraph lifecycle transaction

A Project work-transition request is `vexlife.project-work-transition-request/v1`.

It binds:

```text
projectRef
exact Project Continuity snapshot fingerprint
graphRef
workNodeRef
exact Workgraph CURRENT pointer SHA-256
exact Workgraph semantic fingerprint
expected work state
requested next state
transitionRef
actor / actor role / process
source refs
requestedAt
instanceRef
```

Validation proves:

1. the Project snapshot is still the exact one the caller observed;
2. the work node belongs to that Project snapshot;
3. the Project graph binding matches the expected Workgraph pointer and fingerprint;
4. the supplied Workgraph entry is that exact current graph;
5. the node's current state equals the expected state;
6. the canonical Intent registry permits the state transition.

Validation still grants no effect authority:

```text
state=VALID
effects=false
executionAuthority=NONE
```

Execution then descends to `owner.vexlife.intent-workgraph`:

```text
acquire exact graph writer lease
-> re-read CURRENT pointer under lease
-> compare expected pointer
-> recordIntentTransition()
-> write immutable next Workgraph snapshot
-> atomically advance CURRENT pointer
-> release exact writer lease
```

The Project Planning module never writes node state itself.

## Why the Workgraph writer changed

Before B03, Workgraph snapshot persistence atomically wrote a pointer but did not serialize concurrent writers around the whole read/compare/mutate/write transaction.

B03 adds one per-graph exclusive writer lease and the exact transaction function:

```text
recordIntentWorkgraphRuntimeTransition(...)
```

The existing `recordIntentTransition()` remains the semantic lifecycle owner. The runtime owner adds only concurrency/currentness safety.

Ordinary existing `persistIntentWorkgraphRuntimeSnapshot()` also uses the same writer lease so a generic snapshot persist cannot race a B03 transition.

## CLI

The bounded source-managed command is:

```bash
npm run project:planning -- \
  --home <vex-home> \
  --project <project-definition.json> \
  --transaction <transaction.json> \
  [--view <project-view.json> ...]
```

The command first recompiles one exact CURRENT Project Continuity snapshot from Vex Home.

For a Project Planning transaction it delegates to `owner.vexlife.project-planning`.

For a Work Transition Request it validates exact Project/Workgraph bindings and then delegates to `owner.vexlife.intent-workgraph`.

The result reports effects separately:

```text
planningMutationPerformed
workgraphMutationPerformed
providerMutationPerformed=false
```

## What B03 does not own

B03 does not implement:

```text
Git / PR / check observation
Build Health proof currentness
GitHub issue / Project mirror
provider reconciliation
Purpose Workspace Board rendering
drag/drop UI
keyboard/screen-reader Board interaction
ToCompletion live project import
Heretic model/runtime/Home setup
Memory / Score / Dream / Rhythm
training or weight changes
```

Those remain:

```text
B04 -> source/proof/GitHub reconciliation
B05 -> Purpose Workspace Board/Graph interaction
B06 -> ToCompletion import + dogfood
P1+ -> fresh Heretic realization and lived product
```

## Acceptance burden

B03 focused proof must cover at least:

```text
all planning event classes
iteration close freezes membership
closed iteration rejects new membership
planning event ordering and fingerprinting
planning CURRENT persistence
stale planning pointer rejection
unknown work/lane/view/order rejection
exact Project snapshot binding
exact Workgraph pointer binding
canonical Workgraph transition
stale Workgraph pointer rejection
abandoned writer exact-digest recovery
active writer recovery rejection
no provider mutation
```

Repository-wide syntax, Blueprint, Source Manifest, DCO, exact diff and fresh independent lifecycle proof remain separate.

<!-- [VXG RealForever][VEXLIFE][TOCOMPLETION][P0B][PROJECT-PLANNING][B03] -->
