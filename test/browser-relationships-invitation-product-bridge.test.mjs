import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  ACCEPTED_CDR_CANONICAL_INVITATION_SCHEMA,
  ACCEPTED_VEXINTERFACE_INVITATION_PRODUCT_CONTRACT,
  BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_REQUEST_SCHEMA,
  RELATIONSHIPS_INVITATION_EFFECTS_NONE,
  createBrowserRelationshipsInvitationProductBridge,
} from '../src/core/browser-relationships-invitation-product-bridge.mjs';

const SOURCES = ['github.issue.vexlife.485', 'github.issue.vextreme-sdk.1365'];
const ARTIFACT = Buffer.from('{"signedInvitation":"opaque-public-artifact"}\n', 'utf8');
const ARTIFACT_BASE64 = ARTIFACT.toString('base64');
const ARTIFACT_SHA256 = createHash('sha256').update(ARTIFACT).digest('hex');
const SYNTHETIC_PRIVATE_KEY_HEADER = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');

function request(operation, overrides = {}) {
  return {
    schemaVersion: BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_REQUEST_SCHEMA,
    operation,
    requestRef: `request.relationships.${operation.toLowerCase()}.1`,
    transport: 'FILE',
    productContractRef: ACCEPTED_VEXINTERFACE_INVITATION_PRODUCT_CONTRACT,
    payload: operation === 'CREATE_EXPORT'
      ? {
          recipientCommunityIdentityRef: 'community.bob',
          recipientUniverseRef: 'universe.bob',
          purposeRef: 'purpose.friend-introduction',
          requestedScopeRefs: ['scope.profile'],
          requestedChannelRefs: ['channel.manual'],
          audienceRefs: ['community.bob'],
          expiresAtMs: 2_000,
        }
      : {
          artifactBytesBase64: ARTIFACT_BASE64,
          expectedArtifactSha256: ARTIFACT_SHA256,
          transportRecoveryEvidenceRefOrNull: null,
        },
    sourceRefs: [...SOURCES],
    ...overrides,
  };
}

function artifact(transport = 'FILE') {
  return {
    artifactSchemaRef: 'artifact.invitation.test.1',
    canonicalPayloadSchemaRef: ACCEPTED_CDR_CANONICAL_INVITATION_SCHEMA,
    artifactSha256: ARTIFACT_SHA256,
    artifactBytesBase64: ARTIFACT_BASE64,
    artifactByteLength: ARTIFACT.length,
    transport,
    transportProjectionState: transport === 'FILE'
      ? 'EXACT_FILE_BYTES_READY'
      : 'TEXTUAL_TRANSPORT_CODEC_DEPENDENCY_HELD',
  };
}

function exportedResult(transport = 'FILE') {
  return {
    state: 'EXPORTED',
    adapterEvidenceRef: 'evidence.synthetic.product.export.1',
    syntheticAdapter: true,
    artifact: artifact(transport),
    evidence: { productEvidenceRef: 'evidence.synthetic.product.1' },
    sourceRefs: [...SOURCES],
    effects: { ...RELATIONSHIPS_INVITATION_EFFECTS_NONE },
  };
}

function verifiedResult() {
  return {
    state: 'IMPORTED_VERIFIED_CURRENT',
    adapterEvidenceRef: 'evidence.synthetic.product.import.1',
    syntheticAdapter: true,
    artifact: artifact('FILE'),
    evidence: {
      verificationEvidenceRef: 'evidence.security.verify.synthetic.1',
      currentnessEvidenceRef: 'evidence.security.current.synthetic.1',
      cdrObservation: {
        schemaVersion: 'vexlife.friend-cdr-observation/v1',
        sourceWitness: {
          receiptRef: 'receipt.synthetic.1',
          procedureRef: 'procedure.cdr.s5.single-pair-rehearsal.001',
          currentnessRef: 'currentness.synthetic.1',
          scenarioRef: 'scenario.synthetic.1',
          candidateRef: 'candidate.synthetic.1',
        },
      },
    },
    sourceRefs: [...SOURCES],
    effects: { ...RELATIONSHIPS_INVITATION_EFFECTS_NONE },
  };
}

