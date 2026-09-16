# Home Bridge Authenticated Session

`[VXG RealForever]`

## Purpose

This owner fills the one source gap between a **current local device authentication event** and the already-accepted Home Bridge session-authority consumer.

It owns only a short-lived, server/process-local authenticated session handle. It does not own Home access policy, capability leases, Home Bridge membership, Family membership, browser identity, or standing Home authority.

```text
current local-device authentication evidence
+ explicit human principal decision
-> opaque short-lived session handle
-> exact authenticated-session assertion
-> #490 session-authority consumer
```

## Identity boundary

The local product identity and the human principal remain distinct until the human/authorized owner explicitly binds them:

```text
personRef=person.local-user
        != implicit principal

explicit decision
        -> principalRef=person.victor-gong
```

The session owner never infers `principalRef` from a device ref, OS display name, Home path, browser input, Family membership, pairing history, approver identity, or a remembered prior session.

Two source-managed inputs are required.

### Current local-device authentication evidence

```text
schemaVersion=vexlife.home-bridge-local-device-authentication-evidence/v1
state=CURRENT_ACCEPTED
authenticationRef
authenticationClass=LOCAL_DEVICE_OPERATOR_CURRENT
personRef
deviceRef
homeRef
authenticatedAt
expiresAt
possessionState=CURRENT_DEVICE_POSSESSION_VERIFIED
sourceReceiptRefs[]
currentnessRefs[]
```

The evidence must match the Home/device/person identity the server used when forming the session owner and must still be within its accepted time window.

### Explicit principal decision

```text
schemaVersion=vexlife.home-bridge-principal-decision/v1
state=ACCEPTED
decisionRef
decisionClass=EXPLICIT_HUMAN_DECISION
personRef
principalRef
sourceReceiptRefs[]
```

The `personRef` must equal the authenticated local person. This is the only input that supplies the human principal.

## Opaque session handle

A successful establishment creates a cryptographically random 32-byte opaque session handle. The owner stores only its SHA-256 digest plus the bounded assertion/currentness metadata.

The raw handle is returned only to the immediate server caller that needs to present it later. It is deliberately absent from:

```text
authenticated-session assertion
sourceReceiptRefs
currentnessRefs
status projection
revocation projection
Home persistence
Source Manifest
logs / durable coordination
```

Production entropy is `node:crypto.randomBytes()`. Custom entropy/clock injection is rejected unless the owner is explicitly created in `testMode`.

The session lifetime is bounded by both:

```text
configured session ttl <= 15 minutes
authentication evidence expiry
```

whichever occurs first.

## Assertion consumed by #490

Resolving a current handle returns the exact envelope expected by the accepted session-authority adapter:

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

The assertion deliberately contains no credential/token/session handle, Home path, endpoint, membership object, lease, role, capability, or browser-authored authority.

## Revocation and expiry

The process owner supports explicit session revocation. Unknown, expired, or revoked handles fail closed. Session revocation does not revoke the device, mutate Home Bridge membership, or alter #717 revocation generation; those remain separate owners.

Process restart also destroys the in-memory session verifier map. A successor process must establish a new current session from fresh authentication evidence rather than silently restoring a bearer credential from disk.

## Permanent non-collapse

```text
SESSION_AUTHENTICATION != AUTHORIZATION
SESSION_AUTHENTICATION != CAPABILITY_LEASE
SESSION_AUTHENTICATION != HOME_BRIDGE_MEMBERSHIP
SESSION_AUTHENTICATION != FAMILY_MEMBERSHIP
SESSION_AUTHENTICATION != STANDING_HOME_AUTHORITY
PROCESS_SESSION_REVOKE != DEVICE_REVOKE
PERSON_REF != PRINCIPAL_REF_WITHOUT_EXPLICIT_DECISION
BROWSER_BODY != IDENTITY_AUTHORITY
OPAQUE_SESSION_HANDLE != DURABLE_IDENTITY
```

No pairing, Home payload, Memory, Relationships, network-listener/firewall/route, model, training, or publication effect is performed by this module.

## Lived continuation

After this source is accepted, a protected host transaction may:

1. re-ground current repository heads and dependency paths rather than requiring frozen global-main SHA equality;
2. produce current local-device authentication evidence from the real host/session owner boundary;
3. establish one short-lived session for `person.victor-gong`;
4. establish/read current #717 authorization/revocation/lease truth;
5. only then perform any still-required principal-bound Home Bridge enrollment/rebind;
6. prove the accepted #490 resolver and downstream VexCore/Family consumers.

Unrelated accepted-main movement must not stop that host transaction. Relevant dependency-path, semantic-contract, authority, or protected-state drift still fails closed.

<!-- [VEX-FAMILY][HOME-BRIDGE][AUTHENTICATED-SESSION][492][VXG RealForever] -->
