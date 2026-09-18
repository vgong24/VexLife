# Universal interface builder contract

`[VXG RealForever]`

## Intent

An interface should be constructed from reusable, identity-bearing contracts rather than a page-sized source file that only its original platform understands.

```kotlin
VexLifeScreen(
    id = ScreenRef.Chat,
    route = RouteRef.Chat,
    title = StringRef.ScreenChatTitle,
    observes = setOf(ProjectRailSelector, ActiveChannelSelector, CurrentScreenFrameSelector)
) {
    Region(id = RegionRef.ProjectRail, label = StringRef.RegionProjects) {
        ProjectSelector(
            id = ElementRef.ProjectSelfDevelopment,
            concept = ConceptRef.ProjectSelfDevelopment,
            label = StringRef.ProjectSelfDevelopment,
            action = ActionRef.SelectProject,
            selectionGroup = SelectionGroupRef.Project,
            terrain = TerrainRef.ProjectSelfDevelopment,
            permission = PermissionRef.None,
            tests = setOf(TestRef.SelectionProject)
        )
    }
}
```

The syntax is illustrative. The stable refs and relationships are normative.

## Platform mapping

| Blueprint contract | Browser | Android | Apple | Desktop |
|---|---|---|---|---|
| Screen | semantic route/view | Compose destination | SwiftUI scene/view | window/page |
| Region | landmark/section | composable group | accessibility container | panel |
| Element | stable `data-node-ref` | test tag + semantics | accessibility identifier | automation ID |
| Observe | narrow store selector | `StateFlow` | Observation/AsyncSequence | platform equivalent |
| Permission | effect broker | runtime/SAF permission | entitlement/security scope | ACL/picker grant |
| Journey | history + semantic event | navigation/event relay | navigation/event relay | navigation/event relay |

## No hidden platform obligations

A universal contract calls out security, permission, lifecycle, cancellation, accessibility, localization and evidence requirements. The platform adapter must either implement them or return an explicit held gap. It cannot silently omit a dependency because the browser did not need the same mechanism.

## Recomposition and `distinctUntilChanged`

A region subscribes only to the selectors it renders. A change to resource telemetry does not rerender a message feed unless the selected human projection changed. A new message appends one node when the reader is at the bottom; it never rebuilds the entire transcript and scrolls from the top.

## Traceability

Every generated platform element preserves:

```text
sourceBlueprintRef
sourceBlueprintVersion
elementRef
labelStringRef
actionRef
permissionRef
testRefs[]
```

That allows a Vex instance or human to ask “where is this, why does it exist, what can it affect, and which platforms have adopted the latest contract?”

## Register once, project many times

A new interactive element is not complete until one registration can answer:

```text
conceptRef
screenRef / regionRef / elementRef
componentRef and instanceRef pattern
actionRef and permissionRef
state selector refs
localization key and fallback policy
navigation path and journey event type
experience profile visibility
gesture contracts
Terrain placement
test refs and platform evidence
```

Use `process.vexlife.interface.register-node` to derive the identity, string-usage, navigation, permission, Terrain and impact relationships rather than maintaining parallel lists by hand.

Action vessels use the same contract. A browser FAB, Android FloatingActionButton, iOS menu and desktop command surface can be different native renderings of one `vesselRef` without pretending their framework behavior is identical.

<!-- [VXG RealForever] -->
