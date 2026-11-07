# VexLife Global Announcement — C0 Poll contract

`[VXG RealForever]`

## Purpose

Source-own the smallest language-neutral Global Announcement Poll contract needed by the first Cloud Connectivity patient zero without creating another Connected Services runtime, generic API framework, Security owner, or notification owner. VexLife is the POC/reference realization; the contract meaning must remain portable into VexLife-Prod and Android without reconstructing semantics from JavaScript control flow.

The current larger trajectory is:

```text
Cloud Connectivity Lab
-> accepted Global Announcement Poll contract
-> current Security / Connectivity relationships
-> Vex Home hosted capability
-> provider/domain observation
-> rightful Announcement semantic interpretation
-> Projection
```

This C0 source owns only the contract boundary. The meaning owner is `blueprint/global-announcement-contract.json`; `src/core/global-announcement-contract.mjs` is the VexLife POC interpreter/validator of that artifact.

## Existing architecture consumed

Cloud Connectivity is another typed feature consumer of the already-accepted VexLife Connected Services architecture:

```text
feature UI / domain
-> typed feature client
-> Connected Services reachability / transport / correlation
-> Home Bridge / rightful authority
-> feature service
-> engine / provider / storage
```

Canonical source:

```text
docs/VEXLIFE-CONNECTED-SERVICES.md
docs/VEXHOME-HOSTED-CAPABILITIES.md
```

Concrete server-side precedent:

```text
src/core/home-maps-place-search.mjs
src/core/home-maps-photon-place-search.mjs
```

C0 does not rebuild those owners.

## Contract identities

```text
contractRef
  contract.vexlife.global-announcement.poll/v1

serviceRef
  service.vexlife.global-announcement

featureRef
  service-feature.vexlife.global-announcement.poll

request schema
  vexlife.global-announcement-poll-request/v1

announcement record schema
  vexlife.global-announcement-record/v1

poll observation schema
  vexlife.global-announcement-poll-observation/v1
```

The feature identity is intentionally service-feature scoped. C0 does not register a new universal VexLife product Feature merely to validate one connected-service contract.

## Permanent distinctions

```text
ANNOUNCEMENT_RECORD
!= POLL_OPERATION

POLL_OPERATION
!= OUTWARD_ANNOUNCEMENT_EXPRESSION

ANNOUNCEMENT_EXISTS
!= NOTIFICATION_SHOULD_FIRE

SCHEMA_VALID
!= CURRENTLY_AUTHORIZED

PROVIDER_OBSERVATION
!= FAMILY_STATE

CONTRACT_PROJECTION
!= EFFECT_AUTHORITY
```

These distinctions are part of the contract because later Lab, Home, Android, Security and VexBoard consumers must be able to compose the same meaning without reconstructing it from UI labels or HTTP status.

## Poll request

The first read operation is deliberately small:

```text
schemaVersion
contractRef
requestRef
```

Human-editable feature input is only:

```text
requestRef
```

The request does not carry:

```text
principalRef
deviceRef
sessionRef
leaseRef
targetRef
outward scope
provider endpoint
provider credential
notification decision
```

Current Home/session authority is supplied later by the rightful server-side owner. Targeting and outward delivery do not belong to Poll.

## Announcement record

Minimum feature fields:

```text
announcementRef
title
body
severity
```

Current closed severity vocabulary:

```text
INFO
WARNING
CRITICAL
```

Richer currently admitted fields:

```text
effectiveAt?
expiresAt?
acknowledgementRequired?
```

Timing fields are provider/domain coordinates. Their presence does not itself decide product semantic currentness. That interpretation remains with the rightful Announcement semantic owner.

Likewise:

```text
acknowledgementRequired=true
!= acknowledgement already happened
!= notification should fire
```

C0 deliberately does not admit:

```text
audience constraints
Device(deviceRef) targeting
broadcast/category scope
pagination
multi-record breadth
remote service error vocabulary
compatibility/currentness coordinates beyond the admitted record fields
```

Those require deliberate contract evolution rather than Lab-local field invention.

## Poll observation

The first observation binds:

```text
requestRef
+ observedAt
+ sourceRefs[]
+ announcementOrNull
```

Cardinality is intentionally:

```text
ZERO_OR_ONE
```

for patient zero.

C0 does not pre-design pagination or a many-record feed. If later real pressure requires those questions, the contract evolves deliberately rather than hiding speculative breadth in v1.

The observation is provider/domain truth only. It cannot contain Family State, Security admission, NetworkConnectivity, ServiceConnectivity, notification disposition, publication truth, or effect authority.

