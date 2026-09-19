# VexLife Stewardship Orchestration Adapter

`[VXG RealForever]`

This adapter is the VexLife-side consumer membrane for the accepted Vextreme-SDK VS-FND composer.

It does **not** reimplement Stewardship meaning. The accepted producer remains:

```text
process.multivex.operations.stewardship-orchestration.v1
Vextreme-SDK merge 4dc3fbfad0298d4055196b5d50d8aa73e9f4ac68
profileRef=VS-FND-00
```

## Why this exists

VexLife owns local operational evidence such as the Intent Workgraph, explicit accepted assignments, scheduler occupancy and current capability/effect leases. VS-FND owns the pure composition of source-bound intention, path alternatives, continuity, timing, responsibility and outcome evidence into one **no-effect** next-transition recommendation.

The adapter connects those two truths without merging their authority:

```text
VexLife owner evidence
  -> adapter validation / exact binding
  -> unchanged exact VS-FND request
  -> accepted SDK composer
  -> exact no-effect VS-FND receipt
  -> adapter receipt validation
  -> recommendation-only local route receipt
```

## Adapter v1 evidence boundary

Adapter v1 requires one exact current VexLife lineage:

```text
Intent Workgraph
  graphRef
  graphFingerprint
  rootIntentRef

Work node
  workNodeRef
  nodeFingerprint
  roleRef
  capabilityEnvelopeRef
  effectEnvelopeRef
  returnRouteRef

Accepted assignment
  assignmentRef
  assignmentFingerprint
  sourceIntentRef
  workNodeRef
  assigneeRef
  assignmentState=CURRENT
  authorityDisposition=NO_AUTHORITY
  effectDisposition=NO_EFFECTS

Scheduler occupancy
  occupancyRef
  occupancyFingerprint
  actorRef
  actorClass
  workNodeRef
  graphFingerprint
  roleRef
  currentness=CURRENT
  lifecycle=ACTIVE

Capability lease
  exact graph/work/envelope binding
  currentness=CURRENT
  lifecycle=ACTIVE

Effect lease
  exact graph/work/envelope binding
  currentness=CURRENT
  lifecycle=ACTIVE
```

The assignment assignee must equal the current occupancy actor for adapter v1. That rule proves a small real seam; it does not claim delegation or alternate-occupancy semantics do not exist. Those remain held until a later owner-backed extension proves them.

The capability-envelope ref is used as the opaque VS-FND `requiredCapabilityRefs` identity for adapter v1. The adapter does not inspect or invent the envelope's inner capability semantics.

## What the adapter deliberately does not infer

The adapter does not decide:

- which path is recommended;
- whether a person is ready for a decision;
- whether a reminder is wanted;
- whether a concern crossed a threshold;
- whether external authority is required;
- whether an effect succeeded;
- whether the original intention is satisfied.

Those values must already be source-bound in the VS-FND request by their rightful owners.

## Request boundary

The adapter verifies that the SDK request is exact and that local identities are not substituted. It then returns the request unchanged. Adapter fingerprints live only in the separate VexLife build receipt; they are never injected into the SDK request because the accepted producer rejects unknown request fields.

Adapter v1 requires:

```text
requiredRoleRefOrNull == local work roleRef
requiredCapabilityRefs == [local capabilityEnvelopeRef]
currentOccupancyOrNull == exact current scheduler occupancy
alternateOccupancies == []
activeWorkRefs includes local workNodeRef
request sourceRefs include all local adapter evidence plus exact SDK producer sources
```

The absence of alternate occupancy support in v1 is a proof-scope boundary, not a claim that alternate occupants are invalid.

## Receipt boundary

A consumed SDK receipt must prove:

```text
schemaVersion=vextreme.stewardship-orchestration-receipt/v1
profileRef=VS-FND-00
caseRef == request caseRef
accepted=true
sourceRefs == exact request sourceRefs
fingerprint == exact SDK canonical sha256 fingerprint
all effect flags == false
```

The adapter additionally protects the accepted non-collapse flags, including:

```text
interpretationReplacesGoal=false
minimalSafePathIsOnlyPath=false
heldPathHasEffectAuthorityByImplication=false
recommendationIsHumanDecision=false
reminderSchedulingAuthorized=false
inferredReadinessGrantsConsent=false
actorClassAloneGrantsAuthority=false
effectResultIsOutcomeVerified=false
taskCompletionIsIntentSatisfaction=false
```

A selected occupancy may be null or the exact locally proven current occupancy. Adapter v1 rejects a foreign selected occupancy rather than pretending it has sourced an alternate.

## Returned local meaning

The VexLife route receipt carries the SDK `nextTransition`, blockers and local `returnRouteRef`, but always states:

```text
recommendationOnly=true
executionAuthority=NONE
effectAuthority=NONE
all effects=false
```

A separate rightful owner must perform any scheduler transition, human-attention action, Conversation delivery, Home/Family/Memory mutation, external effect, legal/financial action, training, activation or publication.

## Active neighbor

At formation, FT-B (`github.issue.vexlife.547` / PR #548) owns the scheduler due/missed-host extension and mutates scheduler-owned source. This adapter's four authored paths are disjoint. Before landing, the adapter must refresh VexLife main and currentize/rerun proof if FT-B or another relevant owner lands.

## Exact source membrane

```text
blueprint/stewardship-orchestration-adapter.json
src/core/stewardship-orchestration-adapter.mjs
test/stewardship-orchestration-adapter.test.mjs
docs/STEWARDSHIP-ORCHESTRATION-ADAPTER.md
```

No other source owner is modified by this adapter.
