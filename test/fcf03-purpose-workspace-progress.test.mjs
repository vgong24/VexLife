import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  createIntentEnvelope,
  createIntentWorkgraph,
  createWorkNode
} from '../src/core/intent-workgraph.mjs';
import { persistIntentWorkgraphRuntimeSnapshot } from '../src/core/intent-workgraph-runtime-snapshot.mjs';
import { readJson } from '../src/core/utils.mjs';
import {
  BROWSER_INTENT_PROJECT_STATUS_PATH,
  projectBrowserIntentProjectStatus
} from '../scripts/serve-browser.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bundle=loadBlueprint(root);
const registry=bundle.intentRegistry;
const trustSnapshot=readJson(path.join(root,'blueprint/intent-trust-snapshot.json'));

function readyGraph(projectRef='project.self-development'){
  const intent=createIntentEnvelope({
    intentRef:'intent.fcf03.progress',
    originMessageRef:'message.fcf03.origin',
    originSpeakerRef:'person.vexlife.owner',
    recipientRoleRef:'role.vex.operations',
    projectRef,
    threadRef:'thread.fcf03.progress',
    channelRef:'channel.fcf03.progress',
    originalContentHash:'a'.repeat(64),
    desiredOutcome:{intentKey:'VALIDATE_WORKGRAPH',summary:'Show truthful current progress'},
    constraints:[],
    createdAt:'2026-09-28T00:00:00.000Z',
    sourceLineageRef:'lineage.fcf03.progress'
  },registry);
  const node=createWorkNode({
    workNodeRef:'work-node.fcf03.ready',
    rootIntentRef:intent.intentRef,
    parentWorkNodeRef:null,
    purpose:'Prepare the next bounded feature step',
    processRef:'process.vexlife.intent.validate-workgraph',
    state:'READY',
    dependencyRefs:[],
    childRefs:[],
    roleRef:'role.vex.operations',
    priorityClass:'NORMAL',
    contextPlanRef:null,
    applicableCultureRefs:['foundation.vexlife.state-relay.v1'],
    applicableLessonRefs:[],
    applicableBurdenReleaseRefs:[],
    capabilityEnvelopeRef:'capability-envelope.intent.contract-validation',
    effectEnvelopeRef:'effect-envelope.intent.no-effects',
    resourceEnvelopeRef:'resource-envelope.intent.deterministic-local-light',
    expectedTransitionRef:'expected-transition.intent.contract-current',
    completionGateRefs:['completion-gate.intent.contract-valid'],
    returnRouteRef:'return-route.intent.verify-transition',
    sourceRefs:['source.fcf03.progress'],
    createdAt:'2026-09-28T00:00:00.000Z'
  },registry);
  const transitions=[
    ['CAPTURED','DECOMPOSED'],
    ['DECOMPOSED','PLAN_VALIDATED'],
    ['PLAN_VALIDATED','READY']
  ].map(([priorState,nextState],sequence)=>({
    transitionRef:`transition.fcf03.progress.${sequence}`,
    workNodeRef:node.workNodeRef,
    sequence,
    priorState,
    nextState,
    reason:'FCF-03 deterministic progress fixture',
    actorRef:'vex.vexlife.intent-orchestration',
    actorRoleRef:'role.vex.operations',
    processRef:'process.vexlife.intent.verify-transition',
    sourceRefs:[`source.fcf03.transition.${sequence}`],
    createdAt:`2026-09-28T00:00:0${sequence+1}.000Z`
  }));
  const bindingRefs={
    capabilityEnvelopeRef:[node.capabilityEnvelopeRef],
    effectEnvelopeRef:[node.effectEnvelopeRef],
    resourceEnvelopeRef:[node.resourceEnvelopeRef],
    expectedTransitionRef:[node.expectedTransitionRef],
    completionGateRefs:[...node.completionGateRefs],
    returnRouteRef:[node.returnRouteRef]
  };
  return createIntentWorkgraph({
    graphRef:'intent-workgraph.fcf03.progress',
    intent,
    nodes:[node],
    transitions,
    bindingRefs,
    createdAt:'2026-09-28T00:00:00.000Z'
  },registry);
}

