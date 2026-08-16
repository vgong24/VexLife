export const contextualConversationSuite = Object.freeze({
  suiteRef:'suite.vexlife.browser.contextual-conversation/v1',
  async run({ app, state, helpers:{ delay, assert, selectedMessageList } }) {
    assert(state.rootRef && app.terrain.currentRef()===state.rootRef, 'Contextual conversation suite requires canonical root baseline');
    assert(document.querySelector('#contextSurface').hidden, 'Contextual conversation suite requires closed contextual surface baseline');
    const checks = [];

    app.openContext('chat'); await delay(0);
    assert(!document.querySelector('#contextSurface').hidden && !document.querySelector('#view-chat').hidden, 'D06 chat contextual surface did not open');
    assert(document.querySelector('.e27-terrain'), 'D06 chat replaced Terrain body');
    const input = document.querySelector('#messageInput'); const composer = document.querySelector('#composer'); const send = composer.querySelector('button[type="submit"]');
    const list = selectedMessageList(app); const count = list.length; input.value = 'integration.unsent'; input.dispatchEvent(new Event('input', { bubbles:true })); composer.requestSubmit(); await delay(220);
    assert(list.length === count, 'D07 unavailable submit appended message'); assert(send.disabled, 'D07 unavailable send not disabled'); assert(app.state.unsentLocalDraft?.state === 'UNSENT_LOCAL_DRAFT', 'D07 unsent draft truth missing');
    checks.push('D06 conversation is a contextual projection over Terrain','D07 truthful unavailable draft semantics survive direct-root composition');

    app.returnToTerrain(); await delay(0); assert(document.querySelector('#contextSurface').hidden, 'D08 context did not return to Terrain'); assert(input.value === 'integration.unsent', 'D08 contextual return lost draft');
    checks.push('D08 contextual return preserves content state');
    state.contextualReturnComplete = true;
    state.contextualDraftValue = input.value;
    return { suiteRef:this.suiteRef, state:'PASS', baselineRef:'baseline.vexlife.browser.contextual-chat-returned-to-terrain', checks };
  }
});

// [VXG RealForever]
