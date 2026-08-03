import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { semanticHash } from './utils.mjs';

const SAFE_GIT_ENV_KEYS = new Set([
  'PATH', 'Path', 'PATHEXT', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'COMSPEC',
  'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'TERM'
]);
const DANGEROUS_LOCAL_CONFIG = /^(?:alias\.|credential\.|include\.|includeif\.|remote\.|url\.|protocol\.|http\.|https\.|core\.(?:hookspath|sshcommand|gitproxy)|gpg\.|commit\.gpgsign)/i;
const ALLOWED_LOCAL_CONFIG = /^(?:core\.(?:repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode|symlinks)|user\.(?:name|email))$/i;

function clone(value) { return structuredClone(value); }
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

export function createSanitizedGitEnvironment(overrides = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (SAFE_GIT_ENV_KEYS.has(key) && typeof value === 'string') env[key] = value;
  }
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_CONFIG_SYSTEM: os.devNull,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '',
    GCM_INTERACTIVE: 'Never',
    GIT_PROTOCOL_FROM_USER: '0',
    ...overrides
  };
}

export function runBoundedGit(root, args, {
  label = args.join(' '),
  env = {},
  allowFailure = false,
  hooksPath = os.devNull,
  timeout = 30000
} = {}) {
  if (!Array.isArray(args) || args.length === 0 || args.some((arg) => typeof arg !== 'string' || /[\0\r\n]/.test(arg))) {
    throw new Error(`${label} requires bounded Git arguments`);
  }
  const commandArgs = [
    '-c', `core.hooksPath=${hooksPath}`,
    '-c', 'credential.helper=',
    '-c', 'protocol.allow=never',
    '-c', 'commit.gpgSign=false',
    ...args
  ];
  const result = spawnSync('git', commandArgs, {
    cwd: root,
    encoding: 'utf8',
    env: createSanitizedGitEnvironment(env),
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    shell: false
  });
  const output = {
    status: Number.isInteger(result.status) ? result.status : null,
    stdout: result.stdout ?? '',
    stderr: result.error?.message ?? result.stderr ?? ''
  };
  if (!allowFailure && (result.error || result.status !== 0)) {
    throw new Error(`${label} failed: ${output.stderr.trim() || `exit ${output.status}`}`);
  }
  return output;
}

