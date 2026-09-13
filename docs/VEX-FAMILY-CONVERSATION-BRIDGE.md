# Vex Family Conversation Bridge

`[VXG RealForever]`

The browser Family conversation bridge is the model-free same-origin composition boundary for authenticated human chat. It lets Family members append and read canonical Conversation Store messages while the model worker is busy, unavailable, or doing unrelated work.

```text
HUMAN_MESSAGE_DELIVERY != AI_ATTENTION
HUMAN_MESSAGE_APPEND != MODEL_WORKGRAPH_ADMISSION
MODEL_BUSY != FAMILY_CHAT_BLOCKED
```

## Owner composition

The bridge does not become a second authentication, membership, conversation, or persistence owner. It composes the accepted owners in this order:

```text
Home Bridge
  -> authenticate the paired device/lease and derive the trusted human principal

Family Space
  -> establish the exact current record, membership generation, ACTIVE member,
     principalBindingRef, joinedAt, and source-managed history policy

Family Conversation
  -> validate the exact channel audience/currentness, form the canonical message,
     and enforce FROM_JOIN participant visibility

Conversation Store
  -> append/read the immutable hash-linked event lineage and preserve exact retry identity
```

The first source phase does not register HTTP routes. `scripts/serve-browser.mjs` and its Source Manifest bucket remain a separately held server-tail stage.

## Caller authority membrane

For append, caller intent is limited to:

```text
spaceRef
channelRef
content
expectedMembershipGeneration
idempotencyKey
```

For read, caller intent is limited to:

```text
spaceRef
channelRef
expectedMembershipGeneration
```

For channel listing, caller intent is limited to:

```text
spaceRef
expectedMembershipGeneration
```

Caller-supplied identity or authority fields are rejected rather than ignored. In particular the bridge never trusts browser-authored `speakerRef`, `principalRef`, `principalBindingRef`, role/admin assertions, device credentials, Family membership truth, or model/provider authority.

The server-side caller supplies the current paired Home Bridge membership and lease. The bridge constructs the Home Bridge request using the membership's bound `principalRef`; it never obtains canonical speaker identity from browser intent.

## Currentness and visibility

Every operation requires the caller's `expectedMembershipGeneration` to equal the current Family Space generation. The authenticated principal must still be an `ACTIVE` Family member. Append/read then revalidate the exact Family channel binding against that current record.

The bridge additionally requires a channel audience containing at least two distinct human principals before consuming it. This keeps reconstructed PRIVATE or GROUP projections fail-closed at the adapter boundary even when the object was not formed by `createFamilyChannel()` in the same process.

History visibility is only the accepted source-managed policy:

```text
policy.vex-family.history.from-join
```

A later joiner therefore cannot receive durable events formed before their `joinedAt` boundary or events whose witness snapshot did not include them. No `EXPLICIT_RELEASE` behavior is invented here.

Private-channel discovery is also fail-closed: list results are derived only from server-supplied trusted channel objects for which the current authenticated principal passes Family Conversation admission. Unauthorized private channel refs are omitted rather than exposed as metadata.

## Append and retry semantics

The bridge derives human recipients from the trusted Family channel audience. The Family companion may remain a witness in the channel contract but is not required for human-to-human message delivery.

The message identity is deterministic over:

```text
spaceRef
channelRef
authenticated principalRef
idempotencyKey
```

Before allocating the next sequence, the bridge probes that exact message identity. A retry of the same canonical request returns the existing durable event. Reusing an idempotency key for different speaker/content/currentness/recipient meaning fails closed instead of creating a second event.

The bridge itself is stateless; restart behavior is inherited from the durable Family Space and Conversation Store owners.

## Response projection

Bridge responses expose only the bounded product projection needed by the authenticated member, such as:

```text
messageRef
spaceRef
threadRef
channelRef
speakerRef
recipientRefs
membershipGeneration
sequence
content
contentHash
createdAt
```

They do not expose device credentials, capability lease material, filesystem paths, raw Home paths, model endpoints, principal-binding references, writer locks, or another member's unauthorized private-channel metadata.

## Model-free boundary

`src/core/browser-family-conversation-bridge.mjs` imports no model/provider client and accepts no inference dependency. Its append/read/list path is entirely Home Bridge + Family Space + Family Conversation + Conversation Store composition.

Accordingly this first phase can be tested with synthetic Family members and paired-device contracts while preserving:

```text
production mock fallback=false
real participant identity claim=false
model/provider invocation=0
Home/Memory/Relationship/training/publication effect=0
```

Synthetic fixtures prove the adapter under the accepted contracts; they are not real multi-interface practicum acceptance.

## Focused proof map

```text
VFB-00 authenticated A appends as A without caller-authored speaker identity
VFB-01 B/C independently read A only while current membership/history allows
VFB-02 caller-forged speaker/admin/role authority fails closed
VFB-03 stale membership generation rejects append/read before store mutation
VFB-04 revoked/removed principal cannot append or receive a current projection
VFB-05 FROM_JOIN blocks pre-join durable history
VFB-06 private channel is neither readable nor listed for a room-only member
VFB-07 exact idempotent retry creates no duplicate event
VFB-08 three independently paired humans keep chatting while model state is irrelevant
VFB-09 model/provider invocation count remains zero by construction
VFB-10 restart preserves the same durable event identities
VFB-11 no Relationship/Memory/training/publication effect
VFB-12 response projection excludes credentials, endpoints, filesystem paths,
       principal-binding refs, and unauthorized private-channel metadata
```

## Held reconnection

Real server integration remains a separate obligation. Before that stage:

```text
bind current accepted owner modules and exact schemas
recheck scripts/serve-browser.mjs writer custody and its generated bucket
register only same-origin bounded routes
run real authenticated append/read/revocation/FROM_JOIN/idempotency checks
prove model/provider call count remains zero for human chat
rebind exact-head proof and fresh Assurance
```

No server-tail, Home, Memory, Relationship, model, training, activation, network, or public-release authority is created by this document.

<!-- [VF-02C][VEX-FAMILY][MODEL-FREE-CONVERSATION-BRIDGE][VXG RealForever] -->
