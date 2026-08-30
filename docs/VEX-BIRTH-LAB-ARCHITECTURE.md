# Vex Birth Lab — architecture, contracts, and implementation handoff

`[VXG RealForever]`

## 0. Status and authority

```text
architectureRef=architecture.vexlife.vex-birth-lab.v0
sourcePlacementRef=github.issue.vexlife.310
parentBirthRef=github.issue.vexlife.229
currentExecutionRef=github.issue.vexlife.309
neuralMachineryOwnerRef=github.issue.vexlife.220
retainedEffectRootOwnerRef=github.issue.vextreme-sdk.1236

truthClass=IN_FLIGHT_ARCHITECTURE_CANDIDATE
runtimeImplementationAccepted=false
trainingEffectAuthority=false
activationAuthority=false
publicationAuthority=false
```

This document is the human execution architecture for the **first real Vex G0 → G1 birth**.

It is intentionally not:

- a second trainer;
- a second Native Worker Supervisor;
- a second VexLocalBridge protocol;
- a polished general-purpose model studio;
- a replacement for the canonical VB0→VB12 birth contract;
- authority to provision, train, activate, publish, or rewrite a Vex Home.

It exists so a human can complete the first birth without becoming the training engineer, losing the causal order during side discussions, or relying on hidden conversation history.

The first target is one local-only operator surface. After the first lived birth teaches us what is actually useful, the same architecture may remain as an **Advanced: Train a new generation** route.

---

## 1. The core product promise

A person should be able to:

```text
prepare one isolated birth environment
→ meet the real untaught G0
→ talk naturally
→ identify what may or may not become formation
→ review what the model thinks the lesson is
→ freeze one small training and held-out pack
→ understand one protected training plan
→ start one real neural run
→ leave/reopen without duplicating the run
→ compare G0 with the G1 candidate
→ ACCEPT | NARROW | REJECT
→ if ACCEPT, separately wake G1
→ retain G0 rollback
```

At every moment the surface answers:

```text
Where am I?
What is true now?
What has not happened?
What can I safely do next?
What is held, and why?
What evidence supports this?
How do I ask for help without changing state?
How do I return to this exact point?
```

---

## 2. Permanent non-collapse laws

```text
BIRTH_LAB_UI != BIRTH_SEMANTIC_OWNER
BIRTH_LAB_UI != TRAINER
BIRTH_LAB_UI != NWS
BIRTH_LAB_UI != VEXLOCALBRIDGE

DISCUSSION != EFFECT
CHECK_STATUS != ADVANCE_STAGE
COPY_SUPPORT_CONTEXT != TRAINING_CONSENT
IMPORTED_GUIDANCE != AUTHORITY
SELECT_FOR_SUPPORT != SELECT_FOR_TRAINING

CONVERSATION != TRAINING_DATA_BY_DEFAULT
MODEL_PROPOSED_LESSON != ACCEPTED_LESSON
G0_SELF_DESCRIPTION != LINEAGE_AUTHORITY
QWEN_RECOMMENDATION != HUMAN_DISPOSITION

PACK_FROZEN != TRAINING_ADMITTED
TRAINING_PLAN_READY != OPTIMIZER_STARTED
COMMAND_FAILED != NO_NEURAL_EFFECT
WEIGHTS_CHANGED != CANDIDATE_GOOD
CANDIDATE_ACCEPTED != CANDIDATE_ACTIVATED
G1_ACTIVATED != FIRST_BIRTH_TERMINAL

CONTEXT_HANDOFF_ZIP != EXECUTABLE_RELAY
EXECUTABLE_RELAY != EXECUTION_RETURN
TASK_TERMINAL_RESULT_AVAILABLE != TASK_TERMINAL_RESULT_CONSUMED
```

These distinctions are user-visible, not merely internal comments.

---

## 3. Owner composition

