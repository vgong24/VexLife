import { loadBrowserBundle } from './modules/browser-bundle.js';
import { createDemoData } from './modules/demo-data.js';
import { $, $$, compileInterfaceEntries, loadJson } from './modules/dom.js';
import { createNavigationController } from './modules/navigation-controller.js';
import { createChatController } from './modules/chat-controller.js';
import { createTerrainController } from './modules/terrain-controller.js';
import { createGuideController, GUIDE_INTENTS } from './modules/guide-controller.js';
import { createFeatureWalkthroughGuideAdapter } from './modules/feature-walkthrough-guide-adapter.js';
import { createLivingJournalController } from './modules/living-journal-controller.js';
import { createLivingJournalDemoData } from './modules/living-journal-demo-data.js';

const { blueprint, experience, featureRegistry, designTokens, catalogs } = await loadBrowserBundle('../../');
const rootContract = experience.authoritativeRootDesignContract;
if (rootContract?.contractRef !== 'contract.vexlife.e27.authoritative-root/v1' || rootContract?.defaultShellGrammar?.singleStageDefault !== true || rootContract?.defaultShellGrammar?.legacyCurrentBrowserPreservationDefault !== false) throw new Error('Direct-root browser requires accepted E2.7 authoritative-root contract');

const { projects, roles, channels, messages, state, createMessage, conversationKey } = createDemoData({ loadJson });
const livingJournalData = createLivingJournalDemoData();
state.view = 'terrain';
state.contextProjection = null;
state.workspaceOpen = false;
state.dataTruthClass = 'CURRENT_SYNTHETIC_REFERENCE';
const LIVING_JOURNAL_MEMORY_API_PATH='/api/v1/living-journal/memory';
const LIVING_JOURNAL_ARCHIVE_API_PATH='/api/v1/living-journal/archive';
const LIVING_JOURNAL_MEMORY_MAX_PAGES=24;
const LIVING_JOURNAL_ARCHIVE_MAX_DAYS=7;
const LIVING_JOURNAL_REAL_MEMORY_TRUTHS=new Set(['CURRENT_MEMORY_REFERENCE','MEMORY_REFERENCE_HELD']);
state.livingJournalMemoryState='UNREQUESTED';
state.livingJournalMemoryFailureCode=null;
state.livingJournalArchiveState='UNREQUESTED';state.livingJournalArchiveFailureCode=null;state.livingJournalArchivePacket=null;state.livingJournalCurrentPacket=null;
if (localStorage.getItem('vexlife.guide.open') === null) state.guideOpen = true;
const storedGuideMinimized = localStorage.getItem('vexlife.guide.minimized');
state.guideMinimized = storedGuideMinimized === null ? true : storedGuideMinimized === 'true';

