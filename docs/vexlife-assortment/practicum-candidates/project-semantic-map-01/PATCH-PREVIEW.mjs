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
const git=(...args)=>execFileSync('git',args,{cwd:SRC,encoding:'utf8',maxBuffer:32*1024*1024}).trim();
const assert=(value,message)=>{if(!value)throw new Error(message)};
const replaceOnce=(value,needle,replacement,label)=>{const first=value.indexOf(needle),last=value.lastIndexOf(needle);assert(first>=0,`PATCH_MARKER_MISSING:${label}`);assert(first===last,`PATCH_MARKER_NOT_UNIQUE:${label}`);return value.slice(0,first)+replacement+value.slice(first+needle.length)};
const replaceBetween=(value,startNeedle,endNeedle,replacement,label)=>{const start=value.indexOf(startNeedle),startLast=value.lastIndexOf(startNeedle);assert(start>=0,`PATCH_RANGE_START_MISSING:${label}`);assert(start===startLast,`PATCH_RANGE_START_NOT_UNIQUE:${label}`);const end=value.indexOf(endNeedle,start+startNeedle.length);assert(end>=0,`PATCH_RANGE_END_MISSING:${label}`);return value.slice(0,start)+replacement+value.slice(end)};

assert(git('rev-parse','HEAD')===binding.predecessorSourceHead,`HEAD_BINDING_MISMATCH:${git('rev-parse','HEAD')}!=${binding.predecessorSourceHead}`);
const baselineTerrain=JSON.parse(git('show',`${binding.predecessorSourceHead}:blueprint/fragments/terrain.json`));
const predecessorPatch=path.resolve(PACKAGE_ROOT,binding.predecessorPatch);
execFileSync(process.execPath,[predecessorPatch,SRC],{cwd:SRC,stdio:['ignore','pipe','pipe'],encoding:'utf8',maxBuffer:32*1024*1024});

{
  const rel='blueprint/fragments/terrain.json';
  const terrain=JSON.parse(read(rel));
  assert(terrain.some((node)=>node.terrainNodeRef==='terrain.assortment.projects'),'PROJECTS_COLLECTION_PARENT_MISSING');
  const projectRoots=baselineTerrain.filter((node)=>node.kind==='PROJECT'&&node.parentRef==='terrain.project.root-hub');
  const observed=projectRoots.map((node)=>node.terrainNodeRef).sort();
  const expected=[...binding.recoveredProjectTerrainRefs].sort();
  assert(JSON.stringify(observed)===JSON.stringify(expected),`RECOVERED_PROJECT_ROOT_SET_MISMATCH:${JSON.stringify(observed)}`);
  const recoverRefs=new Set(projectRoots.map((node)=>node.terrainNodeRef));
  let changed=true;
  while(changed){changed=false;for(const node of baselineTerrain){if(node.parentRef&&recoverRefs.has(node.parentRef)&&!recoverRefs.has(node.terrainNodeRef)){recoverRefs.add(node.terrainNodeRef);changed=true;}}}
  for(const ref of recoverRefs)assert(!terrain.some((node)=>node.terrainNodeRef===ref),`RECOVERED_PROJECT_NODE_ALREADY_PRESENT:${ref}`);
  const rootRefs=new Set(projectRoots.map((node)=>node.terrainNodeRef));
  const recovered=baselineTerrain.filter((node)=>recoverRefs.has(node.terrainNodeRef)).map((node)=>structuredClone(node));
  for(const node of recovered)if(rootRefs.has(node.terrainNodeRef))node.parentRef='terrain.assortment.projects';
  terrain.push(...recovered);
  write(rel,JSON.stringify(terrain,null,2)+'\n');
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
  write(rel,JSON.stringify(fixture,null,2)+'\n');
}

{
  const rel='reference/browser/evolution/assortment-continuity.css';
  const css=read(rel),extension=fs.readFileSync(path.join(PACKAGE_ROOT,'payload/project-semantic-map.css'),'utf8');
  assert(!css.includes('assortment-project-section'),'PROJECT_SEMANTIC_MAP_CSS_ALREADY_PRESENT');
  write(rel,css.trimEnd()+'\n'+extension);
}

