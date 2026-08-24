# VexLife Review Architecture — composed review contract

`[VXG RealForever]`

## Status and purpose

```text
schemaVersion=vexlife.review-architecture/v1-candidate
architectureRef=architecture.vexlife.review-composition.001
status=CANDIDATE_DOCUMENTATION_ONLY
structureDecision=EXTEND_EXISTING
newRootRegistryCreated=false
newCanonicalJourneyOwnerCreated=false
runtimeImplementationCreated=false
```

VexLife Review Architecture defines how existing canonical feature, interface,
experience, journey, evidence, concern and health owners compose into one
source-descendable review plan and exact-current coverage receipt.

It exists so future feature work can answer, without reviewer memory or a
repository-wide grep:

```text
What is being reviewed?
Which existing source owns each expectation?
Which actions, states, permissions and effects are implicated?
Which forward, return, recovery and no-op paths must remain coherent?
Which environments were actually exercised?
What evidence binds the exact candidate?
What remains failed, held, unknown or not applicable?
Which lesson or concern was learned without converting it into automatic law?
```

This contract does not make one mega-review registry. It composes existing
owners and admits new canonical fields only after a repeated source-placement
gap is proved.

## Governing non-collapse

```text
REVIEW_ARCHITECTURE != NEW_REVIEW_REGISTRY
FEATURE_IDENTITY != REVIEW_RESULT
REVIEW_LENS != EXECUTABLE_TEST
EXPERIENCE_CONTRACT != RENDERER_COMMAND
JOURNEY_EVENT != RAW_POINTER_LOG
TRAVERSAL_GRAPH != CANONICAL_JOURNEY_OWNER
SCREENSHOT_EVIDENCE != SEMANTIC_PROOF
COVERAGE_RECEIPT != CANONICAL_PRODUCT_MEANING
FINDING_RECORDED != WORK_ADMITTED
AUTHOR_SELF_AUDIT != INDEPENDENT_ASSURANCE
BROWSER_PASS != NATIVE_PLATFORM_CONFORMANCE
PR_COMMENT_HISTORY != CURRENT_CANONICAL_SOURCE
CURRENT_CANONICAL_SOURCE != PERMISSION_TO_ERASE_HISTORY
PLAN_FORMATION_NO_EFFECT != EXECUTION_MUST_BE_NO_EFFECT
RENDERED_CLICKABILITY != EFFECT_ADMISSION
```

## Existing semantic owners

### Feature Registry

Owns feature identity, purpose, human introduction, canonical nodes, state,
action, permission, process, module, localization, test, platform, resource,
data, effect, concurrency, rollback and projection relationships.

### Review Lens Registry

Owns the questions a feature class must answer and the evidence classes required
to answer them.

### Interface Blueprint and registries

Own screen, region, element, interaction, action, permission, state,
localization, accessibility and Terrain identities.

### Experience Registry

Owns experience profiles, gesture contracts, vessels and platform-neutral human
interaction grammar.

### Semantic Journey

Owns append-only semantic transition and interaction provenance. Raw click or
pointer paths remain ephemeral.

### Experience Review Kit

Owns sparse semantic capture requests, renderer-specific adapters, normalized
exact-source evidence, screenshots and the human-facing review package.

### Browser and native owner-domain suites

Own executable environment-specific assertions. Browser suites do not become
portable semantics or native evidence.

### Build Health and PR-ready

Own exact-current result admission and compact health projection. They consume
review evidence; they do not redefine the feature or experience contract.

### ConcernWatch

Owns source-bound concern identity, recurrence, threshold and work-admission
boundaries. A failed review step does not automatically create a new competing
debt ledger.

### Process Factory worked examples and evolution routes

Own attributed observed outcomes, corrections learned and bounded learning
candidates. A lesson is not automatically accepted as a universal rule.

## Composition topology

