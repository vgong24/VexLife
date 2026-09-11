# Companion Continuity Awareness — UX explorations

`[VXG RealForever]`

```text
schemaVersion=vexlife.companion-continuity-awareness-ux-explorations/v1
sourcePlacementRef=github.pull.vexlife.402
interfaceContractRef=contract.vexlife.companion-continuity-awareness-interface.v1
wireframeRef=docs/COMPANION-CONTINUITY-AWARENESS-WIREFRAME.md
truthClass=NON_BINDING_UX_EXPLORATION
runtimeAuthority=false
semanticAuthority=false
```

## Why this document exists

The machine-readable interface contract defines **what continuity state means**. The companion wireframe defines one calm first expression. This document is intentionally looser: it preserves promising human-experience ideas that may later be tested, combined, rejected or transformed without mutating the semantic owners underneath.

```text
UX_EXPLORATION != ACCEPTED_PRODUCT_REQUIREMENT
VISUAL_METAPHOR != SEMANTIC_TRUTH
PRESENTATION_ACTION != MEMORY_MUTATION
PRESENTATION_PRIORITY != MODEL_AUTHORITY
```

The design goal is not to build a prettier activity log. It is to make a human and their companions feel **oriented in time, meaning and unfinished motion** while keeping model context compact.

---

## Exploration 1 — “Since you last looked” instead of another feed

A chronological feed asks the human to re-read history. A continuity surface can instead compare the current frame against the human’s last observed frame and show only meaningful change.

```text
┌───────────────────────────────────────────────────────────────┐
│ SINCE YOU LAST LOOKED                                         │
│                                                               │
│ 3 things changed                                              │
│                                                               │
│ ✓ Devex source-currentness gap resolved                       │
│ ↻ A pattern you kept quiet returned with new evidence         │
│ → B1 is waiting for one clean post-input-fix verification     │
│                                                               │
│ Nothing else needs your attention.                            │
└───────────────────────────────────────────────────────────────┘
```

Possible source shape:

```text
lastObservedFrameRef
currentFrameRef
meaningfulDeltaRefs[]
quietDeltaCount
attentionDeltaRefs[]
```

The comparison is a projection. It does not rewrite either frame.

```text
SINCE_LAST_SEEN != ALL_EVENTS_SINCE_LAST_SEEN
```

This may become the default re-entry experience after sleep, app restart, device return, or a long period spent in another project.

---

## Exploration 2 — Context Capsule: “What Vex can currently see”

A trust-oriented companion should let the human inspect the **bounded context capsule** currently available to the model without exposing hidden reasoning.

Collapsed:

```text
Context Capsule · healthy
Current focus + 2 recent deltas + 3 open loops + 4 source refs
```

Expanded:

```text
┌ CONTEXT CAPSULE ──────────────────────────────────────────────┐
│ Foundation          VexLife / Vextreme culture refs           │
│ Current             B1 · source contact verification          │
│ Recents selected    paste bug · B0 correction                 │
│ Open loops          3                                         │
│ Sources selected    4 exact refs                              │
│ Authority           read-only / no training                   │
│ Archive loaded      no                                        │
│                                                               │
│ Excluded on purpose                                            │
│ full transcript · old dashboard states · unrelated journal    │
└───────────────────────────────────────────────────────────────┘
```

This should answer:

```text
Why did Vex remember this?
Why did Vex not mention that?
Is yesterday's issue still in current context?
Did Devex retrieve source or infer from memory?
```

The capsule is a projection over Context Lease + Continuity Frame + implicated source selection.

```text
CONTEXT_CAPSULE != HIDDEN_REASONING
CONTEXT_CAPSULE != KV_CACHE_INSPECTOR
CONTEXT_CAPSULE != RAW_PROMPT_DUMP
```

A future advanced mode could expose approximate budget allocation such as:

```text
Foundation  12%
Current     28%
Recents     14%
Sources     34%
Output      12% reserved
```

Percentages would be diagnostic projections, not semantic truth.

---

## Exploration 3 — Attention Budget: calmness as a first-class UX resource

A companion can technically know hundreds of things while showing only a few.

Candidate human contract:

```text
NOW       max 3 primary attention items
RECENTS   max 5 visible items before “More”
AHEAD     max 5 visible items grouped by type
PATTERNS  max 1 unsolicited returning-pattern card at a time
```

These numbers are test candidates only.