const CONTEXT_WORKSPACE_STORAGE_KEY='vexlife.contextual-workspace.layout';
const CONTEXT_WORKSPACE_DEFAULT=Object.freeze({dockMode:'OVERLAY',width:900,height:620,splitFocusMode:'NONE'});
const CONTEXT_WORKSPACE_DOCKS=new Set(['OVERLAY','DOCK_LEFT','DOCK_RIGHT']);
const CONTEXT_WORKSPACE_SPLITS=new Set(['NONE','TERRAIN_PLUS_ACTIVE_CONTEXT']);
const clampWorkspace=(v,min,max)=>Math.max(min,Math.min(max,v));
function loadContextWorkspacePreferred(){let parsed={};try{parsed=JSON.parse(localStorage.getItem(CONTEXT_WORKSPACE_STORAGE_KEY)||'{}')}catch{}return{dockMode:CONTEXT_WORKSPACE_DOCKS.has(parsed.dockMode)?parsed.dockMode:CONTEXT_WORKSPACE_DEFAULT.dockMode,width:Number.isFinite(parsed.width)?clampWorkspace(parsed.width,360,1200):CONTEXT_WORKSPACE_DEFAULT.width,height:Number.isFinite(parsed.height)?clampWorkspace(parsed.height,320,900):CONTEXT_WORKSPACE_DEFAULT.height,splitFocusMode:CONTEXT_WORKSPACE_SPLITS.has(parsed.splitFocusMode)?parsed.splitFocusMode:CONTEXT_WORKSPACE_DEFAULT.splitFocusMode}}
const contextWorkspace={preferred:loadContextWorkspacePreferred(),resolved:null,runtime:{resizeSession:null}};
const contextWorkspaceViewportClass=()=>innerWidth<=760?'COMPACT':'WIDE';
function resolveContextWorkspaceLayout(){const p=contextWorkspace.preferred,viewportClass=contextWorkspaceViewportClass();if(viewportClass==='COMPACT')return{viewportClass,mode:'COMPACT_SHEET',width:Math.max(0,innerWidth-16),height:Math.max(320,innerHeight-150),splitFocusApplied:false};const maxWidth=Math.max(420,innerWidth-220),maxHeight=Math.max(360,innerHeight-168),mode=CONTEXT_WORKSPACE_DOCKS.has(p.dockMode)?p.dockMode:'OVERLAY';return{viewportClass,mode,width:clampWorkspace(p.width,360,maxWidth),height:clampWorkspace(p.height,320,maxHeight),splitFocusApplied:p.splitFocusMode==='TERRAIN_PLUS_ACTIVE_CONTEXT'&&mode!=='OVERLAY'}}
function persistContextWorkspacePreferred(){localStorage.setItem(CONTEXT_WORKSPACE_STORAGE_KEY,JSON.stringify(contextWorkspace.preferred));}
function contextWorkspaceSnapshot(){return structuredClone({preferred:contextWorkspace.preferred,resolved:contextWorkspace.resolved,storageKey:CONTEXT_WORKSPACE_STORAGE_KEY});}
function applyContextWorkspaceLayout(){const surface=$('#contextSurface'),app=$('#app');if(!surface||!app)return null;const previous=contextWorkspace.resolved, resolved=resolveContextWorkspaceLayout();contextWorkspace.resolved=resolved;surface.dataset.contextWorkspaceMode=resolved.mode;surface.dataset.contextWorkspaceViewport=resolved.viewportClass;surface.style.setProperty('--context-workspace-width',resolved.width+'px');surface.style.setProperty('--context-workspace-height',resolved.height+'px');app.dataset.contextWorkspaceDock=resolved.mode;app.dataset.contextWorkspaceSplit=String(resolved.splitFocusApplied);app.style.setProperty('--context-workspace-width',resolved.width+'px');const dock=$('#contextWorkspaceDock'),split=$('#contextWorkspaceSplit'),status=$('#contextWorkspaceStatus');if(dock)dock.value=contextWorkspace.preferred.dockMode;if(split)split.checked=contextWorkspace.preferred.splitFocusMode==='TERRAIN_PLUS_ACTIVE_CONTEXT';if(status)status.textContent=t(resolved.viewportClass==='COMPACT'?'context-workspace.status.compact':'context-workspace.status.wide');if(terrain&&previous&&(previous.mode!==resolved.mode||previous.splitFocusApplied!==resolved.splitFocusApplied||previous.width!==resolved.width))queueMicrotask(()=>terrain?.render(true));return contextWorkspaceSnapshot()}
function setContextWorkspaceDock(dockMode,{persist=true}={}){if(!CONTEXT_WORKSPACE_DOCKS.has(dockMode))return contextWorkspaceSnapshot();contextWorkspace.preferred={...contextWorkspace.preferred,dockMode};if(persist)persistContextWorkspacePreferred();return applyContextWorkspaceLayout()}
function setContextWorkspaceSplitFocus(enabled,{persist=true}={}){contextWorkspace.preferred={...contextWorkspace.preferred,splitFocusMode:enabled?'TERRAIN_PLUS_ACTIVE_CONTEXT':'NONE'};if(persist)persistContextWorkspacePreferred();return applyContextWorkspaceLayout()}
function setContextWorkspaceSize(width,height,{persist=true}={}){contextWorkspace.preferred={...contextWorkspace.preferred,width:clampWorkspace(Number(width)||contextWorkspace.preferred.width,360,1200),height:clampWorkspace(Number(height)||contextWorkspace.preferred.height,320,900)};if(persist)persistContextWorkspacePreferred();return applyContextWorkspaceLayout()}
function resetContextWorkspaceLayout(){localStorage.removeItem(CONTEXT_WORKSPACE_STORAGE_KEY);contextWorkspace.preferred={...CONTEXT_WORKSPACE_DEFAULT};contextWorkspace.runtime.resizeSession=null;return applyContextWorkspaceLayout()}
function beginContextWorkspaceResize(event){if(contextWorkspaceViewportClass()==='COMPACT')return;const handle=event.currentTarget,corner=handle.dataset.contextWorkspaceResizeCorner||'se',start=contextWorkspace.preferred;contextWorkspace.runtime.resizeSession={pointerId:event.pointerId,corner,x:event.clientX,y:event.clientY,width:start.width,height:start.height};event.preventDefault();const move=(next)=>{const s=contextWorkspace.runtime.resizeSession;if(!s||next.pointerId!==s.pointerId)return;const dx=next.clientX-s.x,dy=next.clientY-s.y,width=s.width+(s.corner.includes('w')?-dx:dx),height=s.height+(s.corner.includes('n')?-dy:dy);setContextWorkspaceSize(width,height,{persist:false})};const end=(next)=>{const s=contextWorkspace.runtime.resizeSession;if(!s||next.pointerId!==s.pointerId)return;globalThis.removeEventListener('pointermove',move);globalThis.removeEventListener('pointerup',end);contextWorkspace.runtime.resizeSession=null;persistContextWorkspacePreferred();applyContextWorkspaceLayout()};globalThis.addEventListener('pointermove',move);globalThis.addEventListener('pointerup',end)}
function keyboardContextWorkspaceResize(event){if(contextWorkspaceViewportClass()==='COMPACT'||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const step=event.shiftKey?40:20,width=contextWorkspace.preferred.width+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),height=contextWorkspace.preferred.height+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0);setContextWorkspaceSize(width,height)}

