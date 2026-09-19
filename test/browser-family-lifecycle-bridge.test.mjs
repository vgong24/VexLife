import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { semanticHash } from '../src/core/utils.mjs';
import {
  issueFamilyInvitation,
  readFamilyInvitation
} from '../src/core/family-invitation-store.mjs';
import { readFamilySpace } from '../src/core/family-space-store.mjs';
import { createFamilyChannel } from '../src/core/family-conversation.mjs';
import {
  listConversationChannelBindings,
  materializeConversationChannel
} from '../src/core/conversation-store.mjs';
import {
  BrowserFamilyLifecycleBridgeError,
  executeBrowserFamilyLifecycle
} from '../src/core/browser-family-lifecycle-bridge.mjs';

const T0='2026-09-18T12:00:00.000Z';
const T1='2026-09-18T12:05:00.000Z';
const T2='2026-09-18T12:10:00.000Z';
const T3='2026-09-18T12:15:00.000Z';
const T9='2026-09-18T13:00:00.000Z';

function hash(value,field){
  const core=structuredClone(value);
  return Object.freeze({...core,[field]:semanticHash(core)});
}

function authority(name,generation=1){
  const principalRef='principal.'+name;
  const deviceRef='device.'+name;
  const membership=hash({
    schemaVersion:'vexlife.bridge-device-membership/v1',
    membershipRef:'membership.home.'+name,
    homeNodeRef:'home.vf07c0',
    principalRef,
    deviceRef,
    devicePublicKey:'public-key-'+name,
    capabilityRefs:['capability.family'],
    approvedBy:'principal.victor',
    approvedAt:'2026-09-18T11:50:00.000Z',
    revocationGeneration:generation,
    state:'ACTIVE'
  },'membershipHash');
  const lease=hash({
    schemaVersion:'vexlife.bridge-capability-lease/v1',
    leaseRef:'lease.family.'+name+'.'+generation,
    homeNodeRef:'home.vf07c0',
    principalRef,
    deviceRef,
    capabilityRefs:['capability.family'],
    projectRefs:['project.vex-family'],
    issuedAt:'2026-09-18T11:50:00.000Z',
    expiresAt:T9,
    revocationGeneration:generation,
    state:'ACTIVE'
  },'leaseHash');
  return Object.freeze({membership,lease,currentRevocationGeneration:generation});
}

function tempHome(t){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'vf07c0-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  return home;
}

function lifecycle(home,operation,intent,currentAuthorityProjection,observedAt,instanceRef){
  return executeBrowserFamilyLifecycle({
    home,operation,intent,currentAuthorityProjection,observedAt,instanceRef
  });
}

function host(t){
  const home=tempHome(t);
  const result=lifecycle(
    home,'HOST',{idempotencyKey:'intent.vf07c0.host'},
    authority('victor'),T0,'instance.vf07c0'
  );
  assert.equal(result.state,'CURRENT');
  return {home,host:result.result};
}

function issue(home,hosted,{expiresAt=T9}={}){
  const family=readFamilySpace({home,spaceRef:hosted.spaceRef}).record;
  return issueFamilyInvitation({
    home,
    spaceRef:family.spaceRef,
    inviterPrincipalRef:'principal.victor',
    expectedFamilyRecordSha256:family.recordSha256,
    expectedRevision:family.revision,
    expectedMembershipGeneration:family.membershipGeneration,
    idempotencyKey:'invite.vf07c0.alex',
    issuedAt:T1,
    expiresAt,
    sourceReceiptRefs:['receipt.vf07c0.issue'],
    currentnessRefs:['currentness.vf07c0.issue'],
    instanceRef:'instance.vf07c0.invite',
    faults:{}
  }).record;
}

test('LFB-00 rejects browser-authored protected authority fields',t=>{
  const {home}=host(t);
  assert.throws(
    ()=>lifecycle(home,'LEAVE',{spaceRef:'space.fake',principalRef:'principal.attacker'},authority('victor'),T1,'instance.vf07c0.bad'),
    error=>error instanceof BrowserFamilyLifecycleBridgeError
      && error.code==='BROWSER_FAMILY_LIFECYCLE_UNTRUSTED_FIELD'
  );
  assert.throws(
    ()=>lifecycle(home,'JOIN',{invitationRef:'invitation.fake',role:'OWNER'},authority('alex'),T1,'instance.vf07c0.bad2'),
    error=>error instanceof BrowserFamilyLifecycleBridgeError
      && error.code==='BROWSER_FAMILY_LIFECYCLE_UNTRUSTED_FIELD'
  );
});

