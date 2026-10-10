import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..','..','..');
const CANDIDATE=path.join(ROOT,'docs','vexlife-assortment','practicum-candidates','vex-node-01');
const BINDING=JSON.parse(fs.readFileSync(path.join(CANDIDATE,'BINDING.json'),'utf8'));
const PREVIEW_REF=BINDING.candidatePreviewRef;
const run=(file,args,options={})=>execFileSync(file,args,{cwd:options.cwd??ROOT,env:{...process.env,...(options.env??{})},encoding:'utf8',stdio:options.stdio??['ignore','pipe','pipe'],maxBuffer:48*1024*1024});

async function freePort(){return await new Promise((resolve,reject)=>{const server=net.createServer();server.unref();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const{port}=server.address();server.close((error)=>error?reject(error):resolve(port));});});}
async function waitForHttp(url,processHandle,timeoutMs=15000){const deadline=Date.now()+timeoutMs;let last=null;while(Date.now()<deadline){if(processHandle.exitCode!==null)throw new Error(`server exited early with ${processHandle.exitCode}`);try{const response=await fetch(url,{cache:'no-store'});if(response.ok)return;last=`HTTP ${response.status}`;}catch(error){last=error?.message??String(error);}await new Promise((resolve)=>setTimeout(resolve,120));}throw new Error(`server readiness timeout: ${last}`);}
async function waitForDebug(debugPort,processHandle,timeoutMs=15000){const deadline=Date.now()+timeoutMs;let last=null;while(Date.now()<deadline){if(processHandle.exitCode!==null)throw new Error(`browser exited early with ${processHandle.exitCode}`);try{const response=await fetch(`http://127.0.0.1:${debugPort}/json/version`,{cache:'no-store'});if(response.ok)return;last=`HTTP ${response.status}`;}catch(error){last=error?.message??String(error);}await new Promise((resolve)=>setTimeout(resolve,120));}throw new Error(`browser debug readiness timeout: ${last}`);}
function parseLastJson(text){const start=text.indexOf('{');if(start<0)throw new Error(`JSON receipt missing: ${text}`);return JSON.parse(text.slice(start));}

async function metrics(page){return await page.evaluate(()=>{
  const guide=document.querySelector('#guideWindow');
  const host=document.querySelector('#evolutionActiveSurfaceHost');
  const vex=document.querySelector('.vex-node-surface');
  const rect=(node)=>node?node.getBoundingClientRect().toJSON():null;
  return {
    projectionParent:document.querySelector('#uxProjectionControl')?.parentElement?.className??null,
    surfaceMenuContainsProjection:Boolean(document.querySelector('#surfaceMenu #uxProjectionControl')),
    guideVisible:Boolean(guide&&!guide.hidden&&getComputedStyle(guide).display!=='none'),
    guideRect:rect(guide),
    activeRect:rect(host),
    activeSurfaceRef:globalThis.__VEXLIFE_APP__?.uxProjectionShell?.snapshot?.().activeSurfaceRef??null,
    contextAttachment:document.querySelector('#vexContextAttachment strong')?.textContent?.trim()??null,
    vexCardCount:vex?.querySelectorAll('.vex-node-card').length??0,
    vexStatusStates:vex?[...vex.querySelectorAll('.vex-node-status')].map((node)=>node.dataset.state):[],
    horizontalOverflow:vex?Math.max(0,vex.scrollWidth-vex.clientWidth):0,
    under44:vex?[...vex.querySelectorAll('button,summary,select')].filter((node)=>{const r=node.getBoundingClientRect();const s=getComputedStyle(node);return s.display!=='none'&&s.visibility!=='hidden'&&(r.width<44||r.height<44)}).map((node)=>({text:node.textContent?.trim(),rect:node.getBoundingClientRect().toJSON()})):[]
  };
});}

function nonOverlapping(left,right){if(!left||!right)return false;return left.right<=right.left||right.right<=left.left||left.bottom<=right.top||right.bottom<=left.top;}