```text
Feature Registry
+ Review Lens Registry
+ interface/action/state/permission identities
+ Experience Registry
+ Journey provenance
+ environment owner-domain suites
        ↓
Review Expectation Compiler (read-only)
        ↓
Review Coverage Receipt
        ↓
Experience Review Kit evidence package
+ ConcernWatch / Process Factory routes when implicated
        ↓
PR-ready / Health consumption
        ↓
fresh Independent Assurance and lifecycle decision
```

The compiler is a read-side composition. It must not mutate a feature, add a
Journey event, admit work, approve a PR or execute an effect.

## Review expectation compilation

For one exact feature or change scope, the compiler should resolve references to
existing canonical sources and emit a bounded `ReviewExpectationSet` projection.

```text
ReviewExpectationSet
  expectationSetRef
  sourceVersionRef
  featureRefs[]
  reviewLensRefs[]
  canonicalNodeRefs[]
  screenRefs[]
  regionRefs[]
  elementRefs[]
  stateOwnerRefs[]
  stateRefs[]
  actionRefs[]
  permissionRefs[]
  effectClasses[]
  processRefs[]
  moduleRefs[]
  localizationRefs[]
  platformRefs[]
  testRefs[]
  rollbackRouteRefs[]
  projectionRefs[]
  humanIntroductionRefs[]
  knownGapRefs[]
  heldConditionRefs[]
  unresolvedRefs[]
```

This is a projection of refs, not a copy of their canonical records.

Compiler outcomes should remain typed:

```text
COVERAGE_PLAN_READY_NO_EFFECT
BLOCKED_MISSING_CANONICAL_REF
BLOCKED_AMBIGUOUS_OWNER
BLOCKED_STALE_SOURCE
BLOCKED_UNCONSIDERED_REQUIRED_DOOR
HELD_DECLARED_UNKNOWN
```

## Interaction expectation projection

The read-only inventory should attempt to derive, for each material interactive
element:

```text
interactionExpectationRef
elementRef
featureRefs[]
screenRef
regionRef
actionRefs[]
stateOwnerRefs[]
permissionRefs[]
effectClasses[]
labelAndDescriptionStringRefs[]
renderBindingRefs[]
inputModalityRefs[]
gestureRefs[]
feedbackExpectationRefs[]
entryRouteRefs[]
returnOrRecoveryRouteRefs[]
focusExpectationRefs[]
platformRefs[]
testRefs[]
evidenceMilestoneRefs[]
heldOrUnknownRefs[]
```

A new canonical field is not required merely because this projection wants a
value. The inventory first searches existing element, action, state, experience,
test and renderer contracts. Only a repeated unresolved door may justify an
extension to an existing owner.

### Feedback states to consider

For each element, explicitly dispose the states relevant to its behavior:

```text
IDLE
FOCUSED
HOVERED
PRESSED
ARMED
EXPANDED
COLLAPSED
SELECTED
CURRENT
BUSY
DISABLED_WITH_REASON
SUCCEEDED
FAILED
CANCELLED
UNDO_AVAILABLE
RECOVERED
```

A state may be:

```text
PLACED
NOT_APPLICABLE_WITH_REASON
DEFERRED_WITH_WAKE_TRIGGER
UNKNOWN_WITH_QUESTION
```

Omission is not a disposition.

Long press, drag, resize and other gesture-rich actions require visible or
announced arming/cancellation semantics and a keyboard or ordinary-control
alternative when the action is material.

## Review journey composition

Review-journey **plan formation** is no-effect. Execution is no-effect by
default; when a feature cannot be reviewed without exercising a bounded effect,
execution may proceed only through exact registered action, permission and effect
identity inside an isolated fixture with an explicit authority binding and
cleanup/recovery proof.

