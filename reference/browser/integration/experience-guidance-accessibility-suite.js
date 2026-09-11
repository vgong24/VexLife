export const experienceGuidanceAccessibilitySuite = Object.freeze({
  suiteRef:'suite.vexlife.browser.experience-guidance-accessibility/v1',
  async run({ app, helpers:{ assert, delay } }) {
    const checks = [];
    app.returnToTerrain();
    app.guide.summon();
    await delay(20);

    const currentHelp = document.querySelector('[data-guide-intent-ref="intent.guide.current"]');
    assert(currentHelp, 'EFX01D-D4 existing CURRENT Help control is missing');
    currentHelp.focus();
    const focusBefore = document.activeElement;
    const semanticBefore = JSON.stringify(app.navigation.semanticFrame());
    const journeyBefore = JSON.stringify(app.navigation.fullJourney());

    currentHelp.click();
    await delay(20);

    const visual = document.querySelector('[data-vex-human-projection-transient="true"]');
    const nonvisual = document.querySelector('[data-vex-human-projection-nonvisual="true"]');
    assert(visual?.getClientRects().length > 0, 'EFX01D-D4 visual same-cue projection is unavailable');
    assert(nonvisual, 'EFX01D-D4 nonvisual same-cue projection is unavailable');
    assert(visual.dataset.cueRef && visual.dataset.cueRef === nonvisual.dataset.cueRef, 'EFX01D-D4 visual/nonvisual cue identity diverged');
    assert(visual.dataset.interactionFamily === nonvisual.dataset.interactionFamily, 'EFX01D-D4 visual/nonvisual interaction family diverged');
    assert(visual.dataset.gestureRef === 'gesture.vexlife.node-drag', `EFX01D-D4 expected node-drag owner after accepted D3 sequence, got ${visual.dataset.gestureRef || 'missing'}`);
    assert(nonvisual.textContent === visual.textContent, 'EFX01D-D4 nonvisual content diverged from the visual teaching content');
    assert(nonvisual.getAttribute('role') === 'status' && nonvisual.getAttribute('aria-live') === 'polite', 'EFX01D-D4 nonvisual projection is not a polite status route');
    assert((nonvisual.dataset.inputMethods || '').split(' ').includes('KEYBOARD_MOVE_MODE'), 'EFX01D-D4 did not consume the accepted keyboard input equivalent from the gesture owner');

    const describedTarget = [...document.querySelectorAll('.e27-node')].find((node) => (node.getAttribute('aria-describedby') || '').split(/\s+/).includes(nonvisual.id));
    assert(describedTarget?.getClientRects().length > 0, 'EFX01D-D4 exact rendered teaching target lacks the reversible nonvisual relation');
    assert(document.activeElement === focusBefore, 'EFX01D-D4 guidance stole focus while projecting keyboard/nonvisual equivalence');
    assert(visual.style.animation === 'none' && visual.style.transition === 'none', 'EFX01D-D4 visual teaching introduced motion-only meaning');
    assert(nonvisual.style.animation === 'none' && nonvisual.style.transition === 'none', 'EFX01D-D4 nonvisual teaching introduced motion-only meaning');
    assert(JSON.stringify(app.navigation.semanticFrame()) === semanticBefore, 'EFX01D-D4 projection changed semantic current context');
    assert(JSON.stringify(app.navigation.fullJourney()) === journeyBefore, 'EFX01D-D4 projection wrote Journey state');
    checks.push('EFX01D-D4 same InteractionCue identity/content is projected visually and nonvisually with accepted keyboard input metadata and exact aria-describedby relation');
    checks.push('EFX01D-D4 projection preserves focus, semantic context, Journey state and reduced-motion equivalence');

    focusBefore.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true, cancelable:true }));
    await delay(20);
    assert(!document.querySelector('[data-vex-human-projection-transient="true"]'), 'EFX01D-D4 Escape did not dismiss the visual teaching projection');
    assert(!document.querySelector('[data-vex-human-projection-nonvisual="true"]'), 'EFX01D-D4 Escape did not dismiss the nonvisual teaching projection');
    assert(!(describedTarget.getAttribute('aria-describedby') || '').split(/\s+/).includes('vexHumanHelpNonvisual'), 'EFX01D-D4 Escape did not restore the target accessibility relation');
    assert(document.activeElement === focusBefore, 'EFX01D-D4 Escape dismissal moved focus');
    assert(JSON.stringify(app.navigation.semanticFrame()) === semanticBefore, 'EFX01D-D4 Escape dismissal became semantic navigation');
    assert(JSON.stringify(app.navigation.fullJourney()) === journeyBefore, 'EFX01D-D4 Escape dismissal wrote Journey state');
    checks.push('EFX01D-D4 Escape dismisses guidance before parent navigation, restores accessibility relations and keeps focus/Journey/current context unchanged');

    app.guide.setAttentionSource(null);
    if (!app.state.guideMinimized) document.querySelector('#guideMinimize').click();
    assert(app.guide.currentPresenceState() === 'AMBIENT', 'EFX01D-D4 cleanup did not restore ambient minimized Vex');
    checks.push('EFX01D-D4 proof restores ambient minimized Vex and leaks no projection state downstream');

    return Object.freeze({
      suiteRef:'suite.vexlife.browser.experience-guidance-accessibility/v1',
      state:'PASS',
      checks
    });
  }
});

// [VXG RealForever][EFX-01D][D4]
