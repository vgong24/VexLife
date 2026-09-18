import{createRelationshipsPersistenceStateMachine}from'../reference/browser/modules/relationships-controller.js';
import assert from'node:assert/strict';import fs from'node:fs';import{createServer}from'node:http';import path from'node:path';import test from'node:test';import{fileURLToPath}from'node:url';import{chromium}from'playwright';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const server=()=>new Promise((resolve,reject)=>{const s=createServer((q,p)=>{const u=new URL(q.url,'http://127.0.0.1'),f=path.resolve(ROOT,decodeURIComponent(u.pathname).replace(/^\/+/,''));if(!f.startsWith(ROOT+path.sep))return p.writeHead(403).end();fs.readFile(f,(e,b)=>e?p.writeHead(404).end():p.writeHead(200,{'Content-Type':f.endsWith('.json')?'application/json':f.endsWith('.css')?'text/css':f.endsWith('.js')?'text/javascript':'text/html','Cache-Control':'no-store'}).end(b))});s.once('error',reject);s.listen(0,'127.0.0.1',()=>resolve(s))});
test('REL-A12 Chromium desktop/compact no-effect practicum',{timeout:60000},async()=>{const s=await server(),port=s.address().port,b=await chromium.launch({headless:true});try{for(const spec of[{viewport:{width:1200,height:850},reducedMotion:'no-preference'},{viewport:{width:390,height:844},reducedMotion:'no-preference'},{viewport:{width:1200,height:850},reducedMotion:'reduce'}]){const c=await b.newContext(spec),p=await c.newPage(),requests=[],consoleErrors=[],pageErrors=[],popups=[],downloads=[];p.on('request',x=>requests.push(x.url()));p.on('console',x=>{if(x.type()==='error')consoleErrors.push(x.text())});p.on('pageerror',x=>pageErrors.push(x.message));p.on('popup',x=>popups.push(x.url()));p.on('download',x=>downloads.push(x.suggestedFilename()));await p.goto(`http://127.0.0.1:${port}/reference/browser/relationships/index.html`,{waitUntil:'networkidle'});await p.waitForFunction(()=>document.documentElement.dataset.relationshipsReady==='true');assert.equal(await p.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),spec.reducedMotion==='reduce');assert.notEqual(await p.locator('[data-i18n="deliveryBody"]').textContent(),'deliveryBody');for(const n of['0','1','5','6','20','100']){await p.selectOption('#count',n);assert.equal(await p.locator('#effect').textContent(),'REFERENCE_ONLY_NO_EXTERNAL_EFFECT')}await p.selectOption('#count','5');assert.equal(await p.locator('button.person').count(),0);await p.selectOption('#count','100');assert.equal(await p.locator('.aggregates button').count(),1);assert.equal(await p.locator('#openBooklet b').textContent(),'People (100)');assert.equal(await p.locator('.aggregates .aggregate').nth(1).textContent(),'Groups (2)');assert.equal(await p.locator('.aggregates .aggregate').nth(2).textContent(),'Invitations (1)');await p.locator('#openBooklet').focus();await p.keyboard.press('Enter');assert.equal(await p.locator('#booklet').isVisible(),true);assert.equal(await p.locator('#openBooklet').getAttribute('aria-expanded'),'true');assert.equal(await p.evaluate(()=>document.activeElement?.id),'closeBooklet');assert.equal(await p.locator('#bookletList .row').count(),20);await p.keyboard.press('Enter');assert.equal(await p.locator('#booklet').isHidden(),true);assert.equal(await p.evaluate(()=>document.activeElement?.id),'openBooklet');await p.locator('#connect').focus();await p.keyboard.press('Enter');assert.equal(await p.locator('#connect').getAttribute('aria-expanded'),'true');assert.equal(await p.evaluate(()=>document.activeElement?.id),'connectPanel');assert.equal(await p.locator('#form').isDisabled(),true);await p.selectOption('#invitation','RECEIVED_VERIFIED_REFERENCE');await p.selectOption('#identity','VERIFIED_CURRENT');await p.selectOption('#decision','ACCEPT');await p.selectOption('#localClass','FAMILY');assert.equal(await p.locator('#form').isDisabled(),false);await p.locator('#form').focus();await p.keyboard.press('Enter');assert.match(await p.locator('#connectStatus').textContent(),/Family/);assert.equal(await p.locator('#delivery').isDisabled(),false);await p.selectOption('#delivery','DELIVERED');await p.locator('[data-recovery="DISCONNECT"]').click();assert.equal(await p.locator('#delivery').inputValue(),'NOT_CONNECTED');await p.locator('#vex').focus();await p.keyboard.press('Space');assert.equal(await p.locator('#vex').getAttribute('aria-expanded'),'true');assert.equal(await p.locator('#vexText').isVisible(),true);await p.keyboard.press('Space');assert.equal(await p.locator('#vex').getAttribute('aria-expanded'),'false');await p.locator('#closeConnect').focus();await p.keyboard.press('Enter');assert.equal(await p.locator('#connectPanel').isHidden(),true);assert.equal(await p.locator('#connect').getAttribute('aria-expanded'),'false');assert.equal(await p.evaluate(()=>document.activeElement?.id),'connect');await p.locator('#entryToggle').click();assert.match(await p.locator('#entryStatus').textContent(),/Home/);await p.selectOption('#language','ja');await p.waitForFunction(()=>document.documentElement.dataset.localeSettled==='ja'&&document.querySelector('h1')?.textContent==='関係');assert.equal(await p.locator('h1').textContent(),'関係');assert.match(await p.locator('[data-i18n="deliveryBody"]').textContent(),/接続/);const overflow=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert.ok(overflow<=1);const small=await p.locator('button:visible,select:visible').evaluateAll(xs=>xs.filter(x=>{const r=x.getBoundingClientRect();return r.width<44||r.height<44}).length);assert.equal(small,0);assert.equal(consoleErrors.length,0);assert.equal(pageErrors.length,0);assert.equal(popups.length,0);assert.equal(downloads.length,0);for(const x of requests)assert.equal(new URL(x).hostname,'127.0.0.1');await c.close()}}finally{await b.close();await new Promise(r=>s.close(r))}});

