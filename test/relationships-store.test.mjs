import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { semanticHash } from '../src/core/utils.mjs';
import {
  createRelationship,
  exportRelationship,
  readRelationship,
  recoverAbandonedRelationshipWriter,
  relationshipRefFor,
  RelationshipsStoreError,
  transitionRelationship
} from '../src/core/relationships-store.mjs';

const NOW = '2026-08-30T23:15:00.000Z';
const LATER = '2026-08-30T23:16:00.000Z';
const LATER2 = '2026-08-30T23:17:00.000Z';

function home() { return fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-rel-')); }
function owner(root, patch = {}) {
  return {
    home: root,
    localParticipantRef: 'participant.local.alpha',
    localStateRootRef: 'state-root.local.alpha',
    counterpartParticipantRef: 'participant.peer.beta',
    ...patch
  };
}
function createInput(root, patch = {}) {
  return {
    ...owner(root),
    counterpartCurrentKeyRef: 'key.peer.beta.current',
    localRelationshipClass: 'FRIEND',
    invitationRef: 'invitation.friend.alpha-beta.001',
    invitationCurrentnessRef: 'currentness.invitation.alpha-beta.001',
    observedAt: NOW,
    instanceRef: 'instance.relationships.test.001',
    lastAcceptedPeerCurrentnessRef: 'currentness.peer.beta.001',
    routeRef: 'route.cdr.private.001',
    sessionGeneration: 1,
    deliveryObservationRef: 'delivery.observation.001',
    ...patch
  };
}
function transitionInput(root, patch = {}) {
  return {
    ...owner(root),
    action: 'UPDATE_CURRENTNESS',
    expectedRevision: 0,
    observedAt: LATER,
    instanceRef: 'instance.relationships.test.002',
    ...patch
  };
}
function throwsCode(fn, code) {
  assert.throws(fn, (error) => error instanceof RelationshipsStoreError && error.code === code);
}
function ownerHash(localParticipantRef, localStateRootRef) {
  return semanticHash({ schemaVersion: 'vexlife.relationship-owner/v1', localParticipantRef, localStateRootRef });
}
function lockPath(root, localParticipantRef = 'participant.local.alpha', localStateRootRef = 'state-root.local.alpha') {
  return path.join(root, 'relationships', ownerHash(localParticipantRef, localStateRootRef), 'writer.lock');
}
function writeLease(root, { pid, instanceRef = 'instance.relationships.abandoned.001', corrupt = false } = {}) {
  const localParticipantRef = 'participant.local.alpha';
  const localStateRootRef = 'state-root.local.alpha';
  const file = lockPath(root, localParticipantRef, localStateRootRef);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const core = {
    schemaVersion: 'vexlife.relationship-writer/v1',
    ownerFingerprint: ownerHash(localParticipantRef, localStateRootRef),
    localParticipantRef,
    localStateRootRef,
    instanceRef,
    pid,
    lockToken: 'lock-token.relationships.test.001',
    formedAt: NOW
  };
  const lease = { ...core, leaseSha256: corrupt ? '0'.repeat(64) : semanticHash(core) };
  fs.writeFileSync(file, `${JSON.stringify(lease, null, 2)}\n`, { mode: 0o600 });
  return file;
}


test('FRS-00 create requires canonical Vex Home and returns durable local commit receipt', () => {
  const root = home();
  const receipt = createRelationship(createInput(root));
  assert.equal(receipt.state, 'COMMITTED');
  assert.equal(receipt.relationshipPersisted, true);
  assert.equal(receipt.effects.relationshipMutationPerformed, true);
  assert.equal(receipt.effects.canonicalRelationshipPersisted, true);
  assert.equal(receipt.effects.networkEffectPerformed, false);
  assert.equal(receipt.effects.providerEffectPerformed, false);
  const receipts = path.join(root, 'relationships', ownerHash('participant.local.alpha', 'state-root.local.alpha'), 'receipts');
  assert.ok(fs.readdirSync(receipts).some((name) => name.endsWith('.json')));
});

test('FRS-00B symlink Vex Home aliases fail closed', () => {
  const root = home();
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-rel-link-'));
  const alias = path.join(parent, 'alias');
  fs.symlinkSync(root, alias, 'dir');
  throwsCode(() => createRelationship(createInput(alias)), 'RELATIONSHIP_HOME_IDENTITY_MISMATCH');
});

test('FRS-01 self relationship is rejected', () => {
  const root = home();
  throwsCode(() => createRelationship(createInput(root, { counterpartParticipantRef: 'participant.local.alpha' })), 'RELATIONSHIP_SELF_REFERENCE');
});

test('FRS-02 relationship identity excludes route, session, delivery, and state-root volatility', () => {
  const a = relationshipRefFor({ localParticipantRef: 'participant.local.alpha', counterpartParticipantRef: 'participant.peer.beta' });
  const b = relationshipRefFor({ localParticipantRef: 'participant.local.alpha', counterpartParticipantRef: 'participant.peer.beta' });
  assert.equal(a, b);
  const root = home();
  const receipt = createRelationship(createInput(root));
  const updated = transitionRelationship(transitionInput(root, {
    action: 'UPDATE_CURRENTNESS',
    routeRef: 'route.cdr.private.002',
    sessionGeneration: 2,
    deliveryObservationRef: 'delivery.observation.002'
  }));
  assert.equal(updated.relationshipRef, receipt.relationshipRef);
});

test('FRS-03/04 exact retry after commit is idempotent while conflicting create fails closed', () => {
  const root = home();
  const first = createRelationship(createInput(root));
  const retry = createRelationship(createInput(root, { observedAt: LATER, instanceRef: 'instance.relationships.test.retry' }));
  assert.equal(retry.relationshipRef, first.relationshipRef);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.effects.relationshipMutationPerformed, false);
  throwsCode(() => createRelationship(createInput(root, { localRelationshipClass: 'FAMILY', observedAt: LATER2, instanceRef: 'instance.relationships.test.conflict' })), 'RELATIONSHIP_ALREADY_EXISTS');
});

