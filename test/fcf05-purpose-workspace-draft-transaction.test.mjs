import assert from 'node:assert/strict';
import test from 'node:test';

import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { loadPurposeWorkspaceRegistry, validatePurposeWorkspaceRegistry } from '../src/core/purpose-workspace.mjs';
import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';

const DRAFT_REF='draft.vexlife.purpose-workspace.local-seed';
const PATCH='operation.vexlife.draft-surface.seed.patch';
const RESET='operation.vexlife.draft-surface.seed.reset';

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

test('FCF-05 canonical action, Purpose Workspace transaction contract and validator are exact',()=>{
  const blueprint=loadBlueprint();
  const action=blueprint.blueprint.actions.find((item)=>item.actionRef==='action.draft-surface.transact');
  assert.deepEqual(action,{
    actionRef:'action.draft-surface.transact',
    permissionRef:'permission.none',
    inputSchema:{
      transactionRef:'ref',
      draftRef:'ref',
      operationRef:'ref',
      expectedRevision:'integer',
      payload:'object'
    },
    effectClass:'LOCAL_DRAFT',
    outputStateRefs:[]
  });
  const feature=blueprint.featureRegistry.features.find((item)=>item.featureRef==='feature.vexlife.scoped-purpose-workspace');
  assert.equal(feature.actionRefs.includes('action.draft-surface.transact'),true);
  const blueprintValidation=validateBlueprint(blueprint);
  assert.equal(blueprintValidation.ok,true,blueprintValidation.errors.join('\n'));

  const bundle=loadPurposeWorkspaceRegistry();
  const validation=validatePurposeWorkspaceRegistry(bundle);
  assert.equal(validation.ok,true,validation.errors.join('\n'));
  const contract=bundle.registry.workspaceDefinitions[0].draftSurfaceContract;
  assert.equal(contract.typedDraftTransactionReceipt,true);
  assert.equal(contract.transactionContract.draftRef,DRAFT_REF);
  assert.deepEqual(contract.transactionContract.editableFields,['featureRef','purpose']);
  assert.deepEqual(contract.transactionContract.readOnlyFields,['platformRefs']);
  assert.deepEqual(contract.transactionContract.operationRefs,[PATCH,RESET]);
  assert.equal(contract.transactionContract.receiptContract.historyLimit,32);

  const missing=structuredClone(bundle);
  delete missing.registry.workspaceDefinitions[0].draftSurfaceContract.transactionContract.expectedRevisionRequired;
  assert.equal(validatePurposeWorkspaceRegistry(missing).ok,false);

  const duplicate=structuredClone(bundle);
  duplicate.registry.workspaceDefinitions[0].draftSurfaceContract.transactionContract.operationRefs=[PATCH,PATCH];
  assert.equal(validatePurposeWorkspaceRegistry(duplicate).ok,false);

  const unknown=structuredClone(bundle);
  unknown.registry.workspaceDefinitions[0].draftSurfaceContract.transactionContract.unownedFutureShape=true;
  assert.equal(validatePurposeWorkspaceRegistry(unknown).ok,false);
});