const TERRAIN_CONTEXT = Object.freeze({
  'terrain.project.root-hub': { projectRef:'project.vexlife.root-hub', threadRef:'thread.root-hub.welcome', channelRef:'channel.root-hub.welcome.root' },
  'terrain.project.self-development': { projectRef:'project.self-development', threadRef:'thread.self-development.open-conversation', channelRef:'channel.self-development.companion' },
  'terrain.thread.open-conversation': { projectRef:'project.self-development', threadRef:'thread.self-development.open-conversation', channelRef:'channel.self-development.companion' },
  'terrain.project.vex-home-product': { projectRef:'project.vex-home-product', threadRef:'thread.vex-home.guided-fresh', channelRef:'channel.vex-home.guided-fresh.companion' },
  'terrain.thread.guided-fresh': { projectRef:'project.vex-home-product', threadRef:'thread.vex-home.guided-fresh', channelRef:'channel.vex-home.guided-fresh.companion' },
  'terrain.thread.product-workshop': { projectRef:'project.vex-home-product', threadRef:'thread.vex-home.product-workshop', channelRef:'channel.vex-home.product-workshop.companion' },
  'terrain.project.local-vex': { projectRef:'project.local-vex', threadRef:'thread.local-vex.foundation', channelRef:'channel.local-vex.foundation.root-hub' },
  'terrain.thread.foundation': { projectRef:'project.local-vex', threadRef:'thread.local-vex.foundation', channelRef:'channel.local-vex.foundation.root-hub' },
  'terrain.thread.root-welcome': { projectRef:'project.vexlife.root-hub', threadRef:'thread.root-hub.welcome', channelRef:'channel.root-hub.welcome.root' }
});

const initialTerrainRef = blueprint.terrain.find((node) => !node.parentRef)?.terrainNodeRef;
Object.assign(state, TERRAIN_CONTEXT[initialTerrainRef] || {});
state.terrain = { ...(state.terrain || {}), selected: initialTerrainRef };
state.selectedNodeRef = initialTerrainRef;
const elementByRef = new Map(compileInterfaceEntries(blueprint).map((entry) => [entry.ref, entry]));
const elementContractByRef = new Map(
  blueprint.screens.flatMap((screen) => screen.regions.flatMap((region) => region.elements))
    .map((element) => [element.elementRef, element])
);
const terrainNodeRefs = new Set(blueprint.terrain.map((node) => node.terrainNodeRef));
const semanticNodeRefForInteraction = (sourceRef) => {
  if (terrainNodeRefs.has(sourceRef)) return sourceRef;
  const mapped = elementContractByRef.get(sourceRef)?.terrainNodeRef ?? null;
  return mapped && terrainNodeRefs.has(mapped) ? mapped : null;
};
const interactionRefForSource = (sourceRef) => elementContractByRef.get(sourceRef)?.interactionRef ?? null;
const t = (ref, params = {}) => { const template = catalogs[state.language]?.[ref] ?? catalogs.en?.[ref] ?? `[${ref}]`; return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key) => String(params[key] ?? `{${key}}`)); };
const semanticPatchForNode = (nodeRef) => TERRAIN_CONTEXT[nodeRef] || {};