{
  const rel='reference/browser/evolution/assortment-continuity-projection.js';let projection=read(rel);
  projection=replaceOnce(projection,
    "export const ASSORTMENT_PREVIEW_REF='preview.vexlife-assortment.r2.continuity-refinement.01';",
    "export const ASSORTMENT_PREVIEW_REF='preview.vexlife-assortment.r2.project-semantic-map.01';",
    'PROJECT_SEMANTIC_MAP_PREVIEW_REF');
  projection=replaceBetween(projection,
    "function renderProjects({host,fixture,t,preview,truthMode='EVOLUTION',liveTruth=null}){",
    "function renderFrontier({host,fixture,t,preview,truthMode='EVOLUTION'}){",
    "function projectIdentityCard(entry,t,preview){\n  const card=el('article','assortment-work-card assortment-project-identity');card.dataset.projectRef=entry.projectRef;card.dataset.terrainRef=entry.terrainRef;\n  const heading=el('div','assortment-work-card__heading');heading.append(el('h3','',t(entry.stringRef)),el('span','assortment-work-card__state',t('assortment.project-identity.label')));card.append(heading);\n  if(entry.descriptionRef)card.append(el('p','',t(entry.descriptionRef)));\n  const meta=el('div','assortment-project-identity__meta');meta.append(el('span','',`${entry.threads?.length??0} ${t('assortment.project-identity.contexts')}`));card.append(meta,sourceDetails(entry,t));\n  const open=btn('assortment-primary',t('assortment.action.open-project'),()=>void preview.openProject(entry.terrainRef));open.dataset.vexActionRef='action.assortment.projects.open-project';open.dataset.vexElementRef=`element.assortment.projects.open.${entry.projectRef}`;card.append(open);\n  makeInspectable(card,t,()=>preview.inspectProject(entry),{elementRef:`element.assortment.inspect.${entry.projectRef}`});\n  return card;\n}\n\nfunction renderProjects({host,fixture,t,preview,truthMode='EVOLUTION',liveTruth=null}){\n  const root=el('section','assortment-surface assortment-projects');root.dataset.surfaceRef=ASSORTMENT_PROJECTS_SURFACE_REF;root.dataset.previewRef=ASSORTMENT_PREVIEW_REF;\n  const hero=el('header','assortment-hero');hero.append(el('small','assortment-eyebrow',t('assortment.projects.eyebrow')),el('h2','',t('assortment.projects.title')),el('p','',t('assortment.projects.intro')),truthBadge(t,truthMode),truthSwitcher(t,preview,truthMode));root.append(hero);\n\n  const entities=el('section','assortment-section assortment-project-section');entities.append(el('div','assortment-section__heading',t('assortment.projects.entities.title')));\n  const entityGrid=el('div','assortment-project-grid');\n  if(truthMode==='LIVE')entityGrid.append(heldRecordCard(t('assortment.live.projects.title'),t('assortment.live.projects-held'),['blueprint/purpose-workspace-registry.json','Projects plural collection owner — not source-mapped'],t));\n  else for(const entry of preview.projectEntries())entityGrid.append(projectIdentityCard(entry,t,preview));\n  entities.append(entityGrid);root.append(entities);\n\n  const work=el('section','assortment-section assortment-project-section');work.append(el('div','assortment-section__heading',t('assortment.projects.current-work.title')));\n  const workGrid=el('div','assortment-work-grid');\n  if(truthMode==='LIVE')workGrid.append(liveAssortmentCard(t),liveVexVisionCard(liveTruth,t));\n  else for(const item of fixture.currentWork){\n    const card=currentWorkCard(item,t);\n    if(item.workRef.startsWith('work.vexlife.assortment.')){\n      const open=btn('assortment-primary',t('assortment.action.open-work-context'),()=>void preview.openPresentation(ASSORTMENT_PROJECT_DEPTH_SURFACE_REF));\n      open.dataset.vexActionRef='action.assortment.work.open-context';open.dataset.vexElementRef='element.assortment.work.open-current';card.append(open);\n    }\n    makeInspectable(card,t,()=>preview.inspectWork(item),{elementRef:`element.assortment.inspect.${item.workRef}`});workGrid.append(card);\n  }\n  work.append(workGrid);root.append(work);\n  host.append(root);\n}\n",
    'PROJECTS_RENDER_SEPARATES_IDENTITIES_AND_WORK');
  projection=replaceBetween(projection,
    "function renderInspector({host,t,preview,truthMode='EVOLUTION'}){",
    "function renderProcessTrail({root,fixture,t}){",
    "function renderInspector({host,t,preview,truthMode='EVOLUTION'}){\n  const root=el('section','assortment-surface assortment-inspector');root.dataset.surfaceRef=ASSORTMENT_INSPECTOR_SURFACE_REF;root.dataset.previewRef=ASSORTMENT_PREVIEW_REF;\n  const hero=el('header','assortment-hero');hero.append(el('small','assortment-eyebrow',t('assortment.inspector.eyebrow')),truthBadge(t,truthMode),truthSwitcher(t,preview,truthMode));root.append(hero);\n  if(truthMode==='LIVE'){root.append(heldRecordCard(t('assortment.live.inspector.title'),t('assortment.live.inspector-held'),['docs/vexlife-assortment/CURRENT.md'],t));host.append(root);return;}\n  const inspection=preview.inspection();if(!inspection){root.append(el('p','assortment-footnote',t('assortment.inspector.no-selection')));host.append(root);return;}\n  const record=inspection.record,card=el('article','assortment-work-card assortment-inspector-card');\n  const classification=inspection.kind==='WORK'?t(record.stateLabelRef):inspection.kind==='PROJECT'?t('assortment.project-identity.label'):(record.displayClass??record.recordClass??record.statusKey??'');\n  const title=inspection.kind==='WORK'?record.title:inspection.kind==='PROJECT'?t(record.stringRef):(record.title??t(record.titleRef));\n  card.append(el('small','assortment-record__class',classification),el('h2','',title));\n  if(inspection.kind==='WORK')card.append(stageRail(record,t));\n  else if(inspection.kind==='PROJECT'){\n    if(record.descriptionRef)card.append(el('p','',t(record.descriptionRef)));\n    const meta=el('div','assortment-project-identity__meta');meta.append(el('span','',`${record.threads?.length??0} ${t('assortment.project-identity.contexts')}`));card.append(meta);\n  }else if(record.summaryRef)card.append(el('p','',t(record.summaryRef)));\n  const identity=el('div','assortment-inspector-card__identity');identity.append(el('small','',t('assortment.inspector.identity')),el('code','',inspection.ref));card.append(identity,sourceDetails(record,t));\n  if(inspection.kind==='PROJECT'){\n    const open=btn('assortment-primary',t('assortment.action.open-project'),()=>void preview.openProject(record.terrainRef));open.dataset.vexActionRef='action.assortment.projects.open-project';open.dataset.vexElementRef=`element.assortment.inspector.open.${record.projectRef}`;card.append(open);\n  }else if(inspection.kind==='WORK'&&record.workRef.startsWith('work.vexlife.assortment.')){\n    const open=btn('assortment-primary',t('assortment.action.open-work-context'),()=>void preview.openPresentation(ASSORTMENT_PROJECT_DEPTH_SURFACE_REF));open.dataset.vexActionRef='action.assortment.work.open-context';open.dataset.vexElementRef='element.assortment.inspector.open-work-context';card.append(open);\n  }\n  root.append(card);host.append(root);\n}\n",
    'PROJECT_INSPECTOR_SUPPORT');
  projection=replaceBetween(projection,
    "async function openPresentation(ref){",
    "  async function openSemanticSibling(terrainRef){",
    "async function openPresentation(ref){const current=activeSurface();if(current&&ASSORTMENT_SURFACES.has(current))presentationStack.push(current);return openSurface(ref);}\n  function projectEntryForTerrain(terrainRef){\n    if(app.terrain.parentRef(terrainRef)!==ASSORTMENT_TERRAIN_REFS.projects)return null;\n    const projectRef=app.projectRefForTerrain?.(terrainRef)??null;\n    const project=projectRef?(app.projects??[]).find((item)=>item.projectRef===projectRef):null;\n    if(!project)return null;\n    return Object.freeze({...structuredClone(project),terrainRef,sourceRefs:['blueprint/fragments/terrain.json','reference/browser/modules/demo-data.js','reference/browser/app.js']});\n  }\n  function projectEntries(){return app.terrain.childRefs(ASSORTMENT_TERRAIN_REFS.projects).map(projectEntryForTerrain).filter(Boolean);}\n  function setInspection(kind,record){const ref=kind==='WORK'?record?.workRef:kind==='PROJECT'?record?.projectRef:record?.recordRef??record?.eventRef??record?.momentRef;if(!ref)throw new Error('Inspectable record requires stable ref');inspectionState=Object.freeze({kind,ref,record:structuredClone(record)});return inspectionState;}\n  async function inspectWork(work){setInspection('WORK',work);return openPresentation(ASSORTMENT_INSPECTOR_SURFACE_REF);}\n  async function inspectRecord(record){setInspection('RECORD',record);return openPresentation(ASSORTMENT_INSPECTOR_SURFACE_REF);}\n  async function inspectProject(project){setInspection('PROJECT',project);return openPresentation(ASSORTMENT_INSPECTOR_SURFACE_REF);}\n  async function inspectTerrainRecord(terrainRef){const recordRef=FRONTIER_RECORD_FOR_TERRAIN[terrainRef];if(!recordRef)return false;const data=await ensureFixture(),record=data.revisit.find((item)=>item.recordRef===recordRef);if(!record)throw new Error(`Frontier record missing for ${terrainRef}`);presentationStack.splice(0);setInspection('RECORD',record);await openSurface(ASSORTMENT_INSPECTOR_SURFACE_REF);return true;}\n  async function inspectTerrainProject(terrainRef){const project=projectEntryForTerrain(terrainRef);if(!project)return false;presentationStack.splice(0);setInspection('PROJECT',project);await openSurface(ASSORTMENT_INSPECTOR_SURFACE_REF);return true;}\n  async function openProject(terrainRef){\n    const project=projectEntryForTerrain(terrainRef);if(!project)return Object.freeze({state:'BLOCKED',reason:'PROJECT_TERRAIN_IDENTITY_UNAVAILABLE',terrainRef});\n    presentationStack.splice(0);\n    if(activeSurface())await app.uxProjectionShell.closeEvolutionActiveSurface('ASSORTMENT_PROJECT_SEMANTIC_ENTRY');\n    if(!await waitForTerrainIdle())return Object.freeze({state:'HELD_TERRAIN_TRANSITION_ACTIVE',terrainRef});\n    const changed=await app.terrain.travel(terrainRef,'in');return Object.freeze({state:changed?'OPENED_PROJECT_SEMANTIC_CONTEXT':'HELD',terrainRef,projectRef:project.projectRef});\n  }\n  function currentContextActionForNode(terrainRef){const surface=SURFACE_FOR_TERRAIN[terrainRef];if(surface)return Object.freeze({label:t('terrain.current-context.open'),invoke:()=>{presentationStack.splice(0);return openSurface(surface);}});if(FRONTIER_RECORD_FOR_TERRAIN[terrainRef])return Object.freeze({label:t('assortment.action.inspect'),invoke:()=>inspectTerrainRecord(terrainRef)});if(projectEntryForTerrain(terrainRef))return Object.freeze({label:t('assortment.action.inspect'),invoke:()=>inspectTerrainProject(terrainRef)});return null;}\n",
    'PROJECT_SEMANTIC_ACTIONS');
  projection=replaceOnce(projection,
    "async function handleTerrainNode(terrainRef){if(FRONTIER_RECORD_FOR_TERRAIN[terrainRef])return inspectTerrainRecord(terrainRef);const surface=SURFACE_FOR_TERRAIN[terrainRef];if(!surface)return false;presentationStack.splice(0);await openSurface(surface);return true;}",
    "async function handleTerrainNode(terrainRef){if(FRONTIER_RECORD_FOR_TERRAIN[terrainRef])return inspectTerrainRecord(terrainRef);if(projectEntryForTerrain(terrainRef))return inspectTerrainProject(terrainRef);const surface=SURFACE_FOR_TERRAIN[terrainRef];if(!surface)return false;presentationStack.splice(0);await openSurface(surface);return true;}",
    'PROJECT_TERRAIN_ROUTE');
  projection=replaceOnce(projection,
    "function snapshot(){return Object.freeze({previewRef:ASSORTMENT_PREVIEW_REF,activeSurfaceRef:activeSurface(),surfaceBackDepth:presentationStack.length,truthClass:truthMode==='LIVE'?'OWNER_BACKED_LIVE_OR_HELD':fixture?.truthClass??null,truthMode,liveState:liveTruth?.state??'UNREQUESTED',liveProjectStatusState:liveTruth?.projectStatus?.state??'UNREQUESTED',inspectionRef:inspectionState?.ref??null});}",
    "function snapshot(){return Object.freeze({previewRef:ASSORTMENT_PREVIEW_REF,activeSurfaceRef:activeSurface(),surfaceBackDepth:presentationStack.length,truthClass:truthMode==='LIVE'?'OWNER_BACKED_LIVE_OR_HELD':fixture?.truthClass??null,truthMode,liveState:liveTruth?.state??'UNREQUESTED',liveProjectStatusState:liveTruth?.projectStatus?.state??'UNREQUESTED',inspectionRef:inspectionState?.ref??null,projectSpatialChildren:projectEntries().length});}",
    'PROJECT_SEMANTIC_SNAPSHOT');
  projection=replaceOnce(projection,
    "const api=Object.freeze({register,handleTerrainNode,currentContextActionForNode,inspectWork,inspectRecord,inspection,openPresentation,openSemanticSibling,back,onShellClose,relocalize,setTruthMode,snapshot});",
    "const api=Object.freeze({register,handleTerrainNode,currentContextActionForNode,projectEntries,inspectProject,inspectWork,inspectRecord,inspection,openProject,openPresentation,openSemanticSibling,back,onShellClose,relocalize,setTruthMode,snapshot});",
    'PROJECT_SEMANTIC_API');
  write(rel,projection);
}

