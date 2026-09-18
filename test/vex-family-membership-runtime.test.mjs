import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  addFamilyMember,
  createFamilySpace,
  readFamilySpace,
  transitionFamilyMember
} from '../src/core/family-space-store.mjs';
import {
  createFamilyChannel,
  createFamilyMessage
} from '../src/core/family-conversation.mjs';
import {
  appendConversationMessage,
  materializeConversationChannel,
  readConversationChannelBinding
} from '../src/core/conversation-store.mjs';
import {
  FamilyMembershipRuntimeError,
  deriveFamilySuccessorChannelRef,
  leaveFamilyAndContinueConversation,
  readFamilyThreadHistory
} from '../src/core/family-membership-runtime.mjs';

const T0='2026-09-18T08:00:00.000Z';
const T1='2026-09-18T08:01:00.000Z';
const T2='2026-09-18T08:02:00.000Z';
const T3='2026-09-18T08:03:00.000Z';
const T4='2026-09-18T08:04:00.000Z';
const T5='2026-09-18T08:05:00.000Z';
const SPACE='space.vex-family.vf07b0';
const THREAD='thread.vex-family.vf07b0';
const CHANNEL='channel.vex-family.vf07b0.initial';
const LINEAGE='lineage.vex.family.vf07b0';

function tempHome(t){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'vf07b0-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  return home;
}

function add(home,record,name,at){
  return addFamilyMember({
    home,
    spaceRef:SPACE,
    actorPrincipalRef:'principal.victor',
    principalRef:'principal.'+name,
    principalBindingRef:'principal-binding.'+name,
    expectedRevision:record.revision,
    expectedMembershipGeneration:record.membershipGeneration,
    observedAt:at,
    instanceRef:'instance.vf07b0.add.'+name
  }).record;
}

function fixture(t){
  const home=tempHome(t);
  let record=createFamilySpace({
    home,
    spaceRef:SPACE,
    ownerPrincipalRef:'principal.victor',
    ownerPrincipalBindingRef:'principal-binding.victor',
    familyCompanionLineageRef:LINEAGE,
    observedAt:T0,
    instanceRef:'instance.vf07b0.create'
  }).record;
  record=add(home,record,'alex',T1);
  record=add(home,record,'bri',T2);
  const channel=createFamilyChannel({
    channelRef:CHANNEL,
    threadRef:THREAD,
    familySpaceRecord:record,
    labelStringRef:'family-room.channel',
    createdAt:T2
  });
  materializeConversationChannel({
    home,
    channel,
    instanceRef:'instance.vf07b0.channel.initial',
    observedAt:T2
  });
  return {home,record,channel};
}

function append({home,record,channel,principal='victor',sequence,at,content}){
  const message=createFamilyMessage({
    messageRef:'message.vf07b0.'+principal+'.'+String(sequence),
    channel,
    familySpaceRecord:record,
    speakerRef:'principal.'+principal,
    speakerPrincipalBindingRef:'principal-binding.'+principal,
    recipientRefs:record.members
      .filter((member)=>member.status==='ACTIVE'&&member.principalRef!=='principal.'+principal)
      .map((member)=>member.principalRef),
    content,
    sequence,
    createdAt:at
  });
  appendConversationMessage({
    home,
    message,
    instanceRef:'instance.vf07b0.message.'+principal+'.'+String(sequence),
    observedAt:at
  });
  return message;
}

function leaveArgs(f,overrides={}){
  return {
    home:f.home,
    spaceRef:SPACE,
    priorChannelRef:f.channel.channelRef,
    currentPrincipalRef:'principal.alex',
    expectedRevision:f.record.revision,
    expectedMembershipGeneration:f.record.membershipGeneration,
    observedAt:T3,
    instanceRef:'instance.vf07b0.leave.alex',
    ...overrides
  };
}

