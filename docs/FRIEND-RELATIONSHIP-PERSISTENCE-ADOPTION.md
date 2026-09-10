# Friend FFR-03 — Durable Relationships Product Adoption

`[VXG RealForever]`

Owner: `github.issue.vexlife.339` under Friend trajectory `github.issue.vexlife.324`.
Accepted persistence foundation: PR #325 / merge `00088a0be13ed285fc236ab2ab135ec64679cff2`.

## Purpose

FFR-01/02 made `state.relationships -> service.relationships` durable. FFR-03 makes that owner consumable by the visible Relationships product without allowing browser projection, delivery, provider state, or a UI boolean to become canonical relationship truth.

```text
PREPARE != PERSIST
HEAD_COMMITTED_WITHOUT_DURABLE_RECEIPT != SAVED
DURABLE_RECEIPT + CURRENT_READBACK = SAVED
RUNTIME_PLAN != RELATIONSHIP_PERSISTENCE
DELETE_UI = TOMBSTONE_NOT_PHYSICAL_PURGE
```

## Identity binding

The persistence bridge binds one explicit local owner:

```text
localParticipantRef
localStateRootRef
```

It never derives those refs from Home path, `homeRef`, deviceRef, companion/model lineage, display name, provider/session state, or route state. Counterpart/invitation refs are likewise explicit admitted inputs. FFR-04 may later bind accepted CDR observations into those reference fields without moving canonical relationship ownership out of the local store.

The bridge binds the filesystem Home only as the accepted storage root. Storage location is not participant identity.

## Product adapter contract

The source-managed browser persistence bridge exposes:

```text
prepare()       no effect; closed explicit relationship intent
commit()        canonical create + durable receipt + exact readback
read()          current canonical record for exact counterpart
list()          bounded owner-local canonical relationship projection
transition()    attributable append-only local transition
exportCurrent() bounded content-safe export
recoverWriter() explicit abandoned-writer identity recovery
tombstone()     durable tombstone transition; never physical-purge claim
```

`listRelationships()` is an owner-local reduced projection. It verifies every returned canonical head through the existing store chain, returns no durable file paths, and hides tombstones by default unless explicitly requested.

## Source-phase / server serialization

The initial source phase deliberately does not mutate `scripts/serve-browser.mjs` because PR #336 currently owns that shared server path. Backend source and tests proceed now. The visible HTTP/controller tail is added only after #336 releases the path and current main/claims are re-grounded.

```text
DEPENDENCY_NOT_COMPLETE != ENTIRE_LANE_IDLE
SHARED_SERVER_PATH_SERIALIZATION != SECOND_SERVER_PERMISSION
```

No alternate server, port, hidden endpoint, network/provider effect, outside participant, Memory/Home-layout/model effect, publication, or public search is introduced by this backend slice.

<!-- [VXG RealForever] -->
