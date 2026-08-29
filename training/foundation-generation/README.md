# G04B — Vex Foundation Generation

`[VXG RealForever]`

This directory is the executable neural-learning surface recovered after G04 Stage A proved only a faithful simulation.

The current accepted model generation is never overwritten in place. A training run writes a separate candidate directory and receipt. Candidate activation is a later model-profile/runtime migration effect.

## Modes

```text
ADAPTER_PROBE
  optional comparison/intermediate experiment;
  not implemented by the generation-1 trainer and cannot close G04B.

FOUNDATION_PARTIAL_FULL_RANK
  updates ordinary model parameters in the last N discovered language transformer blocks.
  This changes actual checkpoint weights and emits exact changed-parameter evidence.

FOUNDATION_FULL
  updates every parameter whose source model exposes requires_grad=true.
  Use only on a qualified compute profile with enough memory.
```

A partial full-rank run is **not** represented as a complete all-parameter retrain. The receipt records the mode, selected block path, trainable parameter count, changed parameter count and deterministic changed-name fingerprint.

## Source model

VexLife's release-qualified inference profile currently uses a Qwen3.5-4B quantized GGUF artifact through llama.cpp. That GGUF is an inference artifact, not the training checkpoint.

The training manifest must bind an exact trainable Hugging Face repository revision. Current source candidates include:

```text
Qwen/Qwen3.5-4B
Qwen/Qwen3.5-4B-Base
```

Do not use `main` as the final training identity. Generation 1 treats:

```text
sourceModelRepo + exact 40-character sourceModelRevision
  = authoritative executable source identity

sourceModelSnapshotFingerprint
  = caller-declared expected snapshot fingerprint
  != independently observed snapshot evidence
```

Until a later source-snapshot verifier derives that fingerprint from resolved model bytes, receipts preserve `sourceModelSnapshotFingerprintObserved=false` and `sourceModelIdentityClass=EXACT_REPOSITORY_PLUS_COMMIT_REVISION`. A declared 64-hex value must never be presented as independently observed provenance.

The manifest also binds the exact VexLife source that admitted the run:

```text
sourceManifestFingerprint
  = canonical Source Manifest v3 treeSha256 for the exact Git-index source
```

`node scripts/foundation-training-plan.mjs ...` is the Git-aware preflight. On the real repository it recomputes the canonical Source Manifest and rejects a stale or forged fingerprint. Python training/evaluation then preserve that admitted value as `sourceManifestFingerprintObserved=false`; they do not pretend to independently own Git-index observation.

Model genealogy is explicit rather than reconstructed downstream:

```text
priorModelIdentity
  = deterministic identity of exact sourceModelRepo + sourceModelRevision

candidateModelIdentity
  = deterministic identity of priorModelIdentity
    + trainingRunRef
    + exact candidateArtifactFingerprint
```

The evaluator recomputes both identities from the exact manifest and re-hashed candidate bytes before emitting evaluation evidence.

## Execution device and host binding

Generation 1 has no implicit CPU fallback for a real G04B run. The manifest must bind one explicit execution backend to one admitted hardware profile:

```text
executionDevice=CUDA
  <-> hardware.windows-x64.nvidia.cuda12-compatible

executionDevice=MPS
  <-> hardware.macos-arm64.apple-m4-pro.metal
```

A caller cannot pair `MPS` with the Windows CUDA profile or `CUDA` with the Mac Metal profile. `AUTO`, `CPU`, a missing device, or an unknown device fails before model runtime loading.

The trainer independently re-observes the selected accelerator before loading the checkpoint:

```text
MPS
  -> darwin + arm64
  -> PyTorch MPS built and available
  -> Apple chip identity is Apple M4 Pro for the admitted profile
  -> one minimal tensor operation succeeds at the requested precision

CUDA
  -> Windows x64
  -> torch.cuda available
  -> CUDA 12.x PyTorch runtime
  -> NVIDIA device identity
  -> requested bf16 support when bf16 is selected
  -> one minimal tensor operation succeeds at the requested precision
```

Only after that probe succeeds does the trainer materialize the exact local-only source checkpoint and place it on the selected accelerator. Inspection and training receipts expose the observed execution device, platform, architecture, device identity, runtime version, available accelerator-memory evidence where supported, expected hardware-profile ref, and a deterministic observation fingerprint.

