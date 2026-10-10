import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CANDIDATE=path.join(ROOT,'docs','vexlife-assortment','practicum-candidates','live-evolution-01');
const BINDING=JSON.parse(fs.readFileSync(path.join(CANDIDATE,'BINDING.json'),'utf8'));
const run=(file,args,options={})=>execFileSync(file,args,{cwd:options.cwd??ROOT,env:{...process.env,...(options.env??{})},encoding:'utf8',stdio:options.stdio??['ignore','pipe','pipe'],maxBuffer:32*1024*1024});
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
async function freePort(){return await new Promise((resolve,reject)=>{const server=net.createServer();server.unref();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close((error)=>error?reject(error):resolve(port));});});}
async function waitHttp(url,handle,timeout=15000){const deadline=Date.now()+timeout;let last=null;while(Date.now()<deadline){if(handle.exitCode!==null)throw new Error(`server exited ${handle.exitCode}`);try{const r=await fetch(url,{cache:'no-store'});if(r.ok)return;last=`HTTP ${r.status}`;}catch(error){last=error.message;}await sleep(120);}throw new Error(`HTTP timeout ${last}`);}
async function waitDebug(port,handle,timeout=15000){const deadline=Date.now()+timeout;let last=null;while(Date.now()<deadline){if(handle.exitCode!==null)throw new Error(`browser exited ${handle.exitCode}`);try{const r=await fetch(`http://127.0.0.1:${port}/json/version`,{cache:'no-store'});if(r.ok)return;last=`HTTP ${r.status}`;}catch(error){last=error.message;}await sleep(120);}throw new Error(`debug timeout ${last}`);}
async function stop(handle){if(!handle||handle.exitCode!==null)return;handle.kill('SIGTERM');const deadline=Date.now()+3000;while(handle.exitCode===null&&Date.now()<deadline)await sleep(50);if(handle.exitCode===null)handle.kill('SIGKILL');}
async function rmRetry(target){for(let i=0;i<8;i+=1){try{fs.rmSync(target,{recursive:true,force:true});return;}catch(error){if(!['ENOTEMPTY','EBUSY','EPERM'].includes(error.code))throw error;await sleep(80*(i+1));}}fs.rmSync(target,{recursive:true,force:true});}
async function ensureCommit(ref){
  const present=()=>{try{run('git',['cat-file','-e',`${ref}^{commit}`]);return true;}catch{return false;}};
  if(present())return;
  // The accepted predecessor proof may be fetching the same historical commit in
  // another Node test worker. Give that owner the first opportunity rather than
  // racing its shallow.lock. When this test runs alone, fall back to the same
  // bounded exact fetch after the grace window.
  await sleep(1800);
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){
    if(present())return;
    try{run('git',['fetch','--no-tags','--depth=1','origin',ref]);if(present())return;}
    catch(error){
      const detail=String(error?.stderr??error?.message??error);
      if(!/shallow\.lock|another git process/i.test(detail))throw error;
    }
    await sleep(250);
  }
  if(!present())throw new Error(`Unable to acquire exact predecessor commit ${ref}`);
}

