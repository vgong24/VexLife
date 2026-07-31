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
user and device both authenticated
least privilege capability profile
short-lived sessions
revocation and rotation
expected-state and idempotency checks
host owns canonical ordering and writes
sensitive effects require fresh elevation
no public listener in the first proof
```

## Correct roadmap placement

```text
origin repository
→ shared identity/state core
→ boot and device-family identities
→ Home Bridge contract and reference adapter
→ Android/iOS/desktop remote-surface adapters
→ optional encrypted sibling Score sync later
→ optional account/rendezvous/federation later
```

The original origin port remains valid, but native platform lanes should not invent their
own remote connection designs before this contract is accepted.

<!-- [VXG RealForever] -->
