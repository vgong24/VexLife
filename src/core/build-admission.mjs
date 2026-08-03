import { semanticHash } from './utils.mjs';
import { validateBuildEffectReceipt } from './local-git-effect-adapter.mjs';
import { verifyRealBuildEffect, validateRealBuildEffectVerification } from './repository-evidence.mjs';
import {
  BUILD_ADMISSION_PROOF_REFS,
  createBuildAdmissionConsumptionReceipt,
  createBuildClosure,
  createBuildConcernObservation,
  createIntegratedBuildAdmissionReceipt,
  projectBuildAdmission,
  readIntegratedBuildAdmissionReceipt,
  validateIntegratedBuildAdmissionReceipt
} from '../../scripts/build-admission-status.mjs';
export {
  BUILD_ADMISSION_PROOF_REFS,
  verifyRealBuildEffect,
  validateRealBuildEffectVerification,
  createBuildAdmissionConsumptionReceipt,
  createBuildClosure,
  createBuildConcernObservation,
  createIntegratedBuildAdmissionReceipt,
  projectBuildAdmission,
  readIntegratedBuildAdmissionReceipt,
  validateIntegratedBuildAdmissionReceipt
};


const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function clone(value) { return structuredClone(value); }
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}
function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value;
}
function requireBool(value, label) {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
}
function requireSha1(value, label) {
  if (!SHA1.test(value ?? '')) throw new Error(`${label} must be a lowercase Git SHA-1`);
  return value;
}
function requireSha256(value, label) {
  if (!SHA256.test(value ?? '')) throw new Error(`${label} must be a lowercase SHA-256`);
  return value;
}
function timestamp(value, label) {
  requireString(value, label);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new Error(`${label} must be canonical ISO`);
  return value;
}
function chronology(earlier, later, label, strict = false) {
  const a = Date.parse(timestamp(earlier, `${label} earlier`));
  const b = Date.parse(timestamp(later, `${label} later`));
  if (strict ? b <= a : b < a) throw new Error(`${label} chronology is invalid`);
}
function exactRefs(values, label, required = false) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  const refs = values.map((value, i) => requireString(value, `${label}[${i}]`));
  if (new Set(refs).size !== refs.length) throw new Error(`${label} contains duplicates`);
  if (required && refs.length === 0) throw new Error(`${label} cannot be empty`);
  return [...refs].sort();
}
function contentAddress(coreInput, refField, prefix, suppliedRef = null) {
  const core = clone(coreInput);
  delete core[refField];
  delete core.semanticFingerprint;
  const semanticFingerprint = semanticHash(core);
  const ref = `${prefix}.${semanticFingerprint.slice(0, 24)}`;
  if (suppliedRef != null && suppliedRef !== ref) throw new Error(`${refField} is not canonical`);
  return freeze({ ...core, [refField]: ref, semanticFingerprint });
}
function assertCanonical(value, refField, prefix, label) {
  requireObject(value, label);
  const core = clone(value);
  delete core[refField];
  delete core.semanticFingerprint;
  const expected = contentAddress(core, refField, prefix);
  if (value[refField] !== expected[refField] || value.semanticFingerprint !== expected.semanticFingerprint) {
    throw new Error(`${label} is forged, re-addressed, or same-ref/different-meaning`);
  }
  return value;
}
function registryOrThrow(registry) {
  const result = validateBuildAdmissionRegistry(registry);
  if (!result.ok) throw new Error(`Build Admission registry is invalid: ${result.errors.join('; ')}`);
  return registry;
}
function exactBinding(actual, expected, label) {
  for (const [field, value] of Object.entries(expected)) if (actual?.[field] !== value) throw new Error(`${label} ${field} mismatch`);
}

