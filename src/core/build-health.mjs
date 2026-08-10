import { semanticHash } from './utils.mjs';
import { validateCheckResultContract } from './check-result.mjs';

export const PROVIDER_NEUTRAL_VALIDATION_EVIDENCE_CONTRACT = Object.freeze({
  schemaVersion: 'vexlife.provider-neutral-validation-evidence/v1',
  contractRef: 'contract.vexlife.provider-neutral-validation-evidence/v1',
  validationProfileRef: 'validation-profile.vexlife.required-evidence.001',
  validationProfileVersion: 1,
  producerClasses: Object.freeze(['GITHUB_HOSTED', 'ONE_SHOT_LOCAL']),
  proofCells: Object.freeze([
    Object.freeze({ proofCellRef: 'proof.source-manifest-portability.linux', platformId: 'linux' }),
    Object.freeze({ proofCellRef: 'proof.build-admission-host.linux', platformId: 'linux' }),
    Object.freeze({ proofCellRef: 'proof.source-manifest-portability.windows', platformId: 'windows' }),
    Object.freeze({ proofCellRef: 'proof.build-admission-host.windows', platformId: 'windows' }),
    Object.freeze({ proofCellRef: 'proof.g01-lived-companion.windows', platformId: 'windows' }),
    Object.freeze({ proofCellRef: 'proof.g02-score-context.windows', platformId: 'windows' }),
    Object.freeze({ proofCellRef: 'proof.g03-daily-memory-dream.windows', platformId: 'windows' }),
    Object.freeze({ proofCellRef: 'proof.g04-evaluated-rhythm-learning.windows', platformId: 'windows' }),
    Object.freeze({ proofCellRef: 'proof.g05-runtime-authority-substrate.windows', platformId: 'windows' }),
    Object.freeze({ proofCellRef: 'proof.g05a-scheduled-daily-autonomy.windows', platformId: 'windows' })
  ]),
  proofDispositions: Object.freeze(['EXECUTED', 'REUSED']),
  semanticPassState: 'PASSED',
  currentState: 'CURRENT',
  reusedDisposition: 'REUSE',
  dcoTrailerPrefix: 'Signed-off-by: ',
  authorityGranting: false,
  hostedRunnerRequired: false,
  equivalentEvidenceMayWeakenProof: false,
  platformImpersonationAllowed: false,
  currentnessMayGrantAuthority: false
});

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA64 = /^[a-f0-9]{64}$/u;

function uniqueStrings(values) {
  return new Set(Array.isArray(values) ? values.filter((value) => typeof value === 'string') : []);
}

function requiredBlockingChecks(registry) {
  return (registry?.checks ?? [])
    .filter((item) => item?.blocking === true)
    .map((item) => ({ checkRef: item.checkRef, command: item.command }))
    .sort((left, right) => left.checkRef.localeCompare(right.checkRef));
}

export function deriveProviderNeutralValidationProfile(registry) {
  const checks = requiredBlockingChecks(registry);
  const semantic = {
    validationProfileRef: PROVIDER_NEUTRAL_VALIDATION_EVIDENCE_CONTRACT.validationProfileRef,
    validationProfileVersion: PROVIDER_NEUTRAL_VALIDATION_EVIDENCE_CONTRACT.validationProfileVersion,
    semanticChecks: checks,
    proofCells: PROVIDER_NEUTRAL_VALIDATION_EVIDENCE_CONTRACT.proofCells,
    producerClasses: PROVIDER_NEUTRAL_VALIDATION_EVIDENCE_CONTRACT.producerClasses
  };
  return Object.freeze({ ...semantic, semanticFingerprint: semanticHash(semantic) });
}

function validateReceiptDigest(item, label, errors) {
  if (!item?.receiptRef) errors.push(`${label} missing receiptRef`);
  if (!item?.receipt || typeof item.receipt !== 'object' || Array.isArray(item.receipt)) {
    errors.push(`${label} missing receipt object`);
  } else if (!SHA64.test(item.receiptDigest ?? '')) {
    errors.push(`${label} receiptDigest must be lowercase SHA-256`);
  } else if (semanticHash(item.receipt) !== item.receiptDigest) {
    errors.push(`${label} receipt digest mismatch`);
  }
  if (!SHA64.test(item?.logDigest ?? '')) errors.push(`${label} logDigest must be lowercase SHA-256`);
}

