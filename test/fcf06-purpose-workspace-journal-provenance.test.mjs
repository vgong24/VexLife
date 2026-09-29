import assert from 'node:assert/strict';
import test from 'node:test';

import { loadBlueprint } from '../src/core/blueprint.mjs';
import { loadPurposeWorkspaceRegistry, validatePurposeWorkspaceRegistry } from '../src/core/purpose-workspace.mjs';
import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';

const DRAFT_REF='draft.vexlife.purpose-workspace.local-seed';
const PATCH='operation.vexlife.draft-surface.seed.patch';
const RESET='operation.vexlife.draft-surface.seed.reset';
const PROVENANCE='operation.vexlife.draft-surface.provenance.journal.set';

async function listen(server){
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const address=server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function openDraft(page,url){
  await page.goto(url+'/reference/browser/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(globalThis.__VEXLIFE_APP__?.purposeWorkspaceEvolution));
  await page.locator('#surfaceMenuButton').click();
  await page.locator('#uxProjectionSelect').selectOption('EVOLUTION_PROJECTION');
  await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.state.uxProjection==='EVOLUTION_PROJECTION');
  await page.locator('#openPurposeWorkspace').click();
  const draft=page.locator('.purpose-workspace-evolution__draft-surface');
  await draft.waitFor();
  return draft;
}

test('FCF-06 source contract is reference-only and reuses the FCF-05 action/currentness membrane',()=>{
  const blueprint=loadBlueprint();
  assert.equal(blueprint.blueprint.actions.filter((item)=>item.actionRef==='action.draft-surface.transact').length,1);
  assert.equal(blueprint.blueprint.actions.some((item)=>item.actionRef===PROVENANCE),false);

  const bundle=loadPurposeWorkspaceRegistry();
  const validation=validatePurposeWorkspaceRegistry(bundle);
  assert.equal(validation.ok,true,validation.errors.join('\n'));
  const draft=bundle.registry.workspaceDefinitions[0].draftSurfaceContract;
  assert.deepEqual(draft.transactionContract.operationRefs,[PATCH,RESET]);
  assert.equal(draft.transactionContract.actionRef,'action.draft-surface.transact');
  assert.equal(draft.transactionContract.permissionRef,'permission.none');
  assert.equal(draft.transactionContract.authorityClassRef,'authority.draft');
  assert.equal(draft.transactionContract.effectClass,'LOCAL_DRAFT');

  const provenance=draft.journalProvenanceContract;
  assert.equal(provenance.provenanceClass,'DESIGN_CONSTRUCTION_SESSION');
  assert.equal(provenance.sessionIdentityField,'draftSessionRef');
  assert.equal(provenance.operationRef,PROVENANCE);
  assert.deepEqual(provenance.relationStates,['UNLINKED','LINKED_REFERENCE_ONLY']);
  assert.deepEqual(provenance.journalTargetVariants,{
    MEMORY_STATEMENT:['targetClass','pageRef','statementRef','sourceRefs'],
    ARCHIVE_STATEMENT:['targetClass','pageRef','statementRef','dayRef','dailyStratumRef','sourceRefs'],
    SYNTHETIC_EVENT:['targetClass','pageRef','eventRef','sourceRef']
  });
  for(const key of ['currentWorkStateAuthority','JournalAuthority','MemoryAuthority','canonicalFeatureAuthority','journalMutation','memoryMutation','workgraphMutation','sourceCopy','canonicalFeatureMutation'])assert.equal(provenance[key],false,key);
  assert.equal(provenance.persistence,'EPHEMERAL_BROWSER_SESSION');
  assert.equal(provenance.resetPreservesRelation,true);
  assert.equal(provenance.closeReopenPreservesRelation,true);
  assert.equal(provenance.reloadPersistenceClaim,false);

  const malformed=structuredClone(bundle);
  malformed.registry.workspaceDefinitions[0].draftSurfaceContract.journalProvenanceContract.unownedFutureShape=true;
  assert.equal(validatePurposeWorkspaceRegistry(malformed).ok,false);
});

test('FCF-06 typed Journal provenance is revision-guarded, session-local, reset-stable and human-visible only when linked',async t=>{
  const server=createVexLifeBrowserServer();
  t.after(()=>new Promise((resolve)=>server.close(resolve)));
  const url=await listen(server);
  const {chromium}=await import('playwright');
  const browser=await chromium.launch({headless:true});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors={console:[],page:[]};
  page.on('console',(message)=>{if(message.type()==='error')errors.console.push(message.text());});
  page.on('pageerror',(error)=>errors.page.push(error.message));

  let draft=await openDraft(page,url);
  const initial=await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot());
  assert.equal(initial.draftRef,DRAFT_REF);
  assert.equal(initial.provenance.provenanceClass,'DESIGN_CONSTRUCTION_SESSION');
  assert.equal(initial.provenance.draftSessionRef,initial.draftSessionRef);
  assert.equal(initial.provenance.draftRef,DRAFT_REF);
  assert.equal(initial.provenance.draftRevision,0);
  assert.equal(initial.provenance.journalRelationState,'UNLINKED');
  assert.equal(initial.provenance.journalTargetOrNull,null);
  assert.deepEqual(initial.provenance.transactionReceiptRefs,[]);
  for(const key of ['currentWorkStateAuthority','JournalAuthority','MemoryAuthority','canonicalFeatureAuthority'])assert.equal(initial.provenance[key],false,key);
  const related=draft.locator('.purpose-workspace-evolution__related-journal');
  assert.equal(await related.isHidden(),true);

  const memoryTarget={targetClass:'MEMORY_STATEMENT',pageRef:'page.journal.memory.001',statementRef:'statement.memory.001',sourceRefs:['source.memory.001','source.memory.002']};
  const memory=await page.evaluate(({draftRef,target})=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.transactDraft({
    transactionRef:'transaction.fcf06.memory',
    draftRef,
    operationRef:'operation.vexlife.draft-surface.provenance.journal.set',
    expectedRevision:0,
    payload:{journalTarget:target}
  }),{draftRef:DRAFT_REF,target:memoryTarget});
  assert.equal(memory.disposition,'APPLIED');
  assert.equal(memory.priorRevision,0);
  assert.equal(memory.nextRevision,1);
  assert.deepEqual(memory.changedFieldRefs,['journalRelation']);

  const archiveTarget={targetClass:'ARCHIVE_STATEMENT',pageRef:'page.journal.archive.001',statementRef:'statement.archive.001',dayRef:'day.2026-09-28',dailyStratumRef:'daily-stratum.2026-09-28.001',sourceRefs:['source.archive.001']};
  const archive=await page.evaluate(({draftRef,target})=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.transactDraft({
    transactionRef:'transaction.fcf06.archive',
    draftRef,
    operationRef:'operation.vexlife.draft-surface.provenance.journal.set',
    expectedRevision:1,
    payload:{journalTarget:target}
  }),{draftRef:DRAFT_REF,target:archiveTarget});
  assert.equal(archive.disposition,'APPLIED');
  assert.equal(archive.nextRevision,2);

  const syntheticTarget={targetClass:'SYNTHETIC_EVENT',pageRef:'page.journal.synthetic.001',eventRef:'event.synthetic.001',sourceRef:'source.synthetic.001'};
  const synthetic=await page.evaluate(({draftRef,target})=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.transactDraft({
    transactionRef:'transaction.fcf06.synthetic',
    draftRef,
    operationRef:'operation.vexlife.draft-surface.provenance.journal.set',
    expectedRevision:2,
    payload:{journalTarget:target}
  }),{draftRef:DRAFT_REF,target:syntheticTarget});
  assert.equal(synthetic.disposition,'APPLIED');
  assert.equal(synthetic.nextRevision,3);

  let snapshot=await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot());
  assert.equal(snapshot.draftRevision,3);
  assert.equal(snapshot.provenance.draftRevision,3);
  assert.equal(snapshot.provenance.journalRelationState,'LINKED_REFERENCE_ONLY');
  assert.deepEqual(snapshot.provenance.journalTargetOrNull,syntheticTarget);
  assert.equal(snapshot.draftReceipts.at(-1).operationRef,PROVENANCE);
  assert.equal(snapshot.draftReceipts.at(-1).permissionRef,'permission.none');
  assert.equal(snapshot.draftReceipts.at(-1).authorityClassRef,'authority.draft');
  assert.equal(snapshot.draftReceipts.at(-1).effectClass,'LOCAL_DRAFT');
  assert.equal(snapshot.draftReceipts.at(-1).canonicalRegistryMutation,false);
  assert.equal(snapshot.draftReceipts.at(-1).externalEffect,false);
  assert.equal(snapshot.draftReceipts.at(-1).save,false);
  assert.equal(snapshot.draftReceipts.at(-1).deploy,false);
  assert.equal(snapshot.draftReceipts.at(-1).publish,false);
  assert.equal(await related.isVisible(),true);
  assert.equal(await related.getAttribute('data-relation-state'),'LINKED_REFERENCE_ONLY');
  const relatedText=await related.textContent();
  for(const token of ['Related Journal','REFERENCE ONLY','SYNTHETIC_EVENT','page.journal.synthetic.001','event.synthetic.001','source.synthetic.001'])assert.match(relatedText,new RegExp(token.replaceAll('.','\\.')));

  const invalidTargets=[
    {targetClass:'MEMORY_STATEMENT',pageRef:'page.journal.memory.001',statementRef:'statement.memory.001',eventRef:'event.cross-class',sourceRefs:['source.memory.001']},
    {targetClass:'UNKNOWN_TARGET',pageRef:'page.journal.unknown',sourceRef:'source.unknown'},
    {targetClass:'ARCHIVE_STATEMENT',pageRef:'page.journal.archive.001',statementRef:'statement.archive.001',dayRef:'day.2026-09-28',dailyStratumRef:'daily-stratum.2026-09-28.001',sourceRefs:['source.archive.001','source.archive.001']}
  ];
  for(const [index,target] of invalidTargets.entries()){
    const invalid=await page.evaluate(({draftRef,target,index})=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.transactDraft({
      transactionRef:'transaction.fcf06.invalid.'+index,
      draftRef,
      operationRef:'operation.vexlife.draft-surface.provenance.journal.set',
      expectedRevision:3,
      payload:{journalTarget:target}
    }),{draftRef:DRAFT_REF,target,index});
    assert.equal(invalid.disposition,'INVALID_REJECTED');
    assert.equal(invalid.priorRevision,3);
    assert.equal(invalid.nextRevision,3);
  }
  const stale=await page.evaluate((draftRef)=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.transactDraft({
    transactionRef:'transaction.fcf06.stale',
    draftRef,
    operationRef:'operation.vexlife.draft-surface.provenance.journal.set',
    expectedRevision:2,
    payload:{journalTarget:null}
  }),DRAFT_REF);
  assert.equal(stale.disposition,'STALE_REJECTED');
  assert.equal(stale.priorRevision,3);
  assert.equal(stale.nextRevision,3);
  snapshot=await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot());
  assert.equal(snapshot.draftRevision,3);
  assert.deepEqual(snapshot.provenance.journalTargetOrNull,syntheticTarget);

  const featurePatch=await page.evaluate((draftRef)=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.transactDraft({
    transactionRef:'transaction.fcf06.seed',
    draftRef,
    operationRef:'operation.vexlife.draft-surface.seed.patch',
    expectedRevision:3,
    payload:{featureRef:'feature.vexlife.fcf06-draft'}
  }),DRAFT_REF);
  assert.equal(featurePatch.disposition,'APPLIED');
  assert.equal(featurePatch.nextRevision,4);
  const beforeReset=await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot());
  const priorReceiptRefs=beforeReset.draftReceipts.map((item)=>item.receiptRef);
  const reset=await page.evaluate((draftRef)=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.transactDraft({
    transactionRef:'transaction.fcf06.reset',
    draftRef,
    operationRef:'operation.vexlife.draft-surface.seed.reset',
    expectedRevision:4,
    payload:{}
  }),DRAFT_REF);
  assert.equal(reset.disposition,'APPLIED');
  assert.equal(reset.nextRevision,5);
  const afterReset=await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot());
  assert.deepEqual(afterReset.draft,{featureRef:'',purpose:'',platformRefs:['platform.browser']});
  assert.equal(afterReset.provenance.journalRelationState,'LINKED_REFERENCE_ONLY');
  assert.deepEqual(afterReset.provenance.journalTargetOrNull,syntheticTarget);
  assert.equal(priorReceiptRefs.every((ref)=>afterReset.draftReceipts.some((item)=>item.receiptRef===ref)),true);

  const sessionRef=afterReset.draftSessionRef;
  const revision=afterReset.draftRevision;
  const relation=afterReset.provenance.journalTargetOrNull;
  await page.locator('#evolutionActiveSurfaceClose').click();
  await page.locator('#surfaceMenuButton').click();
  await page.locator('#openPurposeWorkspace').click();
  draft=page.locator('.purpose-workspace-evolution__draft-surface');
  await draft.waitFor();
  const reopened=await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot());
  assert.equal(reopened.draftSessionRef,sessionRef);
  assert.equal(reopened.draftRevision,revision);
  assert.equal(reopened.provenance.journalRelationState,'LINKED_REFERENCE_ONLY');
  assert.deepEqual(reopened.provenance.journalTargetOrNull,relation);

  await page.setViewportSize({width:390,height:844});
  const compact=await page.evaluate(()=>({
    horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-window.innerWidth),
    relationState:globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot().provenance.journalRelationState
  }));
  assert.equal(compact.horizontalOverflow,0);
  assert.equal(compact.relationState,'LINKED_REFERENCE_ONLY');
  assert.equal(await draft.locator('.purpose-workspace-evolution__related-journal').isVisible(),true);
  assert.equal(await draft.getByRole('button',{name:/save|deploy|publish/i}).count(),0);

  await page.reload({waitUntil:'networkidle'});
  draft=await openDraft(page,url);
  const reloaded=await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot());
  assert.notEqual(reloaded.draftSessionRef,sessionRef);
  assert.equal(reloaded.draftRevision,0);
  assert.equal(reloaded.draftReceipts.length,0);
  assert.equal(reloaded.provenance.journalRelationState,'UNLINKED');
  assert.equal(reloaded.provenance.journalTargetOrNull,null);
  assert.equal(await draft.locator('.purpose-workspace-evolution__related-journal').isHidden(),true);
  assert.deepEqual(errors,{console:[],page:[]});
});

// [VXG RealForever]
