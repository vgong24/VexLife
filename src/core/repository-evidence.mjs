import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { semanticHash } from './utils.mjs';
import { buildSourceManifest, compareGitPaths } from './source-manifest.mjs';

export const LOCAL_SOURCE_OBSERVATION_SCHEMA = 'vexlife.local-source-observation/v1';
export const LOCAL_SOURCE_OBSERVATION_TRUTH_CLASS = 'SOURCE_BOUND_LOCAL_SOURCE_OBSERVATION';

const DEFAULT_LOCAL_SOURCE_OBSERVATION_MAX_PATHS = 256;
const DEFAULT_LOCAL_SOURCE_OBSERVATION_MAX_FILE_BYTES = 64 * 1024 * 1024;
const DEFAULT_LOCAL_SOURCE_OBSERVATION_MAX_TOTAL_BYTES = 128 * 1024 * 1024;

const SAFE_GIT_ENV_KEYS = new Set([
  'PATH', 'Path', 'PATHEXT', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'COMSPEC',
  'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'TERM'
]);
const ALLOWED_GIT_ENV_OVERRIDES = new Set([
  'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL',
  'GIT_AUTHOR_DATE', 'GIT_COMMITTER_DATE'
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

function createExactEmptyGitControlDomain() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-git-control-'));
  const configPath = path.join(directory, 'empty.gitconfig');
  const hooksPath = path.join(directory, 'hooks');
  fs.writeFileSync(configPath, '', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  fs.mkdirSync(hooksPath, { mode: 0o700 });
  const configStat = fs.lstatSync(configPath);
  const hooksStat = fs.lstatSync(hooksPath);
  if (!configStat.isFile() || configStat.isSymbolicLink() || configStat.size !== 0) {
    throw new Error('source-managed Git config domain must be one exact empty regular file');
  }
  if (!hooksStat.isDirectory() || hooksStat.isSymbolicLink() || fs.readdirSync(hooksPath).length !== 0) {
    throw new Error('source-managed Git hook domain must be one exact empty directory');
  }
  return { directory, configPath, hooksPath };
}

export function createSanitizedGitEnvironment(overrides = {}, { configPath } = {}) {
  if (typeof configPath !== 'string' || !configPath) throw new Error('source-managed empty Git config path is required');
  const configStat = fs.lstatSync(configPath);
  if (!configStat.isFile() || configStat.isSymbolicLink() || configStat.size !== 0) {
    throw new Error('source-managed Git config path must remain an exact empty regular file');
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (!ALLOWED_GIT_ENV_OVERRIDES.has(key) || typeof value !== 'string' || /[\0\r\n]/.test(value)) {
      throw new Error(`Git environment override is not source-managed: ${key}`);
    }
  }
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (SAFE_GIT_ENV_KEYS.has(key) && typeof value === 'string') env[key] = value;
  }
  return {
    ...env,
    ...overrides,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: configPath,
    GIT_CONFIG_SYSTEM: configPath,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '',
    GCM_INTERACTIVE: 'Never',
    GIT_PROTOCOL_FROM_USER: '0'
  };
}

export function runBoundedGit(root, args, {
  label = args.join(' '),
  env = {},
  allowFailure = false,
  hooksPath = null,
  timeout = 30000
} = {}) {
  if (!Array.isArray(args) || args.length === 0 || args.some((arg) => typeof arg !== 'string' || /[\0\r\n]/.test(arg))) {
    throw new Error(`${label} requires bounded Git arguments`);
  }
  const controlDomain = createExactEmptyGitControlDomain();
  try {
    const effectiveHooksPath = hooksPath ?? controlDomain.hooksPath;
    if (typeof effectiveHooksPath !== 'string' || !effectiveHooksPath || /[\0\r\n]/.test(effectiveHooksPath)) {
      throw new Error(`${label} requires one bounded Git hook domain`);
    }
    const commandArgs = [
      '-c', `core.hooksPath=${effectiveHooksPath}`,
      '-c', 'credential.helper=',
      '-c', 'protocol.allow=never',
      '-c', 'commit.gpgSign=false',
      ...args
    ];
    const result = spawnSync('git', commandArgs, {
      cwd: root,
      encoding: 'utf8',
      env: createSanitizedGitEnvironment(env, { configPath: controlDomain.configPath }),
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
  } finally {
    fs.rmSync(controlDomain.directory, { recursive: true, force: true });
  }
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
  const candidateHeadSha = environment.VEXLIFE_CANDIDATE_HEAD_SHA || (syntheticMerge ? parents[1] : checkoutSha);
  const candidateTreeSha = /^[a-f0-9]{40}$/u.test(candidateHeadSha ?? '')
    ? gitOrNull(root, ['rev-parse', '--verify', `${candidateHeadSha}^{tree}`])
    : null;
  return {
    repository: { remoteUrl, slug: remoteSlug },
    git: {
      checkoutSha,
      branch,
      branchSource: localBranch ? 'GIT_WORKTREE' : environment.VEXLIFE_BRANCH ? 'ENVIRONMENT_RECEIPT' : 'UNKNOWN',
      detached,
      checkoutKind: syntheticMerge ? 'SYNTHETIC_MERGE' : detached ? 'DETACHED' : 'BRANCH',
      candidateHeadSha,
      candidateTreeSha,
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


function localSourceObservationFail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function exactObservationRoot(root) {
  const canonical = fs.realpathSync.native(path.resolve(root));
  const stat = fs.lstatSync(canonical);
  if (!stat.isDirectory()) {
    localSourceObservationFail('LOCAL_SOURCE_OBSERVATION_ROOT_INVALID', 'local source observation root must be one canonical directory');
  }
  return canonical;
}

function exactObservedPath(root, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.startsWith('/')) {
    localSourceObservationFail('LOCAL_SOURCE_OBSERVATION_PATH_INVALID', 'local source observation path must be one Git-relative path');
  }
  const target = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    localSourceObservationFail('LOCAL_SOURCE_OBSERVATION_PATH_ESCAPE', 'local source observation path escapes root: ' + relativePath);
  }
  return target;
}

function splitGitNullPaths(value) {
  return String(value ?? '').split('\0').filter(Boolean);
}

function collectGitChangedPaths(root, maxChangedPaths) {
  const staged = splitGitNullPaths(runBoundedGit(
    root,
    ['diff', '--cached', '--name-only', '--no-ext-diff', '--no-renames', '-z', 'HEAD', '--'],
    { label: 'Git staged changed paths' }
  ).stdout);
  const unstaged = splitGitNullPaths(runBoundedGit(
    root,
    ['diff', '--name-only', '--no-ext-diff', '--no-renames', '-z', '--'],
    { label: 'Git unstaged changed paths' }
  ).stdout);
  const untracked = splitGitNullPaths(runBoundedGit(
    root,
    ['ls-files', '--others', '--exclude-standard', '-z'],
    { label: 'Git untracked paths' }
  ).stdout);
  const observedPaths = [...new Set([...staged, ...unstaged, ...untracked])].sort(compareGitPaths);
  if (observedPaths.length > maxChangedPaths) {
    localSourceObservationFail(
      'LOCAL_SOURCE_OBSERVATION_PATH_LIMIT',
      'local source observation changed-path set exceeds bounded limit: ' + observedPaths.length
    );
  }
  return freeze({
    stagedPaths: Object.freeze([...new Set(staged)].sort(compareGitPaths)),
    unstagedPaths: Object.freeze([...new Set(unstaged)].sort(compareGitPaths)),
    untrackedPaths: Object.freeze([...new Set(untracked)].sort(compareGitPaths)),
    observedPaths: Object.freeze(observedPaths)
  });
}

function boundedFileSha256(filePath, expectedSize, limits, budget) {
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > limits.maxFileBytes) {
    localSourceObservationFail(
      'LOCAL_SOURCE_OBSERVATION_FILE_LIMIT',
      'local source observation file exceeds byte limit: ' + expectedSize
    );
  }
  if (budget.bytes + expectedSize > limits.maxTotalBytes) {
    localSourceObservationFail('LOCAL_SOURCE_OBSERVATION_TOTAL_LIMIT', 'local source observation exceeds total byte limit');
  }
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let observed = 0;
  const descriptor = fs.openSync(filePath, 'r');
  try {
    while (observed < expectedSize) {
      const bytes = fs.readSync(descriptor, buffer, 0, Math.min(buffer.length, expectedSize - observed), null);
      if (bytes === 0) break;
      hash.update(buffer.subarray(0, bytes));
      observed += bytes;
    }
  } finally {
    fs.closeSync(descriptor);
  }
  if (observed !== expectedSize) {
    localSourceObservationFail('LOCAL_SOURCE_OBSERVATION_FILE_RACE', 'local source observation file changed while reading');
  }
  budget.bytes += observed;
  return { bytes: observed, sha256: hash.digest('hex') };
}

function observedWorktreeRecord(root, relativePath, limits, budget) {
  const target = exactObservedPath(root, relativePath);
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return freeze({ path: relativePath, kind: 'ABSENT', mode: null, bytes: 0, sha256: null });
    }
    throw error;
  }

  if (stat.isSymbolicLink()) {
    const bytes = fs.readlinkSync(target, { encoding: 'buffer' });
    if (bytes.length > limits.maxFileBytes || budget.bytes + bytes.length > limits.maxTotalBytes) {
      localSourceObservationFail('LOCAL_SOURCE_OBSERVATION_FILE_LIMIT', 'local source observation symlink exceeds byte limit: ' + relativePath);
    }
    const after = fs.lstatSync(target);
    if (!after.isSymbolicLink() || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) {
      localSourceObservationFail('LOCAL_SOURCE_OBSERVATION_FILE_RACE', 'local source observation symlink changed during read: ' + relativePath);
    }
    budget.bytes += bytes.length;
    return freeze({
      path: relativePath,
      kind: 'SYMLINK',
      mode: '120000',
      bytes: bytes.length,
      sha256: sha256(bytes)
    });
  }

  if (!stat.isFile()) {
    localSourceObservationFail(
      'LOCAL_SOURCE_OBSERVATION_PATH_KIND_UNSUPPORTED',
      'local source observation cannot fingerprint path kind: ' + relativePath
    );
  }

  const result = boundedFileSha256(target, stat.size, limits, budget);
  const after = fs.lstatSync(target);
  if (!after.isFile() || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) {
    localSourceObservationFail('LOCAL_SOURCE_OBSERVATION_FILE_RACE', 'local source observation file changed during read: ' + relativePath);
  }
  return freeze({
    path: relativePath,
    kind: 'REGULAR_FILE',
    mode: stat.mode & 0o111 ? '100755' : '100644',
    bytes: result.bytes,
    sha256: result.sha256
  });
}

function localSourceBasis(root, environment, maxChangedPaths) {
  const repository = collectRepositoryEvidence(root, environment);
  const manifest = buildSourceManifest(root, { maxPathDiagnostics: maxChangedPaths });
  const blockers = (manifest.candidate?.blockers ?? []).map((blocker) => ({
    kind: blocker.kind,
    total: blocker.total,
    paths: [...(blocker.paths ?? [])],
    truncated: blocker.truncated === true
  }));
  if (blockers.some((blocker) => blocker.truncated)) {
    localSourceObservationFail(
      'LOCAL_SOURCE_OBSERVATION_PATH_LIMIT',
      'local Source Manifest blocker set exceeds bounded diagnostics'
    );
  }
  const unsupported = blockers.find((blocker) => blocker.kind === 'UNSUPPORTED_INDEX_ENTRY');
  if (unsupported) {
    localSourceObservationFail(
      'LOCAL_SOURCE_OBSERVATION_UNSUPPORTED_INDEX_ENTRY',
      'local source observation cannot fingerprint unsupported index entries: ' + unsupported.paths.join(',')
    );
  }

  const changes = collectGitChangedPaths(root, maxChangedPaths);
  const indexInventory = runBoundedGit(
    root,
    ['ls-files', '--cached', '--stage', '-z'],
    { label: 'Git exact index-stage inventory' }
  ).stdout;

  const core = {
    repositorySlug: repository.repository.slug ?? null,
    git: {
      checkoutSha: repository.git.checkoutSha,
      branch: repository.git.branch,
      branchSource: repository.git.branchSource,
      checkoutKind: repository.git.checkoutKind,
      candidateHeadSha: repository.git.candidateHeadSha,
      candidateTreeSha: repository.git.candidateTreeSha,
      testedMergeSha: repository.git.testedMergeSha,
      baseSha: repository.git.baseSha,
      upstreamRef: repository.git.upstreamRef,
      upstreamSha: repository.git.upstreamSha,
      ahead: repository.git.ahead,
      behind: repository.git.behind,
      workingTree: repository.git.workingTree
    },
    source: {
      schemaVersion: manifest.schemaVersion,
      manifestRef: manifest.manifestRef,
      contractSha256: manifest.contractSha256 ?? null,
      indexTreeSha256: manifest.treeSha256,
      candidateState: manifest.candidate?.state ?? 'UNKNOWN',
      blockers,
      indexStageSha256: sha256(indexInventory)
    },
    changes
  };
  return freeze({ ...core, basisFingerprint: semanticHash(core) });
}

function observeWorktreeRecords(root, observedPaths, limits) {
  const budget = { bytes: 0 };
  const records = observedPaths.map((relativePath) => observedWorktreeRecord(root, relativePath, limits, budget));
  return freeze({
    records: Object.freeze(records),
    observedBytes: budget.bytes,
    recordsSha256: semanticHash(records)
  });
}

export function collectLocalSourceObservation(root, environment = process.env, {
  maxChangedPaths = DEFAULT_LOCAL_SOURCE_OBSERVATION_MAX_PATHS,
  maxFileBytes = DEFAULT_LOCAL_SOURCE_OBSERVATION_MAX_FILE_BYTES,
  maxTotalBytes = DEFAULT_LOCAL_SOURCE_OBSERVATION_MAX_TOTAL_BYTES
} = {}) {
  if (!Number.isInteger(maxChangedPaths) || maxChangedPaths < 1 || maxChangedPaths > 4096) {
    throw new TypeError('maxChangedPaths must be an integer from 1 to 4096');
  }
  for (const [label, value] of [['maxFileBytes', maxFileBytes], ['maxTotalBytes', maxTotalBytes]]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(label + ' must be one positive safe integer');
  }
  if (maxTotalBytes < maxFileBytes) throw new TypeError('maxTotalBytes must be greater than or equal to maxFileBytes');

  const canonicalRoot = exactObservationRoot(root);
  const limits = { maxFileBytes, maxTotalBytes };
  const basisBefore = localSourceBasis(canonicalRoot, environment, maxChangedPaths);
  const firstWorktree = observeWorktreeRecords(canonicalRoot, basisBefore.changes.observedPaths, limits);
  const basisAfter = localSourceBasis(canonicalRoot, environment, maxChangedPaths);
  if (basisBefore.basisFingerprint !== basisAfter.basisFingerprint) {
    localSourceObservationFail('LOCAL_SOURCE_OBSERVATION_RACE', 'local source basis changed during observation');
  }
  const finalWorktree = observeWorktreeRecords(canonicalRoot, basisAfter.changes.observedPaths, limits);
  if (firstWorktree.recordsSha256 !== finalWorktree.recordsSha256) {
    localSourceObservationFail('LOCAL_SOURCE_OBSERVATION_RACE', 'local worktree bytes changed during observation');
  }

  const core = {
    schemaVersion: LOCAL_SOURCE_OBSERVATION_SCHEMA,
    truthClass: LOCAL_SOURCE_OBSERVATION_TRUTH_CLASS,
    currentness: 'CURRENT',
    repositorySlug: basisAfter.repositorySlug,
    git: basisAfter.git,
    source: basisAfter.source,
    changes: basisAfter.changes,
    worktree: {
      observedPathCount: basisAfter.changes.observedPaths.length,
      records: finalWorktree.records,
      observedBytes: finalWorktree.observedBytes,
      recordsSha256: finalWorktree.recordsSha256
    },
    effects: false,
    executionAuthority: 'NONE'
  };
  const semanticFingerprint = semanticHash(core);
  return freeze({
    ...core,
    observationRef: 'observation.vexlife.local-source.' + semanticFingerprint.slice(0, 24),
    semanticFingerprint
  });
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
  if (inventory.activeHookEntries.length) throw new Error(`repository hook/control material is forbidden: ${inventory.activeHookEntries.map((entry) => entry.path).join(', ')}`);
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
