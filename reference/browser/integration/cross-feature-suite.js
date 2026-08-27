export const crossFeatureSuite = Object.freeze({
  suiteRef:'suite.vexlife.browser.cross-feature/v1',
  async run({ app, state, helpers:{ delay, assert, assertLiveEdgeAttachments, worldRelationshipClearance } }) {
    assert(state.contextualReturnComplete===true && state.contextualDraftValue==='integration.unsent', 'Cross-feature suite requires truthful contextual return baseline');
    assert(document.querySelector('#contextSurface').hidden, 'Cross-feature suite requires Terrain as primary stage baseline');
    const checks = [];

    const current = app.terrain.currentRef(); const children = app.terrain.childRefs(current); if (children.length) { const beforeSequence=app.terrain.transitionSnapshot().sequence,motionBefore=app.terrain.liveGeometrySnapshot(),visualCenter=(element)=>{if(!element?.isConnected)return null;const rect=element.getBoundingClientRect();return{left:rect.left+rect.width/2,top:rect.top+rect.height/2}},visualDistance=(point,center)=>point&&center?Math.hypot(point.left-center.left,point.top-center.top):null,targetElement=document.querySelector(`.e27-node[data-terrain-ref="${CSS.escape(children[0])}"]`),beforePeerRef=motionBefore.nodes.find((node)=>node.ref!==children[0])?.ref||null,peerElement=beforePeerRef?document.querySelector(`.e27-node[data-terrain-ref="${CSS.escape(beforePeerRef)}"]`):null,focusElement=document.querySelector('#terrainFocus'),beforeTargetVisual=visualCenter(targetElement),beforePeerVisual=visualCenter(peerElement),beforeFocusVisual=visualCenter(focusElement),travelPromise=app.terrain.travel(children[0], 'in'); await delay(130); const exiting=app.terrain.transitionSnapshot(),world=document.querySelector('#terrainWorld'),motionDuring=app.terrain.liveGeometrySnapshot(),beforeTarget=motionBefore.nodes.find((node)=>node.ref===children[0]),duringTarget=motionDuring.nodes.find((node)=>node.ref===children[0]),beforePeer=motionBefore.nodes.find((node)=>node.ref!==children[0]),duringPeer=beforePeer?motionDuring.nodes.find((node)=>node.ref===beforePeer.ref):null; assert(exiting.phase==='EXITING'&&exiting.fromRef===current&&exiting.toRef===children[0]&&exiting.sequence===beforeSequence+1,'D09 semantic travel did not expose a bounded EXITING transition'); assert(world.dataset.transitionPhase==='EXITING'&&Number(getComputedStyle(world).opacity)<1&&Number(getComputedStyle(world).opacity)>.55,'D09 spatial handoff should be visible without collapsing into a near-black world fade'); assertLiveEdgeAttachments('D09 semantic handoff in-flight'); const duringTargetVisual=visualCenter(targetElement),duringPeerVisual=visualCenter(peerElement),duringFocusVisual=visualCenter(focusElement),targetTravel=beforeTargetVisual&&duringTargetVisual?visualDistance(beforeTargetVisual,beforeFocusVisual)-visualDistance(duringTargetVisual,duringFocusVisual):null; assert(targetElement?.isConnected&&duringTargetVisual&&targetTravel>35,`D09 selected semantic object did not visibly travel toward current-context center before handoff: connected=${Boolean(targetElement?.isConnected)} visualBefore=${beforeTargetVisual?visualDistance(beforeTargetVisual,beforeFocusVisual):'missing'} visualDuring=${duringTargetVisual?visualDistance(duringTargetVisual,duringFocusVisual):'missing'} delta=${targetTravel} beforeTarget=${beforeTargetVisual?`${beforeTargetVisual.left},${beforeTargetVisual.top}`:'missing'} duringTarget=${duringTargetVisual?`${duringTargetVisual.left},${duringTargetVisual.top}`:'missing'} focus=${duringFocusVisual?`${duringFocusVisual.left},${duringFocusVisual.top}`:'missing'}`); const peerYield=beforePeerVisual&&duringPeerVisual?visualDistance(duringPeerVisual,duringFocusVisual)-visualDistance(beforePeerVisual,beforeFocusVisual):null; assert(!peerElement||!duringPeerVisual||peerYield>5,`D09 neighboring semantic objects did not visibly yield space during selected-object promotion: visualBefore=${beforePeerVisual?visualDistance(beforePeerVisual,beforeFocusVisual):'missing'} visualDuring=${duringPeerVisual?visualDistance(duringPeerVisual,duringFocusVisual):'missing'} delta=${peerYield}`); await travelPromise; const settled=app.terrain.transitionSnapshot(); assert(app.terrain.currentRef() === children[0], 'D09 semantic travel failed'); const settledChildRefs=app.terrain.childRefs(); for(const ref of settledChildRefs){const settledGap=worldRelationshipClearance(ref);assert(settledGap>=94,`D09 settled child Terrain-world boundary clearance collapsed below the spatial floor: ${ref}=${settledGap}`);} await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve))); const settledOpacity=Number(getComputedStyle(world).opacity),settledStyleOpacity=world.style.opacity; assert(settled.phase==='IDLE'&&settled.sequence===beforeSequence+1&&world.dataset.transitionPhase==='IDLE'&&settledStyleOpacity==='1'&&settledOpacity===1,`D09 semantic travel did not settle through ARRIVING to IDLE: phase=${settled.phase} sequence=${settled.sequence} expectedSequence=${beforeSequence+1} datasetPhase=${world.dataset.transitionPhase} styleOpacity=${settledStyleOpacity} computedOpacity=${settledOpacity}`); if(state.e28Poc01)state.e28Poc01.transition={fromRef:current,toRef:children[0],observedExit:exiting,settled}; const siblings = app.terrain.siblingRefs(); if (siblings.length > 1) { const beforeDepth = app.terrain.viewportProjection().semanticDepth; const moved = await app.terrain.navigateSibling('NEXT'); if (moved) assert(app.terrain.viewportProjection().semanticDepth === beforeDepth, 'D09 sibling travel changed hierarchy depth'); } }
    checks.push('D09 spatial entry/parent/sibling travel is semantic, keeps live relationship anchors attached, and exposes bounded exit/arrival choreography');

    app.terrain.setAutoEntryEnabled(false); const held = app.terrain.evaluateSemanticAutoEntry({ nodeRef: app.terrain.childRefs()[0] || null, visibilityRatio:1, confidence:1, direction:'IN' }); assert(held.committed === false && held.reason === 'OPTED_OUT', 'D10 auto-entry opt-out failed'); app.terrain.setAutoEntryEnabled(true); app.terrain.setAutoEntryThresholds({ visibilityThreshold:.72, confidenceThreshold:.8 }); const low = app.terrain.evaluateSemanticAutoEntry({ nodeRef: app.terrain.childRefs()[0] || null, visibilityRatio:.5, confidence:1, direction:'IN' }); assert(low.committed === false && low.reason === 'VISIBILITY_BELOW_THRESHOLD', 'D10 visible threshold failed');
    checks.push('D10 semantic auto-entry remains opt-in and thresholded');

    const preservedPrefix = structuredClone(app.navigation.fullJourney());
    const semanticBeforeControls = app.navigation.semanticFrame().selectedNodeRef;
    const beforeSummonCount = app.navigation.fullJourney().length;
    app.guide.summon();
    const summonFrame = app.navigation.semanticFrame();
    const summonEvent = app.navigation.fullJourney().at(-1);
    assert(summonFrame.selectedNodeRef === semanticBeforeControls, 'LIVED-A B2 Vex summon rewrote semantic current context');
    assert(summonEvent?.elementRef === 'element.vex.summon' && summonEvent.actionRef === 'action.vex.summon', 'LIVED-A B2 Vex summon provenance missing');
    assert(app.navigation.fullJourney().length === beforeSummonCount + 1, 'LIVED-A B2 Vex summon did not append Journey provenance');

    app.openContext('chat');
    const chatFrame = app.navigation.semanticFrame();
    const chatEvent = app.navigation.fullJourney().at(-1);
    assert(chatFrame.selectedNodeRef === semanticBeforeControls, 'LIVED-A B3 Chat entry rewrote semantic current context');
    assert(chatFrame.contextProjection === 'chat', 'LIVED-A B3 Chat context projection did not open');
    assert(chatEvent?.elementRef === 'element.nav.chat' && chatEvent.actionRef === 'action.view.select', 'LIVED-A B3 Chat entry provenance missing');

    const threadButton = document.querySelector('[data-node-ref="element.thread.open-conversation"]');
    assert(threadButton, 'LIVED-A B6 explicit Self Development thread selector unavailable');
    threadButton.click();
    await delay(0);
    const explicitSemanticFrame = app.navigation.semanticFrame();
    assert(explicitSemanticFrame.selectedNodeRef === 'terrain.thread.open-conversation', 'LIVED-A B6 explicit thread selector did not promote exact terrainNodeRef: '+explicitSemanticFrame.selectedNodeRef);
    assert(app.terrain.currentRef() === 'terrain.thread.open-conversation', 'LIVED-A B6 Terrain projection did not follow explicit semantic promotion');
    const explicitThreadEvent = app.navigation.fullJourney().at(-1);
    assert(explicitThreadEvent?.elementRef === 'element.thread.open-conversation' && explicitThreadEvent.interactionRef === 'interaction.thread.open-conversation', 'LIVED-A B6 explicit thread interaction provenance missing');

    const groupChannel = document.querySelector('[data-channel-ref="channel.self-development.group"]');
    assert(groupChannel, 'LIVED-A B5 group channel selector unavailable');
    groupChannel.click();
    await delay(0);
    const channelFrame = app.navigation.semanticFrame();
    const channelEvent = app.navigation.fullJourney().at(-1);
    assert(channelFrame.channelRef === 'channel.self-development.group', 'LIVED-A B5 exact channelRef was not selected');
    assert(channelFrame.selectedNodeRef === 'terrain.thread.open-conversation', 'LIVED-A B5 channel selector rewrote semantic current context');
    assert(channelEvent?.elementRef === 'element.channel.group', 'LIVED-A B5 channel selector provenance missing');

    const guideCurrent = app.guide.responseForIntent('intent.guide.current');
    assert(guideCurrent?.contentParams?.selectedNodeRef === 'terrain.thread.open-conversation', 'LIVED-A B7 Guide current-frame projection reports interaction source instead of semantic context');

    app.returnToTerrain();
    await delay(0);
    const returnFrame = app.navigation.semanticFrame();
    const returnEvent = app.navigation.fullJourney().at(-1);
    assert(returnFrame.contextProjection === null, 'LIVED-A B4 contextual surface did not return to Terrain');
    assert(returnFrame.selectedNodeRef === 'terrain.thread.open-conversation', 'LIVED-A B4 Terrain return rewrote semantic current context');
    assert(returnEvent?.elementRef === 'element.nav.terrain' && returnEvent.actionRef === 'action.view.select', 'LIVED-A B4 canonical Terrain return provenance missing');
    assert(JSON.stringify(app.navigation.fullJourney().slice(0, preservedPrefix.length)) === JSON.stringify(preservedPrefix), 'LIVED-A B8 historical Journey events were edited');
    checks.push('LIVED-A B2-B8 controls preserve semantic current context, retain exact interaction provenance, promote only explicit terrainNodeRef, and keep Journey append-only');

    return { suiteRef:this.suiteRef, state:'PASS', baselineRef:'baseline.vexlife.browser.context-return-plus-semantic-travel', checks };
  }
});

// [VXG RealForever]