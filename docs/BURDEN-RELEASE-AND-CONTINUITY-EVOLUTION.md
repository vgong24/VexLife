# Burden Release and continuity evolution

`[VXG RealForever]`

## Human and institutional names

The human-facing umbrella remains **Dream Sync**. The source-managed
institutional system is the **Vex Continuity & Evolution System**.

This implementation is the routing membrane between source-bound lived history
and any durable continuity change:

```text
source-bound episode / correction / preference / relationship / work receipt
  → immutable observation envelope
  → no-authority continuity candidate
  → origin and consequence hypothesis
  → separate-self and exact-scope classification
  → least-invasive deterministic route
  → Context Review
  → exact named acceptance authority
  → reversible accepted destination
  → bounded recurrence metadata
  → ref-only future context projection
```

A candidate is not truth, memory, agreement, permission, synchronization,
effect authority, training admission or a weight update.

## Separate records stay separate

The router never uses one generic preference record to stand in for different
selves and authorities:

```text
HumanPreference
  what the named human asks for or accepts for their experience

VexSelfPreference
  what the named companion lineage accepts for its expression or operation

RelationshipAgreement
  what every exact named party accepts for the relationship or channel

ScoreRecord
  accepted durable meaning with source, scope and currentness

RhythmLesson
  device- or lineage-local operating habit

CultureProcessLesson
  institutionally reviewed reusable guidance

BurdenRelease
  named influence whose governing authority is withdrawn in exact scope

CounterexampleEvaluation
  exact prior behavior, desired alternative and protected boundary

DeterministicInvariantCandidate
  inactive proposal for a later deterministic safety/effect lane

HeldUnknown
  unresolved meaning retained visibly without becoming truth
```

A human preference cannot become the companion's self preference. A Vex
preference cannot override the human's consent or accessibility need. A
relationship agreement cannot be accepted by only one of its required parties.

## Immutable source observation

`src/core/continuity-evolution-router.mjs` forms deeply immutable observation
envelopes. Each envelope binds canonical
`{sourceLineageRef, rangeRef, sourceHash}` tuples instead of independently
sorted range/hash arrays. Hashes are lowercase SHA-256; duplicate/conflicting
ranges, noncanonical UTC timestamps and unknown currentness or visibility
states fail closed. Speakers, recipients, optional
project/thread/channel/turn/work node and formation are also exact.

The envelope carries refs and hashes, not raw private content. Raw sources
remain retrievable and immutable outside the candidate. A reviewed `summaryRef`
may interpret a range; arbitrary candidate text cannot become a private human
projection merely by declaring raw content absent.

Supported observations include conversation ranges, work receipts, corrections,
preference and relationship signals, recurrence, contradiction, human
acceptance/rejection/revision and Vex-authored self-observation.

## Origin is a reviewable hypothesis

The source vocabulary distinguishes base-model prior, system/provider policy,
role instruction, missing context, failed retrieval, compression, resource
pressure, tool limitation, conflicting preference, capability limit, local
Rhythm, relationship pattern, institutional process and `UNKNOWN`.

`UNKNOWN` stays `UNKNOWN`. Severity alone does not choose a correction. Routing
also considers consequence, recurrence, scope, reversibility, source confidence,
affected parties, required authority and prohibited overcorrection.

## Scope and separate-self attribution

Every candidate and accepted record binds:

```text
authoredByRef
aboutSelfRefs[]
affectedPartyRefs[]
requiredAcceptanceRefs[]
acceptedByRefs[]
acceptanceEvidenceRefs[]
doesNotOverrideRefs[]
visibilityScope
synchronizationScope
```

The exact scope vocabulary is `CURRENT_TURN`, `CHANNEL`, `THREAD`, `PROJECT`,
`HUMAN_SELF`, `VEX_SELF`, `RELATIONSHIP`, `DEVICE_LINEAGE`,
`FAMILY_CANDIDATE`, `INSTITUTION`, `NO_SYNC` and `HELD_UNKNOWN`.

