# Intent Orchestration 2/3 — single-worker scheduler

`[VXG RealForever]`

The human surface is the **Intent Queue runtime**. The canonical shared runtime
is one deterministic scheduler around the accepted Intent Workgraph:

```text
validated workgraph
→ exact admission receipt
→ one physical model-worker lease
→ one bounded context lease
→ checkpoint or exact mock tool observation
→ bounded Queue / Terrain / Health / Guide projections
```

Logical ready branches are records. They do not imply loaded model instances.
The shared contract sets model inference concurrency to one and holds background
model work at zero while an interactive turn waits.

## Source ownership

The canonical registry is
`blueprint/intent-scheduler-registry.json`. State has one owner per domain:

```text
state.intent-workgraph   service.intent-orchestration
state.intent-scheduler   service.intent-scheduler
state.context-lease      service.context-lease
state.resource           service.resource-governor
state.intent-checkpoint  service.intent-checkpoint
state.tool-result-relay  service.tool-result-relay
```

`src/core/state.mjs` combines those owners into one bounded runtime projection.
Terrain, Health and Guide are selectors over that projection. Equal semantic
output produces no new revision.

## Admission

`admitIntentSchedulerQueue` first runs the accepted workgraph validator. Only
`PLAN_VALIDATED` is schedulable. `ATTENTION`, `BLOCKED`, stale or malformed
graphs may expose logical candidates, but their admitted set is empty.

For the selected node, the admission receipt binds:

```text
graph ref + fingerprint
trust snapshot ref + source + source hash + fingerprint + formation
resource snapshot + exact resource lease
work node ref + node fingerprint
actor/role occupancy + writer claim
capability envelope + exact lease
effect envelope + exact lease
expected transition + completion gates + return route
scheduler generation + one worker ref
```

Planning and visible capability do not satisfy this receipt.

## Priority and fairness

The deterministic order is:

```text
INTERACTIVE
EXPEDITE (IMMEDIATE / HIGH)
RECOVERY
NORMAL
BACKGROUND
```

Interactive work always wins while waiting. Background work is not admitted
against an interactive wait. Outside that boundary, a node deferred for the
source-managed maximum generation count wins the non-interactive pool by oldest
ready generation and then stable work-node ref. Priority changes never delete
the workgraph or its source.

An interactive arrival can request preemption of background work. The active
lease remains live until `checkpoint` records a safe boundary and release
receipts. There is no asynchronous source-discarding interrupt.

## Context and resource leases

A context lease contains stable refs for the foundation kernel, role, intent,
Atlas/source selections, culture, lessons and release material. Whole graphs,
message histories, architecture documents, raw logs and artifact payloads are
rejected. Estimated input plus reserved output must fit the hard token limit.
The context semantic fingerprint excludes lease identity and time, allowing an
equal selection to reuse the current lease without another transition.

A resource snapshot uses explicit CPU concurrency/load, RAM, GPU/VRAM, model
residency, active model/tool state, interactive wait, background admission and
thermal/power state. A platform without thermal telemetry uses `NOT_EXPOSED`;
`UNKNOWN` is never treated as capacity. The implementation consumes supplied
deterministic snapshots and does not probe or mutate a real machine.

## Checkpoint and recovery

A checkpoint preserves the graph/trust identities, prior scheduler generation,
last completed step, selected refs, produced artifact/receipt refs, open
questions, pending tool call, source hashes and next safe action. Formation
requires resource and worker release receipts.

Resume revalidates the graph, trust, current resource admission, capability and
effect bindings, implicated source hashes, and an advanced scheduler
generation. Drift becomes `HELD_UNKNOWN` or `BLOCKED`; it is never replayed as
current work. Cancellation likewise releases the resource lease and records
the work, graph, source and receipt lineage.

## Typed mock tool boundary

The model may propose a typed call. Deterministic code validates:

```text
pending toolCallRef
work node + context lease
tool ref + argument schema/hash
capability + effect + resource leases
scheduler generation
result schema
timeout + cancellation policy
```

Wrong, stale, duplicate, late, schema-mismatched or generation-mismatched
results fail closed. One accepted result becomes one bounded observation;
artifacts remain external by ref and raw logs are excluded. Reinjection into the
matching context is once-only.

This implementation is deliberately a fake/model-free and mock-tool contract.
It does not download or invoke a model, expose a raw model endpoint, execute
shell/Git/filesystem/network actions, or mutate a real repository.

## Commands and evidence

```bash
npm run scheduler:check
npm run scheduler:simulate
npm run scheduler:status -- --fixture <safe-repository-relative-json-path>
node --test test/intent-scheduler.test.mjs
npm run pr-ready
npm run health:check
```

`scheduler:simulate` uses a deterministic synthetic resource snapshot and
source-managed trust bindings. It executes no external effects.

The S0–S16 tests cover zero admission for non-green graphs, exact receipts,
single-worker exclusion, visible logical branches, checkpoint-only preemption,
fairness, resource failure, context budgets/no-ops, checkpoint/resume,
tool-call/result matching, cancellation lineage, bounded projections, and full
registration.

## Held successor boundary

Still unimplemented and unauthorized:

```text
Intent Orchestration 3/3 Burden Release / Continuity Evolution Router
Windows, macOS, Android and iOS native implementation
real local model provisioning or inference
arbitrary shell, Git, filesystem, network or publication effects
model-weight training, removal or activation
public release, merge or acceptance
```

Passing the shared deterministic gates is not native-platform conformance,
production model evidence, security completeness, merge approval or publication
authority.

<!-- [VXG RealForever] -->
