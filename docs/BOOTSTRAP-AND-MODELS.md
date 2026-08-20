# Bootstrap and external model provisioning

`[VXG RealForever]`

## Goal

A fresh checkout on Windows, macOS or Linux should be able to create a valid local Vex Home without copying personal runtime data or a multi-gigabyte model through Git. The current **release-qualified local companion baseline** is narrower: Windows x64 with a compatible NVIDIA driver/GPU. Other platform bootstrap/source surfaces remain available, but this document does not claim an equivalent release-qualified local-model profile for them yet.

## Bootstrap sequence

```text
verify Node and repository files
→ detect platform and architecture
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
  -> eligible for normal Continue-with-Vex initialization

CANDIDATE_QUALIFICATION / HELD / STALE / INVALID profile
  -> not a normal default
  -> no hidden default LLM fallback
```

The current Windows x64 NVIDIA profile is `RELEASE_QUALIFIED` for the **source-local normal setup route** after exact Windows evidence proved its pinned artifact/runtime digests and sizes, bounded model generation, local qualification inference, one real Browser→G01 companion turn, Home-preserving uninstall, exact-owned process shutdown, and temporary-test-Home cleanup.

That state does **not** claim a signed installer, public release, `OFFICIAL_VERIFIED_BUILD`, P11 fresh-human proof, or equivalent support on another platform. Those remain separately governed distribution/lifecycle thresholds. Internal `candidate-qualification` mode remains available only for future profile evaluation and requires the exact profile plus separate candidate authority.

Current deterministic commands:

```text
npm run vex:initialize:plan
npm run vex:initialize
```

The source entrypoint is `scripts/initialize-vex.mjs`. A future GUI or signed launcher must consume the same initializer/profile/receipt contract rather than invent a second installer.

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

The current release-qualified Windows composition uses pinned llama.cpp `b10107` plus pinned Qwen3.5-4B Q4_K_M model/projector artifacts. Its server profile bounds normal generation to 256 total predicted tokens with a 128-token reasoning budget. The initializer verifies each artifact, verifies the extracted `llama-server.exe`, starts the exact loopback process, waits for the health surface, performs one non-user qualification inference, and writes a machine-readable receipt. Only then may `config/model.json` become `BOUND_QUALIFIED`.

The browser still owns no endpoint, executable, model, Home or runtime authority. Its companion endpoint/model values are supplied by the server process from the accepted initialization receipt/profile.

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

Cloning the repository on a MacBook creates a new device-local companion lineage. It may install the same public culture and may later receive explicitly selected Score projections, but it does not inherit another device's running instance identity or local Rhythm.

```text
same human + same family + same culture
  != same running companion instance

shared Score record
  → attributed to its source lineage
  → reviewed for target-device scope
  → projected into the sibling's context
  → never rewritten as an experience the sibling personally lived
```

## Recovery

Bootstrap never deletes an existing Vex Home. Initialization never overwrites an unknown runtime or mismatched final artifact. Existing Home, profile, artifact, runtime, port and qualification state are classified independently so a retry can resume from the last exact verified boundary.

A missing current release-qualified profile is `NO_RELEASE_QUALIFIED_PROFILE`, not permission to fall back to another model. An unrelated process on the admitted runtime port is `PORT_OWNERSHIP_CONFLICT`, not permission to kill it.

<!-- [VXG RealForever] -->
