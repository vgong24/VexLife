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
const payload=(name)=>fs.readFileSync(path.join(PACKAGE_ROOT,'payload',name),'utf8');
const read=(rel)=>fs.readFileSync(path.join(SRC,rel),'utf8');
const write=(rel,value)=>{const target=path.join(SRC,rel);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,value,'utf8')};
const git=(...args)=>execFileSync('git',args,{cwd:SRC,encoding:'utf8'}).trim();
const assert=(value,message)=>{if(!value)throw new Error(message)};
const replaceOnce=(value,needle,replacement,label)=>{const first=value.indexOf(needle),last=value.lastIndexOf(needle);assert(first>=0,\`PATCH_MARKER_MISSING:\${label}\`);assert(first===last,\`PATCH_MARKER_NOT_UNIQUE:\${label}\`);return value.slice(0,first)+replacement+value.slice(first+needle.length)};

assert(git('rev-parse','HEAD')===binding.liveMainAtFormation,\`HEAD_BINDING_MISMATCH:\${git('rev-parse','HEAD')}!=\${binding.liveMainAtFormation}\`);
for(const [rel,expected] of Object.entries(binding.sourceBindings)){
  const observed=git('rev-parse',\`HEAD:\${rel}\`);
  assert(observed===expected,\`SOURCE_BLOB_MISMATCH:\${rel}:\${observed}!=\${expected}\`);
}

{
  const rel='blueprint/fragments/terrain.json';
  const terrain=JSON.parse(read(rel));
  const refs=new Set(terrain.map((x)=>x.terrainNodeRef));
  const nodes=[
    {terrainNodeRef:'terrain.assortment.continue',parentRef:'terrain.project.root-hub',labelStringRef:'assortment.node.continue',kind:'RESOURCE',defaultPosition:{x:260,y:620}},
    {terrainNodeRef:'terrain.assortment.projects',parentRef:'terrain.project.root-hub',labelStringRef:'assortment.node.projects',kind:'RESOURCE',defaultPosition:{x:600,y:650}},
    {terrainNodeRef:'terrain.assortment.frontier',parentRef:'terrain.project.root-hub',labelStringRef:'assortment.node.frontier',kind:'RESOURCE',defaultPosition:{x:940,y:620}}
  ];
  for(const node of nodes){assert(!refs.has(node.terrainNodeRef),\`TERRAIN_PREVIEW_REF_COLLISION:\${node.terrainNodeRef}\`);terrain.push(node);}
  write(rel,JSON.stringify(terrain,null,2)+'\n');
}

{
  const rel='blueprint/ux-evolution-shell-scaffold.json';
  const scaffold=JSON.parse(read(rel));
  const refs=new Set(scaffold.surfaceInventory.map((x)=>x.surfaceRef));
  const surfaces=[
    ['surface.vexlife.assortment-continuity','Continuity','assortmentPreviewContinuity'],
    ['surface.vexlife.assortment-projects','Projects','assortmentPreviewProjects'],
    ['surface.vexlife.assortment-project-depth','Project depth','assortmentPreviewProjectDepth'],
    ['surface.vexlife.assortment-frontier','Frontier','assortmentPreviewFrontier']
  ];
  for(const [surfaceRef,title,controlId] of surfaces){assert(!refs.has(surfaceRef),\`SURFACE_REF_COLLISION:\${surfaceRef}\`);scaffold.surfaceInventory.push({surfaceRef,semanticRef:'feature.vexlife.contextual-workspace',title,controlId,referenceProjectionAvailable:false});}
  write(rel,JSON.stringify(scaffold,null,2)+'\n');
}
{
  const rel='blueprint/ux-evolution-registry.json';
  const registry=JSON.parse(read(rel));
  const record=registry.migrationRecords.find((x)=>x.semanticRef==='feature.vexlife.contextual-workspace');
  assert(record,'CONTEXTUAL_WORKSPACE_MIGRATION_RECORD_MISSING');
  assert(record.migrationLifecycleState==='SOURCE_MAPPED','CONTEXTUAL_WORKSPACE_UNEXPECTED_LIFECYCLE');
  assert(Array.isArray(record.evolutionProjectionRefs)&&record.evolutionProjectionRefs.length===0,'CONTEXTUAL_WORKSPACE_UNEXPECTED_EVOLUTION_PROJECTIONS');
  record.migrationLifecycleState='SHADOW_IMPLEMENTED';
  record.evolutionProjectionRefs=[
    'projection.vexlife-assortment.r2.clean.projects-room',
    'projection.vexlife-assortment.r2.clean.continuity-doorway',
    'projection.vexlife-assortment.r2.clean.project-depth',
    'projection.vexlife-assortment.r2.clean.frontier'
  ];
  write(rel,JSON.stringify(registry,null,2)+'\n');
}

for(const language of ['en','zh','ja']){
  const rel=\`blueprint/strings/\${language}.json\`,catalog=JSON.parse(read(rel));
  for(const [ref,value] of Object.entries(additions[language])){assert(!Object.hasOwn(catalog,ref),\`LOCALIZATION_REF_COLLISION:\${language}:\${ref}\`);catalog[ref]=value;}
  write(rel,JSON.stringify(catalog,null,2)+'\n');
}

write('reference/browser/evolution/assortment-continuity-projection.js',payload('assortment-continuity-projection.js'));
write('reference/browser/evolution/assortment-continuity.css',payload('assortment-continuity.css'));
write('reference/browser/evolution/assortment-fixtures.json',payload('assortment-fixtures.json'));

{
  const rel='reference/browser/index.html';let html=read(rel);
  html=replaceOnce(html,
    '      <div class="uxe-active-surface-actions">\n        <button id="evolutionReferenceFallback" type="button">Reference</button>',
    '      <div class="uxe-active-surface-actions">\n        <button id="evolutionActiveSurfaceBack" type="button" aria-label="Back" hidden>←</button>\n        <button id="evolutionReferenceFallback" type="button">Reference</button>',
    'EVOLUTION_HEADER_BACK');
  write(rel,html);
}

{
  const rel='reference/browser/app.js';let app=read(rel);
  app=replaceOnce(app,
    "import { PURPOSE_WORKSPACE_EVOLUTION_SURFACE_REF, createPurposeWorkspaceEvolutionAdapter } from './evolution/purpose-workspace-projection.js';",
    "import { PURPOSE_WORKSPACE_EVOLUTION_SURFACE_REF, createPurposeWorkspaceEvolutionAdapter } from './evolution/purpose-workspace-projection.js';\nimport { createAssortmentPreview } from './evolution/assortment-continuity-projection.js';",
    'ASSORTMENT_IMPORT');
  app=replaceOnce(app,
    "terrain=createTerrainController({state,blueprint,t,navigation,semanticPatchForNode,onCurrentNode:()=>{if(chat)queueMicrotask(()=>projectFrame());}});",
    "terrain=createTerrainController({state,blueprint,t,navigation,semanticPatchForNode,onCurrentNode:(nodeRef)=>{if(chat)queueMicrotask(()=>projectFrame());queueMicrotask(()=>{void globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__?.handleTerrainNode?.(nodeRef);});}});",
    'TERRAIN_ON_CURRENT_NODE');
  app=replaceOnce(app,
    "ensureConversationEvolutionStylesheet();",
    "const assortmentPreview=createAssortmentPreview({app:globalThis.__VEXLIFE_APP__,t});\nglobalThis.__VEXLIFE_ASSORTMENT_PREVIEW__=assortmentPreview;\nensureConversationEvolutionStylesheet();",
    'ASSORTMENT_PREVIEW_FORMATION');
  app=replaceOnce(app,
    "registerEvolutionSurfaceAdapter(PURPOSE_WORKSPACE_EVOLUTION_SURFACE_REF,purposeWorkspaceEvolution);\nawait loadAndRegisterLivingJournalEvolutionSurface(globalThis.__VEXLIFE_APP__);",
    "registerEvolutionSurfaceAdapter(PURPOSE_WORKSPACE_EVOLUTION_SURFACE_REF,purposeWorkspaceEvolution);\nawait assortmentPreview.register();\nawait loadAndRegisterLivingJournalEvolutionSurface(globalThis.__VEXLIFE_APP__);",
    'ASSORTMENT_ADAPTER_REGISTRATION');
  app=replaceOnce(app,
    "$('#evolutionActiveSurfaceClose').addEventListener('click',()=>{void closeEvolutionActiveSurface('SHELL_CLOSE')});",
    "$('#evolutionActiveSurfaceBack').addEventListener('click',()=>{void globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__?.back?.()});\n$('#evolutionActiveSurfaceClose').addEventListener('click',()=>{globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__?.onShellClose?.();void closeEvolutionActiveSurface('SHELL_CLOSE')});",
    'SHELL_BACK_AND_CLOSE');
  app=replaceOnce(app,
    "else if(state.uxActiveSurfaceRef){void closeEvolutionActiveSurface('SHELL_ESCAPE');}",
    "else if(state.uxActiveSurfaceRef){globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__?.onShellClose?.();void closeEvolutionActiveSurface('SHELL_ESCAPE');}",
    'SHELL_ESCAPE_CLOSE');
  app=replaceOnce(app,
    "$('#languageSelect').addEventListener('change',(event)=>{state.language=event.target.value;localStorage.setItem('vexlife.language',state.language);navigation.navigate('element.language.selector',{},'action.language.select');applyLocalization();});",
    "$('#languageSelect').addEventListener('change',(event)=>{state.language=event.target.value;localStorage.setItem('vexlife.language',state.language);navigation.navigate('element.language.selector',{},'action.language.select');applyLocalization();void globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__?.relocalize?.();});",
    'ASSORTMENT_RELOCALIZE');
  write(rel,app);
}

const changed=git('status','--short').split('\n').filter(Boolean);
const result={schemaVersion:'vexlife-assortment.clean-reform-patch/v1',previewRef:binding.candidatePreviewRef,state:'FORMED',head:binding.liveMainAtFormation,changed};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
// [VXG RealForever]
