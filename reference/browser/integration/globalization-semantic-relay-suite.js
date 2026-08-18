export const globalizationSemanticRelaySuite = Object.freeze({
  suiteRef: 'suite.vexlife.browser.globalization-semantic-relay/v1',
  async run({ app, helpers: { delay, assert, selectLanguage } }) {
    const checks = [];
    const project = app.projects.find((item) => item.projectRef === 'project.self-development');
    const thread = project?.threads.find((item) => item.threadRef === 'thread.self-development.open-conversation');
    const channel = app.channels.find((item) => item.channelRef === 'channel.self-development.companion');
    assert(project && thread && channel, 'GPT-00 canonical conversation fixture unavailable');
    app.openContext('chat');
    app.chat.selectThread(project, thread, 'element.thread.open-conversation');
    app.chat.selectChannel(channel, 'element.channel.companion');
    await delay(10);

    const list = app.messages.get(`${project.projectRef}::${thread.threadRef}::${channel.channelRef}`);
    assert(Array.isArray(list) && list.length > 0, 'GPT-00 message list unavailable');
    const message = list[0];
    const originalContent = message.content;
    const priorRelay = message.semanticRelay;
    const relay = Object.freeze({
      schemaVersion: 'vexlife.semantic-relay-reference/v1',
      relayRef: 'relay.browser.globalization-proof',
      sourceMessageRef: 'message.browser.globalization-proof.source',
      sourceLanguageRef: 'language.en',
      sourceLocaleRef: 'locale.en-US',
      preferredConversationLanguageRef: 'language.en',
      requestedResponseLanguageRef: 'language.ja',
      uiLocaleRef: 'locale.en-US',
      originatorRef: 'person.local-user',
      originatorKind: 'HUMAN',
      onBehalfOfOriginator: true,
      materiality: 'MATERIAL',
      ambiguityState: 'CLEAR',
      recipientRefs: Object.freeze(['role.vex.companion']),
      intentRefs: Object.freeze(['intent.globalization.browser-proof']),
      canonicalMeaningRefs: Object.freeze(['meaning.globalization.browser-proof']),
      interpretationProjectionRef: 'projection.interpretation.globalization.browser-proof',
      interpretationState: 'CONFIRMED',
      confirmedByRef: 'person.local-user',
      confirmationReceiptRef: 'receipt.confirmation.globalization.browser-proof',
      supersedesInterpretationProjectionRef: null,
      boundaryClassRef: 'boundary.globalization.browser-proof',
      targets: Object.freeze([Object.freeze({
        recipientRef: 'role.vex.companion',
        recipientPreferredLanguageRef: 'language.ja',
        targetLanguageRef: 'language.ja',
        targetAudienceRef: 'audience.local-vex',
        runtimeCapability: Object.freeze({
          capabilityRef: 'capability.runtime.multilingual.browser-proof',
          currentnessState: 'CURRENT',
          multilingualOutput: true,
          supportedLanguageRefs: Object.freeze(['language.en', 'language.ja']),
          evidenceRefs: Object.freeze(['evidence.runtime.multilingual.current.browser-proof'])
        }),
        localeQualityState: 'ADMITTED',
        terminologyState: 'ADMITTED',
        authorityState: 'ADMITTED',
        localizationReadinessState: 'TRANSLATION_READY',
        humanReviewAvailable: false,
        projectionMode: 'MODEL_NATIVE',
        localizedProjectionRef: null,
        semanticEquivalenceState: 'PARTIAL',
        semanticDriftFindingRefs: Object.freeze(['finding.semantic-relay.equivalence.partial-lineage']),
        deliveryState: 'NOT_DELIVERED',
        acknowledgementState: 'NOT_REQUESTED',
        understandingState: 'NOT_ASSESSED'
      })]),
      sourceRefs: Object.freeze(['source.globalization.browser-proof']),
      evidenceRefs: Object.freeze(['evidence.globalization.browser-proof']),
      authorityRefs: Object.freeze(['authority.globalization.browser-proof'])
    });
    const relayIdentity = JSON.stringify(relay);
    message.semanticRelay = relay;
    app.chat.renderMessages();
    await delay(0);

    const article = document.querySelector(`[data-message-ref="${CSS.escape(message.messageRef)}"]`);
    const disclosure = article?.querySelector('.semantic-relay-disclosure');
    assert(disclosure && disclosure.querySelector('summary'), 'GPT-00 semantic relay disclosure unavailable');
    assert(disclosure.textContent.includes('language.en') && disclosure.textContent.includes('language.ja'), 'GPT-01 source/requested languages not visible');
    assert(disclosure.textContent.includes('MODEL_NATIVE') && disclosure.textContent.includes('PARTIAL') && disclosure.textContent.includes('CURRENT'), 'GPT-04 projection/equivalence/runtime truth not visible');
    assert(article.querySelector('.message-body')?.textContent === originalContent, 'GPT-01 source body was rewritten by relay projection');
    assert(!/chain[- ]?of[- ]?thought|hidden reasoning|internal reasoning/iu.test(disclosure.textContent), 'GPT-05 disclosure exposed hidden reasoning terminology');
    checks.push('GPT-00', 'GPT-01', 'GPT-04', 'GPT-05');

    const labelSnapshots = [];
    for (const language of ['en', 'ja', 'zh', 'en']) {
      selectLanguage(language);
      await delay(5);
      const nextArticle = document.querySelector(`[data-message-ref="${CSS.escape(message.messageRef)}"]`);
      const nextDisclosure = nextArticle?.querySelector('.semantic-relay-disclosure');
      assert(nextDisclosure, `GPT-02 disclosure disappeared for ${language}`);
      assert(JSON.stringify(message.semanticRelay) === relayIdentity, `GPT-02 relay identity changed under UI locale ${language}`);
      assert(nextArticle.querySelector('.message-body')?.textContent === originalContent, `GPT-02 source body changed under UI locale ${language}`);
      labelSnapshots.push(nextDisclosure.querySelector('summary')?.textContent ?? '');
    }
    assert(new Set(labelSnapshots).size >= 3, 'GPT-02 localized relay labels did not change across EN/JA/ZH');
    checks.push('GPT-02');

    const attention = Object.freeze({
      schemaVersion: 'vexlife.browser-semantic-relay-attention/v1',
      state: 'CONFIRMATION_REQUIRED',
      truthClass: 'CURRENT_SEMANTIC_RELAY_ATTENTION',
      relayRef: 'relay.browser.globalization-attention-proof',
      sourceLanguageRef: 'language.en',
      requestedResponseLanguageRef: 'language.ja',
      uiLocaleRef: 'locale.en-US',
      requiredActions: Object.freeze(['CONFIRM', 'CORRECT', 'HOLD']),
      reasonCode: 'ORIGINATOR_CONFIRMATION_REQUIRED',
      evidenceRefs: Object.freeze(['evidence.globalization.attention-proof']),
      rawTextIncluded: false
    });
    const beforeCount = list.length;
    app.chat.setSemanticRelayAttention(attention, {
      content: 'Unsaved semantic relay proof draft.',
      relayInput: null,
      frameAtSend: app.navigation.semanticFrame()
    });
    await delay(0);
    let panel = document.querySelector('.semantic-relay-attention');
    assert(panel?.getAttribute('role') === 'status' && panel?.getAttribute('aria-live') === 'polite', 'GPT-06 attention panel is not screen-reader announced');
    const buttons = [...panel.querySelectorAll('button[data-relay-action]')];
    assert(buttons.length === 3 && buttons.every((button) => button.type === 'button'), 'GPT-03 confirmation controls are not bounded buttons');
    panel.querySelector('[data-relay-action="HOLD"]').click();
    await delay(0);
    assert(list.length === beforeCount, 'GPT-03 HOLD created a message effect');
    assert(app.state.unsentLocalDraft?.state === 'UNSENT_LOCAL_DRAFT', 'GPT-03 HOLD did not preserve unsent draft truth');

    app.chat.setSemanticRelayAttention(attention, {
      content: 'Correct this semantic relay proof draft.',
      relayInput: null,
      frameAtSend: app.navigation.semanticFrame()
    });
    await delay(0);
    panel = document.querySelector('.semantic-relay-attention');
    panel.querySelector('[data-relay-action="CORRECT"]').click();
    await delay(0);
    assert(list.length === beforeCount, 'GPT-03 CORRECT created a message effect without corrected relay input');
    assert(app.state.unsentLocalDraft?.state === 'UNSENT_LOCAL_DRAFT', 'GPT-03 CORRECT did not return to unsent draft');
    assert(!document.querySelector('.semantic-relay-attention'), 'GPT-03 attention panel did not clear after local correction route');
    checks.push('GPT-03', 'GPT-06');

    app.state.unsentLocalDraft = null;
    const input = document.querySelector('#messageInput');
    if (input) input.value = '';
    app.chat.setSemanticRelayInput(null);
    app.chat.setSemanticRelayAttention(null);
    if (priorRelay === undefined) delete message.semanticRelay;
    else message.semanticRelay = priorRelay;
    app.chat.renderMessages();
    app.chat.updateComposer();
    return Object.freeze({ suiteRef: 'suite.vexlife.browser.globalization-semantic-relay/v1', state: 'PASS', checks });
  }
});

// [VXG RealForever]
