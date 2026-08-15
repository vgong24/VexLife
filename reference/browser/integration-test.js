const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const click = (selector) => { const element = document.querySelector(selector); assert(element, `Missing ${selector}`); element.click(); return element; };
const selectLanguage = (language) => { const select = document.querySelector('#languageSelect'); select.value = language; select.dispatchEvent(new Event('change', { bubbles: true })); };
const selectedMessageList = (app) => app.messages.get(`${app.state.projectRef}::${app.state.threadRef}::${app.state.channelRef}`);
const overlaps = (left, right) => !(left.right <= right.left || left.left >= right.right || left.bottom <= right.top || left.top >= right.bottom);
const worldRect = ({ left, top, width, height }) => ({ left:left-width/2, right:left+width/2, top:top-height/2, bottom:top+height/2 });
const pointOnBoundary = (rect, x, y, epsilon=1.1) => x >= rect.left-epsilon && x <= rect.right+epsilon && y >= rect.top-epsilon && y <= rect.bottom+epsilon && [Math.abs(x-rect.left),Math.abs(x-rect.right),Math.abs(y-rect.top),Math.abs(y-rect.bottom)].some((distance)=>distance<=epsilon);
const renderedPixelClose = (actual, expected, epsilon=.02) => Math.abs(actual-expected) <= epsilon;
const geometryDifferences = (expected, actual, epsilon=.35) => {
  const differences = [], exact = (path,left,right) => { if (left !== right) differences.push({path,left,right}); }, numeric = (path,left,right,tolerance=epsilon) => { if (!Number.isFinite(left) || !Number.isFinite(right) || Math.abs(left-right) > tolerance) differences.push({path,left,right,tolerance}); };
  exact('currentRef', expected.currentRef, actual.currentRef); exact('projectionMode', expected.projectionMode, actual.projectionMode); exact('manualOverrideRef', expected.manualOverrideRef, actual.manualOverrideRef);
  exact('current.role', expected.current.role, actual.current.role); for (const key of ['left','top','width','height']) numeric(`current.${key}`, expected.current[key], actual.current[key]);
  const actualNodes = new Map(actual.nodes.map((node)=>[node.ref,node]));
  for (const node of expected.nodes) { const next=actualNodes.get(node.ref); if(!next){differences.push({path:`nodes.${node.ref}`,left:'present',right:'missing'});continue;} for(const key of ['role','relevanceReason','relevanceScore','manualOverride']) exact(`nodes.${node.ref}.${key}`,node[key],next[key]); for(const key of ['left','top','width','height']) numeric(`nodes.${node.ref}.${key}`,node[key],next[key]); exact(`nodes.${node.ref}.localOffset.x`,node.localOffset?.x??0,next.localOffset?.x??0); exact(`nodes.${node.ref}.localOffset.y`,node.localOffset?.y??0,next.localOffset?.y??0); }
  exact('nodeCount', expected.nodes.length, actual.nodes.length);
  const actualEdges = new Map(actual.edges.map((edge)=>[edge.ref,edge])); for(const edge of expected.edges){const next=actualEdges.get(edge.ref);if(!next){differences.push({path:`edges.${edge.ref}`,left:'present',right:'missing'});continue;}for(const key of ['x1','y1','x2','y2'])numeric(`edges.${edge.ref}.${key}`,edge[key],next[key],.75);} exact('edgeCount',expected.edges.length,actual.edges.length);
  return differences;
};
const geometryIdentity = (snapshot) => JSON.stringify({ current:snapshot.current, nodes:snapshot.nodes.map(({ ref,role,relevanceReason,relevanceScore,left,top,width,height,localOffset })=>({ref,role,relevanceReason,relevanceScore,left,top,width,height,localOffset})), edges:snapshot.edges, projectionMode:snapshot.projectionMode, manualOverrideRef:snapshot.manualOverrideRef });
const radialDistance = ({ left, top }) => Math.hypot(left-600,top-400);
const assertSettledGeometry = (snapshot, label) => { const rects=[worldRect(snapshot.current),...snapshot.nodes.map(worldRect)]; for(let i=0;i<rects.length;i++) for(let j=i+1;j<rects.length;j++) assert(!overlaps(rects[i],rects[j]), `${label} settled geometry overlap ${i}/${j}`); for(const edge of snapshot.edges){const node=snapshot.nodes.find((candidate)=>candidate.ref===edge.ref);assert(node,`${label} edge missing node ${edge.ref}`);assert(pointOnBoundary(worldRect(snapshot.current),edge.x1,edge.y1),`${label} edge ${edge.ref} does not leave actual current geometry`);assert(pointOnBoundary(worldRect(node),edge.x2,edge.y2),`${label} edge ${edge.ref} does not terminate on actual node geometry`);} };

