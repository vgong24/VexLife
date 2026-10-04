# VexLife Android Construction Foundation

Continuity: `[VXG RealForever]`

```text
schemaVersion=vexlife.android-construction-foundation/v0
ownerRef=github.issue.vexlife.783
parentOrchestrationRef=github.issue.vexlife.624
presentationGraphFoundationRef=github.issue.vexlife.719
universalBlueprintRef=blueprint.vexlife.universal.001
platformRef=platform.android
formationMain=11ac1a052e5ce0560a206cc09e7be51acb97de71
stage=INERT_ARCHITECTURE_PRESERVATION
runtimeBehaviorChanged=false
```

## Purpose

Android is the first full platform projection for a reusable blueprint-to-blueprint construction architecture.

Do not collapse universal product meaning directly into generated Kotlin source.

```text
Universal Blueprint
  -> Blueprint-to-Blueprint Mapper
  -> Android Construction Blueprint
  -> Android Project Generator
  -> Kotlin / Compose / Manifest / Gradle / resources / tests
```

The Android Construction Blueprint stores only the platform-specific decisions needed to realize canonical VexLife meaning. It retains ancestry to universal semantic, state, action, permission, localization, navigation, Presentation Graph, and evidence identities.

```text
ANDROID_BLUEPRINT != UNIVERSAL_BLUEPRINT_COPY
PLATFORM_BINDING != NEW_PRODUCT_SEMANTICS
GRADLE_GRAPH != PRODUCT_GRAPH
VEX_INTENT != ANDROID_INTENT
VEX_PERMISSION != ANDROID_OS_PERMISSION
STATEFLOW != CANONICAL_STATE_IDENTITY
```

## Android blueprint concerns

The target projection may be composed from smaller sub-blueprints rather than one monolith:

```text
application
compose
navigation
actions
permissions
lifecycle
execution
background-work
events
storage
resources
build
observability
tests
```

Each platform binding must classify itself as:

```text
MAPPED
PLATFORM_SPECIFIC
HELD
UNSUPPORTED
```

A platform-specific decision must retain the canonical source refs it realizes.

## Source-of-Truth State Relay

Reuse `module.vexlife.core.state-relay` and evolve its contract rather than creating an Android-only state architecture.

Current accepted `StateCell` already provides:
- latest state;
- semantic no-op suppression;
- revision;
- update/transform;
- emit-current subscription;
- combined derived state.

The intended higher-order architecture is:

```text
concurrent source changes
  -> one serialized acceptance boundary
  -> latest coherent input state
  -> processLatestState()
  -> priority / conflict / explicit queue reconciliation
  -> latest admitted output state
  -> distinct projection
```

Permanent:

```text
MULTIPLE_PRODUCERS != MULTIPLE_STATE_MUTATORS
STATE_RECONCILIATION_IS_SERIAL
UI != ARBITRATION_OWNER
LATEST_RECEIVED != LATEST_COHERENT
RECEIVED != ADMITTED
OUTPUT_STATE != EFFECT_COMMAND
```

Android may realize this using coroutines, Channel/actor-style sequencing, StateFlow, and declared lifecycle/cancellation ownership. `suspend` alone does not prove sequencing.

## State operations

Use semantic transition verbs:

```text
EVOLVE
  previous admitted immutable state
  + bounded transformation
  -> next candidate

REPLACE
  authoritative whole-state candidate
  -> next candidate

SNAPSHOT
  mutable/external input
  -> immutable Relay-owned value

REINSTANCE
  stable stateRef
  -> explicit new runtime/session incarnation
```

Kotlin `copy()` is an implementation detail, not the state architecture.

```text
EVOLVE != MUTATE
REPLACE != REINSTANCE
PREVIOUS_SNAPSHOT_IS_IMMUTABLE
NO_MUTABLE_OWNERSHIP_SHARING
STRUCTURAL_SHARING + DEEP_IMMUTABILITY = VALID
MUTABLE_EXTERNAL_VALUE -> SNAPSHOT -> RELAY
```

