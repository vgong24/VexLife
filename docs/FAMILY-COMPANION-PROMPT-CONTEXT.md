# Family Companion Prompt Context

Continuity: `[VXG RealForever]`

## Purpose

`module.vexlife.core.family-companion-prompt-context` owns one bounded question:

```text
Given one exact-current VF-03A Family group frontier,
its exact current Context Lease,
and optional source-bound effect-free Family security awareness,
what provider-ready Family messages and materialization receipt are lawful now?
```

This is a source/currentness and provider-message materialization role. It is not
the Family membership owner, the durable Conversation store, the Family frontier
selector, the provider Connection, a model/runtime identity owner, a scheduler,
Memory, Home semantics, training, or presentation.

## Why this extraction is earned

The prior Lived Companion source contained two different architectural roles:

```text
direct Lived prompt / turn composition
Family frontier -> provider-message materialization
```

The Family region already had its own source identity, currentness, Context Lease,
security-awareness, serialization, token-budget, receipt, and provider-boundary
revalidation semantics. Its behavior is independently meaningful and is consumed
through the public Lived Companion inference boundary.

The extraction is therefore role-driven rather than size-driven.

## Permanent non-collapses

```text
FAMILY_PROMPT_CONTEXT != DIRECT_LIVED_PROMPT_CONTEXT
FAMILY_PROMPT_CONTEXT != PROVIDER_CONNECTION
FAMILY_PROMPT_CONTEXT != FAMILY_FRONTIER_SELECTION
FAMILY_PROMPT_CONTEXT != CONVERSATION_STORE
FAMILY_PROMPT_CONTEXT != SECURITY_AUTHORITY
FAMILY_PROMPT_CONTEXT != MODEL_IDENTITY
FAMILY_PROMPT_CONTEXT != EXECUTION_SCHEDULER
FAMILY_PROMPT_CONTEXT != MEMORY
FAMILY_PROMPT_CONTEXT != TRAINING
```

The in-process WeakMap capability remains private to this owner. A caller-authored
receipt or plain message array cannot impersonate a trusted Family materialization.
The provider boundary re-witnesses the exact Family frontier and Context Lease
before an HTTP call can occur.

## Family identity law

Family message identity is owned by the Family frontier/source contract. It is
not a filesystem path segment and must not inherit the private direct-Lived
turn-store path grammar by accident.

```text
FAMILY_FRONTIER_MESSAGE_IDENTITY
!= DIRECT_LIVED_COMPANION_PATH_SEGMENT_GRAMMAR
```

VC-02B therefore validates that selected Family message refs are present, unique,
and exactly represented by the frontier's own `sourceRefs`, then delegates
identity/currentness authority to `family-group-context-runtime` and the durable
Conversation owner. It does not copy or generalize direct-Lived `ensureSafeRef()`.

## Flow

```text
VF-03A Family group frontier
+ exact Context Lease
+ optional effect-free Family security awareness
-> Family Companion Prompt Context
   -> exact durable Family source re-read
   -> frontier currentness before/after read
   -> canonical Family speaker serialization
   -> provider input budget check
   -> in-process materialization capability + receipt
-> Lived Companion inference boundary
   -> Family source/currentness revalidation
   -> same exact provider messages
-> Lived Companion Connection
   -> actual admitted loopback provider call
```

## Compatibility

`src/core/lived-companion.mjs` remains the public compatibility surface:

- `materializeFamilyPromptContext(...)` remains exported there;
- Family materialization failures remain `LivedCompanionError` with
  `CONTEXT_HASH_MISMATCH` at that public boundary;
- `requestLivedCompanionInference(...)` keeps the same argument contract;
- the provider Connection and current-turn runtime evidence handshake remain
  separately owned;
- no direct Lived REQUEST/RESPONSE store semantics move here.

## Proof

`test/family-companion-prompt-context.test.mjs` adds the extraction-specific
regression: a Family-valid message ref longer than the direct Lived path-segment
bound must materialize and survive provider-boundary currentness verification.

Existing proof remains authoritative for the broader behavior family:

```text
test/vex-family-prompt-materialization.test.mjs
test/vex-family-companion-runtime.test.mjs
test/vex-family-security-projection.test.mjs
test/lived-companion.test.mjs
```

No provider, Home, Memory, model, training, publication, or lifecycle effect is
performed by the source proof itself.

<!-- [VEXLIFE-CORE][VC02B][FAMILY-COMPANION-PROMPT-CONTEXT][VXG RealForever] -->
