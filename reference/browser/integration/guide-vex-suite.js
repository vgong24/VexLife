export const guideVexSuite = Object.freeze({
  suiteRef:'suite.vexlife.browser.guide-vex/v1',
  async run({ app, state, helpers:{ assert, overlaps } }) {
    assert(state.rootRef && app.terrain.currentRef() === state.rootRef, 'Guide/Vex suite requires canonical root baseline');
    const checks = [];
    const vex = document.querySelector('#guideWindow');
    assert(!vex.hidden, 'D05 visible Vex is absent on first render');
    assert(vex.classList.contains('is-minimized'), 'D05 first-render Vex is not ambient/minimized');
    const vexRect = vex.getBoundingClientRect();
    const protectedTargets = [document.querySelector('#terrainFocus'), ...document.querySelectorAll('.e27-node')].filter((node) => node?.getClientRects().length);
    assert(protectedTargets.every((node) => !overlaps(vexRect, node.getBoundingClientRect())), 'D05 ambient Vex obscures first-render Terrain content');
    checks.push('D05 one visible Vex starts ambient/minimized without obscuring Terrain');
    return { suiteRef:this.suiteRef, state:'PASS', baselineRef:'baseline.vexlife.browser.ambient-vex-first-render', checks };
  }
});

// [VXG RealForever]
