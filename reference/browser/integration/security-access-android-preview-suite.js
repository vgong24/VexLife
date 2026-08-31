export const securityAccessPreviewSuite = Object.freeze({
  suiteRef: 'suite.vexlife.browser.security-access-android-preview/v1',
  async run({ app, helpers }) {
    const { assert, delay, selectLanguage } = helpers;
    const checks = [];
    app.openContext('health');
    await delay(20);
    const region = document.querySelector('#securityAccessRegion');
    assert(region && !region.hidden, 'Security & Access Health region unavailable');
    const initial = app.securityAccess.snapshot();
    assert(initial.projection.androidFirst === true && initial.projection.iPhoneRequired === false, 'Security & Access Android-first truth drift');
    assert(initial.projection.runtimeState === 'BACKEND_UNAVAILABLE', 'Security & Access must truthfully report disconnected runtime');
    assert(Object.values(initial.effects).every((value) => value === false), 'Security & Access protected effect ledger is not all false');

    document.querySelector('#securityAccessDetailsToggle')?.click();
    await delay(10);
    assert(document.querySelector('#securityAccessDetails')?.hidden === false, 'Security & Access details did not open');
    const held = [...document.querySelectorAll('#securityAccessHeldActions button')];
    assert(held.length === 8 && held.every((button) => button.disabled), 'Security & Access held controls are not visibly disabled');
    checks.push('security-access held controls remain disabled');

    document.querySelector('#securityAccessAskVex')?.click();
    await delay(10);
    const afterAsk = app.securityAccess.snapshot();
    assert(afterAsk.auditEvents.some((event) => event.type === 'ASK_VEX_EXPLAINED'), 'Security & Access Ask Vex explanation receipt missing');
    assert(Object.values(afterAsk.effects).every((value) => value === false), 'Ask Vex changed Security & Access protected effects');
    checks.push('Vex explains without authentication or authorization');

    for (const language of ['ja','zh','en']) {
      selectLanguage(language);
      await delay(5);
      const title = document.querySelector('#securityAccessTitle')?.textContent ?? '';
      assert(title.length > 0 && !title.includes('security-access.'), `Security & Access ${language} localization unavailable`);
    }
    const visibleText = region.textContent ?? '';
    assert(!/\biPhone\b/i.test(visibleText), 'Security & Access first slice unexpectedly requires iPhone');
    checks.push('EN/JA/ZH and Android-first visible truth remain available');

    app.securityAccess.setPreviewVisible(false);
    const hidden = app.securityAccess.snapshot();
    assert(hidden.projection.previewVisible === false, 'Security & Access preview preference did not hide presentation');
    assert(Object.values(hidden.effects).every((value) => value === false), 'Security & Access visibility preference changed policy effects');
    app.securityAccess.setPreviewVisible(true);
    app.securityAccess.render();
    checks.push('preview visibility remains presentation-only');

    return Object.freeze({ suiteRef: this.suiteRef, state: 'PASS', checks });
  }
});

// [VXG RealForever]
