export const guideVexSuite = Object.freeze({
  suiteRef:'suite.vexlife.browser.guide-vex/v1',
  async run({ app, state, helpers:{ assert, overlaps, delay, selectLanguage, motionCssToken } }) {
    assert(state.rootRef && app.terrain.currentRef() === state.rootRef, 'Guide/Vex suite requires canonical root baseline');
    const checks = [];
    const vex = document.querySelector('#guideWindow');
    assert(!vex.hidden, 'D05 visible Vex is absent on first render');
    assert(vex.classList.contains('is-minimized'), 'D05 first-render Vex is not ambient/minimized');
    assert(app.guide.currentPresenceState()==='AMBIENT', 'Q3-01 first-render Vex is not in explicit AMBIENT state');
    assert(document.querySelector('#vexPresenceState')?.textContent===app.t('vex.presence.ambient'), 'Q3-01 AMBIENT state is not visibly projected');
    const vexRect = vex.getBoundingClientRect();
    const protectedTargets = [document.querySelector('#terrainFocus'), ...document.querySelectorAll('.e27-node')].filter((node) => node?.getClientRects().length);
    assert(protectedTargets.every((node) => !overlaps(vexRect, node.getBoundingClientRect())), 'D05 ambient Vex obscures first-render Terrain content');
    checks.push('D05 one visible Vex starts ambient/minimized without obscuring Terrain');
    checks.push('Q3-01 AMBIENT is the stable compact default and steals no focus');

    const nextIntent = 'intent.guide.next';
    const terrainFrame = app.navigation.semanticFrame();
    const terrainNext = app.guide.responseForIntent(nextIntent);
    assert(terrainFrame.screenRef === 'screen.vexlife.terrain', 'LC1 baseline is not the current Terrain frame');
    assert(terrainNext.recommendation?.state === 'AVAILABLE', 'LC2 current Terrain recommendation is not executable');
    assert(terrainNext.recommendation.actionRef === 'action.terrain.layout.reset', 'LC2 Terrain recommendation action identity drifted');
    assert(terrainNext.recommendation.targetNodeRef === 'element.terrain.reset', 'LC2 Terrain recommendation target identity drifted');
    assert(terrainNext.contentRef === 'terrain.reset', 'LC2 Terrain recommendation does not use the target-owned stable label');
    assert(!JSON.stringify(terrainNext).includes('collapse'), 'LC1 stale collapse recommendation leaked into current Guide truth');
    checks.push('LC1-LC2 Guide NEXT binds current Terrain advice to rendered reset action identity, never stale collapse copy');

    const resetTarget = document.querySelector('[data-node-ref="element.terrain.reset"]');
    assert(resetTarget && !resetTarget.disabled && resetTarget.getClientRects().length > 0, 'LC7 exact recommended reset target is not rendered and executable');
    app.terrain.setProjectionMode('rings');
    assert(app.terrain.viewportProjection().projectionMode === 'rings', 'LC7 precondition failed to create a non-canonical user layout projection');
    resetTarget.click();
    await delay(20);
    assert(app.terrain.viewportProjection().projectionMode === 'fan', 'LC7 clicking the exact recommended target did not perform the admitted reset effect');
    assert(app.terrain.currentRef() === state.rootRef, 'LC7 recommended reset effect changed canonical current context');
    checks.push('LC7 exact recommended rendered target executes only the bounded Terrain layout reset effect in Chromium');

    resetTarget.disabled = true;
    const disabledNext = app.guide.responseForIntent(nextIntent);
    assert(disabledNext.recommendation?.state === 'UNAVAILABLE', 'LC3 disabled current target was still recommended');
    assert(disabledNext.recommendation.evaluated?.[0]?.reason === 'RENDERED_TARGET_DISABLED', 'LC3 disabled target reason was not preserved');
    assert(disabledNext.contentRef === 'health.value.unavailable', 'LC3 disabled target did not surface explicit unavailable truth');
    resetTarget.disabled = false;
    checks.push('LC3 hidden/disabled/missing executability cannot be promoted into a Guide action recommendation');

    app.openContext('chat');
    const chatFrame = app.navigation.semanticFrame();
    const chatNext = app.guide.responseForIntent(nextIntent);
    assert(chatFrame.screenRef === 'screen.vexlife.chat', 'LC4 contextual Chat frame did not become semantically current');
    assert(chatNext.recommendation?.state === 'UNAVAILABLE', 'LC4 Chat inherited an executable Terrain recommendation');
    assert(chatNext.recommendation.evaluated?.[0]?.actionRef === 'action.messages.jump-latest', 'LC4 Chat did not evaluate its own current-frame action identity');
    assert(chatNext.recommendation.evaluated?.[0]?.reason === 'RENDERED_TARGET_MISSING', 'LC4 missing stable Chat target was not held truthfully');
    assert(!JSON.stringify(chatNext).includes('action.terrain.layout.reset'), 'LC4 stale Terrain recommendation carried into Chat');
    const permissionHeld = app.guide.evaluateActionTarget('element.chat.composer', chatFrame);
    assert(permissionHeld.actionRef === 'action.message.send' && permissionHeld.permissionRef === 'permission.conversation.send', 'LC5 canonical permission-bearing action identity was not resolved');
    assert(permissionHeld.state === 'UNAVAILABLE' && permissionHeld.reason === 'PERMISSION_NOT_ADMITTED_BY_GUIDE', 'LC5 Guide inferred action authority from canonical capability identity alone');
    checks.push('LC4-LC5 current contextual surface changes recommendation truth and Guide never mints permission from capability identity');
    app.returnToTerrain();
    assert(app.navigation.semanticFrame().screenRef === 'screen.vexlife.terrain', 'LC4 Terrain current frame was not restored after contextual proof');

    const availableLabels = [], unavailableLabels = [];
    for (const language of ['en','ja','zh']) {
      selectLanguage(language);
      const available = app.guide.responseForIntent(nextIntent);
      assert(available.recommendation?.state === 'AVAILABLE', `LC6 ${language} current action recommendation lost executable truth`);
      availableLabels.push(app.t(available.contentRef, available.contentParams));
      resetTarget.disabled = true;
      const unavailable = app.guide.responseForIntent(nextIntent);
      assert(unavailable.recommendation?.state === 'UNAVAILABLE', `LC6 ${language} held recommendation lost unavailable truth`);
      unavailableLabels.push(app.t(unavailable.contentRef, unavailable.contentParams));
      resetTarget.disabled = false;
    }
    assert(new Set(availableLabels).size === 3 && availableLabels.every(Boolean), 'LC6 EN/JA/ZH action recommendation labels are not localized distinctly');
    assert(new Set(unavailableLabels).size === 3 && unavailableLabels.every(Boolean), 'LC6 EN/JA/ZH unavailable recommendation state is not localized distinctly');
    selectLanguage('en');
    checks.push('LC6 EN/JA/ZH visible recommendation and unavailable states stay semantically aligned through existing stable localization refs');

    const semanticBeforeGuide = app.navigation.semanticFrame();
    app.guide.askIntent(nextIntent);
    const semanticAfterGuide = app.navigation.semanticFrame();
    assert(JSON.stringify(semanticAfterGuide) === JSON.stringify(semanticBeforeGuide), 'LC9 Guide interaction mutated semantic current context');
    checks.push('LC9 Guide interaction preserves LIVED-A semantic-current-context truth and does not promote interaction source');
    checks.push('LC8 Guide proof remains one mandatory owner-domain suite inside the fail-closed canonical integration composition');

    if (!app.state.guideMinimized) document.querySelector('#guideMinimize').click();
    app.guide.setAttentionSource(null);
    const focusBeforeAttention = document.activeElement;
    app.guide.setAttentionSource('element.terrain.reset');
    assert(app.guide.currentPresenceState()==='ATTENTIVE', 'Q3-02 source-addressable attention did not reach ATTENTIVE');
    assert(app.state.guideMinimized===true && vex.classList.contains('is-minimized'), 'Q3-02 ATTENTIVE automatically expanded the vessel');
    assert(document.activeElement===focusBeforeAttention, 'Q3-02 ATTENTIVE stole focus');
    assert(document.querySelector('#vexPresenceState')?.textContent===app.t('vex.presence.attentive'), 'Q3-02 ATTENTIVE cue is not visibly named');
    checks.push('Q3-02 ATTENTIVE is a bounded source-addressable compact cue with no automatic expansion or focus theft');

    app.guide.summon();
    await delay(20);
    assert(app.guide.currentPresenceState()==='SUMMONED' && !app.state.guideMinimized && !vex.hidden, 'Q3-03 explicit summon did not reach SUMMONED on the same Vex');
    assert(document.querySelector('#vexPresenceState')?.textContent===app.t('vex.presence.summoned'), 'Q3-03 SUMMONED state is not visibly named');
    checks.push('Q3-03 explicit human summon reaches SUMMONED on the same visible Vex');

    app.guide.askIntent(nextIntent);
    assert(app.guide.currentPresenceState()==='ACTIVE_CONVERSATION', 'Q3-04 explicit Guide interaction did not reach ACTIVE_CONVERSATION');
    assert(document.querySelector('#vexPresenceState')?.textContent===app.t('vex.presence.active-conversation'), 'Q3-04 ACTIVE_CONVERSATION is not visibly named');
    checks.push('Q3-04 explicit Guide interaction reaches ACTIVE_CONVERSATION without a new persona or runtime');

    const expandedWitnessWidth = Math.max(360, Math.min(560, innerWidth - 40));
    const expandedWitnessHeight = Math.max(380, Math.min(640, innerHeight - 40));
    vex.style.width = `${expandedWitnessWidth}px`;
    vex.style.height = `${expandedWitnessHeight}px`;
    const expandedPreference = app.guide.persistPreferredGeometry();
    const expandedRect = vex.getBoundingClientRect();
    resetTarget.focus();
    const focusBeforeMinimize = document.activeElement;
    document.querySelector('#guideMinimize').click();
    await delay(20);
    const minimizedRect = vex.getBoundingClientRect();
    assert(minimizedRect.height <= 80 && minimizedRect.height < expandedRect.height * .4, `VREG-01 minimized Vex retained expanded outer geometry: ${JSON.stringify({ expanded:{width:expandedRect.width,height:expandedRect.height}, minimized:{width:minimizedRect.width,height:minimizedRect.height}, inline:{width:vex.style.width,height:vex.style.height} })}`);
    assert(document.querySelector('#guideComposer').getClientRects().length===0 && document.querySelector('#guideMessages').getClientRects().length===0, 'VREG-02 minimized Vex retained rendered body/composer content');
    const preferredWhileMinimized = app.guide.preferredGeometry();
    assert(preferredWhileMinimized && Math.abs(preferredWhileMinimized.width-expandedPreference.width)<=1 && Math.abs(preferredWhileMinimized.height-expandedPreference.height)<=1, 'VREG-03 compact projection overwrote expanded preferred geometry');
    assert(document.activeElement===focusBeforeMinimize, 'VREG-07 minimize stole focus from the current external control');
    document.querySelector('#guideMinimize').click();
    await delay(20);
    const restoredWitnessRect = vex.getBoundingClientRect();
    assert(!app.state.guideMinimized && restoredWitnessRect.height >= Math.min(expandedPreference.height, innerHeight-24)-2, `VREG-04 restore did not recover usable expanded geometry: ${JSON.stringify({preferred:expandedPreference,restored:{width:restoredWitnessRect.width,height:restoredWitnessRect.height}})}`);
    assert(document.querySelector('#guideComposer').getClientRects().length>0, 'VREG-04 restored Vex composer is not usable');
    document.querySelector('#guideMinimize').click();
    await delay(20);
    checks.push('VREG-01/VREG-02 non-default expanded geometry minimizes to one compact outer vessel with body/composer absent');
    checks.push('VREG-03/VREG-04 compact projection preserves expanded preference and exact summon/restore recovery');
    checks.push('VREG-07 minimize is keyboard/focus safe; existing Q3 proof preserves viewport/reduced-motion/close semantics');

    app.guide.setAttentionSource('element.terrain.reset');
    assert(app.state.guideMinimized===true && app.guide.currentPresenceState()==='ATTENTIVE', 'Q3-05 attention overrode explicit minimize');
    document.querySelector('#guideClose').click();
    app.guide.setAttentionSource('element.terrain.reset');
    assert(vex.hidden && app.guide.currentPresenceState()===null, 'Q3-05 attention reopened explicitly dismissed Vex');
    app.guide.summon();
    await delay(20);
    assert(!vex.hidden && !app.state.guideMinimized && app.guide.currentPresenceState()==='SUMMONED', 'Q3-05 later explicit summon did not reverse prior dismiss');
    checks.push('Q3-05 explicit minimize/dismiss outranks automatic attention until a later explicit human summon');

    app.guide.avoidDeclaredControls();
    const preferred = app.guide.persistPreferredGeometry();
    const persistedPreferred = localStorage.getItem('vexlife.guide.geometry');
    assert(persistedPreferred && JSON.parse(persistedPreferred).left===preferred.left, 'Q3-06 explicit preferred geometry did not persist');
    const semanticBeforeGeometry = JSON.stringify(app.navigation.semanticFrame());
    const journeyBeforeGeometry = app.navigation.fullJourney().length;
    const focus = document.querySelector('#terrainFocus');
    assert(focus?.getClientRects().length, 'Q3-07 rendered Terrain focus fixture unavailable');
    const isolationSelector = '.topbar, .terrain-toolbar, .terrain-journey-window, .terrain-adjacent-card:not([hidden]), .terrain-detail-drawer.is-open, .terrain-journey-drawer.is-open, .project-rail[aria-hidden="false"], .context-projection:not([hidden]), .e27-appbar, .e27-breadcrumb, .e27-zoom-rail, .e27-node, .e27-adjacent-card, .e27-recentbar, .e27-context-surface:not([hidden]), .e27-surface-menu:not([hidden]), .e27-terrain-context:not([hidden]), .e27-drawer.show';
    const isolatedPeers = [...document.querySelectorAll(isolationSelector)].filter((node)=>node!==focus && node!==vex && !vex.contains(node));
    const priorDisplays = isolatedPeers.map((node)=>[node,node.style.display]);
    for (const [node] of priorDisplays) node.style.display='none';
    try {
      vex.style.left='12px'; vex.style.top='92px'; vex.style.right='auto'; vex.style.bottom='auto';
      const controlledPreferred = app.guide.persistPreferredGeometry();
      const controlledStored = localStorage.getItem('vexlife.guide.geometry');
      const focusRect = focus.getBoundingClientRect();
      const preferredRect = {
        left:controlledPreferred.left,
        top:controlledPreferred.top,
        right:controlledPreferred.left+controlledPreferred.width,
        bottom:controlledPreferred.top+controlledPreferred.height
      };
      assert(!overlaps(preferredRect,focusRect), 'Q3-07 controlled preferred anchor is not actually safe from rendered Terrain focus');
      vex.style.left=String(focusRect.left)+'px'; vex.style.top=String(focusRect.top)+'px'; vex.style.right='auto'; vex.style.bottom='auto';
      assert(overlaps(vex.getBoundingClientRect(),focusRect), 'Q3-07 rendered Terrain obstruction fixture does not actually overlap Vex');
      const autoMoved = app.guide.avoidDeclaredControls({recoverPreferred:false});
      assert(autoMoved===true, 'Q3-07 rendered Terrain obstruction did not produce a transient resolved placement');
      const resolved = app.guide.resolvedGeometry();
      assert(resolved.resolution==='AUTO_OBSTRUCTION_RESOLVED', 'Q3-07 resolved geometry does not identify automatic obstruction resolution');
      const epsilon = 1.1;
      assert(Math.abs(resolved.left-controlledPreferred.left)<=epsilon && Math.abs(resolved.top-controlledPreferred.top)<=epsilon, 'Q3-07 deterministic resolver did not select the known-safe controlled preferred anchor');
      assert(localStorage.getItem('vexlife.guide.geometry')===controlledStored, 'Q3-07 automatic obstruction resolution overwrote preferred geometry');
      assert(Math.abs(vex.getBoundingClientRect().left-controlledPreferred.left)<=epsilon && Math.abs(vex.getBoundingClientRect().top-controlledPreferred.top)<=epsilon, 'Q3-08 preferred geometry was not recovered by the same safe automatic resolution');
      assert(localStorage.getItem('vexlife.guide.geometry')===controlledStored, 'Q3-08 preferred storage changed during same-cycle recovery');
    } finally {
      for (const [node,display] of priorDisplays) node.style.display=display;
    }
    assert(JSON.stringify(app.navigation.semanticFrame())===semanticBeforeGeometry && app.navigation.fullJourney().length===journeyBeforeGeometry, 'Q3-10 geometry adaptation mutated semantic current context or Journey');
    checks.push('Q3-06 explicit human geometry is the only persisted preference');
    checks.push('Q3-07 real rendered Terrain obstruction resolves transiently to a known-safe preferred anchor without overwriting preferredGeometry');
    checks.push('Q3-08 the same safe automatic resolution recovers preferredGeometry while preserving storage; compact-to-wide recovery is independently executed by the bounded viewport proof');
    checks.push('Q3-10 Vex geometry adaptation leaves semantic current context and Journey unchanged');

    const stateLabels = {};
    for (const language of ['en','ja','zh']) {
      selectLanguage(language);
      app.guide.projectPresenceState();
      stateLabels[language]=['vex.presence.ambient','vex.presence.attentive','vex.presence.summoned','vex.presence.active-conversation'].map((ref)=>app.t(ref));
      assert(stateLabels[language].every((label)=>label && !label.startsWith('[')), `Q3-12 ${language} vessel-state localization has a fallback hole`);
    }
    assert(new Set(Object.values(stateLabels).flat()).size>=8, 'Q3-12 EN/JA/ZH vessel-state copy is not materially localized');
    selectLanguage('en');
    assert(motionCssToken('--motion-duration-layout') && motionCssToken('--motion-ease-responsive'), 'Q3-11 accepted Q6 shared motion vocabulary is unavailable');
    checks.push('Q3-11 Q3 consumes the accepted shared motion/reduced-motion vocabulary without motion-dependent meaning');
    checks.push('Q3-12 EN/JA/ZH visible and nonvisual vessel-state copy remains aligned');
    checks.push('Q3-13 Guide/Vex Q3 proof remains fail-closed inside one canonical owner-domain suite');
    checks.push('Q3-14 accepted LIVED-C recommendation/current-frame truth remains unchanged');

    app.guide.setAttentionSource(null);
    if (!app.state.guideMinimized) document.querySelector('#guideMinimize').click();
    assert(app.guide.currentPresenceState()==='AMBIENT', 'Q3 cleanup did not restore ambient minimized Vex');

    return { suiteRef:this.suiteRef, state:'PASS', baselineRef:'baseline.vexlife.browser.ambient-vex-first-render', checks };
  }
});

// [VXG RealForever]
