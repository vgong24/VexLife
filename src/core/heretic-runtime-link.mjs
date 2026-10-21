import crypto from 'node:crypto';

export const HERETIC_RUNTIME_LINK_SCHEMA = 'vexlife.heretic-persistent-runtime-link/v1';
export const HERETIC_RUNTIME_RECEIPT_SCHEMA = 'vexlocalbridge.mlx-persistent-runtime-owner-receipt/v1';
export const HERETIC_RUNTIME_ADAPTER_REF = 'adapter.runtime.mlx.macos-victor.001';
export const HERETIC_RUNTIME_CLASS = 'MLX_LM_DIRECT_RUNTIME';
export const HERETIC_TRANSPORT_CLASS = 'MLX_LM_OPENAI_NUMERIC_LOOPBACK';
export const HERETIC_REQUEST_MODEL = 'default_model';

export const HERETIC_RUNTIME_IDENTITY = Object.freeze({
  modelRef: 'model.devex.heretic.qwen3.8-27b.mlx4.329658ee8f27',
  modelProfileRef: 'model-profile.devex.qwen38-27b-heretic-mlx4.certified.20260928A',
  artifactRef: 'artifact.devex.qwen3.8-27b-heretic-mlx-4bit.808b82a2',
  artifactCustodyEvidenceRef: 'resolution.model-preservation.artifact-custody.devex.qwen38-27b-heretic-mlx4.20260928A',
  artifactContentSetSha256: '329658ee8f270056bc29d8a6cfd6e9f1b7d9d14c659452c9e4dd46fc7c78d780',
  runtimeAdapterRef: HERETIC_RUNTIME_ADAPTER_REF,
  runtimeClass: HERETIC_RUNTIME_CLASS,
  transportClass: HERETIC_TRANSPORT_CLASS,
  hostExecutionProfileRef: 'profile.repository.vextreme-sdk.macos-v1',
  pythonVersion: '3.14.7',
  mlxLmVersion: '0.32.0',
  trainerSourceCommit: '170a11c58ce7d22a720901a2535adb0c218b871b',
});

const SHA256_RE = /^[a-f0-9]{64}$/u;
const GIT_ID_RE = /^[a-f0-9]{40,64}$/u;
const PORTABLE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function portableRef(value, label) {
  if (typeof value !== 'string' || !PORTABLE_REF_RE.test(value)) {
    fail('HERETIC_RUNTIME_RECEIPT_INVALID', `${label} must be one portable ref`);
  }
}

function exact(actual, expected, label) {
  if (actual !== expected) {
    fail('HERETIC_RUNTIME_IDENTITY_MISMATCH', `${label} does not match the accepted Heretic runtime identity`);
  }
}

function validateEndpoint(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('HERETIC_RUNTIME_ENDPOINT_INVALID', 'Heretic runtime endpoint is not one URL');
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  if (
    parsed.protocol !== 'http:'
    || !['127.0.0.1', '::1'].includes(host)
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || !['', '/'].includes(parsed.pathname)
  ) {
    fail('HERETIC_RUNTIME_ENDPOINT_INVALID', 'Heretic runtime endpoint must be one credential-free numeric loopback HTTP origin');
  }
  return parsed.origin;
}

function freezeDeep(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDeep));
  if (object(value)) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, freezeDeep(child)])
    ));
  }
  return value;
}

function digestRef(prefix, input) {
  const digest = crypto.createHash('sha256').update(input).digest('hex');
  return `${prefix}.${digest.slice(0, 32)}`;
}

