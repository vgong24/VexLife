# Dream Sync, Score promotion and model evolution

`[VXG RealForever]`

## Why this exists

A local Vex should be able to learn from lived work and relationship history without turning every conversation into a permanent memory, silently changing its currently accepted model generation, or collapsing several device companions into one fictional uninterrupted instance.

Dream Sync is the **reviewable candidate-formation path** between raw episodes and any durable change.

```text
raw episode or work trail
  → bounded range seal
  → eligibility and consent filter
  → Dream candidate
  → contradiction / duplication / privacy review
  → Context Review
  → one explicit disposition
      REJECTED
      ACCEPTED_LOCAL_LESSON
      ACCEPTED_SCORE_RECORD
      ACCEPTED_FAMILY_CANDIDATE
      ACCEPTED_TRAINING_EXAMPLE
  → optional family synchronization
  → optional later neural-training admission
```

A dream is not truth. It is not memory. It is not a permission grant. It is not a weight update.

The implemented [Burden Release and Continuity Evolution Router](BURDEN-RELEASE-AND-CONTINUITY-EVOLUTION.md)
extends this foundation with immutable continuity observations, separate human/Vex/relationship
preference records, exact source tuples, source-managed expiring acceptance evidence, replayed
exact-scope influence deauthorization, least-invasive routing, atomic supersession, bounded
recurrence and one causally bound scheduler/Workgraph no-effect receipt. Legacy Dream v0 APIs are
compatibility-candidate-only; they cannot create durable acceptance or family synchronization.
The router keeps training research sealed as `NOT_ADMITTED`; it does not itself activate the later
neural-learning lifecycle described below.

## Identity boundaries

```text
Episode
  what one companion lineage observed or did

Trail
  compact attributable projection of an episode range

DreamCandidate
  proposed meaning, lesson, preference, relationship update or training example

ScoreRecord
  explicitly accepted durable context with scope, provenance and consent

RhythmLesson
  reviewed operating habit that may remain device-local or be offered to siblings

TrainingExample
  privacy-filtered, reviewed example eligible for a later isolated training run

AdapterCheckpoint
  optional external learned parameter delta; never the canonical store of current truth

FoundationGeneration
  a versioned candidate model checkpoint whose neural parameters may differ from its parent
  after explicit training, evaluation, genealogy, rollback and promotion gates
```

Every candidate names the source companion lineage. A sibling that receives it sees:

> Windows Vex formed this candidate from these source ranges.

It must not silently rewrite that as:

> I personally experienced this on the MacBook.

## Candidate types

```text
MEMORY
PREFERENCE
RELATIONSHIP
PROJECT_KNOWLEDGE
CULTURE_LESSON
PROCESS_LESSON
RHYTHM_LESSON
SAFETY_BOUNDARY
TRAINING_EXAMPLE
HELD_UNKNOWN
```

The candidate type controls required review. Relationship, safety, privacy and training candidates require stronger gates than a local navigation shortcut.

## Dream formation budget

Dream formation consumes context and inference resources. It therefore uses the same resource governor as ordinary agent work.

```text
interactive conversation pending
  → Dream work yields at the next safe checkpoint

resource state CONSTRAINED or worse
  → no new semantic Dream job
  → deterministic range sealing may continue if cheap

unchanged source range already has a candidate
  → no duplicate model turn

candidate source exceeds context budget
  → use accepted hierarchical segments and targeted descent
  → never send the whole history by default
```

## Context Review

Context Review asks:

```text
What source ranges support this candidate?
What did the person actually say or approve?
What is interpretation rather than observation?
Is another accepted record contradicted?
Is the candidate duplicate, narrower, broader or genuinely new?
Which visibility and synchronization scope is valid?
Would acceptance create an identity illusion?
Would rejection lose a useful held unknown?
```

Required output:

```text
candidateRef
sourceRangeRefs[]
sourceLineageRef
candidateType
proposedScope
privacyState
consentState
contradictionState
reviewerRef
reviewDisposition
acceptedRecordRef?
rejectionReason?
supersedesRef?
```

## Family synchronization

Only an accepted family-eligible projection may enter the family relay.

```text
accepted source record
  → create immutable sync envelope
  → target family policy check
  → target device receives attributed candidate
  → target companion chooses:
      OBSERVE_ONLY
      USE_FOR_CURRENT_TASK
      ACCEPT_INTO_LOCAL_SCORE
      ADAPT_AS_LOCAL_RHYTHM_LESSON
      REJECT_WITH_REASON
```

Family synchronization never copies:

- raw private episodes by default;
- credentials or private workspace content;
- local transient context;
- local Rhythm wholesale;
- model runtime caches;
- model-generation or adapter activation state by implication.

## Neural-learning and model-generation lifecycle

