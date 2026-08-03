import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { semanticHash } from './utils.mjs';

function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function runGit(root, args, label = args.join(' ')) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: ''
    },
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed: ${result.error?.message ?? result.stderr?.trim() ?? `exit ${result.status}`}`);
  }
  return result.stdout.trim();
}

export function collectRepositoryEvidence(root, environment = process.env) {
  const checkoutSha = git(root, 'rev-parse', 'HEAD');
  const localBranch = git(root, 'branch', '--show-current');
  const parents = (git(root, 'rev-list', '--parents', '-n', '1', 'HEAD') ?? '').split(/\s+/).filter(Boolean).slice(1);
  const detached = !localBranch;
  const syntheticMerge = detached && parents.length === 2;
  const branch = localBranch || environment.VEXLIFE_BRANCH || null;
  const upstreamRef = git(root, 'rev-parse', '--abbrev-ref', '@{upstream}');
  const upstreamSha = upstreamRef ? git(root, 'rev-parse', '@{upstream}') : null;
  const relation = upstreamRef ? git(root, 'rev-list', '--left-right', '--count', `HEAD...${upstreamRef}`) : null;
  const [ahead, behind] = relation ? relation.split(/\s+/).map(Number) : [null, null];
  const statusLines = (git(root, 'status', '--porcelain=v1') || '').split(/\r?\n/).filter(Boolean);
  const remoteUrl = git(root, 'remote', 'get-url', 'origin');
  const remoteSlug = remoteUrl?.replace(/^.*github\.com[/:]/, '').replace(/\.git$/, '') ?? null;
  const primaryRemoteRef = environment.VEXLIFE_PRIMARY_REMOTE_REF || 'origin/main';
  const mergeBase = checkoutSha ? git(root, 'merge-base', checkoutSha, primaryRemoteRef) : null;

  return {
    repository: { remoteUrl, slug: remoteSlug },
    git: {
      checkoutSha,
      branch,
      branchSource: localBranch ? 'GIT_WORKTREE' : environment.VEXLIFE_BRANCH ? 'ENVIRONMENT_RECEIPT' : 'UNKNOWN',
      detached,
      checkoutKind: syntheticMerge ? 'SYNTHETIC_MERGE' : detached ? 'DETACHED' : 'BRANCH',
      candidateHeadSha: environment.VEXLIFE_CANDIDATE_HEAD_SHA || (syntheticMerge ? parents[1] : checkoutSha),
      testedMergeSha: environment.VEXLIFE_TESTED_MERGE_SHA || (syntheticMerge ? checkoutSha : null),
      baseSha: environment.VEXLIFE_BASE_SHA || (syntheticMerge ? parents[0] : mergeBase),
      upstreamRef,
      upstreamSha,
      ahead,
      behind,
      workingTree: statusLines.length ? 'DIRTY' : 'CLEAN',
      changedPaths: statusLines.length
    }
  };
}

function canonicalExistingDirectory(value, label) {
  if (!value || !fs.existsSync(value)) throw new Error(`${label} does not exist`);
  const stat = fs.lstatSync(value);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a non-symlink directory`);
  return fs.realpathSync.native(value);
}

export function resolveDisposableRepositoryPath(workspaceRoot, repositoryPath) {
  const canonicalWorkspace = canonicalExistingDirectory(workspaceRoot, 'workspace root');
  const canonicalRepository = canonicalExistingDirectory(repositoryPath, 'disposable repository');
  const relative = path.relative(canonicalWorkspace, canonicalRepository);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('disposable repository is not a child of the admitted workspace root');
  }
  let cursor = canonicalWorkspace;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) throw new Error('disposable repository path traverses a symbolic link');
  }
  return { canonicalWorkspace, canonicalRepository, relative: relative.split(path.sep).join('/') };
}

