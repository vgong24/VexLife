import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATE = path.join(ROOT, 'docs', 'vexlife-assortment', 'practicum-candidates', 'i13b2-clean');
const BINDING = JSON.parse(fs.readFileSync(path.join(CANDIDATE, 'BINDING.json'), 'utf8'));
const PREVIEW_REF = BINDING.candidatePreviewRef;

const run = (file, args, options = {}) => execFileSync(file, args, {
  cwd: options.cwd ?? ROOT,
  env: { ...process.env, ...(options.env ?? {}) },
  encoding: 'utf8',
  stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  maxBuffer: 32 * 1024 * 1024,
});

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHttp(url, processHandle, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) throw new Error(`server exited early with ${processHandle.exitCode}`);
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) { last = error?.message ?? String(error); }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`server readiness timeout: ${last}`);
}

async function waitForDebug(debugPort, processHandle, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) throw new Error(`browser exited early with ${processHandle.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`, { cache: 'no-store' });
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) { last = error?.message ?? String(error); }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`browser debug readiness timeout: ${last}`);
}

function parseLastJson(text) {
  const start = text.indexOf('{');
  if (start < 0) throw new Error(`JSON receipt missing: ${text}`);
  return JSON.parse(text.slice(start));
}

async function continuityMetrics(page) {
  return await page.evaluate(() => {
    const root = document.querySelector('.assortment-continuity');
    if (!root) return null;
    const interactive = [...root.querySelectorAll('button, summary')].filter((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    return {
      language: document.documentElement.lang,
      title: root.querySelector('h2')?.textContent?.trim() ?? null,
      horizontalOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
      stageCount: root.querySelectorAll('.assortment-stage').length,
      currentStageCount: root.querySelectorAll('.assortment-stage[aria-current="step"]').length,
      workCardCount: root.querySelectorAll('.assortment-work-card').length,
      interactiveTargetsUnder44px: interactive.filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width < 44 || rect.height < 44;
      }).map((node) => ({ tag: node.tagName, text: node.textContent?.trim(), rect: node.getBoundingClientRect().toJSON?.() ?? null })),
      fakePercentage: /\b\d{1,3}%\b/u.test(root.textContent ?? ''),
      timelineVisible: document.querySelector('[data-view="timeline"]')?.hidden === false,
      revisitHidden: document.querySelector('[data-view="revisit"]')?.hidden === true,
    };
  });
}

