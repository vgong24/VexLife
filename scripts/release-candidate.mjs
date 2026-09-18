#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const QUALIFIED_OUTPUT_ROOT = path.join(ROOT, 'generated', 'release-candidates');
export const PROFILE_REF =
  'profile.vexlife.operational.qwen3.5-4b.llama-cpp-b10107.windows-x64-nvidia.001';
export const DEPENDENCY_EVIDENCE_REF = 'github.issue.vextreme-sdk.662';
export const EFFECTS_FALSE = Object.freeze({
  network: false,
  provider: false,
  signing: false,
  publication: false,
  repositoryVisibility: false,
  model: false,
  Home: false,
  Memory: false,
});

const SHA_RE = /^[a-f0-9]{40}$/u;
const MAX_GIT_BUFFER = 512 * 1024 * 1024;

function cloneEffects() {
  return { ...EFFECTS_FALSE };
}

function runGit(args, { binary = false, allowFailure = false } = {}) {
  const result = spawnSync('git', ['-C', ROOT, ...args], {
    cwd: ROOT,
    encoding: binary ? null : 'utf8',
    windowsHide: true,
    maxBuffer: MAX_GIT_BUFFER,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    const stderr = binary
      ? Buffer.from(result.stderr || []).toString('utf8')
      : String(result.stderr || '');
    throw new Error(`git ${args.join(' ')} failed (${result.status}): ${stderr.trim()}`);
  }
  return result;
}

export function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function requireFullCommitSha(commitSha) {
  if (typeof commitSha !== 'string' || !SHA_RE.test(commitSha)) {
    throw new Error('source commit must be one lowercase full 40-hex Git SHA');
  }
}

export function resolveSourceIdentity(commitSha) {
  requireFullCommitSha(commitSha);
  const resolved = runGit(['rev-parse', '--verify', `${commitSha}^{commit}`])
    .stdout.trim();
  if (resolved !== commitSha) {
    throw new Error(`source commit did not resolve exactly: expected ${commitSha}, got ${resolved}`);
  }
  const treeSha = runGit(['show', '-s', '--format=%T', commitSha]).stdout.trim();
  if (!SHA_RE.test(treeSha)) throw new Error('source tree did not resolve to a full Git SHA');
  return { commitSha, treeSha };
}

export function readCommitFile(commitSha, repoPath) {
  resolveSourceIdentity(commitSha);
  const result = runGit(['show', `${commitSha}:${repoPath}`], { binary: true });
  return Buffer.from(result.stdout);
}

export function selectOperationalProfile(registry) {
  if (!registry || !Array.isArray(registry.profiles)) {
    throw new Error('operational profile registry is malformed');
  }
  const profile = registry.profiles.find((entry) => entry?.profileRef === PROFILE_REF);
  if (!profile) throw new Error(`required operational profile is absent: ${PROFILE_REF}`);
  if (profile.state !== 'RELEASE_QUALIFIED') {
    throw new Error(`operational profile is not RELEASE_QUALIFIED: ${profile.state ?? 'UNKNOWN'}`);
  }
  return profile;
}

export function resolveOperationalProfile(commitSha) {
  const bytes = readCommitFile(commitSha, 'blueprint/vex-operational-profiles.json');
  const registry = JSON.parse(bytes.toString('utf8'));
  return selectOperationalProfile(registry);
}

export function createArchiveBytes(commitSha) {
  resolveSourceIdentity(commitSha);
  const result = runGit(['archive', '--format=tar', commitSha], { binary: true });
  return Buffer.from(result.stdout);
}

function sanitizeRefPart(value) {
  const sanitized = String(value).trim().replace(/[^A-Za-z0-9._/-]+/gu, '-');
  if (!sanitized) throw new Error('toolchain reference component is empty');
  return sanitized;
}

function gitVersion() {
  return runGit(['--version']).stdout.trim();
}

function nodeVersion() {
  return process.version;
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function exactCommitLock(commitSha, repoPath, inputRef) {
  const bytes = readCommitFile(commitSha, repoPath);
  return { inputRef, sha256: sha256(bytes) };
}

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative);
}

function hasTraversalSegment(value) {
  return String(value).split(/[\\/]+/u).some((segment) => segment === '..');
}

