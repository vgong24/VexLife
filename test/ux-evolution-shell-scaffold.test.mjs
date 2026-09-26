import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {bindAvailableSpaceContract,constrainTransientRect,resolveTransientPresentationMode} from '../reference/browser/modules/transient-presentation-controller.js';

const contract=JSON.parse(fs.readFileSync(new URL('../blueprint/ux-evolution-shell-scaffold.json',import.meta.url),'utf8'));
const registry=JSON.parse(fs.readFileSync(new URL('../blueprint/ux-evolution-registry.json',import.meta.url),'utf8'));
const html=fs.readFileSync(new URL('../reference/browser/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../reference/browser/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../reference/browser/app.css',import.meta.url),'utf8');

const repositoryRoot=fileURLToPath(new URL('..',import.meta.url));
const uxe703ForeignJournal=Object.freeze({
  repository:'https://github.com/vgong24/VexLife.git',
  branch:'VXG-092426-lj-reader-dco-clean',
  finalizationParentHead:'e17756dfe7c61028b592b1da738b5e143183b433',
  finalizationPaths:Object.freeze([
    'source-manifest-parts/bucket-39.json',
    'test/ux-evolution-shell-scaffold.test.mjs'
  ]),
  appJsBlob:'7ef5540dd6b6b072ee03cbcd2d69a477859abd8e'
});
const uxe703OwnedProductPaths=Object.freeze([
  'blueprint/ux-evolution-shell-scaffold.json',
  'reference/browser/app.css',
  'reference/browser/modules/transient-presentation-controller.js'
]);
function git(cwd,args){return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()}
function overlayExact703ProductBytes(targetRoot){
  for(const relative of uxe703OwnedProductPaths){
    const source=path.join(repositoryRoot,relative),target=path.join(targetRoot,relative);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.copyFileSync(source,target);
    assert.equal(fs.readFileSync(target).equals(fs.readFileSync(source)),true,`#703 composition byte drift: ${relative}`);
  }
}

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

test('shell derives Evolution menu availability from each registered migration instead of assuming every surface is held',()=>{
  for(const surface of contract.surfaceInventory){
    const record=registry.migrationRecords.find(x=>x.semanticRef===surface.semanticRef);
    assert.ok(record,`missing migration record for ${surface.semanticRef}`);
    assert.ok(Array.isArray(record.evolutionProjectionRefs));
    assert.ok(record.evolutionProjectionRefs.every((ref)=>typeof ref==='string'&&ref.length>0));
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
  for(const surface of contract.surfaceInventory){
    const record=registry.migrationRecords.find(x=>x.semanticRef===surface.semanticRef);
    const expectedDisabled=record.evolutionProjectionRefs.length===0;
    assert.equal(await page.locator('#'+surface.controlId).isDisabled(),expectedDisabled,`${surface.controlId} availability must follow its migration record`);
  }
  assert.match(await page.locator('#uxProjectionStatus').textContent(),/Evolution/);
  await page.locator('#uxProjectionSelect').selectOption('REFERENCE_PROJECTION');
  await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.state.uxProjection==='REFERENCE_PROJECTION');
  assert.equal(await page.locator('#contextSurface').isHidden(),false,'Reference context renderer must restore without changing semantic state');
  assert.equal(await page.locator('#view-chat').isHidden(),false);
});
 

