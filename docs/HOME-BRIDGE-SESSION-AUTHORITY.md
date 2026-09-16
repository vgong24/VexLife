# Home Bridge Session Authority

`[VXG RealForever]`

## Purpose

This adapter is the missing reference remote/session producer between the accepted Home Bridge principal-binding contract and runtime consumers such as VexCore and the Vex-Family same-origin server.

It does **not** authenticate a browser, pair a device, choose a human principal, issue a capability lease, mutate revocation state, or read private Home payloads. It consumes already-current owner evidence and emits a bounded authority tuple only when every identity/currentness edge agrees.

```text
authenticated current opaque session
-> exact stable session binding
-> accepted Home Bridge principal-bound device membership
-> accepted active Home Bridge capability lease
-> current revocation generation
-> accepted Home Bridge request admission
-> bounded current authority tuple
```

Permanent distinctions:

```text
SESSION_HANDLE != AUTHORITY
DEVICE_MEMBERSHIP != HUMAN_PRINCIPAL
AUTHENTICATION != AUTHORIZATION
AUTHORIZATION != PRINCIPAL_BINDING
APPROVER != PRINCIPAL
PAIRING_HISTORY != CURRENT_SESSION
BROWSER_BODY != TRUSTED_AUTHORITY
LOCALVEX_STORAGE != SECURITY_SEMANTIC_OWNER
HOME_BRIDGE_SESSION_ADAPTER != VEXCORE_RUNTIME_GATEWAY
```

## Server-owned inputs

`createHomeBridgeSessionAuthorityResolver()` is formed only with four server-owned owner resolvers:

```text
resolveAuthenticatedSession
resolveMembership
resolveLease
resolveCurrentRevocationGeneration
```

The request accepted by `resolve()` contains exactly one opaque `sessionRef`. Browser-authored `principalRef`, membership, lease, role, capability, revocation or Family-space authority fields are rejected rather than ignored.

The opaque session handle is never emitted in the durable result.

Each owner resolver must return one current envelope:

```text
state = CURRENT
value = one owner value
sourceReceiptRefs[] = non-empty
currentnessRefs[] = non-empty
```

Multiple candidates, missing values, stale state, missing source receipts or missing currentness references fail closed.

## Authenticated session assertion

The authenticated-session owner must resolve the opaque handle into the closed assertion:

```text
schemaVersion = vexlife.home-bridge-authenticated-session/v1
state = AUTHENTICATED_CURRENT
stableSessionBindingRef
principalRef
deviceRef
```

No bearer token, credential, password, cookie, private key, endpoint, Home path or browser-authored authority object is accepted in this assertion.

The assertion is deliberately not created by this module. A lived device/session that predates accepted VF-01A principal binding requires an owner-authorized principal rebind/enrollment effect; the adapter must never infer a human principal from historical pairing, display name, OS account, browser input, device possession or Family membership.

## Home Bridge membership and lease

The resolved membership must be the accepted:

```text
vexlife.bridge-device-membership/v1
```

and must be `ACTIVE`, principal-bound, device-bound and current.

The resolved lease must be the accepted:

```text
vexlife.bridge-capability-lease/v1
```

and must be `ACTIVE`, unexpired, bound to the same principal/device/Home node, and use the same current revocation generation as the membership and the current revocation owner.

The adapter then calls the existing `evaluateRemoteRequest()` Home Bridge owner with one internal registered action. This reuses accepted principal/device/lease/revocation admission rather than creating a second authorization model.

## Output

A successful resolution returns:

```text
schemaVersion = vexlife.home-bridge-session-authority/v1
state = CURRENT
authorityReceiptRef
stableSessionBindingRef
principalRef
deviceRef
membership
lease
currentRevocationGeneration
sourceReceiptRefs[]
currentnessRefs[]
effects = all false
```

`membership`, `lease`, and `currentRevocationGeneration` are intentionally shaped so the existing Vex-Family server resolver can consume its already-accepted trusted tuple without accepting browser authority.

VexCore remains the runtime/capability consumer and may bind this producer to its own current authenticated-session surface. Vex-Family remains a downstream product consumer. Neither downstream owner may invent principal identity.

## Fail-closed cases

The adapter denies resolution when any of these are true:

```text
missing/invalid opaque session handle
session owner not current
session not AUTHENTICATED_CURRENT
ambiguous session candidate
missing owner receipts/currentness
session principal/device != membership principal/device
membership not ACTIVE
lease not ACTIVE
lease expired
lease principal/device/Home != membership
membership or lease revocation generation != current generation
browser/session assertion contains untrusted extra authority fields
accepted Home Bridge evaluateRemoteRequest() denies admission
```

No fallback current user, default principal, historical pairing inference, synthetic production session, or browser-supplied authority is provided.

## Protected lived rebind boundary

This source contract does not prove the current Patient-0 device has a VF-01A-era principal-bound session record.

After source acceptance, the protected lived rebind/enrollment step may proceed only under the Root grant when fresh owner evidence resolves exactly:

```text
one principalRef
one current authenticated device/session
current Safety/Security authorization and revocation truth
one current Home Bridge binding target
no ambiguous human choice
```

If more than one principal candidate exists, the adapter remains fail-closed and the exact human choice remains outside source inference.

## Proof map

```text
HBSA-00 current authenticated session -> current tuple
HBSA-01 exact principal/device/membership/lease/revocation binding
HBSA-02 browser authority fields rejected
HBSA-03 principal/device mismatch rejected
HBSA-04 revocation mismatch rejected
HBSA-05 missing/expired lease rejected
HBSA-06 ambiguous/evidence-free owner result rejected
HBSA-07 credential/bearer smuggling rejected by closed assertion
HBSA-08 approver does not replace the bound principal
```

All source behavior is no-effect. Pairing, principal rebind, authentication, authorization, lease issuance, revocation mutation, Home payload access, network mutation, Memory, Relationships, model execution, training and publication remain separate owner effects.

<!-- [VEX-FAMILY][HOME-BRIDGE][SESSION-AUTHORITY][490][VXG RealForever] -->