export async function runBrowserIntegration() {
  const host = document.createElement('pre'); host.id = 'integrationReceipt'; host.dataset.state = 'RUNNING'; document.body.append(host);
  const app = globalThis.__VEXLIFE_APP__; const checks = []; let e28Poc01 = null;
  try {
    assert(app.rootContract?.contractRef === 'contract.vexlife.e27.authoritative-root/v1', 'D01 authoritative E2.7 contract missing');
    assert(document.querySelector('.e27-appbar') && document.querySelector('.e27-terrain') && document.querySelector('.e27-world') && document.querySelector('.e27-focus'), 'D01 direct-root body missing');
    assert(!document.querySelector('.context-nav'), 'D01 legacy top-tab nav survived');
    assert(!document.querySelector('.project-rail'), 'D01 legacy persistent project rail survived');
    assert(document.querySelector('#contextSurface').hidden, 'D01 contextual surface open by default');
    checks.push('D01 exact E2.7 body is the first rendered product surface');

    const rootRef = app.terrain.rootRef; assert(app.terrain.currentRef() === rootRef, 'D02 Terrain did not start at canonical root');
    const rootChildren = app.terrain.childRefs(rootRef); assert(rootChildren.length > 1, 'D02 canonical root lacks child topology');
    assert(document.querySelectorAll('.e27-node').length === rootChildren.length, 'D02 rendered children do not match canonical topology');
    checks.push('D02 canonical VexLife topology is projected into the E2.7 body');

    assert(!document.body.textContent.includes('VexOrg Demo Company') && !document.body.textContent.includes('Maya Chen'), 'D03 mock VexOrg product data leaked into product');
    checks.push('D03 mock E2.7 review data is excluded from product truth');

    const initialJourney = app.navigation.fullJourney();
    assert(initialJourney.length >= 1, 'D04 initial current context missing from journey');
    assert(initialJourney[0].after?.selectedNodeRef === rootRef, 'D04 initial journey does not bind canonical root context');
    assert(document.querySelector('#terrainJourneyStatus').textContent !== '0 total', 'D04 first-render journey still reports zero');
    checks.push('D04 initial current semantic context is seeded into the append-only journey');

    const vex = document.querySelector('#guideWindow');
    assert(!vex.hidden, 'D05 visible Vex is absent on first render');
    assert(vex.classList.contains('is-minimized'), 'D05 first-render Vex is not ambient/minimized');
    const vexRect = vex.getBoundingClientRect();
    const protectedTargets = [document.querySelector('#terrainFocus'), ...document.querySelectorAll('.e27-node')].filter((node) => node?.getClientRects().length);
    assert(protectedTargets.every((node) => !overlaps(vexRect, node.getBoundingClientRect())), 'D05 ambient Vex obscures first-render Terrain content');
    checks.push('D05 one visible Vex starts ambient/minimized without obscuring Terrain');

    const canonical = app.terrain.geometrySnapshot();
    assert(canonical.current.role === 'CURRENT_CONTEXT', 'P02 current context geometry role missing');
    const near = canonical.nodes.find((node)=>node.role === 'NEAR_CONTEXT' && node.relevanceReason === 'CURRENT_WORK_MATCH');
    const peripheral = canonical.nodes.find((node)=>node.role === 'PERIPHERAL_CONTEXT');
    const structuralPeripheral = canonical.nodes.find((node)=>app.terrain.childRefs(node.ref).length>0 && node.role === 'PERIPHERAL_CONTEXT');
    assert(near && peripheral, 'P02 accepted root context must expose both relevant and peripheral comparison nodes');
    assert(near.relevanceReason === 'CURRENT_WORK_MATCH', 'P02 strongest adjacent relevance is not bound to exact current-work semantic truth');
    assert(structuralPeripheral, 'P02 descendant-bearing unrelated node was still promoted merely because it has descendants');
    assert(canonical.current.width > near.width && near.width > peripheral.width, 'P02 adaptive geometry strength ordering failed');
    assert(radialDistance(near) + 24 < radialDistance(structuralPeripheral), 'P02 semantic relevance does not materially alter spatial accommodation');
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
    const journeyBeforeReset=app.navigation.fullJourney().length; app.terrain.reset(); const resetGeometry=app.terrain.geometrySnapshot();
    assert(resetGeometry.manualOverrideRef===null && Object.keys(app.state.terrain.localOffsets).length===0, 'P10 reset did not clear bounded manual geometry state');
    const canonicalResetNode=canonical.nodes.find((node)=>node.ref===peripheral.ref),resetDuringNode=resetGeometry.nodes.find((node)=>node.ref===peripheral.ref);
    assert(canonicalResetNode&&resetDuringNode&&resetDuringNode.role===canonicalResetNode.role&&resetDuringNode.relevanceReason===canonicalResetNode.relevanceReason,'P10 reset did not restore canonical semantic geometry state before visual settlement');
    assert(resetDuringNode.width>canonicalResetNode.width+20&&resetDuringNode.height>canonicalResetNode.height+20,'P10 reset recovery animation did not visibly depart from the prior manual geometry toward canonical geometry');
    await delay(380); const settledResetGeometry=app.terrain.geometrySnapshot(),resetDifferences=geometryDifferences(canonical,settledResetGeometry); assert(resetDifferences.length===0, `P10 reset did not settle to canonical adaptive choreography: ${JSON.stringify(resetDifferences.slice(0,12))}`);
    assert(app.navigation.fullJourney().length===journeyBeforeReset && app.terrain.currentRef()===currentBeforePin, 'P12 pure geometry reset changed semantic journey or current context');
    checks.push('P09-P12 bounded manual override wins, local offset stays truthful, reset recovers canonical choreography, semantic refs stay stable');

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
    const mobileTerrainRect=mobileTerrain.getBoundingClientRect(),mobileFocusRect=mobileFocus.getBoundingClientRect(); assert(mobileFocusRect.right>mobileTerrainRect.left && mobileFocusRect.left<mobileTerrainRect.right && mobileFocusRect.bottom>mobileTerrainRect.top && mobileFocusRect.top<mobileTerrainRect.bottom, 'P15 current context is not visible in mobile Terrain viewport');
    const mobileEvidence={viewport:{width:mobileWindow.innerWidth,height:mobileWindow.innerHeight},documentScrollWidth:mobileDocument.documentElement.scrollWidth,currentRole:mobileFocus.dataset.adaptiveGeometry,nodeCount:mobileDocument.querySelectorAll('.e27-node').length,vexAmbient:mobileVex.classList.contains('is-minimized')}; mobileFrame.remove();
    checks.push('P15 accepted E2.7 mobile first-render Terrain usability remains present at a real 390px Chromium browsing context');
    e28Poc01={schemaVersion:'vexlife.e28-poc01.browser-proof/v1',semanticContextRef:rootRef,canonical,projectionProofs,offset:offsetGeometry,pinned,recovered:resetGeometry,reducedMotion:reducedSnapshot,mobile:mobileEvidence};

    app.openContext('chat'); await delay(0);
    assert(!document.querySelector('#contextSurface').hidden && !document.querySelector('#view-chat').hidden, 'D06 chat contextual surface did not open');
    assert(document.querySelector('.e27-terrain'), 'D06 chat replaced Terrain body');
    const input = document.querySelector('#messageInput'); const composer = document.querySelector('#composer'); const send = composer.querySelector('button[type="submit"]');
    const list = selectedMessageList(app); const count = list.length; input.value = 'integration.unsent'; input.dispatchEvent(new Event('input', { bubbles:true })); composer.requestSubmit(); await delay(220);
    assert(list.length === count, 'D07 unavailable submit appended message'); assert(send.disabled, 'D07 unavailable send not disabled'); assert(app.state.unsentLocalDraft?.state === 'UNSENT_LOCAL_DRAFT', 'D07 unsent draft truth missing');
    checks.push('D06 conversation is a contextual projection over Terrain','D07 truthful unavailable draft semantics survive direct-root composition');

    app.returnToTerrain(); await delay(0); assert(document.querySelector('#contextSurface').hidden, 'D08 context did not return to Terrain'); assert(input.value === 'integration.unsent', 'D08 contextual return lost draft');
    const current = app.terrain.currentRef(); const children = app.terrain.childRefs(current); if (children.length) { const beforeSequence=app.terrain.transitionSnapshot().sequence,motionBefore=app.terrain.liveGeometrySnapshot(),visualCenter=(element)=>{if(!element?.isConnected)return null;const rect=element.getBoundingClientRect();return{left:rect.left+rect.width/2,top:rect.top+rect.height/2}},visualDistance=(point,center)=>point&&center?Math.hypot(point.left-center.left,point.top-center.top):null,targetElement=document.querySelector(`.e27-node[data-terrain-ref="${CSS.escape(children[0])}"]`),beforePeerRef=motionBefore.nodes.find((node)=>node.ref!==children[0])?.ref||null,peerElement=beforePeerRef?document.querySelector(`.e27-node[data-terrain-ref="${CSS.escape(beforePeerRef)}"]`):null,focusElement=document.querySelector('#terrainFocus'),beforeTargetVisual=visualCenter(targetElement),beforePeerVisual=visualCenter(peerElement),beforeFocusVisual=visualCenter(focusElement),travelPromise=app.terrain.travel(children[0], 'in'); await delay(130); const exiting=app.terrain.transitionSnapshot(),world=document.querySelector('#terrainWorld'),motionDuring=app.terrain.liveGeometrySnapshot(),beforeTarget=motionBefore.nodes.find((node)=>node.ref===children[0]),duringTarget=motionDuring.nodes.find((node)=>node.ref===children[0]),beforePeer=motionBefore.nodes.find((node)=>node.ref!==children[0]),duringPeer=beforePeer?motionDuring.nodes.find((node)=>node.ref===beforePeer.ref):null; assert(exiting.phase==='EXITING'&&exiting.fromRef===current&&exiting.toRef===children[0]&&exiting.sequence===beforeSequence+1,'D09 semantic travel did not expose a bounded EXITING transition'); assert(world.dataset.transitionPhase==='EXITING'&&Number(getComputedStyle(world).opacity)<1&&Number(getComputedStyle(world).opacity)>.55,'D09 spatial handoff should be visible without collapsing into a near-black world fade'); const duringTargetVisual=visualCenter(targetElement),duringPeerVisual=visualCenter(peerElement),duringFocusVisual=visualCenter(focusElement),targetTravel=beforeTargetVisual&&duringTargetVisual?visualDistance(beforeTargetVisual,beforeFocusVisual)-visualDistance(duringTargetVisual,duringFocusVisual):null; assert(targetElement?.isConnected&&duringTargetVisual&&targetTravel>35,`D09 selected semantic object did not visibly travel toward current-context center before handoff: connected=${Boolean(targetElement?.isConnected)}  visualBefore=${beforeTargetVisual?visualDistance(beforeTargetVisual,beforeFocusVisual):'missing'} visualDuring=${duringTargetVisual?visualDistance(duringTargetVisual,duringFocusVisual):'missing'} delta=${targetTravel} beforeTarget=${beforeTargetVisual?`${beforeTargetVisual.left},${beforeTargetVisual.top}`:'missing'} duringTarget=${duringTargetVisual?`${duringTargetVisual.left},${duringTargetVisual.top}`:'missing'} focus=${duringFocusVisual?`${duringFocusVisual.left},${duringFocusVisual.top}`:'missing'}`); const peerYield=beforePeerVisual&&duringPeerVisual?visualDistance(duringPeerVisual,duringFocusVisual)-visualDistance(beforePeerVisual,beforeFocusVisual):null; assert(!peerElement||!duringPeerVisual||peerYield>5,`D09 neighboring semantic objects did not visibly yield space during selected-object promotion: visualBefore=${beforePeerVisual?visualDistance(beforePeerVisual,beforeFocusVisual):'missing'} visualDuring=${duringPeerVisual?visualDistance(duringPeerVisual,duringFocusVisual):'missing'} delta=${peerYield}`); await travelPromise; const settled=app.terrain.transitionSnapshot(); assert(app.terrain.currentRef() === children[0], 'D09 semantic travel failed'); await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve))); const settledOpacity=Number(getComputedStyle(world).opacity),settledStyleOpacity=world.style.opacity; assert(settled.phase==='IDLE'&&settled.sequence===beforeSequence+1&&world.dataset.transitionPhase==='IDLE'&&settledStyleOpacity==='1'&&settledOpacity===1,`D09 semantic travel did not settle through ARRIVING to IDLE: phase=${settled.phase} sequence=${settled.sequence} expectedSequence=${beforeSequence+1} datasetPhase=${world.dataset.transitionPhase} styleOpacity=${settledStyleOpacity} computedOpacity=${settledOpacity}`); if(e28Poc01)e28Poc01.transition={fromRef:current,toRef:children[0],observedExit:exiting,settled}; const siblings = app.terrain.siblingRefs(); if (siblings.length > 1) { const beforeDepth = app.terrain.viewportProjection().semanticDepth; const moved = await app.terrain.navigateSibling('NEXT'); if (moved) assert(app.terrain.viewportProjection().semanticDepth === beforeDepth, 'D09 sibling travel changed hierarchy depth'); } }
    checks.push('D08 contextual return preserves content state','D09 spatial entry/parent/sibling travel is semantic and exposes bounded exit/arrival choreography');

    app.terrain.setAutoEntryEnabled(false); const held = app.terrain.evaluateSemanticAutoEntry({ nodeRef: app.terrain.childRefs()[0] || null, visibilityRatio:1, confidence:1, direction:'IN' }); assert(held.committed === false && held.reason === 'OPTED_OUT', 'D10 auto-entry opt-out failed'); app.terrain.setAutoEntryEnabled(true); app.terrain.setAutoEntryThresholds({ visibilityThreshold:.72, confidenceThreshold:.8 }); const low = app.terrain.evaluateSemanticAutoEntry({ nodeRef: app.terrain.childRefs()[0] || null, visibilityRatio:.5, confidence:1, direction:'IN' }); assert(low.committed === false && low.reason === 'VISIBILITY_BELOW_THRESHOLD', 'D10 visible threshold failed');
    checks.push('D10 semantic auto-entry remains opt-in and thresholded');

    for (const language of ['en','zh','ja']) { selectLanguage(language); assert(document.documentElement.lang === language, `D11 ${language} localization state missing`); }
    selectLanguage('en');
    assert(!document.querySelector('#guideWindow').hidden && document.querySelector('#guideWindow').textContent.includes(app.t('vex.visible.name')), 'D12 ambient Vex not visible');
    checks.push('D11 localization remains stable','D12 one visible Vex occupies the E2.7 ambient vessel');

    const result = { schemaVersion:'vexlife.e27-direct-root-browser-integration/v1', state:'PASS', checks, presentationFoundation:'EXACT_E2_7_ROOT_BODY', currentNodeRef:app.terrain.currentRef(), currentFrame:app.navigation.semanticFrame(), initialJourneyCount:initialJourney.length, initialVexState:'AMBIENT_MINIMIZED', e28Poc01 };
    host.dataset.state='PASS'; host.textContent=JSON.stringify(result,null,2); globalThis.__VEXLIFE_INTEGRATION_RESULT__=result; return result;
  } catch (error) {
    const result={schemaVersion:'vexlife.e27-direct-root-browser-integration/v1',state:'FAIL',error:error instanceof Error?error.message:String(error),checks,e28Poc01};host.dataset.state='FAIL';host.textContent=JSON.stringify(result,null,2);globalThis.__VEXLIFE_INTEGRATION_RESULT__=result;throw error;
  }
}

// [VXG RealForever]