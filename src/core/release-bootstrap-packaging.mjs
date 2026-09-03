import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = path.resolve(HERE, '../..');
export const QUALIFIED_OUTPUT_ROOT = path.join(REPOSITORY_ROOT, 'generated', 'release-bootstrap-packages');

export const FROZEN_RELEASE_SOURCE = Object.freeze({
  releaseCandidateFreezeRef: 'freeze.onb-dist.vexlife.release-candidate.20260902.3d2ef4c8',
  sourceCommit: '3d2ef4c81a5b6b5a7ba717178fb3479511299e08',
  sourceTree: '8f8f945e8a448b191f85dfc327c135f54a296398',
  sourceTarFilename: 'vexlife-source-3d2ef4c81a5b6b5a7ba717178fb3479511299e08.tar',
  sourceTarSha256: 'a09867eb2e827cb3f4ca84b11eae87420ba58738e4dec68de8b11cce3cd84eca',
  sourceTarBytes: 8765440,
  r1TaskRef: 'task.onb-dist.vexlife.current-unsigned-release-reference.r1.001.a4b5ed24-e2b4-49bd-881a-3aefb34f3302',
  r1AttemptRef: 'attempt.onb-dist.vexlife.current-unsigned-release-reference.r1.001.a002.d745c8f0-3ae0-454d-9540-2bfbe45eb50c',
  r2TaskRef: 'task.onb-dist.vexlife.current-unsigned-release-reproduction.r2.001.e5f802e4-a2b0-4ac3-b28c-53858df93ff2',
  r2AttemptRef: 'attempt.onb-dist.vexlife.current-unsigned-release-reproduction.r2.001.a003.af70c9e8-b221-43f3-bdbe-93ef1703e4ca',
  r1R2TerminalReceiptRef: 'github.issue.vextreme-sdk.914.comment.5506554191',
});

export const PACKAGING_SOURCE_PATHS = Object.freeze([
  'src/core/release-bootstrap-packaging.mjs',
  'scripts/release-bootstrap-package.mjs',
  'release/windows/build-vexlife-bootstrap.ps1',
  'release/windows/bootstrap.ps1',
  'release/macos/build-vexlife-bootstrap.sh',
  'release/macos/VexLifeSetupLauncher.sh',
]);

export const PROTECTED_EFFECTS_FALSE = Object.freeze({
  signing: false,
  notarization: false,
  publication: false,
  githubReleaseCreation: false,
  repositoryVisibilityMutation: false,
  officialVerifiedBuildPromotion: false,
  modelRuntime: false,
  Home: false,
  Memory: false,
  training: false,
});

export const PLATFORM_CONTRACTS = Object.freeze({
  windows: Object.freeze({
    platform: 'windows',
    artifactClass: 'WINDOWS_UNSIGNED_DIRECT_BOOTSTRAP_CANDIDATE',
    containerClass: 'WINDOWS_IEXPRESS_SELF_EXTRACTING_EXE_CANDIDATE',
    builderPath: 'release/windows/build-vexlife-bootstrap.ps1',
    launcherPath: 'release/windows/bootstrap.ps1',
    acceptedEntryPath: 'setup-vexlife.cmd',
    acceptedProjectionPath: 'install/vexlife-setup-window.ps1',
    acceptedBackendPath: 'install/vexlife-setup.ps1',
    signingState: 'UNSIGNED',
    laterSigningClass: 'WINDOWS_AUTHENTICODE_IDENTITY_REQUIRED',
    containerDeterminismState: 'HOST_REPEAT_BUILD_QUALIFICATION_REQUIRED',
  }),
  macos: Object.freeze({
    platform: 'macos',
    artifactClass: 'MACOS_UNSIGNED_DIRECT_BOOTSTRAP_CANDIDATE',
    containerClass: 'MACOS_UNSIGNED_APP_IN_UDZO_DMG_CANDIDATE',
    builderPath: 'release/macos/build-vexlife-bootstrap.sh',
    launcherPath: 'release/macos/VexLifeSetupLauncher.sh',
    acceptedEntryPath: 'setup-vexlife.command',
    acceptedProjectionPath: 'install/vexlife-setup-window.applescript',
    acceptedBackendPath: 'install/vexlife-setup.sh',
    signingState: 'UNSIGNED',
    laterSigningClass: 'APPLE_DEVELOPER_ID_APPLICATION_AND_NOTARIZATION_REQUIRED',
    containerDeterminismState: 'HOST_REPEAT_BUILD_QUALIFICATION_REQUIRED',
  }),
});