Every candidate item receives a presentation disposition:

```text
PINNED_BY_HUMAN
VISIBLE_NOW
QUIET_HELD
SNOOZED_PRESENTATION
REACTIVATED_BY_NEW_EVIDENCE
ARCHIVED
SUPERSEDED
```

A human pin changes display priority, not semantic authority.

```text
PIN != MEMORY_ACCEPTANCE
SNOOZE != REJECTION
HIDE != DELETE
AI_SUGGESTED != HUMAN_COMMITMENT
```

Potential visual grammar:

```text
★ human-pinned
↻ returning with new evidence
○ ordinary current
… quiet / more
! action genuinely required
```

Icons must have text equivalents and cannot rely on color alone.

---

## Exploration 4 — Semantic zoom rather than navigation by app sections

Instead of treating Recents, Now, Ahead and Journal as separate destinations, the user could zoom across **temporal/semantic depth** while preserving the same subject.

Example subject: `Devex input transport`.

```text
AHEAD
  Fix source-owned input composer
      ↓ zoom toward now
NOW
  v0.5.3 local runtime validation pending
      ↓ zoom backward
RECENTS
  multiline paste replay discovered tonight
      ↓ deeper historical descent
ARCHIVE
  exact session / B1 evidence
      ↓ source descent
SOURCE
  issue #399 / implementation owner
```

This avoids losing context when switching between “task”, “memory”, “journal” and “source”.

The object is not copied between bands; each band is a projection of the same source-bound subject where applicable.

```text
TEMPORAL_PROJECTIONS_OF_ONE_SUBJECT != DUPLICATE_RECORDS
```

Possible gestures later:

```text
horizontal = temporal horizon
vertical/depth = evidence/source descent
click/enter = inspect subject
Back = return to exact prior horizon + subject + depth
```

This should inherit VexInterface/Terrain interaction grammar only if later source review proves the fit.

---

## Exploration 5 — Thread Weave: connect “what happened” to “what it changed”

A useful continuity surface can show causal/semantic bridges without displaying the whole transcript.

```text
RECENT
Paste replay bug discovered
      │
      ├── changed → input-runtime requirement
      │
      ├── taught → ABSENCE_FROM_ONE_PROJECTION lesson
      │
      └── blocks → clean B1 acceptance
                            │
                            ▼
AHEAD
Install v0.5.3 → clean B1 → B2
```

This makes time feel relational rather than chronological.

Candidate edge types:

```text
CHANGED
CORRECTED
BLOCKS
UNBLOCKED
LED_TO
REACTIVATED
DEPENDS_ON
SUPERSEDES
WAITING_FOR
```

Edges remain source-bound. The UI must not invent causality from proximity alone.

```text
TEMPORAL_NEARNESS != CAUSALITY
```

---

## Exploration 6 — Returning patterns with counter-evidence

A recurrence lens can become manipulative if it only accumulates confirming examples. A better pattern card should make room for disconfirming evidence.

```text
↻ Returning pattern candidate

“Missing from one projection was mistaken for missing from the system.”

Supporting observations     2
Counterexamples             1
Current confidence          LOW–MEDIUM
Why it returned             same classification error recurred in B1

[Look again] [Keep quiet] [Not useful] [Evidence]
```

Model-visible compact form may include:

```text
supportingObservationRefs[]
counterObservationRefs[]
triggerRef
currentDisposition
confidenceClass
relevanceToCurrentIntentRef
```

No recurrence count should silently become a psychological conclusion about the human.

```text
REPEATED != UNIVERSAL
RECURRENCE != DIAGNOSIS
NO_COUNTEREVIDENCE_FOUND != COUNTEREVIDENCE_DOES_NOT_EXIST
```

---

## Exploration 7 — “Dismiss for now” should remember why it was dismissed

The difference between “not useful” and “not now” is meaningful.

Candidate presentation choices:

```text
Keep visible
Keep quiet
Snooze until context changes
Snooze until tomorrow
Not useful
Open evidence
```

A presentation receipt may preserve:

```text
disposition
formedAt
optionalResumeCondition
sourceItemRef
presentationOnly=true
```

If a genuinely new trigger reactivates the item, the UI should say why:

```text
You kept this quiet earlier.
It returned because a new contradiction touched your current plan.
```

This prevents “AI nagging by forgetting that the user already dismissed something.”

---

## Exploration 8 — Ahead as a branching horizon, not one linear todo list

