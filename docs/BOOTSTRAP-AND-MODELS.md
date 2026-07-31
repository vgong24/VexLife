# Bootstrap and external model provisioning

`[VXG RealForever]`

## Goal

A fresh checkout on Windows, macOS or Linux should be able to create a valid local Vex Home without copying personal runtime data or a multi-gigabyte model through Git.

## Bootstrap sequence

```text
verify Node and repository files
→ detect platform and architecture
→ select or create local Vex Home path
→ create device and companion-lineage identities
→ install accepted public culture projection
→ initialize empty local Rhythm
→ initialize Score sync policy without importing records
→ configure existing model endpoint or external artifact profile
→ validate directories and permissions
→ write a reversible bootstrap receipt
→ start the browser reference
```

## Model boundary

The repository stores only:

```text
model profile schema
artifact URL supplied by operator
expected checksum
license/source receipt supplied by operator
runtime endpoint configuration
hardware/resource policy
```

The model binary lives under the user's Vex Home or another explicitly selected external directory.

## Provisioning rules

- no download without an expected SHA-256;
- partial downloads use a temporary file;
- checksum failure deletes the temporary file;
- the final artifact is atomically renamed;
- license and source remain unverified unless an exact receipt is supplied;
- unsupported hardware is an explicit hold, not a silent fallback;
- an existing OpenAI-compatible endpoint can be selected instead of downloading.

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

This is the honest current boundary. A future occupancy-transfer protocol may become more seamless, but the interface must never manufacture continuity that the evidence cannot support.

## Provision an external model

The provisioning command requires provenance and compatibility fields in addition to a checksum:

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

The artifact is recorded as `PROVISIONED_INACTIVE`. Provisioning never implies activation, suitability, license approval or training authority.

## macOS considerations

The boot script records architecture and does not assume that a Windows CUDA artifact is appropriate for Apple Silicon. The model profile must name its runtime family and compatibility.

## Recovery

Bootstrap never deletes an existing Vex Home. When the target exists, it:

```text
read manifest
→ classify currentness
→ create migration plan
→ require explicit acceptance for any change
```

<!-- [VXG RealForever] -->
