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
const replaceOnce=(value,needle,replacement,label)=>{const first=value.indexOf(needle),last=value.lastIndexOf(needle);assert(first>=0,`PATCH_MARKER_MISSING:${label}`);assert(first===last,`PATCH_MARKER_NOT_UNIQUE:${label}`);return value.slice(0,first)+replacement+value.slice(first+needle.length)};

assert(git('rev-parse','HEAD')===binding.predecessorSourceHead,`HEAD_BINDING_MISMATCH:${git('rev-parse','HEAD')}!=${binding.predecessorSourceHead}`);
const predecessorPatch=path.resolve(PACKAGE_ROOT,binding.predecessorPatch);
execFileSync(process.execPath,[predecessorPatch,SRC],{cwd:SRC,stdio:['ignore','pipe','pipe'],encoding:'utf8',maxBuffer:32*1024*1024});

{
  const rel='blueprint/fragments/terrain.json';
  const terrain=JSON.parse(read(rel));
  const remove=new Set([
    'terrain.project.self-development','terrain.thread.open-conversation','terrain.resource.relationships',
    'terrain.project.vex-home-product','terrain.thread.guided-fresh','terrain.thread.product-workshop',
    'terrain.project.local-vex','terrain.thread.foundation'
  ]);
  const next=terrain.filter((node)=>!remove.has(node.terrainNodeRef));
  assert(next.length===terrain.length-remove.size,'HOME_PLACEHOLDER_REMOVAL_COUNT_MISMATCH');
  assert(!next.some((node)=>node.terrainNodeRef==='terrain.assortment.vex'),'VEX_NODE_ALREADY_PRESENT');
  next.push({terrainNodeRef:'terrain.assortment.vex',parentRef:'terrain.project.root-hub',labelStringRef:'assortment.node.vex',kind:'RESOURCE',defaultPosition:{x:280,y:420}});
  const positions={
    'terrain.assortment.continue':{x:520,y:350},
    'terrain.assortment.projects':{x:790,y:410},
    'terrain.assortment.frontier':{x:1020,y:520},
    'terrain.thread.root-welcome':{x:560,y:650}
  };
  for(const node of next)if(positions[node.terrainNodeRef])node.defaultPosition=positions[node.terrainNodeRef];
  write(rel,JSON.stringify(next,null,2)+'\n');
}

{
  const rel='blueprint/ux-evolution-shell-scaffold.json';
  const scaffold=JSON.parse(read(rel));
  assert(!scaffold.surfaceInventory.some((item)=>item.surfaceRef==='surface.vexlife.assortment-vex'),'VEX_SURFACE_REF_COLLISION');
  scaffold.surfaceInventory.push({surfaceRef:'surface.vexlife.assortment-vex',semanticRef:'feature.vexlife.screen-aware-guide',title:'Vex',controlId:'assortmentPreviewVex',referenceProjectionAvailable:false});
  write(rel,JSON.stringify(scaffold,null,2)+'\n');
}

{
  const rel='blueprint/ux-evolution-registry.json';
  const registry=JSON.parse(read(rel));
  const record=registry.migrationRecords.find((item)=>item.semanticRef==='feature.vexlife.screen-aware-guide');
  assert(record,'SCREEN_AWARE_GUIDE_MIGRATION_RECORD_MISSING');
  assert(record.migrationLifecycleState==='SOURCE_MAPPED','SCREEN_AWARE_GUIDE_UNEXPECTED_LIFECYCLE');
  assert(Array.isArray(record.evolutionProjectionRefs)&&record.evolutionProjectionRefs.length===0,'SCREEN_AWARE_GUIDE_UNEXPECTED_EVOLUTION_PROJECTIONS');
  record.migrationLifecycleState='SHADOW_IMPLEMENTED';
  record.evolutionProjectionRefs=['projection.vexlife-assortment.r2.vex-companion-legibility'];
  write(rel,JSON.stringify(registry,null,2)+'\n');
}

for(const language of ['en','zh','ja']){
  const rel=`blueprint/strings/${language}.json`,catalog=JSON.parse(read(rel));
  for(const [ref,value] of Object.entries(additions[language])){assert(!Object.hasOwn(catalog,ref),`LOCALIZATION_REF_COLLISION:${language}:${ref}`);catalog[ref]=value;}
  write(rel,JSON.stringify(catalog,null,2)+'\n');
}

