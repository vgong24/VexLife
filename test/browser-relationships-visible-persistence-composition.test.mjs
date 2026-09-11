import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { createBrowserRelationshipsCdrObservationBridge } from '../src/core/browser-relationships-cdr-observation-bridge.mjs';
import { createBrowserRelationshipsPersistenceBridge } from '../src/core/browser-relationships-persistence-bridge.mjs';
import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELATIONSHIPS_TERRAIN_REF = 'terrain.resource.relationships';
const DURABLE_TRUTH = 'DURABLE_LOCAL_DIRECTIONAL_RELATIONSHIP';

function observation(overrides = {}) {
  const value = {
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
  return { ...value, ...overrides };
}

function createTempFixture({ bound, observationValue = observation() }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-ffr06-visible-binding-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });
  const observationPath = path.join(root, 'friend-cdr-observation.json');
  if (bound) fs.writeFileSync(observationPath, `${JSON.stringify(observationValue, null, 2)}\n`, { mode: 0o600 });
  const relationshipsCdrObservationBridge = createBrowserRelationshipsCdrObservationBridge({
    observationPath: bound ? observationPath : null
  });
  const server = createVexLifeBrowserServer({
    staticRoot: ROOT,
    relationshipsPersistenceHome: home,
    relationshipsCdrObservationBridge
  });
  return { root, home, observationPath, observationValue, server };
}

function persistenceBridgeForFixture(fixture) {
  const value = fixture.observationValue;
  return createBrowserRelationshipsPersistenceBridge({
    home: fixture.home,
    localOwnerBinding: {
      localParticipantRef: value.local.participantRef,
      localStateRootRef: value.local.stateRootRef
    }
  });
}

function persistencePrepareInput(value, observedAt = '2026-09-08T20:00:00.000Z', instanceRef = 'instance.relationships.visible.seed.1') {
  return {
    counterpartParticipantRef: value.peer.participantRef,
    counterpartCurrentKeyRef: value.peer.currentKeyRef,
    localRelationshipClass: 'FRIEND',
    invitationRef: value.invitation.invitationRef,
    invitationCurrentnessRef: value.invitation.currentnessRef,
    observedAt,
    instanceRef,
    lastAcceptedPeerCurrentnessRef: value.peer.currentnessRef,
    routeRef: null,
    sessionGeneration: null,
    deliveryObservationRef: null
  };
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

async function enterRelationships(page, { openConnect = true } = {}) {
  await page.evaluate(async () => { await globalThis.__VEXLIFE_APP__.terrain.travel('terrain.project.self-development', 'in'); });
  await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.terrain.currentRef() === 'terrain.project.self-development');
  const door = page.locator(`.e27-node[data-terrain-ref="${RELATIONSHIPS_TERRAIN_REF}"]`);
  await door.waitFor({ state: 'visible' });
  await door.click();
  await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.state.contextProjection === 'relationships');
  if (openConnect) {
    const connect = page.locator('#relationshipsConnect, #relationshipsConnectExisting').first();
    await connect.waitFor({ state: 'visible' });
    await connect.click();
  }
}

async function waitForHydration(page, expected = 'READY') {
  await page.waitForFunction((state) => globalThis.__VEXLIFE_APP__?.relationships?.snapshot?.().hydration?.state === state, expected);
}

function durableRows(page) {
  return page.locator(`[data-rel="direct"] [data-relationship-truth-class="${DURABLE_TRUTH}"]`);
}

