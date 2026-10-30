import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIdentityIndex, loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import {
  buildPortableConvergenceIdentityEntries,
  validatePortableConvergenceContracts
} from '../src/core/portable-convergence-contract.mjs';

const bundle = loadBlueprint();
const contracts = bundle.blueprint.convergenceContracts;
const clone = () => structuredClone(contracts);

function knownOwnerRefs() {
  return new Set(buildIdentityIndex(bundle).map((entry) => entry.ref));
}

test('Interface currentness portable convergence contract is current, effect-free and owner-bound', () => {
  const blueprint = validateBlueprint(bundle);
  assert.equal(blueprint.ok, true, blueprint.errors.join('\n'));
  assert.equal(blueprint.stats.portableConvergenceContracts, 1);
  assert.equal(blueprint.stats.portableConvergenceInputs, 5);
  assert.equal(blueprint.stats.portableConvergenceStates, 7);
  assert.equal(blueprint.stats.portableConvergenceLaws, 9);
  const refs = knownOwnerRefs();
  const validation = validatePortableConvergenceContracts(contracts, { knownOwnerRefs: refs });
  assert.equal(validation.ok, true, validation.errors.join('\n'));
});

test('Interface currentness identities keep relationship, owner and derivation edges explicit', () => {
  const entries = buildPortableConvergenceIdentityEntries(contracts);
  assert.equal(new Set(entries.map((entry) => entry.ref)).size, entries.length);
  const input = entries.find((entry) => entry.ref === 'input.vexlife.interface.currentness.loaded-document-source');
  assert.deepEqual(input.edges, [
    { type: 'CONTRACT', to: 'contract.vexlife.interface.currentness-convergence.001' },
    { type: 'OWNER', to: 'module.vexlife.browser.document' }
  ]);
  const ready = entries.find((entry) => entry.ref === 'law.vexlife.interface.currentness.ready-current-selected-conversation');
  assert.equal(ready.edges.some((edge) => edge.type === 'DERIVES' && edge.to === 'state.vexlife.interface.currentness.ready'), true);
});

test('portable convergence rejects missing current owners', () => {
  const bad = clone();
  bad[0].inputIdentities[0].ownerRef = 'module.vexlife.missing';
  const validation = validatePortableConvergenceContracts(bad, { knownOwnerRefs: knownOwnerRefs() });
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /ownerRef does not resolve/u);
});

test('portable convergence law rows cannot grant effect authority', () => {
  const bad = clone();
  bad[0].relationshipLawRows[0].effectAuthorityGranted = true;
  const validation = validatePortableConvergenceContracts(bad);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /must never grant effect authority/u);
});

test('portable convergence never manufactures initial UNOBSERVED through reconciliation', () => {
  const bad = clone();
  bad[0].relationshipLawRows[0].derivedStateRef = bad[0].initialStateRef;
  const validation = validatePortableConvergenceContracts(bad);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /must not derive initialStateRef/u);
});

test('portable convergence requires a derivation law for every non-initial semantic state', () => {
  const bad = clone();
  bad[0].relationshipLawRows = bad[0].relationshipLawRows.filter((row) => row.derivedStateRef !== 'state.vexlife.interface.currentness.action-required');
  const validation = validatePortableConvergenceContracts(bad);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /semantic state has no derivation law: state\.vexlife\.interface\.currentness\.action-required/u);
});

test('portable convergence requires coherent-input and stale-observation invariants', () => {
  for (const code of ['LATEST_COHERENT_INPUT_REQUIRED', 'STALE_OBSERVATION_CANNOT_OVERWRITE_CURRENT_GENERATION']) {
    const bad = clone();
    bad[0].invariantIdentities = bad[0].invariantIdentities.filter((item) => item.code !== code);
    const validation = validatePortableConvergenceContracts(bad);
    assert.equal(validation.ok, false);
    assert.match(validation.errors.join('\n'), new RegExp(`missing required invariant ${code}`));
  }
});

test('portable convergence cannot silently transfer independent input ownership', () => {
  const bad = clone();
  bad[0].inputIdentities[2].independentOwner = false;
  const validation = validatePortableConvergenceContracts(bad);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /must remain independently owned/u);
});

test('portable convergence contract shape remains closed', () => {
  const bad = clone();
  bad[0].runtimeOwner = 'forbidden';
  const validation = validatePortableConvergenceContracts(bad);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /must use exact top-level fields/u);
});

// [VXG RealForever]
