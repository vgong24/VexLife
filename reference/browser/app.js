import { loadBrowserBundle } from './modules/browser-bundle.js';
import { createDemoData } from './modules/demo-data.js';
import { $, $$, compileInterfaceEntries, loadJson } from './modules/dom.js';
import { createNavigationController } from './modules/navigation-controller.js';
import { createChatController } from './modules/chat-controller.js';
import { createTerrainController } from './modules/terrain-controller.js';
import { createGuideController, GUIDE_INTENTS } from './modules/guide-controller.js';

const { blueprint, experience, designTokens, catalogs } = await loadBrowserBundle('../../');
const rootContract = experience.authoritativeRootDesignContract;
if (rootContract?.contractRef !== 'contract.vexlife.e27.authoritative-root/v1' || rootContract?.defaultShellGrammar?.singleStageDefault !== true || rootContract?.defaultShellGrammar?.legacyCurrentBrowserPreservationDefault !== false) throw new Error('Direct-root browser requires accepted E2.7 authoritative-root contract');

const { projects, roles, channels, messages, state, createMessage, conversationKey } = createDemoData({ loadJson });
state.view = 'terrain';
state.contextProjection = null;
state.workspaceOpen = false;
state.dataTruthClass = 'CURRENT_SYNTHETIC_REFERENCE';
if (localStorage.getItem('vexlife.guide.open') === null) state.guideOpen = true;
const storedGuideMinimized = localStorage.getItem('vexlife.guide.minimized');
state.guideMinimized = storedGuideMinimized === null ? true : storedGuideMinimized === 'true';

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

let navigation; let chat; let terrain; let guide;
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
function renderHealth(){const frame=navigation.semanticFrame();$('#technicalHealth').textContent=JSON.stringify({healthState:'ATTENTION',evidenceClass:'STATIC_REFERENCE_SYNTHETIC',dataTruthClass:state.dataTruthClass,presentationContractRef:rootContract.contractRef,presentationFoundation:'EXACT_E2_7_ROOT_BODY',primaryStageScreenRef:'screen.vexlife.terrain',contextProjection:state.contextProjection,platformRef:'platform.browser',repositoryReceipt:{state:'NOT_RUN',executed:false,currentness:'UNKNOWN'},modelReceipt:{state:'UNAVAILABLE',executed:false,currentness:'UNKNOWN'},currentScreenFrame:frame,fullJourneyCount:navigation.fullJourney().length,rawPointerLogging:false,designTokenRef:designTokens.tokenSetRef},null,2);}
function setWorkspaceOpen(open){state.workspaceOpen=Boolean(open);$('#projectRail').open=state.workspaceOpen;$('#projectRail').setAttribute('aria-hidden',String(!state.workspaceOpen));if(state.workspaceOpen)guide?.avoidDeclaredControls();}
function openContext(context,nodeRef=`element.nav.${context}`){navigation.openContext(context,nodeRef);projectFrame();}
function returnToTerrain(){navigation.returnToPrimaryStage('element.terrain.center-current-context');setWorkspaceOpen(false);projectFrame();}
function projectFrame(){const host=$('#contextSurface');host.hidden=!state.contextProjection;host.setAttribute('aria-hidden',String(!state.contextProjection));$('#view-chat').hidden=state.contextProjection!=='chat';$('#view-health').hidden=state.contextProjection!=='health';chat.renderProjectRail();chat.renderChannels();chat.renderPresence();chat.renderMessages();chat.updateComposer();chat.renderContext();terrain?.render(false);renderHealth();guide?.updateFrame();projectVisibleVexIdentity();if(state.contextProjection)guide?.avoidDeclaredControls();}

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

function applyLocalization(){document.documentElement.lang=state.language;$$('[data-i18n]').forEach((element)=>{element.textContent=t(element.dataset.i18n);});$$('[data-i18n-placeholder]').forEach((element)=>{element.placeholder=t(element.dataset.i18nPlaceholder);});$$('[data-i18n-aria-label]').forEach((element)=>{element.setAttribute('aria-label',t(element.dataset.i18nAriaLabel));});$('#languageSelect').value=state.language;projectFrame();guide.renderMessages();}
function toggleSurfaceMenu(open){const next=Boolean(open);$('#surfaceMenu').hidden=!next;$('#surfaceMenuButton').setAttribute('aria-expanded',String(next));}
function closeTerrainContext(){ $('#terrainContext').hidden=true; }

