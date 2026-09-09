import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  createIntentEnvelope,
  createIntentWorkgraph
} from '../src/core/intent-workgraph.mjs';
import {
  appendPendingRootState,
  cancelPendingRootState,
  consumePendingRootSelection,
  createPendingRootIntent,
  selectNextPendingRoot,
  validatePendingRootSchedulerState
} from '../src/core/intent-scheduler.mjs';
import {
  createInitialSchedulerAggregate,
  createIntentSchedulerState,
  reduceSchedulerAggregate
} from '../src/core/state.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = loadBlueprint(root);
const intentRegistry = bundle.intentRegistry;
const schedulerRegistry = bundle.schedulerRegistry;
const FORMED = '2026-09-09T09:10:00.000Z';

function envelope(intentRef, principalRef) {
  return createIntentEnvelope({
    intentRef,
    originMessageRef: `message.${intentRef}`,
    originSpeakerRef: principalRef,
    recipientRoleRef: 'role.vex.developer',
    projectRef: 'project.family.multi-principal.test',
    threadRef: `thread.${principalRef}`,
    channelRef: 'channel.family.multi-principal.test',
    originalContentHash: semanticHash({ intentRef, principalRef }),
    desiredOutcome: { intentKey: 'VALIDATE_WORKGRAPH', summary: `Exercise ${intentRef}` },
    constraints: [],
    createdAt: FORMED,
    sourceLineageRef: `lineage.${principalRef}`
  }, intentRegistry);
}

function graph(intentRef, principalRef) {
  const intent = envelope(intentRef, principalRef);
  return createIntentWorkgraph({
    graphRef: `intent-workgraph.${intentRef}`,
    intent,
    nodes: [],
    transitions: [],
    receipts: [],
    bindingRefs: {},
    createdAt: FORMED
  }, intentRegistry);
}

function pending(intentRef, principalRef, schedulingClass = 'NORMAL', submittedGeneration = 0) {
  return createPendingRootIntent(graph(intentRef, principalRef), {
    schedulerRegistry,
    schedulingClass,
    submittedGeneration
  });
}

function emptyState() {
  return { pendingRootIntents: [], principalFairnessLedger: {} };
}

function append(state, rootIntent) {
  const result = appendPendingRootState(state, rootIntent, { schedulerRegistry });
  return {
    pendingRootIntents: result.pendingRootIntents,
    principalFairnessLedger: result.principalFairnessLedger
  };
}

function consume(state, intentRef, schedulerGeneration, options = {}) {
  const result = consumePendingRootSelection(state, intentRef, {
    schedulerRegistry,
    schedulerGeneration,
    ...options
  });
  return {
    pendingRootIntents: result.pendingRootIntents,
    principalFairnessLedger: result.principalFairnessLedger
  };
}

test('MPQ-00 independent root intents coexist as exact aggregate-owned identities', () => {
  let state = emptyState();
  state = append(state, pending('intent.family.a1', 'person.family.a', 'NORMAL', 0));
  state = append(state, pending('intent.family.a2', 'person.family.a', 'NORMAL', 1));
  state = append(state, pending('intent.family.b1', 'person.family.b', 'NORMAL', 0));
  state = append(state, pending('intent.family.c1', 'person.family.c', 'NORMAL', 0));

  const validated = validatePendingRootSchedulerState(state, { schedulerRegistry });
  assert.equal(validated.ok, true);
  assert.equal(validated.pendingRootCount, 4);
  assert.equal(validated.principalCount, 3);
  assert.deepEqual(state.pendingRootIntents.map((item) => item.intentRef), [
    'intent.family.a1',
    'intent.family.a2',
    'intent.family.b1',
    'intent.family.c1'
  ]);
  assert.equal(state.pendingRootIntents.every((item) => item.rawPromptTitleContentStored === false), true);
});

