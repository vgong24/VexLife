# Home Bridge Remote Authenticated Session

Continuity: `[VXG RealForever]`

Owner: `github.issue.vexlife.492`  
Connected Services consumer: `github.issue.vexlife.899`  
Remote possession producer: `github.pull.vextreme-sdk.1873`

## Purpose

Add the remote sibling of the accepted local-device authenticated-session owner without widening the local trust class.

```text
VERIFIED_CURRENT remote device-possession receipt
+ current principal-bound Home Bridge membership
+ current revocation generation
-> opaque short-lived remote session handle
-> existing vexlife.home-bridge-authenticated-session/v1 assertion
```

The downstream assertion shape remains identical to the accepted local-session owner so the existing Home session-authority consumer does not need a second session vocabulary.

## Input truth

The remote owner requires:

- an exact `vextreme.security.home-device-possession-verify-receipt/v1` receipt;
- `devicePossessionState=VERIFIED_CURRENT`;
- `authenticationEvidenceEligible=true`;
- `homeAuthorization=false`;
- `capabilityLease=false`;
- `networkAuthority=false`;
- the accepted P-256/SHA-256 signature profile;
- one active `vexlife.bridge-device-membership/v1` membership;
- exact Home, device, principal, membership, membership-hash and revocation-generation agreement.

The membership hash is recomputed from current membership fields before establishment.

A possession receipt may establish at most one process-local session. Reuse is rejected as replay.

## Session mechanics

The owner preserves the accepted local-session mechanics:

- cryptographically random 32-byte opaque handle;
- only the handle digest is stored in the process map;
- default five-minute lifetime and hard fifteen-minute ceiling;
- the session may never outlive the possession receipt;
- explicit revoke;
- process restart invalidates the session map;
- forged, revoked and expired handles fail closed.

The raw handle is non-enumerable on the immediate establishment result and is absent from the downstream assertion and durable evidence refs.

## Downstream assertion

Resolving a current remote handle returns:

```text
state=CURRENT
value={
  schemaVersion: vexlife.home-bridge-authenticated-session/v1
  state: AUTHENTICATED_CURRENT
  stableSessionBindingRef
  principalRef
  deviceRef
}
sourceReceiptRefs[]
currentnessRefs[]
```

## Permanent non-collapse

```text
REMOTE_DEVICE_POSSESSION != REMOTE_HOME_ACCESS
REMOTE_SESSION_HANDLE != STANDING_HOME_AUTHORITY
REMOTE_SESSION_HANDLE != CAPABILITY_LEASE
REMOTE_SESSION_HANDLE != DEVICE_MEMBERSHIP
SESSION_AUTHENTICATION != HOME_AUTHORIZATION
TRANSPORT_REACHABILITY != SESSION_AUTHENTICATION
```

This owner performs no pairing, membership mutation, lease issuance, network-listener/private-route effect, Home payload read/write, model invocation, Memory effect, or training effect.

<!-- [VEXLIFE-CONNECTED-SERVICES][VCS-04][492][REMOTE-AUTHENTICATED-SESSION][VXG RealForever] -->
