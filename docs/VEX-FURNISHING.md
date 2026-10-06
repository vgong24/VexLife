# Vex Furnishing — source-managed addressability and placement composition

`[VXG RealForever]`

Canonical owner: `github.issue.vexlife.811`  
VF-02A source edge: `github.issue.vexlife.813`  
Source-placement decision: `github.issue.vexlife.811.comment.6008774332`

## Purpose

VexLife is both a human-visible Home and an inhabitable orientation field for Vex. Furnishing is the thin source-managed composition layer that answers a specific family of questions without becoming a second semantic system:

- **What is this thing, and who owns its truth?**
- **Where can a human or Vex find it now?**
- **Where else can the same thing legitimately appear?**
- **What source says it is current, visible, attention-worthy, recoverable, or held?**
- **What is nearby in the current semantic neighborhood?**
- **How can another platform project the same furnishing ancestry without forking meaning?**

Furnishing is therefore closer to a **source-bound semantic spatial index and projection recipe** than a menu configuration file.

```text
rightful semantic/domain truth
  -> stable subject identity + owner/source refs
  -> Furnishing addressability / placement intent
  -> Terrain + Presentation + Navigation identities
  -> currentness / visibility / attention / recovery source bindings
  -> bounded FurnishingProjection
  -> human orientation + Vex orientation + platform projection
```

## Permanent non-collapse

```text
VEX_FURNISHING != SEMANTIC_OWNER
RESOURCE_IDENTITY != CURRENT_PLACEMENT
PLACEMENT_MOVE != RESOURCE_MIGRATION
GEOMETRY_MOVE != SEMANTIC_MOVE
MULTI_HOME_PROJECTION != DUPLICATE_RESOURCE
FURNISHING_REGISTRY != CURRENT_STATE_STORE
FURNISHING_PROJECTION != PRODUCT_TRUTH
PRESENTATION_GRAPH != SEMANTIC_OWNER
NAVIGATION_ROUTE != EFFECT_AUTHORITY
ANDROID_PROJECTION != ANDROID_SEMANTIC_FORK
VEX_PERCEPTION != EFFECT_AUTHORITY
```

A room, doorway, screen, relationship edge, service availability observation, platform shell, or current attention signal never becomes the semantic owner merely because Furnishing references it.

## Why `resourceRef` is not universal

VF-02 corrected the tempting but false rule that every thing Furnishing can place must be one canonical stored resource. The contract therefore distinguishes:

```text
RESOURCE_PLACEMENT
  a rightful canonical product/resource identity is supplied by another owner

DERIVED_COLLECTION
  a projection such as Continue; it derives resumable refs and never becomes another store

PRESENCE
  a source-bound presence projection such as current Companion presence/availability

CONTEXTUAL_INDEX
  a bounded index/review surface such as a future Frontier-like projection

EXTERNAL_SERVICE
  an externally owned service whose canonical identity/current availability may remain HELD or unresolved
```

Only `RESOURCE_PLACEMENT` requires a non-null `resourceRefOrNull`. `DERIVED_COLLECTION` and `CONTEXTUAL_INDEX` are forbidden from claiming one.

## Static registry versus current projection

`blueprint/furnishing-registry.json` is static source-managed composition policy. It defines the closed contract vocabulary and later may contain accepted furnishing records. **VF-02A intentionally seeds no lived furnishing record**; this stage changes no UI placement and does not silently adopt candidate district taxonomy.

A furnishing record contains:

```text
furnishingRef
subject
  subjectClass
  subjectRef
  resourceRefOrNull
  semanticOwnerRefs[]
  sourceRefs[]
placement
  posture = PLACED | UNPLACED | HELD
  primary
  contextual[]
bindings
  currentness[]
  visibility[]
  attention[]
  recovery[]
orientationRelations[]
platformProjections[]
wakePredicates[]
```

The registry stores **binding instructions**, not the live values those bindings return.

`scripts/furnishing.mjs` compiles a non-empty registry only when the caller supplies a `knownRefs` set. Unknown canonical/resource/Terrain/Presentation/Navigation/owner/source/platform refs fail closed rather than being invented by Furnishing.

`projectFurnishings()` consumes explicit source observations and emits separate axes:

```text
currentness = CURRENT | HELD | UNKNOWN
visibility  = VISIBLE | HIDDEN | HELD | UNKNOWN
attention   = ATTENTION | NONE | HELD | UNKNOWN
recovery    = AVAILABLE | UNAVAILABLE | HELD | UNKNOWN
```

Missing required input becomes `UNKNOWN`. Conflicting source observations become `UNKNOWN`. Furnishing does not choose a winner between disagreeing rightful sources.

This means:

```text
VISIBLE != CURRENT
VISIBLE != READY
CURRENT != EFFECT_AUTHORIZED
ATTENTION != PERMISSION
HELD != ABSENT
UNKNOWN != FALSE
```

Every observation must preserve its owner/source identity and must carry `effectAuthorityGranted=false`. An observation attempting to grant effect authority is rejected.

## Addressability and semantic neighborhoods

Traditional navigation asks only, “what route opens this screen?” Furnishing must also help a Vex answer, “what is around the thing I am currently dealing with, and why?”

`orientationRelations[]` are **source-bound orientation edges**, not canonical domain relationships. Their closed first contract vocabulary is:

```text
ORIENTATION_NEIGHBOR
CONTEXTUAL_ASSOCIATION
CONTINUATION_ENTRY
ORIENTATION_RELATED
```

Every edge names the rightful owner/source that justifies the association. Furnishing therefore cannot infer friendship, project membership, conversation audience, library ownership, world membership, or any other product semantic relationship.

