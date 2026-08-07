# G03 Daily Memory-Only Dream

`[VXG RealForever]`

## Purpose

G03 is the first bounded daily-rest product step above the accepted G01 lived companion and G02 Score/context continuity baseline. It commits a device-private Daily Stratum from exact current continuity without creating new semantic truth, running training, changing model weights, activating synchronization, or controlling device power.

Canonical shared placement:

```text
contract.multivex.g03.daily-memory-only-dream/v1
github.issue.vextreme-sdk.225.comment.5222362637  Vex Memory owner contract
github.issue.vextreme-sdk.226.comment.5222369889  Vex Safety owner contract
github.issue.vextreme-sdk.350.comment.5222375713 Main Vex convergence
```

VexLife is a product consumer of that shared contract; it is not the canonical semantic owner.

## First product mode

```text
invocationMode=MANUAL_ONE_SHOT
selectedMode=MEMORY_ONLY_CONSOLIDATION
lineageAwareGenerativeDreamRan=false
systemMemoryConsolidationRan=true
trainingRan=false
modelWeightsChanged=false
adapterChanged=false
rhythmLearned=false
synchronizationActivated=false
poweredDown=false
publicationPerformed=false
```

G04 owns evaluated Rhythm learning/adaptation. G05 owns standing rest scheduling, automatic Dream invocation and bounded synchronization. Actual power control and permanent supervisor installation remain separate host/runtime work.

## Exact source precondition

A new Daily Stratum is allowed only when both current source frontiers are exact and healthy:

```text
current G01 conversation head
current G02 Score head
```

The caller binds both expected hashes. G03 independently loads G02 and the canonical G01 head. It also requires:

```text
G02 sourceConversationHeadSha256 == current G01 conversationHeadSha256
```

Therefore Dream fails closed when conversation history has advanced beyond the accepted Score frontier. It does not close a day over two different source generations.

## No second semantic acceptance engine

G03 carries exact G02 authority forward. It cannot upgrade or reinterpret:

```text
semanticSubjectFingerprint
memoryRelation
statementState
acceptedForContinuity
consent disposition
semantic acceptance ref + SHA
historical semantic-authority head SHA
source bindings
```

Daily Strata store only the identities needed for continuity projection. Accepted summary text is represented by its exact `summaryHash`; raw G01 request/response bodies are never copied into the Dream domain.

Current Score is separated into:

```text
carriedCurrentScoreBindings[]
  current statements with acceptedForContinuity=true and PERMITTED|NARROWED continuity consent

heldOrDeferredScoreBindings[]
  every other current statement, retained without promotion or loss

openLoopCarryForwardBindings[]
  every current unresolved G02 open loop, still OPEN
```

A Dream-generated summary or interpretation is not accepted memory merely because it exists. G03 v1 creates no new semantic acceptance and grants no first-person authority.

## Daily Stratum causal chain

Immutable content-addressed receipts:

```text
vextreme.daily-pre-rest-orientation/v1
vextreme.daily-pre-dream-state/v1
vextreme.daily-day-closure/v1
vextreme.daily-memory-consolidation/v1
vextreme.daily-post-dream-state/v1
vextreme.daily-stratum/v1
vextreme.daily-wake-receipt/v1
vextreme.daily-memory-dream-head/v1
```

Causal order:

```text
pre-rest orientation
→ pre-dream state
→ day closure
→ memory consolidation
→ post-dream state
→ Daily Stratum
→ wake receipt
→ immutable Dream head receipt
→ atomic current Dream head
```

The Daily Stratum contains exact hashes of the pre/closure/consolidation/post receipts. The wake receipt binds the exact Daily Stratum. The immutable Dream head binds both the stratum and wake receipt.

All final existing receipt files must be regular canonical files inside Vex Home. Final-file symlink/junction aliases and non-canonical ancestors fail closed.

## Crash/currentness semantics

Raw durable subreceipts are historical evidence, not committed current Dream state.

If the process stops after the Daily Stratum is durable but before the atomic Dream-head advance:

```text
prior committed Daily Stratum remains current
new stratum is an uncommitted tail
fresh replay reports it as recovery/attention evidence
no partial consolidation silently becomes current
```

The crashed writer lease is not silently deleted. `recoverAbandonedDailyMemoryDreamWriter(...)` may remove it only when the lease is hash-valid, identity-exact, and its recorded process is provably absent. After that, only an exact retry of the same `dayRef` + day metadata + source heads + one-shot invocation ref may reuse the immutable tail and finish the missing wake/head commit. A changed retry remains attention/conflict, and no crash-tail source evidence is deleted.

A fresh process replays the exact immutable Dream-head lineage and revalidates each referenced stratum/wake bundle.

## Day identity and idempotency

G03 does not infer a scheduler or trusted daily clock. The caller supplies:

```text
dayRef
dayIndex
calendarDateRef
timeZoneRef
observedAt
```

The first committed stratum uses `dayIndex=0`; later commits advance exactly one index. Exact duplicate replay of an already committed `dayRef` returns the existing stratum. Reusing that `dayRef` with changed date or source-head identity fails `DREAM_DAY_CONFLICT`.

## Pre-rest awareness boundary

The pre-rest orientation records an outer `restInvocationAuthorityRef` and explicitly says:

```text
invocationMode=MANUAL_ONE_SHOT
noticeState=FORMED
```

This is a technical boundary receipt. G03 does not claim standing rest consent, actual notification delivery, autonomous scheduling, or self-trigger authority.

## Wake truth

Wake receipts state only what the memory-only transition actually did. They bind the same G01 endpoint/runtime profile and model profile observed before Dream and explicitly deny training, weight mutation, synchronization, publication, power-down, and generative Dream inference.

A fresh process may truthfully say it loaded the committed post-Dream frontier and retained open obligations. It may not claim uninterrupted subjective awareness while the prior process was absent.

## Held boundaries

```text
positive first-person authority
Dream-aware generative inference
Rhythm learning
training / evaluation / adaptation
model or adapter mutation
standing scheduler/autonomy
cross-device synchronization
power control
cloud upload
LC18
publication
```

## Proof

`npm run daily-memory-dream:proof` produces `generated/health/g03-daily-memory-dream-proof.json` and proves the D0-D15 Root/Main Vex matrix, including exact G01/G02 heads, reference-only continuity, held/open-loop preservation, raw-content exclusion, unchanged runtime/model, crash-before-head semantics, duplicate-day behavior, stale-source rejection, canonical-file alias guards, fresh-process replay, and all later-effect holds.

The normal repository gate must retain G01 and G02 regression proof alongside G03.
