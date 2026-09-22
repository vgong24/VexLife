import crypto from 'node:crypto';

export const COMPANION_AVAILABILITY_REGISTRY_SCHEMA = 'vexlife.companion-availability-reentry-registry/v1';
export const COMPANION_BINDING_INPUT_SCHEMA = 'vexlife.companion-binding-input/v1';
export const COMPANION_RUNTIME_OBSERVATION_SCHEMA = 'vexlife.companion-runtime-adapter-observation/v1';
export const COMPANION_AVAILABILITY_SCHEMA = 'vexlife.companion-availability/v1';
export const COMPANION_REENTRY_PLAN_SCHEMA = 'vexlife.companion-reentry-plan/v1';
export const COMPANION_REENTRY_ACTION_REF = 'action.companion.reenter-current-binding';

const BINDING_STATES = new Set(['BOUND','UNBOUND','MISCONFIGURED','HOME_UNAVAILABLE']);
const CURRENTNESS = new Set(['CURRENT','STALE','CONFLICT','UNKNOWN']);
const OWNERSHIP = new Set(['EXACT_OWNED','NO_OWNED_RUNTIME','CONFLICT','UNKNOWN']);
const RUNTIME_STATES = new Set(['HEALTHY','STARTING','STOPPED','UNREACHABLE','DEGRADED','NOT_PROVISIONED','UNKNOWN']);
const QUALIFICATION = new Set(['CURRENT','STALE','FAILED','UNKNOWN','NOT_APPLICABLE']);
const SAFE_REENTRY = new Set(['AVAILABLE','NOT_AVAILABLE','HUMAN_DECISION_REQUIRED','HELD']);
const BINDING_KEYS = new Set(['schemaVersion','truthClass','bindingRef','homeRef','companionLineageRef','modelRefOrNull','generationRefOrNull','bindingState','currentness','sourceRefs']);
const RUNTIME_KEYS = new Set(['schemaVersion','truthClass','observationRef','adapterRef','bindingRef','homeRef','runtimeOwnershipState','runtimeState','qualificationState','safeReentryState','currentness','evidenceRefs']);

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function nonempty(value) { return typeof value === 'string' && value.length > 0; }
function strings(value) { return Array.isArray(value) && value.every(nonempty) && new Set(value).size === value.length; }
function exactKeys(value, allowed, label) {
  if (!object(value)) throw new TypeError(`${label} must be an object`);
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (extra.length) throw new TypeError(`${label} contains unsupported field ${extra[0]}`);
}
function nullableRef(value, label) { if (!(value === null || nonempty(value))) throw new TypeError(`${label} must be null or a non-empty ref`); }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function semanticHash(value) { return crypto.createHash('sha256').update(stable(value)).digest('hex'); }
function freezeDeep(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (object(value)) return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, freezeDeep(child)])));
  return value;
}

export function validateCompanionAvailabilityRegistry(registry) {
  try {
    if (!object(registry) || registry.schemaVersion !== COMPANION_AVAILABILITY_REGISTRY_SCHEMA || !nonempty(registry.registryRef)) return false;
    for (const key of ['stateOwnersConsumed','foreignOwnerClasses','availabilityStates','recoveryClasses','nonCollapseLaws','heldBoundaries']) if (!strings(registry[key])) return false;
    if (registry.semanticActionRef !== COMPANION_REENTRY_ACTION_REF) return false;
    if (registry.inputSchemas?.binding !== COMPANION_BINDING_INPUT_SCHEMA || registry.inputSchemas?.runtimeObservation !== COMPANION_RUNTIME_OBSERVATION_SCHEMA) return false;
    if (registry.outputSchemas?.availability !== COMPANION_AVAILABILITY_SCHEMA || registry.outputSchemas?.reentryPlan !== COMPANION_REENTRY_PLAN_SCHEMA) return false;
    return registry.nonCollapseLaws.includes('BINDING != LIVENESS') && registry.nonCollapseLaws.includes('REENTRY_PLAN != PROCESS_EXECUTION');
  } catch { return false; }
}

export function validateCompanionBindingInput(binding) {
  exactKeys(binding, BINDING_KEYS, 'binding');
  if (binding.schemaVersion !== COMPANION_BINDING_INPUT_SCHEMA || binding.truthClass !== 'FOREIGN_CANONICAL_COMPANION_BINDING') throw new TypeError('binding schema/truthClass is invalid');
  for (const key of ['bindingRef','homeRef','companionLineageRef']) if (!nonempty(binding[key])) throw new TypeError(`binding.${key} is required`);
  nullableRef(binding.modelRefOrNull, 'binding.modelRefOrNull');
  nullableRef(binding.generationRefOrNull, 'binding.generationRefOrNull');
  if (!BINDING_STATES.has(binding.bindingState)) throw new TypeError('binding.bindingState is invalid');
  if (!CURRENTNESS.has(binding.currentness)) throw new TypeError('binding.currentness is invalid');
  if (!strings(binding.sourceRefs)) throw new TypeError('binding.sourceRefs must contain unique refs');
  return freezeDeep(structuredClone(binding));
}

