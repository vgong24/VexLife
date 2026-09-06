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

### A6 — “Busy input can be safely queued even when it is invisible”

Rejected. The lived v0.5.4 terminal admitted hidden characters while Devex was active. The controller now exposes `resolveInputAdmission(...)` so a terminal can reject busy input and a richer UI may preserve only a visibly rendered draft.

## Deterministic and integrated cases

The current suite checks:

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
IC-13 busy input rejects invisible composition / allows future visible-draft adapter
IC-14 integrated /quiy route wakes model zero times
IC-15 integrated Stop aborts one inference and permits a clean next turn
IC-16 integrated non-abortable effect completes once and launches zero successor rounds
```

A first version of the integrated `/quiy` test failed because the test harness spread the classifier result after its local route marker and accidentally overwrote the marker. That was a reviewer-harness defect, not a production-controller failure. The harness was corrected and the complete 16-test suite then passed. The incident is preserved because the review itself should be falsifiable rather than ceremonial.

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
busyInputAdmission=PASS_AT_SEMANTIC_CONTROLLER_LEVEL
modelAbortContract=PASS_AT_SYNTHETIC_SIGNAL_LEVEL
toolStopAfterBoundary=PASS
rollbackSeparation=PASS
sharedOllamaPreservation=PASS_BY_SCOPE_NOT_REAL_HOST_PROOF
localDeterministicAndIntegratedTests=16/16_PASS_AFTER_REVIEW_HARNESS_CORRECTION
realMacAdapterQualification=HELD
B1Resume=HELD_UNTIL_RUNTIME_ADAPTER_QUALIFIED
```

<!-- [VXG RealForever] -->
