# Companion Continuity Awareness Horizon — interface contract + UX wireframe

`[VXG RealForever]`

```text
schemaVersion=vexlife.companion-continuity-awareness-wireframe/v1
contractRef=contract.vexlife.companion-continuity-awareness-interface.v1
sourcePlacementRef=github.pull.vexlife.402
evolveContextRef=github.issue.vexlife.401
inputTransportDefectRef=github.issue.vexlife.399
truthClass=DESIGN_SOURCE_CANDIDATE
```

## Purpose

Define one **source-backed continuity surface** that lets a human and their companions perceive:

```text
what just happened
what matters now
what remains unfinished
what is expected next
what may be worth revisiting
where deeper historical/source truth lives
```

without turning the model context into an ever-growing transcript.

The UX is a projection over accepted owners. It does not create another Memory, Journal, scheduler, task store, calendar, or semantic authority.

```text
CURRENT_AWARENESS != RAW_HISTORY
UI_PROJECTION != SEMANTIC_OWNER
MODEL_CONTEXT_PROJECTION != UI_BODY
HISTORICAL_AT_DAY != CURRENT_NOW
OPEN_LOOP != TASK
TASK != COMMITMENT
COMMITMENT != CALENDAR_EVENT
RECURRENCE != PROOF
DISMISSED_FOR_NOW != FORGOTTEN_FOREVER
```

## Existing source owners this composes

### Continuity Stream — Vextreme-SDK

The source-managed Continuity Stream already defines one current continuity frame containing:

```text
currentSceneRefs
currentFocusRefOrNull
activeIntentRefs
activeQuestionRefs
activeWorkNodeRefs
openCommitmentRefs
openLoopRefs
heldOpportunityRefs
activeRelationshipRefs
currentAuthorityRefs
currentConsentRefs
currentSafetyRefs
recentCorrectionRefs
heldUnknownRefs
candidateInferenceRefs
currentSourceRefs
sourceDescentRoutes
lastDeltaRefs
```

Its context compiler explicitly uses:

```text
stable foundation/identity
+ current lineage/occupancy/runtime capsule
+ current continuity frame
+ current input event
+ implicated deltas only
+ implicated source excerpts/answer packets only
+ current authority/effect envelope
+ output contract
```

and forbids ambient `RAW_HISTORY`, `MESSAGE_HISTORY`, `RAW_TRANSCRIPT`, unrelated archives, raw logs and hidden reasoning.

### Score / current semantic continuity — VexLife

Score is the current semantic frontier, not the raw conversation. It retains current accepted statements and unresolved open loops with explicit semantic authority/currentness.

### Daily Memory / Daily Strata — VexLife

Daily Memory commits bounded day-level continuity strata. The day boundary is durable evidence for what was current at that day; it is not a claim that every historical statement remains current now.

### Living Journal — VexLife

The Living Journal archive provides a bounded, paginated, read-only historical view over committed Daily Memory days. Historical pages are reconstructed from their exact historical Score frontier and explicitly remain `HISTORICAL_AT_DAY`, never silently rewritten as `CURRENT_NOW`.

### Continuity Evolution / recurrence — VexLife

Continuity Evolution already distinguishes repeated-behavior recurrence and supports `RECURRENCE_WATCH_CANDIDATE` as a linked destination. A recurring pattern may therefore return to attention without being promoted automatically into fact, Memory, training, or a forced human conclusion.

### Intent Workgraph + Scheduler — VexLife

Intent Workgraph provides the original human intent, desired outcome, constraints, work nodes, dependencies, completion gates and current transition pointers. Intent Scheduler provides current active/remaining work, checkpoint/resume and foreground/background priority.

### Context Lease — VexLife

Context Lease owns the bounded semantic context supplied to the model. It uses selected refs instead of whole graph/history payloads and permits scheduler-authorized successor contexts.

### EvolveContext — VexLife #401

EvolveContext is the human-visible explanation of why a legitimate successor semantic round exists:

