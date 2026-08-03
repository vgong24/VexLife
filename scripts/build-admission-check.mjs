#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertDisposableRepositoryControlClean, collectDisposableRepositoryEvidence, collectRepositoryEvidence, resolveDisposableRepositoryPath, runBoundedGit } from '../src/core/repository-evidence.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const DISPOSABLE_REPOSITORY_MARKER = '.vexlife-disposable-repository.json';
const BUILD_ADMISSION_AUTHOR = 'VexLife Build Admission Adapter';
const BUILD_ADMISSION_EMAIL = 'vexlife-build-admission@users.noreply.github.com';

function freezeBuildAdmissionEvidence(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeBuildAdmissionEvidence(child);
  return Object.freeze(value);
}

function emptyHookDomain(workspaceRoot) {
  const directory = path.join(fs.realpathSync.native(workspaceRoot), '.vexlife-build-admission-empty-hooks');
  if (fs.existsSync(directory)) {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || fs.readdirSync(directory).length !== 0) {
      throw new Error('source-managed empty hook domain is not exact and empty');
    }
  } else fs.mkdirSync(directory);
  return directory;
}

function runDisposableGit(root, args, label, env = {}, hooksPath = null) {
  const workspaceRoot = path.dirname(root);
  return runBoundedGit(root, args, {
    label,
    env,
    hooksPath: hooksPath ?? emptyHookDomain(workspaceRoot)
  }).stdout.trim();
}

export function safeRemoveDisposableRepository(workspaceRoot, repositoryPath) {
  const resolved = resolveDisposableRepositoryPath(workspaceRoot, repositoryPath);
  const markerPath = path.join(resolved.canonicalRepository, DISPOSABLE_REPOSITORY_MARKER);
  if (!fs.existsSync(markerPath)) throw new Error('disposable repository marker is missing');
  const markerValue = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  if (markerValue.schemaVersion !== 'vexlife.disposable-repository-marker/v1' || markerValue.disposable !== true) {
    throw new Error('disposable repository marker is invalid');
  }
  fs.rmSync(resolved.canonicalRepository, { recursive: true, force: false });
  if (fs.existsSync(resolved.canonicalRepository)) throw new Error('disposable repository removal did not complete');
  return resolved;
}

function buildAdmissionLedgerDirectory(workspaceRoot, registry) {
  const root = fs.realpathSync.native(workspaceRoot);
  const directory = path.join(root, registry.adapter.ledgerDirectoryName);
  if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) {
    throw new Error('build-admission ledger must not be a symbolic link');
  }
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

export function buildAdmissionLedgerPath(workspaceRoot, registry, requestFingerprint) {
  if (!/^[a-f0-9]{64}$/.test(requestFingerprint ?? '')) {
    throw new Error('request fingerprint must be lowercase SHA-256');
  }
  return path.join(buildAdmissionLedgerDirectory(workspaceRoot, registry), `${requestFingerprint}.json`);
}

export function buildAdmissionAdapterSourceHash(registry) {
  const adapter = registry.adapter;
  return semanticHash({
    adapterRef: adapter.adapterRef,
    sourceRef: adapter.sourceRef,
    formationRef: adapter.formationRef,
    effectScope: adapter.effectScope,
    typedCommandRefs: adapter.typedCommandRefs,
    forbiddenGitOperations: adapter.forbiddenGitOperations,
    networkUsed: adapter.networkUsed,
    remoteConfigured: adapter.remoteConfigured,
    arbitraryShellAllowed: adapter.arbitraryShellAllowed,
    implementationCheckoutAllowed: adapter.implementationCheckoutAllowed,
    cleanupMayTraverseParent: adapter.cleanupMayTraverseParent,
    hooksDisabled: adapter.hooksDisabled,
    globalConfigIgnored: adapter.globalConfigIgnored,
    ignoredMaterialAllowed: adapter.ignoredMaterialAllowed,
    nestedGitControlAllowed: adapter.nestedGitControlAllowed,
    symlinkMaterialAllowed: adapter.symlinkMaterialAllowed,
    identityActionRefs: adapter.identityActionRefs,
    identityPermissionRefs: adapter.identityPermissionRefs,
    identityCapabilityRefs: adapter.identityCapabilityRefs,
    identityProcessRefs: adapter.identityProcessRefs
  });
}