async function startServer(home){
  const child=spawn(process.execPath,['scripts/serve-browser.mjs'],{
    cwd:root,
    env:{...process.env,VEXLIFE_PORT:'0',VEXLIFE_HOME:home},
    stdio:['ignore','pipe','pipe']
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  const url=await Promise.race([
    new Promise((resolve,reject)=>{
      let err='';
      child.stderr.on('data',(chunk)=>{err+=chunk;});
      child.stdout.on('data',(chunk)=>{
        const match=chunk.match(/http:\/\/127\.0\.0\.1:\d+/u);
        if(match)resolve(match[0]);
      });
      child.once('error',reject);
      child.once('exit',(code)=>reject(new Error(`browser server exited ${code}: ${err}`)));
    }),
    delay(5000,undefined,{ref:false}).then(()=>{throw new Error('browser server did not become ready');})
  ]);
  return{child,url};
}

test('FCF-03 projects current Workgraph status by exact project without execution authority',()=>{
  const graph=readyGraph();
  const result=projectBrowserIntentProjectStatus({
    projectRef:'project.self-development',
    workgraphs:[graph],
    sourceBundle:bundle,
    trustSnapshot
  });
  assert.equal(result.state,'CURRENT');
  assert.equal(result.currentness,'CURRENT');
  assert.equal(result.projectRef,'project.self-development');
  assert.equal(result.effects,false);
  assert.equal(result.executionAuthority,'NONE');
  assert.equal(result.statusProjections.length,1);
  assert.equal(result.statusProjections[0].ready.length,1);
  assert.equal(result.statusProjections[0].ready[0].purpose,'Prepare the next bounded feature step');
  assert.equal(result.statusProjections[0].nextSafeAction.authority,'NO_EXECUTION_AUTHORITY');
  const empty=projectBrowserIntentProjectStatus({
    projectRef:'project.vexlife.root-hub',
    workgraphs:[graph],
    sourceBundle:bundle,
    trustSnapshot
  });
  assert.equal(empty.state,'CURRENT');
  assert.deepEqual(empty.statusProjections,[]);
});

test('FCF-03 real browser route and Purpose Workspace render one derived Ready lane',async t=>{
  const rawHome=fs.mkdtempSync(path.join(os.tmpdir(),'vexlife-fcf03-'));
  const home=fs.realpathSync.native(rawHome);
  t.after(()=>fs.rmSync(rawHome,{recursive:true,force:true}));
  persistIntentWorkgraphRuntimeSnapshot({home,graph:readyGraph()});
  const {child,url}=await startServer(home);
  t.after(()=>child.kill());

  const route=await fetch(`${url}${BROWSER_INTENT_PROJECT_STATUS_PATH}?projectRef=project.self-development`);
  assert.equal(route.status,200);
  const payload=await route.json();
  assert.equal(payload.state,'CURRENT');
  assert.equal(payload.statusProjections.length,1);
  assert.equal(payload.statusProjections[0].ready[0].state,'READY');

  const other=await fetch(`${url}${BROWSER_INTENT_PROJECT_STATUS_PATH}?projectRef=project.vexlife.root-hub`);
  assert.equal(other.status,200);
  assert.deepEqual((await other.json()).statusProjections,[]);

  const rejected=await fetch(`${url}${BROWSER_INTENT_PROJECT_STATUS_PATH}?projectRef=project.self-development`,{method:'POST'});
  assert.equal(rejected.status,405);

  const {chromium}=await import('playwright');
  const browser=await chromium.launch({headless:true});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors={console:[],page:[]};
  page.on('console',(message)=>{if(message.type()==='error')errors.console.push(message.text());});
  page.on('pageerror',(error)=>errors.page.push(error.message));
  await page.goto(url+'/reference/browser/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(globalThis.__VEXLIFE_APP__?.purposeWorkspaceEvolution));
  await page.locator('#surfaceMenuButton').click();
  await page.locator('#uxProjectionSelect').selectOption('EVOLUTION_PROJECTION');
  await page.waitForFunction(()=>globalThis.__VEXLIFE_APP__.state.uxProjection==='EVOLUTION_PROJECTION');
  await page.locator('#openPurposeWorkspace').click();
  await page.waitForSelector('.purpose-workspace-evolution__progress[data-state="CURRENT"]');
  assert.equal(await page.locator('.purpose-workspace-evolution__progress h3').textContent(),'Current progress');
  assert.equal(await page.getByRole('heading',{name:'Ready',exact:true}).count(),1);
  assert.equal(await page.getByText('Prepare the next bounded feature step',{exact:true}).count(),1);
  const snapshot=await page.evaluate(()=>globalThis.__VEXLIFE_APP__.purposeWorkspaceEvolution.snapshot());
  assert.equal(snapshot.progressState,'CURRENT');
  assert.equal(snapshot.progressProjectRef,'project.self-development');
  assert.equal(snapshot.progressGraphCount,1);
  assert.equal(snapshot.progressExecutionAuthority,'NONE');
  assert.equal(snapshot.effects,false);
  assert.deepEqual(errors,{console:[],page:[]});
});
