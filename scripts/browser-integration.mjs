#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import {
  createIntentEnvelope,
  createIntentWorkgraph,
  createWorkNode
} from '../src/core/intent-workgraph.mjs';
import { persistIntentWorkgraphRuntimeSnapshot } from '../src/core/intent-workgraph-runtime-snapshot.mjs';
import { collectRepositoryEvidence, runBoundedGit } from '../src/core/repository-evidence.mjs';
import { buildSourceManifest } from '../src/core/source-manifest.mjs';
import { writeJson } from '../src/core/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const receiptPath = path.resolve(ROOT, process.env.VEXLIFE_BROWSER_RECEIPT || 'generated/health/browser-integration.json');
const repository = collectRepositoryEvidence(ROOT);
const source = buildSourceManifest(ROOT);
const sourceBundle = loadBlueprint(ROOT);
const blueprint = validateBlueprint(sourceBundle);
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
  // Original image bytes remain in the artifact receipt, not a giant stdout log.
  console.log(JSON.stringify(receipt, function(key, value) {
    return key === 'data' && this.mimeType === 'image/png' && this.encoding === 'base64' ? undefined : value;
  }, 2));
  process.exitCode = exitCode;
}

function formFcf03ProgressFixtureGraph() {
  const registry = sourceBundle.intentRegistry;
  const intent = createIntentEnvelope({
    intentRef: 'intent.fcf03.browser-progress',
    originMessageRef: 'message.fcf03.browser-progress',
    originSpeakerRef: 'person.vexlife.owner',
    recipientRoleRef: 'role.vex.operations',
    projectRef: 'project.self-development',
    threadRef: 'thread.fcf03.browser-progress',
    channelRef: 'channel.fcf03.browser-progress',
    originalContentHash: 'a'.repeat(64),
    desiredOutcome: { intentKey: 'VALIDATE_WORKGRAPH', summary: 'Show truthful current progress' },
    constraints: [],
    createdAt: '2026-09-28T00:00:00.000Z',
    sourceLineageRef: 'lineage.fcf03.browser-progress'
  }, registry);
  const node = createWorkNode({
    workNodeRef: 'work-node.fcf03.browser-ready',
    rootIntentRef: intent.intentRef,
    parentWorkNodeRef: null,
    purpose: 'Prepare the next bounded feature step',
    processRef: 'process.vexlife.intent.validate-workgraph',
    state: 'READY',
    dependencyRefs: [],
    childRefs: [],
    roleRef: 'role.vex.operations',
    priorityClass: 'NORMAL',
    contextPlanRef: null,
    applicableCultureRefs: ['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs: [],
    applicableBurdenReleaseRefs: [],
    capabilityEnvelopeRef: 'capability-envelope.intent.contract-validation',
    effectEnvelopeRef: 'effect-envelope.intent.no-effects',
    resourceEnvelopeRef: 'resource-envelope.intent.deterministic-local-light',
    expectedTransitionRef: 'expected-transition.intent.contract-current',
    completionGateRefs: ['completion-gate.intent.contract-valid'],
    returnRouteRef: 'return-route.intent.verify-transition',
    sourceRefs: ['source.fcf03.browser-progress'],
    createdAt: '2026-09-28T00:00:00.000Z'
  }, registry);
  const transitions = [
    ['CAPTURED', 'DECOMPOSED'],
    ['DECOMPOSED', 'PLAN_VALIDATED'],
    ['PLAN_VALIDATED', 'READY']
  ].map(([priorState, nextState], sequence) => ({
    transitionRef: `transition.fcf03.browser-progress.${sequence}`,
    workNodeRef: node.workNodeRef,
    sequence,
    priorState,
    nextState,
    reason: 'FCF-03 deterministic visual evidence fixture',
    actorRef: 'vex.vexlife.intent-orchestration',
    actorRoleRef: 'role.vex.operations',
    processRef: 'process.vexlife.intent.verify-transition',
    sourceRefs: [`source.fcf03.browser-progress.transition.${sequence}`],
    createdAt: `2026-09-28T00:00:0${sequence + 1}.000Z`
  }));
  return createIntentWorkgraph({
    graphRef: 'intent-workgraph.fcf03.browser-progress',
    intent,
    nodes: [node],
    transitions,
    bindingRefs: {
      capabilityEnvelopeRef: [node.capabilityEnvelopeRef],
      effectEnvelopeRef: [node.effectEnvelopeRef],
      resourceEnvelopeRef: [node.resourceEnvelopeRef],
      expectedTransitionRef: [node.expectedTransitionRef],
      completionGateRefs: [...node.completionGateRefs],
      returnRouteRef: [node.returnRouteRef]
    },
    createdAt: '2026-09-28T00:00:00.000Z'
  }, registry);
}

function seedFcf03ProgressFixture(home) {
  return persistIntentWorkgraphRuntimeSnapshot({ home, graph: formFcf03ProgressFixtureGraph() });
}

// P4R2 uses the existing browser, server and canonical controllers. The evidence
// pattern follows Vextreme scripts/screenshot-institutional.js and
// lib/screenshot-evidence.js at 0776ad1261ca5d11404b09d6fc1638bbce6e8b8f:
// deterministic named states, settled assets, real controls, errors and overflow.
// No Atlas selectors, page semantics, alternate server or production mock enter.
function createExperienceCapture(page, viewport, errors, {surfaceRef, rootSelector, prefix}) {
  const screenshots = [];
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
    const observed = await page.evaluate(({rootSelector}) => {
      const app = globalThis.__VEXLIFE_APP__, root = document.querySelector(rootSelector);
      const visible = (element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
      return {
        locale: document.documentElement.lang || 'und',
        theme: document.documentElement.dataset.theme || 'default',
        activeSurface: app.uxProjectionShell.snapshot().activeSurfaceRef,
        projection: app.uxProjectionShell.snapshot().projection,
        truthMode: root.dataset.dataMode ?? 'CANONICAL_CONVERSATION_PROJECTION',
        truthClass: root.dataset.truthClass ?? 'CANONICAL_CHANNEL_STATE',
        contextOpen: root.querySelector('.conversation-evolution__context')?.open ?? null,
        feedState: root.dataset.feedState ?? null,
        visibleActionLabels: Array.from(document.querySelectorAll('#evolutionActiveSurfaceHost button, #evolutionActiveSurfaceHost summary, #livingJournalTools button')).filter(visible).map((element) => (element.getAttribute('aria-label') || element.textContent).trim()),
        selectedEntry: root.querySelector('[aria-current="true"]')?.dataset.pageRef ?? null,
        disclosureStates: Array.from(root.querySelectorAll('.living-journal-entry-detail'), (element) => ({ pageRef: element.closest('article').dataset.pageRef, open: element.open })),
        optionsOpen: !document.querySelector('#livingJournalTools').hidden,
        horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth, root.scrollWidth - root.clientWidth),
        actualViewport: { width: innerWidth, height: innerHeight }
      };
    }, {rootSelector});
    assert(observed.activeSurface === surfaceRef && observed.projection === 'EVOLUTION_PROJECTION', 'P4R2 screenshot surface binding failed');
    assert(observed.actualViewport.width === viewport.width && observed.actualViewport.height === viewport.height, 'P4R2 screenshot viewport mismatch');
    assert(observed.horizontalOverflow <= 1, 'P4R2 active experience horizontal overflow');
    const png = await page.screenshot({ type: 'png', animations: 'disabled' });
    assert(png.length <= 1500000 && screenshots.reduce((n, s) => n + s.bytes, 0) + png.length <= 6000000, 'P4R2 screenshot evidence size exceeded; no image was truncated');
    screenshots.push({
      ...binding, ...observed, state, inputProvenance,
      filename: `${prefix}-${state}-${observed.locale}-${observed.theme}-${viewport.width}.png`,
      consoleErrors: [...errors.consoleErrors], pageErrors: [...errors.pageErrors],
      mimeType: 'image/png', encoding: 'base64', bytes: png.length,
      sha256: createHash('sha256').update(png).digest('hex'), data: png.toString('base64')
    });
  };
  return {binding, capture, screenshots};
}

