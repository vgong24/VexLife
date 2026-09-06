# Local Operations second-lens review — Devex Interaction Control

Continuity: `[VXG RealForever]`

Review class:

```text
reviewClass=SAME_INSTANCE_SECOND_LENS
independentAssurance=false
formalApproval=false
mergeAuthority=false
executionEnvironment=LOCAL_SAFE_SYNTHETIC
realMacRuntimeMutation=false
```

## Assumptions challenged

### A1 — “Ctrl+C means kill the process”

Rejected. Lived evidence shows the desired action is normally turn-scoped. Shared Ollama must survive. Process termination belongs to the existing lifecycle owner and is a separate escalation.

### A2 — “If a tool is running, Stop can always abort it immediately”

Rejected. Some tools or external effects may already be beyond a safely cancellable boundary. The controller therefore returns `STOP_AFTER_ACTIVE_TOOL` for non-abortable tool execution and suppresses successor rounds.

### A3 — “Unknown slash commands can safely fall through to the model”

Rejected. `/quiy` proved this creates avoidable model work, hidden busy-state input, and misleading conversation evidence. Unknown slash commands are local rejects.

### A4 — “One controller should own rollback/recovery”

Rejected. Existing runtime-recovery and lifecycle sources already own recovery, rollback evidence, and process lifecycle. This feature is a bounded interaction-control seam.

### A5 — “Cancellation token identity can be invented locally”

Rejected. Current context leases already carry `cancellationTokenRef`. The controller accepts/binds that ref; it does not define a second cancellation authority.

## Deterministic cases

The current unit suite checks:

```text
IC-00 phase/action map
IC-01 /quiy -> local UNKNOWN_COMMAND + /quit suggestion
IC-02 normal text != command
IC-03 known slash command + args remains local
IC-04 deterministic suggestion tie behavior
IC-05 inference stop aborts exact active turn
IC-06 repeated Stop is idempotently pending
IC-07 non-abortable tool settles then blocks successors
IC-08 abortable tool receives abort signal
IC-09 composition Ctrl+C clears input only
IC-10 graceful close != turn stop
IC-11 cancellationTokenRef continuity
IC-12 session close rejected during active turn
```

## Held gaps

- Real Home adapter has not yet been source-merged.
- Real Ollama socket abort behavior still needs Mac qualification after an adapter package exists.
- Tool contracts do not yet expose a universal `abortable` capability; runtime adapters must fail conservative (`abortable=false`) when unknown.
- A graphical VexInterface may choose visible draft preservation while busy; the current semantic controller intentionally does not prescribe that presentation.
- This same-instance review cannot satisfy any requirement for independent assurance or formal reviewer approval.

## Review disposition

```text
semanticController=PASS_FOR_DRAFT_SOURCE_PLACEMENT
unknownCommandBoundary=PASS
modelAbortContract=PASS_AT_SYNTHETIC_SIGNAL_LEVEL
toolStopAfterBoundary=PASS
rollbackSeparation=PASS
sharedOllamaPreservation=PASS_BY_SCOPE_NOT_REAL_HOST_PROOF
realMacAdapterQualification=HELD
B1Resume=HELD_UNTIL_RUNTIME_ADAPTER_QUALIFIED
```

<!-- [VXG RealForever] -->
