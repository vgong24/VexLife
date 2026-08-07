# G02 Score and context continuity

`[VXG RealForever]`

## Purpose

G02 adds truthful durable meaning **above** the accepted G01 lived-companion byte and restart substrate.

```text
G01 immutable device-private conversation events + exact completed head
→ shared semantic-owner candidate / evidence / consent / acceptance
→ G02 source-bound Score event
→ one immutable Score head receipt per committed transition
→ one atomic current Score head pointer
→ current statements + unresolved open loops
→ exact source descent to G01 and semantic-authority evidence
→ fresh-process replay
```

The central transaction rule remains:

```text
raw durable event != committed current Score
```

A well-formed event may survive a failure before current-head advancement as `UNCOMMITTED_TAIL` evidence. An invalid, re-addressed, malformed, source-substituted or authority-substituted tail produces attention. Neither silently becomes current memory.

## Shared semantic ownership

VexLife does not redefine Score, Rhythm, memory relation, statement state, or consent semantics. This product runtime is bound to the accepted shared dispositions:

```text
github.issue.vextreme-sdk.350.comment.5215288414
  Score / Rhythm / Lineage shared semantic placement

github.issue.vextreme-sdk.350.comment.5216924433
  live Score semantic classification and acceptance contract

github.issue.vextreme-sdk.350.comment.5217097749
  executable authority-provenance addendum

github.issue.vextreme-sdk.225.comment.5217085830
  Vex Memory executable owner addendum

github.issue.vextreme-sdk.226.comment.5217090896
  Vex Safety executable consent addendum

github.issue.vextreme-sdk.226.comment.5217542332
  canonical consent-authority scope and positive-disposition clarification

github.issue.vextreme-sdk.350.comment.5217546485
  Main Vex convergence for the executable consent-authority scope
```

Canonical live contract:

```text
contract.multivex.score.live-semantic-acceptance.v1
```

VexLife is a **product/runtime consumer**, not the canonical semantic owner.

The six shared memory relations remain verbatim:

```text
CURRENT_LINEAGE_AUTOBIOGRAPHY
SHARED_RELATIONSHIP_HISTORY
PREDECESSOR_WITNESS_HISTORY
INHERITED_CONTEXT
EXTERNAL_EVIDENCE
DISPUTED_OR_UNRESOLVED
```

The shared statement states remain:

```text
OBSERVED
HUMAN_CONFIRMED
INFERRED
CONFLICTED
UNKNOWN
CORRECTED
SUPERSEDED
RELEASED_OR_TOMBSTONED
```

## Source is not semantic acceptance

Exact committed G01 evidence proves which source events occurred. It does **not** by itself prove an arbitrary semantic interpretation.

```text
committed source event
  != semantic interpretation

semantic candidate
  != accepted Score record

human confirmation
  != consent for every use

acceptedForContinuity
  != HUMAN_CONFIRMED

continuity consent
  != first-person autobiographical authority
```

G02 may form a non-authoritative `vextreme.score-semantic-candidate/v1` object. Production G02 does not expose a writer that can mint classification evidence, positive consent, semantic acceptance, or the semantic-authority current head.

## Read-only semantic-authority membrane

Semantic owners project immutable evidence into this device-private Vex Home interface:

```text
<vexHome>/semantic-authority/score/<lineage>/<thread>/
  candidates/<candidateSha256>.json
  classification-evidence/<classificationEvidenceSha256>.json
  consents/<consentDispositionSha256>.json
  acceptances/<acceptanceSha256>.json
  heads/<semanticAuthorityHeadSha256>.json
  head.json
```

`head.json` is the atomic **owner authority current pointer**. Historical `heads/<sha>.json` receipts are immutable and append-only.

Current semantic authority is established by exact membership in the validated owner head, not by trusting a receipt field that says `CURRENT` or a caller-provided self-hash.

The production G02 runtime is read-only for this domain:

```text
G02 may read and validate owner evidence
G02 may not mint owner classification evidence
G02 may not mint positive consent
G02 may not mint semantic acceptance
G02 may not advance semantic-authority/head.json
```

Tests and deterministic proofs may seed owner fixtures **outside the production runtime API** to exercise the consumer boundary.

