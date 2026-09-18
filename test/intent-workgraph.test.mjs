import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Atlas } from '../src/core/atlas.mjs';
import { buildIdentityIndex, loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import {
  appendReceipt,
  cancelIntentBranch,
  createIntentEnvelope,
  createIntentTrustSnapshot,
  createIntentWorkgraph,
  createWorkNode,
  isDeeplyFrozen,
  recordIntentTransition,
  resolveKnownIntent
} from '../src/core/intent-workgraph.mjs';
import { projectIntentStatus } from '../src/core/intent-projection.mjs';
import {
  validateIntentRegistry,
  validateIntentTrustSnapshot,
  validateIntentWorkgraph
} from '../src/core/intent-validation.mjs';
import { compileRegistryPack } from '../src/core/registry.mjs';
import { readJson } from '../src/core/utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = loadBlueprint(root);
const registry = bundle.intentRegistry;
const registeredProcessRefs = bundle.factory.processes.map((item) => item.processRef);
const registeredRoleRefs = bundle.blueprint.roles.map((item) => item.roleRef);
const sourceManagedTrustSnapshot = readJson(path.join(root, 'blueprint/intent-trust-snapshot.json'));

function envelope(overrides = {}) {
  return createIntentEnvelope({
    intentRef: 'intent.test.root',
    originMessageRef: 'message.test.origin',
    originSpeakerRef: 'person.test.human',
    recipientRoleRef: 'role.vex.developer',
    projectRef: 'project.test',
    threadRef: 'thread.test',
    channelRef: 'channel.test',
    originalContentHash: 'a'.repeat(64),
    desiredOutcome: { intentKey: 'VALIDATE_WORKGRAPH', summary: 'Prove bounded intent orchestration' },
    constraints: [],
    createdAt: '2026-07-31T00:00:00.000Z',
    sourceLineageRef: 'lineage.test.intent',
    ...overrides
  }, registry);
}

function node(workNodeRef, overrides = {}) {
  return createWorkNode({
    workNodeRef,
    rootIntentRef: 'intent.test.root',
    parentWorkNodeRef: null,
    purpose: `Purpose for ${workNodeRef}`,
    processRef: 'process.vexlife.intent.validate-workgraph',
    state: 'PLAN_VALIDATED',
    dependencyRefs: [],
    childRefs: [],
    roleRef: 'role.vex.developer',
    priorityClass: 'NORMAL',
    contextPlanRef: null,
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableBurdenReleaseRefs: [],
    capabilityEnvelopeRef: `capability-envelope.${workNodeRef}`,
    effectEnvelopeRef: `effect-envelope.${workNodeRef}`,
    resourceEnvelopeRef: `resource-envelope.${workNodeRef}`,
    expectedTransitionRef: `expected-transition.${workNodeRef}`,
    completionGateRefs: [`completion-gate.${workNodeRef}`],
    returnRouteRef: `return-route.${workNodeRef}`,
    sourceRefs: [`source.${workNodeRef}`],
    createdAt: '2026-07-31T00:00:00.000Z',
    ...overrides
  }, registry);
}

function bindingRefs(nodes) {
  return Object.fromEntries(registry.bindingFields.map((field) => [
    field,
    [...new Set(nodes.flatMap((item) => Array.isArray(item[field]) ? item[field] : [item[field]]).filter(Boolean))].sort()
  ]));
}

function transitionPath(initialState, targetState) {
  if (initialState === targetState) return [];
  const queue = [[initialState, []]];
  const visited = new Set([initialState]);
  while (queue.length) {
    const [state, pathStates] = queue.shift();
    for (const nextState of registry.allowedTransitions[state] ?? []) {
      if (visited.has(nextState)) continue;
      const nextPath = [...pathStates, nextState];
      if (nextState === targetState) return nextPath;
      visited.add(nextState);
      queue.push([nextState, nextPath]);
    }
  }
  throw new Error(`no source-managed formation path ${initialState} -> ${targetState}`);
}

function formationTransitions(nodes) {
  return nodes.flatMap((workNode) => {
    let priorState = workNode.initialState;
    return transitionPath(workNode.initialState, workNode.state).map((nextState, sequence) => {
      const transition = {
        transitionRef: `transition.formation.${workNode.workNodeRef}.${sequence}`,
        workNodeRef: workNode.workNodeRef,
        sequence,
        priorState,
        nextState,
        reason: 'source-managed test formation history',
        actorRef: 'vex.test',
        actorRoleRef: 'role.vex.developer',
        processRef: 'process.vexlife.intent.verify-transition',
        sourceRefs: [`source.formation.${workNode.workNodeRef}`],
        createdAt: `2026-07-31T00:00:${String(sequence + 10).padStart(2, '0')}.000Z`
      };
      priorState = nextState;
      return transition;
    });
  });
}

function graph(nodes, overrides = {}) {
  const transitions = Object.hasOwn(overrides, 'transitions')
    ? overrides.transitions
    : formationTransitions(nodes);
  return createIntentWorkgraph({
    graphRef: 'intent-workgraph.test',
    intent: envelope(),
    nodes,
    interpretations: [],
    proposedPlans: [],
    authorizations: [],
    transitions,
    receipts: [],
    bindingRefs: bindingRefs(nodes),
    createdAt: '2026-07-31T00:00:00.000Z',
    ...overrides
  }, registry);
}

function trustSnapshot(candidate, overrides = {}) {
  const authorizationBindings = (candidate.authorizations ?? []).map((item) => ({
    authorizationRef: item.authorizationRef,
    actorRef: item.actorRef,
    actorRoleRef: item.actorRoleRef,
    decisionRef: item.decisionRef,
    effectEnvelopeRef: item.effectEnvelopeRef,
    authorityDisposition: item.authorityDisposition,
    effectDisposition: item.effectDisposition
  }));
  const trustedBindings = bindingRefs(candidate.nodes);
  trustedBindings.effectEnvelopeRef = [...new Set([
    ...trustedBindings.effectEnvelopeRef,
    ...authorizationBindings.map((item) => item.effectEnvelopeRef)
  ])].sort();
  return createIntentTrustSnapshot({
    schemaVersion: 'vexlife.intent-trust-snapshot/v0',
    snapshotRef: 'trust-snapshot.test.current',
    sourceRef: 'test/intent-workgraph.test.mjs#runtime-trust-snapshot',
    formationRef: 'formation.test.intent-trust.current',
    formedAt: '2026-07-31T00:00:00.000Z',
    currentness: 'CURRENT',
    bindingRefs: trustedBindings,
    actorRefs: [...new Set([
      'vex.test',
      'person.test.human',
      ...(candidate.transitions ?? []).map((item) => item.actorRef),
      ...(candidate.interpretations ?? []).map((item) => item.actorRef),
      ...(candidate.proposedPlans ?? []).map((item) => item.actorRef),
      ...(candidate.authorizations ?? []).map((item) => item.actorRef)
    ])].sort(),
    decisionRefs: [...new Set(authorizationBindings.map((item) => item.decisionRef))].sort(),
    authorizationBindings,
    ...overrides
  }, registry);
}

function options(candidate, trusted = trustSnapshot(candidate)) {
  return {
    registry,
    registeredProcessRefs,
    registeredRoleRefs,
    trustSnapshot: trusted
  };
}

function validate(candidate, trusted = trustSnapshot(candidate)) {
  return validateIntentWorkgraph(candidate, options(candidate, trusted));
}

function provenReceipt(workNode, overrides = {}) {
  return {
    receiptRef: `receipt.${workNode.workNodeRef}`,
    workNodeRef: workNode.workNodeRef,
    expectedTransitionRef: workNode.expectedTransitionRef,
    nodeSemanticFingerprint: workNode.semanticFingerprint,
    disposition: workNode.state,
    sourceState: workNode.state,
    state: 'PROVEN',
    currentness: 'CURRENT',
    sourceRefs: [`source.${workNode.workNodeRef}`],
    sourceHashes: ['b'.repeat(64)],
    formedAt: '2026-07-31T00:01:00.000Z',
    formationRef: `formation.${workNode.workNodeRef}`,
    ...overrides
  };
}

function interpretation() {
  return {
    interpretationRef: 'interpretation.test.1',
    sourceIntentRef: 'intent.test.root',
    actorRef: 'vex.test',
    actorRoleRef: 'role.vex.developer',
    formedAt: '2026-07-31T00:00:01.000Z',
    sourceRefs: ['source.interpretation.test'],
    authorityDisposition: 'NO_AUTHORITY',
    effectDisposition: 'NO_EFFECTS',
    contentRef: 'content.interpretation.test'
  };
}

function plan() {
  return {
    planRef: 'plan.test.1',
    sourceIntentRef: 'intent.test.root',
    actorRef: 'vex.test',
    actorRoleRef: 'role.vex.developer',
    formedAt: '2026-07-31T00:00:02.000Z',
    sourceRefs: ['source.plan.test'],
    authorityDisposition: 'NO_AUTHORITY',
    effectDisposition: 'NO_EFFECTS',
    planContentRef: 'content.plan.test'
  };
}

function authorization() {
  return {
    authorizationRef: 'authorization.test.1',
    sourceIntentRef: 'intent.test.root',
    actorRef: 'person.test.human',
    actorRoleRef: 'role.vex.operations',
    formedAt: '2026-07-31T00:00:03.000Z',
    sourceRefs: ['source.authorization.test'],
    authorityDisposition: 'AUTHORIZED_BOUNDED',
    effectDisposition: 'EFFECT_ENVELOPE_BOUND',
    effectEnvelopeRef: 'effect-envelope.authorization.test',
    decisionRef: 'decision.authorization.test'
  };
}

test('T0 original intent and attributed projections are canonical, immutable, and authority-explicit', () => {
  const original = envelope();
  assert.equal(isDeeplyFrozen(original), true);
  assert.throws(() => {
    original.desiredOutcome.summary = 'rewritten';
  }, TypeError);
  const candidate = graph([node('work.test.capture')], {
    intent: original,
    interpretations: [interpretation()],
    proposedPlans: [plan()],
    authorizations: [authorization()]
  });
  assert.equal(isDeeplyFrozen(candidate), true);
  assert.equal(candidate.intent.desiredOutcome.summary, 'Prove bounded intent orchestration');
  assert.equal(candidate.proposedPlans[0].authorityDisposition, 'NO_AUTHORITY');
  assert.equal(validate(candidate).state, 'PLAN_VALIDATED');
  assert.throws(() => graph([node('work.test.invalid-plan')], {
    proposedPlans: [{ ...plan(), authorityDisposition: 'AUTHORIZED_BOUNDED' }]
  }), /plan must remain|semanticFingerprint|NO_AUTHORITY/);
  assert.throws(() => graph([node('work.test.invalid-interpretation')], {
    interpretations: [{ ...interpretation(), authorityDisposition: 'AUTHORIZED_BOUNDED' }]
  }), /interpretation must remain|semanticFingerprint|NO_AUTHORITY/);

  const trusted = trustSnapshot(candidate);
  const fabricatedRole = graph([node('work.test.fabricated-role')], {
    interpretations: [{ ...interpretation(), actorRoleRef: 'role.fabricated' }]
  });
  assert.ok(validate(fabricatedRole, trusted).errors.some((error) => error.includes('unresolved actor role')));
  const fabricatedEffect = graph([node('work.test.fabricated-effect')], {
    authorizations: [{ ...authorization(), effectEnvelopeRef: 'effect-envelope.fabricated' }]
  });
  assert.ok(validate(fabricatedEffect, trusted).errors.some((error) => error.includes('unresolved authorization effect')));
  const invalidDecision = graph([node('work.test.invalid-decision')], {
    authorizations: [{ ...authorization(), decisionRef: 'decision.fabricated' }]
  });
  assert.ok(validate(invalidDecision, trusted).errors.some((error) => error.includes('unresolved decision')));
});

test('T1 exact known-intent resolution handles one, zero, and ambiguous matches without authority', () => {
  assert.deepEqual(validateIntentRegistry(registry, { registeredProcessRefs }).errors, []);
  const exact = resolveKnownIntent('CAPTURE_INTENT', registry);
  assert.equal(exact.state, 'RESOLVED');
  assert.equal(exact.processRef, 'process.vexlife.intent.capture');
  assert.equal(exact.authority, 'NO_EXECUTION_AUTHORITY');
  assert.equal(resolveKnownIntent('UNREGISTERED_INTENT', registry).state, 'HELD_UNKNOWN');
  const ambiguousRegistry = structuredClone(registry);
  ambiguousRegistry.knownIntentProcessRoutes.push({
    resolutionRef: 'resolution.intent.capture.alternate',
    intentKey: 'CAPTURE_INTENT',
    processRef: 'process.vexlife.intent.decompose-candidate'
  });
  const ambiguous = resolveKnownIntent('CAPTURE_INTENT', ambiguousRegistry);
  assert.equal(ambiguous.state, 'NEEDS_CLARIFICATION');
  assert.equal(ambiguous.processRef, null);
});

test('T2 complex intent produces an acyclic deterministic dependency order', () => {
  const candidate = graph([
    node('work.test.capture'),
    node('work.test.plan', { dependencyRefs: ['work.test.capture'] }),
    node('work.test.review', { dependencyRefs: ['work.test.capture'] }),
    node('work.test.converge', { dependencyRefs: ['work.test.plan', 'work.test.review'] })
  ]);
  const result = validate(candidate);
  assert.equal(result.state, 'PLAN_VALIDATED');
  assert.equal(result.cycle, null);
  assert.deepEqual(result.topologicalOrder, [
    'work.test.capture',
    'work.test.plan',
    'work.test.review',
    'work.test.converge'
  ]);
});

test('T3 dependency, self, and containment cycles fail closed', () => {
  const self = validate(graph([node('work.test.self', { dependencyRefs: ['work.test.self'] })]));
  assert.ok(self.errors.some((error) => error.includes('self-dependency')));
  const cycle = validate(graph([
    node('work.test.a', { dependencyRefs: ['work.test.b'] }),
    node('work.test.b', { dependencyRefs: ['work.test.a'] })
  ]));
  assert.ok(cycle.errors.some((error) => error.includes('workgraph cycle')));
  const hierarchy = validate(graph([
    node('work.test.parent-a', { parentWorkNodeRef: 'work.test.parent-b', childRefs: ['work.test.parent-b'] }),
    node('work.test.parent-b', { parentWorkNodeRef: 'work.test.parent-a', childRefs: ['work.test.parent-a'] })
  ]));
  assert.ok(hierarchy.errors.some((error) => error.includes('containment hierarchy cycle')));
});

test('T4 canonical node fingerprints reject caller control, normalize sets, and detect active duplicates', () => {
  assert.throws(() => node('work.test.custom-fingerprint', { semanticFingerprint: 'caller-controlled' }), /canonical snapshot identity/);
  const shared = {
    purpose: 'Same semantic work',
    capabilityEnvelopeRef: 'capability-envelope.shared',
    effectEnvelopeRef: 'effect-envelope.shared',
    resourceEnvelopeRef: 'resource-envelope.shared',
    expectedTransitionRef: 'expected-transition.shared',
    completionGateRefs: ['completion-gate.z', 'completion-gate.a'],
    returnRouteRef: 'return-route.shared',
    sourceRefs: ['source.z', 'source.a'],
    applicableCultureRefs: ['culture.z', 'culture.a']
  };
  const left = node('work.test.duplicate-a', shared);
  const right = node('work.test.duplicate-b', {
    ...shared,
    completionGateRefs: [...shared.completionGateRefs].reverse(),
    sourceRefs: [...shared.sourceRefs].reverse(),
    applicableCultureRefs: [...shared.applicableCultureRefs].reverse()
  });
  assert.equal(left.semanticFingerprint, right.semanticFingerprint);
  assert.ok(validate(graph([left, right])).errors.some((error) => error.includes('active semantic duplicate')));
  const superseded = node('work.test.duplicate-a', { ...shared, state: 'SUPERSEDED' });
  assert.equal(validate(graph([superseded, right])).state, 'PLAN_VALIDATED');
});

test('T5 every typed binding resolves exactly; plausible prefixes alone fail closed', () => {
  const trustedCandidate = graph([node('work.test.broken')]);
  const trusted = trustSnapshot(trustedCandidate);
  const broken = node('work.test.broken', { capabilityEnvelopeRef: 'capability-envelope.plausible-but-missing' });
  const candidate = graph([broken]);
  const result = validate(candidate, trusted);
  assert.equal(result.state, 'BLOCKED');
  assert.ok(result.errors.some((error) => error.includes('unresolved capabilityEnvelopeRef')));
  assert.equal(candidate.bindingRefs.capabilityEnvelopeRef.includes(broken.capabilityEnvelopeRef), true);

  const missingTrust = validateIntentWorkgraph(candidate, {
    registry,
    registeredProcessRefs,
    registeredRoleRefs
  });
  assert.ok(missingTrust.errors.some((error) => error.includes('trusted intent snapshot is required')));
  const staleTrust = trustSnapshot(trustedCandidate, { currentness: 'SUPERSEDED' });
  assert.ok(validate(candidate, staleTrust).errors.some((error) => error.includes('not CURRENT')));

  const missingRole = validateIntentWorkgraph(graph([node('work.test.role')]), {
    ...options(graph([node('work.test.role')])),
    registeredRoleRefs: []
  });
  assert.ok(missingRole.errors.some((error) => error.includes('missing role')));
});

test('T6 readiness requires one exact current dependency receipt and rejects stale or wrong evidence', () => {
  const dependency = node('work.test.dependency', { state: 'CANCELLED' });
  const dependent = node('work.test.dependent', { state: 'READY', dependencyRefs: [dependency.workNodeRef] });
  assert.deepEqual(validate(graph([dependency, dependent])).sets.ready, []);

  const exactGraph = graph([dependency, dependent], { receipts: [provenReceipt(dependency)] });
  assert.deepEqual(validate(exactGraph).sets.ready, [dependent.workNodeRef]);

  const stale = graph([dependency, dependent], {
    receipts: [provenReceipt(dependency, { currentness: 'SUPERSEDED' })]
  });
  assert.deepEqual(validate(stale).sets.ready, []);

  const wrongFingerprint = graph([dependency, dependent], {
    receipts: [provenReceipt(dependency, { nodeSemanticFingerprint: 'c'.repeat(64) })]
  });
  const wrongResult = validate(wrongFingerprint);
  assert.deepEqual(wrongResult.sets.ready, []);
  assert.ok(wrongResult.errors.some((error) => error.includes('wrong node fingerprint')));

  const appended = appendReceipt(graph([dependency, dependent]), provenReceipt(dependency), registry);
  assert.equal(appended.changed, true);
  assert.notEqual(appended.graph.semanticFingerprint, graph([dependency, dependent]).semanticFingerprint);
});

test('T7 completion and convergence require unambiguous exact current receipts', () => {
  const completed = node('work.test.completed', { state: 'COMPLETED' });
  assert.ok(validate(graph([completed])).errors.some((error) => error.includes('missing exact current')));
  assert.equal(validate(graph([completed], { receipts: [provenReceipt(completed)] })).state, 'PLAN_VALIDATED');

  const duplicate = graph([completed], {
    receipts: [
      provenReceipt(completed),
      provenReceipt(completed, { receiptRef: 'receipt.work.test.completed.duplicate' })
    ]
  });
  assert.ok(validate(duplicate).errors.some((error) => error.includes('duplicate current receipts')));
});

test('T8 unchanged implementation head cannot prove a mutation transition', () => {
  const completed = node('work.test.mutation', { state: 'COMPLETED' });
  const stale = validate(graph([completed], {
    receipts: [provenReceipt(completed, {
      requiresMutation: true,
      beforeImplementationHead: 'head.same',
      afterImplementationHead: 'head.same'
    })]
  }));
  assert.ok(stale.errors.some((error) => error.includes('changed implementation head')));
  const changed = validate(graph([completed], {
    receipts: [provenReceipt(completed, {
      requiresMutation: true,
      beforeImplementationHead: 'head.before',
      afterImplementationHead: 'head.after'
    })]
  }));
  assert.equal(changed.state, 'PLAN_VALIDATED');
});

test('T9 parent convergence requires symmetric single-parent lineage and exact child evidence', () => {
  const child = node('work.test.child', { state: 'CANCELLED', parentWorkNodeRef: 'work.test.parent' });
  const parent = node('work.test.parent', { state: 'CONVERGED', childRefs: [child.workNodeRef] });
  const missing = validate(graph([parent, child], { receipts: [provenReceipt(parent)] }));
  assert.ok(missing.errors.some((error) => error.includes('exact current child receipt')));
  const converged = validate(graph([parent, child], {
    receipts: [provenReceipt(parent), provenReceipt(child)]
  }));
  assert.equal(converged.state, 'PLAN_VALIDATED');

  const secondParent = node('work.test.second-parent', { childRefs: [child.workNodeRef] });
  const multiple = validate(graph([parent, secondParent, child], {
    receipts: [provenReceipt(parent), provenReceipt(child)]
  }));
  assert.ok(multiple.errors.some((error) => error.includes('multiple parents')));
});

test('T10 HELD_UNKNOWN remains visible with a bounded human why and no authority', () => {
  const held = graph([node('work.test.unknown', {
    state: 'HELD_UNKNOWN',
    requiredHumanDecisionRef: 'decision.intent.unknown'
  })]);
  const result = validate(held);
  assert.equal(result.state, 'ATTENTION');
  const status = projectIntentStatus(held, options(held));
  assert.equal(status.needsHuman[0].requiredHumanDecisionRef, 'decision.intent.unknown');
  assert.equal(status.needsHuman[0].waitingReason, 'HELD_UNKNOWN');
  assert.equal(status.nextSafeAction.action, 'REQUEST_BOUNDED_HUMAN_DECISION');
  assert.equal(status.nextSafeAction.authority, 'NO_EXECUTION_AUTHORITY');
});

test('T11 branch cancellation is total and atomic across mixed active states with source lineage', () => {
  const states = ['READY', 'RUNNING', 'WAITING_TOOL', 'VERIFYING', 'FAILED_RECOVERABLE', 'PAUSED_AT_CHECKPOINT'];
  const nodes = states.map((state, index) => node(`work.test.cancel-${index}`, {
    state,
    parentWorkNodeRef: index === 0 ? null : `work.test.cancel-${index - 1}`,
    childRefs: index === states.length - 1 ? [] : [`work.test.cancel-${index + 1}`],
    ...(state === 'FAILED_RECOVERABLE' ? { blockingReasonRef: 'reason.intent.recoverable-test-failure' } : {})
  }));
  const candidate = graph(nodes);
  const result = cancelIntentBranch(candidate, nodes[0].workNodeRef, {
    transitionRef: 'transition.test.cancel-branch',
    reason: 'human cancelled bounded branch',
    actorRef: 'person.test.human',
    actorRoleRef: 'role.vex.operations',
    processRef: 'process.vexlife.intent.converge-parent',
    sourceRefs: ['source.cancellation.request'],
    createdAt: '2026-07-31T00:02:00.000Z'
  }, registry);
  assert.equal(result.transitions.length, states.length);
  assert.deepEqual(result.graph.nodes.map((item) => item.state), states.map(() => 'CANCELLED'));
  assert.ok(result.preservedSourceRefs.includes(`source.${nodes.at(-1).workNodeRef}`));
  assert.equal(validate(result.graph).state, 'PLAN_VALIDATED');

  const brokenPolicy = structuredClone(registry);
  brokenPolicy.cancellationPolicy.VERIFYING = { mode: 'TRANSITION', targetState: 'READY' };
  assert.throws(() => cancelIntentBranch(candidate, nodes[0].workNodeRef, {
    transitionRef: 'transition.test.cancel-atomic',
    reason: 'prove cancellation preflight is atomic',
    actorRef: 'person.test.human',
    actorRoleRef: 'role.vex.operations',
    processRef: 'process.vexlife.intent.converge-parent',
    sourceRefs: ['source.cancellation.atomic'],
    createdAt: '2026-07-31T00:02:30.000Z'
  }, brokenPolicy), /cancellation policy disallows/);
  assert.deepEqual(candidate.nodes.map((item) => item.state), states);
});

test('T12 transition ledgers replay per node, reject disallowed/disconnected history, and refresh graph identity', () => {
  const firstNode = node('work.test.transition-a', { state: 'CAPTURED' });
  const secondNode = node('work.test.transition-b', { state: 'CAPTURED' });
  const candidate = graph([firstNode, secondNode]);
  const transition = {
    transitionRef: 'transition.test.a',
    workNodeRef: firstNode.workNodeRef,
    priorState: 'CAPTURED',
    nextState: 'DECOMPOSED',
    reason: 'candidate decomposition formed',
    actorRef: 'vex.test',
    actorRoleRef: 'role.vex.developer',
    processRef: 'process.vexlife.intent.decompose-candidate',
    sourceRefs: ['source.transition.test'],
    createdAt: '2026-07-31T00:03:00.000Z'
  };
  const first = recordIntentTransition(candidate, transition, registry);
  const interleaved = recordIntentTransition(first.graph, {
    ...transition,
    transitionRef: 'transition.test.b',
    workNodeRef: secondNode.workNodeRef
  }, registry);
  const repeated = recordIntentTransition(interleaved.graph, transition, registry);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.reason, 'SEMANTIC_NO_OP');
  assert.notEqual(first.graph.semanticFingerprint, candidate.semanticFingerprint);
  assert.throws(() => recordIntentTransition(first.graph, {
    ...transition,
    transitionRef: 'transition.test.disallowed',
    priorState: 'DECOMPOSED',
    nextState: 'RUNNING'
  }, registry), /disallowed intent transition/);

  assert.throws(() => node('work.test.direct-completed', {
    initialState: 'COMPLETED',
    state: 'COMPLETED'
  }), /not an allowed formation state/);

  const unknownTransition = graph([node('work.test.known-transition-node', { state: 'CAPTURED' })], {
    transitions: [{
      ...transition,
      transitionRef: 'transition.test.unknown-node',
      workNodeRef: 'work.test.unknown-transition-node',
      sequence: 0
    }]
  });
  assert.ok(validate(unknownTransition).errors.some((error) => error.includes('unknown work node')));

  const attributedNode = node('work.test.transition-attribution', { state: 'DECOMPOSED' });
  const unresolvedAttribution = graph([attributedNode], {
    transitions: [{
      ...transition,
      transitionRef: 'transition.test.unresolved-attribution',
      workNodeRef: attributedNode.workNodeRef,
      processRef: 'process.fabricated',
      actorRef: 'actor.fabricated',
      sequence: 0
    }]
  });
  const attributionTrust = trustSnapshot(unresolvedAttribution, {
    actorRefs: ['vex.test']
  });
  const attributionResult = validate(unresolvedAttribution, attributionTrust);
  assert.ok(attributionResult.errors.some((error) => error.includes('unresolved process')));
  assert.ok(attributionResult.errors.some((error) => error.includes('unresolved actor actor.fabricated')));

  const disconnectedNode = node('work.test.disconnected-transition', { state: 'RUNNING' });
  const disconnected = graph([disconnectedNode], {
    transitions: [{
      ...transition,
      transitionRef: 'transition.test.disconnected',
      workNodeRef: disconnectedNode.workNodeRef,
      priorState: 'READY',
      nextState: 'RUNNING',
      sequence: 0
    }]
  });
  assert.ok(validate(disconnected).errors.some((error) => error.includes('disconnected')));

  const orderedNode = node('work.test.reversed-order', { state: 'PLAN_VALIDATED' });
  const ordered = graph([orderedNode]);
  const reversed = graph([orderedNode], { transitions: [...ordered.transitions].reverse() });
  assert.equal(validate(reversed).state, 'PLAN_VALIDATED');
  assert.equal(
    reversed.currentPointers.transitionByWorkNodeRef[orderedNode.workNodeRef],
    ordered.transitions.find((item) => item.sequence === 1).transitionRef
  );
  const missingAttribution = structuredClone(ordered);
  delete missingAttribution.transitions[0].actorRoleRef;
  assert.ok(validate(missingAttribution).errors.some((error) => error.includes('missing actorRoleRef')));
});