test('shared presentation contract reuses Experience Foundation primitives without taking product semantics',()=>{
  const shared=contract.sharedPresentation;
  assert.equal(shared.ownerRef,'github.issue.vexlife.703');
  assert.equal(shared.experienceFoundationClassificationRef,'github.issue.vexlife.704.comment.5827343906');
  assert.equal(shared.experienceFoundationRef,'foundation.vexlife.experience.001');
  assert.deepEqual(shared.primitiveRefs.patterns,[
    'pattern.vexlife.action-decision','pattern.vexlife.progressive-disclosure','pattern.vexlife.preference'
  ]);
  assert.deepEqual(shared.transientForwardLayer.presentationModes,['FLOATING','SHEET','FULL_SCREEN']);
  assert.equal(shared.compactActiveSurfaceHeader.maximumRows,1);
  assert.equal(shared.compactActiveSurfaceHeader.minimumActionTargetPx,48);
  assert.equal(shared.transientForwardLayer.visibleDismissRequired,true);
  assert.equal(shared.transientForwardLayer.escapeDismisses,true);
  assert.equal(shared.transientForwardLayer.focusEntryRequired,true);
  assert.equal(shared.transientForwardLayer.focusReturnRequired,true);
  assert.equal(shared.transientForwardLayer.viewportConfinementRequired,true);
  assert.equal(shared.transientForwardLayer.semanticNavigationOnDismiss,false);
  assert.equal(shared.transientForwardLayer.backDismisses,true);
  assert.equal(shared.transientForwardLayer.backSemantics,'PRESENTATION_DISMISS_WITHOUT_HISTORY_NAVIGATION');
  assert.equal(shared.availableSpace.publisherExport,'bindAvailableSpaceContract');
  assert.equal(shared.availableSpace.doubleViewportAssumptionForbidden,true);
  assert.deepEqual(shared.categorizedMenuRows.availabilityStates,['AVAILABLE','HELD','UNAVAILABLE','UNKNOWN']);
  assert.match(shared.categorizedMenuRows.shape,/availability\/currentness/);
  assert.equal(shared.productSemanticOwnership,false);
});

test('transient presentation resolves bounded desktop and compact modes',()=>{
  assert.equal(resolveTransientPresentationMode({viewportWidth:1440}),'FLOATING');
  assert.equal(resolveTransientPresentationMode({viewportWidth:700}),'SHEET');
  assert.equal(resolveTransientPresentationMode({viewportWidth:390}),'FULL_SCREEN');
  assert.deepEqual(
    constrainTransientRect({left:-100,top:-200,width:2000,height:2000,viewportWidth:1440,viewportHeight:900}),
    {left:12,top:12,width:1416,height:876}
  );
});

