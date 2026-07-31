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

`src/core/state.mjs` owns one canonical scheduler aggregate containing queue,
generation, fairness, active work, every lease transition, checkpoints,
cancellation and the durable relay ledger. Queue, Terrain, Health and Guide are
selectors over that aggregate. They do not keep duplicate scheduler truth.
Equal semantic output produces no new revision.

## Admission

`admitIntentSchedulerQueue` first runs the accepted workgraph validator. Only
`PLAN_VALIDATED` is schedulable. `ATTENTION`, `BLOCKED`, stale or malformed
graphs may expose logical candidates, but their admitted set is empty.

For the selected node, the admission receipt binds:

```text
graph ref + fingerprint
trust snapshot ref + source + source hash + fingerprint + formation
external runtime snapshot + registered source/authority/worker + fingerprint
canonical formedAt <= observedAt < expiresAt interval
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
canonical maximum generation count wins the non-interactive pool by
scheduler-owned, source-bound deferral count, oldest ready generation and then
stable work-node ref. Callers cannot inject fairness truth. Priority changes
never delete the workgraph or its source.

An interactive arrival can request preemption of background work. The active
lease remains live until `checkpoint` records a safe boundary and
transactionally consumes admission plus worker, context, resource, occupancy,
capability and effect leases. Completion re-admits and selects the retained
interactive candidate through the normal fresh-generation path. There is no
asynchronous source-discarding interrupt.

## Context and resource leases

A context lease contains stable refs for the foundation kernel, role, intent,
Atlas/source selections, culture, lessons and release material. Whole graphs,
message histories, architecture documents, raw logs and artifact payloads are
rejected. Estimated input plus reserved output must fit the hard token limit.
The context semantic fingerprint excludes lease identity and time, allowing an
equal selection to reuse the current lease without another transition only
while the exact lease and every binding remain active and unexpired.

A resource snapshot uses explicit CPU concurrency/load, RAM, GPU/VRAM, model
residency, active model/tool state, interactive wait, background admission,
thermal/power state, source identity, evidence hash, formation, observation and
expiry. A registered external runtime authority forms that evidence; the
scheduler cannot self-certify it. A platform without thermal telemetry uses
`NOT_EXPOSED`; `UNKNOWN` is never treated as capacity. The implementation
consumes supplied deterministic snapshots and does not probe or mutate a real
machine.

## Checkpoint and recovery

A checkpoint preserves the graph/trust identities, prior scheduler generation,
last completed step, selected refs, produced artifact/receipt refs, open
questions, pending tool call, paired source refs/hashes and next safe action.
Formation requires immutable release receipts for admission and every lease.

Resume revalidates the graph, trust, changed-but-sufficient external resource
evidence, capability and effect bindings, paired source hashes, and an advanced
scheduler generation. Every fresh lease is formed through normal admission and
selection; prior leases cannot be replayed. Drift becomes `HELD_UNKNOWN` or
`BLOCKED`. Cancellation closes pending relay entries, consumes every lease and
records the work, graph, source and receipt lineage.

## Typed mock tool boundary

The model may propose a typed call. Deterministic code validates:

```text
pending toolCallRef
canonical tool + effect + argument/result schemas + executor
work node + exact origin context or authorized successor context
worker + context + capability + effect + resource leases
runtime snapshot + scheduler generation + cancellation token
timeout + cancellation policy
```

Wrong-context, wrong-effect, stale, duplicate, late, schema-mismatched,
generation-mismatched, post-restart replayed or cancellation-racing results fail
closed. The serializable relay ledger preserves exact state across restart. One
accepted result becomes one bounded observation; artifacts remain external by
ref and raw logs are excluded. Reinjection into the origin or an explicitly
authorized successor context is once-only.

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

`scheduler:simulate` performs the complete registered journey: validated graph,
external simulated runtime evidence, admission, every lease, canonical mock
tool call/result, once-only reinjection, checkpoint and transactional release,
changed-but-sufficient resource evidence, fresh-generation resume, and
cancellation closure. It writes
`generated/health/intent-scheduler-simulation.json`, bound to the exact
candidate/checkout/base, source tree, Blueprint, scheduler registry and all
lifecycle fingerprints. `pr-ready` and `health:check` independently reject a
missing, stale, malformed, self-certified, effectful or orphaned receipt.

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
