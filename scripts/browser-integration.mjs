#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { collectRepositoryEvidence } from '../src/core/repository-evidence.mjs';
import { buildSourceManifest } from '../src/core/source-manifest.mjs';
import { writeJson } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const receiptPath = path.resolve(ROOT, process.env.VEXLIFE_BROWSER_RECEIPT || 'generated/health/browser-integration.json');
const repository = collectRepositoryEvidence(ROOT);
const source = buildSourceManifest(ROOT);
const blueprint = validateBlueprint(loadBlueprint(ROOT));
const baseReceipt = {
  schemaVersion: 'vexlife.browser-execution-receipt/v0',
  receiptRef: `receipt.vexlife.browser-integration.${source.treeSha256.slice(0, 24)}`,
  candidateHeadSha: repository.git.candidateHeadSha,
  testedMergeSha: repository.git.testedMergeSha,
  baseSha: repository.git.baseSha,
  testedCheckoutSha: repository.git.checkoutSha,
  sourceTreeSha256: source.treeSha256,
  blueprintHash: blueprint.semanticHash,
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  formedAt: new Date().toISOString(),
  artifactOrReceiptRef: path.relative(ROOT, receiptPath).split(path.sep).join('/')
};

function finish(receipt, exitCode) {
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  writeJson(receiptPath, receipt);
  console.log(JSON.stringify(receipt, null, 2));
  process.exitCode = exitCode;
}

let playwright;
try {
  playwright = await import('playwright');
} catch (error) {
  finish({
    ...baseReceipt,
    state: 'ATTENTION',
    currentness: 'CURRENT',
    browser: { name: 'UNAVAILABLE', version: null },
    consoleErrors: [],
    pageErrors: [],
    error: `deterministic Playwright runtime unavailable: ${error instanceof Error ? error.message : String(error)}`
  }, 1);
}

