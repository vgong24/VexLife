#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { collectRepositoryEvidence, runBoundedGit } from '../src/core/repository-evidence.mjs';
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

// P4R2 uses the existing browser, server and canonical controllers. The evidence
// pattern follows Vextreme scripts/screenshot-institutional.js and
// lib/screenshot-evidence.js at 0776ad1261ca5d11404b09d6fc1638bbce6e8b8f:
// deterministic named states, settled assets, real controls, errors and overflow.
// No Atlas selectors, page semantics, alternate server or production mock enter.
async function runJournalProductProof(page, viewport, errors) {
  const screenshots = [], checks = [];
  const surfaceRef = 'surface.vexlife.living-journal';
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  // The accepted collector intentionally returns null for an unmaterialized
  // candidate object in a shallow CI merge checkout. Keep that gap explicit;
  // the independent provider consumer binds its exact tree before acceptance.
  const testedTree = runBoundedGit(ROOT, ['rev-parse', '--verify', 'HEAD^{tree}'], { label: 'P4R2 tested checkout tree' }).stdout.trim();
  const binding = {
    candidateHead: baseReceipt.candidateHeadSha,
    candidateTree: repository.git.candidateTreeSha,
    candidateTreeBinding: repository.git.candidateTreeSha ? 'LOCAL_GIT_OBJECT' : 'INDEPENDENT_PROVIDER_RESOLUTION_REQUIRED',
    testedCheckout: baseReceipt.testedCheckoutSha,
    testedTree,
    sourceTreeSha256: source.treeSha256,
    viewport,
    evidenceClass: 'REAL_BROWSER_SYNTHETIC_REFERENCE_INPUT',
    realMemoryRead: false,
    humanAccepted: false
  };
  const capture = async (state, inputProvenance) => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, async (image) => {
        if (!image.complete) await new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        });
        if (!image.naturalWidth) throw new Error('P4R2 image failed to load');
        if (image.decode) await image.decode();
      }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const observed = await page.evaluate(() => {
      const app = globalThis.__VEXLIFE_APP__, root = document.querySelector('#view-living-journal');
      const visible = (element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
      return {
        locale: document.documentElement.lang || 'und',
        theme: document.documentElement.dataset.theme || 'default',
        activeSurface: app.uxProjectionShell.snapshot().activeSurfaceRef,
        projection: app.uxProjectionShell.snapshot().projection,
        truthMode: root.dataset.dataMode,
        truthClass: root.dataset.truthClass,
        visibleActionLabels: Array.from(document.querySelectorAll('#evolutionActiveSurfaceHost button, #view-living-journal summary, #livingJournalTools button')).filter(visible).map((element) => (element.getAttribute('aria-label') || element.textContent).trim()),
        selectedEntry: root.querySelector('[aria-current="true"]')?.dataset.pageRef ?? null,
        disclosureStates: Array.from(root.querySelectorAll('.living-journal-entry-detail'), (element) => ({ pageRef: element.closest('article').dataset.pageRef, open: element.open })),
        optionsOpen: !document.querySelector('#livingJournalTools').hidden,
        horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth, root.scrollWidth - root.clientWidth),
        actualViewport: { width: innerWidth, height: innerHeight }
      };
    });
    assert(observed.activeSurface === surfaceRef && observed.projection === 'EVOLUTION_PROJECTION', 'P4R2 screenshot surface binding failed');
    assert(observed.actualViewport.width === viewport.width && observed.actualViewport.height === viewport.height, 'P4R2 screenshot viewport mismatch');
    assert(observed.horizontalOverflow <= 1, 'P4R2 Journal horizontal overflow');
    const png = await page.screenshot({ type: 'png', animations: 'disabled' });
    assert(png.length <= 1500000 && screenshots.reduce((n, s) => n + s.bytes, 0) + png.length <= 6000000, 'P4R2 screenshot evidence size exceeded; no image was truncated');
    screenshots.push({
      ...binding, ...observed, state, inputProvenance,
      filename: `journal-${state}-${observed.locale}-${observed.theme}-${viewport.width}.png`,
      consoleErrors: [...errors.consoleErrors], pageErrors: [...errors.pageErrors],
      mimeType: 'image/png', encoding: 'base64', bytes: png.length,
      sha256: createHash('sha256').update(png).digest('hex'), data: png.toString('base64')
    });
  };
  try {
    await page.evaluate(async () => {
      const app = globalThis.__VEXLIFE_APP__;
      app.livingJournal.restoreInitialData();
      app.returnToTerrain();
      await app.uxProjectionShell.setProjection('EVOLUTION_PROJECTION');
      const result = await app.uxProjectionShell.openEvolutionSurface('surface.vexlife.living-journal');
      if (result.state !== 'OPEN') throw new Error('P4R2 canonical Journal did not open');
      // Explicit fixture restoration after the adapter's unavailable Memory read.
      // This is the accepted reference fixture, never a production fallback.
      app.livingJournal.restoreInitialData();
      globalThis.__VEXLIFE_P4R2_JOURNAL_INPUTS__ = [];
      for (const type of ['click', 'keydown']) document.addEventListener(type, (event) => {
        if (event.target.matches('.living-journal-entry-detail>summary')) {
          globalThis.__VEXLIFE_P4R2_JOURNAL_INPUTS__.push({ type, key: event.key ?? null, trusted: event.isTrusted });
        }
      }, { capture: true });
    });
    const initialIdentity = await page.evaluate(() => globalThis.__VEXLIFE_APP__.livingJournal.canonicalThenIdentity());
    const root = page.locator('#view-living-journal');
    const detail = root.locator('.living-journal-entry-detail').first();
    const summary = detail.locator('summary');
    assert(await summary.isVisible() && !(await detail.evaluate((element) => element.open)), 'P4R2 real disclosure is absent or not initially closed');
    await capture('default', 'ACCEPTED_SYNTHETIC_REFERENCE_FIXTURE');
    await summary.click();
    assert(await detail.evaluate((element) => element.open), 'P4R2 pointer did not open native details');
    const geometry = await detail.evaluate((element) => {
      const article = element.closest('article'), body = element.querySelector('.living-journal-entry-detail-body');
      const a = article.getBoundingClientRect(), b = body.getBoundingClientRect(), trigger = element.querySelector('summary');
      return {
        contained: b.left >= a.left && b.right <= a.right + 1 && b.top >= a.top && b.bottom <= a.bottom + 1,
        bodyVisible: body.getClientRects().length > 0,
        cellOverflow: article.scrollWidth - article.clientWidth,
        targetHeight: trigger.getBoundingClientRect().height,
        bodyFont: parseFloat(getComputedStyle(body.querySelector('p')).fontSize),
        previewFont: parseFloat(getComputedStyle(article.querySelector('.living-journal-entry-preview')).fontSize),
        titleFont: parseFloat(getComputedStyle(article.querySelector('.living-journal-entry-title')).fontSize)
      };
    });
    assert(geometry.contained && geometry.bodyVisible && geometry.cellOverflow <= 1, 'P4R2 opened body escaped its entry cell');
    assert(geometry.targetHeight >= 44 && geometry.bodyFont >= 16 && geometry.previewFont >= 16 && geometry.titleFont >= 21, 'P4R2 entry violates registered readability/target scale');
    checks.push({ name: 'trusted-pointer-open-and-intrinsic-containment', ...geometry });
    await capture('expanded-pointer', 'ACCEPTED_SYNTHETIC_REFERENCE_FIXTURE');
    await summary.press('Enter');
    assert(!(await detail.evaluate((element) => element.open)), 'P4R2 Enter did not collapse native details');
    await root.locator('.living-journal-entry').first().focus();
    let reached = false;
    for (let count = 0; count < 24; count += 1) {
      await page.keyboard.press('Tab');
      if (await summary.evaluate((element) => document.activeElement === element)) { reached = true; break; }
    }
    assert(reached, 'P4R2 disclosure cannot be reached through Tab navigation');
    await page.keyboard.press('Space');
    assert(await detail.evaluate((element) => element.open), 'P4R2 Space did not expand focused native details');
    const focus = await summary.evaluate((element) => ({ retained: document.activeElement === element, outlinePx: parseFloat(getComputedStyle(element).outlineWidth), focusVisible: element.matches(':focus-visible') }));
    assert(focus.retained && focus.focusVisible && focus.outlinePx >= 3, 'P4R2 keyboard focus is not visible and retained');
    checks.push({ name: 'tab-enter-space-native-disclosure', ...focus });
    await capture('expanded-keyboard', 'ACCEPTED_SYNTHETIC_REFERENCE_FIXTURE');
    const inputs = await page.evaluate(() => globalThis.__VEXLIFE_P4R2_JOURNAL_INPUTS__);
    assert(inputs.some((event) => event.type === 'click' && event.trusted) && inputs.some((event) => event.key === 'Enter' && event.trusted) && inputs.some((event) => event.key === ' ' && event.trusted), 'P4R2 trusted input witnesses are incomplete');
    checks.push({ name: 'actual-input-provenance', events: inputs });
    const optionsButton = page.locator('#livingJournalOptionsOpen');
    await optionsButton.click();
    assert(await page.locator('#livingJournalTools').isVisible(), 'P4R2 pointer Options did not open');
    await capture('options', 'ACCEPTED_SYNTHETIC_REFERENCE_FIXTURE');
    await page.keyboard.press('Escape');
    assert(!(await page.locator('#livingJournalTools').isVisible()), 'P4R2 Escape did not dismiss Options');
    assert(await optionsButton.evaluate((element) => document.activeElement === element), 'P4R2 Options did not return focus');
    assert(await page.evaluate((identity) => globalThis.__VEXLIFE_APP__.livingJournal.canonicalThenIdentity() === identity, initialIdentity), 'P4R2 presentation controls changed canonical testimony');
    checks.push({ name: 'pointer-options-escape-focus-and-source-identity', state: 'PASS' });
    await page.evaluate(async () => {
      const { createLivingJournalProofFixture } = await import('./integration/living-journal-suite.js');
      globalThis.__VEXLIFE_APP__.livingJournal.setData(createLivingJournalProofFixture('SUMMARY_ONLY'));
    });
    assert(await root.locator('.living-journal-entry').count() === 1 && await root.locator('.living-journal-entry-detail').count() === 0, 'P4R2 summary-only source acquired a false disclosure');
    assert(await root.locator('.living-journal-entry-title').isVisible(), 'P4R2 source-bound summary is not readable');
    await capture('summary-only', 'SYNTHETIC_MEMORY_SCHEMA_FIXTURE__NOT_REAL_MEMORY_OR_ACCEPTANCE');
    checks.push({ name: 'honest-summary-only-cell', state: 'PASS', realMemory: false });
    await page.evaluate(async () => {
      const { createLivingJournalProofFixture } = await import('./integration/living-journal-suite.js');
      globalThis.__VEXLIFE_APP__.livingJournal.setData(createLivingJournalProofFixture('LONG_TEXT'));
    });
    await root.locator('.living-journal-entry-detail>summary').first().click();
    assert(await root.locator('.living-journal-entry').evaluateAll((entries) => entries.every((element) => element.scrollWidth <= element.clientWidth + 1)), 'P4R2 long Latin/CJK text overflowed an entry');
    await capture('long-text', 'SYNTHETIC_LONG_LATIN_CJK_CONTRACT_FIXTURE');
    checks.push({ name: 'long-text-and-cjk-intrinsic-wrap', state: 'PASS' });
    assert(errors.consoleErrors.length === 0 && errors.pageErrors.length === 0, 'P4R2 browser errors were observed');
    assert(screenshots.length === 6, 'P4R2 screenshot matrix is incomplete');
    return { state: 'PASS', ...binding, checks, screenshots };
  } catch (error) {
    return { state: 'FAILED', ...binding, checks, screenshots, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await page.evaluate(async () => {
      const app = globalThis.__VEXLIFE_APP__;
      app.livingJournal.restoreInitialData();
      await app.uxProjectionShell.closeEvolutionActiveSurface('P4R2_PROOF_COMPLETE');
      await app.uxProjectionShell.setProjection('REFERENCE_PROJECTION');
    }).catch(() => {});
  }
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
        const productExperience=await runJournalProductProof(proofPage,viewport,{consoleErrors:proofConsoleErrors,pageErrors:proofPageErrors});
        return{viewport,viewportClass,proof,productExperience,consoleErrors:proofConsoleErrors,pageErrors:proofPageErrors};
      }finally{await proofPage.close();}
    };
    const journalDesktop=await runJournalViewportProof({width:1440,height:1000},'DESKTOP');
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
          if(channel?.kind==='DIRECT'){
            assert(root.querySelector('.conversation-evolution__security')===null,'Direct Conversation must not render Family security chrome');
            assert(root.dataset.presentationMode==='CONTINUOUS_VEX_RELATIONSHIP','Direct Conversation must use continuous Vex presentation');
            assert(root.querySelector('.conversation-evolution__hero h2')?.textContent==='Vex','Direct Conversation primary title must normalize to Vex');
            assert(root.querySelector('.conversation-evolution__address')===null,'Direct Conversation must keep implementation addressing out of primary chrome');
          }
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
          const contextInspector=root.querySelector('.conversation-evolution__context');if(channel?.kind==='DIRECT')contextInspector.open=true;await delay(8);
          const channelButton=root.querySelector('.conversation-evolution__channel'),channelRect=channelButton?.getBoundingClientRect(),sendRect=evolutionSend.getBoundingClientRect();
          assert((channelRect?.height??0)>=44&&sendRect.height>=44,'Conversation controls must retain >=44px target height');
          if(channel?.kind==='DIRECT'){
            const contextText=contextInspector.textContent,project=app.chat.currentProject(),thread=app.chat.currentThread();
            assert(contextText.includes(project.projectRef)&&contextText.includes(thread.threadRef)&&contextText.includes(channel.channelRef),'Direct Conversation context inspector must retain canonical project/thread/channel identities');
            assert(root.querySelector('.conversation-evolution__context-routes .conversation-evolution__channels')!==null,'Direct routing controls must remain available contextually');
          }
          assert(matchMedia('(prefers-reduced-motion: reduce)').matches===reducedMotionValue,'Conversation motion media state mismatch');
          const feed=root.querySelector('.conversation-evolution__feed'),activeBeforeScroll=shellOpen.activeSurfaceRef;if(feed){feed.scrollTop=Math.max(0,feed.scrollHeight-feed.clientHeight);feed.dispatchEvent(new Event('scroll'));await delay(12);}
          root.scrollTop=Math.max(0,root.scrollHeight-root.clientHeight);root.dispatchEvent(new Event('scroll'));await delay(12);
          const rootRect=root.getBoundingClientRect(),contextRect=contextInspector.getBoundingClientRect();
          assert(contextRect.bottom<=rootRect.bottom+1&&contextRect.top>=rootRect.top-1,'Conversation terminal context inspector is not reachable through the whole-surface scroll owner');
          assert(getComputedStyle(root).overflowY==='auto','Conversation root must own whole-surface terminal reachability');
          assert(app.uxProjectionShell.snapshot().activeSurfaceRef===activeBeforeScroll,'ordinary Conversation content scroll changed semantic surface');
          const close=await app.uxProjectionShell.closeEvolutionActiveSurface('CONVERSATION_BROWSER_PROOF');await delay(24);
          assert(close?.state==='CLOSED'&&app.uxProjectionShell.snapshot().activeSurfaceRef===null,'Conversation shell close did not release active surface');
          assert(body.childElementCount===0,'Conversation shell close must empty active-surface body');
          assert(JSON.stringify(app.navigation.semanticFrame())===beforeFrame&&JSON.stringify(app.navigation.fullJourney())===beforeJourney,'Conversation presentation open/close mutated canonical Journey');
          app.chat.renderChannels();app.chat.renderMessages(true);await delay(24);
          assert(body.childElementCount===0,'closed Conversation renderer remounted after Reference structural update');
          assert(app.uxProjectionShell.snapshot().activeSurfaceRef===null,'Reference structural update reactivated Conversation surface');
          return Object.freeze({state:'PASS',viewportClass:viewportClassValue,reducedMotion:reducedMotionValue,semanticOwnerRef:root.dataset.semanticOwnerRef,interactionOwnerRef:root.dataset.interactionOwnerRef,presentationMode:root.dataset.presentationMode,primaryTitle:root.querySelector('.conversation-evolution__hero h2')?.textContent??null,canonicalReady,projectedReady,channelKind:channel?.kind??null,channelRoleKey:channel?.roleKey??null,draftExercise,channelTargetHeight:channelRect?.height??0,sendTargetHeight:sendRect.height,wholeSurfaceScrollOwner:getComputedStyle(root).overflowY,contextReachable:true,postCloseBodyChildCount:body.childElementCount,journeyUnchanged:true,realCompanionTurnExecuted:false});
        },{viewportClassValue:viewportClass,reducedMotionValue:reducedMotion});
        return{viewport,viewportClass,proof,consoleErrors:proofConsoleErrors,pageErrors:proofPageErrors};
      }finally{await proofPage.close();}
    };
    const conversationDesktop=await runConversationEvolutionViewportProof({width:1440,height:900},'DESKTOP',false);
    const conversationCompact=await runConversationEvolutionViewportProof({width:390,height:844},'COMPACT',true);
    const state = integration?.state === 'PASS' && livedDCompact?.state === 'PASS' && q2Compact?.state === 'PASS' && q2ViewportInverse.state === 'PASS' && q5Compact?.state === 'PASS' && q5WorkspaceInverse.state === 'PASS' && journalDesktop.proof?.state === 'PASS' && journalCompact.proof?.state === 'PASS' && journalDesktop.productExperience?.state === 'PASS' && journalCompact.productExperience?.state === 'PASS' && conversationDesktop.proof?.state === 'PASS' && conversationCompact.proof?.state === 'PASS' && consoleErrors.length === 0 && pageErrors.length === 0 && compactConsoleErrors.length === 0 && compactPageErrors.length === 0 && journalDesktop.consoleErrors.length === 0 && journalDesktop.pageErrors.length === 0 && journalCompact.consoleErrors.length === 0 && journalCompact.pageErrors.length === 0 && conversationDesktop.consoleErrors.length === 0 && conversationDesktop.pageErrors.length === 0 && conversationCompact.pageErrors.length === 0 ? 'PASS' : 'FAILED';
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
