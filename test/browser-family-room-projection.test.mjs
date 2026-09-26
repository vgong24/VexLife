import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { approvePairing, createPairingOffer, issueCapabilityLease } from '../src/core/home-bridge.mjs';
import {
  addFamilyMember,
  createFamilySpace,
  readFamilySpace
} from '../src/core/family-space-store.mjs';
import { issueFamilyInvitation } from '../src/core/family-invitation-store.mjs';
import { createFamilyChannel } from '../src/core/family-conversation.mjs';
import { materializeConversationChannel } from '../src/core/conversation-store.mjs';
import { createVexCoreFamilySessionAuthorityResolver } from '../src/core/vex-core-family-session-authority.mjs';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  acceptIntentAssignment,
  createIntentEnvelope,
  createIntentWorkgraph,
  createWorkNode
} from '../src/core/intent-workgraph.mjs';
import { SingleWorkerIntentScheduler } from '../src/core/intent-scheduler.mjs';
import { createInitialSchedulerAggregate } from '../src/core/state.mjs';
import {
  createConcernAggregate,
  createHumanAttentionRequest,
  createSchedulerDueConcernObservation,
  deriveConcernSubject,
  evaluateConcernThreshold,
  recordHumanAttentionRequest,
  recordSchedulerDueConcernObservation,
  recordThresholdEvaluation
} from '../src/core/concern-watch.mjs';
import { semanticHash } from '../src/core/utils.mjs';
import {
  FAMILY_SECURITY_FAMILY_CONTEXT_SCHEMA,
  FAMILY_SECURITY_PERCEPTION_EVIDENCE_SCHEMA,
  projectFamilySecurityAwareness
} from '../src/core/family-security-projection.mjs';
import {
  BROWSER_FAMILY_CONVERSATION_API_PATH,
  BROWSER_FAMILY_FOLLOW_THROUGH_RUNTIME_SCHEMA,
  BROWSER_FAMILY_FOLLOW_THROUGH_SOURCE_REF,
  BROWSER_FAMILY_ROOM_BOOTSTRAP_API_PATH,
  BROWSER_FAMILY_ROOM_BOOTSTRAP_SCHEMA,
  createVexLifeBrowserServer,
  resolveCurrentFamilyRoomBootstrap
} from '../scripts/serve-browser-core.mjs';
import {
  createFamilyRoomController,
  familyRoomViewModel,
  normalizeFamilyRoomBootstrap
} from '../reference/browser/modules/family-room-controller.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SOURCE_BUNDLE=loadBlueprint(ROOT);
const INTENT_REGISTRY=SOURCE_BUNDLE.intentRegistry;
const SCHEDULER_REGISTRY=SOURCE_BUNDLE.schedulerRegistry;
const CONCERN_REGISTRY=SOURCE_BUNDLE.blueprint.concernWatch;

const T0='2026-09-18T03:40:00.000Z';
const T1='2026-09-18T03:41:00.000Z';
const T2='2026-09-18T03:42:00.000Z';
const T3='2026-09-18T03:43:00.000Z';
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
  return {home,record,resolver,channel,sessionProjection:projection};
}

function vexCoreProjectionForPrincipal(principalRef,deviceRef){
  const suffix=principalRef.split('.').at(-1);
  const offer=createPairingOffer({
    pairingRef:'pairing.vf06-'+suffix,
    homeNodeRef:HOME,
    homePublicKey:'home-public-key-vf06',
    oneTimeNonceHash:'nonce-vf06-'+suffix,
    humanFingerprint:'fingerprint-vf06-'+suffix,
    requestedCapabilityRefs:[CAP],
    expiresAt:T9
  });
  const paired=approvePairing({
    offer,
    principalRef,
    deviceRef,
    devicePublicKey:'device-public-key-vf06-'+suffix,
    approvedCapabilityRefs:[CAP],
    approvedBy:PRINCIPAL,
    approvedAt:T0,
    expectedFingerprint:'fingerprint-vf06-'+suffix
  });
  const lease=issueCapabilityLease({
    leaseRef:'lease.vf06-'+suffix,
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
    stableSessionBindingRef:'session-binding.vf06-'+suffix,
    principalRef,
    deviceRef,
    homeRef:HOME,
    currentRevocationGeneration:0,
    securityMembershipRef:'membership.security.vf06-'+suffix,
    securityAuthenticationReceiptRef:'authentication.vf06-'+suffix,
    securityAuthorizationReceiptRef:'authority.vf06-'+suffix,
    securityLeaseRef:'lease.security.vf06-'+suffix,
    safetyStateDigest:'safety-state.vf06-'+suffix,
    safetyEvaluationRef:'owner-evaluation.vf06-'+suffix,
    allowedProductCapabilityRefs:Object.freeze([CAP]),
    membership:paired.membership,
    lease,
    sourceReceiptRefs:Object.freeze(['receipt.vf06-'+suffix]),
    currentnessRefs:Object.freeze(['currentness.vf06-'+suffix]),
    effects:EFFECTS
  });
  return projection;
}

function resolverForPrincipal(principalRef,deviceRef){
  const projection=vexCoreProjectionForPrincipal(principalRef,deviceRef);
  return createVexCoreFamilySessionAuthorityResolver({
    resolveVexCoreAuthority:async()=>projection
  });
}

