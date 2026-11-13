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

## Successful C1 projection

A successful C1 projection contains an admission reference, request/search hashes, authority/source/currentness receipt refs, the bounded transient `searchRequest`, the exact admitted Maps capability, and `DESKTOP_HOME_NODE` writer truth.

It does not expose principal, device, membership, lease, keys, provider identity or coordinates.

The query remains present because a later engine adapter must consume it. C1 explicitly grants no persistence:

~~~text
queryPersisted = false
providerResultPersisted = false
locationReadOrRetained = false
~~~

## C1 failure behavior

C1 fails closed before provider execution when intent contains authority fields, query/limit is malformed, session authority is stale/effectful, membership/lease identity or hashes mismatch, Maps capability is absent, revocation or lease currentness fails, runtime capability intersection denies Maps search, raw model endpoint exposure is detected, or Home Bridge denies the request.

Failure output never echoes the query.

## VCS-03 Stage A — Photon engine protocol adapter

VCS-03 consumes the accepted C1 boundary without moving authority into the engine layer.

Stage A adds one Photon-specific protocol adapter:

~~~text
accepted C1 admission
    |
    v
prepareHomeMapsPhotonPlaceSearch(...)
    |
    +-- engineRef = engine.vexlife.maps.photon
    +-- operation = FORWARD_PLACE_SEARCH
    +-- GET /api
    +-- q = accepted query
    +-- limit = accepted limit
    +-- endpoint absent
    +-- credentials absent
    +-- location bias absent
    +-- network effect absent
    |
    v
supplied Photon GeoJSON response
    |
    v
projectHomeMapsPhotonPlaceSearch(...)
    |
    +-- bounded candidate identities
    +-- provider-result coordinates
    +-- whitelisted address fields
    +-- OSM identity
    +-- OpenStreetMap attribution
    +-- selected = false
    +-- routePrepared = false
    +-- navigationStarted = false
~~~

The source owner is:

~~~text
src/core/home-maps-photon-place-search.mjs
~~~

Focused proof is:

~~~text
test/home-maps-photon-place-search.test.mjs
~~~

### Why Stage A does not own transport

Photon has a concrete HTTP protocol, but the endpoint/deployment route is not Maps product meaning.

Permanent distinction:

~~~text
PHOTON_PROTOCOL_ADAPTER
!=
CONNECTED_SERVICES_TRANSPORT

PHOTON_PROTOCOL_ADAPTER
!=
HOME_BRIDGE_AUTHORITY

PHOTON_PROTOCOL_ADAPTER
!=
ENDPOINT_OR_ROUTE_OWNER
~~~

The adapter therefore has no ambient `fetch`, no configured hostname and no provider credential surface.

It prepares the exact engine request descriptor and validates/projects a response supplied by a later rightful transport executor.

This preserves VCS-02:

~~~text
feature-specific client / engine adapter
    owns Photon request/response meaning

Connected Services
    owns reachability / transport / correlation

Home Bridge
    owns identity / membership / lease / revocation / capability admission
~~~

### Photon surface admitted by Stage A

Only forward place search is admitted:

~~~text
path = /api
query = q + limit
result = GeoJSON FeatureCollection / Point
~~~

Photon also supports location bias, reverse geocoding, structured search, status, updates, filters and other surfaces. Those are **not** imported by existence.

Location bias remains held because device/location authority and retention have not been admitted.

`/status` is useful future health/data-currentness evidence, but Stage A creates no engine health manager.

`/update` is not admitted.

### Provider-result identity and currentness

A projected candidate is addressed from Photon/OSM identity:

~~~text
engineRef
osm_type
osm_id
    -> deterministic candidateRef
~~~

Existing OpenStreetMap element IDs are positive 64-bit identities. Stage A normalizes numeric/decimal-string `osm_id` values to one canonical positive decimal representation before deriving `candidateRef`, so leading-zero or numeric/string representations cannot split one OSM identity into multiple candidates.

The adapter whitelists the bounded fields it needs and ignores unowned upstream metadata.

Provider-result coordinates mean only:

~~~text
coordinate supplied for this Photon result
~~~

They do not mean:

~~~text
device location
selected destination
route
navigation state
~~~

Stage A also does not claim visible feature result currentness:

~~~text
featureResultCurrentnessOwner = FEATURE_CLIENT
~~~

The accepted Android `VexMapsDestinationSearchSession` therefore remains the visible attempt/result-currentness owner.

### Attribution and data custody

Photon is an engine over OpenStreetMap data. Stage A preserves that distinction in the result contract:

~~~text
engineRef = engine.vexlife.maps.photon
data source = OpenStreetMap
required attribution = © OpenStreetMap contributors
data license ref = ODbL 1.0
copyright reference = https://www.openstreetmap.org/copyright
~~~

VexLife does not relabel OSM data as VexLife-owned provider data.

The adapter does not persist the raw provider response or query.

A later effectful realization must separately prove the actual engine/service logging and retention policy before claiming end-to-end no-retention behavior.

### Resource and deployment evidence

Current upstream Photon documentation describes a Java/OpenSearch-backed service and recommends self-hosting for larger usage rather than treating the public demo as an availability-guaranteed production dependency.

Planet-scale deployment is materially non-trivial; upstream currently documents substantial disk and memory requirements. Those numbers are deployment evidence, not VexLife semantic requirements and must be freshly re-grounded before any installation or capacity decision.