write('reference/browser/evolution/assortment-vex-node.js',payload('vex-node-projection.js'));
write('reference/browser/evolution/assortment-vex-node.css',payload('vex-node.css'));

{
  const rel='reference/browser/index.html';let html=read(rel);
  const menuControl='    <div id="uxProjectionControl" class="uxe-projection-control">\n      <label for="uxProjectionSelect">Projection</label>\n      <select id="uxProjectionSelect" aria-describedby="uxProjectionStatus">\n        <option value="REFERENCE_PROJECTION">Reference</option>\n        <option value="EVOLUTION_PROJECTION">Evolution</option>\n      </select>\n      <output id="uxProjectionStatus" role="status">Reference · default</output>\n    </div>\n';
  html=replaceOnce(html,menuControl,'','REMOVE_MENU_PROJECTION_CONTROL');
  html=replaceOnce(html,
    '    <div class="e27-actions">\n      \n      <button id="terrainUp" type="button" data-node-ref="element.terrain.semantic-depth-decrease">Up one layer</button>',
    '    <div class="e27-actions">\n      <div id="uxProjectionControl" class="assortment-projection-toggle">\n        <label for="uxProjectionSelect">View</label>\n        <select id="uxProjectionSelect" aria-describedby="uxProjectionStatus">\n          <option value="REFERENCE_PROJECTION">Reference</option>\n          <option value="EVOLUTION_PROJECTION">Evolution</option>\n        </select>\n        <output id="uxProjectionStatus" role="status">Reference · default</output>\n      </div>\n      <button id="terrainUp" type="button" data-node-ref="element.terrain.semantic-depth-decrease">Up one layer</button>',
    'APPBAR_PROJECTION_CONTROL');
  write(rel,html);
}

