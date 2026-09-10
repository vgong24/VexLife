import { MODEL_CONNECTION_PROJECTION_SCHEMA } from './model-connection-compiler.mjs';
import { estimateTokens, semanticHash } from './utils.mjs';

export const VEX_SELF_CAPABILITY_FRAME_SCHEMA = 'vexlife.vex-self-capability-frame/v1';

const CONTEXT_KEYS = Object.freeze([
  'homeRef',
  'deviceRef',
  'companionLineageRef',
  'projectRef',
  'threadRef',
  'channelRef',
  'screenRef',
  'selectedNodeRef'
]);

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function nonempty(value) {
  return typeof value === 'string' && value.length > 0;
}
function freezeDeep(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (object(value)) return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freezeDeep(child)])));
  return value;
}
function canonicalTimestamp(value) {
  if (!nonempty(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}
function validateProjection(projection) {
  if (!object(projection) || projection.schemaVersion !== MODEL_CONNECTION_PROJECTION_SCHEMA ||
      projection.truthClass !== 'SOURCE_BOUND_MODEL_CONNECTION' ||
      !nonempty(projection.projectionRef) || !/^[0-9a-f]{64}$/u.test(projection.projectionSha256 ?? '')) {
    throw new TypeError('one source-bound model-connection projection is required');
  }
  const { projectionRef, projectionSha256, ...core } = projection;
  if (projectionRef !== `projection.vexlife.model-connection.${projectionSha256.slice(0, 32)}` ||
      semanticHash(core) !== projectionSha256) {
    throw new TypeError('model-connection projection content address is invalid');
  }
}
function currentContext(value) {
  if (!object(value)) throw new TypeError('currentContext must be one bounded reference object');
  const extras = Object.keys(value).filter((key) => !CONTEXT_KEYS.includes(key));
  if (extras.length) throw new TypeError(`currentContext contains unadmitted fields: ${extras.sort().join(', ')}`);
  const output = {};
  for (const key of CONTEXT_KEYS) {
    const item = value[key] ?? null;
    if (!(item === null || nonempty(item))) throw new TypeError(`currentContext.${key} must be null or one non-empty ref`);
    output[key] = item;
  }
  return Object.freeze(output);
}
function selfCapabilityEntry(entry) {
  return freezeDeep({
    capabilityRef: entry.capabilityRef,
    state: entry.disposition,
    reason: entry.dispositionReason,
    canonicalStage: entry.canonicalStage,
    currentness: entry.canonicalCurrentness,
    competenceState: entry.competenceState,
    modelParticipationClasses: entry.modelParticipationClasses,
    bindingRefs: entry.bindingRefs,
    requiredRuntimeCellRefs: entry.requiredRuntimeCellRefs,
    runtimeRequirementState: entry.runtimeRequirementState
  });
}
function entryPriority(entry, rootKernel) {
  if (rootKernel.includes(entry.capabilityRef)) return 0;
  if (entry.state === 'AVAILABLE') return 1;
  if (entry.state === 'HELD') return 2;
  if (entry.state === 'UNAVAILABLE') return 3;
  return 4;
}

export function formVexSelfCapabilityFrame({
  modelConnectionProjection,
  currentContext: currentContextInput = {},
  tokenBudget = 1200,
  formedAt = new Date().toISOString()
}) {
  validateProjection(modelConnectionProjection);
  if (!Number.isInteger(tokenBudget) || tokenBudget < 128) throw new TypeError('tokenBudget must be an integer >= 128');
  if (!canonicalTimestamp(formedAt)) throw new TypeError('formedAt must be one canonical timestamp');

  const context = currentContext(currentContextInput);
  const rootKernel = modelConnectionProjection.capabilityFrame.rootCapabilityKernel ?? [];
  const candidates = modelConnectionProjection.capabilityEntries
    .map(selfCapabilityEntry)
    .sort((left, right) =>
      entryPriority(left, rootKernel) - entryPriority(right, rootKernel) ||
      left.capabilityRef.localeCompare(right.capabilityRef));

  const selected = [];
  const omittedRefs = [];
  let usedTokens = estimateTokens({
    schemaVersion: VEX_SELF_CAPABILITY_FRAME_SCHEMA,
    generationRef: modelConnectionProjection.generationRef,
    modelBundleRef: modelConnectionProjection.modelBundleRef,
    operationalProfileRef: modelConnectionProjection.operationalProfileRef,
    runtimeCapabilityProfileRef: modelConnectionProjection.runtimeCapabilityProfileRef,
    currentContext: context
  });
  const rootEntries = candidates.filter((entry) => rootKernel.includes(entry.capabilityRef));
  const rootCost = rootEntries.reduce((total, entry) => total + estimateTokens(entry), 0);
  if (usedTokens + rootCost > tokenBudget) {
    throw new TypeError('tokenBudget is too small for the canonical root capability kernel');
  }
  for (const entry of candidates) {
    const cost = estimateTokens(entry);
    if (rootKernel.includes(entry.capabilityRef) || usedTokens + cost <= tokenBudget) {
      selected.push(entry);
      usedTokens += cost;
    } else {
      omittedRefs.push(entry.capabilityRef);
    }
  }
  selected.sort((left, right) => left.capabilityRef.localeCompare(right.capabilityRef));
  omittedRefs.sort();

  const stateRefs = (state) => selected
    .filter((entry) => entry.state === state)
    .map((entry) => entry.capabilityRef);
  const heldEntries = selected
    .filter((entry) => entry.state === 'HELD')
    .map((entry) => freezeDeep({
      capabilityRef: entry.capabilityRef,
      holdReason: entry.reason,
      bindingRefs: entry.bindingRefs,
      requiredRuntimeCellRefs: entry.requiredRuntimeCellRefs
    }));

  const core = {
    schemaVersion: VEX_SELF_CAPABILITY_FRAME_SCHEMA,
    truthClass: 'BOUNDED_SOURCE_BOUND_SELF_CAPABILITY_FRAME',
    modelConnectionProjectionRef: modelConnectionProjection.projectionRef,
    generationRef: modelConnectionProjection.generationRef,
    modelBundleRef: modelConnectionProjection.modelBundleRef,
    operationalProfileRef: modelConnectionProjection.operationalProfileRef,
    runtimeCapabilityProfileRef: modelConnectionProjection.runtimeCapabilityProfileRef,
    currentContext: context,
    capabilityEntries: selected,
    availableCapabilityRefs: stateRefs('AVAILABLE'),
    heldCapabilityEntries: heldEntries,
    unavailableCapabilityRefs: stateRefs('UNAVAILABLE'),
    unknownCapabilityRefs: stateRefs('UNKNOWN'),
    actuallyUsedRefs: modelConnectionProjection.actuallyUsedRefs.filter((ref) =>
      selected.some((entry) => entry.capabilityRef === ref)),
    runtimeCapability: modelConnectionProjection.runtimeCapability,
    currentnessRefs: modelConnectionProjection.currentnessRefs,
    sourceRefs: modelConnectionProjection.sourceRefs,
    coverage: {
      sourceRefs: modelConnectionProjection.sourceRefs,
      tokenBudget,
      usedTokens,
      omittedRefs,
      omissionReasons: omittedRefs.map(() => 'TOKEN_BUDGET'),
      truncated: omittedRefs.length > 0
    },
    effectAuthorityGranted: false,
    formedAt
  };
  const semanticFingerprint = semanticHash(core);
  return freezeDeep({
    ...core,
    selfCapabilityFrameRef: `frame.vex-self-capability.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  });
}

// [VXG RealForever]
