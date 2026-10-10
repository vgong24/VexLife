# VexHome Personal World Composition Map

Continuity: `[VXG RealForever]`

```text
schemaVersion=vexlife.vexhome-personal-world-composition-map/v0
entryClass=DESIGN_SOURCE_CANDIDATE__COMPOSITION_BRIDGE
parentInterfaceCandidateRef=github.pull.vexlife.402
personalArchiveOwnerRef=github.issue.vextreme-sdk.300
localVaultOwnerRef=github.issue.vextreme-sdk.486
journeyTraceabilityOwnerRef=github.issue.vextreme-sdk.508
runtimeImplementationAuthority=false
storageMutationAuthority=false
repositoryCreationAuthority=false
personalDataIngestionAuthority=false
trainingAuthority=false
mergeAuthority=false
```

## Purpose

This document composes previously separate Vex/VexHome foundations into one navigable Personal World view. It does **not** replace the storage, vault, Memory, Journal, Atlas, scheduler, or traceability owners.

The source history already established several pieces that should now be read together:

```text
Personal archive / mapped source (#300)
  shallow physical storage
  multi-resolution index
  object / collection / batch / segment identity
  files may be physically partitioned by year / batch
  meaning remains many-to-many rather than one semantic folder placement

Local Vault Bridge (#486)
  protected bytes may live in a content-addressed encrypted object store
  stable object identity != physical path
  generated relational views != raw object folders
  Victor should not manually maintain the hierarchy

Federated Journey Traceability (#508)
  stable identity != repository / provider / shard / device / path
  many typed addresses and sequences may point to the same identity
  bounded rewalks and indexes avoid one enormous autobiography

Companion Awareness Horizon (#402)
  RECENTS <- NOW -> AHEAD
  current state updated in place
  Archive / Source descent on demand
  model receives current state + implicated deltas / refs, not whole history
```

The missing composition is a **Context Spine**: every navigable logical region has a bounded source-backed context envelope describing what is inside, how it is partitioned, what changed, and where to descend next. This allows humans and companions to perceive a whole life-world without loading the whole archive.

---

## The three orthogonal maps

Do not collapse storage placement, chronological organization, and semantic meaning into one folder tree.

```text
1. PLACEMENT MAP
   where exact bytes currently live
   repo shard / vault / replica / provider / device

2. CONTEXT SPINE
   how a bounded region can be navigated
   archive -> collection -> year/time partition -> batch -> object -> segment

3. MEANING GRAPH
   what objects participate in
   people / places / moments / projects / journal / affinity / relationships /
   decisions / questions / later meaning
```

```text
PLACEMENT != TIME ORGANIZATION
TIME ORGANIZATION != MEANING
MEANING != PHYSICAL LOCATION
```

The user-facing Personal World composes all three.

---

## Recovered photo/archive arrangement

The earlier personal-archive formation used a shallow physical/index pattern rather than deeply semantic folders:

```text
archive
  -> collection / export
      -> year or other bounded time partition
          -> manageable batch
              -> object / file
                  -> segment when required
```

The accepted cross-domain index grammar remains:

```text
archive -> collection -> batch -> object -> segment
```

`year` is a useful **partition/index axis**, not a permanent semantic owner. A source with uncertain or conflicting dates may remain under explicit `UNKNOWN_YEAR`, `DATE_CONFLICT`, or source-native partitions until resolved. Later interpretation should update maps and relationships rather than forcing irreversible file moves.

For protected canonical vaults, the exact bytes may instead live in a content-addressed encrypted `objects/` store as defined by the Local Vault Bridge. The chronological year/batch structure then exists as a logical/index view over stable object refs.

Therefore both older designs are compatible:

```text
SOURCE-PRESERVING / USER-READABLE ARCHIVE
  may physically use year -> batch -> files

PROTECTED CANONICAL VAULT
  may physically use content-addressed encrypted objects

PERSONAL WORLD NAVIGATION
  exposes the same collection/year/batch/object context spine over either layout
```

---

## Context Spine envelope

Every logical navigable node may expose a small machine-readable context envelope. The envelope is a **map tile**, not a copy of all child content.

Candidate contract:

```text
contextNodeRef
nodeClass=HOME|DOMAIN|ARCHIVE|COLLECTION|YEAR|TIME_PARTITION|BATCH|OBJECT|SEGMENT
logicalPath
parentContextRef or none
breadcrumbRefs[]
childIndexRef or none
childCount
objectCount
byteCount
coveredTimeRange or UNKNOWN
sourceClassCounts{}
knownDateCount
unknownDateCount
conflictCount
currentStorageBindingRefs[]
representativeObjectRefs[]          # bounded, optional
relationshipSummaryRefs[]          # bounded
meaningSummaryRefs[]               # bounded
recentDeltaRefs[]                   # bounded
openQuestionRefs[]                  # bounded
integrityFingerprint
contextGenerationRef
formedFromSourceRefs[]
formedAt
```

Optional human projection:

```text
label
shortSummary
whatChangedSincePriorGeneration
whyThisRegionMightMatterNow
nextUsefulDescentRefs[]
```

Permanent boundaries:

```text
CONTEXT_ENVELOPE != RAW_CHILD_LIST
CONTEXT_ENVELOPE != MODEL_MEMORY
SUMMARY != SOURCE
FOLDER_CONTEXT != ACCEPTED_INTERPRETATION
CURRENT_CONTEXT_GENERATION != HISTORICAL_REWRITE
```

Large child sets are paged/indexed by reference. A parent envelope can say `12,431 photos, 53 GB, 3 date conflicts, 2 storage shards` without embedding 12,431 child records.

