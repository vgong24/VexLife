import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { compileRegistryPack } from '../src/core/registry.mjs';
import { conversationKey, createDemoData } from '../reference/browser/modules/demo-data.js';

const bundle = loadBlueprint();
const registry = compileRegistryPack(bundle);
const html = fs.readFileSync(new URL('../reference/browser/index.html', import.meta.url), 'utf8');
const browserRoot = new URL('../reference/browser/', import.meta.url);
const moduleNames = fs.readdirSync(new URL('modules/', browserRoot)).filter((name) => name.endsWith('.js')).sort();
const js = [fs.readFileSync(new URL('app.js', browserRoot), 'utf8'), ...moduleNames.map((name) => fs.readFileSync(new URL(`modules/${name}`, browserRoot), 'utf8'))].join('\n');
const css = fs.readFileSync(new URL('../reference/browser/app.css', import.meta.url), 'utf8');

test('every static browser data-node-ref resolves through the canonical registry', () => {
  const refs = [...html.matchAll(/data-node-ref="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(refs.length > 30);
  for (const ref of refs) assert.ok(registry.get(ref), `unregistered browser node ${ref}`);
});

test('browser modules remain syntactically valid after composed-foundation materialization', () => {
  for (const name of ['app.js', ...moduleNames.map((moduleName) => `modules/${moduleName}`)]) {
    const file = new URL(name, browserRoot);
    const result = spawnSync(process.execPath, ['--check', file.pathname], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  }
});

test('browser reference encodes addressed channels and append-only semantic journey projection', () => {
  assert.match(js, /projectRef/); assert.match(js, /threadRef/); assert.match(js, /channelRef/); assert.match(js, /conversationKey/);
  assert.match(js, /selectedChannelByThread/); assert.match(js, /speakerKey/); assert.match(js, /recipientKeys/); assert.match(js, /appendMessageNode/); assert.match(js, /feed\.append\(article\)/);
  assert.doesNotMatch(js, /state\.journey\s*=\s*state\.journey\.slice\(-12\)/);
  assert.match(js, /journeyProjection/); assert.match(js, /fullEventCount/); assert.match(js, /rawPointerLogging:\s*false/);
});

test('Stage B consumes canonical experience contracts and renders stable composed-foundation controls', () => {
  const bundleSource = fs.readFileSync(new URL('modules/browser-bundle.js', browserRoot), 'utf8');
  assert.match(bundleSource, /blueprint\/experience-registry\.json/);
  for (const ref of [
    'element.nav.home','element.vex.summon','element.guide.resize-nw','element.guide.resize-ne','element.guide.resize-sw','element.guide.resize-se',
    'element.terrain.semantic-depth-decrease','element.terrain.semantic-depth-status','element.terrain.semantic-depth-increase',
    'element.terrain.center-current-context','element.terrain.sibling-previous','element.terrain.sibling-next'
  ]) assert.match(html, new RegExp(`data-node-ref="${ref.replaceAll('.', '\\.')}`));
  assert.match(js, /CURRENT_SYNTHETIC_REFERENCE/);
  assert.doesNotMatch(`${html}\n${js}`, /VexOrg Demo Company|Maya Chen/);
});

test('floating Vex uses four explicit resize handles rather than CSS-only resize', () => {
  assert.match(html, /data-resize-corner="nw"/); assert.match(html, /data-resize-corner="ne"/); assert.match(html, /data-resize-corner="sw"/); assert.match(html, /data-resize-corner="se"/);
  assert.match(css, /\.guide-resize-handle/); assert.doesNotMatch(css, /resize:both/);
  assert.match(js, /KEYBOARD|keydown|ArrowRight/); assert.match(js, /vexlife\.guide\.geometry/);
  assert.match(html, /data-i18n="vessel\.guide\.name">Vex</);
});

test('Terrain browser projection keeps semantic depth independent from pixel zoom and spatial navigation', () => {
  const terrain = fs.readFileSync(new URL('modules/terrain-controller.js', browserRoot), 'utf8');
  assert.match(terrain, /pixelScale/); assert.match(terrain, /semanticDepth/); assert.match(terrain, /scale\(\$\{state\.terrain\.pixelScale\}\)/);
  assert.match(terrain, /a\.x-b\.x \|\| a\.y-b\.y/); assert.match(terrain, /action\.navigation\.sibling/); assert.match(terrain, /centerNodeRef/);
  assert.match(css, /data-semantic-depth/); assert.match(css, /overscroll-behavior:contain/);
});

test('browser catalogs contain every required visible string in all supported languages', () => {
  for (const ref of [
    'nav.home','nav.chat','nav.terrain','nav.health','vessel.guide.name','vex.summon','terrain.semantic-depth.context','terrain.center-current-context',
    'channel.companion.name','terrain.reset','project.vex-home.description','thread.guided-fresh.description','context.visible-to',
    'health.reference.summary','terrain.instructions','guide.answer.current','reply.guide'
  ]) for (const language of bundle.blueprint.product.requiredLanguages) assert.ok(bundle.strings[language][ref], `${language} missing ${ref}`);
  for (const [intentRef, ref] of [['intent.guide.current','guide.ask.current'],['intent.guide.next','guide.mode.next'],['intent.guide.protects','guide.ask.protects']]) {
    assert.match(html, new RegExp(`data-guide-intent-ref="${intentRef}"[^>]*data-i18n="${ref}"`));
  }
  assert.doesNotMatch(html, /data-guide-question/); assert.doesNotMatch(js, /\/protect\|safe\|delete\/i/); assert.match(js, /data-i18n-aria-label/);
});

test('demo conversations remain explicitly synthetic and enforce project-thread-channel ownership keys', () => {
  const storage = { getItem: () => null };
  const data = createDemoData({ storage, loadJson: (_key, fallback) => fallback });
  assert.ok(data.channels.length >= 8);
  for (const channel of data.channels) {
    assert.ok(channel.projectRef); assert.ok(channel.threadRef);
    const project = data.projects.find((candidate) => candidate.projectRef === channel.projectRef);
    assert.ok(project?.threads.some((thread) => thread.threadRef === channel.threadRef), `orphan channel ${channel.channelRef}`);
    const key = conversationKey(channel.projectRef, channel.threadRef, channel.channelRef); assert.ok(data.messages.has(key), `missing relationship store ${key}`);
    for (const message of data.messages.get(key)) { assert.equal(message.projectRef, channel.projectRef); assert.equal(message.threadRef, channel.threadRef); assert.equal(message.channelRef, channel.channelRef); }
  }
  assert.equal(data.messages.size, data.channels.length);
});

test('browser integration source preserves truthful availability and rendered EN ZH JA behavior', () => {
  const integration = fs.readFileSync(new URL('../reference/browser/integration-test.js', import.meta.url), 'utf8');
  for (const language of ['en','zh','ja']) assert.match(integration, new RegExp(`['"]${language}['"]`));
  assert.match(integration, /UNSENT_LOCAL_DRAFT/); assert.match(integration, /availability restoration auto-sent/); assert.match(integration, /Cross-thread message leakage/); assert.match(integration, /state: 'PASS'/);
});

test('static browser Health identifies unavailable and synthetic evidence', () => {
  assert.match(html, /health\.reference\.summary/); assert.match(html, /health\.value\.unavailable/); assert.match(html, /health\.value\.synthetic/); assert.match(html, /health\.value\.not-run/);
  assert.match(js, /STATIC_REFERENCE_SYNTHETIC/); assert.match(js, /repositoryReceipt: \{ state: 'NOT_RUN', executed: false/); assert.doesNotMatch(html, /status-pill healthy/);
});

test('browser server redirects into the reference directory and serves its module entry', async (t) => {
  const child = spawn(process.execPath, ['scripts/serve-browser.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, VEXLIFE_PORT: '0' }, stdio: ['ignore','pipe','pipe'] });
  t.after(() => child.kill()); child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  const serverUrl = await Promise.race([
    new Promise((resolve,reject)=>{ let stderr=''; child.stderr.on('data',(chunk)=>{stderr+=chunk;}); child.stdout.on('data',(chunk)=>{const match=chunk.match(/http:\/\/127\.0\.0\.1:\d+/);if(match)resolve(match[0]);}); child.once('exit',(code)=>reject(new Error(`browser server exited ${code}: ${stderr}`))); child.once('error',reject); }),
    delay(5000,undefined,{ref:false}).then(()=>{throw new Error('browser server did not become ready');})
  ]);
  const rootResponse=await fetch(`${serverUrl}/`,{redirect:'manual'}); assert.equal(rootResponse.status,302); assert.equal(rootResponse.headers.get('location'),'/reference/browser/');
  const documentResponse=await fetch(new URL(rootResponse.headers.get('location'),serverUrl)); assert.equal(documentResponse.status,200); assert.match(documentResponse.headers.get('content-type'),/^text\/html/); assert.match(await documentResponse.text(),/<title>VexLife Browser Reference<\/title>/);
  const moduleResponse=await fetch(new URL('app.js',documentResponse.url)); assert.equal(moduleResponse.status,200); assert.match(moduleResponse.headers.get('content-type'),/^text\/javascript/); assert.match(await moduleResponse.text(),/loadBrowserBundle/);
});

// [VXG RealForever]