const TAR_BLOCK = 512;
const ZERO_BLOCK = Buffer.alloc(TAR_BLOCK);
const ALLOWED_TAR_TYPES = new Set(['0', '\0', '5', 'g']);

export function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readTarString(header, start, length) {
  const field = header.subarray(start, start + length);
  const nul = field.indexOf(0);
  return field.subarray(0, nul >= 0 ? nul : field.length).toString('utf8');
}

function readTarOctal(header, start, length, label) {
  const raw = readTarString(header, start, length).trim().replace(/^0+/u, '') || '0';
  if (!/^[0-7]+$/u.test(raw)) throw new Error(`tar ${label} is not octal`);
  const value = Number.parseInt(raw, 8);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`tar ${label} is out of range`);
  return value;
}

function assertTarChecksum(header) {
  const expected = readTarOctal(header, 148, 8, 'checksum');
  let actual = 0;
  for (let index = 0; index < TAR_BLOCK; index += 1) {
    actual += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  if (actual !== expected) throw new Error(`tar checksum mismatch: expected ${expected}, got ${actual}`);
}

export function assertSafeArchivePath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new Error('tar entry path must be non-empty');
  }
  const canonical = relativePath.replace(/\\/gu, '/');
  if (canonical.startsWith('/') || canonical.startsWith('//') || /^[A-Za-z]:\//u.test(canonical)) {
    throw new Error(`tar entry path is absolute: ${relativePath}`);
  }
  const segments = canonical.split('/').filter((segment) => segment !== '');
  if (segments.length === 0 || segments.some((segment) => segment === '..' || segment === '.')) {
    throw new Error(`tar entry path contains traversal or ambiguous segments: ${relativePath}`);
  }
  return canonical;
}

export function inspectTarStructure(bytes) {
  if (!Buffer.isBuffer(bytes)) throw new TypeError('tar bytes must be a Buffer');
  if (bytes.length === 0 || bytes.length % TAR_BLOCK !== 0) {
    throw new Error('tar byte length must be a non-zero multiple of 512');
  }

  const entries = [];
  const paths = new Set();
  let offset = 0;
  let terminalZeroBlocks = 0;

  while (offset + TAR_BLOCK <= bytes.length) {
    const header = bytes.subarray(offset, offset + TAR_BLOCK);
    if (header.equals(ZERO_BLOCK)) {
      terminalZeroBlocks += 1;
      offset += TAR_BLOCK;
      if (terminalZeroBlocks >= 2) break;
      continue;
    }
    if (terminalZeroBlocks > 0) throw new Error('tar contains data after a partial zero-block terminator');
    assertTarChecksum(header);

    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const combined = prefix ? `${prefix}/${name}` : name;
    const typeFlag = String.fromCharCode(header[156] || 0);
    const size = readTarOctal(header, 124, 12, 'size');

    if (!ALLOWED_TAR_TYPES.has(typeFlag)) {
      throw new Error(`tar entry type is not admitted for the frozen source package: ${JSON.stringify(typeFlag)}`);
    }

    if (typeFlag !== 'g') {
      const canonicalPath = assertSafeArchivePath(combined);
      if (paths.has(canonicalPath)) throw new Error(`tar entry path is duplicated: ${canonicalPath}`);
      paths.add(canonicalPath);
      entries.push({
        path: canonicalPath,
        type: typeFlag === '5' ? 'DIRECTORY' : 'FILE',
        bytes: size,
      });
    }

    const padded = Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;
    offset += TAR_BLOCK + padded;
    if (offset > bytes.length) throw new Error('tar entry content extends beyond archive bytes');
  }

  if (terminalZeroBlocks < 2) throw new Error('tar archive is missing its two-block terminal marker');
  if (entries.length === 0) throw new Error('tar archive contains no source entries');
  return entries;
}

