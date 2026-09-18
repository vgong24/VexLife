# Vex-Family Invitation / Consent Store

**Continuity:** `[VXG RealForever]`  
**Owner:** `module.vexlife.core.family-invitation-store`  
**Stage:** first Join owner — invitation persistence only

## Why this owner exists

Family Space already owns manager-authorized membership mutation. That does not give an inviter permission to invent the joining human's identity, binding, or consent.

Therefore:

```text
ADMIN_CAN_ISSUE_INVITE
!=
ADMIN_CAN_IMPERSONATE_INVITEE

FRIENDSHIP
!=
FAMILY_MEMBERSHIP

INVITATION_DELIVERED
!=
CONSENTED_JOIN
```

No accepted VexLife owner previously persisted Family invitation/consent state. This module fills only that missing canonical storage role.

## First-slice authority

Issuance consumes the current canonical Family Space record and requires the supplied inviter principal to resolve to one current active `OWNER` or `ADMIN` at the exact expected Family record hash, revision, and membership generation.

The caller cannot provide target principal identity, target principal binding, privileged offered role, acceptance state, Family membership identity, or successor channel identity.

The first slice always offers:

```text
role=MEMBER
historyVisibilityPolicyRef=policy.vex-family.history.from-join
```

## Deterministic invitation identity

One bounded idempotency key is combined with exact source-owned Family identity:

```text
spaceRef
inviterMembershipRef
expectedFamilyRecordSha256
expectedMembershipGeneration
idempotencyKey
```

to derive one `invitation.vex-family.*` identity.

Exact retry returns the same record. Reusing the same identity with conflicting canonical issue semantics fails closed.

## Durable state

The schema admits:

```text
PENDING
ACCEPTED
DECLINED
REVOKED
EXPIRED
```

This first owner exposes only issue PENDING, read/export, manager-authorized REVOKED, time-driven EXPIRED, and explicit abandoned-writer recovery.

`ACCEPTED` and `DECLINED` are intentionally reserved for a later Join orchestration owner. That owner must consume the invitee's own authenticated Home/VEX_CORE authority and prove cross-writer recovery before it may finalize consent state.

A browser or generic caller cannot transition an invitation into accepted membership merely by naming a state.

## Expiry

A PENDING invitation observed at or after `expiresAt` is projected as:

```text
state=EXPIRY_COMMIT_REQUIRED
effectiveState=EXPIRED
```

until the canonical expiry transition is committed.

This prevents a stale PENDING record from being treated as a valid Join grant while preserving explicit durable state history.

## Persistence and recovery

Invitation state uses canonical Vex Home paths, one invitation-scoped writer lease, content-addressed immutable record versions, one atomic current head, durable commit receipts, and exact abandoned-writer recovery.

A result loss after head rename does not justify replaying a second invitation. Exact retry resolves the durable head and returns the same current invitation.

## Separation from later Join orchestration

This module does **not** call `addFamilyMember()`, create successor Family channels, authenticate invitees, deliver invitations over a network, create Friendship, or invoke the model.

Later Join orchestration must compose:

```text
current invitation owner
+ current Family manager/currentness
+ invitee's own authenticated Home/VEX_CORE authority
+ Family Space
+ Family Conversation
+ Conversation Store
```

and prove the recoverable order between invitation-state writes and Family membership/conversation writes before real consented Join can exist.

## Proof

`test/vex-family-invitation-store.test.mjs` covers FIS-00 through FIS-15: manager-only targetless MEMBER issuance; caller identity/binding/role/state rejection; deterministic retry/conflict behavior; expiry; current manager/current Family record enforcement; terminal non-reactivation; post-head result-loss recovery; durable exact issue recovery after an unrelated later Family generation; stale Family currentness rejection; safe export; ACCEPTED/DECLINED reservation; no Family membership/conversation/Relationships/model/Memory/publication effect; exact N→N+1 revoke/expiry retry recovery; and early-expiry fail-closed behavior.

<!-- [VEX-FAMILY][VF07B-JOIN][INVITATION-STORE][SOURCE-CONTRACT][VXG RealForever] -->


## Accepted-result finalization and full Join orchestration

The invitation store remains the canonical invitation/consent state owner. A Join runtime does not write invitation files directly. It composes accepted owners and may request `ACCEPTED` finalization only after canonical Family truth already proves the exact result.

```text
current PENDING invitation
+ exact invitation-source Family generation
+ invitee's own current VEX_CORE/Home authority
+ exact prior GROUP channel
-> derive invitee principal-binding.vex.family.* via accepted Host identity owner
-> addFamilyMember() in Family Space
-> derive/materialize exact immutable N+1 GROUP successor channel
-> invitation store independently reads back exact Family + channel truth
-> commit invitation ACCEPTED
```

The accepted invitation record is schema `vexlife.family-invitation/v2` and binds accepted principal/binding/membership, accepted Family record/revision/generation, accepted channel and acceptedAt. Those fields are null outside ACCEPTED. Legacy v1 records remain readable and terminal transitions remain supported.

### Cross-writer recovery law

A PENDING invitation authorizes a new add only while the exact invitation-source Family record/revision/generation remains current and the invitation is unexpired.

After a durable member add, retry may recover only the exact N→N+1 result whose priorRecordSha256, revision, membershipGeneration, add transition, principal, binding, MEMBER role and FROM_JOIN policy all match the invitation and invitee. An unrelated later Family generation is never consumed as recovery.

If the exact member add happened before `expiresAt` but the process died before channel/finalization, a later retry may finish that exact transaction even after wall-clock expiry. The canonical member `joinedAt` proves the membership effect occurred before expiry. An untouched expired PENDING invitation cannot start a new membership mutation.

After ACCEPTED is durable, exact retry by the same authenticated principal returns the accepted result without replaying membership, channel or invitation writers.

```text
INVITATION_PERSISTENCE_OWNER != JOIN_ORCHESTRATOR
INVITATION_ACCEPTED != INVITATION_DELIVERED
FRIENDSHIP != FAMILY_MEMBERSHIP
ADMIN_INVITE_AUTHORITY != INVITEE_IDENTITY_AUTHORITY
BROWSER_INPUT != PRINCIPAL_BINDING_AUTHORITY
```

The first Join runtime still performs no browser/network invite transport, Relationships/Friendship mutation, model invocation, Memory mutation, training, publication, outside-human recruitment, public onboarding or real-human validation.