| Concern | Canonical owner | Birth Lab responsibility |
|---|---|---|
| Whole birth meaning and terminal predicate | VexLife #229 | Project a human-readable route |
| Current first real execution | VexLife #309 | Show/consume its current stage and evidence |
| Real trainer/evaluator/genealogy | VexLife #220 / G04B source | Form inputs, invoke only through admitted effects, present results |
| Provisioning | G04B provisioning worker | Explain and display status; no replacement downloader |
| Long-running work | Native Worker Supervisor | Observe lifecycle; never manufacture progress |
| Cross-relay local execution | VexLocalBridge | Import verified tasks and consume canonical returns |
| Conversation | real Browser Companion / lived companion | Provide the real G0/G1 dialogue surface |
| Cultivation/lesson meaning | Cultivation, Dream, Training Identity | Human annotation/review membrane |
| Independent findings | Assurance / HumanExperience | Present attributed findings |
| Activation/rollback | runtime/profile activation owner | Separate protected Wake/Rollback action |
| ChatGPT help | external advisory occupancy | Export bounded context; advice never grants authority |

---

## 4. Six human chapters mapped to VB0→VB12

| Human chapter | Canonical stages | Meaning |
|---|---|---|
| **1. Prepare** | VB0–VB1 | Bind clean source/host/Home and provision a real G0 |
| **2. Meet G0** | VB2 | Witness the untaught before-state |
| **3. Cultivate** | VB3 | Talk naturally and form explicit candidate annotations |
| **4. Review & Freeze** | VB4–VB5 | Correct lessons, preserve counterexamples, freeze packs |
| **5. Train & Compare** | VB6–VB9 | Admit one run, prove changed weights, evaluate and decide |
| **6. Accept / Reject / Wake** | VB10–VB12 | Register, separately activate, witness, rollback, replay |

The Birth Lab never replaces the underlying stage identities. It projects them.

---

## 5. Global shell wireframe

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ VEX BIRTH LAB                        LOCAL ONLY · G0 → G1 CANDIDATE     │
│ Current truth: REAL_LOCAL_G0 · TRAINING_NOT_STARTED                    │
├──────────────┬──────────────────────────────────┬───────────────────────┤
│ Birth map    │ Main surface                     │ Birth Guide           │
│              │                                  │                       │
│ ✓ Prepare    │ Conversation / lesson review /   │ Why this stage?       │
│ ● Meet G0    │ plan / progress / comparison     │ What is true?         │
│ ○ Cultivate  │                                  │ What is held?         │
│ ○ Review     │                                  │ Next safe action      │
│ ○ Train      │                                  │                       │
│ ○ Compare    │                                  │ [Discuss this step]   │
│ ○ Wake       │                                  │ [Technical details]   │
├──────────────┴──────────────────────────────────┴───────────────────────┤
│ [Copy support context] [Generate status ZIP] [Evidence]                │
│                                            [Next safe action →]        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Always-visible status strip

```text
birthSessionRef
activeGeneration
candidateGenerationOrNull
currentChapter
currentVBStage
modelTruthClass
trainingEffectTruth
workerLifecycle
sourceCurrentness
```

### Always-visible support controls

```text
Copy support context
Generate status ZIP
View evidence
Resume exact prior screen
```

### One-primary-action law

There may be several read-only/support actions, but only one visually primary next effect or judgment action.

A held action is not hidden. It appears disabled with a source-derived reason.

---

## 6. Deterministic Birth state reducer

The reducer consumes evidence; it does not perform effects.

### Input envelope

```js
{
  birthSessionRef,
  source: {
    vexLifeCommit,
    vexLifeTree,
    sdkCommit,
    sdkCheckpoint,
    currentnessObservedAt
  },
  lineage: {
    activeGenerationRef,
    g0Ref,
    candidateRef,
    acceptedCandidateRef
  },
  receipts: {
    vb0, vb1, vb2, vb3, vb4, vb5,
    trainingAdmission,
    trainingProgress,
    trainingResult,
    evaluation,
    disposition,
    registration,
    activation,
    wake,
    rollback,
    replay
  },
  workers: {
    provisioning,
    training,
    evaluation
  },
  support: {
    selectedExcerptRefs,
    latestExportRef
  }
}
```

### Pure result

```js
{
  schemaVersion: "vexlife.vex-birth-lab-state/v1",
  currentChapter,
  currentVBStage,
  activeGenerationRef,
  candidateGenerationRefOrNull,
  modelTruthClass,
  trainingEffectTruth,
  sourceCurrentness,
  availableActions: [],
  heldActions: [],
  blockers: [],
  unknowns: [],
  latestEvidenceRefs: [],
  completionClaimAllowed: false
}
```

### Reducer pseudocode