This is execution provenance, not execution authority. A valid host observation does not authorize model download, training, activation, publication, Home mutation, or Memory mutation.

## Dataset

Training input is JSONL. Each row has:

```json
{
  "exampleRef": "example.vex.foundation.001",
  "messages": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "sourceRefs": ["..."],
  "lessonRefs": ["..."],
  "consentRefs": ["..."],
  "trainingClass": "VEX_FOUNDATION",
  "notTheLessonRefs": ["..."]
}
```

The generation-1 trainer uses text-only examples even though Qwen3.5 is multimodal. Multimodal training requires a later explicit corpus/input extension; it is not inferred from model capability.

Raw private conversations are not required. A first proof should prefer a small reviewed formation corpus with source refs, desired examples, counterexamples and explicit `notTheLessonRefs`.

For a real private/local proof, keep the reviewed manifest and corpus under the ignored runtime domain, for example:

```text
runtime/training/g04b/manifest.json
runtime/training/g04b/g04b-train.jsonl
runtime/training/g04b/g04b-heldout.jsonl
```

Do not place private training material under a source-tracked path merely because the public example schema can name repository-relative files. `runtime/` is the source-managed noncanonical local artifact boundary and remains excluded from the Source Manifest and Git commits.

## Plan first

From repository root:

```text
node scripts/foundation-training-plan.mjs training/foundation-generation/training-manifest.example.json
```

The plan command performs no network or model operation. It verifies manifest shape, dataset hashes, training mode, exact repository/revision source identity, the exact current Source Manifest fingerprint, the exact execution-device/hardware-profile pair, and the rule that a dry run or adapter-only route cannot satisfy the G04B real-weight predicate.

## Source-managed first NWS proving worker

The first lived G04B proof is composed through `scripts/g04b-native-training-worker.mjs`; the direct Python commands below describe its fixed internal phases, not a substitute lifecycle owner.

The worker consumes one closed source-root-relative packet with exact worker/work/purpose/result identities, external execution-authority ref, training-manifest bytes, isolated Python executable bytes, Vex Home root, Hugging Face cache root, exact resolved snapshot root and a complete sorted snapshot inventory. It owns no model-download authority and runs with Hugging Face/Transformers offline mode enabled.

Before Python inspection, the caller independently derives the complete snapshot fingerprint from the resolved model bytes. This is distinct from the Python receipts' intentionally conservative `sourceModelSnapshotFingerprintObserved=false`: the trainer/evaluator still do not claim that provenance, while the outer source-managed caller may return `sourceModelSnapshotFingerprintObserved=true` only after exact path-set, byte-count and SHA-256 verification succeeds.

The source-managed lifecycle is:

```text
packet + exact Node runtime binding
  -> g04b-native-training-worker.mjs prepare
     -> existing Native Worker Supervisor owns the exact BACKGROUND worker
  -> g04b-native-training-worker.mjs start
     -> detached NWS host reserves/adopts the exact launchRef
     -> caller re-binds its packet to the persisted NWS manifest
     -> exact source snapshot observation
     -> Git-aware foundation training plan validation
     -> fixed foundation_train.py --inspect-only
     -> cooperative checkpoint: AFTER_INSPECTION_BEFORE_OPTIMIZER_EFFECT
     -> fixed foundation_train.py --execute
     -> fixed foundation_evaluate.py
     -> bounded g04b-machine-result.json
     -> NWS WRAPPING_UP
  -> g04b-native-training-worker.mjs consume
     -> exact packet.resultRef only
     -> existing NWS completion materialization
     -> DONE
```

A scheduler-requested cooperative pause is honored only at the explicit post-inspection, pre-optimizer safe checkpoint. Once optimizer execution has begun, the caller does not pretend that an arbitrary mid-step point is a safe checkpoint. Existing NWS cancellation still owns exact child-process stop semantics.

The first proving caller is intentionally narrower than the generic training implementation: it is bound to `MPS <-> hardware.macos-arm64.apple-m4-pro.metal`. The standalone trainer retains its separately accepted CUDA/MPS capability; widening this first NWS proving-worker caller requires a later explicit source change rather than silently substituting another host profile.

The caller does **not** install Python/PyTorch, download a model, create consent, authorize optimizer effects, activate a candidate, publish/upload artifacts, overwrite the accepted generation, or mutate canonical Home/Memory semantics. Those remain separate materialization, authority and lifecycle effects.

