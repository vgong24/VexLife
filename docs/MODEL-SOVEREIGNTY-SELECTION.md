# Model Sovereignty — Delivery and Selection

`[VXG RealForever]`

Owner: `github.issue.vexlife.343`; PR-B source successor: `github.issue.vexlife.361`.

## Permanent identity law

```text
ARTIFACT_BYTE_IDENTITY != DELIVERY_CHANNEL_IDENTITY
DELIVERY_CHANNEL_IDENTITY != MODEL_BUNDLE_IDENTITY
MODEL_BUNDLE_IDENTITY != GENERATION_ACTIVATION_EFFECT
SAME_MODEL_PROVIDER_FAILOVER != MODEL_CHANGE
ACCEPTED_NEW_GENERATION -> ONE_TYPED_activeModelBundleRef_TRANSITION
```

The canonical artifact registry owns exact model/projector byte, source and license identity. The canonical delivery registry owns ordered replaceable transports. The model-bundle registry owns one typed current selection pointer over already-qualified model/projector identities. Operational profiles own host/runtime compatibility and a provider-free qualification projection.

## Current G0 bundle

`activeModelBundleRef` selects `model-bundle.vexlife.g0.qwen3.5-4b.q4-k-m.001`, generation `generation.vexlife.g0.001`. It binds the exact Qwen3.5 4B Q4_K_M base model and BF16 projector already qualified by the Windows and Apple M4 Pro operational profiles.

The selected bundle contains no provider URL. The current G0 delivery order is:

1. immutable `vgong24/VexModelArtifacts` verified chunk manifest;
2. the exact Bartowski Hugging Face direct file as a byte-equivalent fallback.

Only typed `CHANNEL_UNAVAILABLE` advances to the next provider. An integrity, protocol, policy, source/license or local-I/O contradiction hard-stops instead of shopping for a provider that happens to pass.

## Ordinary initialization

Runtime archives remain with the existing direct verified operational-profile path. Model/projector acquisition goes through `resolveAndDownloadArtifact({artifactRef, deliveryPolicyRef, finalPath})`, which loads source-managed registries and does not accept caller URLs, hashes or channel order. Verified local model cache reuse remains zero-network.

The initialization plan, readiness request, browser binding and durable model configuration carry the selected `modelBundleRef`/`generationRef`. Delivery receipts separately carry selected/attempted channel provenance.

## Held effects

This source contract does not activate a model, run inference, train or mutate weights, change Home/Memory, modify G04B/Vex Birth, create a repository, publish another release, or claim an official verified build. Those remain separate owners/effects.

<!-- [VXG RealForever] -->
