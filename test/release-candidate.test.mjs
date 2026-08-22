import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  ROOT,
  QUALIFIED_OUTPUT_ROOT,
  PROFILE_REF,
  EFFECTS_FALSE,
  sha256,
  resolveSourceIdentity,
  readCommitFile,
  selectOperationalProfile,
  createArchiveBytes,
  buildReleaseCandidatePacket,
  defaultOutputDir,
  resolveOutputDir,
  assertQualifiedOutputDir,
  writeReleaseCandidatePacket,
} from '../scripts/release-candidate.mjs';

function git(args) {
  return execFileSync('git', ['-C', ROOT, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function currentHead() {
  return git(['rev-parse', 'HEAD']);
}

function allEffectsFalse(value) {
  return Object.entries(EFFECTS_FALSE).every(
    ([key]) => Object.hasOwn(value, key) && value[key] === false,
  );
}

// RC00
test('RC00 resolves one exact full source commit and tree', () => {
  const head = currentHead();
  const identity = resolveSourceIdentity(head);
  assert.equal(identity.commitSha, head);
  assert.equal(identity.treeSha, git(['show', '-s', '--format=%T', head]));
});

// RC01
test('RC01 unknown or non-exact source commits fail closed', () => {
  assert.throws(
    () => resolveSourceIdentity('0'.repeat(40)),
    /git rev-parse|failed/u,
  );
  assert.throws(
    () => resolveSourceIdentity('HEAD'),
    /lowercase full 40-hex/u,
  );
});

// RC02
test('RC02 repeated exact-commit Git archives are byte-identical', () => {
  const head = currentHead();
  const first = createArchiveBytes(head);
  const second = createArchiveBytes(head);
  assert.ok(first.length > 0);
  assert.deepEqual(first, second);
  assert.equal(sha256(first), sha256(second));
});

// RC03
test('RC03 ignored worktree-only changes cannot alter exact-commit archive identity', () => {
  const head = currentHead();
  const before = createArchiveBytes(head);
  const probeDir = path.join(ROOT, 'generated', 'release-candidates', 'test-worktree-probe');
  const probe = path.join(probeDir, 'ambient-only.txt');
  fs.mkdirSync(probeDir, { recursive: true });
  try {
    fs.writeFileSync(probe, 'not part of the exact Git commit\n', 'utf8');
    const after = createArchiveBytes(head);
    assert.deepEqual(after, before);
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
  }
});

// RC04 + RC05
test('RC04/RC05 release and provenance identities and artifact digests match exactly', () => {
  const head = currentHead();
  const packet = buildReleaseCandidatePacket(head);
  assert.equal(packet.release.sourceCommitSha, head);
  assert.equal(packet.buildProvenance.sourceCommitSha, head);
  assert.equal(packet.release.sourceTreeSha, packet.identity.treeSha);
  assert.equal(packet.buildProvenance.sourceTreeSha, packet.identity.treeSha);
  assert.equal(
    packet.release.buildProvenanceRef,
    packet.buildProvenance.buildProvenanceRef,
  );
  assert.deepEqual(packet.release.artifactDigests, packet.buildProvenance.artifactDigests);
  assert.deepEqual(packet.release.artifactDigests, [
    { artifactRef: packet.archive.artifactRef, sha256: packet.archive.sha256 },
  ]);
});

// Input-lock evidence is exact-commit evidence, not ambient worktree bytes.
test('build provenance locks exact package and Source Manifest descriptor bytes', () => {
  const head = currentHead();
  const packet = buildReleaseCandidatePacket(head);
  const expected = new Map([
    ['input.vexlife.package-lock', sha256(readCommitFile(head, 'package-lock.json'))],
    [
      'input.vexlife.source-manifest-descriptor',
      sha256(readCommitFile(head, 'SOURCE-MANIFEST.json')),
    ],
  ]);
  assert.equal(packet.buildProvenance.inputLockDigests.length, expected.size);
  for (const entry of packet.buildProvenance.inputLockDigests) {
    assert.equal(entry.sha256, expected.get(entry.inputRef));
  }
});

// RC06 + RC07 + RC08
test('RC06/RC07/RC08 unsigned evidence cannot carry signing, release authority, or effects', () => {
  const packet = buildReleaseCandidatePacket(currentHead());
  const release = packet.release;
  assert.equal(release.releaseClass, 'UNSIGNED_RELEASE_CANDIDATE');
  assert.equal(release.publicationState, 'LOCAL_CANDIDATE_ONLY');
  assert.equal(release.certificationState, 'UNSIGNED_LOCAL_CANDIDATE');
  assert.deepEqual(release.signingIdentityRefs, []);
  assert.deepEqual(release.signatureVerificationRefs, []);
  assert.deepEqual(release.releaseAuthorityRefs, []);
  assert.deepEqual(release.releaseAcceptanceRefs, []);
  assert.equal(allEffectsFalse(release.effects), true);
  assert.equal(allEffectsFalse(packet.buildProvenance.effects), true);
  assert.equal(allEffectsFalse(packet.summary.effects), true);
});

// RC09
test('RC09 packet consumes the current release-qualified profile ref without bundling model/runtime artifacts', () => {
  const packet = buildReleaseCandidatePacket(currentHead());
  assert.equal(packet.release.modelProfileRef, PROFILE_REF);
  assert.equal(packet.summary.operationalProfileState, 'RELEASE_QUALIFIED');
  assert.equal(packet.release.artifactDigests.length, 1);
  assert.equal(packet.release.artifactDigests[0].artifactRef, packet.archive.artifactRef);
  assert.match(packet.archive.filename, /^vexlife-source-[a-f0-9]{40}\.tar$/u);
});

test('RC09 stale or missing operational profile states fail closed', () => {
  assert.throws(
    () => selectOperationalProfile({ profiles: [] }),
    /required operational profile is absent/u,
  );
  assert.throws(
    () => selectOperationalProfile({ profiles: [{ profileRef: PROFILE_REF, state: 'STALE' }] }),
    /not RELEASE_QUALIFIED/u,
  );
});

// RC10
test('RC10 default output is the exact ignored/noncanonical source-managed candidate directory', () => {
  const head = currentHead();
  const output = defaultOutputDir(head);
  assert.equal(output, path.join(QUALIFIED_OUTPUT_ROOT, head));
  const gitignore = readCommitFile(head, '.gitignore').toString('utf8');
  assert.match(gitignore, /^generated\/$/mu);
  const manifest = JSON.parse(readCommitFile(head, 'SOURCE-MANIFEST.json').toString('utf8'));
  assert.ok(manifest.exclusionRules.rootDirectories.includes('generated'));
});

test('RC10 explicit output selection is contained under the qualified generated root', () => {
  const head = currentHead();
  assert.equal(
    resolveOutputDir(head, 'proof/run-1'),
    path.join(QUALIFIED_OUTPUT_ROOT, 'proof', 'run-1'),
  );
  assert.throws(
    () => resolveOutputDir(head, '../escape'),
    /parent-directory traversal/u,
  );
  assert.throws(
    () => resolveOutputDir(head, 'proof/../../escape'),
    /parent-directory traversal/u,
  );
  assert.throws(
    () => resolveOutputDir(head, path.resolve(ROOT, 'escape')),
    /relative to generated\/release-candidates/u,
  );
  assert.throws(
    () => resolveOutputDir(head, '.'),
    /subdirectory of generated\/release-candidates/u,
  );
  assert.throws(
    () => assertQualifiedOutputDir(ROOT),
    /subdirectory of generated\/release-candidates/u,
  );
});

test('RC10 write API rejects outside-root output before creating packet files', () => {
  const packet = buildReleaseCandidatePacket(currentHead());
  const outside = path.join(os.tmpdir(), `vexlife-release-candidate-outside-${process.pid}`);
  fs.rmSync(outside, { recursive: true, force: true });
  assert.throws(
    () => writeReleaseCandidatePacket(packet, outside),
    /subdirectory of generated\/release-candidates/u,
  );
  assert.equal(fs.existsSync(outside), false);
});

test('RC10 existing symlink or junction ancestors fail closed', () => {
  const head = currentHead();
  fs.mkdirSync(QUALIFIED_OUTPUT_ROOT, { recursive: true });
  const linkName = `test-output-link-${process.pid}`;
  const linkPath = path.join(QUALIFIED_OUTPUT_ROOT, linkName);
  fs.rmSync(linkPath, { recursive: true, force: true });
  try {
    fs.symlinkSync(os.tmpdir(), linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(
      () => resolveOutputDir(head, `${linkName}/nested`),
      /symbolic-link or junction ancestor/u,
    );
  } finally {
    fs.rmSync(linkPath, { recursive: true, force: true });
  }
});

test('RC10 repeated writes reuse identical in-bound packet bytes and refuse silent mutation', () => {
  const head = currentHead();
  const packet = buildReleaseCandidatePacket(head);
  const output = resolveOutputDir(head, `test-packet-${process.pid}`);
  fs.rmSync(output, { recursive: true, force: true });
  try {
    const first = writeReleaseCandidatePacket(packet, output);
    assert.ok(Object.values(first).every((value) => value === 'CREATED'));
    const second = writeReleaseCandidatePacket(packet, output);
    assert.ok(Object.values(second).every((value) => value === 'REUSED_IDENTICAL'));

    const releasePath = path.join(output, 'official-release.json');
    fs.writeFileSync(releasePath, '{}\n', 'utf8');
    assert.throws(
      () => writeReleaseCandidatePacket(packet, output),
      /refusing to overwrite non-identical existing output/u,
    );
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});

// RC11 and RC12 are cross-repository Distribution Trust verifier proof. They are
// deliberately not copied into VexLife; lifecycle proof must execute the accepted SDK verifier.

// [VXG RealForever]
