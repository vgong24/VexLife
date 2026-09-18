import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  readFamilySpace
} from '../src/core/family-space-store.mjs';
import {
  readConversationChannelBinding
} from '../src/core/conversation-store.mjs';
import {
  FamilyHostRuntimeError,
  deriveFamilyEstablishmentIdentity,
  deriveFamilyPrincipalBindingRef,
  hostFamily
} from '../src/core/family-host-runtime.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const T0 = '2026-09-18T08:30:00.000Z';
const EXPIRES = '2026-09-18T09:30:00.000Z';

function hash(value, field) {
  const core = structuredClone(value);
  return Object.freeze({ ...core, [field]: semanticHash(core) });
}

function authority({
  principalRef = 'principal.victor',
  deviceRef = 'device.victor',
  membershipRef = 'membership.home.victor',
  homeRef = 'home.victor',
  generation = 7,
  leaseState = 'ACTIVE',
  membershipState = 'ACTIVE',
  expiresAt = EXPIRES
} = {}) {
  const membership = hash({
    schemaVersion: 'vexlife.bridge-device-membership/v1',
    membershipRef,
    homeNodeRef: homeRef,
    principalRef,
    deviceRef,
    devicePublicKey: 'public-key-victor',
    capabilityRefs: ['capability.family'],
    approvedBy: 'principal.victor',
    approvedAt: '2026-09-18T08:00:00.000Z',
    revocationGeneration: generation,
    state: membershipState
  }, 'membershipHash');
  const lease = hash({
    schemaVersion: 'vexlife.bridge-capability-lease/v1',
    leaseRef: 'lease.family.victor.' + generation,
    homeNodeRef: homeRef,
    principalRef,
    deviceRef,
    capabilityRefs: ['capability.family'],
    projectRefs: ['project.vexlife'],
    issuedAt: '2026-09-18T08:00:00.000Z',
    expiresAt,
    revocationGeneration: generation,
    state: leaseState
  }, 'leaseHash');
  return Object.freeze({
    membership,
    lease,
    currentRevocationGeneration: generation
  });
}

function tempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vf07b-host-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function request(t, overrides = {}) {
  return {
    home: tempHome(t),
    currentAuthorityProjection: authority(),
    idempotencyKey: 'intent.vex.family.host.primary',
    observedAt: T0,
    instanceRef: 'instance.vex.family.host.primary',
    faults: {},
    ...overrides
  };
}

test('FH-00 browser/caller cannot author canonical Host identities or roles', (t) => {
  const input = request(t);
  assert.throws(
    () => hostFamily({ ...input, principalRef: 'principal.attacker' }),
    (error) =>
      error instanceof FamilyHostRuntimeError
      && error.code === 'FAMILY_HOST_UNTRUSTED_FIELD'
  );
  assert.throws(
    () => hostFamily({ ...input, familyCompanionLineageRef: 'lineage.vex.family.attacker' }),
    (error) =>
      error instanceof FamilyHostRuntimeError
      && error.code === 'FAMILY_HOST_UNTRUSTED_FIELD'
  );
});

test('FH-01 current authenticated Home authority projection is required before Family mutation', (t) => {
  const good = authority();
  const ids = deriveFamilyEstablishmentIdentity({
    currentAuthorityProjection: good,
    idempotencyKey: 'intent.vex.family.host.primary',
    observedAt: T0
  });
  const input = request(t, {
    currentAuthorityProjection: authority({ membershipState: 'REVOKED' })
  });
  assert.throws(
    () => hostFamily(input),
    (error) =>
      error instanceof FamilyHostRuntimeError
      && error.code === 'FAMILY_HOST_AUTHORITY_NOT_CURRENT'
  );
  assert.equal(readFamilySpace({ home: input.home, spaceRef: ids.spaceRef }).state, 'NOT_FOUND');
});

test('FH-02 Family principal binding is deterministic and exact current Home/revocation bound', () => {
  const a = authority();
  const first = deriveFamilyPrincipalBindingRef(a, T0);
  assert.equal(first, deriveFamilyPrincipalBindingRef(a, T0));
  assert.notEqual(first, a.membership.membershipRef);
  const next = authority({ generation: 8 });
  assert.notEqual(first, deriveFamilyPrincipalBindingRef(next, T0));
  const otherDevice = authority({ deviceRef: 'device.other' });
  assert.notEqual(first, deriveFamilyPrincipalBindingRef(otherDevice, T0));
});

