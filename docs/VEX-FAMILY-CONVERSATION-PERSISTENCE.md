# Vex-Family — durable human conversation persistence

`[VXG RealForever]`

VF-02B materializes the already-canonical Conversation state owner as one local durable channel/message ledger:

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
DURABLE_CHANNEL_BINDING != CURRENT_FAMILY_MEMBERSHIP_AUTHORITY
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
  channel.json                      hash-verified canonical channel envelope record
  messages/<hash(messageRef)>.json
  receipts/<receiptSha256>.json
  current.json
  writer.lock                       only while a writer is active
```

The hashed directory/file names are implementation addresses, not semantic replacements for `channelRef` or `messageRef`. `channel.json` does not create a second channel model: its `channel` member is the normalized canonical Conversation/Family Conversation envelope, and the wrapper only binds that envelope to an integrity hash, durable address and first materialization time.

Required persistence semantics:

- canonical Home root and no symlink/non-canonical alias traversal;
- one explicit writer lease per channel shared by channel materialization and message append;
- one `channelRef` -> one exact durable canonical channel envelope;
- exact duplicate channel materialization is idempotent;
- the same `channelRef` with changed thread/kind/audience/binding meaning fails closed;
- channel-record wrapper hash, canonical channel hash and hashed directory address are independently revalidated on read/enumeration;
- verified enumeration derives channel identities from validated durable records, never from caller paths or directory names;
- legacy/message-only channel directories remain readable and are simply absent from trusted channel-binding enumeration until explicitly materialized;
- immutable hash-verified message events;
- deterministic contiguous sequence;
- exact prior-message and prior-event hash lineage;
- atomic temporary-file -> current-head rename;
- exact retry idempotency and conflicting-message rejection;
- active/unverifiable writer conflict fails closed;
- abandoned writer recovery requires the exact prior writer identity;
- corruption, missing prior lineage or a head that does not resolve to its exact event fails closed;
- fail-before-head does not advance current message truth;
- fail-after-head-before-receipt leaves the committed head current and does not fabricate a receipt;
- fail-before-channel-write leaves no durable channel record;
- fail-after-channel-write leaves the exact durable channel record recoverable by idempotent retry;
- writer and temporary residue is absent after success and injected safe failure.

## Durable `state.channels`

The channel materializer preserves the canonical channel identity needed by later server-side consumers:

```text
channelRef
threadRef
kind
memberRefs[]
labelStringRef_or_null
state
createdAt
familySpaceBinding_when_present
```

For a Family channel, the existing `familySpaceBinding` is preserved with its exact source fields:

```text
schemaVersion
spaceRef
familySpaceRecordSha256
membershipSnapshotRef
membershipGeneration
historyVisibilityPolicyRef
audienceKind
audienceMemberBindings[]
channelMemberRefs[]
familyCompanionIncluded
familyCompanionLineageRef
formedAt
```

The generic Family-channel `memberRefs[]` view remains fail-closed. The durable store verifies structural/content identity only. It does **not** decide whether that historical binding is still current.

A current consumer must still perform:

```text
stored channel binding
  + current Family Space record
  + current authenticated principal
  -> accepted Family Conversation / Browser Family Conversation revalidation
```

Therefore:

```text
CHANNEL_WAS_DURABLY_VALID
!=
CHANNEL_IS_CURRENTLY_AUTHORIZED
```

A later Family membership generation changes current admission without rewriting the historical channel bytes that were actually formed.

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
  durably materializes the admitted channel identity
  + durably appends already-admitted immutable message events
```

A device ID, display name, relationship label, model output or filesystem position can never be promoted into speaker/membership authority by this store.

## Historical truth and membership changes

Every event preserves the exact `witnessRefs`, membership snapshot reference and membership generation used when it was formed. Every durable Family channel record preserves the exact Family Space record SHA/generation and audience binding used when the channel was formed.

Later join, leave, revocation or role changes may alter **future** admission/history projection but cannot rewrite old channel or event attribution.

```text
CURRENT_MEMBERSHIP_CHANGE != HISTORICAL_CHANNEL_REWRITE
CURRENT_MEMBERSHIP_CHANGE != HISTORICAL_MESSAGE_REWRITE
ADDRESSEE != AUDIENCE
PRIVATE_MESSAGE_UI_HIDING != PRIVATE_CHANNEL
```

