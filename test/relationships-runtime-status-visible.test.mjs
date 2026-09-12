import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

async function openReferenceServer() {
  const server = createVexLifeBrowserServer({ staticRoot: ROOT });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function mountSavedRuntimeStatusController(page) {
  await page.evaluate(async () => {
    const { createRelationshipsController, loadRelationshipsReference } = await import('/reference/browser/modules/relationships-controller.js');
    const reference = await loadRelationshipsReference('/');
    document.querySelector('#view-relationships')?.remove();
    document.querySelector('#ux04RelationshipsHost')?.remove();

    const host = document.createElement('div');
    host.id = 'ux04RelationshipsHost';
    document.body.append(host);

    const binding = Object.freeze({
      localParticipantRef: 'participant.local.ux04',
      localStateRootRef: 'state-root.local.ux04',
      counterpartParticipantRef: 'participant.peer.ux04',
      counterpartCurrentKeyRef: 'key.peer.ux04.current',
      invitationRef: 'invitation.relationships.ux04.001',
      invitationCurrentnessRef: 'currentness.invitation.relationships.ux04.001',
      instanceRef: 'instance.relationships.browser.ux04'
    });

    const preparedEffects = Object.freeze({
      relationshipMutationPerformed: false,
      canonicalRelationshipPersisted: false,
      networkEffectPerformed: false,
      providerEffectPerformed: false,
      MemoryEffectPerformed: false,
      HomeLayoutEffectPerformed: false,
      modelRuntimePerformed: false,
      publicationPerformed: false,
      publicSearchPerformed: false,
      semanticAcknowledgementCreated: false,
      reciprocalFriendshipCreated: false
    });
    const savedEffects = Object.freeze({
      relationshipMutationPerformed: true,
      canonicalRelationshipPersisted: true,
      networkEffectPerformed: false,
      providerEffectPerformed: false,
      MemoryEffectPerformed: false,
      HomeLayoutEffectPerformed: false,
      modelRuntimePerformed: false,
      publicationPerformed: false,
      publicSearchPerformed: false,
      semanticAcknowledgementCreated: false,
      reciprocalFriendshipCreated: false
    });

    const bridge = Object.freeze({
      ownerBinding: Object.freeze({
        localParticipantRef: binding.localParticipantRef,
        localStateRootRef: binding.localStateRootRef
      }),
      prepare(input) {
        return Object.freeze({
          schemaVersion: 'vexlife.browser-relationships-prepared/v1',
          state: 'PREPARED_NO_EFFECT',
          relationshipRef: 'relationship.local.ux04.peer',
          ...input,
          effects: preparedEffects
        });
      },
      commit() {
        return Object.freeze({
          schemaVersion: 'vexlife.browser-relationships-persistence/v1',
          state: 'SAVED',
          relationshipRef: 'relationship.local.ux04.peer',
          receipt: Object.freeze({
            state: 'COMMITTED',
            relationshipPersisted: true,
            relationshipRef: 'relationship.local.ux04.peer',
            revision: 1
          }),
          current: Object.freeze({
            relationshipRef: 'relationship.local.ux04.peer',
            record: Object.freeze({
              revision: 1,
              localParticipantRef: binding.localParticipantRef,
              localStateRootRef: binding.localStateRootRef
            })
          }),
          effects: savedEffects
        });
      },
      list() {
        return Object.freeze({
          schemaVersion: 'vexlife.relationships-store/v1',
          state: 'CURRENT_LIST',
          localParticipantRef: binding.localParticipantRef,
          localStateRootRef: binding.localStateRootRef,
          totalCount: 0,
          returnedCount: 0,
          truncated: false,
          relationships: Object.freeze([])
        });
      }
    });

    const controller = createRelationshipsController({
      state: { language: 'en', contextProjection: 'relationships' },
      registry: reference.registry,
      catalogs: reference.catalogs,
      cdrRegistry: reference.cdrRegistry,
      persistenceBridge: bridge,
      persistenceBinding: binding,
      host
    });
    globalThis.__UX04_RELATIONSHIPS_TEST__ = controller;
    controller.render();
    document.querySelector('#view-relationships').hidden = false;
  });

  await page.waitForFunction(() => globalThis.__UX04_RELATIONSHIPS_TEST__?.snapshot().hydration.state === 'READY');
  await page.locator('#relationshipsConnect').click();
  await page.selectOption('#relationshipsInvitation', 'RECEIVED_VERIFIED_REFERENCE');
  await page.selectOption('#relationshipsIdentity', 'VERIFIED_CURRENT');
  await page.selectOption('#relationshipsDecision', 'ACCEPT');
  await page.locator('#relationshipsFormLocal').click();
  await page.waitForFunction(() => globalThis.__UX04_RELATIONSHIPS_TEST__?.snapshot().localFormed === true);
  await page.locator('#relationshipsAlphaConsent').click();
  await page.waitForFunction(() => globalThis.__UX04_RELATIONSHIPS_TEST__?.snapshot().cdrGate.alphaConsentAcknowledged === true);
}

function assertNoConnectionClaim(status) {
  assert.equal(status.deliveryTruth, 'NOT_CONNECTED');
  assert.equal(status.hostExecutionDeferred, true);
  assert.equal(status.networkEffectPerformed, false);
  assert.equal(status.connected, false);
  assert.equal(status.delivered, false);
  assert.equal(status.semanticAcknowledged, false);
}

async function assertVisibleNoConnectionClaim(page, expectedState) {
  const delivery = page.locator('#relationshipsDelivery');
  assert.equal(await delivery.getAttribute('data-runtime-plan-state'), expectedState);
  assert.equal(await delivery.getAttribute('data-delivery-truth'), 'NOT_CONNECTED');
  assert.equal(await delivery.getAttribute('data-network-effect-performed'), 'false');
  assert.equal(await delivery.getAttribute('data-semantic-acknowledged'), 'false');
}

test('UX04 visible Connection status projects accepted runtime truth without manufacturing transport success', { timeout: 90_000 }, async () => {
  const server = await openReferenceServer();
  const address = server.address();
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${origin}/reference/browser/index.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__?.relationships));
    await mountSavedRuntimeStatusController(page);

    let snapshot = await page.evaluate(() => globalThis.__UX04_RELATIONSHIPS_TEST__.snapshot());
    assert.equal(snapshot.runtimePlan.state, 'IDLE');
    assert.equal(snapshot.connectionStatus.state, 'IDLE');
    assertNoConnectionClaim(snapshot.connectionStatus);
    await assertVisibleNoConnectionClaim(page, 'IDLE');
    assert.match(await page.locator('#relationshipsDelivery').textContent(), /Status:\s*Not connected/i);

    await page.locator('#relationshipsPrepareRuntimePlan').click();
    await page.waitForFunction(() => globalThis.__UX04_RELATIONSHIPS_TEST__.snapshot().runtimePlan.state === 'HOST_BINDING_REQUIRED');
    snapshot = await page.evaluate(() => globalThis.__UX04_RELATIONSHIPS_TEST__.snapshot());
    assert.equal(snapshot.connectionStatus.state, 'HOST_BINDING_REQUIRED');
    assertNoConnectionClaim(snapshot.connectionStatus);
    await assertVisibleNoConnectionClaim(page, 'HOST_BINDING_REQUIRED');
    assert.match(await page.locator('#relationshipsDelivery').textContent(), /separate exact Mac \+ Windows host-binding step is required/i);
    assert.match(await page.locator('#relationshipsDelivery').textContent(), /no network connection has started/i);

    await page.selectOption('#relationshipsRoute', 'UNAVAILABLE');
    snapshot = await page.evaluate(() => globalThis.__UX04_RELATIONSHIPS_TEST__.snapshot());
    assert.equal(snapshot.runtimePlan.state, 'IDLE');
    assert.equal(snapshot.connectionStatus.state, 'IDLE');
    assertNoConnectionClaim(snapshot.connectionStatus);
    await assertVisibleNoConnectionClaim(page, 'IDLE');
    assert.match(await page.locator('#relationshipsDelivery').textContent(), /Status:\s*Not connected/i);

    await page.locator('#relationshipsPrepareRuntimePlan').click();
    await page.waitForFunction(() => globalThis.__UX04_RELATIONSHIPS_TEST__.snapshot().runtimePlan.state === 'HELD');
    snapshot = await page.evaluate(() => globalThis.__UX04_RELATIONSHIPS_TEST__.snapshot());
    assert.equal(snapshot.connectionStatus.state, 'HELD');
    assert.ok(snapshot.connectionStatus.reasons.includes('ROUTE_UNAVAILABLE'));
    assertNoConnectionClaim(snapshot.connectionStatus);
    await assertVisibleNoConnectionClaim(page, 'HELD');
    assert.match(await page.locator('#relationshipsDelivery').textContent(), /Host plan held/i);

    const rendered = await page.locator('#relationshipsDelivery').textContent();
    for (const forbidden of ['Connected', 'Delivered', 'Acknowledged by the other side']) {
      assert.equal(rendered.includes(forbidden), false, `visible runtime projection invented stronger truth: ${forbidden}`);
    }

    await context.close();
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }
});

