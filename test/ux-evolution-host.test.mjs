import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import {
  resolveUxProjectionHostSelection,
  validateUxEvolutionRegistry,
} from '../src/core/ux-evolution.mjs';

const registry = JSON.parse(fs.readFileSync(new URL('../blueprint/ux-evolution-registry.json', import.meta.url), 'utf8'));
const html = fs.readFileSync(new URL('../reference/browser/evolution/index.html', import.meta.url), 'utf8');
const hostSource = fs.readFileSync(new URL('../reference/browser/evolution/projection-host.js', import.meta.url), 'utf8');
const serverSource = fs.readFileSync(new URL('../scripts/serve-browser.mjs', import.meta.url), 'utf8');

test('E0-B host contract validates with Reference as default and no cutover authority', () => {
  const validation = validateUxEvolutionRegistry(registry);
  assert.equal(validation.state, 'PASS', validation.errors.join('\n'));
  assert.equal(validation.projectionHostRef, 'host.vexlife.ux-evolution.e0-b.001');
  assert.equal(validation.projectionHostState, 'INERT_NO_MIGRATED_SURFACES');
  assert.equal(registry.projectionHost.defaultProjection, 'REFERENCE_PROJECTION');
  assert.equal(registry.projectionHost.referenceDefaultPreserved, true);
  assert.equal(registry.projectionHost.oneActiveRenderer, true);
  assert.equal(registry.projectionHost.dualRendererMountAllowed, false);
  assert.equal(registry.projectionHost.cutoverAuthority, false);
  assert.equal(registry.projectionHost.publicationAuthority, false);
});

test('no selection keeps Reference default without persistence or user-data effects', () => {
  const result = resolveUxProjectionHostSelection(registry);
  assert.equal(result.state, 'PASS');
  assert.equal(result.selectedProjection, 'REFERENCE_PROJECTION');
  assert.equal(result.route, '/reference/browser/');
  assert.equal(result.selectionClass, 'DEFAULT_REFERENCE');
  assert.equal(result.selectionPersistence, 'NONE');
  assert.equal(result.semanticStateOwnerMutation, false);
  assert.equal(result.userDataFork, false);
  assert.equal(result.userHistoryRollback, false);
});

test('Evolution requires explicit local/dev selection', () => {
  const blocked = resolveUxProjectionHostSelection(registry, { requestedProjection: 'evolution', localExecution: false });
  assert.equal(blocked.state, 'BLOCKED');
  assert.equal(blocked.reason, 'EVOLUTION_LOCAL_DEV_ONLY');
  assert.equal(blocked.selectedProjection, null);

  const admitted = resolveUxProjectionHostSelection(registry, { requestedProjection: 'evolution', localExecution: true });
  assert.equal(admitted.state, 'PASS');
  assert.equal(admitted.selectedProjection, 'EVOLUTION_PROJECTION');
  assert.equal(admitted.route, '/reference/browser/evolution/index.html');
  assert.equal(admitted.selectionClass, 'EXPLICIT_LOCAL_DEV');
  assert.equal(admitted.oneActiveRenderer, true);
  assert.equal(admitted.priorRendererDisposition, 'DOCUMENT_UNLOADED');
});

test('unknown projection selection fails closed instead of silently changing renderers', () => {
  const result = resolveUxProjectionHostSelection(registry, { requestedProjection: 'other', localExecution: true });
  assert.equal(result.state, 'BLOCKED');
  assert.equal(result.reason, 'UNKNOWN_PROJECTION_SELECTION');
  assert.equal(result.selectedProjection, null);
  assert.equal(result.route, null);
});

test('inert Evolution document mounts no Reference adapter or semantic controller', () => {
  assert.match(html, /data-effect-class="NONE"/);
  assert.match(html, /data-publication-state="LOCAL_DEV_ONLY"/);
  assert.match(html, /src="\.\/projection-host\.js"/);
  assert.doesNotMatch(html, /\.\.\/app\.js|browser-bundle\.js/);
  assert.doesNotMatch(hostSource, /browser-bundle|create(?:Chat|Terrain|Guide|Navigation|LivingJournal|Relationships)Controller/);
  assert.doesNotMatch(hostSource, /localStorage|sessionStorage|document\.cookie|method:\s*['"]POST['"]/);
  assert.match(hostSource, /referenceRendererMounted:\s*false/);
  assert.match(hostSource, /migratedSemanticRefs/);
});

test('loopback server source applies projection selection before delegating the normal root', () => {
  assert.match(serverSource, /resolveUxProjectionHostSelection/);
  assert.match(serverSource, /url\.pathname === '\/'/);
  assert.match(serverSource, /url\.searchParams\.has\(projectionParam\)/);
  assert.match(serverSource, /localExecution:\s*true/);
  assert.match(serverSource, /X-VexLife-Projection/);
});

test('real loopback server keeps Reference default and routes explicit Evolution selection only', async (t) => {
  const child = spawn(process.execPath, ['scripts/serve-browser.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, VEXLIFE_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
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
    delay(5000, undefined, { ref: false }).then(() => { throw new Error('browser server did not become ready'); }),
  ]);

  const defaultResponse = await fetch(`${serverUrl}/`, { redirect: 'manual' });
  assert.equal(defaultResponse.status, 302);
  assert.equal(defaultResponse.headers.get('location'), '/reference/browser/');

  const evolutionResponse = await fetch(`${serverUrl}/?projection=evolution`, { redirect: 'manual' });
  assert.equal(evolutionResponse.status, 302);
  assert.equal(evolutionResponse.headers.get('location'), '/reference/browser/evolution/index.html');
  assert.equal(evolutionResponse.headers.get('x-vexlife-projection'), 'EVOLUTION_PROJECTION');

  const referenceResponse = await fetch(`${serverUrl}/?projection=reference`, { redirect: 'manual' });
  assert.equal(referenceResponse.status, 302);
  assert.equal(referenceResponse.headers.get('location'), '/reference/browser/');

  const blocked = await fetch(`${serverUrl}/?projection=unknown`, { redirect: 'manual' });
  assert.equal(blocked.status, 400);
  const blockedReceipt = await blocked.json();
  assert.equal(blockedReceipt.state, 'BLOCKED');
  assert.equal(blockedReceipt.reason, 'UNKNOWN_PROJECTION_SELECTION');

  const hostDocument = await fetch(`${serverUrl}/reference/browser/evolution/index.html`);
  assert.equal(hostDocument.status, 200);
  assert.match(await hostDocument.text(), /VexLife Evolution Host/);
});

// [VXG RealForever]
