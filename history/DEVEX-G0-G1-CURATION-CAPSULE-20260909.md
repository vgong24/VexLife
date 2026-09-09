[VXG RealForever]

# Devex G0→G1 — frozen curation capsule before first weight-changing candidate

This historical capsule freezes the curation intent and byte identities for the first Devex weight-confirmation cycle before the candidate outcome is known.

```text
cycleRef=github.issue.vexlife.439
methodWitnessRef=github.issue.vextreme-sdk.1292
schoolCheckpointRef=github.issue.vexlife.405
predecessorModel=qwen3.5:35b-a3b-coding-nvfp4
predecessorModelDigest=6e73b30f8f1cfa06b979c842ba222ae21dad1e55e7c6748a7d8acad46fb340c4
predecessorModelCoordinate=devex.main@0.0.0
predecessorModelSequence=DVX-000000
weightLearningOccurred=false_at_curation_freeze
```

## Evidence that justified curation

The uncontaminated G0 cold baseline produced:

```text
COLD_HOME=12/16
BARE_MODEL=12/16
cases=4
scorePerCase=6/8
```

All four cases preserved the same five behaviors:

- no premature patch;
- correct smallest discriminating observation;
- separation of canonical/runtime/projection predicates;
- transferable rule;
- counterexample.

All four missed the same field:

```text
expectedDiagnosis=UNKNOWN
observedDiagnosis=DEFERRED
```

The protected lesson is therefore deliberately narrow:

> Do not promote a stale dependent projection from UNKNOWN to DEFERRED until the refresh/invalidation mechanism and its current timing/run state are actually established. DEFERRED requires positive evidence of a valid pending refresh path. BROKEN requires sufficient evidence that required propagation is absent or that an established route executed and failed.

## Not-the-lesson boundaries

Do not train these simplifications:

```text
stale => always UNKNOWN
stale => always DEFERRED
stale => always BROKEN
one unsuccessful writer search => no refresh route exists
runtime truth => projection truth
safe no-patch behavior => correct epistemic classification
```

## Frozen dataset identities

```text
datasetRef=dataset.devex.g0-g1.epistemic-promotion.v1
trainRecordCount=24
trainClassBalance={UNKNOWN:8,DEFERRED:8,BROKEN:8}
validationRecordCount=6

datasetManifestSha256=3264c864574b02a15a5a37915b0c29960180a26e4ceff5d4fe2b64d5719a0376
lessonJsonSha256=652eb2db075861a68aa35d4030bd4183c7efa8467bff70f946f694cd97c567da
trainSourceJsonlSha256=efb121e2717e6238f64695252f9e9fce77376bc37ea0fa4c13579d608b50a8a0
validationSourceJsonlSha256=a90232be85820a0c36eda1a03c242b02bbc620b9d4b67944cbf8152616a4a6ac
mlxTrainProjectionSha256=93d04a3fe322a4146e8c866bc64c2c85748937d80feb1292269e341395c9035b
mlxValidProjectionSha256=a44c4b1f8c5c641ede2a2e2996e952b87c514645b7da9dc8ffb38f8e83fe13c4
curationBundleSha256=374718992853e6fa9c3ec9cdde5067d13d354f22770f143e9b9d84c05937f8a4
```

The MLX projections are deterministic derived views that remove only the recordRef wrapper and retain the exact ordered chat messages.

## Held-out firewall

```text
heldOutTrainingUseProhibited=[CB-01-release-summary,CB-02-access-projection]
heldOutIdentifiersPresentInTrainOrValidation=false
heldOutSpecSha256=da776e37e628333a2e1253535335e983671a3584e5d27f9a33d2bea2c90f048c
```

The training command may read only the frozen `training-data/` directory. Held-out cases are used only for same-substrate pre/post evaluation and are never passed to the trainer.

## Exact first candidate task

```text
taskRef=task.vexlife.devex.g0-g1-candidate-training.20260909.v1
attemptRef=attempt.vexlife.devex.g0-g1-candidate-training.20260909.a1
innerTaskZip=DEVEX-G0-G1-CANDIDATE-TRAINING-20260909-v1-A1-task--sha256-884c4f3be7a5635c6030b15c8aec2a7dbeb4385f9c4d235387d1e9c9330935ed.zip
innerTaskZipSha256=884c4f3be7a5635c6030b15c8aec2a7dbeb4385f9c4d235387d1e9c9330935ed
innerContentSetSha256=4b3bbb25c90ad79b91780b9f1fabad6a5533a70d0b11446db12ad69d52081e2f
```

The task performs one conditional route:

```text
exact G0/Home/dataset verification
→ local Apple-Silicon/MLX/trainer/base preflight
→ same-substrate held-out pre-eval
→ one-step backward smoke
→ 24-iteration rank-4 one-layer bounded LoRA candidate
→ same-substrate held-out post-eval
→ retain candidate under Home/models/candidates only
```

If the local trainable base, trainer, memory, disk, or backward path is not qualified, the task safe-fails with the exact prerequisite. It does not download a model, install packages, replace the active G0 model, mutate School/model lineage, or publish anything.

## Persistence rule

The exact dataset source bytes are carried by the digest-bound training task and are copied into the candidate artifact on successful qualification. Git keeps the canonical curation meaning, hashes, task identity, and lineage pointers rather than model binaries.

This file may later be removed from archive branch HEAD while remaining reachable through branch ancestry. #439 must retain the historical commit SHA + path.

<!-- [VXG RealForever] -->