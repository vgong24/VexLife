import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolveUxProjectionHostSelection,validateUxEvolutionRegistry} from '../src/core/ux-evolution.mjs';
import {
  LIVING_JOURNAL_EVOLUTION_PROJECTION_REF,
  LIVING_JOURNAL_SURFACE_REF,
  assertLivingJournalActiveSurfaceContract,
  createLivingJournalEvolutionSurfaceAdapter
} from '../reference/browser/evolution/living-journal-projection.js';
import {registerLivingJournalEvolutionSurface} from '../reference/browser/evolution/projection-host.js';

const registry=JSON.parse(fs.readFileSync(new URL('../blueprint/ux-evolution-registry.json',import.meta.url),'utf8'));
const scaffold=JSON.parse(fs.readFileSync(new URL('../blueprint/ux-evolution-shell-scaffold.json',import.meta.url),'utf8'));
const compatHtml=fs.readFileSync(new URL('../reference/browser/evolution/index.html',import.meta.url),'utf8');
const adapterSource=fs.readFileSync(new URL('../reference/browser/evolution/living-journal-projection.js',import.meta.url),'utf8');
const adapterCss=fs.readFileSync(new URL('../reference/browser/evolution/living-journal.css',import.meta.url),'utf8');

function frame(contextProjection='chat'){
  return {
    primaryStageScreenRef:'screen.vexlife.terrain',
    screenRef:contextProjection?('screen.vexlife.'+contextProjection):'screen.vexlife.terrain',
    routeRef:contextProjection?('route.'+contextProjection):'route.terrain',
    contextProjection,
    projectRef:'project.self-development',
    threadRef:'thread.self-development.open-conversation',
    channelRef:'channel.self-development.companion',
    selectedNodeRef:'terrain.thread.open-conversation'
  };
}
function fakeDom(){
  const classNames=new Set();
  const sibling={id:'after-journal',parentNode:null};
  const parent={
    child:null,
    insertBefore(node){this.child=node;node.parentNode=this;},
    appendChild(node){this.child=node;node.parentNode=this;}
  };
  sibling.parentNode=parent;
  const view={
    id:'view-living-journal',
    hidden:true,
    dataset:{},
    parentNode:parent,
    nextSibling:sibling,
    focused:false,
    classList:{add:(value)=>classNames.add(value),remove:(value)=>classNames.delete(value),contains:(value)=>classNames.has(value)},
    focus(){this.focused=true;}
  };
  parent.child=view;
  const body={
    child:null,
    replaceChildren(node){this.child=node;node.parentNode=this;}
  };
  const documentImpl={querySelector:(selector)=>selector==='#view-living-journal'?view:null};
  return {documentImpl,parent,view,body,classNames};
}
function fakeApp(){
  let current=frame('chat');
  const stack=[];
  const calls={open:0,project:0,close:0,back:0,register:0};
  const app={
    openLivingJournal:async()=>{
      calls.open+=1;
      if(current.contextProjection!=='living-journal'){
        stack.push(structuredClone(current));
        current={...current,screenRef:'screen.vexlife.living-journal',routeRef:'route.living-journal',contextProjection:'living-journal'};
      }
      return {state:'OPEN'};
    },
    projectFrame:()=>{calls.project+=1;},
    livingJournal:{close:()=>{calls.close+=1;}},
    navigation:{
      semanticFrame:()=>structuredClone(current),
      back:()=>{
        calls.back+=1;
        const prior=stack.pop();
        if(!prior)return {changed:false,reason:'BACK_STACK_EMPTY',frame:structuredClone(current)};
        current=prior;
        return {changed:true,frame:structuredClone(current)};
      }
    },
    uxProjectionShell:{
      registerEvolutionSurfaceAdapter:(surfaceRef,adapter)=>{
        calls.register+=1;
        assert.equal(surfaceRef,LIVING_JOURNAL_SURFACE_REF);
        app.registeredAdapter=adapter;
        return {state:'REGISTERED',surfaceRef};
      }
    }
  };
  return {app,calls,current:()=>structuredClone(current)};
}

test('LJ active-surface registry consumes the accepted shell contract without cutover',()=>{
  const v=validateUxEvolutionRegistry(registry);
  assert.equal(v.state,'PASS',v.errors.join('\n'));
  assert.equal(v.projectionHostState,'ACTIVE_SURFACE_MIGRATED_SURFACES');
  assert.equal(registry.projectionHost.hostRef,'host.vexlife.shell.evolution-active-surface.001');
  assert.equal(registry.projectionHost.rendererTransitionClass,'SHELL_ACTIVE_SURFACE');
  assert.equal(registry.projectionHost.priorRendererDisposition,'REFERENCE_SURFACE_RETAINED_HIDDEN');
  assert.equal(registry.projectionHost.evolutionHostLoadsReferenceRenderer,true);
  assert.equal(registry.projectionHost.dualRendererMountAllowed,false);
  assert.equal(assertLivingJournalActiveSurfaceContract({registry,shellScaffold:scaffold}).state,'PASS');
});

test('explicit local Evolution selection routes into the canonical shell, not a standalone Journal document',()=>{
  const reference=resolveUxProjectionHostSelection(registry);
  assert.equal(reference.selectedProjection,'REFERENCE_PROJECTION');
  assert.equal(reference.route,'/reference/browser/');
  const evolution=resolveUxProjectionHostSelection(registry,{requestedProjection:'evolution',localExecution:true});
  assert.equal(evolution.state,'PASS');
  assert.equal(evolution.selectedProjection,'EVOLUTION_PROJECTION');
  assert.equal(evolution.route,'/reference/browser/?projection=evolution');
  assert.equal(evolution.rendererTransitionClass,'SHELL_ACTIVE_SURFACE');
  assert.equal(evolution.priorRendererDisposition,'REFERENCE_SURFACE_RETAINED_HIDDEN');
});

