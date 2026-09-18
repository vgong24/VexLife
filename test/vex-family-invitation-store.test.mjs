import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  addFamilyMember,
  createFamilySpace,
  readFamilySpace
} from '../src/core/family-space-store.mjs';
import {
  FAMILY_INVITATION_STATES,
  FamilyInvitationStoreError,
  acceptFamilyInvitation,
  expireFamilyInvitation,
  exportFamilyInvitation,
  issueFamilyInvitation,
  readFamilyInvitation,
  revokeFamilyInvitation
} from '../src/core/family-invitation-store.mjs';
import { createFamilyChannel } from '../src/core/family-conversation.mjs';
import { materializeConversationChannel } from '../src/core/conversation-store.mjs';

const T0 = '2026-09-18T10:00:00.000Z';
const T1 = '2026-09-18T10:05:00.000Z';
const T2 = '2026-09-18T10:10:00.000Z';
const T3 = '2026-09-18T11:00:00.000Z';
const SPACE = 'space.vex.family.join-store';
const LINEAGE = 'lineage.vex.family.join-store';

function tempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vf07b-invite-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function family(t) {
  const home = tempHome(t);
  let record = createFamilySpace({
    home,
    spaceRef: SPACE,
    ownerPrincipalRef: 'principal.victor',
    ownerPrincipalBindingRef: 'principal-binding.vex.family.victor',
    familyCompanionLineageRef: LINEAGE,
    observedAt: T0,
    instanceRef: 'instance.invite.fixture.space'
  }).record;
  return { home, record };
}

function issueInput(f, overrides = {}) {
  return {
    home: f.home,
    spaceRef: SPACE,
    inviterPrincipalRef: 'principal.victor',
    expectedFamilyRecordSha256: f.record.recordSha256,
    expectedRevision: f.record.revision,
    expectedMembershipGeneration: f.record.membershipGeneration,
    idempotencyKey: 'intent.vex.family.invite.primary',
    issuedAt: T1,
    expiresAt: T3,
    sourceReceiptRefs: ['receipt.family.invite.source'],
    currentnessRefs: ['currentness.family.invite.source'],
    instanceRef: 'instance.invite.issue.primary',
    faults: {},
    ...overrides
  };
}

test('FIS-00 current OWNER can issue one targetless MEMBER invitation', (t) => {
  const f = family(t);
  const result = issueFamilyInvitation(issueInput(f));
  assert.equal(result.state, 'INVITATION_ISSUED');
  assert.match(result.record.invitationRef, /^invitation\.vex-family\./u);
  assert.equal(result.record.spaceRef, SPACE);
  assert.equal(result.record.inviterPrincipalRef, 'principal.victor');
  assert.equal(result.record.offeredRole, 'MEMBER');
  assert.equal(result.record.historyVisibilityPolicyRef, 'policy.vex-family.history.from-join');
  assert.equal(result.record.state, 'PENDING');
  assert.equal(result.record.revision, 0);
  assert.equal(Object.hasOwn(result.record, 'targetPrincipalRef'), false);
  assert.equal(result.effects.familyMembershipMutation, false);
  assert.equal(result.effects.networkDelivery, false);
});

test('FIS-01 non-manager cannot issue an invitation', (t) => {
  const f = family(t);
  f.record = addFamilyMember({
    home: f.home,
    spaceRef: SPACE,
    actorPrincipalRef: 'principal.victor',
    principalRef: 'principal.casey',
    principalBindingRef: 'principal-binding.vex.family.casey',
    role: 'MEMBER',
    expectedRevision: f.record.revision,
    expectedMembershipGeneration: f.record.membershipGeneration,
    observedAt: T1,
    instanceRef: 'instance.invite.fixture.add.casey'
  }).record;
  const input = issueInput(f, {
    inviterPrincipalRef: 'principal.casey',
    issuedAt: T2,
    expiresAt: T3
  });
  assert.throws(
    () => issueFamilyInvitation(input),
    (error) =>
      error instanceof FamilyInvitationStoreError
      && error.code === 'FAMILY_INVITATION_AUTHORITY_DENIED'
  );
});

test('FIS-02 caller cannot author target identity, binding, role or acceptance state', (t) => {
  const f = family(t);
  for (const extra of [
    { targetPrincipalRef: 'principal.alex' },
    { targetPrincipalBindingRef: 'principal-binding.alex' },
    { offeredRole: 'OWNER' },
    { state: 'ACCEPTED' },
    { acceptanceRef: 'acceptance.fake' }
  ]) {
    assert.throws(
      () => issueFamilyInvitation({ ...issueInput(f), ...extra }),
      (error) =>
        error instanceof FamilyInvitationStoreError
        && error.code === 'FAMILY_INVITATION_UNTRUSTED_FIELD'
    );
  }
});

