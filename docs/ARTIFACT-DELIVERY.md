# Artifact Delivery

`[VXG RealForever]`

Owner: `github.issue.vexlife.343` under distribution parent `github.issue.vextreme-sdk.914`.

## Purpose

This layer makes artifact delivery provider-neutral without turning a provider change into an artifact, model-generation, or activation change.

```text
ARTIFACT_BYTE_IDENTITY != DELIVERY_CHANNEL_IDENTITY
CHANNEL_UNAVAILABLE != ARTIFACT_INTEGRITY_MISMATCH
MIRROR_FAILOVER != MODEL_ACTIVATION
VERIFIED_LOCAL_CACHE != NEED_TO_REDOWNLOAD
```

PR-A is a generic foundation only. It registers no real G0 mirror channel and performs no publication.

## Ownership split

`blueprint/artifact-registry.json` owns provider-neutral artifact byte/provenance identity:

```text
artifactRef
filename
mediaType
sha256
expectedBytes
maxBytes
sourceRef
licenseRef
```

It deliberately contains no delivery URL, provider preference, channel order, caller input, generation selection, or active-model choice.

`blueprint/artifact-delivery-registry.json` owns source-managed ordered delivery channels. The first generic transport classes are:

```text
DIRECT_HTTPS_FILE_V1
VERIFIED_CHUNK_MANIFEST_V1
```

GitHub Release is only a possible future channel instance; core delivery code contains no GitHub-specific model semantics.

## Compatibility

The accepted direct primitive remains external and unchanged:

```text
downloadVerifiedArtifact({
  url,
  expectedSha256,
  expectedBytes,
  maxBytes,
  finalPath
})
```

Current initializer and G04B provisioning callers therefore do not acquire a mandatory `channelRef` or a new owner dependency from PR-A.

New source-managed consumers use:

```text
resolveAndDownloadArtifact({
  artifactRef,
  deliveryPolicyRef,
  finalPath,
  artifactRegistry,
  deliveryRegistry,
  directDownload
})
```

The caller selects an artifact and an admitted policy identity only. The registry controls channel order; caller-supplied channel arrays are ignored because they are not part of the function contract.

## Failure law

Only typed `CHANNEL_UNAVAILABLE` may advance to another source-managed channel.

Unavailable transport includes network/DNS/timeout and HTTP-unavailable responses. These do not claim artifact corruption.

The resolver hard-stops on:

```text
manifest digest mismatch
malformed manifest/topology
part digest/byte mismatch
cumulative checkpoint mismatch
final digest/byte mismatch
unsafe URL/name
source/license contradiction
policy rejection
protocol contradiction
```

Wrong bytes are an integrity incident. They are never hidden by succeeding from a later provider in the same attempt.

## Verified cache

Before choosing any channel the resolver verifies an existing final artifact against exact bytes and SHA-256. Exact cache reuse returns:

```text
disposition=REUSED_VERIFIED
providerOrNetworkEffect=false
selectedChannelRef=null
attemptedChannelRefs=[]
```

## Direct-channel partial provenance

The existing direct primitive may keep its `.partial` file. The higher-level resolver binds that legacy partial to an exact sibling sidecar containing artifact identity, channel identity, and a query-stripped source URL. A channel mismatch clears the legacy partial before any different channel runs.

This preserves current direct callers while preventing cross-channel partial reuse.

## Verified chunk manifest

The manifest is itself source-pinned by exact SHA-256 and binds:

```text
artifactRef
filename
expectedBytes
expectedSha256
FIXED_BYTES chunking
ordered contiguous parts
sourceRef
licenseRef
releaseRef
```

Each part binds exact index, offset, bytes, SHA-256, cumulative bytes, cumulative SHA-256, safe asset name, and credential-free HTTPS URL.

The resolver verifies the manifest before touching artifact bytes, downloads one part at a time into a bounded temporary file, verifies that part, streams it into the assembly partial, recomputes the cumulative prefix identity, atomically checkpoints a sidecar, deletes the committed part temp, and continues.

It never buffers the complete artifact in memory.

## Resume and channel switch

The assembly sidecar binds:

```text
artifactRef
channelRef
manifestSha256
expectedFinalSha256
expectedFinalBytes
lastCommittedPart
committedBytes
committedCumulativeSha256
```

On the same channel, a retry resumes only after the assembly file and sidecar independently match the manifest's cumulative checkpoint. Missing, stale, truncated, tampered, or mismatched state is discarded and restarted.

A fallback channel always clears prior channel partial provenance first.

## Deterministic mirror packager

`scripts/form-artifact-mirror.mjs` is local filesystem tooling only. It takes one exact local artifact, one source-managed artifact identity, fixed chunk size, and an exact publication base/release identity. It first verifies the complete source bytes, then produces:

```text
<artifact>.part-....
artifact-manifest.json
SHA256SUMS
publication-inventory.json
```

Part bytes, manifest bytes, inventory bytes, and checksums are deterministic for the same inputs. The tool has no upload, credential, model-call, training, Home, Memory, activation, or publication behavior.

The later P1 publication effect remains separately authorized and must never route model bytes through ChatGPT.

## Held boundaries

```text
real G0 channel registration=false
GitHub repository creation=false
binary upload=false
publication=false
operational-profile migration=false
model selection=false
G04B caller migration=false
model call=false
training=false
weight mutation=false
activation=false
Home/Memory semantic mutation=false
```

PR-B, if later admitted after immutable mirror publication proof, owns real G0 channel admission plus generation/bundle/selection semantics. G04B integration remains separately owned.

<!-- [VXG RealForever] -->