if (playwright) {
  const integrationHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-browser-integration-home-'));
  const integrationDeviceRef = 'device.browser.integration';
  const integrationLineageRef = 'companion.lineage.browser.integration';
  fs.mkdirSync(path.join(integrationHome, 'config'), { recursive: true });
  fs.mkdirSync(path.join(integrationHome, 'devices'), { recursive: true });
  fs.writeFileSync(path.join(integrationHome, 'config', 'home.json'), `${JSON.stringify({
    schemaVersion: 'vexlife.home/v0',
    homeRef: 'home.browser.integration',
    currentDeviceRef: integrationDeviceRef,
    currentCompanionLineageRef: integrationLineageRef
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(integrationHome, 'devices', `${integrationDeviceRef}.json`), `${JSON.stringify({
    deviceRef: integrationDeviceRef,
    companionLineageRef: integrationLineageRef
  }, null, 2)}\n`);

  const server = spawn(process.execPath, ['scripts/serve-browser.mjs'], {
    cwd: ROOT,
    env: { ...process.env, VEXLIFE_PORT: '0', VEXLIFE_HOME: integrationHome },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.setEncoding('utf8');
  server.stderr.setEncoding('utf8');
  let browser;
  try {
    let serverError = '';
    server.stderr.on('data', (chunk) => { serverError += chunk; });
    const serverUrl = await Promise.race([
      new Promise((resolve, reject) => {
        server.stdout.on('data', (chunk) => {
          const match = chunk.match(/http:\/\/127\.0\.0\.1:\d+/);
          if (match) resolve(match[0]);
        });
        server.once('error', reject);
        server.once('exit', (code) => reject(new Error(`browser server exited ${code}: ${serverError}`)));
      }),
      delay(10000, undefined, { ref: false }).then(() => { throw new Error('browser server readiness timed out'); })
    ]);
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`${serverUrl}/reference/browser/?integration=1`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_INTEGRATION_PROMISE__), null, { timeout: 30000 });
    const integration = await page.evaluate(async () => globalThis.__VEXLIFE_INTEGRATION_PROMISE__);
    const compactConsoleErrors=[];const compactPageErrors=[];const compactPage=await browser.newPage({viewport:{width:390,height:844}});
    compactPage.on('console',(message)=>{if(message.type()==='error')compactConsoleErrors.push(message.text());});compactPage.on('pageerror',(error)=>compactPageErrors.push(error.message));
    await compactPage.goto(serverUrl+'/reference/browser/',{waitUntil:'networkidle',timeout:30000});
    await compactPage.waitForFunction(()=>Boolean(globalThis.__VEXLIFE_APP__),null,{timeout:30000});
    const compactProof=await compactPage.evaluate(async()=>{
      const {runLivedDDisclosureProof,runQ2MobileGrammarProof}=await import('./integration/terrain-suite.js');
      const assert=(condition,message)=>{if(!condition)throw new Error(message);};
      const delay=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
      const app=globalThis.__VEXLIFE_APP__,semanticFrame=JSON.stringify(app.navigation.semanticFrame()),journey=JSON.stringify(app.navigation.fullJourney()),adaptation=JSON.stringify(app.terrain.adaptationSnapshot()),currentRef=app.terrain.currentRef();
      const livedDCompact=await runLivedDDisclosureProof({app,helpers:{delay,assert},viewportClass:'COMPACT'});
      const q2Compact=await runQ2MobileGrammarProof({app,helpers:{delay,assert}});
      return{livedDCompact,q2Compact,semanticFrame,journey,adaptation,currentRef};
    });
    await compactPage.setViewportSize({width:900,height:844});await delay(120);
    const wideInverse=await compactPage.evaluate(()=>{const app=globalThis.__VEXLIFE_APP__;return{projection:app.terrain.viewportProjection(),semanticFrame:JSON.stringify(app.navigation.semanticFrame()),journey:JSON.stringify(app.navigation.fullJourney()),adaptation:JSON.stringify(app.terrain.adaptationSnapshot()),currentRef:app.terrain.currentRef()}});
    await compactPage.setViewportSize({width:390,height:844});await delay(120);
    const compactRecovered=await compactPage.evaluate(()=>{const app=globalThis.__VEXLIFE_APP__;return{projection:app.terrain.viewportProjection(),semanticFrame:JSON.stringify(app.navigation.semanticFrame()),journey:JSON.stringify(app.navigation.fullJourney()),adaptation:JSON.stringify(app.terrain.adaptationSnapshot()),currentRef:app.terrain.currentRef()}});
    const q2ViewportInverse={state:wideInverse.projection?.viewportClass==='DESKTOP'&&wideInverse.projection?.projectionGrammar==='SPATIAL_WORLD'&&compactRecovered.projection?.viewportClass==='COMPACT'&&compactRecovered.projection?.projectionGrammar==='MOBILE_STACK'&&[wideInverse,compactRecovered].every(x=>x.semanticFrame===compactProof.semanticFrame&&x.journey===compactProof.journey&&x.adaptation===compactProof.adaptation&&x.currentRef===compactProof.currentRef)?'PASS':'FAIL',wide:wideInverse.projection,recovered:compactRecovered.projection};
    const livedDCompact=compactProof.livedDCompact,q2Compact=compactProof.q2Compact;
    const q5Compact=await compactPage.evaluate(async()=>{const {runQ5ContextWorkspaceProof}=await import('./integration/contextual-conversation-suite.js');const assert=(condition,message)=>{if(!condition)throw new Error(message);};const delay=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));const app=globalThis.__VEXLIFE_APP__;app.openContext('chat');await delay(20);return runQ5ContextWorkspaceProof({app,helpers:{delay,assert},viewportClass:'COMPACT'});});
    await compactPage.setViewportSize({width:900,height:844});await delay(140);
    const q5Wide=await compactPage.evaluate(()=>{const app=globalThis.__VEXLIFE_APP__;return{workspace:app.contextWorkspaceSnapshot(),semanticFrame:JSON.stringify(app.navigation.semanticFrame()),journey:JSON.stringify(app.navigation.fullJourney()),adaptation:JSON.stringify(app.terrain.adaptationSnapshot()),terrainRef:app.terrain.currentRef()}});
    await compactPage.setViewportSize({width:390,height:844});await delay(140);
    const q5CompactRecovered=await compactPage.evaluate(()=>{const app=globalThis.__VEXLIFE_APP__;return{workspace:app.contextWorkspaceSnapshot(),semanticFrame:JSON.stringify(app.navigation.semanticFrame()),journey:JSON.stringify(app.navigation.fullJourney()),adaptation:JSON.stringify(app.terrain.adaptationSnapshot()),terrainRef:app.terrain.currentRef()}});
    await compactPage.setViewportSize({width:900,height:844});await delay(140);
    const q5WideRecovered=await compactPage.evaluate(()=>{const app=globalThis.__VEXLIFE_APP__;const result={workspace:app.contextWorkspaceSnapshot(),semanticFrame:JSON.stringify(app.navigation.semanticFrame()),journey:JSON.stringify(app.navigation.fullJourney()),adaptation:JSON.stringify(app.terrain.adaptationSnapshot()),terrainRef:app.terrain.currentRef()};app.resetContextWorkspaceLayout();app.returnToTerrain();return result});
    const q5WorkspaceInverse={state:q5Compact?.state==='PASS'&&q5Wide.workspace?.resolved?.viewportClass==='WIDE'&&q5Wide.workspace?.resolved?.mode==='DOCK_LEFT'&&q5Wide.workspace?.resolved?.splitFocusApplied===true&&q5CompactRecovered.workspace?.resolved?.mode==='COMPACT_SHEET'&&q5CompactRecovered.workspace?.resolved?.splitFocusApplied===false&&q5WideRecovered.workspace?.resolved?.mode==='DOCK_LEFT'&&q5WideRecovered.workspace?.resolved?.splitFocusApplied===true&&[q5Wide,q5CompactRecovered,q5WideRecovered].every(x=>JSON.stringify(x.workspace?.preferred)===JSON.stringify(q5Compact.preferred)&&x.semanticFrame===q5Compact.semanticFrame&&x.journey===q5Compact.journey&&x.adaptation===q5Compact.adaptation&&x.terrainRef===q5Compact.terrainRef)?'PASS':'FAIL',wide:q5Wide.workspace,recoveredCompact:q5CompactRecovered.workspace,recoveredWide:q5WideRecovered.workspace};
    await compactPage.close();
    const runJournalViewportProof=async(viewport,viewportClass)=>{
      const proofConsoleErrors=[],proofPageErrors=[],proofPage=await browser.newPage({viewport});
      proofPage.on('console',(message)=>{if(message.type()==='error')proofConsoleErrors.push(message.text());});
      proofPage.on('pageerror',(error)=>proofPageErrors.push(error.message));
      try{
        await proofPage.goto(serverUrl+'/reference/browser/',{waitUntil:'networkidle',timeout:30000});
        await proofPage.waitForFunction(()=>Boolean(globalThis.__VEXLIFE_APP__),null,{timeout:30000});
        const proof=await proofPage.evaluate(async(viewportClassValue)=>{const {runLivingJournalProof}=await import('./integration/living-journal-suite.js');const assert=(condition,message)=>{if(!condition)throw new Error(message);};const delay=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));return runLivingJournalProof({app:globalThis.__VEXLIFE_APP__,helpers:{delay,assert},viewportClass:viewportClassValue});},viewportClass);
        return{viewport,viewportClass,proof,consoleErrors:proofConsoleErrors,pageErrors:proofPageErrors};
      }finally{await proofPage.close();}
    };
    const journalDesktop=await runJournalViewportProof({width:1440,height:900},'DESKTOP');
    const journalCompact=await runJournalViewportProof({width:390,height:844},'COMPACT');
    const runConversationEvolutionViewportProof=async(viewport,viewportClass,reducedMotion)=>{
      const proofConsoleErrors=[],proofPageErrors=[],proofPage=await browser.newPage({viewport});
      proofPage.on('console',(message)=>{if(message.type()==='error')proofConsoleErrors.push(message.text());});
      proofPage.on('pageerror',(error)=>proofPageErrors.push(error.message));
      try{
        await proofPage.emulateMedia({reducedMotion:reducedMotion?'reduce':'no-preference'});
        await proofPage.goto(serverUrl+'/reference/browser/?projection=evolution',{waitUntil:'networkidle',timeout:30000});
        await proofPage.waitForFunction(()=>Boolean(globalThis.__VEXLIFE_APP__),null,{timeout:30000});
        const proof=await proofPage.evaluate(async({viewportClassValue,reducedMotionValue})=>{
          const app=globalThis.__VEXLIFE_APP__,delay=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms)),assert=(condition,message)=>{if(!condition)throw new Error(message);};
          const surfaceRef='surface.vexlife.conversation',beforeFrame=JSON.stringify(app.navigation.semanticFrame()),beforeJourney=JSON.stringify(app.navigation.fullJourney()),shellBefore=app.uxProjectionShell.snapshot();
          assert(shellBefore.projection==='EVOLUTION_PROJECTION','Conversation proof requires Evolution projection');
          assert(shellBefore.surfaceStates?.[surfaceRef]?.state==='ENABLED','Conversation surface must be enabled from accepted source');
          const open=await app.uxProjectionShell.openEvolutionSurface(surfaceRef);await delay(24);
          const shellOpen=app.uxProjectionShell.snapshot(),body=document.querySelector('#evolutionActiveSurfaceBody'),root=body?.querySelector('.conversation-evolution'),context=document.querySelector('#contextSurface');
          assert(open?.state==='OPEN'&&shellOpen.activeSurfaceRef===surfaceRef,'Conversation surface did not open through canonical shell');
          assert(body&&root&&body.querySelectorAll('.conversation-evolution').length===1,'Conversation Evolution must mount exactly one root');
          assert(context?.hidden===true,'Reference context must be hidden while Evolution Conversation is active');
          assert(root.dataset.semanticOwnerRef==='module.vexlife.core.conversation','Conversation semantic owner changed');
          assert(root.dataset.interactionOwnerRef==='module.vexlife.browser.chat-controller','Conversation interaction owner changed');
          assert(root.dataset.oneSemanticState==='true','Conversation one-semantic-state contract missing');
          const channel=app.chat.currentChannel(),availability=root.querySelector('.conversation-evolution__availability'),canonicalReady=channel?.roleKey==='companion'&&app.chat.companionAvailabilityState()==='READY',projectedReady=availability?.dataset.readyForRealTurn==='true';
          assert(projectedReady===canonicalReady,'Evolution real-turn readiness diverges from canonical Companion READY truth');
          if(channel?.kind==='DIRECT')assert(root.querySelector('.conversation-evolution__security')===null,'Direct Conversation must not render Family security chrome');
          const canonicalInput=document.querySelector('#messageInput'),canonicalSend=document.querySelector('#composer button[type="submit"]'),evolutionInput=root.querySelector('.conversation-evolution__input'),evolutionSend=root.querySelector('.conversation-evolution__send');
          assert(canonicalInput&&canonicalSend&&evolutionInput&&evolutionSend,'Conversation composer seams must exist');
          assert(evolutionInput.value===canonicalInput.value,'Evolution composer must project canonical input truth');
          assert(evolutionSend.disabled===canonicalSend.disabled,'Evolution submit availability must mirror canonical composer');
          let draftExercise='NOT_APPLICABLE_READY';
          if(!canonicalReady){
            const draftProbe='Conversation Evolution local draft proof';
            evolutionInput.value=draftProbe;
            evolutionInput.dispatchEvent(new Event('input',{bubbles:true}));
            await delay(12);
            assert(canonicalInput.value===draftProbe,'Evolution input must write through the canonical composer seam');
            assert(app.state.unsentLocalDraft?.channelRef===channel.channelRef,'unavailable Conversation input must preserve the canonical local draft channel');
            assert(app.state.unsentLocalDraft?.content===draftProbe,'unavailable Conversation input must preserve exact canonical local draft content');
            draftExercise='PRESERVED_UNSENT_LOCAL_DRAFT';
          }
          const channelButton=root.querySelector('.conversation-evolution__channel'),channelRect=channelButton?.getBoundingClientRect(),sendRect=evolutionSend.getBoundingClientRect();
          assert((channelRect?.height??0)>=44&&sendRect.height>=44,'Conversation controls must retain >=44px target height');
          assert(matchMedia('(prefers-reduced-motion: reduce)').matches===reducedMotionValue,'Conversation motion media state mismatch');
          const feed=root.querySelector('.conversation-evolution__feed'),activeBeforeScroll=shellOpen.activeSurfaceRef;if(feed){feed.scrollTop=Math.max(0,feed.scrollHeight-feed.clientHeight);feed.dispatchEvent(new Event('scroll'));await delay(12);}
          assert(app.uxProjectionShell.snapshot().activeSurfaceRef===activeBeforeScroll,'ordinary Conversation content scroll changed semantic surface');
          const close=await app.uxProjectionShell.closeEvolutionActiveSurface('CONVERSATION_BROWSER_PROOF');await delay(24);
          assert(close?.state==='CLOSED'&&app.uxProjectionShell.snapshot().activeSurfaceRef===null,'Conversation shell close did not release active surface');
          assert(body.childElementCount===0,'Conversation shell close must empty active-surface body');
          assert(JSON.stringify(app.navigation.semanticFrame())===beforeFrame&&JSON.stringify(app.navigation.fullJourney())===beforeJourney,'Conversation presentation open/close mutated canonical Journey');
          app.chat.renderChannels();app.chat.renderMessages(true);await delay(24);
          assert(body.childElementCount===0,'closed Conversation renderer remounted after Reference structural update');
          assert(app.uxProjectionShell.snapshot().activeSurfaceRef===null,'Reference structural update reactivated Conversation surface');
          return Object.freeze({state:'PASS',viewportClass:viewportClassValue,reducedMotion:reducedMotionValue,semanticOwnerRef:root.dataset.semanticOwnerRef,interactionOwnerRef:root.dataset.interactionOwnerRef,canonicalReady,projectedReady,channelKind:channel?.kind??null,draftExercise,channelTargetHeight:channelRect?.height??0,sendTargetHeight:sendRect.height,postCloseBodyChildCount:body.childElementCount,journeyUnchanged:true,realCompanionTurnExecuted:false});
        },{viewportClassValue:viewportClass,reducedMotionValue:reducedMotion});
        return{viewport,viewportClass,proof,consoleErrors:proofConsoleErrors,pageErrors:proofPageErrors};
      }finally{await proofPage.close();}
    };
    const conversationDesktop=await runConversationEvolutionViewportProof({width:1440,height:900},'DESKTOP',false);
    const conversationCompact=await runConversationEvolutionViewportProof({width:390,height:844},'COMPACT',true);
    const state = integration?.state === 'PASS' && livedDCompact?.state === 'PASS' && q2Compact?.state === 'PASS' && q2ViewportInverse.state === 'PASS' && q5Compact?.state === 'PASS' && q5WorkspaceInverse.state === 'PASS' && journalDesktop.proof?.state === 'PASS' && journalCompact.proof?.state === 'PASS' && conversationDesktop.proof?.state === 'PASS' && conversationCompact.proof?.state === 'PASS' && consoleErrors.length === 0 && pageErrors.length === 0 && compactConsoleErrors.length === 0 && compactPageErrors.length === 0 && journalDesktop.consoleErrors.length === 0 && journalDesktop.pageErrors.length === 0 && journalCompact.consoleErrors.length === 0 && journalCompact.pageErrors.length === 0 && conversationDesktop.consoleErrors.length === 0 && conversationDesktop.pageErrors.length === 0 && conversationCompact.consoleErrors.length === 0 && conversationCompact.pageErrors.length === 0 ? 'PASS' : 'FAILED';
    finish({
      ...baseReceipt,
      state,
      currentness: 'CURRENT',
      browser: { name: browser.browserType().name(), version: browser.version() },
      consoleErrors:[...consoleErrors,...compactConsoleErrors,...journalDesktop.consoleErrors,...journalCompact.consoleErrors,...conversationDesktop.consoleErrors,...conversationCompact.consoleErrors],
      pageErrors:[...pageErrors,...compactPageErrors,...journalDesktop.pageErrors,...journalCompact.pageErrors,...conversationDesktop.pageErrors,...conversationCompact.pageErrors],
      integration,
      journalDesktop,
      journalCompact,
      conversationDesktop,
      conversationCompact,
      livedDCompact,
      q2Compact,
      q2ViewportInverse,
      q5Compact,
      q5WorkspaceInverse
    }, state === 'PASS' ? 0 : 1);
  } catch (error) {
    finish({
      ...baseReceipt,
      state: 'FAILED',
      currentness: 'CURRENT',
      browser: { name: browser?.browserType().name() ?? 'UNAVAILABLE', version: browser?.version() ?? null },
      consoleErrors: [],
      pageErrors: [],
      error: error instanceof Error ? error.message : String(error)
    }, 1);
  } finally {
    await browser?.close().catch(() => {});
    server.kill();
    fs.rmSync(integrationHome, { recursive: true, force: true });
  }
}

// [VXG RealForever]
