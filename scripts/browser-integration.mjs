#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { collectRepositoryEvidence } from '../src/core/repository-evidence.mjs';
import { buildSourceManifest } from '../src/core/source-manifest.mjs';
import { writeJson } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const receiptPath = path.resolve(ROOT, process.env.VEXLIFE_BROWSER_RECEIPT || 'generated/health/browser-integration.json');
const repository = collectRepositoryEvidence(ROOT);
const source = buildSourceManifest(ROOT);
const blueprint = validateBlueprint(loadBlueprint(ROOT));
const baseReceipt = {
  schemaVersion: 'vexlife.browser-execution-receipt/v0',
  receiptRef: `receipt.vexlife.browser-integration.${source.treeSha256.slice(0, 24)}`,
  candidateHeadSha: repository.git.candidateHeadSha,
  testedMergeSha: repository.git.testedMergeSha,
  baseSha: repository.git.baseSha,
  testedCheckoutSha: repository.git.checkoutSha,
  sourceTreeSha256: source.treeSha256,
  blueprintHash: blueprint.semanticHash,
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  formedAt: new Date().toISOString(),
  artifactOrReceiptRef: path.relative(ROOT, receiptPath).split(path.sep).join('/')
};

function finish(receipt, exitCode) {
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  writeJson(receiptPath, receipt);
  console.log(JSON.stringify(receipt, null, 2));
  process.exitCode = exitCode;
}

let playwright;
try {
  playwright = await import('playwright');
} catch (error) {
  finish({
    ...baseReceipt,
    state: 'ATTENTION',
    currentness: 'CURRENT',
    browser: { name: 'UNAVAILABLE', version: null },
    consoleErrors: [],
    pageErrors: [],
    error: `deterministic Playwright runtime unavailable: ${error instanceof Error ? error.message : String(error)}`
  }, 1);
}

if (playwright) {
  const server = spawn(process.execPath, ['scripts/serve-browser.mjs'], {
    cwd: ROOT,
    env: { ...process.env, VEXLIFE_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.setEncoding('utf8');
  server.stderr.setEncoding('utf8');
  let browser;
  try {
    let serverError = '';
    server.stderr.on('data', (chunk) => { serverError += chunk; });
    const serverUrl = await Promise.race([
      new Promise((resolve, reject) => {
        server.stdout.on('data', (chunk) => {
          const match = chunk.match(/http:\/\/127\.0\.0\.1:\d+/);
          if (match) resolve(match[0]);
        });
        server.once('error', reject);
        server.once('exit', (code) => reject(new Error(`browser server exited ${code}: ${serverError}`)));
      }),
      delay(10000, undefined, { ref: false }).then(() => { throw new Error('browser server readiness timed out'); })
    ]);
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`${serverUrl}/reference/browser/?integration=1`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_INTEGRATION_PROMISE__), null, { timeout: 30000 });
    const integration = await page.evaluate(async () => globalThis.__VEXLIFE_INTEGRATION_PROMISE__);
    const state = integration?.state === 'PASS' && consoleErrors.length === 0 && pageErrors.length === 0 ? 'PASS' : 'FAILED';
    finish({
      ...baseReceipt,
      state,
      currentness: 'CURRENT',
      browser: { name: browser.browserType().name(), version: browser.version() },
      consoleErrors,
      pageErrors,
      integration
    }, state === 'PASS' ? 0 : 1);
  } catch (error) {
    finish({
      ...baseReceipt,
      state: 'FAILED',
      currentness: 'CURRENT',
      browser: { name: browser?.browserType().name() ?? 'UNAVAILABLE', version: browser?.version() ?? null },
      consoleErrors: [],
      pageErrors: [],
      error: error instanceof Error ? error.message : String(error)
    }, 1);
  } finally {
    await browser?.close().catch(() => {});
    server.kill();
  }
}

// [VXG RealForever]