test('shared presentation CSS exposes compact shell controls and reusable forward-layer composition',()=>{
  assert.match(css,/\.uxe-active-surface-heading\{[^}]*min-height:56px[^}]*grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css,/#evolutionReferenceFallback,#evolutionActiveSurfaceClose\{[^}]*min-width:48px;min-height:48px/);
  assert.match(css,/\.e29-forward-layer\[data-presentation-mode="FLOATING"\]/);
  assert.match(css,/\.e29-forward-layer\[data-presentation-mode="SHEET"\]/);
  assert.match(css,/\.e29-forward-layer\[data-presentation-mode="FULL_SCREEN"\]/);
  assert.match(css,/\.e29-forward-layer-dismiss,.e29-forward-layer-drag-handle,.e29-menu-row-control\{[^}]*min-width:48px;min-height:48px/);
  assert.match(css,/\.e29-menu-row-availability\{/);
  assert.match(css,/prefers-reduced-motion:reduce\)\{\.e29-forward-layer,\.e29-forward-layer \*\{[^}]*transition:none!important/);
});

test('real loopback shared presentation proves desktop and compact focus, dismissal and constraints',async t=>{
  const child=spawn(process.execPath,['scripts/serve-browser.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,VEXLIFE_PORT:'0'},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill());
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  const url=await Promise.race([
    new Promise((resolve,reject)=>{let err='';child.stderr.on('data',c=>err+=c);child.stdout.on('data',c=>{const m=c.match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0])});child.once('exit',code=>reject(new Error(`browser server exited ${code}: ${err}`)));child.once('error',reject)}),
    delay(5000,undefined,{ref:false}).then(()=>{throw new Error('browser server did not become ready')})
  ]);
  const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  for(const target of [
    {viewport:{width:1440,height:900},mode:'FLOATING'},
    {viewport:{width:390,height:844},mode:'FULL_SCREEN'}
  ]){
    const page=await browser.newPage({viewport:target.viewport});
    await page.goto(url+'/reference/browser/',{waitUntil:'networkidle'});
    const initial=await page.evaluate(async({mode})=>{
      const {bindAvailableSpaceContract,createTransientPresentationController}=await import('/reference/browser/modules/transient-presentation-controller.js');
      const trigger=document.createElement('button');trigger.id='e29-test-trigger';trigger.textContent='Options';trigger.style.cssText='position:fixed;z-index:300;left:4px;top:4px';
      const surface=document.createElement('section');surface.id='e29-test-surface';surface.className='e29-forward-layer';surface.hidden=true;surface.setAttribute('role','dialog');
      surface.innerHTML='<header class="e29-forward-layer-header"><strong>Options</strong><button class="e29-forward-layer-drag-handle" type="button" aria-label="Move">↕</button><button id="e29-test-close" class="e29-forward-layer-dismiss" type="button" aria-label="Close">×</button></header><div class="e29-forward-layer-body"><section class="e29-menu-section"><div class="e29-menu-row" data-availability="AVAILABLE"><div class="e29-menu-row-copy"><strong>Reading</strong><small>Presentation only</small></div><span class="e29-menu-row-value">Original</span><span class="e29-menu-row-availability" aria-label="Availability: AVAILABLE">AVAILABLE</span><button id="e29-test-control" class="e29-menu-row-control" type="button" autofocus>Set</button></div></section></div>';
      document.body.append(trigger,surface);trigger.focus();
      const controller=createTransientPresentationController({surface,trigger,dismissControl:surface.querySelector('#e29-test-close'),dragHandle:surface.querySelector('.e29-forward-layer-drag-handle'),draggable:true});
      trigger.click();await Promise.resolve();
      const host=document.querySelector('#evolutionActiveSurfaceHost');host.hidden=false;host.setAttribute('aria-hidden','false');const referenceControl=document.querySelector('#evolutionReferenceFallback');referenceControl.hidden=false;
      const available=bindAvailableSpaceContract({host,body:document.querySelector('#evolutionActiveSurfaceBody')}).snapshot();
      globalThis.__E29_TEST_CONTROLLER__=controller;
      const shellHeader=document.querySelector('.uxe-active-surface-heading').getBoundingClientRect();
      const reference=document.querySelector('#evolutionReferenceFallback').getBoundingClientRect();
      const close=document.querySelector('#evolutionActiveSurfaceClose').getBoundingClientRect();
      return {mode:controller.snapshot().mode,expectedMode:mode,activeId:document.activeElement?.id,shellHeaderHeight:shellHeader.height,referenceWidth:reference.width,referenceHeight:reference.height,closeWidth:close.width,closeHeight:close.height,available,availabilityText:surface.querySelector('.e29-menu-row-availability')?.textContent};
    },{mode:target.mode});
    assert.equal(initial.mode,initial.expectedMode);
    assert.equal(initial.activeId,'e29-test-control');
    assert.ok(initial.shellHeaderHeight<=72,`shared shell header exceeded compact bound at ${target.viewport.width}px`);
    assert.ok(initial.referenceWidth>=48&&initial.referenceHeight>=48,'Reference target fell below 48px');
    assert.ok(initial.closeWidth>=48&&initial.closeHeight>=48,'Close target fell below 48px');
    assert.ok(initial.available.inlineSize>0&&initial.available.blockSize>0,'active-surface available-space contract did not publish positive dimensions');
    assert.equal(initial.availabilityText,'AVAILABLE');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#e29-test-surface').isHidden(),true);
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'e29-test-trigger');
    const beforeBack=await page.evaluate(()=>({href:location.href,historyLength:history.length}));
    await page.locator('#e29-test-trigger').click();
    await page.evaluate(()=>globalThis.__E29_TEST_CONTROLLER__.back());
    assert.equal(await page.locator('#e29-test-surface').isHidden(),true);
    assert.deepEqual(await page.evaluate(()=>({href:location.href,historyLength:history.length})),beforeBack,'presentation Back must not navigate');
    await page.close();
  }
});


