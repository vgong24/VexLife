# Devex Interaction Control — Local Operations mini-map

Continuity: `[VXG RealForever]`

This directory records the bounded source-owned control seam earned by lived Devex Builder Home use. It is deliberately **platform-neutral**: a terminal key, desktop button, mobile gesture, voice command, or accessibility action binds to a semantic control action; none of those input surfaces owns the meaning of interruption.

```text
human intent
  -> interface adapter
  -> interaction phase
  -> semantic control action
  -> exact active turn / tool boundary
  -> evidence-preserving stop or continuation
```

## Source incidents

- `github.issue.vexlife.398` — Home/School runtime and companion-teacher evidence.
- `github.issue.vexlife.399` — terminal composition, admission, busy-input, unknown-command, and interrupt evidence.
- Latest lived Home return: `session.20260906090000.aa8fa599`.

The observed `/quiy` incident demonstrated two different defects:

```text
UNKNOWN_SLASH_COMMAND -> model turn          # should be local rejection
CTRL_C_DURING_MODEL_TURN -> input clear only # should interrupt active turn
```

## Existing owners this composes

This feature does not invent a second scheduler or cancellation universe.

- `src/core/context-lease.mjs` already carries `cancellationTokenRef` as part of current context identity and successor authorization.
- `src/core/runtime-recovery.mjs` owns retry/recovery convergence and rollback evidence; a user Stop action does not rewrite that lifecycle.
- `src/core/state-relay.mjs` remains the generic in-process state projection primitive.
- `scripts/macos-lifecycle.mjs` owns process-instance lifecycle and session-owned process stopping; ordinary turn interruption must not kill shared Ollama.

Compact boundary:

```text
TURN_INTERRUPT != PROCESS_KILL
TURN_INTERRUPT != ROLLBACK
TURN_INTERRUPT != SESSION_CLOSE
INTERFACE_BINDING != SEMANTIC_ACTION
```

## Semantic phase map

```text
IDLE
  -> COMPOSING | PASTE_CAPTURE
  -> TURN_ADMITTED
       -> MODEL_INFERENCE
       -> TOOL_EXECUTION
       -> INTERRUPT_REQUESTED
  -> SESSION_CLOSING
  -> CLOSED
```

## Interrupt action map

```text
COMPOSING | PASTE_CAPTURE
  -> CLEAR_PENDING_INPUT

TURN_ADMITTED | MODEL_INFERENCE
  -> INTERRUPT_ACTIVE_TURN

TOOL_EXECUTION + abortable
  -> INTERRUPT_ACTIVE_TURN

TOOL_EXECUTION + non-abortable/already-effecting
  -> STOP_AFTER_ACTIVE_TOOL
  -> preserve completed tool/effect evidence
  -> do not launch successor model/tool round

INTERRUPT_REQUESTED
  -> SHOW_INTERRUPT_PENDING

IDLE
  -> NO_ACTIVE_WORK

SESSION_CLOSING
  -> WAIT_OR_SESSION_OWNED_ESCALATION

CLOSED
  -> NO_OP
```

## Command-routing rule

Known slash commands are local runtime controls. Unknown slash commands must also remain local:

```text
/quiy
  -> UNKNOWN_COMMAND
  -> deterministic suggestion: /quit
  -> modelWake=false
```

A typo in runtime control syntax must not consume inference or become autobiographical conversation evidence.

## Busy-input rule

The v0.5.4 terminal kept raw input active while a Devex turn was in flight, but removed the visible Victor prompt. That allowed invisible draft characters to accumulate.

The product rule is:

```text
INVISIBLE_INPUT_ADMISSION = PROHIBITED
```

A future graphical interface may preserve a visible draft while Devex works. The terminal prototype may instead refuse ordinary text until the active turn stops or completes. Both are valid adapters if the user can see what is happening.

## Cancellation and effect boundary

```text
STOP_GENERATION != ROLLBACK
```

The controller stops the earliest safely cancellable boundary:

1. abort model inference immediately when an abort signal is supported;
2. abort a tool only when its contract says interruption is safe;
3. otherwise allow the active tool/effect boundary to settle, preserve its evidence, and suppress successors;
4. never pretend an already-completed external effect was undone;
5. ordinary Stop never terminates shared Ollama.

## Current executable surface

`src/core/interaction-control.mjs` is the platform-neutral reference controller and command classifier. `test/interaction-control.test.mjs` exercises the semantic contract independently of Ollama or a terminal.

The current Home runtime remains a prototype consumer. A follow-up adapter can bind its bracketed-paste composer and Ollama request to this contract after this source shape survives review.

## School boundary

```text
B1 = HELD
weightLearningOccurred = false
```

Runtime repair comes before further B1 teaching. The School should not train compensatory behavior around invisible input, non-cancellable inference, or command-routing defects.

<!-- [VXG RealForever] -->
