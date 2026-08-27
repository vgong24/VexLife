import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  canonicalize,
  readJson,
  requireSafeRelativePath,
  resolveSafeGeneratedReceiptPath,
  semanticHash,
  writeJson
} from '../src/core/utils.mjs';
import { validateNavigationContinuityRegistry } from '../src/core/navigation-continuity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UTILS_PATH = path.join(ROOT, 'src/core/utils.mjs');
const NAVIGATION_PATH = path.join(ROOT, 'src/core/navigation-continuity.mjs');
const REGISTRY_PATH = path.join(ROOT, 'blueprint/navigation-continuity-registry.json');
const nodeSemanticHash = (value) => crypto.createHash('sha256')
  .update(JSON.stringify(canonicalize(value)))
  .digest('hex');

function priorSafeRelativePathAcceptance(value) {
  return Boolean(value)
    && !path.isAbsolute(value)
    && !path.win32.isAbsolute(value)
    && !path.posix.isAbsolute(value)
    && !value.split(/[\\/]/u).includes('..');
}

function deterministicValues(count = 500) {
  let state = 0x6d2b79f5;
  const random = () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
  const scalar = () => {
    const pick = Math.floor(random() * 6);
    if (pick === 0) return null;
    if (pick === 1) return random() > .5;
    if (pick === 2) return Math.floor(random() * 1_000_000) - 500_000;
    if (pick === 3) return `text-${Math.floor(random() * 1e9)}-漢字-🙂`;
    if (pick === 4) return Number((random() * 1000).toFixed(6));
    return '';
  };
  const value = (depth = 0) => {
    if (depth >= 3 || random() < .42) return scalar();
    if (random() < .5) return Array.from({ length: Math.floor(random() * 5) }, () => value(depth + 1));
    const result = {};
    const keys = Array.from({ length: Math.floor(random() * 5) }, (_, index) => `k${index}_${Math.floor(random() * 1000)}`);
    for (const key of keys.reverse()) result[key] = value(depth + 1);
    return result;
  };
  return Array.from({ length: count }, () => value());
}

async function startModuleServer(t) {
  const allowed = new Map([
    ['/src/core/utils.mjs', UTILS_PATH],
    ['/src/core/navigation-continuity.mjs', NAVIGATION_PATH],
    ['/blueprint/navigation-continuity-registry.json', REGISTRY_PATH]
  ]);
  const requests = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    requests.push(url.pathname);
    if (url.pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end('<!doctype html><link rel="icon" href="data:,"><title>Navigation Continuity portability proof</title>');
      return;
    }
    const filePath = allowed.get(url.pathname);
    if (!filePath) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not admitted');
      return;
    }
    const contentType = filePath.endsWith('.json') ? 'application/json' : 'text/javascript';
    response.writeHead(200, { 'content-type': `${contentType}; charset=utf-8`, 'cache-control': 'no-store' });
    response.end(fs.readFileSync(filePath));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => server.close());
  const address = server.address();
  return { base: `http://127.0.0.1:${address.port}`, requests };
}

test('NCPORT-00 utils is browser-loadable by construction with no static node:* import', () => {
  const source = fs.readFileSync(UTILS_PATH, 'utf8');
  const staticNodeImports = source.match(/^\s*import\s+[^;]*?['"]node:[^'"]+['"];?/gmu) ?? [];
  assert.deepEqual(staticNodeImports, []);
  assert.match(source, /typeof process !== 'undefined'/u);
  assert.match(source, /import\('node:crypto'\)/u);
  assert.match(source, /import\('node:fs'\)/u);
  assert.match(source, /import\('node:path'\)/u);
});

test('NCPORT-01..04 semantic hashes preserve exact canonical SHA-256 meaning', () => {
  const fixed = [
    null,
    true,
    false,
    0,
    -42,
    '',
    'abc',
    'VexLife',
    '中文・日本語・🙂',
    { z: 1, a: 2, nested: { y: [3, 2, 1], x: 'value' } },
    Array.from({ length: 10_000 }, (_, index) => String.fromCharCode(32 + (index % 90))).join('')
  ];
  for (const value of [...fixed, ...deterministicValues()]) {
    assert.equal(semanticHash(value), nodeSemanticHash(value), JSON.stringify(value)?.slice(0, 120));
  }
  assert.deepEqual(canonicalize({ z: 1, b: { y: 2, a: 3 }, a: 4 }), {
    a: 4,
    b: { a: 3, y: 2 },
    z: 1
  });
});

