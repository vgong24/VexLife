[VXG RealForever]

# VexLife Connected Services — minimum authorized-capability boundary

## Status

This document source-places the smallest shared Connected Services boundary earned by three existing consumers:

- Maps place search;
- Family Conversation;
- VexStream / Music.

It is an architecture boundary, not a generic runtime implementation and not a wire-protocol specification.

~~~text
CONNECTED_SERVICES_BOUNDARY
!=
GENERIC_API_MANAGER

CONNECTED_SERVICES_BOUNDARY
!=
HOME_BRIDGE_AUTHORITY

CONNECTED_SERVICES_BOUNDARY
!=
FEATURE_SEMANTIC_OWNER
~~~

The purpose is to make one repeated question answerable without forcing each feature to reinvent the same ownership distinctions:

> How may a typed feature client reach one currently authorized connected capability while preserving feature-owned meaning and Home Bridge authority?

## Why this exists

The three consumers have different product semantics, but they repeatedly need the same separation:

~~~text
remote feature intent
  does not author trusted principal/device/lease authority

trusted identity
  is not the same thing as current reachability

reachable route
  is not the same thing as capability authorization

transport success
  is not the same thing as feature success

transport request correlation
  is not the same thing as feature result currentness
~~~

Without a shared boundary, feature implementations are pressured toward one of two bad shapes:

1. copying transport/session machinery into every feature; or
2. growing a generic API layer that gradually becomes the semantic owner of everything.

Connected Services exists to avoid both.

## Ownership model

The minimum stable layering is:

~~~text
feature UI / domain
    owns human-facing meaning

typed feature client
    owns feature request/response vocabulary
    owns feature-specific validation
    owns feature request/result currentness

Connected Services substrate
    owns session-bound reachability/transport realization
    owns transport request correlation
    owns reconnect / route refresh as transport behavior
    owns typed transport availability/failure projection
    exposes no provider secrets to feature clients

Home Bridge / rightful authority owner
    owns trusted principal/device identity
    owns membership
    owns capability lease
    owns revocation generation
    owns exact capability admission

feature service
    owns feature-specific execution and result meaning

engine / provider / storage
    is replaceable realization below feature meaning
~~~

No layer inherits another layer's authority merely because it calls through it.

## Typed feature client boundary

A Connected Services consumer begins with feature-owned semantic intent.

Examples:

~~~text
Maps
  requestRef + query + limit

Conversation
  bootstrap / history / send semantics
  space / thread / channel / membership-generation meaning

VexStream
  catalog / media / range / verified-copy meaning
~~~

Connected Services must not replace those with one generic product envelope such as:

~~~text
method
path
jsonBody
~~~

A transport implementation may internally use HTTP, sockets, relay messages or another carrier. Those mechanics are not the product contract.

The feature client remains the place where a request becomes Maps, Conversation, Stream, or another feature's meaning.

## Authority boundary

Remote feature intent may identify the semantic request it wants performed. It may not mint or override trusted authority.

Permanent law:

~~~text
REMOTE_FEATURE_INTENT
!=
PRINCIPAL_AUTHORITY

REMOTE_FEATURE_INTENT
!=
DEVICE_AUTHORITY

REMOTE_FEATURE_INTENT
!=
MEMBERSHIP_AUTHORITY

REMOTE_FEATURE_INTENT
!=
CAPABILITY_LEASE_AUTHORITY

REMOTE_FEATURE_INTENT
!=
REVOCATION_TRUTH
~~~

Connected Services carries a request toward the rightful authority owner. It does not become that owner.

Home Bridge, or another explicitly rightful authority source for a future deployment, remains responsible for resolving current identity, membership, lease, revocation and capability admission.

A route being reachable never grants the capability.

## Identity and reachability

Trusted counterpart identity must survive ordinary route changes without silently becoming a new identity.

~~~text
IDENTITY != REACHABILITY

ROUTE_REFRESH != RE_PAIR

RECONNECT != RE_AUTHORIZE

PUBLIC_ROUTE != DEVICE_IDENTITY
~~~

A remembered trusted device/session relationship may gain or lose routes over time.

