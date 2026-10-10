#!/usr/bin/env node
// [VXG RealForever]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT=path.dirname(fileURLToPath(import.meta.url));
const SRC=path.resolve(process.argv[2]??'');
if(!SRC)throw new Error('Usage: node PATCH-PREVIEW.mjs <exact-vexlife-checkout>');
const binding=JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT,'BINDING.json'),'utf8'));
const additions=JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT,'payload/strings-additions.json'),'utf8'));
const read=(rel)=>fs.readFileSync(path.join(SRC,rel),'utf8');
const write=(rel,value)=>{const target=path.join(SRC,rel);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,value,'utf8')};
const git=(...args)=>execFileSync('git',args,{cwd:SRC,encoding:'utf8'}).trim();
const assert=(value,message)=>{if(!value)throw new Error(message)};
const replaceOnce=(value,needle,replacement,label)=>{const first=value.indexOf(needle),last=value.lastIndexOf(needle);assert(first>=0,`PATCH_MARKER_MISSING:${label}`);assert(first===last,`PATCH_MARKER_NOT_UNIQUE:${label}`);return value.slice(0,first)+replacement+value.slice(first+needle.length)};

assert(git('rev-parse','HEAD')===binding.predecessorSourceHead,`HEAD_BINDING_MISMATCH:${git('rev-parse','HEAD')}!=${binding.predecessorSourceHead}`);
const predecessorPatch=path.resolve(PACKAGE_ROOT,binding.predecessorPatch);
const predecessorReceipt=JSON.parse(execFileSync(process.execPath,[predecessorPatch,SRC],{cwd:SRC,stdio:['ignore','pipe','pipe'],encoding:'utf8',maxBuffer:32*1024*1024}));
assert(predecessorReceipt.state==='FORMED','PREDECESSOR_PATCH_NOT_FORMED');
assert(predecessorReceipt.previewRef===binding.predecessorPreviewRef,`PREDECESSOR_PREVIEW_MISMATCH:${predecessorReceipt.previewRef}`);

{
  const rel='blueprint/fragments/terrain.json';
  const terrain=JSON.parse(read(rel));
  const refs=new Set(terrain.map((x)=>x.terrainNodeRef));
  assert(refs.has('terrain.assortment.frontier'),'FRONTIER_PARENT_MISSING');
  const nodes=[
    {terrainNodeRef:'terrain.assortment.frontier.company-people-timeline',parentRef:'terrain.assortment.frontier',labelStringRef:'assortment.frontier.company-people-timeline',kind:'RESOURCE',defaultPosition:{x:440,y:610}},
    {terrainNodeRef:'terrain.assortment.frontier.system-resource-health',parentRef:'terrain.assortment.frontier',labelStringRef:'assortment.frontier.system-resource-health',kind:'RESOURCE',defaultPosition:{x:860,y:610}}
  ];
  for(const node of nodes){assert(!refs.has(node.terrainNodeRef),`FRONTIER_CHILD_REF_COLLISION:${node.terrainNodeRef}`);terrain.push(node);}
  write(rel,JSON.stringify(terrain,null,2)+'\n');
}

{
  const rel='blueprint/ux-evolution-shell-scaffold.json';
  const scaffold=JSON.parse(read(rel));
  assert(!scaffold.surfaceInventory.some((item)=>item.surfaceRef==='surface.vexlife.assortment-inspector'),'INSPECTOR_SURFACE_REF_COLLISION');
  scaffold.surfaceInventory.push({surfaceRef:'surface.vexlife.assortment-inspector',semanticRef:'feature.vexlife.contextual-workspace',title:'Details',controlId:'assortmentPreviewInspector',referenceProjectionAvailable:false});
  write(rel,JSON.stringify(scaffold,null,2)+'\n');
}

{
  const rel='blueprint/ux-evolution-registry.json';
  const registry=JSON.parse(read(rel));
  const record=registry.migrationRecords.find((x)=>x.semanticRef==='feature.vexlife.contextual-workspace');
  assert(record,'CONTEXTUAL_WORKSPACE_MIGRATION_RECORD_MISSING');
  assert(record.migrationLifecycleState==='SHADOW_IMPLEMENTED','CONTEXTUAL_WORKSPACE_NOT_PREDECESSOR_SHADOW');
  assert(Array.isArray(record.evolutionProjectionRefs),'CONTEXTUAL_WORKSPACE_PROJECTIONS_MISSING');
  const inspectorProjection='projection.vexlife-assortment.r2.continuity-refinement.inspector';
  assert(!record.evolutionProjectionRefs.includes(inspectorProjection),'INSPECTOR_PROJECTION_ALREADY_PRESENT');
  record.evolutionProjectionRefs.push(inspectorProjection);
  write(rel,JSON.stringify(registry,null,2)+'\n');
}

