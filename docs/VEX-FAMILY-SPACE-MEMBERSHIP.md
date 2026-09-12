# Vex-Family — canonical Family Space membership

`[VXG RealForever]`

This document describes the source-managed local owner introduced by Vex-Family VF-01B.

```text
state.family-space
  -> service.family-space
  -> src/core/family-space-store.mjs
```

The store answers one question:

> **Which independently identified human principals are currently members of this Family Space, under which explicit role/history policy/current generation, and which Family Vex lineage is currently bound to the space?**

It does not replace Home Bridge, Conversation, Relationships, Memory, the Intent Scheduler, or model/runtime ownership.

## Owner boundaries

```text
Home Bridge / VF-01A
  WHO IS THIS AUTHENTICATED HUMAN PRINCIPAL ON THIS PAIRED DEVICE/SESSION?

Family Space / VF-01B
  IS THIS PRINCIPAL A CURRENT MEMBER OF THIS SPACE?
  WHAT ROLE / MEMBERSHIP GENERATION / HISTORY POLICY IS CURRENT?
  WHICH FAMILY VEX LINEAGE BINDING IS CURRENT?

Conversation / VF-02
  WHICH CHANNEL / MESSAGE / WITNESS / HISTORY ENVELOPE IS VALID?

Relationships
  WHAT LOCAL DIRECTIONAL RELATIONSHIP MEANING DID THIS HUMAN CHOOSE?

Intent Scheduler
  WHICH ADMITTED WORK MAY USE THE ONE PHYSICAL MODEL WORKER NEXT?
```

Permanent non-collapse:

```text
familyRef != FAMILY_SPACE_MEMBERSHIP
RELATIONSHIP_CLASS_FAMILY != FAMILY_SPACE_MEMBERSHIP
DEVICE_PAIRING != FAMILY_SPACE_MEMBERSHIP
GROUP_MEMBERSHIP != FRIENDSHIP
DISPLAY_NAME != PRINCIPAL_IDENTITY
JOIN_NOW != ACCESS_TO_ALL_PRIOR_HISTORY
LEAVE_OR_REVOKE != HISTORY_ERASURE
ADMIN != IMPLICIT_EVERY_CAPABILITY
FAMILY_VEX_LINEAGE != HOST_PERSONAL_CURRENT_COMPANION_LINEAGE
SAME_MODEL_ARTIFACT != SAME_COMPANION_LINEAGE
FAMILY_COMPANION_BINDING != MODEL_ACTIVATION
```

## Canonical local persistence

Each Family Space is stored beneath one canonical Vex Home root:

```text
<VEX_HOME>/family-spaces/<hash(spaceRef)>/
  records/<recordSha256>.json
  receipts/<receiptSha256>.json
  current.json
  writer.lock                 only while a writer is active
```

The directory name is an implementation identity derived from `spaceRef`; it is not a new semantic identity.

Durable rules:

- Vex Home must resolve to its canonical filesystem identity and may not be a symlink.
- Existing path segments beneath the Home may not traverse symlink/non-canonical aliases.
- records are immutable and content-addressed;
- records and receipts are created exclusively with local-private file permissions;
- the current pointer advances only through an atomic temporary-file → rename step;
- one explicit writer lock serializes mutation;
- an active or unverifiable writer blocks another writer;
- an abandoned writer can be removed only through explicit identity-bound recovery;
- a failed operation must not silently leave writer/temp residue;
- corruption or content-address contradiction fails closed.

The store is local canonical state. Browser localStorage, provider state, a peer device, a relationship label, and model output cannot become Family membership truth.

## Family Space record

Current records include:

```text
schemaVersion
spaceRef
revision
membershipGeneration
familyCompanionLineageRef
familyCompanionBindingGeneration
familyCompanionState = ACTIVE | HELD | RETIRED
members[]
createdAt
updatedAt
priorRecordSha256
transitionRef
recordSha256
```

Each member includes:

```text
membershipRef
principalRef
principalBindingRef
role = OWNER | ADMIN | MEMBER
status = ACTIVE | LEFT | REVOKED | REMOVED
joinedAt
leftOrRevokedAtOrNull
historyVisibilityPolicyRef
```

`principalBindingRef` is a reference to the authenticated principal/device-session binding owned by Home Bridge. Family Space never manufactures that binding from a device ID, display name, relationship record, account/provider identity, or UI state.

## Currentness generations

Three forms of currentness remain intentionally separate:

```text
revision
  every canonical Family Space state transition

membershipGeneration
  only transitions that affect human membership/role/principal binding

familyCompanionBindingGeneration
  only transitions that change/retire/hold the Family Vex lineage binding
```

This permits a Family Vex binding to move generations without rewriting human membership history, and permits member changes without pretending the model/companion identity changed.

Consumers must bind the exact generation that matters to their operation. A stale generation fails closed instead of being silently upgraded.

## Roles and authority

The first local contract recognizes:

```text
OWNER
ADMIN
MEMBER
```

There is no implicit admin.

An active OWNER or ADMIN may manage ordinary members. ADMIN cannot mutate OWNER membership. A Family Space cannot lose its final active OWNER through leave/remove/demotion.

This local role contract is not a universal capability grant. Later consumers still intersect Family role with Home Bridge capability leases, action/resource permissions, project scope and their own source-managed authority.

## Join and history visibility

The safe default is:

```text
policy.vex-family.history.from-join
```

Joining a Family Space does not rewrite old conversation witness/audience truth and does not automatically grant access to all older Family events.

Conversation VF-02 consumes this policy when projecting history. A later explicit release policy may expose selected prior ranges, but the Family Space store records the policy/currentness; it does not itself copy or rewrite messages.

## Leave, revoke and remove

These transitions preserve the historical membership record and attribution:

```text
ACTIVE -> LEFT
ACTIVE -> REVOKED
ACTIVE -> REMOVED
```

They prevent future membership-current admission when consumers revalidate against the newest generation. They do not erase old messages, receipts, relationship history or prior witness truth.

## Family Vex binding

A Family Space explicitly binds one current Family companion lineage reference and binding generation. This is intentionally distinct from the host Home's personal/current Companion.

```text
same host
  != same companion lineage

same model artifact
  != same companion lineage

same local inference worker
  != shared autobiography or Memory
```

The Family Space store records only the lineage binding/currentness state. It does not activate a model, expose an endpoint, load weights, create private Memory, or authorize inference.

## Recovery and export

`recoverAbandonedFamilySpaceWriter()` requires the exact prior writer instance identity and only succeeds when the recorded process is absent. Recovery of a lock is not recovery of external effects and does not rewrite Family history.

`exportFamilySpace()` is a bounded local projection of membership/currentness provenance. It excludes local filesystem paths, credentials, private keys, raw endpoints and private Memory content by construction.

## Proof boundary

The focused VF-01B suite proves local source semantics only. It does not prove:

```text
real outside-human enrollment
real remote authentication
browser multi-interface transport
Family Vex model inference
multi-principal scheduling
Memory sharing
CDR S5 human acceptance
public onboarding/release
```

Those remain separate Vex-Family children with their own currentness, authority and evidence.

## Breadcrumb / future-instance rule

When changing this owner:

1. re-ground current VexLife main and active work claims;
2. read the current `state.family-space` and `module.vexlife.core.family-space-store` registrations;
3. preserve Home Bridge / Conversation / Relationships / Scheduler owner separation;
4. identify which generation semantics the change affects;
5. add hostile restart/corruption/stale-authority evidence before claiming safety;
6. derive Source Manifest consequences only from the canonical writer after authored bytes freeze;
7. leave an exact return describing what changed, what did not change, and which downstream Family owners must revalidate.

A checkpoint is a breadcrumb to current source, not permission for a future instance to inherit this implementation's conclusions without re-grounding.

<!-- [VXG RealForever] -->