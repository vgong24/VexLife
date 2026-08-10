const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function click(selector) {
  const element = document.querySelector(selector);
  assert(element, `Missing integration selector: ${selector}`);
  element.click();
  return element;
}

function visibleMessages() {
  return [...document.querySelectorAll('#messageFeed .message')].map((element) => ({
    text: element.querySelector('.message-body')?.textContent || '',
    projectRef: element.dataset.projectRef,
    threadRef: element.dataset.threadRef,
    channelRef: element.dataset.channelRef
  }));
}

function assertVisibleOwnership(app, requiredMarker, forbiddenMarkers = []) {
  const visible = visibleMessages();
  assert(visible.some((message) => message.text === requiredMarker), `Missing selected history marker: ${requiredMarker}`);
  for (const marker of forbiddenMarkers) {
    assert(!visible.some((message) => message.text === marker), `Cross-thread message leakage: ${marker}`);
  }
  for (const message of visible) {
    assert(message.projectRef === app.state.projectRef, `Visible projectRef mismatch: ${message.projectRef}`);
    assert(message.threadRef === app.state.threadRef, `Visible threadRef mismatch: ${message.threadRef}`);
    assert(message.channelRef === app.state.channelRef, `Visible channelRef mismatch: ${message.channelRef}`);
  }
}

function selectedMessageList(app) {
  const key = `${app.state.projectRef}::${app.state.threadRef}::${app.state.channelRef}`;
  return app.messages.get(key);
}

async function sendMarker(marker) {
  const input = document.querySelector('#messageInput');
  input.value = marker;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('#composer').requestSubmit();
  await delay(230);
}