test('Round-2 I13B2 clean re-form earns integrated P0-P4 and rendered evidence', { timeout: 120000 }, async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-assortment-i13b2-e2e-'));
  const sourceRoot = path.join(tempRoot, 'source');
  const profileRoot = path.join(tempRoot, 'browser-profile');
  const homeRoot = path.join(tempRoot, 'vexlife-home');
  const runtimePath = path.join(tempRoot, 'runtime.json');
  const parityReceipts = path.join(tempRoot, 'i13a-receipts.ndjson');
  const fullReceipts = path.join(tempRoot, 'i13b2-receipts.ndjson');
  const sourceSha = BINDING.liveMainAtFormation;
  const port = await freePort();
  const debugPort = await freePort();
  let serverProcess = null;
  let browserProcess = null;
  let cdpBrowser = null;

  t.after(async () => {
    try { await cdpBrowser?.close(); } catch {}
    if (browserProcess?.exitCode === null) browserProcess.kill('SIGTERM');
    if (serverProcess?.exitCode === null) serverProcess.kill('SIGTERM');
    try { run('git', ['worktree', 'remove', '--force', sourceRoot]); } catch {}
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  try { run('git', ['cat-file', '-e', `${sourceSha}^{commit}`]); }
  catch { run('git', ['fetch', '--no-tags', '--depth=1', 'origin', sourceSha]); }
  run('git', ['worktree', 'add', '--detach', sourceRoot, sourceSha]);
  assert.equal(run('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot }).trim(), sourceSha);

  const patchReceipt = parseLastJson(run(process.execPath, [path.join(CANDIDATE, 'PATCH-PREVIEW.mjs'), sourceRoot], { cwd: sourceRoot }));
  assert.equal(patchReceipt.state, 'FORMED');
  assert.equal(patchReceipt.head, sourceSha);
  run(process.execPath, ['--check', path.join(sourceRoot, 'reference/browser/app.js')], { cwd: sourceRoot });
  run(process.execPath, ['--check', path.join(sourceRoot, 'reference/browser/evolution/assortment-continuity-projection.js')], { cwd: sourceRoot });

  let serverOutput = '';
  serverProcess = spawn(process.execPath, ['scripts/serve-browser.mjs'], {
    cwd: sourceRoot,
    env: { ...process.env, VEXLIFE_PORT: String(port), VEXLIFE_HOME: homeRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
  serverProcess.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });
  const url = `http://127.0.0.1:${port}/reference/browser/?projection=evolution`;
  await waitForHttp(url, serverProcess);

  const browserPath = chromium.executablePath();
  browserProcess = spawn(browserPath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileRoot}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--no-sandbox',
    url,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  await waitForDebug(debugPort, browserProcess);
  cdpBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const context = cdpBrowser.contexts()[0];
  const page = context.pages()[0] ?? await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => document.readyState === 'complete' && Boolean(globalThis.__VEXLIFE_APP__));

  fs.writeFileSync(runtimePath, JSON.stringify({
    schemaVersion: 'vexlife-assortment.preview-runtime/v1',
    previewRef: PREVIEW_REF,
    sourceRoot,
    url,
    debugPort,
    logPath: parityReceipts,
  }, null, 2) + '\n');

  const passiveText = run(process.execPath, [
    path.join(sourceRoot, 'docs/vexlife-assortment/practicum-kit/passive-readiness.mjs'),
    '--runtime', runtimePath,
    '--contract', path.join(CANDIDATE, 'contracts/PASSIVE-READINESS.json'),
  ], { cwd: sourceRoot });
  const passive = JSON.parse(passiveText);
  assert.equal(passive.state, 'PASS');
  assert.equal(passive.appReady, true);
  assert.equal(passive.projection, 'EVOLUTION_PROJECTION');

  const parityLog = run(process.execPath, [
    path.join(ROOT, 'docs/vexlife-assortment/practicum-kit/vexwalk-runner.mjs'),
    '--runtime', runtimePath,
    '--walk', path.join(CANDIDATE, 'contracts/VEXWALK-I13A-PARITY.json'),
    '--mode', 'proof',
  ], { cwd: sourceRoot, env: { VEXWALK_STEP_DELAY_MS: '0' } });
  assert.match(parityLog, /Home → Continue/u);
  const parityLines = fs.readFileSync(parityReceipts, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(parityLines.length, 4);
  assert.ok(parityLines.every((item) => item.state === 'PASS'));

  const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
  runtime.logPath = fullReceipts;
  fs.writeFileSync(runtimePath, JSON.stringify(runtime, null, 2) + '\n');
  const fullLog = run(process.execPath, [
    path.join(ROOT, 'docs/vexlife-assortment/practicum-kit/vexwalk-runner.mjs'),
    '--runtime', runtimePath,
    '--walk', path.join(CANDIDATE, 'contracts/VEXWALK-I13B2.json'),
    '--mode', 'proof',
  ], { cwd: sourceRoot, env: { VEXWALK_STEP_DELAY_MS: '0' } });
  assert.match(fullLog, /Continuity → Back to Home/u);
  const fullLines = fs.readFileSync(fullReceipts, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(fullLines.length, 8);
  assert.ok(fullLines.every((item) => item.state === 'PASS'));
  assert.equal(fullLines.at(-1).observedSurfaceRef, null);
  assert.equal(fullLines.at(-1).journeyEvent?.actionRef, 'action.navigation.back');

  await page.locator('.e27-node[data-terrain-ref="terrain.assortment.continue"]').click();
  await page.waitForSelector('.assortment-continuity');
  const desktop = await continuityMetrics(page);
  assert.ok(desktop);
  assert.equal(desktop.language, 'en');
  assert.equal(desktop.horizontalOverflow, 0);
  assert.equal(desktop.stageCount, 8);
  assert.equal(desktop.currentStageCount, 2);
  assert.equal(desktop.workCardCount, 2);
  assert.deepEqual(desktop.interactiveTargetsUnder44px, []);
  assert.equal(desktop.fakePercentage, false);
  assert.equal(desktop.timelineVisible, true);
  assert.equal(desktop.revisitHidden, true);
  const desktopShot = await page.screenshot({ type: 'png', fullPage: false });
  console.log(`I13B2_SCREENSHOT_DESKTOP_BASE64=${desktopShot.toString('base64')}`);

  const journeyBeforeClose = await page.evaluate(() => globalThis.__VEXLIFE_APP__.navigation.fullJourney().length);
  await page.locator('#evolutionActiveSurfaceClose').click();
  await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.uxProjectionShell.snapshot().activeSurfaceRef === null);
  const journeyAfterClose = await page.evaluate(() => globalThis.__VEXLIFE_APP__.navigation.fullJourney().length);
  assert.equal(journeyAfterClose, journeyBeforeClose, 'X Close must not impersonate semantic Back');

  await page.locator('#surfaceMenuButton').click();
  await page.waitForFunction(() => document.querySelector('#surfaceMenu')?.hidden === false);
  await page.selectOption('#languageSelect', 'ja');
  await page.waitForFunction(() => document.documentElement.lang === 'ja');
  await page.evaluate(async () => { await globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__.handleTerrainNode('terrain.assortment.continue'); });
  await page.waitForFunction(() => document.querySelector('.assortment-continuity h2')?.textContent?.trim() === '連続性');
  const japanese = await continuityMetrics(page);
  assert.equal(japanese.horizontalOverflow, 0);
  assert.deepEqual(japanese.interactiveTargetsUnder44px, []);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await continuityMetrics(page);
  assert.equal(mobile.horizontalOverflow, 0);
  assert.deepEqual(mobile.interactiveTargetsUnder44px, []);
  const mobileShot = await page.screenshot({ type: 'png', fullPage: false });
  console.log(`I13B2_SCREENSHOT_MOBILE_JA_BASE64=${mobileShot.toString('base64')}`);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#evolutionActiveSurfaceClose').click();
  await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.uxProjectionShell.snapshot().activeSurfaceRef === null);
  if (await page.locator('#surfaceMenu').getAttribute('hidden') !== null) {
    await page.locator('#surfaceMenuButton').click();
    await page.waitForFunction(() => document.querySelector('#surfaceMenu')?.hidden === false);
  }
  await page.selectOption('#languageSelect', 'zh');
  await page.waitForFunction(() => document.documentElement.lang === 'zh');
  await page.evaluate(async () => { await globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__.handleTerrainNode('terrain.assortment.continue'); });
  await page.waitForFunction(() => document.querySelector('.assortment-continuity h2')?.textContent?.trim() === '连续性');
  const chinese = await continuityMetrics(page);
  assert.equal(chinese.horizontalOverflow, 0);
  assert.deepEqual(chinese.interactiveTargetsUnder44px, []);

  const receipt = {
    schemaVersion: 'vexlife-assortment.i13b2.clean-p0-p4/v1',
    previewRef: PREVIEW_REF,
    sourceSha,
    state: 'PASS',
    P0: 'PASS__EXACT_CURRENT_SOURCE_PLUS_RECONSTITUTED_I13A_PARITY',
    P1: 'PASS__PATCH_FORMATION_STATIC_WIRING_LOCALIZATION',
    P2: 'PASS__REAL_BROWSER_RUNTIME_INITIALIZED',
    P3: 'PASS__PASSIVE_INTERACTIVE_READINESS',
    P4: 'PASS__I13A_PARITY_PLUS_I13B2_EXECUTABLE_WALK_PLUS_LIVE_LOCALIZATION',
    xCloseJourneyMutation: false,
    desktop,
    japanese,
    mobile,
    chinese,
    serverOutputTail: serverOutput.slice(-800),
  };
  console.log(`I13B2_P0_P4_RECEIPT=${JSON.stringify(receipt)}`);
});

// [VXG RealForever]
