import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const contract=JSON.parse(fs.readFileSync(new URL('../blueprint/ux-evolution-shell-scaffold.json',import.meta.url),'utf8'));
const registry=JSON.parse(fs.readFileSync(new URL('../blueprint/ux-evolution-registry.json',import.meta.url),'utf8'));
const html=fs.readFileSync(new URL('../reference/browser/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../reference/browser/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../reference/browser/app.css',import.meta.url),'utf8');

test('post-acceptance shell scaffold preserves Reference default and one-owner laws',()=>{
  assert.equal(contract.schemaVersion,'vexlife.ux-evolution-shell-scaffold/v1');
  assert.equal(contract.projectionSelector.defaultProjection,'REFERENCE_PROJECTION');
  assert.deepEqual(contract.projectionSelector.values,['REFERENCE_PROJECTION','EVOLUTION_PROJECTION']);
  assert.equal(contract.projectionSelector.localDevOnly,true);
  assert.equal(contract.invariants.referenceDefault,true);
  assert.equal(contract.invariants.oneSemanticState,true);
  assert.equal(contract.invariants.oneActiveRenderer,true);
  assert.equal(contract.invariants.permanentV1V2Fork,false);
  assert.equal(contract.invariants.duplicateSemanticOwners,false);
  assert.equal(contract.invariants.cutoverAuthority,false);
  assert.equal(contract.invariants.referenceRetirementAuthority,false);
});

test('Current surface owns one shared inventory for Reference and Evolution migration state',()=>{
  assert.deepEqual(contract.surfaceInventory.map(x=>x.surfaceRef),[
    'surface.vexlife.conversation','surface.vexlife.health','surface.vexlife.living-journal','surface.vexlife.workspace'
  ]);
  for(const surface of contract.surfaceInventory){
    assert.match(html,new RegExp(`id="${surface.controlId}"[^>]*data-ux-surface-ref="${surface.surfaceRef}"`));
    const record=registry.migrationRecords.find(x=>x.semanticRef===surface.semanticRef);
    assert.ok(record,`missing migration record for ${surface.semanticRef}`);
  }
  assert.match(html,/id="uxProjectionSelect"/);
  assert.match(html,/value="REFERENCE_PROJECTION"/);
  assert.match(html,/value="EVOLUTION_PROJECTION"/);
});

test('shell owns one reusable active-surface frame and semantic close remains delegated',()=>{
  assert.match(html,/id="evolutionActiveSurfaceHost"/);
  assert.match(html,/id="evolutionActiveSurfaceTitle"/);
  assert.match(html,/id="evolutionActiveSurfaceBody"/);
  assert.match(html,/id="evolutionActiveSurfaceClose"/);
  assert.equal(contract.activeSurfaceHost.shellOwnsSurfaceTitle,true);
  assert.equal(contract.activeSurfaceHost.shellOwnsCloseControl,true);
  assert.equal(contract.activeSurfaceHost.semanticCloseOwnerPolicy,'REGISTERED_ADAPTER_REQUEST_CLOSE');
  assert.equal(contract.activeSurfaceHost.ordinaryContentScrollSemanticExit,false);
  assert.match(app,/registerEvolutionSurfaceAdapter/);
  assert.match(app,/adapter\.requestClose/);
  assert.match(css,/data-evolution-surface-active="true"/);
});

test('shell scaffold preserves accessibility margin for existing adaptation controls',()=>{
  assert.match(css,/\.e28-adaptation-why>summary\{[^}]*min-height:48px/);
  assert.match(css,/#terrainAdaptationUndo\{min-height:48px\}\.e28-adaptation-preference\{min-height:48px\}/);
});

test('current main truthfully holds all Evolution menu surfaces until adapters/migrations are current',()=>{
  for(const surface of contract.surfaceInventory){
    const record=registry.migrationRecords.find(x=>x.semanticRef===surface.semanticRef);
    assert.equal(record.evolutionProjectionRefs.length,0);
  }
  assert.match(app,/HELD_NOT_MIGRATED/);
  assert.match(app,/button\.disabled=state\.uxProjection===UX_EVOLUTION_PROJECTION&&surfaceState\.state!=='ENABLED'/);
});

test('real loopback canonical shell exposes local Evolution selector without changing Reference default',async t=>{
  const child=spawn(process.execPath,['scripts/serve-browser.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,VEXLIFE_PORT:'0'},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill());
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  const url=await Promise.race([
    new Promise((resolve,reject)=>{let err='';child.stderr.on('data',c=>err+=c);child.stdout.on('data',c=>{const m=c.match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0])});child.once('exit',code=>reject(new Error(`browser server exited ${code}: ${err}`)));child.once('error',reject)}),
    delay(5000,undefined,{ref:false}).then(()=>{throw new Error('browser server did not become ready')})
  ]);
  const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(url+'/reference/browser/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(globalThis.__VEXLIFE_APP__?.uxProjectionShell));
  assert.equal(await page.locator('#uxProjectionSelect').inputValue(),'REFERENCE_PROJECTION');
  assert.equal(await page.evaluate(()=>globalThis.__VEXLIFE_APP__.uxProjectionShell.snapshot().referenceDefault),true);
  await page.locator('#surfaceMenuButton').click();
  await page.locator('#openConversation').click();
  await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.state.contextProjection==='chat');
  assert.equal(await page.locator('#view-chat').isHidden(),false);
  assert.equal(await page.locator('#contextSurface').isHidden(),false);
  await page.locator('#surfaceMenuButton').click();
  await page.locator('#uxProjectionSelect').selectOption('EVOLUTION_PROJECTION');
  await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.state.uxProjection==='EVOLUTION_PROJECTION');
  assert.equal(await page.locator('#contextSurface').isHidden(),true,'Reference context renderer must be hidden in Evolution mode');
  for(const id of ['openConversation','openHealth','openLivingJournal','openWorkspace']){
    assert.equal(await page.locator('#'+id).isDisabled(),true,`${id} must be held in Evolution until migrated`);
  }
  assert.match(await page.locator('#uxProjectionStatus').textContent(),/Evolution/);
  await page.locator('#uxProjectionSelect').selectOption('REFERENCE_PROJECTION');
  await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.state.uxProjection==='REFERENCE_PROJECTION');
  assert.equal(await page.locator('#contextSurface').isHidden(),false,'Reference context renderer must restore without changing semantic state');
  assert.equal(await page.locator('#view-chat').isHidden(),false);
});
 
