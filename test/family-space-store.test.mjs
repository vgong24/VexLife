import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FamilySpaceStoreError,
  addFamilyMember,
  createFamilySpace,
  exportFamilySpace,
  readFamilySpace,
  recoverAbandonedFamilySpaceWriter,
  transitionFamilyMember,
  updateFamilyCompanionBinding
} from '../src/core/family-space-store.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-family-space-'));
  const home = fs.realpathSync.native(root);
  return { home, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const t0 = '2026-09-09T07:00:00.000Z';
const t1 = '2026-09-09T07:01:00.000Z';
const t2 = '2026-09-09T07:02:00.000Z';
const t3 = '2026-09-09T07:03:00.000Z';
const base = {
  spaceRef: 'space.vex-family.alpha',
  ownerPrincipalRef: 'person.victor',
  ownerPrincipalBindingRef: 'binding.person.victor.device.host',
  familyCompanionLineageRef: 'lineage.vex.family.alpha',
  observedAt: t0,
  instanceRef: 'instance.test.vf01b'
};

function storeRoot(home) {
  return fs.readdirSync(path.join(home, 'family-spaces')).map((name) => path.join(home, 'family-spaces', name))[0];
}
function residue(home) {
  const found = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'writer.lock' || entry.name.includes('.tmp-')) found.push(full);
    }
  };
  walk(home);
  return found;
}

test('FS-00..04 create, add, role/currentness and restart preserve canonical identity', () => {
  const fx = fixture();
  try {
    const created = createFamilySpace({ home: fx.home, ...base });
    assert.equal(created.state, 'CREATED');
    assert.equal(created.record.membershipGeneration, 1);
    assert.equal(created.record.members[0].role, 'OWNER');
    const added = addFamilyMember({
      home: fx.home, spaceRef: base.spaceRef, actorPrincipalRef: base.ownerPrincipalRef,
      principalRef: 'person.mei', principalBindingRef: 'binding.person.mei.device.phone',
      expectedRevision: created.record.revision, expectedMembershipGeneration: created.record.membershipGeneration,
      observedAt: t1, instanceRef: base.instanceRef
    });
    assert.equal(added.record.membershipGeneration, 2);
    assert.equal(added.record.members.find((m) => m.principalRef === 'person.mei').historyVisibilityPolicyRef, 'policy.vex-family.history.from-join');
    const reread = readFamilySpace({ home: fx.home, spaceRef: base.spaceRef });
    assert.equal(reread.record.recordSha256, added.record.recordSha256);
    const promoted = transitionFamilyMember({
      home: fx.home, spaceRef: base.spaceRef, actorPrincipalRef: base.ownerPrincipalRef,
      principalRef: 'person.mei', action: 'CHANGE_ROLE', role: 'ADMIN',
      expectedRevision: reread.record.revision, expectedMembershipGeneration: reread.record.membershipGeneration,
      observedAt: t2, instanceRef: base.instanceRef
    });
    assert.equal(promoted.record.membershipGeneration, 3);
    assert.equal(promoted.record.members.find((m) => m.principalRef === 'person.mei').role, 'ADMIN');
  } finally { fx.cleanup(); }
});

test('FS-02/09 relationship or device existence cannot infer membership and stale generations fail closed', () => {
  const fx = fixture();
  try {
    const created = createFamilySpace({ home: fx.home, ...base });
    assert.throws(() => addFamilyMember({
      home: fx.home, spaceRef: base.spaceRef, actorPrincipalRef: 'person.unknown',
      principalRef: 'person.mei', principalBindingRef: 'binding.person.mei.device.phone',
      expectedRevision: created.record.revision, expectedMembershipGeneration: created.record.membershipGeneration,
      observedAt: t1, instanceRef: base.instanceRef
    }), (error) => error instanceof FamilySpaceStoreError && error.code === 'FAMILY_SPACE_AUTHORITY_DENIED');
    assert.throws(() => addFamilyMember({
      home: fx.home, spaceRef: base.spaceRef, actorPrincipalRef: base.ownerPrincipalRef,
      principalRef: 'person.mei', principalBindingRef: 'binding.person.mei.device.phone',
      expectedRevision: created.record.revision, expectedMembershipGeneration: 0,
      observedAt: t1, instanceRef: base.instanceRef
    }), (error) => error instanceof FamilySpaceStoreError && error.code === 'FAMILY_SPACE_STALE');
  } finally { fx.cleanup(); }
});