export function validateBuildAdmissionRegistry(registry) {
  const errors = [];
  if (!registry || typeof registry !== 'object') return { ok: false, errors: ['registry missing'] };
  if (registry.schemaVersion !== 'vexlife.build-admission-registry/v1') errors.push('schemaVersion mismatch');
  if (registry.canonicalSource?.path !== 'blueprint/build-admission-registry.json' ||
      registry.canonicalSource?.field !== 'buildAdmission' ||
      registry.canonicalSource?.compositionRef !== 'blueprint.vexlife.universal.001') errors.push('canonical source mismatch');
  if (registry.consumedIdentityContract?.sourceDefinitionsMayBeModified !== false ||
      registry.consumedIdentityContract?.schedulerRemainsSoleWorkAdmissionOwner !== true ||
      registry.consumedIdentityContract?.buildAdmissionCreatesSecondQueue !== false) errors.push('identity consumption boundary mismatch');
  const identities = registry.contractIdentities ?? [];
  if (identities.length !== 7 || new Set(identities.map((x) => x.contractRef)).size !== 7) errors.push('contract identities incomplete');
  if (semanticHash(registry.admissionContract?.requiredLeaseKinds) !== semanticHash(['OCCUPANCY','CAPABILITY','EFFECT','RESOURCE','WORKER','CONTEXT'])) errors.push('six-lease vocabulary mismatch');
  if (registry.adapter?.effectScope !== 'DISPOSABLE_LOCAL_GIT_REPOSITORY' || registry.adapter?.networkUsed !== false ||
      registry.adapter?.remoteConfigured !== false || registry.adapter?.arbitraryShellAllowed !== false ||
      registry.adapter?.implementationCheckoutAllowed !== false || registry.adapter?.cleanupMayTraverseParent !== false) errors.push('adapter boundary mismatch');
  if (semanticHash(registry.simulationContract?.proofRefs) !== semanticHash(Array.from({ length: 26 }, (_, i) => `BA${i}`))) errors.push('BA0-BA25 incomplete');
  return { ok: errors.length === 0, errors, stats: { contracts: identities.length, proofs: registry.simulationContract?.proofRefs?.length ?? 0 } };
}