function validateProducerProfiles(bundle, errors) {
  const producers = new Map();
  for (const producer of bundle?.producerProfiles ?? []) {
    const ref = producer?.producerProfileRef;
    if (!ref) {
      errors.push('producer profile missing producerProfileRef');
      continue;
    }
    if (producers.has(ref)) {
      errors.push(`duplicate producer profile ${ref}`);
      continue;
    }
    if (!PROVIDER_NEUTRAL_VALIDATION_EVIDENCE_CONTRACT.producerClasses.includes(producer.producerClass)) {
      errors.push(`${ref} has unsupported producerClass ${producer.producerClass ?? 'null'}`);
    }
    if (!producer.providerIdentityRef) errors.push(`${ref} missing providerIdentityRef`);
    if (!producer.platformId) errors.push(`${ref} missing platformId`);
    if (!producer.architecture) errors.push(`${ref} missing architecture`);
    if (!producer.nodeVersion) errors.push(`${ref} missing nodeVersion`);
    if (!Array.isArray(producer.qualificationEvidenceRefs) || producer.qualificationEvidenceRefs.length === 0) {
      errors.push(`${ref} missing qualificationEvidenceRefs`);
    }
    if (producer.currentness !== 'CURRENT') errors.push(`${ref} is not CURRENT`);
    if (!producer.qualificationReceiptRef) errors.push(`${ref} missing qualificationReceiptRef`);
    if (!SHA64.test(producer.qualificationReceiptDigest ?? '')) {
      errors.push(`${ref} qualificationReceiptDigest must be lowercase SHA-256`);
    }
    if (producer.producerClass === 'ONE_SHOT_LOCAL' && (producer.statusContextRef || (producer.statusContextRefs ?? []).length)) {
      errors.push(`${ref} local producer may not impersonate a hosted status context`);
    }
    producers.set(ref, producer);
  }
  return producers;
}

function validateDco(bundle, errors) {
  const commits = bundle?.candidateCommitShas ?? [];
  const commitSet = uniqueStrings(commits);
  if (!Array.isArray(commits) || commits.length === 0 || commitSet.size !== commits.length) {
    errors.push('candidateCommitShas must be a non-empty unique list');
  }
  for (const sha of commitSet) if (!SHA40.test(sha)) errors.push(`invalid candidate commit SHA ${sha}`);
  const evidence = new Map();
  for (const item of bundle?.dcoCommitEvidence ?? []) {
    if (!item?.commitSha) {
      errors.push('DCO evidence missing commitSha');
      continue;
    }
    if (evidence.has(item.commitSha)) errors.push(`duplicate DCO evidence ${item.commitSha}`);
    evidence.set(item.commitSha, item);
    const expected = `${PROVIDER_NEUTRAL_VALIDATION_EVIDENCE_CONTRACT.dcoTrailerPrefix}${item.authorName ?? ''} <${item.authorEmail ?? ''}>`;
    const lines = typeof item.commitMessage === 'string' ? item.commitMessage.split(/\r?\n/u).map((line) => line.trim()) : [];
    if (!item.authorName || !item.authorEmail || !lines.includes(expected)) {
      errors.push(`${item.commitSha} missing exact author-matching DCO sign-off`);
    }
  }
  for (const sha of commitSet) if (!evidence.has(sha)) errors.push(`missing DCO evidence for ${sha}`);
  for (const sha of evidence.keys()) if (!commitSet.has(sha)) errors.push(`DCO evidence outside candidate commit set ${sha}`);
}