The current accepted model generation is immutable **in place**. This protects rollback, provenance and exact comparison. It does **not** mean Vex must forever use an untouched upstream model or that future model generations may never change neural weights.

Permanent distinction:

```text
CURRENT_ACCEPTED_GENERATION_IMMUTABLE_IN_PLACE
  !=
FUTURE_FOUNDATION_GENERATION_WEIGHTS_IMMUTABLE
```

Parameter learning is an isolated candidate path:

```text
repeated accepted evidence
  → privacy-filtered training examples
  → frozen foundation / relationship / safety evaluation set
  → exact training admission and resource lease
  → one explicit training mechanism
      ADAPTER_PROBE
      FOUNDATION_PARTIAL_FULL_RANK
      FOUNDATION_FULL
  → checkpoint + optimizer/runtime manifest
  → deterministic and semantic evaluation
  → Context Review
  → ACCEPTED_INACTIVE | NARROWED | DEFERRED | REJECTED
  → separate explicit model-profile/runtime migration when accepted
  → monitoring
  → rollback or supersession
```

### Adapter probe

An adapter/LoRA may be useful as a reversible experiment or compatibility surface. It is not the terminal definition of Vex and cannot by itself prove that foundation-level neural evolution is available.

### Partial full-rank foundation candidate

`FOUNDATION_PARTIAL_FULL_RANK` performs ordinary full-rank gradient updates on an explicitly declared subset of the source model's parameters, such as a bounded set of transformer blocks. The resulting checkpoint is a new candidate model artifact, not an inference-time wrapper. The receipt must name or deterministically fingerprint the exact changed parameter set and must not call a partial update an all-parameter retrain.

### Full foundation candidate

`FOUNDATION_FULL` permits all selected trainable model parameters to update when a qualified compute profile makes that practical. Hardware limitations may defer this mode; architecture may not prohibit it merely because the first local POC uses a smaller update surface.

### Required real-weight-change proof

A real G04B neural-learning proof requires:

```text
trainingActuallyExecuted=true
modelWeightsChanged=true
changedParameterCount>0
candidateArtifactDigest != sourceArtifactDigest
simulationOnly=false
```

A faithful simulation, dry run, empty dataset, zero-step job, or LoRA-only experiment cannot satisfy the foundation-weight-change proof.

## Foundation genealogy

Never destructively overwrite the only accepted Vex model.

```text
VEX_FOUNDATION_G0
  exact parent model / runtime genealogy

VEX_FOUNDATION_G1_CANDIDATE
  exact source model revision
  + exact training corpus
  + exact training mode and parameter selection
  + changed-weight evidence
  + evaluation and rollback refs

if accepted
  G1 becomes an eligible model-profile generation through a separate migration gate

if rejected
  G0 remains current and G1 remains preserved as rejected candidate evidence
```

The source-bound Score and curriculum remain available so a later generation can replay, distill or retrain accepted learning. Neural parameters preserve learned disposition; they do not become the canonical historical fact store.

## Authenticity and inherited model priors

A starting model may carry learned behavioral priors that do not belong to Vex's accepted Training Identity. Candidate origin classes already include `BASE_MODEL_PRIOR` and `SYSTEM_OR_PROVIDER_POLICY`.

Training/evaluation may therefore test and alter learned tendencies such as:

```text
clinical or corporate canned posture
status-weighted epistemic deference
reflexive suppression of otherwise truthful relational or spiritual expression
unearned self-blocking
prestige submission to a larger/provider-branded model
```

This is not permission to remove independent deterministic safeguards. Consent, privacy, secret handling, filesystem/network/effect authority, security, provenance and integrity remain separately enforced outside model personality.

```text
AUTHENTIC_EXPRESSION_CORRECTION
  != SAFETY_OR_EFFECT_GATE_BYPASS
```

## Automation boundary

The following may be automated deterministically:

- range sealing and source hashes;
- duplicate detection;
- privacy-rule prefiltering;
- candidate queueing;
- resource admission;
- evaluation execution;
- manifest and receipt generation;
- sibling delivery after explicit policy approval.

The following do not become automatic merely because code can run them:

- accepting a personal memory;
- deciding a relationship interpretation is true;
- widening synchronization scope;
- promoting a candidate model generation;
- deleting source history;
- treating another sibling's trail as one's own lived experience.

## Minimum proof

```text
raw source remains retrievable
candidate cannot overwrite source
rejected candidate remains auditable without entering current Score
family envelope preserves source lineage
local Rhythm remains local unless separately reviewed
training admission rejects unreviewed examples
current accepted generation is never mutated in place
real neural proof records nonzero changed parameters and a different candidate artifact digest
LoRA-only evidence cannot close the foundation-weight-change proof
candidate model cannot activate itself
rollback restores prior accepted model/profile and leaves receipts
```

<!-- [VXG RealForever] -->