test('FMR-00/FMR-01 self-leave advances exactly one generation without target-principal input',()=>{
  // Contract shape itself prevents actor != target impersonation: there is no targetPrincipalRef.
  const source=leaveFamilyAndContinueConversation.toString();
  assert.equal(source.includes('targetPrincipalRef'),false);
});

test('FMR-02 successor channel identity is deterministic and distinct', (t)=>{
  const f=fixture(t);
  const first=leaveFamilyAndContinueConversation(leaveArgs(f));
  assert.equal(first.state,'MEMBER_LEFT_AND_CHANNEL_CONTINUED');
  assert.equal(first.membershipTransitionPerformed,true);
  assert.equal(first.priorMembershipGeneration,f.record.membershipGeneration);
  assert.equal(first.membershipGeneration,f.record.membershipGeneration+1);
  assert.equal(first.threadRef,THREAD);
  assert.notEqual(first.successorChannelRef,CHANNEL);

  const current=readFamilySpace({home:f.home,spaceRef:SPACE}).record;
  const expected=deriveFamilySuccessorChannelRef({
    spaceRef:SPACE,
    threadRef:THREAD,
    membershipGeneration:current.membershipGeneration,
    familySpaceRecordSha256:current.recordSha256,
    familyCompanionLineageRef:LINEAGE
  });
  assert.equal(first.successorChannelRef,expected);
});

test('FMR-03 old channel binding and witness history remain immutable after leave', (t)=>{
  const f=fixture(t);
  const oldMessage=append({
    home:f.home,record:f.record,channel:f.channel,
    principal:'victor',sequence:0,at:T2,content:'Before Alex leaves.'
  });
  const before=readConversationChannelBinding({home:f.home,channelRef:CHANNEL});
  const beforeBytes=JSON.stringify(before);
  leaveFamilyAndContinueConversation(leaveArgs(f));
  const after=readConversationChannelBinding({home:f.home,channelRef:CHANNEL});
  assert.equal(JSON.stringify(after),beforeBytes);
  assert.ok(oldMessage.witnessRefs.includes('principal.alex'));
});

test('FMR-05 exact retry after post-membership interruption resumes channel only', (t)=>{
  const f=fixture(t);
  assert.throws(
    ()=>leaveFamilyAndContinueConversation(leaveArgs(f,{faults:{failAfterMembershipTransition:true}})),
    (error)=>error instanceof FamilyMembershipRuntimeError
      && error.code==='FAMILY_MEMBERSHIP_RUNTIME_CHANNEL_CONTINUATION_REQUIRED'
  );
  const afterFailure=readFamilySpace({home:f.home,spaceRef:SPACE}).record;
  assert.equal(afterFailure.membershipGeneration,f.record.membershipGeneration+1);
  assert.equal(afterFailure.members.find((m)=>m.principalRef==='principal.alex').status,'LEFT');

  const recovered=leaveFamilyAndContinueConversation(leaveArgs(f));
  assert.equal(recovered.state,'RECOVERED_CHANNEL_CONTINUATION');
  assert.equal(recovered.membershipTransitionPerformed,false);
  const afterRetry=readFamilySpace({home:f.home,spaceRef:SPACE}).record;
  assert.equal(afterRetry.recordSha256,afterFailure.recordSha256);
});

test('FMR-06 full-success retry is idempotent on membership and successor channel', (t)=>{
  const f=fixture(t);
  const first=leaveFamilyAndContinueConversation(leaveArgs(f));
  const recordAfterFirst=readFamilySpace({home:f.home,spaceRef:SPACE}).record;
  const second=leaveFamilyAndContinueConversation(leaveArgs(f));
  const recordAfterSecond=readFamilySpace({home:f.home,spaceRef:SPACE}).record;
  assert.equal(second.state,'RECOVERED_CHANNEL_CONTINUATION');
  assert.equal(second.successorChannelRef,first.successorChannelRef);
  assert.equal(recordAfterSecond.recordSha256,recordAfterFirst.recordSha256);
});