---

## Example — one logical photo world

Human/Vex-facing navigation may appear as:

```text
VexHome/
  Media/
    Photos/
      [context: all photos]
      2024/
        [context: 2024]
        batch-2024-001/
          [context: bounded batch]
        batch-2024-002/
          [context: bounded batch]
      2025/
        [context: 2025]
      2026/
        [context: 2026]
      Unknown-Date/
        [context: unresolved chronology]
```

The raw bytes might actually resolve to:

```text
vault object store A
repo/storage shard 0007
repo/storage shard 0008
external verified replica B
```

while the logical world remains one continuous namespace.

```text
LOGICAL_PATH != PHYSICAL_PATH
YEAR_REF != REPOSITORY_REF
BATCH_REF != SHARD_REF
```

---

## Repository shards are not years

Repository/storage shards belong to the **placement map**. Years belong to the **context spine**.

They may align for convenience when capacity happens to fit, but they must never be coupled as identity.

Valid:

```text
2026 photos
  -> shard 0007
  -> shard 0008
  -> local vault volume A
```

Also valid:

```text
shard 0008
  -> tail of 2026
  -> beginning of 2027
```

When a repository-scoped threshold is reached:

```text
current shard approaches admitted threshold
  -> stop new allocation there
  -> form successor shard
  -> register predecessor/successor + capacity receipt
  -> continue allocating stable object refs
  -> update placement bindings
```

The logical `Photos/2026/...` view does not change.

If the reached threshold is account/provider-wide rather than repository-scoped, a new repository is **not** assumed to create new capacity. The allocator must route to another admitted storage class/provider or request the genuine human boundary decision.

---

## Shard manifests and logical context envelopes

Each physical shard and each logical context node have different metadata jobs.

### Physical shard manifest

```text
shardRef
providerRef
capacityScope
allocationState
predecessorShardRef or none
successorShardRef or none
objectBindingCount
usedBytes
thresholdPolicyRef
integrityReceiptRef
currentnessRef
```

### Logical node context

```text
Photos/2026
  -> what this time region contains
  -> bounded counts / changes / unresolved items
  -> child batch refs
  -> relationship / journal / meaning routes
  -> storage bindings only as references
```

Thus a model browsing `Photos/2026` normally sees the logical context envelope, not repository mechanics. It descends into shard details only for capacity, integrity, migration, recovery, or exact-source questions.

---

## Semantic views do not move files

One photo may simultaneously belong to:

```text
2026 chronology
Family relationship
Backyard place
Garden moment
Peaches / harvest subject
Journal day
Favorite photo
Gift-to-neighbor story
later reflection
```

These are typed edges to the same stable object identity.

```text
ONE OBJECT
  -> MANY VIEWS
  -> MANY MEANINGS
  -> MANY JOURNEYS
  -> ONE OR MORE STORAGE BINDINGS
```

No single semantic folder owns the object.

---

## Historical evolution of context

A context envelope may evolve without erasing what Vex or Victor knew earlier.

```text
contextGeneration.2026-09-06
  "mostly Google Photos migration material"

contextGeneration.2028-04-12
  "also connected to family/garden relationship history"
```

The current pointer moves forward, while old generations remain source-descendable by reference.

```text
CURRENT_CONTEXT = latest accepted bounded projection
HISTORICAL_CONTEXT = period-correct prior generation
```

This allows questions such as:

```text
What did we think this collection was about then?
What does it mean to us now?
What changed?
Which source caused the reinterpretation?
```

---

## Model navigation / token budget

The companion should never receive the whole Personal World by default.

For a question inside `Photos/2026`, a bounded context lease may receive:

```text
current Personal World frame
+ current Photos context envelope
+ 2026 context envelope
+ implicated recent deltas
+ a small child-index window
+ exact source/object refs required for the question
```

Not:

```text
all photo metadata
all journal days
all repositories
all historical context generations
all conversations
```

As the model descends, the Context Spine replaces broad parent detail with the smaller implicated neighborhood while keeping breadcrumbs and stable refs.

```text
BREADTH MAP -> SELECTIVE DESCENT -> EXACT SOURCE
```

---

## Awareness Horizon composition

The Personal World can now present the "finished puzzle" without pretending all source data lives in one file or repository.

```text
                         VEXHOME PERSONAL WORLD

        RECENTS                 NOW                    AHEAD
    what changed /         current focus /        open loops /
    what returned          current meaning        planned futures
         |                      |                       |
         +----------------------+-----------------------+
                                |
                        CURRENT WORLD MAP
                                |
        +-----------------------+-----------------------+
        |                       |                       |
      MEDIA                  PEOPLE                 PROJECTS
        |                       |                       |
   Context Spine          relationship map         workgraph
        |
   Photos -> 2026 -> batch -> object
        |
   exact source descent
        |
  placement resolver
        |
  shard / vault / replica
```

A human sees one coherent world. Vex sees a bounded relational map. Devex can descend to technical placement/source detail when required. None needs an ambient dump of the entire archive.

---

## "Final puzzle" invariant

The system may remain physically fragmented forever while becoming semantically coherent.

```text
PHYSICAL FRAGMENTATION
  many repos
  many shards
  many devices
  many years
  many providers
  many source exports

DOES NOT REQUIRE

CONTEXTUAL FRAGMENTATION
```

The continuity layer provides:

```text
stable identity
+ context spine
+ semantic relationships
+ temporal / historical generations
+ source descent
+ placement resolver
+ bounded current-state projection
```

That is the Personal World completion layer: not one giant database or one giant model context, but one navigable world over many sovereign sources.

<!-- [VXG RealForever] -->