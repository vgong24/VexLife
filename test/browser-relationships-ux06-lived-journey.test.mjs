import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import {
  ACCEPTED_CDR_CANONICAL_INVITATION_SCHEMA,
  BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_REQUEST_SCHEMA,
  ACCEPTED_VEXINTERFACE_INVITATION_PRODUCT_CONTRACT,
  RELATIONSHIPS_INVITATION_EFFECTS_NONE,
  createBrowserRelationshipsInvitationProductBridge,
} from '../src/core/browser-relationships-invitation-product-bridge.mjs';
import { BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_SCHEMA } from '../src/core/browser-relationships-cdr-observation-bridge.mjs';
import { createBrowserRelationshipsPersistenceBridge } from '../src/core/browser-relationships-persistence-bridge.mjs';
import { bindRelationshipsCdrObservation } from '../src/core/relationships-cdr-observation-binding.mjs';
import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ROOTS = new Set();
const SOURCE_REFS = Object.freeze(['fixture.relationships.ux06.synthetic-adapter']);
const RELATIONSHIPS_TERRAIN_REF = 'terrain.resource.relationships';

function tempHome(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `vexlife-relationships-ux06-${label}-`));
  ROOTS.add(root);
  return root;
}

afterEach(() => {
  for (const root of ROOTS) fs.rmSync(root, { recursive: true, force: true });
  ROOTS.clear();
});

function observation({ local, peer, generation = 1, currentness = 'CURRENT' }) {
  return {
    schemaVersion: 'vexlife.friend-cdr-observation/v1',
    sourceWitness: {
      receiptRef: `receipt.cdr.synthetic.${local}-${peer}.${generation}`,
      procedureRef: 'procedure.cdr.s5.single-pair-rehearsal.001',
      currentnessRef: `currentness.cdr.synthetic.${local}-${peer}.${generation}`,
      scenarioRef: 'scenario.relationships.ux06.synthetic-two-profile.001',
      candidateRef: 'candidate.relationships.ux06.synthetic.001'
    },
    productGate: {
      alphaConsentAcknowledged: true,
      invitationState: 'RECEIVED_VERIFIED_REFERENCE',
      invitationDecision: 'ACCEPT',
      identityState: 'VERIFIED_CURRENT',
      presenceClass: 'PRESENT_DIRECT',
      routeClass: 'DIRECT_CANDIDATE',
      failureState: 'NONE',
      withdrawn: false,
      revoked: false,
      disconnected: false,
      blocked: false
    },
    local: {
      stateRootRef: `state.relationships.${local}`,
      deviceRef: `device.${local}.1`,
      participantRef: `participant.${local}`,
      peerParticipantRef: `participant.${peer}`,
      processInstanceRef: `instance.relationships.${local}.${generation}`,
      authorityRef: `authority.cdr.${local}.1`
    },
    peer: {
      stateRootRef: `state.relationships.${peer}`,
      deviceRef: `device.${peer}.1`,
      participantRef: `participant.${peer}`,
      peerParticipantRef: `participant.${local}`,
      processInstanceRef: `instance.relationships.${peer}.${generation}`,
      authorityRef: `authority.cdr.${peer}.1`,
      currentKeyRef: `key.peer.${peer}.${generation}`,
      currentnessRef: `currentness.peer.${peer}.${generation}`
    },
    invitation: {
      invitationRef: `invitation.friend.${local}-${peer}.1`,
      currentnessRef: `currentness.invitation.${local}-${peer}.${generation}`,
      localParticipantRef: `participant.${local}`,
      counterpartParticipantRef: `participant.${peer}`
    },
    currentness: {
      observationState: currentness,
      invitationState: currentness,
      peerState: currentness
    },
    runtime: {
      routeRef: `route.direct.${peer}.${generation}`,
      sessionGeneration: generation,
      deliveryObservationRef: `delivery.observation.${peer}.${generation}`
    }
  };
}

function bindingResult(value) {
  const result = bindRelationshipsCdrObservation(value);
  assert.equal(result.state, 'BOUND_CURRENT');
  assert.ok(result.binding);
  assert.equal(Object.values(result.effects).every((value) => value === false), true);
  return result;
}