// [VXG RealForever]
// #703 shared presentation contract and browser mechanics — [VXG RealForever]
const sharedPresentation=fs.readFileSync(new URL('../reference/browser/shared-presentation.mjs',import.meta.url),'utf8');

test('shared shell presentation contract binds accepted Experience primitives without taking product semantics',()=>{
  assert.equal(contract.presentationContract.repairOwnerRef,'github.issue.vexlife.703');
  assert.equal(contract.presentationContract.experienceClassificationRef,'github.issue.vexlife.704.comment.5827351944');
  assert.deepEqual(contract.presentationContract.experienceBinding.patternRefs,[
    'pattern.vexlife.action-decision',
    'pattern.vexlife.progressive-disclosure',
    'pattern.vexlife.preference'
  ]);
  assert.equal(contract.presentationContract.experienceBinding.componentRef,'component.vexlife.action-vessel');
  assert.equal(contract.presentationContract.activeSurfaceHeader.presentationMode,'COMPACT_ONE_ROW');
  assert.equal(contract.presentationContract.activeSurfaceHeader.minimumActionTargetPx,48);
  assert.equal(contract.presentationContract.availableSpace.doubleViewportAssumptionForbidden,true);
  assert.equal(contract.presentationContract.forwardPanel.productSemanticAuthority,false);
  assert.equal(contract.presentationContract.forwardPanel.semanticNavigationOnDismiss,false);
  assert.equal(contract.presentationContract.categorizedContent.productSemanticAuthority,false);
});

test('shared browser presentation module owns mechanics only and exposes the reusable seam',()=>{
  assert.match(sharedPresentation,/export function bindAvailableSpace/);
  assert.match(sharedPresentation,/export function createForwardPanel/);
  assert.match(sharedPresentation,/export function renderCategorizedRows/);
  assert.match(sharedPresentation,/vexlife:available-space/);
  assert.match(sharedPresentation,/dialog\.showModal\(\)/);
  assert.match(sharedPresentation,/close\('ESCAPE'\)/);
  assert.match(sharedPresentation,/close\('BACK'\)/);
  assert.doesNotMatch(sharedPresentation,/history\.(?:back|go|pushState|replaceState)/);
  assert.doesNotMatch(sharedPresentation,/location\.(?:assign|replace|href\s*=)/);
  assert.doesNotMatch(sharedPresentation,/Memory|Journey|Conversation state|Vex identity/i);
});

test('shared shell CSS keeps compact chrome, readable shell actions and reduced-motion equivalent',()=>{
  assert.match(css,/--uxe-active-surface-header-block-size:56px/);
  assert.match(css,/\.uxe-active-surface-heading\{[^}]*grid-template-columns:minmax\(0,1fr\) auto/s);
  assert.match(css,/\.uxe-active-surface-actions button\{[^}]*min-width:48px;[^}]*min-height:48px/s);
  assert.match(css,/\.uxe-active-surface-actions button\{[^}]*background:var\(--raised\);[^}]*color:var\(--text\)/s);
  assert.match(css,/\.uxe-forward-panel\{/);
  assert.match(css,/data-uxe-presentation="SHEET"/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/\.uxe-setting-row\{/);
});