{
  const rel='reference/browser/app.js';let app=read(rel);
  app=replaceOnce(app,
    "const purposeWorkspaceEvolution=createPurposeWorkspaceEvolutionAdapter({t,projectRefForTerrain:(terrainRef)=>TERRAIN_CONTEXT[terrainRef]?.projectRef??null});",
    "const projectRefForTerrain=(terrainRef)=>TERRAIN_CONTEXT[terrainRef]?.projectRef??null;\nconst purposeWorkspaceEvolution=createPurposeWorkspaceEvolutionAdapter({t,projectRefForTerrain});",
    'PROJECT_REF_FOR_TERRAIN_OWNER_EXPOSE');
  app=replaceOnce(app,
    "applyContextWorkspaceLayout,purposeWorkspaceEvolution,uxProjectionShell};",
    "applyContextWorkspaceLayout,projectRefForTerrain,purposeWorkspaceEvolution,uxProjectionShell};",
    'PROJECT_REF_FOR_TERRAIN_APP_BINDING');
  write(rel,app);
}

for(const rel of ['reference/browser/evolution/assortment-continuity-projection.js','reference/browser/app.js'])execFileSync(process.execPath,['--check',path.join(SRC,rel)],{cwd:SRC,stdio:['ignore','pipe','pipe'],encoding:'utf8'});