async function runJournalProductProof(page, viewport, errors) {
  const checks = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const {binding, capture, screenshots} = createExperienceCapture(page, viewport, errors, {
    surfaceRef: 'surface.vexlife.living-journal', rootSelector: '#view-living-journal', prefix: 'journal'
  });
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

async function runConversationProductProof(page, viewport, errors) {
  const checks = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const {binding, capture, screenshots} = createExperienceCapture(page, viewport, errors, {
    surfaceRef: 'surface.vexlife.conversation', rootSelector: '.conversation-evolution', prefix: 'conversation'
  });
  try {
    const before = await page.evaluate(async () => {
      const app = globalThis.__VEXLIFE_APP__;
      // Product evidence targets the canonical direct Companion relationship, not
      // whichever direct implementation-role channel happened to seed the page.
      const project = app.projects.find((item) => item.projectRef === 'project.self-development');
      const thread = project?.threads.find((item) => item.threadRef === 'thread.self-development.open-conversation');
      if (!project || !thread) throw new Error('P4R2 canonical Self Development Conversation source is unavailable');
      app.chat.selectThread(project, thread, 'element.thread.open-conversation');
      const companion = app.chat.channelsForThread(project.projectRef, thread.threadRef).find((item) => item.kind === 'DIRECT' && item.roleKey === 'companion');
      if (!companion) throw new Error('P4R2 canonical direct Companion channel is unavailable');
      app.chat.selectChannel(companion, 'element.channel.companion');
      const original = {frame: JSON.stringify(app.navigation.semanticFrame()), journey: JSON.stringify(app.navigation.fullJourney())};
      const result = await app.uxProjectionShell.openEvolutionSurface('surface.vexlife.conversation');
      if (result.state !== 'OPEN') throw new Error('P4R2 canonical Conversation did not open');
      globalThis.__VEXLIFE_P4R2_CONVERSATION_INPUTS__ = [];
      for (const type of ['click','keydown']) document.addEventListener(type, (event) => {
        if (event.target.matches('.conversation-evolution__context>summary')) globalThis.__VEXLIFE_P4R2_CONVERSATION_INPUTS__.push({type,key:event.key??null,trusted:event.isTrusted});
      }, {capture:true});
      return original;
    });
    const root = page.locator('.conversation-evolution');
    const input = root.locator('textarea');
    const summary = root.locator('.conversation-evolution__context>summary');
    const context = root.locator('.conversation-evolution__context');
    assert(await root.getAttribute('data-presentation-mode') === 'CONTINUOUS_VEX_RELATIONSHIP', 'P4R2 product Conversation is not the direct Companion relationship');
    assert(await page.evaluate(() => globalThis.__VEXLIFE_APP__.chat.currentChannel()?.roleKey === 'companion'), 'P4R2 product proof is not bound to the canonical Companion channel');
    assert(await root.locator('.conversation-evolution__hero h2').innerText() === 'Vex', 'P4R2 relationship title is not Vex');
    assert(!(await context.evaluate((element) => element.open)), 'P4R2 default context must be secondary and closed');
    const empty = await root.getAttribute('data-feed-state') === 'EMPTY';
    if (empty) assert(!(await root.locator('.conversation-evolution__feed').isVisible()), 'P4R2 empty feed still occupies an unexplained panel');
    const metrics = await root.evaluate((element) => {
      const input = element.querySelector('textarea'), send = element.querySelector('.conversation-evolution__send');
      const a = element.getBoundingClientRect(), b = input.getBoundingClientRect();
      return {fontSize:parseFloat(getComputedStyle(input).fontSize),sendHeight:send.getBoundingClientRect().height,composerInView:b.top>=a.top&&b.bottom<=a.bottom+1,scrollOwner:getComputedStyle(element).overflowY};
    });
    assert(metrics.fontSize >= 17 && metrics.sendHeight >= 48 && metrics.scrollOwner === 'auto', 'P4R2 Conversation readability/target contract failed');
    if (empty) assert(metrics.composerInView, 'P4R2 empty Conversation does not put the composer in view');
    checks.push({name:'relationship-and-composer-first-default',empty,...metrics});
    await capture('default','CANONICAL_LOCAL_REFERENCE_STATE__NO_REAL_MODEL_TURN');
    await summary.click();
    assert(await context.evaluate((element) => element.open), 'P4R2 pointer did not open current context');
    const canonicalContext = await page.evaluate(() => {
      const app = globalThis.__VEXLIFE_APP__, text = document.querySelector('.conversation-evolution__context').textContent;
      return [app.chat.currentProject().projectRef,app.chat.currentThread().threadRef,app.chat.currentChannel().channelRef].every((ref)=>text.includes(ref));
    });
    assert(canonicalContext, 'P4R2 context lost canonical project/thread/channel identity');
    await capture('context-pointer','CANONICAL_LOCAL_REFERENCE_STATE__NO_REAL_MODEL_TURN');
    await summary.press('Enter');
    assert(!(await context.evaluate((element) => element.open)), 'P4R2 Enter did not close native context');
    await input.focus();
    let reached = false;
    for (let count=0;count<24;count+=1) {
      await page.keyboard.press('Tab');
      if (await summary.evaluate((element)=>document.activeElement===element)) {reached=true;break;}
    }
    assert(reached,'P4R2 context is not keyboard reachable');
    await page.keyboard.press('Space');
    assert(await context.evaluate((element)=>element.open),'P4R2 Space did not open current context');
    const focus = await summary.evaluate((element)=>({visible:element.matches(':focus-visible'),width:parseFloat(getComputedStyle(element).outlineWidth)}));
    assert(focus.visible&&focus.width>=3,'P4R2 Conversation focus ring is not perceptible');
    await capture('context-keyboard','CANONICAL_LOCAL_REFERENCE_STATE__NO_REAL_MODEL_TURN');
    const inputs = await page.evaluate(()=>globalThis.__VEXLIFE_P4R2_CONVERSATION_INPUTS__);
    assert(inputs.some((event)=>event.type==='click'&&event.trusted)&&inputs.some((event)=>event.key==='Enter'&&event.trusted)&&inputs.some((event)=>event.key===' '&&event.trusted),'P4R2 Conversation input provenance is incomplete');
    checks.push({name:'pointer-tab-enter-space-context',canonicalContext,focus,events:inputs});
    const initialDraft = await input.inputValue();
    const draft = 'A deliberate local thought. 日本語 — not sent.';
    await input.fill(draft);
    await input.press('ArrowLeft');
    const caret = await input.evaluate((element)=>[element.selectionStart,element.selectionEnd]);
    await page.evaluate(()=>globalThis.__VEXLIFE_APP__.chat.renderMessages(true));
    await page.waitForFunction((expected)=>{
      const input=document.querySelector('.conversation-evolution__input');
      return input===document.activeElement&&input.value===expected.draft&&input.selectionStart===expected.caret[0]&&input.selectionEnd===expected.caret[1]&&document.querySelector('.conversation-evolution__context').open;
    },{draft,caret},{timeout:5000});
    assert(await page.locator('#messageInput').inputValue()===draft,'P4R2 local draft diverged from canonical composer');
    checks.push({name:'canonical-rerender-preserves-draft-focus-caret-and-context',state:'PASS',realTurnExecuted:false});
    await input.fill(initialDraft);
    await page.evaluate(async()=>globalThis.__VEXLIFE_APP__.uxProjectionShell.closeEvolutionActiveSurface('P4R2_CONVERSATION_PROOF_COMPLETE'));
    const after = await page.evaluate(()=>({frame:JSON.stringify(globalThis.__VEXLIFE_APP__.navigation.semanticFrame()),journey:JSON.stringify(globalThis.__VEXLIFE_APP__.navigation.fullJourney())}));
    assert(after.frame===before.frame&&after.journey===before.journey,'P4R2 presentation mutated Journey');
    assert(errors.consoleErrors.length===0&&errors.pageErrors.length===0,'P4R2 Conversation browser errors');
    assert(screenshots.length===3,'P4R2 Conversation screenshot matrix incomplete');
    return {state:'PASS',...binding,checks,screenshots,realTurnExecuted:false};
  } catch (error) {
    return {state:'FAILED',...binding,checks,screenshots,error:error instanceof Error?error.message:String(error)};
  } finally {
    await page.evaluate(async()=>globalThis.__VEXLIFE_APP__.uxProjectionShell.closeEvolutionActiveSurface('P4R2_CONVERSATION_PROOF_FINALLY')).catch(()=>{});
  }
}


async function runPurposeWorkspaceProductProof(page, viewport, errors, reducedMotion=false) {
  const checks=[];
  const assert=(condition,message)=>{if(!condition)throw new Error(message);};
  const {binding,capture,screenshots}=createExperienceCapture(page,viewport,errors,{
    surfaceRef:'surface.vexlife.purpose-workspace',
    rootSelector:'.purpose-workspace-evolution',
    prefix:'purpose-workspace'
  });
  try{
    await page.emulateMedia({reducedMotion:reducedMotion?'reduce':'no-preference'});
    const before=await page.evaluate(()=>({
      contextProjection:globalThis.__VEXLIFE_APP__.state.contextProjection,
      workspaceOpen:globalThis.__VEXLIFE_APP__.state.workspaceOpen,
      frame:JSON.stringify(globalThis.__VEXLIFE_APP__.navigation.semanticFrame()),
      journey:JSON.stringify(globalThis.__VEXLIFE_APP__.navigation.fullJourney())
    }));
    assert(await page.locator('#openPurposeWorkspace').isDisabled(),'FCF-02 Purpose Workspace must not impersonate a Reference route');
    await page.locator('#surfaceMenuButton').click();
    await page.locator('#uxProjectionSelect').selectOption('EVOLUTION_PROJECTION');
    await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.state.uxProjection==='EVOLUTION_PROJECTION');
    assert(!(await page.locator('#openPurposeWorkspace').isDisabled()),'FCF-02 Purpose Workspace is unavailable in Evolution');
    await page.locator('#openPurposeWorkspace').click();
    await page.waitForSelector('.purpose-workspace-evolution');
    await page.evaluate(()=>{
      globalThis.__VEXLIFE_FCF02_PURPOSE_INPUTS__=[];
      for(const type of ['click','keydown']) document.addEventListener(type,(event)=>{
        const target=event.target instanceof Element?event.target.closest('.purpose-workspace-evolution__choice'):null;
        if(target)globalThis.__VEXLIFE_FCF02_PURPOSE_INPUTS__.push({type,key:event.key??null,value:target.dataset.value??null,trusted:event.isTrusted});
      },{capture:true});
    });
    const root=page.locator('.purpose-workspace-evolution');
    const initial=await page.evaluate(()=>({
      snapshot:globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot(),
      shell:globalThis.__VEXLIFE_APP__.uxProjectionShell.snapshot(),
      screenRef:document.querySelector('.purpose-workspace-evolution')?.dataset.screenRef??null,
      effects:document.querySelector('.purpose-workspace-evolution')?.dataset.effects??null
    }));
    assert(initial.shell.activeSurfaceRef==='surface.vexlife.purpose-workspace','FCF-02 shell active surface mismatch');
    assert(initial.snapshot.semanticDepth==='DO','FCF-02 Purpose Workspace default depth must be DO');
    assert(initial.snapshot.effects===false&&initial.effects==='false','FCF-02 Purpose Workspace gained effects');
    assert(initial.screenRef==='screen.vexlife.purpose-workspace','FCF-02 Purpose Workspace screen identity drifted');
    assert(initial.snapshot.sourceRegistrationState==='CURRENT','FCF-02 visual witness must consume current downstream registration truth');
    assert(initial.snapshot.sourceFoundationRegistrationState==='REGISTERED_PREPARED_BROWSER_HELD','FCF-02 visual witness must preserve exact source-foundation provenance');
    assert(initial.snapshot.progressState==='CURRENT','FCF-03 Purpose Workspace progress must consume current Workgraph truth');
    assert(initial.snapshot.progressProjectRef==='project.self-development','FCF-03 Purpose Workspace progress project binding drifted');
    assert(initial.snapshot.progressGraphCount===1,'FCF-03 Purpose Workspace progress must project exactly one fixture Workgraph');
    assert(initial.snapshot.progressExecutionAuthority==='NONE','FCF-03 Purpose Workspace progress gained execution authority');
    assert(await root.locator('.purpose-workspace-evolution__progress[data-state="CURRENT"]').count()===1,'FCF-03 current progress surface is unavailable');
    assert(await root.getByRole('heading',{name:'Ready',exact:true}).count()===1,'FCF-03 Ready progress lane is not human-visible');
    assert(await root.getByText('Prepare the next bounded feature step',{exact:true}).count()===1,'FCF-03 current work purpose is not human-visible');
    assert(await root.locator('.purpose-workspace-evolution__task').count()===3,'FCF-02 Purpose Workspace task projection is incomplete');
    const shellGeometry=await page.evaluate(()=>{
      const title=document.querySelector('#evolutionActiveSurfaceTitle'),close=document.querySelector('#evolutionActiveSurfaceClose');
      const t=title?.getBoundingClientRect(),c=close?.getBoundingClientRect();
      return{
        title:(title?.textContent??'').trim(),
        titleVisible:Boolean(t&&t.width>0&&t.height>0),
        closeVisible:Boolean(c&&c.width>0&&c.height>0),
        closeWidth:c?.width??0,
        closeHeight:c?.height??0
      };
    });
    assert(shellGeometry.titleVisible&&shellGeometry.title.length>0,'FCF-02 Purpose Workspace shell title is not readable');
    assert(shellGeometry.closeVisible&&shellGeometry.closeWidth>=48&&shellGeometry.closeHeight>=48,'FCF-02 Purpose Workspace Close target is below 48px');
    assert(await page.evaluate((expected)=>matchMedia('(prefers-reduced-motion: reduce)').matches===expected,reducedMotion),'FCF-02 Purpose Workspace motion preference mismatch');
    checks.push({
      name:'default-source-shell-and-motion-truth',
      ...shellGeometry,
      reducedMotion,
      sourceRegistrationState:initial.snapshot.sourceRegistrationState,
      sourceFoundationRegistrationState:initial.snapshot.sourceFoundationRegistrationState,
      progressState:initial.snapshot.progressState,
      progressProjectRef:initial.snapshot.progressProjectRef,
      progressGraphCount:initial.snapshot.progressGraphCount,
      progressExecutionAuthority:initial.snapshot.progressExecutionAuthority,
      readyLaneVisible:true
    });
    await capture('default-do','CANONICAL_PURPOSE_WORKSPACE_SOURCE__NO_EFFECTS');

    const provenanceBefore=await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot());
    assert(provenanceBefore.provenance?.journalRelationState==='UNLINKED','FCF-06 visual fixture must begin from an unlinked local construction session');
    const provenanceReceipt=await page.evaluate(({draftRef,expectedRevision})=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.transactDraft({
      transactionRef:'transaction.browser-integration.fcf06.related-journal.link',
      draftRef,
      operationRef:'operation.vexlife.draft-surface.provenance.journal.set',
      expectedRevision,
      payload:{journalTarget:{
        targetClass:'SYNTHETIC_EVENT',
        pageRef:'page.journal.synthetic.fcf06-visual-witness',
        eventRef:'event.synthetic.fcf06-visual-witness',
        sourceRef:'source.synthetic.fcf06-visual-witness'
      }}
    }),{draftRef:provenanceBefore.draftRef,expectedRevision:provenanceBefore.draftRevision});
    assert(provenanceReceipt.disposition==='APPLIED'&&provenanceReceipt.nextRevision===provenanceBefore.draftRevision+1,'FCF-06 visual provenance fixture did not apply exactly once');
    assert(provenanceReceipt.permissionRef==='permission.none'&&provenanceReceipt.authorityClassRef==='authority.draft'&&provenanceReceipt.effectClass==='LOCAL_DRAFT','FCF-06 visual provenance fixture escaped the local-draft action membrane');
    assert(provenanceReceipt.externalEffect===false&&provenanceReceipt.canonicalRegistryMutation===false&&provenanceReceipt.save===false&&provenanceReceipt.deploy===false&&provenanceReceipt.publish===false,'FCF-06 visual provenance fixture gained a product or publication effect');
    const linkedProvenance=await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot());
    const relatedJournal=root.locator('.purpose-workspace-evolution__related-journal');
    assert(linkedProvenance.provenance?.journalRelationState==='LINKED_REFERENCE_ONLY','FCF-06 linked visual state did not remain reference-only');
    assert(linkedProvenance.provenance?.JournalAuthority===false&&linkedProvenance.provenance?.MemoryAuthority===false&&linkedProvenance.provenance?.canonicalFeatureAuthority===false,'FCF-06 linked visual state gained forbidden authority');
    assert(await relatedJournal.isVisible(),'FCF-06 Related Journal disclosure is not human-visible when linked');
    const relatedJournalText=(await relatedJournal.textContent())??'';
    for(const token of ['REFERENCE ONLY','Related Journal','SYNTHETIC_EVENT','page.journal.synthetic.fcf06-visual-witness','event.synthetic.fcf06-visual-witness','source.synthetic.fcf06-visual-witness']){
      assert(relatedJournalText.includes(token),`FCF-06 Related Journal visual witness is missing ${token}`);
    }
    const linkedOverflow=await root.evaluate((node)=>Math.max(0,document.documentElement.scrollWidth-innerWidth,node.scrollWidth-node.clientWidth));
    assert(linkedOverflow<=1,'FCF-06 linked Related Journal visual witness overflows its viewport');
    assert(await root.getByRole('button',{name:/save|deploy|publish/i}).count()===0,'FCF-06 linked visual state exposed Save/Deploy/Publish');
    await relatedJournal.scrollIntoViewIfNeeded();
    const relatedJournalGeometry=await relatedJournal.evaluate((element)=>{
      const rect=element.getBoundingClientRect();
      return{
        top:rect.top,
        bottom:rect.bottom,
        height:rect.height,
        intersectsViewport:rect.height>0&&rect.bottom>0&&rect.top<innerHeight
      };
    });
    assert(relatedJournalGeometry.intersectsViewport,'FCF-06 Related Journal screenshot target is outside the viewport');
    await capture('related-journal-linked','SYNTHETIC_FCF06_REFERENCE_ONLY_PROVENANCE__NO_JOURNAL_OR_MEMORY_MUTATION');

    const provenanceClear=await page.evaluate(({draftRef,expectedRevision})=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.transactDraft({
      transactionRef:'transaction.browser-integration.fcf06.related-journal.clear',
      draftRef,
      operationRef:'operation.vexlife.draft-surface.provenance.journal.set',
      expectedRevision,
      payload:{journalTarget:null}
    }),{draftRef:linkedProvenance.draftRef,expectedRevision:linkedProvenance.draftRevision});
    assert(provenanceClear.disposition==='APPLIED','FCF-06 disposable visual provenance fixture did not clear through the same local transaction membrane');
    const provenanceAfter=await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot());
    assert(provenanceAfter.provenance?.journalRelationState==='UNLINKED'&&await relatedJournal.isHidden(),'FCF-06 disposable visual provenance fixture leaked into later Purpose Workspace captures');
    checks.push({
      name:'fcf06-reference-only-related-journal-linked-visual-witness',
      state:'PASS',
      viewport,
      linkedOverflow,
      relatedJournalGeometry,
      targetClass:linkedProvenance.provenance.journalTargetOrNull?.targetClass??null,
      journalAuthority:linkedProvenance.provenance.JournalAuthority,
      memoryAuthority:linkedProvenance.provenance.MemoryAuthority,
      canonicalFeatureAuthority:linkedProvenance.provenance.canonicalFeatureAuthority,
      save:false,
      deploy:false,
      publish:false
    });

    await root.locator('.purpose-workspace-evolution__progress').scrollIntoViewIfNeeded();
    await capture('progress-current','CANONICAL_INTENT_WORKGRAPH_PROGRESS__NO_EFFECTS');
    await root.evaluate((node)=>{node.scrollTop=0;});

    const understand=page.getByRole('button',{name:'UNDERSTAND',exact:true});
    await understand.click();
    assert(await root.locator('.purpose-workspace-evolution__stage').count()===5,'FCF-02 pointer UNDERSTAND did not reveal the accepted five-stage process');
    assert((await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot().semanticDepth))==='UNDERSTAND','FCF-02 pointer UNDERSTAND did not update presentation depth');
    await capture('understand-pointer','CANONICAL_PURPOSE_WORKSPACE_SOURCE__NO_EFFECTS');

    await understand.press('Tab');
    const keyboardTarget=await page.evaluate(()=>({value:document.activeElement?.dataset?.value??null,text:(document.activeElement?.textContent??'').trim()}));
    assert(keyboardTarget.value==='STEWARD','FCF-02 semantic depth controls do not expose expected keyboard order');
    await page.keyboard.press('Enter');
    assert(await root.locator('.purpose-workspace-evolution__steward-card').count()===4,'FCF-02 keyboard STEWARD did not reveal accepted stewardship roles');
    const steward=await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot());
    assert(steward.semanticDepth==='STEWARD'&&steward.effects===false,'FCF-02 keyboard STEWARD changed semantic/effect truth');
    await capture('steward-keyboard','CANONICAL_PURPOSE_WORKSPACE_SOURCE__NO_EFFECTS');

    const inputs=await page.evaluate(()=>globalThis.__VEXLIFE_FCF02_PURPOSE_INPUTS__);
    assert(inputs.some((event)=>event.type==='click'&&event.value==='UNDERSTAND'&&event.trusted),'FCF-02 trusted pointer UNDERSTAND witness missing');
    assert(inputs.some((event)=>event.type==='keydown'&&event.key==='Enter'&&event.value==='STEWARD'&&event.trusted),'FCF-02 trusted keyboard STEWARD witness missing');
    checks.push({name:'trusted-pointer-and-keyboard-depth-navigation',keyboardTarget,events:inputs});

    await page.locator('#evolutionActiveSurfaceClose').click();
    await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.uxProjectionShell.snapshot().activeSurfaceRef===null);
    const after=await page.evaluate(()=>({
      contextProjection:globalThis.__VEXLIFE_APP__.state.contextProjection,
      workspaceOpen:globalThis.__VEXLIFE_APP__.state.workspaceOpen,
      frame:JSON.stringify(globalThis.__VEXLIFE_APP__.navigation.semanticFrame()),
      journey:JSON.stringify(globalThis.__VEXLIFE_APP__.navigation.fullJourney())
    }));
    assert(JSON.stringify(after)===JSON.stringify(before),'FCF-02 Purpose Workspace presentation mutated contextual Projects or Journey');
    assert(errors.consoleErrors.length===0&&errors.pageErrors.length===0,'FCF-02 Purpose Workspace browser errors were observed');
    assert(screenshots.length===5,'FCF-06 Purpose Workspace screenshot matrix is incomplete');
    checks.push({name:'close-preserves-contextual-projects-and-journey',state:'PASS'});
    return{state:'PASS',...binding,checks,screenshots,effects:false,progressState:steward.progressState,progressProjectRef:steward.progressProjectRef,progressGraphCount:steward.progressGraphCount,progressExecutionAuthority:steward.progressExecutionAuthority,sourceRegistrationState:steward.sourceRegistrationState,sourceFoundationRegistrationState:steward.sourceFoundationRegistrationState};
  }catch(error){
    return{state:'FAILED',...binding,checks,screenshots,error:error instanceof Error?error.message:String(error)};
  }finally{
    await page.evaluate(async()=>{
      const app=globalThis.__VEXLIFE_APP__;
      await app?.uxProjectionShell?.closeEvolutionActiveSurface('FCF02_PURPOSE_WORKSPACE_PROOF_FINALLY');
      await app?.uxProjectionShell?.setProjection('REFERENCE_PROJECTION');
    }).catch(()=>{});
  }
}

