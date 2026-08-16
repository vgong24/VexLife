export const terrainSuite = Object.freeze({
  suiteRef:'suite.vexlife.browser.terrain/v1',
  async run({ app, state, helpers:{ delay, assert, assertLiveEdgeAttachments, worldRelationshipClearance, renderedPixelClose, geometryDifferences, geometryIdentity, radialDistance, motionCssToken, transitionProperties, assertSettledGeometry } }) {
    const rootRef = state.rootRef;
    const rootChildren = state.rootChildren;
    assert(rootRef && Array.isArray(rootChildren) && app.terrain.currentRef() === rootRef, 'Terrain suite requires canonical root baseline');
    assert(document.querySelector('#contextSurface').hidden, 'Terrain suite requires contextual surface closed');
    const checks = [];

    const motionTokens={tactile:motionCssToken('--motion-duration-tactile'),fast:motionCssToken('--motion-duration-fast'),surface:motionCssToken('--motion-duration-surface'),layout:motionCssToken('--motion-duration-layout'),spatial:motionCssToken('--motion-duration-spatial'),exit:motionCssToken('--motion-duration-semantic-exit'),arrive:motionCssToken('--motion-duration-semantic-arrive'),ease:motionCssToken('--motion-ease-responsive')};
    assert(Object.values(motionTokens).every(Boolean),'Q6 shared motion token vocabulary is incomplete');
    const tactileControl=document.querySelector('#terrainReset'),tactileStyle=getComputedStyle(tactileControl);assert(tactileControl&&transitionProperties(tactileStyle).includes('scale'),'Q6 tactile button response is not expressed through independent scale motion');
    const motionJourneyBefore=app.navigation.fullJourney().length;tactileControl.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:77}));tactileControl.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:77}));assert(app.navigation.fullJourney().length===motionJourneyBefore,'Q6 tactile response mutated Journey truth');
    const worldMotionRule=[...document.styleSheets].flatMap((sheet)=>{try{return[...sheet.cssRules]}catch{return[]}}).find((rule)=>rule.selectorText==='.e27-world'),worldMotionDeclaration=worldMotionRule?.style?.transition||'';assert(worldMotionDeclaration.includes('var(--motion-duration-spatial)')&&worldMotionDeclaration.includes('var(--motion-duration-surface)'),'Q6 Terrain world stylesheet is not bound to shared motion tokens');
    const surfaceJourneyBefore=app.navigation.fullJourney().length;app.terrain.openJourney();await delay(70);const drawer=document.querySelector('#terrainJourneyDrawer'),drawerContent=drawer?.querySelector(':scope > .e27-drawer-head'),drawerEarlyStyle=drawerContent?getComputedStyle(drawerContent):null;assert(drawer&&drawer.classList.contains('show')&&drawerEarlyStyle&&drawerEarlyStyle.visibility==='hidden'&&Number(drawerEarlyStyle.opacity)<=.01,'Q6 drawer content was not fully hidden while shell crossed the viewport edge');await delay(120);const drawerLateStyle=getComputedStyle(drawerContent),drawerLateOpacity=Number(drawerLateStyle.opacity);assert(drawerLateStyle.visibility==='visible'&&drawerLateOpacity>.7,'Q6 drawer content did not become visibly revealed after shell entry');app.terrain.closeJourney();await delay(220);assert(app.navigation.fullJourney().length===surfaceJourneyBefore,'Q6 drawer presentation changed Journey truth');
    checks.push('Q6 shared tactile/surface/spatial motion vocabulary is present and presentation-only','Q6 drawer shell enters before content reveal so text is not visibly clipped');

    const canonical = app.terrain.geometrySnapshot();
    assert(canonical.current.role === 'CURRENT_CONTEXT', 'P02 current context geometry role missing');
    const activeSubcontext = canonical.nodes.find((node)=>node.role === 'ACTIVE_SUBCONTEXT' && node.relevanceReason === 'CURRENT_WORK_SUBCONTEXT');
    const peripheral = canonical.nodes.find((node)=>node.role === 'PERIPHERAL_CONTEXT');
    const structuralPeripherals = canonical.nodes.filter((node)=>node.role === 'PERIPHERAL_CONTEXT');
    const structuralPeripheral = structuralPeripherals.find((node)=>app.terrain.childRefs(node.ref).length>0);
    assert(activeSubcontext && peripheral, 'P02 accepted root context must expose one active subcontext occurrence plus structural children');
    const activeEdge=canonical.edges.find((edge)=>edge.ref===activeSubcontext.ref),structuralByX=[...structuralPeripherals].sort((a,b)=>a.left-b.left);
    assert(activeSubcontext.relevanceReason === 'CURRENT_WORK_SUBCONTEXT', 'P02 exact current-work child is not typed as an active subcontext occurrence');
    assert(activeSubcontext.width===peripheral.width && activeSubcontext.height===peripheral.height, 'Q6 active subcontext still masquerades as a wider independent peer component');
    assert(Math.abs(activeSubcontext.left-canonical.current.left)<=.5 && activeSubcontext.top-canonical.current.top>(canonical.current.height+activeSubcontext.height)/2+90, 'Q6 active subcontext is not docked below its current semantic owner');
    assert(activeEdge&&Math.abs(activeEdge.x1-activeEdge.x2)<=1.1, 'Q6 active-subcontext relationship bridge is not vertically anchored to its owner');
    assert(structuralPeripheral, 'P02 descendant-bearing unrelated node was still promoted merely because it has descendants');
    assert(structuralByX.length===3 && Math.abs(structuralByX[0].top-structuralByX[2].top)<=1.1 && Math.abs((structuralByX[0].left+structuralByX[2].left)/2-canonical.current.left)<=1.1 && Math.abs(structuralByX[1].left-canonical.current.left)<=1.1, 'Q6 structural-child orbit is not symmetrically derived after removing the active subcontext occurrence');
    assert(canonical.current.width > activeSubcontext.width && activeSubcontext.width===peripheral.width, 'P02 current context strength or shared child footprint drifted');
    const activeClearance=worldRelationshipClearance(activeSubcontext.ref),peripheralClearances=structuralPeripherals.map((node)=>worldRelationshipClearance(node.ref));
    assert(activeClearance>=94,`P02 active-subcontext Terrain-world boundary clearance collapsed below the spatial floor: ${activeClearance}`);
    assert(peripheralClearances.length===3&&Math.min(...peripheralClearances)>=94,`P02 structural-child clearance collapsed below the spatial floor: ${JSON.stringify(peripheralClearances)}`);
    assertSettledGeometry(canonical,'P04/P05 fan');
    const projectionProofs={fan:canonical};
    for(const mode of ['rings','carousel','fan']){app.terrain.setProjectionMode(mode);const projection=app.terrain.geometrySnapshot();assertSettledGeometry(projection,`P04/P05 ${mode}`);projectionProofs[mode]=projection;}
    assert(geometryIdentity(projectionProofs.fan)===geometryIdentity(canonical),'P03 returning to fan did not restore deterministic canonical geometry');
    const beforeEquivalentJourney = app.navigation.fullJourney().length; app.terrain.render(false); const equivalent = app.terrain.geometrySnapshot();
    assert(geometryIdentity(canonical) === geometryIdentity(equivalent), 'P03 equivalent semantic state produced different geometry');
    assert(app.navigation.fullJourney().length === beforeEquivalentJourney, 'P12 adaptive rerender changed semantic journey');
    assert(document.querySelector('#terrainFocus').textContent.includes('Center is current semantic context.'), 'P06 current context emphasis is not explicit');
    checks.push('P02-P06 adaptive geometry is ordered, deterministic, overlap-free, edge-true, and unmistakably current');

    const journeyBeforePin = app.navigation.fullJourney().length, currentBeforePin = app.terrain.currentRef();
    app.state.terrain.localOffsets[peripheral.ref]={x:34,y:-20}; app.terrain.render(false); const offsetGeometry=app.terrain.geometrySnapshot(),offsetNode=offsetGeometry.nodes.find((node)=>node.ref===peripheral.ref);
    assert(offsetNode.localOffset.x===34 && offsetNode.localOffset.y===-20 && renderedPixelClose(offsetNode.left,peripheral.left+34) && renderedPixelClose(offsetNode.top,peripheral.top-20), 'P12 existing local offset is not truthfully composed over adaptive geometry');
    assert(app.terrain.toggleWorkspace()===true, 'P09 projection workspace did not enter explicit human-control mode');
    const pinControl=document.querySelector(`.e27-node[data-terrain-ref="${peripheral.ref}"]`), beforePinMotion=app.terrain.liveGeometrySnapshot(); pinControl.click();
    await delay(100); const livePin=app.terrain.liveGeometrySnapshot(),livePinnedNode=livePin.nodes.find((node)=>node.ref===peripheral.ref),beforePinnedNode=beforePinMotion.nodes.find((node)=>node.ref===peripheral.ref),beforeYield=beforePinMotion.nodes.find((node)=>node.ref!==peripheral.ref),liveYield=beforeYield?livePin.nodes.find((node)=>node.ref===beforeYield.ref):null;
    assertLiveEdgeAttachments('P09 manual override in-flight');
    assert(livePinnedNode&&beforePinnedNode&&radialDistance(livePinnedNode)<radialDistance(beforePinnedNode)-10,'P09 manual override did not visibly pull the human-prioritized node inward during reflow');
    assert(!beforeYield||!liveYield||radialDistance(liveYield)>radialDistance(beforeYield)+6,'P09 neighboring geometry did not visibly yield to the manual override');
    await delay(280); const pinned = app.terrain.geometrySnapshot(), pinnedNode = pinned.nodes.find((node)=>node.ref===peripheral.ref);
    assert(pinned.manualOverrideRef===peripheral.ref && pinnedNode?.role==='MANUAL_OVERRIDE' && pinnedNode.manualOverride===true, 'P09 manual override did not outrank adaptation');
    assert(pinnedNode.width > peripheral.width, 'P09 manual override did not produce stronger node geometry');
    assert(pinnedNode.localOffset.x===34 && pinnedNode.localOffset.y===-20, 'P12 manual override lost persisted local offset identity');
    app.state.terrain.localOffsets[peripheral.ref]={x:0,y:0}; app.terrain.render(false); const manualBase=app.terrain.geometrySnapshot(),manualBaseNode=manualBase.nodes.find((node)=>node.ref===peripheral.ref);
    assert(manualBaseNode?.role==='MANUAL_OVERRIDE' && renderedPixelClose(pinnedNode.left,manualBaseNode.left+34) && renderedPixelClose(pinnedNode.top,manualBaseNode.top-20), 'P12 local offset is not truthfully additive over the manual-override adaptive base');
    app.state.terrain.localOffsets[peripheral.ref]={x:34,y:-20}; app.terrain.render(false); const restoredPinned=app.terrain.geometrySnapshot();
    assert(geometryIdentity(restoredPinned)===geometryIdentity(pinned), 'P12 restoring the same local offset did not recover deterministic manual-override geometry');
    assert(app.navigation.fullJourney().length===journeyBeforePin && app.terrain.currentRef()===currentBeforePin, 'P12 manual geometry override changed semantic refs or journey');
    assert(pinControl.dataset.manualOverride==='true' || document.querySelector(`.e27-node[data-terrain-ref="${peripheral.ref}"]`).dataset.manualOverride==='true', 'P09 pinned state is not visibly distinguishable in rendered node state');
    const journeyBeforeReset=app.navigation.fullJourney().length; app.terrain.reset(); const resetGeometry=app.terrain.geometrySnapshot(); await delay(100); const resetActiveSubcontextClearanceWorld=worldRelationshipClearance(activeSubcontext.ref); assert(resetActiveSubcontextClearanceWorld>=90,`P10 reset choreography collapsed active-subcontext Terrain-world boundary clearance: ${resetActiveSubcontextClearanceWorld}`);
    assert(resetGeometry.manualOverrideRef===null && Object.keys(app.state.terrain.localOffsets).length===0, 'P10 reset did not clear bounded manual geometry state');
    const canonicalResetNode=canonical.nodes.find((node)=>node.ref===peripheral.ref),resetDuringNode=resetGeometry.nodes.find((node)=>node.ref===peripheral.ref);
    assert(canonicalResetNode&&resetDuringNode&&resetDuringNode.role===canonicalResetNode.role&&resetDuringNode.relevanceReason===canonicalResetNode.relevanceReason,'P10 reset did not restore canonical semantic geometry state before visual settlement');
    assert(resetDuringNode.width>canonicalResetNode.width+20&&resetDuringNode.height>canonicalResetNode.height+20,'P10 reset recovery animation did not visibly depart from the prior manual geometry toward canonical geometry');
    await delay(380); const settledResetGeometry=app.terrain.geometrySnapshot(),resetDifferences=geometryDifferences(canonical,settledResetGeometry); assert(resetDifferences.length===0, `P10 reset did not settle to canonical adaptive choreography: ${JSON.stringify(resetDifferences.slice(0,12))}`);
    assert(app.navigation.fullJourney().length===journeyBeforeReset && app.terrain.currentRef()===currentBeforePin, 'P12 pure geometry reset changed semantic journey or current context');
    checks.push('P09-P12 bounded manual override wins, local offset stays truthful, reset recovers canonical choreography, semantic refs stay stable');


    const q4TargetRef=app.terrain.childRefs()[0]||null;assert(q4TargetRef,'Q4 requires one semantic child for historical revisit proof');
    await app.terrain.travel(q4TargetRef,'in');const q4TargetEvent=app.navigation.fullJourney().at(-1);assert(q4TargetEvent?.after?.selectedNodeRef===q4TargetRef,'Q4 target journey event did not capture semantic child frame');await app.terrain.up();
    const q4HistoryBeforeScrub=app.navigation.fullJourney(),q4HistoryBeforeScrubJson=JSON.stringify(q4HistoryBeforeScrub),q4CurrentBeforeScrub=JSON.stringify(app.navigation.semanticFrame()),q4TargetIndex=q4HistoryBeforeScrub.findIndex(event=>event.journeyRef===q4TargetEvent.journeyRef);assert(q4TargetIndex>=0,'Q4 target journey event identity was not retained');
    app.terrain.openJourney();const q4Projection=app.terrain.setJourneyScrubIndex(q4TargetIndex);assert(JSON.stringify(app.navigation.semanticFrame())===q4CurrentBeforeScrub&&JSON.stringify(app.navigation.fullJourney())===q4HistoryBeforeScrubJson,'Q4 scrub cursor changed canonical current context or immutable Journey');assert(q4Projection.transitionReason===q4TargetEvent.actionRef&&q4Projection.clusters.length>0,'Q4 scrub projection lost transition provenance or conceptual clusters');assert(document.querySelector('#terrainJourneyCurrentMarker')?.dataset.historyMode==='browsing'&&app.terrain.currentRef()===rootRef,'Q4 historical browsing is not visibly distinct from canonical current context');
    const q4Prefix=app.navigation.fullJourney(),q4PrefixJson=JSON.stringify(q4Prefix),q4Revisit=app.terrain.visitJourneyEvent(q4TargetEvent),q4AfterRevisit=app.navigation.fullJourney();assert(q4Revisit.changed===true&&q4AfterRevisit.length===q4Prefix.length+1&&q4AfterRevisit.at(-1).actionRef==='action.journey.revisit','Q4 explicit semantic revisit did not append exactly one action.journey.revisit event');assert(JSON.stringify(q4AfterRevisit.slice(0,q4Prefix.length))===q4PrefixJson,'Q4 revisit rewrote the historical Journey prefix');for(const key of ['contextProjection','projectRef','threadRef','channelRef','selectedNodeRef'])assert((app.navigation.semanticFrame()[key]??null)===(q4TargetEvent.after[key]??null),`Q4 revisit did not restore historical semantic coordinate ${key}`);
    const q4SameFrameCount=app.navigation.fullJourney().length,q4SameFrame=app.terrain.visitJourneyEvent(q4TargetEvent);assert(q4SameFrame.changed===false&&q4SameFrame.reason==='ALREADY_CURRENT_SEMANTIC_FRAME'&&app.navigation.fullJourney().length===q4SameFrameCount,'Q4 already-current revisit manufactured semantic history');
    const q4Scrub=document.querySelector('#terrainJourneyScrub');assert(q4Scrub?.tagName==='INPUT'&&q4Scrub.type==='range'&&q4Scrub.dataset.nodeRef==='element.terrain.journey-scrub','Q4 scrub is not a native keyboard-addressable stable control');
    await app.terrain.up();const q4Language=document.querySelector('#languageSelect'),q4OriginalLanguage=q4Language.value;for(const lang of ['en','ja','zh']){q4Language.value=lang;q4Language.dispatchEvent(new Event('change',{bubbles:true}));app.terrain.render(false);for(const selector of ['[data-i18n="journey.full-history"]','[data-i18n="journey.revisit"]','[data-i18n="journey.transition-reason"]']){const value=document.querySelector(selector)?.textContent?.trim();assert(value&&!value.startsWith('journey.'),`Q4 ${lang} localization fell back for ${selector}`)}}q4Language.value=q4OriginalLanguage;q4Language.dispatchEvent(new Event('change',{bubbles:true}));app.terrain.render(false);app.terrain.closeJourney();
    checks.push('Q4 scrub stays projection-only, clusters and actionRef reason are derived, historicalFramePatch revisit is append-only, same-frame revisit is a no-op, stable native controls localize in EN/JA/ZH');

    const realMatchMedia=globalThis.matchMedia;
    globalThis.matchMedia=(query)=>query.includes('prefers-reduced-motion')?{matches:true,media:query,onchange:null,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true}}:realMatchMedia(query);
    app.terrain.render(true);
    assert(document.querySelector('#terrainFocus').style.transition==='none' && [...document.querySelectorAll('.e27-node')].every((node)=>node.style.transition==='none'), 'P07 reduced-motion projection still depends on geometry animation');
    const reducedSnapshot=app.terrain.geometrySnapshot(); assert(reducedSnapshot.current.role==='CURRENT_CONTEXT' && reducedSnapshot.nodes.length===rootChildren.length, 'P07 reduced-motion state lost comprehensible geometry');
    const reducedChild=app.terrain.childRefs()[0]||null,reducedSequence=app.terrain.transitionSnapshot().sequence;
    if(reducedChild){await app.terrain.travel(reducedChild,'in');const reducedTransition=app.terrain.transitionSnapshot();assert(reducedTransition.phase==='IDLE'&&reducedTransition.reduced===true&&reducedTransition.sequence===reducedSequence+1,'P07 reduced-motion travel did not preserve immediate semantic transition truth');await app.terrain.up();}
    globalThis.matchMedia=realMatchMedia; app.terrain.render(false);
    checks.push('P07 reduced-motion removes adaptive geometry animation without removing spatial meaning or semantic travel');

    const mobileFrame=document.createElement('iframe'); mobileFrame.style.cssText='position:fixed;left:-10000px;top:0;width:390px;height:844px;border:0'; const mobileUrl=new URL(location.href); mobileUrl.searchParams.delete('integration'); mobileFrame.src=mobileUrl.href; await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('P15 mobile frame timed out')),5000);mobileFrame.onload=()=>{clearTimeout(timeout);resolve()};document.body.append(mobileFrame)}); await delay(50);
    const mobileWindow=mobileFrame.contentWindow,mobileDocument=mobileFrame.contentDocument,mobileTerrain=mobileDocument.querySelector('#view-terrain'),mobileFocus=mobileDocument.querySelector('#terrainFocus'),mobileVex=mobileDocument.querySelector('#guideWindow');
    assert(mobileWindow.innerWidth<=390 && mobileDocument.documentElement.scrollWidth<=mobileWindow.innerWidth+1, 'P15 mobile first render introduces horizontal document overflow');
    assert(mobileFocus?.dataset.adaptiveGeometry==='CURRENT_CONTEXT' && mobileDocument.querySelectorAll('.e27-node').length===rootChildren.length, 'P15 mobile first render lost accepted Terrain context/topology');
    assert(mobileVex?.classList.contains('is-minimized'), 'P15 mobile first-render Vex no longer starts ambient/minimized');
    const mobileJourneyToggle=mobileDocument.querySelector('[data-node-ref="element.terrain.journey-full-history"]');assert(mobileJourneyToggle,'Q4 mobile journey trigger stable identity is missing');const mobileJourneyToggleRect=mobileJourneyToggle.getBoundingClientRect(),mobileJourneyToggleStyle=mobileWindow.getComputedStyle(mobileJourneyToggle);assert(mobileJourneyToggleStyle.display!=='none'&&mobileJourneyToggleStyle.visibility!=='hidden'&&mobileJourneyToggleRect.width>0&&mobileJourneyToggleRect.height>0,'Q4 mobile journey trigger is not visibly reachable');mobileJourneyToggle.click();await delay(40);const mobileJourneyDrawer=mobileDocument.querySelector('#terrainJourneyDrawer'),mobileJourneyScrub=mobileDocument.querySelector('[data-node-ref="element.terrain.journey-scrub"]');assert(mobileJourneyDrawer?.classList.contains('show')&&mobileJourneyScrub?.type==='range'&&mobileDocument.documentElement.scrollWidth<=mobileWindow.innerWidth+1,'Q4 mobile semantic Journey affordance is unusable or introduces horizontal overflow');
    const mobileTerrainRect=mobileTerrain.getBoundingClientRect(),mobileFocusRect=mobileFocus.getBoundingClientRect(); assert(mobileFocusRect.right>mobileTerrainRect.left && mobileFocusRect.left<mobileTerrainRect.right && mobileFocusRect.bottom>mobileTerrainRect.top && mobileFocusRect.top<mobileTerrainRect.bottom, 'P15 current context is not visible in mobile Terrain viewport');
    const mobileEvidence={viewport:{width:mobileWindow.innerWidth,height:mobileWindow.innerHeight},documentScrollWidth:mobileDocument.documentElement.scrollWidth,currentRole:mobileFocus.dataset.adaptiveGeometry,nodeCount:mobileDocument.querySelectorAll('.e27-node').length,vexAmbient:mobileVex.classList.contains('is-minimized')}; mobileFrame.remove();
    checks.push('P15 accepted E2.7 mobile first-render Terrain usability remains present at a real 390px Chromium browsing context');

    state.e28Poc01={schemaVersion:'vexlife.e28-poc01.browser-proof/v1',semanticContextRef:rootRef,canonical,projectionProofs,offset:offsetGeometry,pinned,recovered:resetGeometry,reducedMotion:reducedSnapshot,mobile:mobileEvidence};
    assert(app.terrain.currentRef()===rootRef, 'Terrain suite did not restore canonical root baseline');
    return { suiteRef:this.suiteRef, state:'PASS', baselineRef:'baseline.vexlife.browser.root-terrain', checks };
  }
});

// [VXG RealForever]