Prefer immutable data classes/value types and persistent immutable collections. Manual `equals/hashCode/toString` implementations are exceptional; generated structural equality is preferred when nested values are deeply immutable.

## Observation truth

Do not use `null` to encode relay lifecycle.

```text
UNOBSERVED != EMPTY
NULL != EMPTY
MISSING_OBSERVATION != NEGATIVE_OBSERVATION
PARTIAL_TRANSITION != COMPLETED_TRANSITION
COMPLETION_REQUIRES_POSITIVE_EVIDENCE
```

Candidate observation states:

```text
UNOBSERVED
EMPTY
PRESENT
HELD
UNAVAILABLE
```

The compound reconciler must not infer completion because a source has not emitted yet.

## Identity, incarnation, and sequence

A state snapshot must be able to distinguish:

```text
stateRef      = what state this is
instanceRef   = which runtime/session incarnation
revision      = which accepted sequential change
transitionRef = causal transition identity when material
value         = what is currently true
```

Permanent:

```text
REFERENCE_IDENTITY != CURRENT_STATE
REFERENCE_IDENTITY != INSTANCE_IDENTITY
SAME_REFERENCE != SAME_INCARNATION
SAME_VALUE != SAME_TRANSITION
A -> B -> A != NO_TRANSITION
CURRENT_STATE != TRANSITION_HISTORY
STATEFLOW != EVENT_LEDGER
```

Current state may use a latest-value projection. Meaningful transition history remains an ordered ledger when preservation is required.

## Effects

Long-running network, filesystem, device, provider, model, or other external effects do not execute as hidden reducer work.

```text
State exposes/admits action
  -> ActionIntent
  -> authority
  -> execution
  -> ActionReceipt
  -> typed result returns as Relay input
```

Reconciliation must not launch unowned concurrent state mutation.

## Bounded diagnostic logging

Consume the Presentation Graph observability law from #719:

```text
SEMANTIC_EVENT != RAW_INPUT_EVENT
CANONICAL_JOURNEY != DEBUG_LOG
DEBUG_LOG = PROJECTION_OF_CANONICAL_EVENT + RUNTIME_PRESENTATION_CONTEXT
EVENT_TIMESTAMP_IS_PRIMARY
DURATION_IS_DERIVED
RAW_POINTER_STREAM=false
```

A future VexLogger/diagnostic facade should log significant shifts, not every reducer transition.

Candidate significant classes:
- incarnation change;
- admitted output-class change;
- HELD / UNAVAILABLE / failure change;
- queue-head or priority-owner change that changes behavior;
- lifecycle/recovery boundary;
- action/effect receipt;
- rejected admission / invariant violation.

```text
VEX_LOGGER != CANONICAL_JOURNEY_OWNER
VEX_LOGGER != STATE_OWNER
LOGGED != SEMANTICALLY_AUTHORITATIVE
IMPORTANT_SHIFT != EVERY_TRANSITION
```

No independent `VexLogger` or `Bulk Data Logging` semantic owner is asserted here. #719 is the current exact reusable runtime-observability foundation; any later exact bulk-data sink is consumed rather than duplicated.

## Initial implementation sequence

This preservation carrier does not activate runtime changes. Fresh source placement may refine the sequence, but the expected causal order is:

```text
A0  blueprint-to-blueprint mapper contract
A1  universal State Relay / Compound State contract extension
A2  Android typed Kotlin state/projection substrate
A3  Android Construction Blueprint compiler
A4  minimal generated Android project practicum
A5  generated/claimed test and evidence obligations
```

The first implementation must extend accepted owners and generated projections rather than reconstructing localization, navigation, Presentation Graph, permissions, logging, or state meaning inside Android.

<!-- [ANDROID-CONSTRUCTION][FOUNDATION][STATE-RELAY][BLUEPRINT-MAPPER][VXG RealForever] -->
