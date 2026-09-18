# Universal Blueprint Source of Truth

`[VXG RealForever]`

## Core shape

The universal blueprint is a typed graph with one canonical identity for each product concept and several generated lenses.

```text
Product
  → Screen
    → Region
      → Element
        → Action
        → Permission
        → State selector
        → Localization key
        → Terrain node
        → Tests
```

A role or model does not receive the whole graph. The Atlas resolves the smallest bounded neighborhood needed for the current intent.

## Interface builder super-functions

The JSON registry is equivalent to the following language-neutral pseudocode:

```kotlin
interface IVexLifeBlueprint {
    fun defineScreen(
        id: ScreenRef,
        route: RouteRef,
        title: StringRef,
        observes: Set<StateSelectorRef>,
        regions: List<RegionContract>,
        tests: Set<TestRef>
    ): ScreenContract

    fun defineElement(
        id: ElementRef,
        parent: RegionRef,
        kind: ElementKind,
        label: StringRef,
        action: ActionRef?,
        permission: PermissionRef?,
        selectionGroup: SelectionGroupRef?,
        terrain: TerrainNodeRef?,
        accessibility: AccessibilityContract,
        tests: Set<TestRef>
    ): ElementContract

    fun observeState(
        sources: Set<StateRef>,
        selector: StateSelectorRef,
        equality: SemanticEquality = DistinctUntilChanged
    ): ReadOnlyProjection<Any>

    fun executeIntent(
        intent: IntentRef,
        parameters: Map<String, Any>,
        budget: ExecutionBudget,
        authority: AuthorityEnvelopeRef
    ): EffectReceipt
}
```

No platform implementation should replace this with a page-level blob whose internal elements have no stable identities.

## Identity

Stable references survive:

- visible-label changes;
- translation changes;
- class, view or file renames;
- platform differences;
- layout changes;
- generated code changes.

Aliases may preserve earlier names, but there is one current canonical identity.

## State domains

The blueprint declares independently owned domains:

```text
NavigationState
SelectionState
ProjectState
ThreadState
ChannelState
MessageState
ContextState
GuideState
TerrainState
HealthState
PermissionState
ResourceState
DeviceFamilyState
ScoreProjectionState
RhythmState
LocalizationState
SyncState
```

A screen registers selectors over those domains. It never receives the universal state object merely for convenience.

## Atlas query

The model-facing record is intentionally thin:

```text
ref
kind
brief
stateHash
currentness
```

Relationships remain external. A bounded query resolves only the implicated neighbors:

```text
Atlas.query(
  intent = "explain selected delete button",
  startRefs = [selectedElementRef],
  edgeTypes = [PARENT, ACTION, PERMISSION, TEST],
  depthLimit = 2,
  resultLimit = 12,
  tokenBudget = 1200
)
```

The result includes a coverage receipt so absence is not mistaken for completeness.

## Human and machine projections

One canonical graph generates:

```text
human design blueprint
AI orientation packet
platform scaffold
localization inventory
permission review
Terrain map
state dependency map
conformance test plan
change impact report
```

No generated view becomes a competing source of truth.

## Blueprint validation invariants

- every reference is globally unique within its kind;
- every parent exists;
- every element has a localization key;
- every required language covers every user-facing key or declares explicit fallback debt;
- every action declares effect class and permission;
- destructive actions declare confirmation and recovery contracts;
- every screen has accessibility and navigation proof;
- every platform declares support, adaptation or explicit hold;
- every breaking change increments the contract version and produces an adoption plan.

<!-- [VXG RealForever] -->