for(const language of ['en','zh','ja']){
  const rel=`blueprint/strings/${language}.json`,catalog=JSON.parse(read(rel));
  for(const [ref,value] of Object.entries(additions[language])){assert(!Object.hasOwn(catalog,ref),`LOCALIZATION_REF_COLLISION:${language}:${ref}`);catalog[ref]=value;}
  write(rel,JSON.stringify(catalog,null,2)+'\n');
}

{
  const rel='reference/browser/evolution/assortment-fixtures.json';
  const fixture=JSON.parse(read(rel));
  assert(fixture.previewRef===binding.predecessorPreviewRef,`FIXTURE_PREVIEW_MISMATCH:${fixture.previewRef}`);
  fixture.previewRef=binding.candidatePreviewRef;
  const byRef=new Map(fixture.revisit.map((record)=>[record.recordRef,record]));
  for(const [recordRef,terrainRef] of Object.entries(binding.frontierRecordTerrainRefs)){
    const record=byRef.get(recordRef);assert(record,`FRONTIER_RECORD_MISSING:${recordRef}`);record.terrainRef=terrainRef;
  }
  write(rel,JSON.stringify(fixture,null,2)+'\n');
}

{
  const rel='reference/browser/evolution/assortment-continuity.css';
  const css=read(rel),extension=fs.readFileSync(path.join(PACKAGE_ROOT,'payload/continuity-refinement.css'),'utf8');
  assert(!css.includes('assortment-inspector-card'),'CONTINUITY_REFINEMENT_CSS_ALREADY_PRESENT');
  write(rel,css.trimEnd()+'\n'+extension);
}

{
  const rel='reference/browser/modules/terrain-controller.js';let terrain=read(rel);
  terrain=replaceOnce(terrain,
    "export function createTerrainController({state,blueprint,t,navigation,semanticPatchForNode=()=>({}),onCurrentNode=()=>{},requestSemanticTravel=null}){",
    "export function createTerrainController({state,blueprint,t,navigation,semanticPatchForNode=()=>({}),onCurrentNode=()=>{},requestSemanticTravel=null,currentContextActionForNode=()=>null}){",
    'TERRAIN_CURRENT_CONTEXT_ACTION_ARGUMENT');
  terrain=replaceOnce(terrain,
    " if(requestSemanticTravel!==null&&typeof requestSemanticTravel!=='function')throw new Error('E2.8 Terrain requestSemanticTravel must be a function or null');",
    " if(requestSemanticTravel!==null&&typeof requestSemanticTravel!=='function')throw new Error('E2.8 Terrain requestSemanticTravel must be a function or null');\n if(typeof currentContextActionForNode!=='function')throw new Error('Terrain currentContextActionForNode must be a function');",
    'TERRAIN_CURRENT_CONTEXT_ACTION_VALIDATION');
  terrain=replaceOnce(terrain,
    "f.innerHTML=`<div class=\"e27-eyebrow\">${escapeHtml(n.kind)} - DEPTH ${depthOf(currentRef())}</div>",
    "const currentContextAction=currentContextActionForNode(currentRef());f.innerHTML=`<div class=\"e27-eyebrow\">${escapeHtml(n.kind)} - DEPTH ${depthOf(currentRef())}</div>",
    'TERRAIN_CURRENT_CONTEXT_ACTION_RESOLVE');
  terrain=replaceOnce(terrain,
    "<div class=\"e27-focus-actions\"><button data-focus-action=\"chat\">Open conversation</button>",
    "<div class=\"e27-focus-actions\">${currentContextAction?.label?'<button data-focus-action=\"current\">'+escapeHtml(currentContextAction.label)+'</button>':''}<button data-focus-action=\"chat\">Open conversation</button>",
    'TERRAIN_CURRENT_CONTEXT_ACTION_BUTTON');
  terrain=replaceOnce(terrain,
    "f.querySelectorAll('[data-focus-action]').forEach(b=>b.onclick=()=>b.dataset.focusAction==='chat'?document.dispatchEvent(new CustomEvent('vexlife:open-context',{detail:{context:'chat'}})):b.dataset.focusAction==='vex'?$('#vexSummon').click():centerOn());",
    "f.querySelectorAll('[data-focus-action]').forEach(b=>b.onclick=()=>{if(b.dataset.focusAction==='current'){const action=currentContextActionForNode(currentRef());return action?.invoke?.();}if(b.dataset.focusAction==='chat')return document.dispatchEvent(new CustomEvent('vexlife:open-context',{detail:{context:'chat'}}));if(b.dataset.focusAction==='vex')return $('#vexSummon').click();return centerOn();});",
    'TERRAIN_CURRENT_CONTEXT_ACTION_HANDLER');
  write(rel,terrain);
}

