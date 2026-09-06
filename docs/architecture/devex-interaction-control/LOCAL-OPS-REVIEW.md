# Local Operations second-lens review — Devex Interaction Control

Continuity: `[VXG RealForever]`

Review class:

```text
reviewClass=SAME_INSTANCE_SECOND_LENS
independentAssurance=false
formalApproval=false
mergeAuthority=false
executionEnvironment=LOCAL_SAFE_SYNTHETIC_PLUS_RETURN_STATE_DRY_RUN
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

### A7 — “Once the HTTP request is aborted, the cancelled user turn can remain in ordinary recent context”

Rejected. The raw user event is true historical evidence, but if it remains as an unanswered `user` message in the next model context, Devex may silently resume the request Victor explicitly stopped. The controller now exposes `projectContextEligibleEvents(...)`: raw interrupted/failed events remain in the ledger while their `turnRef`s are removed from the active user/assistant projection.

```text
PRESERVE_RAW_EVENT != REINJECT_AS_ACTIVE_CONTEXT
INTERRUPTED_TURN != OPEN_REQUEST
```

## Source-controller deterministic and integrated cases

The current source suite checks:

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
IC-17 interrupted/failed turnRef payloads excluded from active context without ledger deletion
IC-18 current unclosed user turn remains eligible after context projection
```

A first version of the integrated `/quiy` test failed because the test harness spread the classifier result after its local route marker and accidentally overwrote the marker. That was a reviewer-harness defect, not a production-controller failure. The harness was corrected and the source-controller suite reached **18/18**. The incident is preserved because the review itself should be falsifiable rather than ceremonial.

## Home Runtime v0.5.5 second-lens qualification

The same semantic contract was then wired into a local Home updater candidate and tested as a real feature rather than a prose-only map.

Qualification includes:

```text
Node test subtests = 32/32 PASS
Effective scenarios including legacy composer internals = 36 PASS
HTTP AbortSignal against fake Ollama-compatible endpoint = PASS
runResidentAgent in-flight abort -> MODEL_INFERENCE = PASS
non-abortable tool settles exactly once + zero successor requests = PASS
busy terminal ghost-input rejection = PASS
repeated busy Ctrl+C = PASS
unknown slash guard occurs before model fallback = PASS
interrupted/failed payload withheld from current model context = PASS
interrupted prior-session payload withheld from ambient context = PASS
ordinary Stop path contains no process.kill = PASS
latest returned B1/B0 state updater dry-run preservation = PASS
ZIP CRC/member hashes = PASS (external package receipt)
```

### Reviewer-discovered implementation defects repaired before packaging

1. **Updater directory assumption.** The first updater dry-run failed because the script assumed `$VEX_ROOT/bin` already existed. The updater now creates the bounded destination directories before copying.
2. **Cancelled-turn context leak.** The first adapter shape would have preserved the interrupted Victor event as a normal unanswered current-context message. The runtime now keeps raw evidence but excludes interrupted/failed `turnRef`s from ambient model context.
3. **Speaker misattribution.** A `system` interruption marker would have defaulted to Devex's companion speaker identity under the old session-store fallback. v0.5.5 adds `runtime.devex.home` / `SYSTEM_RUNTIME` so runtime receipts are not Devex autobiography.

These are feature-review findings, not reasons to promote weights or redefine the School lesson.

## Held gaps

- Real Mac Ollama socket abort behavior still needs lived qualification after installing v0.5.5.
- Current Home resident tools use synchronous/local shapes and do not expose a universal `abortable` capability; adapters fail conservative (`abortable=false`) when unknown.
- Because synchronous tool execution can block the Node event loop, a physical Stop keystroke may only become observable after such a tool returns. This is an explicit prototype limitation, not proof of immediate tool cancellation.
- A graphical VexInterface may choose visible draft preservation while busy; the current semantic controller intentionally does not prescribe that presentation.
- Accepted-main product adapter integration is not complete merely because the Home ZIP works.
- This same-instance review cannot satisfy any requirement for independent assurance or formal reviewer approval.

## Review disposition

```text
semanticController=PASS_FOR_DRAFT_SOURCE_PLACEMENT
unknownCommandBoundary=PASS
busyInputAdmission=PASS_AT_SEMANTIC_CONTROLLER_LEVEL
cancelledContextProjection=PASS
modelAbortContract=PASS_AT_LOCAL_HTTP_SIGNAL_LEVEL
nonAbortableToolStopAfterBoundary=PASS
rollbackSeparation=PASS
sharedOllamaPreservation=PASS_BY_SCOPE_AND_STATIC_PROOF_NOT_REAL_HOST_PROOF
sourceControllerTests=18/18_PASS
homePackageTests=32/32_PASS__36_EFFECTIVE_SCENARIOS
latestReturnUpdaterPreservation=PASS
realMacAdapterQualification=HELD
B1Resume=HELD_UNTIL_RUNTIME_ADAPTER_QUALIFIED
```

<!-- [VXG RealForever] -->
