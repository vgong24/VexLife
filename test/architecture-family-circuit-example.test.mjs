import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BROWSER_SOURCE_CONTROLS,
  BROWSER_SOURCE_EFFECTS,
  BrowserSourceConnectionExample,
  BrowserSourceFamilyExample,
  reconcileBrowserSourceRuntimeFacts,
  runVexArchitectureFamilyCircuitExample,
  VEX_ARCHITECTURE_FAMILY_CIRCUIT_EXAMPLE
} from '../examples/vex-architecture-family-circuit.mjs';

const TREE_A = 'a'.repeat(64);
const TREE_B = 'b'.repeat(64);
const REPO = '/example/vexlife';

test('worked example declares Family/Connection ownership without claiming product authority', () => {
  assert.equal(VEX_ARCHITECTURE_FAMILY_CIRCUIT_EXAMPLE.exampleClass, 'WORKED_EXAMPLE_NOT_PRODUCT_AUTHORITY');
  assert.deepEqual(
    VEX_ARCHITECTURE_FAMILY_CIRCUIT_EXAMPLE.familyOwns,
    ['SEMANTIC_STATE', 'SEMANTIC_CONTROL', 'CONTROL_PLUS_CURRENT_STATE_TO_ACT']
  );
  assert.equal(
    VEX_ARCHITECTURE_FAMILY_CIRCUIT_EXAMPLE.connectionOwns.includes('EFFECT_REALIZATION'),
    true
  );
  for (const invariant of [
    'EFFECT_REQUEST_IS_NOT_RESULTING_STATE',
    'FAMILY_DOES_NOT_REALIZE_EFFECT',
    'CONNECTION_RECONCILES_RUNTIME_REALITY_BEFORE_FAMILY_OBSERVE',
    'RUNTIME_SOURCE_IDENTITY_IS_STRONGER_THAN_PATH_SIMILARITY',
    'TEST_HOST_ADAPTATION_STAYS_OUTSIDE_SEMANTIC_OWNER'
  ]) {
    assert.equal(VEX_ARCHITECTURE_FAMILY_CIRCUIT_EXAMPLE.invariants.includes(invariant), true);
  }
});

test('Connection reconciliation distinguishes prior path, same-path stale tree, and exact current source', () => {
  const priorPath = reconcileBrowserSourceRuntimeFacts({
    receiptRepoPath: '/example/prior',
    requestedRepoPath: REPO,
    receiptSourceTreeSha256: TREE_A
  });
  assert.equal(priorPath.kind, 'PRIOR_SOURCE');
  assert.equal(priorPath.currentSourceTreeSha256, null);

  const staleSamePath = reconcileBrowserSourceRuntimeFacts({
    receiptRepoPath: REPO,
    requestedRepoPath: REPO,
    receiptSourceTreeSha256: TREE_A,
    currentSourceTreeSha256: TREE_B
  });
  assert.equal(staleSamePath.kind, 'PRIOR_SOURCE');
  assert.equal(staleSamePath.sourceCurrent, false);

  const exact = reconcileBrowserSourceRuntimeFacts({
    receiptRepoPath: REPO,
    requestedRepoPath: REPO,
    receiptSourceTreeSha256: TREE_B,
    currentSourceTreeSha256: TREE_B
  });
  assert.equal(exact.kind, 'CURRENT_SOURCE');
  assert.equal(exact.sourceCurrent, true);
});

test('Family resolves Control to Effect without claiming the Effect already changed State', () => {
  const family = new BrowserSourceFamilyExample({
    kind: 'PRIOR_SOURCE',
    receiptRepoPath: REPO,
    requestedRepoPath: REPO,
    receiptSourceTreeSha256: TREE_A,
    currentSourceTreeSha256: TREE_B
  });

  const act = family.activate(BROWSER_SOURCE_CONTROLS.ENSURE_CURRENT);

  assert.equal(act.admittedState, null);
  assert.deepEqual(act.effect, {
    kind: BROWSER_SOURCE_EFFECTS.ROTATE,
    requestedRepoPath: REPO
  });
  assert.equal(family.currentState.kind, 'PRIOR_SOURCE');
});

test('Connection realizes Effect and only observed exact runtime truth moves Family to CURRENT_SOURCE', async () => {
  let runtimeFacts = {
    receiptRepoPath: REPO,
    requestedRepoPath: REPO,
    receiptSourceTreeSha256: TREE_A,
    currentSourceTreeSha256: TREE_B
  };
  const family = new BrowserSourceFamilyExample(
    reconcileBrowserSourceRuntimeFacts(runtimeFacts)
  );
  const effects = [];

  const connection = new BrowserSourceConnectionExample({
    family,
    readRuntimeFacts: () => runtimeFacts,
    rotateBrowserSource: async (effect) => {
      effects.push(effect);
      assert.equal(family.currentState.kind, 'PRIOR_SOURCE');
      runtimeFacts = {
        ...runtimeFacts,
        receiptSourceTreeSha256: TREE_B
      };
      return { state: 'ROTATED' };
    }
  });

  const result = await connection.activate(BROWSER_SOURCE_CONTROLS.ENSURE_CURRENT);

  assert.equal(effects.length, 1);
  assert.equal(result.act.effect.kind, BROWSER_SOURCE_EFFECTS.ROTATE);
  assert.equal(result.effectResult.state, 'ROTATED');
  assert.equal(result.observedState.kind, 'CURRENT_SOURCE');
  assert.equal(family.currentState.kind, 'CURRENT_SOURCE');
});

test('already-current Family requests no runtime Effect', async () => {
  const exact = reconcileBrowserSourceRuntimeFacts({
    receiptRepoPath: REPO,
    requestedRepoPath: REPO,
    receiptSourceTreeSha256: TREE_B,
    currentSourceTreeSha256: TREE_B
  });
  const family = new BrowserSourceFamilyExample(exact);
  let effects = 0;
  const connection = new BrowserSourceConnectionExample({
    family,
    readRuntimeFacts: () => ({
      receiptRepoPath: REPO,
      requestedRepoPath: REPO,
      receiptSourceTreeSha256: TREE_B,
      currentSourceTreeSha256: TREE_B
    }),
    rotateBrowserSource: async () => {
      effects += 1;
      return { state: 'UNEXPECTED' };
    }
  });

  const result = await connection.activate(BROWSER_SOURCE_CONTROLS.ENSURE_CURRENT);

  assert.equal(effects, 0);
  assert.equal(result.act.effect, null);
  assert.equal(result.observedState.kind, 'CURRENT_SOURCE');
});

test('runnable worked example demonstrates prior State -> Effect -> observed CURRENT State', async () => {
  const result = await runVexArchitectureFamilyCircuitExample();
  assert.equal(result.exampleClass, 'WORKED_EXAMPLE_NOT_PRODUCT_AUTHORITY');
  assert.equal(result.before.kind, 'PRIOR_SOURCE');
  assert.equal(result.act.effect.kind, BROWSER_SOURCE_EFFECTS.ROTATE);
  assert.equal(result.effects.length, 1);
  assert.equal(result.after.kind, 'CURRENT_SOURCE');
});
