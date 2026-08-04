import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertDisposableRepositoryControlClean,
  collectDisposableRepositoryEvidence,
  inventoryDisposableRepositoryControl,
  readCommitEvidence,
  resolveDisposableRepositoryPath,
  runBoundedGit,
  validateDisposableRepositoryEvidenceRecord
} from './repository-evidence.mjs';
import { requireSafeRelativePath, semanticHash, writeJson } from './utils.mjs';
import {
  buildAdmissionAdapterSourceHash,
  buildAdmissionLedgerPath,
  cleanupDisposableGitRepository,
  formBuildRecoveryReceipt,
  prepareDisposableGitRepository,
  safeRemoveDisposableRepository
} from '../../scripts/build-admission-check.mjs';

const SHA1_PATTERN = /^[a-f0-9]{40}$/;
const FORBIDDEN_GIT_ARGUMENTS = new Set([
  'push', 'fetch', 'pull', 'clone', 'rebase', 'reset', 'amend', '--amend', '--force', '-f',
  'filter-branch', 'filter-repo', 'update-ref', 'remote-add', 'branch-delete', '-D', '-d'
]);
const ALLOWED_GIT_VERBS = new Set([
  'init', 'config', 'add', 'commit', 'switch', 'checkout', 'branch', 'rev-parse', 'diff', 'status',
  'show', 'log', 'hash-object'
]);
const ADAPTER_AUTHOR_NAME = 'VexLife Build Admission Adapter';
const ADAPTER_AUTHOR_EMAIL = 'vexlife-build-admission@users.noreply.github.com';

function clone(value) { return structuredClone(value); }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
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
function canonicalTimestamp(value, label) {
  requireString(value, label);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new Error(`${label} must be a canonical ISO timestamp`);
  return value;
}
function gitBlobSha(content) {
  const bytes = Buffer.from(content, 'utf8');
  return crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function canonicalContentSha256(content) { return sha256(Buffer.from(content, 'utf8')); }
function assertTypedGitArguments(args) {
  if (!Array.isArray(args) || args.length === 0 || !ALLOWED_GIT_VERBS.has(args[0])) throw new Error('unregistered Git command is not allowed');
  for (const arg of args) {
    if (typeof arg !== 'string' || /[\0\r\n]/.test(arg)) throw new Error('Git command arguments must be bounded strings');
    if (FORBIDDEN_GIT_ARGUMENTS.has(arg)) throw new Error(`forbidden Git operation: ${arg}`);
    if (/^(?:https?|ssh|git):/i.test(arg) || /^git@/i.test(arg)) throw new Error('network or remote Git argument is forbidden');
  }
}
function exactEmptyHookDomain(workspaceRoot) {
  const canonical = fs.realpathSync.native(workspaceRoot);
  const directory = path.join(canonical, '.vexlife-build-admission-empty-hooks');
  if (!fs.existsSync(directory)) fs.mkdirSync(directory);
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.readdirSync(directory).length !== 0) {
    throw new Error('source-managed hook domain must be one exact empty non-symlink directory');
  }
  return directory;
}
function runGit(root, args, { label = args.join(' '), env = {}, hooksPath } = {}) {
  assertTypedGitArguments(args);
  return runBoundedGit(root, args, { label, env, hooksPath });
}
function addressEffect(core) {
  const semanticFingerprint = semanticHash(core);
  return deepFreeze({ ...core, buildEffectReceiptRef: `effect.build-admission.local-git.${semanticFingerprint.slice(0, 24)}`, semanticFingerprint });
}
function validateCanonicalEffect(effectReceipt) {
  requireObject(effectReceipt, 'build effect receipt');
  const core = clone(effectReceipt);
  delete core.buildEffectReceiptRef;
  delete core.semanticFingerprint;
  const expected = addressEffect(core);
  if (effectReceipt.semanticFingerprint !== expected.semanticFingerprint || effectReceipt.buildEffectReceiptRef !== expected.buildEffectReceiptRef) {
    throw new Error('build effect receipt is caller-authored, forged, or re-addressed');
  }
  return effectReceipt;
}