$('#terrainFullJourneyToggle').addEventListener('click',()=>terrain.openJourney());$('#terrainJourneyClose').addEventListener('click',()=>terrain.closeJourney());$('#terrainUp').addEventListener('click',()=>terrain.up());$('#terrainReset').addEventListener('click',()=>terrain.reset());$('#terrainCenter').addEventListener('click',()=>{terrain.centerOn();toggleSurfaceMenu(false);});
$('#surfaceMenuButton').addEventListener('click',(event)=>{event.stopPropagation();const open=$('#surfaceMenu').hidden;$('#surfaceMenu').hidden=!open;$('#surfaceMenuButton').setAttribute('aria-expanded',String(open));});
$('#openConversation').addEventListener('click',()=>{openContext('chat');toggleSurfaceMenu(false);});$('#openHealth').addEventListener('click',()=>{openContext('health');toggleSurfaceMenu(false);});$('#openWorkspace').addEventListener('click',()=>{openContext('chat');setWorkspaceOpen(true);toggleSurfaceMenu(false);});$('#workspaceClose').addEventListener('click',(event)=>{event.preventDefault();setWorkspaceOpen(false);});$('#contextSurfaceClose').addEventListener('click',returnToTerrain);
$('#languageSelect').addEventListener('change',(event)=>{state.language=event.target.value;localStorage.setItem('vexlife.language',state.language);navigation.navigate('element.language.selector',{},'action.language.select');applyLocalization();});$('#architectureButton').addEventListener('click',()=>{guide.setOpen(true);guide.askIntent(GUIDE_INTENTS.ARCHITECTURE);});
document.addEventListener('vexlife:open-context',(event)=>openContext(event.detail?.context==='health'?'health':'chat'));
$$('[data-terrain-context]').forEach((button)=>button.addEventListener('click',()=>{const action=button.dataset.terrainContext;if(action==='center')terrain.centerOn();else if(action==='projection')terrain.cycleProjection();else if(action==='workspace')terrain.toggleWorkspace();else if(action==='chat')openContext('chat');else if(action==='health')openContext('health');closeTerrainContext();}));
document.addEventListener('pointerdown',(event)=>{if(!event.target.closest('#surfaceMenu,#surfaceMenuButton'))toggleSurfaceMenu(false);if(!event.target.closest('#terrainContext'))closeTerrainContext();});
globalThis.addEventListener('keydown',(event)=>{if(event.key!=='Escape')return;if(!$('#terrainContext').hidden)closeTerrainContext();else if(!$('#surfaceMenu').hidden)toggleSurfaceMenu(false);else if(state.contextProjection)returnToTerrain();else if($('#terrainJourneyDrawer').getAttribute('aria-hidden')!=='true')terrain.closeJourney();else terrain.up();});globalThis.addEventListener('popstate',()=>navigation.back());

chat.renderProjectRail();chat.renderChannels();chat.renderPresence();chat.renderMessages();chat.updateComposer();chat.renderContext();navigation.enableBrowserHistory();applyLocalization();guide.setOpen(state.guideOpen);guide.addMessage('guide',{contentRef:'guide.intro'});projectFrame();

globalThis.__VEXLIFE_APP__={state,projects,roles,channels,messages,chat,terrain,guide,navigation,rootContract,t,openContext,returnToTerrain,setWorkspaceOpen,projectFrame,projectVisibleVexIdentity,visibleVexName,visibleRoleLabel};
if(new URLSearchParams(globalThis.location.search).get('integration')==='1'){const{runBrowserIntegration}=await import('./integration-test.js');globalThis.__VEXLIFE_INTEGRATION_PROMISE__=runBrowserIntegration();}

// [VXG RealForever]