```text
ReviewJourneyPlan
  reviewJourneyRef
  featureRefs[]
  experienceProfileRef
  startingStateRef
  stepRefs[]
  captureMilestoneRefs[]
  returnExpectationRef
  recoveryExpectationRef
  fixtureRef
  executionEffectPolicy = NO_EFFECT | ADMITTED_FIXTURE_EFFECTS
  admittedActionRefs[]
  admittedEffectClasses[]
  effectAuthorityRefOrNull
  cleanupOrRecoveryExpectationRefOrNull
  forbiddenEffectClasses[]
  platformRef
  localeRef
  viewportRef
  inputModalityRef
  reducedMotionRef
  doesNotProve[]
```

Each step references an existing element/action/gesture and expected semantic
state transition. Renderer-specific selectors and commands stay in the adapter.
`ADMITTED_FIXTURE_EFFECTS` requires every exercised effect to resolve through the
registered action + permission + effect class and the plan's exact authority/fixture
binding; clickability, test convenience, or reviewer intent never grants effect
authority.

```text
WHAT_TO_REVIEW != HOW_A_RENDERER_EXECUTES_THE_CAPTURE
```

## Deterministic maze traversal

The executable strategy should test structure before randomness.

### Breadth walk

Visit registered siblings and exposed routes to detect:

- canonical nodes with no rendered route;
- rendered controls with no canonical identity;
- unreachable screens or regions;
- controls whose action/permission/state owner cannot be resolved;
- silent dead ends.

### Depth walk

Follow nested contextual journeys through the actual product grammar, such as:

```text
Terrain current context
  → contextual conversation
    → channel or Guide interaction
      → return to Terrain
```

### Forward and inverse/return proof

For each material edge:

```text
A --registered action--> B
```

require either:

```text
B --registered inverse/return/recovery--> A-equivalent
```

or an explicit terminal disposition.

Semantic equivalence may preserve:

- exact current semantic node;
- canonical state-owner truth;
- permission/effect disposition;
- declared durable preferences;
- valid focus destination;
- append-only Journey provenance without duplicate semantic no-op events.

It need not restore every transient pixel if the canonical experience contract
explicitly permits adaptation.

### Metamorphic walk

Repeat named journeys while varying one admitted condition:

- English, Japanese and Chinese;
- desktop and compact viewport;
- pointer and keyboard;
- ordinary and reduced motion;
- declared zoom/magnification conditions;
- refresh/restart where persistence is in scope;
- admitted unavailable or failure state.

Presentation may adapt. Canonical identity, authority and semantic meaning may
not silently change.

### Seeded exploratory walk

Exploratory action selection is future-only and runs only after deterministic
journeys pass. It requires:

```text
registered admittedActionRefs
registered admittedEffectClasses (or an explicit NO_EFFECT policy)
exact isolated fixture + effect authority binding when effects are admitted
reproducible seed
step and time budget
forbidden effect classes
stop-on-unknown policy
no raw private-content or pointer logging
```

Rendered clickability never supplies effect admission.

## Evidence contract

For named milestones and every failure, the existing Experience Review evidence
shape may be extended or composed to preserve:

```text
reviewRunRef
reviewJourneyRef
reviewStepRef
sourceVersionRef
repository/base/head/testedMerge/tree/sourceTree/blueprint refs
platform/runtime/browser-or-native-adapter refs
locale/viewport/input/reduced-motion refs
screen/region/element/action/gesture refs
before semantic frame fingerprint
expected transition ref
observed transition ref
after semantic frame fingerprint
focus before/after refs
feedback expected/observed refs
permission/effect disposition
screenshot or interactive artifact refs + digests
accessibility evidence ref
console/page/network failure refs
result = PASS | FAIL | HELD | UNKNOWN
doesNotProve[]
```

Screenshots remain sparse and consequential:

```text
before
action-armed state when materially distinct
after
inverse or recovery
unexpected failure
```

Bulk receipts may be partitioned or represented as JSON Lines. Human review
receives a compact projection, not a screenshot matrix.

## Accessibility and readability obligations

