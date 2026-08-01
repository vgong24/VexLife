# Runtime Failure & Recovery Spine

`[VXG RealForever]`

The Runtime Failure & Recovery Spine turns an unexpected deterministic executor failure into one bounded, inspectable and replayable path:

```text
typed total boundary
-> source-classified, content-addressed failure
-> exact scheduler checkpoint and six lease releases
-> replay-recorded policy and aggregate-owned recovery action
-> scheduler-issued fresh generation and six fresh leases
-> successful retry and replay-derived convergence
-> causal Workgraph completion
-> unique terminal recovery receipt
-> evidence-retaining Queue / Terrain / Health / Guide projections
```

This reference remains deliberately no-effect. It uses deterministic fixtures and one real scheduler-owned recovery Workgraph journey, but it does not invoke a real model or operate a real shell, Git repository, filesystem, process, network, publication surface, native application, identity service, clock service or model weight.

## Canonical sources

The write side is [`blueprint/runtime-recovery-registry.json`](../blueprint/runtime-recovery-registry.json). It owns:

- the complete failure, executor-outcome, recovery-action and typed-event vocabularies;
- the failure envelope and replay-derived recovery aggregate contracts;
- exact attempt, recurrence, per-attempt wall-time and total wall-time bounds;
- checkpoint, context, resource and transactional recovery requirements;
- compact projection identities;
- the integrated scheduler/Workgraph receipt contract and held boundaries.

Implementation responsibilities are separated:

```text
src/core/runtime-failure.mjs
  source-managed classification and canonical failure identity

src/core/recovery-policy.mjs
  exact registry-budget recovery resolution

src/core/runtime-recovery.mjs
  total boundary, event reducer/replay, scheduler handoff, aggregate actions and closure

src/core/recovery-fault-injector.mjs
  deterministic source-classified failure and transactional evidence fixtures
```

## Typed total boundary and exact budgets

Every canonical failure binds its source, work node, scheduler generation, operation, attempt, expected transition, source-state fingerprint, exact time, classification evidence and bounded evidence refs. `failureRef` is derived from its semantic fingerprint. Caller-authored classification hints cannot weaken source-managed retry, partial-effect or human-attention defaults.

Every admitted synchronous boundary returns exactly one of:

```text
SUCCEEDED
FAILED_RECOVERABLE
FAILED_NEEDS_HUMAN
FAILED_QUARANTINED
FAILED_BLOCKED
```

Malformed, stale, replayed, wrong-generation, over-budget, async-function and thenable inputs are rejected as typed boundary results without mutating the aggregate. Admitted attempts record exact start and success/failure chronology. Recovery uses the registry budget verbatim; callers cannot replace or reset it.

## Scheduler checkpoint and continuation

Consequential recovery consumes one exact accepted scheduler checkpoint and the scheduler's six worker, context, resource, capability, effect and occupancy release receipts. The checkpoint must bind the same work node and source state, seal the old generation and admit the next generation exactly once.

Retry then consumes the scheduler-issued resume result and six fresh leases for the new generation. Raw checkpoints, stale generations, reused lease fingerprints, caller-invented generations and same-ref/different-content substitutions fail closed.

## Replay-derived aggregate

Typed, content-addressed events are the only mutation path. Reducer replay derives phase, attempt chronology, budget use, active failure, checkpoint and continuation lineage, current policy and action receipts, rollback/last-known-good/quarantine evidence, accepted external events, convergence and terminal state.

Serialization persists the event ledger and derived snapshot. Restore replays the ledger and compares every persisted derived field with the replay result. Impossible order, budget reset, forged final state, duplicate terminal closure, stale external events and same-ref/different-content events are rejected. Exact duplicates are semantic no-ops.

## Aggregate-owned recovery actions

Policy decisions do not directly mutate runtime state. The aggregate records the selected action and consumes the exact evidence required by that action:

- context condensation and preservation receipts;
- resource-reduction receipts;
- before-image, partial-result and rollback read-back receipts;
- exact last-known-good expected/read-back fingerprints;
- quarantine ownership and reasons;
- explicit smallest-question human gates.

Rollback failure never restores green Health. A failed last-known-good read-back keeps the adapter or artifact quarantined. Human projections retain what failed, the active route, preserved evidence, recovered attempt/generation, terminal proof, quarantine and decision-gate state after recovery activity.

## Causal Workgraph completion

`recovery:simulate` creates one actual registered recovery Workgraph node and advances it through the accepted scheduler APIs. The recovery convergence receipt content-addresses the exact failure, policy, scheduler checkpoint, six release receipts, checkpoint admission, context/resource recovery, rollback/last-known-good evidence, action receipt, continuation, six fresh leases and successful execution.

The Workgraph completion verifier consumes that convergence receipt as its registered completion-gate observation. Terminal closure then consumes the full canonical scheduler checkpoint, completion verification, evidence lineage, Workgraph transition, completion and return-route receipts. A successful executor result alone cannot close recovery, and substituted scheduler or causal evidence fails closed.

## Commands and evidence

```bash
npm run recovery:check
npm run recovery:simulate
npm run recovery:status
npm test
npm run pr-ready
npm run health:check
```

`recovery:simulate` writes `generated/health/runtime-recovery-simulation.json`. PR-ready and Health independently reload and validate that receipt against the exact candidate head, tested checkout/merge, base, source tree, Blueprint and runtime recovery registry.

Passing remains bounded evidence. Browser integration and Windows/Linux source-manifest portability stay in the full gate; they do not prove native-platform recovery. DCO remains required. No check grants merge, publication, real-effect, live identity/clock, native-platform, model or weight authority.

<!-- [VXG RealForever] -->