{
  const rel='reference/browser/evolution/assortment-continuity-projection.js';let projection=read(rel);
  projection=replaceOnce(projection,
    "export const ASSORTMENT_FRONTIER_SURFACE_REF='surface.vexlife.assortment-frontier';\nexport const ASSORTMENT_PREVIEW_REF='preview.vexlife-assortment.r2.live-evolution.01';",
    "export const ASSORTMENT_FRONTIER_SURFACE_REF='surface.vexlife.assortment-frontier';\nexport const ASSORTMENT_INSPECTOR_SURFACE_REF='surface.vexlife.assortment-inspector';\nexport const ASSORTMENT_PREVIEW_REF='preview.vexlife-assortment.r2.continuity-refinement.01';",
    'ASSORTMENT_INSPECTOR_SURFACE_AND_PREVIEW_REF');
  projection=replaceOnce(projection,
    "const SURFACE_FOR_TERRAIN=Object.freeze({\n  [ASSORTMENT_TERRAIN_REFS.continue]:ASSORTMENT_CONTINUITY_SURFACE_REF,\n  [ASSORTMENT_TERRAIN_REFS.projects]:ASSORTMENT_PROJECTS_SURFACE_REF,\n  [ASSORTMENT_TERRAIN_REFS.frontier]:ASSORTMENT_FRONTIER_SURFACE_REF\n});",
    "const SURFACE_FOR_TERRAIN=Object.freeze({\n  [ASSORTMENT_TERRAIN_REFS.continue]:ASSORTMENT_CONTINUITY_SURFACE_REF,\n  [ASSORTMENT_TERRAIN_REFS.projects]:ASSORTMENT_PROJECTS_SURFACE_REF,\n  [ASSORTMENT_TERRAIN_REFS.frontier]:ASSORTMENT_FRONTIER_SURFACE_REF\n});\nconst FRONTIER_RECORD_FOR_TERRAIN=Object.freeze({\n  'terrain.assortment.frontier.company-people-timeline':'fixture.revisit.assortment.2',\n  'terrain.assortment.frontier.system-resource-health':'fixture.revisit.assortment.3'\n});",
    'FRONTIER_RECORD_TERRAIN_MAP');
  projection=replaceOnce(projection,
    "  ASSORTMENT_PROJECT_DEPTH_SURFACE_REF,\n  ASSORTMENT_FRONTIER_SURFACE_REF\n]);",
    "  ASSORTMENT_PROJECT_DEPTH_SURFACE_REF,\n  ASSORTMENT_FRONTIER_SURFACE_REF,\n  ASSORTMENT_INSPECTOR_SURFACE_REF\n]);",
    'ASSORTMENT_SURFACE_SET_INSPECTOR');
  projection=replaceOnce(projection,
    "  return d;\n};\n\nasync function loadFixture(){",
    "  return d;\n};\nfunction makeInspectable(card,t,action,{elementRef=null}={}){\n  card.classList.add('is-inspectable');card.tabIndex=0;\n  const open=btn('assortment-inspect',t('assortment.action.inspect'),(event)=>{event.stopPropagation();void action();});\n  open.dataset.vexActionRef='action.assortment.inspect';if(elementRef)open.dataset.vexElementRef=elementRef;card.append(open);\n  card.addEventListener('click',(event)=>{if(event.target.closest('button,a,details,summary,input,select,textarea'))return;void action();});\n  card.addEventListener('keydown',(event)=>{if(event.target!==card||!['Enter',' '].includes(event.key))return;event.preventDefault();void action();});\n  return card;\n}\n\nasync function loadFixture(){",
    'ASSORTMENT_INSPECTABLE_HELPER');
  projection=replaceOnce(projection,
    "const currentGrid=el('div','assortment-work-grid');if(truthMode==='LIVE'){currentGrid.append(liveAssortmentCard(t),liveVexVisionCard(liveTruth,t));}else{for(const work of fixture.currentWork)currentGrid.append(currentWorkCard(work,t));}current.append(currentGrid);root.append(current);",
    "const currentGrid=el('div','assortment-work-grid');if(truthMode==='LIVE'){currentGrid.append(liveAssortmentCard(t),liveVexVisionCard(liveTruth,t));}else{for(const work of fixture.currentWork){const card=currentWorkCard(work,t);makeInspectable(card,t,()=>preview.inspectWork(work),{elementRef:`element.assortment.inspect.${work.workRef}`});currentGrid.append(card);}}current.append(currentGrid);root.append(current);",
    'CONTINUITY_WORK_CARDS_INSPECTABLE');
  projection=replaceOnce(projection,
    "for(const work of fixture.currentWork){const card=currentWorkCard(work,t);if(work.workRef.startsWith('work.vexlife.assortment.')){const open=btn('assortment-primary',t('assortment.action.open-project'),()=>void preview.openPresentation(ASSORTMENT_PROJECT_DEPTH_SURFACE_REF));open.dataset.vexActionRef='action.assortment.projects.open';open.dataset.vexElementRef='element.assortment.projects.open-current';card.append(open);}list.append(card);}",
    "for(const work of fixture.currentWork){const card=currentWorkCard(work,t);if(work.workRef.startsWith('work.vexlife.assortment.')){const open=btn('assortment-primary',t('assortment.action.open-project'),()=>void preview.openPresentation(ASSORTMENT_PROJECT_DEPTH_SURFACE_REF));open.dataset.vexActionRef='action.assortment.projects.open';open.dataset.vexElementRef='element.assortment.projects.open-current';card.append(open);}makeInspectable(card,t,()=>preview.inspectWork(work),{elementRef:`element.assortment.inspect.${work.workRef}`});list.append(card);}",
    'PROJECT_WORK_CARDS_INSPECTABLE');
  projection=replaceOnce(projection,
    "const list=el('div','assortment-record-list');if(truthMode==='LIVE')list.append(heldRecordCard(t('assortment.live.frontier.title'),t('assortment.live.frontier-held'),['docs/vexlife-assortment/FRONTIER-PROJECT-MAP.md','registry.vexlife.intent-orchestration.001'],t));else for(const item of fixture.revisit.filter((x)=>x.recordClass!=='EXISTING_PARALLEL_TRAJECTORY'))list.append(recordCard(item,t,{title:item.title,summaryRef:item.summaryRef}));root.append(list);host.append(root);",
    "const list=el('div','assortment-record-list');if(truthMode==='LIVE')list.append(heldRecordCard(t('assortment.live.frontier.title'),t('assortment.live.frontier-held'),['docs/vexlife-assortment/FRONTIER-PROJECT-MAP.md','registry.vexlife.intent-orchestration.001'],t));else for(const item of fixture.revisit.filter((x)=>x.recordClass!=='EXISTING_PARALLEL_TRAJECTORY')){const card=recordCard(item,t,{title:item.title,summaryRef:item.summaryRef});makeInspectable(card,t,()=>preview.inspectRecord(item),{elementRef:`element.assortment.inspect.${item.recordRef}`});list.append(card);}root.append(list);host.append(root);",
    'FRONTIER_RECORD_CARDS_INSPECTABLE');
  projection=replaceOnce(projection,
    "function renderProcessTrail({root,fixture,t}){",
    "function renderInspector({host,t,preview,truthMode='EVOLUTION'}){\n  const root=el('section','assortment-surface assortment-inspector');root.dataset.surfaceRef=ASSORTMENT_INSPECTOR_SURFACE_REF;root.dataset.previewRef=ASSORTMENT_PREVIEW_REF;\n  const hero=el('header','assortment-hero');hero.append(el('small','assortment-eyebrow',t('assortment.inspector.eyebrow')),truthBadge(t,truthMode),truthSwitcher(t,preview,truthMode));root.append(hero);\n  if(truthMode==='LIVE'){root.append(heldRecordCard(t('assortment.live.inspector.title'),t('assortment.live.inspector-held'),['docs/vexlife-assortment/CURRENT.md'],t));host.append(root);return;}\n  const inspection=preview.inspection();if(!inspection){root.append(el('p','assortment-footnote',t('assortment.inspector.no-selection')));host.append(root);return;}\n  const record=inspection.record,card=el('article','assortment-work-card assortment-inspector-card');\n  const classification=inspection.kind==='WORK'?t(record.stateLabelRef):(record.displayClass??record.recordClass??record.statusKey??'');\n  const title=inspection.kind==='WORK'?record.title:(record.title??t(record.titleRef));\n  card.append(el('small','assortment-record__class',classification),el('h2','',title));\n  if(inspection.kind==='WORK')card.append(stageRail(record,t));else if(record.summaryRef)card.append(el('p','',t(record.summaryRef)));\n  const identity=el('div','assortment-inspector-card__identity');identity.append(el('small','',t('assortment.inspector.identity')),el('code','',inspection.ref));card.append(identity,sourceDetails(record,t));\n  if(inspection.kind==='WORK'&&record.workRef.startsWith('work.vexlife.assortment.')){const open=btn('assortment-primary',t('assortment.action.open-project'),()=>void preview.openPresentation(ASSORTMENT_PROJECT_DEPTH_SURFACE_REF));open.dataset.vexActionRef='action.assortment.projects.open';open.dataset.vexElementRef='element.assortment.inspector.open-project';card.append(open);}\n  root.append(card);host.append(root);\n}\n\nfunction renderProcessTrail({root,fixture,t}){",
    'ASSORTMENT_INSPECTOR_RENDERER');
  projection=replaceOnce(projection,
    "let fixture=null,truthMode='EVOLUTION',liveTruth=null,mountedBody=null,mountedRenderer=null;const presentationStack=[];",
    "let fixture=null,truthMode='EVOLUTION',liveTruth=null,mountedBody=null,mountedRenderer=null,inspectionState=null;const presentationStack=[];",
    'ASSORTMENT_INSPECTION_STATE');
  projection=replaceOnce(projection,
    "async function openPresentation(ref){const current=activeSurface();if(current&&ASSORTMENT_SURFACES.has(current))presentationStack.push(current);return openSurface(ref);}\n  async function openSemanticSibling(terrainRef){",
    "async function openPresentation(ref){const current=activeSurface();if(current&&ASSORTMENT_SURFACES.has(current))presentationStack.push(current);return openSurface(ref);}\n  function setInspection(kind,record){const ref=kind==='WORK'?record?.workRef:record?.recordRef??record?.eventRef??record?.momentRef;if(!ref)throw new Error('Inspectable record requires stable ref');inspectionState=Object.freeze({kind,ref,record:structuredClone(record)});return inspectionState;}\n  async function inspectWork(work){setInspection('WORK',work);return openPresentation(ASSORTMENT_INSPECTOR_SURFACE_REF);}\n  async function inspectRecord(record){setInspection('RECORD',record);return openPresentation(ASSORTMENT_INSPECTOR_SURFACE_REF);}\n  async function inspectTerrainRecord(terrainRef){const recordRef=FRONTIER_RECORD_FOR_TERRAIN[terrainRef];if(!recordRef)return false;const data=await ensureFixture(),record=data.revisit.find((item)=>item.recordRef===recordRef);if(!record)throw new Error(`Frontier record missing for ${terrainRef}`);presentationStack.splice(0);setInspection('RECORD',record);await openSurface(ASSORTMENT_INSPECTOR_SURFACE_REF);return true;}\n  function currentContextActionForNode(terrainRef){const surface=SURFACE_FOR_TERRAIN[terrainRef];if(surface)return Object.freeze({label:t('terrain.current-context.open'),invoke:()=>{presentationStack.splice(0);return openSurface(surface);}});if(FRONTIER_RECORD_FOR_TERRAIN[terrainRef])return Object.freeze({label:t('assortment.action.inspect'),invoke:()=>inspectTerrainRecord(terrainRef)});return null;}\n  async function openSemanticSibling(terrainRef){",
    'ASSORTMENT_INSPECTION_ACTIONS');
  projection=replaceOnce(projection,
    "async function handleTerrainNode(terrainRef){const surface=SURFACE_FOR_TERRAIN[terrainRef];if(!surface)return false;presentationStack.splice(0);await openSurface(surface);return true;}",
    "async function handleTerrainNode(terrainRef){if(FRONTIER_RECORD_FOR_TERRAIN[terrainRef])return inspectTerrainRecord(terrainRef);const surface=SURFACE_FOR_TERRAIN[terrainRef];if(!surface)return false;presentationStack.splice(0);await openSurface(surface);return true;}",
    'ASSORTMENT_TERRAIN_RECORD_ROUTE');
  projection=replaceOnce(projection,
    "function snapshot(){return Object.freeze({previewRef:ASSORTMENT_PREVIEW_REF,activeSurfaceRef:activeSurface(),surfaceBackDepth:presentationStack.length,truthClass:truthMode==='LIVE'?'OWNER_BACKED_LIVE_OR_HELD':fixture?.truthClass??null,truthMode,liveState:liveTruth?.state??'UNREQUESTED',liveProjectStatusState:liveTruth?.projectStatus?.state??'UNREQUESTED'});}",
    "function inspection(){return inspectionState?structuredClone(inspectionState):null;}\n  function snapshot(){return Object.freeze({previewRef:ASSORTMENT_PREVIEW_REF,activeSurfaceRef:activeSurface(),surfaceBackDepth:presentationStack.length,truthClass:truthMode==='LIVE'?'OWNER_BACKED_LIVE_OR_HELD':fixture?.truthClass??null,truthMode,liveState:liveTruth?.state??'UNREQUESTED',liveProjectStatusState:liveTruth?.projectStatus?.state??'UNREQUESTED',inspectionRef:inspectionState?.ref??null});}",
    'ASSORTMENT_INSPECTION_SNAPSHOT');
  projection=replaceOnce(projection,
    "app.uxProjectionShell.registerEvolutionSurfaceAdapter(ASSORTMENT_FRONTIER_SURFACE_REF,mk(ASSORTMENT_FRONTIER_SURFACE_REF,renderFrontier));\n    syncBack();return snapshot();",
    "app.uxProjectionShell.registerEvolutionSurfaceAdapter(ASSORTMENT_FRONTIER_SURFACE_REF,mk(ASSORTMENT_FRONTIER_SURFACE_REF,renderFrontier));\n    app.uxProjectionShell.registerEvolutionSurfaceAdapter(ASSORTMENT_INSPECTOR_SURFACE_REF,mk(ASSORTMENT_INSPECTOR_SURFACE_REF,renderInspector));\n    app.terrain.render(false);syncBack();return snapshot();",
    'ASSORTMENT_INSPECTOR_REGISTRATION');
  projection=replaceOnce(projection,
    "const api=Object.freeze({register,handleTerrainNode,openPresentation,openSemanticSibling,back,onShellClose,relocalize,setTruthMode,snapshot});",
    "const api=Object.freeze({register,handleTerrainNode,currentContextActionForNode,inspectWork,inspectRecord,inspection,openPresentation,openSemanticSibling,back,onShellClose,relocalize,setTruthMode,snapshot});",
    'ASSORTMENT_INSPECTION_API');
  write(rel,projection);
}

