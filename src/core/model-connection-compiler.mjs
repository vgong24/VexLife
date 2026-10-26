import { compileCapabilityFrame } from './capability.mjs';
import {
  HERETIC_PRODUCT_ENDPOINT,
  HERETIC_REQUEST_MODEL,
  HERETIC_RUNTIME_ADAPTER_REF,
  HERETIC_RUNTIME_CLASS,
  HERETIC_RUNTIME_IDENTITY,
  HERETIC_TRANSPORT_CLASS
} from './heretic-runtime-link.mjs';
import { verifyModelTurnWitness } from './model-turn-witness.mjs';
import { semanticHash } from './utils.mjs';

export const MODEL_RUNTIME_CAPABILITY_REGISTRY_SCHEMA = 'vexlife.model-runtime-capability-registry/v1';
export const MODEL_CONNECTION_BINDING_REGISTRY_SCHEMA = 'vexlife.model-connection-binding-registry/v1';
export const MODEL_CONNECTION_PROJECTION_SCHEMA = 'vexlife.model-connection-projection/v1';

const RUNTIME_DISPOSITIONS = new Set([
  'AVAILABLE_AND_OBSERVED',
  'AVAILABLE_UNOBSERVED',
  'OBSERVED_UNUSED',
  'USED_NOT_PROJECTED',
  'PROJECTED_NOT_TRAINING_CLASSIFIED',
  'INTENTIONALLY_HELD',
  'NOT_SUPPORTED_AT_PIN',
  'UNKNOWN_FAIL_CLOSED'
]);
const AVAILABLE_RUNTIME_DISPOSITIONS = new Set([
  'AVAILABLE_AND_OBSERVED',
  'AVAILABLE_UNOBSERVED',
  'OBSERVED_UNUSED',
  'USED_NOT_PROJECTED',
  'PROJECTED_NOT_TRAINING_CLASSIFIED'
]);
const MODEL_PARTICIPATION_CLASSES = new Set([
  'DETERMINISTIC_ONLY',
  'MODEL_CONTEXT_SOURCE',
  'MODEL_EXPLANATION',
  'MODEL_INFERENCE',
  'MODEL_TOOL_PROPOSAL',
  'MODEL_SYNTHESIS',
  'MODEL_SELF_REPORT',
  'TRAINING_INPUT_CANDIDATE',
  'INTENTIONALLY_HELD',
  'NOT_APPLICABLE'
]);
const HEX64 = /^[0-9a-f]{64}$/u;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function nonempty(value) {
  return typeof value === 'string' && value.length > 0;
}
function uniqueStrings(value) {
  return Array.isArray(value) && value.every(nonempty) && new Set(value).size === value.length;
}
function sortedUnique(values = []) {
  if (!uniqueStrings(values)) throw new TypeError('refs must contain unique non-empty strings');
  return [...values].sort();
}
function freezeDeep(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (object(value)) {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freezeDeep(child)])));
  }
  return value;
}
function assertRuntimeProfile(profile) {
  const hereticBinding = profile?.sourceBinding?.class === 'HERETIC_PERSISTENT_RUNTIME';
  const commonInvalid = !object(profile) || !nonempty(profile.runtimeCapabilityProfileRef) ||
      !nonempty(profile.generationRef) || !nonempty(profile.modelBundleRef) ||
      profile.endpointClass !== 'NUMERIC_LOOPBACK_HTTP' ||
      !HEX64.test(profile.chatTemplateSha256 ?? '') ||
      profile.currentness?.state !== 'CURRENT' ||
      !uniqueStrings(profile.evidenceRefs) ||
      !Array.isArray(profile.cells) || profile.cells.length === 0;
  const legacyInvalid = !hereticBinding && (
      !nonempty(profile.operationalProfileRef) || !nonempty(profile.runtimeRevisionRef) ||
      !HEX64.test(profile.runtimeExecutableSha256 ?? '') ||
      !nonempty(profile.modelArtifactRef) ||
      !(profile.projectorArtifactRef === null || nonempty(profile.projectorArtifactRef)));
  const binding = profile?.sourceBinding;
  const hereticInvalid = hereticBinding && (
      !object(binding) || !nonempty(binding.sourceRef) ||
      binding.runtimeAdapterRef !== HERETIC_RUNTIME_ADAPTER_REF ||
      binding.runtimeClass !== HERETIC_RUNTIME_CLASS ||
      binding.transportClass !== HERETIC_TRANSPORT_CLASS ||
      binding.endpointOrigin !== HERETIC_PRODUCT_ENDPOINT ||
      binding.requestModel !== HERETIC_REQUEST_MODEL ||
      binding.modelRef !== HERETIC_RUNTIME_IDENTITY.modelRef ||
      binding.modelProfileRef !== HERETIC_RUNTIME_IDENTITY.modelProfileRef ||
      binding.artifactRef !== HERETIC_RUNTIME_IDENTITY.artifactRef ||
      binding.contentSetSha256 !== HERETIC_RUNTIME_IDENTITY.artifactContentSetSha256);
  if (commonInvalid || legacyInvalid || hereticInvalid) {
    throw new TypeError('runtime capability profile is incomplete or not current');
  }
  const cellRefs = profile.cells.map((cell) => cell?.cellRef);
  if (!uniqueStrings(cellRefs)) throw new TypeError('runtime capability cell refs must be unique');
  for (const cell of profile.cells) {
    if (!nonempty(cell.requestClass) || !RUNTIME_DISPOSITIONS.has(cell.disposition)) {
      throw new TypeError(`runtime capability cell ${cell.cellRef ?? 'UNKNOWN'} is invalid`);
    }
    if (cell.disposition === 'INTENTIONALLY_HELD' && !nonempty(cell.holdReason)) {
      throw new TypeError(`held runtime capability cell ${cell.cellRef} requires a reason`);
    }
  }
}
export function validateModelRuntimeCapabilityRegistry(registry) {
  if (!object(registry) || registry.schemaVersion !== MODEL_RUNTIME_CAPABILITY_REGISTRY_SCHEMA ||
      !nonempty(registry.registryRef) || !nonempty(registry.activeRuntimeCapabilityProfileRef) ||
      (registry.runtimeProfileSelection !== undefined &&
       registry.runtimeProfileSelection !== 'EXACT_MODEL_TURN_WITNESS') ||
      !Array.isArray(registry.profiles) || registry.profiles.length === 0) return false;
  try {
    const refs = registry.profiles.map((profile) => profile?.runtimeCapabilityProfileRef);
    if (!uniqueStrings(refs)) return false;
    for (const profile of registry.profiles) assertRuntimeProfile(profile);
    return refs.includes(registry.activeRuntimeCapabilityProfileRef);
  } catch {
    return false;
  }
}
function assertBinding(binding) {
  if (!object(binding) || !nonempty(binding.bindingRef) || !nonempty(binding.subjectRef) ||
      !uniqueStrings(binding.modelParticipationClasses) ||
      binding.modelParticipationClasses.some((value) => !MODEL_PARTICIPATION_CLASSES.has(value)) ||
      !uniqueStrings(binding.requiredRuntimeCellRefs) ||
      !nonempty(binding.authorityRef) || !uniqueStrings(binding.sourceRefs) ||
      !['CURRENT', 'HELD', 'SUPERSEDED'].includes(binding.status)) {
    throw new TypeError('model-connection binding is invalid');
  }
}
export function validateModelConnectionBindingRegistry(registry) {
  if (!object(registry) || registry.schemaVersion !== MODEL_CONNECTION_BINDING_REGISTRY_SCHEMA ||
      !nonempty(registry.registryRef) || !nonempty(registry.capabilityRegistryRef) ||
      !nonempty(registry.runtimeCapabilityRegistryRef) || !Array.isArray(registry.bindings)) return false;
  try {
    const bindingRefs = registry.bindings.map((binding) => binding?.bindingRef);
    if (!uniqueStrings(bindingRefs)) return false;
    for (const binding of registry.bindings) assertBinding(binding);
    return true;
  } catch {
    return false;
  }
}
function modelBundle(registry, ref) {
  const bundle = (registry?.bundles ?? []).find((item) => item.modelBundleRef === ref);
  if (!bundle || bundle.state !== 'RELEASE_QUALIFIED' || !nonempty(bundle.generationRef)) {
    throw new TypeError('one release-qualified model bundle is required');
  }
  const v2 = bundle.bundleSchemaVersion === 'vexlife.model-bundle/v2';
  if (v2) {
    if (!nonempty(bundle.modelProfileRef) || !nonempty(bundle.artifactSetRef) ||
        !HEX64.test(bundle.contentSetSha256 ?? '') ||
        !uniqueStrings(bundle.runtimeRealizationRefs)) {
      throw new TypeError('release-qualified model bundle v2 is incomplete');
    }
  } else if (!nonempty(bundle.requestModel) || !nonempty(bundle.baseModelArtifactRef)) {
    throw new TypeError('release-qualified legacy model bundle is incomplete');
  }
  return bundle;
}
function operationalProfile(registry, ref, modelBundleRef) {
  const profile = (registry?.profiles ?? []).find((item) => item.profileRef === ref);
  if (!profile || profile.state !== 'RELEASE_QUALIFIED' ||
      !(profile.compatibleModelBundleRefs ?? []).includes(modelBundleRef) ||
      !nonempty(profile.runtime?.immutableRevisionRef) ||
      !HEX64.test(profile.runtime?.executableSha256 ?? '') ||
      !nonempty(profile.endpoint?.origin)) {
    throw new TypeError('one compatible release-qualified operational profile is required');
  }
  return profile;
}
function sourceBindLegacyRuntimeProfile({ runtimeProfile, bundle, opProfile, witness }) {
  if (runtimeProfile.modelBundleRef !== bundle.modelBundleRef ||
      runtimeProfile.generationRef !== bundle.generationRef ||
      runtimeProfile.operationalProfileRef !== opProfile.profileRef ||
      runtimeProfile.runtimeRevisionRef !== opProfile.runtime.immutableRevisionRef ||
      runtimeProfile.runtimeExecutableSha256 !== opProfile.runtime.executableSha256 ||
      runtimeProfile.modelArtifactRef !== bundle.baseModelArtifactRef ||
      runtimeProfile.projectorArtifactRef !== (bundle.projectorArtifactRef ?? null) ||
      !(bundle.compatibleOperationalProfileRefs ?? []).includes(opProfile.profileRef)) {
    throw new TypeError('runtime capability profile does not bind current model/operational source truth');
  }
  for (const [label, observed, expected] of [
    ['model bundle', witness.runtimeObservation.modelBundleRef, bundle.modelBundleRef],
    ['operational profile', witness.runtimeObservation.operationalProfileRef, opProfile.profileRef],
    ['runtime revision', witness.runtimeObservation.runtimeRevisionRef, runtimeProfile.runtimeRevisionRef]
  ]) {
    if (observed !== null && observed !== expected) {
      throw new TypeError(`ModelTurnWitness ${label} disagrees with current source`);
    }
  }
}
function sourceBindHereticRuntimeProfile({ runtimeProfile, bundle, witness }) {
  const binding = runtimeProfile.sourceBinding;
  if (runtimeProfile.modelBundleRef !== bundle.modelBundleRef ||
      runtimeProfile.generationRef !== bundle.generationRef ||
      bundle.bundleSchemaVersion !== 'vexlife.model-bundle/v2' ||
      bundle.modelProfileRef !== HERETIC_RUNTIME_IDENTITY.modelProfileRef ||
      bundle.artifactSetRef !== HERETIC_RUNTIME_IDENTITY.artifactRef ||
      bundle.contentSetSha256 !== HERETIC_RUNTIME_IDENTITY.artifactContentSetSha256 ||
      !(bundle.runtimeRealizationRefs ?? []).includes(HERETIC_RUNTIME_ADAPTER_REF) ||
      binding.runtimeAdapterRef !== HERETIC_RUNTIME_ADAPTER_REF ||
      binding.runtimeClass !== HERETIC_RUNTIME_CLASS ||
      binding.transportClass !== HERETIC_TRANSPORT_CLASS ||
      binding.modelRef !== HERETIC_RUNTIME_IDENTITY.modelRef ||
      binding.modelProfileRef !== HERETIC_RUNTIME_IDENTITY.modelProfileRef ||
      binding.artifactRef !== HERETIC_RUNTIME_IDENTITY.artifactRef ||
      binding.contentSetSha256 !== HERETIC_RUNTIME_IDENTITY.artifactContentSetSha256) {
    throw new TypeError('Heretic runtime capability profile does not bind accepted Heretic source truth');
  }
  for (const [label, observed, expected] of [
    ['model bundle', witness.runtimeObservation.modelBundleRef, bundle.modelBundleRef],
    ['operational profile', witness.runtimeObservation.operationalProfileRef, null],
    ['runtime revision', witness.runtimeObservation.runtimeRevisionRef, null]
  ]) {
    if (observed !== null && observed !== expected) {
      throw new TypeError(`ModelTurnWitness ${label} disagrees with current Heretic source`);
    }
  }
}
function selectRuntimeConnection({
  runtimeCapabilityRegistry,
  modelBundleRegistry,
  operationalProfileRegistry,
  witness
}) {
  if (!validateModelRuntimeCapabilityRegistry(runtimeCapabilityRegistry)) {
    throw new TypeError('model runtime capability registry is invalid');
  }
  const candidates = [];
  for (const runtimeProfile of runtimeCapabilityRegistry.profiles.filter((item) =>
    item.currentness?.state === 'CURRENT')) {
    const bundle = modelBundle(modelBundleRegistry, runtimeProfile.modelBundleRef);
    if (runtimeProfile.sourceBinding?.class === 'HERETIC_PERSISTENT_RUNTIME') {
      if (witness.invocationEvidence.sanitizedEndpointOrigin !== runtimeProfile.sourceBinding.endpointOrigin ||
          witness.runtimeObservation.modelProvenance.compatibilityModel !== runtimeProfile.sourceBinding.requestModel) {
        continue;
      }
      candidates.push({
        runtimeProfile,
        bundle,
        opProfile: null,
        bind: () => sourceBindHereticRuntimeProfile({ runtimeProfile, bundle, witness })
      });
      continue;
    }
    const opProfile = operationalProfile(
      operationalProfileRegistry,
      runtimeProfile.operationalProfileRef,
      bundle.modelBundleRef
    );
    if (witness.invocationEvidence.sanitizedEndpointOrigin !== opProfile.endpoint.origin ||
        witness.runtimeObservation.modelProvenance.compatibilityModel !== bundle.requestModel) {
      continue;
    }
    candidates.push({
      runtimeProfile,
      bundle,
      opProfile,
      bind: () => sourceBindLegacyRuntimeProfile({ runtimeProfile, bundle, opProfile, witness })
    });
  }
  if (candidates.length !== 1) {
    throw new TypeError('closed external ModelTurnWitness must bind exactly one current model connection');
  }
  candidates[0].bind();
  return candidates[0];
}
function runtimeCellProjection(profile) {
  const cells = [...profile.cells]
    .map((cell) => freezeDeep({
      cellRef: cell.cellRef,
      requestClass: cell.requestClass,
      disposition: cell.disposition,
      holdReason: cell.holdReason ?? null
    }))
    .sort((left, right) => left.cellRef.localeCompare(right.cellRef));
  return Object.freeze(cells);
}
function runtimeRequirementState(requiredRefs, cellByRef) {
  if (requiredRefs.length === 0) return Object.freeze({ state: 'NOT_REQUIRED', reason: null });
  const cells = requiredRefs.map((ref) => cellByRef.get(ref) ?? null);
  if (cells.some((cell) => cell === null || cell.disposition === 'UNKNOWN_FAIL_CLOSED')) {
    return Object.freeze({ state: 'UNKNOWN', reason: 'RUNTIME_CAPABILITY_UNKNOWN_FAIL_CLOSED' });
  }
  if (cells.some((cell) => cell.disposition === 'NOT_SUPPORTED_AT_PIN')) {
    return Object.freeze({ state: 'UNAVAILABLE', reason: 'RUNTIME_CAPABILITY_NOT_SUPPORTED_AT_PIN' });
  }
  const held = cells.find((cell) => cell.disposition === 'INTENTIONALLY_HELD');
  if (held) return Object.freeze({ state: 'HELD', reason: held.holdReason ?? 'RUNTIME_CAPABILITY_INTENTIONALLY_HELD' });
  if (cells.every((cell) => AVAILABLE_RUNTIME_DISPOSITIONS.has(cell.disposition))) {
    return Object.freeze({ state: 'SATISFIED', reason: null });
  }
  return Object.freeze({ state: 'UNKNOWN', reason: 'RUNTIME_CAPABILITY_UNKNOWN_FAIL_CLOSED' });
}
function capabilityDisposition(entry, requirement) {
  if (!entry.executable) {
    return Object.freeze({ state: 'HELD', reason: `CANONICAL_STAGE_${entry.stage}` });
  }
  if (['STALE', 'BLOCKED', 'SUPERSEDED'].includes(entry.currentness?.state)) {
    return Object.freeze({ state: 'HELD', reason: `CANONICAL_CURRENTNESS_${entry.currentness.state}` });
  }
  if (requirement.state === 'HELD') return Object.freeze({ state: 'HELD', reason: requirement.reason });
  if (requirement.state === 'UNAVAILABLE') return Object.freeze({ state: 'UNAVAILABLE', reason: requirement.reason });
  if (requirement.state === 'UNKNOWN') return Object.freeze({ state: 'UNKNOWN', reason: requirement.reason });
  if (entry.currentness?.state !== 'CURRENT') {
    return Object.freeze({ state: 'UNKNOWN', reason: 'CANONICAL_CURRENTNESS_UNKNOWN' });
  }
  return Object.freeze({ state: 'AVAILABLE', reason: null });
}
function currentBindingMap(registry) {
  if (!validateModelConnectionBindingRegistry(registry)) {
    throw new TypeError('model-connection binding registry is invalid');
  }
  const map = new Map();
  for (const binding of registry.bindings.filter((item) => item.status === 'CURRENT')) {
    if (!map.has(binding.subjectRef)) map.set(binding.subjectRef, []);
    map.get(binding.subjectRef).push(binding);
  }
  for (const list of map.values()) list.sort((left, right) => left.bindingRef.localeCompare(right.bindingRef));
  return map;
}

