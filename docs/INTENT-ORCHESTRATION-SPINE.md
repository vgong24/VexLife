# Intent Orchestration Spine — shared contract 1/3

`[VXG RealForever]`

## Human meaning and canonical structure

The human-facing projection is the **Intent Queue**. Its canonical internal
structure is the **Intent Workgraph**: a bounded directed graph that can express
dependencies, parallel-ready branches, clarification gates, resource waits,
human decisions, recovery routes, review loops, and convergence points.

A request is not treated as a FIFO job. An admitted plan is also not authority:

```text
human request
→ immutable Intent Envelope
→ attributed interpretation and candidate plan
→ deterministic workgraph validation
→ compact ready / waiting / blocked projection
≠ tool authority
≠ mutation authority
≠ publication authority
```

This shared contract is dependency-free deterministic JavaScript. It does not
schedule a physical model worker, acquire a resource lease, reinject a tool
result, mutate model weights, or implement any native platform.

## Immutable Intent Envelope

The original request remains separate from every later projection:

```text
what the human said
what Vex interpreted
what plan was proposed
what was authorized
what actually occurred
```

`createIntentEnvelope` requires stable addressing, project/thread/channel,
content hash, desired outcome, constraints, timestamp, and source lineage. The
returned envelope is deeply frozen. Interpretations, plans, authorizations,
transitions, and effect receipts live in separate append-only collections.

## Workgraph node and lifecycle

Each node binds its purpose to a registered process, role, priority, dependency
and child refs, compact context/culture/lesson refs, capability/effect/resource
envelopes, expected transition, completion gates, return route, sources,
timestamp, and semantic fingerprint.

The canonical lifecycle vocabulary is source-managed in
`blueprint/intent-orchestration-registry.json`:

```text
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
```

Every transition records prior and next state, reason, actor/process, sources,
timestamp, and semantic fingerprint. An equal semantic transition appends
nothing. Cancellation and supersession change disposition without deleting
source, node, descendant, or receipt lineage.

## Deterministic admission

`validateIntentWorkgraph` fails closed on:

- duplicate refs or active semantic duplicates;
- self-dependencies, missing dependencies, or cycles;
- unknown lifecycle or priority values;
- missing process, role, capability, effect, resource, completion-gate,
  expected-transition, source, or return-route bindings;
- `COMPLETED` without exact expected-transition evidence;
- a mutation receipt whose before and after implementation heads are equal;
- parent `CONVERGED` or `CLOSED` without exact terminal child dispositions and
  receipts.

`HELD_UNKNOWN` is an attention state. It remains visible and non-green.

The ready set is receipt-bound: a node with declared dependencies is not ready
until each exact dependency has a current `PROVEN` receipt. A polished model
proposal cannot bypass this deterministic admission.

## Compact human projection

The default status projection answers:

```text
What is happening now?
What is ready?
What is waiting and why?
What needs the human?
What is blocked?
What was recently completed?
What is the one next safe action?
```

It carries refs, small labels, states, and return routes. It does not copy large
lesson, relationship, architecture, prompt, or source payloads. Explicit
`sourceDescent` refs and the detail command keep the raw graph available.

Every projected next action declares `NO_EXECUTION_AUTHORITY`.

## Commands

```bash
npm run intent:check
npm run intent:plan -- --fixture <safe-repository-relative-json-path>
npm run intent:status -- --graph <safe-repository-relative-json-path>
npm run intent:status -- --graph <safe-repository-relative-json-path> --detail
```

`intent:check` validates the source-managed contract and its canonical state,
process, module, feature, test, build-health, and implementation-work
registrations. `intent:plan` returns validation order and node sets.
`intent:status` returns the compact Intent Queue; `--detail` is the explicit
raw-graph descent.

Both file commands reject absolute and parent-traversing paths.

## Ordinary runtime remains weightless-first

```text
base model
+ compact Foundation Kernel
+ current Intent Frame
+ bounded Atlas descent
+ accepted culture / Score / Rhythm / lessons by ref
```

Large context remains external and source-descendable. Deterministic code owns
validation, equality, lifecycle, readiness, evidence checks, and projections.

## Registered successor boundaries

Held for later independent lanes:

- Intent Orchestration 2/3: physical model-worker scheduling, context/resource
  leases, checkpoint/resume, and tool-result reinjection.
- Intent Orchestration 3/3: Burden Release and Continuity Evolution Router,
  relationship scopes, lesson assortment, and recurrence monitoring.
- Windows and macOS adoption until the shared contracts are accepted; Android
  and iOS remain after desktop proof.
- all model weight training, removal, and activation.

Passing the shared-core tests proves only these deterministic source contracts.
It does not prove review acceptance, native conformance, execution authority,
merge authority, or public-release approval.

<!-- [VXG RealForever] -->