function validateSemanticChecks(bundle, registry, producers, errors) {
  const required = requiredBlockingChecks(registry);
  const requiredByRef = new Map(required.map((item) => [item.checkRef, item]));
  const results = new Map();
  for (const item of bundle?.semanticCheckResults ?? []) {
    const ref = item?.checkRef;
    if (!ref) {
      errors.push('semantic check result missing checkRef');
      continue;
    }
    if (results.has(ref)) errors.push(`duplicate semantic check result ${ref}`);
    results.set(ref, item);
    const expected = requiredByRef.get(ref);
    if (!expected) {
      errors.push(`semantic check result ${ref} is not in the required Build Health profile`);
      continue;
    }
    if (item.command !== expected.command) errors.push(`${ref} command does not match Build Health registry`);
    const producer = producers.get(item.producerProfileRef);
    if (!producer) errors.push(`${ref} references unknown producer ${item.producerProfileRef ?? 'null'}`);
    if (item.transportState !== 'EXECUTED' || item.executed !== true) errors.push(`${ref} was not executed`);
    if (item.semanticState !== 'PASSED') errors.push(`${ref} semantic state is not PASSED`);
    if (item.currentness !== 'CURRENT') errors.push(`${ref} is not CURRENT`);
    validateReceiptDigest(item, ref, errors);
  }
  for (const item of required) if (!results.has(item.checkRef)) errors.push(`missing required semantic check ${item.checkRef}`);
}

function validateProofCells(bundle, producers, errors) {
  const required = new Map(PROVIDER_NEUTRAL_VALIDATION_EVIDENCE_CONTRACT.proofCells.map((item) => [item.proofCellRef, item]));
  const cells = new Map();
  for (const cell of bundle?.proofCells ?? []) {
    const ref = cell?.proofCellRef;
    if (!ref) {
      errors.push('proof cell missing proofCellRef');
      continue;
    }
    if (cells.has(ref)) errors.push(`duplicate proof cell ${ref}`);
    cells.set(ref, cell);
    const expected = required.get(ref);
    if (!expected) {
      errors.push(`unexpected proof cell ${ref}`);
      continue;
    }
    const producer = producers.get(cell.producerProfileRef);
    if (!producer) errors.push(`${ref} references unknown producer ${cell.producerProfileRef ?? 'null'}`);
    if (cell.platformId !== expected.platformId) errors.push(`${ref} must declare platform ${expected.platformId}`);
    if (producer && producer.platformId !== expected.platformId) {
      errors.push(`${ref} producer platform ${producer.platformId} cannot satisfy ${expected.platformId}`);
    }
    if (!PROVIDER_NEUTRAL_VALIDATION_EVIDENCE_CONTRACT.proofDispositions.includes(cell.evidenceDisposition)) {
      errors.push(`${ref} has invalid evidenceDisposition ${cell.evidenceDisposition ?? 'null'}`);
    }
    if (cell.semanticState !== 'PASSED') errors.push(`${ref} semantic state is not PASSED`);
    if (cell.currentness !== 'CURRENT') errors.push(`${ref} is not CURRENT`);
    validateReceiptDigest(cell, ref, errors);
    if (cell.evidenceDisposition === 'EXECUTED') {
      if (cell.executed !== true) errors.push(`${ref} EXECUTED evidence must set executed=true`);
      if (cell.transportState !== 'EXECUTED') errors.push(`${ref} EXECUTED evidence must have transportState=EXECUTED`);
    }
    if (cell.evidenceDisposition === 'REUSED') {
      if (cell.executed !== false) errors.push(`${ref} REUSED evidence must set executed=false`);
      if (cell.reuseDisposition !== 'REUSE') errors.push(`${ref} REUSED evidence must have reuseDisposition=REUSE`);
      if (!cell.acceptedEvidenceRef) errors.push(`${ref} REUSED evidence missing acceptedEvidenceRef`);
      if (!cell.currentnessReceiptRef) errors.push(`${ref} REUSED evidence missing currentnessReceiptRef`);
      if (!SHA64.test(cell.currentnessReceiptDigest ?? '')) errors.push(`${ref} currentnessReceiptDigest must be lowercase SHA-256`);
      if (!Array.isArray(cell.dependencyBindings) || cell.dependencyBindings.length === 0) {
        errors.push(`${ref} REUSED evidence missing dependencyBindings`);
      } else {
        for (const binding of cell.dependencyBindings) {
          if (!binding?.sourceRef || !SHA64.test(binding.expectedFingerprint ?? '') ||
              !SHA64.test(binding.observedFingerprint ?? '') ||
              binding.expectedFingerprint !== binding.observedFingerprint) {
            errors.push(`${ref} has non-matching dependency binding`);
            break;
          }
        }
      }
    }
  }
  for (const ref of required.keys()) if (!cells.has(ref)) errors.push(`missing required proof cell ${ref}`);
}

