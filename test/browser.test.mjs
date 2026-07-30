import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { compileRegistryPack } from '../src/core/registry.mjs';

const bundle = loadBlueprint();
const registry = compileRegistryPack(bundle);
const html = fs.readFileSync(new URL('../reference/browser/index.html', import.meta.url), 'utf8');
const browserRoot = new URL('../reference/browser/', import.meta.url);
const js = [
  fs.readFileSync(new URL('app.js', browserRoot), 'utf8'),
  ...fs.readdirSync(new URL('modules/', browserRoot)).filter((name) => name.endsWith('.js')).sort().map((name) => fs.readFileSync(new URL(`modules/${name}`, browserRoot), 'utf8'))
].join('\n');
const css = fs.readFileSync(new URL('../reference/browser/app.css', import.meta.url), 'utf8');

test('every static browser data-node-ref resolves through the canonical registry', () => {
  const refs = [...html.matchAll(/data-node-ref="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(refs.length > 20);
  for (const ref of refs) assert.ok(registry.get(ref), `unregistered browser node ${ref}`);
});

test('browser reference encodes addressed channels and incremental bottom append', () => {
  assert.match(js, /speakerKey/);
  assert.match(js, /recipientKeys/);
  assert.match(js, /appendMessageNode/);
  assert.match(js, /feed\.append\(article\)/);
  assert.doesNotMatch(js, /scrollIntoView\([^)]*smooth/);
  assert.match(js, /raw pointer logging/i);
});

test('browser reference exposes floating Guide, semantic selection and readable Terrain typography', () => {
  assert.match(html, /id="guideWindow"/);
  assert.match(css, /\.guide-window\{position:fixed/);
  assert.match(css, /resize:both/);
  assert.match(js, /data-selection-group/);
  assert.match(css, /--node-title:21px/);
  assert.match(js, /action\.terrain\.node\.collapse/);
});

test('browser catalogs contain every required visible string in all supported languages', () => {
  for (const ref of ['nav.chat', 'nav.terrain', 'nav.health', 'guide.title', 'channel.companion.name', 'terrain.reset']) {
    for (const language of bundle.blueprint.product.requiredLanguages) assert.ok(bundle.strings[language][ref], `${language} missing ${ref}`);
  }
  for (const [question, ref] of [['current', 'guide.ask.current'], ['next', 'guide.mode.next'], ['protects', 'guide.ask.protects']]) {
    assert.match(html, new RegExp(`data-guide-question="${question}"[^>]*data-i18n="${ref}"`));
  }
  assert.match(js, /data-i18n-aria-label/);
});

test('browser server redirects into the reference directory and serves its module entry', async (t) => {
  const child = spawn(process.execPath, ['scripts/serve-browser.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, VEXLIFE_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  const serverUrl = await Promise.race([
    new Promise((resolve, reject) => {
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.stdout.on('data', (chunk) => {
        const match = chunk.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) resolve(match[0]);
      });
      child.once('exit', (code) => reject(new Error(`browser server exited ${code}: ${stderr}`)));
      child.once('error', reject);
    }),
    delay(5000, undefined, { ref: false }).then(() => { throw new Error('browser server did not become ready'); })
  ]);

  const rootResponse = await fetch(`${serverUrl}/`, { redirect: 'manual' });
  assert.equal(rootResponse.status, 302);
  assert.equal(rootResponse.headers.get('location'), '/reference/browser/');

  const documentResponse = await fetch(new URL(rootResponse.headers.get('location'), serverUrl));
  assert.equal(documentResponse.status, 200);
  assert.match(documentResponse.headers.get('content-type'), /^text\/html/);
  assert.match(await documentResponse.text(), /<title>VexLife Browser Reference<\/title>/);

  const moduleResponse = await fetch(new URL('app.js', documentResponse.url));
  assert.equal(moduleResponse.status, 200);
  assert.match(moduleResponse.headers.get('content-type'), /^text\/javascript/);
  assert.match(await moduleResponse.text(), /loadBrowserBundle/);
});

// [VXG RealForever]