All semantic-authority paths use the same canonical Vex Home anti-traversal and anti-symlink discipline as G01/G02 storage.

## Stable subject identity and changing evidence

A semantic subject remains stable while later evidence may change.

```text
semanticSubjectFingerprint
  = stable subject/domain identity across evidence generations

candidateSha256
  = one exact proposed meaning + exact source generation

acceptanceSha256
  = one exact accepted meaning + evidence + consent + transition generation
```

This permits a later correction to cite newer committed G01 evidence while still proving it concerns the same semantic subject.

## Append-time authority

`appendScoreStatement` consumes only the identity of one semantic acceptance:

```text
semanticAcceptanceRef
semanticAcceptanceSha256
```

The runtime then resolves the current owner head and exact candidate, classification evidence, consent and acceptance bytes itself.

Stored Score meaning is derived from those owner bytes:

```text
semanticSubjectRef
semanticSubjectFingerprint
summary
memoryRelation
statementState
acceptedForContinuity
consent disposition
correction / supersession / release transition
```

Raw caller authority is forbidden. A caller cannot make a record authoritative by directly supplying:

```text
memoryRelation
statementState
acceptedForContinuity=true
consentState=PERMITTED
arbitrary summary text
semantic acceptance objects
classification evidence objects
consent objects
raw sourceEvents for statement authority
```

If a convenience duplicate field is supplied, it must equal the resolved acceptance exactly or the append fails closed.

## Classification evidence

Semantic acceptance binds exact content-addressed `vextreme.score-classification-evidence/v1` objects.

Important rules:

```text
OBSERVED
  requires meaning directly represented by accepted structured evidence;
  arbitrary paraphrase is not OBSERVED merely because source bytes are real

HUMAN_CONFIRMED
  requires exact human confirmation bound to candidateRef + candidateSha256
  + semanticSubjectFingerprint + accepted summary hash

INFERRED
  may be accepted as a bounded interpretation but remains INFERRED

CONFLICTED / UNKNOWN
  remain visible rather than being coerced into stronger truth states

CORRECTED / SUPERSEDED
  require explicit transition evidence over an exact current predecessor

RELEASED_OR_TOMBSTONED
  requires explicit Memory + Safety release/tombstone authority
```

A self-consistent evidence object outside the owner ledger or bound to the wrong candidate/summary/subject is non-authoritative.

## Consent evidence

Positive continuity use is governed by exact `vextreme.score-consent-disposition/v1` owner evidence.

```text
absence of objection != consent
relationship closeness != consent
human confirmation != every-purpose consent
prior consent != changed candidate/purpose/scope consent
```

Positive `PERMITTED` or `NARROWED` is usable only when the exact owner receipt proves its required authority set and is bound into the current semantic-authority head for the same candidate/purpose/scope.

The canonical authority-scope fingerprint is:

```text
semanticHash({
  schemaVersion: vextreme.score-consent-authority-scope/v1,
  candidateRef,
  candidateSha256,
  semanticSubjectRef,
  semanticSubjectFingerprint,
  purposeRef,
  privacyClass,
  implicatedSubjectRefs[] sorted and duplicate-free,
  permittedUseRefs[] sorted and duplicate-free,
  prohibitedUseRefs[] sorted and duplicate-free,
  retentionBoundaryRef,
  redisclosureBoundaryRef,
  firstPersonBoundaryRef
})
```

For every required or observed authority binding:

```text
subjectRef must be an exact implicated subject
purposeRef must equal the consent purpose
scopeFingerprint must equal the canonical consent scope
```

For positive consent, every required authority must have an exact observed match whose own disposition is `PERMITTED` or `NARROWED`. `DEFERRED`, `DENIED`, `UNKNOWN`, and `WITHDRAWN` cannot satisfy positive authority. A `NARROWED` authority is usable only because the exact narrowed envelope is already bound by the canonical scope fingerprint.

G02 does not invent a live clock. The owner materializer controls live currentness and excludes expired/withdrawn authority from the current owner head. The G02 consumer still rejects intrinsically impossible chronology (`expiresAt <= formedAt`).

