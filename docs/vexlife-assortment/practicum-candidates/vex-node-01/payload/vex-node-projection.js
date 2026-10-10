// [VXG RealForever]
// Disposable Assortment practicum projection. It composes existing read-side
// owners; it is not a Vex state database, Memory owner, capability owner, or
// effect authority.
// ONE_VEX_IDENTITY: legacy app.guide / #guideWindow names are implementation seams for the single visible Vex; they do not form separate Guide or Host companion identities.

export const VEX_NODE_PREVIEW_REF='preview.vexlife-assortment.r2.vex-node.01';
export const VEX_NODE_TERRAIN_REF='terrain.assortment.vex';
export const VEX_NODE_SURFACE_REF='surface.vexlife.assortment-vex';
export const VEX_NODE_PROJECTION_REF='projection.vexlife-assortment.r2.vex-companion-legibility';

const STYLESHEET_REF='vexlife-assortment-vex-node-01';
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node};
const status=(label,state)=>{const row=el('span','vex-node-status');row.dataset.state=state;row.append(el('span','vex-node-status__dot'),el('strong','',label));return row};
const sourceDetails=(title,refs=[])=>{const d=el('details','vex-node-source');d.append(el('summary','',title));const list=el('ul');for(const ref of refs)list.append(el('li','',ref));d.append(list);return d};

function ensureStylesheet(){
  const href=new URL('./assortment-vex-node.css',import.meta.url).href;
  const existing=document.querySelector(`link[data-vex-node-preview-stylesheet="${STYLESHEET_REF}"]`);
  if(existing){if(existing.href!==href)throw new Error('Vex node stylesheet binding drift');return existing;}
  const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset.vexNodePreviewStylesheet=STYLESHEET_REF;document.head.append(link);return link;
}

function frameLabel(frame,t){
  const ref=frame?.selectedNodeRef??'screen.vexlife.terrain';
  const map={
    'terrain.project.root-hub':'vex-node.context.home',
    'terrain.assortment.vex':'vex-node.context.vex',
    'terrain.assortment.continue':'vex-node.context.continue',
    'terrain.assortment.projects':'vex-node.context.projects',
    'terrain.assortment.frontier':'vex-node.context.frontier'
  };
  return map[ref]?t(map[ref]):ref;
}

function capabilityProjection(capabilityRegistry){
  const all=Array.isArray(capabilityRegistry?.capabilities)?capabilityRegistry.capabilities:[];
  const companion=all.filter((item)=>Array.isArray(item.roleRefs)&&item.roleRefs.includes('role.vex.companion'));
  const byStage=Object.fromEntries(['EXECUTABLE','REQUESTABLE','EXPLAINABLE','DISCOVERABLE'].map((stage)=>[stage,companion.filter((item)=>item.defaultStage===stage)]));
  return Object.freeze({allCount:all.length,companionCount:companion.length,byStage,companion});
}