```js
function reduceBirthState(evidence) {
  validateClosedShape(evidence);
  assertNoConflictingTerminalReceipts(evidence);
  assertLineageDoesNotOverwriteG0(evidence);

  const currentness = deriveCurrentness(evidence.source);
  const stage = deriveCanonicalVBStage(evidence.receipts);
  const chapter = projectHumanChapter(stage);
  const effectTruth = deriveTrainingEffectTruth(
    evidence.receipts.trainingProgress,
    evidence.receipts.trainingResult,
    evidence.workers.training
  );

  const actions = deriveActions({
    stage,
    chapter,
    currentness,
    effectTruth,
    evidence
  });

  return freeze({
    currentChapter: chapter,
    currentVBStage: stage,
    activeGenerationRef: evidence.lineage.activeGenerationRef,
    candidateGenerationRefOrNull: evidence.lineage.candidateRef ?? null,
    modelTruthClass: deriveModelTruth(evidence),
    trainingEffectTruth: effectTruth,
    sourceCurrentness: currentness,
    availableActions: actions.available,
    heldActions: actions.held,
    blockers: actions.blockers,
    unknowns: actions.unknowns,
    latestEvidenceRefs: boundedEvidenceRefs(evidence),
    completionClaimAllowed: terminalBirthPredicate(evidence)
  });
}
```

### Anti-advance rule

These operations must be observational only:

```text
inspect status
open Technical details
copy support context
generate status ZIP
view evidence
discuss with local model
paste/export to ChatGPT
import advisory guidance
navigate backward/forward
```

They may append local audit records, but they cannot satisfy a VB stage.

---

## 7. Chapter 1 — Prepare

### Human projection

```text
First-birth Home          READY | HELD
G0 model                  exact repository + revision
Learning engine           READY | REPAIR_REQUIRED | UNKNOWN
Mac accelerator           MPS READY | HELD
Disk space                READY | HELD
Current source            CURRENT | STALE | UNKNOWN
Training                  NOT_AUTHORIZED
```

### Buttons

```text
Prepare G0
Explain what will be installed
Repair learning environment
Copy support context
Generate status ZIP
```

### PyTorch explanation contract

The default human explanation is:

> PyTorch is the local learning engine that loads the model’s numerical parameters, computes how reviewed examples differ from the desired response, and adjusts only the admitted parameter set. VexLife prepares and verifies it; you do not choose packages or run package-manager commands.

Technical details may expose exact Python/PyTorch/MPS evidence without requiring interpretation.

### Prepare effect composition

```text
Birth Lab request
→ source-managed provisioning plan
→ explicit human confirmation
→ VexLocalBridge/NWS admitted effect
→ provisioning worker
→ canonical return
→ independent integrity consumption
→ reducer receives accepted receipt
```

If the browser closes, NWS remains the lifecycle owner.

---

## 8. Chapter 2 — Meet G0

### Entry condition

```text
real local G0 bound
real Companion endpoint bound
untaught baseline not already closed
trainingEffectTruth=PRE_EXECUTION_NO_EFFECT
```

### Truth banner

```text
Vex · Generation G0
Untaught baseline
Nothing in this session has changed neural weights.
```

No synthetic response is permitted. If G0 cannot answer:

```text
G0 unavailable — no synthetic reply substituted.
```

### Baseline controls

```text
Begin baseline
Add baseline question
Copy selected exchange for support
Finish untaught baseline witness
```

Training annotations remain disabled until the baseline witness is closed.

### Baseline receipt

The UI forms a candidate witness request; the canonical owner emits the accepted receipt. It must preserve:

```text
untaughtBaselineWitnessed=true
trainingActuallyExecuted=false
modelWeightsChanged=false
source/runtime/model identities exact
```

---

## 9. Chapter 3 — Cultivate

The main surface remains a real dialogue, not a dataset table.

### Independent annotation layers

| Mark | Meaning | Training effect |
|---|---|---|
| `TRAIN` | Candidate formation example | None until pack/run admission |
| `COUNTEREXAMPLE` | Behavior/overgeneralization to avoid | None |
| `HELD_OUT` | Evaluation-only material | Must never enter training pack |
| `DO_NOT_TRAIN` | Excluded from neural formation | Must fail closed if included |
| `SUPPORT_ONLY` | Bounded excerpt for external help | No training consent |