test('NCPORT-05 Node filesystem/path helpers remain synchronous and behavior-compatible', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ncport-'));
  try {
    const filePath = path.join(root, 'nested', 'value.json');
    writeJson(filePath, { z: 1, a: ['x'] });
    assert.deepEqual(readJson(filePath), { z: 1, a: ['x'] });
    assert.equal(requireSafeRelativePath('generated/health/proof.json'), 'generated/health/proof.json');
    for (const unsafe of ['/absolute', '\\absolute', 'C:\\absolute', '../escape', 'a/../escape']) {
      assert.throws(() => requireSafeRelativePath(unsafe), /safe relative path/u, unsafe);
    }
    for (const candidate of [
      'relative/file.json',
      './relative/file.json',
      'a..b/file.json',
      'C:relative\\file.json',
      '/absolute',
      '\\absolute',
      '\\\\server\\share',
      'C:\\absolute',
      'C:/absolute',
      '../escape',
      'a/../escape',
      ''
    ]) {
      const expected = priorSafeRelativePathAcceptance(candidate);
      let accepted = true;
      try { requireSafeRelativePath(candidate); } catch { accepted = false; }
      assert.equal(accepted, expected, `safe-relative parity: ${JSON.stringify(candidate)}`);
    }
    assert.equal(
      resolveSafeGeneratedReceiptPath(root, 'generated/health/proof.json'),
      path.join(root, 'generated', 'health', 'proof.json')
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('NCPORT-07 real Chromium imports the unmodified Navigation Continuity graph and preserves registry fingerprint', async (t) => {
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const nodeValidation = validateNavigationContinuityRegistry(registry);
  assert.equal(nodeValidation.ok, true, JSON.stringify(nodeValidation.errors));

  const browserVectors = [
    null,
    'abc',
    '中文・日本語・🙂',
    { z: 1, a: 2, nested: { y: [3, 2, 1], x: 'value' } },
    ...deterministicValues(64)
  ].map((value) => ({ value, expected: nodeSemanticHash(value) }));

  const { base, requests } = await startModuleServer(t);
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(base);
  const browserValidation = await page.evaluate(async (browserVectors) => {
    const module = await import('/src/core/navigation-continuity.mjs');
    const utils = await import('/src/core/utils.mjs');
    const registry = await fetch('/blueprint/navigation-continuity-registry.json', { cache: 'no-store' }).then((response) => response.json());
    const validation = module.validateNavigationContinuityRegistry(registry);
    let browserFileSystemFailure = null;
    try { utils.readJson('/browser-must-not-read.json'); }
    catch (error) { browserFileSystemFailure = error.message; }
    return {
      validation,
      vectorHashes: browserVectors.map(({ value }) => utils.semanticHash(value)),
      browserFileSystemFailure,
      browserSafeRelativePath: utils.requireSafeRelativePath('generated/health/browser-proof.json'),
      exports: ['compileNavigationTopology','createNavigationContinuitySession','planNavigationRoute']
        .map((key) => [key, typeof module[key]])
    };
  }, browserVectors);
  assert.equal(browserValidation.validation.ok, true, JSON.stringify(browserValidation.validation.errors));
  assert.equal(browserValidation.validation.semanticFingerprint, nodeValidation.semanticFingerprint);
  assert.deepEqual(browserValidation.vectorHashes, browserVectors.map(({ expected }) => expected));
  assert.match(browserValidation.browserFileSystemFailure, /requires a Node\.js filesystem\/path runtime/u);
  assert.equal(browserValidation.browserSafeRelativePath, 'generated/health/browser-proof.json');
  assert.deepEqual(browserValidation.exports, [
    ['compileNavigationTopology', 'function'],
    ['createNavigationContinuitySession', 'function'],
    ['planNavigationRoute', 'function']
  ]);
  assert.deepEqual([...new Set(requests)].sort(), [
    '/',
    '/blueprint/navigation-continuity-registry.json',
    '/src/core/navigation-continuity.mjs',
    '/src/core/utils.mjs'
  ]);
});

// [VXG RealForever]
