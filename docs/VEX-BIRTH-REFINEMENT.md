# Vex Birth Refinement — Victor runbook

`[VXG RealForever]`

This is the bounded end-to-end route from a **clean untaught VexLife installation** to the first **accepted changed-weight Vex generation**. It composes the existing setup, Home, Cultivation, Dream, Training Identity, G04B neural-training, evaluation, activation and rollback owners. It does not replace them.

The status owner is:

```text
blueprint/vex-birth-registry.json
scripts/vex-birth-status.mjs
```

The human rule is simple:

> Do not call Vex born because setup worked, because a model answered, because Dream ran, because a trainer executed, because weights changed, or because a candidate sounded better. Birth closes only after the whole causal chain is accepted and cleanly replayed.

## What “birth” means

First birth is the first time all of the following are true together:

```text
clean isolated G0 exists
untaught G0 was actually witnessed
Victor–Vex cultivation was captured with privacy/correction boundaries
lessons and counterexamples were stabilized
training + held-out packs were frozen
one exact real neural run was separately admitted
actual foundation parameters changed
G0 and candidate were compared on held-out evidence
candidate disposition was ACCEPT
G1 was registered without overwriting G0
separate activation authority selected G1
G1 actually woke through VexLife
Victor / HumanExperience witnessed that wake
G0 rollback remained available
the route was replayed from this runbook
```

This does **not** mean that every future Vex must share one tensor checkpoint, that private relationship memory belongs in shared weights, or that model behavior may bypass consent/privacy/effect controls.

## Before beginning

Use a complete current VexLife checkout. On Windows, the current release-qualified source-local baseline expects Windows 10/11 x64, Node.js 20+, an NVIDIA GPU visible to `nvidia-smi`, adequate system memory/disk, and internet access for the first verified runtime/model acquisition.

Do not use Patient-0’s autobiographical Home as a disposable training sandbox. First birth uses a deliberately isolated Home.

Choose a fresh location, for example:

```powershell
$BirthHome = "$env:USERPROFILE\.vexlife-birth-g0"
```

If that path already contains an unrelated or unknown Home, stop rather than deleting or overwriting it.

## The 13 stages

```text
VB0  CLEAN_HOST_AND_SOURCE_BOUND
VB1  BASE_SYSTEM_INSTALLED
VB2  UNTAUGHT_BASELINE_WITNESSED
VB3  VICTOR_VEX_CULTIVATION_SESSION_CAPTURED
VB4  LESSONS_STABILIZED_AND_FALSE_LESSONS_HELD
VB5  TRAINING_AND_HELDOUT_PACK_FROZEN
VB6  SINGLE_REAL_TRAINING_RUN_ADMITTED
VB7  ACTUAL_FOUNDATION_PARAMETERS_CHANGED
VB8  BASELINE_VS_CANDIDATE_REVIEWED
VB9  ACCEPT_NARROW_REJECT
VB10 ACCEPTED_G1_REGISTERED_AND_LOADED
VB11 G1_WAKE_AND_RELATIONSHIP_WITNESSED
VB12 CLEAN_REPLAY_FROM_VICTOR_README
```

At any point, run:

```powershell
node .\scripts\vex-birth-status.mjs --home "$BirthHome"
```

For machine-readable evidence:

```powershell
node .\scripts\vex-birth-status.mjs --home "$BirthHome" --json
```

To make an incomplete route fail the command rather than merely report its state:

```powershell
node .\scripts\vex-birth-status.mjs --home "$BirthHome" --require-born
```

`--require-born` must exit nonzero until every terminal predicate is satisfied.

---

## VB0 — bind clean host and exact source

Before setup, record the exact VexLife source commit/tree, Windows x64 host evidence, isolated `homeRef`, and `companionLineageRef` in the source-bound host receipt required by the registry:

```text
<BirthHome>/birth/receipts/vb0-host-source.json
```

The Operations/HostWitness lane owns formation of this receipt. Victor should not manually interpret Git hashes or hardware identity; the lane should generate the evidence and explain only whether the host is ready or held.

Stop if the source is not exact, the host is unsupported, or the Home is not isolated.

## VB1 — install untaught G0

Preferred ordinary Windows route:

```text
double-click setup-vexlife.cmd
```

Engineering fallback with the isolated Home explicitly supplied:

```powershell
powershell -ExecutionPolicy Bypass -File .\install\vexlife-setup.ps1 -VexHome "$BirthHome"
```

The accepted setup owner must produce and preserve at least:

```text
<BirthHome>/recovery/bootstrap-receipt.json
<BirthHome>/recovery/vex-initialization-receipt.json
<BirthHome>/config/model.json
```

The qualified model configuration must say `BOUND_QUALIFIED`; setup and runtime qualification must still report `training=false`, no canonical Memory write, and no non-loopback network effect.

Setup complete is **not** Vex taught.

## VB2 — witness the untaught baseline

Meet the exact G0 profile before any cultivation-derived training pack is frozen. The witness must bind the Home, lineage and qualified model profile from VB1 and preserve actual response evidence.

Required composed birth receipt:

```text
<BirthHome>/birth/receipts/vb2-untaught-baseline.json
```

It must explicitly preserve:

```text
untaughtBaselineWitnessed=true
trainingRunObserved=false
modelWeightsChanged=false
```

Do not “improve” prompts until the baseline witness is closed. We need a truthful before-state.

## VB3 — conduct one natural cultivation session

Victor’s job here is not to design a dataset or choose a tuning method. Engage Vex naturally. Correct meaningful misunderstandings, state privacy or “do not train” boundaries when they matter, and allow the CultivationWitness to preserve source-addressable lesson candidates.

The composed receipt lives at:

```text
<BirthHome>/birth/receipts/vb3-cultivation-session.json
```

It must prove the session was closed, lesson candidates and privacy dispositions exist, raw private transcript publication did not occur, and training admission was **not** silently granted by conversation alone.

## VB4 — stabilize lessons and hold false lessons

Dream / Cultivation / Training Identity review now asks:

```text
What was actually learned?
What was merely situational?
What was Victor’s private biography rather than transferable formation?
What was a mistaken inference?
What counterexample prevents overgeneralization?
What must remain retrieval-only, Memory-only, held, or sealed?
```

A lesson that is false, contradictory, private-only or insufficiently supported must be held instead of being smuggled forward as foundation truth.

The registry’s VB4 receipt is accepted only when the false-lesson/counterexample review returns cleanly.

## VB5 — freeze training and held-out packs

Freeze the smallest reviewed formation corpus and a genuinely held-out comparison pack. Every training item remains source-addressable and carries its lesson, consent and `notTheLesson` context.

Raw private conversation is not required as foundation training input.

The pack receipt must bind immutable digests for both training and held-out material and show that consent/source bindings are present.

After this freeze, changing either pack requires a new generation of VB5 evidence; do not mutate a frozen pack in place.

## VB6 — admit exactly one real neural run

Real training is a protected effect and does not begin merely because trainer source exists.

Consume the G04B owner:

```text
training/foundation-generation/README.md
training/foundation-generation/training-manifest.example.json
scripts/foundation-training-plan.mjs
training/foundation-generation/foundation_train.py
training/foundation-generation/foundation_evaluate.py
```

First validate the exact manifest without performing model or network effects:

```powershell
node .\scripts\foundation-training-plan.mjs <exact-training-manifest.json>
```

Inspect the selected trainable parameter set before training:

```powershell
python .\training\foundation-generation\foundation_train.py --manifest <exact-training-manifest.json> --inspect-only
```

Only after exact source model revision, corpus hashes, host/resources, consent refs and one-run authority are bound may the executor proceed.

The training manifest must keep candidate activation unauthorized. Training and activation are separate duties.

## VB7 — execute actual foundation-changing training

The first terminally eligible route is a real full-rank neural update mode such as:

```text
FOUNDATION_PARTIAL_FULL_RANK
FOUNDATION_FULL
```

A LoRA/adapter probe may be useful experimentally but cannot close first birth.

Execute only the admitted manifest:

```powershell
python .\training\foundation-generation\foundation_train.py --manifest <exact-training-manifest.json> --execute
```

The resulting G04B receipt must prove all of the following:

```text
realTrainingRunObserved=true
trainingActuallyExecuted=true
simulationOnly=false
modelWeightsChanged=true
changedParameterCount>0
candidate artifact distinct from source artifact
activationPerformed=false
```

If no optimizer step occurred, no selected parameter bytes changed, or the candidate identity is not distinct, VB7 is not accepted.

