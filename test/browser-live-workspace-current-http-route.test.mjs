import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BROWSER_LIVE_WORKSPACE_CURRENT_PATH,
  createVexLifeBrowserServer as createCoreVexLifeBrowserServer
} from '../scripts/serve-browser-core.mjs';
import { createVexLifeBrowserServer as createProductionVexLifeBrowserServer } from '../scripts/serve-browser.mjs';
import { createLocalSourceLiveWorkspaceConvergence } from '../src/core/live-workspace-observation.mjs';
import { runBoundedGit } from '../src/core/repository-evidence.mjs';

const identityEnv = Object.freeze({
  GIT_AUTHOR_NAME: 'VexLife Live Workspace HTTP Test',
  GIT_AUTHOR_EMAIL: 'vexlife-live-workspace-http@example.invalid',
  GIT_COMMITTER_NAME: 'VexLife Live Workspace HTTP Test',
  GIT_COMMITTER_EMAIL: 'vexlife-live-workspace-http@example.invalid'
});

function git(root, args) {
  return runBoundedGit(root, args, {
    label: 'Live Workspace HTTP fixture git ' + args.join(' '),
    env: identityEnv
  }).stdout.trim();
}

function fixtureRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-live-workspace-http-'));
  git(root, ['init']);
  git(root, ['branch', '-M', 'main']);
  fs.writeFileSync(path.join(root, '.gitignore'), 'ambient.tmp\n', 'utf8');
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'baseline\n', 'utf8');
  git(root, ['add', '--', '.gitignore', 'tracked.txt']);
  git(root, ['commit', '-m', 'fixture baseline']);
  return root;
}

async function withServer(options, run) {
  const server = createCoreVexLifeBrowserServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    await run('http://127.0.0.1:' + address.port);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('Live Workspace current route re-observes exact local-source truth and preserves semantic revisions', async () => {
  const root = fixtureRepository();
  try {
    await withServer({ liveWorkspaceSourceRoot: root }, async (base) => {
      const initialResponse = await fetch(base + BROWSER_LIVE_WORKSPACE_CURRENT_PATH);
      assert.equal(initialResponse.status, 200);
      const initial = await initialResponse.json();
      assert.equal(initial.schemaVersion, 'vexlife.live-workspace-observation/v1');
      assert.equal(initial.state, 'CURRENT');
      assert.equal(initial.currentness, 'CURRENT');
      assert.equal(initial.revision, 1);
      assert.equal(initial.observation.truthClass, 'SOURCE_BOUND_LOCAL_SOURCE_OBSERVATION');
      assert.equal(initial.effects, false);
      assert.equal(initial.executionAuthority, 'NONE');

      fs.writeFileSync(path.join(root, 'tracked.txt'), 'alpha\n', 'utf8');
      const alpha = await (await fetch(base + BROWSER_LIVE_WORKSPACE_CURRENT_PATH)).json();
      assert.equal(alpha.revision, 2);
      assert.deepEqual(alpha.observation.changes.observedPaths, ['tracked.txt']);

      fs.writeFileSync(path.join(root, 'tracked.txt'), 'bravo\n', 'utf8');
      const bravo = await (await fetch(base + BROWSER_LIVE_WORKSPACE_CURRENT_PATH)).json();
      assert.equal(bravo.revision, 3);
      assert.deepEqual(bravo.observation.changes.observedPaths, ['tracked.txt']);
      assert.notEqual(bravo.observation.worktree.recordsSha256, alpha.observation.worktree.recordsSha256);

      fs.writeFileSync(path.join(root, 'ambient.tmp'), 'ignored\n', 'utf8');
      const ignored = await (await fetch(base + BROWSER_LIVE_WORKSPACE_CURRENT_PATH)).json();
      assert.equal(ignored.revision, 3);
      assert.equal(ignored.state, 'CURRENT');
      assert.equal(ignored.currentness, 'CURRENT');
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Live Workspace current route returns held last-known-good without leaking source-root detail', async () => {
  const root = fixtureRepository();
  try {
    const convergence = createLocalSourceLiveWorkspaceConvergence({
      sourceRoot: root,
      environment: {},
      observationOptions: { maxChangedPaths: 1 }
    });
    await withServer({ liveWorkspaceConvergence: convergence }, async (base) => {
      const initial = await (await fetch(base + BROWSER_LIVE_WORKSPACE_CURRENT_PATH)).json();
      assert.equal(initial.state, 'CURRENT');
      assert.equal(initial.revision, 1);

      fs.writeFileSync(path.join(root, 'one.txt'), 'one\n', 'utf8');
      fs.writeFileSync(path.join(root, 'two.txt'), 'two\n', 'utf8');
      const held = await (await fetch(base + BROWSER_LIVE_WORKSPACE_CURRENT_PATH)).json();

      assert.equal(held.state, 'HELD_LAST_KNOWN_GOOD');
      assert.equal(held.currentness, 'UNKNOWN');
      assert.equal(held.revision, 1);
      assert.equal(held.observation, null);
      assert.equal(held.failureCode, 'LOCAL_SOURCE_OBSERVATION_PATH_LIMIT');
      assert.equal(held.lastKnownGood.observation.truthClass, 'SOURCE_BOUND_LOCAL_SOURCE_OBSERVATION');
      assert.equal(JSON.stringify(held).includes(root), false);
      assert.equal(held.effects, false);
      assert.equal(held.executionAuthority, 'NONE');
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Live Workspace current route is GET-only and rejected methods do not trigger observation', async () => {
  const root = fixtureRepository();
  try {
    const convergence = createLocalSourceLiveWorkspaceConvergence({ sourceRoot: root, environment: {} });
    await withServer({ liveWorkspaceConvergence: convergence }, async (base) => {
      assert.equal(convergence.snapshot().revision, 0);
      const response = await fetch(base + BROWSER_LIVE_WORKSPACE_CURRENT_PATH, { method: 'POST' });
      assert.equal(response.status, 405);
      assert.equal(response.headers.get('allow'), 'GET');
      assert.equal(convergence.snapshot().revision, 0);
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('production browser server keeps Live Workspace projection source-managed', () => {
  const root = fixtureRepository();
  try {
    assert.throws(
      () => createProductionVexLifeBrowserServer({ liveWorkspaceSourceRoot: root }),
      /Live Workspace projection is source-managed/u
    );
    const convergence = createLocalSourceLiveWorkspaceConvergence({ sourceRoot: root, environment: {} });
    assert.throws(
      () => createProductionVexLifeBrowserServer({ liveWorkspaceConvergence: convergence }),
      /Live Workspace projection is source-managed/u
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// [VXG RealForever]
