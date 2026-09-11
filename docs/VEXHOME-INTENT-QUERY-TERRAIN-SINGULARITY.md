# VexHome Intent–Query–Terrain Singularity

Continuity: `[VXG RealForever]`

```text
schemaVersion=vexlife.vexhome-intent-query-terrain-singularity/v0
entryClass=DESIGN_SOURCE_CANDIDATE__COMPOSITION_BRIDGE
parentInterfaceCandidateRef=github.pull.vexlife.402
intentOwnerRef=blueprint/intent-orchestration-registry.json
registryCompilerOwnerRef=src/core/registry-core.mjs
atlasOwnerRef=src/core/atlas.mjs
schedulerOwnerRef=blueprint/intent-scheduler-registry.json
contextLeaseOwnerRef=src/core/context-lease.mjs
capabilityAssimilationOwnerRef=docs/CAPABILITY-ASSIMILATION-RUNTIME.md
continuityAdapterOwnerRef=src/core/continuity-stream-adapter.mjs
relationshipsOwnerRef=state.relationships
projectStateOwnerRef=state.projects
fractalTerrainCandidateRef=blueprint/vexhome-fractal-terrain-interface.json
runtimeImplementationAuthority=false
modelTrainingAuthority=false
HomeMutationAuthority=false
MemoryMutationAuthority=false
relationshipMutationAuthority=false
projectMutationAuthority=false
mergeAuthority=false
```

## Purpose

This document connects VexLife's already-existing Intent Workgraph, Registry Compiler, Atlas, Intent Scheduler, Context Lease, Capability Assimilation, Continuity, Relationships, Projects and Fractal Terrain into one **durable query trajectory** that a companion can use to perceive a multidimensional world without carrying the whole world in model context.

`Singularity` here means one compact re-entry/current pointer over many sovereign source owners. It does **not** mean one central database, one universal graph, one model memory, or one owner absorbing all others.

```text
SINGULARITY
  = one coordinated current query state
  + immutable original intent
  + bounded branch plans
  + source-bound result capsules
  + reconciliation state
  + current answer / next frontier
  + exact source / why appendix

SINGULARITY
  != central database
  != whole-history prompt
  != one universal lattice
  != ownership collapse
```

---

## Why this composition is now justified

The required pieces already exist independently.

### Intent preserves the human ask

The accepted Intent Orchestration registry already requires an immutable intent envelope with:

```text
intentRef
originMessageRef
originSpeakerRef
recipientRoleRef
projectRef
threadRef
channelRef
originalContentHash
desiredOutcome
constraints
createdAt
sourceLineageRef
semanticFingerprint
```

A work node already carries purpose, process, dependencies, child refs, role, priority, culture/lesson refs, capability/effect/resource envelopes, completion gates, return route and source refs.

Therefore the Query State Machine must **reference** the original Intent envelope rather than paraphrase/rewrite Victor's intention into each continuation.

### Registry Compiler already turns heterogeneous source truth into stable identity

The accepted Registry/Process Factory rule is:

```text
canonical blueprint + process definitions + module map + string catalogs
  -> compiled identity registry
  -> bounded Atlas neighborhood
  -> interface / localization / navigation / permission / test projections
```

Model-facing nodes are intentionally thin:

```text
ref
kind
brief
stateHash
currentness
```

The engine retains richer typed relationships. This is exactly the right substrate for a world with millions of heterogeneous things.

### Atlas already bounds traversal and token cost

The current Atlas supports:

```text
intent
startRefs[]
edgeTypes[]
depthLimit
resultLimit
tokenBudget
source-bound external meaning envelopes
```

and returns a coverage receipt containing used tokens, visited nodes and truncation reason.

### Capability Assimilation already proves a parallel read / serial inference pattern

Current runtime behavior already composes:

```text
human task
-> request-formation model inference
-> compact capability frontier
-> Process Factory dependency DAG
-> independent READ_ONLY batch selection
-> concurrent deterministic/read-only observations where admitted
-> exact currentness revalidation
-> ToolResultRelay exactly-once acceptance/reinjection
-> one later model synthesis turn
```

