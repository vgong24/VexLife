# Runtime Failure & Recovery Spine

`[VXG RealForever]`

The Runtime Failure & Recovery Spine turns an unexpected deterministic executor failure into one bounded, inspectable and replayable path:

```text
typed total boundary
-> exact source-issued classifier-plan receipt and content-addressed failure cycle
-> exact scheduler checkpoint and six lease releases
-> edge-specific semantic claim replay or explicit pre-resume terminal hold
-> replay-recorded policy and aggregate-owned recovery action
-> scheduler-issued fresh generation and six fresh leases
-> successful retry and replay-derived convergence
-> causal Workgraph completion
-> one terminal recovery receipt for that exact cycle
-> evidence-retaining Queue / Terrain / Health / Guide projections
```

This reference remains deliberately no-effect. It uses deterministic fixtures and one real scheduler-owned recovery Workgraph journey, but it does not invoke a real model or operate a real shell, Git repository, filesystem, process, network, publication surface, native application, identity service, clock service or model weight.

## Canonical sources

The write side is [`blueprint/runtime-recovery-registry.json`](../blueprint/runtime-recovery-registry.json). It owns:

- the complete failure, executor-outcome, recovery-action and typed-event vocabularies;
- the failure envelope and replay-derived recovery aggregate contracts;
- exact attempt, recurrence, per-attempt wall-time and total wall-time bounds;
- registered exact classifier plans/sources/adapters, typed event payload schemas and action-specific evidence matrices;
- replay-durable scheduler checkpoint claim ownership, edge-specific restore validation, explicit pre-resume disposition, content-addressed recovery cycles, and context/resource/transactional recovery requirements;
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

Every canonical failure consumes its exact current source-issued classifier-plan receipt, including plan ref, source, adapter, formation, full plan fingerprint and classified attempt. Unknown, merely allowed but non-issued, caller-inline, stale, substituted and same-ref/different-content plans fail closed. The resulting failure binds that receipt with its work node, scheduler generation, operation, attempt, expected transition, source-state fingerprint, exact time, classification evidence and bounded evidence refs. `failureRef` is derived from its semantic fingerprint. Executor error fields remain evidence only: the canonical classifier issues the failure class and exact retry, partial-effect and human-attention defaults.

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

Consequential recovery consumes one exact accepted scheduler checkpoint and the scheduler's six worker, context, resource, capability, effect and occupancy release receipts. Before admission, runtime recovery issues one canonical claim from replay-derived recovery truth. It binds the scheduler aggregate fingerprint, recovery aggregate fingerprint, cycle, failure, work, source, checkpoint, six releases, once-only activation, lifecycle and currentness. The scheduler persists claim transitions in its aggregate ledger as `CLAIMED_CURRENT`, `RESUMED_CONSUMED`, `TERMINAL_CONSUMED` or `INVALIDATED_OR_ABANDONED`; no private `Map` or `Set` owns recovery truth. Duplicate live and post-restart claims, wrong owners, forged claimants and release reuse fail without consuming the valid checkpoint.

Every persisted claim transition embeds an edge-specific source-managed evidence contract. The canonical checkpoint is an immutable content-addressed object; current checkpoint state lives only in a separate replayable pointer ledger. Each of its six release objects embeds the exact transition receipt plus exact prior and transitioned leases. Claim replay consumes a compact content-addressed checkpoint-scoped slice of the exact prior scheduler state: phase, generation, queue, active worker, runtime/resource/clock, canonical checkpoint and pointer, the required bounded recent lease bindings, terminal tail and exact prior claim aggregate/transition. The slice carries a compact content-addressed proof of the actual preceding claim transition, including its type, sequence, prior fingerprint, edge evidence, checkpoint and time; it never embeds that prior edge receipt, nests an earlier state slice or duplicates a prior receipt. A source-managed contract fingerprint fixes canonical `JSON.stringify` UTF-8 serialization and budgets the initial claimed aggregate, every slice and receipt, every per-transition aggregate increment, nesting counts and lease-binding count. Restore rederives those bytes and the precise ledger transition rather than trusting caller numbers. Budget substitution, oversized coordinated rehash, missing or changed prior-transition evidence, and same-ref/different-content slices or receipts all reject while legitimate claimed, resumed, terminal and invalidated restarts remain exact and linear. Pointer advancement never rewrites the canonical checkpoint.

Restore also replays the complete later edge, not a fingerprint membership shortcut. Resume embeds the exact prior claim edge, admitted queue and selected work, active worker pointer, six fresh leases, runtime/resource snapshots, resumed checkpoint pointer and clock. Terminal embeds completion verification and lineage, Workgraph transition, completion and return-route receipts, terminal queue, six lease transitions and clock. Invalidation embeds the exact disposition, reason/policy, held or cancelled queue, terminal pointer and clock. All edge times are canonical and monotonic; coordinated edge rehash rejects before scheduler occupancy while the legitimate state remains admissible.