test('FRS-03B commit without receipt never reports Saved; exact retry recovers a durable receipt', () => {
  const root = home();
  throwsCode(() => createRelationship(createInput(root, { faults: { failAfterHeadRenameBeforeReceipt: true } })), 'RELATIONSHIP_RECEIPT_NOT_DURABLE');
  const persisted = readRelationship(owner(root));
  assert.equal(persisted.state, 'CURRENT');
  const retry = createRelationship(createInput(root, { observedAt: LATER, instanceRef: 'instance.relationships.test.receipt-recovery' }));
  assert.equal(retry.state, 'COMMITTED');
  assert.equal(retry.idempotent, true);
});

test('FRS-05 stale expected revision blocks transition', () => {
  const root = home();
  createRelationship(createInput(root));
  transitionRelationship(transitionInput(root));
  throwsCode(() => transitionRelationship(transitionInput(root, { expectedRevision: 0, observedAt: LATER2, instanceRef: 'instance.relationships.test.stale' })), 'RELATIONSHIP_STALE_REVISION');
});

test('FRS-06 read after restart-shaped re-entry returns same relationshipRef and exact revision', () => {
  const root = home();
  const receipt = createRelationship(createInput(root));
  transitionRelationship(transitionInput(root));
  const reloaded = readRelationship(owner(root));
  assert.equal(reloaded.relationshipRef, receipt.relationshipRef);
  assert.equal(reloaded.record.revision, 1);
  assert.equal(reloaded.record.localRelationshipClass, 'FRIEND');
});

