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

async function sendMarker(marker) {
  const input = document.querySelector('#messageInput');
  input.value = marker;
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
  const ownershipChecks = [];
  const localizationChecks = [];

  try {
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
