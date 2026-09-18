# Vex-Family membership runtime

`[VXG RealForever]`

## Purpose

VF-07B0 composes the accepted Home/Family/Conversation owners for the first effect-ready Human Experience transition without changing their canonical responsibilities.

This slice supports **self-Leave only**.

```text
AUTHENTICATED_CURRENT_PRINCIPAL
+ CURRENT_ACTIVE_FAMILY_MEMBER
+ CURRENT_GROUP_CHANNEL_GENERATION_N
-> SELF_LEAVE
-> FAMILY_GENERATION_N+1
-> NEW_IMMUTABLE_GROUP_CHANNEL_GENERATION_N+1
```

It does not implement Host or Join.

## Permanent owner split

```text
Home Bridge
  -> authenticated human principal/device authority

Family Space
  -> membership, role, revision, generation, FROM_JOIN policy

Family Conversation
  -> exact audience/currentness envelope

Conversation Store
  -> immutable channel/message materialization

Family Membership Runtime
  -> bounded cross-owner transition orchestration and history projection only
```

## Why a successor channel is required

A Family membership mutation advances `membershipGeneration`. The accepted Family Conversation validator therefore classifies the prior GROUP channel stale.

The Conversation Store also intentionally rejects changing canonical meaning under the same `channelRef`.

VF-07B0 preserves both laws by deriving a new immutable channel identity from:

```text
spaceRef
stable threadRef
new membershipGeneration
new Family recordSha256
Family companion lineage
```

Old channel and message bytes remain unchanged.

## Exact retry

The operation admits exactly two starting states:

1. generation N is still current — perform self-LEAVE once, then materialize the successor;
2. generation N+1 is current and is proven to be the exact LEAVE child of the supplied prior channel — do not replay membership mutation; finish/recover successor materialization only.

Any later generation or different transition fails stale.

## Historical projection

A current active member may read prior GROUP segments only when each segment is:

- the same Family `spaceRef`;
- the same stable `threadRef`;
- the same Family companion lineage;
- at or before the current membership generation;
- verified by the canonical Conversation Store.

Messages are never copied. Their original `channelRef`, `witnessRefs`, record snapshot and membership generation remain intact.

FROM_JOIN is enforced by the current member's `joinedAt` plus original message witnesses.

Private channels are never included.

## Held

```text
Host
Join
invitation/contact
Family lineage formation
principal-binding projection for new/owner membership
browser/server endpoint
real Family data during source proof
follow-through/reminders/calendar
public onboarding
real-human validation
Home/Memory/model/training/publication
```

## Browser successor

Only after this runtime is accepted may a browser/server self-Leave consumer be formed. The browser must not author principal, role, binding, generation authority, or successor channel identity.

<!-- [VEX-FAMILY][VF07B0][MEMBERSHIP-RUNTIME][VXG RealForever] -->