export function validateHereticPersistentRuntimeReceipt(value) {
  if (!object(value)) fail('HERETIC_RUNTIME_RECEIPT_INVALID', 'Heretic runtime receipt must be one object');
  exact(value.schemaVersion, HERETIC_RUNTIME_RECEIPT_SCHEMA, 'schemaVersion');
  exact(value.state, 'PERSISTENT_MLX_RUNTIME_QUALIFIED', 'state');

  for (const [key, expected] of Object.entries(HERETIC_RUNTIME_IDENTITY)) {
    exact(value[key], expected, key);
  }
  exact(value.requestModel, HERETIC_REQUEST_MODEL, 'requestModel');
  portableRef(value.receiptRef, 'receiptRef');
  portableRef(value.authorityRef, 'authorityRef');

  if (!SHA256_RE.test(value.artifactContentSetSha256 ?? '')) {
    fail('HERETIC_RUNTIME_RECEIPT_INVALID', 'artifactContentSetSha256 is invalid');
  }

  const endpoint = validateEndpoint(value.endpoint);
  if (endpoint !== value.endpoint) {
    fail('HERETIC_RUNTIME_ENDPOINT_INVALID', 'Heretic runtime endpoint must already be its canonical origin');
  }

  if (!object(value.runtime)
      || !Number.isInteger(value.runtime.pid) || value.runtime.pid <= 0
      || !Number.isInteger(value.runtime.processGroupId) || value.runtime.processGroupId <= 0
      || value.runtime.processGroupId !== value.runtime.pid
      || value.runtime.exactOwnedDetachedGroup !== true
      || !Array.isArray(value.runtime.args)
      || value.runtime.args.length < 6
      || value.runtime.args[0] !== '-m'
      || value.runtime.args[1] !== 'mlx_lm.server') {
    fail('HERETIC_RUNTIME_OWNERSHIP_INVALID', 'Heretic runtime receipt does not bind one exact owned detached mlx_lm.server');
  }

  if (!object(value.qualification)
      || value.qualification.healthAndExactModelVerified !== true
      || value.qualification.actualChatCompletionPerformed !== true) {
    fail('HERETIC_RUNTIME_QUALIFICATION_INVALID', 'Heretic runtime receipt lacks current health/model/chat qualification');
  }
  if (value.qualification.loadResultRef !== null && value.qualification.loadResultRef !== undefined) {
    portableRef(value.qualification.loadResultRef, 'qualification.loadResultRef');
  }

  if (!object(value.sourceIdentity)
      || value.sourceIdentity.repository !== 'vgong24/Vextreme-SDK'
      || !GIT_ID_RE.test(value.sourceIdentity.revision ?? '')
      || !GIT_ID_RE.test(value.sourceIdentity.tree ?? '')
      || !SHA256_RE.test(value.sourceIdentity.moduleSha256 ?? '')) {
    fail('HERETIC_RUNTIME_SOURCE_IDENTITY_INVALID', 'Heretic runtime receipt source identity is incomplete');
  }

  const effects = value.effects;
  if (!object(effects)
      || effects.modelRuntime !== true
      || effects.providerNetwork !== false
      || effects.modelDownload !== false
      || effects.artifactMutation !== false
      || effects.training !== false
      || effects.weightMutation !== false
      || effects.memoryMutation !== false
      || effects.activation !== false
      || effects.succession !== false
      || effects.publication !== false
      || effects.repositoryMutation !== false
      || effects.homeMutation !== false) {
    fail('HERETIC_RUNTIME_EFFECT_BOUNDARY_INVALID', 'Heretic runtime receipt crosses a protected effect boundary');
  }

  return freezeDeep(structuredClone(value));
}

export function formHereticPersistentRuntimeBindingRef(homeIdentity) {
  if (!object(homeIdentity)
      || typeof homeIdentity.homeRef !== 'string'
      || typeof homeIdentity.companionLineageRef !== 'string') {
    throw new TypeError('Heretic runtime binding requires current Vex Home identity');
  }
  portableRef(homeIdentity.homeRef, 'homeIdentity.homeRef');
  portableRef(homeIdentity.companionLineageRef, 'homeIdentity.companionLineageRef');
  const identitySeed = [
    homeIdentity.homeRef,
    homeIdentity.companionLineageRef,
    HERETIC_RUNTIME_IDENTITY.modelRef,
    HERETIC_RUNTIME_IDENTITY.modelProfileRef,
    HERETIC_RUNTIME_ADAPTER_REF,
  ].join('|');
  return digestRef('binding.vexlife.heretic-persistent-runtime', identitySeed);
}