test('FRS-07/08 disconnect-reconnect and currentness updates preserve identity and local human class', () => {
  const root = home();
  const first = createRelationship(createInput(root));
  transitionRelationship(transitionInput(root, { action: 'DISCONNECT' }));
  const reconnect = transitionRelationship(transitionInput(root, { action: 'RECONNECT', expectedRevision: 1, observedAt: LATER2, instanceRef: 'instance.relationships.test.reconnect', sessionGeneration: 2 }));
  const current = readRelationship(owner(root));
  assert.equal(reconnect.relationshipRef, first.relationshipRef);
  assert.equal(current.record.status, 'ACTIVE');
  assert.equal(current.record.localRelationshipClass, 'FRIEND');
  assert.equal(current.record.sessionGeneration, 2);
  assert.equal(current.record.semanticAcknowledged, false);
  assert.equal(current.record.reciprocalFriendshipAsserted, false);
});

test('FRS-07B BLOCK/REVOKE/WITHDRAW are attributable terminal-shaped local transitions', () => {
  for (const [action, status] of [['BLOCK', 'BLOCKED'], ['REVOKE', 'REVOKED'], ['WITHDRAW', 'WITHDRAWN']]) {
    const root = home();
    createRelationship(createInput(root));
    const receipt = transitionRelationship(transitionInput(root, { action }));
    assert.equal(receipt.status, status);
    assert.equal(receipt.effects.networkEffectPerformed, false);
    assert.equal(receipt.effects.semanticAcknowledgementCreated, false);
  }
});

test('FRS-09 uncommitted addressed artifacts cannot advance canonical head', () => {
  const root = home();
  throwsCode(() => createRelationship(createInput(root, { faults: { failBeforeHeadRename: true } })), 'RELATIONSHIP_HEAD_NOT_COMMITTED');
  throwsCode(() => readRelationship(owner(root)), 'RELATIONSHIP_NOT_FOUND');
});

test('FRS-10 corrupt head fails closed', () => {
  const root = home();
  createRelationship(createInput(root));
  const relationshipRef = relationshipRefFor(owner(root));
  const ownerDir = path.join(root, 'relationships', ownerHash('participant.local.alpha', 'state-root.local.alpha'));
  const file = path.join(ownerDir, 'heads', `${relationshipRef}.json`);
  const head = JSON.parse(fs.readFileSync(file, 'utf8'));
  head.headSha256 = '0'.repeat(64);
  fs.writeFileSync(file, `${JSON.stringify(head, null, 2)}\n`);
  throwsCode(() => readRelationship(owner(root)), 'RELATIONSHIP_RECEIPT_CORRUPT');
});

test('FRS-11 active and unverifiable writer leases block; abandoned lease requires exact recovery', () => {
  const activeRoot = home();
  writeLease(activeRoot, { pid: process.pid, instanceRef: 'instance.relationships.active.001' });
  throwsCode(() => createRelationship(createInput(activeRoot)), 'RELATIONSHIP_WRITER_CONFLICT');

  const corruptRoot = home();
  writeLease(corruptRoot, { pid: process.pid, instanceRef: 'instance.relationships.corrupt.001', corrupt: true });
  throwsCode(() => createRelationship(createInput(corruptRoot)), 'RELATIONSHIP_WRITER_CONFLICT');

  const abandonedRoot = home();
  writeLease(abandonedRoot, { pid: 2147483647, instanceRef: 'instance.relationships.abandoned.001' });
  throwsCode(() => createRelationship(createInput(abandonedRoot)), 'RELATIONSHIP_WRITER_RECOVERY_REQUIRED');
  const recovered = recoverAbandonedRelationshipWriter({
    home: abandonedRoot,
    localParticipantRef: 'participant.local.alpha',
    localStateRootRef: 'state-root.local.alpha',
    expectedAbandonedInstanceRef: 'instance.relationships.abandoned.001'
  });
  assert.equal(recovered.recovered, true);
  assert.equal(fs.existsSync(lockPath(abandonedRoot)), false);
});

