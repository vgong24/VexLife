# Vex Family Companion Runtime

`[VXG RealForever]`

## Purpose

VF-03C composes already-accepted Family and Intent owners into one bounded runtime path:

```text
persisted Family human trigger
-> immutable Intent / Workgraph
-> canonical multi-root principal scheduler
-> exactly one physical model worker lease
-> fresh VF-03A Family group frontier
-> exact Family-bound Context Lease
-> VF-03B trusted provider materialization
-> accepted Lived Companion inference owner
-> current Family membership / audience / lineage recheck
-> one canonical service.conversation Family Vex response
-> external completion evidence
-> canonical Workgraph completion
```

It does **not** create another scheduler, conversation store, membership store, provider adapter, model evidence owner, Memory owner, relationship owner, listener, or browser route.

The serialized browser/server tail remains outside this core source slice.

## Canonical request

The runtime accepts exactly:

```text
requestRef
spaceRef
channelRef
triggerMessageRef
expectedMembershipGeneration
idempotencyKey
```

No caller-authored speaker, principal binding, Family Vex lineage, admin role, audience, prompt messages, provider receipt, model witness, or response identity is accepted.

The request principal is derived from the exact persisted trigger event and rechecked against current Family membership and the durable Family channel binding.

## Queue semantics

`FamilyCompanionRuntime.queue()` is deliberately model-free.

It:

1. reads the exact persisted trigger;
2. verifies current Family Space membership, group-channel binding and active Family Vex lineage;
3. forms one deterministic immutable Intent/Workgraph rooted in the trigger message;
4. reuses an exact matching pending root on retry;
5. otherwise calls only the canonical `SingleWorkerIntentScheduler.enqueueRootIntent()`.

The scheduler pending-root ledger remains the queue owner. VF-03C stores no second pending-request database and no raw prompt text in scheduler state.

The deterministic Workgraph uses the trigger's durable creation time and content hash, so the same request can be reconstructed after process restart without changing immutable graph identity.

## Selection and one-worker admission

`runSelected()` refuses to invoke the model unless the exact reconstructed Intent is the scheduler's current principal-first root.

Before inference it performs:

```text
current pending-root selection
-> scheduler.admit(exact graph, exact external runtime bindings)
-> fresh Family frontier from current durable conversation
-> scheduler context input rebound to exact frontier refs/hash/token estimate
-> scheduler.leaseSelected(...)
```

A newer/fairer root that appears between admission and lease is rejected by the scheduler's existing stale-selection check. A physical-worker collision leaves the pending root intact. No Family-owned worker lock exists.

The admission, runtime trust, resource/capability/effect/occupancy inputs remain externally supplied by their accepted owners and are still validated by the scheduler. VF-03C does not mint authority merely because it orchestrates the call.

## Family context and provider boundary

After a successful worker lease, VF-03C re-canonicalizes the scheduler-owned Context Lease through `createFamilyGroupContextLease()` and requires its semantic fingerprint to remain identical. This proves there is still one exact active context selection rather than a parallel Family context lease.

`materializeFamilyPromptContext()` then reads the exact durable Family source and produces the trusted in-process materialization capability. `requestLivedCompanionInference()` performs the accepted loopback provider call and independently re-verifies Family source/currentness immediately before HTTP.

Plain caller-authored prompt messages or provider materialization receipts remain rejected by the accepted VF-03B boundary.

## Delivery currentness

After inference, `verifyFamilyGroupFrontierCurrent()` determines response truth:

```text
CURRENT
  -> CURRENT_AT_DELIVERY

FRONTIER_ADVANCED_DURING_INFERENCE
  -> AS_OF_FRONTIER

membership / audience / Family Vex lineage stale
  -> delivery blocked
```

`AS_OF_FRONTIER` means later authorized Family messages arrived after the model's exact provider frontier. The response may still be delivered, but it does not claim those later messages were seen.

Membership generation is not silently advanced for an already queued request. Revocation/removal/role-binding changes advance canonical Family membership state and therefore fail the original request closed.

## Durable response

The response is appended only through `appendConversationMessage()`.

The deterministic response message identity is derived from the exact request identity. On retry, an already-current response at that identity suppresses another model call.

The canonical Family message contains only Conversation Store-owned fields:

```text
messageRef
spaceRef
threadRef
channelRef
speakerRef = current Family companion lineage
recipientRefs = current human Family audience
witnessRefs = exact current Family channel witness set
membershipSnapshotRef
membershipGeneration
sequence
content
contentHash
createdAt
```

Trigger/frontier/model/scheduler provenance is **not** injected as foreign fields into the Conversation Store event. It is bound by the returned VF-03C delivery receipt.

## Delivery receipt

The source-owned delivery receipt binds:

```text
requestRef
intentRef / graphRef / graphFingerprint
respondingToMessageRef
responseMessageRef / responseEventSha256
requestPrincipalRef
familyCompanionLineageRef
frontierRef / frontierSha256
frontierState = CURRENT_AT_DELIVERY | AS_OF_FRONTIER
membershipGenerationAtRequest
membershipGenerationAtExecution
membershipGenerationAtDelivery
promptMaterializationReceiptRef / fingerprint
modelProvenance
scheduler admission / worker lease / generation
canonical Conversation owner
```

