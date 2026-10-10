#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connectPreview, evaluate, sleep, waitFor } from './cdp-client.mjs';

const args = process.argv.slice(2);
const arg = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const runtimePath = arg('--runtime') ?? path.join(os.homedir(), '.vexlife-preview', 'runtime.json');
const walkPath = arg('--walk');
const mode = arg('--mode') ?? 'walk';
if (!walkPath) throw new Error('Usage: vexwalk-runner.mjs --walk <json> [--runtime <runtime.json>] [--mode walk|proof]');
const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
const walk = JSON.parse(fs.readFileSync(walkPath, 'utf8'));
if (walk.previewRef && runtime.previewRef !== walk.previewRef) throw new Error('Runtime descriptor belongs to a different preview');
const humanDelay = Number(process.env.VEXWALK_STEP_DELAY_MS ?? walk.humanPacing?.defaultStepDelayMs ?? 3000);
const proofDelay = Number(walk.humanPacing?.proofStepDelayMs ?? 0);
const stepDelayMs = Math.max(0, mode === 'proof' ? proofDelay : humanDelay || 0);
const json = (value) => JSON.stringify(value);

async function click(cdp, selector) {
  const result = await evaluate(cdp, `(()=>{const element=document.querySelector(${json(selector)});if(!element)return {ok:false,reason:'MISSING'};if(element.disabled||element.getAttribute('aria-disabled')==='true')return {ok:false,reason:'DISABLED'};const rect=element.getBoundingClientRect();const hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);if(!(hit===element||element.contains(hit)))return {ok:false,reason:'INTERCEPTED',hit:hit?.id??hit?.tagName??null};element.click();return {ok:true,elementRef:element.dataset.vexElementRef||element.dataset.terrainRef||element.dataset.nodeRef||element.id||null,actionRef:element.dataset.vexActionRef||null,text:(element.textContent||'').trim()}})()`);
  if (!result?.ok) throw new Error(`Click failed for ${selector}: ${JSON.stringify(result)}`);
  return result;
}

async function snapshot(cdp) {
  return await evaluate(cdp, `(()=>{const app=globalThis.__VEXLIFE_APP__;const shell=app?.uxProjectionShell?.snapshot?.()??null;const journey=app?.navigation?.fullJourney?.()??[];const body=document.querySelector('#evolutionActiveSurfaceBody [data-surface-ref]')?.dataset.surfaceRef??null;const label=[...document.querySelectorAll('#terrainBreadcrumb button')].find((button)=>button.getAttribute('aria-current')==='true')?.textContent?.trim()??null;return {activeSurfaceRef:shell?.activeSurfaceRef??body,bodySurfaceRef:body,terrainLabel:label,journeyCount:journey.length,journeyEvent:journey.at(-1)??null,surfaceBackDepth:shell?.surfaceBackDepth??0};})()`);
}