function requestCore(input, registry) {
  requireObject(input, 'build request');
  const mutationPath = requireString(input.mutationPath, 'mutationPath').replaceAll('\\', '/');
  if (mutationPath !== registry.adapter.fixturePath || mutationPath.startsWith('/') || mutationPath.split('/').includes('..')) {
    throw new Error('mutationPath is outside the exact registered fixture claim');
  }
  const pathClaimRefs = exactRefs(input.pathClaimRefs, 'pathClaimRefs', true);
  if (pathClaimRefs.length !== 1 || pathClaimRefs[0] !== input.claimRef) throw new Error('request path claim is not exact single-writer claim');
  const completionGateRefs = exactRefs(input.completionGateRefs, 'completionGateRefs', true);
  const core = {
    schemaVersion: registry.requestContract.schemaVersion,
    contractRef: registry.requestContract.contractRef,
    workRef: requireString(input.workRef, 'workRef'),
    claimRef: requireString(input.claimRef, 'claimRef'),
    intentEnvelopeRef: requireString(input.intentEnvelopeRef, 'intentEnvelopeRef'),
    intentEnvelopeFingerprint: requireSha256(input.intentEnvelopeFingerprint, 'intentEnvelopeFingerprint'),
    workgraphRef: requireString(input.workgraphRef, 'workgraphRef'),
    workgraphFingerprint: requireSha256(input.workgraphFingerprint, 'workgraphFingerprint'),
    workNodeRef: requireString(input.workNodeRef, 'workNodeRef'),
    workNodeFingerprint: requireSha256(input.workNodeFingerprint, 'workNodeFingerprint'),
    schedulerAdmissionRef: requireString(input.schedulerAdmissionRef, 'schedulerAdmissionRef'),
    schedulerAdmissionFingerprint: requireSha256(input.schedulerAdmissionFingerprint, 'schedulerAdmissionFingerprint'),
    schedulerAuthorityEvidenceRef: requireString(input.schedulerAuthorityEvidenceRef, 'schedulerAuthorityEvidenceRef'),
    schedulerAuthorityEvidenceFingerprint: requireSha256(input.schedulerAuthorityEvidenceFingerprint, 'schedulerAuthorityEvidenceFingerprint'),
    schedulerGeneration: input.schedulerGeneration,
    repositoryRef: requireString(input.repositoryRef, 'repositoryRef'),
    repositoryEvidenceRef: requireString(input.repositoryEvidenceRef, 'repositoryEvidenceRef'),
    repositoryEvidenceFingerprint: requireSha256(input.repositoryEvidenceFingerprint, 'repositoryEvidenceFingerprint'),
    expectedHeadSha: requireSha1(input.expectedHeadSha, 'expectedHeadSha'),
    expectedTreeSha: requireSha1(input.expectedTreeSha, 'expectedTreeSha'),
    branchRef: requireString(input.branchRef, 'branchRef'),
    pathClaimRefs,
    mutationPath,
    expectedBeforeBlobSha: requireSha1(input.expectedBeforeBlobSha, 'expectedBeforeBlobSha'),
    replacementContentRef: requireString(input.replacementContentRef, 'replacementContentRef'),
    replacementContentSha256: requireSha256(input.replacementContentSha256, 'replacementContentSha256'),
    expectedAfterBlobSha: requireSha1(input.expectedAfterBlobSha, 'expectedAfterBlobSha'),
    commitMessage: requireString(input.commitMessage, 'commitMessage'),
    expectedTransitionRef: requireString(input.expectedTransitionRef, 'expectedTransitionRef'),
    completionGateRefs,
    returnRouteRef: requireString(input.returnRouteRef, 'returnRouteRef'),
    formedAt: timestamp(input.formedAt, 'formedAt'),
    observedAt: timestamp(input.observedAt, 'observedAt'),
    expiresAt: timestamp(input.expiresAt, 'expiresAt'),
    effectAuthorityGranted: false,
    networkAuthorityGranted: false,
    remoteGitAuthorityGranted: false
  };
  if (!Number.isSafeInteger(core.schedulerGeneration) || core.schedulerGeneration < 1) throw new Error('schedulerGeneration must be positive');
  chronology(core.formedAt, core.observedAt, 'request observation');
  chronology(core.observedAt, core.expiresAt, 'request expiry', true);
  if (registry.adapter.protectedBranches.includes(core.branchRef)) throw new Error('request branch is protected');
  if (/[\r\n]/.test(core.commitMessage) || core.commitMessage.toLowerCase().includes('signed-off-by:')) {
    throw new Error('commitMessage must be one caller-reviewed subject; adapter owns DCO trailer');
  }
  return core;
}

export function createBuildRequest(input, { registry }) {
  const source = registryOrThrow(registry);
  return contentAddress(requestCore(input, source), 'buildRequestRef', 'request.build-admission', input.buildRequestRef);
}

export function validateBuildRequest(request, { registry }) {
  const source = registryOrThrow(registry);
  assertCanonical(request, 'buildRequestRef', 'request.build-admission', 'build request');
  const expected = createBuildRequest({ ...clone(request), buildRequestRef: request.buildRequestRef }, { registry: source });
  if (semanticHash(expected) !== semanticHash(request)) throw new Error('build request is not canonical current meaning');
  return freeze(clone(request));
}

function validateLease(lease, expected, label) {
  requireObject(lease, label);
  if (lease.currentness !== 'CURRENT' || lease.lifecycle !== 'ACTIVE') throw new Error(`${label} is stale or inactive`);
  if (!lease.semanticFingerprint || semanticHash(Object.fromEntries(Object.entries(lease).filter(([k]) => k !== 'semanticFingerprint'))) !== lease.semanticFingerprint) {
    throw new Error(`${label} fingerprint mismatch`);
  }
  exactBinding(lease, expected, label);
  return lease;
}

