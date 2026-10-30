import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { validateFeatureRegistry } from '../src/core/feature-registry.mjs';

const bundle = loadBlueprint();

function state(ref) {
  return bundle.blueprint.stateDomains.find((item) => item.stateRef === ref);
}

function action(ref) {
  return bundle.blueprint.actions.find((item) => item.actionRef === ref);
}

function permission(ref) {
  return bundle.blueprint.permissions.find((item) => item.permissionRef === ref);
}

function process(ref) {
  return bundle.factory.processes.find((item) => item.processRef === ref);
}

function feature(ref) {
  return bundle.featureRegistry.features.find((item) => item.featureRef === ref);
}

function validateThemeModeDurabilityContract(candidateBundle) {
  const errors = [];
  const current = candidateBundle.blueprint.stateDomains.find((item) => item.stateRef === 'state.theme-mode');
  const durable = candidateBundle.blueprint.stateDomains.find((item) => item.stateRef === 'state.theme-mode.durable-selection');
  const select = candidateBundle.blueprint.actions.find((item) => item.actionRef === 'action.theme-mode.select');
  const selectPermission = candidateBundle.blueprint.permissions.find((item) => item.permissionRef === 'permission.theme-mode.select');
  const contractProcess = candidateBundle.factory.processes.find((item) => item.processRef === 'process.vexlife.theme-mode.select-and-persist');
  const registeredFeature = candidateBundle.featureRegistry.features.find((item) => item.featureRef === 'feature.vexlife.theme-mode');

  if (!current) errors.push('missing state.theme-mode');
  if (!durable) errors.push('missing state.theme-mode.durable-selection');
  if (!select) errors.push('missing action.theme-mode.select');
  if (!selectPermission) errors.push('missing permission.theme-mode.select');
  if (!contractProcess) errors.push('missing process.vexlife.theme-mode.select-and-persist');
  if (!registeredFeature) errors.push('missing feature.vexlife.theme-mode');
  if (errors.length) return errors;

  const vocabulary = ['NOT_SET', 'LIGHT', 'DARK'];
  if (JSON.stringify(current.valueVocabulary) !== JSON.stringify(vocabulary)) errors.push('current ThemeMode vocabulary drift');
  if (JSON.stringify(durable.valueVocabulary) !== JSON.stringify(vocabulary)) errors.push('durable ThemeMode vocabulary drift');
  if (current.currentnessContract?.holder !== 'SINGLE_STATE_RELAY') errors.push('ThemeMode current State must remain single-StateRelay owned');
  if (current.currentnessContract?.genericCurrentEmissionPersists !== false) errors.push('generic CURRENT emission must not imply durable save');
  if (!current.currentnessContract?.dependencyStateRefs?.includes('state.theme-mode.durable-selection')) errors.push('durable selection must remain a ThemeMode currentness dependency');
  if (current.currentnessContract?.dependencyObservationRule !== 'DURABLE_SELECTION_REENTERS_SAME_CURRENTNESS_BOUNDARY') errors.push('durable observation must re-enter the same currentness boundary');

  if (JSON.stringify(durable.durabilityContract?.operations) !== JSON.stringify(['OBSERVE','GET','SAVE','FORGET'])) errors.push('StateStore operation vocabulary drift');
  if (JSON.stringify(durable.durabilityContract?.explicitSelectionSaveValues) !== JSON.stringify(['LIGHT','DARK'])) errors.push('only explicit Light/Dark selections are saved');
  if (durable.durabilityContract?.forgetValue !== 'NOT_SET') errors.push('NOT_SET must remain the forget/no-explicit-selection value');
  if (durable.durabilityContract?.processRecreationRestorationRequired !== true) errors.push('process recreation restoration must remain required');
  if (durable.durabilityContract?.observationTargetStateRef !== 'state.theme-mode') errors.push('durable observation must target current ThemeMode');
  if (durable.durabilityContract?.platformStorageMechanicsOwner !== 'PLATFORM_REALIZATION') errors.push('platform storage mechanics must remain target-owned');

  if (select.permissionRef !== 'permission.theme-mode.select') errors.push('ThemeMode select action permission drift');
  if (select.effectClass !== 'LOCAL_PREFERENCE_WRITE') errors.push('ThemeMode select effect drift');
  if (!select.outputStateRefs.includes('state.theme-mode') || !select.outputStateRefs.includes('state.theme-mode.durable-selection')) errors.push('ThemeMode select outputs must include current and durable state');
  if (selectPermission.effectClass !== 'LOCAL_PREFERENCE_WRITE') errors.push('ThemeMode permission effect mismatch');

  for (const requiredStep of [
    'admit-selected-theme-mode-through-single-currentness-boundary',
    'save-light-or-dark-to-durable-state-store',
    'forget-durable-state-store-when-not-set',
    'observe-durable-state-store-through-same-currentness-boundary',
    'restore-observed-durable-selection-after-process-recreation-before-projecting-appearance'
  ]) if (!contractProcess.steps.includes(requiredStep)) errors.push(`missing process step ${requiredStep}`);

  if (!contractProcess.sourceResolutionRules.includes('do not infer durable persistence from generic CURRENT State emission')) {
    errors.push('process must reject automatic current-State persistence inference');
  }
  if (registeredFeature.status !== 'PREPARED') errors.push('ThemeMode feature must remain PREPARED until target durability proof is accepted');
  if (!registeredFeature.stateRefs.includes('state.theme-mode.durable-selection')) errors.push('feature missing durable state binding');
  if (!registeredFeature.actionRefs.includes('action.theme-mode.select')) errors.push('feature missing select action binding');
  if (!registeredFeature.moduleRefs.includes('module.vexlife.core.state-relay')) errors.push('feature missing accepted StateRelay module binding');

  return errors;
}

