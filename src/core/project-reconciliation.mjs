import { validateValidationEvidenceBundle } from './build-health.mjs';
import { PROJECT_CONTINUITY_SNAPSHOT_SCHEMA } from './project-continuity.mjs';
import { transitionAllowed as intentTransitionAllowed } from './intent-validation.mjs';
import { semanticHash } from './utils.mjs';

export const PROJECT_EVIDENCE_RELATION_SCHEMA = 'vexlife.project-evidence-relation/v1';
export const PROJECT_PROVIDER_OBSERVATION_SCHEMA = 'vexlife.project-provider-observation/v1';
export const PROJECT_RECONCILIATION_SCHEMA = 'vexlife.project-reconciliation/v1';

const REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
const PROJECT_REF = /^project\.[A-Za-z0-9._-]+$/u;
const WORK_REF = /^work\.[A-Za-z0-9._-]+$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => structuredClone(value);
const canonicalRefs = (values = []) => [...new Set(values)].sort();

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function stableRef(value, label) {
  if (typeof value !== 'string' || !REF.test(value)) throw new TypeError(`${label} must be one stable ref`);
  return value;
}

function projectRef(value, label = 'projectRef') {
  if (typeof value !== 'string' || !PROJECT_REF.test(value)) throw new TypeError(`${label} must be one project.* ref`);
  return value;
}