`selectFurnishingNeighborhood()` performs bounded deterministic traversal over only those registered source-bound orientation edges. It never searches raw history, creates a new graph owner, or treats pixel distance as semantic distance.

The current projection carries a deterministic `currentFurnishingNeighborhoodRef`, current semantic-context ref when supplied, the bounded furnishing refs, source refs, `whyVisible`, attention reasons, and explicit unknowns. This is suitable for later Vex Orientation Frame / Federated Current State composition without requiring the whole world in model context.

## Human and Vex views are two projections of one house

A human-facing surface should eventually answer from visible product state:

```text
Where am I?
What is here?
What is this for?
What can I safely do next?
What is held, and why?
How do I go Back without teleporting semantic context?
What changed?
```

A Vex-facing orientation projection needs the same truths plus exact provenance:

```text
current semantic context
current furnishing neighborhood
current/related furnishing refs
primary + contextual placements
visible/reachable source-bound identity
currentness / attention / recovery axes
semantic + presentation owners
why-visible / attention reason
platform posture
source/evidence refs
unknowns
```

The human does not need to see registry internals. Vex does not need DOM archaeology. Both should descend to exact source only when needed.

## Movement classification

Furnishing preserves the VF movement classes:

```text
G = geometry move
P = placement / doorway rebind
V = visibility / attention projection change
A = availability / currentness change
S = semantic migration
```

`validateMovement()` enforces the ownership boundary:

- `G`, `V`, and `A` are external geometry/runtime projection truth and must not rewrite static Furnishing semantics.
- `P` may change placement composition only while `furnishingRef` and semantic subject identity remain exact.
- `S` is always rejected and routed to the semantic owner.

This is how a future move of Relationships from `Self Development -> Relationships` to another primary district can remain a placement rebind rather than a relationship-data migration.

## Multi-home without duplication

The same subject may have one primary placement and multiple contextual placements. The placements are doors/projections, not clones.

Representative future reasoning examples (contract tests, **not lived adoption by VF-02A**):

```text
Relationships
  same feature/resource identity
  current Terrain doorway + Presentation surface
  future primary rebind may be P-class only

Continue
  DERIVED_COLLECTION
  returns resumable furnishing/subject refs
  does not copy conversation, music, project, or Journal content

Vex presence
  PRESENCE
  visible Vex chrome may coexist with HELD Companion availability
  visibility never synthesizes READY

VexStream Music
  EXTERNAL_SERVICE
  may remain HELD / identity-unresolved
  no Music library, playback, queue, or release truth is minted by Furnishing
```

## Platform posture and Android

A platform projection declares posture only:

```text
SHARED_IDENTITY
ADAPTER_REQUIRED
HELD
NOT_APPLICABLE
```

The projection carries the same furnishing/subject ancestry and source refs. Android may use native Compose layout, Android navigation conventions, and Android-specific vessel geometry while preserving:

```text
same semantic subject identity
same semantic owner
same Furnishing ancestry
same source-bound currentness
same no-false-authority rule
```

```text
ANDROID_LAYOUT_DIFFERENCE != SEMANTIC_FORK
```

VF-02A does not mutate `platform/android/**` or the Android Construction trajectory.

## Relationship to existing VexLife foundations

Furnishing composes existing owners rather than replacing them:

- **Terrain** owns canonical Terrain node identity/geometry.
- **Presentation Graph** owns presentation anatomy, placement/reachability metadata, and behavior-witness grammar while retaining `semanticAuthority=false`.
- **Navigation Continuity** owns registered visible doors, no-teleport transitions, Back/current-frame continuity, and navigation trace semantics.
- **Experience / Human Experience** owns lived interaction grammar and human acceptance.
- **Federated Current State / currentness producers** own current/delta/why source truth.
- **Domain owners** own Relationships, Friend, Conversation, Family, Journal, Home/device, Perception, Music, Worlds, and other product semantics/effects.
- **Android Construction** consumes the cross-platform contract; it does not become a semantic fork.

## VF-02A source placement boundary

This foundation owns exactly:

```text
blueprint/furnishing-registry.json
scripts/furnishing.mjs
test/furnishing.test.mjs
docs/VEX-FURNISHING.md
```

It deliberately does **not** modify the universal Blueprint include graph in this stage. That avoids pretending Furnishing is already a live universal runtime dependency before Human Experience convergence and downstream adoption earn the integration seam.

Generated Source Manifest bytes are not hand-authored. After final authored bytes exist, the canonical Source Manifest writer determines the exact generated buckets; those buckets require separate current custody before publication.

## VF-02A proof map

`test/furnishing.test.mjs` maps one executable test to each source-edge obligation `VF02A-00` through `VF02A-15`, including:

- inert/no-authority contract;
- closed typed subject classes and unique furnishing refs;
- source-bound resource identity;
- derived collection non-store behavior;
- known-ref placement validation;
- source-derived current/held/attention projection;
- Relationships identity reuse;
- Continue reference-only derivation;
- visible Vex without inferred READY;
- HELD external service without minted identity;
- G/P/V/A semantic identity preservation;
- S migration rejection;
- duplicate/unknown/authority-acquiring fail-closed behavior;
- deterministic compilation/projection;
- missing-input UNKNOWN with no production fixture fallback;
- no protected/domain effects.

## Next architecture gates

After VF-02A source proof and lifecycle are earned, the completion stream still requires Human Experience convergence before lived resource moves. Later stages challenge the contract against representative Vex/Continue/Relationships/Friend/Conversation/Music cases, add dynamic attention/currentness composition, define platform-independent Android consumption, and finally prove that both Vex and a human can orient in the lived Home without code or DOM archaeology.

VF-02A is the nervous-system connector, not the finished furnished Home.

<!-- [VXG RealForever][811][813][VEX-FURNISHING][VF02A] -->