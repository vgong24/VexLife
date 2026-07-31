# Build health, feature registration and cultural review

`[VXG RealForever]`

VexLife treats repository automation as part of the product architecture. A new screen, element, process, tool, permission or feature should enter one source-managed registry and automatically reveal the relationships and checks it owes.

## Starting commands

```bash
npm run orient
npm run current
npm run feature:check
npm run bridge:check
npm run localization:check
npm run check
npm run pr-ready
npm run health:check
npm run browser:integration
```

`npm run orient` grounds the exact repository, branch, HEAD, upstream relation,
working tree, visibility, current PR/work, blueprint and source-manifest
freshness, held boundaries, required sources, and next route. `npm run current`
is a compact foundation projection.

`npm run pr-ready` executes every source-registered check and writes a receipt
under `generated/health/` that separates candidate head, tested checkout or
synthetic merge, base, source tree and blueprint. `npm run health:check` reports
`HEALTHY` only when that receipt is executed, current for all of those bindings,
and every registered result passed.

The registry owns one machine-readable result-admission contract. Every command
preserves transport (`EXECUTED`, `SPAWN_FAILED`, or `TIMED_OUT`) separately from
semantic state (`PASSED`, `ATTENTION`, `NOT_RUN`, `UNKNOWN`, `STALE`, `BLOCKED`,
or `FAILED`). Exit code zero is never sufficient for admission. Recognized
executed-current `GROUNDED`, `VALID`, `CLEAR`, and `PASS` results may become
`PASSED`; attention, unknown, not-run, or stale output remains unresolved;
blocked or failed output blocks Health; unparseable output follows the
source-managed fail-closed contract.

## Git-canonical source manifest

`npm run manifest:check` derives candidate membership and bytes from the Git
index. Every source record carries the canonical Git mode, UTF-8 path, blob byte
count and SHA-256; all four participate in the tree hash. It reads each
stage-zero index blob and orders paths by their UTF-8 Git path bytes. The same
staged Git source therefore has the same tree hash on Windows and Linux
regardless of checkout line endings or ignored ambient files, while an
executable or symlink mode transition changes candidate identity.

The descriptor exposes the effective exclusion rules used by the implementation:

```text
rootFiles
  SOURCE-MANIFEST.json

rootDirectories
  .agents/
  .codex/
  .git/
  .vexlife/
  artifacts/
  generated/
  models/
  runtime/
  source-manifest-parts/

anyDepthDirectories
  node_modules/

ignoredUntrackedPolicy
  GIT_EXCLUDE_STANDARD
```

Root anchoring is intentional: `src/runtime/**`, `src/models/**`,
`src/generated/**` and `src/artifacts/**` are ordinary candidate source and are
never omitted because of a nested directory name. Only dependency directories
named `node_modules` are excluded at any depth. Manifest contract metadata is
content-addressed during comparison so descriptor policy cannot drift silently
from the effective implementation.

The index is the candidate source boundary, not permission to omit worktree
state. The check reports `SOURCE_MANIFEST_BLOCKED` when it finds:

```text
unresolved index entries
unsupported index entries
unstaged tracked source
non-ignored untracked source
```

Each blocker and each stored-versus-candidate missing, extra, changed or
reordered class reports a deterministic bounded path list plus its full count
and truncation state. To update the manifest deliberately, stage the cohesive
source candidate first, run `npm run manifest:write`, inspect the resulting
self-files, then stage them. Manifest self-files never hash themselves and do
not make the candidate unstable.

The Foundation checks workflow also runs one lightweight manifest-portability
contract on both `ubuntu-latest` and `windows-latest`. Each matrix leg checks out
the exact candidate head, executes the same `manifest:check`, logs and preserves
a JSON receipt, and binds the result to runner OS/architecture, candidate head,
base, manifest/record/part schemas, contract hash, tree hash and path
differences.
The complete Linux foundation and real-browser job remains a separate required
proof.