test('exact PR718 app.js composition exercises the real shared available-space lifecycle',async t=>{
  const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'vexlife-uxe703-production-composition-'));
  t.after(()=>fs.rmSync(tempRoot,{recursive:true,force:true}));
  const composedRoot=path.join(tempRoot,'VexLife');
  execFileSync('git',['clone','--quiet','--depth','2','--branch',uxe703ForeignJournal.branch,uxe703ForeignJournal.repository,composedRoot],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const observedForeignHead=git(composedRoot,['rev-parse','HEAD']);
  assert.equal(git(composedRoot,['rev-parse','HEAD^']),uxe703ForeignJournal.finalizationParentHead,'foreign #626 finalization parent moved; production composition must be re-grounded');
  const observedFinalizationPaths=git(composedRoot,['diff-tree','--no-commit-id','--name-only','-r','HEAD']).split('\n').filter(Boolean).sort();
  assert.deepEqual(observedFinalizationPaths,[...uxe703ForeignJournal.finalizationPaths].sort(),'foreign #626 finalization membrane moved; production composition must be re-grounded');
  if(process.env.VEXLIFE_PR_NUMBER==='718'&&process.env.VEXLIFE_BRANCH===uxe703ForeignJournal.branch){
    assert.match(process.env.VEXLIFE_CANDIDATE_HEAD_SHA??'',/^[0-9a-f]{40}$/u,'source-managed exact PR718 candidate head is required');
    assert.equal(observedForeignHead,process.env.VEXLIFE_CANDIDATE_HEAD_SHA,'foreign #626 exact candidate head mismatch');
  }
  assert.equal(git(composedRoot,['rev-parse','HEAD:reference/browser/app.js']),uxe703ForeignJournal.appJsBlob,'foreign #626 app.js blob drifted');
  const foreignApp=fs.readFileSync(path.join(composedRoot,'reference/browser/app.js'),'utf8');
  assert.match(foreignApp,/bindAvailableSpaceContract/);
  assert.match(foreignApp,/state\.uxActiveSurfaceRef&&state\.uxActiveSurfaceRef!==surfaceRef\)await closeEvolutionActiveSurface\('SURFACE_CHANGE'\)/);
  assert.match(foreignApp,/requested===UX_REFERENCE_PROJECTION&&state\.uxActiveSurfaceRef\)await closeEvolutionActiveSurface\('REFERENCE_FALLBACK'\)/);
  overlayExact703ProductBytes(composedRoot);

  const child=spawn(process.execPath,['scripts/serve-browser.mjs'],{cwd:composedRoot,env:{...process.env,VEXLIFE_PORT:'0'},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill());
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  const url=await Promise.race([
    new Promise((resolve,reject)=>{let err='';child.stderr.on('data',c=>err+=c);child.stdout.on('data',c=>{const m=c.match(/http:\/\/127\.0\.0\.1:\d+/);if(m)resolve(m[0])});child.once('exit',code=>reject(new Error(`browser server exited ${code}: ${err}`)));child.once('error',reject)}),
    delay(8000,undefined,{ref:false}).then(()=>{throw new Error('composed production browser server did not become ready')})
  ]);
  const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.goto(url+'/reference/browser/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(globalThis.__VEXLIFE_APP__?.uxProjectionShell));

  const proof=await page.evaluate(async()=>{
    const app=globalThis.__VEXLIFE_APP__,surfaceRef='surface.vexlife.living-journal';
    const host=document.querySelector('#evolutionActiveSurfaceHost'),body=document.querySelector('#evolutionActiveSurfaceBody');
    const availableEvents=[];host.addEventListener('vexlife:available-space',event=>availableEvents.push({...event.detail}));
    let held=true,mountCalls=0,closeCalls=0;
    app.uxProjectionShell.registerEvolutionSurfaceAdapter(surfaceRef,{
      async mount({body:mountBody}){mountCalls+=1;const marker=document.createElement('div');marker.id='uxe703-production-proof-marker';marker.textContent='production lifecycle proof';mountBody.append(marker)},
      requestClose(){closeCalls+=1;return held?{state:'HELD',reason:'PROOF_HELD'}:{state:'CLOSED',reason:'PROOF_CLOSE'}}
    });
    const projection=await app.uxProjectionShell.setProjection('EVOLUTION_PROJECTION');
    const opened=await app.uxProjectionShell.openEvolutionSurface(surfaceRef);
    await new Promise(resolve=>setTimeout(resolve,20));
    const openedSnapshot={
      projection:projection.state,
      opened:opened.state,
      active:app.uxProjectionShell.snapshot().activeSurfaceRef,
      hostHidden:host.hidden,
      inline:Number(body.dataset.uxeAvailableInlineSize),
      block:Number(body.dataset.uxeAvailableBlockSize),
      overflowY:getComputedStyle(body).overflowY,
      padding:getComputedStyle(body).padding,
      events:availableEvents.length,
      mountCalls
    };
    const heldReceipt=await app.uxProjectionShell.closeEvolutionActiveSurface('PROOF_HELD');
    const beforeHeldResize=availableEvents.length;
    dispatchEvent(new Event('resize'));await new Promise(resolve=>setTimeout(resolve,20));
    const heldSnapshot={
      state:heldReceipt.state,
      active:app.uxProjectionShell.snapshot().activeSurfaceRef,
      hostHidden:host.hidden,
      beforeResize:beforeHeldResize,
      afterResize:availableEvents.length,
      closeCalls
    };
    held=false;
    const closedReceipt=await app.uxProjectionShell.closeEvolutionActiveSurface('PROOF_CLOSE');
    const beforeClosedResize=availableEvents.length;
    dispatchEvent(new Event('resize'));await new Promise(resolve=>setTimeout(resolve,20));
    const closedSnapshot={
      state:closedReceipt.state,
      active:app.uxProjectionShell.snapshot().activeSurfaceRef,
      hostHidden:host.hidden,
      beforeResize:beforeClosedResize,
      afterResize:availableEvents.length,
      closeCalls
    };
    const reopened=await app.uxProjectionShell.openEvolutionSurface(surfaceRef);
    await new Promise(resolve=>setTimeout(resolve,20));
    const beforeReopenResize=availableEvents.length;
    dispatchEvent(new Event('resize'));await new Promise(resolve=>setTimeout(resolve,20));
    const reopenedSnapshot={
      state:reopened.state,
      active:app.uxProjectionShell.snapshot().activeSurfaceRef,
      beforeResize:beforeReopenResize,
      afterResize:availableEvents.length,
      mountCalls
    };
    const fallback=await app.uxProjectionShell.setProjection('REFERENCE_PROJECTION');
    const beforeFallbackResize=availableEvents.length;
    dispatchEvent(new Event('resize'));await new Promise(resolve=>setTimeout(resolve,20));
    const fallbackSnapshot={
      state:fallback.state,
      projection:app.uxProjectionShell.snapshot().projection,
      active:app.uxProjectionShell.snapshot().activeSurfaceRef,
      hostHidden:host.hidden,
      beforeResize:beforeFallbackResize,
      afterResize:availableEvents.length,
      closeCalls
    };
    return {openedSnapshot,heldSnapshot,closedSnapshot,reopenedSnapshot,fallbackSnapshot};
  });
  assert.equal(proof.openedSnapshot.projection,'PASS');
  assert.equal(proof.openedSnapshot.opened,'OPEN');
  assert.equal(proof.openedSnapshot.active,'surface.vexlife.living-journal');
  assert.equal(proof.openedSnapshot.hostHidden,false);
  assert.ok(proof.openedSnapshot.inline>0&&proof.openedSnapshot.block>0,'real production open did not publish positive available-space dimensions');
  assert.equal(proof.openedSnapshot.overflowY,'hidden');
  assert.equal(proof.openedSnapshot.padding,'0px');
  assert.ok(proof.openedSnapshot.events>=2,'real production open did not publish initial + post-mount available-space snapshots');
  assert.equal(proof.openedSnapshot.mountCalls,1);

  assert.equal(proof.heldSnapshot.state,'HELD');
  assert.equal(proof.heldSnapshot.active,'surface.vexlife.living-journal');
  assert.equal(proof.heldSnapshot.hostHidden,false);
  assert.equal(proof.heldSnapshot.afterResize,proof.heldSnapshot.beforeResize+1,'HELD close must retain exactly one available-space binding');

  assert.equal(proof.closedSnapshot.state,'CLOSED');
  assert.equal(proof.closedSnapshot.active,null);
  assert.equal(proof.closedSnapshot.hostHidden,true);
  assert.equal(proof.closedSnapshot.afterResize,proof.closedSnapshot.beforeResize,'actual close must disconnect available-space binding');

  assert.equal(proof.reopenedSnapshot.state,'OPEN');
  assert.equal(proof.reopenedSnapshot.active,'surface.vexlife.living-journal');
  assert.equal(proof.reopenedSnapshot.afterResize,proof.reopenedSnapshot.beforeResize+1,'reopen must create one fresh binding without duplicate listeners');
  assert.equal(proof.reopenedSnapshot.mountCalls,2);

  assert.equal(proof.fallbackSnapshot.state,'PASS');
  assert.equal(proof.fallbackSnapshot.projection,'REFERENCE_PROJECTION');
  assert.equal(proof.fallbackSnapshot.active,null);
  assert.equal(proof.fallbackSnapshot.hostHidden,true);
  assert.equal(proof.fallbackSnapshot.afterResize,proof.fallbackSnapshot.beforeResize,'Reference fallback must release the production available-space binding');
  assert.equal(proof.fallbackSnapshot.closeCalls,3);
  await page.close();
});

// [VXG RealForever]