export function validateProviderNeutralValidationEvidence(bundle, {
  registry,
  expectedRepositoryRef = null,
  expectedBaseSha = null,
  expectedCandidateHeadSha = null,
  expectedCandidateTreeSha = null,
  expectedSourceTreeSha256 = null
} = {}) {
  const errors = [];
  const profile = deriveProviderNeutralValidationProfile(registry);
  if (bundle?.schemaVersion !== PROVIDER_NEUTRAL_VALIDATION_EVIDENCE_CONTRACT.schemaVersion) {
    errors.push('validation evidence schemaVersion mismatch');
  }
  if (bundle?.validationProfileRef !== profile.validationProfileRef ||
      bundle?.validationProfileVersion !== profile.validationProfileVersion ||
      bundle?.validationProfileFingerprint !== profile.semanticFingerprint) {
    errors.push('validation profile identity/fingerprint mismatch');
  }
  const expectedPairs = [
    ['repositoryRef', expectedRepositoryRef, bundle?.repositoryRef],
    ['baseSha', expectedBaseSha, bundle?.baseSha],
    ['candidateHeadSha', expectedCandidateHeadSha, bundle?.candidateHeadSha],
    ['candidateTreeSha', expectedCandidateTreeSha, bundle?.candidateTreeSha],
    ['sourceTreeSha256', expectedSourceTreeSha256, bundle?.sourceTreeSha256]
  ];
  for (const [field, expected, actual] of expectedPairs) {
    if (expected != null && actual !== expected) errors.push(`${field} does not match expected identity`);
  }
  if (!bundle?.repositoryRef) errors.push('validation evidence missing repositoryRef');
  for (const field of ['baseSha', 'candidateHeadSha', 'candidateTreeSha', 'testedCheckoutSha']) {
    if (!SHA40.test(bundle?.[field] ?? '')) errors.push(`${field} must be lowercase Git SHA-1`);
  }
  if (bundle?.testedCheckoutSha !== bundle?.candidateHeadSha) errors.push('testedCheckoutSha must equal candidateHeadSha');
  if (bundle?.testedMergeSha != null && !SHA40.test(bundle.testedMergeSha)) errors.push('testedMergeSha must be null or lowercase Git SHA-1');
  if (!SHA64.test(bundle?.sourceTreeSha256 ?? '')) errors.push('sourceTreeSha256 must be lowercase SHA-256');
  if (bundle?.currentness !== 'CURRENT') errors.push('validation evidence is not CURRENT');
  for (const field of ['executionAuthorityGranted', 'sourceMutationAuthorityGranted', 'reviewAuthorityGranted',
                       'approvalAuthorityGranted', 'readyAuthorityGranted', 'mergeAuthorityGranted']) {
    if (bundle?.[field] === true) errors.push(`validation evidence may not grant ${field}`);
  }
  const producers = validateProducerProfiles(bundle, errors);
  validateDco(bundle, errors);
  validateSemanticChecks(bundle, registry, producers, errors);
  validateProofCells(bundle, producers, errors);
  return {
    ok: errors.length === 0,
    state: errors.length === 0 ? 'VALIDATION_EVIDENCE_CURRENT' : 'VALIDATION_EVIDENCE_BLOCKED',
    currentness: errors.length === 0 ? 'CURRENT' : 'BLOCKED',
    profile,
    errors
  };
}

