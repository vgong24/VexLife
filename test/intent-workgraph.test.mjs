import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  cancelIntentBranch,
  createIntentEnvelope,
  createIntentWorkgraph,
  createWorkNode,
  isDeeplyFrozen,
  recordIntentTransition
} from '../src/core/intent-workgraph.mjs';
import { projectIntentStatus } from '../src/core/intent-projection.mjs';
import { validateIntentRegistry, validateIntentWorkgraph } from '../src/core/intent-validation.mjs';
import { compileRegistryPack } from '../src/core/registry.mjs';
import { readJson } from '../src/core/utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = readJson(path.join(root, 'blueprint/intent-orchestration-registry.json'));

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
    desiredOutcome: { summary: 'Prove bounded intent orchestration' },
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

function graph(nodes, overrides = {}) {
  return createIntentWorkgraph({
    graphRef: 'intent-workgraph.test',
    intent: envelope(),
    nodes,
    interpretations: [],
    proposedPlans: [],
    authorizations: [],
    transitions: [],
    receipts: [],
    createdAt: '2026-07-31T00:00:00.000Z',
    ...overrides
  });
}

function provenReceipt(workNodeRef, overrides = {}) {
  return {
    receiptRef: `receipt.${workNodeRef}`,
    workNodeRef,
    expectedTransitionRef: `expected-transition.${workNodeRef}`,
    state: 'PROVEN',
    sourceRefs: [`source.${workNodeRef}`],
    createdAt: '2026-07-31T00:01:00.000Z',
    ...overrides
  };
}

test('T0 original intent remains deeply immutable and separate from attributed projections', () => {
  const original = envelope();
  assert.equal(isDeeplyFrozen(original), true);
  assert.throws(() => {
    original.desiredOutcome.summary = 'rewritten';
  }, TypeError);
  const candidate = graph([node('work.test.capture')], {
    intent: original,
    interpretations: [{ interpretationRef: 'interpretation.test.1', sourceIntentRef: original.intentRef, summary: 'attributed' }],
    proposedPlans: [{ planRef: 'plan.test.1', sourceIntentRef: original.intentRef }],
    authorizations: [{ authorizationRef: 'authorization.test.none', effects: [] }]
  });
  assert.equal(candidate.intent.desiredOutcome.summary, 'Prove bounded intent orchestration');
  assert.equal(candidate.interpretations[0].sourceIntentRef, original.intentRef);
});

test('T1 simple known intent resolves exactly one registered process', () => {
  const registryResult = validateIntentRegistry(registry);
  assert.deepEqual(registryResult.errors, []);
  const candidate = graph([node('work.test.simple', { processRef: 'process.vexlife.intent.capture' })]);
  const result = validateIntentWorkgraph(candidate, { registry });
  assert.equal(result.state, 'PLAN_VALIDATED');
  assert.deepEqual(result.topologicalOrder, ['work.test.simple']);
});

test('T2 complex intent produces an acyclic deterministic dependency order', () => {
  const candidate = graph([
    node('work.test.capture'),
    node('work.test.plan', { dependencyRefs: ['work.test.capture'] }),
    node('work.test.review', { dependencyRefs: ['work.test.capture'] }),
    node('work.test.converge', { dependencyRefs: ['work.test.plan', 'work.test.review'] })
  ]);
  const result = validateIntentWorkgraph(candidate, { registry });
  assert.equal(result.state, 'PLAN_VALIDATED');
  assert.equal(result.cycle, null);
  assert.deepEqual(result.topologicalOrder, [
    'work.test.capture',
    'work.test.plan',
    'work.test.review',
    'work.test.converge'
  ]);
});

test('T3 cycle and self-dependency fail closed', () => {
  const self = validateIntentWorkgraph(graph([
    node('work.test.self', { dependencyRefs: ['work.test.self'] })
  ]), { registry });
  assert.equal(self.state, 'BLOCKED');
  assert.ok(self.errors.some((error) => error.includes('self-dependency')));

  const cycle = validateIntentWorkgraph(graph([
    node('work.test.a', { dependencyRefs: ['work.test.b'] }),
    node('work.test.b', { dependencyRefs: ['work.test.a'] })
  ]), { registry });
  assert.equal(cycle.state, 'BLOCKED');
  assert.ok(cycle.errors.some((error) => error.includes('workgraph cycle')));
});

