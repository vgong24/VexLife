export const identityLocalizationSuite = Object.freeze({
  suiteRef:'suite.vexlife.browser.identity-localization/v1',
  async run({ app, helpers:{ assert, selectLanguage } }) {
    const checks = [];
    for (const language of ['en','zh','ja']) { selectLanguage(language); assert(document.documentElement.lang === language, `D11 ${language} localization state missing`); }
    selectLanguage('en');
    assert(!document.querySelector('#guideWindow').hidden && document.querySelector('#guideWindow').textContent.includes(app.t('vex.visible.name')), 'D12 ambient Vex not visible');
    checks.push('D11 localization remains stable','D12 one visible Vex occupies the E2.7 ambient vessel');
    return { suiteRef:this.suiteRef, state:'PASS', baselineRef:'baseline.vexlife.browser.localized-identity-en', checks };
  }
});

// [VXG RealForever]