export function createVexNodePreview({app,t,capabilityRegistry}){
  if(!app?.navigation?.semanticFrame||!app?.chat?.currentChannel||!app?.uxProjectionShell?.openEvolutionSurface)throw new Error('Vex node preview requires current VexLife app seams');
  if(capabilityRegistry?.registryRef!=='registry.vexlife.capabilities.001')throw new Error('Vex node preview requires current Capability Registry');
  let mountedBody=null;
  let currentTurn=null;
  let companionObserver=null;
  let composerBound=false;
  const capabilities=capabilityProjection(capabilityRegistry);
  const appRoot=()=>document.querySelector('#app');
  const guideWindow=()=>document.querySelector('#guideWindow');
  const shellBack=()=>document.querySelector('#evolutionActiveSurfaceBack');
  const activeSurface=()=>app.uxProjectionShell.snapshot().activeSurfaceRef;
  const syncBack=()=>{const button=shellBack();if(!button)return;const owned=activeSurface()===VEX_NODE_SURFACE_REF;button.hidden=!owned;button.disabled=!owned;};

  function updateCompanionStratum(){
    const root=appRoot(),guide=guideWindow();if(!root||!guide)return;
    root.dataset.vexCompanionStratum='true';
    root.dataset.vexCompanionRail=guide.hidden?'closed':guide.classList.contains('is-minimized')?'compact':'expanded';
  }

  function ensureContextAttachment(){
    const guide=document.querySelector('#guideBody');if(!guide)return null;
    let host=document.querySelector('#vexContextAttachment');
    if(!host){host=el('div','vex-context-attachment');host.id='vexContextAttachment';host.append(el('small','',t('vex-node.following.label')),el('strong',''));guide.prepend(host);}
    host.querySelector('small').textContent=t('vex-node.following.label');
    host.querySelector('strong').textContent=frameLabel(app.navigation.semanticFrame(),t);
    host.dataset.mode='FOLLOW_CURRENT_CONTEXT';
    return host;
  }

  function humanizePresence(){
    const node=document.querySelector('#vexPresenceState');if(!node)return;
    const state=node.dataset.presenceState||app.guide?.currentPresenceState?.()||'AMBIENT';
    const key={AMBIENT:'vex-node.presence.here',ATTENTIVE:'vex-node.presence.listening',SUMMONED:'vex-node.presence.here',ACTIVE_CONVERSATION:'vex-node.presence.talking'}[state]||'vex-node.presence.here';
    node.textContent=t(key);
  }

  function bindCanonicalConversationComposer(){
    if(composerBound)return;
    const form=document.querySelector('#guideComposer'),input=document.querySelector('#guideInput');
    if(!form||!input)return;
    form.addEventListener('submit',(event)=>{
      const content=input.value.trim();
      const channel=app.chat.currentChannel();
      if(!content||channel?.roleKey!=='companion')return;
      const canonicalInput=document.querySelector('#messageInput'),canonicalForm=document.querySelector('#composer');
      if(!canonicalInput||!canonicalForm)return;
      event.preventDefault();event.stopImmediatePropagation();
      app.guide?.addMessage?.('user',content);
      canonicalInput.value=content;
      canonicalInput.dispatchEvent(new Event('input',{bubbles:true}));
      input.value='';
      canonicalForm.requestSubmit();
      refresh();
    },true);
    composerBound=true;
  }

  function ownerCard({title,state,label,description,sourceRefs=[]}){
    const card=el('article','vex-node-card');card.dataset.state=state;
    const head=el('div','vex-node-card__head');head.append(el('h3','',title),status(label,state));card.append(head,el('p','',description));
    if(sourceRefs.length)card.append(sourceDetails(t('vex-node.sources'),sourceRefs));
    return card;
  }

  function renderVex(body){
    if(!body)return;
    body.replaceChildren();
    const frame=app.navigation.semanticFrame();
    const availability=app.chat.companionAvailability?.()??null;
    const turn=currentTurn??app.guide?.currentCompanionTurn?.()??null;
    const root=el('section','vex-node-surface');root.dataset.surfaceRef=VEX_NODE_SURFACE_REF;root.dataset.previewRef=VEX_NODE_PREVIEW_REF;

    const hero=el('header','vex-node-hero');
    const copy=el('div');copy.append(el('small','vex-node-eyebrow',t('vex-node.eyebrow')),el('h2','',t('vex-node.title')),el('p','',t('vex-node.intro')));
    const presence=availability?.availabilityState==='READY'?['vex-node.status.ready','CURRENT']:availability?['vex-node.status.connected','CONNECTED']:['vex-node.status.unknown','HELD'];
    hero.append(copy,status(t(presence[0]),presence[1]));root.append(hero);

    const now=el('section','vex-node-now');
    now.append(el('small','vex-node-section-label',t('vex-node.now')));
    const nowGrid=el('div','vex-node-now-grid');
    const context=el('article','vex-node-primary-card');context.append(el('span','',t('vex-node.looking-with-you')),el('strong','',frameLabel(frame,t)),el('code','',frame?.selectedNodeRef??frame?.screenRef??'UNKNOWN'));
    const conversation=el('article','vex-node-primary-card');conversation.append(el('span','',t('vex-node.conversation')));
    if(turn){conversation.append(el('strong','',turn.modelNameOrBoundedTestProfileRef),el('p','',turn.content.slice(0,240)),el('code','',turn.turnRef));}
    else conversation.append(el('strong','',t('vex-node.no-turn')),el('p','',t('vex-node.no-turn.detail')));
    nowGrid.append(context,conversation);now.append(nowGrid);root.append(now);

    const grid=el('section','vex-node-grid');
    const availableLabel=availability?.availabilityState??'UNKNOWN';
    grid.append(ownerCard({
      title:t('vex-node.runtime.title'),state:availability?'CURRENT':'HELD',label:availability?availableLabel:t('vex-node.held'),
      description:availability?t('vex-node.runtime.current'):t('vex-node.runtime.unavailable'),
      sourceRefs:availability?.sourceRefs??['vexlife.companion-availability/v1']
    }));
    const executable=capabilities.byStage.EXECUTABLE.length,requestable=capabilities.byStage.REQUESTABLE.length,explainable=capabilities.byStage.EXPLAINABLE.length;
    grid.append(ownerCard({
      title:t('vex-node.capabilities.title'),state:'CURRENT',label:`${capabilities.companionCount} ${t('vex-node.capabilities.for-vex')}`,
      description:`${executable} ${t('vex-node.capabilities.executable')} · ${requestable} ${t('vex-node.capabilities.requestable')} · ${explainable} ${t('vex-node.capabilities.explainable')}`,
      sourceRefs:['registry.vexlife.capabilities.001','foundation.vexlife.experience.001']
    }));
    grid.append(ownerCard({
      title:t('vex-node.perception.title'),state:'CURRENT',label:t('vex-node.current'),
      description:t('vex-node.perception.current-frame'),
      sourceRefs:['module.vexlife.core.navigation','feature.vexlife.screen-aware-guide','Perception Broker — broader sensors held']
    }));
    grid.append(ownerCard({
      title:t('vex-node.memory.title'),state:'HELD',label:t('vex-node.held'),
      description:t('vex-node.memory.held'),
      sourceRefs:['project.multivex.memory','vextreme.durable-semantic-memory/v1']
    }));
    grid.append(ownerCard({
      title:t('vex-node.relationship.title'),state:'FUTURE',label:t('vex-node.future'),
      description:t('vex-node.relationship.future'),
      sourceRefs:['foundation.vextreme.mutual-preference-coexperience.negotiated-shared-life.v0']
    }));
    grid.append(ownerCard({
      title:t('vex-node.vessel.title'),state:'FUTURE',label:t('vex-node.future'),
      description:t('vex-node.vessel.future'),
      sourceRefs:['github.issue.vextreme-sdk.240','VESSEL != LINEAGE_IDENTITY']
    }));
    root.append(grid);

    const footer=el('footer','vex-node-footer');footer.append(el('strong','',t('vex-node.truth.title')),el('p','',t('vex-node.truth.body')));root.append(footer);
    body.append(root);
  }

  function refresh(){
    updateCompanionStratum();ensureContextAttachment();humanizePresence();bindCanonicalConversationComposer();
    if(mountedBody&&activeSurface()===VEX_NODE_SURFACE_REF)renderVex(mountedBody);
    return snapshot();
  }

  function setCompanionTurn(projection){currentTurn=structuredClone(projection);refresh();return snapshot();}
  function ownsActiveSurface(){return activeSurface()===VEX_NODE_SURFACE_REF;}
  function expandVexForVexNode(){
    const guide=guideWindow();
    app.state.guideMinimized=false;
    globalThis.localStorage?.setItem?.('vexlife.guide.minimized','false');
    guide?.classList?.remove?.('is-minimized');
    app.guide?.setOpen?.(true,{focus:false,explicit:true});
    updateCompanionStratum();
    return guide;
  }
  async function handleTerrainNode(terrainRef){
    if(terrainRef!==VEX_NODE_TERRAIN_REF)return false;
    expandVexForVexNode();
    await app.chat.refreshCompanionAvailability?.();
    const result=await app.uxProjectionShell.openEvolutionSurface(VEX_NODE_SURFACE_REF);
    syncBack();refresh();return result;
  }
  async function back(){
    if(!ownsActiveSurface())return Object.freeze({state:'NOT_VEX_NODE'});
    const result=app.navigation.back();
    if(result?.frame?.selectedNodeRef){app.state.terrain.selected=result.frame.selectedNodeRef;app.terrain.render(false);}
    await app.uxProjectionShell.closeEvolutionActiveSurface('VEX_NODE_BACK');
    syncBack();refresh();return Object.freeze({state:'SEMANTIC_BACK',journeyMutated:Boolean(result?.changed),journeyActionRef:result?.journeyEvent?.actionRef??null});
  }
  function onShellClose(){queueMicrotask(()=>{syncBack();refresh();});}
  async function relocalize(){refresh();if(ownsActiveSurface()){renderVex(mountedBody);}return snapshot();}
  function snapshot(){const frame=app.navigation.semanticFrame();return Object.freeze({previewRef:VEX_NODE_PREVIEW_REF,activeSurfaceRef:activeSurface(),contextRef:frame?.selectedNodeRef??null,guideVisible:Boolean(guideWindow()&&!guideWindow().hidden),companionTurnRef:(currentTurn??app.guide?.currentCompanionTurn?.())?.turnRef??null,availabilityState:app.chat.companionAvailabilityState?.()??'UNKNOWN',capabilityCount:capabilities.companionCount});}
  async function register(){
    ensureStylesheet();
    appRoot().dataset.vexCompanionStratum='true';
    companionObserver=new MutationObserver(()=>refresh());
    const guide=guideWindow();if(guide)companionObserver.observe(guide,{attributes:true,attributeFilter:['hidden','class','style']});
    app.uxProjectionShell.registerEvolutionSurfaceAdapter(VEX_NODE_SURFACE_REF,Object.freeze({
      async mount({body}){mountedBody=body;renderVex(body);queueMicrotask(()=>{syncBack();refresh();});return Object.freeze({state:'MOUNTED',surfaceRef:VEX_NODE_SURFACE_REF,effects:false});},
      requestClose(){mountedBody=null;queueMicrotask(syncBack);return Object.freeze({state:'CLOSED',reason:'PRESENTATION_DISMISS',semanticNavigationMutated:false});}
    }));
    syncBack();refresh();return snapshot();
  }
  const api=Object.freeze({register,refresh,setCompanionTurn,handleTerrainNode,back,onShellClose,relocalize,ownsActiveSurface,snapshot});
  return api;
}

// [VXG RealForever]