function fakeCompanion(){
  return Object.freeze({
    status(){return Object.freeze({state:'TEST_ONLY'});},
    async performTurn(){throw new Error('VF-06 Family room proof must not invoke a model');}
  });
}

function familySecurityProjectionFor({
  record,
  channel,
  sessionProjection,
  perceptionEvidenceOrNull = null
}) {
  return projectFamilySecurityAwareness({
    familyContext: {
      schemaVersion: FAMILY_SECURITY_FAMILY_CONTEXT_SCHEMA,
      state: 'CURRENT',
      spaceRef: record.spaceRef,
      channelRef: channel.channelRef,
      membershipGeneration: record.membershipGeneration,
      membershipSnapshotRef: channel.familySpaceBinding.membershipSnapshotRef,
      historyVisibilityPolicyRef: channel.familySpaceBinding.historyVisibilityPolicyRef,
      requestingPrincipalRef: sessionProjection.principalRef,
      audiencePrincipalRefs: channel.familySpaceBinding.audienceMemberBindings.map((member) => member.principalRef),
      familyCompanionLineageRef: channel.familySpaceBinding.familyCompanionLineageRef,
      sourceRefs: ['source.vfs03.family.current']
    },
    sessionAuthority: sessionProjection,
    perceptionEvidenceOrNull,
    healthEvidenceOrNull: null,
    distributionEvidenceOrNull: null
  });
}

function rehashFamilySecurityProjection(value) {
  const core = structuredClone(value);
  delete core.semanticFingerprint;
  delete core.familySecurityProjectionRef;
  const semanticFingerprint = semanticHash(core);
  return {
    ...core,
    familySecurityProjectionRef: `projection.vex-family-security.${semanticFingerprint.slice(0, 32)}`,
    semanticFingerprint
  };
}