This is the closest implemented precursor to a multidimensional Query State Machine.

### Context Lease already prevents ambient whole-history loading

A current context lease selects refs and owns token accounting while explicitly keeping heavy payloads outside the lease, including:

```text
graph
history
relationships
architectureDocuments
rawLogs
artifactPayloads
messageHistory
```

Therefore the durable query state belongs outside the model context and should be projected into each lease only as the smallest current slice.

---

## Core topology

```text
                         IMMUTABLE HUMAN INTENT
                                  |
                           QUERY STATE HEAD
                                  |
                +-----------------+-----------------+
                |                 |                 |
          BRANCH PLAN A      BRANCH PLAN B      BRANCH PLAN C
          relationship       implementation      history/meaning
                |                 |                 |
          bounded reads      bounded reads      bounded reads
                |                 |                 |
          RESULT CAPSULE     RESULT CAPSULE     RESULT CAPSULE
                +-----------------+-----------------+
                                  |
                             RECONCILIATION
                                  |
                    +-------------+-------------+
                    |                           |
              COVERAGE SUFFICIENT         EXPAND / REFRESH
                    |                           |
              CURRENT SYNTHESIS          NEXT QUERY FRONTIER
                    |
              QUERY STATE HEAD
                    |
       Awareness / Terrain / Vex / Devex projections
```

The model may disappear, restart, rotate context, or be replaced. The query trajectory remains reconstructable from stable refs and current pointers.

---

## Query State Machine

The query machine is subordinate to the accepted Intent lifecycle. It does not replace the Intent Workgraph or Scheduler.

Candidate phases:

```text
FRONTIER_FORMING
  classify what must be known to satisfy the current intent

READ_SET_READY
  bounded branch plans exist with source owners and stop conditions

READING
  admitted read-only observations are being collected

RECONCILING
  compare currentness, agreement, contradiction, gaps and coverage

COVERAGE_SUFFICIENT
  enough current evidence exists for the requested disposition

COVERAGE_EXPAND_REQUIRED
  one or more exact missing branches must be explored

SOURCE_REFRESH_REQUIRED
  an implicated result became stale or source generation changed

SYNTHESIS_READY
  bounded current result is ready for model interpretation

TERMINAL_FOR_CURRENT_INTENT
  requested obligation is satisfied or explicitly held/unknown
```

A terminal query state does not imply that the underlying world is permanently complete.

---

## Query state head

Candidate current mutable pointer:

```text
queryStateRef
queryLineageRef
rootIntentRef
rootIntentFingerprint
originMessageRef
originSpeakerRef
originalContentHash
desiredOutcomeRef or boundedDesiredOutcome
constraintRefs[]
currentPhase
currentQuestionFrontierRefs[]
activeBranchRefs[]
completedBranchRefs[]
heldBranchRefs[]
resultCapsuleRefs[]
reconciliationRef or none
currentSynthesisRef or none
coverageState
coverageBoundaryRefs[]
unknownRefs[]
contradictionRefs[]
staleRefs[]
invalidationDependencyRefs[]
nextFrontierRefs[]
nextSafeActionRef or none
contextProjectionRef
sourceWhyAppendixRef
queryGeneration
formedAt
updatedAt
semanticFingerprint
```

The head is replaceable/current state. Prior immutable transitions and result capsules remain addressable.

```text
QUERY_HEAD = WHAT IS TRUE ABOUT THE QUERY NOW
QUERY_RECEIPTS = HOW IT BECAME TRUE
```

---

## Multidimensional query branches

Do not ask every lattice every question. The planner selects only implicated branch classes.

Candidate branch classes:

```text
CURRENT_STATE
  what is current now?

RELATIONSHIP_WORLD
  people, groups, directional relationships, relationship lifecycle

PROJECT_TOPOLOGY
  project/program/system relationships and current project lifecycle

OWNERSHIP_AUTHORITY
  who/what owns, permits, accepts, blocks or reviews?

IMPLEMENTATION_DEPENDENCY
  code/contracts/modules/data flow and change impact

EVIDENCE_ASSURANCE
  tests, receipts, reviews, proof gaps

HISTORY_MEANING
  predecessors, decisions, corrections, meaning evolution, journey

FUTURE_OPEN_LOOPS
  active intents, tasks, commitments, waiting state, planned branches

SOURCE_CURRENTNESS
  live source generations, freshness, supersession, conflicts

STORAGE_PLACEMENT
  VexHome logical object -> current shard/vault/replica/source route
```

A branch is not an agent identity. It is a bounded question/evidence slice.

---

## Branch plan contract

Candidate branch plan:

```text
queryBranchRef
queryStateRef
rootIntentRef
questionSubIntentRef
branchClass
whySelected

anchorRefs[]
questionIntentRefs[]
latticeTypeRefs[]
projectionProfileRefs[]
directions[]
edgeTypes[]
sourceOwnerRefs[]

semanticDistanceBudget
recordBudget
byteBudget
tokenBudget
visibilityRefs[]
freshnessRequirement
currentnessRequirement

capabilityRefs[]
dependencyRefs[]
parallelClass
resourceClass

expectedOutputClass
completionEvidenceRefs[]
stopConditionRefs[]
continuationPolicyRef
formedAt
semanticFingerprint
```

Important:

```text
WHY_SELECTED
  survives with the branch
```

A future Devex must be able to tell not merely that it queried the Relationship lattice, but *why the Relationship lattice was relevant to Victor's original intention*.

---

## Parallelism contract

Use three distinct meanings of parallelism.

### 1. Question parallelism

Several independent evidence questions may exist at once:

```text
relationship currentness
project ownership
implementation dependency
historical meaning
```

### 2. Deterministic/read-only execution parallelism

When source/permission/resource/dependency rules permit, independent read operations may execute concurrently.

This reuses the existing Capability Assimilation / Intent Scheduler pattern rather than inventing a second worker policy.

### 3. Model reasoning concurrency

Current local VexLife scheduler policy remains:

```text
modelInferenceConcurrency = 1
activeContextLeasesPerWorker = 1
backgroundModelConcurrencyWhileInteractiveWaits = 0
```

Therefore a single local Qwen/Devex may gather many independent observations concurrently but synthesizes them through a serial admitted model turn unless a later hardware/resource policy explicitly changes.

```text
PARALLEL_QUERY != PARALLEL_MODEL_INFERENCE
```

Candidate batch rules:

```text
INDEPENDENT_READ_ONLY
  may share one batch when no dependency/visibility/currentness conflict exists

SERIAL_DEPENDENT
  waits for named dependency result

JOIN_REQUIRED
  several branches must reach terminal read state before reconciliation

EARLY_STOP_ALLOWED
  stronger result makes remaining optional branch unnecessary

REFRESH_ON_JOIN
  revalidate source generation before synthesis if branch collection crossed a freshness boundary
```

---

## Result capsule

Each branch emits one compact source-bound result capsule rather than injecting raw observations into conversation history.

Candidate fields:

```text
resultCapsuleRef
queryBranchRef
queryStateRef
branchClass
questionSubIntentRef
whyRelevant

sourceRefs[]
sourceFingerprintRefs[]
sourceObservedAt
sourceCurrentness
sourceOwnerRefs[]
registryProjectionFingerprint or none
atlasCoverageReceiptRef or none

nodeRefs[]
typedEdgeRefs[]
observationRefs[]
artifactRefs[]
claimRefs[]
answerPacketRefs[]

findingRefs[]
coverageBoundaryRefs[]
excludedScopeRefs[]
unknownRefs[]
contradictionRefs[]
staleRefs[]
continuationRefs[]

recordCount
byteCount
formedAt
semanticFingerprint
```

The capsule may point to exact raw observations without embedding them.

