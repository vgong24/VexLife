# VexLife Native Worker Supervisor

`[VXG RealForever]`

## Purpose

This module is the first source-managed embodiment between the accepted Process Factory / Intent Scheduler contracts and an exact-owned local OS worker.

It is intentionally **not** a second scheduler, not a replacement Process Factory, not VexLocalBridge long-job mode, and not an always-running expensive semantic model.

```text
Durable Vex purpose / workgraph
  -> Process Factory compiles one exact plan (no effect)
  -> current authority + runtime binding admit execution
  -> Native Worker Supervisor owns one exact local worker
  -> durable worker receipts + quiet Work Pulse
  -> terminal result remains WRAPPING_UP
  -> result consumer verifies / understands it
  -> explicit completion record
  -> DONE
  -> scheduler / tool-result relay may re-enter semantic Vex only when meaning requires it
```

## Foreground conversation and parallel work

The existing Intent Scheduler remains the scheduling owner. Interactive work outranks background work. A user turn therefore does not erase a background worker or require the same LLM context to remain alive while the worker executes.

```text
USER_INTERRUPTION != ACTIVE_TRAJECTORY_RESET
BACKGROUND_WORKER != FOREGROUND_CONVERSATION_CONTEXT
WORKER_TERMINAL != SEMANTIC_COMPLETION
```

A worker's durable state is stored beneath the caller-selected Vex Home runtime domain. Semantic context may rotate independently.

## Closed worker manifest

The manifest contains stable refs plus exact argv. It contains no arbitrary command string or shell switch. The executable is resolved through a separate machine-local runtime binding and its bytes are SHA-256 verified before preparation.

Disk presence is not effect authority. `executionAuthorityRef` binds the requested execution to an external authority record; this supervisor does not validate or manufacture that authority by itself.

## Worker states

Machine state is intentionally richer than human presentation:

```text
NOT_ACTIVE
STANDING_BY
STARTING
WORKING
WAITING
PAUSE_REQUESTED
PAUSED
CANCEL_REQUESTED
CANCELLED
WRAPPING_UP
DONE
NEEDS_ATTENTION
```

`STARTING` is the durable run reservation. It is written before a detached supervisor host or payload may be spawned. Only the holder of the exact `launchRef` recorded by that reservation may adopt it and move the worker to `WORKING`. A second launcher therefore cannot pass the runnable boundary merely because the first host has not yet scheduled.

A PAUSE or CANCEL that wins the same mutation boundary while the worker is still `STARTING` changes durable state before payload spawn. The reserved host then fails adoption and no payload starts. `STARTING -> PAUSED` therefore truthfully means no child was started; `STARTING -> CANCELLED` records `HUMAN_CANCEL_REQUEST` with `payloadStarted=false`.

`PAUSE_REQUESTED` is **not** projected as Paused. A running process remains human-visible as Working until a cooperative worker actually yields. This prevents the UI from claiming that compute stopped when it did not.

The generation-1 cooperative yield convention is exit code `75` after the worker observes `VEX_WORKER_CONTROL_PATH` and reaches its own safe checkpoint. A worker that does not implement that contract simply continues until terminal; the supervisor never fakes a frozen process.

A deliberate exact-owned running cancel is distinct from failure:

```text
WORKING
  -> CANCEL_REQUESTED
  -> exact owned child receives stop request
  -> CANCELLED
```

`CANCELLED` is a safe terminal work state, not `DONE` and not `NEEDS_ATTENTION`. Its terminal evidence carries `stopReason=HUMAN_CANCEL_REQUEST`. An uncontrolled child failure still becomes `NEEDS_ATTENTION`.

If a successful child terminal result wins before cancellation is actually observed by the owning supervisor, that successful result remains `WRAPPING_UP`; a later control must not retroactively relabel already-returned work.

## Cross-process single-writer truth

Every lifecycle mutation is serialized through one per-worker mutation lock inside the supervisor boundary. The lock covers the read-current / validate-transition / allocate-generation / write-receipt / move-current-pointer critical section.

```text
read current
  -> acquire exact per-worker mutation ownership
  -> validate expected state / launchRef
  -> create immutable next-generation receipt with no-clobber semantics
  -> atomically move current.json
  -> release mutation ownership
```

The final STARTING verification, payload spawn, and WORKING receipt are one serialized critical section. Therefore either a pre-spawn control transition wins or the exact payload spawn wins; there is no unlocked gap where both can claim ownership.