test('FRS-12 wrong state-root binding cannot read or mutate another local owner store', () => {
  const root = home();
  createRelationship(createInput(root));
  const wrong = owner(root, { localStateRootRef: 'state-root.local.other' });
  throwsCode(() => readRelationship(wrong), 'RELATIONSHIP_NOT_FOUND');
  throwsCode(() => transitionRelationship({ ...wrong, action: 'BLOCK', expectedRevision: 0, observedAt: LATER, instanceRef: 'instance.relationships.wrong-root.001' }), 'RELATIONSHIP_NOT_FOUND');
});

test('FRS-13 forbidden endpoint/credential/private-Memory fields fail closed at the closed input membrane', () => {
  const root = home();
  for (const patch of [
    { endpoint: 'private-endpoint' },
    { providerCredential: 'secret' },
    { privateMemory: 'content' },
    { semanticAcknowledged: true },
    { counterpartRelationshipClass: 'FRIEND' }
  ]) {
    throwsCode(() => createRelationship({ ...createInput(root), ...patch }), 'RELATIONSHIP_INPUT_INVALID');
  }
});

test('FRS-14 export is bounded, content-safe, and contains no provider/network/Memory payload', () => {
  const root = home();
  createRelationship(createInput(root));
  transitionRelationship(transitionInput(root, { action: 'DISCONNECT' }));
  transitionRelationship(transitionInput(root, { action: 'RECONNECT', expectedRevision: 1, observedAt: LATER2, instanceRef: 'instance.relationships.test.export', sessionGeneration: 2 }));
  const out = exportRelationship({ ...owner(root), maxTransitions: 8 });
  assert.equal(out.transitionCount, 3);
  assert.equal(out.rawEndpointIncluded, false);
  assert.equal(out.providerCredentialIncluded, false);
  assert.equal(out.privateMemoryIncluded, false);
  assert.equal(out.reciprocalFriendshipAsserted, false);
  assert.equal(out.semanticAcknowledgementCreated, false);
  throwsCode(() => exportRelationship({ ...owner(root), maxTransitions: 2 }), 'RELATIONSHIP_EXPORT_BOUNDED');
});

test('FRS-15 tombstone preserves attributable transition history and relationship identity', () => {
  const root = home();
  const created = createRelationship(createInput(root));
  transitionRelationship(transitionInput(root, { action: 'BLOCK' }));
  transitionRelationship(transitionInput(root, { action: 'TOMBSTONE', expectedRevision: 1, observedAt: LATER2, instanceRef: 'instance.relationships.test.tombstone' }));
  const current = readRelationship(owner(root));
  const out = exportRelationship({ ...owner(root), maxTransitions: 8 });
  assert.equal(current.relationshipRef, created.relationshipRef);
  assert.equal(current.record.tombstoned, true);
  assert.ok(current.record.recoveryOrTombstoneRef.startsWith('transition.relationship.vexlife.'));
  assert.deepEqual(out.transitions.map((item) => item.action), ['CREATE', 'BLOCK', 'TOMBSTONE']);
  throwsCode(() => transitionRelationship(transitionInput(root, { action: 'UPDATE_CURRENTNESS', expectedRevision: 2, observedAt: '2026-08-30T23:18:00.000Z', instanceRef: 'instance.relationships.test.after-tombstone' })), 'RELATIONSHIP_TERMINAL');
});

test('FRS-16/17 persistence never manufactures acknowledgement, reciprocity, network, provider, Memory, model, publication, or public-search effects', () => {
  const root = home();
  const receipt = createRelationship(createInput(root));
  const current = readRelationship(owner(root));
  for (const value of [
    receipt.effects.networkEffectPerformed,
    receipt.effects.providerEffectPerformed,
    receipt.effects.MemoryEffectPerformed,
    receipt.effects.HomeLayoutEffectPerformed,
    receipt.effects.modelRuntimePerformed,
    receipt.effects.publicationPerformed,
    receipt.effects.publicSearchPerformed,
    receipt.effects.semanticAcknowledgementCreated,
    receipt.effects.reciprocalFriendshipCreated,
    current.record.semanticAcknowledged,
    current.record.reciprocalFriendshipAsserted
  ]) assert.equal(value, false);
});

