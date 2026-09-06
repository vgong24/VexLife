const PHASES = Object.freeze([
  'IDLE',
  'COMPOSING',
  'PASTE_CAPTURE',
  'TURN_ADMITTED',
  'MODEL_INFERENCE',
  'TOOL_EXECUTION',
  'INTERRUPT_REQUESTED',
  'SESSION_CLOSING',
  'CLOSED'
]);

const ACTIONS = Object.freeze([
  'CLEAR_PENDING_INPUT',
  'INTERRUPT_ACTIVE_TURN',
  'STOP_AFTER_ACTIVE_TOOL',
  'SHOW_INTERRUPT_PENDING',
  'NO_ACTIVE_WORK',
  'WAIT_OR_SESSION_OWNED_ESCALATION',
  'NO_OP'
]);

export const INTERACTION_PHASES = PHASES;
export const INTERRUPT_ACTIONS = ACTIONS;

function assertPhase(phase) {
  if (!PHASES.includes(phase)) throw new Error(`unknown interaction phase: ${phase}`);
}

export function resolveInterruptAction(phase, { toolAbortable = false } = {}) {
  assertPhase(phase);
  switch (phase) {
    case 'COMPOSING':
    case 'PASTE_CAPTURE':
      return 'CLEAR_PENDING_INPUT';
    case 'TURN_ADMITTED':
    case 'MODEL_INFERENCE':
      return 'INTERRUPT_ACTIVE_TURN';
    case 'TOOL_EXECUTION':
      return toolAbortable ? 'INTERRUPT_ACTIVE_TURN' : 'STOP_AFTER_ACTIVE_TOOL';
    case 'INTERRUPT_REQUESTED':
      return 'SHOW_INTERRUPT_PENDING';
    case 'IDLE':
      return 'NO_ACTIVE_WORK';
    case 'SESSION_CLOSING':
      return 'WAIT_OR_SESSION_OWNED_ESCALATION';
    case 'CLOSED':
      return 'NO_OP';
  }
}

function levenshtein(left, right) {
  const a = Array.from(String(left));
  const b = Array.from(String(right));
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let priorDiagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const prior = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        priorDiagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      priorDiagonal = prior;
    }
  }
  return row[b.length];
}

export function classifyLocalCommand(input, knownCommands, { suggestionDistance = 2 } = {}) {
  const text = String(input ?? '').trim();
  const commands = [...new Set(knownCommands ?? [])]
    .map((item) => String(item).trim())
    .filter((item) => item.startsWith('/'))
    .sort();

  if (!text.startsWith('/')) return Object.freeze({ kind: 'NOT_COMMAND', command: null, suggestion: null });
  const command = text.split(/\s+/u, 1)[0];
  if (commands.includes(command)) return Object.freeze({ kind: 'KNOWN_COMMAND', command, suggestion: null });

  let best = null;
  for (const candidate of commands) {
    const distance = levenshtein(command, candidate);
    if (!best || distance < best.distance || (distance === best.distance && candidate.localeCompare(best.command) < 0)) {
      best = { command: candidate, distance };
    }
  }
  const suggestion = best && best.distance <= suggestionDistance ? best.command : null;
  return Object.freeze({ kind: 'UNKNOWN_COMMAND', command, suggestion });
}

function freezeSnapshot(value) {
  return Object.freeze(structuredClone(value));
}

