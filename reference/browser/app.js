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
let navigation = null;
const semanticScrollKey = (element) => {
  const frame = navigation?.semanticFrame?.() ?? {
    screenRef: `screen.vexlife.${state.view}`,
    routeRef: `route.${state.view}`,
    projectRef: state.projectRef,
    threadRef: state.threadRef,
    channelRef: state.channelRef,
    selectedNodeRef: state.selectedNodeRef
  };
  const selectedScope = element.dataset.scrollSurface === 'element.terrain.details' ? (frame.selectedNodeRef ?? '') : '';
  return [
    element.dataset.scrollSurface,
    frame.screenRef,
    frame.routeRef,
    frame.projectRef ?? '',
    frame.threadRef ?? '',
    frame.channelRef ?? '',
    selectedScope
  ].join('::');
};
function restoreScrollPositions() {
  $$('[data-scroll-surface]').forEach((element) => {
    const saved = state.scrollPositions[semanticScrollKey(element)];
    if (saved) { element.scrollTop = saved.top ?? 0; element.scrollLeft = saved.left ?? 0; }
  });
}
function bindScrollPositions() {
  $$('[data-scroll-surface]').forEach((element) => element.addEventListener('scroll', () => {
    state.scrollPositions[semanticScrollKey(element)] = { top: element.scrollTop, left: element.scrollLeft };
    saveJson('vexlife.scroll.positions', state.scrollPositions);
  }, { passive: true }));
}
function visibleVexName() { return t('vex.visible.name'); }
function internalVexLabels() {
  return ['companion', 'guide', 'root'].map((key) => roles[key]?.labelRef ? t(roles[key].labelRef) : roles[key]?.label).filter(Boolean);
}
function replaceInternalVexLabels(text) {
  let next = String(text ?? '');
  for (const label of internalVexLabels()) next = next.split(label).join(visibleVexName());
  return next;
}
function projectVisibleVexIdentity() {
  const visibleName = visibleVexName();
  for (const button of $$('#channelTabs [data-channel-ref]')) {
    const channel = channels.find((candidate) => candidate.channelRef === button.dataset.channelRef);
    if (!channel || channel.kind !== 'DIRECT' || channel.roleKey === 'victor') continue;
    const sourceRoleRef = roles[channel.roleKey]?.actorRef;
    if (!sourceRoleRef) continue;
    button.dataset.sourceRoleRef = sourceRoleRef;
    button.setAttribute('aria-label', `${visibleName} · ${sourceRoleRef}`);
    const existingSource = button.querySelector('.channel-source-ref')?.textContent;
    if (button.querySelector('.visible-vex-name')?.textContent !== visibleName || existingSource !== sourceRoleRef) {
      const name = document.createElement('span'); name.className = 'visible-vex-name'; name.textContent = visibleName;
      const source = document.createElement('small'); source.className = 'channel-source-ref'; source.textContent = sourceRoleRef;
      button.replaceChildren(name, source);
    }
  }

  const memberKeys = chat?.currentChannel()?.memberKeys ?? [];
  [...($('#presence')?.children ?? [])].forEach((span, index) => {
    const key = memberKeys[index]; const actorRef = roles[key]?.actorRef;
    if (!actorRef) return;
    span.dataset.actorRef = actorRef;
    if (key !== 'victor') {
      if (span.textContent !== visibleName) span.textContent = visibleName;
      span.title = actorRef;
    }
  });

  for (const article of $$('#messageFeed .message')) {
    const strong = article.querySelector('.message-header strong');
    if (strong) {
      const normalized = replaceInternalVexLabels(strong.textContent);
      if (normalized !== strong.textContent) strong.textContent = normalized;
    }
    const sourceRoleRef = article.dataset.speaker;
    if (sourceRoleRef?.startsWith('role.vex.')) {
      let source = article.querySelector('.message-source-ref');
      if (!source) {
        source = document.createElement('span'); source.className = 'message-source-ref';
        article.querySelector('.message-header')?.append(source);
      }
      if (source.textContent !== sourceRoleRef) source.textContent = sourceRoleRef;
    }
  }

  const composerAddress = $('#composerAddress');
  if (composerAddress) {
    const normalized = replaceInternalVexLabels(composerAddress.textContent);
    if (normalized !== composerAddress.textContent) composerAddress.textContent = normalized;
  }
  for (const strong of $$('#contextSummary strong')) {
    const normalized = replaceInternalVexLabels(strong.textContent);
    if (normalized !== strong.textContent) strong.textContent = normalized;
  }
}
function projectCurrentFrame() {
  $$('[data-view-panel]').forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== state.view; });
  const viewNodeRef = `element.nav.${state.view}`;
  navigation.setSelection('selection.primary-view', viewNodeRef);
  chat.renderProjectRail();
  const project = chat.currentProject();
  const thread = chat.currentThread();
  $('#threadTitle').textContent = t(thread.stringRef);
  $('#threadDescription').textContent = `${t(project.descriptionRef)} ${t(thread.descriptionRef)}`;
  chat.renderChannels(); chat.renderPresence(); chat.renderMessages(); chat.updateComposer(); chat.renderContext();
  if (state.view === 'terrain') terrain.render();
  if (state.view === 'health') renderHealth();
  guide.updateFrame(); projectVisibleVexIdentity();
  queueMicrotask(restoreScrollPositions);
}