export function verifyFrozenSourceArchive(sourceTarPath) {
  if (typeof sourceTarPath !== 'string' || sourceTarPath.length === 0) {
    throw new Error('source tar path is required');
  }
  const resolved = path.resolve(sourceTarPath);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error('source tar must be a regular file');
  if (stat.size !== FROZEN_RELEASE_SOURCE.sourceTarBytes) {
    throw new Error(`source tar byte length mismatch: expected ${FROZEN_RELEASE_SOURCE.sourceTarBytes}, got ${stat.size}`);
  }
  const bytes = fs.readFileSync(resolved);
  const observedSha256 = sha256(bytes);
  if (observedSha256 !== FROZEN_RELEASE_SOURCE.sourceTarSha256) {
    throw new Error(`source tar SHA-256 mismatch: expected ${FROZEN_RELEASE_SOURCE.sourceTarSha256}, got ${observedSha256}`);
  }
  const entries = inspectTarStructure(bytes);
  return {
    sourceTarPath: resolved,
    sourceTarSha256: observedSha256,
    sourceTarBytes: stat.size,
    sourceCommit: FROZEN_RELEASE_SOURCE.sourceCommit,
    sourceTree: FROZEN_RELEASE_SOURCE.sourceTree,
    entryCount: entries.length,
    entries,
  };
}

function hasTraversalSegment(value) {
  return String(value).split(/[\\/]+/u).some((segment) => segment === '..');
}

function looksAbsoluteOnAnySupportedHost(value) {
  const text = String(value);
  return path.isAbsolute(text) || /^[A-Za-z]:[\\/]/u.test(text) || /^\\\\/u.test(text) || /^\/\//u.test(text);
}

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function assertNoExistingSymlinkComponents(targetPath) {
  const root = path.resolve(REPOSITORY_ROOT);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('output path is outside the repository root');
  }
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) continue;
    if (fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`output path contains a symbolic-link or junction ancestor: ${current}`);
    }
  }
}

export function resolveQualifiedOutputDir(requestedOut) {
  if (typeof requestedOut !== 'string' || !requestedOut.trim()) {
    throw new Error('--out must be one non-empty relative subdirectory');
  }
  if (looksAbsoluteOnAnySupportedHost(requestedOut) || hasTraversalSegment(requestedOut)) {
    throw new Error('--out must remain relative beneath generated/release-bootstrap-packages');
  }
  const qualifiedRoot = path.resolve(QUALIFIED_OUTPUT_ROOT);
  const resolved = path.resolve(qualifiedRoot, requestedOut);
  if (!isInside(qualifiedRoot, resolved)) {
    throw new Error('--out must resolve to a child of generated/release-bootstrap-packages');
  }
  assertNoExistingSymlinkComponents(resolved);
  return resolved;
}

