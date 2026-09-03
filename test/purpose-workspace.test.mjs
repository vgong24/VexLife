import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildExperienceTopology,
  compilePurposeWorkspace,
  evaluateExperienceTestCase,
  loadPurposeWorkspaceRegistry,
  runSyntheticSuite,
  simulateRoleRelay,
  validatePurposeWorkspaceRegistry
} from '../src/core/purpose-workspace.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/purpose-workspace/synthetic-scenarios.json', import.meta.url), 'utf8'));
const bundle = loadPurposeWorkspaceRegistry();

test('SPW-01 source foundation validates four domains and three primary tasks each', () => {
  const result = validatePurposeWorkspaceRegistry(bundle);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.deepEqual(result.stats, { domains: 4, roles: 16, tasks: 12, processPatterns: 6, completionContracts: 6 });
  assert.equal(bundle.domainPacks.every((domain) => domain.primaryTaskRefs.length === 3), true);
});

test('public establishment stays current while Purpose Workspace feature introduction remains a future registered successor', () => {
  assert.equal(bundle.registry.entryContinuityContract.publicEstablishmentPlanRef, 'plan.vexlife.guided-establishment.local.001');
  assert.equal(bundle.registry.entryContinuityContract.publicEstablishmentOwnerCurrent, true);
  assert.equal(bundle.registry.entryContinuityContract.featureWalkthroughPlanCurrent, false);
  assert.equal(bundle.registry.sourcePlacement.status, 'SOURCE_FOUNDATION_ONLY');
});

test('Do Understand Steward are projections over one domain/task rather than separate truth', () => {
  const doView = compilePurposeWorkspace({ domainRef: 'domain.purpose-workspace.learning', semanticDepth: 'DO' });
  const understand = compilePurposeWorkspace({ domainRef: doView.domainRef, taskRef: doView.task.taskRef, semanticDepth: 'UNDERSTAND' });
  const steward = compilePurposeWorkspace({ domainRef: doView.domainRef, taskRef: doView.task.taskRef, semanticDepth: 'STEWARD' });
  assert.equal(doView.task.taskRef, understand.task.taskRef);
  assert.equal(understand.task.taskRef, steward.task.taskRef);
  assert.equal(doView.effects, false);
  assert.equal(understand.stages.length, 5);
  assert.equal(steward.heldBoundaries.includes('real child data'), true);
});

test('all eight synthetic role-relay scenarios reach their declared evidence-bounded state', () => {
  const result = runSyntheticSuite({ fixture });
  assert.equal(result.scenarioResults.length, 8);
  assert.equal(result.scenarioPass, true, JSON.stringify(result.scenarioResults.filter((item) => item.completion.state !== fixture.scenarios.find((scenario) => scenario.scenarioRef === item.scenarioRef)?.expectedState), null, 2));
  assert.equal(result.scenarioResults.every((item) => item.effects.externalEffectPerformed === false && item.effects.realPersonDataUsed === false), true);
});

test('relationship labels never substitute for an explicit authority source', () => {
  const receipt = simulateRoleRelay({ scenario: { scenarioRef: 'scenario.relationship-only', domainRef: 'domain.purpose-workspace.learning', taskRef: 'task.learning.capture-growth-moment', relationshipClassRefs: ['relationship.caretaker-learner'], authorityClassRefs: [] } });
  assert.equal(receipt.completion.state, 'WAITING_FOR_AUTHORITY');
  assert.equal(receipt.relayEnvelopes[0].relationshipClassRefs.includes('relationship.caretaker-learner'), true);
  assert.equal(receipt.relayEnvelopes[0].authoritySourcePresent, false);
  assert.equal(receipt.relayEnvelopes[0].recipientRoleRefOrNull, 'role-lens.learning.caretaker');
  assert.equal(receipt.relayEnvelopes.at(-1).recipientRoleRefOrNull, null);
});

test('external delivery remains held even when its authority class is present', () => {
  const scenario = fixture.scenarios.find((item) => item.scenarioRef === 'scenario.learning.family-update.ready');
  const receipt = simulateRoleRelay({ scenario });
  assert.equal(receipt.completion.state, 'READY_FOR_EXTERNAL_EFFECT');
  assert.equal(receipt.stageReceipts.at(-1).state, 'HELD_EXTERNAL_EFFECT');
  assert.equal(receipt.effects.externalEffectPerformed, false);
});

test('24 reusable synthetic boundary cases preserve expected closed dispositions', () => {
  const results = fixture.boundaryCases.map(evaluateExperienceTestCase);
  assert.equal(results.length, 24);
  assert.equal(results.every((item) => item.pass), true);
  const counts = Object.groupBy ? Object.fromEntries(Object.entries(Object.groupBy(results, (item) => item.state)).map(([key, values]) => [key, values.length])) : results.reduce((map, item) => ((map[item.state] = (map[item.state] ?? 0) + 1), map), {});
  assert.deepEqual(counts, { WAITING_FOR_AUTHORITY: 7, CORRECTION_REQUIRED: 5, HELD: 6, SUPERSEDED: 2, COMPLETE_WITH_EVIDENCE: 2, READY_FOR_EXTERNAL_EFFECT: 2 });
  assert.equal(results.every((item) => item.effects.realPersonDataUsed === false && item.effects.externalEffectPerformed === false), true);
});

test('synthetic boundary evaluator rejects real-person data', () => {
  assert.throws(() => evaluateExperienceTestCase({ testCaseRef: 'case.invalid.real', domainRef: 'domain.invalid', syntheticOnly: true, rule: 'HELD', expectedState: 'HELD', facts: { realPersonDataUsed: true } }), /real person data/);
});

test('Experience Topology maps itself with zero unresolved or human-visible orphan edges', () => {
  const topology = buildExperienceTopology({ cases: fixture.boundaryCases });
  assert.equal(topology.audit.ok, true, JSON.stringify(topology.audit, null, 2));
  assert.equal(topology.audit.mapTracksItself, true);
  assert.deepEqual(topology.audit.missingRequiredNodeKinds, []);
  assert.equal(topology.metrics.domainPackCount, 4);
  assert.equal(topology.metrics.roleLensCount, 16);
  assert.equal(topology.metrics.taskCount, 12);
  assert.equal(topology.metrics.sharedComponentCount, 11);
  assert.equal(topology.metrics.domainPerScreenReuseRatio, 4);
  assert.equal(topology.edges.some((edge) => edge.from === topology.topologyRef && edge.to === topology.topologyRef && edge.relation === 'MAPS_SELF'), true);
});

// [VXG RealForever]