test('FH-03 Family lineage identity is source-owned and never personal companion lineage', () => {
  const ids = deriveFamilyEstablishmentIdentity({
    currentAuthorityProjection: authority(),
    idempotencyKey: 'intent.vex.family.host.primary',
    observedAt: T0
  });
  assert.match(ids.familyCompanionLineageRef, /^lineage\.vex\.family\./u);
  assert.equal(ids.familyCompanionLineageRef.startsWith('companion-lineage.vexlife.'), false);
});

test('FH-04 establishment identities are exact-retry deterministic and authority/key bound', () => {
  const input = {
    currentAuthorityProjection: authority(),
    idempotencyKey: 'intent.vex.family.host.primary',
    observedAt: T0
  };
  const first = deriveFamilyEstablishmentIdentity(input);
  assert.deepEqual(first, deriveFamilyEstablishmentIdentity(input));
  assert.notDeepEqual(
    first,
    deriveFamilyEstablishmentIdentity({
      ...input,
      idempotencyKey: 'intent.vex.family.host.secondary'
    })
  );
  assert.notDeepEqual(
    first,
    deriveFamilyEstablishmentIdentity({
      ...input,
      currentAuthorityProjection: authority({
        principalRef: 'principal.alex',
        deviceRef: 'device.alex',
        membershipRef: 'membership.home.alex'
      })
    })
  );
});

test('FH-05 Host creates exactly one owner membership from authenticated principal truth', (t) => {
  const input = request(t);
  const result = hostFamily(input);
  const current = readFamilySpace({ home: input.home, spaceRef: result.spaceRef });
  assert.equal(current.state, 'CURRENT');
  assert.equal(current.record.members.length, 1);
  assert.equal(current.record.members[0].principalRef, 'principal.victor');
  assert.equal(current.record.members[0].principalBindingRef, result.ownerPrincipalBindingRef);
  assert.equal(current.record.members[0].role, 'OWNER');
  assert.equal(current.record.members[0].status, 'ACTIVE');
});

test('FH-06 initial GROUP channel binds exact created Family record/generation', (t) => {
  const input = request(t);
  const result = hostFamily(input);
  const space = readFamilySpace({ home: input.home, spaceRef: result.spaceRef }).record;
  const channel = readConversationChannelBinding({
    home: input.home,
    channelRef: result.initialChannelRef
  });
  assert.equal(channel.state, 'CURRENT');
  assert.equal(channel.channel.kind, 'GROUP');
  assert.equal(channel.channel.threadRef, result.threadRef);
  assert.equal(channel.channel.familySpaceBinding.spaceRef, result.spaceRef);
  assert.equal(channel.channel.familySpaceBinding.membershipGeneration, 1);
  assert.equal(channel.channel.familySpaceBinding.familySpaceRecordSha256, space.recordSha256);
  assert.equal(
    channel.channel.familySpaceBinding.familyCompanionLineageRef,
    result.familyCompanionLineageRef
  );
});

test('FH-07 post-space/pre-channel interruption recovers same space/lineage/channel', (t) => {
  const input = request(t, { faults: { failAfterSpaceCreation: true } });
  let details;
  assert.throws(
    () => hostFamily(input),
    (error) => {
      details = error.details;
      return (
        error instanceof FamilyHostRuntimeError
        && error.code === 'FAMILY_HOST_CHANNEL_CONTINUATION_REQUIRED'
      );
    }
  );
  const space = readFamilySpace({ home: input.home, spaceRef: details.spaceRef });
  assert.equal(space.state, 'CURRENT');
  assert.equal(
    readConversationChannelBinding({
      home: input.home,
      channelRef: details.initialChannelRef
    }).state,
    'NOT_FOUND'
  );

  const recovered = hostFamily({
    ...input,
    instanceRef: 'instance.vex.family.host.retry',
    faults: {}
  });
  assert.equal(recovered.spaceRef, details.spaceRef);
  assert.equal(recovered.familyCompanionLineageRef, details.familyCompanionLineageRef);
  assert.equal(recovered.threadRef, details.threadRef);
  assert.equal(recovered.initialChannelRef, details.initialChannelRef);
  assert.equal(recovered.familySpaceState, 'EXISTING_CURRENT');
  assert.equal(recovered.channelMaterializationState, 'MATERIALIZED');
});

