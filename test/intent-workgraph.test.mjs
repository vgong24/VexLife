import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Atlas } from '../src/core/atlas.mjs';
import { buildIdentityIndex, loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import {
  acceptIntentAssignment,
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
import {
  formIntentStewardshipRequestProjection,
  inspectIntentStewardshipProjection,
  projectIntentStatus
} from '../src/core/intent-projection.mjs';
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

function assignment(workNodeRef, overrides = {}) {
  return {
    assignmentRef: `assignment.${workNodeRef}`,
    sourceIntentRef: 'intent.test.root',
    workNodeRef,
    assigneeRef: 'person.test.assignee',
    acceptingActorRef: 'person.test.human',
    acceptedAt: '2026-07-31T00:00:04.000Z',
    sourceRefs: ['source.assignment.test'],
    ...overrides
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


test('FTA-09 accepted assignment is first-class, source-managed, immutable, and separately fingerprinted', () => {
  const work = node('work.test.assignment-first-class');
  const candidate = graph([work], { proposedPlans: [plan()] });
  assert.equal(Object.hasOwn(candidate, 'acceptedAssignments'), false);
  const accepted = acceptIntentAssignment(candidate, assignment(work.workNodeRef), registry);
  assert.equal(accepted.changed, true);
  assert.equal(accepted.assignment.assignmentState, 'CURRENT');
  assert.equal(accepted.assignment.acceptanceBasis, 'ORIGINATING_HUMAN_ACCEPTED');
  assert.equal(accepted.assignment.authorityDisposition, 'NO_AUTHORITY');
  assert.equal(accepted.assignment.effectDisposition, 'NO_EFFECTS');
  assert.equal(accepted.graph.acceptedAssignments.length, 1);
  assert.equal(isDeeplyFrozen(accepted.graph), true);
  assert.notEqual(accepted.graph.semanticFingerprint, candidate.semanticFingerprint);
  assert.equal(validate(accepted.graph).state, 'PLAN_VALIDATED');
});

test('FTA-10 a proposed plan or untrusted model actor alone cannot create accepted assignment', () => {
  const work = node('work.test.assignment-no-model');
  const planned = graph([work], { proposedPlans: [plan()] });
  assert.equal(Object.hasOwn(planned, 'acceptedAssignments'), false);
  assert.throws(
    () => acceptIntentAssignment(planned, assignment(work.workNodeRef, {
      acceptingActorRef: 'vex.test'
    }), registry),
    /originating human|bounded authorized actor/
  );
});

test('FTA-11 assignment binds exact current work node, scalar assignee, and accepting human or authorized actor', () => {
  const work = node('work.test.assignment-binding');
  const authorized = {
    ...authorization(),
    authorizationRef: 'authorization.test.assignment-acceptor',
    actorRef: 'vex.authorized.assignment',
    decisionRef: 'decision.authorization.assignment',
    effectEnvelopeRef: 'effect-envelope.authorization.assignment'
  };
  const candidate = graph([work], { authorizations: [authorized] });
  assert.equal(Object.hasOwn(candidate, 'acceptedAssignments'), false);
  const accepted = acceptIntentAssignment(candidate, assignment(work.workNodeRef, {
    acceptingActorRef: authorized.actorRef
  }), registry);
  assert.equal(accepted.assignment.workNodeRef, work.workNodeRef);
  assert.equal(accepted.assignment.assigneeRef, 'person.test.assignee');
  assert.equal(accepted.assignment.acceptingActorRef, authorized.actorRef);
  assert.equal(accepted.assignment.acceptanceBasis, 'AUTHORIZED_ACTOR_ACCEPTED');

  assert.throws(() => acceptIntentAssignment(candidate, assignment('work.test.absent'), registry), /absent work node/);
  assert.throws(() => acceptIntentAssignment(candidate, assignment(work.workNodeRef, {
    sourceIntentRef: 'intent.test.other'
  }), registry), /sourceIntentRef must match/);
  assert.throws(() => acceptIntentAssignment(candidate, assignment(work.workNodeRef, {
    assigneeRef: ['person.test.a', 'person.test.b']
  }), registry), /assigneeRef must be one stable scalar ref/);

  const settled = graph([node('work.test.assignment-settled', { state: 'COMPLETED' })]);
  assert.throws(
    () => acceptIntentAssignment(settled, assignment('work.test.assignment-settled'), registry),
    /is not current in state COMPLETED/
  );
});

test('FTA-12 duplicate or conflicting current assignment fails closed', () => {
  const work = node('work.test.assignment-conflict');
  const candidate = graph([work]);
  const first = acceptIntentAssignment(candidate, assignment(work.workNodeRef), registry);
  assert.throws(
    () => acceptIntentAssignment(first.graph, assignment(work.workNodeRef), registry),
    /duplicate accepted assignment ref/
  );
  assert.throws(
    () => acceptIntentAssignment(first.graph, assignment(work.workNodeRef, {
      assignmentRef: 'assignment.work.test.assignment-conflict.second',
      assigneeRef: 'person.test.other-assignee'
    }), registry),
    /conflicting current assignment/
  );
});

test('FTA-13 settled, cancelled, or superseded work cannot retain a false current assignment', () => {
  const work = node('work.test.assignment-lifecycle', { state: 'READY' });
  const candidate = acceptIntentAssignment(graph([work]), assignment(work.workNodeRef), registry).graph;
  const cancelled = recordIntentTransition(candidate, {
    transitionRef: 'transition.test.assignment.cancel',
    workNodeRef: work.workNodeRef,
    priorState: 'READY',
    nextState: 'CANCELLED',
    reason: 'assignment owner cancelled work',
    actorRef: 'person.test.human',
    actorRoleRef: 'role.vex.operations',
    processRef: 'process.vexlife.intent.converge-parent',
    sourceRefs: ['source.assignment.cancel'],
    createdAt: '2026-07-31T00:05:00.000Z'
  }, registry).graph;
  assert.equal(cancelled.acceptedAssignments[0].assignmentState, 'SETTLED');
  assert.equal(cancelled.acceptedAssignments[0].settledByWorkStateOrNull, 'CANCELLED');

  const verifying = node('work.test.assignment-complete', { state: 'VERIFYING' });
  const assigned = acceptIntentAssignment(graph([verifying]), assignment(verifying.workNodeRef), registry).graph;
  const completed = recordIntentTransition(assigned, {
    transitionRef: 'transition.test.assignment.complete',
    workNodeRef: verifying.workNodeRef,
    priorState: 'VERIFYING',
    nextState: 'COMPLETED',
    reason: 'work proof completed independently of assignment',
    actorRef: 'vex.test',
    actorRoleRef: 'role.vex.developer',
    processRef: 'process.vexlife.intent.verify-transition',
    sourceRefs: ['source.assignment.complete'],
    createdAt: '2026-07-31T00:06:00.000Z'
  }, registry).graph;
  assert.equal(completed.acceptedAssignments[0].assignmentState, 'SETTLED');
  assert.equal(completed.acceptedAssignments[0].settledByWorkStateOrNull, 'COMPLETED');

  const superseded = recordIntentTransition(completed, {
    transitionRef: 'transition.test.assignment.supersede',
    workNodeRef: verifying.workNodeRef,
    priorState: 'COMPLETED',
    nextState: 'SUPERSEDED',
    reason: 'later accepted work superseded settled node',
    actorRef: 'person.test.human',
    actorRoleRef: 'role.vex.operations',
    processRef: 'process.vexlife.intent.converge-parent',
    sourceRefs: ['source.assignment.supersede'],
    createdAt: '2026-07-31T00:07:00.000Z'
  }, registry).graph;
  assert.notEqual(superseded.acceptedAssignments[0].assignmentState, 'CURRENT');
});

test('FTA-14 accepted assignment creates neither completion receipt nor implicit effect authority', () => {
  const work = node('work.test.assignment-no-effect');
  const candidate = graph([work]);
  const accepted = acceptIntentAssignment(candidate, assignment(work.workNodeRef), registry);
  assert.equal(accepted.graph.receipts.length, 0);
  assert.equal(accepted.assignment.authorityDisposition, 'NO_AUTHORITY');
  assert.equal(accepted.assignment.effectDisposition, 'NO_EFFECTS');
  assert.equal(Object.hasOwn(accepted.assignment, 'effectEnvelopeRef'), false);
  assert.equal(Object.hasOwn(accepted.assignment, 'completionReceiptRef'), false);
  assert.equal(accepted.graph.nodes[0].state, work.state);
});

test('FTA-15 prior Intent Workgraphs remain validator-compatible and fingerprint-stable when no assignment exists', () => {
  const work = node('work.test.assignment-compat');
  const first = graph([work]);
  const second = graph([work]);
  assert.equal(Object.hasOwn(first, 'acceptedAssignments'), false);
  assert.equal(first.semanticFingerprint, second.semanticFingerprint);
  assert.equal(validate(first).state, 'PLAN_VALIDATED');
  assert.equal(validate(second).state, 'PLAN_VALIDATED');
});


function stewardshipCausalFixture() {
  const work = node('work.test.stewardship-causal', {
    state: 'READY',
    roleRef: 'role.vex.developer',
    capabilityEnvelopeRef: 'capability-envelope.stewardship-causal',
    effectEnvelopeRef: 'effect-envelope.stewardship-causal',
    returnRouteRef: 'return-route.stewardship-causal'
  });
  const initial = graph([work], { proposedPlans: [plan()] });
  const accepted = acceptIntentAssignment(initial, assignment(work.workNodeRef, {
    assigneeRef: 'vex.stewardship.causal'
  }), registry).graph;
  const currentWork = accepted.nodes.find((item) => item.workNodeRef === work.workNodeRef);
  const schedulerEvidence = {
    sourceRefs: ['source.scheduler.stewardship-causal'],
    occupancy: {
      occupancyRef: 'occupancy.stewardship-causal',
      occupancyFingerprint: 'c'.repeat(64),
      actorRef: 'vex.stewardship.causal',
      actorClass: 'VEX_AI',
      workNodeRef: currentWork.workNodeRef,
      graphFingerprint: accepted.semanticFingerprint,
      roleRef: currentWork.roleRef,
      currentness: 'CURRENT',
      lifecycle: 'ACTIVE'
    },
    capabilityLease: {
      leaseRef: 'lease.capability.stewardship-causal',
      leaseFingerprint: 'd'.repeat(64),
      workNodeRef: currentWork.workNodeRef,
      graphFingerprint: accepted.semanticFingerprint,
      envelopeRef: currentWork.capabilityEnvelopeRef,
      currentness: 'CURRENT',
      lifecycle: 'ACTIVE'
    },
    effectLease: {
      leaseRef: 'lease.effect.stewardship-causal',
      leaseFingerprint: 'e'.repeat(64),
      workNodeRef: currentWork.workNodeRef,
      graphFingerprint: accepted.semanticFingerprint,
      envelopeRef: currentWork.effectEnvelopeRef,
      effectDisposition: 'NO_EFFECTS',
      currentness: 'CURRENT',
      lifecycle: 'ACTIVE'
    }
  };
  const semanticEvidence = {
    intent: {
      producerRef: 'process.multivex.structured-intention-representation.v2',
      producerFingerprint: '1'.repeat(64),
      sourceRefs: ['process.multivex.structured-intention-representation.v2', 'source.intent.protected-outcome'],
      currentness: 'CURRENT',
      protectedOutcomeRefs: ['outcome.stewardship.lower-monthly-cost'],
      constraintRefs: ['constraint.stewardship.no-risk-tonight']
    },
    pathFrontier: {
      producerRef: 'process.multivex.structured-intention-representation.v2',
      producerFingerprint: '2'.repeat(64),
      sourceRefs: [
        'process.multivex.structured-intention-representation.v2',
        'github.issue.vextreme-sdk.461',
        'source.path.stewardship-current'
      ],
      currentness: 'CURRENT',
      activePathRefOrNull: 'path.stewardship.current',
      minimalSafePathRefOrNull: 'path.stewardship.current',
      recommendedPathRefOrNull: 'path.stewardship.current',
      alternatePathRefs: [],
      heldPathRefs: ['path.stewardship.later'],
      decisionPathRefOrNull: 'path.stewardship.later',
      pathEvidenceRefs: ['evidence.stewardship.path'],
      recommendationBasisRefs: ['basis.stewardship.current-first'],
      whatWouldChangeRecommendationRefs: ['trigger.stewardship.prerequisite'],
      decisionNeed: 'CHOICE'
    },
    continuity: {
      producerRef: 'contract.vextreme.vex-continuity-stream.v1',
      producerFingerprint: '3'.repeat(64),
      sourceRefs: ['contract.vextreme.vex-continuity-stream.v1', 'source.continuity.frame'],
      currentness: 'CURRENT',
      openLoopRefs: ['open-loop.stewardship.later'],
      heldOpportunityRefs: ['opportunity.stewardship.later'],
      waitingExternalRefs: [],
      refreshTriggerRefs: ['trigger.stewardship.source-change'],
      continuityCurrentness: 'CURRENT',
      materialUnknownRefs: []
    },
    timing: {
      producerRef: 'github.issue.vextreme-sdk.461',
      producerFingerprint: '4'.repeat(64),
      sourceRefs: ['github.issue.vextreme-sdk.461', 'source.timing.explicit-not-now'],
      currentness: 'CURRENT',
      readinessState: 'NOT_NOW',
      readinessEvidenceClass: 'EXPLICIT_USER_SIGNAL',
      readinessEvidenceRefs: ['evidence.stewardship.not-now'],
      reminderConsentState: 'NOT_OFFERED',
      resurfaceMode: 'ON_EXPLICIT_TRIGGER',
      safeUntilOrNull: null,
      reactivationTriggerRefs: ['trigger.stewardship.user-ready'],
      interruptPolicyRefOrNull: 'policy.stewardship.nonurgent'
    },
    authority: {
      producerRef: 'SCA-00',
      producerFingerprint: '5'.repeat(64),
      sourceRefs: ['SCA-00', 'source.authority.current'],
      currentness: 'CURRENT',
      externalAuthorityRequired: false
    },
    outcome: {
      producerRef: 'foundation.multivex.operations.reversible-completion.v1',
      producerFingerprint: '6'.repeat(64),
      sourceRefs: ['foundation.multivex.operations.reversible-completion.v1', 'source.outcome.current'],
      currentness: 'CURRENT',
      effectProposedRefOrNull: null,
      effectResultRefOrNull: null,
      outcomeVerificationRefOrNull: null,
      intentSatisfied: false,
      intentSatisfactionEvidenceRefOrNull: null,
      residualOpenLoopRefs: ['open-loop.stewardship.later']
    }
  };
  return {
    graph: accepted,
    options: {
      registry,
      registeredProcessRefs,
      registeredRoleRefs,
      trustSnapshot: trustSnapshot(accepted),
      workNodeRef: currentWork.workNodeRef,
      assignmentRef: accepted.acceptedAssignments[0].assignmentRef,
      schedulerEvidence,
      semanticEvidence,
      caseRef: 'case.vexlife.stewardship.first-causal'
    }
  };
}

test('VS-C1 exact source-bound evidence forms one no-effect Stewardship adapter request from Intent Orchestration', () => {
  const { graph: candidate, options: projectionOptions } = stewardshipCausalFixture();
  const projection = formIntentStewardshipRequestProjection(candidate, projectionOptions);
  assert.equal(projection.projectionRef, 'projection.intent.stewardship-request');
  assert.equal(projection.request.intent.rootIntentionRef, candidate.rootIntentRef);
  assert.deepEqual(projection.request.continuity.activeWorkRefs, [projectionOptions.workNodeRef]);
  assert.equal(projection.request.responsibility.currentOccupancyOrNull.occupancyRef, projectionOptions.schedulerEvidence.occupancy.occupancyRef);
  assert.equal(projection.request.responsibility.requiredRoleRefOrNull, candidate.nodes[0].roleRef);
  assert.equal(projection.executionAuthority, 'NONE');
  assert.equal(projection.effectAuthority, 'NONE');
  assert.equal(projection.adapterReceipt.executionAuthority, 'NONE');
  assert.equal(projection.adapterReceipt.effectAuthority, 'NONE');
  assert.equal(projection.nextSafeAction.authority, 'NO_EXECUTION_AUTHORITY');
});

test('VS-C2 missing protected-outcome producer fails closed rather than manufacturing request truth', () => {
  const { graph: candidate, options: projectionOptions } = stewardshipCausalFixture();
  delete projectionOptions.semanticEvidence.intent;
  const inspection = inspectIntentStewardshipProjection(candidate, projectionOptions);
  assert.equal(inspection.ok, false);
  assert.ok(inspection.missingProducerRefs.includes('missing-producer.intent.stewardship.protected-outcome-or-constraint'));
  assert.throws(
    () => formIntentStewardshipRequestProjection(candidate, projectionOptions),
    /INTENT_STEWARDSHIP_REQUEST_PROJECTION_INVALID/
  );
});

test('VS-C3 work-node or attributed-plan identity cannot be silently substituted for a Stewardship path', () => {
  const first = stewardshipCausalFixture();
  first.options.semanticEvidence.pathFrontier.recommendedPathRefOrNull = first.options.workNodeRef;
  assert.ok(inspectIntentStewardshipProjection(first.graph, first.options).errors.includes('STEWARDSHIP_WORK_NODE_REF_USED_AS_PATH_REF'));

  const second = stewardshipCausalFixture();
  second.options.semanticEvidence.pathFrontier.recommendedPathRefOrNull = second.graph.proposedPlans[0].planContentRef;
  assert.ok(inspectIntentStewardshipProjection(second.graph, second.options).errors.includes('STEWARDSHIP_PLAN_REF_USED_AS_PATH_REF'));
});

test('VS-C4 absent Continuity Stream producer cannot silently become empty open/held state', () => {
  const { graph: candidate, options: projectionOptions } = stewardshipCausalFixture();
  delete projectionOptions.semanticEvidence.continuity;
  const inspection = inspectIntentStewardshipProjection(candidate, projectionOptions);
  assert.equal(inspection.ok, false);
  assert.ok(inspection.missingProducerRefs.includes('missing-producer.intent.stewardship.continuity-frame'));
});

test('VS-C5 inferred timing cannot declare human readiness or explicit NOT_NOW', () => {
  const ready = stewardshipCausalFixture();
  ready.options.semanticEvidence.timing.readinessState = 'READY_NOW';
  ready.options.semanticEvidence.timing.readinessEvidenceClass = 'INFERRED_CANDIDATE';
  assert.ok(inspectIntentStewardshipProjection(ready.graph, ready.options).errors.includes('STEWARDSHIP_INFERRED_READINESS_CANNOT_DECLARE_READY'));

  const notNow = stewardshipCausalFixture();
  notNow.options.semanticEvidence.timing.readinessEvidenceClass = 'INFERRED_CANDIDATE';
  assert.ok(inspectIntentStewardshipProjection(notNow.graph, notNow.options).errors.includes('STEWARDSHIP_INFERENCE_CANNOT_DECLARE_NOT_NOW'));
});

test('VS-C6 stale scheduler occupancy fails before the adapter request is formed', () => {
  const { graph: candidate, options: projectionOptions } = stewardshipCausalFixture();
  projectionOptions.schedulerEvidence.occupancy.currentness = 'STALE';
  const inspection = inspectIntentStewardshipProjection(candidate, projectionOptions);
  assert.equal(inspection.ok, false);
  assert.ok(inspection.errors.includes('STEWARDSHIP_SCHEDULER_OCCUPANCY_NOT_CURRENT_ACTIVE'));
});

test('VS-C7 work completion evidence cannot self-certify whole-intent satisfaction', () => {
  const { graph: candidate, options: projectionOptions } = stewardshipCausalFixture();
  projectionOptions.semanticEvidence.outcome.intentSatisfied = true;
  projectionOptions.semanticEvidence.outcome.intentSatisfactionEvidenceRefOrNull = null;
  assert.ok(inspectIntentStewardshipProjection(candidate, projectionOptions).errors.includes('STEWARDSHIP_INTENT_SATISFACTION_REQUIRES_EXPLICIT_EVIDENCE'));

  projectionOptions.semanticEvidence.outcome.intentSatisfactionEvidenceRefOrNull = 'verification.work-node.same';
  projectionOptions.semanticEvidence.outcome.outcomeVerificationRefOrNull = 'verification.work-node.same';
  assert.ok(inspectIntentStewardshipProjection(candidate, projectionOptions).errors.includes('STEWARDSHIP_WORK_COMPLETION_CANNOT_SELF_CERTIFY_INTENT_SATISFACTION'));
});

test('VS-C8 current assignment remains no-authority/no-effects through first causal projection', () => {
  const { graph: candidate, options: projectionOptions } = stewardshipCausalFixture();
  const projection = formIntentStewardshipRequestProjection(candidate, projectionOptions);
  assert.equal(projection.adapterInput.localBindings.assignment.authorityDisposition, 'NO_AUTHORITY');
  assert.equal(projection.adapterInput.localBindings.assignment.effectDisposition, 'NO_EFFECTS');
  assert.equal(projection.adapterInput.localBindings.assignment.assignmentState, 'CURRENT');
});

// [VXG RealForever]