test('FS-02 ADMIN cannot create or promote OWNER membership', () => {
  const fx = fixture();
  try {
    const created = createFamilySpace({ home: fx.home, ...base });
    const admin = addFamilyMember({
      home: fx.home, spaceRef: base.spaceRef, actorPrincipalRef: base.ownerPrincipalRef,
      principalRef: 'person.admin', principalBindingRef: 'binding.person.admin.device.host', role: 'ADMIN',
      expectedRevision: created.record.revision, expectedMembershipGeneration: created.record.membershipGeneration,
      observedAt: t1, instanceRef: base.instanceRef
    });
    assert.throws(() => addFamilyMember({
      home: fx.home, spaceRef: base.spaceRef, actorPrincipalRef: 'person.admin',
      principalRef: 'person.owner2', principalBindingRef: 'binding.person.owner2.device.host', role: 'OWNER',
      expectedRevision: admin.record.revision, expectedMembershipGeneration: admin.record.membershipGeneration,
      observedAt: t2, instanceRef: base.instanceRef
    }), (error) => error instanceof FamilySpaceStoreError && error.code === 'FAMILY_SPACE_AUTHORITY_DENIED');
    const member = addFamilyMember({
      home: fx.home, spaceRef: base.spaceRef, actorPrincipalRef: base.ownerPrincipalRef,
      principalRef: 'person.member', principalBindingRef: 'binding.person.member.device.host', role: 'MEMBER',
      expectedRevision: admin.record.revision, expectedMembershipGeneration: admin.record.membershipGeneration,
      observedAt: t2, instanceRef: base.instanceRef
    });
    assert.throws(() => transitionFamilyMember({
      home: fx.home, spaceRef: base.spaceRef, actorPrincipalRef: 'person.admin', principalRef: 'person.member',
      action: 'CHANGE_ROLE', role: 'OWNER',
      expectedRevision: member.record.revision, expectedMembershipGeneration: member.record.membershipGeneration,
      observedAt: t3, instanceRef: base.instanceRef
    }), (error) => error instanceof FamilySpaceStoreError && error.code === 'FAMILY_SPACE_AUTHORITY_DENIED');
    const reread = readFamilySpace({ home: fx.home, spaceRef: base.spaceRef });
    assert.equal(reread.record.members.filter((item) => item.role === 'OWNER' && item.status === 'ACTIVE').length, 1);
    assert.equal(reread.record.members.find((item) => item.principalRef === 'person.member').role, 'MEMBER');
  } finally { fx.cleanup(); }
});

test('FS-05 arbitrary well-formed history policy refs fail closed until separately accepted', () => {
  const fx = fixture();
  try {
    assert.throws(() => createFamilySpace({
      home: fx.home,
      ...base,
      historyVisibilityPolicyRef: 'policy.vex-family.history.all-prior'
    }), (error) => error instanceof FamilySpaceStoreError && error.code === 'FAMILY_SPACE_HISTORY_POLICY_NOT_ACCEPTED');
    const created = createFamilySpace({ home: fx.home, ...base });
    assert.throws(() => addFamilyMember({
      home: fx.home, spaceRef: base.spaceRef, actorPrincipalRef: base.ownerPrincipalRef,
      principalRef: 'person.mei', principalBindingRef: 'binding.person.mei.device.phone',
      historyVisibilityPolicyRef: 'policy.vex-family.history.all-prior',
      expectedRevision: created.record.revision, expectedMembershipGeneration: created.record.membershipGeneration,
      observedAt: t1, instanceRef: base.instanceRef
    }), (error) => error instanceof FamilySpaceStoreError && error.code === 'FAMILY_SPACE_HISTORY_POLICY_NOT_ACCEPTED');
    const reread = readFamilySpace({ home: fx.home, spaceRef: base.spaceRef });
    assert.equal(reread.record.members.length, 1);
    assert.equal(reread.record.members[0].historyVisibilityPolicyRef, 'policy.vex-family.history.from-join');
  } finally { fx.cleanup(); }
});