function workRef(value, label = 'workRef') {
  if (typeof value !== 'string' || !WORK_REF.test(value)) throw new TypeError(`${label} must be one work.* ref`);
  return value;
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be one canonical UTC timestamp`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new TypeError(`${label} must be one canonical UTC timestamp`);
  }
  return value;
}

function sha1(value, label) {
  if (typeof value !== 'string' || !SHA1.test(value)) throw new TypeError(`${label} must be lowercase Git SHA-1`);
  return value;
}

function sha1OrNull(value, label) {
  if (value === null) return null;
  return sha1(value, label);
}

function sha256(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new TypeError(`${label} must be lowercase SHA-256`);
  return value;
}

function uniqueRefs(values, label) {
  if (!Array.isArray(values) || values.length === 0) throw new TypeError(`${label} must be a non-empty ref array`);
  for (const value of values) stableRef(value, label);
  if (new Set(values).size !== values.length) throw new TypeError(`${label} must not contain duplicates`);
  return canonicalRefs(values);
}

function withFingerprint(core, supplied, label) {
  const semanticFingerprint = semanticHash(core);
  if (supplied && supplied !== semanticFingerprint) {
    throw new TypeError(`${label} semanticFingerprint mismatch`);
  }
  return freezeDeep({ ...core, semanticFingerprint });
}

export function validateProjectReconciliationRegistry(registry) {
  const errors = [];
  if (!object(registry) || registry.schemaVersion !== 'vexlife.project-reconciliation-registry/v1') {
    errors.push('project reconciliation registry schema mismatch');
  }
  if (registry?.registryRef !== 'registry.vexlife.project-reconciliation.001') {
    errors.push('project reconciliation registry identity mismatch');
  }
  if (!Number.isInteger(registry?.registryVersion) || registry.registryVersion < 1) {
    errors.push('project reconciliation registry version invalid');
  }
  const dispositions = registry?.dispositions ?? [];
  const expectedDispositions = ['CURRENT_IN_REVIEW', 'REVERIFY_REQUIRED', 'COMPLETION_EVIDENCE_READY', 'HELD_UNKNOWN'];
  if (JSON.stringify(dispositions) !== JSON.stringify(expectedDispositions)) {
    errors.push('project reconciliation dispositions are not the canonical ordered vocabulary');
  }
  const providerStates = registry?.providerStates ?? [];
  for (const state of ['OPEN', 'MERGED', 'CLOSED_UNMERGED', 'UNKNOWN']) {
    if (!providerStates.includes(state)) errors.push(`project reconciliation providerStates missing ${state}`);
  }
  const checkStates = registry?.providerCheckStates ?? [];
  for (const state of ['SUCCESS', 'PENDING', 'FAILED', 'UNKNOWN']) {
    if (!checkStates.includes(state)) errors.push(`project reconciliation providerCheckStates missing ${state}`);
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function relationCore(input) {
  return {
    schemaVersion: PROJECT_EVIDENCE_RELATION_SCHEMA,
    relationRef: input.relationRef,
    projectRef: input.projectRef,
    workNodeRef: input.workNodeRef,
    repositoryRef: input.repositoryRef,
    workRef: input.workRef,
    validationProfileRef: input.validationProfileRef,
    sourceRefs: canonicalRefs(input.sourceRefs),
    formedAt: input.formedAt,
  };
}

export function createProjectEvidenceRelation(input, registry) {
  if (!object(input) || input.schemaVersion !== PROJECT_EVIDENCE_RELATION_SCHEMA) {
    throw new TypeError('project evidence relation schema mismatch');
  }
  const registryValidation = validateProjectReconciliationRegistry(registry);
  if (!registryValidation.ok) throw new TypeError(registryValidation.errors[0]);
  stableRef(input.relationRef, 'relationRef');
  projectRef(input.projectRef);
  stableRef(input.workNodeRef, 'workNodeRef');
  stableRef(input.repositoryRef, 'repositoryRef');
  workRef(input.workRef);
  stableRef(input.validationProfileRef, 'validationProfileRef');
  uniqueRefs(input.sourceRefs, 'sourceRefs');
  canonicalTimestamp(input.formedAt, 'formedAt');
  return withFingerprint(relationCore(input), input.semanticFingerprint, 'project evidence relation');
}

function providerObservationCore(input) {
  return {
    schemaVersion: PROJECT_PROVIDER_OBSERVATION_SCHEMA,
    observationRef: input.observationRef,
    repositoryRef: input.repositoryRef,
    workRef: input.workRef,
    pullRequestNumberOrNull: input.pullRequestNumberOrNull,
    providerState: input.providerState,
    baseShaOrNull: input.baseShaOrNull,
    headShaOrNull: input.headShaOrNull,
    headTreeShaOrNull: input.headTreeShaOrNull,
    candidateSourceTreeSha256OrNull: input.candidateSourceTreeSha256OrNull,
    mergeCommitShaOrNull: input.mergeCommitShaOrNull,
    mergeTreeShaOrNull: input.mergeTreeShaOrNull,
    currentMainShaOrNull: input.currentMainShaOrNull,
    mergeCommitReachableFromMain: input.mergeCommitReachableFromMain,
    checksState: input.checksState,
    observedAt: input.observedAt,
    sourceRefs: canonicalRefs(input.sourceRefs),
  };
}

export function createProjectProviderObservation(input, registry) {
  if (!object(input) || input.schemaVersion !== PROJECT_PROVIDER_OBSERVATION_SCHEMA) {
    throw new TypeError('project provider observation schema mismatch');
  }
  const registryValidation = validateProjectReconciliationRegistry(registry);
  if (!registryValidation.ok) throw new TypeError(registryValidation.errors[0]);
  stableRef(input.observationRef, 'observationRef');
  stableRef(input.repositoryRef, 'repositoryRef');
  workRef(input.workRef);
  if (input.pullRequestNumberOrNull !== null &&
      (!Number.isInteger(input.pullRequestNumberOrNull) || input.pullRequestNumberOrNull < 1)) {
    throw new TypeError('pullRequestNumberOrNull must be null or a positive integer');
  }
  if (!(registry.providerStates ?? []).includes(input.providerState)) {
    throw new TypeError(`unsupported providerState ${input.providerState}`);
  }
  if (!(registry.providerCheckStates ?? []).includes(input.checksState)) {
    throw new TypeError(`unsupported checksState ${input.checksState}`);
  }
  for (const [field, value] of [
    ['baseShaOrNull', input.baseShaOrNull],
    ['headShaOrNull', input.headShaOrNull],
    ['headTreeShaOrNull', input.headTreeShaOrNull],
    ['mergeCommitShaOrNull', input.mergeCommitShaOrNull],
    ['mergeTreeShaOrNull', input.mergeTreeShaOrNull],
    ['currentMainShaOrNull', input.currentMainShaOrNull],
  ]) sha1OrNull(value, field);
  if (input.candidateSourceTreeSha256OrNull !== null) {
    sha256(input.candidateSourceTreeSha256OrNull, 'candidateSourceTreeSha256OrNull');
  }
  if (typeof input.mergeCommitReachableFromMain !== 'boolean') {
    throw new TypeError('mergeCommitReachableFromMain must be boolean');
  }
  canonicalTimestamp(input.observedAt, 'observedAt');
  uniqueRefs(input.sourceRefs, 'sourceRefs');

  if (input.providerState === 'OPEN') {
    if (!input.pullRequestNumberOrNull || !input.baseShaOrNull || !input.headShaOrNull ||
        !input.headTreeShaOrNull || !input.candidateSourceTreeSha256OrNull) {
      throw new TypeError('OPEN provider observation requires exact PR/base/head/tree/source-tree bindings');
    }
    if (input.mergeCommitShaOrNull !== null || input.mergeTreeShaOrNull !== null ||
        input.mergeCommitReachableFromMain !== false) {
      throw new TypeError('OPEN provider observation may not claim merge completion');
    }
  }
  if (input.providerState === 'MERGED') {
    if (!input.pullRequestNumberOrNull || !input.baseShaOrNull || !input.headShaOrNull ||
        !input.headTreeShaOrNull || !input.candidateSourceTreeSha256OrNull ||
        !input.mergeCommitShaOrNull || !input.mergeTreeShaOrNull ||
        !input.currentMainShaOrNull || input.mergeCommitReachableFromMain !== true) {
      throw new TypeError('MERGED provider observation requires exact candidate, merge and reachable-main bindings');
    }
  }
  if (input.providerState === 'CLOSED_UNMERGED') {
    if (!input.pullRequestNumberOrNull || !input.baseShaOrNull || !input.headShaOrNull || !input.headTreeShaOrNull) {
      throw new TypeError('CLOSED_UNMERGED provider observation requires exact PR/base/head/tree bindings');
    }
    if (input.mergeCommitShaOrNull !== null || input.mergeTreeShaOrNull !== null ||
        input.mergeCommitReachableFromMain !== false) {
      throw new TypeError('CLOSED_UNMERGED provider observation may not claim merge completion');
    }
  }

  return withFingerprint(providerObservationCore(input), input.semanticFingerprint, 'project provider observation');
}

function assertProjectSnapshot(projectSnapshot, relation) {
  if (!object(projectSnapshot) || projectSnapshot.schemaVersion !== PROJECT_CONTINUITY_SNAPSHOT_SCHEMA ||
      projectSnapshot.currentness !== 'CURRENT' || projectSnapshot.projectRef !== relation.projectRef) {
    throw new TypeError('project reconciliation requires one exact CURRENT Project Continuity snapshot');
  }
  const card = (projectSnapshot.cards ?? []).find((item) => item.workNodeRef === relation.workNodeRef);
  if (!card) throw new TypeError(`project evidence relation references absent work node ${relation.workNodeRef}`);
  return card;
}

function orientationState(orientationReceipt, relation, provider) {
  if (!object(orientationReceipt) || orientationReceipt.schemaVersion !== 'vexlife.orientation-receipt/v1') {
    return { current: false, reasonRef: 'attention.project.orientation-unavailable' };
  }
  if (orientationReceipt.currentness !== 'CURRENT' || orientationReceipt.state === 'BLOCKED') {
    return { current: false, reasonRef: 'attention.project.orientation-not-current' };
  }
  if (orientationReceipt.repository?.slug !== relation.repositoryRef ||
      provider.repositoryRef !== relation.repositoryRef) {
    return { current: false, reasonRef: 'attention.project.repository-mismatch' };
  }

  if (provider.providerState === 'OPEN') {
    const current = (
      orientationReceipt.currentWork?.state === 'ACTIVE_PR' &&
      orientationReceipt.currentWork?.workRef === relation.workRef &&
      orientationReceipt.git?.candidateHeadSha === provider.headShaOrNull &&
      orientationReceipt.git?.candidateTreeSha === provider.headTreeShaOrNull &&
      orientationReceipt.git?.baseSha === provider.baseShaOrNull
    );
    return {
      current,
      reasonRef: current ? null : 'attention.project.provider-head-moved',
    };
  }

  if (provider.providerState === 'MERGED') {
    const current = (
      orientationReceipt.currentWork?.state === 'ACCEPTED_MAIN' &&
      orientationReceipt.git?.candidateHeadSha === provider.currentMainShaOrNull
    );
    return {
      current,
      reasonRef: current ? null : 'attention.project.accepted-main-moved-or-unobserved',
    };
  }

  return { current: true, reasonRef: null };
}

function proofValidation({ validationEvidenceBundle, validationEvidencePolicy, provider }) {
  if (!validationEvidenceBundle) {
    return Object.freeze({ ok: false, errors: Object.freeze(['validation evidence bundle not supplied']) });
  }
  if (!validationEvidencePolicy) {
    return Object.freeze({ ok: false, errors: Object.freeze(['validation evidence policy not supplied']) });
  }
  if (!provider.baseShaOrNull || !provider.headShaOrNull || !provider.headTreeShaOrNull ||
      !provider.candidateSourceTreeSha256OrNull) {
    return Object.freeze({ ok: false, errors: Object.freeze(['provider observation does not bind an exact proof target']) });
  }
  const result = validateValidationEvidenceBundle(
    validationEvidenceBundle,
    validationEvidencePolicy,
    {
      repositoryRef: provider.repositoryRef,
      baseSha: provider.baseShaOrNull,
      candidateHeadSha: provider.headShaOrNull,
      candidateTreeSha: provider.headTreeShaOrNull,
      sourceTreeSha256: provider.candidateSourceTreeSha256OrNull,
      observedHeadSha: provider.headShaOrNull,
    }
  );
  return Object.freeze({
    ok: result.ok,
    errors: Object.freeze([...(result.errors ?? [])]),
    stats: freezeDeep(clone(result.stats ?? {})),
  });
}

function possibleCompletionTransition(card, intentRegistry) {
  if (!card || !intentRegistry || !intentTransitionAllowed(card.state, 'COMPLETED', intentRegistry)) return null;
  return Object.freeze({
    workNodeRef: card.workNodeRef,
    priorState: card.state,
    nextState: 'COMPLETED',
    basis: 'COMPLETION_EVIDENCE_READY',
    transitionAuthority: 'NONE',
  });
}

export function reconcileProjectEvidence({
  registry,
  projectSnapshot,
  relation: rawRelation,
  orientationReceipt,
  validationEvidenceBundle = null,
  validationEvidencePolicy = null,
  providerObservation: rawProviderObservation,
  intentRegistry = null,
} = {}) {
  const relation = createProjectEvidenceRelation(rawRelation, registry);
  const provider = createProjectProviderObservation(rawProviderObservation, registry);
  const card = assertProjectSnapshot(projectSnapshot, relation);

  if (provider.workRef !== relation.workRef) {
    throw new TypeError('provider observation workRef does not match Project evidence relation');
  }
  if (relation.validationProfileRef !== validationEvidencePolicy?.policyRef) {
    throw new TypeError('Project evidence relation validationProfileRef does not match current Build Health policy');
  }

  const orientation = orientationState(orientationReceipt, relation, provider);
  const attentionRefs = [];
  if (!orientation.current && orientation.reasonRef) attentionRefs.push(orientation.reasonRef);
  if (provider.checksState === 'FAILED') attentionRefs.push('attention.project.provider-checks-failed');
  if (provider.checksState === 'PENDING') attentionRefs.push('attention.project.provider-checks-pending');
  if (provider.checksState === 'UNKNOWN') attentionRefs.push('attention.project.provider-checks-unknown');

  let validation = Object.freeze({ ok: false, errors: Object.freeze(['proof validation not attempted']) });
  let disposition = 'HELD_UNKNOWN';
  let completionEvidenceState = 'NOT_EARNED';

  if (provider.providerState === 'UNKNOWN') {
    attentionRefs.push('attention.project.provider-state-unknown');
  } else if (provider.providerState === 'CLOSED_UNMERGED') {
    attentionRefs.push('attention.project.pull-request-closed-unmerged');
  } else if (!orientation.current) {
    disposition = 'REVERIFY_REQUIRED';
  } else {
    validation = proofValidation({ validationEvidenceBundle, validationEvidencePolicy, provider });
    if (!validation.ok) {
      disposition = 'REVERIFY_REQUIRED';
      attentionRefs.push('attention.project.proof-reverification-required');
    } else if (provider.providerState === 'OPEN') {
      disposition = 'CURRENT_IN_REVIEW';
    } else if (provider.providerState === 'MERGED') {
      if (provider.mergeTreeShaOrNull !== provider.headTreeShaOrNull ||
          provider.mergeCommitReachableFromMain !== true) {
        disposition = 'REVERIFY_REQUIRED';
        attentionRefs.push('attention.project.post-merge-tree-not-exact');
      } else {
        disposition = 'COMPLETION_EVIDENCE_READY';
        completionEvidenceState = 'EARNED';
      }
    }
  }

  const proposedTransition = disposition === 'COMPLETION_EVIDENCE_READY'
    ? possibleCompletionTransition(card, intentRegistry)
    : null;

  const core = {
    schemaVersion: PROJECT_RECONCILIATION_SCHEMA,
    state: disposition,
    currentness: disposition === 'HELD_UNKNOWN' ? 'UNKNOWN' : 'CURRENT',
    projectRef: relation.projectRef,
    workNodeRef: relation.workNodeRef,
    workState: card.state,
    relationRef: relation.relationRef,
    relationFingerprint: relation.semanticFingerprint,
    projectSnapshotFingerprint: projectSnapshot.semanticFingerprint,
    repositoryRef: relation.repositoryRef,
    workRef: relation.workRef,
    providerObservationRef: provider.observationRef,
    providerObservationFingerprint: provider.semanticFingerprint,
    providerState: provider.providerState,
    providerChecksState: provider.checksState,
    sourceCurrentness: orientation.current ? 'CURRENT' : 'STALE_OR_UNKNOWN',
    proofState: validation.ok ? 'CURRENT' : provider.providerState === 'UNKNOWN' ? 'UNKNOWN' : 'REVERIFY_REQUIRED',
    validationEvidenceRefOrNull: validationEvidenceBundle?.validationEvidenceRef ?? null,
    validationEvidenceFingerprintOrNull: validationEvidenceBundle?.semanticFingerprint ?? null,
    validationErrors: [...(validation.errors ?? [])].sort().slice(0, 24),
    completionEvidenceState,
    proposedLifecycleTransitionOrNull: proposedTransition,
    attentionRefs: canonicalRefs(attentionRefs),
    sourceRefs: canonicalRefs([
      ...relation.sourceRefs,
      ...provider.sourceRefs,
      ...(orientationReceipt?.sourceRefs ?? []),
      ...(validationEvidenceBundle?.receiptRefs ?? []).slice(0, 8),
    ]),
    effects: false,
    executionAuthority: 'NONE',
    transitionAuthority: 'NONE',
  };
  return withFingerprint(core, null, 'project reconciliation');
}

// [VXG RealForever]
