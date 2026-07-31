import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { compileRegistryPack } from '../src/core/registry.mjs';
import { conversationKey, createDemoData } from '../reference/browser/modules/demo-data.js';

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
  assert.match(js, /projectRef/);
  assert.match(js, /threadRef/);
  assert.match(js, /channelRef/);
  assert.match(js, /conversationKey/);
  assert.match(js, /selectedChannelByThread/);
  assert.match(js, /speakerKey/);
  assert.match(js, /recipientKeys/);
  assert.match(js, /appendMessageNode/);
  assert.match(js, /feed\.append\(article\)/);
  assert.doesNotMatch(js, /scrollIntoView\([^)]*smooth/);
  assert.match(js, /rawPointerLogging:\s*false/);
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
  for (const ref of [
    'nav.chat', 'nav.terrain', 'nav.health', 'guide.title', 'channel.companion.name', 'terrain.reset',
    'project.vex-home.description', 'thread.guided-fresh.description', 'context.visible-to',
    'health.reference.summary', 'terrain.instructions', 'guide.answer.current', 'reply.guide'
  ]) {
    for (const language of bundle.blueprint.product.requiredLanguages) assert.ok(bundle.strings[language][ref], `${language} missing ${ref}`);
  }
  for (const [intentRef, ref] of [
    ['intent.guide.current', 'guide.ask.current'],
    ['intent.guide.next', 'guide.mode.next'],
    ['intent.guide.protects', 'guide.ask.protects']
  ]) {
    assert.match(html, new RegExp(`data-guide-intent-ref="${intentRef}"[^>]*data-i18n="${ref}"`));
  }
  assert.doesNotMatch(html, /data-guide-question/);
  assert.doesNotMatch(js, /\/protect\|safe\|delete\/i/);
  assert.match(js, /data-i18n-aria-label/);
});

test('demo conversations enforce project-thread-channel ownership keys', () => {
  const storage = { getItem: () => null };
  const data = createDemoData({ storage, loadJson: (_key, fallback) => fallback });
  assert.ok(data.channels.length >= 8);
  for (const channel of data.channels) {
    assert.ok(channel.projectRef);
    assert.ok(channel.threadRef);
    const project = data.projects.find((candidate) => candidate.projectRef === channel.projectRef);
    assert.ok(project?.threads.some((thread) => thread.threadRef === channel.threadRef), `orphan channel ${channel.channelRef}`);
    const key = conversationKey(channel.projectRef, channel.threadRef, channel.channelRef);
    assert.ok(data.messages.has(key), `missing relationship store ${key}`);
    for (const message of data.messages.get(key)) {
      assert.equal(message.projectRef, channel.projectRef);
      assert.equal(message.threadRef, channel.threadRef);
      assert.equal(message.channelRef, channel.channelRef);
    }
  }
  for (const project of data.projects) {
    for (const ref of [project.stringRef, project.descriptionRef]) {
      for (const language of bundle.blueprint.product.requiredLanguages) assert.ok(bundle.strings[language][ref], `${language} missing demo project string ${ref}`);
    }
    for (const thread of project.threads) {
      for (const ref of [thread.stringRef, thread.topicRef, thread.descriptionRef]) {
        for (const language of bundle.blueprint.product.requiredLanguages) assert.ok(bundle.strings[language][ref], `${language} missing demo thread string ${ref}`);
      }
    }
  }
  assert.equal(data.messages.size, data.channels.length);
});

test('real browser integration exercises isolation and rendered EN ZH JA Guide intent behavior', () => {
  const integration = fs.readFileSync(new URL('../reference/browser/integration-test.js', import.meta.url), 'utf8');
  for (const language of ['en', 'zh', 'ja']) assert.match(integration, new RegExp(`['"]${language}['"]`));
  for (const intentRef of ['intent.guide.current', 'intent.guide.next', 'intent.guide.protects']) {
    assert.match(integration, new RegExp(intentRef.replaceAll('.', '\\.')));
  }
  assert.match(integration, /Cross-thread message leakage/);
  assert.match(integration, /Visible threadRef mismatch/);
  assert.match(integration, /data\.contentRef|dataset\.contentRef/);
  assert.match(integration, /state: 'PASS'/);
});

test('static browser Health identifies unavailable and synthetic evidence', () => {
  assert.match(html, /health\.reference\.summary/);
  assert.match(html, /health\.value\.unavailable/);
  assert.match(html, /health\.value\.synthetic/);
  assert.match(html, /health\.value\.not-run/);
  assert.match(js, /STATIC_REFERENCE_SYNTHETIC/);
  assert.match(js, /repositoryReceipt: \{ state: 'NOT_RUN', executed: false/);
  assert.doesNotMatch(html, /status-pill healthy/);
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