export function compileModelConnection({
  capabilityRegistry,
  capabilityInput,
  runtimeCapabilityRegistry,
  modelConnectionBindingRegistry,
  modelBundleRegistry,
  operationalProfileRegistry,
  modelTurnWitness,
  actuallyUsedRefs = []
}) {
  if (!verifyModelTurnWitness(modelTurnWitness)) throw new TypeError('one closed external ModelTurnWitness is required');
  if (modelConnectionBindingRegistry?.capabilityRegistryRef !== capabilityRegistry?.registryRef) {
    throw new TypeError('model-connection bindings do not target the canonical capability registry');
  }
  if (modelConnectionBindingRegistry?.runtimeCapabilityRegistryRef !== runtimeCapabilityRegistry?.registryRef) {
    throw new TypeError('model-connection bindings do not target the runtime capability registry');
  }

  const {
    runtimeProfile,
    bundle,
    opProfile
  } = selectRuntimeConnection({
    runtimeCapabilityRegistry,
    modelBundleRegistry,
    operationalProfileRegistry,
    witness: modelTurnWitness
  });

  const capabilityFrame = compileCapabilityFrame(capabilityRegistry, capabilityInput);
  const bindingBySubject = currentBindingMap(modelConnectionBindingRegistry);
  const cellProjection = runtimeCellProjection(runtimeProfile);
  const cellByRef = new Map(cellProjection.map((cell) => [cell.cellRef, cell]));
  const capabilityEntries = capabilityFrame.entries.map((entry) => {
    const bindings = bindingBySubject.get(entry.capabilityRef) ?? [];
    const requiredRuntimeCellRefs = sortedUnique([
      ...new Set(bindings.flatMap((binding) => binding.requiredRuntimeCellRefs))
    ]);
    const requirement = runtimeRequirementState(requiredRuntimeCellRefs, cellByRef);
    const disposition = capabilityDisposition(entry, requirement);
    return freezeDeep({
      capabilityRef: entry.capabilityRef,
      canonicalStage: entry.stage,
      canonicalExecutable: entry.executable,
      canonicalCurrentness: entry.currentness,
      competenceState: entry.competenceState,
      disposition: disposition.state,
      dispositionReason: disposition.reason,
      bindingRefs: bindings.map((binding) => binding.bindingRef),
      modelParticipationClasses: sortedUnique([
        ...new Set(bindings.flatMap((binding) => binding.modelParticipationClasses))
      ]),
      requiredRuntimeCellRefs,
      runtimeRequirementState: requirement.state
    });
  }).sort((left, right) => left.capabilityRef.localeCompare(right.capabilityRef));

  const knownCapabilityRefs = new Set(capabilityEntries.map((entry) => entry.capabilityRef));
  const used = sortedUnique(actuallyUsedRefs);
  if (used.some((ref) => !knownCapabilityRefs.has(ref))) throw new TypeError('actuallyUsedRefs must be visible in the canonical capability frame');
  const available = new Set(capabilityEntries.filter((entry) => entry.disposition === 'AVAILABLE').map((entry) => entry.capabilityRef));
  if (used.some((ref) => !available.has(ref))) throw new TypeError('actuallyUsedRefs cannot claim a held, unavailable, or unknown capability');

  const availableCellRefs = cellProjection.filter((cell) => AVAILABLE_RUNTIME_DISPOSITIONS.has(cell.disposition)).map((cell) => cell.cellRef);
  const heldCellEntries = cellProjection.filter((cell) => cell.disposition === 'INTENTIONALLY_HELD').map((cell) =>
    freezeDeep({ cellRef: cell.cellRef, holdReason: cell.holdReason }));
  const unavailableCellRefs = cellProjection.filter((cell) => cell.disposition === 'NOT_SUPPORTED_AT_PIN').map((cell) => cell.cellRef);
  const unknownCellRefs = cellProjection.filter((cell) => cell.disposition === 'UNKNOWN_FAIL_CLOSED').map((cell) => cell.cellRef);

  const sourceRefs = sortedUnique([
    capabilityRegistry.registryRef,
    runtimeCapabilityRegistry.registryRef,
    modelConnectionBindingRegistry.registryRef,
    modelBundleRegistry.registryRef,
    ...(opProfile ? [operationalProfileRegistry.registryRef] : []),
    ...(nonempty(runtimeProfile.sourceBinding?.sourceRef) ? [runtimeProfile.sourceBinding.sourceRef] : []),
    ...runtimeProfile.evidenceRefs
  ]);
  const currentnessRefs = sortedUnique([...new Set([
    ...(modelTurnWitness.currentnessRefs ?? []),
    ...(opProfile && nonempty(operationalProfileRegistry.currentnessRef) ? [operationalProfileRegistry.currentnessRef] : []),
    runtimeProfile.currentness.acceptedMainRef
  ])]);

  const core = {
    schemaVersion: MODEL_CONNECTION_PROJECTION_SCHEMA,
    truthClass: 'SOURCE_BOUND_MODEL_CONNECTION',
    capabilityRegistryRef: capabilityRegistry.registryRef,
    capabilityFrame,
    modelConnectionBindingRegistryRef: modelConnectionBindingRegistry.registryRef,
    runtimeCapabilityRegistryRef: runtimeCapabilityRegistry.registryRef,
    runtimeCapabilityProfileRef: runtimeProfile.runtimeCapabilityProfileRef,
    generationRef: bundle.generationRef,
    modelBundleRef: bundle.modelBundleRef,
    operationalProfileRef: opProfile?.profileRef ?? null,
    runtimeRevisionRef: runtimeProfile.runtimeRevisionRef ?? null,
    modelTurnWitnessRef: modelTurnWitness.witnessRef,
    capabilityEntries,
    runtimeCapability: {
      availableCellRefs,
      heldCellEntries,
      unavailableCellRefs,
      unknownCellRefs
    },
    actuallyUsedRefs: used,
    currentnessRefs,
    sourceRefs,
    observedEffects: {
      modelRuntimeObserved: modelTurnWitness.observedEffects.modelRuntimeObserved === true,
      providerOrNetworkObserved: modelTurnWitness.observedEffects.providerOrNetworkObserved === true,
      nativeToolExecutionObserved: modelTurnWitness.observedEffects.nativeToolExecutionObserved === true,
      multimodalInputObserved: modelTurnWitness.observedEffects.multimodalInputObserved === true,
      trainingEffectObserved: modelTurnWitness.observedEffects.trainingEffectObserved === true,
      modelWeightEffectObserved: modelTurnWitness.observedEffects.modelWeightEffectObserved === true
    },
    effectAuthorityGranted: false
  };
  const projectionSha256 = semanticHash(core);
  return freezeDeep({
    ...core,
    projectionRef: `projection.vexlife.model-connection.${projectionSha256.slice(0, 32)}`,
    projectionSha256
  });
}

// [VXG RealForever]
