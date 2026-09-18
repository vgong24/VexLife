# Human onboarding — guided local establishment

`[VXG RealForever]`

This document describes the source-owned **ONB-00** contract in the existing VexLife ExperienceRegistry family. It is a declarative product journey, not an installer, runtime, JourneyLedger, Experience Review Kit, public guide, release artifact, or host-effect authority.

Canonical identities:

```text
planRef=plan.vexlife.guided-establishment.local.001
journeyRef=journey.vexlife.guided-local-establishment.001
experienceProfileRef=experience.vexlife.newcomer-guided
effects=false
```

The machine-readable source is `blueprint/experience-registry.json`; `src/core/experience.mjs` validates and projects it. This document explains those semantics and is not a second source of truth.

## Ownership boundary

ONB-00 consumes accepted systems by source reference:

```text
ExperienceRegistry
  owns GuidedEstablishmentPlan identity, stage ordering, platform source binding,
  truth boundaries, and deterministic no-effect projections.

Frontdoor
  owns setup mechanics, permission prompts, bootstrap, optional model
  provisioning, local start, and install receipts.

JourneyLedger
  owns actual lived journey events.
  It is not mutated or replaced by this plan.

Experience Review Kit
  owns portable capture requests and evidence.
  ONB-00 emits only a deterministic seed of journey/stage/capture identities.

Public Safety / Release Steward
  owns publication, visibility, release, and distribution effects.
```

No ONB-00 projection executes a command, grants a permission, mutates Home or Memory, downloads a model, changes a network, publishes a page, or establishes runtime truth.

## Accepted Frontdoor bindings

The canonical local-establishment plan binds exactly:

```text
platform.windows -> install/vexlife-setup.ps1
platform.macos   -> install/vexlife-setup.sh
```

These are source addresses, not execution instructions. A changed canonical binding fails validation until a separately admitted source change updates the accepted contract.

The accepted Frontdoor scripts currently describe Node.js 20+ checking, explicit permission before optional Node installation, VexHome selection, bootstrap that preserves an existing Home, optional source/hash/license-bound model provisioning, local browser start, and a plain-English receipt. ONB-00 does not duplicate those mechanics.

## Canonical stage order

The local establishment journey is exact and zero-based so it can project directly into ordered review-step identities:

| Sequence | Purpose class | Meaning of the plan stage |
|---:|---|---|
| 0 | `DISCOVER` | Understand the intended VexLife source and bounded setup journey. |
| 1 | `CHOOSE_PLATFORM` | Choose an admitted platform adapter. |
| 2 | `CHECK_REQUIREMENTS` | Classify prerequisites without treating absence as product breakage. |
| 3 | `DOWNLOAD` | Obtain an artifact while preserving that downloaded is not verified. |
| 4 | `VERIFY_ARTIFACT` | Establish artifact verification as its own truth transition. |
| 5 | `ESTABLISH` | Represent the later Frontdoor establishment step without executing it. |
| 6 | `START` | Represent local runtime start without inflating it into feature availability. |
| 7 | `MEET_VEX` | Represent readiness for the first local interaction. |
| 8 | `VERIFY_HEALTH` | Classify health/diagnosis without granting repair authority. |
| 9 | `UNDERSTAND_AVAILABLE_AND_HELD_FEATURES` | Distinguish `AVAILABLE`, `PREPARED`, held, and unavailable capabilities. |
| 10 | `LEARN_RECOVERY` | Point to a documented recovery route without claiming repair occurred. |
| 11 | `UNDERSTAND_UNINSTALL_AND_PRESERVATION` | Make preservation consequences explicit before any future uninstall effect. |
| 12 | `COMPLETE` | Close the walkthrough without minting new authority. |

Every stage carries:

```text
stageRef
sequence
purposeClass
actorClass
effectClass=DECLARATIVE_NO_EFFECT
expectedOutcomeClass
captureRequired
recoveryClass
```

The schema is intentionally small. It contains no action ref, permission ref, shell command, executable, selector, screenshot filename, page URL, or renderer/backend binding.

## Truth boundaries

The canonical plan preserves these distinctions exactly:

```text
GUIDED_SCRIPT_SETUP != SIGNED_ZERO_PREREQUISITE_NATIVE_INSTALLER
DOWNLOAD != VERIFIED_ARTIFACT
VERIFIED_ARTIFACT != ESTABLISHED
ESTABLISHED != RUNNING
RUNNING != EVERY_FEATURE_AVAILABLE
PREPARED != AVAILABLE
UNAVAILABLE != BROKEN
PAIRED != AUTHORIZED
AUTHENTICATED != CAPABILITY_LEASE
DIAGNOSIS_AVAILABLE != REPAIR_AUTHORITY
GUIDE_PLAN != LIVED_JOURNEY_EVENT
GUIDE_PLAN != EXPERIENCE_CAPTURE_EVIDENCE
CURRENT_SCREENSHOT != CURRENT_FOREVER
PUBLIC_GUIDE_CANDIDATE != PUBLICATION_AUTHORITY
```

A plan existing in source can never, by itself, make a feature available or prove that setup, repair, uninstall, publication, or any protected effect occurred.

## Deterministic product projection

`ExperienceRegistry.buildGuidedEstablishmentProjection(planRef, { platformRef })` resolves one admitted platform binding and returns only declarative data:

