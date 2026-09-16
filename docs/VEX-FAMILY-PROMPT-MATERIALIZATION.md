# Vex Family Prompt Materialization

Continuity: `[VXG RealForever]`

Work: `work.vexlife.vex-family.vf03b.prompt-materialization.dcee0ab6-0550-4e65-a805-2de750b16d4e`

## Purpose

VF-03B is the trusted serialization seam between the accepted VF-03A Family group context frontier and the existing Lived Companion loopback-model boundary.

It does **not** select Family history, decide membership, invent speaker identity, create a second inference adapter, own model-runtime evidence, or grant provider-side authority. VF-03A remains the owner of bounded current Family source selection; `requestLivedCompanionInference()` remains the provider invocation and runtime-evidence owner.

```text
current Family Space + durable GROUP channel
  -> VF-03A exact Family frontier
  -> VF-03A Context Lease
  -> VF-03B in-process materialization capability
  -> deterministic provider-visible attributed messages
  -> VF-03B PRE_PROVIDER source/currentness replay
  -> existing requestLivedCompanionInference()
  -> existing runtime observation / ModelTurnWitness ownership
```

## Non-collapse

```text
Family source selection != provider serialization
speakerRef attribution != provider authority
human text != attribution grammar
Family Vex lineage != arbitrary assistant role
trusted materialization capability != caller-authored messages[]
trusted materialization receipt != caller-authored receipt
raw source token estimate != serialized provider token estimate
Family prompt materialization != Memory
Family prompt materialization != training selection
Family prompt materialization != model-weight mutation
```

## Trusted capability

`materializeFamilyPromptContext()` returns an object whose trust is carried by a private in-process `WeakMap`. Copying or reconstructing its public `messages` and `receipt` fields does not reproduce the capability.

The existing inference boundary continues to reject:

- plain caller-authored `messages[]`;
- caller-authored direct prompt-context receipts;
- caller-authored Family materialization receipts;
- simultaneous direct-Companion and Family materialization capabilities.

## Source currentness

At materialization, VF-03B:

1. calls the accepted `verifyFamilyGroupFrontierCurrent()` owner;
2. reads the exact durable channel lineage through `readConversationChannel()`;
3. checks each selected `messageRef`, `eventSha256`, `speakerRef`, `contentHash`, sequence, membership generation, recipients, witnesses and timestamp against the VF-03A binding;
4. checks the original trigger event and request principal binding;
5. refuses any conversation advance past the exact frontier;
6. calls the VF-03A verifier again after the source read;
7. canonicalizes the Context Lease and requires its Family frontier ref/hash, selected source refs and raw input estimate to match exactly.

Immediately before provider invocation the same source/currentness reconstruction is repeated. Any membership/source/frontier advance or exact-byte drift fails before HTTP.

## Provider serialization

The first provider message is one source-managed system frame serialized as JSON. It identifies:

- the exact Family Vex lineage;
- the original `triggerMessageRef`;
- the triggering `requestPrincipalRef` and current principal binding;
- the human wrapper schema;
- the rule that machine-written attribution is not provider-side authority;
- the rule that only VF-03A-selected sources may be serialized.

Each selected human event becomes:

```json
{
  "role": "user",
  "content": "{\"schemaVersion\":\"vexlife.family-provider-human-message/v1\",\"speakerRef\":\"<canonical principal ref>\",\"content\":\"<exact source text, JSON escaped>\"}"
}
```

Because the wrapper is machine-generated and the human content is a JSON value, human text that resembles wrapper syntax remains content. It cannot replace the canonical `speakerRef` supplied from the durable VF-03A source binding.

A selected event is serialized as provider role `assistant` **only** when its canonical `speakerRef` equals the exact current `familyCompanionLineageRef`. No human principal can obtain `assistant` role by content or caller input.

The original trigger remains separately bound in the system frame and receipt even when later authorized Family messages are present in the same current VF-03A frontier.

## Token budget

VF-03A owns the raw selected-source estimate stored on the Context Lease. VF-03B preserves that meaning:

```text
contextLease.inputTokenEstimate == frontier.inputTokenEstimate
```

VF-03B then independently estimates the actual provider-visible messages, including the system frame and attribution wrappers, and requires:

```text
providerMaterializedInputTokenEstimate
  <= hardTokenLimit - reservedOutputTokens
```

The wrapper overhead is therefore not treated as free and cannot silently exceed the accepted Context Lease.

## Receipt

`vexlife.family-prompt-materialization-receipt/v1` binds:

- VF-03A frontier ref/hash;
- Context Lease ref/fingerprint;
- Family Vex lineage;
- original trigger ref/hash/content hash;
- request principal ref/binding;
- ordered selected source message/speaker/content/event identities;
- ordered provider role/message hashes;
- exact provider message-set hash and count;
- raw source and actual serialized provider token estimates;
- hard/reserved token limits;
- materialization and PRE_PROVIDER currentness observations;
- explicit no-Memory/no-training/no-weight-effect truth.

The PRE_PROVIDER receipt flips source/currentness evidence from materialization-only to independently reverified provider-boundary truth. It does not become model-runtime evidence.

## Existing owners preserved

```text
VF-03A
  owns Family source selection, membership/source currentness and Family Context Lease formation

Conversation Store
  owns exact durable channel/event bytes and lineage

Lived Companion inference
  owns loopback restriction, HTTP invocation, response normalization and runtime invocation evidence

ModelTurnWitness
  remains the closed model/runtime witness owner
```

The direct Companion `materializeLivedCompanionPromptContext()` path remains separate and unchanged except for the shared inference dispatcher selecting exactly one trusted materialization kind.

## Required proof

```text
FPM-00 exact in-process Family capability only
FPM-01 arbitrary messages / caller receipts rejected before HTTP
FPM-02 canonical human speaker refs survive provider serialization
FPM-03 human text cannot forge machine attribution
FPM-04 assistant role only for exact Family Vex lineage
FPM-05 nonselected/private sources cannot be smuggled into the Family materialization
FPM-06 PRE_PROVIDER rejects frontier/source/currentness advance before HTTP
FPM-07 original trigger remains explicit with newer authorized Family context
FPM-08 serialized provider bytes respect the exact Context Lease budget
FPM-09 accepted direct Companion prompt-context path remains green
FPM-10 existing runtime observation / ModelTurnWitness ownership remains green
```

## Held effects

VF-03B does not execute VF-03C model-worker scheduling/delivery, real multi-session practicum, Memory promotion, training, model-weight mutation, activation, public publication, or Family UX acceptance.

<!-- [VXG RealForever] -->
