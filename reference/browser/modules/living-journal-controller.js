const VANTAGES=Object.freeze(['HUMAN','VEX','SHARED_RELATIONSHIP','SOURCE']);
const DISPLAY_LANGUAGES=Object.freeze(['en','ja','zh']);
const SYNTHETIC_TRUTH='CURRENT_SYNTHETIC_REFERENCE';
const MEMORY_TRUTH='CURRENT_MEMORY_REFERENCE';
const MEMORY_SCHEMA='vexlife.living-journal.memory-projection/v1';
const POSITIVE_CONSENT=new Set(['PERMITTED','NARROWED']);
const q=(selector)=>document.querySelector(selector);
const object=(value)=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const nonempty=(value)=>typeof value==='string'&&value.length>0;

function assertSyntheticData(data){
  if(data?.truthClass!==SYNTHETIC_TRUTH||data.realMemoryLoaded||data.realJournalBodyLoaded||data.modelCalled||data.translationCalled||data.networkCalled||data.persisted||data.published||!Array.isArray(data.pages)||data.pages.length===0)throw new Error('Living Journal demo data boundary is invalid');
  return data;
}

function assertMemoryPage(page,index){
  if(!object(page)||!nonempty(page.pageRef)||!nonempty(page.statementRef)||!nonempty(page.summary)||!nonempty(page.summaryHash))throw new Error(`Living Journal Memory page ${index} identity/body is invalid`);
  if(Object.hasOwn(page,'eventRef')||Object.hasOwn(page,'thenRef')||Object.hasOwn(page,'display')||Object.hasOwn(page,'source'))throw new Error(`Living Journal Memory page ${index} cannot impersonate synthetic event/temporal/source-body semantics`);
  if(page.current!==true||page.acceptedForContinuity!==true||!POSITIVE_CONSENT.has(page.consentState))throw new Error(`Living Journal Memory page ${index} current acceptance state is invalid`);
  if(!nonempty(page.currentDailyStratumRef)||!nonempty(page.currentDailyStratumSha256)||!nonempty(page.dayRef)||!Number.isInteger(page.dayIndex)||page.dayIndex<0)throw new Error(`Living Journal Memory page ${index} Daily identity is invalid`);
  for(const key of ['sourceConversationHeadSha256','sourceScoreHeadSha256','sourceSemanticAuthorityHeadSha256'])if(!nonempty(page[key]))throw new Error(`Living Journal Memory page ${index} ${key} is invalid`);
  if(!Array.isArray(page.sourceBindings)||page.sourceBindings.length===0||page.sourceBindings.some((binding)=>!object(binding)||!nonempty(binding.eventRef)))throw new Error(`Living Journal Memory page ${index} source bindings are invalid`);
  if(!object(page.sourceDescent)||page.sourceDescent.rawSourceContentIncluded!==false||page.rawSourceContentIncluded!==false||page.firstPersonAuthorityGranted!==false)throw new Error(`Living Journal Memory page ${index} source-content boundary is invalid`);
  return page;
}

function assertMemoryData(data){
  if(!object(data)||data.schemaVersion!==MEMORY_SCHEMA||data.truthClass!==MEMORY_TRUTH||data.currentness!=='CURRENT'||data.state!=='CURRENT'||data.realMemoryLoaded!==true||data.rawConversationContentIncluded!==false||!Array.isArray(data.pages))throw new Error('Living Journal Memory projection boundary is invalid');
  if(data.realJournalBodyLoaded!==(data.pages.length>0)||data.pageCount!==data.pages.length)throw new Error('Living Journal Memory projection page/body state is invalid');
  if(!object(data.effects)||Object.values(data.effects).some((value)=>value!==false))throw new Error('Living Journal Memory projection must be effect-free');
  data.pages.forEach(assertMemoryPage);
  return data;
}

function assertData(data){
  if(data?.truthClass===SYNTHETIC_TRUTH)return assertSyntheticData(data);
  if(data?.truthClass===MEMORY_TRUTH)return assertMemoryData(data);
  throw new Error('Living Journal data truth class is not admitted');
}