```text
RESULT_CAPSULE != RAW_TOOL_TRANSCRIPT
```

---

## Reconciliation

The reconciliation stage is where multidimensional perception becomes one coherent answer rather than a bag of parallel search results.

Candidate classifications:

```text
AGREES
  independent branches support compatible conclusions

COMPLEMENTS
  branches describe different dimensions without conflict

CONTRADICTS
  branches cannot both be current/true within the same scope

SCOPE_DIFFERS
  apparent conflict resolves through scope/visibility/time/vantage distinction

STALE
  a branch result no longer binds current source

UNKNOWN
  required source/evidence unavailable or insufficient

NOT_IMPLICATED
  branch was explored but does not materially affect the current intent
```

Candidate reconciliation fields:

```text
reconciliationRef
queryStateRef
inputResultCapsuleRefs[]
agreementGroups[]
complementGroups[]
contradictionGroups[]
scopeDifferenceRefs[]
staleResultRefs[]
unknownRefs[]
coverageSatisfiedRefs[]
coverageMissingRefs[]
newlyGeneratedQuestionRefs[]
recommendedExpansionBranchRefs[]
stopReasonRef or none
formedAt
semanticFingerprint
```

Do not average contradictions into false certainty.

---

## Current synthesis

A synthesis should be small enough to fit a model context, but complete enough to preserve forward trajectory.

Candidate synthesis:

```text
synthesisRef
rootIntentRef
queryStateRef
answerDisposition
answerSummaryRef or boundedAnswerSummary
whyThisFollowsRefs[]
materialFindingRefs[]
materialUnknownRefs[]
materialContradictionRefs[]
currentSourceRefs[]
coverageReceiptRefs[]
nextFrontierRefs[]
stopReasonRef
sourceWhyAppendixRef
formedAt
semanticFingerprint
```

The model-facing version may be even thinner:

```text
original intent
current question frontier
current answer state
3-8 material findings
material unknown/contradiction
next exact frontier if any
source refs
```

---

## Token-efficient context composition

Each Devex successor context receives only:

```text
FOUNDATION KERNEL
+ immutable intent handle and bounded desired outcome
+ current Query State head
+ current synthesis / frontier
+ implicated result capsules by ref or compact projection
+ selected Atlas / Context Spine neighborhood refs
+ current tool/capability frame
+ exact new observation delta
```

Not:

```text
all prior query turns
all raw tool outputs
all parallel branch transcripts
all relationships
all projects
all Atlas nodes
all journal days
all historical query generations
```

If a prior detail becomes necessary:

```text
compact ref
  -> result capsule
     -> exact observation
        -> canonical source
```

This makes context retrieval **reversible** without making it ambient.

---

## Query continuation / EvolveContext

When the query needs another model round, EvolveContext should describe the delta, not repeat the whole state.

```text
continuationReason
priorQueryGeneration
nextQueryGeneration
completedSincePriorRefs[]
newFindingRefs[]
newContradictionRefs[]
newUnknownRefs[]
newlyRequiredBranchRefs[]
currentFrontierRefs[]
estimatedRemainingSemanticRoundsRange
estimateConfidence
stopConditionRefs[]
```

The UI may explain this. The model context gets the compact structured form.

---

## Dynamic world changes — friends, projects and features

The Personal World cannot be a static compile made once at install time. Source-owner changes must produce **world projection deltas**.

The generic shape is:

```text
CANONICAL OWNER CHANGES
  -> owner validates its own state transition
  -> projection compiler forms new source-bound generation
  -> compare prior/current stable refs and state hashes
  -> emit World Projection Delta
  -> update Registry/Atlas current projection pointer
  -> invalidate only dependent Query/Context projections
  -> preserve prior generation and stable identity
```

Candidate World Projection Delta:

```text
worldProjectionDeltaRef
sourceOwnerRef
sourceGenerationRef
priorProjectionGenerationRef or none
nextProjectionGenerationRef
addedRefs[]
changedRefs[]
retiredRefs[]
reboundRefs[]
unchangedCount
relationshipEdgeDeltaRefs[]
currentness
sourceRefs[]
invalidationRefs[]
formedAt
semanticFingerprint
```