test('T4 active semantic duplicates fail while explicit supersession removes the collision', () => {
  const fingerprint = 'semantic-fingerprint.same';
  const active = validateIntentWorkgraph(graph([
    node('work.test.duplicate-a', { semanticFingerprint: fingerprint }),
    node('work.test.duplicate-b', { semanticFingerprint: fingerprint })
  ]), { registry });
  assert.ok(active.errors.some((error) => error.includes('active semantic duplicate')));

  const superseded = validateIntentWorkgraph(graph([
    node('work.test.duplicate-a', { semanticFingerprint: fingerprint, state: 'SUPERSEDED' }),
    node('work.test.duplicate-b', { semanticFingerprint: fingerprint })
  ]), { registry });
  assert.equal(superseded.state, 'PLAN_VALIDATED');
});

test('T5 missing process and capability/effect/resource/completion bindings fail closed', () => {
  const broken = structuredClone(node('work.test.broken'));
  broken.processRef = 'process.vexlife.intent.missing';
  broken.roleRef = 'role.vex.missing';
  broken.capabilityEnvelopeRef = null;
  broken.effectEnvelopeRef = null;
  broken.resourceEnvelopeRef = null;
  broken.completionGateRefs = [];
  broken.returnRouteRef = null;
  const result = validateIntentWorkgraph(graph([broken]), {
    registry,
    registeredRoleRefs: ['role.vex.developer']
  });
  assert.equal(result.state, 'BLOCKED');
  for (const field of ['missing process', 'missing role', 'capabilityEnvelopeRef', 'effectEnvelopeRef', 'resourceEnvelopeRef', 'completionGateRefs', 'returnRouteRef']) {
    assert.ok(result.errors.some((error) => error.includes(field)), field);
  }
});

test('T6 ready set changes only after the exact dependency receipt is proven', () => {
  const dependency = node('work.test.dependency', { state: 'CANCELLED' });
  const dependent = node('work.test.dependent', { state: 'READY', dependencyRefs: [dependency.workNodeRef] });
  const waiting = validateIntentWorkgraph(graph([dependency, dependent]), { registry });
  assert.deepEqual(waiting.sets.ready, []);
  assert.deepEqual(waiting.sets.waiting, ['work.test.dependent']);

  const admitted = validateIntentWorkgraph(graph([dependency, dependent], {
    receipts: [provenReceipt(dependency.workNodeRef)]
  }), { registry });
  assert.deepEqual(admitted.sets.ready, ['work.test.dependent']);
});

test('T7 COMPLETED requires exact expected transition evidence', () => {
  const completed = node('work.test.completed', { state: 'COMPLETED' });
  const missing = validateIntentWorkgraph(graph([completed]), { registry });
  assert.ok(missing.errors.some((error) => error.includes('missing exact expected transition evidence')));

  const proven = validateIntentWorkgraph(graph([completed], {
    receipts: [provenReceipt(completed.workNodeRef)]
  }), { registry });
  assert.equal(proven.state, 'PLAN_VALIDATED');
});

test('T8 unchanged implementation head cannot prove a mutation transition', () => {
  const completed = node('work.test.mutation', { state: 'COMPLETED' });
  const stale = validateIntentWorkgraph(graph([completed], {
    receipts: [provenReceipt(completed.workNodeRef, {
      requiresMutation: true,
      beforeImplementationHead: 'head.same',
      afterImplementationHead: 'head.same'
    })]
  }), { registry });
  assert.ok(stale.errors.some((error) => error.includes('changed implementation head')));

  const changed = validateIntentWorkgraph(graph([completed], {
    receipts: [provenReceipt(completed.workNodeRef, {
      requiresMutation: true,
      beforeImplementationHead: 'head.before',
      afterImplementationHead: 'head.after'
    })]
  }), { registry });
  assert.equal(changed.state, 'PLAN_VALIDATED');
});

test('T9 parent convergence requires terminal child disposition and exact child receipt', () => {
  const child = node('work.test.child', { state: 'CANCELLED', parentWorkNodeRef: 'work.test.parent' });
  const parent = node('work.test.parent', { state: 'CONVERGED', childRefs: [child.workNodeRef] });
  const parentReceipt = provenReceipt(parent.workNodeRef);
  const missing = validateIntentWorkgraph(graph([parent, child], { receipts: [parentReceipt] }), { registry });
  assert.ok(missing.errors.some((error) => error.includes('child receipt')));

  const converged = validateIntentWorkgraph(graph([parent, child], {
    receipts: [parentReceipt, provenReceipt(child.workNodeRef)]
  }), { registry });
  assert.equal(converged.state, 'PLAN_VALIDATED');
});

test('T10 HELD_UNKNOWN remains visible and non-green', () => {
  const held = graph([node('work.test.unknown', { state: 'HELD_UNKNOWN' })]);
  const result = validateIntentWorkgraph(held, { registry });
  assert.equal(result.state, 'ATTENTION');
  const status = projectIntentStatus(held, { registry });
  assert.equal(status.state, 'ATTENTION');
  assert.deepEqual(status.needsHuman.map((item) => item.workNodeRef), ['work.test.unknown']);
  assert.equal(status.nextSafeAction.action, 'REQUEST_BOUNDED_HUMAN_DECISION');
});