export function formBuildRecoveryReceipt({
  phase,
  disposition,
  request,
  admission,
  repositoryEvidence,
  error,
  formedAt,
  completedAt,
  rollbackAttempted,
  rollbackSucceeded,
  humanAttentionRequired
}) {
  const core = {
    schemaVersion: 'vexlife.build-recovery-receipt/v1',
    contractRef: 'contract.vexlife.build-recovery/v1',
    failurePhase: phase,
    disposition,
    buildRequestRef: request.buildRequestRef,
    buildRequestFingerprint: request.semanticFingerprint,
    buildAdmissionRef: admission.buildAdmissionRef,
    buildAdmissionFingerprint: admission.semanticFingerprint,
    repositoryEvidenceRef: repositoryEvidence?.repositoryEvidenceRef ?? request.repositoryEvidenceRef,
    repositoryEvidenceFingerprint: repositoryEvidence?.semanticFingerprint ?? request.repositoryEvidenceFingerprint,
    errorClass: error?.name ?? 'Error',
    errorFingerprint: semanticHash({ phase, message: error?.message ?? String(error) }),
    rollbackAttempted,
    rollbackSucceeded,
    retryAuthorityGranted: false,
    concernWatchObservationRequired: true,
    humanAttentionRequired,
    formedAt,
    completedAt
  };
  const semanticFingerprint = semanticHash(core);
  return freezeBuildAdmissionEvidence({
    ...core,
    buildRecoveryRef: `recovery.build-admission.${semanticFingerprint.slice(0, 24)}`,
    semanticFingerprint
  });
}

export function prepareDisposableGitRepository({
  workspaceRoot,
  repositoryName,
  mutationPath,
  baselineContent,
  baselineBranch = 'fixture-baseline',
  formedAt = '2026-08-03T00:00:00.000Z'
}, { registry }) {
  if (!registry || registry.schemaVersion !== 'vexlife.build-admission-registry/v1') {
    throw new Error('Build Admission registry is invalid');
  }
  if (!/^[A-Za-z0-9._-]+$/.test(repositoryName ?? '') || ['.', '..'].includes(repositoryName)) {
    throw new Error('repositoryName must be one safe path segment');
  }
  const date = new Date(formedAt);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== formedAt) {
    throw new Error('baseline formedAt must be canonical ISO');
  }
  const safePath = mutationPath?.replaceAll('\\', '/');
  if (!safePath || safePath !== registry.adapter.fixturePath || safePath.startsWith('/') || safePath.split('/').includes('..')) {
    throw new Error('mutationPath is outside the registered fixture path');
  }
  if (registry.adapter.protectedBranches.includes(baselineBranch)) throw new Error('baseline branch is protected');
  const workspace = fs.realpathSync.native(workspaceRoot);
  const repositoryPath = path.join(workspace, repositoryName);
  if (fs.existsSync(repositoryPath)) throw new Error('disposable repository path already exists');
  fs.mkdirSync(repositoryPath);
  const markerValue = {
    schemaVersion: 'vexlife.disposable-repository-marker/v1',
    disposable: true,
    repositoryName,
    mutationPath: safePath,
    formedAt
  };
  fs.writeFileSync(path.join(repositoryPath, DISPOSABLE_REPOSITORY_MARKER), `${JSON.stringify(markerValue, null, 2)}\n`, 'utf8');
  const target = path.join(repositoryPath, ...safePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, baselineContent, 'utf8');
  runDisposableGit(repositoryPath, ['init'], 'Git init');
  runDisposableGit(repositoryPath, ['branch', '-M', baselineBranch], 'Git baseline branch');
  runDisposableGit(repositoryPath, ['config', 'user.name', BUILD_ADMISSION_AUTHOR], 'Git local user name');
  runDisposableGit(repositoryPath, ['config', 'user.email', BUILD_ADMISSION_EMAIL], 'Git local user email');
  assertDisposableRepositoryControlClean(workspace, repositoryPath);
  runDisposableGit(repositoryPath, ['add', '--', DISPOSABLE_REPOSITORY_MARKER, safePath], 'Git baseline exact add');
  runDisposableGit(
    repositoryPath,
    ['commit', '-m', 'Establish disposable build-admission baseline', '-m', `Signed-off-by: ${BUILD_ADMISSION_AUTHOR} <${BUILD_ADMISSION_EMAIL}>`],
    'Git baseline commit',
    { GIT_AUTHOR_DATE: formedAt, GIT_COMMITTER_DATE: formedAt }
  );
  assertDisposableRepositoryControlClean(workspace, repositoryPath);
  const evidence = collectDisposableRepositoryEvidence(workspace, repositoryPath, { mutationPath: safePath });
  if (evidence.workingTree !== 'CLEAN' || evidence.remoteConfigured) {
    throw new Error('disposable baseline is not clean and remote-free');
  }
  return freezeBuildAdmissionEvidence({ repositoryPath, repositoryEvidence: evidence });
}