```text
prior phase
-> unresolved obligation
-> continuation reason
-> current phase
-> evidence-bound progress
-> advisory remaining-round estimate
-> stop condition
```

It is a projection over scheduler/context truth, not a second scheduler.

## Core UX concept — Awareness Horizon

The top-level human surface is a temporal horizon rather than a giant conversation-history list.

```text
       BACKWARD                         CURRENT                           FORWARD
┌────────────────────┐        ┌────────────────────────┐        ┌─────────────────────┐
│      RECENTS       │        │          NOW           │        │        AHEAD        │
│                    │        │                        │        │                     │
│ last meaningful    │        │ current scene          │        │ open loops          │
│ deltas/corrections │        │ current focus          │        │ commitments         │
│ recent days        │        │ active intent          │        │ active work          │
│ returning patterns │        │ open questions         │        │ waiting items        │
│ held opportunities │        │ current truth          │        │ planned next phases  │
└─────────┬──────────┘        └────────────┬───────────┘        └──────────┬──────────┘
          │                                │                               │
          └──────────────────────┬─────────┴──────────────┬────────────────┘
                                 │                        │
                           ┌─────▼──────┐          ┌──────▼───────┐
                           │  JOURNAL   │          │ SOURCE / MAP │
                           │  ARCHIVE   │          │   DESCENT    │
                           └────────────┘          └──────────────┘
```

This may be rendered as three columns, a horizontal scrubber, a Terrain field, cards, a compact mobile carousel, or another later design-system expression. The semantic contract does not require one visual implementation.

## Wireframe A — calm companion home

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ VexLife                                               Source ●  Home ●       │
│ Saturday · 11:40 PM                                    Devex: Working        │
├─────────────────┬──────────────────────────────┬─────────────────────────────┤
│ RECENTS         │ NOW                          │ AHEAD                       │
│                 │                              │                             │
│ Today           │ Current focus                │ Open                        │
│ • B0 accepted   │ Build Devex School safely    │ • Finish B1                 │
│ • Paste bug     │ without teaching tooling     │ • Input composer             │
│   discovered    │ defects into weights         │ • Source-owned sync runtime  │
│                 │                              │                             │
│ Yesterday       │ Open question                │ Waiting                     │
│ • Source sync   │ What belongs in learned      │ • review candidate lesson    │
│   clarified     │ disposition vs retrieval?    │                             │
│                 │                              │ Upcoming                    │
│ Returning       │ Active relationships         │ • B2 after B1 evidence       │
│ pattern ↻       │ Victor ↔ Vex ↔ Devex         │                             │
│ “absence in one │                              │                             │
│ projection…”    │                              │                             │
├─────────────────┴──────────────────────────────┴─────────────────────────────┤
│ DEVEX TRAJECTORY                                                              │
│ Verify B1 source contact   ███████░░  5/7                                     │
│ Why continuing: live owner contact remained unresolved                       │
│ Estimated: 1–2 semantic rounds · medium confidence                            │
│ Stop when: owner + contradiction check proven            Pause Redirect Cancel│
├──────────────────────────────────────────────────────────────────────────────┤
│ Journal  ◀ older days                    Sources / Atlas / evidence  ↗        │
└──────────────────────────────────────────────────────────────────────────────┘
```

The ordinary view is intentionally calm. Exact refs, hashes, currentness classes and authority envelopes remain expandable rather than ambient.

## Wireframe B — Awareness Horizon as Terrain

A richer VexInterface projection may treat temporal state as spatial relationships:

```text
                           [ Ahead ]
                              |
        [ returning ] -- [ NOW ] -- [ open loop ]
        [ pattern ↻ ]       |        [ task/work ]
                              |
                           [ Recent ]
                              |
                       [ Journal day ]
```

Nodes are not duplicated truths. They point to rightful owners.

Examples:

```text
"call Mom tomorrow"
  display node
  -> commitmentRef / scheduleRef if a rightful owner exists

