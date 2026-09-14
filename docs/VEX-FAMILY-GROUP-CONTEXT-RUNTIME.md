# Vex Family Group Context Runtime

`[VXG RealForever]`

## Purpose

`module.vexlife.core.family-group-context-runtime` compiles one bounded, source-current Family group conversation frontier from the accepted Family Space and durable Conversation owners, then projects only exact selected message references into the existing Context Lease owner.

It is a compiler/consumer. It is **not** Family membership authority, a transcript store, Memory, prompt materialization, a model/provider boundary, a scheduler, or a second conversation store.

```text
Family Space current record
+ durable canonical GROUP channel binding
+ immutable current conversation lineage
+ exact persisted human trigger
→ source-current Family frontier
→ exact selected message refs in Context Lease
```

## Permanent non-collapses

```text
FRONTIER != TRANSCRIPT
FRONTIER != MEMORY
FRONTIER != PROVIDER_PROMPT
CONTEXT_LEASE != MESSAGE_STORE
DURABLE_CHANNEL_BINDING != CURRENT_FAMILY_MEMBERSHIP_AUTHORITY
FAMILY_VEX_LINEAGE != DISPLAY_NAME_INFERENCE
HUMAN_MESSAGE_DELIVERY != AI_ATTENTION
```

No Home, Memory, Relationships, model/provider, network, training, activation, publication, or external effect authority is granted here.

## Accepted inputs

The runtime consumes only accepted owners:

- `module.vexlife.core.family-space-store` for the current Family Space record and membership generation;
- `src/core/family-conversation.mjs` for current Family channel binding and FROM_JOIN visibility semantics;
- `module.vexlife.core.conversation-store` for hash-linked durable channel/message lineage;
- `src/core/context-lease.mjs` for the existing bounded Context Lease contract.

Family Space current identity is the exact pair:

```text
familySpaceRecordSha256
membershipGeneration
```

`membershipSnapshotRef` remains a Family Conversation-derived identity. This runtime does not pretend that field is owned by Family Space.

The only currently admitted Family history policy is:

```text
policy.vex-family.history.from-join
```

## Frontier contract

The emitted frontier is content-free and hash/reference bound:

```text
schemaVersion=vexlife.family-group-conversation-frontier/v1
frontierRef
frontierSha256
spaceRef
threadRef
channelRef
familyCompanionLineageRef
familySpaceRecordSha256
membershipGeneration
requestPrincipalRef
requestPrincipalBindingRef
triggerMessageRef
triggerMessageHash
selectedMessageBindings[]
lastIncludedMessageRef
lastIncludedMessageHash
historyVisibilityPolicyRef
maxMessages
maxInputTokens
inputTokenEstimate
formedAt
currentness=CURRENT
sourceRefs[]
```

Each selected binding retains only canonical evidence needed to re-witness the exact source:

```text
messageRef
speakerRef
recipientRefs
witnessRefs
contentHash
eventSha256
sequence
membershipGeneration
createdAt
```

Message content remains in the durable Conversation owner and is not copied into the frontier.

## Selection and currentness law

A frontier forms only when:

1. the addressed Family Space exists and is current;
2. the durable addressed channel is a canonical `GROUP` Family channel;
3. the channel binding matches the exact current Family Space record SHA and membership generation;
4. the current Family Vex lineage is ACTIVE and exactly matches the durable channel binding;
5. the trigger exists in the exact current durable message lineage;
6. the trigger speaker is an active current Family principal under the channel's bound principal identity;
7. participant visibility is source-managed `FROM_JOIN`;
8. the trigger is visible exactly once;
9. the full currently visible frontier fits the explicit message and token bounds.

If the bounded frontier cannot be represented, formation fails closed. There is no whole-history fallback.

The original trigger remains immutable while newer authorized Family messages present at formation may be included. The trigger speaker is derived from the persisted trigger event rather than trusted from a caller field.

## Fresh-at-execution behavior

Queued Family AI work uses:

```text
FRESH_AT_EXECUTION_BOUNDED
```

The frontier should be formed when selected work becomes active, not when the human message was merely queued.

`verifyFamilyGroupFrontierCurrent()` independently re-witnesses Family Space, durable channel, selected event hashes, trigger identity and current principal binding. If a newer durable Family message arrives after frontier formation, verification returns:

```text
FRONTIER_ADVANCED_DURING_INFERENCE
```

rather than silently pretending that the older frontier saw the newer message.

`createFamilyGroupContextLease()` requires a still-current frontier. If the conversation advanced, callers must form a fresh frontier before leasing. The resulting Context Lease receives exactly the chosen message refs through `selectedSourceRefs`; no `messageHistory` or equivalent heavy payload is admitted.

## Failure classes

Representative fail-closed states include:

```text
FAMILY_GROUP_CONTEXT_FAMILY_NOT_FOUND
FAMILY_GROUP_CONTEXT_CHANNEL_NOT_FOUND
FAMILY_GROUP_CONTEXT_CHANNEL_DENIED
FAMILY_GROUP_CONTEXT_STALE
FAMILY_GROUP_CONTEXT_MEMBER_DENIED
FAMILY_GROUP_CONTEXT_BINDING_MISMATCH
FAMILY_GROUP_CONTEXT_TRIGGER_NOT_FOUND
FAMILY_GROUP_CONTEXT_TRIGGER_INVALID
FAMILY_GROUP_CONTEXT_BOUNDS_EXCEEDED
FAMILY_GROUP_CONTEXT_FRONTIER_INVALID
FAMILY_GROUP_CONTEXT_ADVANCED
```

Accepted underlying Family Space / Family Conversation / Conversation Store corruption and currentness failures remain source evidence and are not rewritten into success.

## Proof family

`test/vex-family-group-context-runtime.test.mjs` covers:

```text
FGC-00  three humans + exact Family Vex lineage preserve distinct speakers
FGC-01  five-human deterministic source-bound selection
FGC-02  PRIVATE/non-group sources fail closed
FGC-03  FROM_JOIN floor excludes pre-join history
FGC-04  stale membership generation fails closed
FGC-05  original trigger stays exact while newer authorized messages are included
FGC-06  prior Family Vex speech is recognized only by exact lineage identity
FGC-07  Context Lease selectedSourceRefs exactly cover selected message refs
FGC-08  event/token bounds fail closed without whole-history fallback
FGC-09  independent re-witness reproduces currentness and reports frontier advance
FGC-10  frontier carries no message content, Memory or model/provider effect
```

## Downstream boundary

VF-03B may later materialize trusted Family prompt content by resolving this frontier's exact selected refs through the accepted conversation owner at the existing local-model boundary.

VF-03C may later compose Family AI attention through the accepted Intent/Workgraph/Scheduler and one physical model worker.

Neither downstream stage is activated by this module.

Real paired browser/device session production and real participant acceptance remain separate held obligations.

<!-- [VEX-FAMILY][VF03A][GROUP-CONTEXT-RUNTIME][VXG RealForever] -->