function fixedCdrBridge(result) {
  assert.equal(result.state, 'BOUND_CURRENT');
  assert.ok(result.binding);
  const projected = Object.freeze({
    schemaVersion: BROWSER_RELATIONSHIPS_CDR_PERSISTENCE_BINDING_SCHEMA,
    state: 'BOUND_CURRENT',
    binding: result.binding
  });
  return Object.freeze({ read: () => projected });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactArtifact({ recipientCommunityIdentityRef, recipientUniverseRef }) {
  const bytes = Buffer.from(`${JSON.stringify({
    schemaVersion: ACCEPTED_CDR_CANONICAL_INVITATION_SCHEMA,
    originatorCommunityIdentityRef: 'community.alice',
    originatorUniverseRef: 'universe.alice',
    recipientCommunityIdentityRef,
    recipientUniverseRef,
    purposeRef: 'purpose.friend-introduction',
    requestedScopeRefs: ['scope.presence', 'scope.profile'],
    requestedChannelRefs: ['channel.manual'],
    audienceRefs: [recipientCommunityIdentityRef],
    syntheticFixture: true
  })}\n`, 'utf8');
  return Object.freeze({
    artifactSchemaRef: 'artifact.relationships.ux06.synthetic.001',
    canonicalPayloadSchemaRef: ACCEPTED_CDR_CANONICAL_INVITATION_SCHEMA,
    artifactSha256: sha256(bytes),
    artifactBytesBase64: bytes.toString('base64'),
    artifactByteLength: bytes.length,
    transport: 'FILE',
    transportProjectionState: 'EXACT_FILE_BYTES_READY'
  });
}

function exportAdapter(holder) {
  return Object.freeze({
    async invoke(request) {
      assert.equal(request.operation, 'CREATE_EXPORT');
      assert.equal(request.transport, 'FILE');
      assert.equal(request.payload.purposeRef, 'purpose.friend-introduction');
      assert.deepEqual(request.payload.requestedScopeRefs, ['scope.profile', 'scope.presence']);
      assert.deepEqual(request.payload.requestedChannelRefs, ['channel.manual']);
      assert.deepEqual(request.payload.audienceRefs, [request.payload.recipientCommunityIdentityRef]);
      const artifact = exactArtifact(request.payload);
      holder.artifact = artifact;
      return Object.freeze({
        state: 'EXPORTED',
        adapterEvidenceRef: 'evidence.relationships.ux06.synthetic-export.001',
        syntheticAdapter: true,
        artifact,
        evidence: null,
        sourceRefs: SOURCE_REFS,
        effects: RELATIONSHIPS_INVITATION_EFFECTS_NONE
      });
    }
  });
}

function importAdapter({ holder, expectedRecipient = 'community.bob', currentness = 'CURRENT', revoked = false, replayGuard = true } = {}) {
  const consumed = new Set();
  return Object.freeze({
    async invoke(request) {
      assert.equal(request.operation, 'IMPORT_VERIFY');
      assert.equal(request.transport, 'FILE');
      const incoming = Buffer.from(request.payload.artifactBytesBase64, 'base64');
      const incomingSha = sha256(incoming);
      if (!holder.artifact || incomingSha !== holder.artifact.artifactSha256) throw new Error('synthetic artifact identity mismatch');
      const parsed = JSON.parse(incoming.toString('utf8'));
      if (parsed.recipientCommunityIdentityRef !== expectedRecipient) throw new Error('synthetic wrong recipient');
      if (parsed.purposeRef !== 'purpose.friend-introduction') throw new Error('synthetic purpose mismatch');
      if (JSON.stringify(parsed.requestedScopeRefs) !== JSON.stringify(['scope.presence', 'scope.profile'])) throw new Error('synthetic scope widening');
      if (currentness !== 'CURRENT') throw new Error('synthetic stale currentness');
      if (revoked) throw new Error('synthetic revoked evidence');
      if (replayGuard && consumed.has(incomingSha)) throw new Error('synthetic replay rejected');
      consumed.add(incomingSha);
      return Object.freeze({
        state: 'IMPORTED_VERIFIED_CURRENT',
        adapterEvidenceRef: 'evidence.relationships.ux06.synthetic-import.001',
        syntheticAdapter: true,
        artifact: holder.artifact,
        evidence: Object.freeze({
          verificationEvidenceRef: 'evidence.security.synthetic.verify.001',
          currentnessEvidenceRef: 'evidence.currentness.synthetic.001',
          cdrObservation: observation({ local: 'bob', peer: 'alice' })
        }),
        sourceRefs: SOURCE_REFS,
        effects: RELATIONSHIPS_INVITATION_EFFECTS_NONE
      });
    }
  });
}

function requestEnvelope({ operation, requestRef, payload }) {
  return Object.freeze({
    schemaVersion: BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_REQUEST_SCHEMA,
    operation,
    requestRef,
    transport: 'FILE',
    productContractRef: ACCEPTED_VEXINTERFACE_INVITATION_PRODUCT_CONTRACT,
    payload,
    sourceRefs: SOURCE_REFS
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object');
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function enterRelationships(page) {
  await page.evaluate(async () => {
    await globalThis.__VEXLIFE_APP__.terrain.travel('terrain.project.self-development', 'in');
  });
  await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.terrain.currentRef() === 'terrain.project.self-development');
  await page.locator(`.e27-node[data-terrain-ref="${RELATIONSHIPS_TERRAIN_REF}"]`).click();
  await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.state.contextProjection === 'relationships');
  const connect = page.locator('#relationshipsConnect, #relationshipsConnectExisting').first();
  await connect.click();
  await page.locator('#relationshipsConnectMethod').waitFor({ state: 'visible' });
}

function bridgeFor(home, binding) {
  return createBrowserRelationshipsPersistenceBridge({
    home,
    localOwnerBinding: Object.freeze({
      localParticipantRef: binding.localParticipantRef,
      localStateRootRef: binding.localStateRootRef
    })
  });
}

test('UX06 lived FILE journey composes create -> transfer -> verified import -> human decision -> directional Friend -> People -> reload', { timeout: 120_000 }, async () => {
  const homeA = tempHome('profile-a');
  const homeB = tempHome('profile-b');
  const transferRoot = tempHome('manual-transfer');
  const cdrA = bindingResult(observation({ local: 'alice', peer: 'bob' }));
  const cdrB = bindingResult(observation({ local: 'bob', peer: 'alice' }));
  const holder = { artifact: null };

  const serverA = createVexLifeBrowserServer({
    staticRoot: ROOT,
    relationshipsInvitationProductBridge: createBrowserRelationshipsInvitationProductBridge({ upstreamAdapter: exportAdapter(holder) }),
    relationshipsCdrObservationBridge: fixedCdrBridge(cdrA),
    relationshipsPersistenceHome: homeA
  });
  const serverB = createVexLifeBrowserServer({
    staticRoot: ROOT,
    relationshipsInvitationProductBridge: createBrowserRelationshipsInvitationProductBridge({ upstreamAdapter: importAdapter({ holder }) }),
    relationshipsCdrObservationBridge: fixedCdrBridge(cdrB),
    relationshipsPersistenceHome: homeB
  });
  const originA = await listen(serverA);
  const originB = await listen(serverB);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const contextA = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const pageA = await contextA.newPage();
    await pageA.goto(`${originA}/reference/browser/index.html`, { waitUntil: 'networkidle' });
    await pageA.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__?.relationships));
    await enterRelationships(pageA);
    assert.equal(await pageA.locator('#relationshipsConnectMethod').inputValue(), 'FILE');
    await pageA.fill('#relationshipsRecipientCommunity', 'community.bob');
    await pageA.fill('#relationshipsRecipientUniverse', 'universe.bob');
    const downloadPromise = pageA.waitForEvent('download');
    await pageA.click('#relationshipsCreateInvitationFile');
    const download = await downloadPromise;
    const transferPath = path.join(transferRoot, 'alice-to-bob.vexinvite');
    await download.saveAs(transferPath);
    const exported = await pageA.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(exported.invitationProduct.state, 'EXPORTED');
    assert.equal(exported.invitationProduct.syntheticAdapter, true);
    assert.equal(exported.invitationState, 'CREATED_LOCAL_REFERENCE');
    assert.equal(exported.identityState, 'UNKNOWN');
    assert.equal(exported.localFormed, false);
    assert.equal(exported.counts.people, 0);
    assert.equal(fs.existsSync(path.join(homeA, 'relationships')), false, 'profile A create/share must not persist a relationship');
    const transferredBytes = fs.readFileSync(transferPath);
    assert.equal(sha256(transferredBytes), exported.invitationProduct.artifactSha256);
    assert.equal(download.suggestedFilename().includes(exported.invitationProduct.artifactSha256), true);

    const contextB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pageB = await contextB.newPage();
    await pageB.goto(`${originB}/reference/browser/index.html`, { waitUntil: 'networkidle' });
    await pageB.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__?.relationships));
    await enterRelationships(pageB);
    await pageB.locator('#relationshipsImportInvitationFile').setInputFiles(transferPath);
    await pageB.waitForFunction(() => globalThis.__VEXLIFE_APP__.relationships.snapshot().invitationProduct.state === 'IMPORTED_VERIFIED_CURRENT');
    const imported = await pageB.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(imported.invitationState, 'RECEIVED_VERIFIED_REFERENCE');
    assert.equal(imported.identityState, 'VERIFIED_CURRENT');
    assert.equal(imported.invitationDecision, 'DEFER');
    assert.equal(imported.admission.admitted, false, 'verified import must not manufacture the human relationship decision');
    assert.equal(await pageB.locator('#relationshipsInvitation').isDisabled(), true);
    assert.equal(await pageB.locator('#relationshipsIdentity').isDisabled(), true);
    assert.equal(await pageB.locator('#relationshipsFormLocal').isDisabled(), true);
    assert.equal(Object.values(imported.invitationProduct.effects).every((value) => value === false), true);

    await pageB.selectOption('#relationshipsDecision', 'ACCEPT');
    await pageB.waitForFunction(() => globalThis.__VEXLIFE_APP__.relationships.snapshot().admission.admitted === true);
    assert.equal(await pageB.locator('#relationshipsFormLocal').isDisabled(), false);
    await pageB.click('#relationshipsFormLocal');
    await pageB.waitForFunction(() => {
      const snapshot = globalThis.__VEXLIFE_APP__.relationships.snapshot();
      return snapshot.localFormed === true && snapshot.counts.people === 1 && snapshot.hydration.state === 'READY';
    });
    const saved = await pageB.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(saved.localRelationshipClass, 'FRIEND');
    assert.equal(saved.directRelationshipRefs.length, 1);
    assert.equal(await pageB.locator('[data-counterpart-participant-ref="participant.alice"]').count(), 1);
    assert.equal(saved.connectionStatus.connected, false);
    assert.equal(saved.connectionStatus.delivered, false);
    assert.equal(saved.connectionStatus.semanticAcknowledged, false);

    await pageB.reload({ waitUntil: 'networkidle' });
    await pageB.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__?.relationships));
    await enterRelationships(pageB);
    await pageB.waitForFunction(() => globalThis.__VEXLIFE_APP__.relationships.snapshot().counts.people === 1);
    const reloaded = await pageB.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.deepEqual(reloaded.directRelationshipRefs, saved.directRelationshipRefs);
    assert.equal(reloaded.hydration.count, 1);
    assert.equal(reloaded.connectionStatus.connected, false);

    await pageB.locator('#relationshipsRecoveryDetails > summary').click();
    await pageB.click('#relationshipsDisconnect');
    const disconnected = await pageB.evaluate(() => globalThis.__VEXLIFE_APP__.relationships.snapshot());
    assert.equal(disconnected.recovery, 'DISCONNECTED');
    assert.equal(disconnected.counts.people, 1, 'disconnect must not rewrite durable local relationship history');
    assert.equal(disconnected.connectionStatus.connected, false);

    const listA = bridgeFor(homeA, cdrA.binding).list({ maxRelationships: 8, includeTombstoned: false });
    const listB = bridgeFor(homeB, cdrB.binding).list({ maxRelationships: 8, includeTombstoned: false });
    assert.equal(listA.relationships.length, 0);
    assert.equal(listB.relationships.length, 1);
    assert.equal(listB.localParticipantRef, 'participant.bob');
    assert.equal(listB.relationships[0].counterpartParticipantRef, 'participant.alice');

    await contextA.close();
    await contextB.close();
  } finally {
    if (browser) await browser.close();
    await closeServer(serverA);
    await closeServer(serverB);
  }
});

