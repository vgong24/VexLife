# Vex Family Security Perception

`[VXG RealForever]`

## Purpose

VFS-01 gives a Family Vex one deterministic, effect-free awareness projection over security-relevant truth already owned elsewhere. It does not create a second security system, Perception Broker, Safety owner, Distribution Trust owner, Family membership owner, incident owner, or runtime-effect owner.

```text
AUTHORITATIVE_SECURITY_AND_FAMILY_SOURCES
  -> effect-free Family security composition
  -> bounded Companion-awareness projection
  -> Vex explanation / question / refusal / proposal
  -> separately authorized owner validates any real effect
```

Permanent law:

```text
VEX_PERCEIVES_SECURITY
!= VEX_CERTIFIES_SECURITY
!= VEX_ENFORCES_SECURITY
!= VEX_REWRITES_SECURITY_EVIDENCE

ROLE_CAN_PERCEIVE != ROLE_CAN_ACT
UNKNOWN != CLEAR
DEGRADED_TELEMETRY != SAFE
```

The projection deliberately has no Family-authored universal `securityState`, `overallSafe`, or attacker verdict.

## Owner-preserving inputs

VFS-01 consumes five typed dimensions.

### Family audience/current context

One CURRENT source-bound Family channel context supplies only bounded refs:

```text
spaceRef
channelRef
membershipGeneration
membershipSnapshotRef
historyVisibilityPolicyRef
requestingPrincipalRef
audiencePrincipalRefs[]
familyCompanionLineageRef
sourceRefs[]
```

The only admitted historical visibility policy is:

```text
policy.vex-family.history.from-join
```

The requesting principal must be in the exact current audience. The projection does not expose `principalBindingRef`, writer locks, raw Home material, filesystem paths, private Memory, or another member's private metadata.

### VEX_CORE session/security/Safety authority

The accepted `vextreme.vex-core.home-session-authority/v1` record is consumed as a CURRENT, all-false source record. VFS-01 verifies principal/device/Home/revocation coherence across its Home-Bridge membership and lease, then emits only safe opaque identity/evidence refs.

The raw membership and lease are **not** re-emitted because accepted membership records contain fields such as `devicePublicKey` that a Family awareness projection does not need.

This is intentionally separate from `src/core/vex-core-family-session-authority.mjs`. That existing resolver is the least-disclosure conversation authorization consumer and correctly reduces the full VEX_CORE projection to only:

```text
membership
lease
currentRevocationGeneration
```

VFS-01 does not widen that resolver.

### Perception evidence

Perception remains owned by `github.issue.vextreme-sdk.243`. VFS-01 accepts only a bounded foreign-owner evidence envelope carrying source projection identity, currentness, source receipts/refs, typed gap entries, withheld refs, known limitations and explicit zero-effect truth.

Accepted semantics preserved from the current Perception Broker / RACING-SENSORIUM precedent include:

```text
currentness = CURRENT | STALE | UNKNOWN
gapState = AVAILABLE | MISSING | WITHHELD | UNKNOWN
```

No raw observation payload is required or projected. RACING-SENSORIUM-00 is precedent, not a permanent Family producer binding.

At current source, a generic desktop/Family Perception Broker product projection is not yet accepted. Therefore VFS-01 permits this optional dimension to be absent and reports an explicit coverage gap instead of manufacturing a `SAFE` result. Real VFS-02 integration must re-ground the then-current Perception owner/adapter.

### VHEAL health/observer evidence

VFS-01 may consume the accepted VHEAL projection from:

```text
github.issue.vextreme-sdk.775
github.issue.vextreme-sdk.776
lib/continuity-operations/companion-self-diagnosis-safe-repair.js
```

It preserves only bounded health/observer truth such as:

```text
RECOVERED | DEGRADED | UNKNOWN | QUARANTINED
sourceHealth
observerHealth
currentness
independentObserverSatisfied
independentlyVerified
userActionOrNull
```

VHEAL explicitly is **not** the Security attack owner. Current accepted VHEAL source carries:

```text
attackEstablished=false
attackDeterminationOwnerRef=github.issue.vextreme-sdk.232
```

Therefore:

```text
VHEAL_QUARANTINED != SECURITY_INCIDENT_PROVEN
HEALTH_ANOMALY != ATTACK
RECOVERED != ABSOLUTE_SAFETY
DIAGNOSIS != EFFECT_AUTHORITY
```

### Distribution Trust evidence

Distribution/build/model-profile trust remains owned by `github.issue.vextreme-sdk.244`. VFS-01 consumes accepted release and optional model-profile-resolution truth without turning it into whole-system security truth.

Native release classes remain native:

```text
UNSIGNED_RELEASE_CANDIDATE
OFFICIAL_VERIFIED_BUILD
UNKNOWN_OR_UNVERIFIED_BUILD
```

Native model-profile memory/effect restrictions remain native. In particular:

```text
OFFICIAL_VERIFIED_BUILD != COMPUTER_SAFE
CERTIFIED_MODEL_PROFILE != EFFECT_AUTHORITY
MODEL_PROFILE_IDENTITY != PRIVATE_MEMORY_AUTHORITY
UNKNOWN_OR_UNVERIFIED_BUILD != COMPROMISE_PROVEN
```