Receipt generation files are created with exclusive no-clobber semantics. A same-name generation collision is a hard failure rather than an overwrite.

The mutation lock is deliberately fail-closed. If a process dies while holding it, later mutation does **not** infer that the lock is stale and delete it automatically. Status remains readable, but further mutation returns an attention condition until an independently qualified recovery path proves the prior owner is gone and reconciles the durable state. This avoids PID folklore or timeout-based ownership theft.

This serialization applies to run reservation, worker-state transitions, control requests, waiting/standby transitions and completion consumption. Two concurrent completion consumers cannot create two `DONE` truths.

## Quiet Work Pulse

Human projection changes only when meaning changes:

```text
STARTING/WORKING healthy green + Working
STANDING_BY      primary blue + Standing by
WAITING          attention yellow + one bounded reason
PAUSED           ⏸ + Paused
CANCELLED        × + Cancelled
NEEDS_ATTENTION  blocked red + one bounded reason/action
WRAPPING_UP      blue transient + result awaiting consumption
DONE             ✓ + compact completion summary
NOT_ACTIVE       neutral/resting; normally hidden
```

Pause intentionally uses the **single `⏸` symbol** rather than stacking a blue state marker onto it. Color is never the sole signal. Cancelled is also neutral rather than red: a deliberate safe stop is not an error condition.

Internal heartbeat/process observations belong in machine state and logs; unchanged observations do not become human notifications.

## Control lifetime

`control.json` is the mutable **current** control edge, not the historical record. Immutable receipts retain the audit truth.

Each run records the control generation that already existed when it was reserved, so the supervisor never treats an older control as a new request. When a running PAUSE or CANCEL reaches the safe terminal `PAUSED` or `CANCELLED` state, that durable terminal receipt is written first and the consumed mutable `control.json` is then retired before the mutation lock is released.

```text
old control = historical receipt truth
current control = only a still-live request
```

This matters for cooperative workers because they can read `VEX_WORKER_CONTROL_PATH` directly. A resumed worker must not immediately obey yesterday's PAUSE merely because an old mutable control file remained on disk.

## Completion truth

A successful child exit creates `WRAPPING_UP`, never `DONE`.

`DONE` requires a separate completion input containing:

```text
resultRef
machineCompletionRecord
humanSummary
```

The full machine record remains durable truth. The human summary is a bounded projection of that record for ordinary interaction.

```text
machine completion record != human summary
human summary != second truth source
```

Completion materialization itself is exclusive. The first accepted consumer writes `completion.json` and the one `DONE` generation inside the same mutation boundary; a second consumer re-observes `DONE` and is rejected rather than overwriting the record.

## Persistence and recovery

Each worker gets:

```text
<VexHome>/runtime/native-workers/<workerRef>/
  manifest.json
  binding.json
  host.json
  current.json
  control.json              only while one current running control remains live
  completion.json           only after result consumption
  .mutation-lock/           only while one lifecycle mutation owns the boundary
  receipts/
  stdout.log
  stderr.log
  supervisor.log            detached host launcher
  supervisor.err.log
```

Receipts are immutable generation files. `current.json` is an atomic pointer containing the exact receipt SHA-256. A missing/malformed/torn pointer fails closed instead of reconstructing a running worker from PID folklore.

The first source stage does not implement automatic stale-lock repair or post-crash process adoption. Those require later host-qualified recovery evidence. A stale mutation lock therefore represents a bounded recovery/attention condition, not permission to start a replacement worker.

## Detached host

`native-worker-supervisor.mjs start` first commits the exact `STARTING` reservation and `launchRef`, then launches a detached Node host carrying that exact launch identity. The host must adopt the same reservation before it can spawn the payload. The host owns the payload child directly and writes durable lifecycle state. This lets the initiating UI/semantic context return immediately without killing the work while preventing duplicate near-simultaneous starts.

The first source stage does not install a native service or auto-start VexCore at boot. Platform service installation and lived host qualification are later effects.

## G04B / Birth

G04B foundation training is the first intended lived consumer after this source is accepted and host-qualified.

The worker supervisor does not itself:

```text
install Python/PyTorch
download a model
select training data
create consent
execute training without admitted authority
activate candidate weights
overwrite accepted Vex
mutate canonical Memory
publish artifacts
```

Those remain independently bound by the G04B training manifest, runtime-dependency materialization, consent/effect envelopes, evaluator and rollback policy.

<!-- [VXG RealForever] -->
