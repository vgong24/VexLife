export const guideVexSuite = Object.freeze({
  suiteRef:'suite.vexlife.browser.guide-vex/v1',
  async run({ app, state, helpers:{ assert, overlaps, delay, selectLanguage } }) {
    assert(state.rootRef && app.terrain.currentRef() === state.rootRef, 'Guide/Vex suite requires canonical root baseline');
    const checks = [];
    const vex = document.querySelector('#guideWindow');
    assert(!vex.hidden, 'D05 visible Vex is absent on first render');
    assert(vex.classList.contains('is-minimized'), 'D05 first-render Vex is not ambient/minimized');
    const vexRect = vex.getBoundingClientRect();
    const protectedTargets = [document.querySelector('#terrainFocus'), ...document.querySelectorAll('.e27-node')].filter((node) => node?.getClientRects().length);
    assert(protectedTargets.every((node) => !overlaps(vexRect, node.getBoundingClientRect())), 'D05 ambient Vex obscures first-render Terrain content');
    checks.push('D05 one visible Vex starts ambient/minimized without obscuring Terrain');

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

    return { suiteRef:this.suiteRef, state:'PASS', baselineRef:'baseline.vexlife.browser.ambient-vex-first-render', checks };
  }
});

// [VXG RealForever]