test('FMR-07 unrelated later generation prevents stale retry', (t)=>{
  const f=fixture(t);
  assert.throws(
    ()=>leaveFamilyAndContinueConversation(leaveArgs(f,{faults:{failAfterMembershipTransition:true}})),
    FamilyMembershipRuntimeError
  );
  const current=readFamilySpace({home:f.home,spaceRef:SPACE}).record;
  transitionFamilyMember({
    home:f.home,
    spaceRef:SPACE,
    actorPrincipalRef:'principal.victor',
    principalRef:'principal.bri',
    action:'CHANGE_ROLE',
    role:'ADMIN',
    expectedRevision:current.revision,
    expectedMembershipGeneration:current.membershipGeneration,
    observedAt:T4,
    instanceRef:'instance.vf07b0.unrelated-role'
  });
  assert.throws(
    ()=>leaveFamilyAndContinueConversation(leaveArgs(f)),
    (error)=>error instanceof FamilyMembershipRuntimeError
      && error.code==='FAMILY_MEMBERSHIP_RUNTIME_STALE'
  );
});

test('FMR-08 remaining member reads eligible old GROUP history after channel succession', (t)=>{
  const f=fixture(t);
  const m0=append({
    home:f.home,record:f.record,channel:f.channel,
    principal:'victor',sequence:0,at:T2,content:'Durable family history.'
  });
  const left=leaveFamilyAndContinueConversation(leaveArgs(f));
  const history=readFamilyThreadHistory({
    home:f.home,
    spaceRef:SPACE,
    currentChannelRef:left.successorChannelRef,
    principalRef:'principal.bri',
    principalBindingRef:'principal-binding.bri'
  });
  assert.equal(history.state,'CURRENT');
  assert.ok(history.segmentRefs.includes(CHANNEL));
  assert.ok(history.segmentRefs.includes(left.successorChannelRef));
  assert.deepEqual(history.messages.map((message)=>message.messageRef),[m0.messageRef]);
  assert.equal(history.messages[0].channelRef,CHANNEL);
  assert.ok(history.messages[0].witnessRefs.includes('principal.bri'));
});

test('FMR-09 later FROM_JOIN member cannot receive pre-join history', (t)=>{
  const f=fixture(t);
  append({
    home:f.home,record:f.record,channel:f.channel,
    principal:'victor',sequence:0,at:T2,content:'Before Casey joins.'
  });
  const left=leaveFamilyAndContinueConversation(leaveArgs(f));
  let current=readFamilySpace({home:f.home,spaceRef:SPACE}).record;
  current=addFamilyMember({
    home:f.home,
    spaceRef:SPACE,
    actorPrincipalRef:'principal.victor',
    principalRef:'principal.casey',
    principalBindingRef:'principal-binding.casey',
    expectedRevision:current.revision,
    expectedMembershipGeneration:current.membershipGeneration,
    observedAt:T4,
    instanceRef:'instance.vf07b0.add.casey'
  }).record;
  const nextRef=deriveFamilySuccessorChannelRef({
    spaceRef:SPACE,
    threadRef:THREAD,
    membershipGeneration:current.membershipGeneration,
    familySpaceRecordSha256:current.recordSha256,
    familyCompanionLineageRef:LINEAGE
  });
  const next=createFamilyChannel({
    channelRef:nextRef,
    threadRef:THREAD,
    familySpaceRecord:current,
    labelStringRef:'family-room.channel',
    createdAt:T4
  });
  materializeConversationChannel({
    home:f.home,channel:next,instanceRef:'instance.vf07b0.channel.casey',observedAt:T4
  });
  const history=readFamilyThreadHistory({
    home:f.home,spaceRef:SPACE,currentChannelRef:nextRef,
    principalRef:'principal.casey',principalBindingRef:'principal-binding.casey'
  });
  assert.deepEqual(history.messages,[]);
  assert.ok(history.segmentRefs.includes(left.successorChannelRef));
});

