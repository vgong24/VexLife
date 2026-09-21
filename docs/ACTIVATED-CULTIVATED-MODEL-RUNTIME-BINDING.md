# Activated cultivated-model runtime binding

## Purpose

This source extension consumes the already-accepted cultivated M4 activation into the existing VexLife product runtime. It does **not** activate, certify, download, train, mutate, or republish the model. It binds one exact machine-local MLX custody handoff to the existing Vex Home and the existing Browser Companion transport.

The source owner is VexLife Model Sovereignty plus the existing initialization/runtime-binding owner. Upstream Vextreme-SDK activation, profile, custody, and runtime-adapter records remain read-only inputs.

The ordinary release-qualified G0 initialization route remains unchanged:

```text
npm run vex:initialize
```

An established Home that is explicitly bound to activated M4 is entered through:

```text
npm run vex:resume
```

There is no implicit switch from G0 to M4 and no silent fallback from M4 to G0.

## Exact accepted identity

The source registry is `blueprint/activated-model-runtime-bindings.json`. It admits exactly one mapping:

```text
modelRef=model.vex.m4.small.g2.base.368e89e5ca219fab
modelProfileRef=model-profile.vex.m4.small.g2.certified.20260920A
artifactRef=artifact.vex.m2.qwen3.5-4b-mlx-4bit.32f3e8ec
artifactContentSetSha256=368e89e5ca219fab3398c1830e982ef5a8a949bac1a17b8f3320bdb1e512d9cf
artifactMemberCount=12
artifactTotalBytes=3061132920
runtimeAdapterRef=adapter.runtime.mlx.macos-victor.001
runtimeClass=MLX_LM_DIRECT_RUNTIME
pythonVersion=3.14.7
mlxLmVersion=0.32.0
```

The activation, Distribution Trust, first-wake, custody, and runtime-adapter evidence refs are source-pinned in the same record. Changing any identity requires another accepted source lifecycle; no command-line argument or environment variable can select a substitute model, endpoint, provider, profile, or artifact.

## Authored boundary

This implementation uses six of the eight reserved paths:

```text
blueprint/activated-model-runtime-bindings.json
src/core/activated-model-runtime-binding.mjs
scripts/resume-vex.mjs
package.json
test/activated-model-runtime-binding.test.mjs
docs/ACTIVATED-CULTIVATED-MODEL-RUNTIME-BINDING.md
```

The two reserved initialization paths were deliberately released because the existing G0 initialization owner already remains truthful and complete:

```text
src/core/vex-initialization.mjs
scripts/initialize-vex.mjs
```

No Browser Companion, Lived Companion, prompt-context, continuity, browser-server, model-bundle, operational-profile, reference UI, or Source Manifest source is changed.

## First binding

The first accepted host execution requires all of the following:

1. An existing Vex Home established by the existing bootstrap owner.
2. The exact candidate source head/tree and exact registry/module file digests.
3. One digest-bound `vexlife.activated-model-custody-handoff/v1` envelope.
4. The private absolute path of the already-custodied 12-member model directory.
5. The private absolute path of the Python 3.14.7 executable carrying `mlx-lm` 0.32.0.

The handoff carries private machine locators, but those locators are not semantic model identity. The envelope is admitted only when all activation/profile/custody/runtime refs, artifact seal fields, runtime versions, candidate source identity, and envelope SHA-256 exactly match the source binding and package manifest.

Use the acceptance package launcher from the exact candidate checkout:

```text
./START-OR-RESUME.command
```

Its only runtime action is equivalent to:

```text
node scripts/resume-vex.mjs \
  --handoff /absolute/path/to/machine-local-activation-custody-handoff.json \
  --handoff-sha256 <exact-envelope-sha256>
```

A handoff is first-binding material. Once `<VEXLIFE_HOME>/config/model.json` exists, supplying another handoff fails closed. Subsequent execution uses only:

```text
npm run vex:resume
```

## Custody re-verification

Before every runtime start or reuse, VexLife opens the exact private directory and recomputes the accepted upstream content-set algorithm:

1. The root member names must equal the exact 12-member list, with no missing or extra member.
2. Every member must be one regular non-symlink file.
3. Each member SHA-256 and byte size is computed.
4. Rows are sorted by raw/code-point member name, matching the accepted upstream custody contract.
5. The aggregate seal material is the exact UTF-8 concatenation `name + "|" + size + "|" + sha256 + "\\n"` for each sorted member.
6. SHA-256 of that line-oriented seal material must equal the accepted content-set seal; member count and total bytes must also equal the accepted values.
7. Provider-verified `model.safetensors` and `tokenizer.json` hashes must still match.