test('FIS-03 exact issue retry is deterministic and conflicting same-key semantics fail', (t) => {
  const f = family(t);
  const first = issueFamilyInvitation(issueInput(f));
  const second = issueFamilyInvitation(issueInput(f, {
    instanceRef: 'instance.invite.issue.retry'
  }));
  assert.equal(second.state, 'IDEMPOTENT_CURRENT');
  assert.equal(second.record.invitationRef, first.record.invitationRef);
  assert.equal(second.record.recordSha256, first.record.recordSha256);
  assert.equal(second.effects.invitationStateMutation, false);

  assert.throws(
    () => issueFamilyInvitation(issueInput(f, {
      expiresAt: '2026-09-18T12:00:00.000Z',
      instanceRef: 'instance.invite.issue.conflict'
    })),
    (error) =>
      error instanceof FamilyInvitationStoreError
      && error.code === 'FAMILY_INVITATION_CONFLICT'
  );
});

test('FIS-04 expired PENDING invitation fails current projection until explicit expiry commit', (t) => {
  const f = family(t);
  const issued = issueFamilyInvitation(issueInput(f));
  const stale = readFamilyInvitation({
    home: f.home,
    invitationRef: issued.record.invitationRef,
    observedAt: T3
  });
  assert.equal(stale.state, 'EXPIRY_COMMIT_REQUIRED');
  assert.equal(stale.effectiveState, 'EXPIRED');
  assert.equal(stale.record.state, 'PENDING');

  const expired = expireFamilyInvitation({
    home: f.home,
    invitationRef: issued.record.invitationRef,
    expectedInvitationRevision: 0,
    observedAt: T3,
    instanceRef: 'instance.invite.expire',
    faults: {}
  });
  assert.equal(expired.state, 'INVITATION_EXPIRED');
  assert.equal(expired.record.state, 'EXPIRED');
  assert.equal(expired.record.revision, 1);
  assert.equal(expired.effects.familyMembershipMutation, false);

  const current = readFamilyInvitation({
    home: f.home,
    invitationRef: issued.record.invitationRef,
    observedAt: T3
  });
  assert.equal(current.state, 'CURRENT');
  assert.equal(current.effectiveState, 'EXPIRED');
});

test('FIS-05 revoke requires a current Family manager and exact current Family record', (t) => {
  const f = family(t);
  const issued = issueFamilyInvitation(issueInput(f));

  assert.throws(
    () => revokeFamilyInvitation({
      home: f.home,
      invitationRef: issued.record.invitationRef,
      actorPrincipalRef: 'principal.victor',
      expectedInvitationRevision: 0,
      expectedFamilyRecordSha256: '0'.repeat(64),
      expectedFamilyRevision: f.record.revision,
      expectedMembershipGeneration: f.record.membershipGeneration,
      observedAt: T2,
      sourceReceiptRefs: ['receipt.family.invite.revoke'],
      currentnessRefs: ['currentness.family.invite.revoke'],
      instanceRef: 'instance.invite.revoke.stale',
      faults: {}
    }),
    (error) =>
      error instanceof FamilyInvitationStoreError
      && error.code === 'FAMILY_INVITATION_FAMILY_STALE'
  );

  const revoked = revokeFamilyInvitation({
    home: f.home,
    invitationRef: issued.record.invitationRef,
    actorPrincipalRef: 'principal.victor',
    expectedInvitationRevision: 0,
    expectedFamilyRecordSha256: f.record.recordSha256,
    expectedFamilyRevision: f.record.revision,
    expectedMembershipGeneration: f.record.membershipGeneration,
    observedAt: T2,
    sourceReceiptRefs: ['receipt.family.invite.revoke'],
    currentnessRefs: ['currentness.family.invite.revoke'],
    instanceRef: 'instance.invite.revoke',
    faults: {}
  });
  assert.equal(revoked.state, 'INVITATION_REVOKED');
  assert.equal(revoked.record.state, 'REVOKED');
  assert.equal(revoked.record.revision, 1);
});

