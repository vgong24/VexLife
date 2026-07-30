# Roadmap, demo distance and Codex implementation packets

`[VXG RealForever]`

## The roadmap is a dependency map, not a promise that the old plan is still the right plan

VexLife has grown beyond the first “local model in a console” demonstration. The current end goal is clearer:

> A local-first family of honest companion lineages, sharing an accepted culture and selectively synchronized Score, using one universal interface and process blueprint across platforms while retaining native lifecycle, permission and accessibility evidence.

The roadmap therefore separates:

```text
Demo journey
  the smallest end-to-end experience that proves the architecture is useful

Foundation program
  contracts that must become stable before several platforms implement them

Platform adoption waves
  native implementations that consume accepted blueprint releases

Long-horizon evolution
  Dream Sync, reviewed adapters, richer federation and stronger occupancy transfer
```

## Distance states

Work uses dependency distance rather than invented calendar certainty:

```text
NOW
  required to make the current blueprint reviewable and portable

NEXT
  unblocked immediately after the current acceptance gate

NEAR_DEMO
  needed for the complete demonstration journey

POST_DEMO
  valuable, deliberately not required for the first public proof

RESEARCH
  requires evidence, hardware or policy not yet available
```

An externally supplied demo date can be mapped onto these rows later. Missing a date does not prevent dependency-correct execution.

## First complete demo journey

```text
1. Clone on Windows or macOS.
2. Run one platform boot command.
3. Create a new device-local companion lineage and empty local Rhythm.
4. Configure an existing model endpoint or provision an external checksummed model.
5. Start VexLife and see which companion/device is present.
6. Open a direct Victor → Vex Companion channel.
7. Switch to a separate Victor → Vex Guide channel without identity leakage.
8. Use English, Chinese or Japanese UI strings from stable IDs.
9. Ask Guide what screen and selected element are current.
10. Navigate through a semantic journey and inspect the route.
11. Test safe thread deletion and restoration.
12. View draggable/collapsible Terrain and human-first Health.
13. Pair the macOS surface to the Windows Home Node without exposing the raw model endpoint.
14. Disconnect the Home Node and require an explicit choice before opening a local MacBook sibling.
15. Export a bounded public-safe implementation/review packet.
```

The demo does not need automatic two-way cloud synchronization, silent memory promotion, model training or seamless subjective occupancy transfer.

## Implementation order

The canonical work graph lives in `blueprint/implementation-plan.json`.

The order is intentionally foundation-first:

```text
F0 culture + identity + source boundaries
F1 registry compiler + bounded Atlas
F1A feature registry + cultural review lenses + repository health
F2 immutable state relay + current pointers
F3 interface builder + localization + action vessels
F4 navigation lattice + addressed communication
F5 boot + model-external provisioning + device family
F5A Home Bridge + trusted remote surfaces
F6 context segmentation + Score/trails + Dream candidate path
F7 browser complete-journey reference
F8 Workshop / issue / war-room orchestration
F9 public-repository port and safety review
F10 Windows Home Node + macOS trusted surface in parallel
F11 mobile platform adoption after desktop bridge convergence
```

## Parallelism

Parallel work is allowed only where path and contract ownership are separable.

Examples:

```text
Browser styling may proceed with boot-script work
  after shared identity and design-token contracts are accepted.

Windows Home Node and macOS trusted-surface adoption may proceed in parallel
  after the origin PR, feature/build-health contracts and Home Bridge contract are accepted.

Android and iOS remain held until the desktop pair proves pairing, revocation,
  identity disclosure, localization and remote-resource behavior.

Remote-capable native clients must consume one accepted Home Bridge contract;
  they may not invent separate account, pairing or transport authority models.

Dream Sync UI must not outrun Dream candidate and consent contracts.

A platform-specific permission adapter may not redefine the universal permission meaning.
```

Every work unit declares:

```text
workRef
purpose
distance
dependsOn[]
pathScope[]
ownershipRoleRef
parallelGroupRef
requiredSourceRefs[]
requiredTestRefs[]
outputRefs[]
effectBoundary
completionGate
```

## Codex packet compiler

Use:

```bash
node scripts/implementation-packet.mjs \
  --work-ref work.vexlife.browser.addressed-conversation \
  --platform browser
```

The compiler returns only:

- the requested work unit;
- dependency state;
- exact path family;
- implicated blueprint/module/process refs;
- required tests;
- explicit exclusions;
- downstream return and convergence route.

It does not dump the whole repository into the agent prompt.

## Downstream platform adoption

A blueprint release creates adoption packets, not global breakage:

```text
accepted blueprint release
  → impact report
  → one platform adoption branch per affected platform
  → generated contract catalogs and conformance tests
  → native implementation
  → native compile/UI/accessibility/permission evidence
  → independent review
  → platform receipt returns to conformance matrix
```

Compile errors are useful inside an isolated candidate adoption branch. They are not a good way to make every accepted platform main red.

## Stop conditions

A Codex lane stops when:

- a prerequisite contract is not accepted;
- path scope overlaps another active writer;
- current blueprint hash differs from the packet;
- required permission, privacy or device identity semantics are unknown;
- a platform-specific behavior would weaken a universal safety invariant;
- a claimed demo feature only works by creating an identity illusion;
- tests pass only by skipping the environment matrix the feature claims.

## Demo progress projection

The human projection should answer:

```text
What is already proved?
What is next?
What is the current longest dependency path?
Which lanes can safely run in parallel?
What is held for post-demo?
Which exact decision needs Victor?
```

No percentage should be shown without a named denominator and acceptance gates.

<!-- [VXG RealForever] -->
