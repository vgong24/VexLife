# Intent Orchestration 2/3 — single-worker scheduler

`[VXG RealForever]`

The human surface is the **Intent Queue runtime**. The canonical shared runtime
is one deterministic scheduler around the accepted Intent Workgraph:

```text
validated workgraph
→ exact admission receipt
→ one physical model-worker lease
→ one bounded context lease
→ exact mock observation / scheduler-authorized successor context
→ normal completion or recoverable checkpoint continuation
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
generation, observed clock, fairness, active work, normal completion, preempted
continuations, every lease transition, checkpoints, cancellation and the
durable relay ledger. Queue, Terrain, Health and Guide are
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

An interactive arrival can request preemption of background work. The retained
incoming admission must match its complete fingerprint plus runtime, worker,
graph and node identities. The active
lease remains live until `checkpoint` records a safe boundary and
transactionally consumes admission plus worker, context, resource, occupancy,
capability and effect leases. Preemption re-admits the retained interactive
candidate through the normal fresh-generation path while preserving the prior
checkpoint as a continuation. Foreground completion or cancellation exposes
that continuation for fresh-evidence resume. There is no asynchronous
source-discarding interrupt.

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
expiry. Resource evidence must still cover the scheduler aggregate's exact
current observed-clock event. Advancing that clock recomputes Health, so expired
active evidence becomes blocked without another model turn. A registered
external runtime authority forms that evidence; the
scheduler cannot self-certify it. A platform without thermal telemetry uses
`NOT_EXPOSED`; `UNKNOWN` is never treated as capacity. The implementation
consumes supplied deterministic snapshots and does not probe or mutate a real
machine.

## Checkpoint and recovery

A checkpoint derives active context, source, admission, worker and lease lineage
from the scheduler aggregate. Caller substitution is rejected. Additional
artifact or receipt refs require canonical active/relay evidence. Formation
requires exactly one unique immutable release receipt for worker, context,
resource, capability, effect and occupancy, each binding the prior and
transitioned fingerprints under one explicit lifecycle.

Resume revalidates the graph, trust, changed-but-sufficient external resource
evidence, capability and effect bindings, paired source hashes, and an advanced
scheduler generation. Every fresh lease is formed through normal admission and
selection; prior leases cannot be replayed. Drift becomes `HELD_UNKNOWN` or
`BLOCKED`. `completeActive` separately requires the exact node fingerprint,
expected transition, completion gates, one current completion receipt and
return route; it emits completion, six lease-transition and return-route
receipts and projects `COMPLETED/CLOSED`. Cancellation remains a distinct
alternative transition.

## Typed mock tool boundary

The model may propose a typed call. Deterministic code validates:

```text
pending toolCallRef
canonical tool + effect + argument/result schemas + executor
work node + exact origin context or scheduler-authorized successor context
worker + context + capability + effect + resource leases
runtime snapshot + scheduler generation + cancellation token
timeout + cancellation policy
```

Wrong-context, wrong-effect, stale, duplicate, before-proposal, late,
schema-mismatched, generation-mismatched, post-restart replayed or
cancellation-racing results fail closed. Restore always recomputes the whole
ledger and validates every call, observation, canonical tool/effect/schema/
executor identity, transition receipt and legal state progression. Held calls
support explicit `RESUME`, `REISSUE`, `SUPERSEDE` and `CLOSE` actions bound to
their checkpoint and a fresh successor context lease. Successor reinjection is
once-only and requires a scheduler-issued authorization receipt binding the
prior context/observation and every fresh runtime/lease/generation identity.

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

`scheduler:simulate` performs the complete success journey: validated graph,
external simulated runtime evidence, admission, every lease, canonical mock
tool call/result, checkpoint and transactional release,
changed-but-sufficient resource evidence, fresh-generation resume,
scheduler-authorized once-only reinjection, and normal completion. A separate
alternative journey proves cancellation. All `--receipt` arguments for this
command, `pr-ready`, and `health-check` are confined to safe repository-relative
`generated/health/**` paths and reject absolute, traversal, symlink and
non-generated destinations. The simulation writes
`generated/health/intent-scheduler-simulation.json`, bound to the exact
candidate/checkout/base, source tree, Blueprint, scheduler registry and all
lifecycle fingerprints. `pr-ready` and `health:check` independently reject a
missing, stale, malformed, self-certified, effectful or orphaned receipt.

The S0–S22 tests cover zero admission for non-green graphs, exact receipts,
single-worker exclusion, visible logical branches, checkpoint-only preemption,
fairness, resource failure, context budgets/no-ops, checkpoint/resume,
normal completion, full preemption continuation, derived six-lease checkpoint
lineage, durable held-tool restore/actions, scheduler-issued successor context,
live-clock/tool-time progression, safe receipt paths, cancellation lineage,
bounded projections, and full registration.

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