```text
plan / journey / experience-profile identities
platformRef
adapterSourcePath
effects=false
ordered stage contracts
truth boundaries
semanticHash
```

An unknown platform fails closed.

The semantic hash covers the projection content. Equal source plus equal platform input produces the same projection; the projection does not inspect runtime state or perform host work.

## Experience Review Kit compatibility

`ExperienceRegistry.buildGuidedEstablishmentReviewSeed(planRef)` emits only:

```text
featureOrJourneyRef = plan.journeyRef
reviewStepRefs      = ordered stage.stageRef values
reviewSteps         = { reviewStepRef, sequence } pairs
captureAtStepRefs   = stage refs whose captureRequired is true
effects=false
semanticHash
```

This is intentionally **not** a complete `ExperienceCaptureRequest` and is not capture evidence. A later Review Kit consumer supplies the portable request fields it owns.

The seed carries no renderer/backend keys such as selectors, Playwright commands, URLs, shell commands, executable paths, or capture functions. That keeps screenshot tooling and platform adapters outside the canonical human journey.

## Recovery, uninstall, and preservation

Recovery and uninstall stages remain explanatory. Their recovery classes are source truth about the route the guide should present, not receipts that an effect succeeded.

In particular:

```text
LEARN_RECOVERY
  recoveryClass=DOCUMENTED_RECOVERY_ROUTE_ONLY

UNDERSTAND_UNINSTALL_AND_PRESERVATION
  recoveryClass=PRESERVATION_CHOICE_REQUIRED
```

No stage may report `REPAIRED`, `DELETED`, or `UNINSTALLED_SUCCESSFULLY` as an outcome merely because the plan was projected.

### Windows `UNINSTALL_PRESERVE_CONTINUITY` route

The Windows Frontdoor family now has one separately invoked executable preservation route on the accepted root launcher:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-vexlife.ps1 -Operation uninstall-preserve -Home "<VexHome>"
```

Canonical route identity:

```text
routeRef=route.vexlife.windows.uninstall-preserve-continuity.001
actionClass=UNINSTALL_PRESERVE_CONTINUITY
```

The route is an effect adapter. It is **not** part of the no-effect `GuidedEstablishmentPlan`, and the existence of the `UNDERSTAND_UNINSTALL_AND_PRESERVATION` stage does not execute it.

The route consumes the exact Frontdoor install receipt to bind the requested canonical Home and VexLife source root. It then:

```text
verifies the Home and every traversed Home entry are not a symlink/junction/reparse alias
fingerprints protected Home state and conversation-head evidence before cleanup
stops only the exact install-receipt PID when it is still a Node process bound to scripts/serve-browser.mjs
removes only the setup-owned runtime residue:
  runtime/serve-browser.log
  runtime/serve-browser.err.log
fingerprints protected Home state and conversation-head evidence again
writes recovery/uninstall-preserve-receipt.json
```

The protected fingerprint excludes only `runtime/**` and the uninstall-preserve receipt itself. Therefore the route may clean the bounded runtime residue it owns and append its receipt without pretending the entire Home is byte-untouched.

The first route deliberately preserves the current user-managed VexLife source folder and all continuity-bearing local state. It does not remove model artifacts. Its product truth is:

```text
STOP_SERVER != UNINSTALL_PRODUCT
UNINSTALL_PRODUCT != DELETE_HOME
REMOVE_RUNTIME != DELETE_HOME
REMOVE_MODEL_ARTIFACT != DELETE_HOME
UNINSTALL_RECEIPT != DESTRUCTIVE_AUTHORITY

Vex Home identity = PRESERVED
lineage / conversation-head evidence = PRESERVED
Memory / Score / continuity state = PRESERVED
recovery material = PRESERVED
model artifacts = PRESERVED
user-managed source package = PRESERVED
```

A repeated invocation truthfully returns `ALREADY_UNINSTALLED_PRESERVE_CONTINUITY` when the exact server and bounded runtime residue are already absent. A PID that now belongs to another process, a source/Home receipt mismatch, a reparse path, or a protected continuity mismatch fails closed instead of widening cleanup.

`UNINSTALL_AND_REMOVE_LOCAL_DATA` is **not reachable from this route**. Deleting Home, Memory, recovery material, conversation state, or model artifacts is a separate destructive authority class and requires a separately admitted future path.

## Reuse boundary

`GuidedEstablishmentPlan` is a reusable no-effect grammar. Future accepted guides may define their own `planRef`, `journeyRef`, stage identities, and safe source bindings while preserving the same strict declarative field set.

That reuse does not permit a future guide to rewrite the canonical ONB-00 local-establishment stage identities. The canonical plan has additional validation that locks its journey, newcomer profile, Windows/macOS Frontdoor bindings, stage order, and truth boundaries.

Potential future consumers include update, move, offline use, recovery, model, navigation, Memory, and uninstall guides. Each remains separately admitted work with its own effect boundaries.

## Evidence and successor boundary

ONB-00 acceptance proves only the source contract and deterministic projection semantics. It does not prove lived Windows or macOS establishment, one-click distribution, a public guide, ordinary-human completion, or publication.

Those remain later successors:

```text
ONB-WIN-ALPHA
ONB-MAC-ALPHA
ONB-DIST
ONB-PAGES
ONB-FRESH-HUMAN
ONB-PUBLISH
```

The current ONB-00 source lane performs none of those effects.

<!-- [VXG RealForever] -->
