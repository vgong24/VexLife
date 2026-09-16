import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { ACCEPTED_CDR_CANONICAL_INVITATION_SCHEMA } from '../src/core/browser-relationships-invitation-product-bridge.mjs';
import {
  ACCEPTED_VEXINTERFACE_INVITATION_PRODUCT_CONTRACT,
  BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_REQUEST_SCHEMA,
  BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_RESULT_SCHEMA
} from '../reference/browser/modules/relationships-invitation-product-client.js';

const API_PATTERN = '**/api/v1/relationships/invitation-product';
const SOURCE_REFS = Object.freeze(['fixture.relationships.ux06.currentness-import']);
const EFFECTS_NONE = Object.freeze({
  canonicalBytesMinted: false,
  cryptographyPerformed: false,
  credentialAccessPerformed: false,
  trustFactsMinted: false,
  relationshipPersisted: false,
  reciprocalFriendshipCreated: false,
  networkDelivered: false,
  semanticAcknowledgementCreated: false,
  providerInvokedByVexLife: false,
  HomeEffectPerformed: false,
  MemoryEffectPerformed: false,
  modelRuntimePerformed: false,
  publicSearchPerformed: false,
  publicationPerformed: false
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalFixtureBytes() {
  return Buffer.from(`${JSON.stringify({
    schemaVersion: ACCEPTED_CDR_CANONICAL_INVITATION_SCHEMA,
    originatorCommunityIdentityRef: 'community.relationships.fixture.originator',
    originatorUniverseRef: 'universe.relationships.fixture.originator',
    recipientCommunityIdentityRef: 'community.relationships.fixture.recipient',
    recipientUniverseRef: 'universe.relationships.fixture.recipient',
    purposeRef: 'purpose.friend-introduction',
    requestedScopeRefs: ['scope.presence', 'scope.profile'],
    requestedChannelRefs: ['channel.manual'],
    audienceRefs: ['community.relationships.fixture.recipient'],
    syntheticFixture: true
  })}\n`, 'utf8');
}

function requestIsExactImport(request) {
  if (request?.schemaVersion !== BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_REQUEST_SCHEMA) return false;
  if (request.operation !== 'IMPORT_VERIFY' || request.transport !== 'FILE') return false;
  if (request.productContractRef !== ACCEPTED_VEXINTERFACE_INVITATION_PRODUCT_CONTRACT) return false;
  if (!Array.isArray(request.sourceRefs) || request.sourceRefs.length === 0) return false;
  const base64 = request.payload?.artifactBytesBase64;
  const expected = request.payload?.expectedArtifactSha256;
  if (typeof base64 !== 'string' || typeof expected !== 'string') return false;
  let bytes;
  try {
    bytes = Buffer.from(base64, 'base64');
  } catch {
    return false;
  }
  if (sha256(bytes) !== expected) return false;
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return false;
  }
  return parsed.schemaVersion === ACCEPTED_CDR_CANONICAL_INVITATION_SCHEMA
    && parsed.purposeRef === 'purpose.friend-introduction'
    && JSON.stringify(parsed.requestedScopeRefs) === JSON.stringify(['scope.presence', 'scope.profile'])
    && JSON.stringify(parsed.requestedChannelRefs) === JSON.stringify(['channel.manual'])
    && parsed.recipientCommunityIdentityRef === 'community.relationships.fixture.recipient'
    && parsed.recipientUniverseRef === 'universe.relationships.fixture.recipient';
}

export async function importVerifiedRelationshipsInvitation(page) {
  const routeHandler = async (route) => {
    const request = route.request();
    let envelope;
    try {
      envelope = JSON.parse(request.postData() ?? '{}');
    } catch {
      envelope = null;
    }
    if (!requestIsExactImport(envelope)) {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: `${JSON.stringify({ failureCode: 'RELATIONSHIPS_INVITATION_TEST_FIXTURE_REJECTED' })}\n`
      });
      return;
    }
    const artifactBytes = Buffer.from(envelope.payload.artifactBytesBase64, 'base64');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: `${JSON.stringify({
        schemaVersion: BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_RESULT_SCHEMA,
        operation: envelope.operation,
        requestRef: envelope.requestRef,
        state: 'IMPORTED_VERIFIED_CURRENT',
        transport: envelope.transport,
        artifact: {
          artifactSchemaRef: 'artifact.relationships.ux06.synthetic-currentness-fixture.001',
          canonicalPayloadSchemaRef: ACCEPTED_CDR_CANONICAL_INVITATION_SCHEMA,
          artifactSha256: envelope.payload.expectedArtifactSha256,
          artifactBytesBase64: envelope.payload.artifactBytesBase64,
          artifactByteLength: artifactBytes.length,
          transport: 'FILE',
          transportProjectionState: 'EXACT_FILE_BYTES_READY'
        },
        evidence: {
          verificationEvidenceRef: 'evidence.relationships.ux06.synthetic-currentness.verify.001',
          currentnessEvidenceRef: 'currentness.relationships.ux06.synthetic-currentness.001'
        },
        failureCode: null,
        syntheticAdapter: true,
        sourceRefs: SOURCE_REFS,
        effects: EFFECTS_NONE
      })}\n`
    });
  };

  await page.route(API_PATTERN, routeHandler);
  const bytes = canonicalFixtureBytes();
  await page.locator('#relationshipsImportInvitationFile').setInputFiles({
    name: `relationships-currentness-${sha256(bytes)}.vexinvite`,
    mimeType: 'application/octet-stream',
    buffer: bytes
  });
  await page.waitForFunction(() => {
    const state = globalThis.__FFR03_RELATIONSHIPS_TEST__?.snapshot?.().invitationProduct?.state
      ?? globalThis.__UX04_RELATIONSHIPS_TEST__?.snapshot?.().invitationProduct?.state
      ?? globalThis.__VEXLIFE_APP__?.relationships?.snapshot?.().invitationProduct?.state;
    return state === 'IMPORTED_VERIFIED_CURRENT' || String(state ?? '').startsWith('HELD_');
  });

  const snapshot = await page.evaluate(() => {
    const controller = globalThis.__FFR03_RELATIONSHIPS_TEST__
      ?? globalThis.__UX04_RELATIONSHIPS_TEST__
      ?? globalThis.__VEXLIFE_APP__?.relationships;
    return controller.snapshot();
  });
  assert.equal(snapshot.invitationProduct.state, 'IMPORTED_VERIFIED_CURRENT');
  assert.equal(snapshot.invitationProduct.syntheticAdapter, true);
  assert.equal(snapshot.invitationState, 'RECEIVED_VERIFIED_REFERENCE');
  assert.equal(snapshot.identityState, 'VERIFIED_CURRENT');
  assert.equal(snapshot.invitationDecision, 'DEFER');
  assert.equal(await page.locator('#relationshipsInvitation').isDisabled(), true);
  assert.equal(await page.locator('#relationshipsIdentity').isDisabled(), true);
  assert.equal(Object.values(snapshot.invitationProduct.effects).every((value) => value === false), true);
  await page.unroute(API_PATTERN, routeHandler);
  return snapshot;
}

// [VXG RealForever]