export function collectDisposableRepositoryEvidence(workspaceRoot, repositoryPath, { mutationPath = null } = {}) {
  const resolved = resolveDisposableRepositoryPath(workspaceRoot, repositoryPath);
  const isRepository = runGit(resolved.canonicalRepository, ['rev-parse', '--is-inside-work-tree'], 'Git repository probe');
  if (isRepository !== 'true') throw new Error('disposable repository is not a Git worktree');
  const status = runGit(resolved.canonicalRepository, ['status', '--porcelain=v1', '--untracked-files=all'], 'Git status');
  const headSha = runGit(resolved.canonicalRepository, ['rev-parse', 'HEAD'], 'Git HEAD readback');
  const treeSha = runGit(resolved.canonicalRepository, ['rev-parse', 'HEAD^{tree}'], 'Git tree readback');
  const branch = runGit(resolved.canonicalRepository, ['branch', '--show-current'], 'Git branch readback');
  const remotes = runGit(resolved.canonicalRepository, ['remote'], 'Git remote readback').split(/\r?\n/).filter(Boolean);
  let mutationBlobSha = null;
  if (mutationPath) {
    mutationBlobSha = runGit(
      resolved.canonicalRepository,
      ['rev-parse', `HEAD:${mutationPath.replaceAll('\\', '/')}`],
      'Git mutation blob readback'
    );
  }
  const core = {
    schemaVersion: 'vexlife.disposable-repository-evidence/v1',
    repositoryRef: `repository.disposable-local-git.${crypto.createHash('sha256').update(resolved.canonicalRepository).digest('hex').slice(0, 24)}`,
    repositoryCanonicalPathHash: crypto.createHash('sha256').update(resolved.canonicalRepository).digest('hex'),
    workspaceCanonicalPathHash: crypto.createHash('sha256').update(resolved.canonicalWorkspace).digest('hex'),
    workspaceRelativePath: resolved.relative,
    headSha,
    treeSha,
    branch,
    workingTree: status ? 'DIRTY' : 'CLEAN',
    statusLines: status ? status.split(/\r?\n/).filter(Boolean) : [],
    remoteConfigured: remotes.length > 0,
    remoteRefs: remotes,
    mutationPath,
    mutationBlobSha
  };
  core.repositoryEvidenceRef = `evidence.repository.disposable.${crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex').slice(0, 24)}`;
  core.semanticFingerprint = crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex');
  return Object.freeze(core);
}

export function readCommitEvidence(repositoryPath, mutationPath) {
  const normalizedPath = mutationPath.replaceAll('\\', '/');
  const commitSha = runGit(repositoryPath, ['rev-parse', 'HEAD'], 'Git commit SHA readback');
  const commitParentSha = runGit(repositoryPath, ['rev-parse', 'HEAD^'], 'Git commit parent readback');
  const commitTreeSha = runGit(repositoryPath, ['rev-parse', 'HEAD^{tree}'], 'Git commit tree readback');
  const afterBlobSha = runGit(repositoryPath, ['rev-parse', `HEAD:${normalizedPath}`], 'Git after blob readback');
  const beforeBlobSha = runGit(repositoryPath, ['rev-parse', `HEAD^:${normalizedPath}`], 'Git before blob readback');
  const changedPaths = runGit(repositoryPath, ['diff', '--name-only', 'HEAD^', 'HEAD', '--'], 'Git changed-path readback')
    .split(/\r?\n/).filter(Boolean).sort();
  const diff = runGit(repositoryPath, ['diff', '--binary', '--no-ext-diff', 'HEAD^', 'HEAD', '--', normalizedPath], 'Git diff readback');
  const status = runGit(repositoryPath, ['status', '--porcelain=v1', '--untracked-files=all'], 'Git post-effect status');
  const branch = runGit(repositoryPath, ['branch', '--show-current'], 'Git post-effect branch');
  const remotes = runGit(repositoryPath, ['remote'], 'Git post-effect remotes').split(/\r?\n/).filter(Boolean);
  return Object.freeze({
    commitSha,
    commitParentSha,
    commitTreeSha,
    beforeBlobSha,
    afterBlobSha,
    changedPaths,
    diffFingerprint: crypto.createHash('sha256').update(diff).digest('hex'),
    workingTreeAfter: status ? 'DIRTY' : 'CLEAN',
    statusLines: status ? status.split(/\r?\n/).filter(Boolean) : [],
    branchAfter: branch,
    remoteConfigured: remotes.length > 0,
    remoteRefs: remotes
  });
}

// [VXG RealForever]



