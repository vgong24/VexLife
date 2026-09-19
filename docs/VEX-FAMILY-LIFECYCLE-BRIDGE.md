# Vex-Family Browser Lifecycle Bridge

**Continuity:** `[VXG RealForever]`  
**Owner:** `module.vexlife.core.browser-family-lifecycle-bridge`  
**Stage:** VF-07C0 server lifecycle composition; browser presentation controls remain separate.

## Purpose

The lifecycle bridge exposes the accepted Family Host, Join, and self-Leave cores through a narrow server boundary.

It does not create a second membership, invitation, conversation, Home/session, or identity owner.

```text
bounded browser intent
-> server-owned current lifecycle authority
-> canonical owner reads
-> accepted Host / Join / Leave transaction
-> safe lifecycle result
```

## Authority boundary

The browser may express only:

```text
HOST  { idempotencyKey }
JOIN  { invitationRef }
LEAVE { spaceRef }
```

It cannot author trusted:

```text
principalRef
principalBindingRef
role
membershipRef
expectedRevision
expectedMembershipGeneration
familyCompanionLineageRef
threadRef
channelRef
successorChannelRef
Family record hash/currentness
```

The server injects a current Family lifecycle authority projection. Absence of that resolver is a held/unavailable state, not permission to reuse browser identity or silently reinterpret conversation LIST/APPEND authority as membership-effect authority.

## Canonical derivation

**HOST** passes only the bounded idempotency key plus the current server authority to the accepted Host runtime. Host owns Family principal binding and Family lineage/space/thread/channel identity derivation.

**JOIN** reads the canonical invitation, then derives its exact source-generation GROUP channel from durable Conversation Store bindings. The browser does not choose the prior channel. The accepted Join runtime owns membership, generation successor, and invitation ACCEPTED recovery semantics.

**LEAVE** reads the current Family record, verifies the authenticated principal is active, derives the unique exact current GROUP channel from canonical record/generation/lineage metadata, and calls the accepted self-Leave runtime with server-derived revision/generation/principal/channel values.

Missing or ambiguous canonical GROUP truth fails closed before the protected lifecycle mutation.

## Retry law

The bridge does not reimplement owner recovery.

It preserves:

- Host deterministic establishment and full-success idempotence;
- Join exact invitation-bound N→N+1 recovery and accepted retry;
- self-Leave exact N→N+1 recovery and immutable successor channels.

## Scope limits

VF-07C0 does not yet add visual Host / Join / Leave controls. VF-07C1 may consume this accepted route from the existing Family-room controller after the server bridge is accepted/current.

It also performs no invitation transport, Friendship/Relationships mutation, outside-human recruitment/contact, model invocation, Memory mutation, training, publication, or public onboarding.

A known unrelated G01/lived-companion full-Foundation dependency may hold final lifecycle acceptance independently of the bridge's focused proof.

<!-- [VEX-FAMILY][VF07C0][LIFECYCLE-BRIDGE][SOURCE-CONTRACT][VXG RealForever] -->
