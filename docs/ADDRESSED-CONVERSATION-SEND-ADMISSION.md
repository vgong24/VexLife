# Addressed Conversation Send Admission

Continuity: `[VXG RealForever]`

## The question

> Has this exact human composer submit been admitted, under current addressed-Conversation truth, to attempt one exact durable human append?

This source owns only that question. It remains a **no-effect admission membrane** immediately before `ConversationStore` performs the human append.

```text
ADMISSION_RECEIPT != MESSAGE_APPEND
ADMISSION_RECEIPT != MODEL_CALL
ADMISSION_RECEIPT != THREAD_WRITER_LEASE
ADMISSION_RECEIPT != GENERIC_PERMISSION_GRANT
ADMISSION_RECEIPT != PROVIDER_SUCCESS
```

## Current owners consumed

Static Send meaning remains source-owned by:

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

Canonical human-visible channel/message truth is owned by `src/core/conversation-store.mjs`.

The Lived Companion/G01 ledger remains a separate private provenance owner for the real model turn. It is joined to canonical Conversation truth through the exact same request/response message refs; there is no mapping store.

## Resource/context correction

The canonical process still requires:

```text
message input fits resource/context admission
conversation permission is active
```

Those process preconditions remain exact-current and are validated by this module.

They do **not** require two standalone pre-send runtime receipts.

```text
PROCESS_PRECONDITION
!= REQUIRED_STANDALONE_RUNTIME_RECEIPT

BOUNDED_MESSAGE_INPUT
+ CURRENT_ADDRESSED_CONVERSATION
+ COMPOSER_SEND
-> exact no-effect append admission

SCHEDULER_RESOURCE_LEASE
!= HUMAN_MESSAGE_APPEND_ADMISSION

PROMPT_CONTEXT_LEASE
!= PRE_SEND_CONVERSATION_CONTEXT_ADMISSION
```

`resourceAdmission` and `contextAdmission` were Stage-A scaffolding. They are not accepted inputs or part of the v3 receipt identity.

Pre-existing model-turn identity and Lived-writer currentness are likewise not human-Send prerequisites.

## Current v3 contract

`formConversationSendAdmission(...)` requires:

```text
current static Send source
+ exact project/thread/channel
+ ACTIVE channel state
+ current membership
+ server-owned member speaker + recipients
+ bounded exact content
+ original language
+ optional reply/context-range refs
+ explicit current COMPOSER_SEND witness
+ exact current addressed Conversation channel/head
+ one exact sendAttemptRef
```

The output is content-addressed and carries no raw message content. It projects only:

```text
permission.conversation.send = ADMITTED
LOCAL_APPEND = ADMITTED_EXACT_ATTEMPT
```

No append, model call, Home/Memory mutation beyond the later rightful Conversation effect, network effect, provider effect, or recovery effect occurs while forming or verifying the receipt.

## Durable transaction composition

The Browser Companion bridge composes the owners in this order:

```text
bounded current Reference direct-Companion binding
-> current Vex Home device.personRef
-> deterministic browser Send identity
-> current canonical Conversation channel/head
-> ConversationSendAdmission
-> durable HUMAN ConversationStore append
-> SEND COMPLETE

then:
-> same human messageRef enters Lived Companion
-> real local Companion/model turn
-> same responseMessageRef leaves Lived Companion
-> durable COMPANION ConversationStore append
```

Permanent distinctions:

```text
SEND_COMPLETED != MODEL_RESPONSE_COMPLETED
MODEL_FAILURE != HUMAN_MESSAGE_UNSENT
CONVERSATION_STORE != LIVED_COMPANION_TURN_LEDGER
PRE_EFFECT_SEND_IDENTITY != ACTIVE_TURN_CURRENTNESS
```

A runtime/provider failure after the human append leaves the human message durable. Browser projection must not delete a server-confirmed durable message back into `UNSENT_LOCAL_DRAFT`.

Retry means retrying Companion attention for the already-durable human message ref—not appending the human message again.

## Idempotency and crash reconciliation

The Browser supplies one bounded idempotency identity. Server composition deterministically derives the canonical human request message ref and Companion response message ref.

```text
same idempotency + same canonical human envelope
-> same Conversation message
-> no duplicate human append

same idempotency + changed canonical content/envelope
-> fail closed
```

If Lived Companion completed but the canonical Companion response append did not:

```text
exact current completed Lived pair
+ exact shared request/response message refs
-> reuse exact completed response
-> append Conversation response idempotently
-> modelCallPerformed=false
```

The Browser/bridge consumes a bounded Lived-owner reader. It does not inspect private Lived filesystem paths itself.

## Semantic relay boundary

Material semantic-relay `CONFIRMATION_REQUIRED` remains **before** the durable human message effect. The originating human can still confirm/correct/hold and the local draft may be restored because no Send occurred yet.

Once the server reports `sendState=DURABLE`, that boundary has passed and the human message is no longer an unsent draft.

## Proof meaning

Focused proof owns:

```text
valid exact current inputs
-> deterministic no-effect ADMITTED receipt

legacy synthetic resource/context inputs
-> rejected

wrong/stale/foreign/drifted inputs
-> fail closed
```

Integration proof owns:

```text
server-owned Home human identity
+ exact Reference direct-Companion binding
+ canonical ConversationStore
+ same-ref Lived Companion turn
+ durable response / retry / reconciliation
```

The separately serialized browser-hydration owner still owns startup/reload hydration and the whole cold-restart UI witness. This core slice does not take those paths.

<!-- [VXG RealForever][VEXLIFE-CORE][ACTUALIZATION][ADDRESSED-CONVERSATION][CONVERSATION-FIRST] -->