test('Round-2 Vex node practicum cleans Home and composes persistent source-bound companion projection', {timeout:150000}, async(t)=>{
  const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'vexlife-assortment-vex-node-01-'));
  const sourceRoot=path.join(tempRoot,'source');
  const profileRoot=path.join(tempRoot,'browser-profile');
  const homeRoot=path.join(tempRoot,'vexlife-home');
  const runtimePath=path.join(tempRoot,'runtime.json');
  const walkReceipts=path.join(tempRoot,'vex-node-walk.ndjson');
  const port=await freePort(),debugPort=await freePort();
  let serverProcess=null,browserProcess=null,cdpBrowser=null;
  t.after(async()=>{try{await cdpBrowser?.close();}catch{}if(browserProcess?.exitCode===null)browserProcess.kill('SIGTERM');if(serverProcess?.exitCode===null)serverProcess.kill('SIGTERM');try{run('git',['worktree','remove','--force',sourceRoot]);}catch{}fs.rmSync(tempRoot,{recursive:true,force:true});});

  const sourceSha=BINDING.predecessorSourceHead;
  try{run('git',['cat-file','-e',`${sourceSha}^{commit}`]);}catch{run('git',['fetch','--no-tags','--depth=1','origin',sourceSha]);}
  run('git',['worktree','add','--detach',sourceRoot,sourceSha]);
  assert.equal(run('git',['rev-parse','HEAD'],{cwd:sourceRoot}).trim(),sourceSha);
  const patchReceipt=parseLastJson(run(process.execPath,[path.join(CANDIDATE,'PATCH-PREVIEW.mjs'),sourceRoot],{cwd:sourceRoot}));
  assert.equal(patchReceipt.state,'FORMED');
  run(process.execPath,['--check',path.join(sourceRoot,'reference/browser/app.js')],{cwd:sourceRoot});
  run(process.execPath,['--check',path.join(sourceRoot,'reference/browser/evolution/assortment-continuity-projection.js')],{cwd:sourceRoot});
  run(process.execPath,['--check',path.join(sourceRoot,'reference/browser/evolution/assortment-vex-node.js')],{cwd:sourceRoot});

  const terrain=JSON.parse(fs.readFileSync(path.join(sourceRoot,'blueprint/fragments/terrain.json'),'utf8'));
  const refs=new Set(terrain.map((item)=>item.terrainNodeRef));
  for(const required of ['terrain.assortment.vex','terrain.assortment.continue','terrain.assortment.projects','terrain.assortment.frontier'])assert.ok(refs.has(required),required);
  for(const removed of ['terrain.project.self-development','terrain.project.vex-home-product','terrain.project.local-vex','terrain.thread.open-conversation','terrain.thread.guided-fresh','terrain.thread.product-workshop','terrain.thread.foundation'])assert.equal(refs.has(removed),false,removed);
  const patchedApp=fs.readFileSync(path.join(sourceRoot,'reference/browser/app.js'),'utf8');
  assert.match(patchedApp,/onCompanionTurnCompleted:async\(projection\)=>\{guide\?\.bindCompanionTurn/u);
  assert.match(patchedApp,/__VEXLIFE_VEX_PREVIEW__/u);

  let serverOutput='';
  serverProcess=spawn(process.execPath,['scripts/serve-browser.mjs'],{cwd:sourceRoot,env:{...process.env,VEXLIFE_PORT:String(port),VEXLIFE_HOME:homeRoot},stdio:['ignore','pipe','pipe']});
  serverProcess.stdout.on('data',(chunk)=>{serverOutput+=chunk.toString();});serverProcess.stderr.on('data',(chunk)=>{serverOutput+=chunk.toString();});
  const url=`http://127.0.0.1:${port}/reference/browser/?projection=evolution`;
  await waitForHttp(url,serverProcess);
  const browserPath=chromium.executablePath();
  browserProcess=spawn(browserPath,['--headless=new',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profileRoot}`,'--no-first-run','--no-default-browser-check','--disable-gpu','--no-sandbox',url],{stdio:['ignore','pipe','pipe']});
  await waitForDebug(debugPort,browserProcess);
  cdpBrowser=await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
  const context=cdpBrowser.contexts()[0],page=context.pages()[0]??await context.newPage();
  const bootstrapDiagnostics=[];
  page.on('pageerror',(error)=>bootstrapDiagnostics.push({kind:'PAGE_ERROR',message:error?.message??String(error)}));
  page.on('console',(message)=>{if(message.type()==='error')bootstrapDiagnostics.push({kind:'CONSOLE_ERROR',text:message.text()});});
  page.on('requestfailed',(request)=>bootstrapDiagnostics.push({kind:'REQUEST_FAILED',url:request.url(),failure:request.failure()?.errorText??null}));
  page.on('response',(response)=>{if(response.status()>=400)bootstrapDiagnostics.push({kind:'HTTP_ERROR',url:response.url(),status:response.status()});});
  await page.setViewportSize({width:1440,height:900});
  try{
    await page.waitForFunction(()=>document.readyState==='complete'&&Boolean(globalThis.__VEXLIFE_APP__)&&Boolean(globalThis.__VEXLIFE_VEX_PREVIEW__),null,{timeout:12000});
  }catch(error){
    const bootstrap=await page.evaluate(()=>({
      url:location.href,
      readyState:document.readyState,
      app:Boolean(globalThis.__VEXLIFE_APP__),
      assortmentPreview:Boolean(globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__),
      vexPreview:Boolean(globalThis.__VEXLIFE_VEX_PREVIEW__),
      appRoot:Boolean(document.querySelector('#app')),
      guideWindow:Boolean(document.querySelector('#guideWindow')),
      activeSurfaceHost:Boolean(document.querySelector('#evolutionActiveSurfaceHost')),
      bodyText:document.body?.innerText?.slice(0,1200)??''
    })).catch((diagnosticError)=>({diagnosticFailure:diagnosticError?.message??String(diagnosticError)}));
    throw new Error('VEX_NODE_BOOTSTRAP_DIAGNOSTIC:'+JSON.stringify({
      waitError:error?.message??String(error),
      currentUrl:page.url(),
      bootstrap,
      diagnostics:bootstrapDiagnostics.slice(-40)
    }));
  }

  fs.writeFileSync(runtimePath,JSON.stringify({schemaVersion:'vexlife-assortment.preview-runtime/v1',previewRef:PREVIEW_REF,sourceRoot,url,debugPort,logPath:walkReceipts},null,2)+'\n');
  const passive=JSON.parse(run(process.execPath,[path.join(sourceRoot,'docs/vexlife-assortment/practicum-kit/passive-readiness.mjs'),'--runtime',runtimePath,'--contract',path.join(CANDIDATE,'contracts/PASSIVE-READINESS.json')],{cwd:sourceRoot}));
  assert.equal(passive.state,'PASS');

  assert.equal(await page.locator('.e27-node[data-terrain-ref="terrain.project.self-development"]').count(),0);
  assert.equal(await page.locator('.e27-node[data-terrain-ref="terrain.project.vex-home-product"]').count(),0);
  assert.equal(await page.locator('.e27-node[data-terrain-ref="terrain.project.local-vex"]').count(),0);
  assert.equal(await page.locator('#uxProjectionControl').evaluate((node)=>node.parentElement?.classList.contains('e27-actions')),true);
  assert.equal(await page.locator('#surfaceMenu #uxProjectionControl').count(),0);

  await page.locator('.e27-node[data-terrain-ref="terrain.assortment.vex"]').click();
  await page.waitForSelector('.vex-node-surface');
  await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.uxProjectionShell.snapshot().activeSurfaceRef==='surface.vexlife.assortment-vex');
  await page.waitForFunction(()=>{const node=document.querySelector('#guideWindow');return node&&!node.hidden&&getComputedStyle(node).display!=='none';});
  let desktop=await metrics(page);
  assert.equal(desktop.activeSurfaceRef,'surface.vexlife.assortment-vex');
  assert.equal(desktop.guideVisible,true);
  assert.equal(desktop.vexCardCount,6);
  assert.equal(desktop.horizontalOverflow,0);
  assert.deepEqual(desktop.under44,[]);
  assert.equal(nonOverlapping(desktop.activeRect,desktop.guideRect),true,'desktop companion rail must not obscure active Vex surface');

  const syntheticTurn=await page.evaluate(()=>{
    const app=globalThis.__VEXLIFE_APP__,channel=app.chat.currentChannel();
    const projection={schemaVersion:'vexlife.companion-vessel-turn-projection/v1',truthClass:'CURRENT_LOCAL_MODEL',projectRef:channel.projectRef,threadRef:channel.threadRef,channelRef:channel.channelRef,turnRef:'turn.preview.vex-node.01',responseMessageRef:'message.preview.vex-node.01',conversationHeadSha256:'a'.repeat(64),modelNameOrBoundedTestProfileRef:'model.preview.current',content:'I am looking at the Vex node with you. This is a projection update, not a Memory write.',effectsPerformed:false};
    app.guide.bindCompanionTurn(projection);globalThis.__VEXLIFE_VEX_PREVIEW__.setCompanionTurn(projection);return globalThis.__VEXLIFE_VEX_PREVIEW__.snapshot();
  });
  assert.equal(syntheticTurn.companionTurnRef,'turn.preview.vex-node.01');
  await page.waitForFunction(()=>document.querySelector('.vex-node-primary-card p')?.textContent?.includes('projection update'));

  const bridgeProbe=await page.evaluate(async()=>{
    const app=globalThis.__VEXLIFE_APP__,channel=app.chat.currentChannel();
    const key=[channel.projectRef,channel.threadRef,channel.channelRef].join('::');
    const before=(app.messages.get(key)??[]).length;
    const input=document.querySelector('#guideInput');input.value='vex-node canonical composer bridge probe';document.querySelector('#guideComposer').requestSubmit();
    await new Promise((resolve)=>setTimeout(resolve,250));
    const after=(app.messages.get(key)??[]).length;
    return {before,after,draft:app.state.unsentLocalDraft?.content??null,currentChannelRole:channel.roleKey};
  });
  assert.equal(bridgeProbe.currentChannelRole,'companion');
  assert.ok(bridgeProbe.after>bridgeProbe.before||bridgeProbe.draft==='vex-node canonical composer bridge probe','Guide composer must route into canonical Chat send/draft semantics');

  const vexShot=await page.screenshot({type:'png',fullPage:false});
  console.log(`VEX_NODE_SCREENSHOT_DESKTOP_BASE64=${vexShot.toString('base64')}`);

  await page.locator('#evolutionActiveSurfaceBack').click();
  await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.uxProjectionShell.snapshot().activeSurfaceRef===null);
  await page.locator('.e27-node[data-terrain-ref="terrain.assortment.continue"]').click();
  await page.waitForSelector('.assortment-continuity');
  await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.uxProjectionShell.snapshot().activeSurfaceRef==='surface.vexlife.assortment-continuity');
  await page.waitForFunction(()=>{const node=document.querySelector('#guideWindow');return node&&!node.hidden&&getComputedStyle(node).display!=='none';});
  const coexist=await metrics(page);
  assert.equal(coexist.guideVisible,true);
  assert.equal(coexist.contextAttachment,'Continue');
  assert.equal(nonOverlapping(coexist.activeRect,coexist.guideRect),true,'desktop companion rail must coexist with Continuity');
  const coexistShot=await page.screenshot({type:'png',fullPage:false});
  console.log(`VEX_NODE_SCREENSHOT_CONTINUE_WITH_COMPANION_BASE64=${coexistShot.toString('base64')}`);

  await page.locator('#evolutionActiveSurfaceBack').click();
  await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.uxProjectionShell.snapshot().activeSurfaceRef===null);
  await page.setViewportSize({width:390,height:844});
  await page.locator('.e27-node[data-terrain-ref="terrain.assortment.vex"]').click();
  await page.waitForSelector('.vex-node-surface');
  const mobile=await metrics(page);
  assert.equal(mobile.guideVisible,true);
  assert.equal(mobile.horizontalOverflow,0);
  assert.deepEqual(mobile.under44,[]);
  const mobileShot=await page.screenshot({type:'png',fullPage:false});
  console.log(`VEX_NODE_SCREENSHOT_MOBILE_BASE64=${mobileShot.toString('base64')}`);

  const receipt={schemaVersion:'vexlife-assortment.vex-node-01-p0-p4/v1',previewRef:PREVIEW_REF,sourceSha,state:'PASS',P0:'PASS__I13B2_PREDECESSOR_REUSED_PLUS_HUMAN_HOME_CORRECTION',P1:'PASS__HOME_CLEANUP_VEX_NODE_PROJECTION_SELECTOR_COMPANION_STRATUM',P2:'PASS__REAL_BROWSER_RUNTIME_INITIALIZED',P3:'PASS__PASSIVE_HOME_AND_VEX_CONTROLS_READY',P4:'PASS__VEX_NODE_RENDER_COMPANION_PERSISTENCE_COMPOSER_BRIDGE_TURN_REFRESH_CONTINUITY_COEXISTENCE',desktop,coexist,mobile,bridgeProbe,serverOutputTail:serverOutput.slice(-800)};
  console.log(`VEX_NODE_P0_P4_RECEIPT=${JSON.stringify(receipt)}`);
});

// [VXG RealForever]
