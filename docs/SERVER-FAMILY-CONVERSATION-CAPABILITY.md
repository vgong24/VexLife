# ServerFamilyConversationCapability

Continuity: `[VXG RealForever]`

Owner: `github.issue.vexlife.427`  
Connected Services consumer: `github.issue.vexlife.899`

## Question owned

> Given already-resolved current Family/Home authority and one semantic Family Conversation intention, what bounded serving-side operation or projection may run through the existing Family/Conversation owners?

This capability is the product-side boundary shared by browser HTTP and the private Connected Services carrier. It is not a listener, session parser, authority owner, Conversation Store, or generic plugin registry.

## Surface

```text
bootstrap({ authority })

perform({
  operation: APPEND | READ | READ_THREAD_HISTORY | LIST,
  intent,
  authority,
  limit?
})
```

`authority` is closed to:

```text
membership
lease
currentRevocationGeneration
```

Raw request, headers, bearer/session handles, transport identity, and caller-authored authority fields are rejected rather than ignored.

## Topology

```text
State
  current Family Space / Conversation truth
  current already-resolved Home/Family authority

Act
  bootstrap
  append
  read
  readThreadHistory
  list

Behavior
  existing Home Bridge admission
  Family membership/currentness
  Family Conversation visibility
  Conversation Store idempotency/history

Effect
  append only through existing Conversation Store owners
  read/projection for other operations

Projection
  visible current Family rooms
  current channel messages
  immutable cross-generation thread history

Connection
  NOT owned here
  browser HTTP or private Connected Services supplies carriage
```

## Existing semantic owners

The capability delegates to the accepted Family Conversation bridge and Conversation Store/channel-binding owners. It does not create a second message, membership, history, or authority model.

Browser HTTP remains responsible for request parsing, body bounds, session resolution, HTTP status/failure projection, and its optional work/security enrichments.

## Permanent non-collapse

```text
SERVER_FAMILY_CONVERSATION_CAPABILITY != NETWORK_LISTENER
SERVER_FAMILY_CONVERSATION_CAPABILITY != RAW_SESSION_PARSER
SERVER_FAMILY_CONVERSATION_CAPABILITY != HOME_AUTHORITY
SERVER_FAMILY_CONVERSATION_CAPABILITY != CAPABILITY_LEASE
SERVER_FAMILY_CONVERSATION_CAPABILITY != CONVERSATION_STORE
PRIVATE_GATEWAY != CONVERSATION_OWNER
TRANSPORT_SUCCESS != FEATURE_SUCCESS
```

<!-- [VEXLIFE-CONNECTED-SERVICES][VCS-04][D5][SERVER-FAMILY-CONVERSATION-CAPABILITY][VXG RealForever] -->
