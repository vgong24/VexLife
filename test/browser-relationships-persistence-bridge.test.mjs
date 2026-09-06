import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach } from 'node:test';
import {
  BrowserRelationshipsPersistenceError,
  createBrowserRelationshipsPersistenceBridge
} from '../src/core/browser-relationships-persistence-bridge.mjs';

const roots=[];
const NOW='2026-08-31T12:40:00.000Z';
const LATER='2026-08-31T12:41:00.000Z';
function home(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'vexlife-rel-browser-'));roots.push(root);return root;}
afterEach(()=>{while(roots.length)fs.rmSync(roots.pop(),{recursive:true,force:true});});
function local(){return {localParticipantRef:'participant.local.alpha',localStateRootRef:'state-root.local.alpha'};}
function preparedInput(patch={}){return {counterpartParticipantRef:'participant.peer.beta',counterpartCurrentKeyRef:'key.peer.beta.current',localRelationshipClass:'FRIEND',invitationRef:'invitation.friend.alpha-beta.001',invitationCurrentnessRef:'currentness.invitation.alpha-beta.001',observedAt:NOW,instanceRef:'instance.relationships.browser.001',lastAcceptedPeerCurrentnessRef:'currentness.peer.beta.001',routeRef:null,sessionGeneration:null,deliveryObservationRef:null,...patch};}
function bridge(root=home(),owner=local()){return createBrowserRelationshipsPersistenceBridge({home:root,localOwnerBinding:owner});}

test('FFR03-BRIDGE-00 explicit local identity binding is required and Home metadata is not accepted as identity',()=>{
  const root=home();
  assert.throws(()=>createBrowserRelationshipsPersistenceBridge({home:root,localOwnerBinding:null}),(e)=>e instanceof BrowserRelationshipsPersistenceError&&e.code==='RELATIONSHIPS_IDENTITY_BINDING_REQUIRED');
  assert.throws(()=>createBrowserRelationshipsPersistenceBridge({home:root,localOwnerBinding:{...local(),homeRef:'home.vexlife.fake'}}),(e)=>e instanceof BrowserRelationshipsPersistenceError&&e.code==='RELATIONSHIPS_PERSISTENCE_INPUT_INVALID');
});

test('FFR03-BRIDGE-01 prepare is no-effect and commit earns SAVED only from durable receipt plus current readback',()=>{
  const root=home(), b=bridge(root);
  const prepared=b.prepare(preparedInput());
  assert.equal(prepared.state,'PREPARED_NO_EFFECT');
  assert.equal(prepared.effects.relationshipMutationPerformed,false);
  assert.equal(fs.existsSync(path.join(root,'relationships')),false);
  const saved=b.commit(prepared);
  assert.equal(saved.state,'SAVED');
  assert.equal(saved.receipt.state,'COMMITTED');
  assert.equal(saved.receipt.relationshipPersisted,true);
  assert.equal(saved.current.relationshipRef,saved.receipt.relationshipRef);
  assert.equal(saved.current.record.revision,saved.receipt.revision);
  assert.equal(saved.effects.canonicalRelationshipPersisted,true);
  for(const key of ['networkEffectPerformed','providerEffectPerformed','MemoryEffectPerformed','HomeLayoutEffectPerformed','modelRuntimePerformed','publicationPerformed','publicSearchPerformed','semanticAcknowledgementCreated','reciprocalFriendshipCreated']) assert.equal(saved.effects[key],false,key);
});

test('FFR03-BRIDGE-02 prepared relationship identity cannot be forged or widened with unadmitted fields',()=>{
  const b=bridge();
  const prepared=b.prepare(preparedInput());
  assert.throws(()=>b.commit({...prepared,relationshipRef:'relationship.vexlife.local.forged'}),(e)=>e instanceof BrowserRelationshipsPersistenceError&&e.code==='RELATIONSHIPS_PERSISTENCE_PREPARED_INVALID');
  assert.throws(()=>b.prepare({...preparedInput(),homeRef:'home.vexlife.fake'}),(e)=>e instanceof BrowserRelationshipsPersistenceError&&e.code==='RELATIONSHIPS_PERSISTENCE_INPUT_INVALID');
});

test('FFR03-BRIDGE-03 bounded owner-local list/read cannot leak a different state-root owner',()=>{
  const root=home(), b=bridge(root);
  b.commit(b.prepare(preparedInput()));
  b.commit(b.prepare(preparedInput({counterpartParticipantRef:'participant.peer.gamma',counterpartCurrentKeyRef:'key.peer.gamma.current',invitationRef:'invitation.friend.alpha-gamma.001',invitationCurrentnessRef:'currentness.invitation.alpha-gamma.001',instanceRef:'instance.relationships.browser.002'})));
  const listed=b.list({maxRelationships:1});
  assert.equal(listed.totalCount,2);assert.equal(listed.returnedCount,1);assert.equal(listed.truncated,true);
  assert.equal(Object.hasOwn(listed.relationships[0],'home'),false);
  const wrong=createBrowserRelationshipsPersistenceBridge({home:root,localOwnerBinding:{localParticipantRef:'participant.local.alpha',localStateRootRef:'state-root.local.other'}});
  const isolated=wrong.list({maxRelationships:10});
  assert.equal(isolated.totalCount,0);
});

test('FFR03-BRIDGE-04 transition/export/tombstone preserve durable truth and non-collapse',()=>{
  const b=bridge();
  const saved=b.commit(b.prepare(preparedInput()));
  const blocked=b.transition({counterpartParticipantRef:'participant.peer.beta',action:'BLOCK',expectedRevision:0,observedAt:LATER,instanceRef:'instance.relationships.browser.block',counterpartCurrentKeyRef:null,invitationCurrentnessRef:null,lastAcceptedPeerCurrentnessRef:null,routeRef:null,sessionGeneration:null,deliveryObservationRef:null,recoveryOrTombstoneRef:null});
  assert.equal(blocked.current.record.status,'BLOCKED');
  const exported=b.exportCurrent({counterpartParticipantRef:'participant.peer.beta',maxTransitions:8});
  assert.equal(exported.relationshipRef,saved.relationshipRef);assert.equal(exported.rawEndpointIncluded,false);assert.equal(exported.privateMemoryIncluded,false);
  const tomb=b.tombstone({counterpartParticipantRef:'participant.peer.beta',expectedRevision:1,observedAt:'2026-08-31T12:42:00.000Z',instanceRef:'instance.relationships.browser.tombstone'});
  assert.equal(tomb.current.record.tombstoned,true);
  assert.equal(b.list({maxRelationships:10}).totalCount,0);
  assert.equal(b.list({maxRelationships:10,includeTombstoned:true}).totalCount,1);
});

// [VXG RealForever]
