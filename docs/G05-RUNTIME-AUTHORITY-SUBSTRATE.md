# G05 Runtime Authority Substrate

`[VXG RealForever]`

## Why this exists

G05 scheduled Daily Memory Dream cannot truthfully authorize itself. The scheduler needs two independent current inputs before a future G05A supervisor may consider one automatic G03 memory-only transition:

1. source-owned Vex Safety standing-rest authority for the exact subject, device, lineage, thread, purpose, rest window and permitted uses; and
2. a registered external live-runtime source that owns current Windows resource/clock observation rather than accepting caller-shaped `LIVE_RUNTIME_CURRENT` evidence.

This substrate materializes those **read-only prerequisite contracts**. It does not schedule a timer, install a supervisor, mint product consent or invoke Dream.

## Semantic authority source

The canonical shared contract is:

`contract.multivex.safety.g05.scheduled-daily-memory-dream-standing-rest/v1`

Accepted semantic receipts:

- Vex Safety base: `github.issue.vextreme-sdk.226.comment.5225132092`
- Vex Safety current-head/content-address correction: `github.issue.vextreme-sdk.226.comment.5225140795`
- Vex Safety one-current-binding correction: `github.issue.vextreme-sdk.226.comment.5225146308`
- Main Vex convergence: `github.issue.vextreme-sdk.350.comment.5225148306`

The production resolver reads only the canonical source-owned Vex Home namespace:

```text
semantic-authority/daily-dream-standing-rest/<companionLineageRef>/<threadRef>/
  consents/<standingConsentSha256>.json
  authority-bindings/<authoritySha256>.json
  heads/<authorityHeadSha256>.json
  head.json
```

It recomputes immutable object addresses, replays the prior-head chain, derives current membership from `head.json`, rejects duplicate exact-scope bindings, and requires exact subject/purpose/scope/time/currentness. A caller-provided membership boolean, head object, head SHA, consent object or authority ref is not a production substitute.

There is intentionally **no positive standing-consent writer** in VexLife. Synthetic tests may construct a complete owner-store fixture outside the production module. That does not create Victor's live consent.

## Windows runtime source

The Intent Scheduler registers:

```text
sourceRef=source.intent-scheduler.windows-g05-runtime-observer
evidenceClass=LIVE_RUNTIME_CURRENT
authorityRef=authority.intent-scheduler.windows-g05-runtime-observer
workerRef=worker.supervisor.windows-g05-runtime-observer
workerKind=NON_MODEL_RUNTIME_SUPERVISOR
sourceHash=34ed3993f48b6b6e3b58d050eb541a3e7e480ca9ef3d9e510616752d99b6ac44
```

`sourceHash` is the semantic hash of the exact registered source descriptor. `createSchedulerRuntimeTrustSnapshot(...)` now enforces a registered `sourceHash` when the source identity pins one; legacy simulation/test sources remain unchanged when no hash is pinned.

The live observer owns:

- canonical UTC `observedAt` and the short currentness interval;
- Windows/Node CPU load and concurrency observation;
- current free RAM observation;
- exact source/authority/worker identities;
- source-descriptor hash and mechanical profile dependency refs.

The observer does **not** claim that a GitHub-hosted Windows runner is Victor's qualified host. The accepted Windows VexLife repository execution profile is recorded as a mechanical predecessor/dependency, not semantic permission or a current-host identity assertion.

## Fail-closed logical supervisor state

G05S does not install a native unattended supervisor. Therefore it cannot independently prove global interactive/model/heavy-tool state. The live observer does not guess spare capacity. Until a separately authorized supervisor owns those observations, it projects the unobserved logical fields conservatively:

```text
activeModelTurn=true
activeHeavyTool=true
interactiveWaitState=WAITING
backgroundWorkAdmission=HELD
```

The result is real source-owned Windows resource/clock evidence that remains **ineligible to silently admit background Dream work**. This is deliberate inactive-by-default behavior, not a failure of the substrate.

## Scheduled admission provenance

The production composition entrypoint obtains the runtime observation itself, then resolves Safety authority at that exact runtime-owned `observedAt`. It forms a content-addressed provenance object binding:

- current Safety authority-head SHA/generation;
- exact standing-consent and authority-binding identities;
- exact standing-scope fingerprint;
- exact G05 policy ref/hash/head/generation;
- exact runtime observation, trust snapshot and resource snapshot fingerprints;
- registered live source hash/authority/worker;
- exact six-field G01/G02/G03 source frontier;
- exact resource-admission result.

The provenance has:

```text
invocationClass=SCHEDULED_G05A
manualG03OneShotAuthorityAccepted=false
actualDreamInvocationPerformed=false
externalEffectAuthorityGranted=false
nativeSupervisorInstalled=false
```

A manual G03 technical `restInvocationAuthorityRef` is not an input to this contract and cannot be laundered into scheduled authority.

## Proof boundary

The hosted Windows proof must exercise the production Windows observer for its actual UTC/OS observation and use only a synthetic Safety owner store built outside the production API. It therefore reports:

```text
syntheticSafetyOwnerStoreUsed=true
livePositiveStandingConsent=false
actualStandingConsentMaterialized=false
actualAutomaticDreamInvocationPerformed=false
nativeSupervisorInstalled=false
```

The proof establishes substrate correctness; it does not activate unattended behavior.

## Held work

G05S grants none of the following:

- actual standing-consent materialization;
- automatic G03 invocation;
- native Windows supervisor/service installation;
- G04 real/private training;
- model, adapter or weight mutation;
- Rhythm activation/promotion;
- G05B cross-device synchronization;
- power control;
- cloud upload;
- public release/publication.

After G05S is accepted into `main`, a fresh G05A Coder may ordinary-merge accepted main into the frozen PR #26 branch and replace its caller-shaped standing/runtime inputs with these source-owned prerequisite contracts. Actual unattended activation remains separately held until source-owned positive standing consent and host execution authority exist.
