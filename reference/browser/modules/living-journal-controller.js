const VANTAGES=Object.freeze(['HUMAN','VEX','SHARED_RELATIONSHIP','SOURCE']);
const DISPLAY_LANGUAGES=Object.freeze(['en','ja','zh']);
const q=(selector)=>document.querySelector(selector);

export function createLivingJournalController({state,data,t,navigation,onSourceOpen=()=>{},onRevisit=()=>{}}){
  if(data?.truthClass!=='CURRENT_SYNTHETIC_REFERENCE'||data.realMemoryLoaded||data.realJournalBodyLoaded||data.modelCalled||data.translationCalled||data.networkCalled||data.persisted||data.published)throw new Error('Living Journal demo data boundary is invalid');
  const journal={open:false,pageIndex:0,vantage:'HUMAN',displayLanguage:'en',openedNodeRef:null,sourceDoorRef:null,marginalia:new Map(),renderCount:0};
  let scrollTimer=null;
  const pageCount=()=>data.pages.length;
  const layoutClass=()=>innerWidth>=1000?'WIDE_SPREAD':innerWidth<=760?'PHONE_ONE_PAGE':'NARROW_ONE_PAGE';
  const reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  const clampIndex=(index)=>Math.max(0,Math.min(pageCount()-1,Number(index)||0));
  const currentPage=()=>data.pages[journal.pageIndex];
  const canonicalThenIdentity=()=>JSON.stringify(data.pages.map((page)=>({pageRef:page.pageRef,eventRef:page.eventRef,thenRef:page.thenRef,sourceRef:page.source.sourceRef,originalLanguage:page.source.originalLanguage,originalText:page.source.originalText})));
  function projection(page){
    const language=DISPLAY_LANGUAGES.includes(journal.displayLanguage)?journal.displayLanguage:'en';
    const localized=page.display[language]??page.display.en;
    return{pageRef:page.pageRef,eventRef:page.eventRef,sequence:page.sequence,source:page.source,thenRef:page.thenRef,then:localized.then,later:localized.later,now:localized.now,vantage:journal.vantage,vantageText:localized.vantages[journal.vantage],displayLanguage:language};
  }
  function renderedIndices(){
    const kind=layoutClass(),i=journal.pageIndex;
    if(kind==='WIDE_SPREAD')return[i,...(i+1<pageCount()?[i+1]:[])];
    if(kind==='PHONE_ONE_PAGE')return[i-1,i,i+1].filter((index)=>index>=0&&index<pageCount());
    return[i];
  }
  function visiblePageCount(){return layoutClass()==='WIDE_SPREAD'?Math.min(2,pageCount()-journal.pageIndex):1}
  function renderPage(index){
    const view=projection(data.pages[index]);
    const article=document.createElement('article');
    article.className='living-journal-page';
    article.dataset.pageRef=view.pageRef;
    article.dataset.eventRef=view.eventRef;
    article.dataset.pageIndex=String(index);
    article.dataset.current=String(index===journal.pageIndex);
    if(index===journal.pageIndex)article.setAttribute('aria-current','page');
    const ordinal=document.createElement('small');ordinal.className='living-journal-ordinal';ordinal.textContent=`${String(view.sequence).padStart(2,'0')} · ${view.eventRef}`;
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
    const notes=journal.marginalia.get(currentPage().pageRef)??[];
    for(const note of notes){const item=document.createElement('p');item.className='living-journal-margin-note';item.dataset.localOnly='true';item.textContent=note.content;host.append(item);}
    host.dataset.noteCount=String(notes.length);
  }
  function scrollCurrentIntoView(){
    if(layoutClass()!=='PHONE_ONE_PAGE')return;
    const spread=q('#livingJournalSpread'),current=spread?.querySelector(`[data-page-index="${journal.pageIndex}"]`);
    if(!spread||!current)return;
    const left=current.offsetLeft-spread.offsetLeft;
    spread.scrollTo({left,behavior:reducedMotion()?'auto':'smooth'});
  }
  function render(){
    const root=q('#view-living-journal');if(!root)return snapshot();
    const spread=q('#livingJournalSpread'),status=q('#livingJournalPageStatus'),truth=q('#livingJournalTruth'),sourceStatus=q('#livingJournalSourceStatus');
    root.dataset.layoutClass=layoutClass();root.dataset.truthClass=data.truthClass;root.dataset.open=String(journal.open);
    if(truth)truth.textContent=t('living-journal.reference-label');
    if(status)status.textContent=t('living-journal.page-status',{current:journal.pageIndex+1,total:pageCount()});
    const prev=q('#livingJournalPrevious'),next=q('#livingJournalNext');if(prev)prev.disabled=journal.pageIndex===0;if(next)next.disabled=journal.pageIndex===pageCount()-1;
    const vantage=q('#livingJournalVantage');if(vantage)vantage.value=journal.vantage;
    const language=q('#livingJournalDisplayLanguage');if(language)language.value=journal.displayLanguage;
    if(spread){spread.replaceChildren(...renderedIndices().map(renderPage));spread.dataset.visiblePageCount=String(visiblePageCount());spread.dataset.renderedPageCount=String(renderedIndices().length);requestAnimationFrame(scrollCurrentIntoView);}
    if(sourceStatus){const page=currentPage();sourceStatus.textContent=journal.sourceDoorRef?`${t('living-journal.source-status')}: ${page.source.originalLanguage} · ${journal.sourceDoorRef} · ${page.source.originalText}`:'';}
    renderMarginalia();journal.renderCount+=1;return snapshot();
  }
  function open({selectedNodeRef=state.selectedNodeRef}={}){
    journal.open=true;journal.openedNodeRef=selectedNodeRef;journal.sourceDoorRef=null;journal.marginalia=new Map();journal.pageIndex=clampIndex(journal.pageIndex);render();return snapshot();
  }
  function close(){journal.open=false;journal.sourceDoorRef=null;journal.marginalia=new Map();renderMarginalia();return snapshot();}
  function setPage(index){const next=clampIndex(index);if(next===journal.pageIndex)return snapshot();journal.pageIndex=next;journal.sourceDoorRef=null;render();return snapshot();}
  const previous=()=>setPage(journal.pageIndex-1);
  const next=()=>setPage(journal.pageIndex+1);
  function selectVantage(value){if(!VANTAGES.includes(value))throw new Error(`Unsupported Living Journal vantage: ${value}`);journal.vantage=value;render();return snapshot();}
  function selectDisplayLanguage(value){if(!DISPLAY_LANGUAGES.includes(value))throw new Error(`Unsupported Living Journal display language: ${value}`);journal.displayLanguage=value;render();return snapshot();}
  function openSource(){const page=currentPage();journal.sourceDoorRef=page.source.sourceRef;render();onSourceOpen({sourceRef:page.source.sourceRef,eventRef:page.eventRef,selectedNodeRef:journal.openedNodeRef});return snapshot();}
  function revisit(){const page=currentPage();onRevisit({eventRef:page.eventRef,selectedNodeRef:journal.openedNodeRef});return snapshot();}
  function addMarginalia(content){const text=String(content??'').trim();if(!text)return snapshot();const pageRef=currentPage().pageRef,notes=journal.marginalia.get(pageRef)??[];notes.push(Object.freeze({marginaliaRef:`marginalia.local.${crypto.randomUUID()}`,pageRef,content:text,localOnly:true}));journal.marginalia.set(pageRef,notes);renderMarginalia();return snapshot();}
  function snapshot(){const page=currentPage();return structuredClone({truthClass:data.truthClass,open:journal.open,pageIndex:journal.pageIndex,pageRef:page.pageRef,eventRef:page.eventRef,pageCount:pageCount(),vantage:journal.vantage,displayLanguage:journal.displayLanguage,openedNodeRef:journal.openedNodeRef,sourceDoorRef:journal.sourceDoorRef,marginaliaCount:(journal.marginalia.get(page.pageRef)??[]).length,totalMarginaliaCount:[...journal.marginalia.values()].reduce((sum,notes)=>sum+notes.length,0),layoutClass:layoutClass(),visiblePageCount:visiblePageCount(),renderedPageRefs:renderedIndices().map((index)=>data.pages[index].pageRef),reducedMotion:reducedMotion(),realMemoryLoaded:data.realMemoryLoaded,realJournalBodyLoaded:data.realJournalBodyLoaded,modelCalled:data.modelCalled,translationCalled:data.translationCalled,networkCalled:data.networkCalled,persisted:data.persisted,published:data.published,canonicalThenIdentity:canonicalThenIdentity(),originalLanguage:page.source.originalLanguage,sourceRef:page.source.sourceRef,originalText:page.source.originalText,renderCount:journal.renderCount});}
  function bind(){
    q('#livingJournalPrevious')?.addEventListener('click',previous);q('#livingJournalNext')?.addEventListener('click',next);
    q('#livingJournalVantage')?.addEventListener('change',(event)=>selectVantage(event.currentTarget.value));
    q('#livingJournalDisplayLanguage')?.addEventListener('change',(event)=>selectDisplayLanguage(event.currentTarget.value));
    q('#livingJournalSource')?.addEventListener('click',openSource);q('#livingJournalRevisit')?.addEventListener('click',revisit);
    q('#livingJournalMarginaliaAdd')?.addEventListener('click',()=>{const input=q('#livingJournalMarginaliaInput');addMarginalia(input?.value);if(input)input.value='';});
    q('#view-living-journal')?.addEventListener('keydown',(event)=>{if(['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName))return;if(event.key==='ArrowLeft'){event.preventDefault();previous();}else if(event.key==='ArrowRight'){event.preventDefault();next();}});
    q('#livingJournalSpread')?.addEventListener('scroll',()=>{if(layoutClass()!=='PHONE_ONE_PAGE')return;clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{const spread=q('#livingJournalSpread'),pages=[...(spread?.querySelectorAll('.living-journal-page')??[])];if(!spread||!pages.length)return;const center=spread.scrollLeft+spread.clientWidth/2;let closest=pages[0],distance=Infinity;for(const page of pages){const pageCenter=page.offsetLeft-spread.offsetLeft+page.offsetWidth/2,nextDistance=Math.abs(pageCenter-center);if(nextDistance<distance){distance=nextDistance;closest=page;}}const index=Number(closest.dataset.pageIndex);if(Number.isInteger(index)&&index!==journal.pageIndex){journal.pageIndex=clampIndex(index);journal.sourceDoorRef=null;render();}},120);});
    globalThis.addEventListener('resize',()=>{if(journal.open)render();});
  }
  bind();
  return{open,close,render,snapshot,previous,next,setPage,selectVantage,selectDisplayLanguage,openSource,revisit,addMarginalia,canonicalThenIdentity};
}

// [VXG RealForever]