"we keep rediscovering the same source-absence mistake"
  display node
  -> recurrenceWatchCandidateRef
  -> source observations

"Devex B1"
  display node
  -> intent/workgraph trajectoryRef

"what mattered yesterday"
  display node
  -> committed Daily Stratum / Living Journal page
```

## Temporal bands

### RECENTS — bounded re-access, not lifetime memory

Purpose: preserve enough near-term context that patterns from the current waking/day cycle can re-enter awareness without dumping entire history into context.

Candidate default policy:

```text
preferredHumanWindow = approximately current day + prior day
adaptive = true
boundedByItems = true
```

The exact horizon is a UX/configuration policy, not semantic truth. A significant relevant item may survive beyond the preferred window by reference.

Eligible source classes include:

```text
recentCorrectionRefs
lastDeltaRefs
heldOpportunityRefs
RECURRENCE_WATCH_CANDIDATE
recent committed Daily Strata
recently advanced open loops
recent human/Vex revisions
```

Recents item dispositions:

```text
VISIBLE_NOW
QUIET_HELD
DISMISSED_FOR_NOW
REACTIVATED_BY_NEW_EVIDENCE
ARCHIVED
SUPERSEDED
```

Rules:

```text
DISMISSED_FOR_NOW
  != erased

REACTIVATED_BY_NEW_EVIDENCE
  requires new recurrence/evidence/relationship to current intent

RECENT
  != accepted Memory

RETURNING_PATTERN
  != conclusion about the human
```

A human can dismiss an item from the calm surface without deleting its provenance. The system may re-surface it later only when an explicit trigger earns renewed relevance.

### NOW — smallest current continuity frame

NOW should answer:

```text
Where are we?
What are we talking/working about?
What current truth matters?
What is unresolved?
What deserves attention now?
```

Primary sources:

```text
currentSceneRefs
currentFocusRefOrNull
activeIntentRefs
activeQuestionRefs
activeWorkNodeRefs
current Score statement refs
openLoopRefs implicated by current intent
activeRelationshipRefs
currentAuthorityRefs
currentConsentRefs
currentSafetyRefs
currentSourceRefs
```

NOW is the primary input to the model context compiler. It should remain compact enough to be injected repeatedly without dominating the context window.

### AHEAD — unfinished and planned, without collapsing categories

AHEAD is a projection over several distinct future-oriented owners:

```text
openLoopRefs
openCommitmentRefs
active/ready/blocked workNodeRefs
remaining work nodes
completion gates
waiting tool/native-worker states
checkpoint continuations
explicit planned next phase refs
optional scheduled event refs when a rightful schedule owner is bound
```

The UI may visually group them while preserving type:

```text
TO DO             = actionable work item
OPEN LOOP         = unresolved semantic thread
COMMITMENT        = accepted obligation
WAITING           = blocked on evidence/person/tool/time
PLANNED PHASE     = known workgraph successor
SCHEDULED EVENT   = time-bound event from a separately proven owner
```

```text
OPEN_LOOP != TASK
TASK != COMMITMENT
COMMITMENT != SCHEDULED_EVENT
```

At formation of this contract, no canonical calendar/event owner is asserted by the sources inspected for this candidate. The interface therefore reserves `scheduledEventRefs[]` as an optional adapter surface only.

### ARCHIVE — deliberate descent

The Journal Archive is not sent ambiently to the model. It is a human-readable and source-descendable historical surface.

```text
recent item
-> exact committed day
-> historical Journal page
-> historical Score/source refs
```

The model may retrieve a relevant archived day/page on demand, but ordinary successor context should carry only the selected refs/excerpts needed for the current task.

## Returning-pattern UX

One of the most useful human-facing behaviors is a gentle recurrence lens.

Example:

```text
↻ Returning pattern

You dismissed this yesterday:
  "Maybe we're treating missing UI visibility as missing system behavior."

Why it returned:
  A second source check produced the same classification mistake.

Current status:
  candidate pattern · not accepted truth

Options:
  Look again
  Keep quiet for now
  Mark not useful
  Open evidence