const cdp = await connectPreview({ debugPort: runtime.debugPort, url: runtime.url });
const receipts = [];
try {
  await waitFor(cdp, `document.readyState==='complete' && !!globalThis.__VEXLIFE_APP__`, 'VexLife application initialization', 12000);
  if (walk.start?.resetToRoot !== false) {
    await evaluate(cdp, `(async()=>{
      const app=globalThis.__VEXLIFE_APP__;
      const waitTerrainIdle=async()=>{
        const deadline=Date.now()+2400;
        while(app?.terrain?.transitionSnapshot?.().phase!=='IDLE'){
          if(Date.now()>=deadline)throw new Error('VEXWALK_RESET_TERRAIN_TRANSITION_TIMEOUT');
          await new Promise((resolve)=>setTimeout(resolve,16));
        }
      };
      if(app?.state?.uxActiveSurfaceRef)await app.uxProjectionShell.closeEvolutionActiveSurface('VEXWALK_RESET');
      await waitTerrainIdle();
      if(app?.terrain?.currentRef?.()!==app?.terrain?.rootRef){
        const moved=await app.terrain.travel(app.terrain.rootRef,'out');
        if(moved===false)throw new Error('VEXWALK_RESET_TERRAIN_TRAVEL_REJECTED');
      }
      await waitTerrainIdle();
      return true;
    })()`);
  }
  if (walk.start?.expectedProjection) await waitFor(cdp, `document.querySelector('#app')?.dataset.uxProjection===${json(walk.start.expectedProjection)}`, 'declared start projection');
  if (walk.start?.terrainLabel) await waitFor(cdp, `[...document.querySelectorAll('#terrainBreadcrumb button')].some((button)=>button.getAttribute('aria-current')==='true'&&button.textContent.trim()===${json(walk.start.terrainLabel)})`, 'declared start Terrain');

  process.stdout.write(`[VexWalk ${walk.walkRef}]\n`);
  for (const [index, step] of walk.steps.entries()) {
    process.stdout.write(`${step.human}\n`);
    const before = await snapshot(cdp);
    const clicked = await click(cdp, step.selector);
    if (Object.hasOwn(step, 'expectedSurfaceRef')) {
      if (step.expectedSurfaceRef === null) {
        await waitFor(cdp, `globalThis.__VEXLIFE_APP__?.uxProjectionShell?.snapshot?.().activeSurfaceRef===null && !document.querySelector('#evolutionActiveSurfaceBody [data-surface-ref]')`, 'no active surface');
      } else {
        await waitFor(cdp, `(()=>{const shell=globalThis.__VEXLIFE_APP__?.uxProjectionShell?.snapshot?.().activeSurfaceRef??null;const body=document.querySelector('#evolutionActiveSurfaceBody [data-surface-ref]')?.dataset.surfaceRef??null;return shell===${json(step.expectedSurfaceRef)}&&body===${json(step.expectedSurfaceRef)}})()`, `surface ${step.expectedSurfaceRef}`);
      }
    }
    if (step.expectedTerrainLabel) await waitFor(cdp, `[...document.querySelectorAll('#terrainBreadcrumb button')].some((button)=>button.getAttribute('aria-current')==='true'&&button.textContent.trim()===${json(step.expectedTerrainLabel)})`, `Terrain ${step.expectedTerrainLabel}`);
    const after = await snapshot(cdp);
    const journeyChanged = after.journeyCount !== before.journeyCount;
    if (Object.hasOwn(step, 'expectJourneyMutation') && Boolean(step.expectJourneyMutation) !== journeyChanged) throw new Error(`Journey mutation mismatch for ${step.actionRef}`);
    if (step.expectedJourneyActionRef && after.journeyEvent?.actionRef !== step.expectedJourneyActionRef) throw new Error(`Expected Journey ${step.expectedJourneyActionRef}, observed ${after.journeyEvent?.actionRef ?? 'NONE'}`);
    const receipt = {
      schemaVersion: 'vexlife-assortment.preview-action-receipt/v1',
      previewRef: runtime.previewRef,
      walkRef: walk.walkRef,
      sequence: index + 1,
      human: step.human,
      actionRef: step.actionRef ?? clicked.actionRef,
      elementRef: step.elementRef ?? clicked.elementRef,
      interactionRef: step.interactionRef ?? 'interaction.preview.browser.click',
      expectedSurfaceRef: Object.hasOwn(step, 'expectedSurfaceRef') ? step.expectedSurfaceRef : null,
      observedSurfaceRef: after.activeSurfaceRef,
      terrainLabel: after.terrainLabel,
      journeyChanged,
      journeyEvent: journeyChanged ? after.journeyEvent : null,
      formedAt: new Date().toISOString(),
      state: 'PASS'
    };
    receipts.push(receipt);
    process.stdout.write(`  PASS action=${receipt.actionRef} observed=${receipt.observedSurfaceRef ?? 'HOME'} Journey=${journeyChanged ? after.journeyEvent?.actionRef : 'unchanged'}\n`);
    if (mode !== 'proof' && stepDelayMs > 0) await sleep(stepDelayMs);
  }
  if (runtime.logPath) {
    fs.mkdirSync(path.dirname(runtime.logPath), { recursive: true });
    fs.writeFileSync(runtime.logPath, receipts.map((receipt) => JSON.stringify(receipt)).join('\n') + '\n', 'utf8');
  }
} catch (error) {
  const failed = { schemaVersion:'vexlife-assortment.preview-action-failure/v1', previewRef:runtime.previewRef, walkRef:walk.walkRef, error:String(error?.stack || error), formedAt:new Date().toISOString() };
  if (runtime.logPath) fs.appendFileSync(runtime.logPath, `${JSON.stringify(failed)}\n`, 'utf8');
  throw error;
} finally { cdp.close(); }
