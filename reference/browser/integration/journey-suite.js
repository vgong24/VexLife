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
    state.initialJourney = initialJourney;
    return { suiteRef:this.suiteRef, state:'PASS', baselineRef:'baseline.vexlife.browser.root-journey-seeded', checks };
  }
});

// [VXG RealForever]