let navigation; let chat; let terrain; let guide; let livingJournal;
function visibleVexName(){return t('vex.visible.name');}
function canonicalRoleLabel(key){const role=roles[key];return role?.labelRef?t(role.labelRef):role?.label??String(key??'');}
function vexRoleQualifier(key){const label=canonicalRoleLabel(key);const name=visibleVexName();const qualifier=label.split(name).join(' ').replace(/[\s·•—–:：-]+/g,' ').trim();return qualifier||label;}
function visibleRoleLabel(key){if(key==='victor'||!roles[key]?.actorRef)return canonicalRoleLabel(key);return `${visibleVexName()} · ${vexRoleQualifier(key)}`;}
function messageByRef(messageRef){for(const list of messages.values()){const message=list.find((candidate)=>candidate.messageRef===messageRef);if(message)return message;}return null;}
function projectVisibleVexIdentity(){
  for(const button of $$('#channelTabs [data-channel-ref]')){
    const channel=channels.find((candidate)=>candidate.channelRef===button.dataset.channelRef);
    if(!channel||channel.kind!=='DIRECT'||channel.roleKey==='victor')continue;
    const sourceRoleRef=roles[channel.roleKey]?.actorRef;
    if(!sourceRoleRef)continue;
    button.dataset.sourceRoleRef=sourceRoleRef;
    button.textContent=visibleRoleLabel(channel.roleKey);
    button.title=sourceRoleRef;
  }
  const channel=chat?.currentChannel?.();
  if(!channel)return;
  [...($('#presence')?.children||[])].forEach((span,index)=>{
    const key=channel.memberKeys[index];
    const sourceRoleRef=roles[key]?.actorRef;
    if(sourceRoleRef){span.dataset.sourceRoleRef=sourceRoleRef;span.title=sourceRoleRef;}
    span.textContent=visibleRoleLabel(key);
  });
  for(const article of $$('#messageFeed .message')){
    const message=messageByRef(article.dataset.messageRef);
    const header=article.querySelector('.message-header strong');
    if(!message||!header)continue;
    const speaker=visibleRoleLabel(message.speakerKey);
    const recipients=message.recipientKeys.map(visibleRoleLabel).join(', ');
    header.textContent=`${speaker} → ${recipients}`;
  }
  const recipients=channel.memberKeys.filter((key)=>key!=='victor').map(visibleRoleLabel);
  const composerAddress=$('#composerAddress');
  if(composerAddress)composerAddress.textContent=`${visibleRoleLabel('victor')} → ${recipients.join(', ')}`;
  const contextRows=$$('#contextSummary .context-row');
  const channelValue=contextRows[2]?.querySelector('strong');
  if(channelValue)channelValue.textContent=channel.kind==='DIRECT'&&channel.roleKey!=='victor'?`${visibleRoleLabel('victor')} → ${visibleRoleLabel(channel.roleKey)}`:t(channel.labelRef);
  const visibleToValue=contextRows[3]?.querySelector('strong');
  if(visibleToValue)visibleToValue.textContent=channel.memberKeys.map(visibleRoleLabel).join(' · ');
}
function renderHealth(){const frame=navigation.semanticFrame(),evidenceClass=state.dataTruthClass==='CURRENT_SYNTHETIC_REFERENCE'?'STATIC_REFERENCE_SYNTHETIC':'LOCAL_MEMORY_PROJECTION';$('#technicalHealth').textContent=JSON.stringify({healthState:'ATTENTION',evidenceClass,dataTruthClass:state.dataTruthClass,presentationContractRef:rootContract.contractRef,presentationFoundation:'EXACT_E2_7_ROOT_BODY',primaryStageScreenRef:'screen.vexlife.terrain',contextProjection:state.contextProjection,platformRef:'platform.browser',repositoryReceipt:{state:'NOT_RUN',executed:false,currentness:'UNKNOWN'},modelReceipt:{state:'UNAVAILABLE',executed:false,currentness:'UNKNOWN'},currentScreenFrame:frame,fullJourneyCount:navigation.fullJourney().length,rawPointerLogging:false,designTokenRef:designTokens.tokenSetRef},null,2);}
function setWorkspaceOpen(open){state.workspaceOpen=Boolean(open);$('#projectRail').open=state.workspaceOpen;$('#projectRail').setAttribute('aria-hidden',String(!state.workspaceOpen));if(state.workspaceOpen)guide?.avoidDeclaredControls();}
function openContext(context,nodeRef=`element.nav.${context}`){navigation.openContext(context,nodeRef);projectFrame();}
function returnToTerrain(){if(state.contextProjection==='living-journal')livingJournal?.close();navigation.returnToPrimaryStage('element.terrain.center-current-context');setWorkspaceOpen(false);projectFrame();}
function projectFrame(){const host=$('#contextSurface'),app=$('#app'),projection=state.contextProjection??'terrain';host.dataset.contextProjection=projection;app.dataset.contextProjection=projection;host.hidden=!state.contextProjection;host.setAttribute('aria-hidden',String(!state.contextProjection));$('#view-chat').hidden=state.contextProjection!=='chat';$('#view-health').hidden=state.contextProjection!=='health';$('#view-living-journal').hidden=state.contextProjection!=='living-journal';chat.renderProjectRail();chat.renderChannels();chat.renderPresence();chat.renderMessages();chat.updateComposer();chat.renderContext();livingJournal?.render();terrain?.render(false);applyContextWorkspaceLayout();renderHealth();guide?.updateFrame();projectVisibleVexIdentity();if(state.contextProjection)guide?.avoidDeclaredControls();}