export function validateCompanionRuntimeObservation(observation) {
  exactKeys(observation, RUNTIME_KEYS, 'runtimeObservation');
  if (observation.schemaVersion !== COMPANION_RUNTIME_OBSERVATION_SCHEMA || observation.truthClass !== 'FOREIGN_PLATFORM_RUNTIME_OBSERVATION') throw new TypeError('runtime observation schema/truthClass is invalid');
  for (const key of ['observationRef','adapterRef','bindingRef','homeRef']) if (!nonempty(observation[key])) throw new TypeError(`runtimeObservation.${key} is required`);
  if (!OWNERSHIP.has(observation.runtimeOwnershipState)) throw new TypeError('runtimeObservation.runtimeOwnershipState is invalid');
  if (!RUNTIME_STATES.has(observation.runtimeState)) throw new TypeError('runtimeObservation.runtimeState is invalid');
  if (!QUALIFICATION.has(observation.qualificationState)) throw new TypeError('runtimeObservation.qualificationState is invalid');
  if (!SAFE_REENTRY.has(observation.safeReentryState)) throw new TypeError('runtimeObservation.safeReentryState is invalid');
  if (!CURRENTNESS.has(observation.currentness)) throw new TypeError('runtimeObservation.currentness is invalid');
  if (!strings(observation.evidenceRefs)) throw new TypeError('runtimeObservation.evidenceRefs must contain unique refs');
  return freezeDeep(structuredClone(observation));
}

function classify(binding, runtime) {
  if (binding.currentness !== 'CURRENT' || runtime.currentness !== 'CURRENT') return ['HELD','BINDING_REVALIDATION_REQUIRED','CURRENTNESS_NOT_CURRENT'];
  if (binding.bindingRef !== runtime.bindingRef || binding.homeRef !== runtime.homeRef) return ['HELD','BINDING_REVALIDATION_REQUIRED','FOREIGN_IDENTITY_MISMATCH'];
  if (binding.bindingState === 'UNBOUND') return ['ACTION_REQUIRED','SETUP_REQUIRED','COMPANION_NOT_BOUND'];
  if (binding.bindingState === 'MISCONFIGURED') return ['ACTION_REQUIRED','REPAIR_REQUIRED','COMPANION_BINDING_MISCONFIGURED'];
  if (binding.bindingState === 'HOME_UNAVAILABLE') return ['ACTION_REQUIRED','REPAIR_REQUIRED','HOME_UNAVAILABLE'];
  if (runtime.runtimeOwnershipState === 'CONFLICT') return ['ACTION_REQUIRED','OWNERSHIP_CONFLICT','RUNTIME_OWNERSHIP_CONFLICT'];
  if (runtime.runtimeOwnershipState === 'UNKNOWN') return ['HELD','HELD','RUNTIME_OWNERSHIP_UNKNOWN'];
  if (runtime.runtimeState === 'UNKNOWN') return ['HELD','HELD','RUNTIME_STATE_UNKNOWN'];
  if (runtime.runtimeState === 'STARTING') return ['STARTING','RETRY_IN_PROGRESS','EXACT_RUNTIME_STARTING'];
  if (runtime.runtimeState === 'HEALTHY') {
    if (runtime.runtimeOwnershipState !== 'EXACT_OWNED') return ['HELD','HELD','HEALTHY_ENDPOINT_NOT_EXACTLY_OWNED'];
    if (runtime.qualificationState === 'CURRENT') return ['READY','NONE_REQUIRED','EXACT_RUNTIME_READY'];
    if (runtime.qualificationState === 'STALE' || runtime.qualificationState === 'UNKNOWN') return ['ACTION_REQUIRED','BINDING_REVALIDATION_REQUIRED','RUNTIME_QUALIFICATION_NOT_CURRENT'];
    return ['ACTION_REQUIRED','REPAIR_REQUIRED','RUNTIME_QUALIFICATION_FAILED'];
  }
  if (runtime.runtimeState === 'DEGRADED') return ['ACTION_REQUIRED','REPAIR_REQUIRED','RUNTIME_DEGRADED'];
  if (['STOPPED','UNREACHABLE','NOT_PROVISIONED'].includes(runtime.runtimeState)) {
    if (runtime.safeReentryState === 'AVAILABLE') return ['RECOVERABLE','SAFE_REENTRY_AVAILABLE','EXACT_SAME_BINDING_REENTRY_AVAILABLE'];
    if (runtime.safeReentryState === 'HUMAN_DECISION_REQUIRED') return ['ACTION_REQUIRED','HUMAN_DECISION_REQUIRED','SAFE_REENTRY_REQUIRES_HUMAN_DECISION'];
    if (runtime.safeReentryState === 'HELD') return ['HELD','HELD','SAFE_REENTRY_HELD'];
    return ['UNAVAILABLE','REPAIR_REQUIRED','SAFE_REENTRY_NOT_AVAILABLE'];
  }
  return ['HELD','HELD','UNCLASSIFIED_FAIL_CLOSED'];
}