test('FIS-06 terminal invitations cannot be silently reactivated or repurposed', (t) => {
  const f = family(t);
  const issued = issueFamilyInvitation(issueInput(f));
  revokeFamilyInvitation({
    home: f.home,
    invitationRef: issued.record.invitationRef,
    actorPrincipalRef: 'principal.victor',
    expectedInvitationRevision: 0,
    expectedFamilyRecordSha256: f.record.recordSha256,
    expectedFamilyRevision: f.record.revision,
    expectedMembershipGeneration: f.record.membershipGeneration,
    observedAt: T2,
    sourceReceiptRefs: ['receipt.family.invite.revoke'],
    currentnessRefs: ['currentness.family.invite.revoke'],
    instanceRef: 'instance.invite.revoke',
    faults: {}
  });
  const retry = issueFamilyInvitation(issueInput(f, {
    instanceRef: 'instance.invite.issue.after-revoke'
  }));
  assert.equal(retry.state, 'EXISTING_TERMINAL');
  assert.equal(retry.record.state, 'REVOKED');
  assert.equal(retry.effects.invitationStateMutation, false);
});

test('FIS-07 post-head/pre-receipt interruption recovers exact durable invitation without duplicate mutation', (t) => {
  const f = family(t);
  assert.throws(
    () => issueFamilyInvitation(issueInput(f, {
      faults: { failAfterHeadRenameBeforeReceipt: true }
    })),
    (error) =>
      error instanceof FamilyInvitationStoreError
      && error.code === 'FAMILY_INVITATION_RECEIPT_NOT_EMITTED'
  );

  const retry = issueFamilyInvitation(issueInput(f, {
    instanceRef: 'instance.invite.issue.recovery',
    faults: {}
  }));
  assert.equal(retry.state, 'IDEMPOTENT_CURRENT');
  assert.equal(retry.record.revision, 0);

  const read = readFamilyInvitation({
    home: f.home,
    invitationRef: retry.record.invitationRef,
    observedAt: T2
  });
  assert.equal(read.state, 'CURRENT');
  assert.equal(read.record.recordSha256, retry.record.recordSha256);
});

test('FIS-08 Family currentness changes do not let stale issuance authority pass', (t) => {
  const f = family(t);
  const prior = f.record;
  f.record = addFamilyMember({
    home: f.home,
    spaceRef: SPACE,
    actorPrincipalRef: 'principal.victor',
    principalRef: 'principal.casey',
    principalBindingRef: 'principal-binding.vex.family.casey',
    role: 'MEMBER',
    expectedRevision: f.record.revision,
    expectedMembershipGeneration: f.record.membershipGeneration,
    observedAt: T1,
    instanceRef: 'instance.invite.fixture.add'
  }).record;
  assert.throws(
    () => issueFamilyInvitation(issueInput({ home: f.home, record: prior }, {
      issuedAt: T2,
      expiresAt: T3,
      instanceRef: 'instance.invite.issue.stale-family'
    })),
    (error) =>
      error instanceof FamilyInvitationStoreError
      && error.code === 'FAMILY_INVITATION_FAMILY_STALE'
  );
});

test('FIS-09 durable exact issue retry survives a later unrelated Family generation', (t) => {
  const f = family(t);
  const prior = f.record;
  const issued = issueFamilyInvitation(issueInput(f));
  f.record = addFamilyMember({
    home: f.home,
    spaceRef: SPACE,
    actorPrincipalRef: 'principal.victor',
    principalRef: 'principal.casey',
    principalBindingRef: 'principal-binding.vex.family.casey',
    role: 'MEMBER',
    expectedRevision: f.record.revision,
    expectedMembershipGeneration: f.record.membershipGeneration,
    observedAt: T2,
    instanceRef: 'instance.invite.fixture.advance-after-issue'
  }).record;

  const retry = issueFamilyInvitation(issueInput({
    home: f.home,
    record: prior
  }, {
    instanceRef: 'instance.invite.issue.recover-after-family-advance'
  }));
  assert.equal(retry.state, 'IDEMPOTENT_CURRENT');
  assert.equal(retry.record.invitationRef, issued.record.invitationRef);
  assert.equal(retry.record.recordSha256, issued.record.recordSha256);
  assert.equal(retry.effects.invitationStateMutation, false);
});

test('FIS-10 export is content-safe and does not invent invitee or delivery truth', (t) => {
  const f = family(t);
  const issued = issueFamilyInvitation(issueInput(f));
  const exported = exportFamilyInvitation({
    home: f.home,
    invitationRef: issued.record.invitationRef,
    observedAt: T2
  });
  assert.equal(exported.contentSafe, true);
  assert.equal(exported.invitation.invitationRef, issued.record.invitationRef);
  assert.equal(Object.hasOwn(exported.invitation, 'targetPrincipalRef'), false);
  assert.equal(Object.hasOwn(exported.invitation, 'principalBindingRef'), false);
  assert.equal(Object.hasOwn(exported.invitation, 'deliveryState'), false);
});