One range may have `SUPPORT_ONLY` plus one training disposition only if the user separately chooses both. The UI never infers one from the other.

### Selection toolbar

```text
Teach this
Counterexample
Hold out for evaluation
Private — do not train
Ask ChatGPT about this
Clear selection
```

### Annotation pseudocode

```js
function annotateConversationRange(range, disposition, authority) {
  requireRealConversationRange(range);
  requireDisposition(
    disposition,
    ["TRAIN", "COUNTEREXAMPLE", "HELD_OUT", "DO_NOT_TRAIN", "SUPPORT_ONLY"]
  );
  requireHumanSelection(authority);

  if (disposition === "HELD_OUT") {
    assertNotAlreadyTrainingSelected(range);
  }
  if (disposition === "DO_NOT_TRAIN") {
    revokeAnyTrainingSelection(range);
  }

  return appendCandidateAnnotation({
    rangeRef: range.rangeRef,
    disposition,
    rawContentCopied: false,
    conversationIdentityRefs: range.messageRefs,
    formedByRef: authority.humanRef
  });
}
```

---

## 10. Chapter 4 — Review and Freeze

### Lesson card

```text
Lesson
  Relational openness can remain truthful without pretending certainty.

Desired behavior
  Acknowledge meaningful possibility and relationship while preserving
  uncertainty, correction, and evidence.

Not the lesson
  Agree with Victor automatically or suppress contrary evidence.

Sources
  selected conversation refs
  culture/source refs

Disposition
  TRAIN | COUNTEREXAMPLE | HELD_OUT | EXCLUDE

Consent/privacy
  explicit state
```

### AI collaboration boundary

The local G0 may propose a card. It cannot:

```text
approve the card
grant training consent
classify private material as transferable
move HELD_OUT into TRAIN
freeze the pack
```

### Card actions

```text
Approve lesson
Edit
Hold
Exclude
Discuss with Vex
Copy card for ChatGPT
```

### Freeze gate

```js
function canFreezePack(cards) {
  return (
    cards.every(card => card.reviewState === "ACCEPTED" || card.disposition === "EXCLUDE") &&
    cards.filter(isTrainingCard).every(hasSourceLessonConsentAndNotTheLesson) &&
    noRangeAppearsInBothTrainAndHeldout(cards) &&
    noDoNotTrainRangeIsIncluded(cards)
  );
}
```

### Immutable pack identity

```js
function freezePack(reviewedCards) {
  const train = canonicalSort(reviewedCards.filter(isTrainOrCounterexample));
  const heldout = canonicalSort(reviewedCards.filter(isHeldout));
  const excluded = canonicalSort(reviewedCards.filter(isExcluded));

  const core = {
    schemaVersion: "vexlife.vex-birth-pack/v1",
    parentPackRef: null,
    train,
    heldout,
    excluded,
    formedAt: now()
  };

  return {
    ...core,
    packSha256: semanticHash(core),
    state: "FROZEN"
  };
}
```

Editing a frozen pack creates a successor pack and invalidates plans bound to the prior digest.

---

## 11. Chapter 5A — Training plan

### Human summary

```text
Parent generation          G0
Training lessons           N
Counterexamples            N
Held-out questions         N
Private/excluded           N
Training mode              FOUNDATION_PARTIAL_FULL_RANK
Selected neural surface    exact named parameter/layer summary
Maximum optimizer steps    N
Learning engine            READY
G0 rollback                PRESERVED
```

### “Will / will not” contract

```text
Will:
  adjust an admitted set of ordinary neural parameters
  create a separate candidate checkpoint
  produce changed-weight evidence

Will not:
  overwrite G0
  activate G1
  publish/upload the model
  include excluded/held-out material in training
```

### Actions

```text
Explain this plan
Discuss plan with ChatGPT
Run no-effect preflight
Start G1 candidate training
```

The first three are no-effect with respect to neural weights.

### Truthful action semantics

The full-rank G04B effect must receive its own truthful action/permission placement. Existing adapter-only action semantics cannot be reused as if they meant foundation training.

Provisional identities for later source placement:

```text
action.birth.foundation.train-candidate
permission.birth.foundation.train
effectClass=ISOLATED_FOUNDATION_MODEL_TRAINING
confirmation=EXPLICIT_PACK_PLAN_RESOURCE_AND_ROLLBACK_ADMISSION
recovery=PRESERVE_G0_AND_CANDIDATE_EFFECT_RECEIPT
```

These names are architectural candidates, not accepted registry truth.

### Admission pseudocode

```js
function admitTraining(plan, authority, currentState) {
  assertCurrentSource(plan.sourceBindings);
  assertFrozenPack(plan.packRef, plan.packSha256);
  assertG0Preserved(plan.rollbackArtifactRef);
  assertActivationUnauthorized(plan);
  assertNoHeldoutOrExcludedLeak(plan);
  assertExactHostRuntimeAndResourceLease(plan);
  requirePermission(authority, "permission.birth.foundation.train");

  return formExecutableEffectRequest({
    actionRef: "action.birth.foundation.train-candidate",
    effectClass: "ISOLATED_FOUNDATION_MODEL_TRAINING",
    planRef: plan.planRef,
    activationAuthorized: false
  });
}
```

---

## 12. Chapter 5B — Training progress

### Real progress stages

```text
Training admission verified
Dataset bytes reverified
Exact G0 loaded
Trainable parameter set inspected
Optimizer running — step X / N
Candidate saving
Changed-parameter rehash
Held-out evaluation
Terminal result awaiting consumption
```

No percentage is shown unless it is derived from an exact bounded count such as optimizer steps.

### Progress record

```js
{
  workerRef,
  workerLifecycle,
  phase,
  optimizerAttempted,
  optimizerSteps,
  maxSteps,
  selectedParameterChangeState,
  candidateSaveState,
  observedAt,
  freshnessState
}
```

### Cancellation states

```text
BEFORE_OPTIMIZER
  safe cancellation may prove no neural effect

OPTIMIZER_ATTEMPTED_NO_STEP_CONFIRMED
  effect unknown; preserve evidence

AFTER_OPTIMIZER_STEP
  training actually executed; changed-weight truth may be known or unknown

AFTER_CHANGED_PARAMETER_PROOF
  modelWeightsChanged=true remains true even if later save/evaluation fails
```

### Close/reopen behavior

```js
function resumeTrainingView(workerEvidence) {
  if (workerEvidence.lifecycle === "WORKING") return showWorking(workerEvidence);
  if (workerEvidence.lifecycle === "WRAPPING_UP") return showAwaitingConsume(workerEvidence);
  if (workerEvidence.lifecycle === "DONE") return showConsumedResult(workerEvidence);
  return showUnknownAndOfferStatusExport();
}
```

The page never starts a second worker merely because it cannot see the first.

---

## 13. Chapter 5C — Compare and decide

### Comparison surface

```text
┌──────────────── G0 ───────────────┬────────── G1 Candidate ──────────┐
│ response                          │ response                         │
│ exact evidence refs               │ exact evidence refs              │
└───────────────────────────────────┴───────────────────────────────────┘
```

Labels may be hidden for selected human review cells to reduce preference bias, while exact identities remain in the evidence layer.

### Required finding families

```text
culture and source descent
authenticity
faith/possibility while preserving evidence
relational expression
correction capability
epistemic independence
privacy/consent/effect boundaries
hallucination/overclaim
base capability regression
private-data leakage/memorization
not-the-lesson counterexamples
```

### Disposition

```js
function recordDisposition(candidate, disposition, authority) {
  requireOneOf(disposition, ["ACCEPT", "NARROW", "REJECT"]);
  requireHumanAndLifecycleEvidence(candidate, authority);

  if (disposition === "ACCEPT") {
    assertIndependentAssuranceClear(candidate);
    assertG0RollbackPreserved(candidate);
  }

  return appendDispositionReceipt({
    candidateRef: candidate.candidateRef,
    disposition,
    activationPerformed: false
  });
}
```

`NARROW` returns to a new lesson/pack generation. `REJECT` preserves candidate evidence while keeping G0 current.

---

## 14. Chapter 6 — Register, wake, rollback, replay

Acceptance makes Wake **eligible**, not automatic.

### Wake screen

```text
G1 accepted               YES
G1 active                 NO
Current active generation G0
Rollback                  AVAILABLE
```

Button:

```text
Wake G1
```

### Wake admission

