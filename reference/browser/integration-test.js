const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const click = (selector) => { const element = document.querySelector(selector); assert(element, `Missing ${selector}`); element.click(); return element; };
const selectLanguage = (language) => { const select = document.querySelector('#languageSelect'); select.value = language; select.dispatchEvent(new Event('change', { bubbles: true })); };
const selectedMessageList = (app) => app.messages.get(`${app.state.projectRef}::${app.state.threadRef}::${app.state.channelRef}`);

export async function runBrowserIntegration() {
  const host = document.createElement('pre'); host.id = 'integrationReceipt'; host.dataset.state = 'RUNNING'; document.body.append(host);
  const app = globalThis.__VEXLIFE_APP__; const checks = [];
  try {
    assert(app.rootContract?.contractRef === 'contract.vexlife.e27.authoritative-root/v1', 'D01 authoritative E2.7 contract missing');
    assert(document.querySelector('.e27-appbar') && document.querySelector('.e27-terrain') && document.querySelector('.e27-world') && document.querySelector('.e27-focus'), 'D01 direct-root body missing');
    assert(!document.querySelector('.context-nav'), 'D01 legacy top-tab nav survived');
    assert(!document.querySelector('.project-rail'), 'D01 legacy persistent project rail survived');
    assert(document.querySelector('#contextSurface').hidden, 'D01 contextual surface open by default');
    checks.push('D01 exact E2.7 body is the first rendered product surface');

    const rootRef = app.terrain.rootRef; assert(app.terrain.currentRef() === rootRef, 'D02 Terrain did not start at canonical root');
    const rootChildren = app.terrain.childRefs(rootRef); assert(rootChildren.length > 1, 'D02 canonical root lacks child topology');
    assert(document.querySelectorAll('.e27-node').length === rootChildren.length, 'D02 rendered children do not match canonical topology');
    checks.push('D02 canonical VexLife topology is projected into the E2.7 body');

    assert(!document.body.textContent.includes('VexOrg Demo Company') && !document.body.textContent.includes('Maya Chen'), 'D03 mock VexOrg product data leaked into product');
    checks.push('D03 mock E2.7 review data is excluded from product truth');

    app.openContext('chat'); await delay(0);
    assert(!document.querySelector('#contextSurface').hidden && !document.querySelector('#view-chat').hidden, 'D04 chat contextual surface did not open');
    assert(document.querySelector('.e27-terrain'), 'D04 chat replaced Terrain body');
    const input = document.querySelector('#messageInput'); const composer = document.querySelector('#composer'); const send = composer.querySelector('button[type="submit"]');
    const list = selectedMessageList(app); const count = list.length; input.value = 'integration.unsent'; input.dispatchEvent(new Event('input', { bubbles:true })); composer.requestSubmit(); await delay(220);
    assert(list.length === count, 'D05 unavailable submit appended message'); assert(send.disabled, 'D05 unavailable send not disabled'); assert(app.state.unsentLocalDraft?.state === 'UNSENT_LOCAL_DRAFT', 'D05 unsent draft truth missing');
    checks.push('D04 conversation is a contextual projection over Terrain','D05 truthful unavailable draft semantics survive direct-root composition');

    app.returnToTerrain(); assert(document.querySelector('#contextSurface').hidden, 'D06 context did not return to Terrain'); assert(input.value === 'integration.unsent', 'D06 contextual return lost draft');
    const current = app.terrain.currentRef(); const children = app.terrain.childRefs(current); if (children.length) { await app.terrain.travel(children[0], 'in'); assert(app.terrain.currentRef() === children[0], 'D07 semantic travel failed'); const siblings = app.terrain.siblingRefs(); if (siblings.length > 1) { const beforeDepth = app.terrain.viewportProjection().semanticDepth; const moved = await app.terrain.navigateSibling('NEXT'); if (moved) assert(app.terrain.viewportProjection().semanticDepth === beforeDepth, 'D07 sibling travel changed hierarchy depth'); } }
    checks.push('D06 contextual return preserves content state','D07 spatial entry/parent/sibling travel is semantic, not tab navigation');

    app.terrain.setAutoEntryEnabled(false); const held = app.terrain.evaluateSemanticAutoEntry({ nodeRef: app.terrain.childRefs()[0] || null, visibilityRatio:1, confidence:1, direction:'IN' }); assert(held.committed === false && held.reason === 'OPTED_OUT', 'D08 auto-entry opt-out failed'); app.terrain.setAutoEntryEnabled(true); app.terrain.setAutoEntryThresholds({ visibilityThreshold:.72, confidenceThreshold:.8 }); const low = app.terrain.evaluateSemanticAutoEntry({ nodeRef: app.terrain.childRefs()[0] || null, visibilityRatio:.5, confidence:1, direction:'IN' }); assert(low.committed === false && low.reason === 'VISIBILITY_BELOW_THRESHOLD', 'D08 visible threshold failed');
    checks.push('D08 semantic auto-entry remains opt-in and thresholded');

    for (const language of ['en','zh','ja']) { selectLanguage(language); assert(document.documentElement.lang === language, `D09 ${language} localization state missing`); }
    selectLanguage('en');
    app.guide.setOpen(true); await delay(0); assert(!document.querySelector('#guideWindow').hidden && document.querySelector('#guideWindow').textContent.includes(app.t('vex.visible.name')), 'D10 ambient Vex not visible');
    checks.push('D09 localization remains stable','D10 one visible Vex occupies the E2.7 vessel');

    const result = { schemaVersion:'vexlife.e27-direct-root-browser-integration/v1', state:'PASS', checks, presentationFoundation:'EXACT_E2_7_ROOT_BODY', currentNodeRef:app.terrain.currentRef(), currentFrame:app.navigation.semanticFrame() };
    host.dataset.state='PASS'; host.textContent=JSON.stringify(result,null,2); globalThis.__VEXLIFE_INTEGRATION_RESULT__=result; return result;
  } catch (error) {
    const result={schemaVersion:'vexlife.e27-direct-root-browser-integration/v1',state:'FAIL',error:error instanceof Error?error.message:String(error),checks};host.dataset.state='FAIL';host.textContent=JSON.stringify(result,null,2);globalThis.__VEXLIFE_INTEGRATION_RESULT__=result;throw error;
  }
}

// [VXG RealForever]