test('FCF-05 typed local draft transactions enforce revision currentness and bounded receipts',async t=>{
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
  assert.equal(initial.draftRevision,0);
  assert.equal(initial.draftReceipts.length,0);
  assert.deepEqual(initial.draft,{featureRef:'',purpose:'',platformRefs:['platform.browser']});

  const featurePatch=await page.evaluate(({draftRef,operationRef})=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.transactDraft({
    transactionRef:'transaction.test.feature',
    draftRef,
    operationRef,
    expectedRevision:0,
    payload:{featureRef:'feature.vexlife.example-draft'}
  }),{draftRef:DRAFT_REF,operationRef:PATCH});
  assert.equal(featurePatch.disposition,'APPLIED');
  assert.equal(featurePatch.priorRevision,0);
  assert.equal(featurePatch.nextRevision,1);
  assert.deepEqual(featurePatch.changedFieldRefs,['featureRef']);

  const purposePatch=await page.evaluate(({draftRef,operationRef})=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.transactDraft({
    transactionRef:'transaction.test.purpose',
    draftRef,
    operationRef,
    expectedRevision:1,
    payload:{purpose:'Explore one bounded local construction seed'}
  }),{draftRef:DRAFT_REF,operationRef:PATCH});
  assert.equal(purposePatch.disposition,'APPLIED');
  assert.equal(purposePatch.nextRevision,2);
  assert.deepEqual(purposePatch.changedFieldRefs,['purpose']);

  const stale=await page.evaluate(({draftRef,operationRef})=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.transactDraft({
    transactionRef:'transaction.test.stale',
    draftRef,
    operationRef,
    expectedRevision:1,
    payload:{purpose:'must not apply'}
  }),{draftRef:DRAFT_REF,operationRef:PATCH});
  assert.equal(stale.disposition,'STALE_REJECTED');
  assert.equal(stale.priorRevision,2);
  assert.equal(stale.nextRevision,2);

  for(const payload of [{platformRefs:['platform.browser']},{unknownField:'nope'}]){
    const invalid=await page.evaluate(({draftRef,operationRef,payload})=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.transactDraft({
      transactionRef:'transaction.test.invalid.'+Object.keys(payload)[0],
      draftRef,
      operationRef,
      expectedRevision:2,
      payload
    }),{draftRef:DRAFT_REF,operationRef:PATCH,payload});
    assert.equal(invalid.disposition,'INVALID_REJECTED');
    assert.equal(invalid.priorRevision,2);
    assert.equal(invalid.nextRevision,2);
  }

  let snapshot=await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot());
  assert.equal(snapshot.draftRevision,2);
  assert.deepEqual(snapshot.draft,{
    featureRef:'feature.vexlife.example-draft',
    purpose:'Explore one bounded local construction seed',
    platformRefs:['platform.browser']
  });

  const featureInput=draft.locator('[data-draft-field="featureRef"]');
  const beforeHuman=snapshot.draftRevision;
  await featureInput.fill('feature.vexlife.human-input');
  snapshot=await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot());
  assert.equal(snapshot.draftRevision,beforeHuman+1);
  assert.equal(snapshot.draft.featureRef,'feature.vexlife.human-input');
  assert.equal(snapshot.draftReceipts.at(-1).operationRef,PATCH);
  assert.equal(snapshot.draftReceipts.at(-1).disposition,'APPLIED');

  const root=page.locator('.purpose-workspace-evolution');
  const reset=draft.getByRole('button',{name:'Reset draft'});
  await reset.scrollIntoViewIfNeeded();
  await reset.focus();
  const beforeReset=await page.evaluate(()=>({
    scrollTop:document.querySelector('.purpose-workspace-evolution')?.scrollTop??0,
    activeText:document.activeElement?.textContent?.trim()??'',
    snapshot:globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot()
  }));
  assert.ok(beforeReset.scrollTop>0);
  assert.equal(beforeReset.activeText,'Reset draft');
  const priorReceiptRefs=beforeReset.snapshot.draftReceipts.map((item)=>item.receiptRef);
  await reset.press('Enter');
  const afterReset=await page.evaluate(()=>({
    scrollTop:document.querySelector('.purpose-workspace-evolution')?.scrollTop??0,
    activeText:document.activeElement?.textContent?.trim()??'',
    snapshot:globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot()
  }));
  assert.ok(Math.abs(afterReset.scrollTop-beforeReset.scrollTop)<=1);
  assert.equal(afterReset.activeText,'Reset draft');
  assert.equal(afterReset.snapshot.draftRevision,beforeReset.snapshot.draftRevision+1);
  assert.deepEqual(afterReset.snapshot.draft,{featureRef:'',purpose:'',platformRefs:['platform.browser']});
  assert.equal(afterReset.snapshot.draftReceipts.at(-1).operationRef,RESET);
  assert.equal(afterReset.snapshot.draftReceipts.at(-1).disposition,'APPLIED');
  assert.equal(priorReceiptRefs.every((ref)=>afterReset.snapshot.draftReceipts.some((item)=>item.receiptRef===ref)),true);

  const sessionRef=afterReset.snapshot.draftSessionRef;
  const revision=afterReset.snapshot.draftRevision;
  await page.evaluate(({draftRef,operationRef,revision})=>{
    for(let i=0;i<40;i++)globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.transactDraft({
      transactionRef:`transaction.test.bound.${i}`,
      draftRef,
      operationRef,
      expectedRevision:revision,
      payload:{platformRefs:['platform.browser']}
    });
  },{draftRef:DRAFT_REF,operationRef:PATCH,revision});
  snapshot=await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot());
  assert.equal(snapshot.draftRevision,revision);
  assert.equal(snapshot.draftReceipts.length,32);
  assert.equal(snapshot.draftReceipts.every((item)=>item.disposition==='INVALID_REJECTED'),true);
  const boundedReceiptRefs=snapshot.draftReceipts.map((item)=>item.receiptRef);

  await page.locator('#evolutionActiveSurfaceClose').click();
  await page.locator('#surfaceMenuButton').click();
  await page.locator('#openPurposeWorkspace').click();
  draft=page.locator('.purpose-workspace-evolution__draft-surface');
  await draft.waitFor();
  const reopened=await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot());
  assert.equal(reopened.draftSessionRef,sessionRef);
  assert.equal(reopened.draftRevision,revision);
  assert.deepEqual(reopened.draftReceipts.map((item)=>item.receiptRef),boundedReceiptRefs);

  await page.reload({waitUntil:'networkidle'});
  draft=await openDraft(page,url);
  const reloaded=await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot());
  assert.notEqual(reloaded.draftSessionRef,sessionRef);
  assert.equal(reloaded.draftRevision,0);
  assert.equal(reloaded.draftReceipts.length,0);
  assert.deepEqual(reloaded.draft,{featureRef:'',purpose:'',platformRefs:['platform.browser']});

  await page.setViewportSize({width:390,height:844});
  const compactFeature=draft.locator('[data-draft-field="featureRef"]');
  await compactFeature.fill('feature.vexlife.compact');
  const compactReset=draft.getByRole('button',{name:'Reset draft'});
  await compactReset.scrollIntoViewIfNeeded();
  await compactReset.focus();
  await compactReset.press('Enter');
  const compact=await page.evaluate(()=>({
    horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-window.innerWidth),
    snapshot:globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot()
  }));
  assert.equal(compact.horizontalOverflow,0);
  assert.deepEqual(compact.snapshot.draft,{featureRef:'',purpose:'',platformRefs:['platform.browser']});
  assert.equal(await draft.getByRole('button',{name:/save|deploy|publish/i}).count(),0);
  assert.deepEqual(errors,{console:[],page:[]});
});
