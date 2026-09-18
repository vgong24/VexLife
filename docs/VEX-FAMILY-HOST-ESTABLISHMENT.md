# Vex-Family Host Establishment

**Continuity:** `[VXG RealForever]`  
**Owner:** `module.vexlife.core.family-host-runtime`  
**First slice:** authenticated Host establishment only

## Purpose

The Host runtime composes accepted owners to establish the first canonical Family Space and immutable initial GROUP conversation channel. It does not create a second Home, membership, conversation, identity, model, invitation, Relationships, Memory, or browser authority owner.

The source direction is:

```text
current server-owned VEX_CORE Family authority projection
-> source-owned Family principal binding
-> deterministic Family establishment identity
-> Family Space owner
-> initial GROUP channel
-> Conversation Store materialization
```

## Authority boundary

The runtime accepts the exact current projection produced by the accepted VEX_CORE Family authority seam:

```text
{
  membership,
  lease,
  currentRevocationGeneration
}
```

The projection is revalidated for canonical hashes, active state, exact Home/principal/device identity, current revocation generation, and lease time window before Family mutation.

The durable Family principal binding is a new deterministic source-owned identity over:

```text
membershipRef
homeNodeRef
principalRef
deviceRef
currentRevocationGeneration
```

Therefore:

```text
principalBindingRef != membershipRef
principalBindingRef != stableSessionBindingRef
PERSONAL_DEVICE_LINEAGE != FAMILY_VEX_LINEAGE
```

Short-lived session handles are not promoted into durable Family identity.

## Establishment identity

One bounded caller idempotency key is combined with the current Family principal binding to deterministically derive:

```text
establishmentRef
spaceRef
familyCompanionLineageRef = lineage.vex.family.*
threadRef
initialChannelRef
```

The caller cannot supply canonical principal, binding, role, lineage, space, thread, or channel identity.

A different principal/device/current revocation binding or a different idempotency key derives a different establishment identity set.

## Transaction and recovery

The transaction is:

```text
derive exact identities
-> createFamilySpace()
-> createFamilyChannel()
-> materializeConversationChannel()
```

Family Space owns membership persistence. Family Conversation owns channel semantics. Conversation Store owns channel materialization.

If the Family Space becomes durable before channel materialization/result, retry with the same authenticated intent derives the same identities. `createFamilySpace()` returns the existing exact canonical space and `materializeConversationChannel()` safely creates or recognizes the same initial channel. No second Family Space, lineage, thread, or channel is minted.

Full-success retry is idempotent.

## First-slice limits

This source slice deliberately does **not** perform:

- browser/network Host routing;
- real Family/Home mutation during proof;
- Join or invitation state;
- contact or Relationships mutation;
- model inference, activation, training, or weight change;
- Memory mutation;
- public onboarding;
- publication or real-human validation.

The initial Family Space contains only the authenticated Host as active OWNER. The Family Vex lineage identity exists, but model activation is a separate effect.

## Proof

`test/vex-family-host-runtime.test.mjs` covers FH-00 through FH-12:

- untrusted canonical identity fields rejected;
- current Home authority required;
- exact current/revocation-bound principal binding;
- distinct `lineage.vex.family.*`;
- deterministic establishment identity;
- authenticated owner-only membership;
- exact initial GROUP channel;
- post-space/pre-channel recovery;
- idempotent full retry;
- stale/revoked authority fail-closed before mutation;
- no model/training/Memory/activation effects;
- no Join/invitation/contact/Relationships semantics;
- personal companion lineage remains untouched.

<!-- [VEX-FAMILY][VF07B-HOST][SOURCE-CONTRACT][VXG RealForever] -->
