#!/usr/bin/env node
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

function value(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length
    ? process.argv[index + 1]
    : null;
}

function git(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/git', args, {
      cwd: REPO_ROOT,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) reject(new Error(stderr || `git ${args.join(' ')} failed`));
      else resolve(stdout.trim());
    });
  });
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForStatus(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/v1/companion/status`, { cache: 'no-store' });
      if (response.ok) return response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`browser server did not become ready: ${lastError?.message ?? 'timeout'}`);
}

export function formVexBirthWalkthroughReceipt({
  sourceCommit,
  sourceTree,
  companionStatus,
  desktopScreenshot,
  compactScreenshot,
  visibleTruth,
  consoleErrors,
  pageErrors,
  modelTurnRequestCount
}) {
  return Object.freeze({
    schemaVersion: 'vexlife.vex-birth-lab-perceptive-walkthrough/v1',
    formedAt: new Date().toISOString(),
    sourceCommit,
    sourceTree,
    companionStatus,
    screenshots: Object.freeze({
      desktop: desktopScreenshot,
      compact: compactScreenshot
    }),
    visibleTruth: Object.freeze({ ...visibleTruth }),
    consoleErrors: Object.freeze([...consoleErrors]),
    pageErrors: Object.freeze([...pageErrors]),
    modelTurnRequestCount,
    modelCallPerformed: false,
    trainingPerformed: false,
    optimizerStepPerformed: false,
    activationPerformed: false,
    publicationPerformed: false,
    rawTranscriptIncluded: false
  });
}

export async function runVexBirthWalkthrough({
  outputRoot,
  headless = true
} = {}) {
  const out = path.resolve(
    outputRoot
      ?? path.join(REPO_ROOT, 'runtime', 'walkthrough', 'vex-birth-lab')
  );
  fs.mkdirSync(out, { recursive: true });

  const port = await reservePort();
  const origin = `http://127.0.0.1:${port}`;
  const serverStdout = [];
  const serverStderr = [];
  const server = spawn(process.execPath, ['scripts/serve-browser.mjs'], {
    cwd: REPO_ROOT,
    shell: false,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      VEXLIFE_PORT: String(port),
      VEXLIFE_COMPANION_ENDPOINT: '',
      VEXLIFE_COMPANION_MODEL: ''
    }
  });
  server.stdout.on('data', (chunk) => serverStdout.push(String(chunk)));
  server.stderr.on('data', (chunk) => serverStderr.push(String(chunk)));

  let browser = null;
  try {
    const companionStatus = await waitForStatus(origin);
    const sourceCommit = await git(['rev-parse', 'HEAD']);
    const sourceTree = await git(['rev-parse', 'HEAD^{tree}']);

    browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 980 },
      reducedMotion: 'reduce'
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    let modelTurnRequestCount = 0;

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/v1/companion/turn') {
        modelTurnRequestCount += 1;
      }
    });

    await page.goto(`${origin}/reference/browser/index.html`, {
      waitUntil: 'networkidle'
    });
    await page.waitForSelector('#openVexBirthLab', { state: 'visible' });
    await page.click('#openVexBirthLab');
    await page.waitForSelector('#vexBirthLabSurface:not([hidden])');

    const visibleTruth = await page.evaluate(() => {
      const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? null;
      return {
        title: text('#vblTitle'),
        truthBanner: text('#vblTruthBanner'),
        chapter: text('#vblChapter'),
        vbStage: text('#vblStage'),
        activeGeneration: 'G0',
        modelBindingState: text('#vblModelState'),
        sourceCurrentness: document.querySelector('.vbl-status-strip')?.textContent?.includes('Source UNKNOWN')
          ? 'UNKNOWN'
          : 'UNOBSERVED',
        trainingTruthVisible: document.querySelector('.vbl-status-strip')?.textContent?.includes('Training NOT STARTED') === true,
        baselineBadge: text('#vblBaselineBadge'),
        trainingAnnotationButtonsDisabled: [...document.querySelectorAll('[data-disposition="TRAIN"],[data-disposition="COUNTEREXAMPLE"],[data-disposition="HELD_OUT"],[data-disposition="DO_NOT_TRAIN"]')]
          .every((button) => button.disabled),
        supportControlVisible: Boolean(document.querySelector('#vblCopySupport')),
        statusZipControlVisible: Boolean(document.querySelector('#vblStatusZip')),
        controllerSnapshot: globalThis.__vexBirthLabController?.snapshot?.() ?? null
      };
    });

    const desktopScreenshot = path.join(out, 'vex-birth-lab-desktop.png');
    await page.screenshot({ path: desktopScreenshot, fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(50);
    const compactScreenshot = path.join(out, 'vex-birth-lab-compact.png');
    await page.screenshot({ path: compactScreenshot, fullPage: true });

    if (modelTurnRequestCount !== 0) {
      throw new Error(`read-only walkthrough unexpectedly issued ${modelTurnRequestCount} Companion turn request(s)`);
    }

    const receipt = formVexBirthWalkthroughReceipt({
      sourceCommit,
      sourceTree,
      companionStatus,
      desktopScreenshot: path.relative(REPO_ROOT, desktopScreenshot).split(path.sep).join('/'),
      compactScreenshot: path.relative(REPO_ROOT, compactScreenshot).split(path.sep).join('/'),
      visibleTruth,
      consoleErrors,
      pageErrors,
      modelTurnRequestCount
    });

    const receiptPath = path.join(out, 'walkthrough-receipt.json');
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    await context.close();
    return Object.freeze({
      receipt,
      receiptPath,
      serverStdout: Object.freeze([...serverStdout]),
      serverStderr: Object.freeze([...serverStderr])
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (!server.killed) {
      server.kill('SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 2_000);
        server.once('close', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
}

async function main() {
  const outputRoot = value('--out');
  const result = await runVexBirthWalkthrough({
    outputRoot,
    headless: process.argv.includes('--headed') ? false : true
  });
  process.stdout.write(`${JSON.stringify({
    receiptPath: result.receiptPath,
    receipt: result.receipt
  }, null, 2)}\n`);
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      schemaVersion: 'vexlife.vex-birth-lab-perceptive-walkthrough-error/v1',
      error: error?.message ?? String(error)
    }, null, 2)}\n`);
    process.exitCode = 2;
  });
}

// [VXG RealForever]
