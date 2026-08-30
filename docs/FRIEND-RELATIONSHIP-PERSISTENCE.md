# Friend Relationship Persistence

`[VXG RealForever]`

Owner trajectory: `github.issue.vexlife.324` under `github.issue.vexlife.237`.

## Purpose

The Relationships surface already proves invite-only decisions, directional relationship meaning, delivery non-collapse, and the product-to-CDR runtime seam. This source layer owns the missing local durability boundary: one human's affirmative relationship choice can become one canonical local directional relationship that survives restart without making the peer, provider, route, session, delivery, or semantic acknowledgement state canonical relationship truth.

```text
stateRef=state.relationships
ownerRef=service.relationships
storageClass=VEX_HOME_LOCAL_CANONICAL_RELATIONSHIP_STORE
MemoryOwnership=false
providerOwnership=false
browserLocalStorageOwnership=false
networkOwnership=false
```

This first child is FFR-01/FFR-02 only. Browser UX wiring, real paired-host product execution, provider traffic, outside participants, Memory, Home layout, model runtime, publication, and public search remain held.

## Permanent non-collapse rules

```text
INVITATION_ACCEPTED != RELATIONSHIP_PERSISTED
A_CALLS_B_FRIEND != B_CALLS_A_FRIEND
GROUP_MEMBERSHIP != FRIENDSHIP
DELIVERY != SEMANTIC_ACKNOWLEDGEMENT
SEMANTIC_ACKNOWLEDGEMENT != RELATIONSHIP_PERSISTENCE
PROVIDER_STATE != CANONICAL_RELATIONSHIP_TRUTH
HUB_STATE != CANONICAL_FRIEND_GRAPH
DISPLAY_NAME != IDENTITY
RECONNECT != RELATIONSHIP_RECREATION
REVOCATION != HISTORY_ERASURE
WITHDRAWAL != HISTORY_REWRITE
SYNC != CENTRAL_FRIEND_GRAPH
UI_SUCCESS_REQUIRES_DURABLE_COMMIT_RECEIPT
RELOAD_RECOVERY_REQUIRES_SAME_RELATIONSHIP_REF
ROUTE_OR_SESSION_GENERATION_CHANGE != RELATIONSHIP_IDENTITY_CHANGE
PEER_OBSERVATION_MAY_UPDATE_CURRENTNESS_BUT_NOT_LOCAL_RELATIONSHIP_CLASS
CORRUPTION_OR_PARTIAL_WRITE => FAIL_CLOSED_AND_RECOVER_ONLY_RIGHTFUL_OWNER_STATE
```

## Relationship identity

`relationshipRef` is directional and derives only from:

```text
LOCAL_TO_COUNTERPART
localParticipantRef
counterpartParticipantRef
```

It deliberately excludes:

```text
localStateRootRef
counterpartCurrentKeyRef
invitation currentness
routeRef
sessionGeneration
deliveryObservationRef
status
revision
```

The local state root still isolates the physical owner store. A route/session/currentness change therefore cannot silently manufacture a new relationship identity, while a different local state-root binding cannot read or mutate another owner's store.

## Store layout

The store lives beneath the already-canonical Vex Home root:

```text
relationships/
  <ownerFingerprint>/
    writer.lock
    transitions/<transitionSha256>.json
    records/<recordSha256>.json
    receipts/<receiptSha256>.json
    heads/<relationshipRef>.json
```

`ownerFingerprint` binds the exact local participant and local state-root reference. All accepted persisted payload is closed-schema, content-safe reference/state metadata. No raw endpoint/IP/port, provider credential or secret, password/private key, transcript, private Memory content, precise location/home-network topology, undisclosed counterpart relationship label, inferred reciprocal friendship, or semantic acknowledgement may enter the store.

## Commit sequence

Every mutation is serialized under one owner writer lease:

```text
1. acquire exact local owner writer lease
2. validate current canonical head/record/transition chain
3. form immutable content-addressed transition
4. fsync exclusive transition record
5. form immutable content-addressed relationship record
6. fsync exclusive relationship record
7. form candidate current head
8. fsync temporary head and atomically rename it into place
9. only after the head commit, form and fsync the durable commit receipt
10. release the exact writer lease
```

A caller must not show `Saved` merely because steps 3-8 occurred. Product success is earned only from the durable receipt in step 9. If a process fails after the head rename but before the receipt, restart can verify the committed relationship and an exact create retry can form an idempotent receipt without rewriting relationship meaning.

