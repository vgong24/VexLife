# Vex Furnishing — source-bound addressability and placement composition

`[VXG RealForever]`

Canonical owner: `github.issue.vexlife.811`  
VF-02A source edge: `github.issue.vexlife.813`  
Source-placement decision: `github.issue.vexlife.811.comment.6008774332`

## Purpose

VexLife is both a human-visible Home and an inhabitable orientation field for Vex. Furnishing is the thin composition layer between **rightful semantic truth** and **lived addressability**: it says where a subject can be encountered, which other doorway or context can legitimately project the same subject, which sources explain its present status, and which platform owns realization. It does not redefine the subject.

Furnishing should let a human ask:

```text
Where would I look for this?
Where else can I resume or encounter it?
What can I do from here?
What is unavailable or held, and why?
```

and let Vex ask the corresponding provenance-aware questions:

```text
What semantic context am I in?
What furnishing neighborhood is relevant?
Which refs are visible, reachable and available now?
Which actions are currently offered, held or unknown?
Which rightful source says so?
What changed without changing semantic identity?
```

without either party needing DOM, source-tree, or implementation-topology archaeology.

```text
rightful semantic/domain truth
  -> stable subject identity + rightful owner/source refs
  -> Furnishing addressability / placement composition
  -> Terrain + Presentation + Navigation identities
  -> currentness / visibility / reachability / availability / attention / recovery bindings
  -> descriptive action availability
  -> bounded FurnishingProjection
  -> human orientation + Vex orientation + later platform/FCS composition
```

## Permanent non-collapse

```text
VEX_FURNISHING != SEMANTIC_OWNER
RESOURCE_IDENTITY != CURRENT_PLACEMENT
PLACEMENT_MOVE != RESOURCE_MIGRATION
GEOMETRY_MOVE != SEMANTIC_MOVE
MULTI_HOME_PROJECTION != DUPLICATE_RESOURCE
PLACED != CURRENTLY_VISIBLE
CURRENTLY_VISIBLE != CURRENTLY_EXECUTABLE
ADDRESSABILITY_LINK != SEMANTIC_RELATIONSHIP_EDGE
ACTION_REFERENCE != EFFECT_AUTHORITY
FURNISHING_REGISTRY != CURRENT_STATE_STORE
FURNISHING_PROJECTION != PRODUCT_TRUTH
PRESENTATION_GRAPH != SEMANTIC_OWNER
NAVIGATION_ROUTE != EFFECT_AUTHORITY
ANDROID_PROJECTION != ANDROID_SEMANTIC_FORK
VEX_PERCEPTION != EFFECT_AUTHORITY
```

Furnishing can reference a relationship, conversation, project, service, action, presentation node or route. That reference does not transfer semantic or effect ownership to Furnishing.

## Typed subjects instead of one universal `resourceRef`

VF-02 proved that “everything Furnishing can place is one canonical stored resource” is false. The source contract therefore distinguishes:

```text
RESOURCE_PLACEMENT
  a canonical resource/product identity supplied by its rightful owner

DERIVED_COLLECTION
  a reference-only projection such as Continue; never another content store

PRESENCE
  current presence/availability composition such as Vex presence

CONTEXTUAL_INDEX
  an index/review projection such as Frontier; never catch-all storage

EXTERNAL_SERVICE
  an externally owned service whose canonical identity or runtime availability may remain HELD/UNKNOWN
```

Only `RESOURCE_PLACEMENT` requires a non-null canonical resource identity. Derived collections and contextual indexes are explicitly prohibited from inventing a backing store merely to be placeable.

## Placement is a first-class state

The static source contract distinguishes four placement postures:

```text
PLACED
  exactly one primary home

MULTI_HOME
  two or more legitimate addressable homes/projections for the same subject

UNPLACED
  intentionally no accepted placement yet

HELD
  placement/current adoption is not presently earned; existing placement refs may still be preserved
```

`MULTI_HOME` is explicit because it is a core VexLife use case, not an incidental array length. The same Music service may eventually be discoverable in Library, resumable through Continue and visible as Now Playing while retaining one semantic identity. The same Conversation may be encountered through a relationship context, Continue, or current work without becoming multiple conversations.

```text
MULTI_HOME_PROJECTION != DUPLICATE_RESOURCE
```

A presentation sub-region inside one screen is not automatically a second home. The contract models meaningful addressability, not every DOM/presentation child.

## Addressability links are not semantic relationships