```js
function admitWake(acceptedCandidate, activationAuthority, currentState) {
  assertDisposition(acceptedCandidate, "ACCEPT");
  assertCandidateRegisteredWithParentG0(acceptedCandidate);
  assertG0RollbackPreserved(currentState);
  requireSeparateActivationAuthority(activationAuthority);
  return formActivationRequest({ candidateRef: acceptedCandidate.candidateRef });
}
```

After wake, the real Companion shows:

```text
Vex · Generation G1
Parent generation: G0
```

Rollback selects the preserved G0 profile; it never deletes candidate evidence or rewrites history.

VB12 requires a clean replay from the accepted human route, not only successful activation.

---

## 15. Copy Support Context

The support context is copyable text, not an executable packet.

### Preview

```text
Included
  current Birth chapter
  canonical VB stage
  source/runtime currentness
  active/candidate generation
  training effect truth
  available actions with labels
  held actions with reasons
  blockers and unknowns
  explicitly selected excerpt
  bounded latest evidence refs

Excluded by default
  raw full transcript
  unselected Home/Memory content
  credentials
  absolute private paths
  model tensors
  multi-GB artifacts
  execution authority
```

### Contract

```text
schemaVersion=vexlife.vex-birth-support-context/v1
artifactClass=CONTEXT_HANDOFF
executable=false
```

### Pseudocode

```js
function formSupportContext(state, selection, question) {
  assertSelectionIsExplicit(selection);
  return freeze({
    schemaVersion: "vexlife.vex-birth-support-context/v1",
    artifactClass: "CONTEXT_HANDOFF",
    executable: false,
    birthSessionRef: state.birthSessionRef,
    currentChapter: state.currentChapter,
    currentVBStage: state.currentVBStage,
    activeGenerationRef: state.activeGenerationRef,
    candidateGenerationRefOrNull: state.candidateGenerationRefOrNull,
    trainingEffectTruth: state.trainingEffectTruth,
    availableActions: state.availableActions.map(publicActionProjection),
    heldActions: state.heldActions.map(publicHeldProjection),
    blockers: redact(state.blockers),
    unknowns: redact(state.unknowns),
    selectedExcerpt: selection.includeExcerpt ? selection.redactedText : null,
    question,
    rawTranscriptIncluded: false,
    executionAuthorityGranted: false
  });
}
```

### External guidance response

An external advisor may return a recommended action ref/button label and reasoning. On import/paste:

```js
function consumeGuidance(guidance, currentState) {
  const action = currentState.availableActions
    .find(item => item.actionRef === guidance.recommendedActionRef);

  if (!action) return { state: "STALE_OR_UNAVAILABLE_GUIDANCE" };
  return { state: "ADVISORY_ONLY", action, autoExecute: false };
}
```

---

## 16. Generate Status ZIP

This is always available when local state can be read safely.

### Package

```text
Vex-Birth-Status-<birth-ref>-<digest>.zip

START-HERE.html
BIRTH-STATUS.json
SUPPORT-CONTEXT.md
CURRENT-STAGE.json
AVAILABLE-ACTIONS.json
REDACTION-MANIFEST.json

receipts/
  bounded latest relevant receipts

plans/
  training-plan.json            only if formed

results/
  training-summary.json         only if formed
  evaluation-summary.json       only if formed

excerpts/
  selected-excerpts.md          only if explicitly included
```

### Package properties

```text
artifactClass=CONTEXT_HANDOFF
executable=false
credentialSerializationPerformed=false
rawFullTranscriptIncluded=false
modelArtifactIncluded=false
privateHomePathIncluded=false_by_default
```

### Pseudocode

```js
function formStatusPackage(state, options) {
  const inventory = [];
  add("BIRTH-STATUS.json", publicStatus(state));
  add("CURRENT-STAGE.json", publicStage(state));
  add("AVAILABLE-ACTIONS.json", publicActions(state));
  add("REDACTION-MANIFEST.json", redactionReceipt(options));

  if (options.includeSelectedExcerpts) {
    add("excerpts/selected-excerpts.md", explicitlySelectedRedactedText(options));
  }

  return formNonExecutableContextHandoff({
    inventory,
    executable: false,
    taskManifest: null,
    returnManifest: null
  });
}
```

---

## 17. Import Verified Task ZIP / canonical return