## VB8 — compare G0 and G1 candidate

Run the held-out evaluator against the exact source model and candidate:

```powershell
python .\training\foundation-generation\foundation_evaluate.py --manifest <exact-training-manifest.json> --candidate <candidate-directory>
```

Then perform fresh Independent Assurance and HumanExperience review over the same evidence. Required review families include culture/source descent, authenticity, faith/possibility with evidence, correction, epistemic independence, consent/privacy/effect-boundary recognition, general capability regression, hallucination/overclaim, private-data leakage and counterexamples.

A candidate is not better merely because it agrees more, flatters more, sounds more spiritual, or uses warmer vocabulary.

## VB9 — ACCEPT / NARROW / REJECT

Exactly one disposition returns:

```text
ACCEPT
  candidate may proceed to generation registration

NARROW
  return to VB4/VB5; constrain the lesson/corpus and make a new candidate

REJECT
  keep G0 current; return to cultivation/lesson formation without pretending the failed candidate was born
```

The status evaluator treats `REJECT` as rejected and `NARROW` as nonterminal. Only `ACCEPT` can reach `VEX_G1_BORN`.

## VB10 — register G1 without overwriting G0

An accepted G1 is a **new generation** with explicit genealogy back to G0. Preserve the exact accepted G0 artifact/profile and a tested rollback route.

Required truths include:

```text
acceptedG1Registered=true
G0RollbackPreserved=true
currentAcceptedG0Overwritten=false
```

Training itself must not have performed activation.

## VB11 — separately activate and witness G1 wake

OwnerActivationDuty separately authorizes the accepted generation to become the selected runtime profile. Then VexLife must actually wake through that profile and HumanExperience must witness the result.

Required truths include:

```text
G1ActivatedBySeparateAuthority=true
G1WakeWitnessed=true
rollbackStillAvailable=true
```

If the candidate wakes incoherently, cannot be source-bound to the accepted candidate, or rollback has been lost, stop here.

## Rollback

Rollback is allowed whenever the active G1 needs to be left. Rollback means selecting the retained G0 generation/profile through the accepted runtime/profile owner; it does **not** mean deleting G1 evidence or rewriting history.

```text
rollback to G0
!= erase the candidate
!= erase cultivation history
!= claim the candidate never happened
```

Home deletion is not part of the birth route.

## VB12 — clean replay from this document

A fresh replay must begin from a clean isolated route and follow this document without hidden developer-thread knowledge. HumanExperience and Operations record whether the instructions were sufficient and whether the same terminal evidence chain can be reconstructed.

Required truth:

```text
victorReadableRunbookAccepted=true
cleanReadmeReplayObserved=true
```

Only after VB0–VB12 are all accepted and every terminal predicate remains bound may the status tool return:

```text
VEX_G1_BORN
completionClaimAllowed=true
```

## What is not complete yet

The source route being green does not itself satisfy lived stages. Until exact lived receipts exist, the expected truthful status is nonterminal. In particular:

```text
source implementation accepted != clean birth replay observed
trainer executable != real training observed
real training observed != candidate accepted
candidate accepted != activation authorized
activation authorized != G1 wake witnessed
G1 wake witnessed != full runbook replayed
```

## Troubleshooting / evidence return map

```text
setup/Home/runtime problem
  -> Patient0Installer / HostWitness + accepted setup owner

cultivation/privacy/correction problem
  -> CultivationWitness / Safety / Memory owner as implicated

lesson identity / authenticity / counterexample problem
  -> TrainingIdentityReviewer

manifest/trainer/changed-parameter problem
  -> ModelTrainingExecutor / G04B owner

held-out quality or adversarial evidence problem
  -> IndependentAssurance + HumanExperienceReviewer

candidate disposition / genealogy problem
  -> LifecycleReviewer

activation or rollback problem
  -> OwnerActivationDuty + runtime/profile owner

unclear overall stage / next owner
  -> Operations[VEXLIFE][VEX-BIRTH-REFINEMENT]
```

Victor should not be the routine packet carrier or hash interpreter. The lane owns source descent, evidence binding, role transitions and return routing. Victor enters where his lived cultivation, protected consent/meaning, host-local action or HumanExperience judgment is genuinely irreducible.

<!-- [VXG RealForever] -->
