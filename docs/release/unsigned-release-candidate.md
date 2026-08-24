# Local unsigned release candidate

`[VXG RealForever]`

This document is the source-local release-steward contract for `github.issue.vexlife.178`.
It does **not** publish VexLife, create a GitHub Release, sign a build, change repository
visibility, bundle model/runtime artifacts, or grant release authority.

```text
parent=github.issue.vextreme-sdk.914
implementation=github.issue.vexlife.178
distributionTrustOwner=github.issue.vextreme-sdk.244
distributionTrustImplementation=github.issue.vextreme-sdk.1053
runtimeDependencyMaterialization=github.issue.vextreme-sdk.662
workRef=work.vexlife.onb-dist.unsigned-release-candidate.062f8cc9-b36f-4319-a3a6-0abd8639d6a0
claimRef=claim.vexlife.onb-dist.unsigned-release-candidate.5e742778-0de4-4778-8ffe-ff1a849f93c7
```

## What the producer does

The source-managed producer accepts one exact Git commit from the current VexLife
repository and forms one deterministic **local unsigned release-candidate packet**:

```text
exact Git commit/tree
-> deterministic Git source archive
-> archive SHA-256
-> distribution-trust.build-provenance/v1
-> distribution-trust.official-release/v1
-> checksum + summary receipt
```

The ordinary command surface is intentionally explicit:

```text
node scripts/release-candidate.mjs --commit <full-40-hex-commit-sha>
```

Without an output selector, output is confined to the ignored, noncanonical boundary:

```text
generated/release-candidates/<full-source-commit-sha>/
```

An explicit selector may choose only a **relative subdirectory beneath that same
qualified root**:

```text
node scripts/release-candidate.mjs \
  --commit <full-40-hex-commit-sha> \
  --out <relative-subdirectory>
```

`--out` is not a general filesystem destination. Absolute paths, parent traversal,
the repository root, sibling directories, and any output path whose existing ancestry
contains a symbolic link or junction fail closed before packet files are created.
The write API enforces the same containment rule even when called programmatically.

The producer resolves repository identity relative to its own source location, not
the caller's current directory. Unstaged or untracked worktree content is never an
input to an exact-commit archive.

## Evidence class

The emitted release evidence is always bounded to:

```text
releaseClass=UNSIGNED_RELEASE_CANDIDATE
publicationState=LOCAL_CANDIDATE_ONLY
certificationState=UNSIGNED_LOCAL_CANDIDATE
signingIdentityRefs=[]
signatureVerificationRefs=[]
releaseAuthorityRefs=[]
releaseAcceptanceRefs=[]
```

Build provenance begins as:

```text
reproducibilityState=DETERMINISTIC_RECIPE_NOT_INDEPENDENTLY_REPRODUCED
reproducibilityEvidenceRefs=[]
```

A later independent reproduction may add evidence in a later lifecycle; this producer
does not self-promote reproducibility or release acceptance.

## Product identities consumed, not duplicated

The packet references the current accepted operational profile:

```text
profile.vexlife.operational.qwen3.5-4b.llama-cpp-b10107.windows-x64-nvidia.001
```

That profile is source-local Windows operational qualification. A profile reference is
not a bundled model/runtime artifact and is not an `OFFICIAL_VERIFIED_BUILD` claim.
Runtime Dependency Materialization remains owned by SDK #662. Generic release evidence
validation remains owned by Distribution Trust #244/#1053; VexLife does not copy that
verifier into this repository.

## Effects

Every Distribution Trust effect field emitted by this producer is `false`:

```text
network=false
provider=false
signing=false
publication=false
repositoryVisibility=false
model=false
Home=false
Memory=false
```

The producer performs only local filesystem writes beneath
`generated/release-candidates/**` and Git read operations against the current
repository. It does not perform network acquisition, setup, runtime start, Home
creation, model inference, signing, release publication, Pages enablement, repository
mutation, or arbitrary host-path output.

## What passing proves

Deterministic tests must prove exact commit/tree resolution, repeated archive identity,
worktree independence, exact release/provenance identity matching, unsigned-state
restrictions, zero effects, qualified-output containment, noncanonical output, and
fail-closed hostile mutations.

A later independent cross-repository proof must feed the emitted JSON into the accepted
SDK Distribution Trust verifier. That proof is external evidence; it must not be
implemented by copying private SDK verifier source into VexLife.

```text
LOCAL_UNSIGNED_PACKET != OFFICIAL_VERIFIED_BUILD
LOCAL_UNSIGNED_PACKET != SIGNED_BUILD
LOCAL_UNSIGNED_PACKET != GITHUB_RELEASE
LOCAL_UNSIGNED_PACKET != PUBLICATION
LOCAL_UNSIGNED_PACKET != MODEL_OR_RUNTIME_BUNDLE
LOCAL_UNSIGNED_PACKET != P11_FRESH_HUMAN_PROOF
```

<!-- [VXG RealForever] -->