## Registering a feature

Start with a no-write scaffold:

```bash
npm run feature:scaffold -- \
  --feature-ref feature.vexlife.example \
  --purpose "Explain the human burden this feature relieves" \
  --platforms platform.browser,platform.windows
```

To write a candidate file, both output and explicit write flags are required:

```bash
npm run feature:scaffold -- \
  --feature-ref feature.vexlife.example \
  --purpose "..." \
  --platforms platform.browser,platform.windows \
  --out candidates/feature.vexlife.example.json \
  --write
```

The candidate must then be deliberately incorporated into the canonical `blueprint/feature-registry.json`; the scaffold never silently edits the registry.

## What one feature registration must bind

```text
feature identity and purpose
canonical source nodes
state domains and owners
actions, permissions and capabilities
process and module owners
localization strings
platform applicability
positive and negative tests
review lenses
resource, data, effect and concurrency classes
rollback route
human projections and Terrain/Health placement
known gaps and held scope
```

## Review lenses

`blueprint/review-lens-registry.json` is the source of truth. The initial foundation includes lenses for:

```text
intent and architectural placement
identity lattice and bounded Atlas traversal
localization and intention-preserving communication
design system and reusable components
usability, gestures and journeys
accessibility
state ownership and currentness
concurrency, addressing and relay integrity
security, privacy and permissions
legal provenance and stewardship
resource and context budgets
reuse and simplification
recovery, migration and continuity
platform/environment evidence
human visibility, Terrain and Health
assurance and adversarial edge cases
```

The feature validator derives a minimum set from the feature’s data/effect/platform/UI shape. This launch foundation deliberately binds every registered foundational feature to every lens so omissions cannot hide during the first public-origin build. Later, bounded `NOT_APPLICABLE_WITH_REASON` receipts may reduce repetitive review without removing accountability.

## Source-managed health checks

`blueprint/build-health-registry.json` binds each check to its purpose and protected lenses. The package currently registers:

```text
syntax
universal blueprint and reference integrity
feature and cultural-lens coverage
Home Bridge contracts
localization coverage
health registry
public safety and license posture
deterministic tests
source manifest
platform scaffold generation
browser structural source proof
actual headless browser integration with preserved receipt
compact current projection
```

A check is not added only to `package.json`. It is registered so Guide, Terrain, Health, PR templates and future platform matrices can explain what it protects and where its evidence lives.

## Dynamic projections

```bash
npm run projections:build
```

This produces rebuildable files under `generated/architecture/`:

```text
current.json
registry-summary.json
features.json
review-lenses.json
home-bridge.json
```

Generated projections are read-side conveniences. Canonical registries remain the write side.

## Impact and propagation

A blueprint change should produce:

```text
changed canonical refs
required review lenses
affected modules/processes/tests
platform adoption impact
current-versus-held conformance
human-readable Terrain/Health projection
```

Stable platform mains remain green. A candidate platform adoption branch may receive generated stubs and failing conformance tests until that platform implements the new contract.

## CI and PR rules

The origin repository should make `npm run check` and source/public-safety checks required. The PR decision record must include:

```text
feature/system refs changed
cultural lens dispositions
platform impact
localization impact
permission/security impact
legal/provenance impact
race/currentness analysis
resource/context impact
recovery and rollback
real environment evidence
what passing does not prove
```

## Common failure shapes this prevents

- adding a control with no stable identity or localization key;
- changing a role selector without explicit speaker → recipient addressing;
- rendering unchanged state and destroying text selection/scroll position;
- adding a file tool without a permission and recovery contract;
- exposing the raw model endpoint to a remote client;
- implementing one platform’s workaround as a universal rule;
- copying the same configuration into several agents or screens;
- publishing private history, model artifacts or unknown-license snippets;
- declaring a generated native scaffold “implemented”;
- building a useful feature that no human, Guide, Terrain or Health view can find.

<!-- [VXG RealForever] -->