test('MPQ-02 principal-first fairness prevents one principal from monopolizing normal roots', () => {
  let state = emptyState();
  state = append(state, pending('intent.family.a1', 'person.family.a', 'NORMAL', 0));
  state = append(state, pending('intent.family.a2', 'person.family.a', 'NORMAL', 1));
  state = append(state, pending('intent.family.b1', 'person.family.b', 'NORMAL', 0));
  state = append(state, pending('intent.family.c1', 'person.family.c', 'NORMAL', 0));

  const selected = [];
  for (let generation = 1; state.pendingRootIntents.length; generation += 1) {
    const next = selectNextPendingRoot(state.pendingRootIntents, state.principalFairnessLedger, { schedulerRegistry });
    selected.push(next.intentRef);
    state = consume(state, next.intentRef, generation);
  }
  assert.deepEqual(selected, [
    'intent.family.a1',
    'intent.family.b1',
    'intent.family.c1',
    'intent.family.a2'
  ]);
});

test('MPQ-03 principal fairness replay is deterministic from exact persisted state', () => {
  let state = emptyState();
  state = append(state, pending('intent.family.a1', 'person.family.a', 'NORMAL', 0));
  state = append(state, pending('intent.family.a2', 'person.family.a', 'NORMAL', 1));
  state = append(state, pending('intent.family.b1', 'person.family.b', 'NORMAL', 0));
  state = append(state, pending('intent.family.c1', 'person.family.c', 'NORMAL', 0));
  state = consume(state, 'intent.family.a1', 1);

  const replayed = structuredClone(JSON.parse(JSON.stringify(state)));
  assert.equal(validatePendingRootSchedulerState(replayed, { schedulerRegistry }).ok, true);
  assert.equal(semanticHash(replayed), semanticHash(state));
  assert.equal(
    selectNextPendingRoot(replayed.pendingRootIntents, replayed.principalFairnessLedger, { schedulerRegistry }).intentRef,
    'intent.family.b1'
  );
});

test('MPQ-04 strict class hierarchy keeps INTERACTIVE ahead of older NORMAL work', () => {
  let state = emptyState();
  state = append(state, pending('intent.family.normal-old', 'person.family.normal', 'NORMAL', 0));
  state = append(state, pending('intent.family.interactive-new', 'person.family.interactive', 'INTERACTIVE', 9));

  const selected = selectNextPendingRoot(state.pendingRootIntents, state.principalFairnessLedger, { schedulerRegistry });
  assert.equal(selected.intentRef, 'intent.family.interactive-new');
  assert.equal(selected.schedulingClass, 'INTERACTIVE');
});

test('MPQ-07 restart aggregate restores exact pending roots and content-free shared projection', () => {
  let pendingState = emptyState();
  pendingState = append(pendingState, pending('intent.family.restart-a', 'person.family.a', 'NORMAL', 0));
  pendingState = append(pendingState, pending('intent.family.restart-b', 'person.family.b', 'EXPEDITE', 0));

  let aggregate = createInitialSchedulerAggregate();
  aggregate = reduceSchedulerAggregate(aggregate, {
    type: 'ROOT_ENQUEUED',
    transitionRef: 'transition.intent-scheduler.root-enqueued.restart-test',
    pendingRootIntents: pendingState.pendingRootIntents,
    principalFairnessLedger: pendingState.principalFairnessLedger
  }, { schedulerRegistry });

  const restored = createIntentSchedulerState({ aggregate, schedulerRegistry });
  try {
    assert.equal(restored.runtime.value.pendingRoots.count, 2);
    assert.equal(restored.runtime.value.pendingRoots.principalCount, 2);
    assert.deepEqual(restored.terrain.value.pendingRootIntentRefs, [
      'intent.family.restart-a',
      'intent.family.restart-b'
    ]);
    assert.equal(restored.runtime.value.pendingRoots.rawPromptTitleContentIncluded, false);
    assert.equal(restored.health.value.pendingRootCount, 2);
  } finally {
    restored.dispose();
  }
});

