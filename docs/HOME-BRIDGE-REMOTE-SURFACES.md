# VexLife Home Bridge — safe remote access to a desktop-hosted personal Vex

`[VXG RealForever]`

## Decision

The canonical personal Vex Home may live on a user-controlled desktop while Mac,
Android, iOS, Windows and browser clients connect as **remote surfaces**. This is a
different feature from copying or synchronizing the private Vex Home.

```text
remote bridge = operate the host's live state without copying it
sibling sync   = send reviewed, explicitly scoped records to a distinct local Vex
public account = optional discovery/community convenience, not private-home authority
```

## Recommended first deployment

```text
Windows desktop
  canonical Vex Home
  local model worker
  Home Bridge Gateway
  device registry and revocation

MacBook / Android
  VexLife remote surface
  device-bound key
  addressed conversation UI
  no raw private-home storage by default

Connectivity
  private encrypted overlay or LAN
  plus Home Bridge application authorization
```

For the first personal pilot, use an established private overlay rather than building
NAT traversal and an internet-facing identity service. The product must remain
transport-neutral so a user may later choose a self-managed WireGuard path.

## Why a VexLife account is not required initially

The desktop is the Home Authority. A trusted device is enrolled by a short-lived pairing
ceremony and receives a revocable device credential. The transport account, when one is
used, only helps devices find and reach one another.

```text
personRef != accountRef != deviceRef != homeRef != companionLineageRef
```

A future VexLife account may support passkey-authenticated rendezvous, public profile,
notifications and encrypted recovery assistance. It must not become the only key to the
private Home.

## Principal binding — who is actually speaking from a paired device

A paired device is not itself a human principal. Home Bridge therefore binds one explicit
`principalRef` into the device membership and carries that same principal through every
capability lease.

```text
PAIRED_DEVICE != AUTHENTICATED_HUMAN_SPEAKER
APPROVER != DEVICE_PRINCIPAL
DEVICE_REF != PERSON_REF
```

The pairing approval records both:

```text
principalRef
  the human principal whose device/session is being admitted

approvedBy
  the human/authority that approved the pairing ceremony
```

Those references may be the same for ordinary self-pairing, but the source contract does
not require them to be the same. A Family owner/admin may later approve another member's
device without becoming that member's speaker identity.

The resulting device membership and capability lease both bind the exact `principalRef`.
A remote request is admitted only when:

```text
request.deviceRef == membership.deviceRef == lease.deviceRef
request.speakerRef == membership.principalRef == lease.principalRef
current revocation generation still matches
lease is active and unexpired
requested action is registered
required capabilities survive the normal least-privilege intersection
```

A missing or different `speakerRef` fails closed as `PRINCIPAL_BINDING_MISMATCH` before
the requested action is admitted. The UI, display name, account/provider identity,
relationship label, Family role, or possession of another person's device reference may
not substitute for that binding.

Home Bridge still does **not** own household membership. Vex-Family's separate
`service.family-space` owner decides whether an authenticated principal is a current
member of a Family Space and what role/history policy is current. Later Family requests
must intersect both owners rather than teaching Home Bridge a second household ACL.

## Continuity modes

### Remote Home Surface

- same canonical Home Vex;
- model and continuity remain on the desktop;
- Mac/phone is a window and input surface;
- desktop must be reachable;
- no new companion lineage is created merely for the remote UI.

### Local Sibling

- model and Vex Home run on the device;
- creates a distinct companion lineage and local Rhythm;
- receives only reviewed Score/trail envelopes later;
- never claims it personally lived the host's episodes.

### Hybrid

The UI may offer both, but mode changes are explicit and visible. A network failure must
never silently replace Home Vex with a sibling model.

## Minimum security invariants

```text
raw model endpoint never exposed
Home Bridge is the only remote entry
human principal and device both authenticated/bound
request speaker must equal the leased principal
least privilege capability profile
short-lived sessions
revocation and rotation
expected-state and idempotency checks
host owns canonical ordering and writes
sensitive effects require fresh elevation
no public listener in the first proof
```

`approvedBy` is not an implicit delegation mechanism. If a future feature needs one
principal to act on behalf of another, delegation must be source-managed and attributed
separately; it cannot be inferred from pairing approval, Family admin status, device
possession, or UI state.

## Correct roadmap placement

```text
origin repository
→ shared identity/state core
→ boot and device-family identities
→ Home Bridge contract and explicit principal binding
→ reference remote adapter
→ Family Space membership / other policy consumers
→ Android/iOS/desktop remote-surface adapters
→ optional encrypted sibling Score sync later
→ optional account/rendezvous/federation later
```

The original origin port remains valid, but native platform lanes should not invent their
own remote connection designs before this contract is accepted.

## Proof and breadcrumb boundary

VF-01A source proof establishes only the principal/device/lease/request binding contract.
It does not prove real device enrollment, household membership, group-chat transport,
Family Vex inference, public networking, or CDR human participation.

For future instances:

```text
checkpoint/ref
  -> re-ground current Home Bridge source and registry
  -> confirm principalRef remains separately bound from approvedBy/deviceRef
  -> confirm downstream Family/Conversation consumers still intersect current authority
  -> re-run impersonation/revocation/least-privilege proof
  -> preserve changed assumptions and exact successor refs
```

The checkpoint is a breadcrumbable explanation of why this binding exists, not authority
to skip current source or copy its conclusions into a later generation unchanged.

<!-- [VXG RealForever] -->