export { prepareDisposableGitRepository, cleanupDisposableGitRepository };

function validateExecutionBindings(request, admission, replacementContent, registry) {
  requireObject(request, 'build request');
  requireObject(admission, 'build admission');
  const requestCore = clone(request); delete requestCore.buildRequestRef; delete requestCore.semanticFingerprint;
  const requestFingerprint = semanticHash(requestCore);
  if (request.semanticFingerprint !== requestFingerprint || request.buildRequestRef !== `request.build-admission.${requestFingerprint.slice(0, 24)}`) {
    throw new Error('build request is forged, re-addressed, or same-ref/different-meaning');
  }
  const admissionCore = clone(admission); delete admissionCore.buildAdmissionRef; delete admissionCore.semanticFingerprint;
  const admissionFingerprint = semanticHash(admissionCore);
  if (admission.semanticFingerprint !== admissionFingerprint || admission.buildAdmissionRef !== `admission.build-admission.${admissionFingerprint.slice(0, 24)}`) {
    throw new Error('build admission is forged, re-addressed, or same-ref/different-meaning');
  }
  requireString(replacementContent, 'replacement content');
  if (admission.buildRequestRef !== request.buildRequestRef || admission.buildRequestFingerprint !== request.semanticFingerprint) throw new Error('build admission is detached from the exact request');
  if (admission.currentness !== 'CURRENT' || admission.externalEffectsAuthorized !== true || admission.networkAuthorized !== false || admission.remoteGitAuthorized !== false) {
    throw new Error('build admission is not current and narrowly effect-authorizing');
  }
  if (canonicalContentSha256(replacementContent) !== request.replacementContentSha256) throw new Error('replacement content SHA-256 mismatch');
  if (gitBlobSha(replacementContent) !== request.expectedAfterBlobSha) throw new Error('replacement content Git blob mismatch');
  if (request.mutationPath !== registry.adapter.fixturePath) throw new Error('request mutation path is not the registered adapter fixture path');
}