test('ThemeMode durability composes into the accepted Blueprint without a second current-State owner', () => {
  const blueprintValidation = validateBlueprint(bundle);
  assert.equal(blueprintValidation.ok, true, blueprintValidation.errors.join('\n'));
  const featureValidation = validateFeatureRegistry(bundle.featureRegistry, bundle);
  assert.equal(featureValidation.ok, true, featureValidation.errors.join('\n'));
  assert.deepEqual(validateThemeModeDurabilityContract(bundle), []);
});

test('ThemeMode durable selection is a StateRelay dependency, not automatic persistence of CURRENT', () => {
  const current = state('state.theme-mode');
  const durable = state('state.theme-mode.durable-selection');
  assert.equal(current.currentnessContract.holder, 'SINGLE_STATE_RELAY');
  assert.deepEqual(current.currentnessContract.dependencyStateRefs, ['state.theme-mode.durable-selection']);
  assert.equal(current.currentnessContract.genericCurrentEmissionPersists, false);
  assert.deepEqual(durable.durabilityContract.operations, ['OBSERVE','GET','SAVE','FORGET']);
  assert.deepEqual(durable.durabilityContract.explicitSelectionSaveValues, ['LIGHT','DARK']);
  assert.equal(durable.durabilityContract.forgetValue, 'NOT_SET');
});

test('ThemeMode selection owns one local preference effect and process-death restoration requirement', () => {
  const select = action('action.theme-mode.select');
  const selectPermission = permission('permission.theme-mode.select');
  const contractProcess = process('process.vexlife.theme-mode.select-and-persist');

  assert.equal(select.effectClass, 'LOCAL_PREFERENCE_WRITE');
  assert.equal(selectPermission.effectClass, select.effectClass);
  assert.equal(state('state.theme-mode.durable-selection').durabilityContract.processRecreationRestorationRequired, true);
  assert.ok(contractProcess.steps.includes('restore-observed-durable-selection-after-process-recreation-before-projecting-appearance'));
  assert.equal(contractProcess.authorityEnvelope.effects.includes('PUBLIC_EXTERNAL'), false);
});

test('ThemeMode portable contract holds platform storage mechanics and system-appearance policy outside canonical claims', () => {
  const durability = state('state.theme-mode.durable-selection').durabilityContract;
  const registeredFeature = feature('feature.vexlife.theme-mode');
  assert.equal(durability.platformStorageMechanicsOwner, 'PLATFORM_REALIZATION');
  assert.ok(registeredFeature.knownGaps.includes('No universal system-appearance fallback policy is asserted by this contract.'));
  assert.ok(registeredFeature.knownGaps.includes('Android process-death persistence realization remains downstream until accepted target proof.'));
});

test('ThemeMode durability validation fails closed on semantic collapse', () => {
  const autoPersist = structuredClone(bundle);
  autoPersist.blueprint.stateDomains.find((item) => item.stateRef === 'state.theme-mode').currentnessContract.genericCurrentEmissionPersists = true;
  assert.ok(validateThemeModeDurabilityContract(autoPersist).includes('generic CURRENT emission must not imply durable save'));

  const platformOwned = structuredClone(bundle);
  platformOwned.blueprint.stateDomains.find((item) => item.stateRef === 'state.theme-mode.durable-selection').durabilityContract.platformStorageMechanicsOwner = 'CANONICAL_BLUEPRINT';
  assert.ok(validateThemeModeDurabilityContract(platformOwned).includes('platform storage mechanics must remain target-owned'));

  const missingRestore = structuredClone(bundle);
  missingRestore.blueprint.stateDomains.find((item) => item.stateRef === 'state.theme-mode.durable-selection').durabilityContract.processRecreationRestorationRequired = false;
  assert.ok(validateThemeModeDurabilityContract(missingRestore).includes('process recreation restoration must remain required'));
});

// [VXG RealForever]
