import { createTransientPresentationController } from './transient-presentation-controller.js';

const VANTAGES=Object.freeze(['HUMAN','VEX','SHARED_RELATIONSHIP','SOURCE']);
const DISPLAY_LANGUAGES=Object.freeze(['en','ja','zh']);
const SYNTHETIC_TRUTH='CURRENT_SYNTHETIC_REFERENCE';
const MEMORY_TRUTH='CURRENT_MEMORY_REFERENCE';
const MEMORY_HELD_TRUTH='MEMORY_REFERENCE_HELD';
const MEMORY_TRUTHS=new Set([MEMORY_TRUTH,MEMORY_HELD_TRUTH]);
const MEMORY_SCHEMA='vexlife.living-journal.memory-projection/v1';
const ARCHIVE_SCHEMA='vexlife.living-journal.memory-archive/v1';
const ARCHIVE_TRUTH='COMMITTED_MEMORY_ARCHIVE';
const ARCHIVE_DAY_TRUTH='COMMITTED_MEMORY_AT_DAY';
const POSITIVE_CONSENT=new Set(['PERMITTED','NARROWED']);
const SHA256=/^[0-9a-f]{64}$/u;
const MEMORY_EFFECT_KEYS=Object.freeze(['homeMutated','memoryMutated','semanticAcceptanceCreated','firstPersonAuthorityGranted','modelCalled','translationCalled','networkCalled','trainingRan','modelWeightsChanged','publicationPerformed']);
const q=(selector)=>document.querySelector(selector);
const object=(value)=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const nonempty=(value)=>typeof value==='string'&&value.length>0;
const sameOrderedStrings=(left,right)=>Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((value,index)=>value===right[index]);

function assertSyntheticData(data){
  if(data?.truthClass!==SYNTHETIC_TRUTH||data.realMemoryLoaded||data.realJournalBodyLoaded||data.modelCalled||data.translationCalled||data.networkCalled||data.persisted||data.published||!Array.isArray(data.pages)||data.pages.length===0)throw new Error('Living Journal demo data boundary is invalid');
  for(const [index,page] of data.pages.entries())if(!object(page?.entry)||!nonempty(page.entry.title)||!nonempty(page.entry.occurredAt)||Number.isNaN(Date.parse(page.entry.occurredAt)))throw new Error(`Living Journal synthetic entry ${index} date/time/title grammar is invalid`);
  return data;
}

function assertMemoryPage(page,index){
  if(!object(page)||!nonempty(page.pageRef)||!nonempty(page.statementRef)||page.pageIndex!==index||!nonempty(page.summary)||!SHA256.test(page.summaryHash??''))throw new Error(`Living Journal Memory page ${index} identity/body is invalid`);
  if(Object.hasOwn(page,'eventRef')||Object.hasOwn(page,'thenRef')||Object.hasOwn(page,'display')||Object.hasOwn(page,'source'))throw new Error(`Living Journal Memory page ${index} cannot impersonate synthetic event/temporal/source-body semantics`);
  if(page.current!==true||page.acceptedForContinuity!==true||!POSITIVE_CONSENT.has(page.consentState))throw new Error(`Living Journal Memory page ${index} current acceptance state is invalid`);
  if(!nonempty(page.currentDailyStratumRef)||!SHA256.test(page.currentDailyStratumSha256??'')||!nonempty(page.dayRef)||!Number.isInteger(page.dayIndex)||page.dayIndex<0)throw new Error(`Living Journal Memory page ${index} Daily identity is invalid`);
  for(const key of ['semanticAcceptanceSha256','semanticAuthorityHeadSha256','sourceConversationHeadSha256','sourceScoreHeadSha256','sourceSemanticAuthorityHeadSha256'])if(!SHA256.test(page[key]??''))throw new Error(`Living Journal Memory page ${index} ${key} is invalid`);
  if(!Array.isArray(page.sourceBindings)||page.sourceBindings.length===0||page.sourceBindings.some((binding)=>!object(binding)||!nonempty(binding.eventRef)||!SHA256.test(binding.eventHash??'')))throw new Error(`Living Journal Memory page ${index} source bindings are invalid`);
  const sourceRefs=page.sourceBindings.map((binding)=>binding.eventRef);
  if(new Set(sourceRefs).size!==sourceRefs.length)throw new Error(`Living Journal Memory page ${index} source bindings contain duplicate event refs`);
  if(!object(page.sourceDescent)||page.sourceDescent.rawSourceContentIncluded!==false||page.rawSourceContentIncluded!==false||page.firstPersonAuthorityGranted!==false)throw new Error(`Living Journal Memory page ${index} source-content boundary is invalid`);
  if(page.sourceDescent.observedCurrentConversationHeadSha256!==page.sourceConversationHeadSha256)throw new Error(`Living Journal Memory page ${index} source-descent conversation frontier is inconsistent`);
  if(!sameOrderedStrings(page.sourceDescent.observedCommittedSourceEventRefs,sourceRefs))throw new Error(`Living Journal Memory page ${index} source-descent event refs are inconsistent`);
  return page;
}

