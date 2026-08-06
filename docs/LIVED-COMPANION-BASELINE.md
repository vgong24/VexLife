# G01 lived-companion baseline

`[VXG RealForever]`

## Purpose

G01 proves the smallest honest device-local companion turn:

```text
one admitted Windows Vex Home and companion lineage
→ one explicitly admitted OpenAI-compatible loopback endpoint
→ one actual HTTP request and validated response
→ immutable request and response events
→ one bounded context snapshot
→ one atomic conversation head
→ one clean shutdown receipt
→ one fresh operating-system process
→ exact lineage, thread, event-chain, context and head replay
→ one visible resume receipt
```

The runtime is provider-neutral. Codex, Kimi, or another model/tool provider may be
connected through a separately admitted adapter, but no provider adapter is required
for source application, repository publication, local proof, or recovery.

## Device-private record layout

```text
<vexHome>/conversations/<companionLineageRef>/<threadRef>/events/<sequence>-<eventHash>.json
<vexHome>/conversations/<companionLineageRef>/<threadRef>/head.json
<vexHome>/context/<companionLineageRef>/<threadRef>/<turnRef>.json
<vexHome>/runtime/thread-writer-locks/<companionLineageRef>/<threadRef>.lock
<vexHome>/runtime/<instanceRef>/shutdown-receipt.json
<vexHome>/recovery/<threadRef>/resume-receipt.json
<vexHome>/recovery/<threadRef>/<turnRef>/failure-receipt.json
<vexHome>/recovery/<threadRef>/<turnRef>/failure-receipt-<failureReceiptSha256>.json
```

Events are append-only. A completed turn is visible only after the response, context,
and atomic head are durable. A failed endpoint or persistence attempt leaves the last
completed head unchanged. Every identity used as a filesystem segment is validated as
one safe segment, every derived path remains inside the canonical Vex Home, and existing
symbolic-link or junction traversal is rejected before reading or writing. Conversation
event directories must be real directories, and event entries must be regular,
non-symlink files before they may affect duplicate detection or event-chain replay. One atomic cross-process writer lease is held for the complete read → HTTP → append → context → head transaction of each thread; a competing live or unverifiable writer fails before endpoint use or persistence. Lease records are content-addressed. If the recorded owner process is proven absent on the same host, ordinary turn execution returns `THREAD_WRITER_RECOVERY_REQUIRED`, preserves the exact lease, and routes to explicit recovery/attention rather than pretending ordinary retry can succeed. Malformed, hash-invalid, identity-invalid, symlink, or otherwise unverifiable lease evidence is preserved and returns `THREAD_WRITER_CONFLICT` with `ownerState=UNVERIFIABLE` and an attention route; it is never treated as ordinary retryable input. Automatic abandoned-lease removal remains held outside G01.

## Fresh Home admission and preservation

Initialization may create a Vex Home only when the requested root is missing or
is one exact empty, canonical, regular directory. A pre-existing non-empty,
partial, interrupted, legacy, file, symbolic-link, or junction root is preserved
without creating any G01 Home files and returns
`EXISTING_HOME_REQUIRES_MIGRATION_PLAN`. The absence of `config/home.json` alone
never proves that a location is fresh.

## Canonical filesystem identity

Every path-bearing identity ref uses one lowercase portable ASCII grammar and
is rejected before path use when it could name a Windows drive-relative path,
NTFS alternate data stream, reserved device name, trailing-dot/space alias, or
case-only collision. A requested Home may not traverse a symbolic-link or
junction ancestor. Stored relative paths are always formed from the canonical
Home root, never from a caller-provided alias.

## Failed-turn recovery and evidence preservation

A request event that is already durable makes the original `turnRef` consumed even
when the endpoint or later persistence step fails. The failure receipt therefore
sets `retrySameTurnAllowed=false` and routes to a new `turnRef` from the last valid
head. Same-turn retries are duplicate-suppressed before another HTTP call and route
to existing evidence or a new turn.

The first `failure-receipt.json` for one thread/turn is immutable. Its canonical
path is claimed with an OS-atomic no-clobber create, including conflict failures
that cannot own the active thread writer lease. If the canonical first receipt
already exists, its own content-addressed hash, schema, thread/turn identity and
first-receipt semantics are validated before it may become follow-up provenance.
A corrupted first receipt fails closed and is never legitimized by a later receipt.
Later valid failures for that same turn use distinct content-addressed
`failure-receipt-<failureReceiptSha256>.json` files that bind the SHA-256 of the
validated preserved first receipt. Idempotent equal follow-ups may reuse the same
content-addressed path. A follow-up failure never rewrites or relabels the first
substantive failure.

## Semantic completed-state validation

An existing `head.json` is not treated as a valid prior head merely because its
own content hash is valid. Before duplicate classification, another endpoint call,
or any new conversation append, G01 validates the exact completed state as one
semantic unit: Home/device/lineage/thread identity, the content-addressed head,
the full contiguous event chain, the final request/response pair, and the bound
context record. Only after that verification succeeds may the head become
`lastValidHead`. Corrupt prior state therefore produces zero new endpoint or turn
effects.

The same semantic verifier is consumed by ordinary turn continuation, shutdown,
and resume. Every event consulted as evidence—whether part of the completed chain
or used for duplicate suppression—must be one exact content-addressed regular
record at `<sequence>-<eventHash>.json`, independently bind
`contentHash == hash(content)`, retain `privacyClass=DEVICE_PRIVATE`, and match the
admitted Home/device/lineage/thread. A completed chain is anchored at genesis
(sequence `0`, `priorEventHash=null`), remains contiguous from that anchor, and is
composed only of complete REQUEST/RESPONSE pairs with the same turn, instance,
channel, and reciprocal speaker/recipient relationship.

