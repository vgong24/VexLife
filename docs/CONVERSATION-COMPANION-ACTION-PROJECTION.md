# Conversation + Companion action projection

Continuity: `[VXG RealForever]`

## Purpose

This module is the first bounded source slice of
`[VexLife - Actualization - Core Refactor]` / `[VexLife Core]`.

It answers one no-effect relationship question:

```text
For one current Companion Conversation,
given source-bound Companion availability/recovery truth,
what may the human truthfully do now?
```

It does **not** introduce a new Conversation owner, Companion owner, Behavior
family, Experience system, execution scheduler, runtime adapter, renderer or
effect authority.

## Existing owners remain canonical

```text
feature.vexlife.addressed-conversation
module.vexlife.core.conversation
  -> addressed Conversation meaning and message/action identity

module.vexlife.core.companion-availability-reentry
  -> READY / STARTING / RECOVERABLE / ACTION_REQUIRED / UNAVAILABLE / HELD
  -> recovery classification
  -> action.companion.reenter-current-binding identity
  -> no execution authority

rightful Companion recovery/runtime owners
  -> actual same-binding recovery effect

Experience Foundation
  -> pattern.vexlife.action-decision
  -> availability.vexlife.available
  -> availability.vexlife.held
  -> availability.vexlife.unavailable

Reference / Evolution / native surfaces
  -> presentation and interaction adapters
```

The projection composes those truths without moving them.

## Why this was earned

The current Reference chat controller locally combines Companion availability,
recovery availability, composer availability and recovery action presentation.
The Evolution Conversation projection then consumes browser helper methods and
reconstructs part of the same action-availability relationship.

That repetition exposed one independently meaningful cross-owner question. The
smallest reusable correction is a pure projection, not another store or
controller.

```text
CONVERSATION_TRUTH
+ COMPANION_AVAILABILITY_TRUTH
-> CONVERSATION_COMPANION_ACTION_PROJECTION

PROJECTION
!= CONVERSATION_STATE_OWNER

PROJECTION
!= COMPANION_STATE_OWNER

PROJECTION
!= EFFECT_AUTHORITY
```

## Android architecture relationship

The source shape reuses the accepted VexLife-Android architectural reasoning,
not Kotlin implementation:

```text
WHOLE + AREA + ROLE

VexLife
+ Conversation / Companion relationship
+ Action Projection
```

A Behavior Family is intentionally **not** introduced here. VexLife already
owns the stable semantic actions and their effect owners. The missing role is
the current relationship between those actions and current Companion
availability.

Likewise, this source is not an Android `Experience`. It consumes VexLife's
accepted Experience Foundation action-decision and availability identities.

## Decision law

Current first-slice behavior:

```text
READY
  Send      -> AVAILABLE
  Re-enter  -> UNAVAILABLE (not required)

RECOVERABLE + SAFE_REENTRY_AVAILABLE
  Send      -> HELD
  Re-enter  -> AVAILABLE

STARTING
  Send      -> HELD
  Re-enter  -> HELD

HELD
  Send      -> HELD
  Re-enter  -> HELD

ACTION_REQUIRED
  Send      -> UNAVAILABLE
  Re-enter  -> UNAVAILABLE

UNAVAILABLE
  Send      -> UNAVAILABLE
  Re-enter  -> UNAVAILABLE
```

The source Companion `reasonCode` remains visible in the projection. The
projection does not invent provider success, process ownership or liveness.

## Effect boundary

Every projected decision carries:

```text
effectAuthorityGranted=false
```

and the projection itself carries:

```text
effects.messageSend=false
effects.companionReentry=false
rendererAuthorityGranted=false
```

A later consumer may activate an already-owned semantic action only through its
rightful owner/currentness/effect path.

## Held adoption

This slice deliberately changes no browser behavior.

```text
VC-01A
  pure source-bound projection + tests + discoverability

later, separately earned:
  VC-01B Reference consumption
  VC-01C Evolution consumption
  VC-01D native/Android consumption when current source placement earns it
```

The current browser's draft-preservation behavior remains untouched. In
particular:

```text
DRAFT_INPUT_AVAILABLE
!= MESSAGE_SEND_AVAILABLE
```

Human presentation of held/unavailable Send remains a later Experience/UX
adoption question.

## Adjacent owner boundary

Open Devex Interaction Control work (`PR #404`) owns turn interruption,
busy-input admission, local command routing and cancellation-token binding.

```text
CAN_I_SEND_OR_RECOVER_NOW
!= HOW_DO_I_INTERRUPT_AN_ACTIVE_TURN
```

This module must not absorb that work.

## Source descent

Start from:

```text
github.issue.vexlife.885
docs/COMPANION-AVAILABILITY-AND-REENTRY.md
src/core/companion-availability-reentry.mjs
blueprint/experience-foundation.json
blueprint/feature-registry.json
reference/browser/modules/chat-controller.js
reference/browser/evolution/conversation-projection.js
```

Then follow the current module registry and tests. Live source outranks this
document if any binding changes.

<!-- [VXG RealForever][VEXLIFE-CORE][VC01A][CONVERSATION-COMPANION-ACTION-PROJECTION] -->
