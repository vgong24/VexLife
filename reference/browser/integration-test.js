const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const click = (selector) => { const element = document.querySelector(selector); assert(element, `Missing ${selector}`); element.click(); return element; };
const selectLanguage = (language) => { const select = document.querySelector('#languageSelect'); select.value = language; select.dispatchEvent(new Event('change', { bubbles: true })); };
const selectedMessageList = (app) => app.messages.get(`${app.state.projectRef}::${app.state.threadRef}::${app.state.channelRef}`);
const visibleMessages = () => [...document.querySelectorAll('#messageFeed .message')].map((node) => ({ text: node.querySelector('.message-body')?.textContent || '', projectRef: node.dataset.projectRef, threadRef: node.dataset.threadRef, channelRef: node.dataset.channelRef }));
function assertVisibleOwnership(app, required, forbidden = []) {
  const visible = visibleMessages();
  assert(visible.some((message) => message.text === required), `Missing selected marker ${required}`);
  for (const marker of forbidden) assert(!visible.some((message) => message.text === marker), `Cross-thread message leakage: ${marker}`);
  for (const message of visible) { assert(message.projectRef === app.state.projectRef, 'Visible project ownership drift'); assert(message.threadRef === app.state.threadRef, 'Visible thread ownership drift'); assert(message.channelRef === app.state.channelRef, 'Visible channel ownership drift'); }
}
async function sendMarker(marker) { const input = document.querySelector('#messageInput'); input.value = marker; input.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#composer').requestSubmit(); await delay(230); }
function visibleRatioWithin(canvas, node) {
  const c = canvas.getBoundingClientRect(); const n = node.getBoundingClientRect();
  const width = Math.max(0, Math.min(c.right, n.right) - Math.max(c.left, n.left));
  const height = Math.max(0, Math.min(c.bottom, n.bottom) - Math.max(c.top, n.top));
  return (width * height) / Math.max(1, n.width * n.height);
}

export async function runBrowserIntegration() {
  const host = document.createElement('pre'); host.id = 'integrationReceipt'; host.dataset.state = 'RUNNING'; document.body.append(host);
  const app = globalThis.__VEXLIFE_APP__;
  const stageBChecks = []; const availabilityChecks = []; const ownershipChecks = []; const localizationChecks = [];
  try {
    assert(app.rootContract?.contractRef === 'contract.vexlife.e27.authoritative-root/v1', 'B01 authoritative root contract missing');
    assert(app.state.view === 'terrain' && app.state.contextProjection === null, 'B01 Terrain is not default primary stage');
    assert(!document.querySelector('#view-terrain').hidden, 'B01 Terrain hidden');
    assert(document.querySelector('#view-chat').hidden && document.querySelector('#view-health').hidden, 'B01 contextual projection visible by default');
    assert(document.querySelector('#projectRail').getAttribute('aria-hidden') === 'true', 'B02 project rail persists by default');
    assert(document.querySelector('#guideToggle').hidden, 'B03 legacy Guide toggle is visible');
    assert(!document.querySelector('[data-selection-group="selection.primary-view"]'), 'B03 primary-view tab topology survived');
    stageBChecks.push('B01 Terrain is the single primary stage','B02 workspace is contextual and closed by default','B03 ambient Vex replaces Guide-first/default-tab presentation');

    app.openContext('chat', 'element.nav.chat');
    assert(app.state.contextProjection === 'chat' && !document.querySelector('#view-chat').hidden, 'B04 Chat did not open contextually');
    assert(!document.querySelector('#view-terrain').hidden, 'B04 Chat consumed Terrain stage');
    stageBChecks.push('B04 Chat projects over Terrain instead of replacing it');

    const composer = document.querySelector('#composer'); const input = document.querySelector('#messageInput'); const send = composer.querySelector('button[type="submit"]');
    const blockedDraft = 'integration.marker.unsent-local-draft'; const blockedList = selectedMessageList(app); const blockedCount = blockedList.length; const blockedChannel = app.state.channelRef;
    assert(app.state.vexAvailability === 'UNAVAILABLE' && send.disabled, 'A01 unavailable truth missing');
    input.value = blockedDraft; input.dispatchEvent(new Event('input', { bubbles: true })); composer.requestSubmit(); await delay(230);
    assert(blockedList.length === blockedCount, 'A01 unavailable submit appended a message'); assert(app.chat.pendingReplyCount() === 0, 'A02 unavailable submit scheduled reply');
    assert(app.state.unsentLocalDraft?.state === 'UNSENT_LOCAL_DRAFT' && app.state.unsentLocalDraft?.channelRef === blockedChannel, 'A03 local draft ownership lost');
    availabilityChecks.push('A01-A03 unavailable submit remains an unqueued channel-bound local draft');

    for (const language of ['en','zh','ja']) { selectLanguage(language); assert(document.querySelector('#composerHint').textContent.startsWith(app.t('composer.availability.unavailable-draft')), `${language} unavailable-draft truth not localized`); localizationChecks.push(`${language}:UNAVAILABLE_DRAFT`); }
    selectLanguage('en');

    app.returnToTerrain(); assert(app.state.contextProjection === null && !document.querySelector('#view-terrain').hidden, 'B05 contextual return failed'); assert(input.value === blockedDraft, 'B05 contextual return lost draft');
    stageBChecks.push('B05 return to Terrain preserves contextual conversation state');

    const depthBefore = app.state.terrain.semanticDepth;
    const scroll = app.terrain.evaluateSemanticAutoEntry({ nodeRef: app.state.terrain.selected, visibilityRatio: 1, confidence: 1, source: 'ORDINARY_SCROLL' });
    assert(scroll.committed === false && scroll.reason === 'ORDINARY_SCROLL_NEVER_COMMITS', 'B06 ordinary scrolling committed semantic auto-entry'); assert(app.state.terrain.semanticDepth === depthBefore, 'B06 ordinary scroll changed semantic depth');
    app.terrain.setAutoEntryEnabled(true); app.terrain.setAutoEntryThresholds({ visibilityThreshold: .5, confidenceThreshold: .8 });
    assert(document.querySelector('#terrainAutoEntryStatus').textContent.includes('V≥50%') && document.querySelector('#terrainAutoEntryStatus').textContent.includes('C≥80%'), 'B06 thresholds are not human-visible');

    const terrainCanvas = document.querySelector('#terrainCanvas');
    let siblingCase = null;
    for (const node of document.querySelectorAll('.terrain-node[data-node-ref]')) {
      const sourceRef = node.dataset.nodeRef;
      const siblings = app.terrain.siblingRefs(sourceRef);
      const index = siblings.indexOf(sourceRef);
      const candidates = index >= 0 ? [[index + 1, 'NEXT'], [index - 1, 'PREVIOUS']] : [];
      for (const [targetIndex, direction] of candidates) {
        if (targetIndex < 0 || targetIndex >= siblings.length) continue;
        const targetRef = siblings[targetIndex];
        const targetNode = document.querySelector(`.terrain-node[data-node-ref="${CSS.escape(targetRef)}"]`);
        if (targetNode && visibleRatioWithin(terrainCanvas, targetNode) >= .5) { siblingCase = { sourceRef, targetRef, direction }; break; }
      }
      if (siblingCase) break;
    }
    assert(siblingCase, 'B07 no visible sibling pair available for single-evaluation proof');
    app.state.terrain.selected = siblingCase.sourceRef;
    app.terrain.setSemanticDepth(0);
    app.terrain.render();
    assert(app.terrain.navigateSibling(siblingCase.direction), 'B07 sibling navigation did not move');
    await delay(0); await delay(0);
    assert(app.state.terrain.selected === siblingCase.targetRef, 'B07 sibling target mismatch');
    assert(app.state.terrain.semanticDepth === 1, `B07 one sibling gesture advanced semantic depth to ${app.state.terrain.semanticDepth}`);
    stageBChecks.push('B06 semantic auto-entry is opt-in, visibly thresholded, confidence-gated, and ordinary-scroll-safe','B07 one sibling gesture commits at most one semantic auto-entry level');

    app.openContext('chat'); app.chat.setVexAvailability('AVAILABLE'); await delay(230);
    assert(blockedList.length === blockedCount && input.value === blockedDraft && !send.disabled, 'A06 restoration auto-sent or discarded stale draft');
    composer.requestSubmit(); await delay(230); assert(blockedList.length === blockedCount + 2 && app.state.unsentLocalDraft === null, 'A07 explicit send is not the only acceptance path');
    availabilityChecks.push('A06-A07 restoration never auto-sends; explicit send is acceptance');

    const markerSelf = 'integration.marker.self.companion'; const markerGuide = 'integration.marker.self.guide'; const markerVex = 'integration.marker.vex-home.guided';
    app.setWorkspaceOpen(true); await sendMarker(markerSelf); click('[data-channel-ref="channel.self-development.guide"]'); await sendMarker(markerGuide); click('[data-project-ref="project.vex-home-product"] .project-button'); await sendMarker(markerVex);
    assertVisibleOwnership(app, markerVex, [markerSelf, markerGuide]); ownershipChecks.push('project-thread-channel message isolation preserved');

    const sourceRefs = [...document.querySelectorAll('#channelTabs [data-source-role-ref]')].map((node) => node.dataset.sourceRoleRef);
    assert(sourceRefs.every((ref) => ref?.startsWith('role.vex.')), 'B08 visible Vex lost source-role attribution');
    assert([...document.querySelectorAll('#channelTabs [data-source-role-ref]')].every((node) => node.textContent.includes(app.t('vex.visible.name'))), 'B08 multiple visible Vex names survived');
    stageBChecks.push('B08 one visible ambient Vex preserves internal source-role attribution');

    for (const language of ['en','zh','ja']) { selectLanguage(language); assert(document.querySelector('#vexSummon').textContent.includes(app.t('vex.summon')), `${language} ambient Vex summon not localized`); localizationChecks.push(`${language}:AMBIENT_VEX`); }

    const result = { schemaVersion:'vexlife.e27-stage-b-browser-integration/v1', state:'PASS', stageBChecks, availabilityChecks, ownershipChecks, localizationChecks, primaryStageScreenRef:'screen.vexlife.terrain', presentationContractRef:app.rootContract.contractRef };
    host.dataset.state='PASS'; host.textContent=JSON.stringify(result,null,2); globalThis.__VEXLIFE_INTEGRATION_RESULT__=result; return result;
  } catch (error) {
    const result={schemaVersion:'vexlife.e27-stage-b-browser-integration/v1',state:'FAIL',error:error instanceof Error?error.message:String(error),stageBChecks,availabilityChecks,ownershipChecks,localizationChecks}; host.dataset.state='FAIL';host.textContent=JSON.stringify(result,null,2);globalThis.__VEXLIFE_INTEGRATION_RESULT__=result;throw error;
  }
}

// [VXG RealForever]
