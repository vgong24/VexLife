# Navigation Continuity Foundation

`[VXG RealForever]`

## Purpose

Navigation Continuity gives Vex and every platform projection one source-managed answer to five questions:

```text
What goal is active?
Where is the current human-visible page state?
Which registered door brought the session here?
Which registered directions are available now?
What is the last committed known-good frame if the next step fails?
```

It is a platform-neutral semantic foundation. Browser DOM, Android View/Compose, iOS, Windows UI Automation, animation, screenshots and assistive technology are adapters over this contract; none of them owns the navigation meaning.

## Permanent boundaries

```text
CANONICAL_REF = SEMANTIC_IDENTITY
DISPLAY_LABEL != SEMANTIC_IDENTITY
PROPERTY_NAME != SEMANTIC_IDENTITY
PLATFORM_ENUM_CASE != SEMANTIC_IDENTITY

ATLAS_LOOKUP != PRESENCE
ROUTE_PLAN != PRESENCE
VISIBLE_STATE_CHANGE_REQUIRES_REGISTERED_VISIBLE_DOOR=true
SEMANTIC_TELEPORTATION=false

KNOWS_ABOUT(resourceRef)
!= PLANS_TO_TRAVEL_TO(resourceRef)
!= TRAVERSING_TO(resourceRef)
!= PRESENT_AT(resourceRef)

PRESENT_AT(resourceRef)
= final registered transition committed
+ expected page state observed
+ expected available-element set observed

FAST | NORMAL | SLOW | STEP
= presentation policies over one unchanged semantic route

REDUCED_MOTION
= animation projection change
!= semantic-step deletion

TRACE_VISIBILITY_HIDDEN
!= TRACE_RECORDING_DISABLED
```

## Canonical owner composition

```text
Navigation Continuity Registry
  descriptor identity, no-teleport laws, contracts and limits

Registry Compiler consumer
  page-state, resource, element and transition topology

Atlas consumer
  bounded read-only resource lookup and route planning

NavigationTransitionExecutor
  one serialized command stream per navigation session

NavigationTransitionBundle
  atomic from → via → to commit with element-set delta

Journey / Continuity Stream consumers
  append-only semantic traversal and bounded current-frame continuity

VexInterface / platform projections
  read-only current location, goal, available directions and recent trace
```

The executor is a logical single writer **per navigation session**. It is not a process-global singleton. Multiple windows, devices or lineages may execute independently while consuming one canonical user-preference source.

## Topology contract

A `vexlife.navigation-topology/v1` projection contains:

```text
pageStateRef
screenRef
routeRef
realmRef
parentPageStateRefOrNull
resourceRefs[]
availableElementRefs[]
entryFocusElementRefOrNull

transitionRef
fromPageStateRef
viaElementRef
interactionRef
actionRef
toPageStateRef
transitionClassRef
userFacing=true
portalRefOrNull
focusTargetElementRefOrNull
```

Compilation fails when:

- a transition has no current user-facing element in its origin page state;
- a destination, focus target, parent or canonical identity is missing;
- one resource maps ambiguously to multiple page states;
- a non-hierarchical cross-realm transition is not an explicit registered visible portal;
- parent relationships cycle;
- duplicate identities disagree.

A cross-branch route therefore climbs through registered parent/root doors until it reaches the lowest available common route, then descends the other branch. A direct cross-realm route exists only when the product has a registered visible portal.

## Descriptor-driven preferences

The preference store persists stable refs, not copied local strings:

```text
pacingRef
motionPolicyRef
traceVisibilityRef
```

A pacing descriptor references settlement, animation, dwell, advance and trace policies. The executor resolves those relationships generically. Callers do not pass speed, sleep, animation and step-mode parameter bundles to every `navigateTo()` call.

```js
await session.navigateTo(resourceRef, {
  goalRef,
  expectedFrameRef,
  commandRef
});
```

`expectedFrameRef` and `commandRef` are concurrency/currentness identities, not presentation preferences.

## Execution sequence

```text
receive navigateTo(resourceRef, goalRef)
→ serialize in the session queue
→ verify expected current frame
→ resolve resource to page state
→ compile a registered visible route
→ for each transition:
    resolve the current preference descriptors
    ask the platform adapter to perform the exact registered action
    wait for semantic settlement
    verify page state, available-element set and expected focus
    atomically commit one transition bundle
    publish the new current frame and directions
    apply perception dwell
    require human Continue when the descriptor says so
→ return one command result
```

Arbitrary timers do not establish arrival. Semantic settlement precedes optional perception dwell. A failed step leaves the session at the last committed frame.

## Atomic transition bundle

One `vexlife.navigation-transition-bundle/v1` binds:

```text
navigationSessionRef
commandRef
sequence
predecessorCommitRefOrNull
goalRef
registry/topology fingerprints

from frame
via transition + element + interaction + action
to frame

elementRefsDisappeared[]
elementRefsAppeared[]
elementRefsRetained[]
availableTransitionRefs[]

journeyEventRefOrNull
continuityEventRefs[]
captureRefs[]
preference descriptor refs
outcomeRef
semantic fingerprint
```

The bundle contains capture **references**, never screenshot bodies, raw accessibility trees, raw logs, transcripts or hidden reasoning. Commit and frame fingerprints are non-circular: frames do not contain their producing commit identity.

## Replay and currentness

Committed bundles form one linear predecessor-bound stream. Replay rejects missing predecessors, divergent identities, wrong sessions, transition substitution and from-frame mismatch.

```text
stored registry/topology fingerprint == current fingerprint
  → replay CURRENT

stored registry/topology fingerprint != current fingerprint
  → replay STALE
  → preserve last accepted frame
  → recompile available directions
  → never replay an old transition plan as current authority
```

Exact duplicate command identity is a once-only no-op. The same command ref with different input is a typed conflict.

## Platform adapter boundary

A platform adapter receives the canonical transition and resolved presentation descriptors. It may bind them to:

```text
Browser: elementRef → DOM binding
Android: elementRef → testTag/resource/accessibility identity
iOS: elementRef → accessibility identifier
Windows: elementRef → UI Automation binding
```

The adapter reports the observed destination, focus, available elements, semantic settlement and evidence refs. It cannot invent a route, skip semantic steps or declare presence from a screenshot alone.

Assistive technology is therefore an observer after deterministic registered navigation. Narrator, TalkBack, VoiceOver and similar tools do not become the navigation engine.

## Initial foundation scope

This foundation intentionally does not yet mutate:

```text
browser controllers
native adapters
platform generator
Atlas implementation
NavigationLattice/Journey implementation
Continuity Stream implementation
VexInterface
Narrator or other assistive-technology harnesses
```

Those are bounded consumers or refactors after the foundation is accepted and current. The first consumer should replace Stage-7 test-local focus wandering with registry-compiled direct navigation, then run real assistive technology only at the already-bound destination.
