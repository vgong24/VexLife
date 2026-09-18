# Vex Family Conversation Currentness and History

`[VXG RealForever]`

This source slice composes the existing `service.conversation` envelope through the dedicated `src/core/family-conversation.mjs` adapter for Family channels. It does not create a second membership system, authentication owner, relationship graph, durable message store, model loop, or browser transport.

## Owner boundaries

```text
Home Bridge / VF-01A
  -> authenticates the human principal and supplies principalBindingRef

Family Space / VF-01B
  -> owns spaceRef, recordSha256, membershipGeneration, member status,
     principalRef, principalBindingRef, joinedAt and history policy

Conversation / VF-02A
  -> consumes one exact Family Space record and forms the channel/message/context envelope

Conversation Store / VF-02B
  -> persists the admitted message independently of model turns
```

`groupRef`, `conversationRef`, `relationshipRef`, `deviceRef`, display names and model roles remain distinct identities.

## Exact producer binding

A Family channel is formed only from a hash-valid `vexlife.family-space/v1` record. Its binding preserves:

```text
spaceRef
familySpaceRecordSha256
membershipSnapshotRef = record.vex-family.<recordSha256>
membershipGeneration
accepted active audience member bindings
policy.vex-family.history.from-join
optional current Family companion lineage
```

`membershipSnapshotRef` is a Conversation adapter reference whose suffix is the exact accepted Family Space `recordSha256`; it is not represented as a field owned by Family Space. The durable Conversation Store already preserves `membershipSnapshotRef` and `membershipGeneration`, so those two values retain the exact producer-record identity without widening VF-02B.

The Family channel exposes an empty generic `memberRefs` view while preserving its admitted witness set only inside the exact Family binding. Generic message/context functions therefore fail closed rather than becoming a production fallback. Family message formation requires the same exact current record, an active admitted speaker, and the exact `principalBindingRef` in that record. A stale generation/hash, inactive member, nonmember, changed principal binding, changed audience or changed companion binding fails closed.

## Audience and addressing

```text
recipientRefs = addressed delivery targets
witnessRefs   = the immutable audience snapshot for the event
```

A recipient subset never becomes a private audience. A private conversation uses a separate `PRIVATE` Family channel with its own exact active-member projection. Historical `witnessRefs` remain unchanged after a later join, leave, removal or revocation.

## History visibility

The only accepted source-managed policy in this slice is:

```text
policy.vex-family.history.from-join
```

`contextForFamilyParticipant()` requires a current active member and exact principal binding, then returns only events in the selected channel for which:

```text
message.createdAt >= member.joinedAt
participantRef is present in the event witnessRefs
```

There is no implicit or caller-invented historical release. An `EXPLICIT_RELEASE` policy/range contract remains held until the Family Space owner adds an accepted source-managed policy.

## Compatibility and effects

The pre-existing generic `createChannel`, `createMessage`, `messagesForChannel` and `contextForParticipant` behavior remains available for non-Family channels. The Family functions are pure envelope operations. They do not read or mutate Vex Home, persist messages, call a model/provider, access the network, write Memory, change Relationships, activate training, or publish anything.

## Proof map

`test/vex-family-conversation.test.mjs` covers:

```text
VFC-00 3-human + Family Vex channel
VFC-01 5-human identity and witness truth
VFC-02 nonmember/binding substitution rejection
VFC-03 stale record/generation rejection
VFC-04 removal affects future audience without rewriting history
VFC-05 FROM_JOIN visibility floor
VFC-06 unsupported explicit release rejection
VFC-07 addressed recipient versus audience distinction
VFC-08 separate private-channel isolation
VFC-09 deterministic multi-human ordering
VFC-10 device/relationship/display substitution rejection
VFC-11 generic direct-channel compatibility and Family bypass closure
VFC-12 no protected or external effects
```

<!-- [VEX-FAMILY][VF-02A][CONVERSATION-CURRENTNESS][VXG RealForever] -->