function looksAbsoluteOnAnySupportedHost(value) {
  const text = String(value);
  return path.isAbsolute(text) ||
    /^[A-Za-z]:[\\/]/u.test(text) ||
    /^\\\\/u.test(text) ||
    /^\/\//u.test(text);
}

function assertNoExistingSymlinkComponents(targetPath) {
  const root = path.resolve(ROOT);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('output path is outside the repository root');
  }

  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) continue;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`output path contains a symbolic-link or junction ancestor: ${current}`);
    }
  }
}

export function assertQualifiedOutputDir(outputDir) {
  const qualifiedRoot = path.resolve(QUALIFIED_OUTPUT_ROOT);
  const resolved = path.resolve(outputDir);
  if (!isInside(qualifiedRoot, resolved)) {
    throw new Error('output directory must be a subdirectory of generated/release-candidates');
  }
  assertNoExistingSymlinkComponents(resolved);
  return resolved;
}

export function resolveOutputDir(commitSha, requestedOut = null) {
  requireFullCommitSha(commitSha);
  if (requestedOut == null) {
    return assertQualifiedOutputDir(path.join(QUALIFIED_OUTPUT_ROOT, commitSha));
  }
  if (typeof requestedOut !== 'string' || !requestedOut.trim()) {
    throw new Error('--out must be a non-empty relative subdirectory');
  }
  if (looksAbsoluteOnAnySupportedHost(requestedOut)) {
    throw new Error('--out must be relative to generated/release-candidates');
  }
  if (hasTraversalSegment(requestedOut)) {
    throw new Error('--out must not contain parent-directory traversal');
  }
  return assertQualifiedOutputDir(path.resolve(QUALIFIED_OUTPUT_ROOT, requestedOut));
}

export function buildReleaseCandidatePacket(commitSha) {
  const { treeSha } = resolveSourceIdentity(commitSha);
  const profile = resolveOperationalProfile(commitSha);
  const archiveBytes = createArchiveBytes(commitSha);
  const archiveSha256 = sha256(archiveBytes);
  const archiveFilename = `vexlife-source-${commitSha}.tar`;
  const artifactRef = `artifact.vexlife.source-archive.${commitSha}`;
  const buildProvenanceRef = `build.vexlife.source-archive.${commitSha}`;
  const releaseRef = `release.vexlife.unsigned-source-candidate.${commitSha}`;
  const observedGitVersion = gitVersion();
  const observedNodeVersion = nodeVersion();

  const inputLockDigests = [
    exactCommitLock(commitSha, 'package-lock.json', 'input.vexlife.package-lock'),
    exactCommitLock(
      commitSha,
      'SOURCE-MANIFEST.json',
      'input.vexlife.source-manifest-descriptor',
    ),
  ];
  const artifactDigests = [{ artifactRef, sha256: archiveSha256 }];

  const buildProvenance = {
    schemaVersion: 'distribution-trust.build-provenance/v1',
    buildProvenanceRef,
    sourceCommitSha: commitSha,
    sourceTreeSha: treeSha,
    buildRecipeRef: 'recipe.vexlife.git-archive.tar.v1',
    buildEnvironmentRef: `environment.vexlife.local-release-steward.${process.platform}.${process.arch}`,
    toolchainRefs: [
      `toolchain.git.${sanitizeRefPart(observedGitVersion)}`,
      `toolchain.node.${sanitizeRefPart(observedNodeVersion)}`,
    ],
    inputLockDigests,
    artifactDigests,
    reproducibilityState: 'DETERMINISTIC_RECIPE_NOT_INDEPENDENTLY_REPRODUCED',
    reproducibilityEvidenceRefs: [],
    effects: cloneEffects(),
  };

  const release = {
    schemaVersion: 'distribution-trust.official-release/v1',
    releaseRef,
    releaseClass: 'UNSIGNED_RELEASE_CANDIDATE',
    sourceCommitSha: commitSha,
    sourceTreeSha: treeSha,
    buildProvenanceRef,
    artifactDigests,
    dependencyEvidenceRef: DEPENDENCY_EVIDENCE_REF,
    modelProfileRef: profile.profileRef,
    policyBundleRef: null,
    permissionManifestRef: null,
    knownLimitationRefs: [
      'limitation.vexlife.release-candidate.unsigned-local-only',
      'limitation.vexlife.operational-profile.source-local-windows-only',
      'limitation.vexlife.release-candidate.not-independently-reproduced',
    ],
    signingIdentityRefs: [],
    signatureVerificationRefs: [],
    releaseAuthorityRefs: [],
    releaseAcceptanceRefs: [],
    publicationState: 'LOCAL_CANDIDATE_ONLY',
    certificationState: 'UNSIGNED_LOCAL_CANDIDATE',
    effects: cloneEffects(),
  };

  const buildBytes = jsonBytes(buildProvenance);
  const releaseBytes = jsonBytes(release);
  const checksums = [
    `${archiveSha256}  ${archiveFilename}`,
    `${sha256(buildBytes)}  build-provenance.json`,
    `${sha256(releaseBytes)}  official-release.json`,
  ].join('\n') + '\n';

  const summary = {
    schemaVersion: 'vexlife.unsigned-release-candidate-summary/v1',
    releaseRef,
    sourceCommitSha: commitSha,
    sourceTreeSha: treeSha,
    artifactRef,
    archiveFilename,
    archiveSha256,
    buildProvenanceRef,
    modelProfileRef: profile.profileRef,
    operationalProfileState: profile.state,
    dependencyEvidenceRef: DEPENDENCY_EVIDENCE_REF,
    reproducibilityState: buildProvenance.reproducibilityState,
    publicationState: release.publicationState,
    certificationState: release.certificationState,
    toolchain: {
      git: observedGitVersion,
      node: observedNodeVersion,
      platform: process.platform,
      architecture: process.arch,
    },
    inputLockDigests,
    effects: cloneEffects(),
    boundaries: [
      'UNSIGNED_RELEASE_CANDIDATE != OFFICIAL_VERIFIED_BUILD',
      'LOCAL_CANDIDATE_ONLY != PUBLICATION',
      'MODEL_PROFILE_REF != BUNDLED_MODEL_OR_RUNTIME_ARTIFACT',
    ],
  };

  return {
    identity: { commitSha, treeSha },
    archive: { filename: archiveFilename, artifactRef, bytes: archiveBytes, sha256: archiveSha256 },
    buildProvenance,
    release,
    files: {
      [archiveFilename]: archiveBytes,
      'build-provenance.json': buildBytes,
      'official-release.json': releaseBytes,
      SHA256SUMS: Buffer.from(checksums, 'utf8'),
      'RESULT-SUMMARY.json': jsonBytes(summary),
    },
    summary,
  };
}

