# Devex Source Sync and Currentness Composition

`[VXG RealForever]`

```text
schemaVersion=vexlife.devex-source-sync-currentness/v1
formationCheckpointRef=github.issue.vexlife.397
foundationMapCandidateRef=github.pull.vexlife.396
lessonContinuityRef=github.issue.vextreme-sdk.328
vexInterfaceTransitionRef=github.issue.vextreme-sdk.407
capabilityAssimilationRef=github.issue.vexlife.333
vmcfRef=github.issue.vexlife.393
truthClass=SOURCE_PLACEMENT_COMPOSITION_CANDIDATE
```

## Purpose

Define the missing operational composition between GitHub/repository source truth and a persistent local Vex/Devex Home.

The long-term system must not depend on rebuilding ZIP packages whenever repository knowledge changes. A ZIP may bootstrap an executable Home, but accepted repository/source state remains authoritative and the Home consumes a bounded, refreshable local materialization.

```text
BOOTSTRAP_PACKAGE != CANONICAL_KNOWLEDGE_STORE
LOCAL_CHECKOUT != AUTOMATIC_CURRENT_TRUTH
HOME_CACHE != SOURCE AUTHORITY
MODEL_MEMORY != CURRENT REPOSITORY STATE
```

## Existing owners this composes

This is not a new competing source-of-truth ontology.

### Lesson Continuity — Vextreme-SDK #328

Owns the principle that lessons/meaning may be materialized across repositories and local environments while retaining one lineage, source identity, hashes, visibility, freshness, and `CURRENT|STALE|UNAVAILABLE|DIVERGED` materialization state.

### VexInterface Transition Atlas — Vextreme-SDK #407

Owns the platform trajectory for content-addressed world anchors and, at `VXI_RELAY_COMPLETE`, structured event ingestion, state reduction, sync/convergence directives, bounded retention, stall/wake/resume and local rollups.

### Capability Assimilation — VexLife #333

Owns the runtime discipline:

```text
TASK_INTENT
-> COMPACT_CAPABILITY_CUE
-> EXACT_CURRENT_SOURCE_RETRIEVAL
-> CURRENTNESS_COMPATIBILITY_AUTHORITY_CHECK
-> bounded use
-> later synthesis
```

### VMCF — VexLife #393

Provides source-safe model/runtime observation and currentness/introspection projections. It does not replace repository truth.

## Core architecture

```text
                 GITHUB / ACCEPTED SOURCE
        repos + commits + issues + PRs + receipts
                         |
                         | observe/fetch/compare
                         v
             SOURCE SYNC / CURRENTNESS SERVICE
                         |
          +--------------+----------------+
          |                               |
          v                               v
 LOCAL SOURCE MATERIALIZATION       CURRENTNESS LEDGER
 content-addressed/indexed cache     source generations,
 exact refs/hashes                   freshness/divergence,
 visibility/classification           observation receipts
          |                               |
          +---------------+---------------+
                          v
                  SHARED SOURCE FIELD
                          |
              +-----------+-----------+
              |                       |
              v                       v
             VEX                    DEVEX
       compact projection      deeper neighborhood
              |                       |
              +-----------+-----------+
                          v
               SCHOOL / CURATOR EVIDENCE
```

## Canonical direction

GitHub/repository source is upstream for source-managed architecture and current project state.

The Home may add private lived memory, reflections, local runtime state and training candidates, but those do not silently rewrite repository truth.

```text
REPOSITORY SOURCE
  -> local materialization
  -> bounded model projection
  -> lived work / learning
  -> candidate lesson / source correction
  -> reviewed issue or PR
  -> accepted repository source
  -> subsequent local sync
```

This loop is the scalable replacement for repeatedly baking fresh architecture snapshots into installer ZIPs.

## Local materialization contract

Each materialized source unit should preserve enough identity to revalidate it:

```text
materializationRef
sourceRef
originRepositoryRef
originObjectRef or path
originCommitOrGenerationRef
contentSha256
visibilityClass
observedAt
lastComparedAt
materializationState
supersededByRef or null
refreshTriggerRefs[]
```

Minimum states:

```text
CURRENT
LOCAL_BEHIND_REMOTE
LOCAL_AHEAD_UNPUBLISHED
DIVERGED
STALE
REMOTE_UNAVAILABLE
SOURCE_REMOVED_OR_SUPERSEDED
UNKNOWN
```

`CURRENT` requires positive source evidence. It is not inferred merely because a local checkout exists.

## Local checkout rule

A local repository checkout is a working/materialized source surface, not automatic current truth.

```text
local HEAD
!= remote main
!= accepted source generation
!= latest issue/PR state
```

The system must compare them before making current-sensitive conclusions.

A behind checkout should normally remain readable. Source Sync may fetch/observe remote truth without silently resetting, rebasing, pulling, checking out or deleting local work.

```text
REMOTE OBSERVATION
!= LOCAL WORKTREE MUTATION
```

