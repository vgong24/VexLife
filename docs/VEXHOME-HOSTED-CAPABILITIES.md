# VexHome hosted capabilities — one personal Home, modular realizations

`[VXG RealForever]`

## Purpose

Vex Home is not only a directory and it is not only a model process.

It is the person's durable custody and hosting boundary for VexLife state, runtime continuity and
independently admitted product capabilities.

The intended architecture is:

~~~text
VexHome
    core
        Home identity
        lifecycle / recovery
        companion + model binding
        trusted-device Home Bridge

    hosted capabilities
        Conversation
        Maps
        Stream
        future capabilities...
~~~

This document establishes **placement and vocabulary only**.

It does not claim that Maps, Stream or every named capability already runs as a Home service, and it
does not create runtime, network-listener, installation, cloud-deployment or provider authority.

## Why this boundary exists

Some product questions naturally need resources a presentation surface should not own:

~~~text
large indexes or routing graphs
long-lived processes
background refresh/import work
large personal media/data stores
provider credentials
heavy compute
cross-device continuity
~~~

A phone, browser or remote Mac should be able to ask a semantic question without becoming responsible
for those mechanics.

The resulting shape is:

~~~text
consumer experience
    asks one semantic capability question
        |
        v
VexHome hosted capability
    owns realization/current availability
        |
        v
engine/provider/storage/runtime
~~~

The consumer should not need to know whether that realization is in the Home process, a sibling
service, another owned computer or a selected cloud host.

## Permanent distinctions

~~~text
VEX_HOME != ONE PROCESS
VEX_HOME != ONE PHYSICAL MACHINE
HOME_IDENTITY != HOSTED_CAPABILITY
HOSTED_CAPABILITY != PROVIDER_ENGINE
CAPABILITY_CONTRACT != DEPLOYMENT_TOPOLOGY
CAPABILITY_CONTRACT != REPOSITORY_BOUNDARY
SELF_HOSTED != SAME_MACHINE
MANAGED_HOSTING != DIFFERENT_PRODUCT_MEANING
REMOTE_SURFACE != LOCAL_SIBLING
VEXHOME_OBSERVE != GENERIC_HOME_EXECUTION
~~~

The last distinction is important. The accepted `capability.vexlife.vexhome.observe` contract is a
bounded read-only observation of canonical Home identity/runtime/recovery summary. This document does
not widen it into arbitrary Home access or execution.

## Separate and combined are deployment choices

Start with the simplest composition that preserves the same meaning:

~~~text
ALL IN ONE
    VexHome process/runtime
        Conversation
        Maps
        Stream

SPLIT LOCAL
    VexHome Core
    Maps service
    Stream service

OWNED DISTRIBUTED
    Home Core on personal machine
    one capability on another owned server

SELF-HOSTED CLOUD
    user chooses a cloud/VPS target
    same capability contract

OPTIONAL MANAGED
    future Vextreme-operated realization
    same capability contract
~~~

A deployment change is not permission to change identity, authorization or product semantics.

## Home Bridge remains the remote authority boundary

A remote client does not gain generic Home access merely because a capability exists.

Current Home Bridge invariants continue to apply:

~~~text
paired device
+ explicit human principal binding
+ current capability lease
+ registered action
+ least-privilege scope intersection
+ current revocation/expiry
    -> admitted request
~~~

The hosted capability receives only the already-admitted semantic request it owns.

Remote clients must not receive:

~~~text
raw model endpoint authority
generic filesystem authority
provider credentials
implicit Home-writer authority
another principal's authority
~~~

If a capability later needs sensitive effects, it earns its own permission/elevation contract rather
than weakening Home Bridge.

## What belongs on Home versus a moving device

The boundary follows the human outcome rather than a rigid "server/client" rule.

A Home is a good owner for:

~~~text
large/searchable indexes
routing graph preparation
media libraries and durable stores
provider credentials
background refresh/import jobs
heavy or persistent compute
cross-device canonical state
~~~

A mobile/native device remains the rightful owner for things only it can truthfully prove:

