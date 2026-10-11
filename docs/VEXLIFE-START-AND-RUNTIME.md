# VexLife Start and Runtime

`[VXG RealForever]`

## Purpose

This is the **map before depth** for how VexLife begins and becomes a running
companion.

A fresh human or agent should be able to start from accepted `main`, understand
the intended runtime architecture, identify the current source owners, and know
where to continue or refactor without reconstructing chat history or reading
historical issues first.

This document owns:

```text
start/runtime map
+ architectural intention
+ owner routing
+ continuation routing
```

It does **not** replace the detailed contracts linked below.

## How to read this map

Runtime truth is deliberately separated into three classes:

```text
ACCEPTED_CURRENT
  source and evidence exist now; callers may rely on the exact accepted contract

INTENDED_ARCHITECTURE
  preserve this design direction while extending/refactoring;
  it may describe a seam before every future realization is implemented

HELD_FOR_EVIDENCE
  do not invent the missing implementation, qualification or policy;
  wait for the rightful owner/evidence
```

Permanent rule:

```text
DESIGN_AHEAD != CLAIM_FUTURE_EVIDENCE_ALREADY_EXISTS
```

## Permanent non-collapse

These identities are related but not interchangeable:

```text
VEX_GENERATION != MODEL_FORMAT
VEX_GENERATION != RUNTIME_REALIZATION
VEX_GENERATION != DELIVERY_PROVIDER
RUNTIME_REALIZATION != ARTIFACT_IDENTITY
MODEL_ARTIFACT != VEX_HOME
MODEL_FAMILY != COMPANION_LINEAGE

REGISTERED != RELEASE_QUALIFIED
RELEASE_QUALIFIED != ACTIVE_NEW_INSTALL_SELECTION
ACTIVE_NEW_INSTALL_SELECTION != EXISTING_HOME_MODEL_SWAP

REPRESENTABLE_RUNTIME != ADMITTED_RUNTIME
DOWNLOADED != VERIFIED != MATERIALIZED != BOUND != QUALIFIED != COMPANION_READY
```

A provider URL may move. A runtime technology may change. A generation identity
must not be silently rewritten because either one changed.

## Whole start/runtime map

```text
human front door
  setup-vexlife.command / setup-vexlife.cmd
        ↓
exact source acquisition + platform setup
  install/vexlife-setup.*
        ↓
Vex Home formation / preservation
  scripts/bootstrap.mjs
        ↓
generation / bundle selection
  blueprint/model-bundle-registry.json
        ↓
artifact identity
  blueprint/artifact-registry.json
        ↓
artifact delivery
  blueprint/artifact-delivery-registry.json
  src/core/artifact-delivery.mjs
        ↓
runtime realization
  ┌──────────────────────────────┴──────────────────────────────┐
  │                                                             │
  │ current normal G0 path                                      │ accepted activated cultivated path
  │ src/core/vex-initialization.mjs                             │ blueprint/activated-model-runtime-bindings.json
  │ scripts/initialize-vex.mjs                                  │ src/core/activated-model-runtime-binding.mjs
  │                                                             │ scripts/resume-vex.mjs
  └──────────────────────────────┬──────────────────────────────┘
                                 ↓
qualification + durable Home binding
                                 ↓
Companion / browser / voice / vessel composition
                                 ↓
lifecycle / clean stop / restart / recovery
  scripts/macos-lifecycle.mjs and platform/recovery owners
```

The human-facing setup route is intentionally calm. It delegates to these source
owners rather than making the human choose model URLs, hashes, runtime plumbing or
recovery mechanics.

## Accepted current — ordinary G0 source-local path

The current normal source-local initialization path remains the accepted G0
composition.

```text
activeModelBundleRef
→ current G0 model bundle
→ RELEASE_QUALIFIED operational profile
→ exact base-model + projector artifacts
→ provider-neutral Artifact Delivery
→ exact platform llama.cpp runtime
→ loopback qualification
→ BOUND_QUALIFIED Home model configuration
→ server-owned Companion binding
```

Primary sources:

```text
blueprint/model-bundle-registry.json
blueprint/vex-operational-profiles.json
blueprint/artifact-registry.json
blueprint/artifact-delivery-registry.json
src/core/vex-initialization.mjs
scripts/initialize-vex.mjs
src/core/artifact-delivery.mjs
```

Depth:

- `docs/BOOTSTRAP-AND-MODELS.md`
- `docs/ARTIFACT-DELIVERY.md`
- `docs/MODEL-SOVEREIGNTY-SELECTION.md`

Do not infer that the G0 shape is the permanent shape of every future Vex
generation.

## Accepted current — activated cultivated proving path

VexLife also has an accepted activated cultivated-model runtime binding. It is a
real current proving path, but its current MLX/Python/member-set details are **not
universal generation laws**.

```text
activated binding identity
→ exact cultivated artifact/custody truth
→ exact admitted runtime adapter
→ runtime start/resume
→ neutral qualification
→ activated-model configuration + qualification receipt
→ Companion/browser/Voice/lifecycle composition
```

Primary sources:

```text
blueprint/activated-model-runtime-bindings.json
src/core/activated-model-runtime-binding.mjs
scripts/resume-vex.mjs
scripts/macos-lifecycle.mjs
```

Depth:

- `docs/ACTIVATED-CULTIVATED-MODEL-RUNTIME-BINDING.md`
- `docs/VEX-ASSEMBLY-COMPANION-VOICE-PLAYBACK.md`
- `docs/COMPANION-AVAILABILITY-AND-REENTRY.md`

The current cultivated binding proves one accepted realization. It does not mean:

```text
ALL_FUTURE_VEX_USES_MLX=false
ALL_FUTURE_VEX_USES_PYTHON=false
ALL_FUTURE_VEX_HAS_THIS_MEMBER_COUNT=false
ALL_FUTURE_VEX_USES_THIS_PORT=false
```