test('legacy Evolution document is compatibility-only and owns no second Journal shell',()=>{
  assert.match(compatHtml,/canonical VexLife shell/i);
  assert.match(compatHtml,/\/reference\/browser\/\?projection=evolution/);
  assert.doesNotMatch(compatHtml,/id="view-living-journal"/);
  assert.doesNotMatch(compatHtml,/evolutionJournalBack|evolutionVexPanel|evolutionHostTitle/);
});

test('Journal adapter reuses canonical owners instead of constructing a second Journal',()=>{
  assert.doesNotMatch(adapterSource,/createLivingJournalController|createLivingJournalDemoData|createFeatureWalkthroughRunner/);
  assert.doesNotMatch(adapterSource,/\/api\/v1\/living-journal\/(memory|archive)/);
  assert.match(adapterSource,/app\.openLivingJournal/);
  assert.match(adapterSource,/app\.livingJournal\.close/);
  assert.match(adapterSource,/app\.navigation\.back/);
  assert.match(adapterSource,/REFERENCE_FALLBACK/);
});

test('Reference fallback preserves canonical Journal state and does not mutate Journey',async()=>{
  const {app,calls,current}=fakeApp();
  const {documentImpl,parent,view,body}=fakeDom();
  const adapter=createLivingJournalEvolutionSurfaceAdapter(app,{documentImpl});
  await adapter.mount({body,surfaceRef:LIVING_JOURNAL_SURFACE_REF,semanticRef:'feature.vexlife.living-journal',projection:'EVOLUTION_PROJECTION'});
  assert.equal(body.child,view);
  assert.equal(current().contextProjection,'living-journal');
  const receipt=await adapter.requestClose({reason:'REFERENCE_FALLBACK'});
  assert.equal(receipt.state,'CLOSED');
  assert.equal(receipt.referenceFallback,true);
  assert.equal(receipt.semanticNavigationMutation,false);
  assert.equal(receipt.canonicalJournalStatePreserved,true);
  assert.equal(current().contextProjection,'living-journal');
  assert.equal(calls.close,0);
  assert.equal(calls.back,0);
  assert.equal(view.parentNode,parent);
});

test('shell Close delegates Journal close and semantic Back to the canonical owners',async()=>{
  const {app,calls,current}=fakeApp();
  const {documentImpl,parent,view,body}=fakeDom();
  const adapter=createLivingJournalEvolutionSurfaceAdapter(app,{documentImpl});
  await adapter.mount({body,surfaceRef:LIVING_JOURNAL_SURFACE_REF,semanticRef:'feature.vexlife.living-journal',projection:'EVOLUTION_PROJECTION'});
  const receipt=await adapter.requestClose({reason:'SHELL_CLOSE'});
  assert.equal(receipt.state,'CLOSED');
  assert.equal(receipt.canonicalJourneyOwnerRef,'module.vexlife.core.navigation');
  assert.equal(receipt.semanticNavigationMutation,true);
  assert.equal(receipt.userDataRollbackPerformed,false);
  assert.equal(calls.close,1);
  assert.equal(calls.back,1);
  assert.equal(current().contextProjection,'chat');
  assert.equal(view.parentNode,parent);
});

test('registration helper binds exactly one Journal adapter into the accepted shell seam',()=>{
  const {app,calls}=fakeApp();
  const {documentImpl}=fakeDom();
  const receipt=registerLivingJournalEvolutionSurface(app,{registry,shellScaffold:scaffold,documentImpl});
  assert.equal(receipt.state,'REGISTERED');
  assert.equal(receipt.surfaceRef,LIVING_JOURNAL_SURFACE_REF);
  assert.equal(receipt.projectionRef,LIVING_JOURNAL_EVOLUTION_PROJECTION_REF);
  assert.equal(calls.register,1);
  assert.equal(typeof app.registeredAdapter.mount,'function');
  assert.equal(typeof app.registeredAdapter.requestClose,'function');
});

test('Evolution presentation keeps accessibility margin without owning shell chrome',()=>{
  assert.match(adapterCss,/min-height:48px/);
  assert.match(adapterCss,/prefers-reduced-motion:reduce/);
  assert.match(adapterCss,/living-journal-heading>div:first-child\{display:none\}/);
  assert.match(adapterCss,/livingJournalWalkthrough\{position:static!important/);
  assert.doesNotMatch(adapterCss,/html,body|#evolutionHost|\.evolution-shell-head/);
});

test('canonical app owns only the minimal registration and local projection hydration edge',()=>{
  const appSource=fs.readFileSync(new URL('../reference/browser/app.js',import.meta.url),'utf8');
  assert.match(appSource,/loadAndRegisterLivingJournalEvolutionSurface/);
  assert.match(appSource,/uxInitialProjectionParam/);
  assert.match(appSource,/uxInitialProjectionParam==='evolution'/);
  assert.match(appSource,/await loadAndRegisterLivingJournalEvolutionSurface\(globalThis\.__VEXLIFE_APP__\)/);
  assert.match(appSource,/refreshHealthCompanionAvailability/,'accepted PR695 Health consumer must remain present');
});

// [VXG RealForever]