test('real Chromium proves shared shell mechanics at desktop and compact',async t=>{
  const child=spawn(process.execPath,['scripts/serve-browser.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,VEXLIFE_PORT:'0'},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill());
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  const url=await Promise.race([
    new Promise((resolve,reject)=>{let err='';child.stderr.on('data',c=>err+=c);child.stdout.on('data',c=>{const m=c.match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0])});child.once('exit',code=>reject(new Error(`browser server exited ${code}: ${err}`)));child.once('error',reject)}),
    delay(5000,undefined,{ref:false}).then(()=>{throw new Error('browser server did not become ready')})
  ]);
  const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});t.after(()=>browser.close());

  for(const specimen of [
    {name:'desktop',viewport:{width:1440,height:900},expectedPresentation:'FLOATING_PANEL'},
    {name:'compact',viewport:{width:390,height:844},expectedPresentation:'SHEET'}
  ]){
    const page=await browser.newPage({viewport:specimen.viewport});
    t.after(()=>page.close());
    await page.goto(url+'/reference/browser/',{waitUntil:'networkidle'});
    const result=await page.evaluate(async expectedPresentation=>{
      const mod=await import('/reference/browser/shared-presentation.mjs');
      const host=document.querySelector('#evolutionActiveSurfaceHost');
      const body=document.querySelector('#evolutionActiveSurfaceBody');
      const reference=document.querySelector('#evolutionReferenceFallback');
      const close=document.querySelector('#evolutionActiveSurfaceClose');
      host.hidden=false;host.setAttribute('aria-hidden','false');
      const available=mod.bindAvailableSpace(host,{body}).snapshot();
      const trigger=document.createElement('button');trigger.type='button';trigger.textContent='Options';document.body.append(trigger);trigger.focus();
      const panel=mod.createForwardPanel({document,panelRef:'panel.test.shared-shell',title:'Options',dragHandle:true});
      const select=document.createElement('select');select.dataset.uxeAutofocus='true';select.innerHTML='<option>Original</option>';
      mod.renderCategorizedRows(panel.body,[{label:'Reading',rows:[{label:'Language',currentValue:'Original',control:select,explanation:'Presentation only.',availability:'AVAILABLE'}]}]);
      const href=location.href,historyLength=history.length;
      panel.open({trigger});
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const focusEntry=document.activeElement===select;
      const panelRect=panel.element.getBoundingClientRect();
      const headerRect=host.querySelector('.uxe-active-surface-heading').getBoundingClientRect();
      const referenceRect=reference.getBoundingClientRect();
      const closeRect=close.getBoundingClientRect();
      globalThis.__UXE_TEST_PANEL__=panel;
      return {expectedPresentation,presentation:panel.snapshot().presentation,focusEntry,panelWithinViewport:panelRect.left>=-1&&panelRect.top>=-1&&panelRect.right<=innerWidth+1&&panelRect.bottom<=innerHeight+1,headerHeight:headerRect.height,referenceTarget:[referenceRect.width,referenceRect.height],closeTarget:[closeRect.width,closeRect.height],available,href,historyLength};
    },specimen.expectedPresentation);
    assert.equal(result.presentation,result.expectedPresentation,`${specimen.name} presentation`);
    assert.equal(result.focusEntry,true,`${specimen.name} focus entry`);
    assert.equal(result.panelWithinViewport,true,`${specimen.name} viewport confinement`);
    assert.ok(result.headerHeight<=64,`${specimen.name} compact header`);
    assert.ok(result.referenceTarget[0]>=48&&result.referenceTarget[1]>=48,`${specimen.name} Reference target`);
    assert.ok(result.closeTarget[0]>=48&&result.closeTarget[1]>=48,`${specimen.name} Close target`);
    assert.ok(result.available.inlineSize>0&&result.available.blockSize>0,`${specimen.name} available-space publication`);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>!globalThis.__UXE_TEST_PANEL__.element.open),true,`${specimen.name} Escape dismiss`);
    assert.equal(await page.evaluate(()=>document.activeElement?.textContent==='Options'),true,`${specimen.name} focus return`);
    await page.evaluate(()=>globalThis.__UXE_TEST_PANEL__.open({trigger:[...document.querySelectorAll('button')].find(x=>x.textContent==='Options')}));
    assert.equal(await page.evaluate(()=>globalThis.__UXE_TEST_PANEL__.back()),true,`${specimen.name} Back dismiss`);
    assert.deepEqual(await page.evaluate(()=>[location.href,history.length]),[result.href,result.historyLength],`${specimen.name} dismiss must not navigate`);
  }

  const reduced=await browser.newPage({viewport:{width:390,height:844}});t.after(()=>reduced.close());
  await reduced.emulateMedia({reducedMotion:'reduce'});
  await reduced.goto(url+'/reference/browser/',{waitUntil:'networkidle'});
  const reducedTransition=await reduced.evaluate(async()=>{const mod=await import('/reference/browser/shared-presentation.mjs');const panel=mod.createForwardPanel({document,panelRef:'panel.test.reduced'});panel.open();return getComputedStyle(panel.element).transitionDuration});
  assert.equal(reducedTransition,'0s');
});
