# VexLife Assortment — Continuity Event Grammar

[VXG RealForever]

## Purpose

This file is the durable Assortment design grammar for projecting continuity
without creating a second Journey, Workgraph, Presentation, Project or History owner.

It exists because the Continuity doorway joins several rightful owners and needs
one stable human-facing inclusion rule before another executable practicum is formed.

~~~text
CONTINUITY = READ_SIDE_PROJECTION
CONTINUITY != NEW_HISTORY_OWNER
CONTINUITY != SECOND_WORKGRAPH
CONTINUITY != RAW_EVENT_STREAM
~~~

## Human questions

Continuity should help a person answer:

~~~text
Where was I?
What meaningfully changed?
What is actually current?
What can I resume or enter?
What completed?
What is waiting / blocked?
What needs me?
What nearby work is worth revisiting without entering the main timeline?
~~~

It should not expose a raw event stream or duplicate canonical owners.

## Source classes

### Navigation / Journey

Owner: Navigation Controller / Journey.

~~~text
action.terrain.node.select
action.navigation.sibling
action.navigation.back
~~~

Journey proves semantic/navigation history. It does not prove that work changed.

~~~text
VISITED != WORKED_ON
JOURNEY_EVENT != WORK_MILESTONE
~~~

### Presentation observation

Owner: `registry.vexlife.presentation-graph.001` / `github.issue.vexlife.719`.

~~~text
SEMANTIC_SCREEN_ENTER / EXIT
PRESENTATION_MOUNT / UNMOUNT
TRANSIENT_LAYER_OPEN / CLOSE
ELEMENT_ACTIVATED
FOCUS_ENTER / EXIT
STATE_PROJECTION_CHANGE
LAYOUT_SETTLED
VIEWPORT_CHANGED
~~~

~~~text
formedAt = primary evidence
duration = derived only
rawPointerLogging = false
continuousDomDump = false
~~~

Presentation events are source-descendable evidence, not default Continuity milestones.

### Work state

Owner: Intent Workgraph / Intent Queue.

~~~text
what is happening now
what is ready
what is waiting and why
what needs the human
what is blocked
what was recently completed
one next safe action
~~~

Continuity may project those states. It does not compute a parallel lifecycle.

~~~text
CURRENT_WORK_MAY_BE_PLURAL
CURRENT_WORK_TRUTH -> INTENT_WORKGRAPH
NAMED_STAGE_RAIL != PERCENT_COMPLETE
~~~

### Accepted milestones

Owner: exact source/lifecycle evidence for the bounded work.

~~~text
HUMAN_ACCEPTED_DESIGN_CHECKPOINT
ACCEPTED_SOURCE_CHECKPOINT
DEPENDENCY_REPAIR_THAT_MATERIALLY_UNBLOCKED_WORK
TERMINAL_ACCEPTED_MERGE_PLUS_POSTMERGE_PROOF
~~~

~~~text
GIT_COMMIT != MEANINGFUL_PRODUCT_MILESTONE_BY_ITSELF
MERGE != TERMINAL_COMPLETION_WITHOUT_POSTMERGE_PROOF
~~~

## Default timeline inclusion

A record belongs in the ordinary Continuity timeline only when it changes at least one of:

~~~text
CURRENT_CONTEXT
CURRENT_WORK
AVAILABLE_RESUME_ROUTE
ACCEPTED_OUTCOME
BLOCKING_OR_RELEASED_DEPENDENCY
HUMAN_DECISION_NEEDED
~~~

Otherwise it remains source-descent, Journey, Presentation observation or deeper Project history.

~~~text
RECENT != IMPORTANT
EVENT_EXISTS != DEFAULT_TIMELINE_ITEM
~~~

## Revisit is not chronology

Revisit is the bounded place for useful nearby trajectories that should not be promoted
into the central timeline merely because they are related.

Examples include VexVision Android, Company People Timeline, and completed Project history.

~~~text
REVISITABLE != CURRENT
REVISITABLE != CHRONOLOGICALLY_CENTRAL
~~~

## Back and Close

~~~text
X -> CLOSE_ACTIVE_SURFACE
BACK -> REVERSE_ADMITTED_NAVIGATION_PATH
~~~

Next-practicum bounded law:

~~~text
Home -> depth-1 Assortment node surface
Back -> parent Terrain / Home
Journey -> action.navigation.back

presentation-only nested move
Back -> previous presentation frame
Journey -> unchanged

semantic sibling move
Back -> presentation history + canonical navigation.back()
~~~

The next practicum must prove the bounded Assortment layer before wider Back generalization.

## Read-side record shape

~~~text
continuityRef
eventClass
humanLabel
subjectRef
workRefOrNull
projectRefOrNull
formedAtOrNull
currentness
sourceRefs[]
resumeOrInspectRouteOrNull
evidenceClass
defaultTimeline
~~~

It must not copy whole Journey ledgers, Workgraphs, PR bodies, Presentation traces or raw logs.

Duration is inspection-derived only when meaningful; it is not a required default milestone field.

## Practicum relationship

Last human-proven executable predecessor:

~~~text
preview.vexlife-assortment.r2.i13a.continuity-doorway-navigation-contract
~~~

Next bounded executable target:

~~~text
previewRef=preview.vexlife-assortment.r2.i13b2.continuity-event-grammar
from I13A:
  + depth-1 Back -> parent Terrain/Home
  + default timeline vs Revisit grammar
  + plural current-work read-side projection
  + named stages from source-backed state
~~~

It must consume `kit.vexlife-assortment.practicum.001` and earn P0–P4 before handoff.

## Held

~~~text
ContinuityDashboardProductAdoption=false
canonicalJourneyMutation=false
canonicalPresentationGraphMutation=false
canonicalIntentMutation=false
canonicalProjectAdmission=false
canonicalFeatureAdmission=false
HomeTerrainSourceMutation=false
SystemResourceHealthImplementation=false
~~~

<!-- [VXG RealForever][VEXLIFE-ASSORTMENT][CONTINUITY-EVENT-GRAMMAR] -->