The accepted Lived Companion inference owner forms closed runtime observation and invocation evidence internally. That private owner evidence is **not exposed as a ModelTurnWitness ref by `requestLivedCompanionInference()`**, so VF-03C records:

```text
modelRuntimeEvidenceOwnerRef=src/core/lived-companion.mjs
modelRuntimeEvidenceExposure=OWNER_RETAINED_NOT_REEMITTED_BY_FAMILY_RUNTIME
modelTurnWitnessRef=null
```

This is intentional. VF-03C must never fabricate a witness reference that the accepted owner did not expose. Any future source-owned witness export must come from the rightful inference/evidence owner, not this orchestration module.

## Completion and failure

A durable Family response does not self-certify its Workgraph node complete.

VF-03C requires an external completion-evidence producer. The resulting evidence is passed into the canonical scheduler's `completeActive()`, which applies the registered completion verifier, writes canonical Workgraph transition/receipt lineage, and releases all active leases.

On inference, currentness, append, or completion failure, VF-03C calls the scheduler's existing `cancelActive()` when an active lease remains. It does not invent another failure ledger.

```text
queued cancellation
  -> scheduler.cancelQueuedRootIntent(originPrincipalRef derived from trigger)

active failure
  -> scheduler.cancelActive(...)

failure before durable response
  -> no Family response event

failure after a valid durable response but before Workgraph completion
  -> valid response remains durable
  -> active scheduler lease is cancelled
  -> retry must not append a second response
```

## Restart

VF-03C owns no hidden queue persistence.

Restart truth comes from existing owners:

```text
canonical scheduler aggregate
  -> pending root / principal fairness

canonical Conversation Store
  -> trigger event / current response event

canonical Family Space
  -> current membership / Family Vex lineage

same deterministic request
  -> same Intent / Workgraph / response message identity
```

A reconstructed runtime therefore observes `IDEMPOTENT_QUEUED` for an exact pending root or `IDEMPOTENT_RESPONSE_CURRENT` for an already-delivered response.

## FCR proof map

| Proof | Source behavior |
| --- | --- |
| FCR-00 | `queue()` never calls inference; model call occurs only after successful scheduler lease. |
| FCR-01 | each Workgraph origin principal derives from its persisted trigger; A/B/C roots remain independent. |
| FCR-02 | only canonical scheduler worker lease admits inference; an active worker blocks another run. |
| FCR-03 | Family human Conversation Store appends remain independent while inference is active. |
| FCR-04 | provider input is formed only from VF-03A Family frontier through VF-03B materialization. |
| FCR-05 | frontier is formed at execution, so a queued request can include newer authorized Family messages without changing its trigger identity. |
| FCR-06 | deterministic response identity + Conversation Store exact append suppress duplicate Family responses. |
| FCR-07 | stale membership/audience/lineage fails before delivery; active lease is released. |
| FCR-08 | scheduler aggregate + Conversation Store + deterministic reconstruction preserve queued work and conversation identity across restart. |
| FCR-09 | requester cancellation uses canonical queued-root cancellation; failed inference creates no fake response. |
| FCR-10 | model/provider observation stays with accepted Lived Companion evidence owner; VF-03C does not forge evidence. |
| FCR-11 | Family response speaker is exact `lineage.vex.family.*`; no Personal Companion Memory or lineage is read or written. |
| FCR-12 | module composes existing scheduler/inference/conversation owners and claims no second scheduler/listener/effect authority; existing regression suites remain required. |

## Permanent boundaries

```text
FAMILY_RUNTIME != SECOND_SCHEDULER
FAMILY_RUNTIME != MODEL_RUNTIME_OWNER
FAMILY_RUNTIME != MODEL_TURN_WITNESS_OWNER
FAMILY_RUNTIME != CONVERSATION_STORE
FAMILY_RUNTIME != FAMILY_MEMBERSHIP_OWNER
FAMILY_RUNTIME != MEMORY
FAMILY_RUNTIME != RELATIONSHIPS
FAMILY_RUNTIME != HUMAN_TRANSPORT
FAMILY_RUNTIME != SERVER_LISTENER
QUEUE_ACCEPTED != MODEL_CALLED
SELECTED != LEASED
MODEL_RESPONSE != DELIVERABLE_RESPONSE
FRONTIER_ADVANCED != MEMBERSHIP_STALE
AS_OF_FRONTIER != CLAIMED_CURRENT_CONTEXT
DURABLE_RESPONSE != SELF_CERTIFIED_WORK_COMPLETION
IDEMPOTENT_RESPONSE != REPLAY_MODEL_INFERENCE
```

## Held integration tail

This core slice does not mutate:

```text
scripts/serve-browser.mjs
source-manifest-parts/bucket-4c.json
```

Those paths are under the current Relationships lane custody. Same-origin request/status routing must reconnect later through the accepted server owner after that custody is released or an exact authorized shared-path route is established.

No real household data, Home semantic migration, Memory mutation, Relationship mutation, training, model activation, public publication, READY, review approval or merge is performed by this source module.

<!-- [VF-03C][FAMILY-RUNTIME-CORE][VXG RealForever] -->