const FFR03_PERSISTENCE_BINDING=Object.freeze({
  localParticipantRef:'participant.local.alpha',
  localStateRootRef:'state-root.local.alpha',
  counterpartParticipantRef:'participant.peer.beta',
  counterpartCurrentKeyRef:'key.peer.beta.current',
  invitationRef:'invitation.friend.alpha-beta.001',
  invitationCurrentnessRef:'currentness.invitation.alpha-beta.001',
  instanceRef:'instance.relationships.browser.ffr03'
});
const FFR03_PREPARED_EFFECTS=Object.freeze({
  relationshipMutationPerformed:false,canonicalRelationshipPersisted:false,networkEffectPerformed:false,
  providerEffectPerformed:false,MemoryEffectPerformed:false,HomeLayoutEffectPerformed:false,
  modelRuntimePerformed:false,publicationPerformed:false,publicSearchPerformed:false,
  semanticAcknowledgementCreated:false,reciprocalFriendshipCreated:false
});
const FFR03_SAVED_EFFECTS=Object.freeze({
  relationshipMutationPerformed:true,canonicalRelationshipPersisted:true,networkEffectPerformed:false,
  providerEffectPerformed:false,MemoryEffectPerformed:false,HomeLayoutEffectPerformed:false,
  modelRuntimePerformed:false,publicationPerformed:false,publicSearchPerformed:false,
  semanticAcknowledgementCreated:false,reciprocalFriendshipCreated:false
});
function ffr03Bridge(commitImpl){
  return Object.freeze({
    ownerBinding:Object.freeze({
      localParticipantRef:FFR03_PERSISTENCE_BINDING.localParticipantRef,
      localStateRootRef:FFR03_PERSISTENCE_BINDING.localStateRootRef
    }),
    prepare(input){
      return Object.freeze({
        schemaVersion:'vexlife.browser-relationships-prepared/v1',
        state:'PREPARED_NO_EFFECT',
        relationshipRef:'relationship.local.alpha.peer.beta',
        ...input,
        effects:FFR03_PREPARED_EFFECTS
      });
    },
    commit:commitImpl
  });
}
function ffr03Saved(revision=1){
  return Object.freeze({
    schemaVersion:'vexlife.browser-relationships-persistence/v1',
    state:'SAVED',
    relationshipRef:'relationship.local.alpha.peer.beta',
    receipt:Object.freeze({
      state:'COMMITTED',
      relationshipPersisted:true,
      relationshipRef:'relationship.local.alpha.peer.beta',
      revision
    }),
    current:Object.freeze({
      relationshipRef:'relationship.local.alpha.peer.beta',
      record:Object.freeze({
        revision,
        localParticipantRef:FFR03_PERSISTENCE_BINDING.localParticipantRef,
        localStateRootRef:FFR03_PERSISTENCE_BINDING.localStateRootRef
      })
    }),
    effects:FFR03_SAVED_EFFECTS
  });
}
test('FFR03-VISIBLE-00 no persistence binding cannot become Saved',async()=>{
  const machine=createRelationshipsPersistenceStateMachine();
  assert.equal(machine.snapshot().state,'HELD_BINDING_REQUIRED');
  const result=await machine.save({localRelationshipClass:'FRIEND'});
  assert.equal(result.state,'HELD_BINDING_REQUIRED');
  assert.equal(result.saved,false);
  assert.equal(machine.isSavedFor({localRelationshipClass:'FRIEND'}),false);
});
test('FFR03-VISIBLE-01 Prepared is not Saved and only durable receipt plus current readback earns Saved',async()=>{
  let release;
  const deferred=new Promise((resolve)=>{release=resolve});
  const machine=createRelationshipsPersistenceStateMachine({
    persistenceBridge:ffr03Bridge(()=>deferred),
    persistenceBinding:FFR03_PERSISTENCE_BINDING,
    clock:()=>new Date('2026-08-31T23:00:00.000Z')
  });
  const pending=machine.save({localRelationshipClass:'FRIEND'});
  await Promise.resolve();
  assert.notEqual(machine.snapshot().state,'SAVED');
  assert.equal(machine.isSavedFor({localRelationshipClass:'FRIEND'}),false);
  release(ffr03Saved(1));
  const saved=await pending;
  assert.equal(saved.state,'SAVED');
  assert.equal(saved.saved,true);
  assert.equal(machine.isSavedFor({localRelationshipClass:'FRIEND'}),true);
  assert.equal(machine.isSavedFor({localRelationshipClass:'FAMILY'}),false);
});
test('FFR03-VISIBLE-02 receipt/readback contradiction fails closed and cannot project Saved',async()=>{
  const bad=ffr03Saved(2);
  const contradictory=Object.freeze({...bad,current:Object.freeze({...bad.current,record:Object.freeze({...bad.current.record,revision:1})})});
  const machine=createRelationshipsPersistenceStateMachine({
    persistenceBridge:ffr03Bridge(()=>contradictory),
    persistenceBinding:FFR03_PERSISTENCE_BINDING,
    clock:()=>new Date('2026-08-31T23:00:00.000Z')
  });
  const result=await machine.save({localRelationshipClass:'FRIEND'});
  assert.equal(result.state,'HELD_PERSISTENCE_FAILURE');
  assert.equal(result.saved,false);
  assert.equal(machine.isSavedFor({localRelationshipClass:'FRIEND'}),false);
});
test('FFR03-VISIBLE-03 inferred Home/device/display/model/provider/session identity fields are rejected',()=>{
  for(const [field,value] of [
    ['homeRef','home.alpha'],['deviceRef','device.alpha'],['displayName','Peer Beta'],
    ['modelRef','model.alpha'],['providerRef','provider.alpha']
  ]){
    assert.throws(()=>createRelationshipsPersistenceStateMachine({
      persistenceBridge:ffr03Bridge(()=>ffr03Saved()),
      persistenceBinding:{...FFR03_PERSISTENCE_BINDING,[field]:value}
    }),/rejects inferred or unadmitted field/);
  }
});
test('FFR03-VISIBLE-04 registry and EN JA ZH catalogs preserve receipt/readback Saved truth',()=>{
  const registry=JSON.parse(fs.readFileSync(path.join(ROOT,'blueprint/relationships-browser-registry.json'),'utf8'));
  assert.equal(registry.persistenceAdoption.savedTruth,'DURABLE_RECEIPT_AND_CURRENT_READBACK');
  assert.equal(registry.persistenceAdoption.runtimePlanRequiresSaved,true);
  assert.equal(registry.persistenceAdoption.serverRouteState,'HELD_PENDING_SHARED_PATH_RELEASE');
  assert.equal(registry.relationshipTruth.invitationAcceptanceImpliesPersistence,false);
  assert.equal(registry.relationshipTruth.preparedImpliesPersistence,false);
  assert.equal(registry.relationshipTruth.identityInferenceAllowed,false);
  const keysets=[];
  for(const language of ['en','ja','zh']){
    const catalog=JSON.parse(fs.readFileSync(path.join(ROOT,`blueprint/relationships-browser/strings/${language}.json`),'utf8'));
    for(const key of ['persistenceSave','persistenceSaved','persistenceBindingRequired','persistencePrepared','persistenceFailure']){
      assert.equal(typeof catalog[key],'string',`${language} missing ${key}`);
      assert.ok(catalog[key].length>0,`${language} empty ${key}`);
    }
    keysets.push(Object.keys(catalog).sort());
  }
  assert.deepEqual(keysets[1],keysets[0]);
  assert.deepEqual(keysets[2],keysets[0]);
});

test('FFR03-VISIBLE-05 controller Saved and runtime readiness are persistence-derived, never click-derived',()=>{
  const source=fs.readFileSync(path.join(ROOT,'reference/browser/modules/relationships-controller.js'),'utf8');
  assert.doesNotMatch(source,/interaction\.localFormed/);
  assert.match(source,/form\.onclick = async \(\) =>/);
  assert.match(source,/const pendingPersistence=persistence\.save\(\{localRelationshipClass:interaction\.localClass\}\)/);
  assert.match(source,/localRelationshipFormed: persistence\.isSavedFor\(\{localRelationshipClass:interaction\.localClass\}\)/);
  assert.match(source,/prepare\.disabled = !persistence\.isSavedFor\(\{localRelationshipClass:interaction\.localClass\}\)/);
  assert.match(source,/canAdvance\(\{\.\.\.interaction,localFormed:persistence\.isSavedFor\(\{localRelationshipClass:interaction\.localClass\}\)\}\)/);
  assert.match(source,/rt\('persistenceSaved',\{class:humanOptionLabel\(interaction\.localClass\)\}\)/);
});