function gitOrNull(root, args) {
  const result = runBoundedGit(root, args, { label: `Git ${args.join(' ')}`, allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function collectRepositoryEvidence(root, environment = process.env) {
  const checkoutSha = gitOrNull(root, ['rev-parse', 'HEAD']);
  const localBranch = gitOrNull(root, ['branch', '--show-current']);
  const parents = (gitOrNull(root, ['rev-list', '--parents', '-n', '1', 'HEAD']) ?? '').split(/\s+/).filter(Boolean).slice(1);
  const detached = !localBranch;
  const syntheticMerge = detached && parents.length === 2;
  const branch = localBranch || environment.VEXLIFE_BRANCH || null;
  const upstreamRef = gitOrNull(root, ['rev-parse', '--abbrev-ref', '@{upstream}']);
  const upstreamSha = upstreamRef ? gitOrNull(root, ['rev-parse', '@{upstream}']) : null;
  const relation = upstreamRef ? gitOrNull(root, ['rev-list', '--left-right', '--count', `HEAD...${upstreamRef}`]) : null;
  const [ahead, behind] = relation ? relation.split(/\s+/).map(Number) : [null, null];
  const statusLines = (gitOrNull(root, ['status', '--porcelain=v1']) || '').split(/\r?\n/).filter(Boolean);
  const remoteUrl = gitOrNull(root, ['remote', 'get-url', 'origin']);
  const remoteSlug = remoteUrl?.replace(/^.*github\.com[/:]/, '').replace(/\.git$/, '') ?? null;
  const primaryRemoteRef = environment.VEXLIFE_PRIMARY_REMOTE_REF || 'origin/main';
  const mergeBase = checkoutSha ? gitOrNull(root, ['merge-base', checkoutSha, primaryRemoteRef]) : null;
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

function walkWorktreeControlMaterial(repositoryPath) {
  const nestedGitPaths = [];
  const symlinkPaths = [];
  const visit = (directory, relative = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (!relative && entry.name === '.git') continue;
      const child = path.join(directory, entry.name);
      const stat = fs.lstatSync(child);
      if (stat.isSymbolicLink()) {
        symlinkPaths.push(childRelative);
        continue;
      }
      if (entry.name === '.git') nestedGitPaths.push(childRelative);
      if (entry.isDirectory()) visit(child, childRelative);
    }
  };
  visit(repositoryPath);
  return { nestedGitPaths: nestedGitPaths.sort(), symlinkPaths: symlinkPaths.sort() };
}

function localConfigEntries(repositoryPath) {
  const raw = runBoundedGit(repositoryPath, ['config', '--local', '--null', '--list'], { label: 'Git local config inventory' }).stdout;
  return raw.split('\0').filter(Boolean).map((entry) => {
    const newline = entry.indexOf('\n');
    if (newline >= 0) return { key: entry.slice(0, newline), value: entry.slice(newline + 1) };
    const equals = entry.indexOf('=');
    return equals >= 0 ? { key: entry.slice(0, equals), value: entry.slice(equals + 1) } : { key: entry, value: '' };
  }).sort((a, b) => a.key.localeCompare(b.key) || a.value.localeCompare(b.value));
}

function hookInventory(repositoryPath) {
  const hooksRoot = path.join(repositoryPath, '.git', 'hooks');
  if (!fs.existsSync(hooksRoot)) return [];
  const entries = [];
  const visit = (directory, relative = '') => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const rel = relative ? `${relative}/${item.name}` : item.name;
      const full = path.join(directory, item.name);
      const stat = fs.lstatSync(full);
      entries.push({ path: rel, kind: stat.isSymbolicLink() ? 'SYMLINK' : item.isDirectory() ? 'DIRECTORY' : 'FILE', executable: Boolean(stat.mode & 0o111) });
      if (item.isDirectory() && !stat.isSymbolicLink()) visit(full, rel);
    }
  };
  visit(hooksRoot);
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export function inventoryDisposableRepositoryControl(workspaceRoot, repositoryPath) {
  const resolved = resolveDisposableRepositoryPath(workspaceRoot, repositoryPath);
  const ignoredOutput = runBoundedGit(resolved.canonicalRepository, ['status', '--porcelain=v1', '--untracked-files=all', '--ignored=matching'], { label: 'Git ignored and untracked inventory' }).stdout;
  const ignoredLines = ignoredOutput.split(/\r?\n/).filter((line) => line.startsWith('!! ')).sort();
  const configEntries = localConfigEntries(resolved.canonicalRepository);
  const unsafeConfigEntries = configEntries.filter(({ key }) => DANGEROUS_LOCAL_CONFIG.test(key) || !ALLOWED_LOCAL_CONFIG.test(key));
  const hooks = hookInventory(resolved.canonicalRepository);
  const activeHooks = hooks.filter((entry) => entry.kind !== 'FILE' || !entry.path.endsWith('.sample'));
  const control = walkWorktreeControlMaterial(resolved.canonicalRepository);
  const core = {
    schemaVersion: 'vexlife.disposable-repository-control-inventory/v1',
    ignoredLines,
    configEntries,
    unsafeConfigEntries,
    hookEntries: hooks,
    activeHookEntries: activeHooks,
    nestedGitPaths: control.nestedGitPaths,
    symlinkPaths: control.symlinkPaths
  };
  return freeze({ ...core, semanticFingerprint: semanticHash(core) });
}

export function assertDisposableRepositoryControlClean(workspaceRoot, repositoryPath) {
  const inventory = inventoryDisposableRepositoryControl(workspaceRoot, repositoryPath);
  if (inventory.ignoredLines.length) throw new Error(`ignored effect material is forbidden: ${inventory.ignoredLines.join(', ')}`);
  if (inventory.unsafeConfigEntries.length) throw new Error(`unsafe local Git configuration is forbidden: ${inventory.unsafeConfigEntries.map((x) => x.key).join(', ')}`);
  if (inventory.activeHookEntries.length) throw new Error(`repository hook/control material is forbidden: ${inventory.activeHookEntries.map((x) => x.path).join(', ')}`);
  if (inventory.nestedGitPaths.length) throw new Error(`nested Git control material is forbidden: ${inventory.nestedGitPaths.join(', ')}`);
  if (inventory.symlinkPaths.length) throw new Error(`symlink/reparse effect material is forbidden: ${inventory.symlinkPaths.join(', ')}`);
  return inventory;
}

export function collectDisposableRepositoryEvidence(workspaceRoot, repositoryPath, { mutationPath = null } = {}) {
  const resolved = resolveDisposableRepositoryPath(workspaceRoot, repositoryPath);
  const isRepository = runBoundedGit(resolved.canonicalRepository, ['rev-parse', '--is-inside-work-tree'], { label: 'Git repository probe' }).stdout.trim();
  if (isRepository !== 'true') throw new Error('disposable repository is not a Git worktree');
  const status = runBoundedGit(resolved.canonicalRepository, ['status', '--porcelain=v1', '--untracked-files=all'], { label: 'Git status' }).stdout.trim();
  const headSha = runBoundedGit(resolved.canonicalRepository, ['rev-parse', 'HEAD'], { label: 'Git HEAD readback' }).stdout.trim();
  const treeSha = runBoundedGit(resolved.canonicalRepository, ['rev-parse', 'HEAD^{tree}'], { label: 'Git tree readback' }).stdout.trim();
  const branch = runBoundedGit(resolved.canonicalRepository, ['branch', '--show-current'], { label: 'Git branch readback' }).stdout.trim();
  const remotes = runBoundedGit(resolved.canonicalRepository, ['remote'], { label: 'Git remote readback' }).stdout.split(/\r?\n/).filter(Boolean);
  const controlInventory = inventoryDisposableRepositoryControl(workspaceRoot, repositoryPath);
  let mutationBlobSha = null;
  if (mutationPath) mutationBlobSha = runBoundedGit(resolved.canonicalRepository, ['rev-parse', `HEAD:${mutationPath.replaceAll('\\', '/')}`], { label: 'Git mutation blob readback' }).stdout.trim();
  const core = {
    schemaVersion: 'vexlife.disposable-repository-evidence/v2',
    repositoryRef: `repository.disposable-local-git.${sha256(resolved.canonicalRepository).slice(0, 24)}`,
    repositoryCanonicalPathHash: sha256(resolved.canonicalRepository),
    workspaceCanonicalPathHash: sha256(resolved.canonicalWorkspace),
    workspaceRelativePath: resolved.relative,
    headSha,
    treeSha,
    branch,
    workingTree: status ? 'DIRTY' : 'CLEAN',
    statusLines: status ? status.split(/\r?\n/).filter(Boolean) : [],
    remoteConfigured: remotes.length > 0,
    remoteRefs: remotes,
    mutationPath,
    mutationBlobSha,
    controlInventoryFingerprint: controlInventory.semanticFingerprint,
    ignoredMaterialCount: controlInventory.ignoredLines.length,
    activeHookCount: controlInventory.activeHookEntries.length,
    unsafeConfigCount: controlInventory.unsafeConfigEntries.length,
    nestedGitControlCount: controlInventory.nestedGitPaths.length,
    symlinkMaterialCount: controlInventory.symlinkPaths.length
  };
  const semanticFingerprint = semanticHash(core);
  return freeze({ ...core, repositoryEvidenceRef: `evidence.repository.disposable.${semanticFingerprint.slice(0, 24)}`, semanticFingerprint });
}

export function validateDisposableRepositoryEvidenceRecord(evidence, { mutationPath = null } = {}) {
  if (!evidence || typeof evidence !== 'object') throw new Error('disposable repository evidence must be an object');
  const core = clone(evidence);
  delete core.repositoryEvidenceRef;
  delete core.semanticFingerprint;
  const semanticFingerprint = semanticHash(core);
  if (evidence.semanticFingerprint !== semanticFingerprint || evidence.repositoryEvidenceRef !== `evidence.repository.disposable.${semanticFingerprint.slice(0, 24)}`) {
    throw new Error('disposable repository evidence is forged or re-addressed');
  }
  if (mutationPath != null && evidence.mutationPath !== mutationPath) throw new Error('disposable repository evidence mutation path mismatch');
  if (evidence.workingTree !== 'CLEAN' || evidence.remoteConfigured !== false || evidence.ignoredMaterialCount !== 0 || evidence.activeHookCount !== 0 || evidence.unsafeConfigCount !== 0 || evidence.nestedGitControlCount !== 0 || evidence.symlinkMaterialCount !== 0) {
    throw new Error('disposable repository evidence is not clean, remote-free, and control-bounded');
  }
  return freeze(clone(evidence));
}

export function reobserveDisposableRepositoryEvidence(workspaceRoot, repositoryPath, expected, { mutationPath = null } = {}) {
  validateDisposableRepositoryEvidenceRecord(expected, { mutationPath });
  assertDisposableRepositoryControlClean(workspaceRoot, repositoryPath);
  const current = collectDisposableRepositoryEvidence(workspaceRoot, repositoryPath, { mutationPath });
  if (semanticHash(current) !== semanticHash(expected)) throw new Error('disposable repository evidence is stale or not source-reobserved');
  return current;
}

export function readCommitEvidence(repositoryPath, mutationPath) {
  const normalizedPath = mutationPath.replaceAll('\\', '/');
  const commitSha = runBoundedGit(repositoryPath, ['rev-parse', 'HEAD'], { label: 'Git commit SHA readback' }).stdout.trim();
  const commitParentSha = runBoundedGit(repositoryPath, ['rev-parse', 'HEAD^'], { label: 'Git commit parent readback' }).stdout.trim();
  const commitTreeSha = runBoundedGit(repositoryPath, ['rev-parse', 'HEAD^{tree}'], { label: 'Git commit tree readback' }).stdout.trim();
  const afterBlobSha = runBoundedGit(repositoryPath, ['rev-parse', `HEAD:${normalizedPath}`], { label: 'Git after blob readback' }).stdout.trim();
  const beforeBlobSha = runBoundedGit(repositoryPath, ['rev-parse', `HEAD^:${normalizedPath}`], { label: 'Git before blob readback' }).stdout.trim();
  const changedPaths = runBoundedGit(repositoryPath, ['diff', '--name-only', 'HEAD^', 'HEAD', '--'], { label: 'Git changed-path readback' }).stdout.split(/\r?\n/).filter(Boolean).sort();
  const diff = runBoundedGit(repositoryPath, ['diff', '--binary', '--no-ext-diff', 'HEAD^', 'HEAD', '--', normalizedPath], { label: 'Git diff readback' }).stdout;
  const status = runBoundedGit(repositoryPath, ['status', '--porcelain=v1', '--untracked-files=all'], { label: 'Git post-effect status' }).stdout.trim();
  const branch = runBoundedGit(repositoryPath, ['branch', '--show-current'], { label: 'Git post-effect branch' }).stdout.trim();
  const remotes = runBoundedGit(repositoryPath, ['remote'], { label: 'Git post-effect remotes' }).stdout.split(/\r?\n/).filter(Boolean);
  return freeze({
    commitSha,
    commitParentSha,
    commitTreeSha,
    beforeBlobSha,
    afterBlobSha,
    changedPaths,
    diffFingerprint: sha256(diff),
    workingTreeAfter: status ? 'DIRTY' : 'CLEAN',
    statusLines: status ? status.split(/\r?\n/).filter(Boolean) : [],
    branchAfter: branch,
    remoteConfigured: remotes.length > 0,
    remoteRefs: remotes
  });
}

// [VXG RealForever]