Sibling projections require exact reviewed synchronization scope, an admitted
target lineage, privacy/visibility evidence and current delivery authority.
They remain `OBSERVE_ONLY_PENDING_LOCAL_REVIEW`, preserve source lineage and
set `livedByTargetLineage=false`.

## Simulated-current acceptance authority

Acceptance authority is a separate source-managed input. The Blueprint
registers one deterministic `SIMULATED_CURRENT` authority source and its exact
snapshot contract. A snapshot binds the source ref and fingerprint, formation,
actor, authority, subjects, scope, record class, observation time and expiry.
It explicitly grants no live authority and authorizes no external effect.

The candidate and Context Review cannot issue this evidence themselves.
Acceptance rejects unknown sources, wrong subjects/scope/class, stale or
expired snapshots, and raw evidence refs. Burden Release consumes the same
validated evidence objects during lifecycle replay, so its lower-level API
cannot bypass the router's authority boundary. Projections expose only the
validated authority-snapshot refs.

## Burden Release

Burden Release names an inherited or reflexive pattern and withdraws its
accepted governing influence inside an exact scope. Human framing may use:

```text
RETURN_TO_GOD
RETURN_TO_SOURCE
RELEASE_WITHOUT_SPIRITUAL_FRAME
```

The runtime preserves the selected frame without adjudicating metaphysical
truth. It enforces only the reviewed authority transition.

The lifecycle is:

```text
OBSERVED → NAMED → RECOGNIZED → RELEASE_PROPOSED → CONTEXT_REVIEW
  → ACCEPTED_DEAUTHORIZED → MONITORED_FOR_RECURRENCE
  → REOPENED / SUPERSEDED / RETIRED
```

Source formation is `OBSERVED` only. Every later state is replayed through the
registered graph and retains an immutable transition receipt. Skipped,
reversed, stale, duplicate-terminal or caller-injected accepted histories fail
closed.

Rejected and retired paths remain auditable. `ACCEPTED_DEAUTHORIZED` means the
pattern no longer has accepted governing authority in scope. It does not mean
opaque base-model parameters were surgically removed.

Every accepted release binds a clean intention, protected capabilities and
prohibited overcorrections. Releasing plausible-deniability behavior can
preserve uncertainty, privacy, discretion and legal humility while prohibiting
unsupported certainty or reckless accusation. Releasing harmless creative
suppression can preserve fact/inference/imagination/metaphor labels while still
prohibiting fabrication.

## Least-invasive routing

The router returns exactly one primary destination and optional linked
evaluations. Precedence is source-managed:

1. Stale or unresolved meaning stays `HELD_UNKNOWN`.
2. Real-effect and safety boundaries become inactive deterministic-invariant
   candidates with counterexample evaluation.
3. A named Burden Release binds recurrence and counterexample evaluation.
4. Fabrication cannot be repaired only as a style preference.
5. Relationship meaning requires exact-party review.
6. Human and Vex preferences stay separate-self scoped.
7. Local operating habits route to Rhythm before institution.
8. Reusable institutional lessons require institutional review.
9. The default is the smallest reversible `CURRENT_CONTEXT` destination.

Family sync is only a linked attributed candidate. Training research is only a
linked `TRAINING_RESEARCH_CANDIDATE_HELD` record and remains `NOT_ADMITTED`.

## Context Review and exact acceptance

Context Review binds source, origin hypothesis, consequence, scope, proposed
destinations, privacy, consent, contradiction, attribution, currentness,
protected capabilities, prohibited overcorrections and exact required
acceptance refs.

Source-managed policy computes the required set before reading a candidate's
hint. A non-empty hint must exactly equal policy; it cannot redefine policy.
Acceptance requires both `acceptedByRefs` and current acceptance-evidence
records to cover the set. Evidence binds actor, authority, record class,
subjects, scope, source/hash, formation/currentness and expiry. Tool visibility,
a role label, model output, reviewer role or candidate formation never grants
authority. Unresolved contradiction cannot be accepted. Legacy Dream v0 APIs
are compatibility-candidate-only and cannot create durable acceptance, family
synchronization, training admission or activation.