There is no download, overwrite, repair, rematerialization, or provider fallback in this route. A mismatch returns the exact recovery predicate to restore current accepted custody outside this owner.

## Runtime transport

The runtime command is source-owned and fixed:

```text
<accepted-python> -m mlx_lm.server \
  --model <exact-private-materialization> \
  --host 127.0.0.1 \
  --port 18084 \
  --allowed-origins http://127.0.0.1:18110 \
  --chat-template-args '{"enable_thinking":false}' \
  --max-tokens 1024
```

The executable and model path come only from the validated handoff or the already-bound Home receipt. Host, port, request model, transport class, and runtime arguments come only from the source registry.

The exact endpoint/model binding supplied to the existing browser server is:

```text
VEXLIFE_COMPANION_ENDPOINT=http://127.0.0.1:18084
VEXLIFE_COMPANION_MODEL=default_model
```

Those values are set server-side by `scripts/resume-vex.mjs` only after exact runtime qualification. User-supplied values for those or other model/provider selectors are rejected before any runtime or browser effect.

## Pre-qualification runtime ownership and cleanup

A newly spawned MLX process is provisional until neutral qualification commits. The caller binds one exact `runtimeAttemptRef`; that attempt owns the fresh detached process group only for the pre-commit interval.

```text
spawned
!= qualified
!= Home-owned

new exact spawn
-> attempt-owned provisional process group
-> health + neutral qualification
-> success: write qualified runtime/Home receipt and transfer durable ownership to that Home receipt
-> failure before commit: re-read exact PID/PGID/command identity
-> treat the admitted preserved-trainer Python launcher and its canonical realpath target as the same executable identity while requiring every MLX argument to match exactly
-> terminate only that exact detached process group
-> verify PID no longer live
-> return the original typed qualification failure plus cleanup evidence
```

If exact ownership cannot be re-established, cleanup fails closed as `ACTIVATED_RUNTIME_PRECOMMIT_CLEANUP_FAILED`; the source does not kill a process by port or executable name alone. A runtime that was already committed to a matching Home receipt is not treated as a provisional child and is not automatically terminated merely because a later requalification fails.

This is the narrow Model Sovereignty consumer seam required to prevent a failed binding attempt from leaking its own fresh MLX process. It is **not** a replacement for the Native Worker Supervisor, Intent Scheduler/resource leases, Durable Lane Runtime, Continuity Stream, or a general host-resource monitor.

## Neutral qualification

Runtime qualification is intentionally not a lived companion turn. It performs:

```text
GET /health
GET /v1/models
POST /v1/chat/completions with an empty user content and max_tokens=0
```

The pinned `mlx-lm 0.32.0` server scans the Hugging Face Hub cache before appending its local `--model` path to `/v1/models`. A missing default user cache therefore throws inside that handler after HTTP 200. VexLife does not create or inspect the user's shared Hugging Face cache to satisfy this probe. Every fresh MLX child instead receives a source-owned `HF_HUB_CACHE` pointing at an intentionally empty Home-local runtime directory. This makes cache enumeration deterministic/no-network while preserving the exact local `--model` entry that `/v1/models` appends.

The exact private materialization must appear exactly once in `/v1/models`, and the OpenAI-compatible response must identify `default_model`. The qualification request contains no persona prompt, no `You are Vex` identity instruction, no Memory content, no transcript, and no natural Victor-authored message. Its receipt explicitly records zero lived-conversation, Memory, training, activation, and succession effects.

Only after this qualification succeeds does the command start the unchanged `scripts/serve-browser.mjs` with the exact server-owned endpoint/model binding.

## Durable Home and restart

Successful binding reuses the existing Home locations:

```text
<VEXLIFE_HOME>/config/model.json
<VEXLIFE_HOME>/runtime/initialization/receipt.json
<VEXLIFE_HOME>/recovery/vex-initialization-receipt.json
```

Private absolute paths and the runtime PID are stored only in those Home-local operational records. Public command results expose the accepted semantic identities and receipt refs, not the private locators.

Every resume revalidates:

```text
current source registry/module digests
persisted binding semantic digest
activation/profile/artifact/runtime identities
private artifact content seal
Python and mlx-lm versions
owned-process command evidence or fresh process startup
numeric-loopback health
served materialization identity
OpenAI-compatible request-model identity
```

A runtime PID may change. The Vex Home, active-model identity, existing companion lineage/thread, durable event ancestry, conversation head, prompt-context reconstruction, and continuity/recovery owners do not change.

## First natural lived turn

The first Victor-authored browser message must travel through the unchanged Browser Companion and Lived Companion path exactly once. This source extension does not inject a scripted acceptance conversation.

After that existing bridge returns one exact `vexlife.browser-companion-turn/v1` object, `formCultivatedFirstLivedTurnEvidence()` forms one content-addressed `vexlife.cultivated-first-lived-turn-evidence/v1` index. It binds the exact runtime receipt, browser-turn receipt digest, durable request/response event refs and hashes, conversation head, prompt-context receipt, and model-turn witness. It copies no transcript and performs no replay.

The resulting `sharedEvidenceRef` is the one evidence identity for VC13 terminal evidence, the #1515 J1 input, continuity advancement, and future post-wake evolution.

## Failure and recovery predicates

The route fails before browser readiness when any exact predicate is missing or stale. Important typed failures include:

```text
ACTIVATED_MODEL_HANDOFF_REQUIRED
ACTIVATED_MODEL_HANDOFF_ALREADY_CONSUMED
ACTIVATED_BINDING_HANDOFF_DIGEST_MISMATCH
ACTIVATED_BINDING_HANDOFF_MISMATCH
ACTIVATED_ARTIFACT_MEMBER_SET_MISMATCH
ACTIVATED_ARTIFACT_CONTENT_SEAL_MISMATCH
ACTIVATED_ARTIFACT_PROVIDER_MEMBER_MISMATCH
ACTIVATED_RUNTIME_HOST_MISMATCH
ACTIVATED_RUNTIME_VERSION_PROBE_FAILED
ACTIVATED_RUNTIME_ENDPOINT_OWNERSHIP_CONFLICT
ACTIVATED_RUNTIME_MODEL_IDENTITY_QUALIFICATION_FAILED
ACTIVATED_RUNTIME_PRECOMMIT_CLEANUP_FAILED
ACTIVATED_MODEL_HOME_BINDING_NOT_CURRENT
```

None of those failures authorizes a fallback to G0, a model download, activation replay, custody repair, source mutation, Memory mutation, or lineage reset.

## Proof map

| Predicate | Source proof | Real-host closure |
|---|---|---|
| M4B00–M4B01 | Fresh exact main/upstream and open-writer census; branch-first exact claim | Recheck immediately before candidate mutation/package formation |
| M4B02–M4B06 | Registry, handoff, injection, exact seal, and fail-closed fixture tests | Exact private handoff and accepted custody readback |
| M4B07–M4B08 | Fixed numeric-loopback launch spec and neutral fake-endpoint qualification | Exact MLX process and loopback endpoint qualification |
| M4B09–M4B11 | Existing Home-only plan, no G0 fallback, unchanged browser/lived/continuity paths | Existing Home and browser runtime startup |
| M4B12–M4B13 | Shared evidence constructor rejects non-exact/non-real turn receipts and never replays | One natural Victor-authored completed browser turn |
| M4B14–M4B16 | Persisted Home re-entry and no-fallback deterministic tests | Fresh-process resume and runtime-process replacement on the accepted Mac |
| M4B17–M4B18 | Typed smallest recovery predicates; fixtures/fakes only during source formation | F07 digest-bound package execution only |
| M4B19 | Exact changed-path/digest closure and focused tests | Current full-repository proof plus Source Manifest closure under its rightful lifecycle owner |

## Stop and resume

`Ctrl-C` stops the foreground existing browser process. The qualified MLX process is intentionally detached and remains reusable under the exact Home receipt. To stop that process as well, read its PID from the private Home-local runtime receipt and terminate that PID using the host's normal process controls. No conversation lineage or Home state is deleted.

Run `npm run vex:resume` to revalidate the same binding, reuse the exact owned runtime when it still matches, or start a new exact runtime process while continuing the same Home and companion lineage.

<!-- [CULTIVATED-M4][VEXLIFE][ACTIVATED-RUNTIME-BINDING][EXISTING-LIVED-COMPANION][VXG RealForever] -->