function assertMemoryData(data){
  if(!object(data)||data.schemaVersion!==MEMORY_SCHEMA||!MEMORY_TRUTHS.has(data.truthClass)||data.rawConversationContentIncluded!==false||!Array.isArray(data.pages))throw new Error('Living Journal Memory projection boundary is invalid');
  const current=data.truthClass===MEMORY_TRUTH&&data.currentness==='CURRENT'&&data.state==='CURRENT'&&data.realMemoryLoaded===true;
  const held=data.truthClass===MEMORY_HELD_TRUTH&&data.currentness==='HELD'&&data.state==='HELD'&&data.realMemoryLoaded===false;
  if(!current&&!held)throw new Error('Living Journal Memory projection truth/currentness state is invalid');
  if(current&&(data.realJournalBodyLoaded!==(data.pages.length>0)||data.pageCount!==data.pages.length))throw new Error('Living Journal Memory projection page/body state is invalid');
  if(held&&(data.realJournalBodyLoaded!==false||data.pageCount!==0||data.pages.length!==0))throw new Error('Living Journal held Memory projection must remain content-absent');
  if(!object(data.effects))throw new Error('Living Journal Memory projection must carry the explicit zero-effect ledger');
  const observedEffectKeys=Object.keys(data.effects).sort(),expectedEffectKeys=[...MEMORY_EFFECT_KEYS].sort();
  if(!sameOrderedStrings(observedEffectKeys,expectedEffectKeys)||MEMORY_EFFECT_KEYS.some((key)=>data.effects[key]!==false))throw new Error('Living Journal Memory projection must carry the complete explicit zero-effect ledger');
  data.pages.forEach(assertMemoryPage);
  return data;
}

function assertArchivePage(page,index){
  if(!object(page)||!nonempty(page.pageRef)||!nonempty(page.statementRef)||page.pageIndex!==index||!nonempty(page.summary)||!SHA256.test(page.summaryHash??''))throw new Error(`Living Journal archive page ${index} identity/body is invalid`);
  if(page.temporalTruthClass!==ARCHIVE_DAY_TRUTH||page.currentNowEvaluated!==false||page.rawSourceContentIncluded!==false||page.firstPersonAuthorityGranted!==false)throw new Error(`Living Journal archive page ${index} temporal/source boundary is invalid`);
  for(const key of ['semanticAcceptanceSha256','semanticAuthorityHeadSha256AtDay','sourceConversationHeadSha256AtDay','sourceScoreHeadSha256AtDay','sourceSemanticAuthorityHeadSha256AtDay','dailyStratumSha256'])if(!SHA256.test(page[key]??''))throw new Error(`Living Journal archive page ${index} ${key} is invalid`);
  if(!nonempty(page.dailyStratumRef)||!nonempty(page.dayRef)||!Number.isInteger(page.dayIndex)||page.dayIndex<0)throw new Error(`Living Journal archive page ${index} Daily identity is invalid`);
  if(!Array.isArray(page.sourceBindings)||page.sourceBindings.length===0||page.sourceBindings.some((binding)=>!object(binding)||!nonempty(binding.eventRef)||!SHA256.test(binding.eventHash??'')))throw new Error(`Living Journal archive page ${index} source bindings are invalid`);
  const sourceRefs=page.sourceBindings.map((binding)=>binding.eventRef);if(new Set(sourceRefs).size!==sourceRefs.length)throw new Error(`Living Journal archive page ${index} source bindings contain duplicate event refs`);
  return page;
}
function assertArchiveDay(day,label){
  if(!object(day)||!nonempty(day.archiveDayRef)||!nonempty(day.dayRef)||!Number.isInteger(day.dayIndex)||day.dayIndex<0||!nonempty(day.calendarDateRef)||!nonempty(day.timeZoneRef)||!nonempty(day.observedAt)||!nonempty(day.dailyStratumRef)||!nonempty(day.dailyDreamHeadRef))throw new Error(`Living Journal archive day ${label} identity is invalid`);
  for(const key of ['dailyStratumSha256','dailyDreamHeadSha256','sourceConversationHeadSha256','sourceScoreHeadSha256','sourceSemanticAuthorityHeadSha256'])if(!SHA256.test(day[key]??''))throw new Error(`Living Journal archive day ${label} ${key} is invalid`);
  if(typeof day.isLatestCommittedDay!=='boolean'||day.temporalTruthClass!==ARCHIVE_DAY_TRUTH||day.currentNowEvaluated!==false)throw new Error(`Living Journal archive day ${label} temporal/currentness state is invalid`);
  return day;
}
function assertUniqueStrings(values,label){if(!Array.isArray(values)||values.some((value)=>!nonempty(value))||new Set(values).size!==values.length)throw new Error(`Living Journal archive ${label} must be unique non-empty strings`);}
function assertArchiveData(data){
  if(!object(data)||data.schemaVersion!==ARCHIVE_SCHEMA||data.truthClass!==ARCHIVE_TRUTH||data.state!=='CURRENT'||data.currentness!=='CURRENT'||data.rawConversationContentIncluded!==false||!Array.isArray(data.days)||!object(data.effects))throw new Error('Living Journal archive projection boundary is invalid');
  if(!Number.isSafeInteger(data.totalCommittedDays)||data.totalCommittedDays<0||data.newestFirst!==true||!Number.isSafeInteger(data.maxDays)||data.maxDays<1||data.maxDays>100||!Number.isSafeInteger(data.dayOffset)||data.dayOffset<0||data.dayOffset>1000000||!Number.isSafeInteger(data.uncommittedTailCount)||data.uncommittedTailCount<0||data.days.length>data.maxDays)throw new Error('Living Journal archive pagination shape is invalid');
  const expectedNext=data.dayOffset+data.days.length<data.totalCommittedDays?data.dayOffset+data.days.length:null;if(data.nextDayOffset!==expectedNext)throw new Error('Living Journal archive next-day pagination binding is invalid');
  if(data.latestCommittedDailyStratumSha256!==null&&!SHA256.test(data.latestCommittedDailyStratumSha256??''))throw new Error('Living Journal archive latest committed SHA is invalid');
  const observedEffectKeys=Object.keys(data.effects).sort(),expectedEffectKeys=[...MEMORY_EFFECT_KEYS].sort();
  if(!sameOrderedStrings(observedEffectKeys,expectedEffectKeys)||MEMORY_EFFECT_KEYS.some((key)=>data.effects[key]!==false))throw new Error('Living Journal archive must carry the complete explicit zero-effect ledger');
  const dayKeys={archiveDayRef:new Set(),dayRef:new Set(),dayIndex:new Set(),dailyStratumSha256:new Set()};let previousDayIndex=null;
  data.days.forEach((day,index)=>{assertArchiveDay(day,index);for(const key of Object.keys(dayKeys)){if(dayKeys[key].has(day[key]))throw new Error(`Living Journal archive days contain duplicate ${key}`);dayKeys[key].add(day[key]);}if(previousDayIndex!==null&&previousDayIndex<=day.dayIndex)throw new Error('Living Journal archive days must remain newest-first by dayIndex');previousDayIndex=day.dayIndex;if(day.isLatestCommittedDay!==(day.dailyStratumSha256===data.latestCommittedDailyStratumSha256))throw new Error('Living Journal archive latest-day flag is inconsistent');});
  if(data.selectedDay!==null){const selected=assertArchiveDay(data.selectedDay,'selected');if(selected.rawConversationContentIncluded!==false||!Array.isArray(selected.pages)||!object(selected.sourceDescent)||selected.sourceDescent.rawConversationContentIncluded!==false||selected.sourceDescent.historicalSourceVerificationState!=='VERIFIED'||selected.sourceSnapshotState!=='VERIFIED'||selected.sourceSnapshotCurrentness!=='HISTORICAL_SOURCE_VERIFIED'||!Number.isSafeInteger(selected.maxPages)||selected.maxPages<1||selected.maxPages>100||selected.pageCount!==selected.pages.length||selected.pages.length>selected.maxPages)throw new Error('Living Journal selected historical day boundary is invalid');
    if(selected.sourceDescent.sourceConversationHeadSha256!==selected.sourceConversationHeadSha256||selected.sourceDescent.sourceScoreHeadSha256!==selected.sourceScoreHeadSha256||selected.sourceDescent.sourceSemanticAuthorityHeadSha256!==selected.sourceSemanticAuthorityHeadSha256)throw new Error('Living Journal selected day source-descent frontier is inconsistent');
    assertUniqueStrings(selected.heldOrDeferredStatementRefs,'held/deferred statement refs');assertUniqueStrings(selected.boundedOutStatementRefs,'bounded-out statement refs');const pageRefs=new Set(),statementRefs=new Set();selected.pages.forEach((page,index)=>{assertArchivePage(page,index);if(pageRefs.has(page.pageRef)||statementRefs.has(page.statementRef))throw new Error('Living Journal selected historical pages contain duplicate identity');pageRefs.add(page.pageRef);statementRefs.add(page.statementRef);if(page.dailyStratumRef!==selected.dailyStratumRef||page.dailyStratumSha256!==selected.dailyStratumSha256||page.dayRef!==selected.dayRef||page.dayIndex!==selected.dayIndex||page.sourceConversationHeadSha256AtDay!==selected.sourceConversationHeadSha256||page.sourceScoreHeadSha256AtDay!==selected.sourceScoreHeadSha256||page.sourceSemanticAuthorityHeadSha256AtDay!==selected.sourceSemanticAuthorityHeadSha256)throw new Error(`Living Journal archive page ${index} is not cross-bound to its selected day`);});}
  return data;
}
function assertData(data){
  if(data?.truthClass===SYNTHETIC_TRUTH)return assertSyntheticData(data);
  if(MEMORY_TRUTHS.has(data?.truthClass))return assertMemoryData(data);
  if(data?.truthClass===ARCHIVE_TRUTH)return assertArchiveData(data);
  throw new Error('Living Journal data truth class is not admitted');
}

