import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBlueprint } from '../src/core/blueprint.mjs';

const bundle = loadBlueprint();

test('State Relay foundation map exposes accepted snapshot and Compound reconciliation semantics', () => {
  const foundation = bundle.factory.foundations.find((item) => item.foundationRef === 'foundation.vexlife.state-relay.v1');
  const module = bundle.modules.modules.find((item) => item.moduleRef === 'module.vexlife.core.state-relay');
  const proof = bundle.blueprint.tests.find((item) => item.testRef === 'test.state.relay-foundation');

  assert.ok(foundation, 'State Relay foundation must remain registered');
  assert.ok(module, 'State Relay module must remain registered');
  assert.ok(proof, 'State Relay foundation proof identity must remain registered');
  assert.equal(foundation.revalidationProcedureRef, 'test.state.relay-foundation');
  for (const contract of ['StateCell', 'CombinedProjection', 'semanticEquality', 'noOpSuppression', 'createStateSnapshot', 'VexCompoundState', 'latestCoherentInput', 'serializedReconciliation']) {
    assert.equal(foundation.ownedContracts.includes(contract), true, `missing State Relay owned contract ${contract}`);
  }
  for (const selector of ['observation-currentness-change', 'compound-input-change']) {
    assert.equal(foundation.invalidationSelectors.includes(selector), true, `missing State Relay invalidation selector ${selector}`);
  }
  assert.match(foundation.purpose, /Compound/u);
  assert.match(module.role, /Compound/u);
  assert.equal(module.tests.includes('test/core.test.mjs'), true);
  assert.equal(module.tests.includes('test/state-relay-foundation-map.test.mjs'), true);
  assert.match(proof.brief, /coherent-input/u);
  assert.match(proof.brief, /serialized Compound reconciliation/u);
});

// [VXG RealForever]
