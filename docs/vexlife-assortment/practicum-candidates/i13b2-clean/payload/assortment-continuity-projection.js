// [VXG RealForever]
// Disposable Assortment practicum projection. Presentation-only except where it
// deliberately calls the accepted Navigation/Terrain owners for semantic moves.

export const ASSORTMENT_CONTINUITY_SURFACE_REF='surface.vexlife.assortment-continuity';
export const ASSORTMENT_PROJECTS_SURFACE_REF='surface.vexlife.assortment-projects';
export const ASSORTMENT_PROJECT_DEPTH_SURFACE_REF='surface.vexlife.assortment-project-depth';
export const ASSORTMENT_FRONTIER_SURFACE_REF='surface.vexlife.assortment-frontier';
export const ASSORTMENT_PREVIEW_REF='preview.vexlife-assortment.r2.i13b2.clean-reform';

export const ASSORTMENT_TERRAIN_REFS=Object.freeze({
  continue:'terrain.assortment.continue',
  projects:'terrain.assortment.projects',
  frontier:'terrain.assortment.frontier'
});

const ROOT=new URL('./',import.meta.url);
const FIXTURE_URL=new URL('./assortment-fixtures.json',ROOT);
const STYLESHEET_REF='vexlife-assortment-i13b2-clean';
const SURFACE_FOR_TERRAIN=Object.freeze({
  [ASSORTMENT_TERRAIN_REFS.continue]:ASSORTMENT_CONTINUITY_SURFACE_REF,
  [ASSORTMENT_TERRAIN_REFS.projects]:ASSORTMENT_PROJECTS_SURFACE_REF,
  [ASSORTMENT_TERRAIN_REFS.frontier]:ASSORTMENT_FRONTIER_SURFACE_REF
});
const ASSORTMENT_SURFACES=new Set([
  ASSORTMENT_CONTINUITY_SURFACE_REF,
  ASSORTMENT_PROJECTS_SURFACE_REF,
  ASSORTMENT_PROJECT_DEPTH_SURFACE_REF,
  ASSORTMENT_FRONTIER_SURFACE_REF
]);

const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=String(text);return n};
const btn=(className,text,action)=>{const n=el('button',className,text);n.type='button';n.addEventListener('click',action);return n};
const sourceDetails=(record,t)=>{
  const d=el('details','assortment-source');
  const s=el('summary','',t('assortment.source-lineage'));
  d.append(s);
  const list=el('ul','assortment-source__list');
  for(const ref of record.sourceRefs??[])list.append(el('li','',ref));
  d.append(list);
  return d;
};

