import crypto from 'node:crypto';
import { semanticHash } from './utils.mjs';
import { validateCheckResultContract } from './check-result.mjs';

const SHA1 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const CURRENTNESS = new Set(['CURRENT', 'STALE', 'UNKNOWN', 'BLOCKED']);
const TRANSPORT = new Set(['EXECUTED', 'NOT_RUN', 'SPAWN_FAILED', 'TIMED_OUT', 'PROVIDER_UNAVAILABLE']);
const SEMANTIC = new Set(['PASSED', 'ATTENTION', 'NOT_RUN', 'UNKNOWN', 'STALE', 'BLOCKED', 'FAILED']);

export function validateBuildHealthRegistry(registry, reviewLenses) {
  const errors = [];
  if (!registry?.registryRef) errors.push('build health registry missing registryRef');
  errors.push(...validateCheckResultContract(registry?.checkResultContract).errors);
  errors.push(...validateValidationEvidencePolicy(registry?.validationEvidencePolicy).errors);
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

export function validateValidationEvidencePolicy(policy) {
  const errors = [];
  if (policy?.schemaVersion !== 'vexlife.validation-evidence-policy/v1') errors.push('validation evidence policy schemaVersion must be vexlife.validation-evidence-policy/v1');
  if (!policy?.policyRef) errors.push('validation evidence policy missing policyRef');
  if (!Number.isInteger(policy?.policyVersion) || policy.policyVersion < 1) errors.push('validation evidence policy version must be a positive integer');
  if (policy?.evidenceSchemaVersion !== 'vexlife.validation-evidence-bundle/v1') errors.push('validation evidence policy has unsupported evidenceSchemaVersion');
  if (policy?.semanticProofOwnerRef !== 'registry.vexlife.build-health.001') errors.push('validation semantic proof owner must remain Build Health');
  const producerClasses = new Set(Object.keys(policy?.producerProfiles ?? {}));
  if (!producerClasses.has('GITHUB_HOSTED') || !producerClasses.has('ONE_SHOT_LOCAL')) errors.push('validation evidence policy must define GITHUB_HOSTED and ONE_SHOT_LOCAL producer profiles');
  const profileRefs = new Set();
  for (const [producerClass, profile] of Object.entries(policy?.producerProfiles ?? {})) {
    if (!profile?.producerProfileRef) errors.push(`${producerClass} producer profile missing producerProfileRef`);
    else if (profileRefs.has(profile.producerProfileRef)) errors.push(`duplicate producerProfileRef ${profile.producerProfileRef}`);
    else profileRefs.add(profile.producerProfileRef);
    if (profile?.producerClass !== producerClass) errors.push(`${producerClass} producer profile class mismatch`);
  }
  const proofCellRefs = new Set();
  for (const cell of policy?.requiredProofCells ?? []) {
    if (!cell?.proofCellRef) errors.push('validation proof cell missing proofCellRef');
    else if (proofCellRefs.has(cell.proofCellRef)) errors.push(`duplicate validation proof cell ${cell.proofCellRef}`);
    else proofCellRefs.add(cell.proofCellRef);
    if (cell?.requiredPlatformId !== null && typeof cell?.requiredPlatformId !== 'string') errors.push(`${cell?.proofCellRef ?? 'unknown proof cell'} has invalid requiredPlatformId`);
  }
  if (proofCellRefs.size === 0) errors.push('validation evidence policy requires proof cells');
  return { ok: errors.length === 0, errors, stats: { producerProfiles: producerClasses.size, proofCells: proofCellRefs.size } };
}

function sha256Text(content, encoding = 'UTF8') {
  const bytes = encoding === 'BASE64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function semanticEvidence(bundle) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return bundle;
  const { semanticFingerprint, ...semantic } = bundle;
  return semantic;
}

export function computeValidationEvidenceFingerprint(bundle) {
  return semanticHash(semanticEvidence(bundle));
}

function indexDigestArtifacts(items, kind, errors) {
  const index = new Map();
  for (const item of items ?? []) {
    const ref = item?.ref;
    if (!ref) {
      errors.push(`${kind} digest entry missing ref`);
      continue;
    }
    if (index.has(ref)) {
      errors.push(`duplicate ${kind} digest ref ${ref}`);
      continue;
    }
    if (!SHA256.test(item?.sha256 ?? '')) errors.push(`${kind} ${ref} has invalid sha256`);
    if (typeof item?.content !== 'string') errors.push(`${kind} ${ref} missing content`);
    else if (SHA256.test(item?.sha256 ?? '') && sha256Text(item.content, item.encoding ?? 'UTF8') !== item.sha256) errors.push(`${kind} ${ref} digest mismatch`);
    if (!['UTF8', 'BASE64'].includes(item?.encoding ?? 'UTF8')) errors.push(`${kind} ${ref} has unsupported encoding`);
    index.set(ref, item);
  }
  return index;
}

function validateExactBinding(binding, bundle, proofCellRef, errors) {
  const expected = {
    repositoryRef: bundle.repositoryRef,
    baseSha: bundle.baseSha,
    candidateHeadSha: bundle.candidateHeadSha,
    candidateTreeSha: bundle.candidateTreeSha,
    sourceTreeSha256: bundle.sourceTreeSha256
  };
  for (const [field, value] of Object.entries(expected)) {
    if (binding?.[field] !== value) errors.push(`${proofCellRef} ${field} binding mismatch`);
  }
}

function validateDco(bundle, errors) {
  const commits = bundle?.candidateCommits ?? [];
  const evidence = bundle?.dcoCommitEvidence ?? [];
  if (commits.length === 0) errors.push('candidate commit graph is empty');
  const bySha = new Map(evidence.map((item) => [item?.commitSha, item]));
  for (const commit of commits) {
    if (!SHA1.test(commit?.commitSha ?? '')) {
      errors.push('candidate commit has invalid commitSha');
      continue;
    }
    const item = bySha.get(commit.commitSha);
    if (!item) {
      errors.push(`missing DCO evidence for ${commit.commitSha}`);
      continue;
    }
    if (item.inspected !== true || item.state !== 'PASSED') errors.push(`DCO evidence not passed for ${commit.commitSha}`);
    if (item.authorName !== commit.authorName || item.authorEmail !== commit.authorEmail) errors.push(`DCO author binding mismatch for ${commit.commitSha}`);
    if (item.signoffName !== commit.authorName || item.signoffEmail !== commit.authorEmail) errors.push(`DCO signoff mismatch for ${commit.commitSha}`);
  }
  for (const item of evidence) if (!commits.some((commit) => commit.commitSha === item?.commitSha)) errors.push(`DCO evidence references non-candidate commit ${item?.commitSha ?? 'UNKNOWN'}`);
}

export function validateValidationEvidenceBundle(bundle, policy, expectedTarget = {}) {
  const errors = [];
  const policyValidation = validateValidationEvidencePolicy(policy);
  errors.push(...policyValidation.errors);
  if (bundle?.schemaVersion !== policy?.evidenceSchemaVersion) errors.push('validation evidence bundle has unknown schema/version');
  if (!bundle?.validationEvidenceRef) errors.push('validation evidence bundle missing validationEvidenceRef');
  if (bundle?.validationProfileRef !== policy?.policyRef) errors.push('validationProfileRef mismatch');
  if (bundle?.validationProfileVersion !== policy?.policyVersion) errors.push('validationProfileVersion mismatch');
  if (!SHA1.test(bundle?.baseSha ?? '')) errors.push('validation evidence baseSha invalid');
  if (!SHA1.test(bundle?.candidateHeadSha ?? '')) errors.push('validation evidence candidateHeadSha invalid');
  if (!SHA1.test(bundle?.candidateTreeSha ?? '')) errors.push('validation evidence candidateTreeSha invalid');
  if (!SHA1.test(bundle?.testedCheckoutSha ?? '')) errors.push('validation evidence testedCheckoutSha invalid');
  if (bundle?.testedMergeSha !== null && !SHA1.test(bundle?.testedMergeSha ?? '')) errors.push('validation evidence testedMergeSha invalid');
  if (!SHA256.test(bundle?.sourceTreeSha256 ?? '')) errors.push('validation evidence sourceTreeSha256 invalid');
  if (bundle?.currentness !== 'CURRENT') errors.push('validation evidence bundle is not CURRENT');
  if (bundle?.testedCheckoutSha !== bundle?.candidateHeadSha) errors.push('tested checkout is not exact candidate head');
  if (bundle?.observedHeadSha !== bundle?.candidateHeadSha) errors.push('head moved after evidence binding');
  const formedAt = Date.parse(bundle?.formedAt ?? '');
  const observedAt = Date.parse(bundle?.observedAt ?? '');
  if (!Number.isFinite(formedAt) || !Number.isFinite(observedAt) || observedAt < formedAt) errors.push('validation evidence timestamps invalid');

  for (const field of ['repositoryRef', 'baseSha', 'candidateHeadSha', 'candidateTreeSha', 'sourceTreeSha256']) {
    if (!expectedTarget?.[field]) errors.push(`external expected target missing ${field}`);
    else if (bundle?.[field] !== expectedTarget[field]) errors.push(`wrong ${field}`);
  }
  if (expectedTarget?.observedHeadSha && bundle?.candidateHeadSha !== expectedTarget.observedHeadSha) errors.push('head moved relative to external observation');

  const receiptIndex = indexDigestArtifacts(bundle?.receiptDigests, 'receipt', errors);
  const logIndex = indexDigestArtifacts(bundle?.logDigests, 'log', errors);
  const declaredReceiptRefs = new Set(bundle?.receiptRefs ?? []);
  if (declaredReceiptRefs.size !== (bundle?.receiptRefs ?? []).length) errors.push('duplicate receiptRefs');
  for (const ref of declaredReceiptRefs) if (!receiptIndex.has(ref)) errors.push(`receipt ref missing digest/content ${ref}`);

  validateDco(bundle, errors);

  for (const dependency of bundle?.dependencyBindings ?? []) {
    if (!dependency?.dependencyRef) errors.push('dependency binding missing dependencyRef');
    if (!CURRENTNESS.has(dependency?.currentness ?? '')) errors.push(`${dependency?.dependencyRef ?? 'dependency'} has invalid currentness`);
    if (dependency?.dependencyClass === 'EWA_CURRENTNESS' && dependency?.grantsExecutionAuthority !== false) errors.push('EWA currentness cannot grant execution authority');
  }

  const policyCells = new Map((policy?.requiredProofCells ?? []).map((cell) => [cell.proofCellRef, cell]));
  const satisfyingCells = new Map();
  const producers = bundle?.producerAttestations ?? [];
  if (producers.length === 0) errors.push('validation evidence bundle missing producer attestations');

  for (const producer of producers) {
    const profile = policy?.producerProfiles?.[producer?.producerClass];
    if (!profile) {
      errors.push(`unknown producer class ${producer?.producerClass ?? 'UNKNOWN'}`);
      continue;
    }
    if (producer?.producerProfileRef !== profile.producerProfileRef) errors.push(`${producer.producerClass} producer profile mismatch`);
    if (!producer?.providerIdentityRef) errors.push(`${producer.producerClass} missing providerIdentityRef`);
    if (producer?.qualification?.providerIdentityRef !== producer?.providerIdentityRef) errors.push(`${producer.producerClass} wrong provider binding`);
    if (producer?.qualification?.platformId !== producer?.platformId) errors.push(`${producer.producerClass} qualification platform mismatch`);
    if (producer?.qualification?.currentness !== 'CURRENT') errors.push(`${producer.producerClass} producer qualification is stale`);
    const qualifiedAt = Date.parse(producer?.qualification?.observedAt ?? '');
    const expiresAt = producer?.qualification?.expiresAt === null ? null : Date.parse(producer?.qualification?.expiresAt ?? '');
    if (!Number.isFinite(qualifiedAt) || (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt < observedAt))) errors.push(`${producer.producerClass} producer qualification is not current at observation`);
    if (!Array.isArray(producer?.qualificationEvidenceRefs) || producer.qualificationEvidenceRefs.length === 0) errors.push(`${producer.producerClass} missing qualificationEvidenceRefs`);
    if (!producer?.platformId || !producer?.architecture || !producer?.runtimeVersions || typeof producer.runtimeVersions !== 'object') errors.push(`${producer.producerClass} missing platform/runtime identity`);
    if (!producer?.qualificationReceiptRef || !receiptIndex.has(producer.qualificationReceiptRef)) {
      errors.push(`${producer.producerClass} qualification receipt is not integrity-bound`);
    } else if (producer?.qualificationReceiptDigest !== receiptIndex.get(producer.qualificationReceiptRef).sha256) {
      errors.push(`${producer.producerClass} qualification receipt digest mismatch`);
    }
    if (producer.producerClass === 'ONE_SHOT_LOCAL' && (producer?.statusContext ?? null) !== null) errors.push('local evidence cannot represent a GitHub status context');

    for (const result of producer?.commandResults ?? []) {
      const cell = policyCells.get(result?.proofCellRef);
      if (!cell) {
        errors.push(`unknown proof cell ${result?.proofCellRef ?? 'UNKNOWN'}`);
        continue;
      }
      if (!TRANSPORT.has(result?.transportState)) errors.push(`${result.proofCellRef} invalid transportState`);
      if (!SEMANTIC.has(result?.semanticState)) errors.push(`${result.proofCellRef} invalid semanticState`);
      if (result?.platformId !== producer?.platformId) errors.push(`${result.proofCellRef} platform impersonation/mismatch`);
      if (cell.requiredPlatformId !== null && result?.platformId !== cell.requiredPlatformId) errors.push(`${result.proofCellRef} requires platform ${cell.requiredPlatformId}`);
      validateExactBinding(result?.binding, bundle, result.proofCellRef, errors);
      for (const ref of result?.receiptRefs ?? []) if (!receiptIndex.has(ref) || !declaredReceiptRefs.has(ref)) errors.push(`${result.proofCellRef} receipt ${ref} not integrity-bound`);
      for (const ref of result?.logRefs ?? []) if (!logIndex.has(ref)) errors.push(`${result.proofCellRef} log ${ref} not integrity-bound`);
      if (producer.producerClass === 'ONE_SHOT_LOCAL' && (result?.statusContext ?? null) !== null) errors.push(`${result.proofCellRef} local evidence represented as GitHub status context`);
      const disposition = result?.evidenceDisposition ?? 'EXECUTED';
      if (!(policy?.evidenceDispositions ?? ['EXECUTED']).includes(disposition)) errors.push(`${result.proofCellRef} invalid evidenceDisposition`);
      let satisfied = false;
      if (disposition === 'EXECUTED') {
        satisfied = result?.transportState === 'EXECUTED' && result?.executed === true && result?.exitCode === 0 && result?.semanticState === 'PASSED' && result?.currentness === 'CURRENT';
        if (result?.semanticState === 'PASSED' && !satisfied) errors.push(`${result.proofCellRef} semantic PASS is not backed by executed current success`);
      } else if (disposition === 'REUSED') {
        if (cell.reuseAllowed !== true) errors.push(`${result.proofCellRef} may not be satisfied by reused evidence`);
        if (result?.transportState !== 'NOT_RUN' || result?.executed !== false || result?.exitCode !== null) errors.push(`${result.proofCellRef} REUSED evidence must be non-executed NOT_RUN`);
        if (result?.semanticState !== 'PASSED' || result?.currentness !== 'CURRENT') errors.push(`${result.proofCellRef} REUSED evidence must remain PASSED and CURRENT`);
        if (result?.reuseDisposition !== policy?.reuseContract?.acceptedDisposition) errors.push(`${result.proofCellRef} reused evidence lacks accepted REUSE disposition`);
        if (!result?.acceptedEvidenceRef || !receiptIndex.has(result.acceptedEvidenceRef)) errors.push(`${result.proofCellRef} reused accepted evidence is not integrity-bound`);
        if (!result?.currentnessReceiptRef || !receiptIndex.has(result.currentnessReceiptRef)) {
          errors.push(`${result.proofCellRef} currentness receipt is not integrity-bound`);
        } else if (result?.currentnessReceiptDigest !== receiptIndex.get(result.currentnessReceiptRef).sha256) {
          errors.push(`${result.proofCellRef} currentness receipt digest mismatch`);
        }
        const bindings = result?.dependencyBindings ?? [];
        if (!Array.isArray(bindings) || bindings.length === 0) errors.push(`${result.proofCellRef} reused evidence missing dependencyBindings`);
        let dependencyMatch = Array.isArray(bindings) && bindings.length > 0;
        for (const binding of bindings) {
          if (!binding?.sourceRef || !SHA256.test(binding?.expectedFingerprint ?? '') || !SHA256.test(binding?.observedFingerprint ?? '') || binding.expectedFingerprint !== binding.observedFingerprint) {
            dependencyMatch = false;
            errors.push(`${result.proofCellRef} has non-matching dependency binding`);
          }
          if (binding?.dependencyClass === 'EWA_CURRENTNESS' && binding?.grantsExecutionAuthority !== false) {
            dependencyMatch = false;
            errors.push('EWA currentness cannot grant execution authority');
          }
        }
        satisfied = cell.reuseAllowed === true && result?.transportState === 'NOT_RUN' && result?.executed === false && result?.exitCode === null &&
          result?.semanticState === 'PASSED' && result?.currentness === 'CURRENT' && result?.reuseDisposition === policy?.reuseContract?.acceptedDisposition &&
          Boolean(result?.acceptedEvidenceRef && receiptIndex.has(result.acceptedEvidenceRef)) &&
          Boolean(result?.currentnessReceiptRef && receiptIndex.has(result.currentnessReceiptRef) && result.currentnessReceiptDigest === receiptIndex.get(result.currentnessReceiptRef).sha256) && dependencyMatch;
      }
      if (satisfied) {
        if (satisfyingCells.has(result.proofCellRef)) errors.push(`proof cell ${result.proofCellRef} has multiple satisfying producers`);
        else satisfyingCells.set(result.proofCellRef, { producerClass: producer.producerClass, providerIdentityRef: producer.providerIdentityRef, platformId: producer.platformId, evidenceDisposition: disposition });
      }
    }
  }

  for (const cellRef of policyCells.keys()) if (!satisfyingCells.has(cellRef)) errors.push(`required proof cell omitted or not satisfied: ${cellRef}`);
  if (bundle?.semanticFingerprint !== computeValidationEvidenceFingerprint(bundle)) errors.push('validation evidence semanticFingerprint mismatch');

  return {
    ok: errors.length === 0,
    errors,
    stats: {
      requiredProofCells: policyCells.size,
      satisfiedProofCells: satisfyingCells.size,
      producerAttestations: producers.length,
      receipts: receiptIndex.size,
      logs: logIndex.size,
      candidateCommits: (bundle?.candidateCommits ?? []).length
    },
    satisfiedProofCells: Object.fromEntries([...satisfyingCells.entries()].sort(([a], [b]) => a.localeCompare(b)))
  };
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