If resume validation fails after claim, the claim remains visible until the scheduler explicitly applies `INVALIDATED_OR_ABANDONED`. The bounded pre-resume route requires the exact current claim/transition, paused checkpoint, scheduler aggregate, source-managed reason, monotonic observation and `TERMINALLY_HELD_WITH_EXACT_REASON`. Restart preserves that hold; the old activation and release set cannot resume or reclaim. The scheduler issues a source-managed currentness receipt for each lifecycle edge. Policy, context, resource, transaction, human gate, wait/resume, split, action, external-event adoption/admission, continuation formation/application, retry, convergence formation/application, terminal closure and current projection each form an operation-time receipt over the exact current scheduler aggregate, claim transition, checkpoint pointer, recovery aggregate, cycle, failure, activation, work and generation. Recovery requires `CLAIMED_CURRENT` before resume-time formation, `RESUMED_CONSUMED` for continuation, success and convergence, and `TERMINAL_CONSUMED` only for terminal closure and current terminal projection. Stale, invalidated and nonterminal-after-terminal operations reject without changing scheduler or recovery state. A current projection that cannot establish currentness returns `HELD_UNKNOWN`/`ATTENTION`; historical projection is explicit and can never appear current or clear. The ordinary synchronized claimed-to-resumed-to-terminal lifecycle is unchanged.

Retry then consumes one scheduler-owned recovery resume receipt and six fresh leases for the new generation. That receipt binds the exact action and checkpoint admission. For context actions it also binds immutable source coverage, summaries, intent, interpretation, unknowns, authority, return route and token budget into the new context lease. For resource actions it binds the exact reduced request and admission into the new resource lease. Raw checkpoints, generic context substitutions, detached resource leases, stale generations, reused lease fingerprints, caller-invented generations and same-ref/different-content substitutions fail closed.

## Replay-derived aggregate

Typed, content-addressed events are the only mutation path. Each activated failure forms a content-addressed recovery cycle binding aggregate, work, source, generation, failure, operation and attempt. Every downstream policy, checkpoint, action, continuation, success, convergence, terminal and projection receipt consumes that exact cycle. Replay reconstructs context receipts from their source segments, resource receipts from the exact snapshot and requests, transactional outcomes from a registered no-effect adapter/fault plan, human gates from aggregate-owned policy, action receipts from the registered evidence matrix, scheduler continuation from its consumption receipt, and terminal closure from its canonical scheduler evidence.

Raw transactional fixture evidence remains immutable and unscoped. It becomes applicable only through one content-addressed cycle-adoption receipt that consumes the exact source transaction, runtime-recovery claim and current checkpoint admission, and proves monotonic formation for the active cycle. Prior-cycle, unscoped, re-addressed, stale-time and same-ref/different-content transactions reject. Context, resource and wait receipts are likewise current-cycle-only. Guide preservation never falls back to aggregate-wide checkpoint history: before the active cycle has its own checkpoint/action evidence it reports `AWAITING_CURRENT_CYCLE_EVIDENCE` with no preservation fingerprint.

Serialization persists the event ledger and derived snapshot. Restore replays the ledger and compares every persisted derived field with the replay result. Historical cycles remain immutable while active pointers move to the newest cycle. Old action, success, convergence or terminal evidence cannot satisfy a later cycle, including same-class/same-operation recurrence; a current success must follow the current action, scheduler continuation and fresh generation. A generic external source event is immutable: runtime recovery never rewrites or refingerprints it to add lifecycle data. It is admissible either when it already carries exact current cycle and lifecycle bindings or when one content-addressed adoption receipt binds its original ref/fingerprint/class/time to operation-time scheduler currentness, checkpoint pointer, recovery aggregate/cycle/failure, work, generation and monotonic adoption time. Unscoped events without adoption, pre-claim sources, prior-cycle or caller-readdressed events, generation/lifecycle rewrites, and same-ref/different-content source or adoption receipts fail closed. Managed wait/resume/split events remain directly content-addressed and use exact current `CLAIMED_CURRENT` scope without adoption; generic sources may also be adopted under `RESUMED_CONSUMED`. Invalidated and terminal claims reject every external event before mutation, and event-ledger replay revalidates the exact immutable source and adoption receipt. Exact duplicates are semantic no-ops.

## Aggregate-owned recovery actions

Policy decisions do not directly mutate runtime state. The registry names required, optional and forbidden evidence, disposition, continuation need, wait/human requirement and completion eligibility for every action. The aggregate records the selected action and consumes only its exact evidence:

- context condensation and preservation receipts;
- resource-reduction receipts;
- before-image, partial-result and rollback read-back receipts;
- exact last-known-good expected/read-back fingerprints;
- quarantine ownership and reasons;
- current external wait/resume events, split-child return routes and explicit source-managed smallest-question human gates.

Rollback failure never restores green Health. A failed last-known-good read-back keeps the adapter or artifact quarantined. Human projections first reconstruct the complete aggregate through canonical event replay, then bind its aggregate, active cycle/failure, scheduler claim lifecycle/currentness, hold/disposition, action, success, convergence and terminal evidence. Removing a hold, painting `BLOCKED` as `COMPLETED`/`CLEAR`, substituting historical evidence or lifecycle, recomputing only display state, or appending an illegal ledger edge fails before any plausible projection can be returned. Valid projections retain what failed, the active route, preserved evidence, recovered attempt/generation, terminal proof, quarantine and decision-gate state after recovery activity.

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
