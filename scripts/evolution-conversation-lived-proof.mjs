#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectRepositoryEvidence } from '../src/core/repository-evidence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_URL = String(process.env.VEXLIFE_LIVED_BROWSER_URL ?? 'http://127.0.0.1:18110').replace(/\/$/u, '');
const OUTPUT_DIR = path.resolve(ROOT, process.env.VEXLIFE_EVOLUTION_CONVERSATION_PROOF_DIR ?? 'generated/health/evolution-conversation-lived');
const FIRST_PROMPT = process.env.VEXLIFE_EVOLUTION_CONVERSATION_FIRST_PROMPT
  ?? 'This is a lived VexLife interface proof. Reply with one short sentence acknowledging this first turn. Do not request tools or effects.';
const SECOND_PROMPT = process.env.VEXLIFE_EVOLUTION_CONVERSATION_SECOND_PROMPT
  ?? 'This is the second turn in the same VexLife conversation. Reply with one short sentence confirming continuity. Do not request tools or effects.';
const TARGET = Object.freeze({
  projectRef: 'project.self-development',
  threadRef: 'thread.self-development.open-conversation',
  channelRef: 'channel.self-development.companion',
  surfaceRef: 'surface.vexlife.conversation'
});
const SOURCE_ASSETS = Object.freeze([
  'reference/browser/app.js',
  'reference/browser/modules/chat-controller.js',
  'reference/browser/evolution/conversation-projection.js',
  'reference/browser/evolution/conversation.css'
]);

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyServedAssets() {
  const assets = [];
  for (const relativePath of SOURCE_ASSETS) {
    const local = fs.readFileSync(path.join(ROOT, relativePath));
    const response = await fetch(`${SERVER_URL}/${relativePath}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`served source asset ${relativePath} returned HTTP ${response.status}`);
    const served = Buffer.from(await response.arrayBuffer());
    const localSha256 = sha256(local);
    const servedSha256 = sha256(served);
    assert(localSha256 === servedSha256, `served source asset drift: ${relativePath}`);
    assets.push(Object.freeze({ relativePath, localSha256, servedSha256, exact: true }));
  }
  return Object.freeze(assets);
}

async function currentTurnSnapshot(page) {
  return page.evaluate(({ target }) => {
    const app = globalThis.__VEXLIFE_APP__;
    if (!app) throw new Error('canonical VexLife browser app is unavailable');
    const key = app.conversationKey(target.projectRef, target.threadRef, target.channelRef);
    const list = app.messages.get(key) ?? [];
    const realResponses = list.filter((message) => message.speakerKey === 'companion' && message.truthClass === 'CURRENT_LOCAL_MODEL');
    const last = realResponses.at(-1) ?? null;
    return {
      projectRef: app.chat.currentProject()?.projectRef ?? null,
      threadRef: app.chat.currentThread()?.threadRef ?? null,
      channelRef: app.chat.currentChannel()?.channelRef ?? null,
      roleKey: app.chat.currentChannel()?.roleKey ?? null,
      availabilityState: app.chat.companionAvailabilityState(),
      realResponseCount: realResponses.length,
      lastResponse: last ? {
        messageRef: last.messageRef,
        content: last.content,
        truthClass: last.truthClass,
        conversationHeadSha256: last.conversationHeadSha256,
        modelNameOrBoundedTestProfileRef: last.modelNameOrBoundedTestProfileRef
      } : null,
      presentationMode: document.querySelector('.conversation-evolution')?.dataset.presentationMode ?? null,
      title: document.querySelector('.conversation-evolution__hero h2')?.textContent?.trim() ?? null,
      activeSurfaceRef: app.uxProjectionShell.snapshot().activeSurfaceRef,
      projection: app.uxProjectionShell.snapshot().projection
    };
  }, { target: TARGET });
}

async function sendThroughEvolutionComposer(page, prompt, priorResponseCount) {
  const input = page.locator('.conversation-evolution__input');
  const send = page.locator('.conversation-evolution__send');
  await input.fill(prompt);
  await send.click();
  await page.waitForFunction(({ target, priorResponseCount }) => {
    const app = globalThis.__VEXLIFE_APP__;
    if (!app) return false;
    const key = app.conversationKey(target.projectRef, target.threadRef, target.channelRef);
    const list = app.messages.get(key) ?? [];
    return list.filter((message) => message.speakerKey === 'companion' && message.truthClass === 'CURRENT_LOCAL_MODEL').length > priorResponseCount;
  }, { target: TARGET, priorResponseCount }, { timeout: 180000 });
  const snapshot = await currentTurnSnapshot(page);
  assert(snapshot.lastResponse?.truthClass === 'CURRENT_LOCAL_MODEL', 'Evolution Conversation did not receive one current local-model response');
  assert(/^[0-9a-f]{64}$/u.test(snapshot.lastResponse?.conversationHeadSha256 ?? ''), 'real Companion response is missing one durable conversation head');
  assert(typeof snapshot.lastResponse?.modelNameOrBoundedTestProfileRef === 'string' && snapshot.lastResponse.modelNameOrBoundedTestProfileRef.length > 0, 'real Companion response is missing model identity');
  const visibleBodies = await page.locator('.conversation-evolution__message-body').allTextContents();
  assert(visibleBodies.includes(snapshot.lastResponse.content), 'real Companion response did not render in the Evolution Conversation feed');
  return snapshot;
}

let playwright;
try {
  playwright = await import('playwright');
} catch (error) {
  console.error(`Playwright is required for the lived Evolution Conversation proof: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

if (playwright) {
  const repository = collectRepositoryEvidence(ROOT);
  const servedAssets = await verifyServedAssets();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  let browser;
  const receipt = {
    schemaVersion: 'vexlife.evolution-conversation-lived-proof/v1',
    truthClass: 'LIVED_LOCAL_MODEL_INTERFACE_PROOF',
    candidateHeadSha: repository.git.candidateHeadSha,
    candidateTreeSha: repository.git.candidateTreeSha,
    testedCheckoutSha: repository.git.checkoutSha,
    testedServerUrl: SERVER_URL,
    target: TARGET,
    servedAssets,
    effects: {
      sourceMutation: false,
      externalEffect: false,
      conversationEventsWritten: true,
      modelInferencePerformed: true
    },
    turns: [],
    screenshots: [],
    formedAt : new Date().toISOString()
  };
  try {
    browser = await playwright.chromium.launch({ headless: false });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`${SERVER_URL}/reference/browser/?projection=evolution`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__), null, { timeout: 30000 });
    const binding = await page.evaluate(async ({ target }) => {
      const app = globalThis.__VEXLIFE_APP__;
      const project = app.projects.find((item) => item.projectRef === target.projectRef);
      const thread = project?.threads.find((item) => item.threadRef === target.threadRef);
      if (!project || !thread) throw new Error('canonical Self Development Conversation source is unavailable');
      app.chat.selectThread(project, thread, 'element.thread.open-conversation');
      const companion = app.chat.channelsForThread(project.projectRef, thread.threadRef)
        .find((item) => item.channelRef === target.channelRef && item.kind === 'DIRECT' && item.roleKey === 'companion');
      if (!companion) throw new Error('canonical direct Companion relationship unavailable');
      app.chat.selectChannel(companion, 'element.channel.companion');
      const projection = await app.uxProjectionShell.setProjection('EVOLUTION_PROJECTION');
      if (projection.state !== 'PASS') throw new Error(`Evolution projection unavailable: ${projection.reason ?? projection.state}`);
      const opened = await app.uxProjectionShell.openEvolutionSurface(target.surfaceRef);
      if (opened.state !== 'OPEN') throw new Error(`Evolution Conversation did not open: ${opened.state}`);
      await app.chat.refreshCompanionAvailability();
      return {
        availabilityState: app.chat.companionAvailabilityState(),
        projection: app.uxProjectionShell.snapshot().projection,
        activeSurfaceRef: app.uxProjectionShell.snapshot().activeSurfaceRef
      };
    }, { target: TARGET });
    assert(binding.availabilityState === 'READY', `real Companion is not READY (${binding.availabilityState})`);
    assert(binding.projection === 'EVOLUTION_PROJECTION', 'Evolution projection is not active');
    assert(binding.activeSurfaceRef === TARGET.surfaceRef, 'Evolution Conversation surface is not active');
    const initial = await currentTurnSnapshot(page);
    assert(initial.roleKey === 'companion', 'lived proof is not on the canonical Companion relationship');
    assert(initial.presentationMode === 'CONTINUOUS_VEX_RELATIONSHIP', 'Evolution Conversation is not presenting the continuous Vex relationship');
    assert(initial.title === 'Vex', 'Evolution Conversation relationship title is not Vex');
    const beforeShot = path.join(OUTPUT_DIR, 'before-first-turn.png');
    await page.screenshot({ path: beforeShot, type: 'png', fullPage: true, animations: 'disabled' });
    receipt.screenshots.push({ file: path.basename(beforeShot), sha256: sha256(fs.readFileSync(beforeShot)) });

    const first = await sendThroughEvolutionComposer(page, FIRST_PROMPT, initial.realResponseCount);
    receipt.turns.push({ ordinal: 1, prompt: FIRST_PROMPT, response: first.lastResponse });
    const firstShot = path.join(OUTPUT_DIR, 'after-first-turn.png');
    await page.screenshot({ path: firstShot, type: 'png', fullPage: true, animations: 'disabled' });
    receipt.screenshots.push({ file: path.basename(firstShot), sha256: sha256(fs.readFileSync(firstShot)) });

    const second = await sendThroughEvolutionComposer(page, SECOND_PROMT);
    assert(second.lastResponse.conversationHeadSha256 !== first.lastResponse.conversationHeadSha256, 'second real Companion turn did not advance the durable conversation head');
    assert(second.projectRef === first.projectRef && second.threadRef === first.threadRef && second.channelRef === first.channelRef, 'second turn left the canonical Companion relationship');
    receipt.turns.push({ ordinal: 2, prompt: SECOND_PROMPT, response: second.lastResponse });
    const secondShot = path.join(OUTPUT_DIR, 'after-second-turn.png');
    await page.screenshot({ path: secondShot, type: 'png', fullPage: true, animations: 'disabled' });
    receipt.screenshots.push({ file: path.basename(secondShot), sha256: sha256(fs.readFileSync(secondShot)) });

    assert(consoleErrors.length === 0, `browser console errors were observed: ${consoleErrors.join(' | ')}`);
    assert(pageErrors.length === 0, `browser page errors were observed: ${pageErrors.join(' | ')}`);
    receipt.consoleErrors = consoleErrors;
    receipt.pageErrors = pageErrors;
    receipt.state = 'PASS';
    receipt.completedAt = new Date().toISOString();
  } catch (error) {
    receipt.state = 'FAILED';
    receipt.error = error instanceof Error ? error.message : String(error);
    receipt.completedAt = new Date().toISOString();
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    const receiptPath = path.join(OUTPUT_DIR, 'receipt.json');
    writeJson(receiptPath, receipt);
    console.log(JSON.stringify({ ...receipt, outputDir: OUTPUT_DIR, receiptPath }, null, 2));
  }
}

// [VXG RealForever]
