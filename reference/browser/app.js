import { loadBrowserBundle } from './modules/browser-bundle.js';
import { createDemoData } from './modules/demo-data.js';
import { $, $$, compileInterfaceEntries, loadJson } from './modules/dom.js';
import { createNavigationController } from './modules/navigation-controller.js';
import { createChatController } from './modules/chat-controller.js';
import { createTerrainController } from './modules/terrain-controller.js';
import { createGuideController } from './modules/guide-controller.js';

const { blueprint, designTokens, catalogs } = await loadBrowserBundle('../../');
const { projects, roles, channels, messages, state, createMessage } = createDemoData({ loadJson });
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
chat = createChatController({ state, projects, roles, channels, messages, createMessage, t, navigation });
const terrain = createTerrainController({ state, blueprint, t, navigation });
guide = createGuideController({ state, t, navigation, elementByRef, chat });

function renderHealth() {
  $('#technicalHealth').textContent = JSON.stringify({
    blueprintRef: blueprint.blueprintRef, blueprintVersion: blueprint.version, contractVersion: blueprint.contractVersion,
    platformRef: 'platform.browser', localModelRequiredForReference: false, currentScreenFrame: navigation.semanticFrame(),
    semanticJourneyStepsRetained: state.journey.length, rawPointerLogging: false, designTokenRef: designTokens.tokenSetRef
  }, null, 2);
}
function applyLocalization() {
  document.documentElement.lang = state.language;
  $$('[data-i18n]').forEach((element) => { element.textContent = t(element.dataset.i18n); });
  $$('[data-i18n-placeholder]').forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  $$('[data-i18n-aria-label]').forEach((element) => { element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel)); });
  $('#languageSelect').value = state.language;
  chat.renderProjectRail(); chat.renderChannels(); chat.renderPresence(); chat.updateComposer(); chat.renderContext();
  terrain.render(); guide.updateFrame();
}
function selectView(view, nodeRef) {
  $$('[data-view-panel]').forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== view; });
  navigation.navigate(nodeRef, { view, selectedNodeRef: nodeRef }, 'action.view.select');
  navigation.setSelection('selection.primary-view', nodeRef);
  if (view === 'terrain') terrain.render(); if (view === 'health') renderHealth();
}
$$('[data-action="select-view"]').forEach((button) => button.addEventListener('click', () => selectView(button.dataset.view, button.dataset.nodeRef)));
$('#languageSelect').addEventListener('change', (event) => {
  state.language = event.target.value; localStorage.setItem('vexlife.language', state.language);
  navigation.navigate('element.language.selector', {}, 'action.language.select'); applyLocalization();
});
$('#architectureButton').addEventListener('click', () => { guide.setOpen(true); guide.ask('How is this current interface constructed?'); });

selectView('chat', 'element.nav.chat');
chat.renderProjectRail();
chat.selectThread(projects[2], projects[2].threads[0], 'element.thread.open-conversation', false);
applyLocalization();
guide.setOpen(state.guideOpen);
guide.addMessage('guide', 'I observe the current semantic screen frame. Select a project, thread, channel, view, or Terrain node and I will update without recording raw pointer movement.');
renderHealth();

// [VXG RealForever]
