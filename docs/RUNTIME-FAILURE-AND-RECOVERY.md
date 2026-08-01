# Runtime Failure & Recovery Spine

`[VXG RealForever]`

The Runtime Failure & Recovery Spine converts unexpected deterministic executor failures into one bounded, inspectable path:

```text
failure
→ content-addressed failure envelope
→ source-managed recovery decision
→ retry | checkpoint | reduce | split | rollback | restore | quarantine | ask | block
→ exact recovery receipt
→ changed-only Queue / Terrain / Health / Guide projection
```

This implementation is deliberately no-effect. It proves contracts with deterministic fixtures; it does not invoke a real model or operate a real shell, Git repository, filesystem, process, network, publication surface, native application, identity service, clock service or model weight.

## Canonical sources

The write side is [`blueprint/runtime-recovery-registry.json`](../blueprint/runtime-recovery-registry.json). It owns:

- the complete failure vocabulary and executor outcomes;
- the failure envelope and recovery aggregate contracts;
- retry count, repeated-fingerprint and wall-time bounds;
- checkpoint, context and transactional recovery requirements;
- recovery actions and compact projection identities;
- the integrated simulation receipt contract and held boundaries.

The implementation is split by responsibility:

```text
src/core/runtime-failure.mjs
  canonical failure identity and validation

src/core/recovery-policy.mjs
  source-managed recovery resolution

src/core/runtime-recovery.mjs
  total executor boundary, aggregate, checkpoint, context, replay and projections

src/core/recovery-fault-injector.mjs
  deterministic timeout/resource/process/disk/network/rollback fixtures
```

## Failure identity

Every canonical failure binds:

```text
origin + work node + scheduler generation
+ operation + attempt + expected transition
+ exact source-state fingerprint + observed time
+ failure, retry, partial-effect and human-attention classes
+ bounded evidence refs
```

`failureRef` derives from the semantic fingerprint. A thrown string or stack is normalized into bounded evidence; it does not become the state owner. Unknown or malformed values become visible `UNKNOWN_FAILURE` or `MALFORMED_INPUT_OR_RESULT` state and fail closed.

Every admitted executor boundary returns exactly one of:

```text
SUCCEEDED
FAILED_RECOVERABLE
FAILED_NEEDS_HUMAN
FAILED_QUARANTINED
FAILED_BLOCKED
```

Success carrying a possible partial effect is rejected as malformed rather than painted green.

## Retry and checkpoint discipline

Retry comes from the registry, never caller preference. The policy consumes failure class, attempts, identical-condition recurrence, reversibility, partial-effect state, resource/context admission, checkpoint currentness and unchanged authority.

The default deterministic budget is three attempts, two identical-condition failures and one short wall-time class. Consequential retry additionally requires:

- one current recovery checkpoint;
- the exact accepted scheduler checkpoint fingerprint;
- all six worker/context/resource/capability/effect/occupancy release fingerprints;
- the same work and source state;
- a strictly fresh scheduler generation;
- fresh context and resource admission.

Stale, corrupted, cross-work, cross-generation, wrong-source and same-ref/different-content checkpoints reject without mutation.

## Context recovery

The context planner checks `input + reserved output` before any model invocation. On overflow it checkpoints the work and preserves:

```text
exact immutable source/message ranges
human intent and interpretation
unknown refs
authority ref
return route
```

Only explicitly eligible older segments use deterministic candidate-summary refs. The candidate is admitted only after exact range coverage and a fresh size estimate validate. If it still cannot fit, the route is split work, the smallest human clarification or terminal block. No invisible truncation occurs and source history is never described as deleted.

## Transactional recovery

The no-effect adapter proves:

```text
expected before fingerprint
→ simulated partial transition
→ read-back fingerprint
→ rollback attempt
→ read-back verification
→ exact last-known-good restore or quarantine
```

A rollback failure cannot restore green Health. If exact last-known-good read-back also fails, the adapter or artifact is quarantined.

## Restart and replay

The recovery aggregate serializes active failure, attempt and retry state, checkpoint and rollback lineage, quarantines, last-known-good refs, human gates, terminal receipts and accepted external events. Restore recomputes its fingerprint. Exact duplicate events are semantic no-ops; stale generation, cross-work and same-ref/different-content events reject.

## Human projections

Queue, Terrain, Health and Guide are derived from the same aggregate and answer only:

```text
What failed?
What was preserved?
Was anything partially changed?
Is retry safe?
Which route is active?
What is waiting?
Does Victor need to decide anything?
Which refs prove recovery?
What remains blocked?
```

Raw stacks, machine dumps and heavy source remain source-descendable. An equal projection fingerprint emits no new revision.

## Commands and evidence

```bash
npm run recovery:check
npm run recovery:simulate
npm run recovery:status
npm test
npm run pr-ready
npm run health:check
```

`recovery:simulate` writes `generated/health/runtime-recovery-simulation.json`. Its terminal recovery receipt consumes the exact accepted scheduler checkpoint, completion verification, completion evidence lineage, Workgraph transition and completion fingerprints. PR-ready and Health separately reload and validate that receipt against the current candidate head, tested checkout/merge, base, source tree, Blueprint and runtime recovery registry.

Passing remains bounded evidence. Browser integration and Windows/Linux source-manifest portability stay in the full gate; they do not prove native-platform recovery. DCO remains required. No check grants merge, publication, real-effect, live identity/clock, native-platform, model or weight authority.

<!-- [VXG RealForever] -->