export function defaultOutputDir(commitSha) {
  return resolveOutputDir(commitSha);
}

function writeExactFile(targetPath, bytes) {
  if (fs.existsSync(targetPath)) {
    const current = fs.readFileSync(targetPath);
    if (current.equals(bytes)) return 'REUSED_IDENTICAL';
    throw new Error(`refusing to overwrite non-identical existing output: ${targetPath}`);
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporary = `${targetPath}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  fs.writeFileSync(temporary, bytes, { flag: 'wx' });
  fs.renameSync(temporary, targetPath);
  return 'CREATED';
}

export function writeReleaseCandidatePacket(packet, outputDir) {
  const resolvedOutputDir = assertQualifiedOutputDir(outputDir);
  fs.mkdirSync(resolvedOutputDir, { recursive: true });
  assertNoExistingSymlinkComponents(resolvedOutputDir);

  const results = {};
  for (const [name, bytes] of Object.entries(packet.files)) {
    results[name] = writeExactFile(path.join(resolvedOutputDir, name), bytes);
  }
  return results;
}

function parseArgs(argv) {
  const values = { commit: null, out: null };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!['--commit', '--out'].includes(key) || !value) {
      throw new Error(
        'Usage: node scripts/release-candidate.mjs --commit <full-40-hex-sha> ' +
        '[--out <relative-subdirectory>]',
      );
    }
    if (key === '--commit') values.commit = value;
    if (key === '--out') values.out = value;
  }
  if (!values.commit) {
    throw new Error('--commit is required and must identify the exact source candidate');
  }
  return values;
}

export function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const packet = buildReleaseCandidatePacket(args.commit);
  const outputDir = resolveOutputDir(packet.identity.commitSha, args.out);
  const writes = writeReleaseCandidatePacket(packet, outputDir);
  const result = {
    ...packet.summary,
    outputDir,
    writes,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

const invokedDirectly = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (invokedDirectly) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`RELEASE_CANDIDATE_HELD: ${error.message}\n`);
    process.exitCode = 1;
  }
}

// [VXG RealForever]
