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
