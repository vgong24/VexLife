import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { approvePairing, createPairingOffer, issueCapabilityLease } from '../src/core/home-bridge.mjs';
import { addFamilyMember, createFamilySpace } from '../src/core/family-space-store.mjs';
import { createFamilyChannel } from '../src/core/family-conversation.mjs';
import { materializeConversationChannel } from '../src/core/conversation-store.mjs';
import { createVexCoreFamilySessionAuthorityResolver } from '../src/core/vex-core-family-session-authority.mjs';
import {
  BROWSER_FAMILY_ROOM_BOOTSTRAP_API_PATH,
  BROWSER_FAMILY_ROOM_BOOTSTRAP_SCHEMA,
  createVexLifeBrowserServer,
  resolveCurrentFamilyRoomBootstrap
} from '../scripts/serve-browser-core.mjs';
import {
  familyRoomViewModel,
  normalizeFamilyRoomBootstrap
} from '../reference/browser/modules/family-room-controller.js';

const T0='2026-09-18T03:40:00.000Z';
const T1='2026-09-18T03:41:00.000Z';
const T9='2026-09-18T09:40:00.000Z';
const HOME='vex-home.device.vf06-test';
const DEVICE='device.vf06-test';
const PRINCIPAL='person.victor-gong';
const CAP='capability.vexlife.companion-navigation';
const SPACE='space.vex-family.vf06-test';
const CHANNEL='channel.vex-family.vf06-test';
const EFFECTS=Object.freeze({
  authenticationMutation:false,
  authorizationMutation:false,
  membershipMutation:false,
  capabilityLeaseMutation:false,
  revocationMutation:false,
  HomePayloadReadOrWrite:false,
  remoteHomeWrite:false,
  networkMutation:false,
  credentialMutation:false,
  MemoryMutation:false,
  RelationshipsMutation:false,
  modelRuntimeEffect:false,
  publication:false
});

function tempHome(t){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'vf06-family-room-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  return home;
}

function fixture(t){
  const home=tempHome(t);
  let record=createFamilySpace({
    home,
    spaceRef:SPACE,
    ownerPrincipalRef:PRINCIPAL,
    ownerPrincipalBindingRef:'principal-binding.victor',
    familyCompanionLineageRef:'lineage.vex.family.vf06-test',
    observedAt:T0,
    instanceRef:'instance.vf06.family-create'
  }).record;
  for(const [name,at] of [['alex','2026-09-18T03:40:10.000Z'],['blair','2026-09-18T03:40:20.000Z']]){
    record=addFamilyMember({
      home,
      spaceRef:SPACE,
      actorPrincipalRef:PRINCIPAL,
      principalRef:'person.'+name,
      principalBindingRef:'principal-binding.'+name,
      expectedRevision:record.revision,
      expectedMembershipGeneration:record.membershipGeneration,
      observedAt:at,
      instanceRef:'instance.vf06.add-'+name
    }).record;
  }
  const channel=createFamilyChannel({
    channelRef:CHANNEL,
    threadRef:'thread.vex-family.vf06-test',
    familySpaceRecord:record,
    createdAt:T1
  });
  materializeConversationChannel({
    home,
    channel,
    instanceRef:'instance.vf06.channel',
    observedAt:T1
  });

  const offer=createPairingOffer({
    pairingRef:'pairing.vf06-test',
    homeNodeRef:HOME,
    homePublicKey:'home-public-key-vf06',
    oneTimeNonceHash:'nonce-vf06',
    humanFingerprint:'fingerprint-vf06',
    requestedCapabilityRefs:[CAP],
    expiresAt:T9
  });
  const paired=approvePairing({
    offer,
    principalRef:PRINCIPAL,
    deviceRef:DEVICE,
    devicePublicKey:'device-public-key-vf06',
    approvedCapabilityRefs:[CAP],
    approvedBy:PRINCIPAL,
    approvedAt:T0,
    expectedFingerprint:'fingerprint-vf06'
  });
  const lease=issueCapabilityLease({
    leaseRef:'lease.vf06-home',
    membership:paired.membership,
    requestedCapabilityRefs:[CAP],
    projectRefs:[],
    issuedAt:T0,
    expiresAt:T9,
    revocationGeneration:0
  });
  const projection=Object.freeze({
    schemaVersion:'vextreme.vex-core.home-session-authority/v1',
    state:'CURRENT',
    stableSessionBindingRef:'session-binding.vf06',
    principalRef:PRINCIPAL,
    deviceRef:DEVICE,
    homeRef:HOME,
    currentRevocationGeneration:0,
    securityMembershipRef:'membership.security.vf06',
    securityAuthenticationReceiptRef:'authentication.vf06',
    securityAuthorizationReceiptRef:'authority.vf06',
    securityLeaseRef:'lease.security.vf06',
    safetyStateDigest:'safety-state.vf06',
    safetyEvaluationRef:'owner-evaluation.vf06',
    allowedProductCapabilityRefs:Object.freeze([CAP]),
    membership:paired.membership,
    lease,
    sourceReceiptRefs:Object.freeze(['receipt.vf06']),
    currentnessRefs:Object.freeze(['currentness.vf06']),
    effects:EFFECTS
  });
  const resolver=createVexCoreFamilySessionAuthorityResolver({
    resolveVexCoreAuthority:async()=>projection
  });
  return {home,record,resolver};
}