navigation=createNavigationController({
  state,
  elementByRef,
  getProject:()=>chat?.currentProject(),
  getThread:()=>chat?.currentThread(),
  getChannel:()=>chat?.currentChannel(),
  resolveSemanticNodeRef:semanticNodeRefForInteraction,
  resolveInteractionRef:interactionRefForSource,
  onFrameChange:(frame)=>{
    if(terrainNodeRefs.has(frame.selectedNodeRef)&&state.terrain?.selected!==frame.selectedNodeRef)state.terrain.selected=frame.selectedNodeRef;
    queueMicrotask(()=>chat&&terrain&&projectFrame());
  }
});
navigation.seedCurrentJourney(initialTerrainRef);
chat=createChatController({state,projects,roles,channels,messages,createMessage,conversationKey,t,navigation});
terrain=createTerrainController({state,blueprint,t,navigation,semanticPatchForNode,onCurrentNode:()=>{if(chat)queueMicrotask(()=>projectFrame());}});
guide=createGuideController({state,t,navigation,elementByRef,chat});
const featureWalkthrough=createFeatureWalkthroughGuideAdapter({featureRegistry,experience,guide,navigation});
livingJournal=createLivingJournalController({state,data:livingJournalData,t,navigation,onSourceOpen:({sourceRef})=>navigation.navigate('element.living-journal.source.open',{},'action.living-journal.source.open',{subjectRef:state.selectedNodeRef}),onRevisit:()=>{livingJournal.close();navigation.returnToPrimaryStage('element.living-journal.revisit.open','action.living-journal.revisit.open');setWorkspaceOpen(false);projectFrame();}});

async function loadLivingJournalMemory(){
  state.livingJournalMemoryState='LOADING';state.livingJournalMemoryFailureCode=null;
  try{
    const response=await fetch(LIVING_JOURNAL_MEMORY_API_PATH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({threadRef:state.threadRef,maxPages:LIVING_JOURNAL_MEMORY_MAX_PAGES})});
    let payload=null;try{payload=await response.json();}catch{}
    if(!response.ok){const error=new Error('Living Journal Memory read failed safely');error.code=payload?.failureCode??'LIVING_JOURNAL_MEMORY_READ_FAILED';throw error;}
    livingJournal.setData(payload);
    const snapshot=livingJournal.snapshot();
    if(!LIVING_JOURNAL_REAL_MEMORY_TRUTHS.has(snapshot.truthClass))throw new Error('Living Journal Memory route returned a non-Memory truth class');
    state.livingJournalCurrentPacket=structuredClone(payload);
    state.dataTruthClass=snapshot.truthClass;
    state.livingJournalMemoryState=snapshot.truthClass==='CURRENT_MEMORY_REFERENCE'?'CURRENT':'HELD';state.livingJournalArchivePacket=null;state.livingJournalArchiveState='UNREQUESTED';state.livingJournalArchiveFailureCode=null;renderLivingJournalArchiveControls();
    return Object.freeze({state:state.livingJournalMemoryState,truthClass:snapshot.truthClass,failureCode:null});
  }catch(error){
    livingJournal.restoreInitialData();
    const snapshot=livingJournal.snapshot();
    state.dataTruthClass=snapshot.truthClass;
    state.livingJournalMemoryState='UNAVAILABLE_SYNTHETIC_REFERENCE';
    state.livingJournalMemoryFailureCode=typeof error?.code==='string'&&error.code.length>0?error.code:'LIVING_JOURNAL_MEMORY_READ_FAILED';
    return Object.freeze({state:state.livingJournalMemoryState,truthClass:snapshot.truthClass,failureCode:state.livingJournalMemoryFailureCode});
  }
}