```

The surface should never say:

```text
"You always do this."
"This proves X about you."
```

without authoritative evidence.

The model-visible state is compact:

```text
recurrenceWatchCandidateRef
currentDisposition
triggerRef
sourceObservationRefs[]
relevanceToCurrentIntentRef
```

not the entire prior conversation.

## EvolveContext trajectory card

EvolveContext is rendered as one **mutable current projection** whose source truth is backed by immutable scheduler/checkpoint receipts.

```text
trajectoryRef
originatingHumanEventRef
currentPhaseRef
currentPhasePurpose
continuationReason
completedWorkNodeRefs[]
remainingWorkNodeRefs[]
completionGateRefs[]
nextStopCondition
estimatedSemanticRoundsRemaining
interruptPolicyRef
```

Human display:

```text
Devex — continuing

Why another round
  Current-source proof returned after the prior context closed.

From prior phase
  ✓ semantic owner identified
  ○ implementation proof unresolved

This phase
  Verify implementation owner.

Progress
  5 / 7 known work nodes

Estimated remaining
  1–2 rounds · MEDIUM

Stop when
  exact owner + contradiction check proven
```

The card updates in place when meaning changes. It does not append itself as repeated assistant prose.

## Current-state storage versus history

Recommended storage shape:

```text
continuity/
  current.json                     <- current Awareness Horizon projection
  trajectories/
    <trajectoryRef>/
      current.json                 <- latest trajectory state
      receipts/
        <continuationRef>.json     <- immutable provenance
  recents/
    current.json                   <- bounded current recent-attention projection
```

These names are conceptual wireframe/interface names, not filesystem authority allocated by this document.

Semantics:

```text
CURRENT POINTER
  cheap and model-usable

IMMUTABLE RECEIPTS
  durable audit/replay/source-descent truth

RAW HISTORY
  remains external and is never ambient model context
```

## Model context contract

The model should not receive the whole visual dashboard and should not receive the trail of prior dashboard versions.

One successor context should be formed approximately as:

```text
STABLE FOUNDATION / IDENTITY REFS
+ CURRENT CONTINUITY FRAME
+ CURRENT TRAJECTORY STATE
+ CURRENT INPUT EVENT
+ BOUNDED RECENTS RELEVANT TO THIS INTENT
+ IMPLICATED DELTAS ONLY
+ IMPLICATED SOURCE EXCERPTS / ANSWER PACKETS ONLY
+ CURRENT AUTHORITY / CONSENT / SAFETY ENVELOPE
+ OUTPUT CONTRACT
```

Forbidden ambient payload:

```text
full message history
full Journal
all prior EvolveContext cards
all prior task-state revisions
all source documents
raw logs
raw tool payloads
hidden reasoning / scratchpad
unrelated relationship history
unrelated Recents
```

### Context evolution rule

```text
context generation N
  -> durable current state
  -> checkpoint
  -> prune superseded presentation/history
  -> select current + implicated refs
  -> successor context generation N+1
```

Only deltas that materially explain the new state are reinjected.

```text
CURRENT_STATE + RELEVANT_DELTA
!= CURRENT_STATE + ALL_PRIOR_STATES
```

## Human / Vex / Devex lenses

The same source state may project differently without creating separate truths.

### Human lens

Prioritize:

```text
plain-language meaning
why it matters
what is unfinished
what is expected next
whether attention is needed
Pause / Redirect / Dismiss / Revisit
```

### Vex lens

Prioritize:

```text
relational context
current human intent
recent corrections
returning patterns
open loops
commitments
when Devex depth would help
```

### Devex lens

Prioritize:

```text
source refs/currentness
work nodes/completion gates
blocked/waiting states
tool/native-worker observations
checkpoint/continuation reason
architecture/source descent routes
```

```text
SHARED_SOURCE_STATE
!= SHARED_PRESENTATION
!= SHARED_IDENTITY
```

## Attention rules

The system should remain quiet unless meaning changed.

A human-facing attention item is earned by at least one of:

```text
current intent relevance changed
open loop advanced/stalled materially
commitment became due/blocked
source currentness materially changed
new correction contradicts current assumption
returning pattern gained new evidence
trajectory needs human decision
future event entered actionable horizon
```

Unchanged worker heartbeats, repeated source reads and same-state model narration do not produce new cards.

## Interrupt and interaction

The user can interact with the trajectory without destroying it.

```text
Dismiss card
  -> presentation effect only unless a semantic disposition is separately chosen