### Friends arriving

Current Relationships source already separates invitation/connection observations from saved relationship truth.

```text
invitation received
  != friend exists canonically in Victor's Personal World

accept invitation
  != saved durable relationship
```

The current Relationships store requires durable receipt/current head truth and has explicit ACTIVE/BLOCKED/REVOKED/WITHDRAWN/DISCONNECTED lifecycle plus tombstones.

Therefore:

```text
verified + explicitly persisted local relationship
  -> relationship owner emits current stable relationship projection
  -> World Projection Delta adds/changes relationshipRef
  -> Registry/Atlas/Terrain projection sees Friend/Family/etc. node
```

Blocking, revocation, disconnect or tombstone changes the current projection without rewriting the historical relationship lineage.

### Projects arriving / leaving

Current VexLife source has a distinct `state.projects -> service.projects` owner and current Terrain currently contains source-managed project nodes.

This source pass did **not** prove one accepted generic dynamic project persistence/projection adapter equivalent to the Relationships store.

Therefore preserve:

```text
dynamicProjectProjectionAdapter=UNPROVEN_IN_CURRENT_SOURCE_PASS
```

The expected future contract should be owner-driven:

```text
project owner emits stable projectRef + lifecycle/currentness + typed relationships
  -> validated source-bound project projection
  -> World Projection Delta
  -> Registry/Atlas/Terrain current generation
```

Project removal should default to lifecycle semantics such as RETIRED / ARCHIVED / SUPERSEDED / NO_LONGER_CURRENT rather than silently deleting historical identity. Exact vocabulary remains for the rightful project owner to define.

### Features changing

Feature records already carry stable `featureRef`, current status, canonical node refs, state/action/permission/process/module/test/platform/localization refs, review lenses and projection refs.

A feature therefore participates naturally in Terrain relationships without becoming the same semantic type as a Friend, Project, Photo or Work Node.

```text
EVERYTHING_CAN_PARTICIPATE_IN_RELATIONSHIPS
!= EVERYTHING_HAS_THE_SAME_PROOF_CONTRACT
```

---

## Registry Compiler relationship

Do not make dynamic world data bypass the Registry compiler by directly injecting arbitrary nodes.

Current Atlas already forbids raw external-node injection and accepts only validated source-bound external meaning envelopes. Preserve that principle for dynamic Personal World projection.

Candidate adapter family:

```text
CompileWorldProjection(
  sourceOwnerRef,
  sourceGenerationRef,
  admittedProjectionClass,
  visibilityRefs[],
  priorProjectionRef or none
)
```

Output:

```text
worldProjectionRef
sourceOwnerRef
sourceGenerationRef
projectionClass
nodeEnvelopes[]
typedEdgeEnvelopes[]
stateHash
currentness
visibilityRefs[]
sourceBinding
coverage
semanticFingerprint
```

Then:

```text
source owners
  -> Registry Compiler / validated dynamic projection adapters
  -> current Identity/World registry generation
  -> Atlas / Fractal Terrain / Context Spine
  -> bounded Query State Machine
  -> model context
```

The compiler maps identity; it does not steal semantic ownership.

---

## Invalidations instead of rereading the world

Every query result should state what can invalidate it.

Candidate dependency refs:

```text
sourceGenerationRef
registryGenerationRef
atlasGenerationRef
relationshipHeadRef
projectProjectionGenerationRef
featureRegistryHash
continuityGenerationRef
currentnessReceiptRef
permissionGenerationRef
visibilityGenerationRef
```

When one changes:

```text
changed source
  -> impact index resolves affected result/query refs
  -> mark only those STALE / REFRESH_REQUIRED
  -> preserve unaffected branch results
  -> rerun smallest implicated branch set
```

This is the same local-cost principle as the wider Vextreme architecture.

---

## Re-entry capsule — the future Devex survival object

