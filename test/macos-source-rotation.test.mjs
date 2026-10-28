import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  MAC_BROWSER_RECEIPT_SCHEMA,
  getOwnedBrowser
} from '../scripts/macos-lifecycle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lifecycleSource = fs.readFileSync(path.join(ROOT, 'scripts', 'macos-lifecycle.mjs'), 'utf8');

function browserEvidence({ nodeExecutablePath, repo, home, ownerToken }) {
  const args = [
    path.join(repo, 'scripts', 'serve-browser.mjs'),
    '--vexlife-browser-owner-token', ownerToken,
    '--vexlife-home', home,
    '--vexlife-repo', repo
  ];
  return {
    platform: 'darwin',
    name: path.basename(nodeExecutablePath),
    executablePath: nodeExecutablePath,
    commandLine: [nodeExecutablePath, ...args].join(' '),
    commandLineClass: 'DARWIN_PS_FLATTENED_ARGV',
    argvBoundaryPreserved: false,
    tokens: null
  };
}

test('MACUPDATE01 prior exact source can prove its browser for stop while repo substitution stays held', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-mac-source-rotation-'));
  const home = path.join(root, 'home');
  const oldRepo = path.join(root, 'source', 'old-exact-source');
  const currentRepo = path.join(root, 'source', 'current-exact-source');
  const recovery = path.join(home, 'recovery');
  fs.mkdirSync(recovery, { recursive: true });

  const nodeExecutablePath = path.join(root, 'node');
  const ownerToken = 'browser-owner-test-token';
  const receiptPath = path.join(recovery, 'browser-process.json');
  const receipt = {
    schemaVersion: MAC_BROWSER_RECEIPT_SCHEMA,
    state: 'RUNNING',
    processInstanceRef: 'browser-process.test-source-rotation',
    ownerToken,
    pid: 4242,
    nodeExecutablePath,
    serverScriptPath: path.join(oldRepo, 'scripts', 'serve-browser.mjs'),
    vexHomePath: home,
    repoRootPath: oldRepo,
    formedAtUtc: '2026-08-26T07:32:00.000Z'
  };
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

  const oldSourceEvidence = browserEvidence({ nodeExecutablePath, repo: oldRepo, home, ownerToken });
  assert.throws(
    () => getOwnedBrowser(home, currentRepo, { processEvidenceReader: () => oldSourceEvidence }),
    /browser process receipt repo identity mismatch/
  );

  const admitted = getOwnedBrowser(home, currentRepo, {
    allowRepoDrift: true,
    processEvidenceReader: () => oldSourceEvidence
  });
  assert.equal(admitted?.pid, 4242);
  assert.equal(admitted?.receiptRepo, path.resolve(oldRepo));
  assert.equal(admitted?.currentRepo, path.resolve(currentRepo));
  assert.equal(admitted?.sourceCurrent, false);

  const substitutedCurrentSourceEvidence = browserEvidence({
    nodeExecutablePath,
    repo: currentRepo,
    home,
    ownerToken
  });
  assert.throws(
    () => getOwnedBrowser(home, currentRepo, {
      allowRepoDrift: true,
      processEvidenceReader: () => substitutedCurrentSourceEvidence
    }),
    /exact process-instance ownership is not proven/
  );

  fs.writeFileSync(receiptPath, `${JSON.stringify({ ...receipt, vexHomePath: path.join(root, 'other-home') }, null, 2)}\n`);
  assert.throws(
    () => getOwnedBrowser(home, currentRepo, {
      allowRepoDrift: true,
      processEvidenceReader: () => oldSourceEvidence
    }),
    /browser process receipt Home identity mismatch/
  );

  fs.writeFileSync(receiptPath, `${JSON.stringify({
    ...receipt,
    repoRootPath: currentRepo,
    serverScriptPath: path.join(currentRepo, 'scripts', 'serve-browser.mjs')
  }, null, 2)}\n`);
  const currentSourceEvidence = browserEvidence({ nodeExecutablePath, repo: currentRepo, home, ownerToken });
  const current = getOwnedBrowser(home, currentRepo, { processEvidenceReader: () => currentSourceEvidence });
  assert.equal(current?.sourceCurrent, true);

  fs.rmSync(root, { recursive: true, force: true });
});

test('MACUPDATE02 current-source start rotates a proved prior-source browser instead of reusing it as current', () => {
  assert.match(lifecycleSource, /getOwnedBrowser\(home, repo, \{ allowRepoDrift: true \}\)/);
  assert.match(lifecycleSource, /owned\.sourceCurrent && !forceCurrentBrowserRebind/);
  assert.match(lifecycleSource, /return \{ disposition: 'REUSED_EXACT_BROWSER', pid: owned\.pid \}/);
  assert.match(lifecycleSource, /const rotation = await stopOwnedBrowser\(home, repo\);/);
  assert.match(lifecycleSource, /rotation\.sourceDisposition !== 'PRIOR_EXACT_SOURCE'/);
  assert.match(lifecycleSource, /exact prior-source browser stopped but port 18110 remains occupied/);
});

test('MACUPDATE03 recoverable Companion start forces exact current browser rebind after Heretic recovery', () => {
  assert.match(
    lifecycleSource,
    /async function startBrowser\(home, repo, initialization, \{ forceCurrentBrowserRebind = false \} = \{\}\)/
  );
  assert.match(
    lifecycleSource,
    /forceCurrentBrowserRebind\s*:\s*state === 'EXISTING_RECOVERABLE'/
  );
  assert.match(
    lifecycleSource,
    /forceCurrentBrowserRebind[\s\S]*?stopOwnedBrowser\(home, repo\)[\s\S]*?rotation\.sourceDisposition !== 'CURRENT_SOURCE'/
  );
  assert.match(
    lifecycleSource,
    /exact current browser stopped for Companion rebind but port 18110 remains occupied/
  );
  assert.match(
    lifecycleSource,
    /current-source browser rebind did not preserve exact ownership classification/
  );
});

// [VXG RealForever]
