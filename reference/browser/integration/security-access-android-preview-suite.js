async function runAndroidShapedCompactProof({ assert, delay }) {
  const frame = document.createElement('iframe');
  frame.id = 'securityAccessAndroidShapedProofFrame';
  frame.title = 'Security & Access Android-shaped proof frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  Object.assign(frame.style, {
    position: 'fixed',
    left: '-20000px',
    top: '0',
    width: '390px',
    height: '844px',
    border: '0',
    opacity: '0',
    pointerEvents: 'none'
  });
  const compactUrl = new URL(globalThis.location.href);
  compactUrl.search = '';
  compactUrl.hash = '';
  const loaded = new Promise((resolve, reject) => {
    frame.addEventListener('load', resolve, { once: true });
    frame.addEventListener('error', () => reject(new Error('Security & Access compact proof frame failed to load')), { once: true });
  });
  frame.src = compactUrl.href;
  document.body.append(frame);
  try {
    await loaded;
    const compactWindow = frame.contentWindow;
    const compactDocument = frame.contentDocument;
    assert(compactWindow && compactDocument, 'Security & Access compact proof frame is unavailable');
    for (let attempt = 0; attempt < 100 && !compactWindow.__VEXLIFE_APP__; attempt += 1) await delay(10);
    const compactApp = compactWindow.__VEXLIFE_APP__;
    assert(compactApp?.securityAccess, 'Security & Access compact app binding unavailable');
    assert(compactWindow.innerWidth === 390 && compactWindow.innerHeight === 844, `Security & Access compact viewport drifted: ${compactWindow.innerWidth}x${compactWindow.innerHeight}`);
    assert(compactWindow.matchMedia('(max-width:760px)').matches, 'Security & Access compact media query is not active at 390px');

    compactApp.openContext('health');
    compactApp.securityAccess.setPreviewVisible(true);
    await delay(30);

    const region = compactDocument.querySelector('#securityAccessRegion');
    const content = compactDocument.querySelector('#securityAccessPreviewContent');
    const facts = compactDocument.querySelector('.security-access-facts');
    const actions = compactDocument.querySelector('.security-access-actions');
    const detailsToggle = compactDocument.querySelector('#securityAccessDetailsToggle');
    const askVex = compactDocument.querySelector('#securityAccessAskVex');
    assert(region && !region.hidden && content && !content.hidden, 'Security & Access compact Health region is not visibly projected');
    assert(facts && actions && detailsToggle && askVex, 'Security & Access compact controls are incomplete');

    const regionRect = region.getBoundingClientRect();
    assert(regionRect.width > 0 && regionRect.width <= compactWindow.innerWidth + 1, 'Security & Access compact card exceeds the Android-shaped viewport');
    const factCards = [...facts.children];
    assert(factCards.length === 3, 'Security & Access compact facts are incomplete');
    const factColumns = compactWindow.getComputedStyle(facts).gridTemplateColumns.split(/\s+/).filter(Boolean);
    assert(factColumns.length === 1, 'Security & Access compact facts did not collapse to one column');
    const firstFactRect = factCards[0].getBoundingClientRect();
    const secondFactRect = factCards[1].getBoundingClientRect();
    assert(secondFactRect.top >= firstFactRect.bottom - 1, 'Security & Access compact fact cards overlap instead of stacking');

    const actionStyle = compactWindow.getComputedStyle(actions);
    assert(actionStyle.display === 'grid', 'Security & Access compact primary actions did not switch to grid layout');
    for (const button of [detailsToggle, askVex]) {
      const rect = button.getBoundingClientRect();
      assert(rect.height >= 44, 'Security & Access compact primary action fell below the 44px touch target');
      assert(rect.width <= regionRect.width + 1, 'Security & Access compact primary action exceeds the card width');
    }
    detailsToggle.focus();
    assert(compactDocument.activeElement === detailsToggle, 'Security & Access compact details control is not keyboard focusable');
    detailsToggle.click();
    await delay(10);

    const heldButtons = [...compactDocument.querySelectorAll('#securityAccessHeldActions button')];
    assert(heldButtons.length === 8 && heldButtons.every((button) => button.disabled && button.getAttribute('aria-disabled') === 'true'), 'Security & Access compact held controls are not visibly disabled');
    assert(heldButtons.every((button) => button.getBoundingClientRect().height >= 44), 'Security & Access compact held control fell below the 44px touch target');
    const heldRows = [...compactDocument.querySelectorAll('.security-access-held-row')];
    assert(heldRows.length === 8 && heldRows.every((row) => compactWindow.getComputedStyle(row).gridTemplateColumns.split(/\s+/).filter(Boolean).length === 1), 'Security & Access compact held actions did not collapse to one column');

    const snapshot = compactApp.securityAccess.snapshot();
    assert(snapshot.projection.androidFirst === true && snapshot.projection.iPhoneRequired === false, 'Security & Access compact Android-first truth drifted');
    assert(snapshot.authenticationPerformed === false && snapshot.authorizationPerformed === false && snapshot.protectedEffectPerformed === false, 'Security & Access compact proof crossed an authentication/authorization/effect boundary');
    assert(Object.values(snapshot.effects).every((value) => value === false), 'Security & Access compact proof changed a protected effect');
    const visibleText = region.textContent ?? '';
    assert(!/\biPhone\b/i.test(visibleText), 'Security & Access compact proof unexpectedly requires iPhone');
    return Object.freeze({ width: compactWindow.innerWidth, height: compactWindow.innerHeight, heldControlCount: heldButtons.length });
  } finally {
    frame.remove();
  }
}

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

    const compact = await runAndroidShapedCompactProof({ assert, delay });
    assert(compact.width === 390 && compact.height === 844 && compact.heldControlCount === 8, 'Security & Access Android-shaped compact proof receipt drifted');
    checks.push('real 390x844 Chromium Security & Access compact projection remains usable and zero-effect');

    return Object.freeze({ suiteRef: this.suiteRef, state: 'PASS', checks });
  }
});

// [VXG RealForever]
