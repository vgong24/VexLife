export const journeySuite = Object.freeze({
  suiteRef:'suite.vexlife.browser.journey/v1',
  async run({ app, state, helpers:{ assert } }) {
    assert(state.rootRef && app.terrain.currentRef() === state.rootRef, 'Journey suite requires canonical root baseline');
    const checks = [];
    const initialJourney = app.navigation.fullJourney();
    assert(initialJourney.length >= 1, 'D04 initial current context missing from journey');
    assert(initialJourney[0].after?.selectedNodeRef === state.rootRef, 'D04 initial journey does not bind canonical root context');
    assert(document.querySelector('#terrainJourneyStatus').textContent !== '0 total', 'D04 first-render journey still reports zero');
    checks.push('D04 initial current semantic context is seeded into the append-only journey');

    const semanticBeforeInteraction = app.navigation.semanticFrame();
    const historicalPrefix = structuredClone(initialJourney);
    const beforeInteractionCount = app.navigation.fullJourney().length;
    const interactionEvent = app.navigation.navigate('element.terrain.center-current-context', {}, 'action.terrain.canvas.pan');
    assert(app.navigation.semanticFrame().selectedNodeRef === semanticBeforeInteraction.selectedNodeRef, 'LIVED-A same-context interaction rewrote semantic current context');
    assert(interactionEvent?.elementRef === 'element.terrain.center-current-context' && interactionEvent.interactionRef === 'interaction.terrain.center-current-context' && interactionEvent.actionRef === 'action.terrain.canvas.pan', 'LIVED-A same-context interaction provenance was not retained');
    assert(app.navigation.fullJourney().length === beforeInteractionCount + 1, 'LIVED-A same-context Journey-bearing interaction was dropped');
    assert(JSON.stringify(app.navigation.fullJourney().slice(0, historicalPrefix.length)) === JSON.stringify(historicalPrefix), 'LIVED-A append-only Journey history was rewritten');
    app.navigation.navigate('element.terrain.center-current-context', {}, 'action.terrain.canvas.pan');
    assert(app.navigation.fullJourney().length === beforeInteractionCount + 1, 'LIVED-A exact semantic + event no-op emitted a duplicate Journey event');
    checks.push('LIVED-A same-context interaction provenance appends without semantic-current-context rewrite or duplicate no-op emission');
    state.initialJourney = initialJourney;
    return { suiteRef:this.suiteRef, state:'PASS', baselineRef:'baseline.vexlife.browser.root-journey-seeded', checks };
  }
});

// [VXG RealForever]
