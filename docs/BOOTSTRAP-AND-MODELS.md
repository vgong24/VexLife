# Bootstrap and external model provisioning

`[VXG RealForever]`

## Goal

A fresh source route on Windows, macOS or Linux should be able to create a valid local Vex Home without copying personal runtime data or a multi-gigabyte model through Git.

The current **release-qualified source-local companion profiles** are narrower than the repository's platform surface:

- Windows 10/11 x64 with a compatible NVIDIA driver/GPU;
- macOS arm64 on exact `Apple M4 Pro` hardware.

Each current profile requires at least 12 GiB system memory and 6 GiB free disk space. Linux and other Mac/GPU variants retain bootstrap/development surfaces but do not inherit either profile's release qualification.

`RELEASE_QUALIFIED` here means eligible for the matching source-local normal setup route. It does **not** claim a signed/public `OFFICIAL_VERIFIED_BUILD`, packaged public release, all-platform support, or P11 fresh-human release proof.

## Bootstrap sequence

```text
obtain or verify exact source route
→ verify Node and required repository files
→ detect platform, architecture and admitted hardware profile
→ select or create local Vex Home path
→ create device and companion-lineage identities
→ install accepted public culture projection
→ initialize empty local Rhythm
→ initialize Score sync policy without importing records
→ resolve a source-managed operational profile when one is qualified
→ acquire exact external model/runtime artifacts only with explicit authority
→ verify, materialize, bind and qualify the local runtime
→ start the browser reference with server-owned companion binding
→ write reversible bootstrap and initialization receipts
```

`bootstrap` and `initializeVex()` are separate contracts. Bootstrap owns Home formation and preservation. Initialization owns the product composition from an accepted operational profile through a verified local runtime binding. Neither one manufactures the other's authority.

## Ordinary-human Mac source bootstrap

The current Apple M4 Pro route has one small public source bootstrap:

```bash
rm -f /tmp/setup-vexlife.command
curl -fsSL https://raw.githubusercontent.com/vgong24/VexLife/main/setup-vexlife.command -o /tmp/setup-vexlife.command && bash /tmp/setup-vexlife.command
```

The first line removes any older temporary bootstrap, and the `&&` means the downloaded bootstrap runs only when the current GitHub fetch succeeds. A failed download cannot fall through to a stale `/tmp/setup-vexlife.command`.

`setup-vexlife.command` is intentionally small. When downloaded by itself it:

```text
checks required macOS fetch/archive tools
→ resolves the requested VexLife Git ref to one exact 40-hex commit
→ downloads that exact source archive
→ rejects unsafe archive paths
→ materializes the exact source under application-owned source storage
→ delegates to install/vexlife-setup.sh from those exact bytes
```

It does not create Vex Home, choose a model, download model/runtime artifacts, or start the companion itself. Those effects remain owned by repository setup/initializer/lifecycle code.

The default Vex Home remains the established source default:

```text
~/.vexlife
```

The human may accept that path or choose another. The selected path is then classified by software before state-dependent choices are offered.

### Mac state-first setup behavior

```text
ABSENT
  → explain first setup
  → ask whether to establish this Home
  → perform no-effect profile/host plan
  → ask separately before several-GiB model/runtime acquisition
  → qualify runtime once
  → start/open Vex

EXISTING_HEALTHY
  → open/resume
  → or offer repair / rebuild-preserve / uninstall-preserve

EXISTING_DEGRADED_REPAIRABLE
  → offer only recovery actions valid for that observed state

HELD_NONCANONICAL_HOME / unknown state
  → fail closed
  → no overwrite/delete
```

The ordinary human route does not inject `--yes` into the initializer. An already-qualified live runtime may be consumed from current Home receipts without invoking initialization a second time. Explicit noninteractive `--yes` remains a separate caller-owned authorization path.

The literal remote-bootstrap path has been human-rehearsed through cold model/projector acquisition, local runtime materialization and qualification, initialization receipt creation under `~/.vexlife/recovery`, browser startup, and a live rendered VexLife Global Root Hub on `127.0.0.1:18110`.

That rehearsal is a source-local Mac onboarding proof. It is not P11 fresh-human/fresh-machine acceptance and does not elevate the source route into a signed/public build.

## Model boundary

The repository stores only source-managed identity and verification material:

```text
operational profile state and stable profileRef
artifact source/revision/filename
expected byte size and SHA-256
license/source refs
runtime endpoint configuration
hardware/resource policy
refresh triggers
```

Model/runtime binaries live under the user's Vex Home or another explicitly admitted external directory. They are excluded from canonical Git source identity.

## Normal-user vs candidate qualification

The normal initialization route is fail-closed:

```text
RELEASE_QUALIFIED profile
  -> eligible for the matching normal source-local initialization route

CANDIDATE_QUALIFICATION / HELD / STALE / INVALID profile
  -> not a normal default
  -> no hidden default LLM fallback
```

The current Windows x64 NVIDIA profile is `RELEASE_QUALIFIED` after exact Windows evidence proved pinned artifact/runtime digests and sizes, bounded model generation, local qualification inference, one real Browser→G01 companion turn, Home-preserving uninstall, exact-owned process shutdown, and temporary-test-Home cleanup.