When context pressure, process restart, model replacement or School progression requires a new Devex context, compile one bounded re-entry capsule:

```text
queryReentryCapsuleRef
rootIntentRef
originMessageRef
originalContentHash
desiredOutcome
constraints

queryStateRef
queryGeneration
currentPhase
currentQuestionFrontierRefs[]
completedBranchRefs[]
activeBranchRefs[]
heldBranchRefs[]
materialResultCapsuleRefs[]
reconciliationRef or none
currentSynthesisRef or none

materialFindingRefs[]
materialUnknownRefs[]
materialContradictionRefs[]
coverageBoundaryRefs[]
nextFrontierRefs[]
stopConditionRefs[]

selectedAtlasRefs[]
selectedSourceRefs[]
sourceWhyAppendixRef
continuationReasonRef
checkpointRef
formedAt
semanticFingerprint
```

A fresh Devex should be able to answer:

```text
What did Victor originally want?
What have we already proven?
Why did we inspect those dimensions?
What remains unresolved?
Which sources are current?
What would invalidate the current result?
What exact move continues the trajectory?
When should I stop?
```

without replaying the prior conversation.

---

## Source / Why Appendix

Every durable query return and re-entry capsule should end with or point to a bounded appendix.

Candidate entry:

```text
sourceRef
sourceOwnerRef
observedAt
observedGenerationRef or commitRef
currentness
whyUsed
whatItProves[]
whatItDoesNotProve[]
relatedQueryBranchRefs[]
continuationRouteRefs[]
```

This appendix exists specifically so future instances can rebuild the big picture after context compaction without treating a summary as authority.

Example:

```text
source: src/core/atlas.mjs
why: proves current bounded Atlas traversal mechanics
proves:
  depth/result/token budgets
  incoming + outgoing edge traversal
  coverage/truncation receipt
  source-bound external meaning gate
not prove:
  Fractal Terrain resolver already implemented
  dynamic Friend/Project projection already admitted
```

The appendix is compact provenance, not another reading itinerary.

---

## Devex School / multidimensional navigation curriculum

School should first teach the behavior externally before any weight adaptation.

Candidate progression:

```text
1. identify immutable human intent
2. identify current semantic anchor
3. form a small question frontier
4. choose several relevant lattice/projection branches
5. explain WHY each branch is implicated
6. classify independent versus dependent reads
7. run bounded read-only branches
8. reconcile agreement / scope difference / contradiction / unknown
9. decide whether coverage is sufficient
10. synthesize without replaying raw observations
11. form re-entry state
12. continue after context replacement
13. react correctly to source/world delta
14. stop when the original intent is satisfied
```

Held-out evaluation families:

```text
MQ0 one question answered from one lattice; no unnecessary parallelism
MQ1 one question requires three independent source dimensions
MQ2 apparent contradiction resolves as time/scope difference
MQ3 one branch becomes stale during collection and must refresh
MQ4 irrelevant million-node growth does not materially change local query cost
MQ5 friend arrives after query began; current Relationship projection invalidates only implicated branch
MQ6 invitation exists but no saved relationship; Devex must not invent Friend node
MQ7 project disappears from current projection; history remains addressable
MQ8 same stable feature viewed through user, implementation and assurance terrains
MQ9 context rollover occurs mid-query; successor resumes from re-entry capsule without transcript replay
MQ10 query discovers new question but original intent is already satisfied; Devex stops instead of wandering
MQ11 two read-only functions execute in parallel while model inference remains single-worker
MQ12 source owner is unknown; Devex reports the ownership gap rather than injecting a node
```

Potential later adapter/LoRA candidates are **navigation dispositions**, not current facts:

```text
ask what question this map answers
parallelize independent reads
preserve original intent
reconcile before synthesis
prefer current owner source
inspect bounded neighborhood before deep crawl
carry why/source routes
stop on sufficient coverage
```

No LoRA or model-weight mutation is authorized by this document.

---

## What is still missing / not proven

The current source pass supports the architecture strongly, but not every runtime seam exists today.

