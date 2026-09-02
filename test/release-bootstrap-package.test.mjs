import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FROZEN_RELEASE_SOURCE,
  PACKAGING_SOURCE_PATHS,
  PLATFORM_CONTRACTS,
  PROTECTED_EFFECTS_FALSE,
  assertSafeArchivePath,
  buildPlatformPackagePlan,
  buildReleaseNoticeReceipt,
  inspectTarStructure,
  resolvePackagingSourceIdentity,
  resolveQualifiedOutputDir,
  sha256,
  verifyFrozenSourceArchive,
} from '../src/core/release-bootstrap-packaging.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RETAINED_R1 = process.env.VEXLIFE_R1_REFERENCE_TAR || null;

const FIXTURE_PACKAGING_SOURCE_IDENTITY = {
  packagingSourceCommit: '1'.repeat(40),
  packagingSourceTree: '2'.repeat(40),
  packagingSourceBlobs: PACKAGING_SOURCE_PATHS.map((sourcePath, index) => ({
    path: sourcePath,
    blobSha1: String((index % 9) + 1).repeat(40),
  })),
  packagingSourceSetSha256: 'a'.repeat(64),
};

function tarHeader(name, size = 0, type = '0') {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write('0000664\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  header.write('00000000000\0', 136, 12, 'ascii');
  header.fill(0x20, 148, 156);
  header[156] = type.charCodeAt(0);
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return header;
}

function syntheticTar(name, content = Buffer.from('x')) {
  const header = tarHeader(name, content.length, '0');
  const padding = Buffer.alloc(Math.ceil(content.length / 512) * 512 - content.length);
  return Buffer.concat([header, content, padding, Buffer.alloc(1024)]);
}

test('frozen source identity is exact and remains unsigned/local-only input', () => {
  assert.deepEqual(FROZEN_RELEASE_SOURCE, {
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
  assert.equal(Object.values(PROTECTED_EFFECTS_FALSE).every((value) => value === false), true);
});

test('tar path safety rejects traversal and cross-host absolute forms', () => {
  for (const value of ['../escape', 'a/../escape', '/absolute', 'C:/absolute', '\\\\server/share']) {
    assert.throws(() => assertSafeArchivePath(value), /absolute|traversal/u);
  }
  assert.equal(assertSafeArchivePath('install/vexlife-setup.ps1'), 'install/vexlife-setup.ps1');
});

test('tar structure rejects a syntactically valid traversal entry before extraction', () => {
  const hostile = syntheticTar('../escape.txt');
  assert.throws(() => inspectTarStructure(hostile), /traversal/u);
  const safe = syntheticTar('safe/file.txt');
  assert.deepEqual(inspectTarStructure(safe), [{ path: 'safe/file.txt', type: 'FILE', bytes: 1 }]);
});

test('qualified planning output cannot escape generated release bootstrap root', () => {
  assert.throws(() => resolveQualifiedOutputDir('../escape'), /relative|child/u);
  assert.throws(() => resolveQualifiedOutputDir('C:\\escape'), /relative/u);
  const resolved = resolveQualifiedOutputDir(`test-${crypto.randomUUID()}`);
  assert.equal(resolved.startsWith(path.join(ROOT, 'generated', 'release-bootstrap-packages') + path.sep), true);
});

test('platform plans bind exact accepted setup owners and preserve all protected effects false', () => {
  const verified = {
    sourceTarSha256: FROZEN_RELEASE_SOURCE.sourceTarSha256,
    sourceTarBytes: FROZEN_RELEASE_SOURCE.sourceTarBytes,
    entryCount: 807,
  };
  for (const platform of ['windows', 'macos']) {
    const plan = buildPlatformPackagePlan(platform, verified, FIXTURE_PACKAGING_SOURCE_IDENTITY);
    assert.equal(plan.source.sourceCommit, FROZEN_RELEASE_SOURCE.sourceCommit);
    assert.equal(plan.source.sourceTree, FROZEN_RELEASE_SOURCE.sourceTree);
    assert.equal(plan.source.sourceTarSha256, FROZEN_RELEASE_SOURCE.sourceTarSha256);
    assert.equal(plan.packagingSource.packagingSourceCommit, FIXTURE_PACKAGING_SOURCE_IDENTITY.packagingSourceCommit);
    assert.equal(plan.packagingSource.packagingSourceTree, FIXTURE_PACKAGING_SOURCE_IDENTITY.packagingSourceTree);
    assert.equal(plan.packagingSource.packagingSourceBlobs.length, PACKAGING_SOURCE_PATHS.length);
    assert.equal(plan.packagingSource.packagingSourceSetSha256, FIXTURE_PACKAGING_SOURCE_IDENTITY.packagingSourceSetSha256);
    assert.equal(plan.releaseClass, 'UNSIGNED_RELEASE_CANDIDATE');
    assert.equal(plan.publicationState, 'LOCAL_CANDIDATE_ONLY');
    assert.equal(plan.certificationState, 'UNSIGNED_LOCAL_CANDIDATE');
    assert.deepEqual(plan.effects, PROTECTED_EFFECTS_FALSE);
    assert.equal(plan.excludedPayloadClasses.includes('MODEL_WEIGHTS'), true);
    assert.equal(plan.excludedPayloadClasses.includes('VEX_HOME'), true);
    assert.equal(plan.delegation.acceptedProjectionPath, PLATFORM_CONTRACTS[platform].acceptedProjectionPath);
  }
});

test('packaging source identity binds clean committed executable-source blobs and rejects a dirty substitution', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-packaging-source-identity-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  for (const relativePath of PACKAGING_SOURCE_PATHS) {
    const target = path.join(temp, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ROOT, relativePath), target);
  }
  const git = (...args) => execFileSync('git', ['-C', temp, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Vex Packaging Identity Test');
  git('config', 'user.email', 'vex-packaging-test@example.invalid');
  git('add', '--', ...PACKAGING_SOURCE_PATHS);
  git('commit', '-q', '-m', 'fixture packaging source');

  const identity = resolvePackagingSourceIdentity(temp);
  assert.match(identity.packagingSourceCommit, /^[a-f0-9]{40}$/u);
  assert.match(identity.packagingSourceTree, /^[a-f0-9]{40}$/u);
  assert.equal(identity.packagingSourceBlobs.length, PACKAGING_SOURCE_PATHS.length);
  assert.match(identity.packagingSourceSetSha256, /^[a-f0-9]{64}$/u);
  for (const entry of identity.packagingSourceBlobs) {
    assert.equal(entry.blobSha1, git('rev-parse', `HEAD:${entry.path}`));
  }

  fs.appendFileSync(path.join(temp, PACKAGING_SOURCE_PATHS[0]), '\n// substituted working-copy byte\n', 'utf8');
  assert.throws(() => resolvePackagingSourceIdentity(temp), /clean and committed/u);
});

test('release-level notice receipt distinguishes dependency metadata from bundled bytes', () => {
  const receipt = buildReleaseNoticeReceipt();
  assert.equal(receipt.projectSourceLicense, 'MPL-2.0');
  assert.equal(receipt.nodeModulesBundled, false);
  assert.deepEqual(receipt.declaredDevelopmentDependencies.map(({ name, bundledBytes }) => [name, bundledBytes]), [
    ['playwright', false],
    ['playwright-core', false],
    ['fsevents', false],
  ]);
  assert.equal(receipt.externalOperationalArtifacts.every((entry) => entry.bundledBytes === false), true);
  assert.deepEqual(receipt.effects, PROTECTED_EFFECTS_FALSE);
});

test('platform build/launcher sources contain exact source binding and no protected release command', () => {
  const files = [
    'release/windows/build-vexlife-bootstrap.ps1',
    'release/windows/bootstrap.ps1',
    'release/macos/build-vexlife-bootstrap.sh',
    'release/macos/VexLifeSetupLauncher.sh',
  ];
  for (const relativePath of files) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    assert.match(source, /a09867eb2e827cb3f4ca84b11eae87420ba58738e4dec68de8b11cce3cd84eca/u);
    assert.doesNotMatch(source, /\b(?:signtool|codesign|notarytool)\b/iu);
    assert.doesNotMatch(source, /gh\s+release\s+create/iu);
    if (relativePath.includes('build-vexlife-bootstrap')) assert.match(source, /packagePlanSha256|PACKAGE_PLAN_SHA256/u);
  }
});

test('host builders bind RPB-10 build environment and deterministic pre-container payload evidence', () => {
  const windows = fs.readFileSync(path.join(ROOT, 'release/windows/build-vexlife-bootstrap.ps1'), 'utf8');
  const macos = fs.readFileSync(path.join(ROOT, 'release/macos/build-vexlife-bootstrap.sh'), 'utf8');

  for (const source of [windows, macos]) {
    assert.match(source, /buildEnvironment/u);
    assert.match(source, /stagedPayloadInventory/u);
    assert.match(source, /byteLength/u);
    assert.match(source, /sha256/u);
    assert.match(source, /HOST_REPEAT_BUILD_QUALIFICATION_REQUIRED/u);
    assert.match(source, /signing\s*[=:]\s*(?:\$false|false)/u);
    assert.match(source, /notarization\s*[=:]\s*(?:\$false|false)/u);
    assert.match(source, /publication\s*[=:]\s*(?:\$false|false)/u);
    assert.match(source, /officialVerifiedBuildPromotion\s*[=:]\s*(?:\$false|false)/u);
  }

  assert.match(windows, /OSVersion\.Version/u);
  assert.match(windows, /PROCESSOR_ARCHITECT/u);
  assert.match(windows, /NodeVersion/u);
  assert.match(windows, /IExpress/u);
  assert.match(windows, /IExpressSha256/u);
  assert.match(windows, /IExpressVersion/u);
  assert.match(windows, /Sort-Object/u);

  assert.match(macos, /sw_vers -productVersion/u);
  assert.match(macos, /sw_vers -buildVersion/u);
  assert.match(macos, /uname -m/u);
  assert.match(macos, /\/usr\/bin\/hdiutil/u);
  assert.match(macos, /\/usr\/bin\/osacompile/u);
  assert.match(macos, /\/usr\/bin\/plutil/u);
  assert.match(macos, /rows\.sort\(\(left, right\) => left\.path\.localeCompare/u);
  assert.match(macos, /STAGED_PAYLOAD_INVENTORY_JSON/u);
});

test('retained R1 source TAR, when supplied, revalidates exact bytes and safe structure', { skip: !RETAINED_R1 }, () => {
  const verified = verifyFrozenSourceArchive(RETAINED_R1);
  assert.equal(verified.sourceTarSha256, FROZEN_RELEASE_SOURCE.sourceTarSha256);
  assert.equal(verified.sourceTarBytes, FROZEN_RELEASE_SOURCE.sourceTarBytes);
  assert.equal(verified.entryCount > 700, true);
  assert.equal(sha256(fs.readFileSync(RETAINED_R1)), FROZEN_RELEASE_SOURCE.sourceTarSha256);
});

test('one-byte archive substitution is rejected before package planning', { skip: !RETAINED_R1 }, (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-release-bootstrap-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const bytes = fs.readFileSync(RETAINED_R1);
  bytes[1024] ^= 0x01;
  const hostile = path.join(temp, 'substituted.tar');
  fs.writeFileSync(hostile, bytes);
  assert.throws(() => verifyFrozenSourceArchive(hostile), /SHA-256 mismatch/u);
});

// [VXG RealForever]