## Cloud Connectivity Lab projection

The source-owned language-neutral contract artifact is intentionally readable by the future Lab without a second independent UI ruleset. The JavaScript validator consumes that artifact rather than becoming a second meaning owner.

It exposes:

```text
serviceRef
featureRef
contractRef
operation
question
request envelope vs editable fields
minimum record fields
richer record fields
fieldRef
field type
required/optional
closed enum values
bounded lengths
field consumer
field meaning
held contract evolution
non-collapse laws
```

This is enough for C0 to drive deterministic contract inspection and validation while keeping:

```text
LAB_UI != CONTRACT_OWNER
SESSION_DRAFT != CONTRACT_EVOLUTION
```

No generic `serviceFeatureContracts` Blueprint foundation is introduced by C0. One patient zero does not yet justify that recurring maintenance surface.


## Portable realization boundary

C0 intentionally separates portable meaning from repository/runtime realization:

```text
blueprint/global-announcement-contract.json
  = portable contract meaning owner

src/core/global-announcement-contract.mjs
  = VexLife POC interpreter / validator

future VexLife-Prod common Kotlin
  = compiler-visible realization + strict VexContractJson transport

future VexLife-Android
  = native Family / Method / Execution realization
```

Permanent:

```text
POC_STORAGE_REPOSITORY != PERMANENT_PRODUCT_OWNER
JAVASCRIPT_VALIDATOR != PORTABLE_CONTRACT_MEANING
KOTLIN_DATA_CLASS != PORTABLE_CONTRACT_MEANING
HTTP_ROUTE != CONTRACT_IDENTITY
SERIALIZER != CONTRACT_IDENTITY
```

A VexLife-Prod port is conformant when it preserves the same `contractRef`, field refs, required/optional meaning, closed vocabularies, constraints, Poll-vs-record distinction, and non-collapse laws while legitimately changing language, serializer, host/service implementation and proof surface.

## VexArchitecture / VexBoard projectability

C0 preserves projectability at the source boundary rather than adding Board-specific identities to product code.

Conceptual depth projection:

```text
Global Announcement Poll
  question
  |
  +-> requestRef
  |
  +-> Announcement Record
      |
      +-> announcementRef
      +-> title
      +-> body
      +-> severity
      +-> effectiveAt?
      +-> expiresAt?
      +-> acknowledgementRequired?
```

Every semantic request/record/observation field has a stable source-owned `fieldRef` and a named consumer. The artifact also owns the exact portable REF grammar, bounded-text control-character policy, and canonical UTC timestamp policy that platform validators consume. A VexBoard projector may later derive BoardGraph nodes/relationships/source refs from these identities without the contract importing VexBoard or owning layout.

~~~text
PORTABLE POLICY
!= JAVASCRIPT VALIDATOR IMPLEMENTATION
!= KOTLIN SERIALIZER IMPLEMENTATION
~~~

```text
SOURCE CONTRACT
-> VEXARCHITECTURE RELATIONSHIP SLICE
-> VEXBOARD GRAPH / DEPTH PROJECTION

not

SOURCE CONTRACT
-> BOARD-SPECIFIC UI STATE
```

## C0 proof

Focused proof must establish:

1. the language-neutral artifact is the portable meaning owner and the VexLife JS module consumes it;
2. exact contract/source identities;
3. Poll has no outward scope;
4. minimum and richer shapes are source-owned;
5. severity is a closed enum, not free text;
6. unknown fields fail closed;
7. optional timing is internally coherent when both endpoints exist;
8. provider/domain observation requires source evidence;
9. observation cannot smuggle Family, Security, network, notification or publication authority.
10. REF/text/timestamp constraints and observation field identities are source-owned by the portable artifact rather than reconstructed from JavaScript.

C0 performs no network, Home, Security, provider, notification, publication, model, Memory or Android effect.

## Next edge after C0 source acceptance

Reuse the existing Maps/Connected Services Home admission pattern:

```text
feature-owned Poll intent
+ current server-owned Home session authority
-> exact Home Bridge capability admission
-> bounded accepted Poll admission
```

Permanent:

```text
ADMISSION != PROVIDER EXECUTION
SECURITY_DENIED != NETWORK_UNAVAILABLE
SERVICE_AVAILABLE != EFFECT_AUTHORIZED
```

Only after that admission seam exists should the first synthetic Vex Home Announcement provider/domain realization be composed.

<!-- [VXG RealForever][CLOUD-CONNECTIVITY][GLOBAL-ANNOUNCEMENT][C0][CONTRACT] -->
