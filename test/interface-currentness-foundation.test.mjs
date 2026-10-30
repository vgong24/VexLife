import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIdentityIndex, loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import {
  buildPortableConvergenceIdentityEntries,
  PORTABLE_CONVERGENCE_REQUIRED_INVARIANTS,
  validatePortableConvergenceContracts
} from '../src/core/portable-convergence-contract.mjs';

const bundle = loadBlueprint();
const contracts = bundle.blueprint.convergenceContracts;
const clone = () => structuredClone(contracts);
const INTERFACE_CURRENTNESS_REQUIRED_INVARIANTS = Object.freeze([
  'LOADED_DOCUMENT_SOURCE_DISTINCT_FROM_CURRENT_SERVER_SOURCE',
  'STALE_OBSERVATION_CANNOT_OVERWRITE_CURRENT_GENERATION',
  'READY_REQUIRES_CURRENT_SELECTED_CONVERSATION',
  'RECOVERY_TRUTH_DOES_NOT_REQUIRE_SEND_CURRENTNESS',
  'SOURCE_MISMATCH_PRECEDES_RECOVERY_PRESENTATION'
]);

function knownOwnerRefs() {
  return new Set(buildIdentityIndex(bundle).map((entry) => entry.ref));
}

function siblingConvergenceContract() {
  const sourceRef = 'source.vexlife.convergence-sibling.b6d9dd4876132fc408f0eacd2bb6b5b0d56e009f';
  return {
    schemaVersion: 'vexlife.portable-convergence-contract/v1',
    contractRef: 'contract.vexlife.convergence-sibling.001',
    relationshipRef: 'relationship.vexlife.convergence-sibling',
    ownerBlueprintRef: 'blueprint.vexlife.universal.001',
    purpose: 'Prove the portable convergence family admits a sibling relationship without inheriting Interface-specific meaning.',
    initialStateRef: 'state.vexlife.convergence-sibling.unobserved',
    canonicalSource: {
      repository: 'vgong24/VexLife',
      path: 'blueprint/fragments/convergence-contracts/examples/sibling-currentness.json',
      compositionField: 'convergenceContracts'
    },
    authority: {
      portableMeaningOwner: true,
      platformRealizationOwner: false,
      effectAuthorityOwner: false,
      rendererAuthorityOwner: false,
      stateOwnerTransferAllowed: false
    },
    inputIdentities: [{
      inputRef: 'input.vexlife.convergence-sibling.current-truth',
      ownerRef: 'module.vexlife.browser.document',
      brief: 'One independently owned current input for the sibling convergence fixture.',
      independentOwner: true,
      requiredForCoherence: true
    }],
    stateIdentities: [
      {
        stateRef: 'state.vexlife.convergence-sibling.unobserved',
        kind: 'UNOBSERVED',
        brief: 'The sibling relationship has no coherent input yet.',
        conditions: ['latestCoherentInput=UNAVAILABLE'],
        semanticState: true,
        familySemanticState: true,
        displayState: false,
        effectCommand: false
      },
      {
        stateRef: 'state.vexlife.convergence-sibling.current',
        kind: 'CURRENT',
        brief: 'The sibling relationship has admitted its coherent current input.',
        conditions: ['currentTruth=CURRENT'],
        semanticState: true,
        familySemanticState: true,
        displayState: false,
        effectCommand: false
      }
    ],
    invariantIdentities: [
      ...PORTABLE_CONVERGENCE_REQUIRED_INVARIANTS.map((code) => ({
        invariantRef: `invariant.vexlife.convergence-sibling.${code.toLowerCase().replaceAll('_', '-')}`,
        code,
        statement: `Sibling convergence preserves ${code}.`
      })),
      {
        invariantRef: 'invariant.vexlife.convergence-sibling.domain-specific-currentness',
        code: 'SIBLING_DOMAIN_SPECIFIC_CURRENTNESS',
        statement: 'The sibling fixture may carry its own domain invariant without inheriting Interface currentness laws.'
      }
    ],
    relationshipLawRows: [{
      rowRef: 'law.vexlife.convergence-sibling.current',
      when: ['currentTruth=CURRENT'],
      derivedStateRef: 'state.vexlife.convergence-sibling.current',
      effectAuthorityGranted: false,
      sourceRefs: [sourceRef]
    }],
    sourceBindings: [{
      sourceRef,
      repository: 'vgong24/VexLife',
      commit: 'b6d9dd4876132fc408f0eacd2bb6b5b0d56e009f',
      role: 'SIBLING_CONVERGENCE_TEST_EVIDENCE',
      paths: ['docs/UNIVERSAL-BLUEPRINT.md']
    }],
    heldRealizations: ['platform.vexlife.convergence-sibling']
  };
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

test('Interface currentness keeps its five relationship-specific invariants and precedence laws', () => {
  const invariantCodes = new Set(contracts[0].invariantIdentities.map((item) => item.code));
  for (const code of INTERFACE_CURRENTNESS_REQUIRED_INVARIANTS) assert.equal(invariantCodes.has(code), true, code);
  const laws = new Map(contracts[0].relationshipLawRows.map((row) => [row.rowRef, row]));
  assert.equal(laws.get('law.vexlife.interface.currentness.source-mismatch')?.derivedStateRef, 'state.vexlife.interface.currentness.source-mismatch');
  assert.equal(laws.get('law.vexlife.interface.currentness.companion-recoverable')?.derivedStateRef, 'state.vexlife.interface.currentness.recoverable');
  assert.equal(laws.get('law.vexlife.interface.currentness.ready-current-selected-conversation')?.derivedStateRef, 'state.vexlife.interface.currentness.ready');
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

test('portable convergence admits a sibling canonical source and domain-specific invariant set', () => {
  const sibling = siblingConvergenceContract();
  const validation = validatePortableConvergenceContracts([...contracts, sibling], { knownOwnerRefs: knownOwnerRefs() });
  assert.equal(validation.ok, true, validation.errors.join('\n'));
});

test('portable convergence rejects unsafe canonical source paths', () => {
  const bad = siblingConvergenceContract();
  bad.canonicalSource.path = 'blueprint/fragments/convergence-contracts/../outside.json';
  const validation = validatePortableConvergenceContracts([bad], { knownOwnerRefs: knownOwnerRefs() });
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /safe VexLife convergenceContracts source path/u);
});

test('portable convergence rejects contract and relationship identity collapse', () => {
  const bad = siblingConvergenceContract();
  bad.relationshipRef = bad.contractRef;
  const validation = validatePortableConvergenceContracts([bad], { knownOwnerRefs: knownOwnerRefs() });
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /contractRef and relationshipRef must be distinct stable identities/u);
});

test('portable convergence rejects stable identity collisions across contracts', () => {
  const sibling = siblingConvergenceContract();
  sibling.inputIdentities[0].inputRef = contracts[0].stateIdentities[0].stateRef;
  const validation = validatePortableConvergenceContracts([...contracts, sibling], { knownOwnerRefs: knownOwnerRefs() });
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /duplicate portable convergence stable identity state\.vexlife\.interface\.currentness\.unobserved/u);
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

test('portable convergence requires its generic coherent-input invariant', () => {
  const bad = clone();
  bad[0].invariantIdentities = bad[0].invariantIdentities.filter((item) => item.code !== 'LATEST_COHERENT_INPUT_REQUIRED');
  const validation = validatePortableConvergenceContracts(bad);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /missing required invariant LATEST_COHERENT_INPUT_REQUIRED/u);
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
