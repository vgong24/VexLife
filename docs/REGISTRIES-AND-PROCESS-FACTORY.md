# Registries, interface identities and the VexLife Process Factory

`[VXG RealForever]`

## One canonical identity, many useful registries

VexLife does not put every relationship into every model prompt. The universal blueprint, process factory, module map and language catalogs are source-managed. A deterministic compiler projects the registries needed by a current role or platform.

```text
canonical blueprint + process definitions + module map + string catalogs
    → compiled identity registry
    → bounded Atlas neighborhood
    → interface / localization / navigation / permission / test projections
```

A model-facing node remains thin:

```text
ref
kind
brief
stateHash
currentness
```

The engine retains parent, consumer, dependency, permission, action, test and source relationships. It returns only the edges required for the current intent and emits a coverage receipt.

## Registration instead of branching

The standing pattern is:

```text
add a screen       → register a ScreenContract
add an element      → register an ElementContract
add a string        → register one StringRef and locale projections
add a process       → register a ProcessDefinition
add a platform      → register a PlatformAdapter contract
add a source module → register a ModuleRecord and its change map
```

Do not add parallel `if (screenName === ...)` tables in every platform. Platform-native code resolves stable refs through generated catalogs.

## Interface identity

Every user-visible element declares:

```text
elementRef
conceptRef
parent region and screen
interactionRef
optional navigationRef
journeyEventTypeRef
labelStringRef
actionRef
permissionRef
selectionGroupRef
terrainNodeRef
accessibility stable identifier
testRefs[]
```

The visible label may change or translate. The identity does not.

## Semantic navigation and journeys

A raw click is not durable meaning. A semantic journey event records:

```text
journeyRef
elementRef
interactionRef
actionRef
fromFrame
toFrame
subjectRef
semanticHash
formedAt
```

Equal semantic transitions are suppressed. The current screen frame carries a small bounded trajectory; the full append-only journey ledger remains source-descendable. Vex Guide can answer “where am I and how did I get here?” without receiving raw pointer telemetry.

## Process Factory

The VexLife Process Factory converges the reusable Operations pattern:

```text
foundation contracts
  → process definitions
  → platform/role templates
  → worked examples with corrections
  → runtime compiler
```

A process declares required inputs, source-resolution rules, preconditions, steps, effect owner, authority envelope, output templates, return/closure/recovery rules, dependencies and tests.

The compiler never fills missing authority-bearing inputs from memory. It returns one of:

```text
PLAN_READY_NO_EFFECT
BLOCKED_MISSING_INPUT
BLOCKED_STALE_FOUNDATION
BLOCKED_AUTHORITY
BLOCKED_RESOURCE_BUDGET
```

Execution remains a separate brokered effect.

## String registry

English is the source-language projection in the current foundation, not the element identity. The compiled string registry binds:

```text
stringRef
source-locale meaning
locale values
consumerRefs[]
```

Changing a visible phrase does not require renaming a screen, element, test or analytics identity. Adding a locale means adding projections and passing coverage checks.

## Super-function relationship

The language-neutral builder operations are executable contracts:

```text
defineScreen
  → defineRegion
    → defineElement
      → bindAction
      → requirePermission
      → observeState
      → localize
      → placeOnTerrain
      → proveWith
```

Each platform implements the same meaning with native framework mechanics.

<!-- [VXG RealForever] -->
