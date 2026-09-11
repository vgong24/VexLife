import { deriveHumanHelpInteractionCandidates } from '../modules/experience-guidance-human-projection.js';

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

    const terrainOwnerCandidates = deriveHumanHelpInteractionCandidates({ frame:app.navigation.semanticFrame() });
    const journeyScrubOwner = terrainOwnerCandidates.find((candidate) => candidate.cue.interactionRefOrNull === 'interaction.terrain.journey-scrub');
    assert(journeyScrubOwner?.cue.actionRefOrNull === 'action.journey.scrub', 'EFX01D-D4 Journey scrub action owner is unavailable');
    assert(journeyScrubOwner?.accessibilityRole === 'slider' && journeyScrubOwner?.stableIdentifierRef === 'element.terrain.journey-scrub', 'EFX01D-D4 Journey scrub did not consume accepted accessibility role/stable identifier');
    const chatOwnerCandidates = deriveHumanHelpInteractionCandidates({ frame:{ ...app.navigation.semanticFrame(), screenRef:'screen.vexlife.chat', routeRef:'route.chat' } });
    const workspaceDockOwner = chatOwnerCandidates.find((candidate) => candidate.cue.interactionRefOrNull === 'interaction.context-workspace.dock');
    assert(workspaceDockOwner?.cue.actionRefOrNull === 'action.context-workspace.dock', 'EFX01D-D4 workspace dock action owner is unavailable');
    assert(workspaceDockOwner?.accessibilityRole === 'combobox' && workspaceDockOwner?.stableIdentifierRef === 'element.context-workspace.dock', 'EFX01D-D4 workspace dock did not consume accepted accessibility role/stable identifier');
    checks.push('EFX01D-D4 non-gesture Journey/workspace teaching consumes accepted action/interaction/accessibility owner metadata without minting gesture refs');

    currentHelp.focus();
    const focusBeforeAccessibility = document.activeElement;
    currentHelp.click();
    await delay(20);

    const visual = document.querySelector('[data-vex-human-projection-transient="true"]');
    const nonvisual = document.querySelector('[data-vex-human-projection-nonvisual="true"]');
    assert(visual?.getClientRects().length > 0, 'EFX01D-D4 visual same-cue projection is unavailable');
    assert(nonvisual, 'EFX01D-D4 nonvisual same-cue projection is unavailable');
    assert(visual.dataset.cueRef && visual.dataset.cueRef === nonvisual.dataset.cueRef, 'EFX01D-D4 visual/nonvisual cue identity diverged');
    assert(visual.dataset.interactionFamily === nonvisual.dataset.interactionFamily, 'EFX01D-D4 visual/nonvisual interaction family diverged');
    assert(visual.dataset.gestureRef === 'gesture.vexlife.node-drag', `EFX01D-D4 expected node-drag owner after D3 sequence, got ${visual.dataset.gestureRef || 'missing'}`);
    assert(visual.dataset.actionRef === 'action.terrain.node.move', 'EFX01D-D4 node-drag action owner drifted');
    assert(nonvisual.textContent === visual.textContent, 'EFX01D-D4 nonvisual content diverged from visual teaching content');
    assert(nonvisual.getAttribute('role') === 'status' && nonvisual.getAttribute('aria-live') === 'polite' && nonvisual.getAttribute('aria-atomic') === 'true', 'EFX01D-D4 nonvisual projection is not a polite atomic status route');
    assert((nonvisual.dataset.inputMethods || '').split(' ').includes('KEYBOARD_MOVE_MODE'), 'EFX01D-D4 did not consume accepted KEYBOARD_MOVE_MODE from the node-drag owner');
    assert(!(nonvisual.dataset.gestureRef || '').startsWith('platform.') && !(nonvisual.dataset.actionRef || '').startsWith('platform.') && !(nonvisual.dataset.interactionRef || '').startsWith('platform.'), 'EFX01D-D4 minted platform-specific semantic identity');

    const describedTarget = [...document.querySelectorAll('.e27-node')].find((node) => (node.getAttribute('aria-describedby') || '').split(/\s+/).includes(nonvisual.id));
    assert(describedTarget?.getClientRects().length > 0, 'EFX01D-D4 exact rendered teaching target lacks a reversible aria-describedby relation');
    const describedByDuring = describedTarget.getAttribute('aria-describedby');
    const priorTokens = describedByDuring.split(/\s+/).filter((token) => token && token !== nonvisual.id);
    assert(document.activeElement === focusBeforeAccessibility, 'EFX01D-D4 guidance stole focus while projecting keyboard/nonvisual equivalence');
    assert(visual.style.animation === 'none' && visual.style.transition === 'none', 'EFX01D-D4 visual teaching introduced motion-only meaning');
    assert(nonvisual.style.animation === 'none' && nonvisual.style.transition === 'none', 'EFX01D-D4 nonvisual teaching introduced motion-only meaning');
    assert(JSON.stringify(app.navigation.semanticFrame()) === semanticBefore, 'EFX01D-D4 projection changed semantic current context');
    assert(JSON.stringify(app.navigation.fullJourney()) === journeyBefore, 'EFX01D-D4 projection wrote Journey state');
    assert(document.querySelectorAll('#guideMessages .guide-message').length === guideMessagesBefore + 6, 'EFX01D-D4 explicit Help did not preserve exactly one canonical user/Guide pair');
    checks.push('EFX01D-D4 same InteractionCue identity/content is projected visually and nonvisually with accepted keyboard input metadata and exact target relation');
    checks.push('EFX01D-D4 projection preserves focus, canonical Guide ownership, semantic context, Journey state and reduced-motion equivalence');

    focusBeforeAccessibility.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true, cancelable:true }));
    await delay(20);
    assert(!document.querySelector('[data-vex-human-projection-transient="true"]'), 'EFX01D-D4 Escape did not dismiss visual teaching');
    assert(!document.querySelector('[data-vex-human-projection-nonvisual="true"]'), 'EFX01D-D4 Escape did not dismiss nonvisual teaching');
    assert((describedTarget.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).join(' ') === priorTokens.join(' '), 'EFX01D-D4 Escape did not restore the prior accessibility relation exactly');
    assert(document.activeElement === focusBeforeAccessibility, 'EFX01D-D4 Escape dismissal moved focus');
    assert(JSON.stringify(app.navigation.semanticFrame()) === semanticBefore, 'EFX01D-D4 Escape dismissal became semantic navigation');
    assert(JSON.stringify(app.navigation.fullJourney()) === journeyBefore, 'EFX01D-D4 Escape dismissal wrote Journey state');
    checks.push('EFX01D-D4 Escape dismisses guidance before parent navigation and restores relation/focus/current-context/Journey state');

    app.guide.setAttentionSource(null);
    if (!app.state.guideMinimized) document.querySelector('#guideMinimize').click();
    assert(app.guide.currentPresenceState() === 'AMBIENT', 'EFX01D-D3/D4 cleanup did not restore ambient minimized Vex for downstream suites');
    checks.push('EFX01D-D3/D4 owner-domain proof restores ambient minimized Vex and leaks no local projection state downstream');

    return Object.freeze({
      suiteRef:'suite.vexlife.browser.experience-guidance-dynamic-spatial/v1',
      state:'PASS',
      checks
    });
  }
});

// [VXG RealForever][EFX-01D][D3-D4]