export function createLivingJournalController({state,data,t,navigation,onSourceOpen=()=>{},onRevisit=()=>{}}){
  let journalData=assertData(data);
  const initialData=journalData;
  const journal={open:false,pageIndex:0,vantage:'HUMAN',displayLanguage:'en',openedNodeRef:null,sourceDoorRef:null,sourceDoorRefs:[],marginalia:new Map(),renderCount:0};
  let scrollTimer=null;
  const memoryMode=()=>journalData.truthClass===MEMORY_TRUTH;
  const pageCount=()=>journalData.pages.length;
  const layoutClass=()=>innerWidth>=1000?'WIDE_SPREAD':innerWidth<=760?'PHONE_ONE_PAGE':'NARROW_ONE_PAGE';
  const reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  const clampIndex=(index)=>pageCount()===0?0:Math.max(0,Math.min(pageCount()-1,Number(index)||0));
  const currentPage=()=>pageCount()===0?null:journalData.pages[journal.pageIndex]??null;
  const sourceRefsFor=(page)=>memoryMode()?[...new Set((page?.sourceBindings??[]).map((binding)=>binding.eventRef).filter(nonempty))]:page?.source?.sourceRef?[page.source.sourceRef]:[];
  const canonicalThenIdentity=()=>memoryMode()
    ?JSON.stringify(journalData.pages.map((page)=>({pageRef:page.pageRef,statementRef:page.statementRef,summaryHash:page.summaryHash,currentDailyStratumSha256:page.currentDailyStratumSha256,sourceConversationHeadSha256:page.sourceConversationHeadSha256,sourceScoreHeadSha256:page.sourceScoreHeadSha256,sourceSemanticAuthorityHeadSha256:page.sourceSemanticAuthorityHeadSha256})))
    :JSON.stringify(journalData.pages.map((page)=>({pageRef:page.pageRef,eventRef:page.eventRef,thenRef:page.thenRef,sourceRef:page.source.sourceRef,originalLanguage:page.source.originalLanguage,originalText:page.source.originalText})));
  function projection(page){
    if(memoryMode())return{mode:'MEMORY',pageRef:page.pageRef,statementRef:page.statementRef,summary:page.summary,summaryHash:page.summaryHash,current:page.current,acceptedForContinuity:page.acceptedForContinuity,consentState:page.consentState,currentDailyStratumRef:page.currentDailyStratumRef,currentDailyStratumSha256:page.currentDailyStratumSha256,dayRef:page.dayRef,dayIndex:page.dayIndex,sourceConversationHeadSha256:page.sourceConversationHeadSha256,sourceScoreHeadSha256:page.sourceScoreHeadSha256,sourceSemanticAuthorityHeadSha256:page.sourceSemanticAuthorityHeadSha256,sourceRefs:sourceRefsFor(page),sourceDescent:page.sourceDescent};
    const language=DISPLAY_LANGUAGES.includes(journal.displayLanguage)?journal.displayLanguage:'en';
    const localized=page.display[language]??page.display.en;
    return{mode:'SYNTHETIC',pageRef:page.pageRef,eventRef:page.eventRef,sequence:page.sequence,source:page.source,thenRef:page.thenRef,then:localized.then,later:localized.later,now:localized.now,vantage:journal.vantage,vantageText:localized.vantages[journal.vantage],displayLanguage:language};
  }
  function renderedIndices(){
    if(pageCount()===0)return[];
    const kind=layoutClass(),i=journal.pageIndex;
    if(kind==='WIDE_SPREAD')return[i,...(i+1<pageCount()?[i+1]:[])];
    if(kind==='PHONE_ONE_PAGE')return[i-1,i,i+1].filter((index)=>index>=0&&index<pageCount());
    return[i];
  }
  function visiblePageCount(){if(pageCount()===0)return 0;return layoutClass()==='WIDE_SPREAD'?Math.min(2,pageCount()-journal.pageIndex):1;}
  function renderPage(index){
    const view=projection(journalData.pages[index]);
    const article=document.createElement('article');
    article.className='living-journal-page';
    article.dataset.pageRef=view.pageRef;
    article.dataset.pageIndex=String(index);
    article.dataset.current=String(index===journal.pageIndex);
    article.dataset.truthClass=journalData.truthClass;
    if(view.eventRef)article.dataset.eventRef=view.eventRef;
    if(view.statementRef)article.dataset.statementRef=view.statementRef;
    if(index===journal.pageIndex)article.setAttribute('aria-current','page');
    const ordinal=document.createElement('small');
    ordinal.className='living-journal-ordinal';
    ordinal.textContent=view.mode==='MEMORY'?`${String(index+1).padStart(2,'0')} · ${view.statementRef}`:`${String(view.sequence).padStart(2,'0')} · ${view.eventRef}`;
    if(view.mode==='MEMORY'){
      const summary=document.createElement('section');summary.className='living-journal-time living-journal-memory-summary';summary.dataset.memoryState='CURRENT_ACCEPTED';
      const text=document.createElement('p');text.textContent=view.summary;summary.append(text);
      const source=document.createElement('footer');source.className='living-journal-source-line';source.dataset.rawSourceContentIncluded='false';source.textContent=`${t('living-journal.source-status')}: ${view.sourceRefs.join(' · ')}`;
      article.append(ordinal,summary,source);
      return article;
    }
    const then=document.createElement('section');then.className='living-journal-time then';then.dataset.temporalClass='THEN';
    const thenLabel=document.createElement('strong');thenLabel.textContent=t('living-journal.then');const thenText=document.createElement('p');thenText.textContent=view.then;then.append(thenLabel,thenText);
    const vantage=document.createElement('blockquote');vantage.className='living-journal-vantage';vantage.dataset.vantage=view.vantage;vantage.textContent=view.vantageText;
    const later=document.createElement('section');later.className='living-journal-time later';later.dataset.temporalClass='LATER';
    const laterLabel=document.createElement('strong');laterLabel.textContent=t('living-journal.later');const laterText=document.createElement('p');laterText.textContent=view.later;later.append(laterLabel,laterText);
    const now=document.createElement('section');now.className='living-journal-time now';now.dataset.temporalClass='NOW';now.dataset.currentness='DERIVED_CURRENT';
    const nowLabel=document.createElement('strong');nowLabel.textContent=t('living-journal.now');const nowText=document.createElement('p');nowText.textContent=view.now;now.append(nowLabel,nowText);
    const source=document.createElement('footer');source.className='living-journal-source-line';source.textContent=`${t('living-journal.original-language')}: ${view.source.originalLanguage} · ${view.source.sourceRef}`;
    article.append(ordinal,then,vantage,later,now,source);
    return article;
  }
  function renderMarginalia(){
    const host=q('#livingJournalMarginaliaList');if(!host)return;
    host.replaceChildren();
    const page=currentPage(),notes=page?(journal.marginalia.get(page.pageRef)??[]):[];
    for(const note of notes){const item=document.createElement('p');item.className='living-journal-margin-note';item.dataset.localOnly='true';item.textContent=note.content;host.append(item);}
    host.dataset.noteCount=String(notes.length);
  }
  function scrollCurrentIntoView(){
    if(layoutClass()!=='PHONE_ONE_PAGE'||pageCount()===0)return;
    const spread=q('#livingJournalSpread'),current=spread?.querySelector(`[data-page-index="${journal.pageIndex}"]`);
    if(!spread||!current)return;
    spread.scrollTo({left:current.offsetLeft,behavior:reducedMotion()?'auto':'smooth'});
  }
  function render(){
    const root=q('#view-living-journal');if(!root)return snapshot();
    const spread=q('#livingJournalSpread'),status=q('#livingJournalPageStatus'),truth=q('#livingJournalTruth'),sourceStatus=q('#livingJournalSourceStatus');
    root.dataset.layoutClass=layoutClass();root.dataset.truthClass=journalData.truthClass;root.dataset.dataMode=memoryMode()?'MEMORY':'SYNTHETIC';root.dataset.open=String(journal.open);
    if(truth)truth.textContent=memoryMode()?MEMORY_TRUTH:t('living-journal.reference-label');
    if(status)status.textContent=t('living-journal.page-status',{current:pageCount()?journal.pageIndex+1:0,total:pageCount()});
    const prev=q('#livingJournalPrevious'),next=q('#livingJournalNext');if(prev)prev.disabled=pageCount()===0||journal.pageIndex===0;if(next)next.disabled=pageCount()===0||journal.pageIndex===pageCount()-1;
    const vantage=q('#livingJournalVantage');if(vantage){vantage.value=journal.vantage;vantage.disabled=memoryMode();vantage.setAttribute('aria-disabled',String(memoryMode()));}
    const language=q('#livingJournalDisplayLanguage');if(language){language.value=journal.displayLanguage;language.disabled=memoryMode();language.setAttribute('aria-disabled',String(memoryMode()));}
    if(spread){spread.replaceChildren(...renderedIndices().map(renderPage));spread.dataset.visiblePageCount=String(visiblePageCount());spread.dataset.renderedPageCount=String(renderedIndices().length);requestAnimationFrame(scrollCurrentIntoView);}
    if(sourceStatus){const page=currentPage();if(!page||!journal.sourceDoorRef)sourceStatus.textContent='';else if(memoryMode())sourceStatus.textContent=`${t('living-journal.source-status')}: ${journal.sourceDoorRefs.join(' · ')}`;else sourceStatus.textContent=`${t('living-journal.source-status')}: ${page.source.originalLanguage} · ${journal.sourceDoorRef} · ${page.source.originalText}`;}
    renderMarginalia();journal.renderCount+=1;return snapshot();
  }
  function setMarginaliaExpanded(expanded){const panel=q('#livingJournalMarginalia');if(panel)panel.open=Boolean(expanded);}
  function resetLocalProjectionState(){journal.pageIndex=0;journal.vantage='HUMAN';journal.displayLanguage='en';journal.sourceDoorRef=null;journal.sourceDoorRefs=[];journal.marginalia=new Map();setMarginaliaExpanded(false);}
  function setData(nextData){assertData(nextData);journalData=nextData;resetLocalProjectionState();if(journal.open)render();return snapshot();}
  function restoreInitialData(){return setData(initialData);}
  function open({selectedNodeRef=state.selectedNodeRef}={}){
    journal.open=true;journal.openedNodeRef=selectedNodeRef;journal.sourceDoorRef=null;journal.sourceDoorRefs=[];journal.marginalia=new Map();journal.pageIndex=clampIndex(journal.pageIndex);setMarginaliaExpanded(false);render();return snapshot();
  }
  function close(){journal.open=false;journal.sourceDoorRef=null;journal.sourceDoorRefs=[];journal.marginalia=new Map();setMarginaliaExpanded(false);renderMarginalia();return snapshot();}
  function setPage(index){if(pageCount()===0)return snapshot();const next=clampIndex(index);if(next===journal.pageIndex)return snapshot();journal.pageIndex=next;journal.sourceDoorRef=null;journal.sourceDoorRefs=[];render();return snapshot();}
  const previous=()=>setPage(journal.pageIndex-1);
  const next=()=>setPage(journal.pageIndex+1);
  function selectVantage(value){if(memoryMode())throw new Error('Living Journal Memory projection has no admitted vantage-text projection');if(!VANTAGES.includes(value))throw new Error(`Unsupported Living Journal vantage: ${value}`);journal.vantage=value;render();return snapshot();}
  function selectDisplayLanguage(value){if(memoryMode())throw new Error('Living Journal Memory projection has no admitted display-language projection');if(!DISPLAY_LANGUAGES.includes(value))throw new Error(`Unsupported Living Journal display language: ${value}`);journal.displayLanguage=value;render();return snapshot();}
  function openSource(){const page=currentPage();if(!page)return snapshot();if(memoryMode()){journal.sourceDoorRef=page.pageRef;journal.sourceDoorRefs=sourceRefsFor(page);render();onSourceOpen({pageRef:page.pageRef,statementRef:page.statementRef,sourceRef:null,sourceRefs:[...journal.sourceDoorRefs],sourceDescent:structuredClone(page.sourceDescent),selectedNodeRef:journal.openedNodeRef});return snapshot();}journal.sourceDoorRef=page.source.sourceRef;journal.sourceDoorRefs=[page.source.sourceRef];render();onSourceOpen({sourceRef:page.source.sourceRef,eventRef:page.eventRef,selectedNodeRef:journal.openedNodeRef});return snapshot();}
  function revisit(){const page=currentPage();if(!page)return snapshot();if(memoryMode())onRevisit({pageRef:page.pageRef,statementRef:page.statementRef,sourceConversationHeadSha256:page.sourceConversationHeadSha256,selectedNodeRef:journal.openedNodeRef});else onRevisit({eventRef:page.eventRef,selectedNodeRef:journal.openedNodeRef});return snapshot();}
  function addMarginalia(content){const page=currentPage();if(!page)return snapshot();const text=String(content??'').trim();if(!text)return snapshot();const pageRef=page.pageRef,notes=journal.marginalia.get(pageRef)??[];notes.push(Object.freeze({marginaliaRef:`marginalia.local.${crypto.randomUUID()}`,pageRef,content:text,localOnly:true}));journal.marginalia.set(pageRef,notes);setMarginaliaExpanded(true);renderMarginalia();return snapshot();}
  function snapshot(){
    const page=currentPage(),synthetic=!memoryMode()&&page;
    const effectSource=memoryMode()?journalData.effects:{};
    return structuredClone({truthClass:journalData.truthClass,dataMode:memoryMode()?'MEMORY':'SYNTHETIC',open:journal.open,pageIndex:journal.pageIndex,pageRef:page?.pageRef??null,eventRef:synthetic?page.eventRef:null,statementRef:memoryMode()&&page?page.statementRef:null,pageCount:pageCount(),vantage:journal.vantage,displayLanguage:journal.displayLanguage,vantageProjectionAvailable:!memoryMode(),displayLanguageProjectionAvailable:!memoryMode(),openedNodeRef:journal.openedNodeRef,sourceDoorRef:journal.sourceDoorRef,sourceDoorRefs:[...journal.sourceDoorRefs],marginaliaCount:page?(journal.marginalia.get(page.pageRef)??[]).length:0,totalMarginaliaCount:[...journal.marginalia.values()].reduce((sum,notes)=>sum+notes.length,0),layoutClass:layoutClass(),visiblePageCount:visiblePageCount(),renderedPageRefs:renderedIndices().map((index)=>journalData.pages[index].pageRef),reducedMotion:reducedMotion(),realMemoryLoaded:journalData.realMemoryLoaded,realJournalBodyLoaded:journalData.realJournalBodyLoaded,modelCalled:memoryMode()?effectSource.modelCalled===true:journalData.modelCalled,translationCalled:memoryMode()?effectSource.translationCalled===true:journalData.translationCalled,networkCalled:memoryMode()?effectSource.networkCalled===true:journalData.networkCalled,persisted:memoryMode()?effectSource.homeMutated===true||effectSource.memoryMutated===true:journalData.persisted,published:memoryMode()?effectSource.publicationPerformed===true:journalData.published,canonicalThenIdentity:canonicalThenIdentity(),originalLanguage:synthetic?page.source.originalLanguage:null,sourceRef:synthetic?page.source.sourceRef:null,originalText:synthetic?page.source.originalText:null,summary:memoryMode()&&page?page.summary:null,summaryHash:memoryMode()&&page?page.summaryHash:null,renderCount:journal.renderCount});
  }
  function bind(){
    q('#livingJournalPrevious')?.addEventListener('click',previous);q('#livingJournalNext')?.addEventListener('click',next);
    q('#livingJournalVantage')?.addEventListener('change',(event)=>selectVantage(event.currentTarget.value));
    q('#livingJournalDisplayLanguage')?.addEventListener('change',(event)=>selectDisplayLanguage(event.currentTarget.value));
    q('#livingJournalSource')?.addEventListener('click',openSource);q('#livingJournalRevisit')?.addEventListener('click',revisit);
    q('#livingJournalMarginaliaAdd')?.addEventListener('click',()=>{const input=q('#livingJournalMarginaliaInput');addMarginalia(input?.value);if(input)input.value='';});
    q('#view-living-journal')?.addEventListener('keydown',(event)=>{if(['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName))return;if(event.key==='ArrowLeft'){event.preventDefault();previous();}else if(event.key==='ArrowRight'){event.preventDefault();next();}});
    q('#livingJournalSpread')?.addEventListener('scroll',()=>{if(layoutClass()!=='PHONE_ONE_PAGE'||pageCount()===0)return;clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{const spread=q('#livingJournalSpread'),pages=[...(spread?.querySelectorAll('.living-journal-page')??[])];if(!spread||!pages.length)return;const center=spread.scrollLeft+spread.clientWidth/2;let closest=pages[0],distance=Infinity;for(const page of pages){const pageCenter=page.offsetLeft+page.offsetWidth/2,nextDistance=Math.abs(pageCenter-center);if(nextDistance<distance){distance=nextDistance;closest=page;}}const index=Number(closest.dataset.pageIndex);if(Number.isInteger(index)&&index!==journal.pageIndex){journal.pageIndex=clampIndex(index);journal.sourceDoorRef=null;journal.sourceDoorRefs=[];render();}},120);});
    globalThis.addEventListener('resize',()=>{if(journal.open)render();});
  }
  bind();
  return{open,close,render,snapshot,previous,next,setPage,setData,restoreInitialData,selectVantage,selectDisplayLanguage,openSource,revisit,addMarginalia,canonicalThenIdentity};
}

// [VXG RealForever]