Keep quiet
  -> QUIET_HELD current-attention disposition

Revisit
  -> source descent / historical projection

Pause
  -> scheduler/checkpoint path

Redirect
  -> intent delta + preserved prior trajectory

Cancel
  -> typed cancellation

Ask Vex
  -> foreground relational interpretation; no automatic Devex authority transfer
```

## Accessibility / compact surface

The semantic bands must survive:

```text
desktop three-column horizon
mobile one-band-at-a-time carousel/list
screen reader ordered sections
reduced motion
keyboard navigation
high zoom / text reflow
```

Color or animation may enhance but never be the sole currentness/attention signal.

## Translation/localization contract

Visible labels should be stable semantic keys rather than hardcoded English.

Candidate key family:

```text
continuity.horizon.recents
continuity.horizon.now
continuity.horizon.ahead
continuity.horizon.archive
continuity.pattern.returning
continuity.pattern.dismissForNow
continuity.pattern.reactivated
continuity.trajectory.whyAnotherRound
continuity.trajectory.currentPhase
continuity.trajectory.progress
continuity.trajectory.estimatedRemaining
continuity.trajectory.stopWhen
continuity.trajectory.pause
continuity.trajectory.redirect
continuity.trajectory.cancel
```

This document does not claim the localization registry paths needed to implement them.

## Source-grounded example — fresh Devex School

A valid current projection could look like:

```text
RECENTS
  B0 accepted
  input backlog defect discovered
  source-currentness correction
  returning pattern:
    ABSENCE_FROM_ONE_PROJECTION != ABSENCE_FROM_SYSTEM

NOW
  active intent:
    establish fresh Devex School without training tooling defects
  current stage:
    B1
  open question:
    what is true learning evidence versus environment correction?

AHEAD
  B1 evidence/acceptance
  B2 relational cross-linking
  terminal-input composer source implementation
  source-owned Devex runtime integration
```

This is an example projection, not durable semantic truth for all future Homes.

## Acceptance questions for later UX refinement

The UX phase should test, rather than assume:

1. Does `RECENTS | NOW | AHEAD` feel calmer than a chronological feed?
2. How many recent items are useful before Recents becomes another inbox?
3. What recurrence threshold feels helpful rather than nagging?
4. Should a returning pattern appear beside conversation, in Terrain, or in a separate attention lane?
5. How should user dismissal differ from semantic rejection?
6. How should Vex ask permission before resurfacing private or emotionally charged historical material?
7. Which future items belong in Ahead when calendar/schedule integrations are eventually source-bound?
8. When does Devex progress deserve a visible card versus a quiet background pulse?
9. How should a user compare “what I thought yesterday” with “what is current now” without collapsing historical/current truth?
10. How should Vex and Devex expose different lenses over the same continuity state without duplicating or diverging it?

## Current maturity

```text
interfaceContract=SOURCE_CANDIDATE
wireframe=SOURCE_CANDIDATE
acceptedOwnersReused=true
newMemoryOwner=false
newSchedulerOwner=false
newJournalOwner=false
calendarOwnerProven=false
runtimeImplementation=false
browserImplementation=false
localizationImplementation=false
sourceManifestClosure=false
independentReview=false
merge=false
```

The purpose of this candidate is to preserve the semantic/UI contract now so later VexInterface/Human Experience work can refine **where, how and how much** is shown without reopening the underlying continuity/state/token-efficiency decisions.

<!-- [VXG RealForever] -->