async function loadFixture(){
  const response=await fetch(FIXTURE_URL);
  if(!response.ok)throw new Error(\`Assortment fixture read failed: HTTP \${response.status}\`);
  const fixture=await response.json();
  if(fixture.previewRef!==ASSORTMENT_PREVIEW_REF||fixture.truthClass!=='SOURCE_BACKED_FROZEN_PREVIEW'||fixture.liveAutomaticAggregator!==false)throw new Error('Assortment fixture identity/truth drift');
  return Object.freeze(fixture);
}
function ensureStylesheet(){
  const href=new URL('./assortment-continuity.css',import.meta.url).href;
  const existing=document.querySelector(\`link[data-assortment-preview-stylesheet="\${STYLESHEET_REF}"]\`);
  if(existing){if(existing.href!==href)throw new Error('Assortment stylesheet binding drift');return existing;}
  const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset.assortmentPreviewStylesheet=STYLESHEET_REF;document.head.append(link);return link;
}

function truthBadge(t){const n=el('span','assortment-truth',t('assortment.truth.frozen'));n.title='SOURCE_BACKED_FROZEN_PREVIEW';return n;}
function stageRail(work,t){
  const rail=el('ol','assortment-stage-rail');rail.style.setProperty('--stage-count',String(Math.max(1,(work.stageRefs??[]).length)));
  (work.stageRefs??[]).forEach((ref,index)=>{
    const li=el('li','assortment-stage',t(ref));
    li.dataset.stageState=index<work.currentStageIndex?'complete':index===work.currentStageIndex?'current':'future';
    if(index===work.currentStageIndex)li.setAttribute('aria-current','step');
    rail.append(li);
  });
  return rail;
}
function currentWorkCard(work,t){
  const card=el('article','assortment-work-card');card.dataset.workRef=work.workRef;
  const heading=el('div','assortment-work-card__heading');
  heading.append(el('h3','',work.title),el('span','assortment-work-card__state',t(work.stateLabelRef)));
  card.append(heading,stageRail(work,t),sourceDetails(work,t));
  return card;
}
function recordCard(record,t,{titleRef=null,summaryRef=null,title=null,className='assortment-record'}={}){
  const card=el('article',className);card.dataset.recordRef=record.eventRef??record.recordRef??record.momentRef??'';
  const meta=el('small','assortment-record__class',record.displayClass??record.recordClass??record.statusKey??'');
  card.append(meta,el('h3','',title??t(titleRef)),el('p','',t(summaryRef)),sourceDetails(record,t));
  return card;
}

function renderContinuity({host,fixture,t,preview}){
  const root=el('section','assortment-surface assortment-continuity');root.dataset.surfaceRef=ASSORTMENT_CONTINUITY_SURFACE_REF;root.dataset.previewRef=ASSORTMENT_PREVIEW_REF;
  const intro=el('header','assortment-hero');intro.append(el('small','assortment-eyebrow',t('assortment.continuity.eyebrow')),el('h2','',t('assortment.continuity.title')),el('p','',t('assortment.continuity.intro')),truthBadge(t));
  const actions=el('div','assortment-primary-actions');
  const resume=btn('assortment-primary',t('assortment.action.resume'),()=>void preview.openPresentation(ASSORTMENT_PROJECT_DEPTH_SURFACE_REF));resume.dataset.vexActionRef='action.assortment.continuity.resume-current';resume.dataset.vexElementRef='element.assortment.continuity.resume-current';
  const projects=btn('',t('assortment.action.projects'),()=>void preview.openSemanticSibling(ASSORTMENT_TERRAIN_REFS.projects));projects.dataset.vexActionRef='action.navigation.sibling';projects.dataset.vexElementRef='element.assortment.continuity.projects';
  const frontier=btn('',t('assortment.action.frontier'),()=>void preview.openSemanticSibling(ASSORTMENT_TERRAIN_REFS.frontier));frontier.dataset.vexActionRef='action.navigation.sibling';frontier.dataset.vexElementRef='element.assortment.continuity.frontier';
  actions.append(resume,projects,frontier);intro.append(actions);root.append(intro);

  const current=el('section','assortment-section');current.append(el('div','assortment-section__heading',t('assortment.current-work.title')));
  const currentGrid=el('div','assortment-work-grid');for(const work of fixture.currentWork)currentGrid.append(currentWorkCard(work,t));current.append(currentGrid);root.append(current);

  const history=el('section','assortment-section assortment-history');
  const switcher=el('div','assortment-segmented');
  const timelineButton=btn('is-selected',t('assortment.timeline.title'),()=>show('timeline'));
  const revisitButton=btn('',t('assortment.revisit.title'),()=>show('revisit'));
  timelineButton.setAttribute('aria-pressed','true');revisitButton.setAttribute('aria-pressed','false');switcher.append(timelineButton,revisitButton);history.append(switcher);
  const timeline=el('div','assortment-record-list');timeline.dataset.view='timeline';for(const item of fixture.timeline)timeline.append(recordCard(item,t,{titleRef:item.titleRef,summaryRef:item.summaryRef}));
  const revisit=el('div','assortment-record-list');revisit.dataset.view='revisit';revisit.hidden=true;for(const item of fixture.revisit)revisit.append(recordCard(item,t,{title:item.title,summaryRef:item.summaryRef}));
  function show(view){const isTimeline=view==='timeline';timeline.hidden=!isTimeline;revisit.hidden=isTimeline;timelineButton.classList.toggle('is-selected',isTimeline);revisitButton.classList.toggle('is-selected',!isTimeline);timelineButton.setAttribute('aria-pressed',String(isTimeline));revisitButton.setAttribute('aria-pressed',String(!isTimeline));}
  history.append(timeline,revisit);root.append(history);
  root.append(el('p','assortment-footnote',t('assortment.truth.not-live')));
  host.append(root);
}

function renderProjects({host,fixture,t,preview}){
  const root=el('section','assortment-surface assortment-projects');root.dataset.surfaceRef=ASSORTMENT_PROJECTS_SURFACE_REF;root.dataset.previewRef=ASSORTMENT_PREVIEW_REF;
  const hero=el('header','assortment-hero');hero.append(el('small','assortment-eyebrow',t('assortment.projects.eyebrow')),el('h2','',t('assortment.projects.title')),el('p','',t('assortment.projects.intro')),truthBadge(t));root.append(hero);
  const list=el('div','assortment-project-grid');
  for(const work of fixture.currentWork){const card=currentWorkCard(work,t);if(work.workRef.startsWith('work.vexlife.assortment.')){const open=btn('assortment-primary',t('assortment.action.open-project'),()=>void preview.openPresentation(ASSORTMENT_PROJECT_DEPTH_SURFACE_REF));open.dataset.vexActionRef='action.assortment.projects.open';open.dataset.vexElementRef='element.assortment.projects.open-current';card.append(open);}list.append(card);}root.append(list);
  host.append(root);
}

function renderFrontier({host,fixture,t}){
  const root=el('section','assortment-surface assortment-frontier');root.dataset.surfaceRef=ASSORTMENT_FRONTIER_SURFACE_REF;root.dataset.previewRef=ASSORTMENT_PREVIEW_REF;
  const hero=el('header','assortment-hero');hero.append(el('small','assortment-eyebrow',t('assortment.frontier.eyebrow')),el('h2','',t('assortment.frontier.title')),el('p','',t('assortment.frontier.intro')),truthBadge(t));root.append(hero);
  const list=el('div','assortment-record-list');for(const item of fixture.revisit.filter((x)=>x.recordClass!=='EXISTING_PARALLEL_TRAJECTORY'))list.append(recordCard(item,t,{title:item.title,summaryRef:item.summaryRef}));root.append(list);host.append(root);
}

function renderProcessTrail({root,fixture,t}){
  let selectedIndex=Math.max(0,fixture.processTrail.findIndex((x)=>x.statusKey==='current'));
  let mode='horizontal';let windowStart=Math.max(0,selectedIndex-2);const windowSize=5;
  const wrap=el('section','assortment-process-trail');
  const heading=el('div','assortment-process-trail__heading');heading.append(el('h3','',t('assortment.process.title')));
  const modes=el('div','assortment-segmented');
  const horizontal=btn('is-selected',t('assortment.process.horizontal'),()=>{mode='horizontal';render()});
  const vertical=btn('',t('assortment.process.vertical'),()=>{mode='vertical';render()});modes.append(horizontal,vertical);heading.append(modes);wrap.append(heading);
  const content=el('div','assortment-process-trail__content');wrap.append(content);root.append(wrap);
  function render(){content.replaceChildren();horizontal.classList.toggle('is-selected',mode==='horizontal');vertical.classList.toggle('is-selected',mode==='vertical');horizontal.setAttribute('aria-pressed',String(mode==='horizontal'));vertical.setAttribute('aria-pressed',String(mode==='vertical'));
    const rail=el('div',\`assortment-process-rail assortment-process-rail--\${mode}\`);
    const visible=mode==='horizontal'?fixture.processTrail.slice(windowStart,windowStart+windowSize):fixture.processTrail;
    for(const item of visible){const index=fixture.processTrail.indexOf(item),row=btn('assortment-process-row','',()=>{selectedIndex=index;render()});row.dataset.status=item.statusKey;row.dataset.momentRef=item.momentRef;if(item.statusKey==='current')row.setAttribute('aria-current','step');if(index===selectedIndex)row.classList.add('is-selected');const dot=el('span','assortment-process-row__dot');const copy=el('span','assortment-process-row__copy');copy.append(el('strong','',t(item.titleRef)),el('small','',t(item.summaryRef)));row.append(dot,copy,el('span','assortment-process-row__inspect',t('assortment.process.inspect')));rail.append(row);}
    const detailItem=fixture.processTrail[selectedIndex];const detail=el('article','assortment-process-detail');detail.append(el('small','assortment-record__class',detailItem.statusKey.toUpperCase()),el('h3','',t(detailItem.titleRef)),el('p','',t(detailItem.summaryRef)),sourceDetails(detailItem,t));
    if(mode==='horizontal'){const pager=el('div','assortment-process-pager');const older=btn('',t('assortment.process.older'),()=>{windowStart=Math.max(0,windowStart-windowSize);render()});const newer=btn('',t('assortment.process.newer'),()=>{windowStart=Math.min(Math.max(0,fixture.processTrail.length-windowSize),windowStart+windowSize);render()});older.disabled=windowStart===0;newer.disabled=windowStart+windowSize>=fixture.processTrail.length;pager.append(older,newer);content.append(pager,rail,detail);}else{const split=el('div','assortment-process-split');split.append(rail,detail);content.append(split);}
  }
  render();
}

function renderProjectDepth({host,fixture,t}){
  const root=el('section','assortment-surface assortment-project-depth');root.dataset.surfaceRef=ASSORTMENT_PROJECT_DEPTH_SURFACE_REF;root.dataset.previewRef=ASSORTMENT_PREVIEW_REF;
  const hero=el('header','assortment-hero');hero.append(el('small','assortment-eyebrow',t('assortment.project-depth.eyebrow')),el('h2','','VexLife Assortment · Home Blueprint'),el('p','',t('assortment.project-depth.intro')),truthBadge(t));root.append(hero);
  const summary=el('section','assortment-status-grid');
  for(const [key,ref] of [['current','assortment.status.current'],['next','assortment.status.next'],['queue','assortment.status.queue'],['held','assortment.status.held']]){const card=el('article','assortment-status-card');card.dataset.status=key;card.append(el('small','',t(\`assortment.status.\${key}.label\`)),el('strong','',t(ref)));summary.append(card);}root.append(summary);
  renderProcessTrail({root,fixture,t});host.append(root);
}

export function createAssortmentPreview({app,t=(ref)=>ref}={}){
  if(!app?.uxProjectionShell||!app?.navigation||!app?.terrain)throw new TypeError('Assortment preview requires the current VexLife app owners');
  let fixture=null;const presentationStack=[];
  const shellBack=()=>document.querySelector('#evolutionActiveSurfaceBack');
  const activeSurface=()=>app.uxProjectionShell.snapshot().activeSurfaceRef;
  const syncBack=()=>{const b=shellBack();if(!b)return;const active=activeSurface();b.hidden=!ASSORTMENT_SURFACES.has(active);b.disabled=!ASSORTMENT_SURFACES.has(active);b.dataset.presentationDepth=String(presentationStack.length);};
  const syncTerrainToFrame=(frame)=>{const ref=frame?.selectedNodeRef;if(typeof ref==='string'){app.state.terrain.selected=ref;app.terrain.render(false);}return ref;};
  async function ensureFixture(){fixture??=await loadFixture();return fixture;}
  async function openSurface(ref){if(!ASSORTMENT_SURFACES.has(ref))throw new Error(\`Unknown Assortment surface \${ref}\`);const result=await app.uxProjectionShell.openEvolutionSurface(ref);syncBack();return result;}
  async function openPresentation(ref){const current=activeSurface();if(current&&ASSORTMENT_SURFACES.has(current))presentationStack.push(current);return openSurface(ref);}
  async function openSemanticSibling(terrainRef){presentationStack.splice(0);return app.terrain.travel(terrainRef,'sibling');}
  async function handleTerrainNode(terrainRef){const surface=SURFACE_FOR_TERRAIN[terrainRef];if(!surface)return false;presentationStack.splice(0);await openSurface(surface);return true;}
  async function back(){const active=activeSurface();if(!ASSORTMENT_SURFACES.has(active))return Object.freeze({state:'NOT_ASSORTMENT'});if(presentationStack.length){const target=presentationStack.pop();await openSurface(target);syncBack();return Object.freeze({state:'PRESENTATION_BACK',surfaceRef:target,journeyMutated:false});}
    const result=app.navigation.back();if(!result.changed){await app.uxProjectionShell.closeEvolutionActiveSurface('ASSORTMENT_BACK_EMPTY');syncBack();return Object.freeze({state:'CLOSED_BACK_EMPTY',journeyMutated:false});}
    const terrainRef=syncTerrainToFrame(result.frame);const target=SURFACE_FOR_TERRAIN[terrainRef]??null;if(target)await openSurface(target);else await app.uxProjectionShell.closeEvolutionActiveSurface('ASSORTMENT_BACK_HOME');syncBack();return Object.freeze({state:target?'SEMANTIC_BACK':'SEMANTIC_BACK_HOME',surfaceRef:target,terrainRef,journeyMutated:true,journeyActionRef:result.journeyEvent?.actionRef??null});
  }
  function onShellClose(){presentationStack.splice(0);queueMicrotask(syncBack);}
  async function relocalize(){const active=activeSurface();if(!ASSORTMENT_SURFACES.has(active))return Object.freeze({state:'NO_ACTIVE_ASSORTMENT_SURFACE'});const result=await openSurface(active);return Object.freeze({state:'RELOCALIZED',surfaceRef:active,result});}
  function snapshot(){return Object.freeze({previewRef:ASSORTMENT_PREVIEW_REF,activeSurfaceRef:activeSurface(),surfaceBackDepth:presentationStack.length,truthClass:fixture?.truthClass??null});}
  async function register(){ensureStylesheet();const data=await ensureFixture();
    const mk=(ref,render)=>Object.freeze({async mount({body}){render({host:body,fixture:data,t,preview:api});queueMicrotask(syncBack);return Object.freeze({state:'MOUNTED',surfaceRef:ref,effects:false})},requestClose(){return Object.freeze({state:'CLOSED',reason:'PRESENTATION_DISMISS',semanticNavigationMutated:false})}});
    app.uxProjectionShell.registerEvolutionSurfaceAdapter(ASSORTMENT_CONTINUITY_SURFACE_REF,mk(ASSORTMENT_CONTINUITY_SURFACE_REF,renderContinuity));
    app.uxProjectionShell.registerEvolutionSurfaceAdapter(ASSORTMENT_PROJECTS_SURFACE_REF,mk(ASSORTMENT_PROJECTS_SURFACE_REF,renderProjects));
    app.uxProjectionShell.registerEvolutionSurfaceAdapter(ASSORTMENT_PROJECT_DEPTH_SURFACE_REF,mk(ASSORTMENT_PROJECT_DEPTH_SURFACE_REF,renderProjectDepth));
    app.uxProjectionShell.registerEvolutionSurfaceAdapter(ASSORTMENT_FRONTIER_SURFACE_REF,mk(ASSORTMENT_FRONTIER_SURFACE_REF,renderFrontier));
    syncBack();return snapshot();
  }
  const api=Object.freeze({register,handleTerrainNode,openPresentation,openSemanticSibling,back,onShellClose,relocalize,snapshot});
  return api;
}

// [VXG RealForever]