export function formHereticPersistentRuntimeStoppedObservation({ receipt, homeIdentity, stopResult }) {
  const runtimeReceipt = validateHereticPersistentRuntimeReceipt(receipt);
  const bindingRef = formHereticPersistentRuntimeBindingRef(homeIdentity);
  if (!object(stopResult)
      || stopResult.disposition !== 'STOPPED_EXACT_OWNED_MLX_RUNTIME'
      || stopResult.pid !== runtimeReceipt.runtime.pid
      || stopResult.processTerminationPerformed !== true
      || !object(stopResult.stop)
      || stopResult.stop.exactOwnershipVerified !== true
      || stopResult.stop.verifiedNotLive !== true
      || stopResult.stop.processGroupId !== runtimeReceipt.runtime.processGroupId
      || stopResult.stop.state !== 'RETIRED_VERIFIED') {
    fail('HERETIC_RUNTIME_STOP_EVIDENCE_INVALID', 'Heretic stopped-runtime observation requires one exact #636 owned-stop result');
  }
  const stopEvidenceCore = {
    runtimeReceiptRef: runtimeReceipt.receiptRef,
    runtimePid: runtimeReceipt.runtime.pid,
    processGroupId: runtimeReceipt.runtime.processGroupId,
    stopDisposition: stopResult.disposition,
    stopState: stopResult.stop.state,
    signalSent: stopResult.stop.signalSent ?? null,
    exactOwnershipVerified: true,
    verifiedNotLive: true,
  };
  const stopEvidenceRef = digestRef(
    'evidence.vexlife.heretic-persistent-runtime-stop',
    JSON.stringify(stopEvidenceCore),
  );
  const observationRef = digestRef(
    'observation.vexlife.heretic-persistent-runtime',
    `${bindingRef}|${stopEvidenceRef}|STOPPED`,
  );
  return freezeDeep({
    schemaVersion: 'vexlife.companion-runtime-adapter-observation/v1',
    truthClass: 'FOREIGN_PLATFORM_RUNTIME_OBSERVATION',
    observationRef,
    adapterRef: runtimeReceipt.runtimeAdapterRef,
    bindingRef,
    homeRef: homeIdentity.homeRef,
    runtimeOwnershipState: 'NO_OWNED_RUNTIME',
    runtimeState: 'STOPPED',
    qualificationState: 'STALE',
    safeReentryState: 'AVAILABLE',
    currentness: 'CURRENT',
    evidenceRefs: [
      runtimeReceipt.receiptRef,
      stopEvidenceRef,
    ],
  });
}

export function formHereticPersistentRuntimeLink({ receipt, homeIdentity }) {
  const runtimeReceipt = validateHereticPersistentRuntimeReceipt(receipt);
  const bindingRef = formHereticPersistentRuntimeBindingRef(homeIdentity);
  const observationSeed = [
    bindingRef,
    runtimeReceipt.receiptRef,
    runtimeReceipt.sourceIdentity.revision,
    String(runtimeReceipt.runtime.pid),
  ].join('|');
  const observationRef = digestRef('observation.vexlife.heretic-persistent-runtime', observationSeed);
  const sourceRefs = [
    runtimeReceipt.receiptRef,
    `git.vextreme-sdk.${runtimeReceipt.sourceIdentity.revision}`,
  ];
  const evidenceRefs = [
    runtimeReceipt.receiptRef,
    ...(runtimeReceipt.qualification.loadResultRef ? [runtimeReceipt.qualification.loadResultRef] : []),
  ];

  const companionBinding = {
    schemaVersion: 'vexlife.companion-binding-input/v1',
    truthClass: 'FOREIGN_CANONICAL_COMPANION_BINDING',
    bindingRef,
    homeRef: homeIdentity.homeRef,
    companionLineageRef: homeIdentity.companionLineageRef,
    modelRefOrNull: runtimeReceipt.modelRef,
    generationRefOrNull: null,
    bindingState: 'BOUND',
    currentness: 'CURRENT',
    sourceRefs,
  };

  const runtimeObservation = {
    schemaVersion: 'vexlife.companion-runtime-adapter-observation/v1',
    truthClass: 'FOREIGN_PLATFORM_RUNTIME_OBSERVATION',
    observationRef,
    adapterRef: runtimeReceipt.runtimeAdapterRef,
    bindingRef,
    homeRef: homeIdentity.homeRef,
    runtimeOwnershipState: 'EXACT_OWNED',
    runtimeState: 'HEALTHY',
    qualificationState: 'CURRENT',
    safeReentryState: 'HELD',
    currentness: 'CURRENT',
    evidenceRefs,
  };

  return freezeDeep({
    schemaVersion: HERETIC_RUNTIME_LINK_SCHEMA,
    state: 'BOUND_CURRENT',
    runtimeReceiptRef: runtimeReceipt.receiptRef,
    runtimeAdapterRef: runtimeReceipt.runtimeAdapterRef,
    modelRef: runtimeReceipt.modelRef,
    modelProfileRef: runtimeReceipt.modelProfileRef,
    endpoint: runtimeReceipt.endpoint,
    requestModel: runtimeReceipt.requestModel,
    runtimePid: runtimeReceipt.runtime.pid,
    sourceIdentity: runtimeReceipt.sourceIdentity,
    browserBinding: {
      endpointEnvironment: 'VEXLIFE_COMPANION_ENDPOINT',
      modelEnvironment: 'VEXLIFE_COMPANION_MODEL',
      receiptEnvironment: 'VEXLIFE_HERETIC_RUNTIME_RECEIPT_PATH',
    },
    companionBinding,
    runtimeObservation,
    effects: {
      runtimeEffectPerformed: false,
      processStartStopPerformed: false,
      modelIdentityMutationPerformed: false,
      homeMutationPerformed: false,
      memoryMutationPerformed: false,
    },
  });
}

// [VXG RealForever]