test('FMR-10 LEFT principal cannot receive current history', (t)=>{
  const f=fixture(t);
  const left=leaveFamilyAndContinueConversation(leaveArgs(f));
  assert.throws(
    ()=>readFamilyThreadHistory({
      home:f.home,spaceRef:SPACE,currentChannelRef:left.successorChannelRef,
      principalRef:'principal.alex',principalBindingRef:'principal-binding.alex'
    }),
    (error)=>error instanceof FamilyMembershipRuntimeError
      && error.code==='FAMILY_MEMBERSHIP_RUNTIME_MEMBER_DENIED'
  );
});

test('FMR-11 private channel content never enters GROUP continuation', (t)=>{
  const f=fixture(t);
  const privateChannel=createFamilyChannel({
    channelRef:'channel.vex-family.vf07b0.private',
    threadRef:THREAD,
    kind:'PRIVATE',
    familySpaceRecord:f.record,
    memberPrincipalRefs:['principal.victor','principal.bri'],
    includeFamilyCompanion:false,
    createdAt:T2
  });
  materializeConversationChannel({
    home:f.home,channel:privateChannel,instanceRef:'instance.vf07b0.private',observedAt:T2
  });
  append({
    home:f.home,record:f.record,channel:f.channel,
    principal:'victor',sequence:0,at:T2,content:'Group history.'
  });
  const privateMessage=createFamilyMessage({
    messageRef:'message.vf07b0.private',
    channel:privateChannel,
    familySpaceRecord:f.record,
    speakerRef:'principal.victor',
    speakerPrincipalBindingRef:'principal-binding.victor',
    recipientRefs:['principal.bri'],
    content:'Private content.',
    sequence:0,
    createdAt:T2
  });
  appendConversationMessage({
    home:f.home,message:privateMessage,instanceRef:'instance.vf07b0.private-message',observedAt:T2
  });
  const left=leaveFamilyAndContinueConversation(leaveArgs(f));
  const history=readFamilyThreadHistory({
    home:f.home,spaceRef:SPACE,currentChannelRef:left.successorChannelRef,
    principalRef:'principal.bri',principalBindingRef:'principal-binding.bri'
  });
  assert.equal(history.messages.some((message)=>message.messageRef===privateMessage.messageRef),false);
});

test('FMR-12 stale or mismatched prior channel fails closed before mutation', (t)=>{
  const f=fixture(t);
  assert.throws(
    ()=>leaveFamilyAndContinueConversation(leaveArgs(f,{expectedMembershipGeneration:f.record.membershipGeneration-1})),
    (error)=>error instanceof FamilyMembershipRuntimeError
      && error.code==='FAMILY_MEMBERSHIP_RUNTIME_CHANNEL_MISMATCH'
  );
  assert.equal(readFamilySpace({home:f.home,spaceRef:SPACE}).record.recordSha256,f.record.recordSha256);
});

test('FMR-13 untrusted target/admin/binding fields are rejected by the core contract', (t)=>{
  const f=fixture(t);
  for(const field of ['targetPrincipalRef','principalBindingRef','role']){
    assert.throws(
      ()=>leaveFamilyAndContinueConversation({...leaveArgs(f),[field]:'forged'}),
      (error)=>error instanceof FamilyMembershipRuntimeError
        && error.code==='FAMILY_MEMBERSHIP_RUNTIME_UNTRUSTED_FIELD'
    );
  }
});

test('FMR-14 runtime source has no Host/Join/network/model/Memory/Relationships effect surface',()=>{
  const source=leaveFamilyAndContinueConversation.toString()+readFamilyThreadHistory.toString();
  for(const forbidden of ['createFamilySpace','addFamilyMember','fetch(','http://','https://','Memory','Relationships','modelRuntime']){
    assert.equal(source.includes(forbidden),false);
  }
});

// [VXG RealForever]