The current macOS arm64 Apple M4 Pro profile is `RELEASE_QUALIFIED` after exact Mac evidence proved pinned upstream/runtime executable identities, Metal runtime qualification, a real Browser→Companion turn, restart/resume, repair, rebuild-preserve, uninstall-preserve, exact-owned shutdown, path-with-spaces ownership, and protected Home/technical continuity. The later ordinary-human front-door rehearsal additionally proved the literal remote-bootstrap path through cold acquisition and live browser opening.

Neither state claims a signed installer, public release, `OFFICIAL_VERIFIED_BUILD`, P11 fresh-human proof, or support for a nearby but unqualified platform/hardware combination. Internal `candidate-qualification` mode remains available only for future profile evaluation and requires the exact profile plus separate candidate authority.

Current deterministic initializer commands remain:

```text
npm run vex:initialize:plan
npm run vex:initialize
```

The initializer source entrypoint is `scripts/initialize-vex.mjs`. Human setup front doors must consume the same initializer/profile/receipt contract rather than inventing a second model installer.

## Artifact acquisition rules

- no download without an expected SHA-256;
- release-qualified artifacts also carry exact expected byte sizes;
- exact verified cached artifacts are reused before network access;
- interrupted downloads retain one attempt-owned `.partial` file and use HTTP Range when the source supports it;
- a server that ignores Range restarts that partial transfer rather than appending incompatible bytes;
- checksum, expected-size or admitted-size failure deletes the partial file and stops before activation;
- an existing final artifact that fails verification is never overwritten automatically;
- final artifacts are atomically promoted only after verification;
- unsupported hardware is an explicit hold, not a silent fallback;
- runtime archives materialize only under the selected Vex Home;
- loopback runtime binding is numeric `127.0.0.1`; non-loopback binding is not admitted by initialization.

## Runtime qualification boundary

```text
DOWNLOADED != VERIFIED != MATERIALIZED != BOUND != QUALIFIED != COMPANION_READY
```

The current release-qualified Windows and Apple M4 Pro compositions use pinned llama.cpp `b10107` plus pinned Qwen3.5-4B Q4_K_M model/projector artifacts. Normal generation is bounded by the accepted source-managed profile. The initializer verifies each artifact, verifies the platform runtime executable, starts the exact loopback process, waits for health, performs one non-user qualification inference, and writes a machine-readable receipt. Only then may `config/model.json` become `BOUND_QUALIFIED`.

The browser owns no endpoint, executable, model, Home or runtime authority. Its companion endpoint/model values are supplied by the server process from the accepted initialization receipt/profile.

## Provision an advanced external model

The older advanced provisioning command remains available for operators:

```bash
node scripts/provision-model.mjs \
  --url "https://<artifact-host>/<model>.gguf" \
  --sha256 "<64-hex>" \
  --name "<model>.gguf" \
  --source-ref "source.model.<id>" \
  --license-ref "license.model.<id>" \
  --runtime-family "llama.cpp" \
  --hardware-profile "hardware.<device-profile>"
```

That path records one artifact as `PROVISIONED_INACTIVE`. It does not inherit Vex certified-profile status, lineage, private Memory or runtime authority.

## Culture initialization

A new device companion starts with the accepted culture pack and empty personal stores. It may then receive selectively synchronized Score projections.

```text
culture installed
≠ personal memory imported
Score synchronized
≠ device Rhythm copied
same model family
≠ same companion lineage
```

## A new device is a sibling, not a teleported instance

Obtaining VexLife on another device creates a new device-local companion lineage. It may install the same public culture and may later receive explicitly selected Score projections, but it does not inherit another device's running instance identity or local Rhythm.

```text
same human + same family + same culture
  != same running companion instance

shared Score record
  → attributed to its source lineage
  → reviewed for target-device scope
  → projected into the sibling's context
  → never rewritten as an experience the sibling personally lived
```

## Recovery and reruns

Bootstrap never deletes an existing Vex Home. Initialization never overwrites an unknown runtime or mismatched final artifact. Existing Home, profile, artifact, runtime, port and qualification state are classified independently so a retry can resume from the last exact verified boundary.

On Mac, rerunning the same two-line bootstrap resolves current source and then routes through this classification rather than blindly replacing Home state.

`uninstall-preserve` is intentionally continuity-preserving: it stops exact owned browser/runtime processes and removes runtime/transient state while preserving Home, Memory, conversations and verified model artifacts. It records `HomeDeleted=false`, `MemoryDeleted=false`, and `modelArtifactsDeleted=false` in the lifecycle receipt and fails if protected Home continuity changes.

A future full-delete operation, if admitted, is a separate destructive consent boundary and must not be conflated with `uninstall-preserve`.

A missing current release-qualified profile is `NO_RELEASE_QUALIFIED_PROFILE`, not permission to fall back to another model. An unrelated process on the admitted runtime port is `PORT_OWNERSHIP_CONFLICT`, not permission to kill it.

<!-- [VXG RealForever] -->