For every human-visible material interaction, prove or explicitly hold:

- native semantics or justified custom role;
- accessible name and description;
- label/control relationship;
- keyboard reachability and operation;
- visible focus and logical focus return;
- pointer/touch alternative where relevant;
- target discoverability and usable size;
- expanded/current/selected/busy/error feedback;
- live announcement when visual state alone is insufficient;
- color-independent meaning and readable contrast;
- text scaling, line length and overflow;
- English/Japanese/Chinese expansion;
- compact viewport behavior;
- reduced-motion equivalence;
- non-spatial alternative where spatial navigation is used;
- prevention, cancellation, undo and recovery for risky actions.

Passing source tests does not substitute for rendered or device evidence.

## Concern, finding and learning routing

A failed review step first remains exact evidence. Its durable route is selected
from existing owners:

```text
one-off exact candidate defect
  → PR finding / exact-head correction

source-bound recurring concern or risk
  → ConcernWatch observation / subject / recurrence route

accepted reusable process correction
  → Process Factory worked example or pattern/learning candidate

canonical product contract gap
  → existing feature / experience / interface owner extension
```

Do not create a generic ReviewFinding registry until repeated cases prove that
none of those owners can preserve the necessary identity or lifecycle.

```text
FINDING_RECORDED != WORK_ADMITTED
OBSERVED_RECURRENCE != UNIVERSAL_RULE
GOOD_OUTCOME != CAUSAL_PROOF
```

## Coverage receipt and projections

The review compiler should emit one deterministic no-effect coverage receipt:

```text
ReviewCoverageReceipt
  receiptRef
  sourceVersionRef
  expectationSetRef
  required/considered/placed/held/unknown refs
  canonicalNodeCoverage
  renderBindingCoverage
  typedEdgeCoverage
  inverseOrRecoveryCoverage
  feedbackCoverage
  keyboardCoverage
  accessibilityCoverage
  localeCoverage
  viewportCoverage
  platformCoverage
  negativePathCoverage
  evidenceMilestoneCoverage
  unresolvedRefs[]
  nextUnresolvedRefOrNull
  effects = all false
```

A coverage graph, Atlas, matrix, Terrain card, Health card or Guide explanation
may be derived from this receipt. None may invent new canonical meaning.

Avoid one ungrounded percentage. Keep coverage dimensions and unknowns visible.

## Review gates

### R0 — Exact source and currentness

Bind repository, base, candidate, tested checkout/merge, tree, source manifest,
Blueprint, platform/runtime and work identity.

### R1 — Canonical ownership and feature completeness

Resolve every implicated feature, node, state owner, action, permission, effect,
process, module, locale, platform, test, rollback, projection and lens ref.

### R2 — Render and interaction bindings

Prove stable rendered identity, semantics, labels, focus, disabled/current/
expanded/busy feedback and no orphan canonical/rendered controls.

### R3 — Journey continuity

Prove entry, depth, return, recovery, revisitation, backtracking and semantic
no-op behavior without state-owner or identity drift.

### R4 — Accessibility, readability and environment variation

Execute the named locale, viewport, modality, reduced-motion and actual supported
platform cells; keep unsupported cells held rather than implied.

### R5 — Permission, effect, privacy, resource, concurrency and recovery

Fail closed on unknown authority. Plan formation and inspection remain no-effect.
Effectful proof is allowed only when the exact review plan binds an isolated
fixture to registered action, permission and effect identities, an admitted effect
class, explicit effect authority, and cleanup/recovery evidence.

### R6 — Evidence and human review

Bind exact step/aggregate receipts and sparse consequential artifacts. Preserve
expected-versus-observed and what passing does not prove.

### R7 — PR-ready and Health consumption

Consume the same exact-current evidence without silently substituting a new run
or changing the candidate identity.

### R8 — Fresh independent review and lifecycle

Independent Assurance and lifecycle review remain distinct occupancies and exact
head/tree decisions.