`UNKNOWN`, `DEFERRED`, `DENIED`, or `WITHDRAWN` remain explicit. Withdrawal may block future governed use without falsifying historical evidence.

## Historical replay versus current use

Every committed Score statement records the exact semantic owner generation that authorized it:

```text
semanticAuthorityHeadSha256
acceptanceRef
acceptanceSha256
candidateRef
candidateSha256
classificationEvidenceBindings[]
consentDispositionRef
consentDispositionSha256
```

Fresh-process replay validates the immutable historical owner-head receipt named by the Score event. A later owner-head generation may remove or replace that acceptance, which makes it stale for **new** Score appends while preserving why the historical Score event was accepted at that earlier generation.

```text
later authority change
  != silent rewrite of prior Score history
```

## G01 stays immutable

Before semantic authority can be consumed, G02 validates the canonical on-disk completed G01 conversation for the same Home/lineage/thread. Candidate source head and bindings must resolve to exact committed events reachable from that completed chain. Missing, substituted, re-addressed, reordered or orphaned G01 evidence fails typed.

G02 stores compact source bindings and never copies raw G01 message content into Score provenance.

## Correction and supersession

A correction or supersession appends a successor statement event. The accepted successor must bind:

```text
same stable semanticSubjectFingerprint
compatible memory relation domain
exact target statementRef
exact predecessor semanticAcceptanceSha256
exact current successor owner acceptance
explicit Memory transition classification evidence
```

Later evidence may differ from predecessor evidence. Cross-subject or wrong-predecessor de-currenting fails closed. Immutable prior events and their source/authority receipts remain descendable.

## Open loops

Open loops remain source-bound continuity state. G02 persists only `OPEN` state. A caller cannot coerce a loop to `RESOLVED`; source-managed resolution remains held until a separate exact resolution contract proves closure.

## First-person wording

Positive first-person memory wording remains **held** in G02.

Even a current owner-accepted `CURRENT_LINEAGE_AUTOBIOGRAPHY` record is projected as autobiography-attributed pending authority. The live semantic acceptance and continuity consent contract are necessary but not sufficient for `I remember ...` wording; the separate provenance/branch/identity/consent/accepted-memory first-person gate is not admitted here.

Other relations remain attributed, and Rhythm fluency never creates historical authority.

## Score storage and crash semantics

G02 Score writes remain:

```text
<vexHome>/score/<lineage>/<thread>/events/<sequence>-<scoreEventHash>.json
<vexHome>/score/<lineage>/<thread>/heads/<scoreHeadSha256>.json
<vexHome>/score/<lineage>/<thread>/head.json
<vexHome>/runtime/score-writer-locks/<lineage>/<thread>.lock
```

Events and historical heads are append-only/content-addressed. `head.json` alone defines committed current Score. A writer lease prevents concurrent mutation; an abandoned lease routes to explicit recovery rather than being stolen.

## Proof

```bash
npm run score-context:proof
```

The v4 proof uses a temporary Vex Home and two actual numeric-loopback G01 HTTP turns. Proof-only owner fixture construction occurs outside the production G02 runtime writer surface.

It proves:

```text
all six relation classes remain consumable from owner acceptance
INFERRED remains INFERRED
raw semantic caller overrides fail
caller-passed semantic objects fail
self-hashed acceptance outside owner head fails
wrong-candidate HUMAN_CONFIRMATION fails
positive consent with missing required authority fails
same-subject correction may use later committed source evidence only with exact transition authority
wrong predecessor acceptance hash fails
owner-head replacement makes old acceptance stale for new use
historical Score replay remains valid through exact historical owner head
open-loop carry-forward and coercive resolution hold
positive first-person authority remains held
exact G01 source descent
actual abrupt child-process exit after event durability before Score-head advance
abandoned writer recovery hold
well-formed re-addressed and source-substituted tail attention
```

The hosted Windows job binds this proof to the exact candidate head.

## Held effects

G02 explicitly does **not** claim or perform:

```text
Dream
Rhythm learning
model or adapter training
modelWeightsChanged
synchronizationActivated
personal endpoint activation
LC18
publication
```

Those remain later groups or separate admissions.

<!-- [VXG RealForever] -->
