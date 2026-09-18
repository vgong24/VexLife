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

`test/vex-family-invitation-store.test.mjs` covers FIS-00 through FIS-14: manager-only targetless MEMBER issuance; caller identity/binding/role/state rejection; deterministic retry/conflict behavior; expiry; current manager/current Family record enforcement; terminal non-reactivation; post-head result-loss recovery; stale Family currentness rejection; safe export; ACCEPTED/DECLINED reservation; no Family membership/conversation/Relationships/model/Memory/publication effect; exact N→N+1 revoke/expiry retry recovery; and early-expiry fail-closed behavior.

<!-- [VEX-FAMILY][VF07B-JOIN][INVITATION-STORE][SOURCE-CONTRACT][VXG RealForever] -->