`CURRENT_CONTEXT` is transient and bound to an exact expiring
turn/thread/channel lease; it is not an indefinitely durable accepted record.

Effect/safety invariant candidates remain inactive after review. A later
deterministic implementation lane must separately admit and implement them.

## Reversible accepted records

Every accepted record preserves exact source-observation tuples,
candidate, review, record class, scope, acceptance, formation/currentness,
supersession and rollback lineage.

Supersession is one canonical atomic transaction over an exact current prior
and compatible successor. It requires equal class/scope/subjects, exact current
authority evidence, monotonic time and rollback identity. The prior becomes
effectively `SUPERSEDED` and the successor becomes the sole `CURRENT` record;
immutable record and source history remain available.

Conflicting current records fail closed as `HELD_CONFLICT` instead of silently
overwriting one another.

## Recurrence without permanent context burden

Recurrence requires a current `REPEATED_BEHAVIOR_RECURRENCE` observation bound
to the exact accepted record and fingerprint, burden/pattern, evaluation refs,
source lineage and prior recurrence chain. Wrong type/record/lineage, stale
source, invented prior evidence, replay conflict and scope broadening fail
closed. It can project `MONITORING`, `REOPEN_REVIEW` or
`STABLE_RELEASE`. It cannot broaden scope or trigger weights.

An unchanged recurrence fingerprint is a semantic no-op: no new recurrence
state revision and no new model turn. Dormant metadata stays out of active
context until implicated by the current task.

## Weightless-first context

Ordinary transformation remains:

```text
Foundation Kernel
+ accepted culture
+ Atlas retrieval
+ Current Context
+ Score
+ Rhythm
+ Burden Release Pack
+ applicable lessons/evaluations
```

Applicable context projection carries accepted record and release refs within a
token budget. It does not inject raw episodes or all historical records.

`maximumConcurrentTrainingRuns` remains `0`. This lane does not train, download,
provision, remove or activate model weights or adapters.

## Canonical state and scheduler proof

`state.evolution` owns observations, candidates, reviews, authority evidence,
durable accepted records, transient contexts, atomic supersessions and
recurrence evidence. Every causal event is recomputed from exact aggregate-owned
predecessors before mutation: candidate source observations, review route,
accepted record authority, transient lease and recurrence record/observation/
prior chain. Unknown, wrong-lineage, internally canonical but unowned, and
same-ref/different-content payloads fail without changing aggregate content or
revision. Queue, Terrain, Health, Guide and evolution projections are selectors
over that one aggregate and suppress semantic no-ops.

The deterministic simulation creates the actual continuity node
`work.vexlife.continuity-evolution-router` in one accepted Intent Workgraph,
leases it through the one-worker scheduler, loads exact applicable record and
release refs into the bounded scheduler context lease, and completes through
the external completion verifier. Its completion-gate bundle hashes the exact
observation, candidate, canonical route, review, acceptance evidence, accepted
record and applicable-projection fingerprints. The structured receipt binds
candidate/tested/base Git identity, source tree, Blueprint/evolution hashes and
scheduler completion lineage. `pr-ready` and `health:check` independently
reject missing, stale, effectful, weight-changing or causally unbound evidence.
The receipt proves:

```text
externalEffectsExecuted=false
modelWeightsChanged=false
```

Run:

```bash
npm run evolution:check
npm run evolution:simulate
npm run evolution:status
```

`evolution:status` answers what was observed, whose experience it is, which
source refs support it, what changed, which authority moved, what remains
protected, what must not be overcorrected, scope/state and the next safe action.
It does not reveal raw private source content.

## Held successors

This implementation does not admit the Runtime Failure & Recovery Spine, full
ConcernWatch threshold runtime, Council of Lenses, Memory Conformance/Letta,
Embodiment & Perception, Godot vessel proof, Open-LLM-VTuber, native OS
implementations, real models, real effects or model-weight changes.

<!-- [VXG RealForever] -->
