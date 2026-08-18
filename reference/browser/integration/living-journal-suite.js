const journalRefs=Object.freeze({
  feature:'feature.vexlife.living-journal',
  state:'state.living-journal',
  screen:'screen.vexlife.living-journal',
  actions:[
    'action.living-journal.open','action.living-journal.page.previous','action.living-journal.page.next','action.living-journal.vantage.select',
    'action.living-journal.display-language.select','action.living-journal.source.open','action.living-journal.revisit.open','action.living-journal.marginalia.add-local'
  ],
  modules:[
    'module.vexlife.browser.living-journal-controller','module.vexlife.browser.living-journal-demo-data','module.vexlife.browser.living-journal-styles'
  ],
  tests:[
    'test.living-journal.bounded-pages','test.living-journal.vantage-separation','test.living-journal.temporal-integrity','test.living-journal.multilingual-display',
    'test.living-journal.source-and-revisit','test.living-journal.marginalia-nonmutation','test.living-journal.accessibility','test.living-journal.mobile-book-grammar'
  ]
});

const prefixEqual=(before,after)=>before.every((event,index)=>JSON.stringify(event)===JSON.stringify(after[index]));

export async function runLivingJournalProof({app,helpers:{delay,assert},viewportClass=null}){
  const checks=[],controller=app.livingJournal;assert(controller,'J00 Living Journal controller unavailable');
  app.returnToTerrain();await delay(20);
  const semanticBefore=app.navigation.semanticFrame(),selectedBefore=semanticBefore.selectedNodeRef,journeyBefore=app.navigation.fullJourney(),terrainBefore=app.terrain.currentRef();
  app.openLivingJournal();await delay(30);
  let snap=controller.snapshot(),frame=app.navigation.semanticFrame(),journeyOpen=app.navigation.fullJourney();
  assert(frame.screenRef==='screen.vexlife.living-journal'&&frame.routeRef==='route.living-journal','J01 Journal did not open as contextual screen');
  assert(frame.selectedNodeRef===selectedBefore&&app.terrain.currentRef()===terrainBefore,'J01 opening Journal changed Terrain semantic current context');
  assert(prefixEqual(journeyBefore,journeyOpen),'J01 opening Journal rewrote prior Journey history');checks.push('J01');

  assert(snap.pageCount>=4&&snap.renderedPageRefs.length<=3&&new Set(snap.renderedPageRefs).size===snap.renderedPageRefs.length,'J02 bounded nearby-page window invalid');
  const firstRef=snap.pageRef;controller.next();await delay(20);assert(controller.snapshot().pageIndex===1&&controller.snapshot().pageRef!==firstRef,'J02 next page succession is not deterministic');controller.previous();await delay(20);assert(controller.snapshot().pageIndex===0,'J02 previous page did not invert next');checks.push('J02');

  snap=controller.snapshot();
  if(innerWidth>=1000)assert(snap.layoutClass==='WIDE_SPREAD'&&snap.visiblePageCount===2,'J03 wide desktop is not a two-page spread');
  else assert(snap.visiblePageCount===1&&['NARROW_ONE_PAGE','PHONE_ONE_PAGE'].includes(snap.layoutClass),'J03 narrow/phone did not resolve one-page grammar');
  if(innerWidth<=760){const spread=document.querySelector('#livingJournalSpread'),style=getComputedStyle(spread),page=spread.querySelector('.living-journal-page');assert(snap.layoutClass==='PHONE_ONE_PAGE'&&style.scrollSnapType.includes('x')&&page.getBoundingClientRect().width>=spread.getBoundingClientRect().width*.88,'J03 phone horizontal snap grammar unavailable');}
  const surface=document.querySelector('#contextSurface'),journalRoot=document.querySelector('#view-living-journal'),spreadRect=document.querySelector('#livingJournalSpread')?.getBoundingClientRect(),surfaceRect=surface?.getBoundingClientRect(),journalRect=journalRoot?.getBoundingClientRect();
  assert(surface?.dataset.contextProjection==='living-journal','J03 Journal contextual projection marker unavailable');
  assert(surfaceRect&&journalRect&&journalRect.top>=surfaceRect.top-1&&journalRect.bottom<=surfaceRect.bottom+1,'J03 Journal escapes contextual surface');
  for(const selector of ['#contextWorkspaceDock','#contextWorkspaceSplit','#contextWorkspaceStatus','#contextWorkspaceReset']){const control=document.querySelector(selector),rect=control?.getBoundingClientRect();assert(control&&control.getClientRects().length===0&&(!rect||(!rect.width&&!rect.height)),'J03 reading mode leaked effective generic workspace chrome '+selector);}
  const closeRect=document.querySelector('#contextSurfaceClose')?.getBoundingClientRect();assert(closeRect&&closeRect.width>=44&&closeRect.height>=44,'J03 reading-mode close affordance unavailable');
  assert(spreadRect?.height>=(innerWidth>=1000?280:250),'J03 book reading area is compressed');
  checks.push('J03');

  const targetSelectors=['#livingJournalPrevious','#livingJournalNext','#livingJournalSource','#livingJournalRevisit'];
  for(const selector of targetSelectors){const target=document.querySelector(selector),rect=target?.getBoundingClientRect();assert(rect&&rect.width>=44&&rect.height>=44,`J04 ${selector} target below 44px: ${JSON.stringify({width:rect?.width??0,height:rect?.height??0})}`);}
  const marginaliaDisclosure=document.querySelector('#livingJournalMarginalia > summary'),marginaliaDisclosureRect=marginaliaDisclosure?.getBoundingClientRect();
  assert(marginaliaDisclosureRect&&marginaliaDisclosureRect.width>=44&&marginaliaDisclosureRect.height>=44,'J04 marginalia disclosure target below 44px');for(const selector of targetSelectors){const target=document.querySelector(selector),rect=target?.getBoundingClientRect();assert(rect&&rect.width>=44&&rect.height>=44,`J04 ${selector} target below 44px: ${JSON.stringify({width:rect?.width??0,height:rect?.height??0})}`);}
  const keyRoot=document.querySelector('#view-living-journal');keyRoot.focus?.();keyRoot.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await delay(20);assert(controller.snapshot().pageIndex===1,'J04 ArrowRight linear page route unavailable');keyRoot.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));await delay(20);assert(controller.snapshot().pageIndex===0,'J04 ArrowLeft linear page route unavailable');checks.push('J04');

  const cssText=[...document.styleSheets].find((sheet)=>String(sheet.href||'').includes('living-journal.css'));assert(cssText,'J05 Living Journal stylesheet unavailable');
  const stylesheet=await fetch('./living-journal.css').then((response)=>response.text());assert(/prefers-reduced-motion:reduce/.test(stylesheet)&&/scroll-behavior:auto/.test(stylesheet),'J05 reduced-motion semantic-equivalent rule unavailable');checks.push('J05');

  const eventRef=controller.snapshot().eventRef,seen=[];for(const vantage of ['HUMAN','VEX','SHARED_RELATIONSHIP','SOURCE']){controller.selectVantage(vantage);await delay(5);const current=controller.snapshot();assert(current.eventRef===eventRef&&current.vantage===vantage,'J06 vantage switch changed event lineage');seen.push(document.querySelector('.living-journal-page[data-current="true"] .living-journal-vantage')?.textContent);}
  assert(new Set(seen).size===4,'J06 four vantages are not visibly distinct/attributable');checks.push('J06');

  controller.selectVantage('HUMAN');const thenIdentity=controller.canonicalThenIdentity();const pageThen=document.querySelector('.living-journal-page[data-current="true"] [data-temporal-class="THEN"]');assert(pageThen&&document.querySelector('[data-temporal-class="LATER"]')&&document.querySelector('[data-temporal-class="NOW"][data-currentness="DERIVED_CURRENT"]'),'J07 THEN/LATER/NOW labels unavailable');
  controller.selectVantage('VEX');controller.selectDisplayLanguage('ja');assert(controller.canonicalThenIdentity()===thenIdentity,'J07 vantage/language projection mutated canonical THEN identity');checks.push('J07');

  const sourceBefore=controller.snapshot();document.querySelector('#livingJournalSource').click();await delay(10);const sourceAfter=controller.snapshot(),sourceStatus=document.querySelector('#livingJournalSourceStatus').textContent;assert(sourceAfter.sourceDoorRef===sourceBefore.sourceRef&&sourceStatus.includes(sourceBefore.sourceRef)&&sourceAfter.originalText===sourceBefore.originalText,'J08 source door did not preserve/reveal original source identity');checks.push('J08');

  const journeyBeforeRevisit=app.navigation.fullJourney();document.querySelector('#livingJournalRevisit').click();await delay(20);const revisited=app.navigation.semanticFrame(),journeyAfterRevisit=app.navigation.fullJourney();assert(revisited.screenRef==='screen.vexlife.terrain'&&revisited.selectedNodeRef===selectedBefore,'J09 revisit did not return to same Terrain semantic context');assert(prefixEqual(journeyBeforeRevisit,journeyAfterRevisit)&&journeyAfterRevisit.length===journeyBeforeRevisit.length+1&&journeyAfterRevisit.at(-1).actionRef==='action.living-journal.revisit.open','J09 revisit rewrote Journey instead of appending');checks.push('J09');

  app.openLivingJournal();await delay(15);controller.setPage(0);const original=controller.snapshot(),texts=[];for(const language of ['en','ja','zh']){controller.selectDisplayLanguage(language);await delay(5);const current=controller.snapshot();assert(current.sourceRef===original.sourceRef&&current.originalLanguage===original.originalLanguage&&current.originalText===original.originalText,'J10 display language changed source/original identity');texts.push(document.querySelector('.living-journal-page[data-current="true"] [data-temporal-class="THEN"] p')?.textContent);}
  assert(new Set(texts).size===3,'J10 multilingual display did not project distinct EN/JA/ZH content');checks.push('J10');

  const journeyBeforeNote=app.navigation.fullJourney(),identityBeforeNote=controller.canonicalThenIdentity();const input=document.querySelector('#livingJournalMarginaliaInput');input.value='temporary proof note';document.querySelector('#livingJournalMarginaliaAdd').click();await delay(10);const marginaliaAddRect=document.querySelector('#livingJournalMarginaliaAdd')?.getBoundingClientRect();assert(marginaliaAddRect&&marginaliaAddRect.width>=44&&marginaliaAddRect.height>=44,'J11 open marginalia Add target below 44px');assert(controller.snapshot().marginaliaCount===1&&controller.canonicalThenIdentity()===identityBeforeNote&&JSON.stringify(app.navigation.fullJourney())===JSON.stringify(journeyBeforeNote),'J11 local marginalia crossed semantic/source boundary');checks.push('J11');

  app.returnToTerrain();await delay(10);app.openLivingJournal();await delay(10);snap=controller.snapshot();assert(snap.totalMarginaliaCount===0&&snap.truthClass==='CURRENT_SYNTHETIC_REFERENCE'&&localStorage.getItem('vexlife.living-journal')===null,'J12 close/reopen made marginalia look durable/canonical');checks.push('J12');

  const [featureRegistry,moduleRegistry,testRegistry,screen,en,ja,zh]=await Promise.all([
    fetch('../../blueprint/feature-registry.json').then((r)=>r.json()),fetch('../../blueprint/module-registry/browser.json').then((r)=>r.json()),fetch('../../blueprint/fragments/tests.json').then((r)=>r.json()),
    fetch('../../blueprint/fragments/screens/living-journal.json').then((r)=>r.json()),fetch('../../blueprint/strings/en.json').then((r)=>r.json()),fetch('../../blueprint/strings/ja.json').then((r)=>r.json()),fetch('../../blueprint/strings/zh.json').then((r)=>r.json())
  ]);
  const feature=featureRegistry.features.find((item)=>item.featureRef===journalRefs.feature);assert(feature&&screen.screenRef===journalRefs.screen,'J13 feature/screen identities unavailable');
  for(const ref of journalRefs.actions)assert(feature.actionRefs.includes(ref),'J13 feature missing action '+ref);
  for(const ref of journalRefs.modules)assert(moduleRegistry.some((item)=>item.moduleRef===ref)&&feature.moduleRefs.includes(ref),'J13 module missing '+ref);
  for(const ref of journalRefs.tests)assert(testRegistry.some((item)=>item.testRef===ref)&&feature.testRefs.includes(ref),'J13 test missing '+ref);
  for(const ref of feature.localizationRefs)for(const [language,catalog] of [['en',en],['ja',ja],['zh',zh]])assert(catalog[ref],`J13 ${language} missing ${ref}`);checks.push('J13');

  assert(document.querySelectorAll('#guideWindow').length===1&&app.visibleVexName()==='Vex'&&app.terrain.currentRef()===terrainBefore,'J14 Journal duplicated Vex or changed Terrain owner truth');
  const frameBeforeHealth=app.navigation.semanticFrame();app.openContext('health');await delay(10);assert(app.navigation.semanticFrame().screenRef==='screen.vexlife.health','J14 Health contextual regression');app.returnToTerrain();app.openContext('chat');await delay(10);assert(app.navigation.semanticFrame().screenRef==='screen.vexlife.chat','J14 Chat contextual regression');app.returnToTerrain();assert(app.terrain.currentRef()===terrainBefore,'J14 carried Terrain context changed');checks.push('J14');

  assert(typeof livingJournalSuite.run==='function'&&livingJournalSuite.suiteRef==='suite.vexlife.browser.living-journal/v1','J15 owner-domain suite identity unavailable');checks.push('J15');

  const allFalseEffects=Object.freeze({homeMutated:false,memoryMutated:false,semanticAcceptanceCreated:false,firstPersonAuthorityGranted:false,modelCalled:false,translationCalled:false,networkCalled:false,trainingRan:false,modelWeightsChanged:false,publicationPerformed:false});
  const memoryPage=Object.freeze({
    pageRef:'page.living-journal.memory.browser-proof',pageIndex:0,statementRef:'statement.living-journal.memory.browser-proof',summary:'Accepted Memory summary for browser proof.',summaryHash:'1'.repeat(64),memoryRelation:'CURRENT_LINEAGE_AUTOBIOGRAPHY',recordedStatementState:'HUMAN_CONFIRMED',effectiveState:'HUMAN_CONFIRMED',current:true,acceptedForContinuity:true,consentState:'PERMITTED',semanticSubjectFingerprint:'2'.repeat(64),semanticAcceptanceRef:'acceptance.living-journal.memory.browser-proof',semanticAcceptanceSha256:'3'.repeat(64),semanticAuthorityHeadSha256:'4'.repeat(64),currentDailyStratumRef:'daily-stratum.living-journal.browser-proof',currentDailyStratumSha256:'5'.repeat(64),dayRef:'day.living-journal.browser-proof',dayIndex:0,sourceConversationHeadSha256:'6'.repeat(64),sourceScoreHeadSha256:'7'.repeat(64),sourceSemanticAuthorityHeadSha256:'8'.repeat(64),sourceBindings:Object.freeze([Object.freeze({eventRef:'event.living-journal.memory.source.request',eventHash:'9'.repeat(64),eventKind:'REQUEST',sequence:0}),Object.freeze({eventRef:'event.living-journal.memory.source.response',eventHash:'a'.repeat(64),eventKind:'RESPONSE',sequence:1})]),sourceDescent:Object.freeze({rawSourceContentIncluded:false,observedCurrentConversationHeadSha256:'6'.repeat(64),observedCommittedSourceEventRefs:Object.freeze(['event.living-journal.memory.source.request','event.living-journal.memory.source.response'])}),rawSourceContentIncluded:false,firstPersonAuthorityGranted:false
  });
  const memoryFixture=Object.freeze({schemaVersion:'vexlife.living-journal.memory-projection/v1',state:'CURRENT',currentness:'CURRENT',truthClass:'CURRENT_MEMORY_REFERENCE',realMemoryLoaded:true,realJournalBodyLoaded:true,rawConversationContentIncluded:false,pageCount:1,maxPages:8,pages:Object.freeze([memoryPage]),heldOrDeferredStatementRefs:Object.freeze([]),boundedOutStatementRefs:Object.freeze([]),reasons:Object.freeze([]),effects:allFalseEffects});
  let effectfulRejected=false;try{controller.setData({...memoryFixture,effects:{...allFalseEffects,memoryMutated:true}});}catch{effectfulRejected=true;}assert(effectfulRejected,'J16 effectful Memory packet was admitted');
  controller.setData(memoryFixture);app.openLivingJournal();await delay(15);snap=controller.snapshot();
  assert(snap.truthClass==='CURRENT_MEMORY_REFERENCE'&&snap.dataMode==='MEMORY'&&snap.statementRef===memoryPage.statementRef&&snap.eventRef===null,'J16 Memory mode coerced statement identity into synthetic event identity');
  assert(snap.summary===memoryPage.summary&&snap.summaryHash===memoryPage.summaryHash&&document.querySelector('.living-journal-memory-summary p')?.textContent===memoryPage.summary,'J16 accepted Memory summary is not the visible page body');
  assert(!document.querySelector('#livingJournalSpread [data-temporal-class]')&&!document.querySelector('#livingJournalSpread .living-journal-vantage'),'J16 Memory mode fabricated temporal or vantage prose');
  const memoryVantage=document.querySelector('#livingJournalVantage'),memoryLanguage=document.querySelector('#livingJournalDisplayLanguage');assert(memoryVantage?.disabled&&memoryLanguage?.disabled&&snap.vantageProjectionAvailable===false&&snap.displayLanguageProjectionAvailable===false,'J16 unavailable vantage/language projections remain interactive');
  let vantageRejected=false,languageRejected=false;try{controller.selectVantage('VEX');}catch{vantageRejected=true;}try{controller.selectDisplayLanguage('ja');}catch{languageRejected=true;}assert(vantageRejected&&languageRejected,'J16 programmatic unavailable projection did not fail closed');
  const memoryIdentity=controller.canonicalThenIdentity(),memoryJourneyBeforeNote=app.navigation.fullJourney();controller.addMarginalia('temporary Memory margin note');assert(controller.snapshot().marginaliaCount===1&&controller.canonicalThenIdentity()===memoryIdentity&&JSON.stringify(app.navigation.fullJourney())===JSON.stringify(memoryJourneyBeforeNote),'J16 Memory marginalia crossed source/currentness boundary');
  document.querySelector('#livingJournalSource').click();await delay(5);snap=controller.snapshot();const memorySourceStatus=document.querySelector('#livingJournalSourceStatus')?.textContent??'';assert(snap.sourceDoorRef===memoryPage.pageRef&&JSON.stringify(snap.sourceDoorRefs)===JSON.stringify(memoryPage.sourceBindings.map((binding)=>binding.eventRef))&&memorySourceStatus.includes(memoryPage.sourceBindings[0].eventRef)&&!memorySourceStatus.includes('originalText'),'J16 Memory source door did not expose refs without raw source body');
  document.querySelector('#livingJournalRevisit').click();await delay(10);assert(app.navigation.semanticFrame().screenRef==='screen.vexlife.terrain'&&controller.snapshot().eventRef===null,'J16 Memory revisit invented event identity or failed semantic return');
  const emptyMemory=Object.freeze({...memoryFixture,realJournalBodyLoaded:false,pageCount:0,pages:Object.freeze([])});controller.setData(emptyMemory);app.openLivingJournal();await delay(10);snap=controller.snapshot();assert(snap.pageCount===0&&snap.pageRef===null&&snap.visiblePageCount===0&&document.querySelectorAll('#livingJournalSpread .living-journal-page').length===0&&document.querySelector('#livingJournalPrevious')?.disabled&&document.querySelector('#livingJournalNext')?.disabled,'J16 zero-page CURRENT Memory projection is not safe');
  controller.restoreInitialData();app.returnToTerrain();await delay(10);snap=controller.snapshot();assert(snap.truthClass==='CURRENT_SYNTHETIC_REFERENCE'&&snap.dataMode==='SYNTHETIC'&&snap.totalMarginaliaCount===0,'J16 Memory capability proof leaked into the app active data source');
  checks.push('J16');

  return{proofRef:'proof.vexlife.living-journal.lived-book/v1',state:'PASS',viewportClass:viewportClass??(innerWidth<=760?'PHONE':innerWidth<1000?'NARROW':'WIDE'),checks,selectedNodeRef:selectedBefore,terrainRef:terrainBefore,truthClass:controller.snapshot().truthClass};
}

export const livingJournalSuite=Object.freeze({
  suiteRef:'suite.vexlife.browser.living-journal/v1',
  run:(context)=>runLivingJournalProof(context).then((result)=>({suiteRef:'suite.vexlife.browser.living-journal/v1',state:result.state,checks:result.checks,proof:result}))
});

// [VXG RealForever]