export function compileCompanionAvailability({ registry, binding, runtimeObservation }) {
  if (!validateCompanionAvailabilityRegistry(registry)) throw new TypeError('companion availability registry is invalid');
  const currentBinding = validateCompanionBindingInput(binding);
  const runtime = validateCompanionRuntimeObservation(runtimeObservation);
  const [availabilityState,recoveryClass,reasonCode] = classify(currentBinding, runtime);
  const core = {
    schemaVersion: COMPANION_AVAILABILITY_SCHEMA,
    truthClass: 'SOURCE_BOUND_COMPANION_AVAILABILITY',
    registryRef: registry.registryRef,
    bindingRef: currentBinding.bindingRef,
    homeRef: currentBinding.homeRef,
    companionLineageRef: currentBinding.companionLineageRef,
    modelRefOrNull: currentBinding.modelRefOrNull,
    generationRefOrNull: currentBinding.generationRefOrNull,
    runtimeAdapterRef: runtime.adapterRef,
    runtimeObservationRef: runtime.observationRef,
    availabilityState,
    recoveryClass,
    reasonCode,
    bindingState: currentBinding.bindingState,
    runtimeOwnershipState: runtime.runtimeOwnershipState,
    runtimeState: runtime.runtimeState,
    qualificationState: runtime.qualificationState,
    sourceRefs: [...new Set([...currentBinding.sourceRefs, ...runtime.evidenceRefs])].sort(),
    effectAuthorityGranted: false,
    rendererAuthorityGranted: false,
    modelIdentityAuthorityGranted: false,
    processAuthorityGranted: false,
    conversationAuthorityGranted: false
  };
  const projectionSha256 = semanticHash(core);
  return freezeDeep({ ...core, projectionRef: `projection.vexlife.companion-availability.${projectionSha256.slice(0,32)}`, projectionSha256 });
}

export function formCompanionReentryPlan({ registry, availability, binding, runtimeObservation }) {
  if (!validateCompanionAvailabilityRegistry(registry)) throw new TypeError('companion availability registry is invalid');
  const currentBinding = validateCompanionBindingInput(binding);
  const runtime = validateCompanionRuntimeObservation(runtimeObservation);
  const canonicalAvailability = compileCompanionAvailability({ registry, binding: currentBinding, runtimeObservation: runtime });
  if (!object(availability) || stable(availability) !== stable(canonicalAvailability)) return null;
  if (canonicalAvailability.availabilityState !== 'RECOVERABLE' || canonicalAvailability.recoveryClass !== 'SAFE_REENTRY_AVAILABLE') return null;
  if (runtime.currentness !== 'CURRENT' || currentBinding.currentness !== 'CURRENT' || runtime.safeReentryState !== 'AVAILABLE') return null;
  const identity = {
    actionRef: COMPANION_REENTRY_ACTION_REF,
    availabilityProjectionRef: canonicalAvailability.projectionRef,
    bindingRef: currentBinding.bindingRef,
    homeRef: currentBinding.homeRef,
    companionLineageRef: currentBinding.companionLineageRef,
    modelRefOrNull: currentBinding.modelRefOrNull,
    generationRefOrNull: currentBinding.generationRefOrNull,
    runtimeAdapterRef: runtime.adapterRef,
    runtimeObservationRef: runtime.observationRef
  };
  const planSha256 = semanticHash(identity);
  return freezeDeep({
    schemaVersion: COMPANION_REENTRY_PLAN_SCHEMA,
    truthClass: 'SAME_BINDING_SAFE_REENTRY_PLAN',
    planRef: `plan.vexlife.companion-reentry.${planSha256.slice(0,32)}`,
    ...identity,
    idempotencyKey: `companion-reentry:${planSha256}`,
    executionDisposition: 'DELEGATE_TO_RIGHTFUL_RUNTIME_ADAPTER',
    effectAuthorityGranted: false,
    adapterExecutionRequired: true,
    automaticExecutionAuthorized: false,
    humanDecisionRequired: false,
    invariants: {
      preserveBinding: true,
      preserveHome: true,
      preserveCompanionLineage: true,
      modelSelectionAllowed: false,
      modelSwapAllowed: false,
      artifactDownloadAllowed: false,
      modelActivationAllowed: false,
      trainingOrWeightMutationAllowed: false,
      homeDeletionOrRebuildAllowed: false,
      memoryMutationAllowed: false,
      unknownProcessTerminationAllowed: false,
      fallbackBindingAllowed: false
    }
  });
}

// [VXG RealForever]
