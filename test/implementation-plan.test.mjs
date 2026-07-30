import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { validateImplementationPlan, compileImplementationPacket, demoDistanceProjection } from '../src/core/implementation-plan.mjs';

test('implementation plan is acyclic and every work unit names paths, tests and an effect boundary', () => {
  const bundle = loadBlueprint();
  const validation = validateImplementationPlan(bundle.implementationPlan);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  assert.ok(validation.stats.workUnits >= 18);
});

test('Codex packet is bounded to one work unit and direct dependencies', () => {
  const bundle = loadBlueprint();
  const blueprintValidation = validateBlueprint(bundle);
  assert.equal(blueprintValidation.ok, true, blueprintValidation.errors.join('\n'));
  const waiting = compileImplementationPacket(bundle.implementationPlan, {
    workRef: 'work.vexlife.browser.addressed-conversation',
    platform: 'browser',
    acceptedWorkRefs: ['work.vexlife.blueprint.core'],
    currentBlueprintHash: blueprintValidation.semanticHash,
    now: '2026-07-30T00:00:00Z'
  });
  assert.equal(waiting.state, 'WAITING_DEPENDENCIES');
  assert.deepEqual(waiting.packet.unmetDependencies, ['work.vexlife.navigation.lattice']);
  assert.ok(waiting.packet.pathScope.every((path) => path.startsWith('VexLife/')));
  assert.ok(waiting.packet.requiredTestRefs.length > 0);
  assert.equal('workUnits' in waiting.packet, false);

  const ready = compileImplementationPacket(bundle.implementationPlan, {
    workRef: 'work.vexlife.browser.addressed-conversation',
    platform: 'browser',
    acceptedWorkRefs: ['work.vexlife.navigation.lattice'],
    currentBlueprintHash: blueprintValidation.semanticHash,
    now: '2026-07-30T00:00:00Z'
  });
  assert.equal(ready.state, 'PACKET_READY_NO_AUTHORITY');
  assert.equal(ready.packet.effectBoundary, 'LOCAL_CONVERSATION_ONLY');
});

test('platform-inapplicable packet fails closed', () => {
  const bundle = loadBlueprint();
  const result = compileImplementationPacket(bundle.implementationPlan, {
    workRef: 'work.vexlife.platform.android.adopt',
    platform: 'ios',
    acceptedWorkRefs: []
  });
  assert.equal(result.state, 'BLOCKED_PLATFORM_NOT_APPLICABLE');
});

test('demo distance uses named gates rather than an ungrounded percentage', () => {
  const bundle = loadBlueprint();
  const projection = demoDistanceProjection(bundle.implementationPlan, ['work.vexlife.blueprint.core']);
  assert.equal(projection.schemaVersion, 'vexlife.demo-distance-projection/v0');
  assert.ok(projection.rows.every((row) => !('percent' in row)));
  assert.ok(projection.rows.some((row) => row.distance === 'NEAR_DEMO'));
});

// [VXG RealForever]
