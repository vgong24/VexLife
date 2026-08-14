import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { compileRegistryPack } from '../src/core/registry.mjs';
import { conversationKey, createDemoData } from '../reference/browser/modules/demo-data.js';

const bundle = loadBlueprint();
const registry = compileRegistryPack(bundle);
const browserRoot = new URL('../reference/browser/', import.meta.url);
const html = fs.readFileSync(new URL('index.html', browserRoot), 'utf8');
const app = fs.readFileSync(new URL('app.js', browserRoot), 'utf8');
const canonical = fs.readFileSync(new URL('modules/e27-terrain-convergence.js', browserRoot), 'utf8');
const css = fs.readFileSync(new URL('e27-convergence.css', browserRoot), 'utf8');
const moduleNames = fs.readdirSync(new URL('modules/', browserRoot)).filter((name) => name.endsWith('.js')).sort();
const allJs = [app, ...moduleNames.map((name) => fs.readFileSync(new URL(`modules/${name}`, browserRoot), 'utf8'))].join('\n');

test('every static browser data-node-ref resolves through the canonical registry', () => {
  const refs = [...html.matchAll(/data-node-ref="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(refs.length > 30);
  for (const ref of refs) assert.ok(registry.get(ref), `unregistered browser node ${ref}`);
});

test('Stage B has one E2.7-rooted executable authority chain', () => {
  assert.match(html, /data-presentation-contract="contract\.vexlife\.e27\.authoritative-root\/v1"/);
  assert.match(html, /data-primary-stage="screen\.vexlife\.terrain"/);
  assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/);
  assert.match(app, /import '\.\/modules\/e27-terrain-convergence\.js'/);
  assert.doesNotMatch(app, /selectView|selection\.primary-view|state\.view\s*=\s*'chat'/);
  assert.match(canonical, /authoritativeRootDesignContract/);
  assert.match(canonical, /legacyCurrentBrowserPreservationDefault/);
  assert.doesNotMatch(canonical, /import .*app\.js/);
  assert.match(css, /CANONICAL_STAGE_B_ROOT_STYLES/);
  assert.doesNotMatch(css, /Current canonical state\/data\/controllers remain authoritative/);
});

test('browser modules remain syntactically valid', () => {
  for (const name of ['app.js', ...moduleNames.map((moduleName) => `modules/${moduleName}`)]) {
    const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(name, browserRoot))], { encoding:'utf8' });
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  }
});

test('Stage B preserves addressed conversation, stable visible Vex identity, and truthful static health', () => {
  assert.match(allJs, /projectRef/); assert.match(allJs, /threadRef/); assert.match(allJs, /channelRef/); assert.match(allJs, /conversationKey/);
  assert.match(allJs, /UNSENT_LOCAL_DRAFT/); assert.match(allJs, /vexAvailability/); assert.match(allJs, /projectVisibleVexIdentity/); assert.match(allJs, /vex\.visible\.name/);
  assert.match(canonical, /STATIC_REFERENCE_SYNTHETIC/); assert.match(canonical, /repositoryReceipt:\{state:'NOT_RUN',executed:false,currentness:'UNKNOWN'\}/);
  assert.doesNotMatch(`${html}\n${allJs}`, /VexOrg Demo Company|Maya Chen/);
});

test('demo conversations remain explicitly synthetic and relation-owned', () => {
  const data = createDemoData({ storage:{ getItem:()=>null }, loadJson:(_key,fallback)=>fallback });
  for (const channel of data.channels) {
    const project = data.projects.find((candidate) => candidate.projectRef === channel.projectRef);
    assert.ok(project?.threads.some((thread) => thread.threadRef === channel.threadRef), `orphan channel ${channel.channelRef}`);
    const key = conversationKey(channel.projectRef, channel.threadRef, channel.channelRef);
    assert.ok(data.messages.has(key));
    for (const message of data.messages.get(key)) { assert.equal(message.projectRef, channel.projectRef); assert.equal(message.threadRef, channel.threadRef); assert.equal(message.channelRef, channel.channelRef); }
  }
});

test('visible localization remains stable in all required languages', () => {
  for (const ref of ['nav.home','nav.chat','nav.terrain','nav.health','vex.visible.name','vex.summon','terrain.semantic-depth.context','terrain.center-current-context','channel.companion.name','health.reference.summary','guide.answer.current']) {
    for (const language of bundle.blueprint.product.requiredLanguages) assert.ok(bundle.strings[language][ref], `${language} missing ${ref}`);
  }
  assert.match(allJs, /data-i18n-aria-label/);
});

test('browser integration source proves Stage B root and carried safety semantics', () => {
  const integration = fs.readFileSync(new URL('integration-test.js', browserRoot), 'utf8');
  for (const language of ['en','zh','ja']) assert.match(integration, new RegExp(`['"]${language}['"]`));
  assert.match(integration, /Terrain is the single primary stage/);
  assert.match(integration, /ORDINARY_SCROLL_NEVER_COMMITS/);
  assert.match(integration, /UNSENT_LOCAL_DRAFT/);
  assert.match(integration, /Cross-thread message leakage/);
  assert.match(integration, /state:'PASS'/);
});

test('browser server serves the canonical delegator and root entry', async (t) => {
  const child = spawn(process.execPath, ['scripts/serve-browser.mjs'], { cwd:new URL('..', import.meta.url), env:{...process.env,VEXLIFE_PORT:'0'}, stdio:['ignore','pipe','pipe'] });
  t.after(() => child.kill()); child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  const serverUrl = await Promise.race([new Promise((resolve,reject)=>{let stderr='';child.stderr.on('data',(chunk)=>{stderr+=chunk;});child.stdout.on('data',(chunk)=>{const match=chunk.match(/http:\/\/127\.0\.0\.1:\d+/);if(match)resolve(match[0]);});child.once('exit',(code)=>reject(new Error(`browser server exited ${code}: ${stderr}`)));child.once('error',reject);}),delay(5000,undefined,{ref:false}).then(()=>{throw new Error('browser server did not become ready');})]);
  const rootResponse = await fetch(`${serverUrl}/`, { redirect:'manual' }); assert.equal(rootResponse.status,302); assert.equal(rootResponse.headers.get('location'),'/reference/browser/');
  const documentResponse = await fetch(new URL(rootResponse.headers.get('location'),serverUrl)); assert.equal(documentResponse.status,200); assert.match(await documentResponse.text(),/<title>VexLife Browser Reference<\/title>/);
  const appResponse = await fetch(new URL('app.js',documentResponse.url)); assert.equal(appResponse.status,200); assert.match(await appResponse.text(),/e27-terrain-convergence\.js/);
  const entryResponse = await fetch(new URL('modules/e27-terrain-convergence.js',documentResponse.url)); assert.equal(entryResponse.status,200); assert.match(await entryResponse.text(),/authoritativeRootDesignContract/);
});

// [VXG RealForever]