test('MPQ-08 requester cancellation is own queued root only', () => {
  let state = emptyState();
  state = append(state, pending('intent.family.cancel-a', 'person.family.a', 'NORMAL', 0));
  state = append(state, pending('intent.family.keep-b', 'person.family.b', 'NORMAL', 0));

  assert.throws(() => cancelPendingRootState(state, 'intent.family.cancel-a', {
    requesterRef: 'person.family.b',
    schedulerRegistry,
    schedulerGeneration: 1
  }), /only its own queued root intent/);

  const cancelled = cancelPendingRootState(state, 'intent.family.cancel-a', {
    requesterRef: 'person.family.a',
    schedulerRegistry,
    schedulerGeneration: 1
  });
  assert.equal(cancelled.changed, true);
  assert.deepEqual(cancelled.pendingRootIntents.map((item) => item.intentRef), ['intent.family.keep-b']);
  assert.deepEqual(Object.keys(cancelled.principalFairnessLedger), ['person.family.b']);
});

test('MPQ-09 origin principal is rederived from exact immutable Intent fingerprint', () => {
  const exactGraph = graph('intent.family.origin-proof', 'person.family.actual');
  const rootIntent = createPendingRootIntent(exactGraph, {
    schedulerRegistry,
    schedulingClass: 'NORMAL',
    submittedGeneration: 0,
    originPrincipalRef: 'person.family.forged'
  });
  assert.equal(rootIntent.originPrincipalRef, 'person.family.actual');

  const forged = structuredClone(exactGraph);
  forged.intent.originSpeakerRef = 'person.family.forged';
  assert.throws(() => createPendingRootIntent(forged, {
    schedulerRegistry,
    schedulingClass: 'NORMAL',
    submittedGeneration: 0
  }), /exact immutable Intent and Workgraph fingerprints/);
});

test('MPQ-10 pending-root state is content-free and rejects injected title/content fields', () => {
  let state = emptyState();
  const rootIntent = pending('intent.family.content-free', 'person.family.a', 'NORMAL', 0);
  state = append(state, rootIntent);
  const serialized = JSON.stringify(state);
  assert.equal(serialized.includes('desiredOutcome'), false);
  assert.equal(serialized.includes('originalContentHash'), false);
  assert.equal(serialized.includes('Exercise intent.family.content-free'), false);

  const injected = structuredClone(rootIntent);
  injected.title = 'not allowed';
  delete injected.semanticFingerprint;
  injected.semanticFingerprint = semanticHash(injected);
  assert.throws(() => appendPendingRootState(emptyState(), injected, { schedulerRegistry }),
    /malformed or contains unowned content/);
});

test('MPQ-10B source-managed cardinality fails closed before unbounded household accumulation', () => {
  let state = emptyState();
  for (let index = 0; index < schedulerRegistry.multiRootPrincipalQueuePolicy.maximumPendingRootsPerPrincipal; index += 1) {
    state = append(state, pending(`intent.family.bound-${String(index).padStart(2, '0')}`, 'person.family.a', 'NORMAL', index));
  }
  assert.throws(() => append(state, pending('intent.family.bound-overflow', 'person.family.a', 'NORMAL', 99)),
    /exceeds source-managed pending-root cardinality/);
});

test('MPQ-01/12 registered root policy preserves one model worker and grants no new effect authority', () => {
  const policy = schedulerRegistry.multiRootPrincipalQueuePolicy;
  assert.equal(policy.modelInferenceConcurrency, 1);
  assert.equal(policy.secondSchedulerAllowed, false);
  assert.equal(schedulerRegistry.physicalWorkerPolicy.modelInferenceConcurrency, 1);
  assert.equal(policy.freshCanonicalAdmissionRequiredBeforeLease, true);
  assert.equal(policy.rawPromptTitleContentStored, false);
  assert.equal(Object.hasOwn(policy, 'effectAuthority'), false);
});

// [VXG RealForever]