export function cleanupDisposableGitRepository({ workspaceRoot, repositoryPath, requestFingerprint }, { registry }) {
  const resolved = safeRemoveDisposableRepository(workspaceRoot, repositoryPath);
  const receiptPath = buildAdmissionLedgerPath(workspaceRoot, registry, requestFingerprint);
  if (fs.existsSync(receiptPath)) fs.rmSync(receiptPath, { force: false });
  return freezeBuildAdmissionEvidence({
    schemaVersion: 'vexlife.disposable-repository-cleanup/v1',
    repositoryCanonicalPathHash: crypto.createHash('sha256').update(resolved.canonicalRepository).digest('hex'),
    repositoryRemoved: true,
    ledgerRemoved: !fs.existsSync(receiptPath),
    parentTraversal: false
  });
}

function integratedReceiptFromStored(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const receipt = structuredClone(value);
  delete receipt.prReadyConsumptionReceipt;
  delete receipt.healthConsumptionReceipt;
  return receipt;
}

async function runDirectBuildAdmissionCheck() {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (process.argv.length !== 2) {
    console.error('Usage: npm run build-admission:check');
    process.exit(2);
  }
  const [
    { createBuildAuthorityContext, validateBuildAdmissionRegistry, validateIntegratedBuildAdmissionReceipt },
    { loadBlueprint, validateBlueprint }, { buildSourceManifest },
    { readJson }, { runBuildAdmissionSimulation }
  ] = await Promise.all([
    import('../src/core/build-admission.mjs'), import('../src/core/blueprint.mjs'), import('../src/core/source-manifest.mjs'),
    import('../src/core/utils.mjs'), import('./build-admission-simulate.mjs')
  ]);
  try {
    const bundle = loadBlueprint(ROOT);
    const registry = bundle.blueprint.buildAdmission;
    const trustSnapshot = readJson(path.join(ROOT, 'blueprint/intent-trust-snapshot.json'));
    const authorityContext = createBuildAuthorityContext(bundle, trustSnapshot);
    const manifest = buildSourceManifest(ROOT);
    const repository = collectRepositoryEvidence(ROOT);
    const blueprint = validateBlueprint(bundle);
    const registryValidation = validateBuildAdmissionRegistry(registry);
    if (!registryValidation.ok || !blueprint.ok || manifest.candidate.state !== 'CURRENT') {
      throw new Error([...registryValidation.errors, ...blueprint.errors, ...(manifest.candidate.blockers ?? []).map((item) => JSON.stringify(item))].join('; '));
    }
    const receipt = integratedReceiptFromStored(runBuildAdmissionSimulation({ root: ROOT, receiptPath: registry.simulationContract.receiptPath, suffix: 'canonical' }).integrated);
    const validation = validateIntegratedBuildAdmissionReceipt(receipt, { registry, authorityContext });
    const exactCurrent = validation.ok && receipt.sourceTreeSha256 === manifest.treeSha256 && receipt.blueprintHash === blueprint.semanticHash &&
      receipt.candidateHeadSha === repository.git.candidateHeadSha && receipt.testedCheckoutSha === repository.git.checkoutSha &&
      receipt.testedMergeSha === repository.git.testedMergeSha && receipt.baseSha === repository.git.baseSha;
    if (!exactCurrent) throw new Error(`Build Admission receipt is not exact-current: ${validation.errors.join('; ')}`);
    console.log(JSON.stringify({
      state: 'BUILD_ADMISSION_CURRENT', currentness: 'CURRENT', receiptPath: registry.simulationContract.receiptPath,
      receiptRef: receipt.receiptRef, semanticFingerprint: receipt.semanticFingerprint, sourceTreeSha256: receipt.sourceTreeSha256,
      blueprintHash: receipt.blueprintHash, candidateHeadSha: receipt.candidateHeadSha, testedCheckoutSha: receipt.testedCheckoutSha,
      testedMergeSha: receipt.testedMergeSha, baseSha: receipt.baseSha, commitSha: receipt.commitSha,
      commitTreeSha: receipt.commitTreeSha, changedPaths: receipt.changedPaths, proofRefs: receipt.proofRefs
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ state: 'BUILD_ADMISSION_INVALID', currentness: 'UNKNOWN', error: error.message }, null, 2));
    process.exit(1);
  }
}

const direct = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  setImmediate(() => {
    runDirectBuildAdmissionCheck().catch((error) => {
      console.error(JSON.stringify({ state: 'BUILD_ADMISSION_INVALID', currentness: 'UNKNOWN', error: error.message }, null, 2));
      process.exitCode = 1;
    });
  });
}

// [VXG RealForever]