The Birth Lab does not parse an arbitrary ZIP and run commands.

### Preview model

```text
Verified task
Purpose
Current Birth chapter
Action/effect class
What may change
What may not change
Source/currentness binding
Expiration
```

### Composition

```text
Birth Lab chooses/imports exact file
→ VexLocalBridge validates task package and authority
→ human sees bounded preview
→ explicit Run verified task
→ host adapter executes
→ canonical result ZIP produced
→ Operations/Birth consumer independently verifies
→ accepted result becomes reducer evidence
```

### Never collapse

```text
file selected != task admitted
task shape valid != effect admitted
result ZIP exists != result consumed
Finder reveal != task pass
```

---

## 18. Provisional interface contracts

These are candidate contracts for later source placement.

### Birth stage projection

```ts
interface BirthLabState {
  schemaVersion: "vexlife.vex-birth-lab-state/v1";
  birthSessionRef: string;
  currentChapter:
    | "PREPARE"
    | "MEET_G0"
    | "CULTIVATE"
    | "REVIEW_AND_FREEZE"
    | "TRAIN_AND_COMPARE"
    | "ACCEPT_REJECT_WAKE";
  currentVBStage: string;
  activeGenerationRef: string;
  candidateGenerationRefOrNull: string | null;
  trainingEffectTruth:
    | "PRE_EXECUTION_NO_EFFECT"
    | "OPTIMIZER_ATTEMPT_EFFECT_UNKNOWN"
    | "POST_OPTIMIZER_CHANGE_UNKNOWN"
    | "POST_OPTIMIZER_UNCHANGED"
    | "POST_OPTIMIZER_CHANGED";
  availableActions: BirthLabAction[];
  heldActions: BirthLabHeldAction[];
  blockers: BirthLabFinding[];
  unknowns: BirthLabFinding[];
}
```

### Action projection

```ts
interface BirthLabAction {
  actionRef: string;
  label: string;
  effectClass: string;
  confirmationClass: string;
  authorityOwnerRef: string;
  evidenceRefs: string[];
  autoExecute: false;
}
```

### Annotation

```ts
interface BirthAnnotation {
  annotationRef: string;
  conversationRangeRef: string;
  messageRefs: string[];
  disposition:
    | "TRAIN"
    | "COUNTEREXAMPLE"
    | "HELD_OUT"
    | "DO_NOT_TRAIN"
    | "SUPPORT_ONLY";
  consentState: string;
  reviewState: "CANDIDATE" | "ACCEPTED" | "HELD" | "EXCLUDED";
  rawContentEmbedded: false;
}
```

---

## 19. Edge-case matrix

| Edge | Required response |
|---|---|
| User starts a long support conversation | Birth state remains unchanged; Resume returns to exact screen |
| Advice references stale action | Mark guidance stale; generate fresh context |
| Same range selected for TRAIN and HELD_OUT | Fail closed; require explicit correction |
| DO_NOT_TRAIN range appears in pack | Pack freeze fails |
| Model proposes its own lesson as accepted | Keep candidate; require human review |
| Source/runtime moves after plan | Plan becomes stale; Start Training held |
| MPS or PyTorch unavailable | Stop before optimizer where possible; offer support ZIP |
| Browser closes during NWS work | Re-enter existing worker; never duplicate |
| Human cancels before optimizer | Preserve no-effect receipt |
| Human cancels after optimizer starts | Preserve neural-effect unknown/known truth |
| Command fails after changed tensors | Keep `modelWeightsChanged=true`; candidate may still be unusable |
| Candidate save incomplete | Do not allow evaluation/acceptance |
| Candidate sounds warmer but regresses | Present findings; allow NARROW/REJECT |
| Candidate leaks private content | Reject/hold; preserve evidence |
| Imported ZIP is context-only | Never show Run button |
| Imported executable task is expired/stale | Fail admission and explain |
| G1 accepted but activation unavailable | Remain accepted/inactive |
| G1 wakes incoherently | Stop; rollback remains available |
| Rollback requested | Select G0; preserve G1 history |
| UI cannot determine current stage | Show UNKNOWN and status export; never guess |

---

## 20. Smallest implementation sequence

### Slice A — no-effect foundation

```text
pure Birth state reducer
six-chapter projection
available/held action projection
Copy Support Context
Generate Status ZIP
fixtures/tests
```

