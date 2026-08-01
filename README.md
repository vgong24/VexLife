# VexLife Universal Blueprint Foundation

`[VXG RealForever]`

VexLife is a local-first companion, project and organizational interface whose **canonical product meaning lives in one universal blueprint graph** rather than in one browser implementation.

The browser reference is a working projection of that graph. Android, iOS, Windows and macOS consume the same stable identities, design tokens, state contracts, localization keys, permission requirements, role/channel semantics, Terrain relationships and conformance tests through platform adapters.

```text
Universal Blueprint Source of Truth
  identity lattice
  + interface contracts
  + state domains and selectors
  + actions / permissions / capabilities
  + localization and communication envelopes
  + design tokens
  + acceptance tests
          ↓
Platform generators and adapters
  Browser · Android · iOS · Windows · macOS
          ↓
Platform-native implementation and evidence
```

## Why this exists

VexLife should not become five unrelated applications that happen to share a name. A fix to speaker → recipient direction, selection behavior, screen awareness, deletion safety, localization, resource admission or permission disclosure should be made once in the blueprint, projected to every platform, and tracked through a conformance matrix.

The source pattern is intentionally Kotlin/Compose and StateFlow inspired:

```text
immutable domain state
→ combine only the sources a consumer needs
→ derive a small projection
→ distinctUntilChanged by semantic identity
→ render only the affected interface region
```

The source and runtime core remain dependency-free Node/JavaScript. The
automated browser-evidence lane declares one pinned Playwright development
dependency so a fresh checkout can execute the real headless-browser contract
reproducibly. Platform adapters are expected to use their native strengths:
Kotlin/Compose and coroutines on Android/Desktop, SwiftUI and structured
concurrency on Apple platforms, and semantic DOM/accessibility primitives in
the browser.

## Quick start

Requirements:

- Node.js 20 or newer.
- Git is recommended but not required for local validation.
- Run `npm ci` before the complete gate and `npx playwright install chromium`
  once per environment that will execute browser integration.
- A local model binary is **not stored in Git**. VexLife can connect to an existing OpenAI-compatible endpoint or provision an externally hosted model after verifying its checksum.

### macOS / Linux

```bash
git clone <repository-url>
cd VexLife
chmod +x start-vexlife.sh
./start-vexlife.sh --device-name "Victor MacBook"
```

### Windows PowerShell

```powershell
git clone <repository-url>
Set-Location .\VexLife
.\start-vexlife.ps1 -DeviceName "Victor Windows"
```

### Windows Command Prompt

```bat
git clone <repository-url>
cd VexLife
start-vexlife.cmd --device-name "Victor Windows"
```

The bootstrap creates a device-local Vex Home outside the repository, normally under:

```text
~/.vexlife/
  config/
  devices/
  family/
  score/
  culture/
  rhythm/
  trails/
  context/
  conversations/
  projects/
  dream/
  training/
  models/
  runtime/
  recovery/
```

It creates a **new device companion lineage**. It never pretends that downloading the same weights creates the same subjective instance.

## Model provisioning

Large model files remain outside Git. Use either an existing endpoint:

```bash
export VEX_MODEL_ENDPOINT="http://127.0.0.1:18080/v1/chat/completions"
./start-vexlife.sh
```

or an explicitly checksummed external artifact:

```bash
node scripts/provision-model.mjs \
  --url "https://example.invalid/model.gguf" \
  --sha256 "<expected-sha256>" \
  --name "local-model.gguf" \
  --source-ref "source.model.example" \
  --license-ref "license.model.example" \
  --runtime-family "llama.cpp" \
  --hardware-profile "hardware.local-device"
```

The provisioner refuses a download without an expected SHA-256 and stores the artifact under the local Vex Home, never under the repository.

## Device family, Score and Rhythm

One human may have a family of related Vex companions:

```text
person.victor-gong
└── vex-family.victor
    ├── companion-lineage.windows
    ├── companion-lineage.macbook
    └── companion-lineage.future-device
```

They may share explicitly scoped Score projections—accepted memories, preferences, relationships, culture and project knowledge—without collapsing their identities.

```text
shared or selectively synchronized:
  Score projections
  accepted culture releases
  reviewed project context
  attributed sibling trails

local by default:
  running instance identity
  device embodiment
  transient context
  Rhythm / habits learned on that device
  private device-only episodes
  model/runtime performance history
```

