import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyLocalCommand,
  createInteractionController,
  resolveInputAdmission,
  resolveInterruptAction
} from '../src/core/interaction-control.mjs';

const KNOWN = ['/help', '/quit', '/exit', '/input-status', '/school', '/sync'];

function abortError(signal) {
  return signal?.reason instanceof Error ? signal.reason : new Error('aborted');
}

function waitForAbort(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError(signal));
    signal.addEventListener('abort', () => reject(abortError(signal)), { once: true });
  });
}

test('interrupt mapping distinguishes composition, inference, tool boundary, closing, and closed', () => {
  assert.equal(resolveInterruptAction('COMPOSING'), 'CLEAR_PENDING_INPUT');
  assert.equal(resolveInterruptAction('PASTE_CAPTURE'), 'CLEAR_PENDING_INPUT');
  assert.equal(resolveInterruptAction('TURN_ADMITTED'), 'INTERRUPT_ACTIVE_TURN');
  assert.equal(resolveInterruptAction('MODEL_INFERENCE'), 'INTERRUPT_ACTIVE_TURN');
  assert.equal(resolveInterruptAction('TOOL_EXECUTION', { toolAbortable: true }), 'INTERRUPT_ACTIVE_TURN');
  assert.equal(resolveInterruptAction('TOOL_EXECUTION', { toolAbortable: false }), 'STOP_AFTER_ACTIVE_TOOL');
  assert.equal(resolveInterruptAction('INTERRUPT_REQUESTED'), 'SHOW_INTERRUPT_PENDING');
  assert.equal(resolveInterruptAction('IDLE'), 'NO_ACTIVE_WORK');
  assert.equal(resolveInterruptAction('SESSION_CLOSING'), 'WAIT_OR_SESSION_OWNED_ESCALATION');
  assert.equal(resolveInterruptAction('CLOSED'), 'NO_OP');
});

test('unknown slash typo is rejected locally and suggests /quit', () => {
  assert.deepEqual(classifyLocalCommand('/quiy', KNOWN), {
    kind: 'UNKNOWN_COMMAND', command: '/quiy', suggestion: '/quit'
  });
});

test('ordinary text is not classified as a local command', () => {
  assert.equal(classifyLocalCommand('please quit later', KNOWN).kind, 'NOT_COMMAND');
});

test('known command with arguments is recognized without model fallback', () => {
  assert.deepEqual(classifyLocalCommand('/school status', KNOWN), {
    kind: 'KNOWN_COMMAND', command: '/school', suggestion: null
  });
});

test('suggestion is deterministic when distances tie', () => {
  const result = classifyLocalCommand('/foa', ['/foo', '/fob']);
  assert.equal(result.kind, 'UNKNOWN_COMMAND');
  assert.equal(result.suggestion, '/fob');
});

test('model inference interrupt aborts exact active turn and becomes idempotently pending', () => {
  const aborts = [];
  const controller = createInteractionController({ onAbort: (event) => aborts.push(event) });
  const admitted = controller.admitTurn({ turnRef: 'turn.1', cancellationTokenRef: 'cancel.1' });
  controller.beginInference();
  const first = controller.requestInterrupt({ reason: 'VICTOR_STOP' });
  assert.equal(first.action, 'INTERRUPT_ACTIVE_TURN');
  assert.equal(admitted.signal.aborted, true);
  assert.equal(aborts.length, 1);
  const second = controller.requestInterrupt({ reason: 'VICTOR_STOP_AGAIN' });
  assert.equal(second.action, 'SHOW_INTERRUPT_PENDING');
  assert.equal(aborts.length, 1);
  const receipt = controller.completeTurn();
  assert.equal(receipt.interrupted, true);
  assert.equal(controller.snapshot().phase, 'IDLE');
});

test('non-abortable tool completes but successor inference is suppressed', async () => {
  const controller = createInteractionController();
  controller.admitTurn({ turnRef: 'turn.tool', cancellationTokenRef: 'cancel.tool' });
  controller.beginInference();
  controller.beginTool({ toolRef: 'tool.read.1', abortable: false, effectClass: 'READ_ONLY' });
  const request = controller.requestInterrupt({ reason: 'VICTOR_STOP' });
  assert.equal(request.action, 'STOP_AFTER_ACTIVE_TOOL');
  const completion = controller.completeTool({ completed: true });
  assert.equal(completion.completedTool.completed, true);
  assert.equal(completion.shouldContinue, false);
  assert.equal(controller.shouldContinue(), false);
  assert.equal(controller.completeTurn().interrupted, true);
});

test('abortable tool receives active turn signal and no successor is admitted', () => {
  const controller = createInteractionController();
  const admitted = controller.admitTurn({ turnRef: 'turn.abortable', cancellationTokenRef: 'cancel.abortable' });
  controller.beginInference();
  controller.beginTool({ toolRef: 'tool.abortable', abortable: true, effectClass: 'READ_ONLY' });
  assert.equal(controller.requestInterrupt().action, 'INTERRUPT_ACTIVE_TURN');
  assert.equal(admitted.signal.aborted, true);
  assert.equal(controller.completeTool().shouldContinue, false);
  controller.completeTurn();
});