function selectLanguage(language) {
  const select = document.querySelector('#languageSelect');
  select.value = language;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

export async function runBrowserIntegration() {
  const host = document.createElement('pre');
  host.id = 'integrationReceipt';
  host.dataset.state = 'RUNNING';
  host.textContent = 'RUNNING';
  document.body.append(host);
  const app = globalThis.__VEXLIFE_APP__;
  const availabilityChecks = [];
  const ownershipChecks = [];
  const localizationChecks = [];

  try {
    const composer = document.querySelector('#composer');
    const input = document.querySelector('#messageInput');
    const sendButton = document.querySelector('#composer button[type="submit"]');
    const composerNodeRef = composer.dataset.nodeRef;
    const companionIdentityBefore = app.chat.roleLabel('companion');
    const blockedDraft = 'integration.marker.unsent-local-draft';
    const blockedList = selectedMessageList(app);
    const blockedCountBefore = blockedList.length;

    assert(app.state.vexAvailability === 'UNAVAILABLE', 'A01 initial Vex availability must be UNAVAILABLE');
    assert(sendButton.disabled, 'A01 Send must be unavailable while Vex is unavailable');
    input.value = blockedDraft;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    composer.requestSubmit();
    await delay(230);

    assert(blockedList.length === blockedCountBefore, 'A01 unavailable submit appended a message');
    assert(app.chat.pendingReplyCount() === 0, 'A02 unavailable submit scheduled a reply');
    assert(app.state.unsentLocalDraft?.state === 'UNSENT_LOCAL_DRAFT', 'A03 blocked text was not classified as UNSENT_LOCAL_DRAFT');
    assert(app.state.unsentLocalDraft?.content === blockedDraft, 'A03 local draft content changed');
    assert(app.state.unsentLocalDraft?.queued === false, 'A03 local draft was represented as queued');
    assert(app.state.unsentLocalDraft?.accepted === false, 'A03 local draft was represented as accepted');
    assert(input.value === blockedDraft, 'A03 blocked text did not remain visibly in the composer');
    assert(input.dataset.draftState === 'UNSENT_LOCAL_DRAFT', 'A03 composer draft state is not explicit');
    assert(!visibleMessages().some((message) => message.text === blockedDraft), 'A03 blocked draft leaked into message history');
    availabilityChecks.push('A01 unavailable submit appends zero messages');
    availabilityChecks.push('A02 unavailable submit schedules zero replies');
    availabilityChecks.push('A03 local-only draft remains visible and unqueued');

    for (const language of ['en', 'zh', 'ja']) {
      selectLanguage(language);
      assert(document.querySelector('#composer').dataset.nodeRef === composerNodeRef, `A10 ${language} changed composer semantic identity`);
      assert(
        document.querySelector('#composerHint').textContent.startsWith(app.t('composer.availability.unavailable-draft')),
        `A10 ${language} unavailable-draft truth did not render from the stable string ref`
      );
      localizationChecks.push({ language, availabilityRef: 'composer.availability.unavailable-draft', state: 'PASS' });
    }
    selectLanguage('en');

    click('[data-action="select-view"][data-view="terrain"]');
    assert(document.querySelector('#view-terrain').hidden === false, 'A04 Terrain did not remain usable while Vex was unavailable');
    click('#terrainReset');
    assert(app.state.vexAvailability === 'UNAVAILABLE', 'A04 Terrain interaction changed Vex availability');
    assert(input.value === blockedDraft, 'A04 Terrain interaction lost the unsent local draft');
    availabilityChecks.push('A04 Terrain remains usable while unavailable');

    click('[data-action="select-view"][data-view="chat"]');
    assert(app.state.vexAvailability === 'UNAVAILABLE', 'A05 returning from Terrain changed availability truth');
    assert(input.value === blockedDraft, 'A05 returning from Terrain lost the unsent local draft');
    assert(sendButton.disabled, 'A05 Send became available without an availability transition');
    availabilityChecks.push('A05 returning from Terrain preserves availability and draft truth');

    app.chat.setVexAvailability('AVAILABLE');
    await delay(230);
    assert(blockedList.length === blockedCountBefore, 'A06 availability restoration auto-sent the stale draft');
    assert(app.chat.pendingReplyCount() === 0, 'A06 availability restoration scheduled a reply');
    assert(app.state.unsentLocalDraft?.content === blockedDraft, 'A06 availability restoration consumed the stale draft');
    assert(input.value === blockedDraft, 'A06 availability restoration removed the visible draft');
    assert(!sendButton.disabled, 'A06 Send did not become available after restoration');
    availabilityChecks.push('A06 restoration leaves stale draft unsent');

    const countBeforeTransitions = blockedList.length;
    for (let index = 0; index < 3; index += 1) {
      app.chat.setVexAvailability('UNAVAILABLE');
      app.chat.setVexAvailability('AVAILABLE');
    }
    await delay(230);
    assert(blockedList.length === countBeforeTransitions, 'A08 repeated availability transitions sent or duplicated stale content');
    assert(app.chat.pendingReplyCount() === 0, 'A08 repeated availability transitions scheduled a reply');
    assert(input.value === blockedDraft, 'A08 repeated availability transitions changed the draft');
    availabilityChecks.push('A08 repeated transitions do not duplicate or send stale content');

    for (const language of ['en', 'zh', 'ja']) {
      selectLanguage(language);
      assert(document.querySelector('#composer').dataset.nodeRef === composerNodeRef, `A10 ${language} changed composer semantic identity after restoration`);
      assert(
        document.querySelector('#composerHint').textContent.startsWith(app.t('composer.availability.available')),
        `A10 ${language} available truth did not render from the stable string ref`
      );
      localizationChecks.push({ language, availabilityRef: 'composer.availability.available', state: 'PASS' });
    }
    selectLanguage('en');

    assert(app.chat.roleLabel('companion') === companionIdentityBefore, 'A09 visible Vex identity changed with availability state');
    availabilityChecks.push('A09 visible Vex identity is stable across availability');

    composer.requestSubmit();
    await delay(230);
    assert(blockedList.length === blockedCountBefore + 2, 'A07 explicit post-restoration send did not produce exactly one accepted message and one reply');
    assert(blockedList.some((message) => message.content === blockedDraft), 'A07 explicit send did not accept the visible draft');
    assert(app.state.unsentLocalDraft === null, 'A07 accepted send left stale draft state behind');
    assert(input.value === '', 'A07 accepted send did not clear the composer');
    availabilityChecks.push('A07 explicit send after restoration is the only acceptance path');
    availabilityChecks.push('A10 EN/JA/ZH availability truth uses stable refs and composer identity');

    const markerSelfCompanion = 'integration.marker.self.companion';
    const markerSelfGuide = 'integration.marker.self.guide';
    const markerVexGuided = 'integration.marker.vex-home.guided';
    const markerVexWorkshop = 'integration.marker.vex-home.workshop';
    const markerLocalFoundation = 'integration.marker.local-vex.foundation';

    await sendMarker(markerSelfCompanion);
    click('[data-channel-ref="channel.self-development.guide"]');
    await sendMarker(markerSelfGuide);

    click('[data-project-ref="project.vex-home-product"] .project-button');
    await sendMarker(markerVexGuided);
    click('[data-instance-ref="instance.thread-entry.thread.vex-home.product-workshop"]');
    click('[data-channel-ref="channel.vex-home.product-workshop.guide"]');
    await sendMarker(markerVexWorkshop);

    click('[data-project-ref="project.local-vex"] .project-button');
    await sendMarker(markerLocalFoundation);
    assertVisibleOwnership(app, markerLocalFoundation, [markerSelfCompanion, markerSelfGuide, markerVexGuided, markerVexWorkshop]);
    ownershipChecks.push('local-vex.foundation.root-hub isolated');

    click('[data-project-ref="project.vex-home-product"] .project-button');
    click('[data-instance-ref="instance.thread-entry.thread.vex-home.product-workshop"]');
    assert(app.state.channelRef === 'channel.vex-home.product-workshop.guide', 'Workshop selected channel was not restored');
    assertVisibleOwnership(app, markerVexWorkshop, [markerSelfCompanion, markerSelfGuide, markerVexGuided, markerLocalFoundation]);
    ownershipChecks.push('vex-home.product-workshop.guide restored');

    click('[data-instance-ref="instance.thread-entry.thread.vex-home.guided-fresh"]');
    assert(app.state.channelRef === 'channel.vex-home.guided-fresh.companion', 'Guided thread selected channel was not restored');
    assertVisibleOwnership(app, markerVexGuided, [markerSelfCompanion, markerSelfGuide, markerVexWorkshop, markerLocalFoundation]);
    ownershipChecks.push('vex-home.guided-fresh.companion restored');

    click('[data-project-ref="project.self-development"] .project-button');
    assert(app.state.channelRef === 'channel.self-development.guide', 'Self-development selected channel was not restored');
    assertVisibleOwnership(app, markerSelfGuide, [markerSelfCompanion, markerVexGuided, markerVexWorkshop, markerLocalFoundation]);
    ownershipChecks.push('self-development.open-conversation.guide restored');

    click('[data-channel-ref="channel.self-development.companion"]');
    assertVisibleOwnership(app, markerSelfCompanion, [markerSelfGuide, markerVexGuided, markerVexWorkshop, markerLocalFoundation]);
    ownershipChecks.push('multiple channels remain isolated inside one thread');

    if (document.querySelector('#guideWindow').hidden) click('#guideToggle');
    const intentCases = [
      ['intent.guide.current', 'guide.ask.current'],
      ['intent.guide.next', 'guide.mode.next'],
      ['intent.guide.protects', 'guide.ask.protects']
    ];
    for (const language of ['en', 'zh', 'ja']) {
      selectLanguage(language);
      for (const [intentRef, promptRef] of intentCases) {
        const button = click(`[data-guide-intent-ref="${intentRef}"]`);
        const response = app.guide.responseForIntent(intentRef);
        const rendered = [...document.querySelectorAll(`.guide-message.guide[data-intent-ref="${intentRef}"]`)].at(-1);
        assert(button.textContent === app.t(promptRef), `${language} Guide prompt did not render from ${promptRef}`);
        assert(rendered?.dataset.contentRef === response.contentRef, `${language} Guide response used the wrong contentRef for ${intentRef}`);
        assert(rendered?.textContent === app.t(response.contentRef, response.contentParams), `${language} Guide response was not localized for ${intentRef}`);
        localizationChecks.push({ language, intentRef, promptRef, responseRef: response.contentRef, state: 'PASS' });
      }
    }

    const result = {
      schemaVersion: 'vexlife.browser-integration-receipt/v0',
      state: 'PASS',
      availabilityChecks,
      projectsExercised: ['project.self-development', 'project.vex-home-product', 'project.local-vex'],
      threadsExercised: [
        'thread.self-development.open-conversation',
        'thread.vex-home.guided-fresh',
        'thread.vex-home.product-workshop',
        'thread.local-vex.foundation'
      ],
      channelsExercised: [
        'channel.self-development.companion',
        'channel.self-development.guide',
        'channel.vex-home.guided-fresh.companion',
        'channel.vex-home.product-workshop.guide',
        'channel.local-vex.foundation.root-hub'
      ],
      ownershipChecks,
      localizationChecks
    };
    host.dataset.state = 'PASS';
    host.textContent = JSON.stringify(result, null, 2);
    globalThis.__VEXLIFE_INTEGRATION_RESULT__ = result;
    return result;
  } catch (error) {
    const result = {
      schemaVersion: 'vexlife.browser-integration-receipt/v0',
      state: 'FAIL',
      error: error instanceof Error ? error.message : String(error),
      availabilityChecks,
      ownershipChecks,
      localizationChecks
    };
    host.dataset.state = 'FAIL';
    host.textContent = JSON.stringify(result, null, 2);
    globalThis.__VEXLIFE_INTEGRATION_RESULT__ = result;
    throw error;
  }
}

// [VXG RealForever]