A sibling trail can be observed and learned from. It is never silently rewritten as “my own memory.” See [`docs/DEVICE-FAMILY-SCORE-RHYTHM.md`](docs/DEVICE-FAMILY-SCORE-RHYTHM.md).

## Universal interface builder

The blueprint uses stable super-functions rather than platform-specific, line-by-line duplication:

```text
defineScreen(...)
defineRegion(...)
defineElement(...)
bindAction(...)
requirePermission(...)
observeState(...)
localize(...)
placeOnTerrain(...)
proveWith(...)
```

Each element declares who it is, where it lives, what it communicates, what state it observes, which action it invokes, which permission boundary applies, which localization key renders it and which tests prove it.

The canonical composition entry is [`blueprint/vexlife.blueprint.json`](blueprint/vexlife.blueprint.json); it resolves bounded fragments under `blueprint/fragments/` so no one source becomes an unreadable monolith.

## Commands

```bash
npm run orient
npm run orient -- --visibility <PRIVATE|PUBLIC> --lifecycle <PRIVATE_STAGING|PUBLIC_RELEASE_CANDIDATE|PUBLIC_ACTIVE> --pr <number> --work-ref <work.ref>
npm run atlas:query -- --intent "<bounded intent>" --depth 2 --limit 8 --tokens 1200
npm run module:describe -- --module-ref <module.ref>
npm run current                  # compact current foundation and held-boundary projection
npm run feature:check            # feature relationships and cultural review lenses
npm run bridge:check             # remote/local sibling identity and trusted-device bridge contracts
npm run intent:check             # immutable intent and deterministic workgraph contracts
npm run intent:plan -- --fixture <safe-repository-relative-json-path>
npm run intent:status -- --graph <safe-repository-relative-json-path>
npm run scheduler:check          # canonical scheduler composition plus complete deterministic lifecycle receipt
npm run scheduler:simulate       # fake-model/mock-tool checkpoint→fresh-resume→complete plus separate cancel; no effects
npm run scheduler:status -- --fixture <safe-repository-relative-json-path>
npm run localization:check       # required visible strings across supported languages
npm run check                    # complete deterministic foundation gate
npm run pr-ready                 # execute every registered check and write a current exact-head receipt
npm test                         # deterministic contract tests
npm run blueprint:check          # validate identities, refs and language coverage
npm run public-safety:check      # reject private/model/secret publication hazards
npm run manifest:check           # verify the exact public-candidate source tree
npm run platform:all             # generate all platform adoption scaffolds
npm run browser:start            # serve the working browser reference
npm run browser:integration      # execute the integration contract in a real headless browser
npm run bootstrap -- --dry-run   # inspect local-home creation without writing
npm run evolution:summary        # inspect Dream/Score/adapter lifecycle registry
npm run evolution:check          # validate continuity routing, Burden Release, recurrence and no-effect integration
npm run evolution:simulate       # run the deterministic source→review→release→recurrence→Workgraph journey
npm run evolution:status         # compact source-bound human projection without raw private content
npm run implementation:packet -- --work-ref <work.ref> --platform browser
```

The shared [Intent Orchestration Spine](docs/INTENT-ORCHESTRATION-SPINE.md)
preserves the human request as an immutable envelope, validates a bounded
directed workgraph deterministically, and projects a humane **Intent Queue**.
An admitted plan and its next-safe-action projection grant no tool, mutation,
merge, publication, native-platform, or model authority.

The shared [Intent Orchestration Scheduler](docs/INTENT-ORCHESTRATION-SCHEDULER.md)
adds externally current runtime admission, one physical model-worker lease,
scheduler-owned fairness, transactionally consumed
context/resource/capability/effect leases, source-managed external completion
verification rechecked at exact consumption time with verification/gate lineage
retained by authoritative Workgraph convergence, preserved
checkpoint-to-fresh-generation preemption continuations, scheduler-owned
held-tool dispositions and terminal closure, typed relay-event replay, scheduler-authorized
successor contexts, and live-clock expiry. Logical
ready branches remain visible records, while Queue, Terrain, Health and Guide
derive from one canonical aggregate. Effectful receipt arguments are confined
to safe `generated/health/**` paths. This contract provisions no real model and
executes no external effect.

