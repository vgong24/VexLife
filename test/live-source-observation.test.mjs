import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  collectLocalSourceObservation,
  runBoundedGit
} from '../src/core/repository-evidence.mjs';

const identityEnv = Object.freeze({
  GIT_AUTHOR_NAME: 'VexLife Observation Test',
  GIT_AUTHOR_EMAIL: 'vexlife-observation-test@example.invalid',
  GIT_COMMITTER_NAME: 'VexLife Observation Test',
  GIT_COMMITTER_EMAIL: 'vexlife-observation-test@example.invalid'
});

function git(root, args) {
  return runBoundedGit(root, args, { label: 'fixture git ' + args.join(' '), env: identityEnv }).stdout.trim();
}

function fixtureRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-local-source-observation-'));
  git(root, ['init']);
  git(root, ['branch', '-M', 'main']);
  fs.writeFileSync(path.join(root, '.gitignore'), 'ignored.tmp\n', 'utf8');
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'baseline\n', 'utf8');
  git(root, ['add', '--', '.gitignore', 'tracked.txt']);
  git(root, ['commit', '-m', 'fixture baseline']);
  return root;
}

test('local source observation distinguishes same-path same-count dirty byte changes', () => {
  const root = fixtureRepository();
  try {
    const clean = collectLocalSourceObservation(root);
    assert.equal(clean.currentness, 'CURRENT');
    assert.equal(clean.source.candidateState, 'CURRENT');
    assert.equal(clean.worktree.observedPathCount, 0);
    assert.equal(clean.effects, false);
    assert.equal(clean.executionAuthority, 'NONE');

    fs.writeFileSync(path.join(root, 'tracked.txt'), 'alpha\n', 'utf8');
    const alpha = collectLocalSourceObservation(root);
    fs.writeFileSync(path.join(root, 'tracked.txt'), 'bravo\n', 'utf8');
    const bravo = collectLocalSourceObservation(root);

    assert.equal(alpha.source.candidateState, 'BLOCKED');
    assert.deepEqual(alpha.changes.observedPaths, ['tracked.txt']);
    assert.deepEqual(bravo.changes.observedPaths, ['tracked.txt']);
    assert.equal(alpha.worktree.observedPathCount, bravo.worktree.observedPathCount);
    assert.notEqual(alpha.worktree.recordsSha256, bravo.worktree.recordsSha256);
    assert.notEqual(alpha.semanticFingerprint, bravo.semanticFingerprint);
    assert.equal(JSON.stringify(alpha).includes(root), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('local source observation distinguishes index state, unstaged state, and untracked bytes', () => {
  const root = fixtureRepository();
  try {
    const clean = collectLocalSourceObservation(root);

    fs.writeFileSync(path.join(root, 'tracked.txt'), 'staged\n', 'utf8');
    git(root, ['add', '--', 'tracked.txt']);
    const staged = collectLocalSourceObservation(root);
    assert.equal(staged.source.candidateState, 'CURRENT');
    assert.deepEqual(staged.changes.stagedPaths, ['tracked.txt']);
    assert.equal(staged.worktree.observedPathCount, 1);
    assert.notEqual(staged.source.indexTreeSha256, clean.source.indexTreeSha256);
    assert.notEqual(staged.semanticFingerprint, clean.semanticFingerprint);

    fs.writeFileSync(path.join(root, 'tracked.txt'), 'baseline\n', 'utf8');
    const mixed = collectLocalSourceObservation(root);
    assert.equal(mixed.source.candidateState, 'BLOCKED');
    assert.deepEqual(mixed.changes.observedPaths, ['tracked.txt']);
    assert.equal(mixed.source.indexTreeSha256, staged.source.indexTreeSha256);
    assert.notEqual(mixed.semanticFingerprint, staged.semanticFingerprint);

    git(root, ['reset', '--hard', 'HEAD']);
    fs.writeFileSync(path.join(root, 'new.txt'), 'one\n', 'utf8');
    const untrackedOne = collectLocalSourceObservation(root);
    fs.writeFileSync(path.join(root, 'new.txt'), 'two\n', 'utf8');
    const untrackedTwo = collectLocalSourceObservation(root);
    assert.deepEqual(untrackedOne.changes.untrackedPaths, ['new.txt']);
    assert.deepEqual(untrackedTwo.changes.untrackedPaths, ['new.txt']);
    assert.notEqual(untrackedOne.worktree.recordsSha256, untrackedTwo.worktree.recordsSha256);
    assert.notEqual(untrackedOne.semanticFingerprint, untrackedTwo.semanticFingerprint);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('local source observation requires actual GitHub remote provenance before emitting owner/repo identity', () => {
  const root = fixtureRepository();
  const remoteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-local-source-remote-'));
  try {
    const deceptiveLocal = path.join(remoteRoot, 'github.com', 'fake-owner', 'fake-repo.git');
    fs.mkdirSync(path.dirname(deceptiveLocal), { recursive: true });
    git(deceptiveLocal, ['init', '--bare']);
    git(root, ['remote', 'add', 'origin', deceptiveLocal]);

    const localObserved = collectLocalSourceObservation(root);
    assert.equal(localObserved.repository.slug, null);
    assert.match(localObserved.repository.remoteIdentitySha256, /^[0-9a-f]{64}$/u);
    let serialized = JSON.stringify(localObserved);
    assert.equal(serialized.includes(root), false);
    assert.equal(serialized.includes(remoteRoot), false);

    git(root, ['remote', 'set-url', 'origin', 'https://evilgithub.com/fake-owner/fake-repo.git']);
    const foreignObserved = collectLocalSourceObservation(root);
    assert.equal(foreignObserved.repository.slug, null);
    assert.match(foreignObserved.repository.remoteIdentitySha256, /^[0-9a-f]{64}$/u);

    git(root, ['remote', 'set-url', 'origin', 'https://github.com/vgong24/VexLife.git']);
    const githubObserved = collectLocalSourceObservation(root);
    assert.equal(githubObserved.repository.slug, 'vgong24/VexLife');
    assert.equal(githubObserved.repository.remoteIdentitySha256, null);

    git(root, ['remote', 'set-url', 'origin', 'git@github.com:vgong24/VexLife.git']);
    const scpObserved = collectLocalSourceObservation(root);
    assert.equal(scpObserved.repository.slug, 'vgong24/VexLife');
    assert.equal(scpObserved.repository.remoteIdentitySha256, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(remoteRoot, { recursive: true, force: true });
  }
});

test('local source observation ignores Git-ignored ambient files and fails closed on truncated change sets', () => {
  const root = fixtureRepository();
  try {
    const beforeIgnored = collectLocalSourceObservation(root);
    fs.writeFileSync(path.join(root, 'ignored.tmp'), 'ambient\n', 'utf8');
    const afterIgnored = collectLocalSourceObservation(root);
    assert.equal(afterIgnored.semanticFingerprint, beforeIgnored.semanticFingerprint);

    fs.writeFileSync(path.join(root, 'one.txt'), 'one\n', 'utf8');
    fs.writeFileSync(path.join(root, 'two.txt'), 'two\n', 'utf8');
    assert.throws(
      () => collectLocalSourceObservation(root, process.env, { maxChangedPaths: 1 }),
      (error) => error?.code === 'LOCAL_SOURCE_OBSERVATION_PATH_LIMIT'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// [VXG RealForever]