test('T13 compact projection answers what is waiting or blocked and omits heavy payloads', () => {
  const dependency = node('work.test.evidence', { state: 'CANCELLED' });
  const heavy = node('work.test.heavy', {
    state: 'READY',
    dependencyRefs: [dependency.workNodeRef],
    heavyRelationshipPayload: 'SECRET_HEAVY_PAYLOAD'
  });
  const blocked = node('work.test.blocked', {
    state: 'BLOCKED',
    blockingReasonRef: 'reason.intent.review-required'
  });
  const candidate = graph([dependency, heavy, blocked]);
  const status = projectIntentStatus(candidate, options(candidate));
  const serialized = JSON.stringify(status);
  assert.equal(serialized.includes('SECRET_HEAVY_PAYLOAD'), false);
  assert.deepEqual(status.waiting[0].unmetDependencyRefs, [dependency.workNodeRef]);
  assert.equal(status.waiting[0].waitingReason, 'UNMET_EXACT_DEPENDENCY_RECEIPTS');
  assert.equal(status.blocked[0].blockingReasonRef, 'reason.intent.review-required');
  assert.deepEqual(status.waiting[0].evidenceSourceRefs, [`source.${heavy.workNodeRef}`]);
});

test('T14 universal Blueprint hash and Atlas compose every Intent registry identity', () => {
  assert.deepEqual(validateIntentRegistry(registry, { registeredProcessRefs }).errors, []);
  assert.deepEqual(validateIntentTrustSnapshot(sourceManagedTrustSnapshot, {
    registry,
    registeredRoleRefs
  }).errors, []);
  const malformedTrust = structuredClone(sourceManagedTrustSnapshot);
  delete malformedTrust.authorizationBindings[0].authorizationRef;
  assert.ok(validateIntentTrustSnapshot(malformedTrust, {
    registry,
    registeredRoleRefs
  }).errors.some((error) => error.includes('missing authorizationRef')));
  const compiled = compileRegistryPack(bundle);
  const atlas = new Atlas(buildIdentityIndex(bundle));
  for (const ref of [
    registry.registryRef,
    registry.systemRef,
    'lifecycle.intent.ready',
    registry.receiptContract.contractRef,
    'receipt-state.intent.proven',
    'projection.intent.status',
    'contract.intent.attributed-plan',
    'resolution.intent.capture'
  ]) {
    assert.equal(compiled.require(ref).ref, ref);
    assert.equal(atlas.get(ref).ref, ref);
  }

  const omitted = { ...bundle, blueprint: structuredClone(bundle.blueprint), intentRegistry: null };
  delete omitted.blueprint.intentOrchestration;
  assert.ok(validateBlueprint(omitted).errors.some((error) => error.includes('intent registry')));

  const changedRegistry = structuredClone(registry);
  changedRegistry.purpose = `${changedRegistry.purpose} Changed semantic contract.`;
  const changed = {
    ...bundle,
    blueprint: { ...structuredClone(bundle.blueprint), intentOrchestration: changedRegistry },
    intentRegistry: changedRegistry
  };
  assert.notEqual(validateBlueprint(changed).semanticHash, validateBlueprint(bundle).semanticHash);

  const omittedLifecycle = structuredClone(registry);
  omittedLifecycle.lifecycleStateRefs = omittedLifecycle.lifecycleStateRefs.filter((item) => item.state !== 'READY');
  assert.ok(validateIntentRegistry(omittedLifecycle, { registeredProcessRefs }).errors
    .some((error) => error.includes('exactly cover declared states')));

  const duplicateIdentity = structuredClone(registry);
  duplicateIdentity.projectionIdentities.push(structuredClone(duplicateIdentity.projectionIdentities[0]));
  assert.ok(validateIntentRegistry(duplicateIdentity, { registeredProcessRefs }).errors
    .some((error) => error.includes('duplicate intent projection ref')));

  const unknownTarget = structuredClone(registry);
  unknownTarget.allowedTransitions.CAPTURED.push('STATE_FABRICATED');
  assert.ok(validateIntentRegistry(unknownTarget, { registeredProcessRefs }).errors
    .some((error) => error.includes('unknown target')));

  const unknownProcess = structuredClone(registry);
  unknownProcess.knownIntentProcessRoutes[0].processRef = 'process.fabricated';
  assert.ok(validateIntentRegistry(unknownProcess, { registeredProcessRefs }).errors
    .some((error) => error.includes('unknown intent process')));
});

test('T15 full gate and supported manifest registrations remain source-managed', () => {
  const packageJson = readJson(path.join(root, 'package.json'));
  const health = readJson(path.join(root, 'blueprint/build-health-registry.json'));
  const manifest = readJson(path.join(root, 'SOURCE-MANIFEST.json'));
  assert.equal(packageJson.scripts['intent:check'], 'node scripts/intent-check.mjs');
  assert.ok(health.checks.some((check) => check.checkRef === 'check.intent-orchestration' && check.blocking));
  assert.ok(health.checks.some((check) => check.checkRef === 'check.manifest' && check.blocking));
  assert.ok(['vexlife.source-manifest/v2', 'vexlife.source-manifest/v3'].includes(manifest.schemaVersion));
  assert.equal(fs.existsSync(path.join(root, 'scripts/intent-check.mjs')), true);
  assert.equal(fs.existsSync(path.join(root, 'blueprint/intent-trust-snapshot.json')), true);
});

// [VXG RealForever]