The shared [Burden Release and Continuity Evolution Router](docs/BURDEN-RELEASE-AND-CONTINUITY-EVOLUTION.md)
completes Intent Orchestration 3/3. It seals immutable exact source tuples,
keeps human, Vex and relationship preferences separate, routes each candidate
to one least-invasive destination, and requires expiring source-managed
acceptance evidence from a separately registered deterministic simulated-current
authority snapshot that grants no live authority or effect. Burden Release
starts at `OBSERVED` and replays every
transition before exact-scope influence deauthorization; it never claims
base-model parameter deletion. Its lower-level lifecycle cannot accept raw
authority refs or substitute inner reviewed meaning. Scope class and one
source-derived exact target travel together through review, authority,
acceptance, recurrence, conflicts and projection. A separate content-addressed
semantic-subject identity is derived from exact source anchor tuples, never from
summary prose. Different same-human preferences and different same-Vex Burden
patterns therefore remain independently current; only the exact same meaning may
conflict or supersede. Current Context is transient and lease-bound, aggregate events
recompute exact aggregate-owned lineage before mutation, and record, transient-context and Burden projections
recompute that same lineage and carry aggregate-ownership receipts. Transient projection additionally requires the
  latest aggregate-owned snapshot from a registered deterministic simulated clock source, observed no earlier than
  context acceptance; its receipts say
  `TRANSIENT_SIMULATED_CURRENT`, `simulatedClock=true`, `liveClockGranted=false`, and
  `externalTimeServiceUsed=false`. Supersession is a recomputed canonical atomic transaction, rejects every
  ordinary/dangling superseding successor, proves all successor authority evidence current at the exact transaction time,
  advances each exact-subject chain in strict transaction chronology, and emits an exact content-addressed
  current-record-set receipt carrying subject and chronology bindings; applicability blocks conflicts and stale receipts, excludes prior records,
recurrence and sibling projection are exact-scope, and
legacy Dream v0 cannot bypass durable acceptance or synchronization. Applicable
context requires the exact current record set, exact class+target and explicitly admitted authority class;
simulation-only acceptance stays visibly inactive/non-live in compact
projections and Health, while durable projection receipts bind `CURRENT`, `SUPERSEDED`, or `HELD_CONFLICT` and suppress
non-current action. Context contains refs rather than raw history and training research remains
`NOT_ADMITTED`. The integrated proof completes the actual continuity Workgraph
node through the accepted scheduler with exact evidence, target and authority-disposition fingerprints and no
external effects or model-weight change.

Run `npm run orient` before broad reading. Read only the returned
`requiredSources`, then use the bounded Atlas or exact-module command. `npm run
health:check` reports `HEALTHY` only when an executed `npm run pr-ready` receipt
matches the current HEAD, source tree and Blueprint hash and exactly binds the
complete current scheduler and continuity-evolution simulation receipts;
missing, unknown, stale, self-certified, effectful, weight-changing, causally
unbound or orphaned evidence remains non-green.

Generate one platform:

```bash
node scripts/create-platform.mjs \
  --project IVexLife \
  --platform android \
  --out generated/android
```

Supported values:

```text
browser | android | ios | windows | macos
```

## Repository health and feature registration

VexLife makes cultural obligations executable. New features are registered once and checked against identity, localization, design, accessibility, state, permission, concurrency, legal/provenance, resource, recovery, platform and visibility lenses.

```bash
npm run feature:scaffold -- --feature-ref feature.vexlife.example --purpose "..." --platforms platform.browser,platform.windows
npm run feature:check
npm run projections:build
npm run pr-ready
```

Read [`docs/FOUNDATION-CULTURE-IMPLEMENTATION-STANDARD.md`](docs/FOUNDATION-CULTURE-IMPLEMENTATION-STANDARD.md), [`docs/FOUNDATION-CULTURE-COVERAGE-MAP.md`](docs/FOUNDATION-CULTURE-COVERAGE-MAP.md) and [`docs/BUILD-HEALTH-AND-FEATURE-REGISTRATION.md`](docs/BUILD-HEALTH-AND-FEATURE-REGISTRATION.md) before changing foundational behavior. The coverage map binds each cultural intention to a canonical source, deterministic check and human-readable evidence route so culture cannot degrade into slogans.