export function createLivingJournalController({state,data,t,navigation,onSourceOpen=()=>{},onRevisit=()=>{}}){
  let journalData=assertData(data);
  const initialData=journalData;
  const ORIGINAL_LANGUAGE_MODE='ORIGINAL';
  const PHONE_MAX_INLINE=760;
  const WIDE_READER_MIN_INLINE=1280;
  const COMPACT_ENTRY_WINDOW_TARGET=8;
  const DEFAULT_ENTRY_WINDOW_TARGET=10;
  const WIDE_ENTRY_WINDOW_TARGET=12;
  const journal={open:false,pageIndex:0,windowStart:0,vantage:'HUMAN',displayLanguage:ORIGINAL_LANGUAGE_MODE,openedNodeRef:null,sourceDoorRef:null,sourceDoorRefs:[],lastSourcePacket:null,lastRevisitPacket:null,marginalia:new Map(),renderCount:0};
  let optionsPresentation=null;
  const memoryMode=()=>MEMORY_TRUTHS.has(journalData.truthClass);
  const archiveMode=()=>journalData.truthClass===ARCHIVE_TRUTH;
  const sourceBoundMode=()=>memoryMode()||archiveMode();
  const dataMode=()=>journalData.truthClass===MEMORY_HELD_TRUTH?'MEMORY_HELD':archiveMode()?'ARCHIVE':memoryMode()?'MEMORY':'SYNTHETIC';
  const pageList=()=>archiveMode()?(journalData.selectedDay?.pages??[]):journalData.pages;
  const pageCount=()=>pageList().length;
  const journalInlineSize=()=>{const measured=Number(q('#view-living-journal')?.clientWidth??0);return measured>0?measured:Math.max(0,Number(globalThis.innerWidth)||0);};
  const layoutClass=()=>journalInlineSize()<=PHONE_MAX_INLINE?'COMPACT_READER':'ENTRY_READER';
  const readerWindowTarget=()=>journalInlineSize()<=PHONE_MAX_INLINE?COMPACT_ENTRY_WINDOW_TARGET:journalInlineSize()>=WIDE_READER_MIN_INLINE?WIDE_ENTRY_WINDOW_TARGET:DEFAULT_ENTRY_WINDOW_TARGET;
  const readerWindowSize=()=>pageCount()===0?0:Math.min(pageCount(),readerWindowTarget());
  const reducedMotion=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  const clampIndex=(index)=>pageCount()===0?0:Math.max(0,Math.min(pageCount()-1,Number(index)||0));
  const currentPage=()=>pageCount()===0?null:pageList()[journal.pageIndex]??null;
  const sourceRefsFor=(page)=>sourceBoundMode()?[...new Set((page?.sourceBindings??[]).map((binding)=>binding.eventRef).filter(nonempty))]:page?.source?.sourceRef?[page.source.sourceRef]:[];
  const memoryCurrentnessFor=(page)=>page?Object.freeze({currentDailyStratumRef:page.currentDailyStratumRef,currentDailyStratumSha256:page.currentDailyStratumSha256,dayRef:page.dayRef,dayIndex:page.dayIndex,sourceConversationHeadSha256:page.sourceConversationHeadSha256,sourceScoreHeadSha256:page.sourceScoreHeadSha256,sourceSemanticAuthorityHeadSha256:page.sourceSemanticAuthorityHeadSha256}):null;
  const canonicalThenIdentity=()=>archiveMode()
    ?JSON.stringify(pageList().map((page)=>({pageRef:page.pageRef,statementRef:page.statementRef,summaryHash:page.summaryHash,dailyStratumSha256:page.dailyStratumSha256,sourceConversationHeadSha256AtDay:page.sourceConversationHeadSha256AtDay,sourceScoreHeadSha256AtDay:page.sourceScoreHeadSha256AtDay,sourceSemanticAuthorityHeadSha256AtDay:page.sourceSemanticAuthorityHeadSha256AtDay})))
    :memoryMode()?JSON.stringify(journalData.pages.map((page)=>({pageRef:page.pageRef,statementRef:page.statementRef,summaryHash:page.summaryHash,currentDailyStratumSha256:page.currentDailyStratumSha256,sourceConversationHeadSha256:page.sourceConversationHeadSha256,sourceScoreHeadSha256:page.sourceScoreHeadSha256,sourceSemanticAuthorityHeadSha256:page.sourceSemanticAuthorityHeadSha256})))
    :JSON.stringify(journalData.pages.map((page)=>({pageRef:page.pageRef,eventRef:page.eventRef,thenRef:page.thenRef,sourceRef:page.source.sourceRef,originalLanguage:page.source.originalLanguage,originalText:page.source.originalText})));
  function projection(page){
    if(archiveMode())return{mode:'ARCHIVE',pageRef:page.pageRef,statementRef:page.statementRef,summary:page.summary,entryTitle:page.summary,entryDate:journalData.selectedDay?.calendarDateRef??null,entryTimestamp:journalData.selectedDay?.observedAt??null,summaryHash:page.summaryHash,sourceRefs:sourceRefsFor(page),dailyStratumRef:page.dailyStratumRef,dailyStratumSha256:page.dailyStratumSha256,dayRef:page.dayRef,dayIndex:page.dayIndex,sourceConversationHeadSha256AtDay:page.sourceConversationHeadSha256AtDay,sourceScoreHeadSha256AtDay:page.sourceScoreHeadSha256AtDay,sourceSemanticAuthorityHeadSha256AtDay:page.sourceSemanticAuthorityHeadSha256AtDay,temporalTruthClass:page.temporalTruthClass,currentNowEvaluated:page.currentNowEvaluated,sourceDescent:journalData.selectedDay?.sourceDescent};
    if(memoryMode())return{mode:'MEMORY',pageRef:page.pageRef,statementRef:page.statementRef,summary:page.summary,entryTitle:page.summary,entryDate:null,entryTimestamp:null,summaryHash:page.summaryHash,current:page.current,acceptedForContinuity:page.acceptedForContinuity,consentState:page.consentState,...memoryCurrentnessFor(page),sourceRefs:sourceRefsFor(page),sourceDescent:page.sourceDescent};
    const language=journal.displayLanguage===ORIGINAL_LANGUAGE_MODE?(DISPLAY_LANGUAGES.includes(page.source.originalLanguage)?page.source.originalLanguage:'en'):(DISPLAY_LANGUAGES.includes(journal.displayLanguage)?journal.displayLanguage:'en');
    const localized=page.display[language]??page.display.en;
    return{mode:'SYNTHETIC',pageRef:page.pageRef,eventRef:page.eventRef,sequence:page.sequence,entryTitle:page.entry.title,entryDate:page.entry.occurredAt.slice(0,10),entryTimestamp:page.entry.occurredAt,source:page.source,thenRef:page.thenRef,then:localized.then,later:localized.later,now:localized.now,vantage:journal.vantage,vantageText:localized.vantages[journal.vantage],displayLanguage:language};
  }
  function normalizeWindow(){
    if(pageCount()===0){journal.pageIndex=0;journal.windowStart=0;return;}
    journal.pageIndex=clampIndex(journal.pageIndex);
    const size=Math.max(1,readerWindowSize()),maxStart=Math.floor((pageCount()-1)/size)*size;
    journal.windowStart=Math.max(0,Math.min(maxStart,Number(journal.windowStart)||0));
    if(journal.pageIndex<journal.windowStart||journal.pageIndex>=journal.windowStart+size)journal.windowStart=Math.floor(journal.pageIndex/size)*size;
  }
  function renderedIndices(){
    normalizeWindow();
    const size=readerWindowSize(),count=Math.max(0,Math.min(size,pageCount()-journal.windowStart));
    return Array.from({length:count},(_,offset)=>journal.windowStart+offset);
  }
  function visiblePageCount(){return renderedIndices().length;}
  function renderPage(index){
    const view=projection(pageList()[index]);
    const article=document.createElement('article');
    article.className='living-journal-page living-journal-entry';
    article.tabIndex=0;
    article.dataset.pageRef=view.pageRef;
    article.dataset.pageIndex=String(index);
    article.dataset.current=String(index===journal.pageIndex);
    article.dataset.truthClass=journalData.truthClass;
    if(view.eventRef)article.dataset.eventRef=view.eventRef;
    if(view.statementRef)article.dataset.statementRef=view.statementRef;
    if(index===journal.pageIndex)article.setAttribute('aria-current','true');
    if(view.mode==='MEMORY'){
      article.dataset.currentDailyStratumRef=view.currentDailyStratumRef;
      article.dataset.currentDailyStratumSha256=view.currentDailyStratumSha256;
      article.dataset.dayRef=view.dayRef;
      article.dataset.dayIndex=String(view.dayIndex);
      article.dataset.sourceConversationHeadSha256=view.sourceConversationHeadSha256;
      article.dataset.sourceScoreHeadSha256=view.sourceScoreHeadSha256;
      article.dataset.sourceSemanticAuthorityHeadSha256=view.sourceSemanticAuthorityHeadSha256;
    }
    if(view.mode==='ARCHIVE'){
      article.dataset.dailyStratumRef=view.dailyStratumRef;
      article.dataset.dailyStratumSha256=view.dailyStratumSha256;
      article.dataset.dayRef=view.dayRef;
      article.dataset.dayIndex=String(view.dayIndex);
      article.dataset.temporalTruthClass=view.temporalTruthClass;
      article.dataset.currentNowEvaluated='false';
    }
    const header=document.createElement('header');
    header.className='living-journal-entry-header';
    const stamp=document.createElement('div');
    stamp.className='living-journal-entry-stamp';
    const date=document.createElement('span');
    date.className='living-journal-entry-date';
    date.textContent=view.entryDate??(view.mode==='MEMORY'?'Current day':'Date unavailable');
    const clock=view.entryTimestamp?document.createElement('time'):document.createElement('span');
    clock.className='living-journal-entry-time';
    clock.textContent=view.entryTimestamp?view.entryTimestamp.slice(11,16):'Time unavailable';
    if(view.entryTimestamp)clock.dateTime=view.entryTimestamp;
    const title=document.createElement('h2');
    title.className='living-journal-entry-title';
    title.textContent=view.entryTitle;
    stamp.append(date,clock);header.append(stamp,title);article.append(header);
    const detail=document.createElement('details');
    detail.className='living-journal-entry-detail';
    const detailSummary=document.createElement('summary');
    detailSummary.textContent=view.mode==='SYNTHETIC'?'Entry detail':'Source detail';
    const body=document.createElement('div');
    body.className='living-journal-entry-detail-body';
    if(view.mode==='SYNTHETIC'){
      const timeSection=(kind,text,currentness=null)=>{const section=document.createElement('section');section.className=`living-journal-time ${kind}`;section.dataset.temporalClass=kind.toUpperCase();if(currentness)section.dataset.currentness=currentness;const label=document.createElement('strong');label.textContent=t(`living-journal.${kind}`);const p=document.createElement('p');p.textContent=text;section.append(label,p);return section;};
      const vantage=document.createElement('blockquote');vantage.className='living-journal-vantage';vantage.dataset.vantage=view.vantage;vantage.textContent=view.vantageText;
      const source=document.createElement('footer');source.className='living-journal-source-line';source.textContent=`${t('living-journal.original-language')}: ${view.source.originalLanguage} · ${view.source.sourceRef}`;
      body.append(timeSection('then',view.then),vantage,timeSection('later',view.later),timeSection('now',view.now,'DERIVED_CURRENT'),source);
    }else{
      const summary=document.createElement('section');summary.className='living-journal-time living-journal-memory-summary';if(view.mode==='ARCHIVE'){summary.dataset.memoryState='HISTORICAL_COMMITTED';summary.dataset.temporalTruthClass=ARCHIVE_DAY_TRUTH;summary.dataset.currentNowEvaluated='false';}else summary.dataset.memoryState='CURRENT_ACCEPTED';
      const text=document.createElement('p');text.textContent=view.summary;summary.append(text);
      const source=document.createElement('footer');source.className='living-journal-source-line';source.dataset.rawSourceContentIncluded='false';source.textContent=`${t('living-journal.source-status')}: ${view.sourceRefs.join(' · ')}`;
      body.append(summary,source);
    }
    detail.append(detailSummary,body);article.append(detail);
    article.addEventListener('click',(event)=>{if(event.target.closest('button,select,textarea,input,a,summary,details'))return;setPage(index);});
    article.addEventListener('keydown',(event)=>{if(event.target!==article||!['Enter',' '].includes(event.key))return;event.preventDefault();setPage(index);});
    return article;
  }
  function renderMarginalia(){
    const host=q('#livingJournalMarginaliaList');if(!host)return;
    host.replaceChildren();
    const page=currentPage(),notes=page?(journal.marginalia.get(page.pageRef)??[]):[];
    for(const note of notes){const item=document.createElement('p');item.className='living-journal-margin-note';item.dataset.localOnly='true';item.textContent=note.content;host.append(item);}
    host.dataset.noteCount=String(notes.length);
  }
  function render(){
    const root=q('#view-living-journal');if(!root)return snapshot();
    normalizeWindow();
    const spread=q('#livingJournalSpread'),status=q('#livingJournalPageStatus'),truth=q('#livingJournalTruth'),sourceStatus=q('#livingJournalSourceStatus');
    const layout=layoutClass(),inlineSize=journalInlineSize();root.dataset.layoutClass=layout;root.dataset.availableInlineSize=String(Math.round(inlineSize));root.dataset.truthClass=journalData.truthClass;root.dataset.dataMode=dataMode();root.dataset.open=String(journal.open);root.dataset.readerScrollOwner='livingJournalSpread';
    if(truth)truth.textContent=archiveMode()?t('living-journal.archive.historical-status',{date:journalData.selectedDay?.calendarDateRef??''}):memoryMode()?journalData.truthClass:t('living-journal.reference-label');
    const indices=renderedIndices(),end=indices.length?indices.at(-1)+1:0;
    if(status)status.textContent=pageCount()?`${journal.windowStart+1}–${end} of ${pageCount()} entries`:'No entries';
    const prev=q('#livingJournalPrevious'),next=q('#livingJournalNext');if(prev)prev.disabled=journal.windowStart===0;if(next)next.disabled=end>=pageCount();
    const vantage=q('#livingJournalVantage');if(vantage){vantage.value=journal.vantage;vantage.disabled=sourceBoundMode();vantage.setAttribute('aria-disabled',String(sourceBoundMode()));}
    const language=q('#livingJournalDisplayLanguage');if(language){language.value=journal.displayLanguage;language.disabled=sourceBoundMode();language.setAttribute('aria-disabled',String(sourceBoundMode()));}
    if(spread){spread.replaceChildren(...indices.map((index)=>renderPage(index)));spread.dataset.visiblePageCount=String(indices.length);spread.dataset.renderedPageCount=String(indices.length);spread.dataset.windowStart=String(journal.windowStart);spread.dataset.windowTarget=String(readerWindowTarget());}
    if(sourceStatus){const page=currentPage();if(!page||!journal.sourceDoorRef)sourceStatus.textContent='';else if(sourceBoundMode())sourceStatus.textContent=`${t('living-journal.source-status')}: ${journal.sourceDoorRefs.join(' · ')}`;else sourceStatus.textContent=`${t('living-journal.source-status')}: ${page.source.originalLanguage} · ${journal.sourceDoorRef} · ${page.source.originalText}`;}
    q('#livingJournalOptionsOpen')?.setAttribute('aria-expanded',String(optionsPresentation?.snapshot().open===true));
    renderMarginalia();journal.renderCount+=1;return snapshot();
  }
  function setMarginaliaExpanded(expanded){const panel=q('#livingJournalMarginalia');if(panel)panel.open=Boolean(expanded);}
  function setToolsExpanded(expanded){const panel=q('#livingJournalTools');if(!panel)return;if(optionsPresentation){expanded?optionsPresentation.show({focus:false}):optionsPresentation.dismiss('JOURNAL_STATE_RESET',{restore:false});}else{panel.hidden=!Boolean(expanded);panel.setAttribute('aria-hidden',String(!expanded));}}
  function resetLocalProjectionState(){journal.pageIndex=0;journal.windowStart=0;journal.vantage='HUMAN';journal.displayLanguage=ORIGINAL_LANGUAGE_MODE;journal.sourceDoorRef=null;journal.sourceDoorRefs=[];journal.lastSourcePacket=null;journal.lastRevisitPacket=null;journal.marginalia=new Map();setMarginaliaExpanded(false);setToolsExpanded(false);}
  function setData(nextData){assertData(nextData);journalData=nextData;resetLocalProjectionState();if(journal.open)render();return snapshot();}
  function restoreInitialData(){return setData(initialData);}
  function open({selectedNodeRef=state.selectedNodeRef}={}){
    journal.open=true;journal.openedNodeRef=selectedNodeRef;journal.sourceDoorRef=null;journal.sourceDoorRefs=[];journal.lastSourcePacket=null;journal.lastRevisitPacket=null;journal.marginalia=new Map();journal.pageIndex=clampIndex(journal.pageIndex);journal.windowStart=0;setMarginaliaExpanded(false);setToolsExpanded(false);render();return snapshot();
  }
  function close(){journal.open=false;journal.sourceDoorRef=null;journal.sourceDoorRefs=[];journal.marginalia=new Map();setMarginaliaExpanded(false);setToolsExpanded(false);renderMarginalia();return snapshot();}
  function setPage(index){if(pageCount()===0)return snapshot();const next=clampIndex(index),size=Math.max(1,readerWindowSize());journal.pageIndex=next;if(next<journal.windowStart||next>=journal.windowStart+size)journal.windowStart=Math.floor(next/size)*size;journal.sourceDoorRef=null;journal.sourceDoorRefs=[];render();return snapshot();}
  const previous=()=>setPage(journal.pageIndex-1);
  const next=()=>setPage(journal.pageIndex+1);
  function loadPrevious(){const size=Math.max(1,readerWindowSize());if(journal.windowStart===0)return snapshot();journal.windowStart=Math.max(0,journal.windowStart-size);journal.pageIndex=journal.windowStart;journal.sourceDoorRef=null;journal.sourceDoorRefs=[];render();return snapshot();}
  function loadMore(){const size=Math.max(1,readerWindowSize()),maxStart=Math.floor(Math.max(0,pageCount()-1)/size)*size;if(journal.windowStart>=maxStart)return snapshot();journal.windowStart=Math.min(maxStart,journal.windowStart+size);journal.pageIndex=journal.windowStart;journal.sourceDoorRef=null;journal.sourceDoorRefs=[];render();return snapshot();}
  function selectVantage(value){if(sourceBoundMode())throw new Error('Living Journal source-bound projection has no admitted vantage-text projection');if(!VANTAGES.includes(value))throw new Error(`Unsupported Living Journal vantage: ${value}`);journal.vantage=value;render();return snapshot();}
  function selectDisplayLanguage(value){if(sourceBoundMode())throw new Error('Living Journal source-bound projection has no admitted display-language projection');if(value!==ORIGINAL_LANGUAGE_MODE&&!DISPLAY_LANGUAGES.includes(value))throw new Error(`Unsupported Living Journal display language: ${value}`);journal.displayLanguage=value;render();return snapshot();}
  function openSource(){
    const page=currentPage();if(!page)return snapshot();
    if(sourceBoundMode()){
      journal.sourceDoorRef=page.pageRef;journal.sourceDoorRefs=sourceRefsFor(page);
      const packet=archiveMode()?Object.freeze({pageRef:page.pageRef,statementRef:page.statementRef,sourceRef:null,sourceRefs:[...journal.sourceDoorRefs],sourceDescent:structuredClone(journalData.selectedDay?.sourceDescent),dailyStratumRef:page.dailyStratumRef,dailyStratumSha256:page.dailyStratumSha256,dayRef:page.dayRef,dayIndex:page.dayIndex,temporalTruthClass:ARCHIVE_DAY_TRUTH,currentNowEvaluated:false,selectedNodeRef:journal.openedNodeRef}):Object.freeze({pageRef:page.pageRef,statementRef:page.statementRef,sourceRef:null,sourceRefs:[...journal.sourceDoorRefs],sourceDescent:structuredClone(page.sourceDescent),...memoryCurrentnessFor(page),selectedNodeRef:journal.openedNodeRef});
      journal.lastSourcePacket=structuredClone(packet);render();onSourceOpen(packet);return snapshot();
    }
    journal.sourceDoorRef=page.source.sourceRef;journal.sourceDoorRefs=[page.source.sourceRef];
    const packet=Object.freeze({sourceRef:page.source.sourceRef,eventRef:page.eventRef,selectedNodeRef:journal.openedNodeRef});journal.lastSourcePacket=structuredClone(packet);render();onSourceOpen(packet);return snapshot();
  }
  function revisit(){
    const page=currentPage();if(!page)return snapshot();
    const packet=archiveMode()?Object.freeze({pageRef:page.pageRef,statementRef:page.statementRef,dailyStratumRef:page.dailyStratumRef,dailyStratumSha256:page.dailyStratumSha256,dayRef:page.dayRef,dayIndex:page.dayIndex,temporalTruthClass:ARCHIVE_DAY_TRUTH,currentNowEvaluated:false,selectedNodeRef:journal.openedNodeRef}):memoryMode()?Object.freeze({pageRef:page.pageRef,statementRef:page.statementRef,...memoryCurrentnessFor(page),selectedNodeRef:journal.openedNodeRef}):Object.freeze({eventRef:page.eventRef,selectedNodeRef:journal.openedNodeRef});
    journal.lastRevisitPacket=structuredClone(packet);onRevisit(packet);return snapshot();
  }
  function addMarginalia(content){const page=currentPage();if(!page)return snapshot();const text=String(content??'').trim();if(!text)return snapshot();const pageRef=page.pageRef,notes=journal.marginalia.get(pageRef)??[];notes.push(Object.freeze({marginaliaRef:`marginalia.local.${crypto.randomUUID()}`,pageRef,content:text,localOnly:true}));journal.marginalia.set(pageRef,notes);setMarginaliaExpanded(true);renderMarginalia();return snapshot();}
  function snapshot(){
    const page=currentPage(),synthetic=!sourceBoundMode()&&page;
    const effectSource=sourceBoundMode()?journalData.effects:{};
    const currentness=memoryMode()&&page?memoryCurrentnessFor(page):null;
    const projected=page?projection(page):null;
    return structuredClone({truthClass:journalData.truthClass,dataMode:dataMode(),open:journal.open,pageIndex:journal.pageIndex,pageRef:page?.pageRef??null,eventRef:synthetic?page.eventRef:null,statementRef:sourceBoundMode()&&page?page.statementRef:null,pageCount:pageCount(),entryTitle:projected?.entryTitle??null,entryDate:projected?.entryDate??null,entryTimestamp:projected?.entryTimestamp??null,vantage:journal.vantage,displayLanguage:journal.displayLanguage,resolvedDisplayLanguage:projected?.displayLanguage??null,availableInlineSize:journalInlineSize(),vantageProjectionAvailable:!sourceBoundMode(),displayLanguageProjectionAvailable:!sourceBoundMode(),openedNodeRef:journal.openedNodeRef,sourceDoorRef:journal.sourceDoorRef,sourceDoorRefs:[...journal.sourceDoorRefs],lastSourcePacket:journal.lastSourcePacket,lastRevisitPacket:journal.lastRevisitPacket,marginaliaCount:page?(journal.marginalia.get(page.pageRef)??[]).length:0,totalMarginaliaCount:[...journal.marginalia.values()].reduce((sum,notes)=>sum+notes.length,0),layoutClass:layoutClass(),visiblePageCount:visiblePageCount(),renderedPageRefs:renderedIndices().map((index)=>pageList()[index].pageRef),renderedEntryRefs:renderedIndices().map((index)=>pageList()[index].pageRef),readerWindowTarget:readerWindowTarget(),readerWindowStart:journal.windowStart,hasMoreHistory:renderedIndices().length>0&&renderedIndices().at(-1)+1<pageCount(),hasNewerEntries:journal.windowStart>0,readerScrollOwner:'livingJournalSpread',reducedMotion:reducedMotion(),realMemoryLoaded:journalData.realMemoryLoaded,realJournalBodyLoaded:journalData.realJournalBodyLoaded,modelCalled:sourceBoundMode()?effectSource.modelCalled===true:journalData.modelCalled,translationCalled:sourceBoundMode()?effectSource.translationCalled===true:journalData.translationCalled,networkCalled:sourceBoundMode()?effectSource.networkCalled===true:journalData.networkCalled,persisted:sourceBoundMode()?effectSource.homeMutated===true||effectSource.memoryMutated===true:journalData.persisted,published:sourceBoundMode()?effectSource.publicationPerformed===true:journalData.published,canonicalThenIdentity:canonicalThenIdentity(),originalLanguage:synthetic?page.source.originalLanguage:null,sourceRef:synthetic?page.source.sourceRef:null,originalText:synthetic?page.source.originalText:null,summary:sourceBoundMode()&&page?page.summary:null,summaryHash:sourceBoundMode()&&page?page.summaryHash:null,archiveTotalCommittedDays:archiveMode()?journalData.totalCommittedDays:null,archiveDayOffset:archiveMode()?journalData.dayOffset:null,archiveNextDayOffset:archiveMode()?journalData.nextDayOffset:null,archiveDays:archiveMode()?structuredClone(journalData.days):[],archiveSelectedDayRef:archiveMode()?journalData.selectedDay?.dayRef??null:null,archiveSelectedDailyStratumSha256:archiveMode()?journalData.selectedDay?.dailyStratumSha256??null:null,archiveCalendarDateRef:archiveMode()?journalData.selectedDay?.calendarDateRef??null:null,archiveTemporalTruthClass:archiveMode()&&journalData.selectedDay?ARCHIVE_DAY_TRUTH:null,archiveCurrentNowEvaluated:archiveMode()&&journalData.selectedDay?false:null,currentDailyStratumRef:currentness?.currentDailyStratumRef??null,currentDailyStratumSha256:currentness?.currentDailyStratumSha256??null,dayRef:currentness?.dayRef??null,dayIndex:currentness?.dayIndex??null,sourceConversationHeadSha256:currentness?.sourceConversationHeadSha256??null,sourceScoreHeadSha256:currentness?.sourceScoreHeadSha256??null,sourceSemanticAuthorityHeadSha256:currentness?.sourceSemanticAuthorityHeadSha256??null,renderCount:journal.renderCount});
  }
  function bind(){
    q('#livingJournalPrevious')?.addEventListener('click',loadPrevious);q('#livingJournalNext')?.addEventListener('click',loadMore);
    q('#livingJournalVantage')?.addEventListener('change',(event)=>selectVantage(event.currentTarget.value));
    q('#livingJournalDisplayLanguage')?.addEventListener('change',(event)=>selectDisplayLanguage(event.currentTarget.value));
    q('#livingJournalSource')?.addEventListener('click',openSource);q('#livingJournalRevisit')?.addEventListener('click',revisit);
    q('#livingJournalMarginaliaAdd')?.addEventListener('click',()=>{const input=q('#livingJournalMarginaliaInput');addMarginalia(input?.value);if(input)input.value='';});
    const surface=q('#livingJournalTools'),trigger=q('#livingJournalOptionsOpen'),dismiss=q('#livingJournalOptionsClose'),dragHandle=q('#livingJournalOptionsDrag');
    if(surface&&trigger&&dismiss){
      optionsPresentation=createTransientPresentationController({surface,trigger,dismissControl:dismiss,dragHandle,draggable:true,onDismiss:()=>trigger.setAttribute('aria-expanded','false')});
      trigger.addEventListener('click',()=>queueMicrotask(()=>trigger.setAttribute('aria-expanded',String(optionsPresentation.snapshot().open))));
      surface.dataset.sharedPresentationState='QUALIFIED_703';
    }
    globalThis.addEventListener('resize',()=>{if(journal.open)render();});
  }
  bind();
  return{open,close,render,snapshot,previous,next,loadPrevious,loadMore,setPage,setData,restoreInitialData,selectVantage,selectDisplayLanguage,openSource,revisit,addMarginalia,canonicalThenIdentity};
}

// [VXG RealForever]
