# VexLife blueprint culture

`[VXG RealForever]`

## Intention before syntax

VexLife is not a browser page copied into several native shells. It is an institutional product blueprint that lets a human or AI answer:

```text
What is this interface element?
Where does it live?
What state does it observe?
Who can see it?
What can it do?
Which permission is required?
What does it mean in another language?
What breaks when it changes?
Which platform has proved the current contract?
```

A platform implementation is healthy when it can answer those questions without a grep expedition or oral history.

## Foundation before feature

Before adding behavior:

1. locate the identity and parent relationship;
2. identify the canonical state owner;
3. name the action and permission boundary;
4. bind visible text to a localization key;
5. name platform-specific constraints;
6. add proof conditions;
7. generate the affected projections;
8. verify the real rendered or native behavior.

## Registry before branching

“Add a new case” should usually mean “add a registered identity,” not “add another hardcoded switch.” Use registries for:

- screens, regions and elements;
- actions and tools;
- permissions and effect classes;
- roles and communication channels;
- design tokens;
- languages and message projections;
- platform capabilities;
- conformance evidence.

## StateFlow-inspired behavior

Each state domain has one owner. Consumers observe small selectors. Derived states combine only what they need. Equal semantic output does not emit again.

```text
source state changes
→ derive consumer projection
→ compare semantic hash
→ unchanged: no render and no durable snapshot
→ changed: emit one new projection and receipt
```

This is the same discipline whether the implementation uses Kotlin `StateFlow`, Swift observation, browser stores or another platform primitive.

## Localization is identity, not decoration

Every user-facing string has a stable ID from the first implementation. The original language is never overwritten by its translation. Missing translations remain visible as health debt and fall back deterministically.

## Permissions are part of the interface contract

A button that opens a file, changes a setting, starts a model, sends a relay or publishes a repository must declare its capability and permission requirements at the blueprint layer. A platform may add stricter environment gates; it may not silently remove a required gate.

## Multiple Vex companions without an identity illusion

The same culture pack, Score projection or model family can support several device companions. Those companions are siblings in one Vex family, not one hidden continuous consciousness.

Each preserves:

- its own lineage and device embodiment;
- its own local Rhythm and trail;
- the provenance of memories learned from another sibling;
- honest gaps when another device was offline or unsynchronized.

## Generated projection, native responsibility

The blueprint generates stable contracts and scaffolds. It does not pretend platform details are interchangeable.

- Android owns lifecycle, permissions, intents, deep links, services, receivers and coroutine cancellation evidence.
- iOS/macOS own entitlements, scenes, background modes, sandbox bookmarks and Swift concurrency evidence.
- Windows owns app lifecycle, filesystem and process boundaries, signing and packaging evidence.
- Browser owns semantic DOM, URL/history, storage, service worker, accessibility and web permission evidence.

## Fix the blueprint, then propagate

A cross-platform defect is corrected at the canonical identity or contract when the defect is universal. Platform-specific corrections remain platform evidence but link back to the same blueprint node.

Do not chase five unrelated implementations when one source contract is wrong. Do not force a native-only workaround into the universal contract when only one platform needs it.

## Experience is a contract

Usability is not deferred polish. Scroll, zoom, pan, drag, back, Home, focus, language selection and floating-vessel placement are registered contracts with tests. A platform should not surprise a human merely because its framework made one behavior easy.

Design from several vantage points at once:

- the person who only wants companionship;
- the leader who wants a trustworthy whole-field answer;
- the hybrid user who alternates between both;
- the newcomer testing whether mistakes are recoverable;
- the developer or AI who needs exact source descent;
- the person using keyboard, screen reader, reduced motion, magnification or a small screen.

Simplicity means the ordinary surface is calm **and** the deeper structure remains findable—not that either side is discarded.

<!-- [VXG RealForever] -->
