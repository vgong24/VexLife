# Dream Sync, Score promotion and model evolution

`[VXG RealForever]`

## Why this exists

A local Vex should be able to learn from lived work and relationship history without turning every conversation into a permanent memory, silently changing its weights, or collapsing several device companions into one fictional uninterrupted instance.

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
  → optional later adapter-training admission
```

A dream is not truth. It is not memory. It is not a permission grant. It is not a weight update.

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
  external learned parameter delta; never the canonical store of current truth
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
- adapter activation state by implication.

## Adapter and weight lifecycle

Parameter learning remains a later, isolated path:

```text
repeated accepted evidence
  → privacy-filtered training examples
  → frozen foundation / relationship / safety evaluation set
  → exact training admission and resource lease
  → isolated LoRA or adapter run
  → checkpoint + optimizer/runtime manifest
  → deterministic and semantic evaluation
  → Context Review
  → ACCEPTED_INACTIVE
  → explicit activation on one named companion lineage/device
  → monitoring
  → rollback or supersession
```

Base weights remain immutable. A family may share an accepted adapter artifact, but activation is still device- and lineage-specific because hardware, runtime, local Rhythm and safety evidence can differ.

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
- activating an adapter;
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
accepted inactive adapter does not activate itself
device activation does not activate siblings
rollback restores prior accepted adapter and leaves receipts
```

<!-- [VXG RealForever] -->