function baClone(value) { return structuredClone(value); }
function baFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) baFreeze(child);
  return Object.freeze(value);
}
function baObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function baTimestamp(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new Error(`${label} must be canonical ISO`);
  return value;
}
function baChronology(earlier, later, label, strict = false) {
  const a = Date.parse(baTimestamp(earlier, `${label} earlier`));
  const b = Date.parse(baTimestamp(later, `${label} later`));
  if (strict ? b <= a : b < a) throw new Error(`${label} chronology is invalid`);
}
function baAddress(coreInput, refField, prefix) {
  const core = baClone(coreInput); delete core[refField]; delete core.semanticFingerprint;
  const semanticFingerprint = semanticHash(core);
  return baFreeze({ ...core, [refField]: `${prefix}.${semanticFingerprint.slice(0, 24)}`, semanticFingerprint });
}
function baCanonical(value, refField, prefix, label) {
  baObject(value, label);
  const core = baClone(value); delete core[refField]; delete core.semanticFingerprint;
  const expected = baAddress(core, refField, prefix);
  if (value[refField] !== expected[refField] || value.semanticFingerprint !== expected.semanticFingerprint) throw new Error(`${label} is forged or re-addressed`);
  return value;
}
function baRegistry(registry) {
  if (!registry || registry.schemaVersion !== 'vexlife.build-admission-registry/v1' || registry.adapter?.effectScope !== 'DISPOSABLE_LOCAL_GIT_REPOSITORY') {
    throw new Error('Build Admission registry is invalid');
  }
  return registry;
}
function baValidateAdmission(admission, request, registry) {
  baRegistry(registry);
  baCanonical(request, 'buildRequestRef', 'request.build-admission', 'build request');
  baCanonical(admission, 'buildAdmissionRef', 'admission.build-admission', 'build admission');
  for (const [field, expected] of Object.entries({
    buildRequestRef: request.buildRequestRef, buildRequestFingerprint: request.semanticFingerprint,
    schedulerAdmissionRef: request.schedulerAdmissionRef, schedulerAdmissionFingerprint: request.schedulerAdmissionFingerprint,
    schedulerGeneration: request.schedulerGeneration, workgraphRef: request.workgraphRef,
    workgraphFingerprint: request.workgraphFingerprint, workNodeRef: request.workNodeRef,
    workNodeFingerprint: request.workNodeFingerprint, repositoryEvidenceRef: request.repositoryEvidenceRef,
    repositoryEvidenceFingerprint: request.repositoryEvidenceFingerprint, currentness: 'CURRENT',
    externalEffectsAuthorized: true, networkAuthorized: false, remoteGitAuthorized: false
  })) if (admission[field] !== expected) throw new Error(`build admission ${field} mismatch`);
}
function baValidateEffect(effectReceipt, { request, admission, workspaceRoot, repositoryPath, registry }) {
  baValidateAdmission(admission, request, registry);
  baCanonical(effectReceipt, 'buildEffectReceiptRef', 'effect.build-admission.local-git', 'build effect receipt');
  const readback = readCommitEvidence(repositoryPath, request.mutationPath);
  const resolved = resolveDisposableRepositoryPath(workspaceRoot, repositoryPath);
  const expected = {
    buildAdmissionRef: admission.buildAdmissionRef, buildAdmissionFingerprint: admission.semanticFingerprint,
    effectScope: registry.adapter.effectScope,
    repositoryCanonicalPathHash: crypto.createHash('sha256').update(resolved.canonicalRepository).digest('hex'),
    priorHeadSha: request.expectedHeadSha, priorTreeSha: request.expectedTreeSha, mutationPath: request.mutationPath,
    beforeBlobSha: request.expectedBeforeBlobSha, afterBlobSha: request.expectedAfterBlobSha,
    commitSha: readback.commitSha, commitParentSha: readback.commitParentSha, commitTreeSha: readback.commitTreeSha,
    diffFingerprint: readback.diffFingerprint, workingTreeAfter: 'CLEAN', branchAfter: request.branchRef,
    networkUsed: false, remoteConfigured: false, externalEffectsExecuted: true
  };
  for (const [field, value] of Object.entries(expected)) if (effectReceipt[field] !== value) throw new Error(`build effect receipt ${field} mismatch`);
  if (semanticHash(effectReceipt.changedPaths) !== semanticHash([request.mutationPath]) || readback.changedPaths[0] !== request.mutationPath || readback.changedPaths.length !== 1) {
    throw new Error('build effect changed-path readback mismatch');
  }
  return baFreeze(baClone(effectReceipt));
}