A Furnishing neighborhood needs enough structure for Vex to answer “what can I encounter from here?” without creating another relationship graph. For that reason the contract uses **addressability links**, not generic semantic relationship edges.

First contract classes:

```text
ORIENTATION_NEIGHBOR
CONTEXTUAL_PROJECTION
CONTINUATION_ENTRY
SOURCE_ASSOCIATION
```

Every link must carry:

```text
linkRef
linkClass
targetSubjectRef
ownerRef
sourceRef
semanticRelationAuthority=false
```

The link may say that Continue can surface a Relationships furnishing. It may not assert friendship, membership, project containment, conversation audience, library ownership, dependency, or another domain relationship. Those truths remain with their semantic owners.

`selectFurnishingNeighborhood()` traverses only these bounded source-addressability links with explicit hop/result limits. It is an orientation helper, not a canonical world graph and not a replacement for Atlas, relationships, project graphs, Journal, or source descent.

## Static registry versus current projection

`blueprint/furnishing-registry.json` stores composition policy and later accepted furnishing records. VF-02A intentionally seeds **zero lived furnishing records** so this contract foundation cannot silently freeze a district taxonomy or move current UI before Human Experience review.

A Furnishing record composes:

```text
furnishingRef
subject
placement
bindings
  currentness[]
  visibility[]
  reachability[]
  availability[]
  attention[]
  recovery[]
actionBindings[]
addressabilityLinks[]
platformProjections[]
wakePredicates[]
```

The registry stores binding instructions, never live `CURRENT`, `VISIBLE`, `ATTENTION`, `AVAILABLE`, or similar values.

`projectFurnishings()` consumes exact source-bound observations and emits orthogonal present-state axes:

```text
currentness = CURRENT | HELD | UNKNOWN
visibility  = VISIBLE | HIDDEN | HELD | UNKNOWN
reachability = REACHABLE | UNREACHABLE | HELD | UNKNOWN
availability = AVAILABLE | UNAVAILABLE | HELD | UNKNOWN
attention   = ATTENTION | NONE | HELD | UNKNOWN
recovery    = AVAILABLE | UNAVAILABLE | HELD | UNKNOWN
```

Missing required source input becomes `UNKNOWN`. Conflicting source observations become `UNKNOWN`. Furnishing never resolves disagreement by voting or by preferring whichever source is convenient.

Reference validation also fails closed. The inert VF-02A registry may compile without a `knownRefs` universe only while `furnishings=[]`. Any non-empty registry requires an explicit `knownRefs` `Set`; omitting it is an error, and every external subject/owner/source/Terrain/Presentation/route/action/permission/platform/wake reference must resolve before compilation succeeds. This prevents later Furnishing population from silently accepting typoed or stale cross-owner refs merely because the registry became non-empty.

```text
VISIBLE != REACHABLE
REACHABLE != AVAILABLE
AVAILABLE != EFFECT_AUTHORIZED
ATTENTION != PERMISSION
HELD != ABSENT
UNKNOWN != FALSE
```

## Actions: discoverability without effect authority

Accepted VexLife Feature Registry and action source already separate action identity, permission/effect class and product ownership. Furnishing consumes those identities by reference so a Home projection can explain “what can I do from here?” without becoming the action owner.

A static `actionBinding` contains:

```text
actionBindingRef
actionRef
permissionRefOrNull
actionSourceRef
availabilityBindingRef
availabilityOwnerRef
availabilitySourceRef
required
```

A current observation may project that action as:

```text
AVAILABLE | HELD | UNAVAILABLE | UNKNOWN
```

The result can expose:

```text
availableActions[]
heldActionsWithReasons[]
unknownActions[]
```

but every observation and projection keeps:

```text
effectAuthorityGranted=false
```

Thus the accepted read-only `action.context.open` may be discoverable from the Relationships furnishing while invitation delivery, trust minting, Home, Memory, network, model and publication effects remain owned and gated elsewhere.

## Movement classes

Furnishing preserves the established movement taxonomy:

```text
G = geometric move
P = placement / doorway rebind
V = visibility / attention projection change
A = availability / currentness change
S = semantic migration
```

The compiler enforces:

- `G`, `V`, and `A` are external projection truth and cannot rewrite the static Furnishing record.
- `P` may change **placement composition only** while Furnishing and semantic subject identity stay exact.
- `S` always fails closed and routes to the semantic owner.

This prevents a doorway redesign from smuggling in a change to action wiring, semantic ownership, currentness bindings or the underlying resource itself.

