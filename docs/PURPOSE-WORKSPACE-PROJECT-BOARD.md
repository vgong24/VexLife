# Purpose Workspace Project Board

`[VXG RealForever]`

## Purpose

P0B-B05 makes the existing Purpose Workspace a human-visible consumer of the
accepted Project system without creating another work-state owner.

```text
Project Continuity
+ optional Project Planning
+ optional exact B04 reconciliation
-> Purpose Workspace Board / Graph projection
-> human pointer or keyboard move request
-> exact B03 typed transition request when trusted actor binding exists
-> canonical Workgraph owner remains the only lifecycle effect owner
```

B05 is a consumer and interaction adapter. It never moves a card by changing UI
state and calling that truth.

## Permanent boundaries

```text
BOARD_DRAG != DIRECT_MUTATION
BOARD_COLUMN != WORKGRAPH_LIFECYCLE
PROJECT_VIEW != EFFECT_AUTHORITY
BROWSER_PROJECT_SOURCE != PROJECT_TRUTH_OWNER
STALE_MOVE -> REJECT + FRESH_AUTHORITATIVE_PROJECTION
AMBIGUOUS_LANE_TARGET != HIDDEN_STATE_CHOICE
KEYBOARD_MOVE == SAME_TYPED_TRANSACTION_PATH_AS_POINTER_MOVE
RECONCILIATION_ANNOTATION != WORK_STATE
AUTHENTICATED_PRINCIPAL != INTENT_ACTOR_BY_IMPLICATION
```

## Canonical inputs

B05 consumes:

- one exact CURRENT `vexlife.project-continuity-snapshot/v1`;
- one source-managed BOARD ViewDefinition;
- the canonical Intent lifecycle registry;
- optional exact Project Planning runtime pointer/snapshot truth, including the canonical pointer schema/owner/source/currentness and pointer fingerprint;
- optional B04 reconciliation values bound to the same Project snapshot.

The Board and Graph themselves are delegated to the existing Project Continuity
projection functions. B05 enriches cards only with exact interaction bindings
and optional reconciliation annotations.

## Board movement

Every card carries the exact observation needed for a move request:

```text
projectSnapshotFingerprint
graphRef
expectedWorkgraphPointerSha256
expectedGraphSemanticFingerprint
expectedState
allowed next lifecycle states
target Project Board lane for each next state
```

A pointer drop identifies a target lane. It is admissible only if the target
is a different Board lane and exactly one currently allowed next lifecycle
state maps to that lane. If two or more states map to the same lane, B05 returns
`AMBIGUOUS_REJECTED`; it never chooses a hidden state.

A lane-only drop back into the card's current lane is also
`AMBIGUOUS_REJECTED`, even when exactly one intra-lane transition is currently
allowed. The pointer gesture cannot distinguish "leave this card here" from
"change hidden lifecycle state while leaving the card here." Same-lane
transitions therefore require an exact-state control.

Keyboard/screen-reader interaction selects one exact next lifecycle state and
uses the same request constructor as pointer interaction.

A stale browser observation returns `STALE_REJECTED` together with the fresh
authoritative projection. Presentation re-renders that projection rather than
optimistically preserving the requested card position.

## Trusted actor boundary

The accepted Home Bridge session sources can establish a current local human
principal, but accepted source does not currently map that principal into an
Intent `actorRef + actorRoleRef + processRef` binding.

Therefore B05 does not invent one.

Without a server-owned trusted actor binding:

```text
valid move semantics
-> EXECUTION_HELD
-> no B03 request claimed
-> no Workgraph mutation
-> fresh authoritative Board remains visible
```

When a rightful owner supplies an exact actor binding, B05 forms the existing
`vexlife.project-work-transition-request/v1` and delegates validation to B03.
Even a VALID request remains `executionAuthority=NONE` in B05; actual mutation
belongs to `owner.vexlife.intent-workgraph`.

## B05 / B06 boundary

B05 does not invent a ProjectDefinition from whatever Workgraphs happen to be
present in Vex Home.

Production browser transport therefore remains `HELD_UNAVAILABLE` until a
source-managed ProjectDefinition/View binding exists. B06 owns the actual
VexLife ToCompletion import and dogfood step.

B05 can still be proven completely with bounded synthetic Project/Workgraph
fixtures because its contract is the reusable projection + interaction adapter,
not the ToCompletion dataset itself.

The future EndToEnd + QuantumTest proof-hardening item remains a nonblocking B06
Project backlog seed. It is not a B05 completion gate.

<!-- [VXG RealForever][VEXLIFE][TOCOMPLETION][P0B][B05][PURPOSE-WORKSPACE-PROJECT] -->