test('unbound production bridge holds instead of synthesizing invitation success', async () => {
  const bridge = createBrowserRelationshipsInvitationProductBridge();
  const result = await bridge.execute(request('CREATE_EXPORT'));
  assert.equal(result.state, 'HELD_HOST_BINDING_REQUIRED');
  assert.equal(result.failureCode, 'RELATIONSHIPS_INVITATION_HOST_BINDING_REQUIRED');
  assert.equal(result.syntheticAdapter, false);
  assert.deepEqual(result.effects, RELATIONSHIPS_INVITATION_EFFECTS_NONE);
});

test('FILE create/export preserves one exact opaque artifact identity with no VexLife trust or network effect', async () => {
  const calls = [];
  const bridge = createBrowserRelationshipsInvitationProductBridge({
    upstreamAdapter: { async invoke(value) { calls.push(value); return exportedResult(); } }
  });
  const result = await bridge.execute(request('CREATE_EXPORT'));
  assert.equal(calls.length, 1);
  assert.equal(result.state, 'EXPORTED');
  assert.equal(result.syntheticAdapter, true);
  assert.equal(result.artifact.artifactSha256, ARTIFACT_SHA256);
  assert.equal(result.artifact.artifactByteLength, ARTIFACT.length);
  assert.equal(result.artifact.transportProjectionState, 'EXACT_FILE_BYTES_READY');
  assert.deepEqual(result.effects, RELATIONSHIPS_INVITATION_EFFECTS_NONE);
});

test('CODE/QR remain codec-held instead of VexLife inventing textual transport bytes', async () => {
  for (const transport of ['CODE', 'QR']) {
    const bridge = createBrowserRelationshipsInvitationProductBridge({
      upstreamAdapter: {
        async invoke() {
          return {
            state: 'HELD_CODEC_DEPENDENCY',
            adapterEvidenceRef: `evidence.synthetic.codec.${transport.toLowerCase()}`,
            syntheticAdapter: true,
            artifact: null,
            evidence: null,
            sourceRefs: [...SOURCES],
            effects: { ...RELATIONSHIPS_INVITATION_EFFECTS_NONE },
          };
        }
      }
    });
    const result = await bridge.execute(request('CREATE_EXPORT', { transport }));
    assert.equal(result.state, 'HELD_CODEC_DEPENDENCY');
    assert.equal(result.failureCode, 'RELATIONSHIPS_INVITATION_CODEC_DEPENDENCY_HELD');
    assert.equal(result.artifact, null);
  }
});

test('import rejects one-byte/digest substitution before invoking upstream verification', async () => {
  let invoked = false;
  const bridge = createBrowserRelationshipsInvitationProductBridge({
    upstreamAdapter: { async invoke() { invoked = true; return verifiedResult(); } }
  });
  await assert.rejects(
    bridge.execute(request('IMPORT_VERIFY', {
      payload: {
        artifactBytesBase64: Buffer.from('mutated', 'utf8').toString('base64'),
        expectedArtifactSha256: ARTIFACT_SHA256,
        transportRecoveryEvidenceRefOrNull: null,
      },
    })),
    /digest does not match/u,
  );
  assert.equal(invoked, false);
});

test('verified import carries supplied evidence but still performs no relationship persistence', async () => {
  const bridge = createBrowserRelationshipsInvitationProductBridge({
    upstreamAdapter: { async invoke() { return verifiedResult(); } }
  });
  const result = await bridge.execute(request('IMPORT_VERIFY'));
  assert.equal(result.state, 'IMPORTED_VERIFIED_CURRENT');
  assert.equal(result.evidence.verificationEvidenceRef, 'evidence.security.verify.synthetic.1');
  assert.equal(result.evidence.currentnessEvidenceRef, 'evidence.security.current.synthetic.1');
  assert.equal(result.effects.relationshipPersisted, false);
  assert.equal(result.effects.trustFactsMinted, false);
  assert.equal(result.effects.cryptographyPerformed, false);
});

test('protected material is rejected before reaching the upstream adapter', async () => {
  let invoked = false;
  const bridge = createBrowserRelationshipsInvitationProductBridge({
    upstreamAdapter: { async invoke() { invoked = true; return exportedResult(); } }
  });
  await assert.rejects(
    bridge.execute(request('CREATE_EXPORT', {
      payload: { privateKey: `${SYNTHETIC_PRIVATE_KEY_HEADER} not-allowed` },
    })),
    /protected/u,
  );
  assert.equal(invoked, false);
});
