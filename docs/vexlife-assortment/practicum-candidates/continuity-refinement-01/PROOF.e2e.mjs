import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const CANDIDATE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(CANDIDATE,'../../../..');
const BINDING=JSON.parse(fs.readFileSync(path.join(CANDIDATE,'BINDING.json'),'utf8'));
const run=(file,args,options={})=>execFileSync(file,args,{cwd:options.cwd??ROOT,env:{...process.env,...(options.env??{})},encoding:'utf8',stdio:options.stdio??['ignore','pipe','pipe'],maxBuffer:32*1024*1024});
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
async function freePort(){return await new Promise((resolve,reject)=>{const server=net.createServer();server.unref();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close((error)=>error?reject(error):resolve(port));});});}
async function waitHttp(url,handle,timeout=15000){const deadline=Date.now()+timeout;let last=null;while(Date.now()<deadline){if(handle.exitCode!==null)throw new Error(`server exited ${handle.exitCode}`);try{const r=await fetch(url,{cache:'no-store'});if(r.ok)return;last=`HTTP ${r.status}`;}catch(error){last=error.message;}await sleep(120);}throw new Error(`HTTP timeout ${last}`);}
async function waitDebug(port,handle,timeout=15000){const deadline=Date.now()+timeout;let last=null;while(Date.now()<deadline){if(handle.exitCode!==null)throw new Error(`browser exited ${handle.exitCode}`);try{const r=await fetch(`http://127.0.0.1:${port}/json/version`,{cache:'no-store'});if(r.ok)return;last=`HTTP ${r.status}`;}catch(error){last=error.message;}await sleep(120);}throw new Error(`debug timeout ${last}`);}
async function stop(handle){if(!handle||handle.exitCode!==null)return;handle.kill('SIGTERM');const deadline=Date.now()+3000;while(handle.exitCode===null&&Date.now()<deadline)await sleep(50);if(handle.exitCode===null)handle.kill('SIGKILL');}
async function rmRetry(target){for(let i=0;i<8;i+=1){try{fs.rmSync(target,{recursive:true,force:true});return;}catch(error){if(!['ENOTEMPTY','EBUSY','EPERM'].includes(error.code))throw error;await sleep(80*(i+1));}}fs.rmSync(target,{recursive:true,force:true});}
async function ensureCommit(ref){const present=()=>{try{run('git',['cat-file','-e',`${ref}^{commit}`]);return true;}catch{return false;}};if(present())return;await sleep(1800);const deadline=Date.now()+15000;while(Date.now()<deadline){if(present())return;try{run('git',['fetch','--no-tags','--depth=1','origin',ref]);if(present())return;}catch(error){const detail=String(error?.stderr??error?.message??error);if(!/shallow\.lock|another git process/i.test(detail))throw error;}await sleep(250);}if(!present())throw new Error(`Unable to acquire exact predecessor commit ${ref}`);}
const journeyCount=(page)=>page.evaluate(()=>globalThis.__VEXLIFE_APP__.navigation.fullJourney().length);
const semanticFrame=(page)=>page.evaluate(()=>globalThis.__VEXLIFE_APP__.navigation.semanticFrame());
const activeSurface=(page)=>page.evaluate(()=>globalThis.__VEXLIFE_APP__.uxProjectionShell.snapshot().activeSurfaceRef);

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'vexlife-assortment-continuity-refinement-'));
const source=path.join(temp,'source'),profile=path.join(temp,'browser-profile'),home=path.join(temp,'home');
fs.mkdirSync(home,{recursive:true});
const port=await freePort(),debugPort=await freePort();
let server=null,browser=null,cdp=null;
try{
  await ensureCommit(BINDING.predecessorSourceHead);
  run('git',['worktree','add','--detach',source,BINDING.predecessorSourceHead]);
  const receipt=JSON.parse(run(process.execPath,[path.join(CANDIDATE,'PATCH-PREVIEW.mjs'),source],{cwd:source}));
  assert.equal(receipt.state,'FORMED');
  assert.equal(receipt.previewRef,BINDING.candidatePreviewRef);
  assert.equal(receipt.predecessorPreviewRef,BINDING.predecessorPreviewRef);
  assert.equal(receipt.currentContextReentry,true);
  assert.equal(receipt.inspectableRecords,true);
  assert.equal(receipt.frontierSpatialChildren,2);
  assert.equal(receipt.projectAdmissionMutation,false);

  for(const rel of ['reference/browser/modules/terrain-controller.js','reference/browser/evolution/assortment-continuity-projection.js','reference/browser/app.js'])run(process.execPath,['--check',path.join(source,rel)],{cwd:source});
  const fixture=JSON.parse(fs.readFileSync(path.join(source,'reference/browser/evolution/assortment-fixtures.json'),'utf8'));
  assert.equal(fixture.previewRef,BINDING.candidatePreviewRef);
  assert.equal(fixture.revisit.find((item)=>item.recordRef==='fixture.revisit.assortment.2')?.terrainRef,'terrain.assortment.frontier.company-people-timeline');
  assert.equal(fixture.revisit.find((item)=>item.recordRef==='fixture.revisit.assortment.3')?.terrainRef,'terrain.assortment.frontier.system-resource-health');

  server=spawn(process.execPath,['scripts/serve-browser.mjs'],{cwd:source,env:{...process.env,VEXLIFE_PORT:String(port),VEXLIFE_HOME:home},stdio:['ignore','pipe','pipe']});
  const url=`http://127.0.0.1:${port}/reference/browser/?projection=evolution`;
  await waitHttp(url,server);
  browser=spawn(chromium.executablePath(),['--headless=new',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-gpu','--no-sandbox',url],{stdio:['ignore','pipe','pipe']});
  await waitDebug(debugPort,browser);
  cdp=await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const context=cdp.contexts()[0],page=context.pages()[0]??await context.newPage();
  await page.setViewportSize({width:1440,height:900});
  await page.waitForFunction(()=>document.readyState==='complete'&&Boolean(globalThis.__VEXLIFE_APP__)&&Boolean(globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__));

  const initial=await page.evaluate(()=>globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__.snapshot());
  assert.equal(initial.previewRef,BINDING.candidatePreviewRef);
  assert.equal(initial.truthMode,'EVOLUTION');

  // Enter Frontier through canonical Terrain navigation.
  const beforeFrontier=await journeyCount(page);
  await page.locator('.e27-node[data-terrain-ref="terrain.assortment.frontier"]').click();
  await page.waitForSelector('.assortment-frontier');
  assert.equal((await semanticFrame(page)).selectedNodeRef,'terrain.assortment.frontier');
  assert.equal(await journeyCount(page),beforeFrontier+1);
  assert.equal(await page.locator('[data-record-ref="fixture.revisit.assortment.2"] .assortment-inspect').count(),1);
  assert.equal(await page.locator('[data-record-ref="fixture.revisit.assortment.3"] .assortment-inspect').count(),1);

  // Close is presentation-only. The semantic frame remains Frontier and exposes a generic reopen action.
  const closeJourney=await journeyCount(page);
  await page.locator('#evolutionActiveSurfaceClose').click();
  await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.uxProjectionShell.snapshot().activeSurfaceRef===null);
  assert.equal((await semanticFrame(page)).selectedNodeRef,'terrain.assortment.frontier');
  assert.equal(await journeyCount(page),closeJourney);
  const currentAction=page.locator('.e27-focus [data-focus-action="current"]');
  assert.equal(await currentAction.count(),1);
  assert.match((await currentAction.innerText()).trim(),/Open|打开|開く/u);

  // Frontier now projects its captured records spatially, without project admission.
  assert.equal(await page.locator('.e27-node[data-terrain-ref="terrain.assortment.frontier.company-people-timeline"]').count(),1);
  assert.equal(await page.locator('.e27-node[data-terrain-ref="terrain.assortment.frontier.system-resource-health"]').count(),1);
  const frontierBranchesShot=await page.screenshot({type:'png',fullPage:false});

  // Reopen current context without Journey mutation.
  const beforeReopen=await journeyCount(page);
  await currentAction.click();
  await page.waitForSelector('.assortment-frontier');
  assert.equal(await journeyCount(page),beforeReopen);
  assert.equal((await semanticFrame(page)).selectedNodeRef,'terrain.assortment.frontier');

  // List inspection is presentation-only and returns to the list with presentation Back.
  const beforeInspect=await journeyCount(page);
  await page.locator('[data-record-ref="fixture.revisit.assortment.3"] .assortment-inspect').click();
  await page.waitForSelector('.assortment-inspector');
  let snap=await page.evaluate(()=>globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__.snapshot());
  assert.equal(snap.inspectionRef,'fixture.revisit.assortment.3');
  assert.equal(await journeyCount(page),beforeInspect);
  assert.equal((await semanticFrame(page)).selectedNodeRef,'terrain.assortment.frontier');
  assert.match(await page.locator('.assortment-inspector').innerText(),/System \/ Resource Health/u);
  const inspectorShot=await page.screenshot({type:'png',fullPage:false});
  await page.locator('#evolutionActiveSurfaceBack').click();
  await page.waitForSelector('.assortment-frontier');
  assert.equal(await journeyCount(page),beforeInspect);

  // Spatial child entry changes semantic position and opens the same reusable inspector.
  await page.locator('#evolutionActiveSurfaceClose').click();
  await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.uxProjectionShell.snapshot().activeSurfaceRef===null);
  const beforeChild=await journeyCount(page);
  await page.locator('.e27-node[data-terrain-ref="terrain.assortment.frontier.system-resource-health"]').click();
  await page.waitForSelector('.assortment-inspector');
  assert.equal((await semanticFrame(page)).selectedNodeRef,'terrain.assortment.frontier.system-resource-health');
  assert.equal(await journeyCount(page),beforeChild+1);
  snap=await page.evaluate(()=>globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__.snapshot());
  assert.equal(snap.inspectionRef,'fixture.revisit.assortment.3');

  // Closing the child inspector preserves the child semantic position; current-context inspection is reopenable too.
  await page.locator('#evolutionActiveSurfaceClose').click();
  await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.uxProjectionShell.snapshot().activeSurfaceRef===null);
  assert.equal((await semanticFrame(page)).selectedNodeRef,'terrain.assortment.frontier.system-resource-health');
  const childReopen=page.locator('.e27-focus [data-focus-action="current"]');
  assert.equal(await childReopen.count(),1);
  const beforeChildReopen=await journeyCount(page);
  await childReopen.click();
  await page.waitForSelector('.assortment-inspector');
  assert.equal(await journeyCount(page),beforeChildReopen);

  // Semantic Back returns to Frontier; presentation automatically follows that current semantic context.
  await page.locator('#evolutionActiveSurfaceBack').click();
  await page.waitForSelector('.assortment-frontier');
  assert.equal((await semanticFrame(page)).selectedNodeRef,'terrain.assortment.frontier');

  // Projects retain direct project entry and gain the same reusable inspection contract.
  await page.locator('#evolutionActiveSurfaceBack').click();
  await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.uxProjectionShell.snapshot().activeSurfaceRef===null);
  assert.equal((await semanticFrame(page)).selectedNodeRef,'terrain.project.root-hub');
  await page.locator('.e27-node[data-terrain-ref="terrain.assortment.projects"]').click();
  await page.waitForSelector('.assortment-projects');
  assert.equal(await page.locator('.assortment-projects .assortment-work-card.is-inspectable').count(),2);
  assert.equal(await page.locator('[data-work-ref^="work.vexlife.assortment."] .assortment-primary').count(),1,'direct Project-depth entry remains present');
  const projectsJourney=await journeyCount(page);
  await page.locator('[data-work-ref="work.vexlife.vexvision-android.remote-physical-visual-sensor.20261007A"] .assortment-inspect').click();
  await page.waitForSelector('.assortment-inspector');
  assert.equal(await journeyCount(page),projectsJourney);
  assert.equal((await page.evaluate(()=>globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__.snapshot())).inspectionRef,'work.vexlife.vexvision-android.remote-physical-visual-sensor.20261007A');

  // Live remains fail-closed in the new inspector rather than leaking Evolution fixture detail.
  await page.locator('.assortment-truth-switch button[data-truth-mode="LIVE"]').click();
  await page.waitForFunction(()=>globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__.snapshot().truthMode==='LIVE');
  assert.equal(await page.locator('.assortment-inspector-card').count(),0);
  assert.equal(await page.locator('.assortment-live-card').count(),1);
  assert.match(await page.locator('.assortment-inspector').innerText(),/Live/u);
  await page.locator('.assortment-truth-switch button[data-truth-mode="EVOLUTION"]').click();
  await page.waitForFunction(()=>globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__.snapshot().truthMode==='EVOLUTION');
  assert.equal(await page.locator('.assortment-inspector-card').count(),1);

  console.log('CONTINUITY_REFINEMENT_FRONTIER_BRANCHES_SCREENSHOT_BASE64='+frontierBranchesShot.toString('base64'));
  console.log('CONTINUITY_REFINEMENT_INSPECTOR_SCREENSHOT_BASE64='+inspectorShot.toString('base64'));
  console.log('CONTINUITY_REFINEMENT_P0_P4_RECEIPT='+JSON.stringify({
    schemaVersion:'vexlife-assortment.continuity-refinement-p0-p4/v1',
    previewRef:BINDING.candidatePreviewRef,
    state:'PASS',
    P0:'PASS__HUMAN_ACCEPTED_LIVE_EVOLUTION_PREDECESSOR_EXTENDED',
    P1:'PASS__GENERIC_CURRENT_CONTEXT_ACTION_INSPECTOR_AND_FRONTIER_CHILD_PROJECTION_FORMED',
    P2:'PASS__REAL_BROWSER_RUNTIME_INITIALIZED',
    P3:'PASS__PASSIVE_HOME_CONTROLS_READY',
    P4:'PASS__CLOSE_REENTRY_INSPECTION_SPATIAL_FRONTIER_AND_LIVE_FAIL_CLOSED',
    closePreservesSemanticContext:true,
    listInspectionMutatesJourney:false,
    frontierSpatialChildren:2,
    frontierChildCreatesProject:false,
    fixtureFallbackInLive:false,
    inheritedDirectProjectEntryPreserved:true
  }));
} finally {
  try{await cdp?.close();}catch{}
  await stop(browser);await stop(server);
  try{run('git',['worktree','remove','--force',source]);}catch{}
  await rmRetry(temp);
}
// [VXG RealForever]