async function runFurnishingHomeProductProof(page, viewport, errors) {
  const checks = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const turnRequests = [];
  const onRequest = (request) => {
    if (new URL(request.url()).pathname === '/api/v1/companion/turn') turnRequests.push(request.url());
  };
  page.on('request', onRequest);
  try {
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__), null, { timeout: 30000 });
    await page.evaluate(() => globalThis.__VEXLIFE_APP__.projectFrame());
    const initial = await page.evaluate(() => {
      const app = globalThis.__VEXLIFE_APP__;
      const host = document.querySelector('#furnishingHome');
      const talk = document.querySelector('#homeTalkToVex');
      const resume = document.querySelector('#homeContinueOpen');
      const availability = app.healthCompanionAvailability();
      const availabilityState = availability?.availabilityState ?? 'UNKNOWN';
      const messageCount = [...app.messages.values()].reduce((count, list) => count + list.length, 0);
      const statusKeys = ['READY','RECOVERABLE','HELD','UNKNOWN'].map((state) => app.homeCompanionStatusKey(state));
      return {
        locale: document.documentElement.lang || 'und',
        theme: document.documentElement.dataset.theme || 'default',
        frame: app.navigation.semanticFrame(),
        journeyLength: app.navigation.fullJourney().length,
        messageCount,
        homeHidden: host?.hidden ?? true,
        homeAriaHidden: host?.getAttribute('aria-hidden'),
        guideNodeRef: document.querySelector('#vexSummon')?.dataset.nodeRef ?? null,
        talkNodeRef: talk?.dataset.nodeRef ?? null,
        continueNodeRef: resume?.dataset.nodeRef ?? null,
        availabilityState,
        statusText: document.querySelector('#homeVexStatus')?.textContent ?? '',
        expectedStatusText: app.t(app.homeCompanionStatusKey(availabilityState)),
        statusKeys,
        talkHeight: talk?.getBoundingClientRect().height ?? 0,
        continueHeight: resume?.getBoundingClientRect().height ?? 0,
        libraryText: document.querySelector('#homeLibrary')?.textContent ?? '',
        horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth, (host?.scrollWidth ?? 0) - (host?.clientWidth ?? 0))
      };
    });
    assert(initial.homeHidden === false && initial.homeAriaHidden === 'false', 'VF03B Home furnishings are not visible on the Home frame');
    assert(initial.guideNodeRef === 'element.vex.summon', 'VF03B Guide identity drifted');
    assert(initial.talkNodeRef === 'element.vex.current-companion.open' && initial.talkNodeRef !== initial.guideNodeRef, 'VF03B Talk to Vex is not distinct from Guide');
    assert(initial.continueNodeRef === 'element.furnishing.continue.open-current', 'VF03B Continue element identity drifted');
    assert(initial.statusText === initial.expectedStatusText, 'VF03B Home Companion status diverges from canonical availability truth');
    assert(new Set(initial.statusKeys).size === 4, 'VF03B READY / RECOVERABLE / HELD / UNKNOWN copy collapsed');
    assert(initial.talkHeight >= 44 && initial.continueHeight >= 44, 'VF03B Home controls fell below the 44px target');
    assert(initial.horizontalOverflow <= 1, 'VF03B Home furnishings overflow horizontally');
    assert(initial.libraryText.length > 0 && !/vexstream/i.test(initial.libraryText), 'VF03B Library minted unavailable VexStream identity');
    checks.push('Home shows distinct source-bound Companion / Continue / Library furnishing controls');

    await page.locator('#surfaceMenuButton').click();
    await page.locator('#openConversation').click();
    await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.state.contextProjection === 'chat');
    const generic = await page.evaluate(() => {
      const app = globalThis.__VEXLIFE_APP__;
      return {
        frame: app.navigation.semanticFrame(),
        homeHidden: document.querySelector('#furnishingHome')?.hidden ?? false
      };
    });
    assert(generic.frame.projectRef === initial.frame.projectRef && generic.frame.threadRef === initial.frame.threadRef && generic.frame.channelRef === initial.frame.channelRef, 'VF03B generic Open conversation retargeted the current context');
    assert(generic.homeHidden === true, 'VF03B Home furnishings did not yield to contextual Conversation');
    await page.evaluate(() => globalThis.__VEXLIFE_APP__.returnToTerrain());
    await page.waitForFunction(() => document.querySelector('#furnishingHome')?.hidden === false);
    checks.push('generic Conversation preserves target and Home yields/restores');

    await page.locator('#homeContinueOpen').click();
    await page.waitForFunction(() => globalThis.__VEXLIFE_APP__.state.contextProjection === 'chat');
    const resumed = await page.evaluate(() => globalThis.__VEXLIFE_APP__.navigation.semanticFrame());
    assert(resumed.projectRef === initial.frame.projectRef && resumed.threadRef === initial.frame.threadRef && resumed.channelRef === initial.frame.channelRef, 'VF03B Continue did not reopen the exact current Conversation');
    await page.evaluate(() => globalThis.__VEXLIFE_APP__.returnToTerrain());
    await page.waitForFunction(() => document.querySelector('#furnishingHome')?.hidden === false);
    checks.push('Continue resumes exact current Conversation without invented recency');

    const beforeTalk = await page.evaluate(() => ({
      journeyLength: globalThis.__VEXLIFE_APP__.navigation.fullJourney().length,
      messageCount: [...globalThis.__VEXLIFE_APP__.messages.values()].reduce((count, list) => count + list.length, 0)
    }));
    await page.locator('#homeTalkToVex').click();
    await page.waitForFunction(() => {
      const state = globalThis.__VEXLIFE_APP__.state;
      return state.contextProjection === 'chat'
        && state.projectRef === 'project.self-development'
        && state.threadRef === 'thread.self-development.open-conversation'
        && state.channelRef === 'channel.self-development.companion';
    });
    const talked = await page.evaluate(() => {
      const app = globalThis.__VEXLIFE_APP__;
      const journey = app.navigation.fullJourney();
      return {
        frame: app.navigation.semanticFrame(),
        journeyLength: journey.length,
        lastJourney: journey.at(-1),
        messageCount: [...app.messages.values()].reduce((count, list) => count + list.length, 0),
        homeHidden: document.querySelector('#furnishingHome')?.hidden ?? false
      };
    });
    assert(talked.journeyLength === beforeTalk.journeyLength + 1, 'VF03B Talk to Vex recorded invisible intermediate navigation steps');
    assert(talked.lastJourney?.elementRef === 'element.vex.current-companion.open' && talked.lastJourney?.actionRef === 'action.view.select', 'VF03B Talk to Vex Journey provenance is not the visible Home portal');
    assert(talked.messageCount === beforeTalk.messageCount, 'VF03B Talk to Vex performed a model/message turn');
    assert(talked.homeHidden === true, 'VF03B Home furnishings remained visible over Companion Conversation');
    assert(turnRequests.length === 0, 'VF03B Home proof invoked the real Companion turn endpoint');
    checks.push('Talk to Vex is one visible atomic portal and performs no model turn');

    await page.evaluate(() => globalThis.__VEXLIFE_APP__.returnToTerrain());
    await page.waitForFunction(() => document.querySelector('#furnishingHome')?.hidden === false);
    const finalGeometry = await page.evaluate(() => {
      const host = document.querySelector('#furnishingHome');
      return {
        horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth, (host?.scrollWidth ?? 0) - (host?.clientWidth ?? 0)),
        actualViewport: { width: innerWidth, height: innerHeight }
      };
    });
    assert(finalGeometry.actualViewport.width === viewport.width && finalGeometry.actualViewport.height === viewport.height, 'VF03B Home viewport drifted');
    assert(finalGeometry.horizontalOverflow <= 1, 'VF03B Home overflowed after interaction walk');
    const png = await page.screenshot({ type: 'png', animations: 'disabled' });
    assert(png.length <= 1500000, 'VF03B Home screenshot exceeds bounded evidence size');
    return {
      state: 'PASS',
      evidenceClass: 'REAL_BROWSER_SYNTHETIC_REFERENCE_INPUT',
      viewport,
      sourceBoundAvailabilityState: initial.availabilityState,
      genericConversationPreservedTarget: true,
      continuePreservedTarget: true,
      talkToVexPortal: {
        projectRef: talked.frame.projectRef,
        threadRef: talked.frame.threadRef,
        channelRef: talked.frame.channelRef,
        elementRef: talked.lastJourney?.elementRef ?? null,
        actionRef: talked.lastJourney?.actionRef ?? null
      },
      guideDistinct: true,
      realCompanionTurnExecuted: false,
      humanAccepted: false,
      checks,
      screenshot: {
        filename: `home-furnishings-default-${initial.locale}-${initial.theme}-${viewport.width}.png`,
        mimeType: 'image/png',
        encoding: 'base64',
        bytes: png.length,
        sha256: createHash('sha256').update(png).digest('hex'),
        data: png.toString('base64')
      },
      consoleErrors: [...errors.consoleErrors],
      pageErrors: [...errors.pageErrors]
    };
  } catch (error) {
    return {
      state: 'FAILED',
      evidenceClass: 'REAL_BROWSER_SYNTHETIC_REFERENCE_INPUT',
      viewport,
      humanAccepted: false,
      realCompanionTurnExecuted: false,
      checks,
      consoleErrors: [...errors.consoleErrors],
      pageErrors: [...errors.pageErrors],
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    page.off('request', onRequest);
  }
}

