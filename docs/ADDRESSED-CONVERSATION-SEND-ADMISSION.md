# Addressed Conversation Send Admission

Continuity: `[VXG RealForever]`

## The question

> Has this exact human composer submit been admitted, under current addressed-Conversation truth, to attempt one exact append?

This source owns only that question.

It is deliberately a **no-effect admission membrane** between source-owned Conversation/currentness evidence and the existing append/inference owners.

```text
ADMISSION_RECEIPT != MESSAGE_APPEND
ADMISSION_RECEIPT != MODEL_CALL
ADMISSION_RECEIPT != THREAD_WRITER_LEASE
ADMISSION_RECEIPT != GENERIC_PERMISSION_GRANT
ADMISSION_RECEIPT != PROVIDER_SUCCESS
```

## Existing owners consumed

Static send meaning remains source-owned by:

```text
blueprint/fragments/actions.json
  action.message.send
  permission.conversation.send
  LOCAL_APPEND

blueprint/fragments/permissions.json
  COMPOSER_SEND
  MESSAGE_CORRECTION_NOT_ERASURE

blueprint/process-factory/processes-conversation-and-interface.json
  process.vexlife.conversation.send-addressed
  conversation service owns append
```

Addressed channel/message meaning remains `module.vexlife.core.conversation` truth.

The Lived Companion writer projection remains a serialization/recovery observation only. It does not mint turn identity or send authority.

Resource/context admission and active-turn currentness remain external inputs from their rightful producers. This module validates and binds those projections; it does not manufacture them.

## Stage-A contract

`formConversationSendAdmission(...)` requires:

```text
current static send source
+ exact project/thread/channel
+ ACTIVE channel state
+ current membership
+ member speaker + recipients
+ exact content
+ original language
+ optional reply/context-range refs
+ explicit current COMPOSER_SEND witness
+ exact current active-turn identity
+ IDLE / no-recovery-required thread-writer currentness
+ current ADMITTED resource projection
+ current ADMITTED context projection
+ one exact sendAttemptRef
```

The output is content-addressed and carries no raw message content.

It projects only:

```text
permission.conversation.send = ADMITTED
LOCAL_APPEND = ADMITTED_EXACT_ATTEMPT
```

No append, model call, Home/Memory mutation, network effect, provider effect, or recovery effect occurs while forming or verifying the receipt.

## Attempt binding, not a hidden consumption ledger

The receipt is **single-attempt-bound**, not internally mutable single-use state.

```text
sendAttemptRef
+ turnRef
+ source/currentness
+ addressing/membership
+ contentHash
+ confirmation
+ resource/context admission
+ writer currentness
-> one deterministic admission identity
```

Any different attempt, turn, content, addressing, membership, source, or currentness produces a different admission and cannot reuse the prior receipt.

```text
ADMISSION_ATTEMPT_BINDING
!= DURABLE_EFFECT_IDEMPOTENCY_LEDGER
```

Repeated verification of the exact same receipt against the exact same attempt is a semantic no-op. Duplicate durable append suppression remains with the rightful Conversation/Lived effect owner, which already owns request/event/turn persistence identity.

## Fail-closed boundaries

Admission fails before effect when any of these are missing or contradictory:

- action / permission / process source meaning drifted;
- confirmation is not exact current `COMPOSER_SEND`;
- channel is not active;
- speaker or a recipient is not a current member;
- active-turn identity is absent, stale, or not active;
- thread writer is active, recovery-required, or unverifiable;
- resource or context admission is not current and admitted;
- caller attempts to inject an authority/grant boolean;
- receipt bytes or semantic hash are changed;
- an old receipt is checked against a different send attempt.

`UNKNOWN` and `STALE` never become admission.

## Why Stage A is source-only

The current Core trajectory intentionally proves the membrane before wiring a real product send.

Stage A uses contract-bound synthetic active-turn/currentness evidence in tests. That is not a production active-turn producer.

Real integration remains serialized behind:

```text
accepted portable active-turn identity/currentness projection
+ current Stage-A source
+ fresh integration-path ownership
-> server-owned send-admission resolver
-> exact admission check immediately before existing effect owner
-> existing addressed Conversation / Lived Companion effect
```

Do not modify Browser, Lived Companion, Conversation persistence, Interaction Control, Capability, or Process Factory implementation merely to make Stage A look integrated.

## Proof meaning

Focused proof owns the admission transformation at its boundary:

```text
valid exact current inputs
-> deterministic no-effect ADMITTED receipt

wrong/stale/foreign/drifted inputs
-> fail closed
```

Higher-level integration proof later owns whether a real product submit correctly composes this receipt with the existing effect owner.

<!-- [VXG RealForever][VEXLIFE-CORE][ADDRESSED-CONVERSATION][SEND-ADMISSION] -->