test('composition interrupt clears only composition and never creates a turn abort', () => {
  let abortCount = 0;
  const controller = createInteractionController({ onAbort: () => abortCount += 1 });
  controller.beginComposition();
  assert.equal(controller.requestInterrupt().action, 'CLEAR_PENDING_INPUT');
  assert.equal(abortCount, 0);
  controller.clearComposition();
  assert.equal(controller.snapshot().phase, 'IDLE');
});

test('graceful session close is distinct from active-turn stop', () => {
  const controller = createInteractionController();
  assert.equal(controller.beginSessionClosing().phase, 'SESSION_CLOSING');
  assert.equal(controller.requestInterrupt().action, 'WAIT_OR_SESSION_OWNED_ESCALATION');
  assert.equal(controller.markClosed().phase, 'CLOSED');
  assert.equal(controller.requestInterrupt().action, 'NO_OP');
});

test('controller binds a cancellationTokenRef without pretending it is rollback authority', () => {
  const controller = createInteractionController();
  controller.admitTurn({ turnRef: 'turn.bound', cancellationTokenRef: 'context-cancel.77' });
  assert.equal(controller.snapshot().activeTurn.cancellationTokenRef, 'context-cancel.77');
  controller.beginInference();
  controller.requestInterrupt();
  const receipt = controller.completeTurn();
  assert.equal(receipt.cancellationTokenRef, 'context-cancel.77');
  assert.equal(receipt.interrupted, true);
});

test('cannot close a session while a turn is active', () => {
  const controller = createInteractionController();
  controller.admitTurn({ turnRef: 'turn.open', cancellationTokenRef: 'cancel.open' });
  assert.throws(() => controller.beginSessionClosing(), /cannot close session/);
});

test('busy input admission forbids invisible composition while preserving future visible-draft adapters', () => {
  assert.equal(resolveInputAdmission('IDLE'), 'ACCEPT_COMPOSITION');
  assert.equal(resolveInputAdmission('MODEL_INFERENCE'), 'REJECT_WHILE_BUSY');
  assert.equal(resolveInputAdmission('TOOL_EXECUTION'), 'REJECT_WHILE_BUSY');
  assert.equal(resolveInputAdmission('MODEL_INFERENCE', { visibleDraftSupported: true }), 'VISIBLE_DRAFT_ONLY');
  assert.equal(resolveInputAdmission('SESSION_CLOSING'), 'REJECT_SESSION_NOT_INTERACTIVE');
  assert.equal(resolveInputAdmission('CLOSED'), 'REJECT_SESSION_NOT_INTERACTIVE');
});

test('integrated typo route never wakes model', async () => {
  let modelCalls = 0;
  async function dispatch(text) {
    const local = classifyLocalCommand(text, KNOWN);
    if (local.kind === 'UNKNOWN_COMMAND') return { ...local, route: 'LOCAL_REJECT' };
    if (local.kind === 'KNOWN_COMMAND') return { ...local, route: 'LOCAL_COMMAND' };
    modelCalls += 1;
    return { kind: 'MODEL' };
  }
  const result = await dispatch('/quiy');
  assert.equal(result.route, 'LOCAL_REJECT');
  assert.equal(result.kind, 'UNKNOWN_COMMAND');
  assert.equal(result.suggestion, '/quit');
  assert.equal(modelCalls, 0);
});

test('integrated Stop aborts inference, rejects ghost input, then permits next turn', async () => {
  const controller = createInteractionController();
  const first = controller.admitTurn({ turnRef: 'turn.first', cancellationTokenRef: 'cancel.first' });
  controller.beginInference();
  assert.equal(resolveInputAdmission(controller.snapshot().phase), 'REJECT_WHILE_BUSY');

  const inference = waitForAbort(first.signal);
  controller.requestInterrupt({ reason: 'VICTOR_STOP' });
  await assert.rejects(inference, /VICTOR_STOP/);
  assert.equal(controller.completeTurn().interrupted, true);
  assert.equal(resolveInputAdmission(controller.snapshot().phase), 'ACCEPT_COMPOSITION');

  const second = controller.admitTurn({ turnRef: 'turn.second', cancellationTokenRef: 'cancel.second' });
  controller.beginInference();
  assert.equal(second.signal.aborted, false);
  controller.completeTurn({ interrupted: false });
  assert.equal(controller.snapshot().phase, 'IDLE');
});

test('integrated non-abortable tool settles exactly once and no successor model round runs', async () => {
  const controller = createInteractionController();
  controller.admitTurn({ turnRef: 'turn.tool', cancellationTokenRef: 'cancel.tool' });
  controller.beginInference();
  controller.beginTool({ toolRef: 'tool.effect', abortable: false, effectClass: 'EXTERNAL_EFFECT' });

  let toolCompletions = 0;
  let successorModelRounds = 0;
  const tool = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    toolCompletions += 1;
    return { effectReceiptRef: 'effect.receipt.1' };
  })();

  assert.equal(controller.requestInterrupt({ reason: 'VICTOR_STOP' }).action, 'STOP_AFTER_ACTIVE_TOOL');
  const result = await tool;
  assert.equal(result.effectReceiptRef, 'effect.receipt.1');
  const completion = controller.completeTool({ completed: true });
  if (completion.shouldContinue) successorModelRounds += 1;

  assert.equal(toolCompletions, 1);
  assert.equal(successorModelRounds, 0);
  assert.equal(controller.completeTurn().interrupted, true);
});
