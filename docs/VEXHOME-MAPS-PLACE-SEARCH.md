# VexHome Maps place search — C1 Home-routed admission

`[VXG RealForever]`

## Purpose

C0 registered `capability.vexlife.maps-place-search` as provider-neutral, REQUESTABLE and non-executable.

C1 adds the smallest server-side admission seam required before any search engine can be invoked:

~~~text
remote/mobile semantic intent
    requestRef
    query
    limit

        + current server-owned Home session authority
        + current role/project/resource capability scope

        |
        v

Home Bridge admission

        |
        v

HOME_ROUTED_PLACE_SEARCH_ADMITTED
    bounded transient query + limit
~~~

C1 does **not** call Photon, a hosted API or any network search provider.

## Why the remote intent is deliberately small

The caller may author search meaning:

~~~text
requestRef
query
limit
~~~

It may not author:

~~~text
principalRef
deviceRef
leaseRef
Home authority
provider identity
provider credentials
location authority
~~~

The server supplies current identity/authorization through the accepted `vexlife.home-bridge-session-authority/v1` projection. That projection already binds the authenticated session to one current Home Bridge membership, lease and revocation generation with all effect flags false.

C1 validates the closed projection and then calls the accepted `evaluateRemoteRequest(...)` Home Bridge owner with the Maps capability as the one required capability.

## Search request bounds

~~~text
query
    trimmed
    1..256 Unicode code points
    control characters rejected

limit
    integer
    1..20
~~~

The limit matches VexMaps' intended scrollable result breadth without forcing an engine to return twenty results.

Location bias is intentionally absent from C1. It requires its own source/retention/privacy decision.

## Currentness ownership

C1 owns only **Home admission of one search request**.

~~~text
C1 Home admission
!=
Android search-attempt currentness
!=
provider request execution
!=
provider result currentness
!=
destination selection
!=
routing
!=
navigation
~~~

VexLife-Android's accepted `VexMapsDestinationSearchSession` remains the visible Where-to request/result currentness owner.

## Capability vocabulary stays actionless

The accepted C0 capability remains:

~~~text
capability.vexlife.maps-place-search
defaultStage = REQUESTABLE
actionRefs = []
~~~

C1 registers one concrete action at the Home execution seam:

~~~text
action.maps-place-search.home-routed-request
permission.none
effectClass = PRIVATE_HOME_ROUTED_READ_ADMIT_MAPS_PLACE_SEARCH
~~~

This follows the accepted companion-navigation evolution law: capability vocabulary does not need to become a generic executable tool merely because one source-owned product seam can request it.

## Successful projection

A successful C1 projection contains an admission reference, request/search hashes, authority/source/currentness receipt refs, the bounded transient `searchRequest`, the exact admitted Maps capability, and `DESKTOP_HOME_NODE` writer truth.

It does not expose principal, device, membership, lease, keys, provider identity or coordinates.

The query remains present because a later local engine adapter must consume it. C1 explicitly grants no persistence:

~~~text
queryPersisted = false
providerResultPersisted = false
locationReadOrRetained = false
~~~

## Failure behavior

C1 fails closed before provider execution when intent contains authority fields, query/limit is malformed, session authority is stale/effectful, membership/lease identity or hashes mismatch, Maps capability is absent, revocation or lease currentness fails, runtime capability intersection denies Maps search, raw model endpoint exposure is detected, or Home Bridge denies the request.

Failure output never echoes the query.

## Held successors

Still held after C1:

~~~text
Photon/provider adapter
network request
provider credentials
provider dataset install/update
location bias / GPS access / location retention
provider result projection
destination selection
route planning
active navigation
Home/Memory write
Android Home-search adapter
generic hosted-service framework
~~~

The next source edge after C1 acceptance is the first **engine adapter contract**, with Photon as the candidate realization. That adapter must preserve this admission boundary rather than becoming the remote authority owner.

## Source ownership

~~~text
capability vocabulary
    blueprint/capability-registry.json

action vocabulary
    blueprint/fragments/actions.json

Home remote admission
    src/core/home-bridge.mjs

current server session authority
    src/core/home-bridge-session-authority.mjs

C1 composition
    src/core/home-maps-place-search.mjs

focused proof
    test/home-maps-place-search.test.mjs
~~~

<!-- [VXG RealForever][VEXHOME][MAPS-PLACE-SEARCH][C1] -->
