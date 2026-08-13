import { loadBrowserBundle } from './modules/browser-bundle.js';
import { createDemoData } from './modules/demo-data.js';
import { $, $$, compileInterfaceEntries, loadJson, saveJson } from './modules/dom.js';
import { createNavigationController } from './modules/navigation-controller.js';
import { createChatController } from './modules/chat-controller.js';
import { createTerrainController } from './modules/terrain-controller.js';
import { createGuideController, GUIDE_INTENTS } from './modules/guide-controller.js';

const { blueprint, experience, designTokens, catalogs } = await loadBrowserBundle('../../');
const { projects, roles, channels, messages, state, createMessage, conversationKey } = createDemoData({ loadJson });
state.dataTruthClass = 'CURRENT_SYNTHETIC_REFERENCE';
state.scrollPositions = loadJson('vexlife.scroll.positions', {});
const interfaceEntries = compileInterfaceEntries(blueprint);
const elementByRef = new Map(interfaceEntries.map((entry) => [entry.ref, entry]));
const t = (ref, params = {}) => {
  const template = catalogs[state.language]?.[ref] ?? catalogs.en?.[ref] ?? `[${ref}]`;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
};

let guide = null;
let chat = null;
const navigation = createNavigationController({
  state, elementByRef,
  getProject: () => chat?.currentProject(), getThread: () => chat?.currentThread(), getChannel: () => chat?.currentChannel(),
  onFrameChange: () => guide?.updateFrame()
});
chat = createChatController({ state, projects, roles, channels, messages, createMessage, conversationKey, t, navigation });
const terrain = createTerrainController({ state, blueprint, t, navigation });
guide = createGuideController({ state, t, navigation, elementByRef, chat });

function renderHealth() {
  $('#technicalHealth').textContent = JSON.stringify({
    healthState: 'ATTENTION', evidenceClass: 'STATIC_REFERENCE_SYNTHETIC', dataTruthClass: state.dataTruthClass,
    blueprintRef: blueprint.blueprintRef, blueprintVersion: blueprint.version, contractVersion: blueprint.contractVersion,
    experienceRegistryRef: experience.registryRef ?? experience.experienceRegistryRef ?? 'blueprint/experience-registry.json',
    platformRef: 'platform.browser', repositoryReceipt: { state: 'NOT_RUN', executed: false, currentness: 'UNKNOWN' },
    modelReceipt: { state: 'UNAVAILABLE', executed: false, currentness: 'UNKNOWN' },
    contextEvidence: { state: 'SYNTHETIC', executed: false, currentness: 'DEMO_ONLY' },
    continuityEvidence: { state: 'SYNTHETIC', executed: false, currentness: 'DEMO_ONLY' },
    currentScreenFrame: navigation.semanticFrame(), semanticJourneyStepsRetained: navigation.journeyProjection().fullEventCount,
    rawPointerLogging: false, designTokenRef: designTokens.tokenSetRef
  }, null, 2);
}
function restoreScrollPositions() {
  $$('[data-scroll-surface]').forEach((element) => {
    const saved = state.scrollPositions[element.dataset.scrollSurface];
    if (saved) { element.scrollTop = saved.top ?? 0; element.scrollLeft = saved.left ?? 0; }
  });
}
function bindScrollPositions() {
  $$('[data-scroll-surface]').forEach((element) => element.addEventListener('scroll', () => {
    state.scrollPositions[element.dataset.scrollSurface] = { top: element.scrollTop, left: element.scrollLeft };
    saveJson('vexlife.scroll.positions', state.scrollPositions);
  }, { passive: true }));
}
function applyLocalization() {
  document.documentElement.lang = state.language;
  $$('[data-i18n]').forEach((element) => { element.textContent = t(element.dataset.i18n); });
  $$('[data-i18n-placeholder]').forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  $$('[data-i18n-aria-label]').forEach((element) => { element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel)); });
  $('#languageSelect').value = state.language;
  chat.renderProjectRail(); chat.renderChannels(); chat.renderPresence(); chat.renderMessages(); chat.updateComposer(); chat.renderContext();
  terrain.render(); guide.updateFrame(); guide.renderMessages(); renderHealth(); restoreScrollPositions();
}
function selectView(view, nodeRef) {
  $$('[data-view-panel]').forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== view; });
  navigation.navigate(nodeRef, { view, selectedNodeRef: nodeRef }, 'action.view.select');
  navigation.setSelection('selection.primary-view', nodeRef);
  if (view === 'terrain') terrain.render(); if (view === 'health') renderHealth();
  queueMicrotask(restoreScrollPositions);
}
$$('[data-action="select-view"]').forEach((button) => button.addEventListener('click', () => selectView(button.dataset.view, button.dataset.nodeRef)));
$('#homeButton').addEventListener('click', () => {
  $$('[data-view-panel]').forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== 'chat'; });
  navigation.navigate('element.nav.home', { view: 'chat' }, 'action.navigation.home');
  navigation.setSelection('selection.primary-view', 'element.nav.chat');
  queueMicrotask(restoreScrollPositions);
});
$('#languageSelect').addEventListener('change', (event) => {
  state.language = event.target.value; localStorage.setItem('vexlife.language', state.language);
  navigation.navigate('element.language.selector', {}, 'action.language.select'); applyLocalization();
});
$('#architectureButton').addEventListener('click', () => { guide.setOpen(true); guide.askIntent(GUIDE_INTENTS.ARCHITECTURE); });

selectView('chat', 'element.nav.chat');
chat.renderProjectRail();
chat.selectThread(projects[2], projects[2].threads[0], 'element.thread.open-conversation', false);
bindScrollPositions();
applyLocalization();
guide.setOpen(state.guideOpen);
guide.addMessage('guide', { contentRef: 'guide.intro' });
renderHealth();

globalThis.__VEXLIFE_APP__ = { state, projects, channels, messages, chat, guide, terrain, navigation, experience, t };
if (new URLSearchParams(globalThis.location.search).get('integration') === '1') {
  const { runBrowserIntegration } = await import('./integration-test.js');
  globalThis.__VEXLIFE_INTEGRATION_PROMISE__ = runBrowserIntegration();
}

// [VXG RealForever]