export function verifyRealBuildEffect({ effectReceipt, request, admission, workspaceRoot, repositoryPath, consumedAt, schedulerObservedAt }, { registry }) {
  const source = baRegistry(registry);
  baValidateAdmission(admission, request, source);
  const effect = baValidateEffect(effectReceipt, { request, admission, workspaceRoot, repositoryPath, registry: source });
  baTimestamp(consumedAt, 'completion consumedAt');
  baTimestamp(schedulerObservedAt, 'schedulerObservedAt');
  baChronology(effect.observedAt, consumedAt, 'completion consumption');
  baChronology(schedulerObservedAt, consumedAt, 'scheduler clock consumption');
  if (Date.parse(consumedAt) >= Date.parse(request.expiresAt) || Date.parse(consumedAt) >= Date.parse(admission.expiresAt)) {
    throw new Error('real effect completion evidence expired before consumption');
  }
  const gateResults = request.completionGateRefs.map((completionGateRef) => {
    const core = {
      schemaVersion: 'vexlife.real-effect-completion-gate/v1',
      completionGateRef,
      result: 'PASSED',
      sourceObservationRef: effect.buildEffectReceiptRef,
      sourceObservationHash: effect.semanticFingerprint,
      commitSha: effect.commitSha,
      commitTreeSha: effect.commitTreeSha,
      afterBlobSha: effect.afterBlobSha,
      diffFingerprint: effect.diffFingerprint,
      observedAt: effect.observedAt
    };
    return baAddress(core, 'gateResultRef', 'gate-result.build-admission');
  });
  const core = {
    schemaVersion: source.completionContract.schemaVersion,
    contractRef: source.completionContract.contractRef,
    evidenceClass: source.completionContract.evidenceClass,
    verificationReceiptRef: `verification.build-admission.${effect.commitSha.slice(0, 24)}`,
    buildRequestRef: request.buildRequestRef,
    buildRequestFingerprint: request.semanticFingerprint,
    buildAdmissionRef: admission.buildAdmissionRef,
    buildAdmissionFingerprint: admission.semanticFingerprint,
    buildEffectReceiptRef: effect.buildEffectReceiptRef,
    buildEffectReceiptFingerprint: effect.semanticFingerprint,
    workNodeRef: request.workNodeRef,
    workNodeFingerprint: request.workNodeFingerprint,
    workgraphRef: request.workgraphRef,
    workgraphFingerprint: request.workgraphFingerprint,
    schedulerAdmissionRef: request.schedulerAdmissionRef,
    schedulerAdmissionFingerprint: request.schedulerAdmissionFingerprint,
    schedulerGeneration: request.schedulerGeneration,
    expectedTransitionRef: request.expectedTransitionRef,
    completionGateRefs: baClone(request.completionGateRefs),
    gateResultReceipts: gateResults,
    observedBeforeState: 'VERIFYING',
    observedAfterState: 'COMPLETED',
    commitSha: effect.commitSha,
    commitParentSha: effect.commitParentSha,
    commitTreeSha: effect.commitTreeSha,
    beforeBlobSha: effect.beforeBlobSha,
    afterBlobSha: effect.afterBlobSha,
    changedPaths: baClone(effect.changedPaths),
    diffFingerprint: effect.diffFingerprint,
    externalEffectsExecuted: true,
    deterministicFakeEvidence: false,
    selfCertified: false,
    currentness: 'CURRENT',
    formedAt: effect.formedAt,
    observedAt: effect.observedAt,
    consumedAt,
    schedulerObservedAt
  };
  return baAddress(core, 'realEffectVerificationRef', 'verification.real-effect');
}

export function validateRealBuildEffectVerification(verification, { effectReceipt, request, admission, workspaceRoot, repositoryPath, registry }) {
  const source = baRegistry(registry);
  baCanonical(verification, 'realEffectVerificationRef', 'verification.real-effect', 'real effect verification');
  const expected = verifyRealBuildEffect({
    effectReceipt, request, admission, workspaceRoot, repositoryPath,
    consumedAt: verification.consumedAt, schedulerObservedAt: verification.schedulerObservedAt
  }, { registry: source });
  if (semanticHash(expected) !== semanticHash(verification)) throw new Error('real effect completion verification is stale or substituted');
  return baFreeze(baClone(verification));
}


// [VXG RealForever]