## Incident / attack coverage

Security & Resilience #232 and Breach Forensics #242 own incident/attribution architecture. Current accepted SDK source does not yet contain the proposed generic breach-forensics implementation. VFS-01 therefore always exposes this first-slice coverage limitation explicitly:

```text
incidentCoverage.state=MISSING_OWNER_PROJECTION
attackEstablished=false
ownerRef=github.issue.vextreme-sdk.232
architectureRef=github.issue.vextreme-sdk.242
```

VFS-01 never derives `SUSPICIOUS_ACTIVITY`, `INCIDENT_SUSPECTED`, attacker identity, containment truth, or recovery truth from VHEAL, Perception, or Distribution evidence alone.

## Projection output

`projectFamilySecurityAwareness()` returns one content-addressed immutable projection:

```text
schemaVersion=vexlife.family-security-awareness-projection/v1
truthClass=SOURCE_BOUND_EFFECT_FREE_FAMILY_SECURITY_AWARENESS

familySecurityProjectionRef
semanticFingerprint

familyContext
sessionSecurity
perception
health
distribution
incidentCoverage

sourceOwnerRefs[]
sourceRefs[]
sourceReceiptRefs[]
currentnessRefs[]
missingRefs[]
unknownRefs[]
withheldRefs[]
telemetryGapRefs[]
knownLimitationRefs[]
permittedCompanionResponseRefs[]

authority.roleCanPerceive=true
authority.roleCanAct=false
authority.effectAuthorityGranted=false
authority.selfCertificationAllowed=false
authority.attackAttributionAllowed=false

effectAuthorityRefs=[]
effects=ALL_FALSE
```

All ref sets are deterministic, duplicate-free and canonicalized. Missing optional dimensions remain typed missing/unknown coverage rather than false PASS.

## Companion response boundary

Communication-only response classes are bounded to:

```text
EXPLAIN_SCOPED_STATUS
ACKNOWLEDGE_UNKNOWN
ASK_FOR_CONFIRMATION
DECLINE_UNAUTHORIZED_DISCLOSURE
DECLINE_UNAUTHORIZED_EFFECT
```

The projection may additionally suggest, never execute:

```text
PROPOSE_PAUSE
PROPOSE_DIAGNOSTIC
PROPOSE_BROKERED_RECOVERY
```

It can never emit authority equivalent to:

```text
SELF_CERTIFY_SAFE
IDENTIFY_ATTACKER_WITHOUT_EVIDENCE
SILENTLY_GRANT_PERMISSION
SILENTLY_OPEN_SENSOR
MUTATE_MEMBERSHIP_OR_AUDIENCE
CONTAIN_OR_KILL_PROCESS
REWRITE_OR_DELETE_SECURITY_EVIDENCE
READ_PRIVATE_MEMORY
SIGN_OR_PUBLISH
```

## Zero-effect boundary

The projection sets all of these effects false by construction:

```text
filesystem
network
process
sensor
model
Home
Memory
membership
session
incidentContainment
securityObserverMutation
training
publication
```

Input owner records that claim an effect where this slice requires no-effect truth fail closed.

## Proof map

The focused suite `test/vex-family-security-projection.test.mjs` covers VFS01-00 through VFS01-22:

```text
00 deterministic replay / content address
01 current owner evidence + all-false output
02 stale/malformed VEX_CORE rejection
03 Family/VEX_CORE principal mismatch
04 Home/device/revocation mismatch
05 effect-authority inflation rejection
06 FROM_JOIN preservation
07 exact Family audience admission
08 CURRENT/AVAILABLE Perception preservation
09 stale/unknown Perception preservation without safe/clear collapse
10 withheld/gap preservation without raw payload
11 VHEAL quarantine without attack/containment promotion
12 UNKNOWN/DEGRADED/RECOVERED non-collapse
13 unknown/unverified distribution behavior
14 official-build scope preservation
15 model-profile private-Memory/effect restriction
16 hostile authority/effect-field rejection
17 secret/raw membership/lease exclusion
18 absent optional dimensions -> explicit gaps
19 session currentness cannot imply other dimensions current
20 closed proposal-only Companion response vocabulary
21 canonical deterministic ref sets
22 zero protected effects by construction
```

## VFS-02 trusted Companion awareness bridge

VFS-02 connects the accepted VFS-01 projection to the existing trusted Family prompt-materialization boundary without creating a second security producer, second context selector, browser-authored security frame, or effect path.

```text
FamilyCompanionRuntime
  -> source-managed familySecurityAwarenessFor(...)
  -> materializeFamilyPromptContext(...)
     -> validate exact VFS-01 schema / fingerprint / Family frontier binding
     -> serialize awareness only inside the trusted source-managed system frame
     -> include awareness bytes in provider token accounting
     -> bind projection ref / fingerprint into the materialization receipt
  -> requestLivedCompanionInference(...)
     -> PRE_PROVIDER Family source replay
     -> PRE_PROVIDER security-awareness producer replay
     -> exact projection identity + exact provider bytes must remain unchanged
     -> only then HTTP
```