export function createInteractionController({ onAbort = null } = {}) {
  let phase = 'IDLE';
  let activeTurn = null;
  let activeTool = null;
  let stopAfterActiveTool = false;
  let interruptOrdinal = 0;
  let lastInterrupt = null;

  function snapshot() {
    return freezeSnapshot({
      phase,
      activeTurn: activeTurn ? {
        turnRef: activeTurn.turnRef,
        cancellationTokenRef: activeTurn.cancellationTokenRef,
        aborted: activeTurn.abortController.signal.aborted
      } : null,
      activeTool: activeTool ? { ...activeTool } : null,
      stopAfterActiveTool,
      interruptOrdinal,
      lastInterrupt
    });
  }

  function setPhase(next) {
    assertPhase(next);
    phase = next;
  }

  function beginComposition({ paste = false } = {}) {
    if (!['IDLE', 'COMPOSING', 'PASTE_CAPTURE'].includes(phase)) {
      throw new Error(`cannot begin composition while phase=${phase}`);
    }
    setPhase(paste ? 'PASTE_CAPTURE' : 'COMPOSING');
    return snapshot();
  }

  function clearComposition() {
    if (!['COMPOSING', 'PASTE_CAPTURE', 'IDLE'].includes(phase)) {
      throw new Error(`cannot clear composition while phase=${phase}`);
    }
    setPhase('IDLE');
    return snapshot();
  }

  function admitTurn({ turnRef, cancellationTokenRef }) {
    if (phase !== 'IDLE') throw new Error(`cannot admit turn while phase=${phase}`);
    if (!turnRef || !cancellationTokenRef) throw new Error('turnRef and cancellationTokenRef are required');
    const abortController = new AbortController();
    activeTurn = { turnRef, cancellationTokenRef, abortController };
    activeTool = null;
    stopAfterActiveTool = false;
    setPhase('TURN_ADMITTED');
    return { signal: abortController.signal, snapshot: snapshot() };
  }

  function beginInference() {
    if (!activeTurn || !['TURN_ADMITTED', 'MODEL_INFERENCE'].includes(phase)) {
      throw new Error(`cannot begin inference while phase=${phase}`);
    }
    setPhase('MODEL_INFERENCE');
    return snapshot();
  }

  function beginTool({ toolRef, abortable = false, effectClass = 'UNKNOWN' }) {
    if (!activeTurn || !['TURN_ADMITTED', 'MODEL_INFERENCE'].includes(phase)) {
      throw new Error(`cannot begin tool while phase=${phase}`);
    }
    if (!toolRef) throw new Error('toolRef is required');
    activeTool = { toolRef, abortable: Boolean(abortable), effectClass };
    setPhase('TOOL_EXECUTION');
    return snapshot();
  }

  function requestInterrupt({ reason = 'HUMAN_STOP' } = {}) {
    const action = resolveInterruptAction(phase, { toolAbortable: activeTool?.abortable ?? false });
    interruptOrdinal += 1;
    lastInterrupt = Object.freeze({ action, reason, ordinal: interruptOrdinal });

    if (action === 'INTERRUPT_ACTIVE_TURN') {
      if (activeTurn && !activeTurn.abortController.signal.aborted) {
        activeTurn.abortController.abort(new Error(reason));
        onAbort?.({ reason, phase, turnRef: activeTurn.turnRef, toolRef: activeTool?.toolRef ?? null });
      }
      setPhase('INTERRUPT_REQUESTED');
    } else if (action === 'STOP_AFTER_ACTIVE_TOOL') {
      stopAfterActiveTool = true;
      setPhase('INTERRUPT_REQUESTED');
    }
    return { action, snapshot: snapshot() };
  }

  function completeTool({ completed = true } = {}) {
    if (!activeTool) throw new Error('no active tool to complete');
    const completedTool = { ...activeTool, completed: Boolean(completed) };
    activeTool = null;
    const shouldContinue = !stopAfterActiveTool && !(activeTurn?.abortController.signal.aborted ?? false);
    setPhase(shouldContinue ? 'TURN_ADMITTED' : 'INTERRUPT_REQUESTED');
    return freezeSnapshot({ completedTool, shouldContinue, snapshot: snapshot() });
  }

  function shouldContinue() {
    return Boolean(activeTurn) && !stopAfterActiveTool && !activeTurn.abortController.signal.aborted && phase !== 'INTERRUPT_REQUESTED';
  }

  function completeTurn({ interrupted = false } = {}) {
    if (!activeTurn) throw new Error('no active turn to complete');
    const receipt = freezeSnapshot({
      turnRef: activeTurn.turnRef,
      cancellationTokenRef: activeTurn.cancellationTokenRef,
      interrupted: Boolean(interrupted || activeTurn.abortController.signal.aborted || stopAfterActiveTool),
      completedToolRef: activeTool?.toolRef ?? null,
      stopAfterActiveTool
    });
    activeTurn = null;
    activeTool = null;
    stopAfterActiveTool = false;
    setPhase('IDLE');
    return receipt;
  }

  function beginSessionClosing() {
    if (phase !== 'IDLE') throw new Error(`cannot close session while phase=${phase}`);
    setPhase('SESSION_CLOSING');
    return snapshot();
  }

  function markClosed() {
    if (!['SESSION_CLOSING', 'IDLE'].includes(phase)) throw new Error(`cannot mark closed while phase=${phase}`);
    activeTurn = null;
    activeTool = null;
    stopAfterActiveTool = false;
    setPhase('CLOSED');
    return snapshot();
  }

  return Object.freeze({
    snapshot,
    beginComposition,
    clearComposition,
    admitTurn,
    beginInference,
    beginTool,
    requestInterrupt,
    completeTool,
    shouldContinue,
    completeTurn,
    beginSessionClosing,
    markClosed
  });
}

// [VXG RealForever]