async function runVesselStudioPracticumProof(browser,serverUrl){
  const run=async(viewport,reducedMotion)=>{
    const page=await browser.newPage({viewport}),consoleErrors=[],pageErrors=[],requests=[];
    page.on('console',(message)=>{if(message.type()==='error')consoleErrors.push(message.text())});
    page.on('pageerror',(error)=>pageErrors.push(error.message));
    page.on('request',(request)=>requests.push(request.url()));
    try{
      await page.emulateMedia({reducedMotion:reducedMotion?'reduce':'no-preference'});
      await page.goto(serverUrl+'/reference/browser/vessel-studio/index.html',{waitUntil:'networkidle',timeout:30000});
      await page.waitForFunction(()=>document.documentElement.dataset.vesselStudioReady==='true',null,{timeout:30000});
      await page.selectOption('#avatarOption','vessel-option.synthetic.avatar.spark');
      await page.locator('#avatarPreview').click();
      await page.locator('#avatarUse').click();
      await page.selectOption('#colorOption','vessel-option.synthetic.color.sky');
      await page.selectOption('#glowOption','vessel-option.synthetic.glow.pulse');
      await page.locator('#colorGlowUse').click();
      await page.selectOption('#voiceOption','voice-profile.synthetic.gentle');
      await page.locator('#voicePreview').click();
      await page.locator('#voiceUse').click();
      await page.locator('#namePresentation').fill('Vex');
      await page.locator('#nameUse').click();
      await page.selectOption('#environmentOption','environment.synthetic.starlit-studio');
      await page.locator('#environmentUse').click();
      await page.locator('#reviewOffer').click();
      const observed=await page.evaluate(()=>{
        const api=globalThis.__VEXLIFE_VESSEL_STUDIO__,root=document.querySelector('#vesselStudioPracticum'),offer=document.querySelector('#vesselOfferReview'),rect=offer.getBoundingClientRect();
        return{snapshot:api.snapshot(),horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-innerWidth,root.scrollWidth-root.clientWidth),offerGeometry:{top:rect.top,bottom:rect.bottom,height:rect.height,intersectsViewport:rect.height>0&&rect.bottom>0&&rect.top<innerHeight},reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches};
      });
      const externalRequests=requests.filter((value)=>{const url=new URL(value);return url.hostname!=='127.0.0.1'||url.protocol!=='http:'});
      const png=await page.screenshot({type:'png',fullPage:true,animations:'disabled'});
      const state=observed.snapshot.offerStatus==='REFERENCE_ONLY_READY'&&observed.snapshot.effects===false&&observed.snapshot.MemoryAuthority===false&&observed.snapshot.modelRuntimeAuthority===false&&observed.snapshot.save===false&&observed.snapshot.deploy===false&&observed.snapshot.publish===false&&observed.horizontalOverflow<=1&&consoleErrors.length===0&&pageErrors.length===0&&externalRequests.length===0?'PASS':'FAILED';
      return{state,viewport,reducedMotion,consoleErrors,pageErrors,externalRequests,horizontalOverflow:observed.horizontalOverflow,offerGeometry:observed.offerGeometry,snapshot:observed.snapshot,screenshots:[{filename:'vessel-studio-offer-reference-'+viewport.width+'.png',mimeType:'image/png',encoding:'base64',bytes:png.length,sha256:createHash('sha256').update(png).digest('hex'),data:png.toString('base64'),inputProvenance:'SYNTHETIC_FCF08_REFERENCE_ONLY_VESSEL_OPTIONS'}]};
    }finally{await page.close()}
  };
  const desktop=await run({width:1440,height:1000},false),compact=await run({width:390,height:844},true);
  return{state:desktop.state==='PASS'&&compact.state==='PASS'?'PASS':'FAILED',desktop,compact,consoleErrors:[...desktop.consoleErrors,...compact.consoleErrors],pageErrors:[...desktop.pageErrors,...compact.pageErrors],screenshots:[...desktop.screenshots,...compact.screenshots],effects:false};
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
  const integrationHome = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-browser-integration-home-')));
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
  seedFcf03ProgressFixture(integrationHome);

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
    // The page starts the full integration suite itself; DOM readiness is the navigation predicate and the explicit integration promise is the completion predicate.
    await page.goto(`${serverUrl}/reference/browser/?integration=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
        // Structural proofs deliberately exercise resizing and presentation state.
        // Product evidence must begin in a fresh browser context, not inherit
        // their tiny-panel/drag fixtures or a prior synthetic interaction state.
        const productPage=await browser.newPage({viewport});
        let productExperience;
        productPage.on('console',(message)=>{if(message.type()==='error')proofConsoleErrors.push(message.text());});
        productPage.on('pageerror',(error)=>proofPageErrors.push(error.message));
        try{
          await productPage.goto(serverUrl+'/reference/browser/',{waitUntil:'networkidle',timeout:30000});
          await productPage.waitForFunction(()=>Boolean(globalThis.__VEXLIFE_APP__),null,{timeout:30000});
          productExperience=await runJournalProductProof(productPage,viewport,{consoleErrors:proofConsoleErrors,pageErrors:proofPageErrors});
        }finally{await productPage.close();}
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
            if(channel.roleKey==='companion'){
              assert(root.dataset.presentationMode==='CONTINUOUS_VEX_RELATIONSHIP','Companion Conversation must use continuous Vex presentation');
              assert(root.querySelector('.conversation-evolution__hero h2')?.textContent==='Vex','Companion Conversation primary title must normalize to Vex');
              assert(root.querySelector('.conversation-evolution__address')===null,'Companion Conversation must keep implementation addressing out of primary chrome');
            }else{
              assert(root.dataset.presentationMode==='EXPLICIT_DIRECT_ADDRESS','Non-Companion direct Conversation must preserve explicit addressing');
              assert(root.querySelector('.conversation-evolution__hero h2')?.textContent===app.t(channel.labelRef),'Non-Companion direct Conversation must preserve its canonical channel identity');
              assert(root.querySelector('.conversation-evolution__address')!==null,'Non-Companion direct Conversation must retain primary addressing truth');
            }
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
            if(channel.roleKey==='companion'){
              assert(root.querySelector('.conversation-evolution__context-routes .conversation-evolution__channels')!==null,'Companion routing controls must remain available contextually');
            }else{
              assert(root.querySelector(':scope > .conversation-evolution__channels')!==null,'Non-Companion direct routing controls must remain explicitly available');
            }
          }
          assert(matchMedia('(prefers-reduced-motion: reduce)').matches===reducedMotionValue,'Conversation motion media state mismatch');
          const feed=root.querySelector('.conversation-evolution__feed'),activeBeforeScroll=shellOpen.activeSurfaceRef;if(feed){feed.scrollTop=Math.max(0,feed.scrollHeight-feed.clientHeight);feed.dispatchEvent(new Event('scroll'));await delay(12);}
          root.scrollTop=Math.max(0,root.scrollHeight-root.clientHeight);root.dispatchEvent(new Event('scroll'));await delay(12);
          const rootRect=root.getBoundingClientRect(),contextRect=contextInspector.lastElementChild.getBoundingClientRect();
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
        const productPage=await browser.newPage({viewport});
        let productExperience;
        productPage.on('console',(message)=>{if(message.type()==='error')proofConsoleErrors.push(message.text());});
        productPage.on('pageerror',(error)=>proofPageErrors.push(error.message));
        try{
          await productPage.emulateMedia({reducedMotion:reducedMotion?'reduce':'no-preference'});
          await productPage.goto(serverUrl+'/reference/browser/?projection=evolution',{waitUntil:'networkidle',timeout:30000});
          await productPage.waitForFunction(()=>Boolean(globalThis.__VEXLIFE_APP__),null,{timeout:30000});
          productExperience=await runConversationProductProof(productPage,viewport,{consoleErrors:proofConsoleErrors,pageErrors:proofPageErrors});
        }finally{await productPage.close();}
        return{viewport,viewportClass,proof,productExperience,consoleErrors:proofConsoleErrors,pageErrors:proofPageErrors};
      }finally{await proofPage.close();}
    };
    const conversationDesktop=await runConversationEvolutionViewportProof({width:1440,height:1000},'DESKTOP',false);
    const conversationCompact=await runConversationEvolutionViewportProof({width:390,height:844},'COMPACT',true);
    const runPurposeWorkspaceViewportProof=async(viewport,viewportClass,reducedMotion)=>{
      const proofConsoleErrors=[],proofPageErrors=[],productPage=await browser.newPage({viewport});
      productPage.on('console',(message)=>{if(message.type()==='error')proofConsoleErrors.push(message.text());});
      productPage.on('pageerror',(error)=>proofPageErrors.push(error.message));
      try{
        await productPage.goto(serverUrl+'/reference/browser/',{waitUntil:'networkidle',timeout:30000});
        await productPage.waitForFunction(()=>Boolean(globalThis.__VEXLIFE_APP__?.purposeWorkspaceEvolution),null,{timeout:30000});
        const productExperience=await runPurposeWorkspaceProductProof(productPage,viewport,{consoleErrors:proofConsoleErrors,pageErrors:proofPageErrors},reducedMotion);
        return{viewport,viewportClass,proof:{state:productExperience.state},productExperience,consoleErrors:proofConsoleErrors,pageErrors:proofPageErrors};
      }finally{await productPage.close();}
    };
    const runFurnishingHomeViewportProof=async(viewport,viewportClass)=>{
      const proofConsoleErrors=[],proofPageErrors=[],productPage=await browser.newPage({viewport});
      productPage.on('console',(message)=>{if(message.type()==='error')proofConsoleErrors.push(message.text());});
      productPage.on('pageerror',(error)=>proofPageErrors.push(error.message));
      try{
        await productPage.goto(serverUrl+'/reference/browser/',{waitUntil:'networkidle',timeout:30000});
        await productPage.waitForFunction(()=>Boolean(globalThis.__VEXLIFE_APP__),null,{timeout:30000});
        const productExperience=await runFurnishingHomeProductProof(productPage,viewport,{consoleErrors:proofConsoleErrors,pageErrors:proofPageErrors});
        return{viewport,viewportClass,proof:{state:productExperience.state},productExperience,consoleErrors:proofConsoleErrors,pageErrors:proofPageErrors};
      }finally{await productPage.close();}
    };
    const furnishingHomeDesktop=await runFurnishingHomeViewportProof({width:1440,height:1000},'DESKTOP');
    const furnishingHomeCompact=await runFurnishingHomeViewportProof({width:390,height:844},'COMPACT');
    const purposeWorkspaceDesktop=await runPurposeWorkspaceViewportProof({width:1440,height:1000},'DESKTOP',false);
    const purposeWorkspaceCompact=await runPurposeWorkspaceViewportProof({width:390,height:844},'COMPACT',true);
    const vesselStudioPracticum=await runVesselStudioPracticumProof(browser,serverUrl);
    const structuralViewportProofs=[journalDesktop,journalCompact,conversationDesktop,conversationCompact];
    const viewportProofs=[...structuralViewportProofs,purposeWorkspaceDesktop,purposeWorkspaceCompact,furnishingHomeDesktop,furnishingHomeCompact];
    const allConsoleErrors = [...consoleErrors, ...compactConsoleErrors, ...viewportProofs.flatMap((item) => item.consoleErrors), ...vesselStudioPracticum.consoleErrors];
    const allPageErrors = [...pageErrors, ...compactPageErrors, ...viewportProofs.flatMap((item) => item.pageErrors), ...vesselStudioPracticum.pageErrors];
    const requiredProofs = [
      integration, livedDCompact, q2Compact, q2ViewportInverse, q5Compact, q5WorkspaceInverse,
      ...structuralViewportProofs.map((item) => item.proof),
      ...viewportProofs.map((item) => item.productExperience), vesselStudioPracticum
    ];
    const state = requiredProofs.every((proof) => proof?.state === 'PASS') && allConsoleErrors.length === 0 && allPageErrors.length === 0 ? 'PASS' : 'FAILED';
    finish({
      ...baseReceipt,
      state,
      currentness: 'CURRENT',
      browser: { name: browser.browserType().name(), version: browser.version() },
      consoleErrors: allConsoleErrors,
      pageErrors: allPageErrors,
      integration,
      journalDesktop,
      journalCompact,
      conversationDesktop,
      conversationCompact,
      purposeWorkspaceDesktop,
      purposeWorkspaceCompact,
      furnishingHomeDesktop,
      furnishingHomeCompact,
      vesselStudioPracticum,
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