test('LFB-01/LFB-02/LFB-03 HOST consumes current authority and exact retry is idempotent',t=>{
  const home=tempHome(t);
  const first=lifecycle(home,'HOST',{idempotencyKey:'intent.vf07c0.host'},authority('victor'),T0,'instance.vf07c0.host1');
  const second=lifecycle(home,'HOST',{idempotencyKey:'intent.vf07c0.host'},authority('victor'),T0,'instance.vf07c0.host2');
  assert.equal(first.result.familySpaceState,'CREATED');
  assert.equal(first.result.channelMaterializationState,'MATERIALIZED');
  assert.equal(second.result.familySpaceState,'EXISTING_CURRENT');
  assert.equal(second.result.channelMaterializationState,'IDEMPOTENT_CURRENT');
  assert.equal(second.result.spaceRef,first.result.spaceRef);
  assert.equal(second.result.channelRef,first.result.channelRef);

  const stale=structuredClone(authority('victor'));
  stale.currentRevocationGeneration+=1;
  assert.throws(
    ()=>lifecycle(home,'HOST',{idempotencyKey:'intent.vf07c0.other'},stale,T0,'instance.vf07c0.stale'),
    error=>error instanceof BrowserFamilyLifecycleBridgeError && error.httpStatus===403
  );
});

test('LFB-04/LFB-05/LFB-09 JOIN derives source channel and preserves owner idempotency',t=>{
  const {home,host:hosted}=host(t);
  const invitation=issue(home,hosted);
  const joined=lifecycle(
    home,'JOIN',{invitationRef:invitation.invitationRef},
    authority('alex'),T2,'instance.vf07c0.join'
  );
  assert.equal(joined.state,'CURRENT');
  assert.equal(joined.result.membershipGeneration,2);
  assert.notEqual(joined.result.priorChannelRef,joined.result.channelRef);

  const accepted=readFamilyInvitation({
    home,invitationRef:invitation.invitationRef,observedAt:T3
  }).record;
  assert.equal(accepted.state,'ACCEPTED');
  assert.equal(accepted.acceptedPrincipalRefOrNull,'principal.alex');

  const retry=lifecycle(
    home,'JOIN',{invitationRef:invitation.invitationRef},
    authority('alex'),T3,'instance.vf07c0.join-retry'
  );
  assert.equal(retry.result.state,'IDEMPOTENT_ACCEPTED');
  assert.equal(retry.result.channelRef,joined.result.channelRef);
});

test('LFB-06 expired untouched invitation cannot begin Join',t=>{
  const {home,host:hosted}=host(t);
  const invitation=issue(home,hosted,{expiresAt:T2});
  assert.throws(
    ()=>lifecycle(home,'JOIN',{invitationRef:invitation.invitationRef},authority('alex'),T3,'instance.vf07c0.expired'),
    error=>error instanceof BrowserFamilyLifecycleBridgeError
      && error.code==='FAMILY_JOIN_INVITATION_EXPIRED'
  );
  assert.equal(readFamilySpace({home,spaceRef:hosted.spaceRef}).record.members.length,1);
});

test('LFB-07 LEAVE derives current revision generation channel and self principal server-side',t=>{
  const {home,host:hosted}=host(t);
  const invitation=issue(home,hosted);
  lifecycle(home,'JOIN',{invitationRef:invitation.invitationRef},authority('alex'),T2,'instance.vf07c0.join2');
  const before=readFamilySpace({home,spaceRef:hosted.spaceRef}).record;

  const left=lifecycle(
    home,'LEAVE',{spaceRef:hosted.spaceRef},
    authority('alex'),T3,'instance.vf07c0.leave'
  );
  assert.equal(left.result.priorMembershipGeneration,before.membershipGeneration);
  assert.equal(left.result.membershipGeneration,before.membershipGeneration+1);
  assert.notEqual(left.result.priorChannelRef,left.result.channelRef);

  const after=readFamilySpace({home,spaceRef:hosted.spaceRef}).record;
  assert.equal(after.members.find(m=>m.principalRef==='principal.alex').status,'LEFT');
});

test('LFB-08 ambiguous current GROUP truth fails closed before Leave mutation',t=>{
  const {home,host:hosted}=host(t);
  const family=readFamilySpace({home,spaceRef:hosted.spaceRef}).record;
  const duplicate=createFamilyChannel({
    channelRef:'channel.vex.family.duplicate.vf07c0',
    threadRef:hosted.threadRef,
    kind:'GROUP',
    familySpaceRecord:family,
    labelStringRef:'family-room.channel',
    createdAt:T1
  });
  materializeConversationChannel({
    home,channel:duplicate,instanceRef:'instance.vf07c0.duplicate',observedAt:T1
  });
  assert.equal(
    listConversationChannelBindings({home,limit:1000})
      .channels.filter(c=>c.familySpaceBinding?.spaceRef===hosted.spaceRef).length,
    2
  );
  assert.throws(
    ()=>lifecycle(home,'LEAVE',{spaceRef:hosted.spaceRef},authority('victor'),T2,'instance.vf07c0.ambiguous'),
    error=>error instanceof BrowserFamilyLifecycleBridgeError
      && error.code==='BROWSER_FAMILY_LIFECYCLE_CURRENT_CHANNEL_UNAVAILABLE'
      && error.httpStatus===409
  );
  assert.equal(readFamilySpace({home,spaceRef:hosted.spaceRef}).record.members[0].status,'ACTIVE');
});

test('LFB-12 lifecycle result excludes principal-binding authority and unrelated effect details',t=>{
  const {host:result}=host(t);
  assert.equal(Object.hasOwn(result,'ownerPrincipalBindingRef'),false);
  assert.equal(Object.hasOwn(result,'effects'),false);
});

// [VXG RealForever]