{
  const rel='reference/browser/app.js';let app=read(rel);
  app=replaceOnce(app,
    "terrain=createTerrainController({state,blueprint,t,navigation,semanticPatchForNode,onCurrentNode:(nodeRef)=>{if(chat)queueMicrotask(()=>projectFrame());queueMicrotask(()=>{void globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__?.handleTerrainNode?.(nodeRef);void globalThis.__VEXLIFE_VEX_PREVIEW__?.handleTerrainNode?.(nodeRef);});}});",
    "terrain=createTerrainController({state,blueprint,t,navigation,semanticPatchForNode,currentContextActionForNode:(nodeRef)=>globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__?.currentContextActionForNode?.(nodeRef)??null,onCurrentNode:(nodeRef)=>{if(chat)queueMicrotask(()=>projectFrame());queueMicrotask(()=>{void globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__?.handleTerrainNode?.(nodeRef);void globalThis.__VEXLIFE_VEX_PREVIEW__?.handleTerrainNode?.(nodeRef);});}});",
    'ASSORTMENT_CURRENT_CONTEXT_ACTION_BINDING');
  write(rel,app);
}

runSyntax('reference/browser/modules/terrain-controller.js');
runSyntax('reference/browser/evolution/assortment-continuity-projection.js');
runSyntax('reference/browser/app.js');

function runSyntax(rel){execFileSync(process.execPath,['--check',path.join(SRC,rel)],{cwd:SRC,stdio:['ignore','pipe','pipe'],encoding:'utf8'});}

const changed=git('status','--short').split('\n').filter(Boolean);
const result={
  schemaVersion:'vexlife-assortment.continuity-refinement-practicum-patch/v1',
  previewRef:binding.candidatePreviewRef,
  state:'FORMED',
  head:binding.predecessorSourceHead,
  predecessorPreviewRef:binding.predecessorPreviewRef,
  currentContextReentry:true,
  inspectableRecords:true,
  frontierSpatialChildren:2,
  projectAdmissionMutation:false,
  changed
};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
// [VXG RealForever]