function restoreLivingJournalPresentDefault(){const active=livingJournal.snapshot();if(active.dataMode!=='ARCHIVE')return active;let snapshot=null;if(state.livingJournalCurrentPacket!==null){try{livingJournal.setData(structuredClone(state.livingJournalCurrentPacket));snapshot=livingJournal.snapshot();if(!LIVING_JOURNAL_REAL_MEMORY_TRUTHS.has(snapshot.truthClass))throw new Error('Cached Living Journal current packet is no longer admitted');state.livingJournalMemoryState=snapshot.truthClass==='CURRENT_MEMORY_REFERENCE'?'CURRENT':'HELD';state.livingJournalMemoryFailureCode=null;}catch{state.livingJournalCurrentPacket=null;snapshot=livingJournal.restoreInitialData();state.livingJournalMemoryState='UNREQUESTED';state.livingJournalMemoryFailureCode=null;}}else{snapshot=livingJournal.restoreInitialData();state.livingJournalMemoryState='UNREQUESTED';state.livingJournalMemoryFailureCode=null;}state.dataTruthClass=snapshot.truthClass;state.livingJournalArchivePacket=null;state.livingJournalArchiveState='UNREQUESTED';state.livingJournalArchiveFailureCode=null;renderLivingJournalArchiveControls();return snapshot;}