export function executeDisposableLocalGitEffect({
  request,
  admission,
  workspaceRoot,
  repositoryPath,
  replacementContent,
  formedAt,
  observedAt,
  completedAt,
  failurePhase = null
}, { registry }) {
  validateExecutionBindings(request, admission, replacementContent, registry);
  canonicalTimestamp(formedAt, 'effect formedAt');
  canonicalTimestamp(observedAt, 'effect observedAt');
  canonicalTimestamp(completedAt, 'effect completedAt');
  const phaseVocabulary = new Set(registry.recoveryContract.failurePhases);
  if (failurePhase != null && !phaseVocabulary.has(failurePhase)) throw new Error('unknown build effect failure phase');
  const safeMutationPath = requireSafeRelativePath(request.mutationPath, 'mutationPath').replaceAll('\\', '/');
  const effectBranch = request.branchRef;
  if (registry.adapter.protectedBranches.includes(effectBranch)) throw new Error('effect branch is protected');
  const hookDomain = exactEmptyHookDomain(workspaceRoot);
  const hookDomainFingerprint = semanticHash({
    contractRef: 'contract.vexlife.empty-git-hook-domain/v1',
    canonicalPathHash: sha256(fs.realpathSync.native(hookDomain)),
    entries: []
  });
  const gitEnvironmentFingerprint = semanticHash({
    globalConfig: 'IGNORED',
    systemConfig: 'IGNORED',
    hooksPathFingerprint: hookDomainFingerprint,
    credentialPrompt: 'DISABLED',
    protocolFromUser: 'DISABLED',
    shell: false
  });
  const existingLedgerPath = buildAdmissionLedgerPath(workspaceRoot, registry, request.semanticFingerprint);
  if (fs.existsSync(existingLedgerPath)) {
    const prior = JSON.parse(fs.readFileSync(existingLedgerPath, 'utf8'));
    validateBuildEffectReceiptRecord(prior, { request, admission, registry });
    const current = readCommitEvidence(repositoryPath, safeMutationPath);
    if (current.commitSha !== prior.commitSha || current.commitTreeSha !== prior.commitTreeSha || current.afterBlobSha !== prior.afterBlobSha || current.diffFingerprint !== prior.diffFingerprint) {
      throw new Error('prior effect ledger is stale or repository readback drifted');
    }
    return deepFreeze({ effectReceipt: prior, replayed: true, recoveryReceipt: null });
  }
  let baselineEvidence = null;
  let beforeContent = null;
  try {
    const controlBefore = assertDisposableRepositoryControlClean(workspaceRoot, repositoryPath);
    baselineEvidence = collectDisposableRepositoryEvidence(workspaceRoot, repositoryPath, { mutationPath: safeMutationPath });
    validateDisposableRepositoryEvidenceRecord(baselineEvidence, { mutationPath: safeMutationPath });
    if (failurePhase === 'PRE_WRITE') throw new Error('injected PRE_WRITE failure');
    for (const [field, expected] of Object.entries({
      repositoryEvidenceRef: request.repositoryEvidenceRef,
      semanticFingerprint: request.repositoryEvidenceFingerprint,
      headSha: request.expectedHeadSha,
      treeSha: request.expectedTreeSha,
      branch: registry.adapter.baselineBranch,
      mutationBlobSha: request.expectedBeforeBlobSha,
      workingTree: 'CLEAN',
      remoteConfigured: false,
      ignoredMaterialCount: 0,
      activeHookCount: 0,
      unsafeConfigCount: 0,
      nestedGitControlCount: 0,
      symlinkMaterialCount: 0
    })) if (baselineEvidence[field] !== expected) throw new Error(`disposable repository baseline ${field} mismatch`);
    const target = path.join(repositoryPath, ...safeMutationPath.split('/'));
    beforeContent = fs.readFileSync(target, 'utf8');
    if (gitBlobSha(beforeContent) !== request.expectedBeforeBlobSha) throw new Error('before-image blob mismatch');
    const temporary = `${target}.vexlife-build-admission.tmp`;
    fs.writeFileSync(temporary, replacementContent, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, target);
    if (failurePhase === 'POST_WRITE_PRE_COMMIT') throw new Error('injected POST_WRITE_PRE_COMMIT failure');
    if (failurePhase === 'ROLLBACK') throw new Error('injected primary failure before rollback');
    const dirty = runGit(repositoryPath, ['status', '--porcelain=v1', '--untracked-files=all', '--ignored=matching'], { label: 'Git complete pre-commit status', hooksPath: hookDomain }).stdout.split(/\r?\n/).filter(Boolean);
    const expectedDirty = ` M ${safeMutationPath}`;
    if (dirty.length !== 1 || dirty[0] !== expectedDirty) throw new Error(`unexpected pre-commit worktree/control inventory: ${dirty.join(', ')}`);
    runGit(repositoryPath, ['switch', '-c', effectBranch], { label: 'Git effect branch creation', hooksPath: hookDomain });
    runGit(repositoryPath, ['add', '--', safeMutationPath], { label: 'Git exact effect path add', hooksPath: hookDomain });
    const stagedPaths = runGit(repositoryPath, ['diff', '--cached', '--name-only', '--'], { label: 'Git staged path inventory', hooksPath: hookDomain }).stdout.split(/\r?\n/).filter(Boolean).sort();
    if (stagedPaths.length !== 1 || stagedPaths[0] !== safeMutationPath) throw new Error(`unexpected staged path inventory: ${stagedPaths.join(', ')}`);
    const remaining = runGit(repositoryPath, ['status', '--porcelain=v1', '--untracked-files=all', '--ignored=matching'], { label: 'Git exact pre-commit status', hooksPath: hookDomain }).stdout.split(/\r?\n/).filter(Boolean);
    if (remaining.length !== 1 || remaining[0] !== `M  ${safeMutationPath}`) throw new Error(`unexpected staged/unstaged/ignored inventory: ${remaining.join(', ')}`);
    if (failurePhase === 'COMMIT') throw new Error('injected COMMIT failure');
    runGit(repositoryPath, ['commit', '--no-verify', '-m', request.commitMessage, '-m', `Signed-off-by: ${ADAPTER_AUTHOR_NAME} <${ADAPTER_AUTHOR_EMAIL}>`], {
      label: 'Git ordinary effect commit',
      env: {
        GIT_AUTHOR_NAME: ADAPTER_AUTHOR_NAME,
        GIT_AUTHOR_EMAIL: ADAPTER_AUTHOR_EMAIL,
        GIT_COMMITTER_NAME: ADAPTER_AUTHOR_NAME,
        GIT_COMMITTER_EMAIL: ADAPTER_AUTHOR_EMAIL,
        GIT_AUTHOR_DATE: completedAt,
        GIT_COMMITTER_DATE: completedAt
      },
      hooksPath: hookDomain
    });
    const readback = readCommitEvidence(repositoryPath, safeMutationPath);
    if (failurePhase === 'READBACK') throw new Error('injected READBACK mismatch');
    for (const [field, expected] of Object.entries({
      commitParentSha: request.expectedHeadSha,
      beforeBlobSha: request.expectedBeforeBlobSha,
      afterBlobSha: request.expectedAfterBlobSha,
      workingTreeAfter: 'CLEAN',
      branchAfter: effectBranch,
      remoteConfigured: false
    })) if (readback[field] !== expected) throw new Error(`effect readback ${field} mismatch`);
    if (readback.changedPaths.length !== 1 || readback.changedPaths[0] !== safeMutationPath) throw new Error('effect readback changed path inventory mismatch');
    const controlAfter = assertDisposableRepositoryControlClean(workspaceRoot, repositoryPath);
    if (controlAfter.semanticFingerprint !== controlBefore.semanticFingerprint) throw new Error('repository control material changed during effect');
    const core = {
      schemaVersion: registry.effectReceiptContract.schemaVersion,
      contractRef: registry.effectReceiptContract.contractRef,
      buildAdmissionRef: admission.buildAdmissionRef,
      buildAdmissionFingerprint: admission.semanticFingerprint,
      buildRequestRef: request.buildRequestRef,
      buildRequestFingerprint: request.semanticFingerprint,
      adapterRef: registry.adapter.adapterRef,
      adapterSourceRef: registry.adapter.sourceRef,
      adapterSourceHash: buildAdmissionAdapterSourceHash(registry),
      formationRef: registry.adapter.formationRef,
      externalEffectsExecuted: true,
      effectScope: registry.adapter.effectScope,
      repositoryCanonicalPathHash: baselineEvidence.repositoryCanonicalPathHash,
      priorHeadSha: baselineEvidence.headSha,
      priorTreeSha: baselineEvidence.treeSha,
      mutationPath: safeMutationPath,
      beforeBlobSha: readback.beforeBlobSha,
      afterBlobSha: readback.afterBlobSha,
      commitSha: readback.commitSha,
      commitParentSha: readback.commitParentSha,
      commitTreeSha: readback.commitTreeSha,
      changedPaths: readback.changedPaths,
      diffFingerprint: readback.diffFingerprint,
      workingTreeBefore: baselineEvidence.workingTree,
      workingTreeAfter: readback.workingTreeAfter,
      branchBefore: baselineEvidence.branch,
      branchAfter: readback.branchAfter,
      networkUsed: false,
      remoteConfigured: readback.remoteConfigured,
      rollbackAvailable: true,
      gitEnvironmentFingerprint,
      hookDomainFingerprint,
      repositoryControlFingerprint: controlAfter.semanticFingerprint,
      ignoredMaterialCount: controlAfter.ignoredLines.length,
      activeHookCount: controlAfter.activeHookEntries.length,
      unsafeConfigCount: controlAfter.unsafeConfigEntries.length,
      nestedGitControlCount: controlAfter.nestedGitPaths.length,
      symlinkMaterialCount: controlAfter.symlinkPaths.length,
      formedAt,
      observedAt,
      completedAt
    };
    const effectReceipt = addressEffect(core);
    if (failurePhase === 'CLEANUP') throw new Error('injected CLEANUP failure');
    writeJson(existingLedgerPath, effectReceipt);
    return deepFreeze({ effectReceipt, replayed: false, recoveryReceipt: null });
  } catch (caught) {
    let error = caught;
    let rollbackAttempted = false;
    let rollbackSucceeded = false;
    let disposition = 'HELD_UNKNOWN';
    let humanAttentionRequired = false;
    try {
      rollbackAttempted = true;
      if (failurePhase === 'ROLLBACK') throw new Error('injected ROLLBACK failure');
      if (failurePhase === 'PRE_WRITE') {
        rollbackSucceeded = true;
        disposition = 'REPOSITORY_UNCHANGED';
      } else if (failurePhase === 'POST_WRITE_PRE_COMMIT' && beforeContent != null) {
        const target = path.join(repositoryPath, ...safeMutationPath.split('/'));
        fs.writeFileSync(target, beforeContent, 'utf8');
        const restored = collectDisposableRepositoryEvidence(workspaceRoot, repositoryPath, { mutationPath: safeMutationPath });
        rollbackSucceeded = restored.headSha === request.expectedHeadSha && restored.treeSha === request.expectedTreeSha && restored.mutationBlobSha === request.expectedBeforeBlobSha && restored.workingTree === 'CLEAN';
        disposition = rollbackSucceeded ? 'BEFORE_IMAGE_RESTORED' : 'HELD_UNKNOWN';
      } else {
        safeRemoveDisposableRepository(workspaceRoot, repositoryPath);
        rollbackSucceeded = !fs.existsSync(repositoryPath);
        disposition = rollbackSucceeded ? 'DISPOSABLE_REPOSITORY_REMOVED' : 'HELD_UNKNOWN';
      }
    } catch (rollbackError) {
      error = new Error(`${error.message}; rollback failed: ${rollbackError.message}`);
      rollbackSucceeded = false;
      disposition = 'HELD_UNKNOWN';
      humanAttentionRequired = true;
    }
    if (!rollbackSucceeded) humanAttentionRequired = true;
    const recoveryReceipt = formBuildRecoveryReceipt({
      phase: failurePhase ?? 'READBACK', disposition, request, admission, repositoryEvidence: baselineEvidence, error,
      formedAt, completedAt, rollbackAttempted, rollbackSucceeded, humanAttentionRequired
    });
    return deepFreeze({ effectReceipt: null, replayed: false, recoveryReceipt });
  }
}