const finalTerrain=JSON.parse(read('blueprint/fragments/terrain.json'));
const projectChildren=finalTerrain.filter((node)=>node.parentRef==='terrain.assortment.projects');
const descendantCount=(rootRef)=>{let count=0,queue=projectChildren.filter((node)=>node.terrainNodeRef===rootRef).map((node)=>node.terrainNodeRef);if(!queue.length)queue=[rootRef];while(queue.length){const ref=queue.shift();for(const node of finalTerrain)if(node.parentRef===ref){count++;queue.push(node.terrainNodeRef);}}return count;};
const below=projectChildren.length+projectChildren.reduce((sum,node)=>sum+descendantCount(node.terrainNodeRef),0);
const changed=git('status','--short').split('\n').filter(Boolean);
const result={
  schemaVersion:'vexlife-assortment.project-semantic-map-practicum-patch/v1',
  previewRef:binding.candidatePreviewRef,
  state:'FORMED',
  head:binding.predecessorSourceHead,
  predecessorPreviewRef:binding.predecessorPreviewRef,
  recoveredProjectRoots:projectChildren.map((node)=>node.terrainNodeRef),
  projectSpatialChildren:projectChildren.length,
  projectDescendantsBelow:below,
  newCanonicalProjectAdmission:false,
  liveProjectCatalogFormed:false,
  changed
};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
// [VXG RealForever]