This is why Stage A does not silently add:

~~~text
Java/OpenSearch installation
Photon binary installation
planet/country database download
Nominatim import
continuous update job
service supervisor
network listener/firewall route
public-demo production dependency
cloud/VPS deployment
~~~

Those are later explicit realization effects.

### Stage-A failure boundary

The adapter fails closed when:

~~~text
input is not exact accepted C1 admission
C1 writer/authority boundary was widened
C1 searchIntentHash does not match requestRef/query/limit
prepared request identity was forged
prepared request query/request identity no longer matches the admitted C1 search intent
response is not bounded GeoJSON FeatureCollection
feature is not a valid Point
coordinate is out of range
OSM provider identity is zero, negative, outside positive 64-bit range, or otherwise invalid
provider returns more features than admitted limit
provider repeats one exact OSM identity
response exceeds bounded projection size
~~~

Unknown upstream fields are not promoted merely because Photon returned them.


## VMC-01B first effectful server realization — Home Maps serving capability

VMC-01B consumes C1 and Photon Stage A without reopening Connected Services or moving transport into the product contract.

The first effectful server-side composition is deliberately narrow:

~~~text
semantic Maps intent
    requestRef + query + limit

+ current HomeBridgeSessionAuthority
+ current role/project/resource capability scope

-> existing C1 admission

-> existing Photon Stage-A prepared descriptor

-> injected executePhotonRequest(...)
   endpoint/deployment/process binding stays outside product source
   AbortSignal is propagated
   session/Home authority is not forwarded to the provider executor

-> existing Photon response projector

-> Home Maps result
   resultRef
   name
   optional subtitle
   coordinate
   required OpenStreetMap attribution
~~~

The source owner is:

~~~text
src/core/server-home-maps-place-search-capability.mjs
~~~

Focused proof is:

~~~text
test/server-home-maps-place-search-capability.test.mjs
~~~

The capability does not expose Photon engine identity, OSM element identity, Home membership/session/lease material or the private query in its returned client projection. Each returned candidate receives one opaque Home place reference while preserving the provider-observed name/subtitle/coordinate facts Android already accepts.

The first provider executor is Photon-specific by construction. This does **not** create a generic provider framework:

~~~text
SERVER_HOME_MAPS_CAPABILITY
!=
PRIVATE_GATEWAY

SERVER_HOME_MAPS_CAPABILITY
!=
CONNECTED_SERVICES_TRANSPORT

INJECTED_PHOTON_EXECUTOR
!=
GENERIC_PROVIDER_REGISTRY

SESSION_AUTHORITY
!=
PROVIDER_EXECUTION

C1_ADMISSION
!=
PROVIDER_EXECUTION

PROVIDER_SUCCESS
!=
FEATURE_RESULT_CURRENTNESS
~~~

The executor receives only the already-prepared Photon request descriptor plus cancellation. Endpoint selection, process/container/host placement, service lifetime and any network route remain construction-time realization below the Home Maps semantic capability.

The returned Home projection preserves:

~~~text
queryEchoed = false
queryPersistedByCapability = false
providerResultPersistedByCapability = false
providerIdentityExposedToClient = false
deviceLocationReadOrRetained = false
destinationSelected = false
routePrepared = false
navigationStarted = false
featureResultCurrentnessOwner = FEATURE_CLIENT
~~~

VexLife-Android therefore keeps the accepted consumer shape:

~~~text
Home candidate.resultRef -> VexMapsPlaceSearchResult.placeRef
Home candidate.name      -> name
Home candidate.subtitle  -> subtitle
Home coordinate          -> VexMapCoordinate

VexMapsDestinationSearchSession
    remains the visible request/result currentness owner
~~~

This source slice admits the product-owned provider-execution composition. It does not itself prove a live Photon deployment, gateway route, Android carriage or lived search result.

## Current held successors

Still held after the VMC-01B Home Maps serving source slice:

~~~text
module-registry integration while current PR #987 owns blueprint/module-registry/core.json
generated Source Manifest closure derived from the exact candidate after shared custody releases
live Photon endpoint / deployment / process binding
live provider execution and provider logging/retention evidence
Photon installation
Java/OpenSearch installation
provider dataset download/import/update
Photon /status health manager
Photon /update
location bias / GPS access / location retention
private Home gateway Maps route
SDK private-gateway composition binding
Android Home-search transport adapter
lived VMC-01B device search proof
destination selection
route planning
active navigation
Home/Memory write
generic hosted-service framework
cloud/VPS deployment
~~~

The shared module-registry path is not seized by the VMC-01B source claim while PR #987 owns it. Generated Source Manifest consequences are not guessed in advance. When shared custody releases, re-ground current main, register the accepted server capability in the current module registry, and recompose generated closure from current co-bucket truth plus the exact candidate.

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

C1 focused proof
    test/home-maps-place-search.test.mjs

VCS-03 Stage-A Photon protocol adapter
    src/core/home-maps-photon-place-search.mjs

VCS-03 Stage-A focused proof
    test/home-maps-photon-place-search.test.mjs

VMC-01B effectful Home Maps serving capability
    src/core/server-home-maps-place-search-capability.mjs

VMC-01B focused proof
    test/server-home-maps-place-search-capability.test.mjs
~~~

<!-- [VXG RealForever][VEXHOME][MAPS-PLACE-SEARCH][C1][VCS-03-PHOTON-STAGE-A][VMC-01B-SERVER] -->