## Intended architecture — generation-shaped, not G0-shaped

The accepted model-bundle source can now represent future generalized candidates
without migrating or replacing the current G0 registry entry.

A generalized bundle opts into:

```text
bundleSchemaVersion = vexlife.model-bundle/v2

generationRef
modelProfileRef
artifactBindings[]:
  roleRef
  artifactRef

artifactSetRef
contentSetSha256
runtimeRealizationRefs[]
state
sourceRefs[]
```

This is a **representation contract**.

`artifactBindings[]` says which registered artifacts play which semantic roles.
It does not publish them or grant custody.

`artifactSetRef` / `contentSetSha256` carry aggregate artifact-set identity.
Their presence does not mean every consumer has independently recomputed that
seal.

`runtimeRealizationRefs[]` names runtime realizations the generation may use.
It does not mean a caller may select index 0, start it, or call it qualified.

The current structural resolver therefore has an intentional stop:

```text
MODEL_BUNDLE_RUNTIME_REALIZATION_HELD
```

That state means:

```text
the generation is representable
+ its registered artifact set can be inspected
!= a runtime has been selected/qualified/admitted for ordinary initialization
```

The existing G0 initializer also independently rejects a generalized bundle until
a rightful runtime realization is admitted.

## Intended future circuit

The intended long-term circuit is:

```text
accepted Vex generation
→ certified model/profile truth
→ immutable artifact-set identity
→ accepted distribution channels
→ exact materialization + verification
→ one compatible runtime realization
→ runtime qualification
→ release-qualified model bundle
→ separate activeModelBundleRef promotion
→ future new install receives that Vex
```

This is architecture, not a claim that every step is complete for the next
cultivated generation.

The system should be able to add a future generation as data/evidence rather than
rebuilding the installer around one model format.

## Held for evidence

The following remain future-evidence boundaries unless live source has advanced
them:

```text
exact next cultivated generation identity
exact final artifact packaging/member shape
redistribution rights/notices for that generation
public immutable artifact publication/readback
cross-platform runtime realizations
deterministic host-to-runtime selection policy
distributed cultivated first bind
ordinary setup dispatch into the cultivated runtime owner
release qualification for that exact realization
activeModelBundleRef promotion
existing-Home model succession/update
```

Do not fill these gaps from analogy to G0 or the current activated M4 proving
case.

## New install and existing Home are different

```text
NEW INSTALL
  → resolve current activeModelBundleRef
  → materialize/qualify that accepted bundle

EXISTING HOME
  → preserve persisted binding
  → explicit Model Succession / update / rollback route
  != silently follow a changed activeModelBundleRef
```

Changing the default Vex for a future installation is not authority to change the
Vex already bound to an existing Home.

## Owner routing — where a future builder should continue

| Intention | Start with | Do not silently take over |
| --- | --- | --- |
| Change human setup/front door | `README.md`, platform setup, onboarding docs | model/runtime identity |
| Change Home formation | `scripts/bootstrap.mjs`, boot/Home owner | model succession |
| Change generation/bundle representation or new-install selection | `src/core/vex-initialization.mjs`, `blueprint/model-bundle-registry.json`, Model Sovereignty | Artifact Delivery or runtime implementation |
| Change artifact byte identity | `blueprint/artifact-registry.json` | generation identity |
| Change artifact transport/mirrors/resume | `src/core/artifact-delivery.mjs`, Artifact Delivery docs | model semantics |
| Change current G0 initialization | `scripts/initialize-vex.mjs`, operational profiles | activated cultivated runtime |
| Change activated cultivated runtime binding | `src/core/activated-model-runtime-binding.mjs`, `scripts/resume-vex.mjs` | training, activation or succession authority |
| Change Mac stop/resume/repair | `scripts/macos-lifecycle.mjs` | model identity |
| Change existing Home to another generation | Model Succession/update owner | `activeModelBundleRef` alone |
| Admit a real future cultivated generation | re-ground Model Sovereignty + Distribution Trust + artifact/runtime/succession evidence | Stage-A assumptions |
| Change browser/Voice/vessel composition | current Assembly/Companion owners | model-generation ownership |

If the intended change crosses owners, map the join first. Do not solve it by
copying one owner's logic into another.

## Cold-reader traversal

A fresh agent should use this route:

```text
AGENTS.md
→ npm run orient
→ consume orientation.requiredSources[]
→ docs/NEWCOMER-MAP.md
→ docs/VEXLIFE-START-AND-RUNTIME.md
→ npm run atlas:query -- --intent "<bounded runtime question>" ...
→ npm run module:describe -- --module-ref <exact module>
→ descend into the named owner document/source/tests only
```

For runtime work, useful registered seams include:

```text
module.vexlife.core.vex-initialization
module.vexlife.core.activated-model-runtime-binding
module.vexlife.core.artifact-delivery

module.vexlife.script.initialize-vex
module.vexlife.script.resume-vex
module.vexlife.script.macos-lifecycle
```

The map should normally be enough to choose the first owner. Historical issue/PR
evidence remains useful provenance, but a cold reader should not need issue
archaeology just to understand the architecture.

## Refactor rule

A refactor is healthy when it preserves the semantic separations above even if
file names, runtime technology or implementation language change.

Before replacing a seam, be able to answer:

```text
What semantic truth does this seam own?
Who consumes it?
What proof makes it current?
Which neighboring owner must not be absorbed?
What accepted behavior must regress unchanged?
What intended architecture should remain possible?
Which held future details must remain un-invented?
```

If those answers are unavailable, descend to the owner sources before changing
implementation.

<!-- [VXG RealForever][VEXLIFE-START-AND-RUNTIME] -->
