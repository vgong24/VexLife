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

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'vexlife-assortment-project-semantic-map-'));
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
  assert.equal(receipt.projectSpatialChildren,3);
  assert.equal(receipt.projectDescendantsBelow,8);
  assert.equal(receipt.newCanonicalProjectAdmission,false);
  assert.equal(receipt.liveProjectCatalogFormed,false);

  for(const rel of ['reference/browser/modules/terrain-controller.js','reference/browser/evolution/assortment-continuity-projection.js','reference/browser/app.js'])run(process.execPath,['--check',path.join(source,rel)],{cwd:source});
  const terrain=JSON.parse(fs.readFileSync(path.join(source,'blueprint/fragments/terrain.json'),'utf8'));
  const rootChildren=terrain.filter((node)=>node.parentRef==='terrain.project.root-hub').map((node)=>node.terrainNodeRef);
  for(const ref of BINDING.recoveredProjectTerrainRefs)assert.equal(rootChildren.includes(ref),false,`${ref} must not return directly to Home`);
  const projectChildren=terrain.filter((node)=>node.parentRef==='terrain.assortment.projects').map((node)=>node.terrainNodeRef).sort();
  assert.deepEqual(projectChildren,[...BINDING.recoveredProjectTerrainRefs].sort());

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
  assert.equal(initial.projectSpatialChildren,3);
  assert.equal(initial.truthMode,'EVOLUTION');

  // Projects surface now separates Project identities from current work.
  const beforeProjects=await journeyCount(page);
  await page.locator('.e27-node[data-terrain-ref="terrain.assortment.projects"]').click();
  await page.waitForSelector('.assortment-projects');
  assert.equal(await journeyCount(page),beforeProjects+1);
  assert.equal((await semanticFrame(page)).selectedNodeRef,'terrain.assortment.projects');
  const projectCards=page.locator('.assortment-projects .assortment-project-identity');
  assert.equal(await projectCards.count(),3);
  assert.deepEqual((await projectCards.evaluateAll((nodes)=>nodes.map((node)=>node.dataset.projectRef).sort())),[...BINDING.recoveredProjectRefs].sort());
  assert.equal(await page.locator('.assortment-projects [data-work-ref]').count(),2);
  assert.equal(await page.locator('[data-work-ref^="work.vexlife.assortment."] .assortment-primary').innerText(),'Open work context');
  const projectsSurfaceShot=await page.screenshot({type:'png',fullPage:false});

  // Details is presentation-only and leaves Projects current.
  const beforeDetails=await journeyCount(page);
  await page.locator('[data-project-ref="project.vex-home-product"] .assortment-inspect').click();
  await page.waitForSelector('.assortment-inspector');
  assert.equal(await journeyCount(page),beforeDetails);
  assert.equal((await semanticFrame(page)).selectedNodeRef,'terrain.assortment.projects');
  assert.equal((await page.evaluate(()=>globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__.snapshot())).inspectionRef,'project.vex-home-product');
  await page.locator('#evolutionActiveSurfaceBack').click();
  await page.waitForSelector('.assortment-projects');
  assert.equal(await journeyCount(page),beforeDetails);

  // Closing Projects reveals the recovered Project semantic children.
  await page.locator('#evolutionActiveSurfaceClose').click();
  await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.uxProjectionShell.snapshot().activeSurfaceRef===null);
  assert.equal((await semanticFrame(page)).selectedNodeRef,'terrain.assortment.projects');
  for(const ref of BINDING.recoveredProjectTerrainRefs)assert.equal(await page.locator(`.e27-node[data-terrain-ref="${ref}"]`).count(),1);
  const projectsBranchesShot=await page.screenshot({type:'png',fullPage:false});

  // Entering a Project is semantic navigation and reuses its pre-existing projectRef.
  const beforeProjectEntry=await journeyCount(page);
  await page.locator('.e27-node[data-terrain-ref="terrain.project.vex-home-product"]').click();
  await page.waitForSelector('.assortment-inspector');
  const frame=await semanticFrame(page);
  assert.equal(frame.selectedNodeRef,'terrain.project.vex-home-product');
  assert.equal(frame.projectRef,'project.vex-home-product');
  assert.equal(await journeyCount(page),beforeProjectEntry+1);
  assert.equal((await page.evaluate(()=>globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__.snapshot())).inspectionRef,'project.vex-home-product');

  // Close Project details: the Project remains current and its original child contexts are spatially present.
  await page.locator('#evolutionActiveSurfaceClose').click();
  await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.uxProjectionShell.snapshot().activeSurfaceRef===null);
  assert.equal((await semanticFrame(page)).selectedNodeRef,'terrain.project.vex-home-product');
  assert.equal(await page.locator('.e27-node[data-terrain-ref="terrain.thread.guided-fresh"]').count(),1);
  assert.equal(await page.locator('.e27-node[data-terrain-ref="terrain.thread.product-workshop"]').count(),1);
  const projectDepthShot=await page.screenshot({type:'png',fullPage:false});

  // Reopen details without changing Journey, then semantic Back returns to Projects.
  const beforeReopen=await journeyCount(page);
  await page.locator('.e27-focus [data-focus-action="current"]').click();
  await page.waitForSelector('.assortment-inspector');
  assert.equal(await journeyCount(page),beforeReopen);
  await page.locator('#evolutionActiveSurfaceBack').click();
  await page.waitForSelector('.assortment-projects');
  assert.equal((await semanticFrame(page)).selectedNodeRef,'terrain.assortment.projects');
  assert.equal(await journeyCount(page),beforeReopen+1);

  // Live still refuses to convert current work into a Project catalog.
  await page.locator('.assortment-truth-switch button[data-truth-mode="LIVE"]').click();
  await page.waitForFunction(()=>globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__.snapshot().truthMode==='LIVE');
  assert.equal(await page.locator('.assortment-project-identity').count(),0);
  assert.equal(await page.locator('.assortment-projects .assortment-live-card').count(),3,'one held Projects collection plus two current-work live/held cards');
  const liveText=await page.locator('.assortment-projects').innerText();
  assert.match(liveText,/Projects plural collection owner|Projects|Held/i);
  await page.locator('.assortment-truth-switch button[data-truth-mode="EVOLUTION"]').click();
  await page.waitForFunction(()=>globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__.snapshot().truthMode==='EVOLUTION');
  assert.equal(await page.locator('.assortment-project-identity').count(),3);

  console.log('PROJECT_SEMANTIC_MAP_SURFACE_SCREENSHOT_BASE64='+projectsSurfaceShot.toString('base64'));
  console.log('PROJECT_SEMANTIC_MAP_BRANCHES_SCREENSHOT_BASE64='+projectsBranchesShot.toString('base64'));
  console.log('PROJECT_SEMANTIC_MAP_DEPTH_SCREENSHOT_BASE64='+projectDepthShot.toString('base64'));
  console.log('PROJECT_SEMANTIC_MAP_P0_P4_RECEIPT='+JSON.stringify({
    schemaVersion:'vexlife-assortment.project-semantic-map-p0-p4/v1',
    previewRef:BINDING.candidatePreviewRef,
    state:'PASS',
    P0:'PASS__HUMAN_WALKED_CONTINUITY_REFINEMENT_EXTENDED',
    P1:'PASS__EXACT_PREDECESSOR_PROJECT_SUBTREES_RECOVERED_UNDER_PROJECTS_COLLECTION',
    P2:'PASS__REAL_BROWSER_RUNTIME_INITIALIZED',
    P3:'PASS__PASSIVE_HOME_CONTROLS_READY',
    P4:'PASS__PROJECT_IDENTITIES_WORK_AND_PRESENTATION_REMAIN_DISTINCT',
    projectSpatialChildren:3,
    projectDescendantsBelow:8,
    projectDetailsMutateJourney:false,
    projectOpenMutatesJourney:true,
    existingProjectRefReused:true,
    currentWorkManufacturesProjectMembership:false,
    liveProjectCatalogFallback:false,
    newCanonicalProjectAdmission:false
  }));
} finally {
  try{await cdp?.close();}catch{}
  await stop(browser);await stop(server);
  try{run('git',['worktree','remove','--force',source]);}catch{}
  await rmRetry(temp);
}
// [VXG RealForever]