test('FFR06 visible Relationships consumes only the server-projected current CDR binding, saves durably, hydrates People, and survives browser reload', { timeout: 90_000 }, async () => {
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
    await waitForHydration(page);
    await enterRelationships(page);

    const initial = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(initial.hydration.state, 'READY');
    assert.equal(initial.hydration.count, 0);
    assert.equal(initial.counts.people, 0);

    await page.selectOption('#relationshipsInvitation', 'RECEIVED_VERIFIED_REFERENCE');
    await page.selectOption('#relationshipsIdentity', 'VERIFIED_CURRENT');
    await page.selectOption('#relationshipsDecision', 'ACCEPT');
    assert.equal(await page.locator('#relationshipsFormLocal').isDisabled(), false);

    const before = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(before.localFormed, false);
    assert.equal(before.admission.admitted, true);

    await page.locator('#relationshipsFormLocal').click();
    await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.relationships.snapshot().localFormed === true);
    await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.relationships.snapshot().hydration.count === 1);
    const after = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(after.localFormed, true);
    assert.equal(after.delivery, 'NOT_CONNECTED');
    assert.equal(after.hydration.state, 'READY');
    assert.equal(after.hydration.count, 1);
    assert.equal(after.counts.people, 1);
    assert.match(await page.locator('#relationshipsConnectStatus').textContent(), /Saved locally as Friend/i);
    assert.equal(await durableRows(page).count(), 1);
    const visible = durableRows(page).first();
    assert.equal(await visible.getAttribute('data-counterpart-participant-ref'), 'participant.visible.peer');
    assert.equal(await visible.getAttribute('data-relationship-status'), 'ACTIVE');
    assert.match(await visible.textContent(), /participant\.visible\.peer/);
    const relationshipRef = await visible.getAttribute('data-relationship-ref');
    assert.ok(relationshipRef?.startsWith('relationship.vexlife.local.'));

    const bindingRequests = requests.filter((request) => request.path === '/api/v1/relationships/cdr-persistence-binding');
    assert.ok(bindingRequests.length >= 1);
    assert.ok(bindingRequests.every(({ method, postData }) => method === 'GET' && postData === null));
    const persistenceRequests = requests.filter((request) => request.path === '/api/v1/relationships/persistence');
    const saveRequests = persistenceRequests.filter((request) => request.method === 'POST');
    const listRequests = persistenceRequests.filter((request) => request.method === 'GET');
    assert.equal(saveRequests.length, 1);
    assert.ok(listRequests.length >= 2, 'startup hydration and post-save hydration must both read');
    assert.ok(saveRequests[0].postData?.includes('participant.visible.local'));
    assert.equal(saveRequests[0].postData?.includes(fixture.observationPath), false);
    assert.equal(saveRequests[0].postData?.includes('device.visible.local.1'), false);
    assert.equal(saveRequests[0].postData?.includes('authority.cdr.visible.local.1'), false);

    assert.equal(fs.existsSync(path.join(fixture.home, 'relationships')), true);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__?.relationships));
    await waitForHydration(page);
    await enterRelationships(page, { openConnect: false });
    const reloaded = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(reloaded.localFormed, false, 'reload hydration does not manufacture current-session save state');
    assert.equal(reloaded.hydration.state, 'READY');
    assert.equal(reloaded.hydration.count, 1);
    assert.equal(reloaded.counts.people, 1);
    assert.deepEqual(reloaded.directRelationshipRefs, [relationshipRef]);
    assert.equal(await durableRows(page).count(), 1);
    assert.equal(await durableRows(page).first().getAttribute('data-relationship-ref'), relationshipRef);
    assert.equal(await durableRows(page).first().getAttribute('data-counterpart-participant-ref'), 'participant.visible.peer');
  } finally {
    if (browser) await browser.close();
    if (fixture.server.listening) await close(fixture.server);
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('FFR06 visible Relationships remains usable but persistence and hydration are held when no host CDR observation is bound', { timeout: 90_000 }, async () => {
  const fixture = createTempFixture({ bound: false });
  let browser;
  try {
    const address = await listen(fixture.server);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(`http://127.0.0.1:${address.port}/reference/browser/index.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__?.relationships));
    await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.relationships.snapshot().hydration.state === 'HELD_BINDING_REQUIRED');
    await enterRelationships(page);
    await page.selectOption('#relationshipsInvitation', 'RECEIVED_VERIFIED_REFERENCE');
    await page.selectOption('#relationshipsIdentity', 'VERIFIED_CURRENT');
    await page.selectOption('#relationshipsDecision', 'NARROW');

    assert.equal(await page.locator('#relationshipsFormLocal').isDisabled(), true);
    assert.match(await page.locator('#relationshipsConnectStatus').textContent(), /Saving is held until this Vex has explicit local-owner and counterpart invitation identity bindings/i);
    const snapshot = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(snapshot.localFormed, false);
    assert.equal(snapshot.admission.admitted, true);
    assert.equal(snapshot.hydration.state, 'HELD_BINDING_REQUIRED');
    assert.equal(snapshot.hydration.count, 0);
    assert.equal(snapshot.counts.people, 0);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    assert.equal(fs.existsSync(path.join(fixture.home, 'relationships')), false);
  } finally {
    if (browser) await browser.close();
    if (fixture.server.listening) await close(fixture.server);
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('UX03 visible hydration preserves canonical BLOCKED status and excludes tombstoned relationships after reload', { timeout: 90_000 }, async () => {
  const fixture = createTempFixture({ bound: true });
  let browser;
  try {
    const bridge = persistenceBridgeForFixture(fixture);
    const prepared = bridge.prepare(persistencePrepareInput(fixture.observationValue));
    const saved = bridge.commit(prepared);
    assert.equal(saved.current.record.status, 'ACTIVE');
    assert.equal(saved.current.record.revision, 0);
    const blocked = bridge.transition({
      counterpartParticipantRef: fixture.observationValue.peer.participantRef,
      action: 'BLOCK',
      expectedRevision: 0,
      observedAt: '2026-09-08T20:01:00.000Z',
      instanceRef: 'instance.relationships.visible.block.1',
      counterpartCurrentKeyRef: null,
      invitationCurrentnessRef: null,
      lastAcceptedPeerCurrentnessRef: null,
      routeRef: null,
      sessionGeneration: null,
      deliveryObservationRef: null,
      recoveryOrTombstoneRef: 'recovery.relationships.visible.block.1'
    });
    assert.equal(blocked.current.record.status, 'BLOCKED');
    assert.equal(blocked.current.record.revision, 1);

    const address = await listen(fixture.server);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const origin = `http://127.0.0.1:${address.port}`;

    await page.goto(`${origin}/reference/browser/index.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__?.relationships));
    await waitForHydration(page);
    await enterRelationships(page, { openConnect: false });
    assert.equal(await durableRows(page).count(), 1);
    assert.equal(await durableRows(page).first().getAttribute('data-relationship-status'), 'BLOCKED');
    assert.equal(await durableRows(page).first().getAttribute('data-relationship-revision'), '1');
    const beforeTombstone = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(beforeTombstone.counts.people, 1);

    const tombstoned = bridge.tombstone({
      counterpartParticipantRef: fixture.observationValue.peer.participantRef,
      expectedRevision: 1,
      observedAt: '2026-09-08T20:02:00.000Z',
      instanceRef: 'instance.relationships.visible.tombstone.1'
    });
    assert.equal(tombstoned.current.record.tombstoned, true);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__?.relationships));
    await waitForHydration(page);
    await enterRelationships(page, { openConnect: false });
    const afterTombstone = await page.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(afterTombstone.hydration.count, 0);
    assert.equal(afterTombstone.counts.people, 0);
    assert.equal(await durableRows(page).count(), 0);
  } finally {
    if (browser) await browser.close();
    if (fixture.server.listening) await close(fixture.server);
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

// [VXG RealForever]
