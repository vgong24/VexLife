# Lived Companion provider Connection

Continuity: `[VXG RealForever]`

## Purpose

This source is the first accepted-role candidate from the `[VexLife Core]`
VC-02 Lived Companion role map.

It answers one question:

```text
Given an already-admitted numeric-loopback endpoint profile and
already-admitted provider-ready messages, what external runtime call occurred
and what closed runtime observation/evidence came back?
```

It does not own the human request, Conversation meaning, prompt-context trust,
turn persistence, thread writer lease, model identity, execution scheduling,
recovery policy, renderer state, Home semantics or Memory.

## Role boundary

```text
Lived Companion inference owner
  -> validates / materializes prompt context
  -> forms provider-ready messages
  -> Lived Companion Connection
       admitted endpoint profile
       + provider-ready messages
       + ephemeral in-memory authorization
       + timeout
       -> actual loopback HTTP call
       -> normalized model-runtime observation
       -> invocation evidence
  -> existing current-turn evidence handshake
  -> Lived Companion turn owner
       REQUEST / RESPONSE events
       context
       atomic head
       failure evidence
       shutdown / resume
```

Permanent:

```text
CONNECTION != TURN_OWNER
CONNECTION != PROMPT_CONTEXT_OWNER
CONNECTION != MODEL_IDENTITY_OWNER
CONNECTION != EXECUTION_SCHEDULER
CONNECTION != CONVERSATION_OWNER
NORMALIZED_RUNTIME_OBSERVATION != RAW_PROVIDER_RESPONSE_PERSISTENCE
```

## Why this role is earned

The provider-call boundary already has two real consumers through the accepted
Lived Companion inference owner:

- direct Lived Companion turns;
- Family Companion runtime, which injects `requestLivedCompanionInference`.

The source was therefore not split because `lived-companion.mjs` is large. It
was split because endpoint admission, network invocation, timeout/redirect
confinement, model-runtime normalization and invocation evidence form one
independently meaningful provider boundary.

## What intentionally remains in `lived-companion.mjs`

Prompt/context materialization remains with the existing context/lease and
Lived Companion owners. In particular, direct and Family prompt materialization
may perform source/currentness checks before provider-ready messages exist.

The existing `TRUSTED_MODEL_RUNTIME_RESPONSES` WeakMap and current-turn token
handshake also remain with the inference/turn owner. A custom response resolver
must still prove that the visible response is bound to one actual invocation
from the current turn. The Connection does not expose a bypass around that
proof.

The direct REQUEST/RESPONSE event store remains intact. Repository source
explicitly distinguishes it from the generic human Conversation Store:

```text
LIVED_COMPANION_TURN_STORE != GENERIC_HUMAN_GROUP_MESSAGE_STORE
HUMAN_MESSAGE_PERSISTENCE != MODEL_INFERENCE
HUMAN_MESSAGE_DELIVERY != AI_ATTENTION
```

## Compatibility contract

VC-02A is a behavior-preserving extraction.

It preserves:

- `requestLivedCompanionInference(...)` as the public inference entry;
- `sanitizeEndpointOrigin(...)` as an export from `lived-companion.mjs`;
- the existing `LivedCompanionError` failure vocabulary at that public entry;
- numeric-loopback-only endpoint admission;
- redirect refusal;
- endpoint HTTP / malformed response / timeout / unreachable classification;
- `normalizeModelRuntimeResponse(...)` as the canonical runtime-observation owner;
- `formModelRuntimeInvocationEvidence(...)` as the invocation-evidence owner;
- actual-HTTP proof before ModelTurnWitness formation;
- ephemeral authorization remaining out of returned/persisted source truth.

The Connection's own error type is an internal role boundary. The public Lived
Companion inference owner maps its exact endpoint codes back into the existing
`LivedCompanionError` contract rather than creating a second product failure
vocabulary.

## Source descent

Start from:

```text
github.issue.vexlife.885
src/core/lived-companion.mjs
src/core/lived-companion-connection.mjs
src/core/model-runtime-adapter.mjs
src/core/model-turn-witness.mjs
docs/LIVED-COMPANION-BASELINE.md
docs/VEX-FAMILY-CONVERSATION-PERSISTENCE.md
src/core/family-companion-runtime.mjs
```

Then use current tests and module registry. Live source outranks this document.

<!-- [VXG RealForever][VEXLIFE-CORE][VC02A][LIVED-COMPANION-CONNECTION] -->