function fakeCompanion(){
  return Object.freeze({
    status(){return Object.freeze({state:'TEST_ONLY'});},
    async performTurn(){throw new Error('VF-06 Family room proof must not invoke a model');}
  });
}

async function listen(server,t){
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  t.after(()=>new Promise((resolve)=>server.close(resolve)));
  const address=server.address();
  return 'http://127.0.0.1:'+String(address.port);
}

test('VF06-00 server-owned bootstrap projects only current visible Family truth',async(t)=>{
  const {home,resolver}=fixture(t);
  const bootstrap=await resolveCurrentFamilyRoomBootstrap({
    request:{headers:{}},
    familyHome:home,
    resolveAuthority:resolver,
    nowProvider:()=>T1,
    resolveFamilyWorkProjection:async()=>({
      state:'CURRENT',
      pendingCount:2,
      activeCount:1,
      sourceRef:'scheduler.vf06-test'
    })
  });
  assert.equal(bootstrap.schemaVersion,BROWSER_FAMILY_ROOM_BOOTSTRAP_SCHEMA);
  assert.equal(bootstrap.state,'CURRENT');
  assert.equal(bootstrap.truthClass,'CURRENT_LIVE_FAMILY');
  assert.equal(bootstrap.currentPrincipalRef,PRINCIPAL);
  assert.equal(bootstrap.rooms.length,1);
  assert.equal(bootstrap.rooms[0].audience.length,3);
  assert.equal(bootstrap.rooms[0].familyCompanionIncluded,true);
  assert.equal(bootstrap.rooms[0].familyCompanionLineageRef,'lineage.vex.family.vf06-test');
  assert.deepEqual(bootstrap.workStatus,{state:'CURRENT',pendingCount:2,activeCount:1,sourceRef:'scheduler.vf06-test'});
  const serialized=JSON.stringify(bootstrap);
  assert.equal(serialized.includes('lease.vf06-home'),false);
  assert.equal(serialized.includes('device-public-key-vf06'),false);

  const normalized=normalizeFamilyRoomBootstrap(bootstrap);
  const view=familyRoomViewModel(normalized);
  assert.deepEqual(view,{
    state:'CURRENT',
    truthClass:'CURRENT_LIVE_FAMILY',
    roomCount:1,
    audienceCount:3,
    familyVexCount:1,
    workState:'CURRENT',
    pendingCount:2,
    activeCount:1
  });
});

test('VF06-01 default work projection is held without disabling Family truth',async(t)=>{
  const {home,resolver}=fixture(t);
  const bootstrap=await resolveCurrentFamilyRoomBootstrap({
    request:{headers:{}},
    familyHome:home,
    resolveAuthority:resolver,
    nowProvider:()=>T1
  });
  assert.equal(bootstrap.state,'CURRENT');
  assert.equal(bootstrap.workStatus.state,'HELD_UNAVAILABLE');
  assert.equal(bootstrap.rooms[0].audience.length,3);
});

test('VF06-02 same-origin bootstrap fails closed without current server session authority',async(t)=>{
  const {home}=fixture(t);
  const server=createVexLifeBrowserServer({
    companionBridge:fakeCompanion(),
    familyConversationHome:home,
    familyConversationNow:()=>T1
  });
  const base=await listen(server,t);
  const response=await fetch(base+BROWSER_FAMILY_ROOM_BOOTSTRAP_API_PATH);
  assert.equal(response.status,503);
  const body=await response.json();
  assert.equal(body.failureCode,'FAMILY_SESSION_AUTHORITY_UNAVAILABLE');
});

test('VF06-03 stale durable Family channel binding is not projected as current',async(t)=>{
  const {home,record,resolver}=fixture(t);
  addFamilyMember({
    home,
    spaceRef:SPACE,
    actorPrincipalRef:PRINCIPAL,
    principalRef:'person.casey',
    principalBindingRef:'principal-binding.casey',
    expectedRevision:record.revision,
    expectedMembershipGeneration:record.membershipGeneration,
    observedAt:'2026-09-18T03:42:00.000Z',
    instanceRef:'instance.vf06.add-casey'
  });
  const bootstrap=await resolveCurrentFamilyRoomBootstrap({
    request:{headers:{}},
    familyHome:home,
    resolveAuthority:resolver,
    nowProvider:()=>T1
  });
  assert.equal(bootstrap.state,'EMPTY');
  assert.deepEqual(bootstrap.rooms,[]);
});

// [VXG RealForever]
