export const rootContractSuite = Object.freeze({
  suiteRef:'suite.vexlife.browser.root-contract/v1',
  async run({ app, state, helpers:{ assert } }) {
    const checks = [];
    assert(app.rootContract?.contractRef === 'contract.vexlife.e27.authoritative-root/v1', 'D01 authoritative E2.7 contract missing');
    assert(document.querySelector('.e27-appbar') && document.querySelector('.e27-terrain') && document.querySelector('.e27-world') && document.querySelector('.e27-focus'), 'D01 direct-root body missing');
    assert(!document.querySelector('.context-nav'), 'D01 legacy top-tab nav survived');
    assert(!document.querySelector('.project-rail'), 'D01 legacy persistent project rail survived');
    assert(document.querySelector('#contextSurface').hidden, 'D01 contextual surface open by default');
    checks.push('D01 exact E2.7 body is the first rendered product surface');

    const rootRef = app.terrain.rootRef;
    assert(app.terrain.currentRef() === rootRef, 'D02 Terrain did not start at canonical root');
    const rootChildren = app.terrain.childRefs(rootRef);
    assert(rootChildren.length > 1, 'D02 canonical root lacks child topology');
    assert(document.querySelectorAll('.e27-node').length === rootChildren.length, 'D02 rendered children do not match canonical topology');
    checks.push('D02 canonical VexLife topology is projected into the E2.7 body');

    assert(!document.body.textContent.includes('VexOrg Demo Company') && !document.body.textContent.includes('Maya Chen'), 'D03 mock VexOrg product data leaked into product');
    checks.push('D03 mock E2.7 review data is excluded from product truth');

    state.rootRef = rootRef;
    state.rootChildren = [...rootChildren];
    return { suiteRef:this.suiteRef, state:'PASS', baselineRef:'baseline.vexlife.browser.first-render-root', checks };
  }
});

// [VXG RealForever]