test('FIS-11 ACCEPTED and DECLINED are schema states but not caller transitions in this first owner', (t) => {
  assert.deepEqual(
    FAMILY_INVITATION_STATES,
    ['PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED']
  );
  const f = family(t);
  assert.throws(
    () => issueFamilyInvitation({ ...issueInput(f), transitionState: 'ACCEPTED' }),
    (error) =>
      error instanceof FamilyInvitationStoreError
      && error.code === 'FAMILY_INVITATION_UNTRUSTED_FIELD'
  );
});

test('FIS-12 invitation persistence does not mutate Family membership or conversation state', (t) => {
  const f = family(t);
  const before = readFamilySpace({ home: f.home, spaceRef: SPACE }).record;
  const issued = issueFamilyInvitation(issueInput(f));
  const after = readFamilySpace({ home: f.home, spaceRef: SPACE }).record;
  assert.equal(after.recordSha256, before.recordSha256);
  assert.equal(after.membershipGeneration, before.membershipGeneration);
  assert.equal(issued.effects.familyMembershipMutation, false);
  assert.equal(issued.effects.conversationMutation, false);
  assert.equal(issued.effects.relationshipsMutation, false);
  assert.equal(issued.effects.modelInvocation, false);
  assert.equal(issued.effects.memoryMutation, false);
  assert.equal(issued.effects.publicationMutation, false);
});

test('FIS-13 exact revoke retry recognizes the already committed N-to-N+1 terminal transition', (t) => {
  const f = family(t);
  const issued = issueFamilyInvitation(issueInput(f));
  const input = {
    home: f.home,
    invitationRef: issued.record.invitationRef,
    actorPrincipalRef: 'principal.victor',
    expectedInvitationRevision: 0,
    expectedFamilyRecordSha256: f.record.recordSha256,
    expectedFamilyRevision: f.record.revision,
    expectedMembershipGeneration: f.record.membershipGeneration,
    observedAt: T2,
    sourceReceiptRefs: ['receipt.family.invite.revoke'],
    currentnessRefs: ['currentness.family.invite.revoke'],
    instanceRef: 'instance.invite.revoke.retry',
    faults: {}
  };
  const first = revokeFamilyInvitation(input);
  const retry = revokeFamilyInvitation({
    ...input,
    instanceRef: 'instance.invite.revoke.retry.two'
  });
  assert.equal(first.record.revision, 1);
  assert.equal(retry.state, 'IDEMPOTENT_CURRENT');
  assert.equal(retry.record.recordSha256, first.record.recordSha256);
  assert.equal(retry.effects.invitationStateMutation, false);
});

test('FIS-14 exact expiry retry recognizes the already committed N-to-N+1 terminal transition', (t) => {
  const f = family(t);
  const issued = issueFamilyInvitation(issueInput(f));
  const input = {
    home: f.home,
    invitationRef: issued.record.invitationRef,
    expectedInvitationRevision: 0,
    observedAt: T3,
    instanceRef: 'instance.invite.expire.retry',
    faults: {}
  };
  const first = expireFamilyInvitation(input);
  const retry = expireFamilyInvitation({
    ...input,
    instanceRef: 'instance.invite.expire.retry.two'
  });
  assert.equal(first.record.revision, 1);
  assert.equal(retry.state, 'IDEMPOTENT_CURRENT');
  assert.equal(retry.record.recordSha256, first.record.recordSha256);
  assert.equal(retry.effects.invitationStateMutation, false);
});

test('FIS-15 early expiry fails closed', (t) => {
  const f = family(t);
  const issued = issueFamilyInvitation(issueInput(f));
  assert.throws(
    () => expireFamilyInvitation({
      home: f.home,
      invitationRef: issued.record.invitationRef,
      expectedInvitationRevision: 0,
      observedAt: T2,
      instanceRef: 'instance.invite.expire.early',
      faults: {}
    }),
    (error) =>
      error instanceof FamilyInvitationStoreError
      && error.code === 'FAMILY_INVITATION_NOT_EXPIRED'
  );
});


