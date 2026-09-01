# Android Remote Vessel — first reference slice

`[VXG RealForever]`

The Android Remote Vessel reference is a **read-only Security & Access projection** over the accepted Home Bridge contract. It does not create a second pairing, authentication, authorization, Home, transport, credential, or model owner.

## Canonical owners

- Home Bridge (`bridge.vexlife.personal-home.001`) owns remote-surface modes, pairing offers, device membership, capability leases, request admission and revocation.
- Security & Access (`feature.vexlife.security-access`) owns the calm human-facing Health projection.
- Android Remote Vessel owns only the bounded projection/adapter between those accepted owners.

## First-slice runtime truth

```text
mode=REMOTE_HOME
connectionState=UNPAIRED
canonicalWriter=DESKTOP_HOME_NODE
remoteWriterGranted=false
authenticationGranted=false
authorizationGranted=false
capabilityLeaseGranted=false
HomeAccess=false
rawModelEndpointExposed=false
```

The canonical Home Bridge vocabulary is reused exactly. The first slice may project only `UNPAIRED`, `HOME_UNREACHABLE`, `LEASE_EXPIRED`, or `REVOKED`. Pairing/lease/connected states remain held and are rejected by the projection until a separately admitted lived effect exists.

The browser reference mounts one status block inside the existing Security & Access preview. It introduces no route and no new action. The already-visible **Add Android phone** action remains disabled.

## Permanent non-collapse

```text
ANDROID_REMOTE_VESSEL != LOCAL_ANDROID_MODEL_RUNTIME
PAIRING != STANDING_HOME_AUTHORITY
AUTHENTICATED != AUTHORIZED
REACHABILITY != HOME_ACCESS
REMOTE_VESSEL != CANONICAL_HOME_WRITER
RAW_MODEL_ENDPOINT_REMAINS_PRIVATE
```

No network listener, pairing offer, device mutation, credential, Home read/write, Memory/Friend mutation, provider/model call, training, activation or publication is performed by this reference slice.

<!-- [VXG RealForever] -->