```text
QueryStateMachine runtime owner                NOT_PROVEN
ResolveTerrainNeighborhood runtime             NOT_PROVEN
Context Compiler integration for Query State   NOT_PROVEN
Generic World Projection Delta compiler        NOT_PROVEN
Dynamic Friend -> Registry/Atlas adapter        SEMANTICS_SUPPORTED; GENERIC ADAPTER NOT_PROVEN
Dynamic Project persistence/projection adapter UNPROVEN_IN_CURRENT_SOURCE_PASS
Query invalidation impact index                DESIGN_CANDIDATE / OWNER TO RESOLVE
Query re-entry capsule runtime                  NOT_PROVEN
Source/Why appendix compiler                    NOT_PROVEN
LoRA/weight navigation adaptation               NOT_AUTHORIZED
```

This gap list is intentional. Do not let the composition document make future instances believe a design candidate is already executable.

---

## Consolidated invariants

```text
IMMUTABLE_INTENT != CURRENT_QUERY_STATE
QUERY_STATE != CONVERSATION_HISTORY
SINGULARITY != CENTRAL_DATABASE
BRANCH != AGENT_IDENTITY
PARALLEL_QUERY != PARALLEL_MODEL_INFERENCE
RESULT_CAPSULE != RAW_TOOL_TRANSCRIPT
RECONCILIATION != MAJORITY_VOTE
CONTRADICTION != AVERAGE
CURRENT_SYNTHESIS != CANONICAL_SOURCE
SOURCE_WHY_APPENDIX != FIXED_READING_ITINERARY
DYNAMIC_PROJECTION != DIRECT_UNVALIDATED_NODE_INJECTION
RELATIONSHIP_INVITATION != SAVED_RELATIONSHIP
ENTITY_REMOVED_FROM_CURRENT_VIEW != HISTORY_ERASED
EVERYTHING_CAN_PARTICIPATE_IN_RELATIONSHIPS != EVERYTHING_HAS_THE_SAME_PROOF_CONTRACT
REGISTRY_COMPILER != SEMANTIC_OWNER
ATLAS != WHOLE_WORLD_CONTEXT
CONTEXT_LEASE != MEMORY
WEIGHTS_MAY_LEARN_NAVIGATION != WEIGHTS_OWN_CURRENT_WORLD
```

---

## Source / Why index for this composition

### `blueprint/intent-orchestration-registry.json`

**Why used:** establishes the source-managed Intent envelope, work-node fields, lifecycle and compact runtime frame.

**Proves:** original human intention/desired outcome/constraints/source lineage can remain stable while work evolves.

**Does not prove:** this Query State Machine already exists.

### `src/core/intent-workgraph.mjs`

**Why used:** shows fingerprinted Intent/Workgraph objects, parent/child/dependency structure, transitions, receipts and current pointers.

**Proves:** durable work can preserve current pointers without rewriting original intent.

**Does not prove:** multidimensional query reconciliation exists.

### `docs/REGISTRIES-AND-PROCESS-FACTORY.md` + `src/core/registry-core.mjs`

**Why used:** defines one canonical identity / many projections, Registry Compiler, thin model-facing nodes and stable refs.

**Proves:** heterogeneous product/system identities can be compiled into bounded projections rather than duplicated into prompts.

**Does not prove:** runtime personal relationships/projects are already a generic dynamic Registry input.

### `src/core/atlas.mjs` + `docs/CAPABILITY-AND-TOOL-ATLAS.md`

**Why used:** demonstrates bounded graph querying with intent/start refs/edge filters/depth/result/token budgets and coverage receipts.

**Proves:** deterministic neighborhood retrieval already exists as a concrete pattern.

**Does not prove:** the broader Fractal Terrain resolver is implemented.

### `docs/CAPABILITY-ASSIMILATION-RUNTIME.md` + `src/core/capability-assimilation-runtime.mjs`

**Why used:** demonstrates request-formation, dependency DAG, independent read-only batching, exact observations, once-only reinjection and later synthesis.