A failure before the head rename can leave immutable addressed artifacts, but those artifacts are not current and cannot advance the relationship without a valid canonical head.

## Current record

The canonical record is one local directional claim. It contains bounded identity/currentness references and transition lineage, including:

```text
relationshipRef
localParticipantRef
localStateRootRef
counterpartParticipantRef
counterpartCurrentKeyRef
localRelationshipClass = FRIEND | FAMILY | COLLABORATOR | OTHER
invitationRef
invitationCurrentnessRef
status = ACTIVE | BLOCKED | REVOKED | WITHDRAWN | DISCONNECTED
createdAt / updatedAt
revision
priorRecordSha256
transitionRef / transitionSha256
recoveryOrTombstoneRef
lastAcceptedPeerCurrentnessRef
routeRef
sessionGeneration
deliveryObservationRef
tombstoned
```

Every record mechanically preserves:

```text
localDirectionalOnly=true
counterpartClaimIndependent=true
semanticAcknowledged=false
reciprocalFriendshipAsserted=false
```

## Transitions

The first store admits exactly:

```text
CREATE
BLOCK
REVOKE
WITHDRAW
DISCONNECT
RECONNECT
UPDATE_CURRENTNESS
TOMBSTONE
```

Transitions are append-only, hash-addressed, revision-bound, and action/status validated independently of their hashes. Recomputing a hash around contradictory semantics does not make the transition valid.

`UPDATE_CURRENTNESS` may update bounded peer/current-route/session/delivery references but cannot modify the human's local relationship class. `DISCONNECT` and `RECONNECT` preserve relationship identity. `BLOCK`, `REVOKE`, and `WITHDRAW` create attributable local status transitions; downstream transport rejection is a later composition responsibility, not manufactured here.

## Writer recovery

An active or unverifiable `writer.lock` blocks mutation. A lease whose process is definitely absent is not silently stolen: it returns `RELATIONSHIP_WRITER_RECOVERY_REQUIRED` until an explicit recovery call supplies the exact abandoned instance identity for the same local participant/state-root owner. Corrupt or mismatched leases fail closed.

## Restart and corruption

Read/restart descent begins from the canonical owner-specific head and verifies:

```text
head content hash and closed schema
head owner identity
addressed record hash and closed schema
record/head revision and hash binding
addressed transition hash and closed schema
transition action/status chronology
transition/record identity and revision binding
non-collapse booleans
```

A wrong state root resolves a different owner store. A corrupt or recomputed-but-semantically-invalid durable object fails closed.

## Export and delete/tombstone boundary

`exportRelationship()` is bounded by an explicit transition-count budget and returns only content-safe relationship identity/status plus reduced transition chronology. It does not export raw endpoint/provider/Memory content.

FFR-01/FFR-02 implements **tombstone**, not physical purge. `TOMBSTONE` preserves relationship identity and attributable transition history while preventing later mutation. A future FFR-03 delete UX must not claim byte erasure until a separately source-placed purge/recovery contract proves exactly what is erased, what attribution must remain, and how recovery behaves.

Therefore:

```text
TOMBSTONED != PHYSICALLY_PURGED
DELETE_UI != ERASURE_PROOF
```

## First-child proof family

The focused suite proves FRS-00 through FRS-17, including canonical Home and symlink rejection, self-reference rejection, stable relationship identity, atomic/create receipt semantics, idempotent retry, stale revisions, restart, disconnect/reconnect, blocked/revoked/withdrawn transitions, pre-head failure, corrupt head, writer conflict/recovery, state-root isolation, forbidden fields, raw-IP-shaped ref rejection, strict fault controls, bounded export, tombstone history, and recomputed-hash action/status contradiction rejection.

FRS-18 is repository/lifecycle evidence: the authored candidate must pass the exact current source gate and canonical Source Manifest v3 closure. Generated manifest paths are never guessed or pre-owned.

## Convergence after this child

```text
FFR-03  wire Relationships UX to prepare/commit/read/list/transition/export/recover/delete truth
FFR-04  bind invitation/CDR observations without central relationship truth
FFR-05  close/reload/restart and two isolated profiles prove same relationshipRef/rightful owner
FFR-06  real Mac↔Windows complete product walk; independently consume both RETURNS
FFR-07  Human Experience + Independent Assurance + Lifecycle + Formal + READY + merge + Main Integrity
FFR-08  return completed Friend prerequisite to CDR S5 before outside-human/provider widening
```

No later stage may weaken the non-collapse rules above merely to make the path easier to demo.

<!-- [VXG RealForever] -->
