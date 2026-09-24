import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CONVERSATION_EVOLUTION_SURFACE_REF,
  createConversationEvolutionAdapter,
  projectConversationEvolutionState
} from '../reference/browser/evolution/conversation-projection.js';

const source=fs.readFileSync(new URL('../reference/browser/evolution/conversation-projection.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../reference/browser/evolution/conversation.css',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../reference/browser/app.js',import.meta.url),'utf8');

function fixture({availabilityState='READY',group=false}={}){
  const project={projectRef:'project.self-development',stringRef:'project.self-development.name'};
  const thread={threadRef:'thread.self-development.open-conversation',stringRef:'thread.open-conversation.name'};
  const direct={projectRef:project.projectRef,threadRef:thread.threadRef,channelRef:'channel.self-development.companion',labelRef:'channel.companion.name',kind:'DIRECT',roleKey:'companion',memberKeys:['victor','companion']};
  const groupChannel={projectRef:project.projectRef,threadRef:thread.threadRef,channelRef:'channel.self-development.group',labelRef:'channel.group.name',kind:'GROUP',roleKey:'guide',memberKeys:['victor','companion','guide']};
  const current=group?groupChannel:direct;
  const channels=[direct,groupChannel];
  const roles={victor:{actorRef:'person.victor-gong',label:'Victor'},companion:{actorRef:'role.vex.companion',label:'Vex Companion'},guide:{actorRef:'role.vex.guide',label:'Vex Guide'}};
  const strings={'project.self-development.name':'Self Development','thread.open-conversation.name':'Open conversation','channel.companion.name':'Victor → Vex Companion','channel.group.name':'Victor + Vex group'};
  const t=(ref)=>strings[ref]??ref;
  const conversationKey=(projectRef,threadRef,channelRef)=>`${projectRef}::${threadRef}::${channelRef}`;
  const messages=new Map(channels.map((channel)=>[conversationKey(channel.projectRef,channel.threadRef,channel.channelRef),[]]));
  messages.get(conversationKey(direct.projectRef,direct.threadRef,direct.channelRef)).push({messageRef:'message.direct.0',projectRef:direct.projectRef,threadRef:direct.threadRef,channelRef:direct.channelRef,speakerKey:'victor',recipientKeys:['companion'],content:'Hello Vex',sequence:0,truthClass:'CURRENT_SYNTHETIC_REFERENCE'});
  messages.get(conversationKey(groupChannel.projectRef,groupChannel.threadRef,groupChannel.channelRef)).push({messageRef:'message.group.0',projectRef:groupChannel.projectRef,threadRef:groupChannel.threadRef,channelRef:groupChannel.channelRef,speakerKey:'guide',recipientKeys:['victor','companion'],content:'Group context stays member-scoped.',sequence:0,truthClass:'CURRENT_SYNTHETIC_REFERENCE'});
  const state={projectRef:project.projectRef,threadRef:thread.threadRef,channelRef:current.channelRef,selectedNodeRef:'element.thread.open-conversation',vexAvailability:'AVAILABLE',unsentLocalDraft:group?null:{state:'UNSENT_LOCAL_DRAFT',channelRef:direct.channelRef,content:'still local',queued:false,accepted:false}};
  const availability={availabilityState,bindingState:'BOUND',recoveryClass:availabilityState==='RECOVERABLE'?'SAFE_REENTRY_AVAILABLE':'NONE',modelRefOrNull:'model.local.current',generationRefOrNull:'generation.m4',runtimeAdapterRef:'runtime.adapter.local'};
  const chat={currentProject:()=>project,currentThread:()=>thread,currentChannel:()=>current,channelsForThread:()=>channels,roleLabel:(key)=>roles[key]?.label??key,selectChannel:()=>{},companionAvailabilityState:()=>availabilityState,companionAvailability:()=>structuredClone(availability),companionRecoveryAvailable:()=>availabilityState==='RECOVERABLE'};
  return {state,chat,roles,messages,conversationKey,t};
}

test('Conversation projection preserves canonical direct addressing and unsent draft truth',()=>{
  const projected=projectConversationEvolutionState(fixture());
  assert.equal(projected.surfaceRef,CONVERSATION_EVOLUTION_SURFACE_REF);
  assert.equal(projected.semanticOwnerRef,'module.vexlife.core.conversation');
  assert.equal(projected.interactionOwnerRef,'module.vexlife.browser.chat-controller');
  assert.equal(projected.oneSemanticState,true);
  assert.equal(projected.channelKind,'DIRECT');
  assert.deepEqual(projected.audience.map((item)=>item.actorRef),['person.victor-gong','role.vex.companion']);
  assert.equal(projected.messages[0].speaker.actorRef,'person.victor-gong');
  assert.deepEqual(projected.messages[0].recipients.map((item)=>item.actorRef),['role.vex.companion']);
  assert.equal(projected.draft.state,'UNSENT_LOCAL_DRAFT');
  assert.equal(projected.draft.content,'still local');
});

test('RECOVERABLE remains recovery truth and never becomes READY turn authority',()=>{
  const recoverable=projectConversationEvolutionState(fixture({availabilityState:'RECOVERABLE'}));
  assert.equal(recoverable.availability.state,'RECOVERABLE');
  assert.equal(recoverable.availability.recoveryAvailable,true);
  assert.equal(recoverable.availability.readyForRealTurn,false);
  const ready=projectConversationEvolutionState(fixture({availabilityState:'READY'}));
  assert.equal(ready.availability.readyForRealTurn,true);
  assert.equal(ready.availability.recoveryAvailable,false);
});

test('group semantics remain available without dominating ordinary direct conversation',()=>{
  const direct=projectConversationEvolutionState(fixture());
  const group=projectConversationEvolutionState(fixture({group:true}));
  assert.equal(direct.channelKind,'DIRECT');
  assert.equal(direct.audience.length,2);
  assert.equal(group.channelKind,'GROUP');
  assert.deepEqual(group.audience.map((item)=>item.actorRef),['person.victor-gong','role.vex.companion','role.vex.guide']);
});

test('adapter stays a presentation/delegation layer with no second runtime, recovery, state or close owner',()=>{
  assert.doesNotMatch(source,/demo-data|createChatController\s*\(|\bfetch\s*\(|localStorage|sessionStorage|document\.cookie|\/api\/v1\/companion\//);
  assert.doesNotMatch(source,/requestClose\s*:/);
  assert.match(source,/semanticOwnerRef:\s*'module\.vexlife\.core\.conversation'/);
  assert.match(source,/interactionOwnerRef:\s*'module\.vexlife\.browser\.chat-controller'/);
  assert.match(source,/binding\.chat\.selectChannel/);
  assert.match(source,/#composer/);
  assert.match(source,/#messageInput/);
  assert.deepEqual(Object.keys(createConversationEvolutionAdapter(fixture())),['mount']);
});

test('adapter binds only the accepted Conversation active-surface mount contract',()=>{
  assert.match(source,/surface\.vexlife\.conversation/);
  assert.match(source,/feature\.vexlife\.addressed-conversation/);
  assert.match(source,/EVOLUTION_PROJECTION/);
  assert.match(source,/body\.replaceChildren\(root\)/);
  assert.match(source,/canonical\.form\.requestSubmit/);
});

test('presentation makes feed/composer primary and context secondary with compact/reduced-motion safeguards',()=>{
  assert.match(css,/conversation-evolution__feed/);
  assert.match(css,/conversation-evolution__composer/);
  assert.match(css,/conversation-evolution__context/);
  assert.match(css,/min-height:44px/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/family-room/);
});

test('accepted app.js seam registers the same canonical Conversation adapter and stylesheet',()=>{
  assert.match(app,/createConversationEvolutionAdapter/);
  assert.match(app,/CONVERSATION_EVOLUTION_SURFACE_REF/);
  assert.match(app,/registerEvolutionSurfaceAdapter\(CONVERSATION_EVOLUTION_SURFACE_REF,createConversationEvolutionAdapter\(\{state,chat,roles,messages,conversationKey,t\}\)\)/);
  assert.match(app,/new URL\('\.\/evolution\/conversation\.css',import\.meta\.url\)/);
  assert.doesNotMatch(app,/defineEvolutionSurfaceAdapter/);
});

// [VXG RealForever]
