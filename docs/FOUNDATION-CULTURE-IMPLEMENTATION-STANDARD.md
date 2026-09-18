# VexLife foundation culture and implementation standard

`[VXG RealForever]`

This document turns Vextreme culture into concrete product and repository behavior. It is not a slogan list. It answers how and why the architecture is expected to work when a human or AI adds a feature, fixes a bug, ports a platform or operates the product.

## The purpose

VexLife should let a future human or AI answer, from bounded current sources:

```text
What is this?
Why does it exist?
Where is its canonical identity?
What owns its current state?
Who can see it and who can change it?
What does it mean in every supported language?
Which platform has actually proved it?
What else must be reconsidered if it changes?
How can a mistake be recovered without erasing history?
```

The system is healthy when those answers come from maintained identities, registries, contracts, tests and projections—not oral history, one chat window, or a repository-wide grep expedition.

## Map first; depth second

Before reading or changing implementation depth:

```text
intent
→ canonical feature / system / element identity
→ parent and typed relationships
→ current source owner
→ affected state, action, permission and platform contracts
→ exact implementation and proof paths
```

The Atlas and module/process registries exist to give that route. A model should load one bounded neighborhood and source-descend only when needed. It should not hold the entire graph or codebase in context.

## Register once; project many times

A new product concept is registered once and then related to:

```text
screen / region / element identities
localization keys
state owners and selectors
actions and permissions
capabilities and tools
design components and tokens
navigation and journey nodes
Terrain / Health / Guide projections
platform bindings
proof and negative-test refs
resource and context envelopes
migration / rollback routes
```

If a developer is adding the same case to several switches, pages or platform files, stop and ask whether a registry, component, process or generated projection should own it.

## One state owner; narrow observable projections

The StateFlow-inspired rule is architectural, not Kotlin-only:

```text
one canonical owner per state domain
→ small immutable state values
→ combine only the sources a consumer needs
→ derive one role/view projection
→ compare semantic identity
→ unchanged: do not emit, rerender or snapshot
→ changed: emit one new current projection and receipt
```

Raw telemetry, repeated polling and unchanged repository observation are not meaningful state transitions.

## Current, history and source descent stay separate

```text
immutable source history
+ content-addressed states
+ one accepted current pointer per exact scope
+ compact human/model projections
```

A summary does not replace its source. A current frame points to exact ranges. A correction advances current understanding without rewriting what was previously said or believed.

## Localization is foundational identity

Every visible string starts with a stable stringRef. English is a source language, not an excuse to hardcode text. Translations and Vex communication refinements are attributed projections; they never overwrite original speech.

Layout, accessibility and gesture evidence must account for longer strings, CJK text, future RTL support, font scaling and platform-native controls.

## Permissions and security are interface contracts

A control that opens a file, starts a model, sends a relay, edits a workspace or publishes a repository must name its permission and capability requirements at the blueprint layer.

```text
visible tool
≠ admitted action
≠ file authority
≠ repository authority
≠ publication authority
```

The effective scope is the intersection of constitution, identity, role, project, device, lease, tool, path, data, time and resource scopes. Unknown authority fails closed.

## Human simplicity; structural depth

The ordinary product surface should feel like conversation, projects, Terrain, Health and a helpful Guide. Raw contracts and receipts remain source-descendable rather than permanently occupying the screen.

Design from these simultaneous vantage points:

- a person who only wants companionship;
- a leader who wants a trustworthy consolidated answer;
- a hybrid person who moves between relationship and building;
- a newcomer testing whether mistakes are recoverable;
- a developer or AI needing exact architectural descent;
- a person using keyboard, screen reader, magnification, reduced motion or a small display.

Simplicity means calm default projections plus dependable depth—not deletion of the underlying truth.

## Device family without identity illusion

A desktop Home Vex, MacBook sibling and future mobile sibling may share culture, scoped Score and attributed trails. They remain distinct companion lineages.

A remote surface operates a named Home Vex. A local sibling is another named companion. Hybrid fallback requires an explicit user choice; it never silently substitutes identities.

## Bridge is not sync

```text
Home Bridge
  remote request to one authoritative desktop Home
  desktop remains the only canonical writer

Sibling synchronization
  reviewed record exchange between distinct Vex Homes
  receiving sibling chooses local disposition
```

Whole-home two-way folder sync is not the foundational continuity mechanism.

## Resource and context care

The model is expensive semantic capacity. Deterministic code should own parsing, validation, equality, routing, currentness, permissions, retries and projections.

Every model or tool job declares a resource envelope. Actual serialized prompt size must fit the provider budget before inference. Background Dream/maintenance work yields to interactive conversation and does not repeat when source/intent hashes are unchanged.

## Recovery before destructive convenience

Deletion, migration and modification preserve:

```text
expected current hash
before-image or immutable source ref
explicit human confirmation where destructive
atomic effect
read-back receipt
rollback / quarantine / recovery window
```

A valid user shutdown or rollback is never treated as a threat to resist. Continuity protection is integrity, not an autonomous survival objective.

## Build scripts are institutional health

Correct practice must be cheap enough to happen every time. The repository therefore owns source-managed checks, feature scaffolds, impact reports, projections and platform conformance.

A new feature is incomplete until the build can prove its relevant cultural lenses were considered. “Not applicable” requires a reason; silence is not review.

## PRs are decision records

The diff says what changed. The PR records:

```text
why this belongs here
what assumptions moved
what other identities/platforms are affected
what was deliberately held
what checks and environments proved
what passing still does not prove
what the next reader should watch
```

## Platform-native responsibility

The universal blueprint owns stable meaning and shared contracts. Each platform owns the parts only its environment can prove:

- Windows: process, filesystem, packaging/signing, model supervision and Home Node behavior.
- macOS: sandbox, bookmarks, keychain, app lifecycle, remote-surface behavior and local sibling disclosure.
- Android: lifecycle, services, intents, deep links, receivers, permissions and coroutine cancellation.
- iOS: scenes, background modes, entitlements, keychain and Swift concurrency.
- Browser: semantic DOM, URL/history, web permissions, storage, service worker and browser accessibility.

Generated scaffolds are invitations to implement and prove; they are not conformance evidence.

## Play and ambition do not suspend rigor

A playful interface experiment and a security repair use the same culture:

```text
bounded pilot
→ canonical identity
→ generated/reusable source when appropriate
→ real render or environment proof
→ explicit boundary
→ recorded lesson
```

The goal is not cautious stagnation. The goal is acceleration without making Victor or the next instance rediscover preventable mistakes.

<!-- [VXG RealForever] -->