test('FS-07 leave preserves membership history and last active owner fails closed', () => {
  const fx = fixture();
  try {
    const created = createFamilySpace({ home: fx.home, ...base });
    const added = addFamilyMember({
      home: fx.home, spaceRef: base.spaceRef, actorPrincipalRef: base.ownerPrincipalRef,
      principalRef: 'person.mei', principalBindingRef: 'binding.person.mei.device.phone',
      expectedRevision: created.record.revision, expectedMembershipGeneration: created.record.membershipGeneration,
      observedAt: t1, instanceRef: base.instanceRef
    });
    const left = transitionFamilyMember({
      home: fx.home, spaceRef: base.spaceRef, actorPrincipalRef: 'person.mei', principalRef: 'person.mei',
      action: 'LEAVE', expectedRevision: added.record.revision, expectedMembershipGeneration: added.record.membershipGeneration,
      observedAt: t2, instanceRef: base.instanceRef
    });
    const mei = left.record.members.find((m) => m.principalRef === 'person.mei');
    assert.equal(mei.status, 'LEFT'); assert.equal(mei.joinedAt, t1); assert.equal(mei.leftOrRevokedAtOrNull, t2);
    assert.throws(() => transitionFamilyMember({
      home: fx.home, spaceRef: base.spaceRef, actorPrincipalRef: base.ownerPrincipalRef, principalRef: base.ownerPrincipalRef,
      action: 'LEAVE', expectedRevision: left.record.revision, expectedMembershipGeneration: left.record.membershipGeneration,
      observedAt: t3, instanceRef: base.instanceRef
    }), /last active OWNER/);
  } finally { fx.cleanup(); }
});

test('FS-15..17 Family Vex lineage binding is explicit and generation is separate from membership', () => {
  const fx = fixture();
  try {
    const created = createFamilySpace({ home: fx.home, ...base });
    const next = updateFamilyCompanionBinding({
      home: fx.home, spaceRef: base.spaceRef, actorPrincipalRef: base.ownerPrincipalRef,
      familyCompanionLineageRef: 'lineage.vex.family.alpha.next', familyCompanionState: 'ACTIVE',
      expectedRevision: created.record.revision, expectedBindingGeneration: created.record.familyCompanionBindingGeneration,
      observedAt: t1, instanceRef: base.instanceRef
    });
    assert.equal(next.record.familyCompanionBindingGeneration, 2);
    assert.equal(next.record.membershipGeneration, created.record.membershipGeneration);
    assert.equal(next.record.familyCompanionLineageRef, 'lineage.vex.family.alpha.next');
  } finally { fx.cleanup(); }
});

test('FS-14 failure before head commit leaves no writer lock or temporary residue', () => {
  const fx = fixture();
  try {
    assert.throws(() => createFamilySpace({ home: fx.home, ...base, faults: { failBeforeHeadRename: true } }), /simulated failure/);
    assert.deepEqual(residue(fx.home), []);
  } finally { fx.cleanup(); }
});

test('FS-13 export is bounded and content safe', () => {
  const fx = fixture();
  try {
    createFamilySpace({ home: fx.home, ...base });
    const exported = exportFamilySpace({ home: fx.home, spaceRef: base.spaceRef });
    assert.equal(exported.contentSafe, true);
    const serialized = JSON.stringify(exported);
    assert.equal(serialized.includes(fx.home), false);
    assert.equal(serialized.includes('endpoint'), false);
    assert.equal(serialized.includes('credential'), false);
  } finally { fx.cleanup(); }
});

test('FS-03 exact create is idempotent without durable mutation; conflicting create fails', () => {
  const fx = fixture();
  try {
    const created = createFamilySpace({ home: fx.home, ...base });
    const countReceipts = () => fs.readdirSync(path.join(storeRoot(fx.home), 'receipts')).length;
    const before = countReceipts();
    const duplicate = createFamilySpace({ home: fx.home, ...base });
    assert.equal(duplicate.state, 'EXISTING_CURRENT');
    assert.equal(duplicate.record.recordSha256, created.record.recordSha256);
    assert.equal(countReceipts(), before);
    assert.throws(() => createFamilySpace({ home: fx.home, ...base, ownerPrincipalBindingRef: 'binding.person.victor.device.other' }),
      (error) => error instanceof FamilySpaceStoreError && error.code === 'FAMILY_SPACE_ALREADY_EXISTS');
  } finally { fx.cleanup(); }
});