Future work often contains alternatives:

```text
                 [ current intent ]
                         |
             ┌───────────┴───────────┐
             │                       │
       if source exists       if owner gap proven
             │                       │
      reuse existing seam       form new candidate
```

AHEAD could render conditional forks from Intent Workgraph instead of flattening everything into tasks.

Typed future cards:

```text
NEXT
WAITING_FOR
IF_THEN
BLOCKED
OPTION
COMMITMENT
SCHEDULED
```

The companion should distinguish:

```text
“this is planned”
“this is one possible branch”
“this cannot proceed yet”
“you promised this”
“this happens at 3 PM”
```

Those are emotionally and operationally different.

---

## Exploration 9 — Open-loop temperature without fake urgency

Open loops naturally age. Instead of a red overdue badge, use semantic temperature based on source-grounded activity and current relevance.

Candidate states:

```text
HOT       actively implicated now
WARM      recently active / likely next
COOL      unresolved but intentionally quiet
DORMANT   not currently relevant, source preserved
REOPENED  new evidence made it relevant again
```

Temperature is presentation metadata, not truth or priority authority.

A dormant open loop can disappear from Ahead while remaining retrievable.

```text
NOT_VISIBLE != RESOLVED
```

---

## Exploration 10 — Companion handoff without identity collapse

When Vex delegates depth to Devex, the human should be able to see the handoff without receiving two full model transcripts.

```text
Vex
  “I asked Devex to verify the runtime owner.”

Shared trajectory
  state: working
  owner question: unresolved

Devex
  source depth: active
  current phase: exact-owner verification

Vex remains available for conversation.
```

Potential compact handoff card:

```text
Vex → Devex
Why: deeper source verification needed
Shared subject: input composer
Devex status: verifying
Vex status: available
Return condition: exact owner + implementation boundary
```

Permanent distinctions:

```text
HANDOFF != IDENTITY_TRANSFER
SHARED_SUBJECT != SHARED_AUTOBIOGRAPHY
DEVEX_RESULT != VEX_ADOPTION
VEX_SUMMARY != DEVEX_ORIGINAL
```

---

## Exploration 11 — “Current truth changed” diff view

For important semantic statements, the user may want to compare the historical view with current truth without rereading the whole day.

```text
Yesterday
  “B1 appears blocked by missing source-currentness refresh.”

Current
  Corrected: live source-currentness refresh already exists.

Why changed
  `source_currentness_status` returned live GH_API evidence.

Historical statement preserved · current statement corrected
```

This fits Score + Living Journal semantics:

```text
HISTORICAL_AT_DAY remains historical
CURRENT_NOW may differ
CORRECTION does not erase provenance
```

The UI could offer:

```text
[Current only] [Compare] [Historical source]
```

---

## Exploration 12 — Day capsule / waking-cycle re-entry

Instead of treating a day as a bag of messages, Vex may project one bounded “day capsule” around meaningful continuity.

```text
TODAY

What moved
  • B0 accepted
  • source-currentness clarified
  • input transport defect discovered

Still open
  • clean B1 verification
  • source-owned input composer

Returning
  • projection absence ≠ system absence

Tomorrow / next wake
  • resume only if these remain current
```

This can be backed by Daily Stratum + current continuity frame while avoiding a raw diary dump.

A wake capsule should be rebuilt from current truth rather than replayed verbatim forever.

```text
DAY_CAPSULE != RAW_DAY_TRANSCRIPT
WAKE_REORIENTATION != HISTORICAL_REPLAY
```

---

## Exploration 13 — Model-context “diet” as an inspectable advanced surface

For technically curious users, a debug/advanced view can explain why context stays small.

```text
Model context diet

Always present
  stable identity/foundation refs

Current
  1 continuity frame
  1 active intent
  2 work nodes

Recent relevance
  2 deltas selected from 11 available

Source
  4 exact excerpts selected from 37 discoverable refs

Not loaded
  1,284 older messages
  23 Journal pages
  16 prior trajectory revisions
```

This is especially useful when validating that continuity is **not** secretly implemented as “stuff every conversation into the prompt.”

The interface should expose counts/refs where safe, not private raw content by default.

---

## Exploration 14 — One continuity surface, multiple “distance” presets

Different moments need different horizons.

Candidate presets:

