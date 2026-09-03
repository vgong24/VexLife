import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { createBrowserRelationshipsCdrObservationBridge } from '../src/core/browser-relationships-cdr-observation-bridge.mjs';
import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELATIONSHIPS_TERRAIN_REF = 'terrain.resource.relationships';

function observation() {
  return {
    schemaVersion: 'vexlife.friend-cdr-observation/v1',
    sourceWitness: {
      receiptRef: 'receipt.cdr.friend.visible.001',
      procedureRef: 'procedure.cdr.s5.single-pair-rehearsal.001',
      currentnessRef: 'currentness.cdr.friend.visible.001',
      scenarioRef: 'scenario.friend.visible.001',
      candidateRef: 'candidate.friend.visible.001'
    },
    productGate: {
      alphaConsentAcknowledged: true,
      invitationState: 'RECEIVED_VERIFIED_REFERENCE',
      invitationDecision: 'ACCEPT',
      identityState: 'VERIFIED_CURRENT',
      presenceClass: 'APP_ON_MODEL_UNLOADED',
      routeClass: 'DIRECT_CANDIDATE',
      failureState: 'NONE',
      withdrawn: false,
      revoked: false,
      disconnected: false,
      blocked: false
    },
    local: {
      stateRootRef: 'state.relationships.visible.local',
      deviceRef: 'device.visible.local.1',
      participantRef: 'participant.visible.local',
      peerParticipantRef: 'participant.visible.peer',
      processInstanceRef: 'instance.relationships.visible.local.1',
      authorityRef: 'authority.cdr.visible.local.1'
    },
    peer: {
      stateRootRef: 'state.relationships.visible.peer',
      deviceRef: 'device.visible.peer.1',
      participantRef: 'participant.visible.peer',
      peerParticipantRef: 'participant.visible.local',
      processInstanceRef: 'instance.relationships.visible.peer.1',
      authorityRef: 'authority.cdr.visible.peer.1',
      currentKeyRef: 'key.visible.peer.current.1',
      currentnessRef: 'currentness.visible.peer.1'
    },
    invitation: {
      invitationRef: 'invitation.visible.friend.1',
      currentnessRef: 'currentness.visible.invitation.1',
      localParticipantRef: 'participant.visible.local',
      counterpartParticipantRef: 'participant.visible.peer'
    },
    currentness: {
      observationState: 'CURRENT',
      invitationState: 'CURRENT',
      peerState: 'CURRENT'
    },
    runtime: {
      routeRef: null,
      sessionGeneration: null,
      deliveryObservationRef: null
    }
  };
}

function createTempFixture({ bound }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ffr06-visible-binding-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });
  const observationPath = path.join(root, 'friend-cdr-observation.json');
  if (bound) fs.writeFileSync(observationPath, `${JSON.stringify(observation(), null, 2)}\n`, { mode: 0o600 });
  const relationshipsCdrObservationBridge = createBrowserRelationshipsCdrObservationBridge({
    observationPath: bound ? observationPath : null
  });
  const server = createVexLifeBrowserServer({
    staticRoot: ROOT,
    relationshipsPersistenceHome: home,
    relationshipsCdrObservationBridge
  });
  return { root, home, observationPath, server };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address();
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function enterRelationships(page) {
  await page.evaluate(async () => { await globalThis.__VEXLIFE_APP__.terrain.travel('terrain.project.self-development', 'in'); });
  await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.terrain.currentRef() === 'terrain.project.self-development');
  const door = page.locator(`.e27-node[data-terrain-ref="${RELATIONSHIPS_TERRAIN_REF}"]`);
  await door.waitFor({ state: 'visible' });
  await door.click();
  await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.state.contextProjection === 'relationships');
  await page.locator('#relationshipsConnect').click();
}

test('FFR06 visible Relationships consumes only the server-projected current CDR binding and reaches durable Saved truth', { timeout: 90_000 }, async () => {
  const fixture = createTempFixture({ bound: true });
  let browser;
  try {
    const address = await listen(fixture.server);
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const requests = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/v1/relationships/')) requests.push({ method: request.method(), path: url.pathname, postData: request.postData() });
    });

    await page.goto(`${origin}/reference/browser/index.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__?.relationships));
    await enterRelationships(page);

    await page.selectOption('#relationshipsInvitation', 'RECEIVED_VERIFIED_REFERENCE');
    await page.selectOption('#relationshipsIdentity', 'VERIFIED_CURRENT');
    await page.selectOption('#relationshipsDecision', 'ACCEPT');
    assert.equal(await page.locator('#relationshipsFormLocal').isDisabled(), false);

    const before = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(before.localFormed, false);
    assert.equal(before.admission.admitted, true);

    await page.locator('#relationshipsFormLocal').click();
    await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.relationships.snapshot().localFormed === true);
    const after = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(after.localFormed, true);
    assert.equal(after.delivery, 'NOT_CONNECTED');
    assert.match(await page.locator('#relationshipsConnectStatus').textContent(), /Saved locally as Friend/i);

    const bindingRequests = requests.filter((request) => request.path === '/api/v1/relationships/cdr-persistence-binding');
    assert.deepEqual(bindingRequests.map(({ method }) => method), ['GET']);
    assert.equal(bindingRequests[0].postData, null);
    const saveRequests = requests.filter((request) => request.path === '/api/v1/relationships/persistence');
    assert.equal(saveRequests.length, 1);
    assert.equal(saveRequests[0].method, 'POST');
    assert.ok(saveRequests[0].postData?.includes('participant.visible.local'));
    assert.equal(saveRequests[0].postData?.includes(fixture.observationPath), false);
    assert.equal(saveRequests[0].postData?.includes('device.visible.local.1'), false);
    assert.equal(saveRequests[0].postData?.includes('authority.cdr.visible.local.1'), false);

    assert.equal(fs.existsSync(path.join(fixture.home, 'relationships')), true);
  } finally {
    if (browser) await browser.close();
    if (fixture.server.listening) await close(fixture.server);
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('FFR06 visible Relationships remains usable but persistence-held when no host CDR observation is bound', { timeout: 90_000 }, async () => {
  const fixture = createTempFixture({ bound: false });
  let browser;
  try {
    const address = await listen(fixture.server);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(`http://127.0.0.1:${address.port}/reference/browser/index.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__?.relationships));
    await enterRelationships(page);
    await page.selectOption('#relationshipsInvitation', 'RECEIVED_VERIFIED_REFERENCE');
    await page.selectOption('#relationshipsIdentity', 'VERIFIED_CURRENT');
    await page.selectOption('#relationshipsDecision', 'NARROW');

    assert.equal(await page.locator('#relationshipsFormLocal').isDisabled(), true);
    assert.match(await page.locator('#relationshipsConnectStatus').textContent(), /Saving is held until this Vex has explicit local-owner and counterpart invitation identity bindings/i);
    const snapshot = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(snapshot.localFormed, false);
    assert.equal(snapshot.admission.admitted, true);
    assert.deepEqual(pageErrors, []);
    assert.equal(fs.existsSync(path.join(fixture.home, 'relationships')), false);
  } finally {
    if (browser) await browser.close();
    if (fixture.server.listening) await close(fixture.server);
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

// [VXG RealForever]
