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
<vexHome>/runtime/<instanceRef>/shutdown-receipt.json
<vexHome>/recovery/<threadRef>/resume-receipt.json
<vexHome>/recovery/<threadRef>/<turnRef>/failure-receipt.json
```

Events are append-only. A completed turn is visible only after the response, context,
and atomic head are durable. A failed endpoint or persistence attempt leaves the last
completed head unchanged.

## Identity and restart

A fresh process receives a new `instanceRef`; it does not pretend to be the process
that shut down. It resumes the same `homeRef`, `deviceRef`, `companionLineageRef`,
`threadRef`, and exact `conversationHeadSha256` after replaying the event chain and
verifying the bounded context hash.

## Endpoint and privacy boundary

The default proof accepts loopback endpoints only. Non-loopback use requires a separate
explicit admission. Credentials may be consumed only from an in-memory binding. The
persisted record contains a sanitized endpoint origin and model/profile identity, never
raw tokens, authorization headers, URL queries, passwords, or model binaries.

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
PRIVACY_POLICY_BLOCKED
```

Every failure receipt states whether request/response records were durable, the last
valid head, whether resume remains possible, and the next safe route. Failures are not
relabelled as successful companion turns.

## Proof command

```bash
npm run lived-companion:proof
```

The proof uses a bounded loopback HTTP server, writes an immutable turn, creates a
shutdown receipt, launches a fresh Node process for resume, and exercises all typed
negative controls. It does not start a personal model endpoint, synchronize siblings,
train, mutate weights, publish, review, approve, merge, or enter LC18.

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