function renderLivingJournalArchiveControls(){const packet=state.livingJournalArchivePacket,archive=packet?.truthClass==='COMMITTED_MEMORY_ARCHIVE';const open=$('#livingJournalArchiveOpen'),newer=$('#livingJournalArchiveNewer'),older=$('#livingJournalArchiveOlder'),day=$('#livingJournalArchiveDay'),dayLabel=$('#livingJournalArchiveDayLabel'),returnNow=$('#livingJournalReturnNow'),status=$('#livingJournalTemporalStatus');if(open)open.hidden=archive;if(newer){newer.hidden=!archive;newer.disabled=!archive||Number(packet.dayOffset||0)===0;}if(older){older.hidden=!archive;older.disabled=!archive||packet.nextDayOffset===null;}if(dayLabel)dayLabel.hidden=!archive;if(returnNow)returnNow.hidden=!archive;if(day&&archive){const selected=packet.selectedDay?.dailyStratumSha256??'';day.replaceChildren(...packet.days.map((item)=>{const option=document.createElement('option');option.value=item.dailyStratumSha256;option.textContent=item.calendarDateRef;option.selected=item.dailyStratumSha256===selected;return option;}));day.disabled=packet.days.length===0;}if(status){if(!archive)status.textContent=t('living-journal.archive.current-status');else if(packet.selectedDay)status.textContent=t('living-journal.archive.historical-status',{date:packet.selectedDay.calendarDateRef});else status.textContent=t('living-journal.archive.no-days');}}
async function loadLivingJournalArchive({dayOffset=0,selectedDailyStratumSha256=null}={}){state.livingJournalArchiveState='LOADING';state.livingJournalArchiveFailureCode=null;const request=async(selection)=>{const body={threadRef:state.threadRef,maxDays:LIVING_JOURNAL_ARCHIVE_MAX_DAYS,dayOffset,maxPages:LIVING_JOURNAL_MEMORY_MAX_PAGES};if(selection)body.selectedDailyStratumSha256=selection;const response=await fetch(LIVING_JOURNAL_ARCHIVE_API_PATH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let payload=null;try{payload=await response.json();}catch{}if(!response.ok){const error=new Error('Living Journal archive read failed safely');error.code=payload?.failureCode??'LIVING_JOURNAL_ARCHIVE_READ_FAILED';throw error;}return payload;};try{let payload=await request(selectedDailyStratumSha256);if(!selectedDailyStratumSha256&&payload?.days?.length)payload=await request(payload.days[0].dailyStratumSha256);livingJournal.setData(payload);state.livingJournalArchivePacket=payload;state.livingJournalArchiveState=payload.selectedDay?'HISTORICAL_DAY':'INDEX';state.livingJournalArchiveFailureCode=null;state.dataTruthClass=payload.selectedDay?'COMMITTED_MEMORY_AT_DAY':'COMMITTED_MEMORY_ARCHIVE';renderLivingJournalArchiveControls();projectFrame();return Object.freeze({state:state.livingJournalArchiveState,truthClass:state.dataTruthClass,failureCode:null});}catch(error){state.livingJournalArchiveState='UNAVAILABLE';state.livingJournalArchiveFailureCode=typeof error?.code==='string'&&error.code.length?error.code:'LIVING_JOURNAL_ARCHIVE_READ_FAILED';renderLivingJournalArchiveControls();return Object.freeze({state:state.livingJournalArchiveState,truthClass:livingJournal.snapshot().truthClass,failureCode:state.livingJournalArchiveFailureCode});}}
async function returnLivingJournalToNow(){await loadLivingJournalMemory();projectFrame();return livingJournal.snapshot();}

function applyLocalization(){document.documentElement.lang=state.language;$$('[data-i18n]').forEach((element)=>{element.textContent=t(element.dataset.i18n);});$$('[data-i18n-placeholder]').forEach((element)=>{element.placeholder=t(element.dataset.i18nPlaceholder);});$$('[data-i18n-aria-label]').forEach((element)=>{element.setAttribute('aria-label',t(element.dataset.i18nAriaLabel));});$('#languageSelect').value=state.language;projectFrame();guide.renderMessages();}
function toggleSurfaceMenu(open){const next=Boolean(open);$('#surfaceMenu').hidden=!next;$('#surfaceMenuButton').setAttribute('aria-expanded',String(next));}
function closeTerrainContext(){ $('#terrainContext').hidden=true; }

$('#terrainFullJourneyToggle').addEventListener('click',()=>terrain.openJourney());$('#terrainJourneyClose').addEventListener('click',()=>terrain.closeJourney());$('#terrainUp').addEventListener('click',()=>terrain.up());$('#terrainReset').addEventListener('click',()=>terrain.reset());$('#terrainCenter').addEventListener('click',()=>{terrain.centerOn();toggleSurfaceMenu(false);});
$('#surfaceMenuButton').addEventListener('click',(event)=>{event.stopPropagation();const open=$('#surfaceMenu').hidden;$('#surfaceMenu').hidden=!open;$('#surfaceMenuButton').setAttribute('aria-expanded',String(open));});
$('#openConversation').addEventListener('click',()=>{openContext('chat');toggleSurfaceMenu(false);});$('#openHealth').addEventListener('click',()=>{openContext('health');toggleSurfaceMenu(false);});const openLivingJournal=async({loadMemory=true}={})=>{restoreLivingJournalPresentDefault();livingJournal.open({selectedNodeRef:state.selectedNodeRef});navigation.openContext('living-journal','element.living-journal.open','action.living-journal.open');projectFrame();if(loadMemory){await loadLivingJournalMemory();projectFrame();}return livingJournal.snapshot();};$('#openLivingJournal').addEventListener('click',()=>{void openLivingJournal();toggleSurfaceMenu(false);});$('#openWorkspace').addEventListener('click',()=>{openContext('chat');setWorkspaceOpen(true);toggleSurfaceMenu(false);});$('#workspaceClose').addEventListener('click',(event)=>{event.preventDefault();setWorkspaceOpen(false);});$('#contextSurfaceClose').addEventListener('click',returnToTerrain);
$('#livingJournalArchiveOpen').addEventListener('click',()=>{void loadLivingJournalArchive({dayOffset:0});});$('#livingJournalArchiveOlder').addEventListener('click',()=>{const packet=state.livingJournalArchivePacket;if(packet?.nextDayOffset!==null&&packet?.nextDayOffset!==undefined)void loadLivingJournalArchive({dayOffset:packet.nextDayOffset});});$('#livingJournalArchiveNewer').addEventListener('click',()=>{const packet=state.livingJournalArchivePacket;if(packet)void loadLivingJournalArchive({dayOffset:Math.max(0,Number(packet.dayOffset||0)-LIVING_JOURNAL_ARCHIVE_MAX_DAYS)});});$('#livingJournalArchiveDay').addEventListener('change',(event)=>{const packet=state.livingJournalArchivePacket;if(packet)void loadLivingJournalArchive({dayOffset:Number(packet.dayOffset||0),selectedDailyStratumSha256:event.currentTarget.value});});$('#livingJournalReturnNow').addEventListener('click',()=>{void returnLivingJournalToNow();});
$('#contextWorkspaceDock').addEventListener('change',(event)=>setContextWorkspaceDock(event.currentTarget.value));$('#contextWorkspaceSplit').addEventListener('change',(event)=>setContextWorkspaceSplitFocus(event.currentTarget.checked));$('#contextWorkspaceReset').addEventListener('click',resetContextWorkspaceLayout);$$('[data-context-workspace-resize-corner][data-node-ref^="element.context-workspace.resize."]').forEach((handle)=>{handle.addEventListener('pointerdown',beginContextWorkspaceResize);handle.addEventListener('keydown',keyboardContextWorkspaceResize)});globalThis.addEventListener('resize',applyContextWorkspaceLayout);
$('#languageSelect').addEventListener('change',(event)=>{state.language=event.target.value;localStorage.setItem('vexlife.language',state.language);navigation.navigate('element.language.selector',{},'action.language.select');applyLocalization();});$('#architectureButton').addEventListener('click',()=>{guide.setOpen(true);guide.askIntent(GUIDE_INTENTS.ARCHITECTURE);});
document.addEventListener('vexlife:open-context',(event)=>openContext(event.detail?.context==='health'?'health':'chat'));
$$('[data-terrain-context]').forEach((button)=>button.addEventListener('click',()=>{const action=button.dataset.terrainContext;if(action==='center')terrain.centerOn();else if(action==='projection')terrain.cycleProjection();else if(action==='workspace')terrain.toggleWorkspace();else if(action==='chat')openContext('chat');else if(action==='health')openContext('health');closeTerrainContext();}));
document.addEventListener('pointerdown',(event)=>{if(!event.target.closest('#surfaceMenu,#surfaceMenuButton'))toggleSurfaceMenu(false);if(!event.target.closest('#terrainContext'))closeTerrainContext();});
globalThis.addEventListener('keydown',(event)=>{if(event.key!=='Escape')return;if(!$('#terrainContext').hidden)closeTerrainContext();else if(!$('#surfaceMenu').hidden)toggleSurfaceMenu(false);else if(state.contextProjection)returnToTerrain();else if($('#terrainJourneyDrawer').getAttribute('aria-hidden')!=='true')terrain.closeJourney();else terrain.up();});globalThis.addEventListener('popstate',()=>navigation.back());

chat.renderProjectRail();chat.renderChannels();chat.renderPresence();chat.renderMessages();chat.updateComposer();chat.renderContext();navigation.enableBrowserHistory();renderLivingJournalArchiveControls();applyLocalization();guide.setOpen(state.guideOpen);guide.addMessage('guide',{contentRef:'guide.intro'});projectFrame();

globalThis.__VEXLIFE_APP__={state,projects,roles,channels,messages,chat,terrain,guide,featureWalkthrough,livingJournal,navigation,rootContract,t,openContext,openLivingJournal,loadLivingJournalMemory,loadLivingJournalArchive,returnLivingJournalToNow,returnToTerrain,setWorkspaceOpen,projectFrame,projectVisibleVexIdentity,visibleVexName,visibleRoleLabel,contextWorkspaceSnapshot,setContextWorkspaceDock,setContextWorkspaceSplitFocus,setContextWorkspaceSize,resetContextWorkspaceLayout,applyContextWorkspaceLayout};
if(new URLSearchParams(globalThis.location.search).get('integration')==='1'){const{runBrowserIntegration}=await import('./integration-test.js');globalThis.__VEXLIFE_INTEGRATION_PROMISE__=runBrowserIntegration();}

// [VXG RealForever]