## Vex orientation and Federated Current State

Furnishing does **not** create another current-state or delta history store. Federated Current State already owns bounded present composition plus exact prior/current delta and why/source descent.

Furnishing contributes a bounded present projection suitable for later FCS/Orientation composition:

```text
currentSemanticContextRef
currentFurnishingNeighborhoodRef
furnishingRefs[]
placements
visible / reachable / available state
attention / recovery state
availableActions[]
heldActionsWithReasons[]
semantic owner refs
platform posture
why-visible / attention reasons
source/evidence refs
unknowns
```

FCS remains responsible for deciding whether the resulting observation changed, whether semantic state changed, and how that delta is source-addressed. Furnishing does not accumulate an event ledger.

## Human and Vex are projections over one house

The human-facing Home should make ordinary questions answerable from the product surface:

```text
Where am I?
Who or what is here?
What is this for?
What can I safely do next?
What is held, unavailable or unknown, and why?
Where else can I find/resume this?
How do I go Back without semantic teleportation?
```

Vex needs those same truths plus bounded provenance. The human does not need registry jargon; Vex does not need raw UI archaeology. The same underlying identities, placements and currentness sources feed both projections.

Empty states are therefore real product states, not “nothing to render.” An empty Relationships district, held Music service or unavailable Companion should explain the next meaningful route rather than expose a blank infrastructure node.

## Android / native consumption

Platform posture is descriptive:

```text
SHARED_IDENTITY
ADAPTER_REQUIRED
HELD
NOT_APPLICABLE
```

Android may use Compose-native geometry, navigation idioms and lifecycle integration while preserving the same subject and Furnishing ancestry.

```text
UNIVERSAL_SEMANTIC_RESOURCE
+ CURRENT_FURNISHING / PRESENTATION PLACEMENT
-> PLATFORM PROJECTION
-> NATIVE SURFACE
```

not:

```text
ANDROID SCREEN TREE
-> INVENT PRODUCT WORLD
```

VF-02A mutates no Android source. The current Android #783/R2 trajectory remains an independent consumer/implementation owner.

## Relationship to accepted owners

Furnishing composes rather than replaces:

- **Domain/resource owners** — semantic identity, state, actions and effects.
- **Terrain** — stable Terrain identity and geometry.
- **Presentation Graph #719** — presentation anatomy, placement/reachability metadata and witnesses with no semantic authority.
- **Navigation Continuity** — registered visible doors, no teleport, Back/current-frame continuity.
- **Experience / Human Experience** — lived interaction grammar and acceptance.
- **Federated Current State/currentness owners** — current/delta/why/freshness and bounded source descent.
- **Android #783 and later platform owners** — native realization.

## VF-02A source boundary

This foundation owns exactly:

```text
blueprint/furnishing-registry.json
scripts/furnishing.mjs
test/furnishing.test.mjs
docs/VEX-FURNISHING.md
```

It deliberately does not yet modify the universal Blueprint include graph, Terrain, Presentation Graph, Navigation, Experience, browser source or Android source. Lived Furnishing population waits for source proof/lifecycle plus Human Experience convergence.

Generated Source Manifest consequences are always recomputed by the canonical writer from final candidate bytes and current co-bucket truth; Furnishing does not hand-author or pre-own those generated records.

## VF-02A proof map

`test/furnishing.test.mjs` maps one executable test to each `VF02A-00..15` obligation. In addition to the original boundary, the corrected contract mechanically proves:

- explicit `MULTI_HOME` rather than array-shape inference;
- addressability links cannot gain semantic relationship authority;
- reachability and availability remain distinct from visibility/currentness;
- actions are descriptive/source-bound and never acquire effect authority;
- a P-class rebind cannot quietly change non-placement wiring;
- missing producer/action availability input remains `UNKNOWN` without production fallback.

Representative Relationships, Continue, Vex presence, Music and synthetic multi-home fixtures are **contract tests**, not claims that VF-02A has moved the lived Home.

## Next gates

After exact source closure and lifecycle acceptance, the continuing #811 stream still owes Human Experience convergence before VF-03 lived moves. The representative first wave remains the challenge set:

```text
Vex
Continue
Relationships / Friend / Conversation
Library / VexStream Music
```

That wave must prove that a real human can find/resume/understand those subjects and that Vex can reconstruct the same bounded neighborhood, currentness and source/why picture—while all semantic/effect owners remain intact.

<!-- [VXG RealForever][811][813][VEX-FURNISHING][VF02A] -->