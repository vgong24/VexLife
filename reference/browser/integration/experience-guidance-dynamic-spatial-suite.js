export const experienceGuidanceDynamicSpatialSuite = Object.freeze({
  suiteRef:'suite.vexlife.browser.experience-guidance-dynamic-spatial/v1',
  async run({ app, helpers:{ assert, delay } }) {
    const checks = [];
    app.returnToTerrain();
    app.guide.summon();
    await delay(20);

    const currentHelp = document.querySelector('[data-guide-intent-ref="intent.guide.current"]');
    assert(currentHelp, 'EFX01D-D3 existing CURRENT Help control is missing');

    const semanticBefore = JSON.stringify(app.navigation.semanticFrame());
    const journeyBefore = JSON.stringify(app.navigation.fullJourney());
    const guideMessagesBefore = document.querySelectorAll('#guideMessages .guide-message').length;

    currentHelp.click();
    await delay(20);
    const first = document.querySelector('[data-vex-human-projection-transient="true"]');
    assert(first?.getClientRects().length > 0, 'EFX01D-D3 repeated CURRENT Help did not keep one visible teaching surface');
    assert(first.dataset.interactionFamily === 'ZOOM', `EFX01D-D3 second Terrain teaching cue did not advance to ZOOM: ${first.dataset.interactionFamily ?? 'missing'}`);
    assert(first.dataset.gestureRef === 'gesture.vexlife.terrain-zoom', 'EFX01D-D3 ZOOM teaching did not consume the accepted terrain-zoom owner');
    assert(first.dataset.actionRef === 'action.terrain.canvas.zoom', 'EFX01D-D3 ZOOM teaching action owner drifted');
    assert(first.textContent === app.t('gesture.terrain-zoom.help'), 'EFX01D-D3 ZOOM teaching did not reuse accepted localized help copy');

    currentHelp.click();
    await delay(20);
    const second = document.querySelector('[data-vex-human-projection-transient="true"]');
    assert(second?.getClientRects().length > 0, 'EFX01D-D3 semantic-depth teaching surface disappeared');
    assert(second.dataset.interactionFamily === 'SEMANTIC_DEPTH_SHIFT', `EFX01D-D3 third Terrain teaching cue did not advance to SEMANTIC_DEPTH_SHIFT: ${second.dataset.interactionFamily ?? 'missing'}`);
    assert(second.dataset.gestureRef === 'gesture.vexlife.terrain-semantic-depth', 'EFX01D-D3 semantic-depth teaching did not consume the accepted gesture owner');
    assert(second.dataset.actionRef === 'action.terrain.semantic-depth.set', 'EFX01D-D3 semantic-depth action owner drifted');
    assert(second.textContent === app.t('gesture.terrain-semantic-depth.help'), 'EFX01D-D3 semantic-depth teaching did not reuse accepted localized help copy');

    assert(document.querySelectorAll('[data-vex-human-projection-transient="true"]').length === 1, 'EFX01D-D3 produced more than one visible teaching surface');
    assert(JSON.stringify(app.navigation.semanticFrame()) === semanticBefore, 'EFX01D-D3 dynamic teaching changed semantic current context');
    assert(JSON.stringify(app.navigation.fullJourney()) === journeyBefore, 'EFX01D-D3 dynamic teaching wrote Journey state');
    assert(document.querySelectorAll('#guideMessages .guide-message').length === guideMessagesBefore + 4, 'EFX01D-D3 repeated explicit Help did not preserve exactly one canonical user/Guide pair per request');

    checks.push('EFX01D-D3 repeated explicit CURRENT Help advances through accepted Terrain ZOOM and SEMANTIC_DEPTH_SHIFT owners');
    checks.push('EFX01D-D3 preserves one transient teaching surface, canonical Guide message ownership, semantic context and Journey state');

    app.guide.setAttentionSource(null);
    if (!app.state.guideMinimized) document.querySelector('#guideMinimize').click();
    assert(app.guide.currentPresenceState() === 'AMBIENT', 'EFX01D-D3 cleanup did not restore ambient minimized Vex for downstream suites');
    checks.push('EFX01D-D3 owner-domain proof restores ambient minimized Vex and does not leak local projection state downstream');

    return Object.freeze({
      suiteRef:'suite.vexlife.browser.experience-guidance-dynamic-spatial/v1',
      state:'PASS',
      checks
    });
  }
});

// [VXG RealForever][EFX-01D][D3]