## Feature-development integration

A new feature should move through this order:

```text
1. locate or register canonical feature and interface identities
2. declare human introduction and required review lenses
3. bind state/action/permission/effect/localization/platform/recovery owners
4. compile the read-only ReviewExpectationSet
5. resolve every required door or preserve a typed hold/unknown
6. add source-owner positive, negative and adversarial proof
7. execute named review journeys in each actually claimed environment
8. package sparse exact-current human evidence
9. record corrections, concerns and reusable lessons through existing routes
10. run PR-ready / Health on the same candidate evidence
11. obtain fresh Independent Assurance and lifecycle decision
```

This makes review architecture part of feature formation rather than an audit
performed after implementation is already difficult to change.

## PR and Git history contract

For architecture and future implementation PRs:

```text
commits
  preserve ordinary source evolution without history rewrite

PR comments
  preserve chronological witness, challenge, correction and exact-head receipts

repository decision documents
  preserve the current reasoned contract, lessons, non-collapse rules and held unknowns

review submissions
  preserve independent disposition on one exact head
```

A corrected document does not erase the earlier conclusion. An earlier comment
does not override a newer accepted source without an explicit currentness route.

## Staged adoption

### Stage 0 — documentation and source placement

This candidate document plus its self-audit. No executable compiler, registry or
runtime effect.

### Stage 1 — read-only current Review Coverage Inventory

For every registered human-visible feature, list:

- canonical elements and rendered bindings;
- existing state/action/permission/effect owners;
- feedback expectations found or unresolved;
- entry, depth, return and recovery routes;
- required review lenses;
- existing tests and environment suites;
- existing screenshot/evidence milestones;
- exact gaps, held states and ambiguous owners.

### Stage 2 — smallest adapter/schema consequences

Only after Stage 1, identify which missing fields are projections and which
require an extension to an existing owner. Do not create a new root by default.

### Stage 3 — one deterministic browser pilot

Use an existing high-value journey:

```text
Terrain current context
  → contextual conversation
  → Guide or channel interaction
  → exact return to Terrain
```

Add per-step evidence without replacing the current owner-domain assertions.

### Stage 4 — human evidence composition

Route changed and consequential milestones through the Experience Review Kit.

### Stage 5 — Build Health consumption

Register exact-current admission only after the evidence producer and semantics
are accepted.

### Stage 6 — bounded exploratory and native expansion

Add seeded exploration and native adapters only when exact action admission,
fixtures and platform evidence are independently available.

Each stage requires fresh source placement, claim/currentness checks, tests,
Independent Assurance and lifecycle review. Acceptance of this documentation
does not mechanically activate later stages.

## Held boundaries and typed unknowns

```text
UNKNOWN exact interaction-feedback canonical owner split
UNKNOWN whether ConcernWatch fully satisfies every review-finding lifecycle
UNKNOWN smallest step-receipt extension to Experience Review evidence
UNKNOWN derived coverage projection combination: graph vs Atlas vs matrix
DEFERRED executable compiler until read-only inventory proves source placement
DEFERRED browser pilot until compiler/receipt contract is accepted
DEFERRED native evidence until actual native adapters and environments exist
```

Permanent exclusions:

- no second feature, state, action, permission, Journey, Health or concern owner;
- no raw transcript, credential, private source body or unnecessary personal-data
  logging;
- no hidden-reasoning capture;
- no destructive or protected effect from review traversal;
- no browser evidence represented as native conformance;
- no screenshot similarity represented as semantic proof;
- no automatic work admission, approval, merge or publication;
- no private architectural source publication by implication.

## Exact next action

After fresh independent review of this documentation candidate, form a separate
read-only **Current Review Coverage Inventory** stage. That inventory—not this
document—must prove the smallest machine-readable placement and any exact source
extensions required for future development.

<!-- [VXG RealForever] -->