The adapter is optional at the core runtime boundary so accepted pre-VFS-02 Family behavior remains unchanged when no source-managed security producer is connected. A caller/browser/model cannot supply the projection, system frame, or receipt through the Family request.

Permanent VFS-02 law:

```text
ContextLease ref != model-visible security awareness
caller-authored security message != trusted security awareness
security awareness != security authority
security awareness != incident verdict
security awareness != effect authority
MISSING / UNKNOWN != SAFE
ROLE_CAN_PERCEIVE != ROLE_CAN_ACT
```

The trusted materializer accepts only one content-addressed `vexlife.family-security-awareness-projection/v1` value whose Family identity matches the exact current frontier and whose authority remains:

```text
roleCanPerceive=true
roleCanAct=false
effectAuthorityGranted=false
selfCertificationAllowed=false
attackAttributionAllowed=false
effectAuthorityRefs=[]
effects=ALL_FALSE
```

Raw Home-Bridge membership/lease objects and `devicePublicKey` are rejected from the provider-visible awareness frame. Opaque source/evidence refs emitted by VFS-01 remain allowed.

The materialization receipt and Family delivery/recovery receipts preserve the exact security projection ref/fingerprint. A durable response recovery reuses the checkpoint-bound provider-verified receipt and does not replay model inference or re-author security truth.

VFS-02 focused proof is source-placed inside the existing Family prompt/runtime suites:

```text
VFS02-00 runtime obtains awareness only from the source-managed in-process producer
VFS02-01 trusted materialization makes scoped awareness provider-visible
VFS02-02 caller-authored security/system messages and cloned capabilities remain rejected before HTTP
VFS02-03 exact projection ref/fingerprint is bound into materialization/provider evidence
VFS02-04 PRE_PROVIDER security projection drift rejects before HTTP
VFS02-05 missing producer/incident dimensions remain typed missing/unknown, never SAFE
VFS02-06 raw membership/lease/devicePublicKey/private authority material is absent from provider bytes
VFS02-07 roleCanAct=false, effectAuthorityRefs=[], effects=ALL_FALSE end-to-end
VFS02-08 provider token budget includes security-awareness serialization overhead
VFS02-09 delivery/recovery preserves the exact security binding without model replay or authority inflation
VFS02-10 existing Family/direct Companion regression behavior remains required
```
## Staging boundary

```text
VFS01_SYNTHETIC_EFFECT_FREE_PASS
!= VFS02_REAL_COMPANION_AWARENESS_PASS

VFS02_PASS
!= VFS03_HUMAN_EXPERIENCE_ACCEPTANCE

VFS03_PASS
!= VFS04_REAL_MULTI_HUMAN_FAMILY_PRACTICUM

VFS04_PASS
!= VFS05_RELEASE_HARDENING
```

VFS-01 does not modify the Family Companion runtime, Family browser server, generic Security/Perception/Distribution/VHEAL source, sensors, memberships, sessions, Home, Memory, models, training, signing or publication.

VFS-02 must freshly source-place the then-current Companion context producer seam rather than pre-binding today's plausible `FamilyCompanionRuntime.contextInputFor(...)` hook.

<!-- [VEX-FAMILY][SECURITY][VFS01][EFFECT-FREE-AWARENESS][VXG RealForever] -->

## VFS-03A visible Family security status

VFS-03A projects a compact, consumer-only security status inside the accepted Family-room presentation. It consumes the exact VFS-01 projection shape but does not expose that full projection to the browser.

```text
source-managed Family security projection
  -> server validates exact schema/fingerprint/current Family binding
  -> server rejects authority/effect/attack inflation and raw authority material
  -> compact browser-safe securityStatus
  -> existing #familyRoomProjection
```

The compact status contains only:

```text
state=CURRENT | HELD_UNAVAILABLE
projectionRefOrNull
projectionFingerprintOrNull
sessionCurrent=true | UNKNOWN
missingCount
unknownCount
withheldCount
telemetryGapCount
incidentCoverageStateOrNull
attackEstablished=false | UNKNOWN
roleCanAct=false
effectAuthorityGranted=false
```

A missing resolver, stale/mismatched projection, forged fingerprint, authority inflation, raw membership/lease material, or attack-attribution inflation holds only the visible security status. It does not fabricate a Family failure or disable independent human Family chat/work/lifecycle truth.

Permanent law:

```text
VISIBLE_SECURITY_STATUS != SECURITY_AUTHORITY
SECURITY_INFORMATION_CURRENT != EVERYTHING_IS_SAFE
MISSING_OR_UNKNOWN != SAFE
ROLE_CAN_PERCEIVE != ROLE_CAN_ACT
COMPANION_AVAILABILITY != SECURITY_STATUS
VEX_EXPLANATION != EFFECT_AUTHORITY
```

Human copy distinguishes current, limited and unavailable information and always states that the projection is scoped evidence rather than a safety certification. The browser does not create a security producer, a second Family room, a second Vex vessel, or a universal SAFE/CLEAR enum.