test('FH-08 full-success retry is idempotent and performs no second canonical mutation', (t) => {
  const input = request(t);
  const first = hostFamily(input);
  const second = hostFamily({
    ...input,
    instanceRef: 'instance.vex.family.host.retry'
  });
  assert.equal(second.state, 'FAMILY_HOST_IDEMPOTENT_CURRENT');
  assert.equal(second.establishmentRef, first.establishmentRef);
  assert.equal(second.spaceRef, first.spaceRef);
  assert.equal(second.familyCompanionLineageRef, first.familyCompanionLineageRef);
  assert.equal(second.initialChannelRef, first.initialChannelRef);
  assert.equal(second.familySpaceState, 'EXISTING_CURRENT');
  assert.equal(second.channelMaterializationState, 'IDEMPOTENT_CURRENT');
  assert.equal(second.effects.familySpaceMutation, false);
  assert.equal(second.effects.conversationChannelMutation, false);
});

test('FH-09 stale/revoked/mismatched Home authority fails before Family mutation', (t) => {
  for (const currentAuthorityProjection of [
    authority({ leaseState: 'REVOKED' }),
    authority({ expiresAt: '2026-09-18T08:20:00.000Z' })
  ]) {
    const input = request(t, { currentAuthorityProjection });
    assert.throws(
      () => hostFamily(input),
      (error) =>
        error instanceof FamilyHostRuntimeError
        && error.code === 'FAMILY_HOST_AUTHORITY_NOT_CURRENT'
    );
  }

  const mismatched = structuredClone(authority());
  mismatched.lease.revocationGeneration = 8;
  const leaseCore = structuredClone(mismatched.lease);
  delete leaseCore.leaseHash;
  mismatched.lease.leaseHash = semanticHash(leaseCore);
  const input = request(t, { currentAuthorityProjection: mismatched });
  assert.throws(
    () => hostFamily(input),
    (error) =>
      error instanceof FamilyHostRuntimeError
      && error.code === 'FAMILY_HOST_AUTHORITY_REVOCATION_MISMATCH'
  );
});

test('FH-10 Host source slice performs no model, training, Memory or activation effect', (t) => {
  const result = hostFamily(request(t));
  assert.deepEqual(
    {
      homeAuthorityMutation: result.effects.homeAuthorityMutation,
      personalCompanionLineageMutation: result.effects.personalCompanionLineageMutation,
      invitationMutation: result.effects.invitationMutation,
      relationshipsMutation: result.effects.relationshipsMutation,
      modelInvocation: result.effects.modelInvocation,
      modelActivation: result.effects.modelActivation,
      trainingMutation: result.effects.trainingMutation,
      memoryMutation: result.effects.memoryMutation,
      publicationMutation: result.effects.publicationMutation
    },
    {
      homeAuthorityMutation: false,
      personalCompanionLineageMutation: false,
      invitationMutation: false,
      relationshipsMutation: false,
      modelInvocation: false,
      modelActivation: false,
      trainingMutation: false,
      memoryMutation: false,
      publicationMutation: false
    }
  );
});

test('FH-11 Host does not absorb Join, invitation, contact or Relationships semantics', (t) => {
  const input = request(t);
  for (const extra of [
    { invitationRef: 'invitation.family.fake' },
    { inviteePrincipalRef: 'principal.alex' },
    { relationshipRef: 'relationship.fake' },
    { contactRef: 'contact.fake' }
  ]) {
    assert.throws(
      () => hostFamily({ ...input, ...extra }),
      (error) =>
        error instanceof FamilyHostRuntimeError
        && error.code === 'FAMILY_HOST_UNTRUSTED_FIELD'
    );
  }
});

test('FH-12 personal companion lineage remains separate and untouched', (t) => {
  const personalLineageRef = 'companion-lineage.vexlife.personal-victor';
  const result = hostFamily(request(t));
  assert.notEqual(result.familyCompanionLineageRef, personalLineageRef);
  assert.match(result.familyCompanionLineageRef, /^lineage\.vex\.family\./u);
  assert.equal(result.effects.personalCompanionLineageMutation, false);
});