test('FRS-13B raw-IP-shaped refs and unregistered fault controls fail closed', () => {
  const root = home();
  throwsCode(
    () => createRelationship(createInput(root, { routeRef: 'route.private.192.168.1.44' })),
    'RELATIONSHIP_INPUT_INVALID'
  );
  throwsCode(
    () => createRelationship(createInput(root, { faults: { inventedBypass: true } })),
    'RELATIONSHIP_INPUT_INVALID'
  );
  throwsCode(
    () => createRelationship(createInput(root, { faults: { failBeforeHeadRename: 'yes' } })),
    'RELATIONSHIP_INPUT_INVALID'
  );
});

test('FRS-10B recomputed hashes cannot authorize contradictory transition semantics', () => {
  const root = home();
  createRelationship(createInput(root));
  transitionRelationship(transitionInput(root, { action: 'BLOCK' }));
  const relationshipRef = relationshipRefFor(owner(root));
  const ownerDir = path.join(root, 'relationships', ownerHash('participant.local.alpha', 'state-root.local.alpha'));
  const head = JSON.parse(fs.readFileSync(path.join(ownerDir, 'heads', `${relationshipRef}.json`), 'utf8'));
  const record = JSON.parse(fs.readFileSync(path.join(ownerDir, 'records', `${head.recordSha256}.json`), 'utf8'));
  const transitionFile = path.join(ownerDir, 'transitions', `${record.transitionSha256}.json`);
  const transition = JSON.parse(fs.readFileSync(transitionFile, 'utf8'));

  // Manufacture a contradictory BLOCK -> ACTIVE transition and recompute both
  // content-address identities. Structural hashing alone must not bless it.
  transition.nextStatus = 'ACTIVE';
  delete transition.transitionSha256;
  delete transition.transitionRef;
  transition.transitionRef = `transition.relationship.vexlife.${semanticHash(transition).slice(0, 32)}`;
  transition.transitionSha256 = semanticHash(Object.fromEntries(
    Object.entries(transition).filter(([key]) => key !== 'transitionSha256')
  ));
  fs.writeFileSync(transitionFile, `${JSON.stringify(transition, null, 2)}\n`);

  throwsCode(() => readRelationship(owner(root)), 'RELATIONSHIP_RECEIPT_CORRUPT');
});

test('FRS-10C recomputed internally valid transition cannot drift from its addressed lineage pointer', () => {
  const root = home();
  createRelationship(createInput(root));
  transitionRelationship(transitionInput(root, { action: 'UPDATE_CURRENTNESS' }));
  const relationshipRef = relationshipRefFor(owner(root));
  const ownerDir = path.join(root, 'relationships', ownerHash('participant.local.alpha', 'state-root.local.alpha'));
  const head = JSON.parse(fs.readFileSync(path.join(ownerDir, 'heads', `${relationshipRef}.json`), 'utf8'));
  const record = JSON.parse(fs.readFileSync(path.join(ownerDir, 'records', `${head.recordSha256}.json`), 'utf8'));
  const transitionFile = path.join(ownerDir, 'transitions', `${record.transitionSha256}.json`);
  const transition = JSON.parse(fs.readFileSync(transitionFile, 'utf8'));

  transition.observedAt = LATER2;
  delete transition.transitionSha256;
  delete transition.transitionRef;
  transition.transitionRef = `transition.relationship.vexlife.${semanticHash(transition).slice(0, 32)}`;
  transition.transitionSha256 = semanticHash(Object.fromEntries(
    Object.entries(transition).filter(([key]) => key !== 'transitionSha256')
  ));
  fs.writeFileSync(transitionFile, `${JSON.stringify(transition, null, 2)}\n`);

  throwsCode(() => readRelationship(owner(root)), 'RELATIONSHIP_RECEIPT_CORRUPT');
});