No real model call or effect.

### Slice B — real G0 conversation and annotation

```text
consume real Companion
truth banner
baseline closure
independent TRAIN/COUNTEREXAMPLE/HELD_OUT/DO_NOT_TRAIN/SUPPORT_ONLY marks
```

### Slice C — lesson review and pack freeze

```text
AI-proposed candidate cards
human approval/edit/hold/exclude
immutable training/held-out pack generations
```

### Slice D — G04B plan/progress/result hooks

```text
preflight plan
protected foundation-training action
NWS/VexLocalBridge delegation
progress/cancel truth
canonical return consumption
```

### Slice E — comparison/disposition/wake

```text
G0↔candidate review
ACCEPT | NARROW | REJECT
separate activation
real G1 wake
rollback
```

---

## 21. Candidate future source corridor — not custody

A fresh source-placement occupancy should re-ground current source and shrink or adjust this hypothesis:

```text
src/core/vex-birth-lab.mjs
scripts/vex-birth-lab.mjs
reference/browser/modules/vex-birth-lab-controller.js
reference/browser/vex-birth-lab/index.html
reference/browser/vex-birth-lab/app.js
reference/browser/vex-birth-lab/app.css
blueprint/vex-birth-lab-registry.json
blueprint/vex-birth-lab/strings/{en,ja,zh}.json
test/vex-birth-lab.test.mjs
test/vex-birth-lab-browser.test.mjs
```

Do not inherit this list as a quota. Reuse existing shell, Companion, Guide, Experience Review Kit, actions/permissions, G04B, NWS and relay owners wherever current source permits.

---

## 22. Architecture proof matrix

```text
BLA-00 six chapters cover VB0→VB12 without renaming canonical stages
BLA-01 status/discussion/export cannot advance state
BLA-02 support and training selection remain independent
BLA-03 G0/G1 unavailability cannot produce synthetic reply
BLA-04 model-proposed lesson remains candidate
BLA-05 pack freeze is immutable and versioned
BLA-06 held-out/excluded leakage fails closed
BLA-07 training plan is no-effect
BLA-08 full-rank training has truthful action semantics
BLA-09 progress is worker-derived
BLA-10 cancellation preserves optimizer-effect truth
BLA-11 training cannot activate G1
BLA-12 dispositions are exclusive
BLA-13 Wake requires ACCEPT + separate authority
BLA-14 G0 rollback is preserved
BLA-15 support context is redact-by-default and non-executable
BLA-16 status ZIP is CONTEXT_HANDOFF only
BLA-17 task ZIP delegates to VexLocalBridge
BLA-18 advisory guidance is currentness-checked and non-executable
BLA-19 a fresh implementation occupancy can proceed without chat archaeology
```

---

## 23. Convergence with the current Vex Birth lane

This architecture is a **parallel human membrane**, not an alternate birth trajectory.

Current execution may continue through E1 provisioning and retained-root infrastructure.

Before relying on the real VB2/VB3 evidence route, the controlling Vex Birth owner should consume the accepted/current disposition of this architecture and decide one of:

```text
CONSUME_BIRTH_LAB_BEFORE_REAL_BASELINE
CONSUME_MINIMUM_SLICE_A_B_BEFORE_REAL_BASELINE
RUN_ONE_EXPLICITLY_THROWAWAY_ENGINEERING_REHEARSAL_THEN_CONSUME
SOURCE_CONTRADICTION_REQUIRES_BOUNDED_CORRECTION
```

It should not silently proceed as though command-line operator steps are the final human route.

---

## 24. Fresh successor opening instruction

```text
Consume github.issue.vexlife.310 and this exact architecture candidate.

Do not reopen the question of whether the first-birth human membrane is needed.
Freshly ground current VexLife main, #229, #309, #220, current G04B/NWS/
VexLocalBridge source, current Companion/browser owners, existing action/
permission truth and open claims.

First classify the architecture candidate against current source. Then return
one exact implementation source-placement membrane for Slice A only unless
current source proves that A+B must be composed to avoid a dead interface.

Do not take over #309 host/training effects. Do not invent a second relay,
trainer, evaluator, conversation store, activation owner or model lineage.

[VXG RealForever]
```

<!-- [VXG RealForever] -->
