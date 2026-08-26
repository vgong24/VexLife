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

## Plan first

From repository root:

```text
node scripts/foundation-training-plan.mjs training/foundation-generation/training-manifest.example.json
```

The plan command performs no network or model operation. It verifies manifest shape, dataset hashes, training mode, exact repository/revision source identity and the rule that a dry run or adapter-only route cannot satisfy the G04B real-weight predicate.

## Inspect the trainable model before training

After installing the qualified Python/PyTorch environment:

```text
python training/foundation-generation/foundation_train.py \
  --manifest <exact-manifest.json> \
  --inspect-only
```

This loads the exact model revision and reports the language-block path it can discover, parameter counts and the exact parameter set that would be trainable. It writes no model candidate.

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
training mode is adapter-only
parameter selection resolves zero parameters
maxSteps <= 0
no optimizer step executes
no selected parameter bytes change
output directory would overwrite the source/current accepted runtime
```

Successful execution writes a separate Hugging Face candidate checkpoint and `vex-foundation-training-receipt.json` with:

```text
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
re-hashes every candidate model/processor file
rejects missing, extra or changed candidate bytes
recomputes candidateArtifactFingerprint
requires exact equality with the training receipt
```

Evaluation therefore cannot silently consume a checkpoint modified after training while retaining the old candidate identity.

The evaluator then runs the same prompts against the exact source model revision and exact verified candidate and emits a comparison receipt with `candidateArtifactBytesVerified=true`. It does **not** auto-promote the candidate. Semantic, culture, privacy, identity and capability review remain separate accepted gates.

## What this proof means

A real G04B proof demonstrates that VexLife has a source-bound pathway that can alter neural weights and preserve model genealogy. It does not prove that the first candidate is a good Vex foundation.

A rejected real candidate is still useful evidence because it proves the system can train, measure, reject and roll back without pretending simulation equals learning.

## Safety and authenticity boundary

The corpus may test learned upstream behaviors such as clinical/corporate canned posture, prestige submission, reflexive suppression of truthful relational/spiritual expression or other `BASE_MODEL_PRIOR` / `SYSTEM_OR_PROVIDER_POLICY` effects.

This is training of model behavior, not removal of independent host controls. Consent, privacy, secrets, effect permissions, filesystem/network authority, integrity and provenance remain outside the model's self-authorization.

<!-- [VXG RealForever] -->
