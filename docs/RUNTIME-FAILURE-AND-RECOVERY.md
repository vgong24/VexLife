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
- registered classifier sources/adapters, typed event payload schemas and action-specific evidence matrices;
- checkpoint single-use ownership, context, resource and transactional recovery requirements;
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

Every canonical failure binds its registered classifier source, exact adapter, content-addressed classifier plan, work node, scheduler generation, operation, attempt, expected transition, source-state fingerprint, exact time, classification evidence and bounded evidence refs. `failureRef` is derived from its semantic fingerprint. Executor error fields remain evidence only: the canonical classifier issues the failure class and exact retry, partial-effect and human-attention defaults.

Every admitted synchronous boundary returns exactly one of:

```text
SUCCEEDED
FAILED_RECOVERABLE
FAILED_NEEDS_HUMAN
FAILED_QUARANTINED
FAILED_BLOCKED
```

Malformed, stale, replayed, wrong-generation, over-budget and async-function inputs are rejected as typed boundary results without mutating the aggregate. Both resolved and rejected thenables receive the same typed unsupported result; rejected thenables have a rejection handler attached before return so no rejection escapes the boundary. Admitted attempts record exact start and success/failure chronology. Recovery uses the registry budget verbatim; callers cannot replace or reset it.

## Scheduler checkpoint and continuation

Consequential recovery consumes one exact accepted scheduler checkpoint and the scheduler's six worker, context, resource, capability, effect and occupancy release receipts. Before admission, the scheduler issues one current-pointer consumption receipt binding the checkpoint and release set to the exact aggregate, active failure and once-only activation ref. The checkpoint must bind the same work node and source state, seal the old generation and admit the next generation exactly once. Cross-aggregate, cross-failure, duplicate, post-continuation and release-reuse attempts fail closed.

Retry then consumes one scheduler-owned recovery resume receipt and six fresh leases for the new generation. That receipt binds the exact action and checkpoint admission. For context actions it also binds immutable source coverage, summaries, intent, interpretation, unknowns, authority, return route and token budget into the new context lease. For resource actions it binds the exact reduced request and admission into the new resource lease. Raw checkpoints, generic context substitutions, detached resource leases, stale generations, reused lease fingerprints, caller-invented generations and same-ref/different-content substitutions fail closed.

## Replay-derived aggregate

Typed, content-addressed events are the only mutation path. Every registered event has one exact payload schema and semantic replayer. Replay reconstructs context receipts from their source segments, resource receipts from the exact snapshot and requests, transactional outcomes from a registered no-effect adapter/fault plan, human gates from aggregate-owned policy, action receipts from the registered evidence matrix, scheduler continuation from its consumption receipt, and terminal closure from its canonical scheduler evidence.

Serialization persists the event ledger and derived snapshot. Restore replays the ledger and compares every persisted derived field with the replay result. Impossible order, budget reset, forged final state, duplicate terminal closure, stale external events and same-ref/different-content events are rejected. Exact duplicates are semantic no-ops.

## Aggregate-owned recovery actions

Policy decisions do not directly mutate runtime state. The registry names required, optional and forbidden evidence, disposition, continuation need, wait/human requirement and completion eligibility for every action. The aggregate records the selected action and consumes only its exact evidence:

- context condensation and preservation receipts;
- resource-reduction receipts;
- before-image, partial-result and rollback read-back receipts;
- exact last-known-good expected/read-back fingerprints;
- quarantine ownership and reasons;
- current external wait/resume events, split-child return routes and explicit source-managed smallest-question human gates.

Rollback failure never restores green Health. A failed last-known-good read-back keeps the adapter or artifact quarantined. Human projections retain what failed, the active route, preserved evidence, recovered attempt/generation, terminal proof, quarantine and decision-gate state after recovery activity.

## Causal Workgraph completion

`recovery:simulate` creates one actual registered recovery Workgraph node and advances it through the accepted scheduler APIs. Its primary convergence receipt contains the fixed checkpoint lineage, only the evidence allowed for the selected rollback action, the scheduler-owned resume/continuation, six fresh leases and successful execution. Separate deterministic branches cover direct retry, context recovery, resource reduction, rollback, last-known-good restore, external wait/resume, split return, human hold, terminal block and quarantine; the quarantine proof owns a distinct scheduler checkpoint and release lineage.

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