export function validateBuildEffectReceiptRecord(effectReceipt, { request, admission, registry }) {
  validateCanonicalEffect(effectReceipt);
  if (effectReceipt.contractRef !== registry.effectReceiptContract.contractRef || effectReceipt.schemaVersion !== registry.effectReceiptContract.schemaVersion ||
      effectReceipt.adapterRef !== registry.adapter.adapterRef || effectReceipt.adapterSourceRef !== registry.adapter.sourceRef ||
      effectReceipt.adapterSourceHash !== buildAdmissionAdapterSourceHash(registry) || effectReceipt.formationRef !== registry.adapter.formationRef ||
      effectReceipt.effectScope !== registry.adapter.effectScope || effectReceipt.externalEffectsExecuted !== true || effectReceipt.networkUsed !== false ||
      effectReceipt.remoteConfigured !== false || effectReceipt.workingTreeBefore !== 'CLEAN' || effectReceipt.workingTreeAfter !== 'CLEAN' ||
      effectReceipt.ignoredMaterialCount !== 0 || effectReceipt.activeHookCount !== 0 || effectReceipt.unsafeConfigCount !== 0 ||
      effectReceipt.nestedGitControlCount !== 0 || effectReceipt.symlinkMaterialCount !== 0) {
    throw new Error('build effect receipt does not bind the complete registered real local adapter contract');
  }
  if (effectReceipt.buildRequestRef !== request.buildRequestRef || effectReceipt.buildRequestFingerprint !== request.semanticFingerprint ||
      effectReceipt.buildAdmissionRef !== admission.buildAdmissionRef || effectReceipt.buildAdmissionFingerprint !== admission.semanticFingerprint) {
    throw new Error('build effect receipt request/admission lineage mismatch');
  }
  if (effectReceipt.priorHeadSha !== request.expectedHeadSha || effectReceipt.priorTreeSha !== request.expectedTreeSha ||
      effectReceipt.mutationPath !== request.mutationPath || effectReceipt.beforeBlobSha !== request.expectedBeforeBlobSha ||
      effectReceipt.afterBlobSha !== request.expectedAfterBlobSha || effectReceipt.commitParentSha !== request.expectedHeadSha ||
      effectReceipt.branchBefore !== registry.adapter.baselineBranch || effectReceipt.branchAfter !== request.branchRef ||
      effectReceipt.changedPaths.length !== 1 || effectReceipt.changedPaths[0] !== request.mutationPath ||
      !SHA1_PATTERN.test(effectReceipt.commitSha ?? '') || !SHA1_PATTERN.test(effectReceipt.commitTreeSha ?? '')) {
    throw new Error('build effect receipt complete before/after/chronology boundary mismatch');
  }
  canonicalTimestamp(effectReceipt.formedAt, 'effect formedAt');
  canonicalTimestamp(effectReceipt.observedAt, 'effect observedAt');
  canonicalTimestamp(effectReceipt.completedAt, 'effect completedAt');
  if (Date.parse(effectReceipt.formedAt) > Date.parse(effectReceipt.observedAt) || Date.parse(effectReceipt.observedAt) > Date.parse(effectReceipt.completedAt)) {
    throw new Error('build effect receipt chronology mismatch');
  }
  return deepFreeze(clone(effectReceipt));
}