## Startup/currentness behavior

At Devex/Vex startup:

```text
1. identify Home + lineage + runtime
2. observe configured repositories and source anchors
3. compare local checkout HEAD to remote accepted/current observations
4. refresh local indexes/materializations that can be updated read-only
5. mark stale/diverged/unavailable surfaces explicitly
6. compile the smallest current source projection needed for orientation
7. never treat a frozen package pin as eternally current
```

Additional refresh triggers include:

```text
before a current-sensitive answer
before source mutation planning
before dataset freeze
before training/evaluation admission
when an implicated source's freshness window expires
when a GitHub/relay event reports material change
when Vex or Devex detects contradictory generations
manual /sync or /refresh request
```

## Read versus mutate

Default sync is read-only/accounting behavior:

```text
fetch/observe refs
compare generations
materialize authorized source
update local index/currentness ledger
invalidate stale projections
```

It does not imply:

```text
auto merge
auto pull into dirty worktree
auto reset/rebase
source mutation
issue/PR acceptance
training
publication
```

Those effects remain separately admitted.

## Source promotion / learning loop

A useful new discovery from Devex should not remain only in Home or chat.

Candidate flow:

```text
lived discovery
-> source-bound evidence
-> reflection / Earlier-Knowledge classification
-> Curator disposition
-> RETRIEVAL_ONLY | HOME_MEMORY | TRAINING_CANDIDATE | SOURCE_CORRECTION_CANDIDATE
```

If `SOURCE_CORRECTION_CANDIDATE`:

```text
form issue / PR candidate
-> preserve exact source relation and why
-> independent review / normal lifecycle
-> accepted merge when earned
-> Source Sync observes new accepted generation
-> Vex/Devex Homes re-materialize it
```

Thus learning may improve the source of truth without letting a model silently self-author canonical meaning.

## Human-visible status

The session header / advanced inspector should eventually expose compact source health, for example:

```text
Source currentness
  VexLife       LOCAL_BEHIND_REMOTE
  Vextreme-SDK  CURRENT
  Foundation    CURRENT_AT_CHECKPOINT_1.0.1
  GitHub        AVAILABLE
  Last sync     <timestamp>
```

The advanced surface may show exact refs and deltas. Ordinary conversation should remain calm unless currentness materially affects the answer.

## School / Curator diagnostic value

Currentness evidence must travel with learning episodes so Curator can distinguish:

```text
model misunderstood current source
model never retrieved current source
local checkout was stale
remote source was unavailable
bootstrap curriculum was stale
runtime/tooling resolved the wrong namespace
true durable reasoning/behavior deficiency
```

```text
STALE_SOURCE_FAILURE
!= WEIGHT_LEARNING_FAILURE
```

## Fresh Devex package implication

Future Devex installers should contain primarily:

```text
Home/runtime executable substrate
source-sync/currentness client
minimal boot anchors
School/Curator machinery
safe defaults
```

They should not need to contain a forever-current copy of the whole architecture corpus.

At install/start, the Home should obtain the latest allowed source projection from GitHub/local repositories, bind exact refs/hashes, and preserve provenance.

Offline mode may use the last accepted local materialization, but must label it `OFFLINE_LAST_KNOWN` or equivalent rather than claiming live currentness.

## B0 lesson exposed on 2026-09-05

The first fresh Devex B0 run demonstrated why this composition is required:

- the Home held several source generations at once;
- Devex could inspect live GitHub issue sources;
- Devex nevertheless incorrectly concluded its older local checkout HEAD was the most-current source;
- one Home source namespace was resolved through the repository reader instead of the Home filesystem;
- stale packaged curriculum could therefore be mistaken for current foundation if source classes were not explicit.

This is product/system evidence first. It must not be prematurely trained into weights as though the model alone caused the failure.

## Non-collapse invariants

```text
GITHUB_SOURCE != HOME_MEMORY
HOME_SOURCE_MATERIALIZATION != CANONICAL_AUTHORITY
LOCAL_HEAD != REMOTE_CURRENTNESS
FETCH != WORKTREE_MUTATION
PR_CANDIDATE != ACCEPTED_MAIN
ISSUE_CHECKPOINT != MODEL_GENERATION
CURRENT_SOURCE != WEIGHT_FOUNDATION
SOURCE_CORRECTION != SILENT_SELF_MODIFICATION
```

## Current maturity

```text
architectureMeaning=SOURCE_PLACED_CANDIDATE
existingOwnerReuse=PROVEN
fullLocalSyncRuntime=NOT_YET_PROVEN
backgroundGitHubWatcher=NOT_YET_PROVEN
HomeMaterializationRefresh=PARTIAL_PACKAGE_LEVEL_ONLY
trainingIntegration=NOT_YET_PROVEN
```

This document defines the composition target. Exact implementation source placement must reuse existing VexLife/VexInterface/GitHub/currentness owners and prove the smallest remaining source seam before mutation.

<!-- [VXG RealForever] -->