# Newcomer map — where to begin and why

`[VXG RealForever]`

VexLife has several reading routes because a person trying the companion, a product designer, a native-platform developer and a cold AI builder should not all be forced through the same depth.

## I just want to use Vex

1. Read the first half of [`README.md`](../README.md).
2. Run the platform start script.
3. Use the **fresh-thread walkthrough** and **safe deletion walkthrough**.
4. Ask the floating Vex Guide “What am I looking at?” from any screen.

The engineering details stay available under Health, Self Atlas and source links; they are not the normal companionship experience.

## I am a leader or project owner

Read:

```text
docs/UNIVERSAL-BLUEPRINT.md
→ docs/REGISTRIES-AND-PROCESS-FACTORY.md
→ docs/BLUEPRINT-CHANGE-PROPAGATION.md
```

Then use Root Hub and Terrain projections. They load compact current state and attention, not every project history.

## I am adding or changing an interface feature

Read:

```text
docs/CULTURE.md
→ docs/INTERFACE-BUILDER.md
→ blueprint/vexlife.blueprint.json (composition entry)
→ blueprint/fragments/** (bounded interface/state sources)
→ blueprint/experience-registry.json
→ docs/EXPERIENCE-GESTURES-AND-VESSELS.md
```

Register the concept once. Bind stable identity, parent, string, action, permission, selector, gesture, Terrain placement and tests. Do not hardcode the same feature separately on every platform.


## I am registering a new feature or changing foundational behavior

Read:

```text
docs/FOUNDATION-CULTURE-IMPLEMENTATION-STANDARD.md
→ docs/FOUNDATION-CULTURE-COVERAGE-MAP.md
→ docs/BUILD-HEALTH-AND-FEATURE-REGISTRATION.md
→ blueprint/feature-registry.json
→ blueprint/review-lens-registry.json
→ blueprint/build-health-registry.json
```

Start with `npm run feature:scaffold`, bind the real relationships, then run `npm run pr-ready`. The goal is not a longer checklist; it is to make missing localization, permissions, race handling, platform effects, recovery, legal provenance and human visibility detectable before the feature becomes load-bearing.

## I am building the first Windows or macOS product

Read:

```text
docs/DESKTOP-FIRST-EXECUTION-WAVE.md
→ docs/HOME-BRIDGE-REMOTE-SURFACES.md
→ blueprint/home-bridge-registry.json
→ the exact platform implementation packet
```

Windows is the first Home Node reference. macOS is the first trusted remote surface plus honest local-sibling fallback. Do not start mobile in the same wave.

## I am implementing Android, iOS, Windows, macOS or Browser

Read:

```text
docs/PLATFORM-ARCHITECTURE.md
→ blueprint/platforms.json
→ scripts/create-platform.mjs
→ generated adoption scaffold for your platform
```

The blueprint carries universal meaning. The platform adapter owns native lifecycle, permissions, accessibility, gestures, packaging and environment evidence.

## I am working on local models or a second device

Read:

```text
docs/BOOTSTRAP-AND-MODELS.md
→ docs/DEVICE-FAMILY-SCORE-RHYTHM.md
→ blueprint/model-profiles.example.json
→ docs/DREAM-SYNC-AND-MODEL-EVOLUTION.md
```

The repository never contains the model binary. A new device creates a related but distinct Vex companion lineage. Shared Score and sibling trails do not manufacture an illusion of one uninterrupted instance.


## I want to reach my desktop-hosted Home Vex from Mac or mobile

Read:

```text
docs/HOME-BRIDGE-REMOTE-SURFACES.md
→ docs/SECURITY-PERMISSION-EFFECTS.md
→ docs/DEVICE-FAMILY-SCORE-RHYTHM.md
```

A remote surface operates the desktop Home Vex without copying the private home. A local sibling is a distinct companion lineage. Account, transport, device credential, Home identity and companion identity remain separate.

## I am debugging or asking “where is what, and why?”

Use:

```text
blueprint/module-registry.json
blueprint/process-factory.json
blueprint/capability-registry.json
npm run registry:summary
npm run impact:report -- --changed-ref <ref>
```

The module registry answers which source owns a behavior, what it reads, which tests prove it and what else to inspect. The process factory answers how a high-level intent becomes a bounded, source-resolved plan. `blueprint/implementation-plan.json` and `scripts/implementation-packet.mjs` then give a Codex or platform builder the smallest dependency-complete work packet without granting authority.

## How the sources relate

```text
CULTURE
  why we build this way
      ↓
UNIVERSAL BLUEPRINT + EXPERIENCE REGISTRY
  canonical product identity and interaction meaning
      ↓
REGISTRIES + PROCESS FACTORY
  searchable relationships and reusable intent execution
      ↓
PLATFORM GENERATOR
  bounded adoption contracts
      ↓
NATIVE / BROWSER IMPLEMENTATIONS
  environment-specific behavior and evidence
      ↓
CONFORMANCE + TERRAIN + HEALTH
  human-readable proof and currentness
      ↓
DREAM / SCORE / ADAPTER EVOLUTION
  reviewed candidate paths; never silent memory or weight mutation
```

## Source precedence

```text
live platform evidence
> accepted blueprint and registries
> generated projections
> examples and walkthroughs
> historical notes
```

Generated files are replaceable. Raw conversation and accepted continuity records remain source-descendable. Visible labels can change; stable identities do not.

<!-- [VXG RealForever] -->