~~~text
current device sensors/location
OS permission state
foreground/background lifecycle
native presentation
active on-device navigation continuity
offline emergency/fallback behavior
native accessibility/platform evidence
~~~

The two compose; neither impersonates the other.

## First concrete placement pressure: VexMaps

VexMaps exposed the distinction through an ordinary product problem.

Android's system Geocoder could be integrated correctly while still being weak for the lived partial
business query. A direct commercial provider candidate then demonstrated that provider usefulness,
secret custody, retention terms and live reliability are separate proof questions.

Before that provider's protected live probe executed, the placement question became clearer:

~~~text
VexMaps Android
    human search experience
    request/result currentness
    destination selection
    device location + navigation
        |
        v
VexHome Maps search capability
        |
        v
search engine/provider realization
~~~

The first engine candidate is **Photon over OpenStreetMap data** because the upstream Photon project
describes self-hosting plus search-as-you-type, location bias and typo-tolerant OSM geocoding. That is
candidate evidence, not VexLife runtime acceptance and not a dependency added by this document.

A future Maps capability may also own route-engine realization while Android continues to own the
active native navigation experience.

## Stream and Conversation are pressure, not precedent for repo-per-feature

A named product capability does not automatically earn a repository.

Repository extraction is justified when independent release/deployment/contributor/licensing/lifecycle
pressure becomes real.

Until then:

~~~text
module boundary first
stable capability contract second
deployment boundary selectable
repository boundary last
~~~

Good modularity should make a later extraction unsurprising rather than necessary from day one.

## Capability realization lifecycle

A future hosted capability should make these questions explicit:

~~~text
identity
    what semantic capability is this?

admission
    who/device/lease may request it?

realization
    which engine/provider currently satisfies it?

resources
    disk / memory / CPU / GPU / network / background work

data
    what is stored, where, and for how long?

secrets
    are provider credentials needed and where do they remain?

health
    available / held / degraded / unavailable

recovery
    how does restart/update/rebuild preserve owned state?

deployment
    local / split local / another owned host / cloud / managed

proof
    deterministic contract
    environment/native proof
    live-provider or lived-user evidence when claimed
~~~

A free/open engine does not erase hardware, energy or maintenance cost. Home placement makes those
costs visible and user-selectable rather than silently converting them into an unavoidable external
API dependency.

## Current implementation boundary

Current accepted source already provides:

~~~text
Vex Home identity/bootstrap/runtime/recovery
Home Bridge pairing + principal/device binding
capability leases + revocation
remote-vs-local-sibling honesty
bounded VEXHOME read-only observation
~~~

This document adds no generic hosted-capability executor.

Held until separately earned:

~~~text
Maps hosted capability refs/actions
Stream hosted capability refs/actions
generic hosted-service lifecycle manager
Photon installation/data acquisition
route-engine installation/data acquisition
cloud deployment automation
managed Vextreme hosting
new network listeners/firewall routes
provider credentials
mobile runtime adoption
~~~

## Next concrete engineering edge

Use VexMaps as the first hosted-capability practicum:

~~~text
1. define the smallest semantic Home Maps search contract
2. bind it to existing Home Bridge capability/action authority without generic Home execution
3. realize one local/self-hosted Photon adapter behind that contract
4. prove resource/data/update/failure behavior
5. consume the semantic contract from VexLife Android
6. preserve Android Geocoder/local packs as explicit fallback truth
~~~

Do not build a generic plugin/service framework first. Let the second and third real hosted consumers
show which lifecycle/discovery/resource meanings are actually shared.

## Source routes

~~~text
Home identity/bootstrap
    README.md
    docs/FOUNDATION-README.md
    docs/BOOTSTRAP-AND-MODELS.md

remote identity/admission
    docs/HOME-BRIDGE-REMOTE-SURFACES.md
    blueprint/home-bridge-registry.json
    src/core/home-bridge.mjs

bounded current VEXHOME observation
    docs/VEX-ASSEMBLY-CAPABILITY-DOMAINS.md

first concrete hosted-capability pressure
    github.issue.vexlife.894
    VexLife-Android PR #128
~~~

<!-- [VXG RealForever][VEXHOME][HOSTED-CAPABILITIES] -->