test('Round-2 Live/Evolution truth switch preserves accepted semantics and never substitutes fixture truth', {timeout:120000}, async (t)=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'vexlife-assortment-live-evolution-'));
  const source=path.join(temp,'source'),profile=path.join(temp,'browser-profile'),home=path.join(temp,'home');
  fs.mkdirSync(home,{recursive:true});
  const port=await freePort(),debugPort=await freePort();
  let server=null,browser=null,cdp=null;
  t.after(async()=>{try{await cdp?.close();}catch{}await stop(browser);await stop(server);try{run('git',['worktree','remove','--force',source]);}catch{}await rmRetry(temp);});
  await ensureCommit(BINDING.predecessorSourceHead);
  run('git',['worktree','add','--detach',source,BINDING.predecessorSourceHead]);
  const receipt=JSON.parse(run(process.execPath,[path.join(CANDIDATE,'PATCH-PREVIEW.mjs'),source],{cwd:source}));
  assert.equal(receipt.state,'FORMED');
  assert.equal(receipt.truthDefault,'EVOLUTION');
  assert.equal(receipt.fixtureFallbackInLive,false);
  run(process.execPath,['--check',path.join(source,'reference/browser/evolution/assortment-continuity-projection.js')],{cwd:source});

  server=spawn(process.execPath,['scripts/serve-browser.mjs'],{cwd:source,env:{...process.env,VEXLIFE_PORT:String(port),VEXLIFE_HOME:home},stdio:['ignore','pipe','pipe']});
  const url=`http://127.0.0.1:${port}/reference/browser/?projection=evolution`;
  await waitHttp(url,server);
  browser=spawn(chromium.executablePath(),['--headless=new',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-gpu','--no-sandbox',url],{stdio:['ignore','pipe','pipe']});
  await waitDebug(debugPort,browser);
  cdp=await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const context=cdp.contexts()[0],page=context.pages()[0]??await context.newPage();
  await page.setViewportSize({width:1440,height:900});
  await page.waitForFunction(()=>document.readyState==='complete'&&Boolean(globalThis.__VEXLIFE_APP__));

  await page.locator('.e27-node[data-terrain-ref="terrain.assortment.continue"]').click();
  await page.waitForSelector('.assortment-continuity');
  let snap=await page.evaluate(()=>globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__.snapshot());
  assert.equal(snap.previewRef,BINDING.candidatePreviewRef);
  assert.equal(snap.truthMode,'EVOLUTION');
  assert.equal(await page.locator('.assortment-stage-rail').count(),2);
  assert.equal(await page.locator('.assortment-live-card').count(),0);
  const before=await page.evaluate(()=>({journey:globalThis.__VEXLIFE_APP__.navigation.fullJourney().length,frame:globalThis.__VEXLIFE_APP__.navigation.semanticFrame()}));
  const evolutionShot=await page.screenshot({type:'png',fullPage:false});

  await page.locator('.assortment-truth-switch button[data-truth-mode="LIVE"]').click();
  await page.waitForFunction(()=>globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__.snapshot().truthMode==='LIVE');
  snap=await page.evaluate(()=>globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__.snapshot());
  assert.equal(snap.truthClass,'OWNER_BACKED_LIVE_OR_HELD');
  assert.equal(snap.liveState,'HELD');
  assert.equal(snap.liveProjectStatusState,'HELD_UNAVAILABLE');
  assert.equal(await page.locator('.assortment-stage-rail').count(),0,'Live must not fall back to Evolution stage fixtures');
  assert.equal(await page.locator('.assortment-live-card').count(),4);
  const afterLive=await page.evaluate(()=>({journey:globalThis.__VEXLIFE_APP__.navigation.fullJourney().length,frame:globalThis.__VEXLIFE_APP__.navigation.semanticFrame()}));
  assert.equal(afterLive.journey,before.journey);
  assert.equal(afterLive.frame.selectedNodeRef,before.frame.selectedNodeRef);
  const liveText=await page.locator('.assortment-continuity').innerText();
  assert.match(liveText,/Live/i);
  assert.doesNotMatch(liveText,/Verify the experience/u);
  const liveShot=await page.screenshot({type:'png',fullPage:false});

  await page.locator('.assortment-truth-switch button[data-truth-mode="EVOLUTION"]').click();
  await page.waitForFunction(()=>globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__.snapshot().truthMode==='EVOLUTION');
  assert.equal(await page.locator('.assortment-stage-rail').count(),2);
  assert.equal(await page.locator('.assortment-live-card').count(),0);
  const afterEvolution=await page.evaluate(()=>({journey:globalThis.__VEXLIFE_APP__.navigation.fullJourney().length,frame:globalThis.__VEXLIFE_APP__.navigation.semanticFrame()}));
  assert.equal(afterEvolution.journey,before.journey);
  assert.equal(afterEvolution.frame.selectedNodeRef,before.frame.selectedNodeRef);

  await page.locator('#evolutionActiveSurfaceBack').click();
  await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.uxProjectionShell.snapshot().activeSurfaceRef===null);
  await page.locator('.e27-node[data-terrain-ref="terrain.assortment.vex"]').click();
  await page.waitForSelector('.vex-node-surface');
  const vex=await page.evaluate(()=>globalThis.__VEXLIFE_VEX_PREVIEW__.snapshot());
  assert.equal(vex.activeSurfaceRef,'surface.vexlife.assortment-vex');
  assert.equal(vex.contextRef,'terrain.assortment.vex');

  console.log('LIVE_EVOLUTION_SCREENSHOT_EVOLUTION_BASE64='+evolutionShot.toString('base64'));
  console.log('LIVE_EVOLUTION_SCREENSHOT_LIVE_BASE64='+liveShot.toString('base64'));
  console.log('LIVE_EVOLUTION_P0_P4_RECEIPT='+JSON.stringify({
    schemaVersion:'vexlife-assortment.live-evolution-p0-p4/v1',
    previewRef:BINDING.candidatePreviewRef,
    state:'PASS',
    P0:'PASS__ACCEPTED_VEX_NODE_PREDECESSOR_REUSED',
    P1:'PASS__LIVE_EVOLUTION_TRUTH_PROJECTION_FORMED',
    P2:'PASS__REAL_BROWSER_RUNTIME_INITIALIZED',
    P3:'PASS__EVOLUTION_DEFAULT_AND_LIVE_CONTROL_READY',
    P4:'PASS__LIVE_FAILS_CLOSED_WITHOUT_FIXTURE_SUBSTITUTION_AND_TRUTH_SWITCH_PRESERVES_SEMANTIC_POSITION',
    liveProjectStatusState:snap.liveProjectStatusState,
    referenceToLiveRename:false,
    fixtureFallbackInLive:false
  }));
});