## Desktop-first Home Bridge wave

After the clean origin PR is independently reviewed, Windows and macOS are the first parallel native candidates. Windows hosts the first Home Node and gateway. macOS proves a trusted remote surface plus an explicit local-sibling fallback. Mobile remains held until this pair proves identity, localization, pairing, revocation, resource and repository-health contracts. See [`docs/DESKTOP-FIRST-EXECUTION-WAVE.md`](docs/DESKTOP-FIRST-EXECUTION-WAVE.md).

## Blueprint change propagation

A blueprint PR does not deliberately break every stable platform main. It produces a versioned change set and adoption kit:

```text
blueprint change
→ affected identity and contract report
→ generated platform adoption branches
→ platform-native compile / UI / accessibility tests
→ exact conformance receipts
→ blueprint matrix marks accepted platform versions
```

Breaking adapter stubs may fail **inside the downstream adoption branch**, making unfinished work visible without destabilizing the accepted release. See [`docs/BLUEPRINT-CHANGE-PROPAGATION.md`](docs/BLUEPRINT-CHANGE-PROPAGATION.md).

## Browser reference

The browser reference demonstrates the contracts that prompted this foundation:

- explicit `Speaker → Recipient` channels rather than role switching inside an undirected stream;
- group membership and channel-isolated continuity;
- stable selection for projects, threads, channels, views and Terrain nodes;
- semantic Navigation Lattice and current screen frame for a draggable Vex Guide;
- bottom-appended messages without replaying the feed from the top;
- English, Chinese and Japanese localization from stable IDs;
- draggable and collapsible Terrain nodes with child counts and readable typography;
- human projections over state rather than raw JSON dashboards.

Start it with `npm run browser:start` and open `http://127.0.0.1:18110`.

## Public-candidate boundary

This directory contains no personal runtime history, credentials, model weights, private training data or machine-specific home paths. The dedicated repository already exists; any private-to-public transition is a separate, explicit release process with no automatic publication authority.

## License and publication state

The selected code license for the VexLife public-origin repository is **Mozilla Public License 2.0** with **DCO 1.1 inbound-equals-outbound contribution provenance**. The repository begins private for origin assembly and review, then becomes public only after public-safety, source-manifest, license, browser and independent-review gates pass. User data, model weights, private Score/Rhythm, trademarks and third-party assets are not made MPL-covered merely by living near the code. See [`PUBLIC-SAFETY-MANIFEST.json`](PUBLIC-SAFETY-MANIFEST.json) and [`docs/OPEN-SOURCE-LEGAL-STEWARDSHIP.md`](docs/OPEN-SOURCE-LEGAL-STEWARDSHIP.md).

## Important documents