The head's final request/response identity must match the exact final pair. Its
`contextPath` must equal the canonical
`context/<lineage>/<thread>/<turn>.json` location—not merely another contained
path—and the content-addressed context must bind the same
Home/device/lineage/thread/turn/completing instance, request/response event hashes,
`privacyClass=DEVICE_PRIVATE`, and the exact request/response `eventRef` values in
the tail of `contextSourceRefs`. Content-addressed objects from another thread,
turn, path, or rewritten provenance are not interchangeable.

Duplicate failure follow-ups consume this already validated evidence, so malformed
or forged orphan JSON cannot fabricate `existingEvidence` and suppress a real
turn. They preserve truthful `lastValidHead`, `resumePossible`, and next-route
provenance instead of making an existing valid head appear absent. For an
absent-owner writer lease, `lastValidHead` is exposed only if the same semantic
completed-state verifier succeeds; a merely content-addressed but corrupt head is
never advertised as resumable. Failure evidence formed while a turn owns the writer
lease remains inside that lease. Conflict/recovery failures that cannot own the active
lease instead use the same OS-atomic no-clobber canonical first-receipt claim, so
parallel same-turn failures cannot race an overwrite of the canonical first failure.

## Identity and restart

A fresh process receives a new `instanceRef`; it does not pretend to be the process
that shut down. Shutdown is accepted only from the instance recorded in the exact
content-addressed head. Resume consumes that instance's exact content-addressed clean
shutdown receipt, recomputes the stored head hash, confines the context path beneath the
canonical Vex Home, and then replays the same `homeRef`, `deviceRef`,
`companionLineageRef`, `threadRef`, event chain, context and
`conversationHeadSha256`.

## Endpoint and privacy boundary

G01 accepts numeric loopback endpoint literals only (`127.0.0.1` or `::1`). A
caller-provided profile, hostname alias, redirect, or boolean cannot widen that
boundary. G01 rejects every HTTP redirect before following it; non-loopback or personal
endpoint use requires a separately admitted future adapter outside this baseline.
Credentials may be consumed only from an in-memory binding. The exact in-memory
authorization value is checked before request persistence and again against the
validated endpoint response before response persistence, so neither accidental
request inclusion nor a hostile loopback endpoint echo can serialize that credential.
The persisted record contains the admitted numeric loopback origin and model/profile
identity, never raw tokens, authorization headers, URL queries, passwords, redirect
targets, or model binaries.

## Typed safe failures

The baseline preserves these exact failure classes:

```text
HOME_NOT_INITIALIZED
EXISTING_HOME_REQUIRES_MIGRATION_PLAN
HOME_IDENTITY_MISMATCH
ENDPOINT_PROFILE_NOT_ADMITTED
ENDPOINT_NOT_LOOPBACK_OR_EXPLICITLY_ALLOWED
ENDPOINT_UNREACHABLE
ENDPOINT_TIMEOUT
ENDPOINT_HTTP_ERROR
ENDPOINT_RESPONSE_INVALID
PERSISTENCE_WRITE_FAILED
CONVERSATION_HEAD_MISMATCH
EVENT_CHAIN_CORRUPT
CONTEXT_HASH_MISMATCH
DUPLICATE_TURN_SUPPRESSED
THREAD_WRITER_CONFLICT
THREAD_WRITER_RECOVERY_REQUIRED
PRIVACY_POLICY_BLOCKED
```

Every failure receipt states whether request/response records were durable, the last
valid head, whether same-turn retry is admissible, whether resume remains possible,
and the next safe route. First failure evidence is immutable; later same-turn failure
receipts are content-addressed follow-ups. Failures are not relabelled as successful
companion turns.

## Proof command

```bash
npm run lived-companion:proof
```

The proof uses a bounded loopback HTTP server, writes an immutable turn, creates an
instance-bound shutdown receipt, launches a fresh Node process for exact receipt-bound
resume, and exercises all typed negative controls. Adversarial coverage includes path
escape, caller-authored non-loopback admission, forged shutdown/prior-instance lineage,
head tampering, context-path escape, concurrent cross-process writer contention,
absent-owner lease classification, malformed/hash-invalid lease evidence, hostname
alias rejection, loopback-to-non-loopback redirect rejection, partial/non-empty Home
preservation, non-directory Home rejection, linked-root rejection, linked-parent alias rejection, portable Windows path-segment
grammar, canonical stored-context paths, prior completed-state corruption rejection before endpoint effects,
semantic Home/device/lineage/thread/turn/event/context binding, genesis-anchored complete REQUEST/RESPONSE history,
exact event filename/contentHash validation, canonical context-location and `contextSourceRefs` provenance,
forged orphan duplicate-evidence rejection, absent-writer recovery with semantic last-head validation,
in-Home cross-thread context and event substitution rejection, failed-turn new-ref routing,
immutable first-failure evidence, same-turn duplicate suppression with zero additional HTTP calls
and retained last-valid-head provenance, and empty-root admission. It does not start a personal model endpoint,
synchronize siblings, train, mutate weights, publish, review, approve, merge, or enter
LC18.

## Held boundaries

```text
personal endpoint use = held
model installation/start = held
synchronization = held
training = held
weight mutation = held
publication = held
review/approval/merge = held
LC18 = held
```

<!-- [VXG RealForever] -->
