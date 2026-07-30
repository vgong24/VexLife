import { semanticHash } from './utils.mjs';

export function validateBuildHealthRegistry(registry, reviewLenses) {
  const errors = [];
  if (!registry?.registryRef) errors.push('build health registry missing registryRef');
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
  const failed = checkResults.filter((item) => item.state === 'FAILED' || item.state === 'BLOCKED');
  const unknown = checkResults.filter((item) => item.state === 'UNKNOWN');
  const state = failed.length ? 'BLOCKED' : unknown.length ? 'ATTENTION' : 'HEALTHY';
  const semantic = {
    sourceTreeRef,
    blueprintHash,
    state,
    checks: checkResults.map(({ checkRef, state, detailRef = null }) => ({ checkRef, state, detailRef })).sort((a, b) => a.checkRef.localeCompare(b.checkRef))
  };
  const projection = {
    schemaVersion: 'vexlife.repository-health/v0',
    ...semantic,
    blockingCheckRefs: failed.map((item) => item.checkRef).sort(),
    unknownCheckRefs: unknown.map((item) => item.checkRef).sort(),
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
