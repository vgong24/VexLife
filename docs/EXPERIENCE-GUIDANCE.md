# VexLife Experience Guidance

`[VXG RealForever]`

```text
schemaVersion=vexlife.experience-guidance/v1
formationRef=github.issue.vexlife.420
workRef=work.vexlife.experience-guidance.efx01.e88b6ba3-66ce-4fe2-816b-c1abbc2b12c7
implementationState=SOURCE_IMPLEMENTATION_IN_PROGRESS
```

## Purpose

Experience Guidance composes accepted Feature Perceptibility, Experience Foundation, Interface
Builder, Guide, E2.7/E2.8 spatial interaction and current semantic-frame truth into one no-effect
contract for contextual Help, optional feature introduction and adaptive guidance projection.

It does not create a second onboarding owner, Experience compiler, Memory record, engagement
system, analytics pipeline, Guide persona or action authority.

## Human-awareness boundary

The system may know that an exact introduction route has not been acknowledged under the current
`featureRef + planRef + sourceVersionRef`. It may not infer that the human therefore does not know,
understand or remember the feature.

```text
NOT_INTRODUCED != USER_DOES_NOT_KNOW
ACKNOWLEDGED != MASTERED
ACKNOWLEDGED != FEATURE_COMPLETION
ACKNOWLEDGED != MEMORY
DEFERRED != MEMORY
SUPPRESSED != MEMORY
OFFERED_THIS_SESSION != ACKNOWLEDGED
```

`UNINTRODUCED` is derived. `OFFERED_THIS_SESSION` is ephemeral. `DEFERRED`, `ACKNOWLEDGED` and
`SUPPRESSED` are exact-version Guide-local presentation preferences only. Awareness is always
derived against the current exact introduction identity. A different plan/source version therefore
does not silently inherit an older preference.

A derived unintroduced/relevant count is presentation-only. It is not an engagement score, KPI,
notification obligation or network telemetry.

## Contextual proposal

A `GuidanceProposal` is a current no-effect projection that says why one capability may be useful
now. It cannot upgrade Feature Perceptibility route state, Experience availability, permission,
capability stage, target truth or action authority.

```text
GUIDANCE_PROPOSAL != ENGAGEMENT_TARGET
GUIDANCE_PROPOSAL != ADVERTISEMENT
RELEVANCE != AUTHORITY
RELEVANCE != AUTO_EXECUTION
SHOW_ME != AUTO_EXECUTION
```

The proposal records whether it is a `PROACTIVE_INTRODUCTION`, `EXPLICIT_HELP` or
`EXPLICIT_SHOW_ME`. A proactive introduction is admissible only while the exact current
introduction is `UNINTRODUCED`, its route is current and its availability is truthful. Once it has
been offered in the session, deferred, acknowledged or suppressed, that proactive introduction
must not repeat. Explicit Help/Show Me remains available regardless of proactive suppression.

## Stable meaning and runtime target binding

Guidance targets must preserve canonical meaning separately from rendered identity.

```text
GUIDANCE_TARGET != DOM_ID
ELEMENT_REF != INSTANCE_REF
INSTANCE_REF != ENTITY_REF
ENTITY_REF != DISPLAY_LABEL
RUNTIME_BINDING != CANONICAL_PRODUCT_IDENTITY
```

Static controls may bind directly to a canonical target. Repeated collections bind the canonical
component/slot meaning to an exact `instanceRef` and, where applicable, an `entityRef`. Ambiguous
action-bearing targets fail closed rather than choosing the first rendered match.

This consumes the Interface Builder's existing component `instanceRefPattern`; it does not create
a second identifier system.

## Perspective guidance

The requested perspective tooltip is modeled as an adaptive guidance projection rather than a
hover-only widget. A pure placement resolver derives the current presentation from target geometry,
viewport/safe area and protected controls.

```text
resolvedGuidance = derive(
  target,
  targetRect,
  surfaceSize,
  viewportRect,
  safeArea,
  protectedRects,
  navigationRects,
  focusRect,
  preferredPresentations,
  readingDirection
)
```

Safe candidates outrank obstructed candidates. Among safe candidates, the resolver prefers the
logical direction with the most usable room before using caller preference order as a tie-breaker.
It must not cover navigation/focus/protected controls merely to honor a preferred direction.

If no safe anchored position exists it falls back to an edge callout, in-flow guidance,
Guide-vessel explanation, compact sheet or nonvisual description. The resolver does not emit the
unsafe candidate geometry as if it were renderable.

Automatic collision avoidance never persists itself as a human layout preference.

```text
RESOLVED_GUIDANCE_PLACEMENT != PERSISTED_HUMAN_PREFERENCE
OBSTRUCTION_AVOIDANCE != NAVIGATION_AUTHORITY
GUIDANCE_REPOSITION != JOURNEY_EVENT
```

A guidance surface owns only its own interaction scope. Its scrolling or swiping must not leak into
Terrain semantic depth/navigation.

```text
GUIDANCE_SCROLL != TERRAIN_SCROLL
SCROLL_EVENT != SEMANTIC_COMMIT
```

## Intelligence-native interaction explanation

Help must explain intentions through the interaction semantics the product actually owns, not
reduce the product to buttons. Guidance references existing `actionRef`, `interactionRef`,
`gestureRef`, component slots and semantic frames. It does not mint a new canonical action merely
to explain a gesture.

Current accepted source already includes direct manipulation such as Terrain move/pan/zoom,
semantic-depth change, Journey scrub/revisit, Vex resize/dock and contextual-workspace resize/dock.
Fanning/spatial reveal and other interaction families are admitted only when their exact current
source identity is descended and validated.

```text
GESTURE != BUTTON
DIRECT_MANIPULATION != BUTTON
INTERACTION_CUE != ACTION_AUTHORITY
```

## Human Help projection

The Help surface is context-first and intention-first. It may compose sections equivalent to:

```text
WHAT_CAN_I_DO_HERE
WHAT_CAN_VEX_HELP_WITH_HERE
SHOW_ME_HOW
RELEVANT_NOT_YET_INTRODUCED
WHY_UNAVAILABLE
RECOVERY_AND_GET_BACK
ADVANCED_WHEN_I_WANT_IT
```

It remains one projection over current owners rather than a new top-level app shell or feature
catalog. Progressive disclosure keeps ordinary use calm without hiding capability behind secret
roles.

## Fresh-AI perception

A fresh Vex/Devex should be able to consume the same source-managed projection a human Help view
uses: current frame, relevant capabilities, exact introduction preference, target binding,
availability and interaction cues. The model may explain relevance but cannot bypass deterministic
currentness or authority checks.

EFX-01A defines this source contract only. Registry compilation, browser Guide adoption, Help UI,
Feature Perceptibility preference extension and Devex command/model-tool exposure remain bounded
successors after current parent/source ownership is re-grounded.

<!-- [VXG RealForever] -->