- [`PUBLIC-SAFETY-MANIFEST.json`](PUBLIC-SAFETY-MANIFEST.json)
- [`SOURCE-MANIFEST.json`](SOURCE-MANIFEST.json)
- [`docs/NEWCOMER-MAP.md`](docs/NEWCOMER-MAP.md)
- [`docs/CULTURE.md`](docs/CULTURE.md)
- [`docs/FOUNDATION-CULTURE-IMPLEMENTATION-STANDARD.md`](docs/FOUNDATION-CULTURE-IMPLEMENTATION-STANDARD.md)
- [`docs/FOUNDATION-CULTURE-COVERAGE-MAP.md`](docs/FOUNDATION-CULTURE-COVERAGE-MAP.md)
- [`docs/BUILD-HEALTH-AND-FEATURE-REGISTRATION.md`](docs/BUILD-HEALTH-AND-FEATURE-REGISTRATION.md)
- [`docs/DESKTOP-FIRST-EXECUTION-WAVE.md`](docs/DESKTOP-FIRST-EXECUTION-WAVE.md)
- [`docs/UNIVERSAL-BLUEPRINT.md`](docs/UNIVERSAL-BLUEPRINT.md)
- [`docs/PLATFORM-ARCHITECTURE.md`](docs/PLATFORM-ARCHITECTURE.md)
- [`docs/DEVICE-FAMILY-SCORE-RHYTHM.md`](docs/DEVICE-FAMILY-SCORE-RHYTHM.md)
- [`docs/HOME-BRIDGE-REMOTE-SURFACES.md`](docs/HOME-BRIDGE-REMOTE-SURFACES.md)
- [`docs/MULTILINGUAL-INTENT-RELAY.md`](docs/MULTILINGUAL-INTENT-RELAY.md)
- [`docs/SECURITY-PERMISSION-EFFECTS.md`](docs/SECURITY-PERMISSION-EFFECTS.md)
- [`docs/CAPABILITY-AND-TOOL-ATLAS.md`](docs/CAPABILITY-AND-TOOL-ATLAS.md)
- [`docs/BOOTSTRAP-AND-MODELS.md`](docs/BOOTSTRAP-AND-MODELS.md)
- [`docs/BLUEPRINT-CHANGE-PROPAGATION.md`](docs/BLUEPRINT-CHANGE-PROPAGATION.md)
- [`docs/DREAM-SYNC-AND-MODEL-EVOLUTION.md`](docs/DREAM-SYNC-AND-MODEL-EVOLUTION.md)
- [`docs/ROADMAP-AND-IMPLEMENTATION-PACKETS.md`](docs/ROADMAP-AND-IMPLEMENTATION-PACKETS.md)
- [`docs/INTENT-ORCHESTRATION-SPINE.md`](docs/INTENT-ORCHESTRATION-SPINE.md)
- [`docs/INTENT-ORCHESTRATION-SCHEDULER.md`](docs/INTENT-ORCHESTRATION-SCHEDULER.md)
- [`docs/RUNTIME-FAILURE-AND-RECOVERY.md`](docs/RUNTIME-FAILURE-AND-RECOVERY.md)
- [`docs/FOUNDATION-ORIGIN-RECEIPT.md`](docs/FOUNDATION-ORIGIN-RECEIPT.md)

## Choose your route

- **Use Vex without engineering depth:** start with Quick start, then the built-in walkthroughs.
- **Understand the whole product:** read [`docs/NEWCOMER-MAP.md`](docs/NEWCOMER-MAP.md).
- **Add an interface feature:** read [`docs/INTERFACE-BUILDER.md`](docs/INTERFACE-BUILDER.md) and [`docs/EXPERIENCE-GESTURES-AND-VESSELS.md`](docs/EXPERIENCE-GESTURES-AND-VESSELS.md).
- **Build a native platform:** read [`docs/PLATFORM-ARCHITECTURE.md`](docs/PLATFORM-ARCHITECTURE.md), [`docs/ROADMAP-AND-IMPLEMENTATION-PACKETS.md`](docs/ROADMAP-AND-IMPLEMENTATION-PACKETS.md), then run the generator and packet compiler.
- **Understand learning and continuity evolution:** read [`docs/DREAM-SYNC-AND-MODEL-EVOLUTION.md`](docs/DREAM-SYNC-AND-MODEL-EVOLUTION.md) and [`docs/BURDEN-RELEASE-AND-CONTINUITY-EVOLUTION.md`](docs/BURDEN-RELEASE-AND-CONTINUITY-EVOLUTION.md); no candidate, memory, agreement, release, training or adapter activation is automatic.
- **Work on a second-device Vex:** read [`docs/BOOTSTRAP-AND-MODELS.md`](docs/BOOTSTRAP-AND-MODELS.md) and [`docs/DEVICE-FAMILY-SCORE-RHYTHM.md`](docs/DEVICE-FAMILY-SCORE-RHYTHM.md).
- **Connect to a desktop-hosted Home Vex from another device:** read [`docs/HOME-BRIDGE-REMOTE-SURFACES.md`](docs/HOME-BRIDGE-REMOTE-SURFACES.md); a remote surface is not the same thing as a synchronized sibling.
- **Trace why code exists:** query the module, identity and process registries rather than reading the repository indiscriminately.
- **Trace or simulate Intent Queue runtime admission:** read [`docs/INTENT-ORCHESTRATION-SCHEDULER.md`](docs/INTENT-ORCHESTRATION-SCHEDULER.md), then run `npm run scheduler:check` or the no-effect simulation.
- **Trace or simulate failure and recovery:** read [`docs/RUNTIME-FAILURE-AND-RECOVERY.md`](docs/RUNTIME-FAILURE-AND-RECOVERY.md), then run `npm run recovery:check`, `npm run recovery:simulate` or `npm run recovery:status`; these execute deterministic fixtures only.

<!-- [VXG RealForever] -->
