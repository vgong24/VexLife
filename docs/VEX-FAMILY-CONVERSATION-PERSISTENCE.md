# Vex-Family — durable human conversation persistence

`[VXG RealForever]`

VF-02B materializes the already-canonical Conversation state owner as one local durable message ledger:

```text
state.channels + state.messages
  -> service.conversation
  -> src/core/conversation-store.mjs
```

The store exists so Family members can keep communicating while model work is busy, unavailable, cancelled or not requested at all.

```text
HUMAN_MESSAGE_PERSISTENCE != MODEL_INFERENCE
HUMAN_MESSAGE_DELIVERY != AI_ATTENTION
MODEL_BUSY != FAMILY_CHAT_BLOCKED
LIVED_COMPANION_TURN_STORE != GENERIC_HUMAN_GROUP_MESSAGE_STORE
```

## Why the Lived Companion store is not reused

Current Lived Companion persistence is intentionally shaped around one direct human-to-Companion turn:

```text
companionLineageRef + threadRef
human REQUEST
model RESPONSE
completed request/response head
```

A Family conversation can contain several humans speaking before, during and after one model turn. Making that transcript subordinate to a request/response head would turn ordinary human chat into model lifecycle state. VF-02B therefore keeps the canonical owner `service.conversation` and gives it its own durable materialization.

## Local storage

For one canonical Vex Home:

```text
<VEX_HOME>/conversations/channels/<hash(channelRef)>/
  messages/<hash(messageRef)>.json
  receipts/<receiptSha256>.json
  current.json
  writer.lock                       only while a writer is active
```

The hashed directory/file names are implementation addresses, not semantic replacements for `channelRef` or `messageRef`.

Required persistence semantics:

- canonical Home root and no symlink/non-canonical alias traversal;
- one explicit writer lease per channel;
- immutable hash-verified message events;
- deterministic contiguous sequence;
- exact prior-message and prior-event hash lineage;
- atomic temporary-file -> current-head rename;
- exact retry idempotency and conflicting-message rejection;
- active/unverifiable writer conflict fails closed;
- abandoned writer recovery requires the exact prior writer identity;
- corruption, missing prior lineage or a head that does not resolve to its exact event fails closed;
- fail-before-head does not advance current truth;
- fail-after-head-before-receipt leaves the committed head current and does not fabricate a receipt;
- writer and temporary residue is absent after success and injected safe failure.

## Message identity

The store consumes an already-admitted Conversation message envelope. It preserves:

```text
messageRef
spaceRef_or_null
threadRef
channelRef
speakerRef
recipientRefs[]
witnessRefs[]
membershipSnapshotRef_or_null
membershipGeneration_or_null
sequence
content
contentHash
createdAt
priorMessageRef
priorEventSha256
eventSha256
```

The store does **not** decide whether the speaker is authenticated or a current Family member. Those decisions belong upstream:

```text
VF-01A / Home Bridge
  authenticates the human principal bound to a paired device/session

VF-01B / service.family-space
  owns Family membership, role, generation and history-visibility policy

VF-02A / service.conversation envelope
  binds the exact current membership snapshot used for speaker/audience admission

VF-02B / service.conversation persistence
  durably appends that already-admitted immutable event
```

A device ID, display name, relationship label, model output or filesystem position can never be promoted into speaker/membership authority by this store.

## Historical truth and membership changes

Every event preserves the exact `witnessRefs`, membership snapshot reference and membership generation used when it was formed.

Later join, leave, revocation or role changes may alter **future** admission/history projection but cannot rewrite old event attribution.

```text
CURRENT_MEMBERSHIP_CHANGE != HISTORICAL_MESSAGE_REWRITE
ADDRESSEE != AUDIENCE
PRIVATE_MESSAGE_UI_HIDING != PRIVATE_CHANNEL
```

Private conversation uses a distinct canonical channel identity and membership boundary. Separate channel stores are isolated by `channelRef`.

## Bounded reads and export

`readConversationChannel()` walks the exact current hash chain backwards and verifies every link before returning oldest-to-newest events. `limit` is explicit; a bounded result reports `truncated=true` rather than claiming it is the whole channel.

`exportConversationChannel()` is a private provenance-preserving projection of the authorized conversation content. `contentSafe=true` means the export structure itself does not add filesystem paths, credentials, private keys, endpoints or writer-lock metadata. It does **not** mean the human conversation text is public or automatically safe to disclose.

## No model effect

The module imports no provider/model runtime and has no model lifecycle. A successful human append is terminal without any AI response. This is a core Vex-Family POC property:

```text
A asks Family Vex
-> model worker may become busy
-> B and C can still append/read ordinary Family messages
-> AI work remains a separate scheduler/runtime path
```

The browser/server adapter that authenticates remote clients and calls this store belongs to VF-02C. Family AI attention belongs to VF-03C. Neither is silently implemented by the store.

## Focused proof boundary

VF-02B tests cover:

```text
A/B/C independent append and restart order
exact retry / conflict
stale sequence
pre-head / post-head failure truth
corrupt head / corrupt event / missing prior event
writer conflict and exact abandoned recovery
historical witness + membership generation immutability
private/group channel isolation
bounded read/export
symlink Home rejection
```

This source proof does not establish real remote authentication, real Family membership, multi-browser delivery, Family Vex inference, scheduler fairness, CDR S5 human acceptance or public onboarding.

## Breadcrumb rule

A future instance should enter through the current accepted `service.conversation` owner, then follow exact VF-02 checkpoints only as provenance:

```text
re-ground live main + active claims
-> identify current Conversation envelope/store generation
-> verify current Family membership/principal contracts
-> inspect exact changed assumption or failure
-> preserve prior events/checkpoints rather than rewriting them
-> return changed/current/held/next-owner refs
```

A checkpoint records **why the store took this shape**. It never grants a future generation permission to skip current source or inherit the conclusion that this implementation is still sufficient.

<!-- [VXG RealForever] -->