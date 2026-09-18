import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createFamilySpace, addFamilyMember, readFamilySpace } from '../src/core/family-space-store.mjs';
import { createFamilyChannel, createFamilyMessage } from '../src/core/family-conversation.mjs';
import { appendConversationMessage, materializeConversationChannel, readConversationChannelBinding, readConversationChannel } from '../src/core/conversation-store.mjs';
import { issueFamilyInvitation, readFamilyInvitation, revokeFamilyInvitation } from '../src/core/family-invitation-store.mjs';
import { FamilyJoinRuntimeError, joinFamilyFromInvitation } from '../src/core/family-join-runtime.mjs';
import { readFamilyThreadHistory } from '../src/core/family-membership-runtime.mjs';
import { semanticHash } from '../src/core/utils.mjs';

const T0='2026-09-18T12:00:00.000Z';
const T1='2026-09-18T12:05:00.000Z';
const T2='2026-09-18T12:10:00.000Z';
const T3='2026-09-18T12:20:00.000Z';
const T4='2026-09-18T13:00:00.000Z';
const SPACE='space.vex.family.join-runtime';
const LINEAGE='lineage.vex.family.join-runtime';
const THREAD='thread.vex.family.join-runtime';
const CHANNEL='channel.vex.family.join-runtime.initial';