{
  const rel='reference/browser/app.js';let app=read(rel);
  app=replaceOnce(app,
    "import { createAssortmentPreview } from './evolution/assortment-continuity-projection.js';",
    "import { createAssortmentPreview } from './evolution/assortment-continuity-projection.js';\nimport { createVexNodePreview } from './evolution/assortment-vex-node.js';",
    'VEX_NODE_IMPORT');
  app=replaceOnce(app,
    "const { projects, roles, channels, messages, state, createMessage, conversationKey } = createDemoData({ loadJson });",
    "const { projects, roles, channels, messages, state, createMessage, conversationKey } = createDemoData({ loadJson });\nconst oneVexLegacyRoleKeys=new Set(['companion','guide','root']);\nfor(const roleKey of ['guide','root'])roles[roleKey]={...roles.companion};\n{\n  const directByThread=new Map();\n  for(const channel of channels){\n    if(channel.kind!=='DIRECT'||!oneVexLegacyRoleKeys.has(channel.roleKey))continue;\n    const prior=directByThread.get(channel.threadRef);\n    if(!prior||channel.roleKey==='companion')directByThread.set(channel.threadRef,channel);\n  }\n  const keepRefs=new Set([...directByThread.values()].map((channel)=>channel.channelRef));\n  const normalized=channels.filter((channel)=>!(channel.kind==='DIRECT'&&oneVexLegacyRoleKeys.has(channel.roleKey))||keepRefs.has(channel.channelRef));\n  channels.splice(0,channels.length,...normalized);\n  for(const channel of channels){\n    if(channel.kind==='DIRECT'&&keepRefs.has(channel.channelRef)){channel.roleKey='companion';channel.memberKeys=['victor','companion'];channel.labelRef='channel.companion.name';}\n    else if(channel.kind==='GROUP')channel.memberKeys=[...new Set(channel.memberKeys.map((key)=>oneVexLegacyRoleKeys.has(key)?'companion':key))];\n  }\n  for(const [threadRef,channel] of directByThread)state.selectedChannelByThread.set(threadRef,channel.channelRef);\n  if(!channels.some((channel)=>channel.channelRef===state.channelRef)){const fallback=directByThread.get(state.threadRef);if(fallback)state.channelRef=fallback.channelRef;}\n}",
    'ONE_VEX_IDENTITY_NORMALIZATION');
  app=replaceOnce(app,
    "chat=createChatController({state,projects,roles,channels,messages,createMessage,conversationKey,t,navigation,experienceFoundation,capabilityRegistry});",
    "chat=createChatController({state,projects,roles,channels,messages,createMessage,conversationKey,t,navigation,experienceFoundation,capabilityRegistry,onCompanionTurnCompleted:async(projection)=>{guide?.bindCompanionTurn?.(projection);guide?.addMessage?.('guide',projection.content);globalThis.__VEXLIFE_VEX_PREVIEW__?.setCompanionTurn?.(projection);}});",
    'COMPANION_TURN_NERVE');
  app=replaceOnce(app,
    "queueMicrotask(()=>{void globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__?.handleTerrainNode?.(nodeRef);});",
    "queueMicrotask(()=>{void globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__?.handleTerrainNode?.(nodeRef);void globalThis.__VEXLIFE_VEX_PREVIEW__?.handleTerrainNode?.(nodeRef);});",
    'TERRAIN_VEX_NODE_ROUTE');
  app=replaceOnce(app,
    "const assortmentPreview=createAssortmentPreview({app:globalThis.__VEXLIFE_APP__,t});\nglobalThis.__VEXLIFE_ASSORTMENT_PREVIEW__=assortmentPreview;",
    "const assortmentPreview=createAssortmentPreview({app:globalThis.__VEXLIFE_APP__,t});\nconst vexNodePreview=createVexNodePreview({app:globalThis.__VEXLIFE_APP__,t,capabilityRegistry});\nglobalThis.__VEXLIFE_ASSORTMENT_PREVIEW__=assortmentPreview;\nglobalThis.__VEXLIFE_VEX_PREVIEW__=vexNodePreview;",
    'VEX_NODE_PREVIEW_FORMATION');
  app=replaceOnce(app,
    "await assortmentPreview.register();\nawait loadAndRegisterLivingJournalEvolutionSurface(globalThis.__VEXLIFE_APP__);",
    "await assortmentPreview.register();\nawait vexNodePreview.register();\nawait loadAndRegisterLivingJournalEvolutionSurface(globalThis.__VEXLIFE_APP__);",
    'VEX_NODE_PREVIEW_REGISTRATION');
  app=replaceOnce(app,
    "$('#evolutionActiveSurfaceBack').addEventListener('click',()=>{void globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__?.back?.()});",
    "$('#evolutionActiveSurfaceBack').addEventListener('click',()=>{if(globalThis.__VEXLIFE_VEX_PREVIEW__?.ownsActiveSurface?.()){void globalThis.__VEXLIFE_VEX_PREVIEW__.back();return;}void globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__?.back?.()});",
    'VEX_NODE_BACK_ROUTE');
  app=replaceOnce(app,
    "$('#evolutionActiveSurfaceClose').addEventListener('click',()=>{globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__?.onShellClose?.();void closeEvolutionActiveSurface('SHELL_CLOSE')});",
    "$('#evolutionActiveSurfaceClose').addEventListener('click',()=>{globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__?.onShellClose?.();globalThis.__VEXLIFE_VEX_PREVIEW__?.onShellClose?.();void closeEvolutionActiveSurface('SHELL_CLOSE')});",
    'VEX_NODE_SHELL_CLOSE');
  app=replaceOnce(app,
    "else if(state.uxActiveSurfaceRef){globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__?.onShellClose?.();void closeEvolutionActiveSurface('SHELL_ESCAPE');}",
    "else if(state.uxActiveSurfaceRef){globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__?.onShellClose?.();globalThis.__VEXLIFE_VEX_PREVIEW__?.onShellClose?.();void closeEvolutionActiveSurface('SHELL_ESCAPE');}",
    'VEX_NODE_ESCAPE_CLOSE');
  app=replaceOnce(app,
    "applyLocalization();void globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__?.relocalize?.();});",
    "applyLocalization();void globalThis.__VEXLIFE_ASSORTMENT_PREVIEW__?.relocalize?.();void globalThis.__VEXLIFE_VEX_PREVIEW__?.relocalize?.();});",
    'VEX_NODE_RELOCALIZE');
  write(rel,app);
}

const changed=git('status','--short').split('\n').filter(Boolean);
const result={schemaVersion:'vexlife-assortment.vex-node-practicum-patch/v1',previewRef:binding.candidatePreviewRef,state:'FORMED',head:binding.predecessorSourceHead,changed};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
// [VXG RealForever]