export function validateBuildEffectReceipt(effectReceipt, { request, admission, workspaceRoot, repositoryPath, registry }) {
  validateBuildEffectReceiptRecord(effectReceipt, { request, admission, registry });
  const current = readCommitEvidence(repositoryPath, request.mutationPath);
  for (const [field, expected] of Object.entries({
    commitSha: effectReceipt.commitSha,
    commitParentSha: effectReceipt.commitParentSha,
    commitTreeSha: effectReceipt.commitTreeSha,
    beforeBlobSha: effectReceipt.beforeBlobSha,
    afterBlobSha: effectReceipt.afterBlobSha,
    diffFingerprint: effectReceipt.diffFingerprint,
    branchAfter: effectReceipt.branchAfter,
    workingTreeAfter: 'CLEAN',
    remoteConfigured: false
  })) if (current[field] !== expected) throw new Error(`build effect direct readback ${field} mismatch`);
  if (semanticHash(current.changedPaths) !== semanticHash(effectReceipt.changedPaths)) throw new Error('build effect direct changed-path readback mismatch');
  const resolved = resolveDisposableRepositoryPath(workspaceRoot, repositoryPath);
  if (sha256(resolved.canonicalRepository) !== effectReceipt.repositoryCanonicalPathHash) throw new Error('build effect repository path binding mismatch');
  const control = inventoryDisposableRepositoryControl(workspaceRoot, repositoryPath);
  if (control.semanticFingerprint !== effectReceipt.repositoryControlFingerprint) throw new Error('build effect repository control material readback mismatch');
  return deepFreeze(clone(effectReceipt));
}

export const LOCAL_GIT_EFFECT_ADAPTER_IDENTITY = Object.freeze({
  adapterRef: 'adapter.vexlife.local-git.disposable/v1',
  sourceRef: 'src/core/local-git-effect-adapter.mjs',
  formationRef: 'formation.vexlife.local-git-effect-adapter.v1',
  effectScope: 'DISPOSABLE_LOCAL_GIT_REPOSITORY'
});

// [VXG RealForever]