function tempHome(t){const home=fs.mkdtempSync(path.join(os.tmpdir(),'vf07b-join-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));return home;}
function hash(value,field){const core=structuredClone(value);return Object.freeze({...core,[field]:semanticHash(core)});}
function authority({principalRef='principal.alex',deviceRef='device.alex',membershipRef='membership.home.alex',homeRef='home.alex',generation=4,expiresAt='2026-09-18T14:00:00.000Z',membershipState='ACTIVE',leaseState='ACTIVE'}={}){
  const membership=hash({schemaVersion:'vexlife.bridge-device-membership/v1',membershipRef,homeNodeRef:homeRef,principalRef,deviceRef,devicePublicKey:'public-key-'+principalRef,capabilityRefs:['capability.family'],approvedBy:'principal.local-owner',approvedAt:T0,revocationGeneration:generation,state:membershipState},'membershipHash');
  const lease=hash({schemaVersion:'vexlife.bridge-capability-lease/v1',leaseRef:'lease.family.'+principalRef+'.'+generation,homeNodeRef:homeRef,principalRef,deviceRef,capabilityRefs:['capability.family'],projectRefs:['project.vexlife'],issuedAt:T0,expiresAt,revocationGeneration:generation,state:leaseState},'leaseHash');
  return Object.freeze({membership,lease,currentRevocationGeneration:generation});
}
function fixture(t,{expiresAt=T4}={}){
  const home=tempHome(t);
  const record=createFamilySpace({home,spaceRef:SPACE,ownerPrincipalRef:'principal.victor',ownerPrincipalBindingRef:'principal-binding.vex.family.victor',familyCompanionLineageRef:LINEAGE,observedAt:T0,instanceRef:'instance.join.fixture.space'}).record;
  const channel=createFamilyChannel({channelRef:CHANNEL,threadRef:THREAD,familySpaceRecord:record,labelStringRef:'family-room.channel',createdAt:T0});
  materializeConversationChannel({home,channel,instanceRef:'instance.join.fixture.channel',observedAt:T0});
  const invitation=issueFamilyInvitation({home,spaceRef:SPACE,inviterPrincipalRef:'principal.victor',expectedFamilyRecordSha256:record.recordSha256,expectedRevision:record.revision,expectedMembershipGeneration:record.membershipGeneration,idempotencyKey:'intent.vex.family.join.alex',issuedAt:T1,expiresAt,sourceReceiptRefs:['receipt.family.join.invitation'],currentnessRefs:['currentness.family.join.invitation'],instanceRef:'instance.join.fixture.invitation',faults:{}}).record;
  return {home,record,channel,invitation};
}
function joinInput(f,overrides={}){return {home:f.home,invitationRef:f.invitation.invitationRef,priorChannelRef:f.channel.channelRef,currentAuthorityProjection:authority(),observedAt:T2,instanceRef:'instance.join.primary',faults:{},...overrides};}

test('FJ-00 current invitee authority joins exactly once and finalizes ACCEPTED',(t)=>{
  const f=fixture(t);const result=joinFamilyFromInvitation(joinInput(f));
  assert.equal(result.state,'FAMILY_JOIN_ACCEPTED');assert.equal(result.principalRef,'principal.alex');assert.equal(result.membershipGeneration,2);
  assert.equal(result.membershipTransitionPerformed,true);assert.equal(result.channelMaterializationPerformed,true);assert.equal(result.invitationAcceptancePerformed,true);
  const invite=readFamilyInvitation({home:f.home,invitationRef:f.invitation.invitationRef,observedAt:T3});assert.equal(invite.record.state,'ACCEPTED');assert.equal(invite.record.acceptedPrincipalRefOrNull,'principal.alex');
  const member=readFamilySpace({home:f.home,spaceRef:SPACE}).record.members.find((candidate)=>candidate.principalRef==='principal.alex');assert.equal(member.role,'MEMBER');assert.equal(member.historyVisibilityPolicyRef,'policy.vex-family.history.from-join');
  assert.equal(readConversationChannelBinding({home:f.home,channelRef:result.successorChannelRef}).channel.familySpaceBinding.membershipGeneration,2);
});
test('FJ-01 caller cannot author principal/binding/role/successor identity',(t)=>{
  const f=fixture(t);for(const extra of [{principalRef:'principal.attacker'},{principalBindingRef:'principal-binding.attacker'},{role:'OWNER'},{successorChannelRef:'channel.attacker'}]){
    assert.throws(()=>joinFamilyFromInvitation({...joinInput(f),...extra}),(error)=>error instanceof FamilyJoinRuntimeError&&error.code==='FAMILY_JOIN_UNTRUSTED_FIELD');
  }
});
test('FJ-02 expired untouched PENDING invitation cannot start membership mutation',(t)=>{
  const f=fixture(t,{expiresAt:T2});assert.throws(()=>joinFamilyFromInvitation(joinInput(f,{observedAt:T2})),(error)=>error instanceof FamilyJoinRuntimeError&&error.code==='FAMILY_JOIN_INVITATION_EXPIRED');assert.equal(readFamilySpace({home:f.home,spaceRef:SPACE}).record.members.length,1);
});
test('FJ-03 revoked invitation cannot join',(t)=>{
  const f=fixture(t);revokeFamilyInvitation({home:f.home,invitationRef:f.invitation.invitationRef,actorPrincipalRef:'principal.victor',expectedInvitationRevision:0,expectedFamilyRecordSha256:f.record.recordSha256,expectedFamilyRevision:f.record.revision,expectedMembershipGeneration:f.record.membershipGeneration,observedAt:T2,sourceReceiptRefs:['receipt.family.join.revoke'],currentnessRefs:['currentness.family.join.revoke'],instanceRef:'instance.join.revoke',faults:{}});
  assert.throws(()=>joinFamilyFromInvitation(joinInput(f,{observedAt:T3})),(error)=>error instanceof FamilyJoinRuntimeError&&error.code==='FAMILY_JOIN_INVITATION_TERMINAL');
});
test('FJ-04 stale/revoked invitee Home authority fails before Family mutation',(t)=>{const f=fixture(t);assert.throws(()=>joinFamilyFromInvitation(joinInput(f,{currentAuthorityProjection:authority({leaseState:'REVOKED'})})));assert.equal(readFamilySpace({home:f.home,spaceRef:SPACE}).record.members.length,1);});
test('FJ-05 prior channel must be exact invitation source generation',(t)=>{const f=fixture(t);assert.throws(()=>joinFamilyFromInvitation(joinInput(f,{priorChannelRef:'channel.vex.family.missing'})));assert.equal(readFamilySpace({home:f.home,spaceRef:SPACE}).record.members.length,1);});
test('FJ-06 post-membership interruption recovers exact N-to-N+1 add without duplicate member',(t)=>{
  const f=fixture(t);assert.throws(()=>joinFamilyFromInvitation(joinInput(f,{faults:{failAfterMembershipTransition:true}})),(error)=>error instanceof FamilyJoinRuntimeError&&error.code==='FAMILY_JOIN_CHANNEL_CONTINUATION_REQUIRED');
  const afterAdd=readFamilySpace({home:f.home,spaceRef:SPACE}).record;assert.equal(afterAdd.membershipGeneration,2);assert.equal(afterAdd.members.filter((m)=>m.principalRef==='principal.alex').length,1);
  const recovered=joinFamilyFromInvitation(joinInput(f,{observedAt:T3,instanceRef:'instance.join.recover.membership'}));assert.equal(recovered.state,'RECOVERED_FAMILY_JOIN_ACCEPTED');assert.equal(recovered.membershipTransitionPerformed,false);assert.equal(readFamilySpace({home:f.home,spaceRef:SPACE}).record.membershipGeneration,2);
});
test('FJ-07 post-channel interruption recovers exact channel and finalizes invitation',(t)=>{
  const f=fixture(t);let channelRef;assert.throws(()=>joinFamilyFromInvitation(joinInput(f,{faults:{failAfterChannelMaterialization:true}})),(error)=>{channelRef=error.details?.successorChannelRef;return error instanceof FamilyJoinRuntimeError&&error.code==='FAMILY_JOIN_INVITATION_FINALIZATION_REQUIRED';});
  assert.equal(readConversationChannelBinding({home:f.home,channelRef}).state,'CURRENT');const recovered=joinFamilyFromInvitation(joinInput(f,{observedAt:T3,instanceRef:'instance.join.recover.channel'}));assert.equal(recovered.successorChannelRef,channelRef);assert.equal(recovered.channelMaterializationPerformed,false);assert.equal(readFamilyInvitation({home:f.home,invitationRef:f.invitation.invitationRef,observedAt:T3}).record.state,'ACCEPTED');
});
test('FJ-08 post-ACCEPTED result loss retry is idempotent and does not replay writers',(t)=>{
  const f=fixture(t);assert.throws(()=>joinFamilyFromInvitation(joinInput(f,{faults:{failAfterInvitationAcceptance:true}})),(error)=>error instanceof FamilyJoinRuntimeError&&error.code==='FAMILY_JOIN_RESULT_NOT_EMITTED');
  const familyBefore=readFamilySpace({home:f.home,spaceRef:SPACE}).record;const retry=joinFamilyFromInvitation(joinInput(f,{observedAt:T3,instanceRef:'instance.join.recover.accepted'}));assert.equal(retry.state,'IDEMPOTENT_ACCEPTED');assert.equal(retry.membershipTransitionPerformed,false);assert.equal(retry.channelMaterializationPerformed,false);assert.equal(retry.invitationAcceptancePerformed,false);assert.equal(readFamilySpace({home:f.home,spaceRef:SPACE}).record.recordSha256,familyBefore.recordSha256);
});
test('FJ-09 unrelated later Family generation is never consumed as Join recovery',(t)=>{
  const f=fixture(t);assert.throws(()=>joinFamilyFromInvitation(joinInput(f,{faults:{failAfterMembershipTransition:true}})));
  let current=readFamilySpace({home:f.home,spaceRef:SPACE}).record;current=addFamilyMember({home:f.home,spaceRef:SPACE,actorPrincipalRef:'principal.victor',principalRef:'principal.casey',principalBindingRef:'principal-binding.vex.family.casey',role:'MEMBER',expectedRevision:current.revision,expectedMembershipGeneration:current.membershipGeneration,observedAt:T3,instanceRef:'instance.join.unrelated'}).record;assert.equal(current.membershipGeneration,3);
  assert.throws(()=>joinFamilyFromInvitation(joinInput(f,{observedAt:T4,instanceRef:'instance.join.stale-retry'})),(error)=>error instanceof FamilyJoinRuntimeError&&error.code==='FAMILY_JOIN_STALE');
});
test('FJ-10 accepted invitation cannot be replayed by another principal',(t)=>{
  const f=fixture(t);joinFamilyFromInvitation(joinInput(f));assert.throws(()=>joinFamilyFromInvitation(joinInput(f,{observedAt:T3,currentAuthorityProjection:authority({principalRef:'principal.casey',deviceRef:'device.casey',membershipRef:'membership.home.casey'}),instanceRef:'instance.join.other-principal'})),(error)=>error instanceof FamilyJoinRuntimeError&&error.code==='FAMILY_JOIN_INVITATION_PRINCIPAL_MISMATCH');
});
test('FJ-11 prior channel/messages remain immutable while successor carries new audience',(t)=>{
  const f=fixture(t);const oldMessage=createFamilyMessage({messageRef:'message.join.before',channel:f.channel,familySpaceRecord:f.record,speakerRef:'principal.victor',speakerPrincipalBindingRef:'principal-binding.vex.family.victor',recipientRefs:['principal.victor'],content:'before join',sequence:0,createdAt:T1});appendConversationMessage({home:f.home,message:oldMessage,instanceRef:'instance.join.before-message',observedAt:T1});
  const result=joinFamilyFromInvitation(joinInput(f));const old=readConversationChannel({home:f.home,channelRef:f.channel.channelRef});assert.equal(old.messages.length,1);assert.equal(old.messages[0].content,'before join');const successor=readConversationChannelBinding({home:f.home,channelRef:result.successorChannelRef}).channel;assert.equal(successor.familySpaceBinding.audienceMemberBindings.some((m)=>m.principalRef==='principal.alex'),true);
});
test('FJ-12 FROM_JOIN history does not grant new member pre-join witness history',(t)=>{
  const f=fixture(t);const oldMessage=createFamilyMessage({messageRef:'message.join.history.before',channel:f.channel,familySpaceRecord:f.record,speakerRef:'principal.victor',speakerPrincipalBindingRef:'principal-binding.vex.family.victor',recipientRefs:['principal.victor'],content:'private-to-prior-generation',sequence:0,createdAt:T1});appendConversationMessage({home:f.home,message:oldMessage,instanceRef:'instance.join.history.before',observedAt:T1});
  const result=joinFamilyFromInvitation(joinInput(f));const history=readFamilyThreadHistory({home:f.home,spaceRef:SPACE,currentChannelRef:result.successorChannelRef,principalRef:'principal.alex',principalBindingRef:result.principalBindingRef});assert.equal(history.messages.some((m)=>m.messageRef===oldMessage.messageRef),false);
});
test('FJ-13 exact pre-expiry membership effect can finish after expiry; untouched expiry cannot',(t)=>{
  const f=fixture(t,{expiresAt:T3});assert.throws(()=>joinFamilyFromInvitation(joinInput(f,{observedAt:T2,faults:{failAfterMembershipTransition:true}})));
  const recovered=joinFamilyFromInvitation(joinInput(f,{observedAt:T4,instanceRef:'instance.join.recover.after-expiry'}));assert.equal(recovered.state,'RECOVERED_FAMILY_JOIN_ACCEPTED');const invite=readFamilyInvitation({home:f.home,invitationRef:f.invitation.invitationRef,observedAt:T4});assert.equal(invite.record.state,'ACCEPTED');assert.equal(invite.record.acceptedAtOrNull,T2);
});
test('FJ-14 Join exposes no network, Relationships, model, Memory or publication effect',(t)=>{
  const f=fixture(t);const result=joinFamilyFromInvitation(joinInput(f));assert.deepEqual({networkDelivery:result.effects.networkDelivery,relationshipsMutation:result.effects.relationshipsMutation,modelInvocation:result.effects.modelInvocation,memoryMutation:result.effects.memoryMutation,publicationMutation:result.effects.publicationMutation},{networkDelivery:false,relationshipsMutation:false,modelInvocation:false,memoryMutation:false,publicationMutation:false});
});
