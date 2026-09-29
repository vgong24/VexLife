import assert from 'node:assert/strict';
import test from 'node:test';

import { createVexLifeBrowserServer } from '../scripts/serve-browser.mjs';

async function listen(server){
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const address=server.address();
  return `http://127.0.0.1:${address.port}`;
}

test('FCF-04 Purpose Workspace draft surface is local-session-only and never becomes Save Deploy or Publish',async t=>{
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
  await page.goto(url+'/reference/browser/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(globalThis.__VEXLIFE_APP__?.purposeWorkspaceEvolution));
  await page.locator('#surfaceMenuButton').click();
  await page.locator('#uxProjectionSelect').selectOption('EVOLUTION_PROJECTION');
  await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.state.uxProjection==='EVOLUTION_PROJECTION');
  await page.locator('#openPurposeWorkspace').click();
  const draft=page.locator('.purpose-workspace-evolution__draft-surface');
  await draft.waitFor();
  assert.equal(await draft.getAttribute('data-component-ref'),'component.vexlife.draft-surface');
  assert.equal(await draft.getAttribute('data-effect-class'),'LOCAL_DRAFT');
  assert.equal(await draft.getAttribute('data-authority-class'),'authority.draft');
  assert.equal(await draft.getAttribute('data-persistence'),'EPHEMERAL_BROWSER_SESSION');
  assert.equal(await draft.getAttribute('data-canonical-registry-mutation'),'false');
  assert.equal(await draft.getByText('Local draft only · not saved, deployed, or published.',{exact:true}).count(),1);
  assert.equal(await draft.getByRole('button',{name:/save|deploy|publish/i}).count(),0);

  const featureInput=draft.locator('[data-draft-field="featureRef"]');
  const purposeInput=draft.locator('[data-draft-field="purpose"]');
  const platformInput=draft.locator('[data-draft-field="platformRefs"]');
  assert.equal(await platformInput.inputValue(),'platform.browser');
  await featureInput.fill('feature.vexlife.example-draft');
  await purposeInput.fill('Explore one bounded local construction seed');
  let snapshot=await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot());
  assert.deepEqual(snapshot.draft,{
    featureRef:'feature.vexlife.example-draft',
    purpose:'Explore one bounded local construction seed',
    platformRefs:['platform.browser']
  });
  assert.equal(snapshot.draftEffectClass,'LOCAL_DRAFT');
  assert.equal(snapshot.draftAuthorityClass,'authority.draft');
  assert.equal(snapshot.draftPersistence,'EPHEMERAL_BROWSER_SESSION');
  assert.equal(snapshot.draftCanonicalRegistryMutation,false);
  assert.equal(snapshot.draftSave,false);
  assert.equal(snapshot.draftDeploy,false);
  assert.equal(snapshot.draftPublish,false);

  await page.locator('#evolutionActiveSurfaceClose').click();
  await page.locator('#surfaceMenuButton').click();
  await page.locator('#openPurposeWorkspace').click();
  await draft.waitFor();
  assert.equal(await featureInput.inputValue(),'feature.vexlife.example-draft');
  assert.equal(await purposeInput.inputValue(),'Explore one bounded local construction seed');

  await draft.getByRole('button',{name:'Reset draft'}).click();
  assert.equal(await featureInput.inputValue(),'');
  assert.equal(await purposeInput.inputValue(),'');
  assert.equal(await platformInput.inputValue(),'platform.browser');
  snapshot=await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot());
  assert.deepEqual(snapshot.draft,{featureRef:'',purpose:'',platformRefs:['platform.browser']});
  assert.deepEqual(errors,{console:[],page:[]});
});