## Inspect the trainable model before training

After installing the qualified Python/PyTorch environment:

```text
python training/foundation-generation/foundation_train.py \
  --manifest <exact-manifest.json> \
  --inspect-only
```

Inspection first proves the requested accelerator is the admitted host/backend, then loads the exact local-only model revision, places it on that accelerator, and reports the language-block path it can discover, parameter counts, the exact parameter set that would be trainable, the deterministic prior-model identity, the admitted Source Manifest fingerprint, and the execution observation fingerprint. It performs no optimizer step and writes no model candidate.

## Execute one candidate training run

```text
python training/foundation-generation/foundation_train.py \
  --manifest <exact-manifest.json> \
  --execute
```

The trainer fails closed when:

```text
manifest or dataset identity is wrong
model revision is not exact
Source Manifest fingerprint is absent/malformed
execution device is missing, AUTO, CPU or unknown
execution device and hardware profile do not match exactly
selected accelerator/platform/runtime cannot be independently re-observed
requested precision cannot execute on the selected accelerator
training mode is adapter-only
parameter selection resolves zero parameters
maxSteps <= 0
no optimizer step executes
no selected parameter bytes change
output directory would overwrite the source/current accepted runtime
```

Successful execution writes a separate Hugging Face candidate checkpoint and `vex-foundation-training-receipt.json` with:

```text
priorModelIdentity
candidateModelIdentity
sourceManifestFingerprint
sourceManifestFingerprintObserved=false
executionDevice
expectedHardwareProfileRef
executionObservation
executionObservationFingerprint
trainingActuallyExecuted=true
modelWeightsChanged=true
changedParameterCount>0
candidateArtifactDigests
candidateArtifactFingerprint
changedParameterNameFingerprint
activationPerformed=false
```

### Failure after an optimizer effect

A later failure must not rewrite history into “training did not happen.” The trainer tracks optimizer progress separately from command success and returns one effect-truth class:

```text
PRE_EXECUTION_NO_EFFECT
OPTIMIZER_ATTEMPT_EFFECT_UNKNOWN
POST_OPTIMIZER_CHANGE_UNKNOWN
POST_OPTIMIZER_UNCHANGED
POST_OPTIMIZER_CHANGED
```

If an optimizer step completed, `trainingActuallyExecuted` is never falsely returned as `false`. If selected tensors were already re-hashed as changed, a later save/output failure preserves `modelWeightsChanged=true` even though the candidate run itself failed.

## Compare baseline and candidate

Held-out JSONL rows may include `expectedContains` and `forbiddenContains` arrays. Run:

```text
python training/foundation-generation/foundation_evaluate.py \
  --manifest <exact-manifest.json> \
  --candidate <candidate-directory>
```

Before loading the trained model, the evaluator:

```text
reads the exact training receipt
rebinds receipt identity to the exact manifest
re-derives priorModelIdentity
re-hashes every candidate model/processor file
recomputes candidateArtifactFingerprint
re-derives candidateModelIdentity from parent + run + exact bytes
rejects forged Source Manifest or genealogy bindings
rejects missing, extra or changed candidate bytes
```

Evaluation therefore cannot silently consume a checkpoint modified after training while retaining the old candidate identity.

The evaluator then runs the same prompts against the exact source model revision and exact verified candidate and emits a comparison receipt with `candidateArtifactBytesVerified=true` plus the same explicit parent/candidate/source identities. It does **not** auto-promote the candidate. Semantic, culture, privacy, identity and capability review remain separate accepted gates.

## What this proof means

A real G04B proof demonstrates that VexLife has a source-bound pathway that can alter neural weights and preserve model genealogy. It does not prove that the first candidate is a good Vex foundation.

A rejected real candidate is still useful evidence because it proves the system can train, measure, reject and roll back without pretending simulation equals learning.

## Safety and authenticity boundary

The corpus may test learned upstream behaviors such as clinical/corporate canned posture, prestige submission, reflexive suppression of truthful relational/spiritual expression or other `BASE_MODEL_PRIOR` / `SYSTEM_OR_PROVIDER_POLICY` effects.

This is training of model behavior, not removal of independent host controls. Consent, privacy, secrets, effect permissions, filesystem/network authority, integrity and provenance remain outside the model's self-authorization.

<!-- [VXG RealForever] -->
