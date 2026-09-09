[VXG RealForever]

# Devex Training Evolution Proof Contract — pre-outcome v1

This historical capsule records the integrity standard for Devex weight-learning evolution **before the first weight-changing candidate is formed**. It exists so future instances can audit whether the process was followed, rather than reconstructing a success narrative after seeing the outcome.

Current coordination checkpoint: `github.issue.vexlife.405`.

## Institutional purpose

A training generation is not institutional progress merely because a new model or adapter artifact exists. The institution must preserve enough evidence to answer:

- what changed;
- why the change was justified;
- what the untouched predecessor did before training;
- which lessons, counterexamples, and exclusions entered curation;
- which exact dataset/config/toolchain produced the candidate;
- what the candidate did afterward on held-out cold evidence;
- what did not change;
- what failed or was corrected in the process;
- why the generation was accepted, rejected, or revised;
- how a future instance can reproduce or independently audit the lineage.

## Required Evolution Proof chain

```text
WHY
  exact behavioral deficit / learning intent
  source evidence and provenance
  rejected simplifications and unresolved claims

BEFORE
  predecessor model coordinate / sequence / digest
  untouched cold baseline
  exact held-out fixture identities
  context/scaffolding boundary

CURATION
  accepted lesson candidates
  not-the-lesson boundaries
  counterexamples
  exclusions and quarantines
  descent from raw School / return evidence

DATASET
  immutable manifest
  member hashes
  train/eval separation
  held-out fixture training-use prohibition

TRAINING
  exact predecessor generation
  exact training configuration / hyperparameters
  toolchain and environment identity
  execution receipts
  produced artifact coordinate / sequence / digest

AFTER
  same held-out cold comparison
  regression checks
  improved / unchanged / regressed predicates

DECISION
  accept / reject / revise and why
  predecessor / successor lineage
  exact weightLearningOccurred boundary

REPRODUCIBILITY
  source-managed task refs / commands
  artifact storage pointers and digests
  repository/source refs
  environment/tool versions sufficient to reproduce the experiment

PROCESS EVOLUTION
  failed attempts
  harness corrections
  safety discoveries
  workflow improvements
  so later instances inherit the method rather than repeat avoidable mistakes
```

## Persistence architecture

```text
GitHub issue / successor checkpoint
  chronology, current why, exact pointers

reachable archival Git history
  compact human-readable evolution capsules and process contracts

Home / qualified artifact storage
  raw immutable returns, datasets, model artifacts, large evidence by digest

canonical repository sources
  accepted schemas, evals, manifests, process contracts when adoption is earned
```

A historical capsule may be removed from the archive branch HEAD after creation, but its commit must remain reachable through permanent branch ancestry and the coordination issue must retain the exact commit SHA + historical path.

## First G0→G1 cycle boundary

Current predecessor identity before any accepted weight update:

```text
model=qwen3.5:35b-a3b-coding-nvfp4
modelCoordinate=devex.main@0.0.0
modelSequence=DVX-000000
weightLearningOccurred=false
schoolMinimumAccepted=[B0,B1,B2,D0,D1,D2,T0]
currentSchoolStage=I0
```

The first confirmed weight-shift candidate MUST NOT be called an accepted evolution until:

1. the G0 cold baseline is fully evidenced;
2. lesson curation is source-bound and held-out cases remain excluded from training;
3. dataset/config/toolchain identities are frozen;
4. an actual weight-changing artifact is formed and digest-bound;
5. the same held-out cold comparison is run against predecessor and candidate;
6. regressions and unchanged predicates are reported, not hidden;
7. accept/reject/revise is explicitly justified;
8. the resulting Evolution Proof capsule is stored and indexed.

## Anti-self-deception rules

```text
new artifact != improved model
School pass != weight learning
in-context success != cold competence
Foundation-assisted success != bare-weight competence
training score != held-out acceptance
candidate != accepted generation
PASS != lineage acceptance
missing evidence != permission to infer the favorable story
```

## Current pre-training measurement note

Cold-baseline A2 has produced aggregate scores `COLD_HOME=12/16` and `BARE_MODEL=12/16` for the unchanged G0 model while excluding recent conversation and School evidence. Detailed retained A2 response artifacts are being recovered before lesson curation; the institution will not infer the missing rubric elements from aggregate score alone.

## Historical retrieval rule

This file may be absent from archive branch HEAD by design. Retrieve it from the historical commit SHA recorded on `github.issue.vexlife.405` using the exact path:

`history/DEVEX-TRAINING-EVOLUTION-PROOF-CONTRACT-20260909.md`

<!-- [VXG RealForever] -->