function vfs03PerceptionEvidence() {
  return {
    schemaVersion: FAMILY_SECURITY_PERCEPTION_EVIDENCE_SCHEMA,
    truthClass: 'FOREIGN_PERCEPTION_OWNER_EVIDENCE',
    ownerRef: 'github.issue.vextreme-sdk.243',
    sourceProjectionRef: 'projection.vfs03.perception.current',
    currentness: 'CURRENT',
    sourceReceiptRefs: ['receipt.vfs03.perception.current'],
    sourceRefs: ['source.vfs03.perception.current'],
    gapEntries: [{
      gapRef: 'gap.vfs03.perception.withheld',
      gapState: 'WITHHELD',
      currentness: 'CURRENT',
      sourceRef: 'source.vfs03.perception.withheld',
      sourceOwnerRef: 'github.issue.vextreme-sdk.243'
    }],
    withheldRefs: ['withheld.vfs03.perception.signal'],
    knownLimitationRefs: [],
    effectAuthorized: false,
    effects: {
      filesystem: false,
      network: false,
      process: false,
      sensor: false,
      model: false,
      memory: false,
      training: false,
      publication: false
    }
  };
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

test('VFS03-00/01 exact source-managed projection becomes compact CURRENT status while absence remains held',async(t)=>{
  const {home,record,resolver,channel,sessionProjection}=fixture(t);
  const held=await resolveCurrentFamilyRoomBootstrap({
    request:{headers:{}},familyHome:home,resolveAuthority:resolver,nowProvider:()=>T1
  });
  assert.equal(held.state,'CURRENT');
  assert.equal(held.securityStatus.state,'HELD_UNAVAILABLE');
  assert.equal(held.securityStatus.roleCanAct,false);
  assert.equal(held.securityStatus.effectAuthorityGranted,false);

  const projection=familySecurityProjectionFor({record,channel,sessionProjection});
  let observedCurrent=null;
  const current=await resolveCurrentFamilyRoomBootstrap({
    request:{headers:{}},familyHome:home,resolveAuthority:resolver,nowProvider:()=>T1,
    resolveFamilySecurityProjection:async({current:securityCurrent})=>{
      observedCurrent=securityCurrent;
      return projection;
    }
  });
  assert.equal(current.securityStatus.state,'CURRENT');
  assert.equal(current.securityStatus.projectionRefOrNull,projection.familySecurityProjectionRef);
  assert.equal(current.securityStatus.projectionFingerprintOrNull,projection.semanticFingerprint);
  assert.equal(current.securityStatus.sessionCurrent,true);
  assert.equal(current.securityStatus.attackEstablished,false);
  assert.equal(current.securityStatus.roleCanAct,false);
  assert.equal(current.securityStatus.effectAuthorityGranted,false);
  assert.equal(observedCurrent.membershipSnapshotRef,channel.familySpaceBinding.membershipSnapshotRef);
  assert.equal(observedCurrent.historyVisibilityPolicyRef,channel.familySpaceBinding.historyVisibilityPolicyRef);
  assert.deepEqual(observedCurrent.audiencePrincipalRefs,
    channel.familySpaceBinding.audienceMemberBindings.map((member)=>member.principalRef).sort());
});

test('VFS03-02/03/04/06 malformed, stale, authority-inflated or attack-inflated projections hold only security status',async(t)=>{
  const {home,record,resolver,channel,sessionProjection}=fixture(t);
  const exact=familySecurityProjectionFor({record,channel,sessionProjection});
  const cases=[
    ['family-space-mismatch',()=>{const value=structuredClone(exact);value.familyContext.spaceRef='space.vex-family.other';return rehashFamilySecurityProjection(value);}],
    ['forged-fingerprint',()=>({...structuredClone(exact),semanticFingerprint:'0'.repeat(64)})],
    ['role-can-act-inflation',()=>{const value=structuredClone(exact);value.authority.roleCanAct=true;return rehashFamilySecurityProjection(value);}],
    ['effect-inflation',()=>{const value=structuredClone(exact);value.effects.network=true;return rehashFamilySecurityProjection(value);}],
    ['attack-inflation',()=>{const value=structuredClone(exact);value.incidentCoverage.attackEstablished=true;return rehashFamilySecurityProjection(value);}]
  ];
  for(const [label,form] of cases){
    const bootstrap=await resolveCurrentFamilyRoomBootstrap({
      request:{headers:{}},familyHome:home,resolveAuthority:resolver,nowProvider:()=>T1,
      resolveFamilySecurityProjection:async()=>form()
    });
    assert.equal(bootstrap.state,'CURRENT',label);
    assert.equal(bootstrap.rooms.length,1,label);
    assert.equal(bootstrap.securityStatus.state,'HELD_UNAVAILABLE',label);
    assert.equal(bootstrap.securityStatus.roleCanAct,false,label);
    assert.equal(bootstrap.securityStatus.effectAuthorityGranted,false,label);
  }
});

test('VFS03-05/06/07 compact status preserves typed gaps and excludes raw authority material',async(t)=>{
  const {home,record,resolver,channel,sessionProjection}=fixture(t);
  const projection=familySecurityProjectionFor({
    record,channel,sessionProjection,perceptionEvidenceOrNull:vfs03PerceptionEvidence()
  });
  const bootstrap=await resolveCurrentFamilyRoomBootstrap({
    request:{headers:{}},familyHome:home,resolveAuthority:resolver,nowProvider:()=>T1,
    resolveFamilySecurityProjection:async()=>projection
  });
  assert.equal(bootstrap.securityStatus.state,'CURRENT');
  assert.equal(bootstrap.securityStatus.missingCount,3);
  assert.equal(bootstrap.securityStatus.unknownCount,2);
  assert.equal(bootstrap.securityStatus.withheldCount,1);
  assert.equal(bootstrap.securityStatus.telemetryGapCount,1);
  assert.equal(bootstrap.securityStatus.incidentCoverageStateOrNull,'MISSING_OWNER_PROJECTION');
  assert.equal(bootstrap.securityStatus.attackEstablished,false);
  const serialized=JSON.stringify(bootstrap);
  for(const forbidden of [
    'devicePublicKey','membershipHash','leaseHash','approvedBy','approvedAt','issuedAt','expiresAt',
    'homeBridgeMembershipRef','homeBridgeLeaseRef'
  ]) assert.equal(serialized.includes(forbidden),false,forbidden);
  assert.equal(Object.hasOwn(bootstrap,'companionAvailability'),false);
});

test('VFS03-08 EN/JA/ZH copy keeps visible status scoped and non-certifying',()=>{
  const required=[
    'family-room.security.label','family-room.security.current','family-room.security.limited',
    'family-room.security.unavailable','family-room.security.gaps','family-room.security.scope'
  ];
  for(const locale of ['en','ja','zh']){
    const strings=JSON.parse(fs.readFileSync(path.join(ROOT,'blueprint','strings',locale+'.json'),'utf8'));
    for(const key of required) assert.equal(typeof strings[key],'string',locale+':'+key);
  }
  const en=JSON.parse(fs.readFileSync(path.join(ROOT,'blueprint','strings','en.json'),'utf8'));
  const visible=required.map((key)=>en[key]).join(' ');
  assert.doesNotMatch(visible,/\bSAFE\b|\bCLEAR\b/u);
  assert.match(en['family-room.security.scope'],/not a safety certification/u);
});

test('VF06-00 server-owned bootstrap projects only current visible Family truth',async(t)=>{
  const {home,resolver}=fixture(t);
  const bootstrap=await resolveCurrentFamilyRoomBootstrap({
    request:{headers:{}},
    familyHome:home,
    resolveAuthority:resolver,
    nowProvider:()=>T1,
    resolveFamilyWorkProjection:async()=>({
      schemaVersion:BROWSER_FAMILY_FOLLOW_THROUGH_RUNTIME_SCHEMA,
      state:'CURRENT',
      currentness:'CURRENT',
      sourceRef:'projection.generic-follow-through.empty-test',
      workgraphs:[],
      schedulerAggregates:[],
      concernAggregates:[]
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
  assert.deepEqual(bootstrap.workStatus,{
    state:'CURRENT',pendingCount:0,activeCount:0,dueCount:0,attentionCount:0,
    sourceRef:BROWSER_FAMILY_FOLLOW_THROUGH_SOURCE_REF
  });
  const serialized=JSON.stringify(bootstrap);
  assert.equal(serialized.includes('lease.vf06-home'),false);
  assert.equal(serialized.includes('device-public-key-vf06'),false);

  const normalized=normalizeFamilyRoomBootstrap(bootstrap);
  const view=familyRoomViewModel(normalized);
  assert.deepEqual(view,{
    state:'CURRENT',truthClass:'CURRENT_LIVE_FAMILY',roomCount:1,audienceCount:3,familyVexCount:1,
    workState:'CURRENT',pendingCount:0,activeCount:0,dueCount:0,attentionCount:0,
    securityState:'HELD_UNAVAILABLE',securityMissingCount:null,securityUnknownCount:null,
    securityWithheldCount:null,securityTelemetryGapCount:null
  });
});


function familyBindingRefs(nodes){
  return Object.fromEntries(INTENT_REGISTRY.bindingFields.map((field)=>[
    field,[...new Set(nodes.flatMap((item)=>Array.isArray(item[field])?item[field]:[item[field]]).filter(Boolean))].sort()
  ]));
}
function familyFollowThroughGraph(suffix,{channelRef=CHANNEL,threadRef='thread.vex-family.vf06-test',originSpeakerRef=PRINCIPAL}={}){
  const intentRef='intent.family-follow-through.'+suffix;
  const intent=createIntentEnvelope({
    intentRef,originMessageRef:'message.'+intentRef,originSpeakerRef,recipientRoleRef:'role.vex.companion',
    projectRef:'project.vexlife.root-hub',threadRef,channelRef,
    originalContentHash:semanticHash({suffix,channelRef,threadRef}),
    desiredOutcome:{intentKey:'FAMILY_FOLLOW_THROUGH_TEST',summary:'Exercise Family follow-through projection'},
    constraints:['NO_EXTERNAL_EFFECTS'],createdAt:T0,sourceLineageRef:'lineage.family-follow-through.'+suffix
  },INTENT_REGISTRY);
  const makeNode=(name)=>createWorkNode({
    workNodeRef:'work-node.family-follow-through.'+suffix+'.'+name,rootIntentRef:intentRef,
    purpose:'Family follow-through '+name,processRef:'process.vexlife.intent.validate-workgraph',state:'READY',
    dependencyRefs:[],childRefs:[],roleRef:'role.vex.companion',priorityClass:'NORMAL',
    applicableCultureRefs:['foundation.vexlife.state-relay.v1'],applicableLessonRefs:[],applicableBurdenReleaseRefs:[],
    capabilityEnvelopeRef:'capability-envelope.family-follow-through.'+suffix+'.'+name,
    effectEnvelopeRef:'effect-envelope.family-follow-through.'+suffix+'.'+name,
    resourceEnvelopeRef:'resource-envelope.family-follow-through.'+suffix+'.'+name,
    expectedTransitionRef:'expected-transition.family-follow-through.'+suffix+'.'+name,
    completionGateRefs:['completion-gate.family-follow-through.'+suffix+'.'+name],
    returnRouteRef:'return-route.family-follow-through.'+suffix+'.'+name,
    sourceRefs:['source.family-follow-through.'+suffix+'.'+name],createdAt:T0
  },INTENT_REGISTRY);
  const nodes=[makeNode('active'),makeNode('queued')];
  let graph=createIntentWorkgraph({
    graphRef:'intent-workgraph.family-follow-through.'+suffix,intent,nodes,transitions:[],receipts:[],
    bindingRefs:familyBindingRefs(nodes),createdAt:T0
  },INTENT_REGISTRY);
  for(const node of nodes){
    graph=acceptIntentAssignment(graph,{
      assignmentRef:'assignment.family-follow-through.'+suffix+'.'+node.workNodeRef.split('.').at(-1),
      sourceIntentRef:intentRef,workNodeRef:node.workNodeRef,assigneeRef:'lineage.vex.family.vf06-test',
      acceptingActorRef:originSpeakerRef,acceptedAt:T0,sourceRefs:['source.assignment.family-follow-through.'+suffix]
    },INTENT_REGISTRY).graph;
  }
  return {intent,nodes,graph};
}
function familySchedulerAggregate(graph){
  const aggregate=createInitialSchedulerAggregate();
  const entries=graph.nodes.map((node)=>({
    workNodeRef:node.workNodeRef,nodeFingerprint:node.semanticFingerprint,purpose:node.purpose,
    priorityClass:node.priorityClass,schedulingClass:'NORMAL',readySinceGeneration:1,deferralCount:0,
    fairnessSourceBinding:{graphFingerprint:graph.semanticFingerprint,nodeFingerprint:node.semanticFingerprint},
    admitted:true,reasonRefs:[]
  }));
  aggregate.phase='RUNNING'; aggregate.generation=1;
  aggregate.queue={...aggregate.queue,state:'ADMITTED',lifecycle:'LEASED',currentness:'CURRENT',generation:1,
    graphRef:graph.graphRef,graphFingerprint:graph.semanticFingerprint,logicalReady:structuredClone(entries),
    admittedReady:structuredClone(entries),blocked:[],selected:structuredClone(entries[0])};
  aggregate.active={schemaVersion:'vexlife.intent-worker-lease/v1',workerRef:'worker.family-follow-through.test',
    workNodeRef:graph.nodes[0].workNodeRef,graphFingerprint:graph.semanticFingerprint,schedulerGeneration:1,
    lifecycle:'ACTIVE',currentness:'CURRENT'};
  delete aggregate.semanticFingerprint; aggregate.semanticFingerprint=semanticHash(aggregate);
  return aggregate;
}
function dueAndAttentionForGraph(graph){
  const scheduler=new SingleWorkerIntentScheduler({
    workerRef:'worker.family-follow-through.due',schedulerInstanceRef:'scheduler.family-follow-through.due',
    schedulerRegistry:SCHEDULER_REGISTRY
  });
  scheduler.advanceObservedClock({observedAt:T0,eventRef:'clock.family-follow-through.initial'});
  const formed=scheduler.formDueIntent(graph,{
    assignmentRef:graph.acceptedAssignments[1].assignmentRef,dueAt:T2,formedAt:T0,observedAt:T0,
    sourceRefs:['source.family-follow-through.due']
  });
  scheduler.advanceObservedClock({observedAt:T2,eventRef:'clock.family-follow-through.due',graph});
  const input={schedulerAggregate:scheduler.aggregate,schedulerRegistry:SCHEDULER_REGISTRY,
    intentRegistry:INTENT_REGISTRY,workgraph:graph,dueRef:formed.due.dueRef,aboutScopeRef:SPACE};
  const observation=createSchedulerDueConcernObservation(input,{registry:CONCERN_REGISTRY});
  const subject=deriveConcernSubject({observations:[observation],subjectKind:'FOLLOW_THROUGH_DUE'},{registry:CONCERN_REGISTRY});
  let aggregate=createConcernAggregate({subject,formedAt:T0},{registry:CONCERN_REGISTRY});
  aggregate=recordSchedulerDueConcernObservation(aggregate,input,{registry:CONCERN_REGISTRY}).aggregate;
  const threshold=evaluateConcernThreshold(aggregate,{observedAt:T2},{registry:CONCERN_REGISTRY});
  aggregate=recordThresholdEvaluation(aggregate,threshold,{registry:CONCERN_REGISTRY}).aggregate;
  const request=createHumanAttentionRequest(aggregate,{
    whyVictorIsNeeded:'One Family-scoped accepted assignment is due.',
    smallestDecisionOrEvidence:'Acknowledge, reschedule, or cancel the due follow-through.',
    availableOptions:['option.follow-through.acknowledge','option.follow-through.reschedule','option.follow-through.cancel'],
    recommendedOption:'option.follow-through.acknowledge',consequenceOfWaiting:'The accepted Family-scoped assignment remains due.',
    safeUntil:T9,returnRouteRef:graph.nodes[1].returnRouteRef,formedAt:T3
  },{registry:CONCERN_REGISTRY});
  aggregate=recordHumanAttentionRequest(aggregate,request,{registry:CONCERN_REGISTRY}).aggregate;
  return {schedulerAggregate:scheduler.aggregate,concernAggregate:aggregate};
}
function currentFamilyGenericSnapshot(graph){
  const due=dueAndAttentionForGraph(graph);
  return {schemaVersion:BROWSER_FAMILY_FOLLOW_THROUGH_RUNTIME_SCHEMA,state:'CURRENT',currentness:'CURRENT',
    sourceRef:'projection.generic-follow-through.test',workgraphs:[graph],
    schedulerAggregates:[familySchedulerAggregate(graph),due.schedulerAggregate],concernAggregates:[due.concernAggregate]};
}

test('FTE-02/03/05 exact generic owners project only current Family-scoped compact truth',async(t)=>{
  const {home,resolver}=fixture(t); const family=familyFollowThroughGraph('current');
  const bootstrap=await resolveCurrentFamilyRoomBootstrap({
    request:{headers:{}},familyHome:home,resolveAuthority:resolver,nowProvider:()=>T3,
    resolveFamilyWorkProjection:async()=>currentFamilyGenericSnapshot(family.graph)
  });
  assert.equal(bootstrap.state,'CURRENT'); assert.equal(bootstrap.currentPrincipalRef,PRINCIPAL);
  assert.deepEqual(bootstrap.workStatus,{state:'CURRENT',pendingCount:1,activeCount:1,dueCount:1,attentionCount:1,
    sourceRef:BROWSER_FAMILY_FOLLOW_THROUGH_SOURCE_REF});
  const serialized=JSON.stringify(bootstrap.workStatus);
  for(const forbidden of ['workNodeRef','assignmentRef','schedulerAggregate','concernAggregate','evidenceRefs','semanticFingerprint'])
    assert.equal(serialized.includes(forbidden),false,forbidden);
});

test('FTE-04 private/non-Family Workgraph cannot leak into Family work projection',async(t)=>{
  const {home,resolver}=fixture(t); const family=familyFollowThroughGraph('family');
  const privateWork=familyFollowThroughGraph('private',{channelRef:'channel.private.follow-through',threadRef:'thread.private.follow-through'});
  const familySnapshot=currentFamilyGenericSnapshot(family.graph);
  const privateSnapshot=currentFamilyGenericSnapshot(privateWork.graph);
  const combined={schemaVersion:BROWSER_FAMILY_FOLLOW_THROUGH_RUNTIME_SCHEMA,state:'CURRENT',currentness:'CURRENT',
    sourceRef:'projection.generic-follow-through.combined-test',workgraphs:[family.graph,privateWork.graph],
    schedulerAggregates:[...familySnapshot.schedulerAggregates,...privateSnapshot.schedulerAggregates],
    concernAggregates:[...familySnapshot.concernAggregates,...privateSnapshot.concernAggregates]};
  const bootstrap=await resolveCurrentFamilyRoomBootstrap({
    request:{headers:{}},familyHome:home,resolveAuthority:resolver,nowProvider:()=>T3,
    resolveFamilyWorkProjection:async()=>combined
  });
  assert.deepEqual(bootstrap.workStatus,{state:'CURRENT',pendingCount:1,activeCount:1,dueCount:1,attentionCount:1,
    sourceRef:BROWSER_FAMILY_FOLLOW_THROUGH_SOURCE_REF});
});

test('FTE-06/07 active/due Family work does not block deterministic human Family message delivery',async(t)=>{
  const {home,record,resolver}=fixture(t); const family=familyFollowThroughGraph('human-chat');
  const server=createVexLifeBrowserServer({
    companionBridge:fakeCompanion(),familyConversationHome:home,familyConversationNow:()=>T3,
    familyConversationInstanceRef:'instance.fte.human-chat',resolveFamilyConversationAuthority:resolver,
    resolveFamilyWorkProjection:async()=>currentFamilyGenericSnapshot(family.graph)
  });
  const base=await listen(server,t);
  const bootstrap=await (await fetch(base+BROWSER_FAMILY_ROOM_BOOTSTRAP_API_PATH)).json();
  assert.equal(bootstrap.workStatus.activeCount,1); assert.equal(bootstrap.workStatus.dueCount,1);
  assert.equal(bootstrap.workStatus.attentionCount,1);
  assert.equal(bootstrap.securityStatus.state,'HELD_UNAVAILABLE');
  const response=await fetch(base+BROWSER_FAMILY_CONVERSATION_API_PATH,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({operation:'APPEND',intent:{spaceRef:SPACE,channelRef:CHANNEL,
      content:'Humans continue while Vex work is active and due.',
      expectedMembershipGeneration:record.membershipGeneration,idempotencyKey:'fte-human-chat-during-ai-work'}})
  });
  assert.equal(response.status,200); const body=await response.json();
  assert.equal(body.message.speakerRef,PRINCIPAL);
  assert.equal(body.message.content,'Humans continue while Vex work is active and due.');
});

test('FTE-08 invalid generic truth holds only work projection while Family truth stays current',async(t)=>{
  const {home,resolver}=fixture(t); const family=familyFollowThroughGraph('invalid');
  const snapshot=currentFamilyGenericSnapshot(family.graph);
  snapshot.schedulerAggregates[0]=structuredClone(snapshot.schedulerAggregates[0]);
  snapshot.schedulerAggregates[0].semanticFingerprint='0'.repeat(64);
  const bootstrap=await resolveCurrentFamilyRoomBootstrap({
    request:{headers:{}},familyHome:home,resolveAuthority:resolver,nowProvider:()=>T3,
    resolveFamilyWorkProjection:async()=>snapshot
  });
  assert.equal(bootstrap.state,'CURRENT'); assert.equal(bootstrap.rooms.length,1);
  assert.deepEqual(bootstrap.workStatus,{state:'HELD_UNAVAILABLE',pendingCount:null,activeCount:null,dueCount:null,attentionCount:null,sourceRef:null});
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

test('VF06-02 same-origin bootstrap projects an explicit held state without current server session authority',async(t)=>{
  const {home}=fixture(t);
  const server=createVexLifeBrowserServer({
    companionBridge:fakeCompanion(),
    familyConversationHome:home,
    familyConversationNow:()=>T1
  });
  const base=await listen(server,t);
  const response=await fetch(base+BROWSER_FAMILY_ROOM_BOOTSTRAP_API_PATH);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.schemaVersion,BROWSER_FAMILY_ROOM_BOOTSTRAP_SCHEMA);
  assert.equal(body.state,'HELD_UNAVAILABLE');
  assert.equal(body.truthClass,'HELD_UNAVAILABLE');
  assert.equal(body.currentPrincipalRef,null);
  assert.deepEqual(body.rooms,[]);
  assert.equal(body.workStatus.state,'HELD_UNAVAILABLE');
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

test('VF06-04 non-Victor authenticated Family APPEND keeps current principal as canonical speaker without browser authority fields',async(t)=>{
  const {home,record}=fixture(t);
  const nonVictorPrincipal='person.alex';
  const resolver=resolverForPrincipal(nonVictorPrincipal,'device.vf06-alex');
  const bootstrap=await resolveCurrentFamilyRoomBootstrap({
    request:{headers:{}},
    familyHome:home,
    resolveAuthority:resolver,
    nowProvider:()=>T1
  });
  assert.equal(bootstrap.state,'CURRENT');
  assert.equal(bootstrap.currentPrincipalRef,nonVictorPrincipal);
  assert.equal(bootstrap.rooms[0].audience.some((member)=>member.principalRef===PRINCIPAL),true);

  const server=createVexLifeBrowserServer({
    companionBridge:fakeCompanion(),
    familyConversationHome:home,
    familyConversationNow:()=>T1,
    familyConversationInstanceRef:'instance.vf06.non-victor-http',
    resolveFamilyConversationAuthority:resolver
  });
  const base=await listen(server,t);
  const requestBody={
    operation:'APPEND',
    intent:{
      spaceRef:SPACE,
      channelRef:CHANNEL,
      content:'Non-Victor Family attribution proof.',
      expectedMembershipGeneration:record.membershipGeneration,
      idempotencyKey:'vf06-non-victor-append'
    }
  };
  assert.equal(Object.hasOwn(requestBody,'principalRef'),false);
  assert.equal(Object.hasOwn(requestBody.intent,'principalRef'),false);
  assert.equal(Object.hasOwn(requestBody.intent,'membership'),false);
  assert.equal(Object.hasOwn(requestBody.intent,'lease'),false);

  const response=await fetch(base+BROWSER_FAMILY_CONVERSATION_API_PATH,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(requestBody)
  });
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.message.speakerRef,nonVictorPrincipal);
  assert.equal(body.message.recipientRefs.includes(PRINCIPAL),true);
});


function syntheticController({ bootstrap, lifecycleResponse = { status: 200, body: { state: 'CURRENT' } } } = {}) {
  const requests = [];
  let currentBootstrap = bootstrap ?? {
    schemaVersion: BROWSER_FAMILY_ROOM_BOOTSTRAP_SCHEMA,
    state: 'EMPTY',
    truthClass: 'CURRENT_LIVE_FAMILY',
    currentPrincipalRef: PRINCIPAL,
    rooms: [],
    workStatus: {
      state: 'HELD_UNAVAILABLE',
      pendingCount: null,
      activeCount: null,
      dueCount: null,
      attentionCount: null,
      sourceRef: null
    },
    failureCode: null
  };
  const response = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; }
  });
  const fetchImpl = async (url, init = {}) => {
    if (url === '/api/v1/family/bootstrap') return response(200, currentBootstrap);
    if (url === '/api/v1/family/conversation') return response(200, { messages: [] });
    if (url === '/api/v1/family/lifecycle') {
      const body = JSON.parse(init.body);
      requests.push(body);
      return response(lifecycleResponse.status, lifecycleResponse.body);
    }
    throw new Error('unexpected synthetic URL ' + url);
  };
  const state = { channelRef: null };
  const projects = [{
    projectRef: 'project.vexlife.root-hub',
    threads: [{ threadRef: 'thread.root-hub.welcome' }]
  }];
  const controller = createFamilyRoomController({
    state,
    projects,
    roles: {},
    channels: [],
    messages: new Map(),
    conversationKey: (...values) => values.join(':'),
    t: (key) => key,
    navigation: {},
    chat: {
      selectThread() {},
      selectChannel() {},
      renderMessages() {}
    },
    fetchImpl,
    documentRef: null,
    idempotencyKeyFactory: () => 'intent.vex.family.host.synthetic'
  });
  return {
    controller,
    requests,
    setBootstrap(value) { currentBootstrap = value; }
  };
}

test('VF07C1-00/01/02/03 contract-first lifecycle intents contain only bounded browser fields', async () => {
  const synthetic = syntheticController();
  await synthetic.controller.refresh();

  const host = await synthetic.controller.hostFamily();
  assert.equal(host.ok, true);
  const join = await synthetic.controller.joinFamily('invitation.vex.family.synthetic');
  assert.equal(join.ok, true);

  assert.deepEqual(synthetic.requests[0], {
    operation: 'HOST',
    intent: { idempotencyKey: 'intent.vex.family.host.synthetic' }
  });
  assert.deepEqual(synthetic.requests[1], {
    operation: 'JOIN',
    intent: { invitationRef: 'invitation.vex.family.synthetic' }
  });

  const serialized = JSON.stringify(synthetic.requests);
  for (const forbidden of [
    'principalRef',
    'principalBindingRef',
    'membershipRef',
    'expectedRevision',
    'expectedMembershipGeneration',
    'familyCompanionLineageRef',
    'threadRef',
    'channelRef',
    'successorChannelRef'
  ]) assert.equal(serialized.includes(forbidden), false, forbidden);
});

test('VF07C1-04 Leave consumes only the current server-projected Family spaceRef', async () => {
  const bootstrap = {
    schemaVersion: BROWSER_FAMILY_ROOM_BOOTSTRAP_SCHEMA,
    state: 'CURRENT',
    truthClass: 'CURRENT_LIVE_FAMILY',
    currentPrincipalRef: PRINCIPAL,
    rooms: [{
      spaceRef: SPACE,
      channelRef: CHANNEL,
      threadRef: 'thread.vf07c1.synthetic',
      kind: 'GROUP',
      membershipGeneration: 3,
      audience: [{ principalRef: PRINCIPAL, role: 'OWNER' }],
      familyCompanionLineageRef: 'lineage.vex.family.vf07c1.synthetic',
      familyCompanionIncluded: true
    }],
    workStatus: {
      state: 'HELD_UNAVAILABLE',
      pendingCount: null,
      activeCount: null,
      dueCount: null,
      attentionCount: null,
      sourceRef: null
    },
    failureCode: null
  };
  const synthetic = syntheticController({ bootstrap });
  await synthetic.controller.refresh();
  const left = await synthetic.controller.leaveFamily();
  assert.equal(left.ok, true);
  assert.deepEqual(synthetic.requests[0], {
    operation: 'LEAVE',
    intent: { spaceRef: SPACE }
  });
});

test('VF07C1-05 lifecycle failure remains held and never synthesizes success', async () => {
  const synthetic = syntheticController({
    lifecycleResponse: {
      status: 503,
      body: {
        state: 'HELD_FAMILY_LIFECYCLE_FAILURE',
        failureCode: 'FAMILY_LIFECYCLE_AUTHORITY_UNAVAILABLE'
      }
    }
  });
  await synthetic.controller.refresh();
  const result = await synthetic.controller.hostFamily();
  assert.equal(result.ok, false);
  assert.deepEqual(synthetic.controller.lifecycleStatus(), {
    state: 'HELD_UNAVAILABLE',
    operation: 'HOST',
    failureCode: 'FAMILY_LIFECYCLE_AUTHORITY_UNAVAILABLE'
  });
  assert.equal(synthetic.requests.length, 1);
});


test('VF07C1-06 real same-origin Host/Join/Leave consumes the accepted server lifecycle bridge', async t => {
  const home = tempHome(t);
  let now = T0;
  let currentProjection = vexCoreProjectionForPrincipal(PRINCIPAL, DEVICE);
  const currentConversationResolver = createVexCoreFamilySessionAuthorityResolver({
    resolveVexCoreAuthority: async () => currentProjection
  });
  const lifecycleCalls = [];

  const resolveLifecycleAuthority = async context => {
    lifecycleCalls.push(Object.freeze({
      operation: context.operation,
      intent: structuredClone(context.intent)
    }));
    return Object.freeze({
      membership: currentProjection.membership,
      lease: currentProjection.lease,
      currentRevocationGeneration: currentProjection.currentRevocationGeneration
    });
  };
  const resolveConversationAuthority = async context => currentConversationResolver(context);

  const server = createVexLifeBrowserServer({
    companionBridge: fakeCompanion(),
    familyConversationHome: home,
    familyConversationNow: () => now,
    familyConversationInstanceRef: 'instance.vf07c1.real-conversation',
    resolveFamilyConversationAuthority: resolveConversationAuthority,
    familyLifecycleHome: home,
    familyLifecycleNow: () => now,
    familyLifecycleInstanceRef: 'instance.vf07c1.real-lifecycle',
    resolveFamilyLifecycleAuthority: resolveLifecycleAuthority
  });
  const base = await listen(server, t);
  const fetchImpl = (url, init = {}) => fetch(new URL(url, base), init);

  const state = { channelRef: null };
  const projects = [{
    projectRef: 'project.vexlife.root-hub',
    threads: [{ threadRef: 'thread.root-hub.welcome' }]
  }];
  const controller = createFamilyRoomController({
    state,
    projects,
    roles: {},
    channels: [],
    messages: new Map(),
    conversationKey: (...values) => values.join(':'),
    t: key => key,
    navigation: {},
    chat: {
      selectThread() {},
      selectChannel(channel) { state.channelRef = channel.channelRef; },
      renderMessages() {}
    },
    fetchImpl,
    documentRef: null,
    idempotencyKeyFactory: () => 'intent.vex.family.host.real'
  });

  const hosted = await controller.hostFamily();
  assert.equal(hosted.ok, true);
  const spaceRef = hosted.body.result.spaceRef;
  assert.match(spaceRef, /^space\.vex\.family\./u);
  assert.equal(controller.snapshot().state, 'EMPTY');
  assert.deepEqual(controller.snapshot().rooms, []);
  assert.equal(controller.snapshot().currentPrincipalRef, PRINCIPAL);

  const family = readFamilySpace({ home, spaceRef }).record;
  const invitation = issueFamilyInvitation({
    home,
    spaceRef,
    inviterPrincipalRef: PRINCIPAL,
    expectedFamilyRecordSha256: family.recordSha256,
    expectedRevision: family.revision,
    expectedMembershipGeneration: family.membershipGeneration,
    idempotencyKey: 'invite.vf07c1.real.alex',
    issuedAt: T1,
    expiresAt: T9,
    sourceReceiptRefs: ['receipt.vf07c1.real.issue'],
    currentnessRefs: ['currentness.vf07c1.real.issue'],
    instanceRef: 'instance.vf07c1.real.issue',
    faults: {}
  }).record;

  now = T2;
  currentProjection = vexCoreProjectionForPrincipal('person.alex', 'device.vf06-alex');
  const joined = await controller.joinFamily(invitation.invitationRef);
  assert.equal(joined.ok, true);
  assert.equal(controller.snapshot().state, 'CURRENT');
  assert.equal(controller.snapshot().currentPrincipalRef, 'person.alex');
  assert.equal(
    readFamilySpace({ home, spaceRef }).record.members
      .find(member => member.principalRef === 'person.alex')?.status,
    'ACTIVE'
  );

  now = T3;
  const left = await controller.leaveFamily();
  assert.equal(left.ok, true);
  assert.equal(left.body.result.membershipTransitionPerformed, true);
  assert.equal(
    readFamilySpace({ home, spaceRef }).record.members
      .find(member => member.principalRef === 'person.alex')?.status,
    'LEFT'
  );

  assert.deepEqual(lifecycleCalls, [
    {
      operation: 'HOST',
      intent: { idempotencyKey: 'intent.vex.family.host.real' }
    },
    {
      operation: 'JOIN',
      intent: { invitationRef: invitation.invitationRef }
    },
    {
      operation: 'LEAVE',
      intent: { spaceRef }
    }
  ]);

  const emittedIntent = JSON.stringify(lifecycleCalls);
  for (const forbidden of [
    'principalRef',
    'principalBindingRef',
    'membershipRef',
    'expectedRevision',
    'expectedMembershipGeneration',
    'familyCompanionLineageRef',
    'threadRef',
    'channelRef',
    'successorChannelRef'
  ]) assert.equal(emittedIntent.includes(forbidden), false, forbidden);
});

// [VXG RealForever]