test('UX06 negative families hold wrong recipient, mutation, stale/revoked evidence, replay and scope widening without product effects', async () => {
  const holder = { artifact: exactArtifact({ recipientCommunityIdentityRef: 'community.bob', recipientUniverseRef: 'universe.bob' }) };
  const validImportPayload = Object.freeze({
    artifactBytesBase64: holder.artifact.artifactBytesBase64,
    expectedArtifactSha256: holder.artifact.artifactSha256,
    transportRecoveryEvidenceRefOrNull: null
  });

  const wrongRecipient = createBrowserRelationshipsInvitationProductBridge({ upstreamAdapter: importAdapter({ holder, expectedRecipient: 'community.carol' }) });
  const wrongRecipientResult = await wrongRecipient.execute(requestEnvelope({ operation:'IMPORT_VERIFY', requestRef:'request.ux06.wrong-recipient.1', payload:validImportPayload }));
  assert.equal(wrongRecipientResult.state, 'HELD_UPSTREAM_UNAVAILABLE');

  const mutatedBytes = Buffer.from(`${Buffer.from(holder.artifact.artifactBytesBase64, 'base64').toString('utf8').trim()}x\n`, 'utf8');
  const mutationBridge = createBrowserRelationshipsInvitationProductBridge({ upstreamAdapter: importAdapter({ holder }) });
  const mutated = await mutationBridge.execute(requestEnvelope({
    operation:'IMPORT_VERIFY',
    requestRef:'request.ux06.mutated.1',
    payload:{ artifactBytesBase64:mutatedBytes.toString('base64'), expectedArtifactSha256:sha256(mutatedBytes), transportRecoveryEvidenceRefOrNull:null }
  }));
  assert.equal(mutated.state, 'HELD_UPSTREAM_UNAVAILABLE');

  const stale = await createBrowserRelationshipsInvitationProductBridge({ upstreamAdapter: importAdapter({ holder, currentness:'STALE' }) })
    .execute(requestEnvelope({ operation:'IMPORT_VERIFY', requestRef:'request.ux06.stale.1', payload:validImportPayload }));
  assert.equal(stale.state, 'HELD_UPSTREAM_UNAVAILABLE');

  const revoked = await createBrowserRelationshipsInvitationProductBridge({ upstreamAdapter: importAdapter({ holder, revoked:true }) })
    .execute(requestEnvelope({ operation:'IMPORT_VERIFY', requestRef:'request.ux06.revoked.1', payload:validImportPayload }));
  assert.equal(revoked.state, 'HELD_UPSTREAM_UNAVAILABLE');

  const replayBridge = createBrowserRelationshipsInvitationProductBridge({ upstreamAdapter: importAdapter({ holder }) });
  const first = await replayBridge.execute(requestEnvelope({ operation:'IMPORT_VERIFY', requestRef:'request.ux06.replay.1', payload:validImportPayload }));
  const second = await replayBridge.execute(requestEnvelope({ operation:'IMPORT_VERIFY', requestRef:'request.ux06.replay.2', payload:validImportPayload }));
  assert.equal(first.state, 'IMPORTED_VERIFIED_CURRENT');
  assert.equal(second.state, 'HELD_UPSTREAM_UNAVAILABLE');

  const exportHolder = { artifact: null };
  const widening = createBrowserRelationshipsInvitationProductBridge({ upstreamAdapter: Object.freeze({
    async invoke(request) {
      if (request.payload.requestedScopeRefs.includes('scope.everything')) throw new Error('synthetic scope widening');
      return exportAdapter(exportHolder).invoke(request);
    }
  }) });
  const wideningResult = await widening.execute(requestEnvelope({
    operation:'CREATE_EXPORT',
    requestRef:'request.ux06.scope-widening.1',
    payload:{
      recipientCommunityIdentityRef:'community.bob',
      recipientUniverseRef:'universe.bob',
      purposeRef:'purpose.friend-introduction',
      requestedScopeRefs:['scope.profile','scope.presence','scope.everything'],
      requestedChannelRefs:['channel.manual'],
      audienceRefs:['community.bob'],
      expiresAtMs:2_000
    }
  }));
  assert.equal(wideningResult.state, 'HELD_UPSTREAM_UNAVAILABLE');

  for (const result of [wrongRecipientResult, mutated, stale, revoked, second, wideningResult]) {
    assert.equal(Object.values(result.effects).every((value) => value === false), true);
    assert.equal(result.artifact, null);
    assert.equal(result.evidence, null);
  }
});

// [VXG RealForever]