navigation = createNavigationController({
  state, elementByRef,
  getProject: () => chat?.currentProject(), getThread: () => chat?.currentThread(), getChannel: () => chat?.currentChannel(),
  onFrameChange: () => { guide?.updateFrame(); queueMicrotask(() => { restoreScrollPositions(); projectVisibleVexIdentity(); }); }
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
function applyLocalization() {
  document.documentElement.lang = state.language;
  $$('[data-i18n]').forEach((element) => { element.textContent = t(element.dataset.i18n); });
  $$('[data-i18n-placeholder]').forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  $$('[data-i18n-aria-label]').forEach((element) => { element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel)); });
  $('#languageSelect').value = state.language;
  chat.renderProjectRail(); chat.renderChannels(); chat.renderPresence(); chat.renderMessages(); chat.updateComposer(); chat.renderContext();
  terrain.render(); guide.updateFrame(); guide.renderMessages(); renderHealth(); projectVisibleVexIdentity(); restoreScrollPositions();
}
function selectView(view, nodeRef) {
  $$('[data-view-panel]').forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== view; });
  navigation.navigate(nodeRef, { view, selectedNodeRef: nodeRef }, 'action.view.select');
  navigation.setSelection('selection.primary-view', nodeRef);
  if (view === 'terrain') terrain.render(); if (view === 'health') renderHealth();
  queueMicrotask(() => { restoreScrollPositions(); projectVisibleVexIdentity(); });
}
$$('[data-action="select-view"]').forEach((button) => button.addEventListener('click', () => selectView(button.dataset.view, button.dataset.nodeRef)));
$('#homeButton').addEventListener('click', () => {
  $$('[data-view-panel]').forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== 'chat'; });
  navigation.navigate('element.nav.home', { view: 'chat' }, 'action.navigation.home');
  navigation.setSelection('selection.primary-view', 'element.nav.chat');
  queueMicrotask(() => { restoreScrollPositions(); projectVisibleVexIdentity(); });
});
$('#languageSelect').addEventListener('change', (event) => {
  state.language = event.target.value; localStorage.setItem('vexlife.language', state.language);
  navigation.navigate('element.language.selector', {}, 'action.language.select'); applyLocalization();
});
$('#architectureButton').addEventListener('click', () => { guide.setOpen(true); guide.askIntent(GUIDE_INTENTS.ARCHITECTURE); });
$('.brand')?.addEventListener('click', () => guide.summon());

globalThis.addEventListener('popstate', () => {
  const result = navigation.back();
  if (result.changed) projectCurrentFrame();
});
globalThis.addEventListener('keydown', (event) => {
  if (event.altKey && event.key === 'ArrowLeft' && navigation.backDepth() > 0) {
    event.preventDefault();
    globalThis.history.back();
  }
});

selectView('chat', 'element.nav.chat');
chat.renderProjectRail();
chat.selectThread(projects[2], projects[2].threads[0], 'element.thread.open-conversation', false);
bindScrollPositions();
applyLocalization();
guide.setOpen(state.guideOpen);
guide.addMessage('guide', { contentRef: 'guide.intro' });
renderHealth();
navigation.enableBrowserHistory();
const visibleIdentityObserver = new MutationObserver(() => queueMicrotask(projectVisibleVexIdentity));
visibleIdentityObserver.observe($('#app'), { childList: true, subtree: true });
projectVisibleVexIdentity();

globalThis.__VEXLIFE_APP__ = {
  state, projects, roles, channels, messages, chat, guide, terrain, navigation, experience, t,
  semanticScrollKey, restoreScrollPositions, projectCurrentFrame, projectVisibleVexIdentity
};
if (new URLSearchParams(globalThis.location.search).get('integration') === '1') {
  const { runBrowserIntegration } = await import('./integration-test.js');
  globalThis.__VEXLIFE_INTEGRATION_PROMISE__ = runBrowserIntegration();
}

// [VXG RealForever]