export function admitBuildRequest(request, input, { registry }) {
  const source = registryOrThrow(registry);
  validateBuildRequest(request, { registry: source });
  requireObject(input, 'build admission input');
  const scheduler = requireObject(input.schedulerAdmission, 'schedulerAdmission');
  if (!scheduler.semanticFingerprint || scheduler.semanticFingerprint !== request.schedulerAdmissionFingerprint ||
      scheduler.admissionReceiptRef !== request.schedulerAdmissionRef || scheduler.schedulerGeneration !== request.schedulerGeneration ||
      scheduler.graphRef !== request.workgraphRef || scheduler.graphFingerprint !== request.workgraphFingerprint ||
      scheduler.workNodeRef !== request.workNodeRef || scheduler.nodeFingerprint !== request.workNodeFingerprint ||
      scheduler.currentness !== 'CURRENT' || scheduler.lifecycle !== 'ACTIVE') {
    throw new Error('scheduler admission is missing, stale, or detached');
  }
  const authority = requireObject(input.schedulerAuthorityEvidence, 'schedulerAuthorityEvidence');
  if (authority.schedulerAuthorityEvidenceRef !== request.schedulerAuthorityEvidenceRef ||
      authority.semanticFingerprint !== request.schedulerAuthorityEvidenceFingerprint || authority.currentness !== 'CURRENT') {
    throw new Error('scheduler authority evidence is stale or detached');
  }
  const repository = requireObject(input.repositoryEvidence, 'repositoryEvidence');
  exactBinding(repository, {
    repositoryEvidenceRef: request.repositoryEvidenceRef,
    semanticFingerprint: request.repositoryEvidenceFingerprint,
    repositoryRef: request.repositoryRef,
    headSha: request.expectedHeadSha,
    treeSha: request.expectedTreeSha,
    mutationBlobSha: request.expectedBeforeBlobSha,
    workingTree: 'CLEAN',
    branch: source.adapter.baselineBranch,
    remoteConfigured: false
  }, 'repository evidence');
  const leaseInputs = {
    OCCUPANCY: input.occupancy,
    CAPABILITY: input.capabilityLease,
    EFFECT: input.effectLease,
    RESOURCE: input.resourceLease,
    WORKER: input.workerLease,
    CONTEXT: input.contextLease
  };
  const expectedCommon = {
    workNodeRef: request.workNodeRef,
    graphFingerprint: request.workgraphFingerprint,
    schedulerGeneration: request.schedulerGeneration
  };
  for (const [kind, lease] of Object.entries(leaseInputs)) validateLease(lease, expectedCommon, `${kind} lease`);
  if (input.occupancy.claimRef !== request.claimRef || input.occupancy.pathClaimFingerprint !== semanticHash(request.pathClaimRefs)) {
    throw new Error('occupancy does not own the exact path claim');
  }
  if (input.capabilityLease.capabilityRef !== 'capability.vexlife.github.publication' ||
      input.effectLease.effectScope !== source.adapter.effectScope || input.effectLease.allowedEffectRefs?.length !== 1 ||
      input.effectLease.allowedEffectRefs[0] !== 'action.github.commit') throw new Error('capability/effect lease does not admit the registered local commit');
  if (input.resourceLease.request?.network !== false || input.resourceLease.request?.modelTurn !== false ||
      input.workerLease.workerRef !== scheduler.workerRef || input.contextLease.workerRef !== scheduler.workerRef) {
    throw new Error('resource, worker, or context lease mismatch');
  }
  if (input.concernWatchState !== source.admissionContract.requiredConcernWatchState) throw new Error('blocking ConcernWatch state');
  if (input.humanConfirmationState !== source.admissionContract.requiredHumanConfirmationState || !input.humanConfirmationRef) {
    throw new Error('exact human confirmation is missing');
  }
  if (input.runtimeRecoveryRouteRef !== request.returnRouteRef) throw new Error('Runtime Recovery return route mismatch');
  const core = {
    schemaVersion: source.admissionContract.schemaVersion,
    contractRef: source.admissionContract.contractRef,
    buildRequestRef: request.buildRequestRef,
    buildRequestFingerprint: request.semanticFingerprint,
    schedulerAdmissionRef: request.schedulerAdmissionRef,
    schedulerAdmissionFingerprint: request.schedulerAdmissionFingerprint,
    schedulerGeneration: request.schedulerGeneration,
    workgraphRef: request.workgraphRef,
    workgraphFingerprint: request.workgraphFingerprint,
    workNodeRef: request.workNodeRef,
    workNodeFingerprint: request.workNodeFingerprint,
    occupancyRef: input.occupancy.occupancyRef,
    occupancyFingerprint: input.occupancy.semanticFingerprint,
    capabilityLeaseRef: input.capabilityLease.leaseRef,
    capabilityLeaseFingerprint: input.capabilityLease.semanticFingerprint,
    effectLeaseRef: input.effectLease.leaseRef,
    effectLeaseFingerprint: input.effectLease.semanticFingerprint,
    resourceLeaseRef: input.resourceLease.leaseRef,
    resourceLeaseFingerprint: input.resourceLease.semanticFingerprint,
    workerLeaseRef: input.workerLease.leaseRef,
    workerLeaseFingerprint: input.workerLease.semanticFingerprint,
    contextLeaseRef: input.contextLease.leaseRef,
    contextLeaseFingerprint: input.contextLease.semanticFingerprint,
    repositoryEvidenceRef: request.repositoryEvidenceRef,
    repositoryEvidenceFingerprint: request.repositoryEvidenceFingerprint,
    concernWatchState: input.concernWatchState,
    runtimeRecoveryRouteRef: input.runtimeRecoveryRouteRef,
    humanConfirmationRef: input.humanConfirmationRef,
    formedAt: timestamp(input.formedAt, 'admission formedAt'),
    observedAt: timestamp(input.observedAt, 'admission observedAt'),
    expiresAt: timestamp(input.expiresAt, 'admission expiresAt'),
    currentness: 'CURRENT',
    externalEffectsAuthorized: true,
    networkAuthorized: false,
    remoteGitAuthorized: false
  };
  chronology(request.observedAt, core.formedAt, 'admission formation');
  chronology(core.formedAt, core.observedAt, 'admission observation');
  chronology(core.observedAt, core.expiresAt, 'admission expiry', true);
  return contentAddress(core, 'buildAdmissionRef', 'admission.build-admission');
}

export function validateBuildAdmission(admission, { request, registry }) {
  registryOrThrow(registry);
  validateBuildRequest(request, { registry });
  assertCanonical(admission, 'buildAdmissionRef', 'admission.build-admission', 'build admission');
  exactBinding(admission, {
    buildRequestRef: request.buildRequestRef,
    buildRequestFingerprint: request.semanticFingerprint,
    schedulerAdmissionRef: request.schedulerAdmissionRef,
    schedulerAdmissionFingerprint: request.schedulerAdmissionFingerprint,
    schedulerGeneration: request.schedulerGeneration,
    workgraphRef: request.workgraphRef,
    workgraphFingerprint: request.workgraphFingerprint,
    workNodeRef: request.workNodeRef,
    workNodeFingerprint: request.workNodeFingerprint,
    repositoryEvidenceRef: request.repositoryEvidenceRef,
    repositoryEvidenceFingerprint: request.repositoryEvidenceFingerprint,
    currentness: 'CURRENT',
    externalEffectsAuthorized: true,
    networkAuthorized: false,
    remoteGitAuthorized: false
  }, 'build admission');
  return freeze(clone(admission));
}


// [VXG RealForever]