test('FS-14 failure after head commit remains current and leaves no lock/temp residue', () => {
  const fx = fixture();
  try {
    assert.throws(() => createFamilySpace({ home: fx.home, ...base, faults: { failAfterHeadRenameBeforeReceipt: true } }),
      (error) => error instanceof FamilySpaceStoreError && error.code === 'FAMILY_SPACE_RECEIPT_NOT_EMITTED');
    const reread = readFamilySpace({ home: fx.home, spaceRef: base.spaceRef });
    assert.equal(reread.state, 'CURRENT'); assert.equal(reread.record.members[0].principalRef, base.ownerPrincipalRef);
    assert.deepEqual(residue(fx.home), []);
  } finally { fx.cleanup(); }
});

test('FS-11 corrupt head and corrupt addressed record fail closed', () => {
  const fx = fixture();
  try {
    const created = createFamilySpace({ home: fx.home, ...base });
    const root = storeRoot(fx.home), headPath = path.join(root, 'current.json');
    const goodHead = fs.readFileSync(headPath, 'utf8'), head = JSON.parse(goodHead);
    fs.writeFileSync(headPath, `${JSON.stringify({ ...head, revision: head.revision + 99 }, null, 2)}\n`);
    assert.throws(() => readFamilySpace({ home: fx.home, spaceRef: base.spaceRef }), (error) => error instanceof FamilySpaceStoreError && error.code === 'FAMILY_SPACE_CORRUPT');
    fs.writeFileSync(headPath, goodHead);
    const recordPath = path.join(root, 'records', `${created.record.recordSha256}.json`);
    const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    fs.writeFileSync(recordPath, `${JSON.stringify({ ...record, familyCompanionState: 'RETIRED' }, null, 2)}\n`);
    assert.throws(() => readFamilySpace({ home: fx.home, spaceRef: base.spaceRef }), (error) => error instanceof FamilySpaceStoreError && error.code === 'FAMILY_SPACE_CORRUPT');
  } finally { fx.cleanup(); }
});

test('FS-11 abandoned writer requires exact identity-bound recovery', () => {
  const fx = fixture();
  try {
    createFamilySpace({ home: fx.home, ...base });
    const lock = path.join(storeRoot(fx.home), 'writer.lock');
    fs.writeFileSync(lock, `${JSON.stringify({ schemaVersion: 'vexlife.family-space-writer/v1', instanceRef: 'instance.test.abandoned', pid: 99999999, lockToken: 'abandoned-lock-token-12345', formedAt: t1, leaseSha256: '0'.repeat(64) }, null, 2)}\n`, { mode: 0o600 });
    assert.throws(() => addFamilyMember({
      home: fx.home, spaceRef: base.spaceRef, actorPrincipalRef: base.ownerPrincipalRef,
      principalRef: 'person.mei', principalBindingRef: 'binding.person.mei.device.phone',
      expectedRevision: 0, expectedMembershipGeneration: 1, observedAt: t2, instanceRef: base.instanceRef
    }), (error) => error instanceof FamilySpaceStoreError && error.code === 'FAMILY_SPACE_WRITER_RECOVERY_REQUIRED');
    assert.throws(() => recoverAbandonedFamilySpaceWriter({ home: fx.home, spaceRef: base.spaceRef, expectedInstanceRef: 'instance.wrong' }),
      (error) => error instanceof FamilySpaceStoreError && error.code === 'FAMILY_SPACE_WRITER_CONFLICT');
    const recovered = recoverAbandonedFamilySpaceWriter({ home: fx.home, spaceRef: base.spaceRef, expectedInstanceRef: 'instance.test.abandoned' });
    assert.equal(recovered.state, 'WRITER_RECOVERED'); assert.equal(fs.existsSync(lock), false);
  } finally { fx.cleanup(); }
});