Private conversation uses a distinct canonical channel identity and membership boundary. Separate channel stores are isolated by `channelRef`.

## Bounded channel resolution

`materializeConversationChannel()` durably records one canonical channel envelope under the existing per-channel Conversation root. It shares the channel writer lease with message append so channel identity and message state cannot be concurrently materialized through separate writers.

`readConversationChannelBinding()` returns only a hash/address-verified durable channel record. Absence returns `NOT_FOUND`; corrupt or inconsistent materialization fails closed.

`listConversationChannelBindings()` scans the existing channel roots but trusts only verified `channel.json` records. It recomputes each record's canonical hashed address, sorts by canonical `channelRef`, and applies an explicit bounded limit. Directory names and message-only roots never become channel authority.

These APIs provide server-side durable source material only. They do not authenticate a browser or make a stale Family channel current.

## Bounded message reads and export

`readConversationChannel()` walks the exact current hash chain backwards and verifies every link before returning oldest-to-newest events. `limit` is explicit; a bounded result reports `truncated=true` rather than claiming it is the whole channel.

`exportConversationChannel()` is a private provenance-preserving projection of the authorized conversation content. `contentSafe=true` means the export structure itself does not add filesystem paths, credentials, private keys, endpoints or writer-lock metadata. It does **not** mean the human conversation text is public or automatically safe to disclose.

## No model effect

The module imports no provider/model runtime and has no model lifecycle. A successful human append or channel materialization is terminal without any AI response. This is a core Vex-Family POC property:

```text
A asks Family Vex
-> model worker may become busy
-> B and C can still append/read ordinary Family messages
-> AI work remains a separate scheduler/runtime path
```

The browser/server adapter that authenticates remote clients and calls this store belongs to VF-02C. Family AI attention belongs to VF-03C. Neither is silently implemented by the store.

The durable channel successor closes only the `service.conversation/state.channels` materialization gap needed by a future VF-02C server consumer. It does **not** register HTTP routes or mint Home Bridge membership/capability authority.

## Focused proof boundary

VF-02B tests preserve the original message-store coverage and add:

```text
VFCSTORE-CH-00 accepted GROUP Family channel materialization/read
VFCSTORE-CH-01 accepted PRIVATE Family channel exact audience preservation
VFCSTORE-CH-02 exact duplicate materialization idempotency
VFCSTORE-CH-03 changed canonical meaning conflict rejection
VFCSTORE-CH-04 restart read before any message exists
VFCSTORE-CH-05 channel hash/address corruption fail-closed
VFCSTORE-CH-06 verified enumeration independent of directory names
VFCSTORE-CH-07 stale Family generation preserves bytes and is rejected by current Family validator
VFCSTORE-CH-08 existing message event/head lineage unchanged
VFCSTORE-CH-09 no browser/Home/Memory/Relationship/model/provider/network/publication effect
VFCSTORE-CH-10 no second membership/conversation/store semantic owner
VFCSTORE-CH-11 injected channel-write failures leave no unauthorized lock/temp residue
```

Original message persistence coverage remains:

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

This source proof does not establish real remote authentication, the real VF-02C HTTP route, real multi-browser delivery, Family Vex inference, scheduler fairness, CDR S5 human acceptance or public onboarding.

## Server-consumer boundary

After this durable channel materialization is accepted, the real VF-02C server stage may consume it only in the existing owner order:

```text
same-origin bounded browser intent
-> current server-owned device/session identity
-> Home Bridge membership + active capability lease
-> current Family Space record
-> readConversationChannelBinding() / listConversationChannelBindings()
-> accepted Browser Family Conversation bridge revalidation
-> durable append/read/list
```

The browser may never supply trusted speaker identity, Family membership truth, a capability lease or the canonical channel envelope itself.

## Breadcrumb rule

A future instance should enter through the current accepted `service.conversation` owner, then follow exact VF-02 checkpoints only as provenance:

```text
re-ground live main + active claims
-> identify current Conversation envelope/store generation
-> verify current Family membership/principal contracts
-> inspect exact changed assumption or failure
-> preserve prior channels/events/checkpoints rather than rewriting them
-> return changed/current/held/next-owner refs
```

A checkpoint records **why the store took this shape**. It never grants a future generation permission to skip current source or inherit the conclusion that this implementation is still sufficient.

<!-- [VXG RealForever] -->