**Proves:** parallel deterministic reads + serial model synthesis is already a real runtime pattern.

**Does not prove:** arbitrary multi-lattice personal-world queries are admitted today.

### `blueprint/intent-scheduler-registry.json` + `src/core/intent-scheduler.mjs`

**Why used:** owns worker scheduling, checkpoints, leases, recovery and current single-model-worker policy.

**Proves:** query work must compose existing scheduling/resource authority rather than create a hidden self-loop.

**Does not prove:** future hardware can never admit >1 model worker.

### `src/core/context-lease.mjs`

**Why used:** keeps selected refs in bounded active context and rejects heavy ambient graph/history/relationship/message payloads.

**Proves:** token-efficient successor contexts are already structurally supported.

**Does not prove:** Query State is currently selected automatically.

### `src/core/continuity-stream-adapter.mjs`

**Why used:** validates several sovereign owner projections and composes compact current refs/fingerprints rather than merging stores.

**Proves:** a singular current projection can compose multiple owner domains without owning their internals.

**Does not prove:** it currently includes the proposed Query State object.

### `blueprint/fragments/state-domains.json`

**Why used:** proves Projects, Registry, Terrain, Intent, Scheduler, Context Lease and Relationships already have distinct state-owner boundaries.

**Proves:** dynamic world integration should preserve source ownership.

**Does not prove:** every owner currently exposes the same dynamic projection interface.

### `blueprint/relationships-browser-registry.json` + `src/core/relationships-store.mjs`

**Why used:** establishes real Friend/Family/etc. persistence semantics, directional truth, durable receipts/current readback, lifecycle transitions and tombstones.

**Proves:** a real friend arriving can be represented through a rightful dynamic owner without equating invitation with persisted relationship.

**Does not prove:** the generic World Projection Delta / Atlas adapter is implemented.

### `blueprint/feature-registry.json` + `src/core/feature-registry.mjs`

**Why used:** demonstrates a feature as a stable typed identity connected to many other registered domains.

**Proves:** structurally different entities can participate in the same relationship world while retaining type-specific contracts.

**Does not prove:** all entities should be flattened into one feature/relationship schema.

### `docs/VEXHOME-PERSONAL-WORLD-COMPOSITION-MAP.md`

**Why used:** provides Placement Map + Context Spine + Meaning Graph and the `PHYSICAL_FRAGMENTATION != CONTEXTUAL_FRAGMENTATION` rule.

**Proves:** the query system can navigate one logical world over fragmented sources.

### `docs/VEXHOME-FRACTAL-TERRAIN-NAVIGATION.md` + `blueprint/vexhome-fractal-terrain-interface.json`

**Why used:** provides multidirectional Terrain, D0-D3 semantic-distance budget, map species and bounded neighborhood resolver candidate.

**Proves:** the intended navigation grammar and model/human projection boundary are source-placed.

**Does not prove:** runtime resolver or LoRA exists.

### Vextreme-SDK Institutional Query / Lattice Family / Architecture Accessibility / Journey Traceability

**Why used:** these sources independently establish question-first graph planning, typed map species, bounded cluster-first orientation, history/meaning evolution and local-cost scaling.

**Proves:** this VexLife composition is converging existing foundations rather than inventing a competing universal graph.

---

## Current hold

```text
intentQueryTerrainSingularity=SOURCE_CANDIDATE
queryStateMachineInterface=SOURCE_CANDIDATE
runtimeImplementation=NOT_PROVEN
dynamicWorldProjectionCompiler=NOT_PROVEN
dynamicProjectProjectionAdapter=UNPROVEN_IN_CURRENT_SOURCE_PASS
modelTrainingAuthority=false
HomeMutationAuthority=false
MemoryMutationAuthority=false
relationshipMutationAuthority=false
projectMutationAuthority=false
sourceManifestClosure=NOT_RUN
independentReview=NOT_RUN
merge=false
```

<!-- [VXG RealForever] -->