test('T11 cancellation preserves source, node, and descendant lineage', () => {
  const parent = node('work.test.cancel-parent', { state: 'READY', childRefs: ['work.test.cancel-child'] });
  const child = node('work.test.cancel-child', { parentWorkNodeRef: parent.workNodeRef });
  const candidate = graph([parent, child]);
  const result = cancelIntentBranch(candidate, parent.workNodeRef, {
    transitionRef: 'transition.test.cancel-parent',
    reason: 'human cancelled bounded branch',
    actorRef: 'person.test.human',
    processRef: 'process.vexlife.intent.converge-parent',
    sourceRefs: ['source.cancellation.request'],
    createdAt: '2026-07-31T00:02:00.000Z'
  }, registry);
  assert.equal(result.changed, true);
  assert.deepEqual(result.preservedNodeRefs, [parent.workNodeRef, child.workNodeRef]);
  assert.ok(result.preservedSourceRefs.includes(`source.${parent.workNodeRef}`));
  assert.ok(result.preservedSourceRefs.includes(`source.${child.workNodeRef}`));
  assert.equal(result.graph.nodes.find((item) => item.workNodeRef === parent.workNodeRef).state, 'CANCELLED');
});

test('T12 equal semantic transition suppresses another durable transition', () => {
  const candidate = graph([node('work.test.transition', { state: 'CAPTURED' })]);
  const transition = {
    transitionRef: 'transition.test.capture-to-decomposed',
    workNodeRef: 'work.test.transition',
    priorState: 'CAPTURED',
    nextState: 'DECOMPOSED',
    reason: 'candidate decomposition formed',
    actorRef: 'role.vex.developer',
    processRef: 'process.vexlife.intent.decompose-candidate',
    sourceRefs: ['source.transition.test'],
    createdAt: '2026-07-31T00:03:00.000Z'
  };
  const first = recordIntentTransition(candidate, transition, registry);
  const second = recordIntentTransition(first.graph, transition, registry);
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(second.reason, 'SEMANTIC_NO_OP');
  assert.equal(second.graph.transitions.length, 1);
});

test('T13 compact projection omits heavy payloads but remains source-descendable', () => {
  const heavy = node('work.test.heavy', {
    state: 'READY',
    heavyRelationshipPayload: 'SECRET_HEAVY_PAYLOAD',
    applicableLessonRefs: ['lesson.ref.only']
  });
  const status = projectIntentStatus(graph([heavy]), { registry });
  const serialized = JSON.stringify(status);
  assert.equal(serialized.includes('SECRET_HEAVY_PAYLOAD'), false);
  assert.equal(status.ready[0].workNodeRef, heavy.workNodeRef);
  assert.equal(status.sourceDescent.graphRef, 'intent-workgraph.test');
  assert.match(status.sourceDescent.detailCommand, /--detail/);
  assert.equal(status.nextSafeAction.authority, 'NO_EXECUTION_AUTHORITY');
});

test('T14 process and Atlas-facing refs resolve through canonical registries', () => {
  const bundle = loadBlueprint(root);
  const compiled = compileRegistryPack(bundle);
  for (const ref of [
    'state.intent-workgraph',
    'process.vexlife.intent.capture',
    'process.vexlife.intent.validate-workgraph',
    'module.vexlife.core.intent-workgraph',
    'module.vexlife.script.intent-status',
    'feature.vexlife.intent-orchestration-spine',
    'check.intent-orchestration',
    'work.vexlife.intent-orchestration-spine',
    'test.intent.registry-resolution'
  ]) assert.equal(compiled.require(ref).ref, ref);
});

test('T15 full gate and v2 manifest registrations remain source-managed', () => {
  const packageJson = readJson(path.join(root, 'package.json'));
  const health = readJson(path.join(root, 'blueprint/build-health-registry.json'));
  const manifest = readJson(path.join(root, 'SOURCE-MANIFEST.json'));
  assert.equal(packageJson.scripts['intent:check'], 'node scripts/intent-check.mjs');
  assert.ok(health.checks.some((check) => check.checkRef === 'check.intent-orchestration' && check.blocking));
  assert.ok(health.checks.some((check) => check.checkRef === 'check.manifest' && check.blocking));
  assert.equal(manifest.schemaVersion, 'vexlife.source-manifest/v2');
  assert.equal(fs.existsSync(path.join(root, 'scripts/intent-check.mjs')), true);
});

// [VXG RealForever]