export function validateBuildHealthRegistry(registry, reviewLenses) {
  const errors = [];
  if (!registry?.registryRef) errors.push('build health registry missing registryRef');
  errors.push(...validateCheckResultContract(registry?.checkResultContract).errors);
  const lensRefs = new Set((reviewLenses?.lenses ?? []).map((item) => item.lensRef));
  const checkRefs = new Set();
  const commands = new Set();
  for (const check of registry?.checks ?? []) {
    if (!check.checkRef) errors.push('health check missing checkRef');
    else if (checkRefs.has(check.checkRef)) errors.push(`duplicate health check ${check.checkRef}`);
    else checkRefs.add(check.checkRef);
    if (!check.command) errors.push(`${check.checkRef ?? 'unknown check'} missing command`);
    else if (commands.has(check.command)) errors.push(`duplicate health command ${check.command}`);
    else commands.add(check.command);
    if (!check.purpose) errors.push(`${check.checkRef ?? 'unknown check'} missing purpose`);
    for (const lensRef of check.lensRefs ?? []) if (!lensRefs.has(lensRef)) errors.push(`${check.checkRef} references missing lens ${lensRef}`);
  }
  return { ok: errors.length === 0, errors, stats: { checks: checkRefs.size } };
}

export function deriveRepositoryHealth({ sourceTreeRef, blueprintHash, checkResults = [], previousProjection = null } = {}) {
  const stateOf = (item) => item.semanticState ?? item.state;
  const failed = checkResults.filter((item) => stateOf(item) === 'FAILED' || stateOf(item) === 'BLOCKED');
  const passedCurrent = checkResults.filter((item) =>
    stateOf(item) === 'PASSED' &&
    item.transportState !== 'SPAWN_FAILED' &&
    item.transportState !== 'TIMED_OUT' &&
    item.executed === true &&
    item.currentness === 'CURRENT'
  );
  const unresolved = checkResults.filter((item) => !failed.includes(item) && !passedCurrent.includes(item));
  const state = failed.length ? 'BLOCKED' : checkResults.length > 0 && unresolved.length === 0 ? 'HEALTHY' : 'ATTENTION';
  const semantic = {
    sourceTreeRef,
    blueprintHash,
    state,
    checks: checkResults.map(({ checkRef, state, semanticState = state, transportState = null, detailRef = null, executed = false, currentness = 'UNKNOWN' }) => ({
      checkRef, semanticState, transportState, detailRef, executed, currentness
    })).sort((a, b) => a.checkRef.localeCompare(b.checkRef))
  };
  const projection = {
    schemaVersion: 'vexlife.repository-health/v0',
    ...semantic,
    blockingCheckRefs: failed.map((item) => item.checkRef).sort(),
    unresolvedCheckRefs: unresolved.map((item) => item.checkRef).sort(),
    executedCurrentCheckRefs: passedCurrent.map((item) => item.checkRef).sort(),
    receiptSummary: {
      total: checkResults.length,
      executedCurrentPassed: passedCurrent.length,
      unresolved: unresolved.length,
      failed: failed.length
    },
    semanticHash: semanticHash(semantic)
  };
  return {
    projection,
    changed: previousProjection?.semanticHash !== projection.semanticHash
  };
}

export function compactCurrentProjection(bundle, validation) {
  return {
    schemaVersion: 'vexlife.current-foundation/v0',
    productRef: bundle.blueprint.product.productRef,
    blueprintRef: bundle.blueprint.blueprintRef,
    version: bundle.blueprint.version,
    contractVersion: bundle.blueprint.contractVersion,
    blueprintState: validation.ok ? 'VALID' : 'INVALID',
    blueprintHash: validation.semanticHash,
    features: bundle.featureRegistry?.features?.length ?? 0,
    reviewLenses: bundle.reviewLenses?.lenses?.length ?? 0,
    healthChecks: bundle.buildHealth?.checks?.length ?? 0,
    bridgeState: bundle.bridge?.bridgeRef ? 'CONTRACT_REGISTERED' : 'NOT_REGISTERED',
    platforms: (bundle.blueprint.platforms ?? []).map((item) => ({ platformRef: item.platformRef, supportState: item.supportState })),
    heldBoundaries: [
      'no model artifacts in Git',
      'no public publication without human confirmation and review',
      'no platform conformance from generated scaffold alone',
      'no remote surface write authority outside Home Bridge capability lease',
      'no silent identity substitution between remote Home and local sibling'
    ]
  };
}

// [VXG RealForever]