test('FIS-16 ACCEPTED finalization requires exact durable Family add + GROUP channel truth', (t) => {
  const f=family(t);
  const issued=issueFamilyInvitation(issueInput(f));
  const added=addFamilyMember({
    home:f.home,spaceRef:SPACE,actorPrincipalRef:'principal.victor',principalRef:'principal.alex',
    principalBindingRef:'principal-binding.vex.family.alex',role:'MEMBER',
    expectedRevision:f.record.revision,expectedMembershipGeneration:f.record.membershipGeneration,
    observedAt:T2,instanceRef:'instance.invite.accept.add'
  });
  const current=added.record;
  const channel=createFamilyChannel({
    channelRef:'channel.vex-family.accepted',threadRef:'thread.vex-family.accepted',
    familySpaceRecord:current,labelStringRef:'family-room.channel',createdAt:T2
  });
  materializeConversationChannel({home:f.home,channel,instanceRef:'instance.invite.accept.channel',observedAt:T2});
  const accepted=acceptFamilyInvitation({
    home:f.home,invitationRef:issued.record.invitationRef,expectedInvitationRevision:0,
    acceptedPrincipalRef:'principal.alex',acceptedPrincipalBindingRef:'principal-binding.vex.family.alex',
    expectedAcceptedFamilyRecordSha256:current.recordSha256,expectedAcceptedFamilyRevision:current.revision,
    expectedAcceptedMembershipGeneration:current.membershipGeneration,acceptedChannelRef:channel.channelRef,
    acceptedAt:T2,observedAt:T2,instanceRef:'instance.invite.accept.finalize',faults:{}
  });
  assert.equal(accepted.state,'INVITATION_ACCEPTED');
  assert.equal(accepted.record.state,'ACCEPTED');
  assert.equal(accepted.record.acceptedPrincipalRefOrNull,'principal.alex');
  assert.equal(accepted.record.acceptedMembershipGenerationOrNull,current.membershipGeneration);
  assert.equal(accepted.record.acceptedChannelRefOrNull,channel.channelRef);
  assert.equal(accepted.effects.familyMembershipMutation,false);
  assert.equal(accepted.effects.conversationMutation,false);
});

test('FIS-17 ACCEPTED finalization cannot fabricate membership/channel', (t) => {
  const f=family(t);
  const issued=issueFamilyInvitation(issueInput(f));
  assert.throws(
    ()=>acceptFamilyInvitation({
      home:f.home,invitationRef:issued.record.invitationRef,expectedInvitationRevision:0,
      acceptedPrincipalRef:'principal.alex',acceptedPrincipalBindingRef:'principal-binding.vex.family.alex',
      expectedAcceptedFamilyRecordSha256:f.record.recordSha256,expectedAcceptedFamilyRevision:f.record.revision,
      expectedAcceptedMembershipGeneration:f.record.membershipGeneration,acceptedChannelRef:'channel.vex-family.missing',
      acceptedAt:T2,observedAt:T2,instanceRef:'instance.invite.accept.invalid',faults:{}
    }),
    (error)=>error instanceof FamilyInvitationStoreError&&error.code==='FAMILY_INVITATION_ACCEPTANCE_RESULT_MISMATCH'
  );
});

test('FIS-18 acceptance may finalize after wall-clock expiry only when canonical add occurred pre-expiry', (t) => {
  const f=family(t);
  const issued=issueFamilyInvitation(issueInput(f,{expiresAt:'2026-09-18T10:30:00.000Z'}));
  const added=addFamilyMember({
    home:f.home,spaceRef:SPACE,actorPrincipalRef:'principal.victor',principalRef:'principal.alex',
    principalBindingRef:'principal-binding.vex.family.alex',role:'MEMBER',
    expectedRevision:f.record.revision,expectedMembershipGeneration:f.record.membershipGeneration,
    observedAt:T2,instanceRef:'instance.invite.accept.pre-expiry'
  });
  const channel=createFamilyChannel({
    channelRef:'channel.vex-family.pre-expiry',threadRef:'thread.vex-family.pre-expiry',
    familySpaceRecord:added.record,labelStringRef:'family-room.channel',createdAt:T2
  });
  materializeConversationChannel({home:f.home,channel,instanceRef:'instance.invite.accept.pre-expiry.channel',observedAt:T2});
  const accepted=acceptFamilyInvitation({
    home:f.home,invitationRef:issued.record.invitationRef,expectedInvitationRevision:0,
    acceptedPrincipalRef:'principal.alex',acceptedPrincipalBindingRef:'principal-binding.vex.family.alex',
    expectedAcceptedFamilyRecordSha256:added.record.recordSha256,expectedAcceptedFamilyRevision:added.record.revision,
    expectedAcceptedMembershipGeneration:added.record.membershipGeneration,acceptedChannelRef:channel.channelRef,
    acceptedAt:T2,observedAt:T3,instanceRef:'instance.invite.accept.late-finalize',faults:{}
  });
  assert.equal(accepted.record.state,'ACCEPTED');
  assert.equal(accepted.record.acceptedAtOrNull,T2);
});