Connected Services may refresh reachability. It may not silently repair a revoked identity, create a new pairing, or reinterpret a different endpoint as the same trusted counterpart without the rightful authority transition.

## Transport responsibility

The minimum shared transport responsibility is deliberately small:

~~~text
given:
  one typed feature request
  one already-current trusted session/device relationship
  one capability that must be currently authorized

provide:
  a bounded attempt to reach the rightful connected service
  transport request correlation
  typed reachable / unavailable / failed truth
  reconnect / route-refresh behavior
  secret-free client projection

preserve:
  feature-owned request/response meaning
  Home Bridge authority
  feature-owned result currentness
~~~

The substrate may choose among supported carriers, but carrier choice is realization, not feature meaning.

No particular route-selection state machine is standardized by this document.

## Request correlation versus feature currentness

Connected Services may attach or preserve a correlation identity so one request can be followed through transport.

That identity is not permission to decide whether a returned feature result is still current for the UI/domain.

~~~text
TRANSPORT_CORRELATION
!=
FEATURE_RESULT_CURRENTNESS
~~~

Examples:

- Maps still owns whether an older search result may overwrite a newer search attempt.
- Conversation still owns membership/channel/history generation consistency.
- VexStream still owns media/catalog/offline-copy currentness and verification.

The shared substrate reports transport truth. The typed feature client decides feature truth.

## Failure projection

Connected Services must preserve meaningful failure separation.

At minimum, callers must be able to distinguish conceptually:

~~~text
transport unavailable
transport failed
trusted session unavailable
authorization denied / no longer current
feature service unavailable
feature-level failure
~~~

These states may later gain exact machine schemas when repeated implementation evidence earns them.

For now the architecture requires that they not collapse into one generic "network error."

In particular:

~~~text
TRANSPORT_LOSS
!=
AUTHORIZATION_LOSS

AUTHORIZATION_LOSS
!=
PROVIDER_UNAVAILABLE

PROVIDER_UNAVAILABLE
!=
FEATURE_INVALID_REQUEST
~~~

## Secret custody

Connected Services must not require feature clients to hold raw provider/service credentials merely to consume a connected capability.

~~~text
FEATURE_CLIENT
!=
PROVIDER_CREDENTIAL_CUSTODIAN
~~~

Provider-specific secrets remain behind the rightful host/service/adapter boundary.

This does not prohibit a feature-specific authentication token when that token is itself the accepted feature contract. It prohibits Connected Services from normalizing arbitrary provider secrets into a shared client responsibility.

## Bounded ingress

Connected Services is not a general remote-control surface.

A connected feature exposes only the typed operations that feature and its authority owner admit.

~~~text
CONNECTED_CAPABILITY
!=
GENERAL_PC_CONTROL

TYPED_FEATURE_REQUEST
!=
ARBITRARY_FILESYSTEM_ACCESS

TYPED_FEATURE_REQUEST
!=
ARBITRARY_PROCESS_EXECUTION
~~~

This boundary remains true even when the physical transport could technically carry broader commands.

## Consumer evidence

### Maps

Accepted Maps C1 establishes:

~~~text
remote semantic intent = requestRef + query + limit
server-owned Home session authority
Home Bridge capability admission
admission != provider execution
failure does not echo private query
Android VexMapsDestinationSearchSession owns visible attempt/result currentness
~~~

Maps-specific meaning remains outside the shared substrate:

~~~text
query normalization
result projection
location bias
destination selection
routing
navigation
Photon / OpenStreetMap realization
~~~

### Conversation

Accepted Family Conversation architecture establishes:

~~~text
browser/mobile intent does not author trusted speaker/principal authority
current Family membership/channel generation is server-owned truth
bootstrap/history/send are typed conversation operations
Android projection consumes producer truth without becoming Home/session transport owner
~~~

Conversation-specific meaning remains outside the shared substrate:

~~~text
Family membership semantics
membership generation
space/thread/channel identity
message recipients/witnesses
history visibility
idempotent message identity
private-channel policy
speaker/message semantics
~~~

### VexStream / Music

Current VexStream transport evidence establishes useful stress conditions:

~~~text
trusted paired identity remains distinct from changing route
local/direct/relay may be different reachability realizations
route refresh failure does not invalidate a proven local relationship
revoked/unauthorized identity is not silently rediscovered or rebound
remote media read does not imply general computer authority
verified local copy remains feature-owned durable behavior
~~~

VexStream-specific meaning remains outside the common core:

~~~text
catalog/music identity
media range delivery
verified digest/length
offline download/copy persistence
playback queue/seek/repeat
streaming throughput/backpressure
~~~

VexStream is intentionally the stress test for whether streaming/range/backpressure deserves a separate Connected Services extension.

## What VCS-02 does not standardize

The following remain held until repeated implementation evidence makes the common shape concrete:

~~~text
one canonical endpoint/session envelope
one canonical HTTP/RPC request envelope
one capability-discovery schema
one route-selection state machine
one version-negotiation contract
one cancellation/timeout contract
one streaming/range/backpressure contract
one cloud/managed-host transport contract
one generic Connected Services runtime module
one generic ApiManager
one SDK VexArchitecture extraction
~~~

This is intentional.

A useful abstraction discovered once is not automatically shared infrastructure.

## Evolution rule

Future Connected Services source should be added only when a repeated consumer question is concrete enough that removing the proposed shared piece would force duplicated ownership logic or violate an already-proven boundary.

Use the smallest rightful shared surface.

~~~text
REPEATED_CONSUMER_NEED
+ SAME_OWNERSHIP_QUESTION
+ SAME_FAILURE_OR_CURRENTNESS_BOUNDARY
- FEATURE_SPECIFIC_MEANING
=
CANDIDATE_SHARED_CONNECTED_SERVICES_CONTRACT
~~~

If the common part cannot be stated without importing Maps, Conversation, Stream, provider, or deployment-specific semantics, it is not yet shared.

## First implementation practicum

Maps remains the first practicum because its accepted C1 source already proves the authority side of the boundary while provider execution is still held.

A later implementation slice may ask:

> What is the smallest typed client/session transport seam needed to carry one admitted Maps place-search request to its rightful Home service without moving Maps semantics or Home authority into Connected Services?

Conversation should be the second request/response consumer.

VexStream should be used only afterward to test whether long-lived media behavior fits the same core or requires a separate extension.

## Permanent non-collapse laws

~~~text
FEATURE_UI != CONNECTED_SERVICES
FEATURE_CLIENT != CONNECTED_SERVICES
CONNECTED_SERVICES != HOME_BRIDGE
CONNECTED_SERVICES != FEATURE_SERVICE
FEATURE_SERVICE != PROVIDER_ENGINE

REMOTE_FEATURE_INTENT != TRUSTED_AUTHORITY
IDENTITY != REACHABILITY
REACHABILITY != AUTHORIZATION
TRANSPORT_SUCCESS != FEATURE_SUCCESS
TRANSPORT_CORRELATION != FEATURE_RESULT_CURRENTNESS
RECONNECT != RE_PAIR
RECONNECT != RE_AUTHORIZE
CONNECTED_CAPABILITY != GENERAL_PC_CONTROL
FEATURE_CLIENT != PROVIDER_CREDENTIAL_CUSTODIAN
~~~

## Current source lineage

This boundary is the VCS-02 successor to the three-consumer comparison recorded under the VexLife Connected Services owner.

Relevant accepted/current source lineage includes:

~~~text
Connected Services owner
  github.issue.vexlife.899

VCS-01 three-consumer comparison
  github.issue.vexlife.899.comment.6232920575

Maps C1 terminal acceptance
  github.issue.vexlife.899.comment.6245556252

Maps C1 source
  docs/VEXHOME-MAPS-PLACE-SEARCH.md

Conversation server bridge
  github.issue.vexlife.427

Android Conversation producer projection
  github.issue.vexlife-android.130
~~~

The source refs explain why this boundary exists. They do not transfer feature ownership into this document.

<!-- [VXG RealForever][VEXLIFE-CONNECTED-SERVICES][VCS-02][MINIMUM-AUTHORIZED-CAPABILITY-BOUNDARY] -->