function runGit(repositoryRoot, args) {
  try {
    return execFileSync('git', ['-C', repositoryRoot, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error
      ? String(error.stderr || '').trim()
      : '';
    throw new Error(`packaging source Git identity could not be resolved${stderr ? `: ${stderr}` : ''}`);
  }
}

export function resolvePackagingSourceIdentity(repositoryRoot = REPOSITORY_ROOT) {
  const root = path.resolve(repositoryRoot);
  const packagingSourceCommit = runGit(root, ['rev-parse', 'HEAD']);
  const packagingSourceTree = runGit(root, ['rev-parse', 'HEAD^{tree}']);
  if (!/^[a-f0-9]{40}$/u.test(packagingSourceCommit) || !/^[a-f0-9]{40}$/u.test(packagingSourceTree)) {
    throw new Error('packaging source Git commit/tree must be exact lowercase 40-hex identities');
  }

  const status = runGit(root, ['status', '--porcelain=v1', '--untracked-files=all', '--', ...PACKAGING_SOURCE_PATHS]);
  if (status) throw new Error(`packaging source paths must be clean and committed: ${status.split(/\r?\n/u)[0]}`);

  const blobs = PACKAGING_SOURCE_PATHS.map((relativePath) => {
    const committedBlob = runGit(root, ['rev-parse', `HEAD:${relativePath}`]);
    const observedBlob = runGit(root, ['hash-object', '--', relativePath]);
    if (!/^[a-f0-9]{40}$/u.test(committedBlob) || observedBlob !== committedBlob) {
      throw new Error(`packaging source blob mismatch for ${relativePath}`);
    }
    return { path: relativePath, blobSha1: committedBlob };
  });
  const packagingSourceSetSha256 = sha256(Buffer.from(
    blobs.map((entry) => `${entry.blobSha1}  ${entry.path}\n`).join(''),
    'utf8',
  ));

  return {
    packagingSourceCommit,
    packagingSourceTree,
    packagingSourceBlobs: blobs,
    packagingSourceSetSha256,
  };
}

function cloneEffects() {
  return { ...PROTECTED_EFFECTS_FALSE };
}

export function buildReleaseNoticeReceipt() {
  return {
    schemaVersion: 'vexlife.release-bootstrap-notice-receipt/v1',
    sourceCommit: FROZEN_RELEASE_SOURCE.sourceCommit,
    sourceTarSha256: FROZEN_RELEASE_SOURCE.sourceTarSha256,
    projectSourceLicense: 'MPL-2.0',
    nodeModulesBundled: false,
    declaredDevelopmentDependencies: [
      { name: 'playwright', version: '1.61.1', license: 'Apache-2.0', bundledBytes: false },
      { name: 'playwright-core', version: '1.61.1', license: 'Apache-2.0', bundledBytes: false },
      { name: 'fsevents', version: '2.3.2', license: 'MIT', optionalDarwin: true, bundledBytes: false },
    ],
    externalOperationalArtifacts: [
      { family: 'llama.cpp b10107', license: 'MIT', bundledBytes: false, redistributionClaimed: false },
      { family: 'Qwen3.5-4B GGUF derivative artifacts', license: 'Apache-2.0_REPOSITORY_DECLARED', bundledBytes: false, redistributionClaimed: false },
    ],
    historicalNoticeReconciliation: 'RELEASE_LEVEL_RECEIPT_SUPERSEDES_HISTORICAL_LAUNCH_PACK_NO_LOCKFILE_OBSERVATION_FOR_THIS_ARTIFACT',
    effects: cloneEffects(),
  };
}

export function buildPlatformPackagePlan(platform, verifiedArchive, packagingSourceIdentity) {
  const contract = PLATFORM_CONTRACTS[platform];
  if (!contract) throw new Error(`unsupported platform: ${platform}`);
  if (!verifiedArchive || verifiedArchive.sourceTarSha256 !== FROZEN_RELEASE_SOURCE.sourceTarSha256) {
    throw new Error('platform package plan requires the exact verified frozen source archive');
  }
  if (!packagingSourceIdentity || !/^[a-f0-9]{40}$/u.test(packagingSourceIdentity.packagingSourceCommit || '') ||
      !/^[a-f0-9]{40}$/u.test(packagingSourceIdentity.packagingSourceTree || '') ||
      !Array.isArray(packagingSourceIdentity.packagingSourceBlobs) ||
      packagingSourceIdentity.packagingSourceBlobs.length !== PACKAGING_SOURCE_PATHS.length ||
      !/^[a-f0-9]{64}$/u.test(packagingSourceIdentity.packagingSourceSetSha256 || '')) {
    throw new Error('platform package plan requires exact committed packaging-source identity');
  }
  return {
    schemaVersion: 'vexlife.release-bootstrap-package-plan/v1',
    packageRef: `package.vexlife.bootstrap.${platform}.${FROZEN_RELEASE_SOURCE.sourceCommit}`,
    platform,
    artifactClass: contract.artifactClass,
    containerClass: contract.containerClass,
    packagingSource: {
      packagingSourceCommit: packagingSourceIdentity.packagingSourceCommit,
      packagingSourceTree: packagingSourceIdentity.packagingSourceTree,
      packagingSourceBlobs: packagingSourceIdentity.packagingSourceBlobs,
      packagingSourceSetSha256: packagingSourceIdentity.packagingSourceSetSha256,
    },
    source: {
      releaseCandidateFreezeRef: FROZEN_RELEASE_SOURCE.releaseCandidateFreezeRef,
      sourceCommit: FROZEN_RELEASE_SOURCE.sourceCommit,
      sourceTree: FROZEN_RELEASE_SOURCE.sourceTree,
      sourceTarFilename: FROZEN_RELEASE_SOURCE.sourceTarFilename,
      sourceTarSha256: verifiedArchive.sourceTarSha256,
      sourceTarBytes: verifiedArchive.sourceTarBytes,
      sourceTarEntryCount: verifiedArchive.entryCount,
      r1R2TerminalReceiptRef: FROZEN_RELEASE_SOURCE.r1R2TerminalReceiptRef,
    },
    builderPath: contract.builderPath,
    launcherPath: contract.launcherPath,
    delegation: {
      acceptedEntryPath: contract.acceptedEntryPath,
      acceptedProjectionPath: contract.acceptedProjectionPath,
      acceptedBackendPath: contract.acceptedBackendPath,
    },
    payloadClasses: [
      'EXACT_FROZEN_SOURCE_TAR',
      'PLATFORM_BOOTSTRAP_LAUNCHER',
      'RELEASE_BUILD_PLAN_AND_NOTICE_RECEIPTS',
    ],
    excludedPayloadClasses: [
      'MODEL_WEIGHTS',
      'MODEL_PROJECTOR',
      'LLAMA_CPP_RUNTIME',
      'CUDA_RUNTIME',
      'VEX_HOME',
      'MEMORY',
      'CREDENTIALS',
    ],
    signingState: contract.signingState,
    laterSigningClass: contract.laterSigningClass,
    containerDeterminismState: contract.containerDeterminismState,
    releaseClass: 'UNSIGNED_RELEASE_CANDIDATE',
    publicationState: 'LOCAL_CANDIDATE_ONLY',
    certificationState: 'UNSIGNED_LOCAL_CANDIDATE',
    effects: cloneEffects(),
  };
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function writePlanningPacket({ platform, sourceTarPath, out }) {
  const verifiedArchive = verifyFrozenSourceArchive(sourceTarPath);
  const outputDir = resolveQualifiedOutputDir(out);
  const packagingSourceIdentity = resolvePackagingSourceIdentity();
  fs.mkdirSync(outputDir, { recursive: true });
  const plan = buildPlatformPackagePlan(platform, verifiedArchive, packagingSourceIdentity);
  const notices = buildReleaseNoticeReceipt();
  const sourceReceipt = {
    schemaVersion: 'vexlife.release-bootstrap-source-receipt/v1',
    ...FROZEN_RELEASE_SOURCE,
    observedTarSha256: verifiedArchive.sourceTarSha256,
    observedTarBytes: verifiedArchive.sourceTarBytes,
    sourceTarEntryCount: verifiedArchive.entryCount,
    exact: true,
  };
  const files = [
    ['package-plan.json', plan],
    ['release-notice-receipt.json', notices],
    ['source-archive-receipt.json', sourceReceipt],
  ];
  for (const [filename, value] of files) {
    fs.writeFileSync(path.join(outputDir, filename), jsonBytes(value), { flag: 'wx' });
  }
  return { outputDir, plan, notices, sourceReceipt };
}