test('UX04 visible Connection status fails safely when runtime-plan retrieval fails', { timeout: 90_000 }, async () => {
  const server = await openReferenceServer();
  const address = server.address();
  assert.equal(typeof address, 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${origin}/reference/browser/index.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__?.relationships));
    await mountSavedRuntimeStatusController(page);

    await page.route('**/api/v1/relationships/runtime-plan', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: `${JSON.stringify({ failureCode: 'RELATIONSHIPS_RUNTIME_PLAN_TEST_UNAVAILABLE' })}\n`
      });
    });

    await page.locator('#relationshipsPrepareRuntimePlan').click();
    await page.waitForFunction(() => globalThis.__UX04_RELATIONSHIPS_TEST__.snapshot().runtimePlan.state === 'FAILURE');
    const snapshot = await page.evaluate(() => globalThis.__UX04_RELATIONSHIPS_TEST__.snapshot());
    assert.equal(snapshot.runtimePlan.failureCode, 'RELATIONSHIPS_RUNTIME_PLAN_TEST_UNAVAILABLE');
    assert.equal(snapshot.connectionStatus.state, 'FAILURE');
    assertNoConnectionClaim(snapshot.connectionStatus);
    await assertVisibleNoConnectionClaim(page, 'FAILURE');
    assert.match(await page.locator('#relationshipsDelivery').textContent(), /failed safely/i);
    assert.match(await page.locator('#relationshipsDelivery').textContent(), /Nothing was connected or saved/i);

    await context.close();
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }
});

// [VXG RealForever]