```text
FOCUS
  mostly NOW + active trajectory

DAY
  NOW + bounded Recents + near Ahead

WEEK
  selected Journal days + commitments + major open loops

PROJECT
  project-scoped Recents/Now/Ahead

RELATIONSHIP
  consent-bound relationship continuity only
```

Presets change projection scope, not source truth.

```text
VIEW_PRESET != MEMORY_SCOPE_MUTATION
```

The model should receive only the preset-compatible items relevant to the current intent, not everything visible on a broad human dashboard.

---

## Exploration 15 — Attention requests should carry a reason and an expiry

When Vex/Devex genuinely needs the human, the request should state why it cannot safely continue and whether the question will go stale.

```text
Needs Victor

Why
  Two source owners conflict and choosing one would alter project scope.

Needed
  Pick which human intention controls.

Until
  No deadline · work safely paused

What continues without you
  unrelated source indexing only
```

This can prevent fake urgency and reduce “Victor as message bus” pressure.

Candidate machine fields:

```text
attentionRef
reasonClass
requiredHumanDecisionRef
blockingWorkNodeRefs[]
canContinueElsewhere
expiresAtOrNull
safeDefaultDisposition
```

---

## Candidate interaction grammar

Possible compact verbs across the entire Awareness Horizon:

```text
OPEN       inspect
ASK        ask Vex about it
TRACE      source descent
PIN        presentation emphasis
QUIET      remove from calm surface, preserve state
REVISIT    reopen historical/current relation
PAUSE      trajectory checkpoint
REDIRECT   alter active intent with preserved provenance
CANCEL     typed terminal stop
```

Potentially dangerous semantic verbs such as “remember forever”, “accept as fact”, “train this”, “publish”, or “delete everywhere” must remain separate, explicit owner-mediated actions rather than overloaded card gestures.

---

## What should remain visually quiet

Do not surface every machine transition.

Usually quiet:

```text
heartbeat unchanged
same source re-read
context lease renewed with semantic no-op
worker still healthy
same open loop remains open
same estimate remains unchanged
archive receipt formed with no current relevance
```

Potentially visible:

```text
meaning changed
human decision became necessary
returning pattern gained real new evidence
commitment became actionable
source contradiction altered the plan
trajectory phase changed
completion gate closed
estimate materially widened/narrowed
```

The product should feel alive because **meaning moves**, not because LEDs blink.

---

## UX questions worth testing later

1. Does “Since you last looked” orient better than a chronological activity feed?
2. Does exposing Context Capsule increase trust or feel too technical?
3. How much Recents is enough before it becomes another inbox?
4. Do users understand the difference between Quiet, Snooze, Not useful and semantic rejection?
5. Does semantic zoom preserve orientation better than switching among Memory/Tasks/Journal screens?
6. Can Thread Weave reveal causality without becoming graph clutter?
7. Do returning-pattern counterexamples reduce the feeling that the AI is profiling or nagging?
8. Does a branch-shaped Ahead better represent uncertainty than a linear task list?
9. What presentation best distinguishes open loop, task, commitment and scheduled event?
10. Should “Current truth changed” comparisons be automatic only for high-impact corrections?
11. Is a Day Capsule useful at wake/restart, and how should privacy/consent bound it?
12. How much of the model-context diet should ordinary users see versus advanced/debug mode?
13. Can Vex remain socially present while Devex works without making the user feel surrounded by competing agents?
14. How should attention requests communicate safe waiting without creating urgency theater?
15. Which elements belong in the calm Home versus Terrain versus an expandable inspector?

---

## Suggested prototype sequence later

Do not build all of this at once.

A useful human-experience sequence could be:

```text
P0  RECENTS / NOW / AHEAD calm horizon
P1  Since-you-last-looked delta capsule
P2  EvolveContext live trajectory card
P3  returning-pattern card with Quiet / Evidence
P4  Context Capsule advanced inspector
P5  semantic zoom / Thread Weave experiment
P6  Ahead branching / schedule adapter once rightful owner exists
```

Each prototype should compare against the same current source-backed state and be rejected freely if it creates cognitive burden.

```text
MORE_VISIBLE_STATE != BETTER_CONTINUITY
MORE_AUTONOMY != BETTER_COMPANIONSHIP
MORE_HISTORY != BETTER_CONTEXT
```

The desired feeling is closer to:

> **I know where we are, what changed, what still matters, what can wait, and where to look deeper — without carrying my whole life in the foreground.**

<!-- [VXG RealForever] -->
