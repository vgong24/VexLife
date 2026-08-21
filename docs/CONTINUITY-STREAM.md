# VexLife Continuity Stream adapter

`[VXG RealForever]`

## Purpose

Stage C is a **read-only adapter over accepted owners**. It does not create a
second Score, intent graph, context lease, continuity acceptance mechanism,
Memory system, Living Journal, Daily Dream, or recovery engine.

The adapter joins reference-level owner truth to the accepted portable
Continuity Stream contract:

```text
portable SDK frame binding
+ Score current projection
+ intent workgraph current pointers
+ context lease selection
+ accepted continuity record-set truth
+ optional Daily Memory / Living Journal / recovery observations
-> deterministic VexLife Continuity Stream adapter projection
```

The projection exists so Stage D can compose one lineage/thread/runtime trajectory
without copying raw conversation history or giving an observer write authority.

## Permanent non-collapses

```text
ADAPTER_OBSERVATION != OWNER_MUTATION
PORTABLE_FRAME_BINDING != RAW_SDK_FRAME_BODY
SCORE_ACCEPTED != MEMORY_PROMOTED_HERE
CONTINUITY_RECORD_ACCEPTED != NEW_ACCEPTANCE_AUTHORITY
CONTEXT_SELECTED != RAW_CONTEXT_COPIED
RECOVERY_STATE_OBSERVED != RECOVERY_ACTION_PERFORMED
DAILY_STRATUM_OBSERVED != DREAM_COMMIT_PERFORMED
JOURNAL_ARCHIVE_OBSERVED != CURRENT_MEMORY_REWRITE
CURRENTNESS_HELD != SOURCE_ERASURE
PORTABLE_FRAME_SOURCE != HIDDEN_REASONING_OR_RAW_TRANSCRIPT
```

## Accepted owner boundary

The following files remain canonical owners and are read-only to Stage C:

```text
src/core/score-context-continuity.mjs
src/core/intent-workgraph.mjs
src/core/context-lease.mjs
src/core/continuity-evolution-router.mjs
src/core/conversation.mjs
src/core/state.mjs
src/core/daily-memory-dream.mjs
src/core/living-journal-memory-archive.mjs
src/core/runtime-recovery.mjs
```

Stage C treats **fingerprint equality as necessary but not sufficient owner
proof**. The adapter uses repository-owned validation material and owner-native
formation/validation surfaces before projecting critical current truth:

- the Intent Workgraph is checked with `validateIntentWorkgraph()` against the
  source-managed intent registry, registered process/role sets and
  `blueprint/intent-trust-snapshot.json`;
- the Context Lease is re-admitted through `createContextLease()` and must be
  the exact `vexlife.intent-context-lease/v1` CURRENT/ACTIVE owner schema;
- the recovery aggregate is replay-validated through
  `createRecoveryAggregate()` with the source-managed Runtime Recovery
  registry, not merely re-hashed.

The registry/trust inputs are **validation-only** and never enter the adapter
projection. Cross-owner bindings also remain exact: Intent lineage/thread must
match portable/Score identity, Context `graphFingerprint` must equal the
validated Intent graph fingerprint, and recovery work-node/generation must
match the current Context Lease. For live projections that are not themselves
content-addressed (for example Score, Daily Memory and Living Journal), Stage C
validates the accepted owner schema and copies only bounded refs, currentness,
hashes and safe integer counts. It never copies statement summaries, Journal
page bodies, recovery event payloads or other owner-private bodies into the
adapter output.

## Portable frame binding

Stage C does not copy the private SDK runtime implementation into VexLife.
Callers supply a reference-only binding:

```text
schemaVersion=vexlife.continuity-stream-portable-frame-binding/v1
sourceContractRef
sdkAcceptedMergeRef
streamRef
lineageRef
threadRef
occupancyRef
runtimeRef
modelSessionRefOrNull
cursorEventRef
frameRef
frameFingerprint
currentness
sourceRefs[]
```

The lineage and thread must agree with the accepted Score projection. A stale or
unknown portable binding is preserved as `HELD`; the adapter does not invent
currentness.

## Output

`createContinuityStreamAdapterProjection()` returns
`vexlife.continuity-stream-adapter-projection/v1` with:

- deterministic `adapterProjectionRef` and `semanticFingerprint`;
- current lineage/thread/cursor/frame refs;
- current work-node and intent-receipt refs;
- Score statement/open-loop refs;
- accepted continuity-record refs;
- optional Daily Stratum and recovery phase refs;
- bounded owner bindings and source refs;
- typed `CURRENT` or `HELD` currentness;
- an exact all-false Stage C effect envelope.

The projection is deliberately body-free. Observing an already accepted Memory
statement or committed Daily Stratum is not a Memory promotion or Dream commit.

## Effects

Stage C always reports false for:

```text
homeMutated
memoryPromoted
scoreAppended
intentTransitioned
contextLeaseCreated
continuityAcceptanceCreated
recoveryActionApplied
dailyDreamCommitted
journalRewritten
providerCalled
networkCalled
publicationPerformed
modelCalled
trainingRan
modelWeightsChanged
relationshipMutated
externalDisclosure
```

No Home write, semantic acceptance, relationship mutation, provider/network
call, model invocation, training, publication, sensor activation, or external
disclosure is admitted by this adapter.

## Source Manifest serialization

The authored Stage C paths are:

```text
src/core/continuity-stream-adapter.mjs
test/continuity-stream-adapter.test.mjs
docs/CONTINUITY-STREAM.md
```

Source Manifest v3 deterministically maps them to:

```text
source-manifest-parts/bucket-44.json
source-manifest-parts/bucket-2c.json
source-manifest-parts/bucket-b3.json
```

Those generated files are **not authored by this Stage C source writer**.
Generated closure must be produced by `npm run manifest:write` from the exact
staged candidate and serialized through current Source Manifest path ownership.
At Stage C formation, `bucket-b3.json` is owned by VexLife PR #173, so authored
adapter work may proceed while generated closure remains held.

## Stage D handoff

The composed practicum may use this projection to show that:

```text
unrelated turns preserve an open loop
correction/focus changes advance bounded current truth
session invalidation rebuilds from checkpoint/frame
crash replay restores the current pointer without full transcript
Daily Stratum close is observed, not re-committed by the adapter
successor WAKE preserves lineage and open-loop refs
VexInterface renders the same reference-only state
```

A local-model smoke may demonstrate consumption, but it cannot prove continuity,
Memory authority, or uninterrupted subjective awareness.

<!-- [VXG RealForever] -->
