import { $, escapeHtml } from './dom.js';
import {
  projectBrowserModelTurnFormation,
  renderModelTurnFormationDisclosure
} from './model-turn-formation-disclosure.js';

const PROJECT_NODE = {
  'project.self-development': 'element.project.self-development',
  'project.vexlife.root-hub': 'element.project.root-hub',
  'project.vex-home-product': 'element.project.vex-home-product',
  'project.local-vex': 'element.project.local-vex'
};
const THREAD_NODE = {
  'thread.self-development.open-conversation': 'element.thread.open-conversation',
  'thread.vex-home.guided-fresh': 'element.thread.guided-fresh',
  'thread.vex-home.product-workshop': 'element.thread.product-workshop',
  'thread.local-vex.foundation': 'element.thread.foundation',
  'thread.root-hub.welcome': 'element.thread.root-welcome'
};

export const BROWSER_COMPANION_AVAILABILITY_PATH = '/api/v1/companion/availability';

const BROWSER_COMPANION_AVAILABILITY_STATES = new Set([
  'READY',
  'STARTING',
  'RECOVERABLE',
  'ACTION_REQUIRED',
  'UNAVAILABLE',
  'HELD'
]);
const BROWSER_COMPANION_AVAILABILITY_AUTHORITY_FIELDS = Object.freeze([
  'effectAuthorityGranted',
  'rendererAuthorityGranted',
  'modelIdentityAuthorityGranted',
  'processAuthorityGranted',
  'conversationAuthorityGranted'
]);

function availabilityNonempty(value) {
  return typeof value === 'string' && value.length > 0;
}

export function normalizeBrowserCompanionAvailability(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Companion availability must be one object');
  }
  if (
    value.schemaVersion !== 'vexlife.companion-availability/v1'
    || value.truthClass !== 'SOURCE_BOUND_COMPANION_AVAILABILITY'
    || !BROWSER_COMPANION_AVAILABILITY_STATES.has(value.availabilityState)
  ) {
    throw new TypeError('Companion availability schema/truth/state is invalid');
  }
  for (const key of [
    'registryRef',
    'bindingRef',
    'homeRef',
    'companionLineageRef',
    'runtimeAdapterRef',
    'runtimeObservationRef',
    'recoveryClass',
    'reasonCode',
    'bindingState',
    'runtimeOwnershipState',
    'runtimeState',
    'qualificationState',
    'projectionRef'
  ]) {
    if (!availabilityNonempty(value[key])) throw new TypeError(`Companion availability.${key} is required`);
  }
  if (!/^[0-9a-f]{64}$/u.test(value.projectionSha256 ?? '')) {
    throw new TypeError('Companion availability projectionSha256 is invalid');
  }
  for (const key of ['modelRefOrNull', 'generationRefOrNull']) {
    if (value[key] !== null && !availabilityNonempty(value[key])) {
      throw new TypeError(`Companion availability.${key} must be null or one ref`);
    }
  }
  if (
    !Array.isArray(value.sourceRefs)
    || value.sourceRefs.some((ref) => !availabilityNonempty(ref))
    || new Set(value.sourceRefs).size !== value.sourceRefs.length
  ) {
    throw new TypeError('Companion availability sourceRefs are invalid');
  }
  for (const key of BROWSER_COMPANION_AVAILABILITY_AUTHORITY_FIELDS) {
    if (value[key] !== false) throw new TypeError(`Companion availability.${key} must remain false`);
  }
  return Object.freeze(structuredClone(value));
}

export function browserCompanionAvailabilityAllowsTurn(value) {
  try {
    return normalizeBrowserCompanionAvailability(value).availabilityState === 'READY';
  } catch {
    return false;
  }
}

export function browserCompanionRecoveryAvailable(value) {
  try {
    const current = normalizeBrowserCompanionAvailability(value);
    return current.availabilityState === 'RECOVERABLE'
      && current.recoveryClass === 'SAFE_REENTRY_AVAILABLE';
  } catch {
    return false;
  }
}

export function createChatController({ state, projects, roles, channels, messages, createMessage, conversationKey, t, navigation, experienceFoundation, capabilityRegistry }) {
  const currentProject = () => projects.find((project) => project.projectRef === state.projectRef) || projects[0];
  const currentThread = () => currentProject().threads.find((thread) => thread.threadRef === state.threadRef) || currentProject().threads[0];
  const channelsForThread = (projectRef = state.projectRef, threadRef = state.threadRef) =>
    channels.filter((channel) => channel.projectRef === projectRef && channel.threadRef === threadRef);
  const currentChannel = () => channelsForThread().find((channel) => channel.channelRef === state.channelRef) || channelsForThread()[0];
  const roleLabel = (key) => roles[key].labelRef ? t(roles[key].labelRef) : roles[key].label;
  const keyForChannel = (channel) => conversationKey(channel.projectRef, channel.threadRef, channel.channelRef);
  const listForChannel = (channel) => messages.get(keyForChannel(channel));
  const threadForMessage = (message) => projects
    .find((project) => project.projectRef === message.projectRef)
    ?.threads.find((thread) => thread.threadRef === message.threadRef);
  const pendingReplyTimers = new Set();
  let companionAvailability = null;
  let companionAvailabilityReadState = 'UNKNOWN';
  let companionTurnPending = false;
  let pendingSemanticRelayInput = null;
  let pendingSemanticRelayAction = null;
  let pendingSemanticRelayScope = null;
  let semanticRelayAttention = null;

  function sourceBoundCommandInputs() {
    if (
      experienceFoundation?.schemaVersion !== 'vexlife.experience-foundation/v1' ||
      experienceFoundation?.foundationRef !== 'foundation.vexlife.experience.001' ||
      experienceFoundation?.sourceRef !== 'source.blueprint.experience-foundation' ||
      experienceFoundation?.sourcePath !== 'blueprint/experience-foundation.json' ||
      experienceFoundation?.effects !== false ||
      !Array.isArray(experienceFoundation?.commandBindings)
    ) {
      throw new Error('browser composer requires exact current Experience Foundation source');
    }
    if (
      capabilityRegistry?.schemaVersion !== 'vexlife.capability-registry/v0' ||
      capabilityRegistry?.registryRef !== 'registry.vexlife.capabilities.001' ||
      !Array.isArray(capabilityRegistry?.capabilities)
    ) {
      throw new Error('browser composer requires exact current Capability Registry source');
    }

    const aliasIndex = new Map();
    for (const binding of experienceFoundation.commandBindings) {
      if (
        typeof binding?.commandRef !== 'string' ||
        typeof binding?.capabilityRef !== 'string' ||
        !Array.isArray(binding?.aliases) ||
        binding.aliases.length === 0
      ) {
        throw new Error('browser composer encountered malformed source-managed CommandBinding');
      }
      for (const alias of binding.aliases) {
        if (
          typeof alias?.literal !== 'string' ||
          !alias.literal.startsWith('/') ||
          /\s/u.test(alias.literal) ||
          alias.formRef !== 'form.vexlife.operator.slash-alias'
        ) {
          throw new Error('browser composer encountered malformed source-managed slash alias');
        }
        if (aliasIndex.has(alias.literal)) {
          throw new Error('browser composer encountered duplicate source-managed slash alias');
        }
        aliasIndex.set(alias.literal, binding);
      }
    }

    const announceBinding = aliasIndex.get('/announce') ?? null;
    if (
      announceBinding?.commandRef !== 'command.vexlife.announce' ||
      announceBinding?.capabilityRef !== 'conversation.announce' ||
      announceBinding?.actionRefOrNull !== null ||
      announceBinding?.processRefOrNull !== null
    ) {
      throw new Error('browser composer /announce binding is not the exact accepted no-effect source');
    }

    const announceCapabilities = capabilityRegistry.capabilities.filter(
      (item) => item.capabilityRef === 'conversation.announce'
    );
    if (announceCapabilities.length !== 1) {
      throw new Error('browser composer requires one exact conversation.announce capability');
    }
    const announceCapability = announceCapabilities[0];
    if (
      announceCapability.defaultStage !== 'REQUESTABLE' ||
      !Array.isArray(announceCapability.actionRefs) ||
      announceCapability.actionRefs.length !== 0 ||
      announceCapability.permissionRef !== 'permission.none' ||
      announceCapability.effectClass !== 'CONVERSATION_ANNOUNCEMENT_REQUEST'
    ) {
      throw new Error('browser composer cannot widen request-only announcement authority');
    }

    return Object.freeze({ aliasIndex, announceBinding, announceCapability });
  }

  const commandSources = sourceBoundCommandInputs();
  const commandAliasIndex = commandSources.aliasIndex;

  function sourceBindingFor(binding, capability = null) {
    return Object.freeze({
      sourceBindingRef: `binding.browser.experience-command.${binding.commandRef}`,
      foundationRef: experienceFoundation.foundationRef,
      foundationSourceRef: experienceFoundation.sourceRef,
      capabilityRegistryRef: capabilityRegistry.registryRef,
      commandRef: binding.commandRef,
      capabilityRef: binding.capabilityRef,
      actionRefOrNull: binding.actionRefOrNull ?? null,
      processRefOrNull: binding.processRefOrNull ?? null,
      capabilityStage: capability?.defaultStage ?? null,
      permissionRef: capability?.permissionRef ?? null,
      permissionGranted: false,
      executionRequested: false,
      executionPerformed: false,
      messageDeliveryPerformed: false,
      effects: false,
      authorityGranted: false
    });
  }

  let composerCommandState = Object.freeze({
    state: 'IDLE',
    command: null,
    commandRef: null,
    capabilityRef: null,
    sourceBindingRef: null,
    permissionGranted: false,
    executionRequested: false,
    executionPerformed: false,
    messageDeliveryPerformed: false
  });

  function resetComposerCommandState() {
    composerCommandState = Object.freeze({
      state: 'IDLE',
      command: null,
      commandRef: null,
      capabilityRef: null,
      sourceBindingRef: null,
      permissionGranted: false,
      executionRequested: false,
      executionPerformed: false,
      messageDeliveryPerformed: false
    });
  }

  function classifyComposerCommand(content) {
    if (!content.startsWith('/')) {
      return Object.freeze({ kind: 'NOT_COMMAND', command: null, binding: null });
    }
    if (/\s/u.test(content)) {
      return Object.freeze({ kind: 'MALFORMED_SLASH_LOCAL_REJECT', command: content, binding: null });
    }
    const binding = commandAliasIndex.get(content) ?? null;
    return Object.freeze({
      kind: binding ? 'KNOWN_COMMAND' : 'UNKNOWN_COMMAND',
      command: content,
      binding
    });
  }

  function projectComposerCommand(content) {
    const local = classifyComposerCommand(content);
    if (local.kind === 'NOT_COMMAND') {
      return Object.freeze({ handled: false });
    }
    if (local.kind === 'MALFORMED_SLASH_LOCAL_REJECT') {
      return Object.freeze({
        handled: true,
        state: Object.freeze({
          state: 'MALFORMED_SLASH',
          command: local.command,
          commandRef: null,
          capabilityRef: null,
          sourceBindingRef: null,
          permissionGranted: false,
          executionRequested: false,
          executionPerformed: false,
          messageDeliveryPerformed: false
        })
      });
    }
    if (local.kind === 'UNKNOWN_COMMAND') {
      return Object.freeze({
        handled: true,
        state: Object.freeze({
          state: 'UNKNOWN_COMMAND',
          command: local.command,
          commandRef: null,
          capabilityRef: null,
          sourceBindingRef: null,
          permissionGranted: false,
          executionRequested: false,
          executionPerformed: false,
          messageDeliveryPerformed: false
        })
      });
    }

    const binding = local.binding;
    if (binding.commandRef !== 'command.vexlife.announce') {
      const sourceBinding = sourceBindingFor(binding);
      return Object.freeze({
        handled: true,
        state: Object.freeze({
          state: 'KNOWN_COMMAND_HELD',
          command: local.command,
          commandRef: binding.commandRef,
          capabilityRef: binding.capabilityRef,
          sourceBindingRef: sourceBinding.sourceBindingRef,
          permissionGranted: false,
          executionRequested: false,
          executionPerformed: false,
          messageDeliveryPerformed: false
        })
      });
    }

    const sourceBinding = sourceBindingFor(binding, commandSources.announceCapability);
    if (
      sourceBinding.commandRef !== 'command.vexlife.announce' ||
      sourceBinding.capabilityRef !== 'conversation.announce' ||
      sourceBinding.actionRefOrNull !== null ||
      sourceBinding.processRefOrNull !== null ||
      sourceBinding.capabilityStage !== 'REQUESTABLE' ||
      sourceBinding.permissionRef !== 'permission.none' ||
      sourceBinding.permissionGranted !== false ||
      sourceBinding.executionRequested !== false ||
      sourceBinding.executionPerformed !== false ||
      sourceBinding.messageDeliveryPerformed !== false ||
      sourceBinding.effects !== false ||
      sourceBinding.authorityGranted !== false
    ) {
      throw new Error('browser /announce source binding widened command authority or delivery semantics');
    }

    return Object.freeze({
      handled: true,
      state: Object.freeze({
        state: 'ANNOUNCE_REQUESTABLE',
        command: local.command,
        commandRef: sourceBinding.commandRef,
        capabilityRef: sourceBinding.capabilityRef,
        sourceBindingRef: sourceBinding.sourceBindingRef,
        permissionGranted: sourceBinding.permissionGranted,
        executionRequested: sourceBinding.executionRequested,
        executionPerformed: sourceBinding.executionPerformed,
        messageDeliveryPerformed: sourceBinding.messageDeliveryPerformed
      })
    });
  }

  function composerCommandStatusText() {
    if (composerCommandState.state === 'ANNOUNCE_REQUESTABLE') {
      return t('composer.command.announce.requestable');
    }
    if (composerCommandState.state === 'UNKNOWN_COMMAND') {
      return t('composer.command.unknown', { command: composerCommandState.command });
    }
    if (composerCommandState.state === 'MALFORMED_SLASH') {
      return t('composer.command.malformed');
    }
    if (composerCommandState.state === 'KNOWN_COMMAND_HELD') {
      return t('composer.command.known-held', { command: composerCommandState.command });
    }
    return null;
  }

  const isVexAvailable = () => state.vexAvailability === 'AVAILABLE';
  const companionAvailabilitySnapshot = () => companionAvailability
    ? structuredClone(companionAvailability)
    : null;
  const companionAvailabilityState = () =>
    companionAvailability?.availabilityState ?? companionAvailabilityReadState;
  const channelIsAvailable = (channel = currentChannel()) =>
    channel.roleKey === 'companion'
      ? browserCompanionAvailabilityAllowsTurn(companionAvailability) && !companionTurnPending
      : isVexAvailable();
  const draftForChannel = (channel = currentChannel()) =>
    state.unsentLocalDraft?.channelRef === channel.channelRef ? state.unsentLocalDraft : null;
  const semanticRelayScope = (channel = currentChannel()) => Object.freeze({
    projectRef: channel.projectRef,
    threadRef: channel.threadRef,
    channelRef: channel.channelRef
  });
  const semanticRelayScopeMatches = (scope, channel = currentChannel()) => Boolean(scope)
    && scope.projectRef === channel.projectRef
    && scope.threadRef === channel.threadRef
    && scope.channelRef === channel.channelRef;

  function setLocalDraft(channel, content) {
    if (!content) {
      if (state.unsentLocalDraft?.channelRef === channel.channelRef) state.unsentLocalDraft = null;
      return;
    }
    state.unsentLocalDraft = {
      state: 'UNSENT_LOCAL_DRAFT',
      channelRef: channel.channelRef,
      content,
      updatedAt: new Date().toISOString(),
      queued: false,
      accepted: false
    };
  }

  function cancelPendingReplies() {
    for (const timer of pendingReplyTimers) window.clearTimeout(timer);
    pendingReplyTimers.clear();
  }

  function renderProjectRail() {
    const host = $('#projectList');
    host.replaceChildren();
    for (const project of projects) {
      const block = document.createElement('section');
      block.className = 'project-block';
      block.dataset.projectRef = project.projectRef;
      block.classList.toggle('is-selected', project.projectRef === state.projectRef);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'project-button';
      button.dataset.nodeRef = PROJECT_NODE[project.projectRef] || `element.${project.projectRef}`;
      button.dataset.selectionGroup = 'selection.project';
      button.dataset.componentRef = 'component.vexlife.project-entry';
      button.dataset.instanceRef = `instance.project-entry.${project.projectRef}`;
      button.innerHTML = `<span aria-hidden="true">⌄</span><span><strong>${escapeHtml(t(project.stringRef))}</strong><small>${escapeHtml(t(project.descriptionRef))}</small></span><span class="dot" aria-label="${escapeHtml(t('health.reference-status'))}"></span>`;
      button.addEventListener('click', () => selectProject(project, button.dataset.nodeRef));
      block.append(button);

      const list = document.createElement('div');
      list.className = 'thread-list';
      for (const thread of project.threads.slice(0, 10)) {
        const threadButton = document.createElement('button');
        threadButton.type = 'button';
        threadButton.className = 'thread-button';
        threadButton.dataset.nodeRef = THREAD_NODE[thread.threadRef] || `element.${thread.threadRef}`;
        threadButton.dataset.selectionGroup = 'selection.thread';
        threadButton.dataset.componentRef = 'component.vexlife.thread-entry';
        threadButton.dataset.instanceRef = `instance.thread-entry.${thread.threadRef}`;
        threadButton.classList.toggle('is-selected', thread.threadRef === state.threadRef);
        threadButton.innerHTML = `<span class="dot" style="background:#73899a" aria-hidden="true"></span><span><strong>${escapeHtml(t(thread.stringRef))}</strong><small>${escapeHtml(t(thread.topicRef))} · ${escapeHtml(t('thread.topic-current'))}</small></span><span class="count">${thread.count}</span>`;
        threadButton.addEventListener('click', () => selectThread(project, thread, threadButton.dataset.nodeRef));
        list.append(threadButton);
      }
      block.append(list);
      host.append(block);
    }
    navigation.setSelection('selection.project', PROJECT_NODE[state.projectRef] || `element.${state.projectRef}`);
    navigation.setSelection('selection.thread', THREAD_NODE[state.threadRef] || `element.${state.threadRef}`);
  }

  function selectProject(project, nodeRef) {
    const thread = project.threads[0];
    selectThread(project, thread, THREAD_NODE[thread.threadRef] || nodeRef);
  }

  function selectThread(project, thread, nodeRef, refreshRail = true) {
    const ownedChannels = channelsForThread(project.projectRef, thread.threadRef);
    const rememberedChannelRef = state.selectedChannelByThread.get(thread.threadRef);
    const channel = ownedChannels.find((candidate) => candidate.channelRef === rememberedChannelRef) || ownedChannels[0];
    if (!channel) throw new Error(`Thread has no owned channel: ${thread.threadRef}`);
    state.selectedChannelByThread.set(thread.threadRef, channel.channelRef);
    navigation.navigate(nodeRef, {
      projectRef: project.projectRef,
      threadRef: thread.threadRef,
      channelRef: channel.channelRef
    }, 'action.thread.select');
    $('#threadTitle').textContent = t(thread.stringRef);
    $('#threadDescription').textContent = `${t(project.descriptionRef)} ${t(thread.descriptionRef)}`;
    renderChannels();
    renderPresence();
    renderMessages(true);
    updateComposer();
    renderContext();
    if (refreshRail) renderProjectRail();
  }

  function renderChannels() {
    const host = $('#channelTabs');
    host.replaceChildren();
    for (const channel of channelsForThread()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'channel-tab';
      button.role = 'tab';
      button.dataset.projectRef = channel.projectRef;
      button.dataset.threadRef = channel.threadRef;
      button.dataset.channelRef = channel.channelRef;
      button.dataset.nodeRef = channel.roleKey === 'companion'
        ? 'element.channel.companion'
        : channel.roleKey === 'guide' && channel.kind === 'DIRECT'
          ? 'element.channel.guide'
          : channel.roleKey === 'root'
            ? 'element.channel.root-hub'
            : 'element.channel.group';
      button.dataset.selectionGroup = 'selection.channel';
      button.dataset.selectionValue = channel.channelRef;
      button.dataset.componentRef = 'component.vexlife.channel-tab';
      button.dataset.instanceRef = `instance.channel-tab.${channel.channelRef}`;
      button.textContent = t(channel.labelRef);
      button.classList.toggle('is-selected', channel.channelRef === state.channelRef);
      button.setAttribute('aria-selected', String(channel.channelRef === state.channelRef));
      button.addEventListener('click', () => selectChannel(channel, button.dataset.nodeRef));
      host.append(button);
    }
  }

  function selectChannel(channel, nodeRef) {
    if (channel.projectRef !== state.projectRef || channel.threadRef !== state.threadRef) {
      throw new Error(`Channel ${channel.channelRef} is not owned by selected thread ${state.threadRef}`);
    }
    state.selectedChannelByThread.set(channel.threadRef, channel.channelRef);
    navigation.navigate(nodeRef, { channelRef: channel.channelRef }, 'action.channel.select');
    state.unread.set(keyForChannel(channel), 0);
    renderChannels();
    renderPresence();
    renderMessages(true);
    updateComposer();
    renderContext();
  }

  function renderPresence() {
    const host = $('#presence');
    host.replaceChildren();
    for (const key of currentChannel().memberKeys) {
      const span = document.createElement('span');
      span.textContent = roleLabel(key);
      host.append(span);
    }
  }

  function relayTarget(relay) {
    return Array.isArray(relay?.targets) && relay.targets.length > 0 ? relay.targets[0] : null;
  }

  function relayReasonRef(relay, target) {
    if (target?.runtimeCapability?.currentnessState && target.runtimeCapability.currentnessState !== 'CURRENT') return 'semantic-relay.reason.runtime';
    if (target?.projectionMode === 'NONE') return 'semantic-relay.reason.projection';
    if (['PARTIAL', 'CONTRADICTED', 'UNKNOWN'].includes(target?.semanticEquivalenceState)) return 'semantic-relay.reason.drift';
    if (relay?.interpretationState === 'CANDIDATE' && relay?.materiality === 'MATERIAL') return 'semantic-relay.reason.confirmation';
    return 'semantic-relay.reason.current';
  }

  function addRelayRow(host, labelRef, value) {
    const row = document.createElement('div');
    row.className = 'semantic-relay-row';
    const label = document.createElement('span');
    label.textContent = t(labelRef);
    const strong = document.createElement('strong');
    strong.textContent = value ?? '—';
    row.append(label, strong);
    host.append(row);
  }

  function renderSemanticRelayDisclosure(article, message) {
    const relay = message?.semanticRelay;
    if (!relay || relay.schemaVersion !== 'vexlife.semantic-relay-reference/v1') return;
    const target = relayTarget(relay);
    const details = document.createElement('details');
    details.className = 'semantic-relay-disclosure';
    details.dataset.relayRef = relay.relayRef;
    details.dataset.sourceLanguageRef = relay.sourceLanguageRef;
    details.dataset.requestedResponseLanguageRef = relay.requestedResponseLanguageRef;
    details.dataset.uiLanguage = state.language;
    const summary = document.createElement('summary');
    summary.textContent = t('semantic-relay.summary');
    details.append(summary);
    const grid = document.createElement('div');
    grid.className = 'semantic-relay-grid';
    addRelayRow(grid, 'semantic-relay.source-language', relay.sourceLanguageRef);
    addRelayRow(grid, 'semantic-relay.requested-language', relay.requestedResponseLanguageRef);
    addRelayRow(grid, 'semantic-relay.ui-current', state.language);
    addRelayRow(grid, 'semantic-relay.ui-recorded', relay.uiLocaleRef ?? '—');
    addRelayRow(grid, 'semantic-relay.projection', target?.projectionMode ?? 'NONE');
    addRelayRow(grid, 'semantic-relay.equivalence', target?.semanticEquivalenceState ?? 'NOT_CHECKED');
    addRelayRow(grid, 'semantic-relay.runtime-currentness', target?.runtimeCapability?.currentnessState ?? 'UNKNOWN');
    addRelayRow(grid, 'semantic-relay.delivery', target?.deliveryState ?? 'NOT_DELIVERED');
    addRelayRow(grid, 'semantic-relay.acknowledgement', target?.acknowledgementState ?? 'NOT_REQUESTED');
    addRelayRow(grid, 'semantic-relay.understanding', target?.understandingState ?? 'NOT_ASSESSED');
    addRelayRow(grid, 'semantic-relay.reason', t(relayReasonRef(relay, target)));
    const evidence = [...new Set([...(relay.evidenceRefs ?? []), ...(target?.runtimeCapability?.evidenceRefs ?? []), ...(target?.semanticDriftFindingRefs ?? [])])];
    addRelayRow(grid, 'semantic-relay.evidence', evidence.join(' · ') || '—');
    details.append(grid);
    article.querySelector('.message-body')?.after(details);
  }

  function setSemanticRelayInput(value, action = null, scope = semanticRelayScope()) {
    if (action !== null && action !== 'CORRECT') throw new Error('only a corrected relay may be pre-staged for the next send');
    pendingSemanticRelayInput = value ? structuredClone(value) : null;
    pendingSemanticRelayAction = value ? action : null;
    pendingSemanticRelayScope = value ? structuredClone(scope) : null;
    return pendingSemanticRelayInput ? structuredClone(pendingSemanticRelayInput) : null;
  }

  function setSemanticRelayAttention(value, options = {}) {
    const channel = options.channel ?? currentChannel();
    semanticRelayAttention = value ? {
      publicAttention: structuredClone(value),
      content: String(options.content ?? ''),
      relayInput: options.relayInput ? structuredClone(options.relayInput) : null,
      frameAtSend: options.frameAtSend ? structuredClone(options.frameAtSend) : null,
      scope: semanticRelayScope(channel)
    } : null;
    renderSemanticRelayAttention();
    return semanticRelayAttention?.publicAttention && semanticRelayScopeMatches(semanticRelayAttention.scope)
      ? structuredClone(semanticRelayAttention.publicAttention)
      : null;
  }

  async function semanticRelayAttentionAction(action) {
    const pending = semanticRelayAttention;
    if (!pending || !['CONFIRM', 'CORRECT', 'HOLD'].includes(action)) return false;
    const channel = currentChannel();
    if (!semanticRelayScopeMatches(pending.scope, channel)) return false;
    if (action === 'HOLD' || !pending.relayInput) {
      semanticRelayAttention = null;
      setSemanticRelayInput(null);
      setLocalDraft(channel, pending.content);
      const input = $('#messageInput');
      if (input) input.value = pending.content;
      renderComposerTruth();
      return true;
    }
    if (action === 'CORRECT') {
      semanticRelayAttention = null;
      setSemanticRelayInput(pending.relayInput, 'CORRECT', pending.scope);
      setLocalDraft(channel, pending.content);
      const input = $('#messageInput');
      if (input) input.value = pending.content;
      renderComposerTruth();
      return true;
    }
    semanticRelayAttention = null;
    const recipients = channel.memberKeys.filter((key) => key !== 'victor');
    const list = listForChannel(channel);
    const message = createMessage(channel.channelRef, 'victor', recipients, pending.content, list.length);
    list.push(message);
    appendMessageNode(message);
    if (state.unsentLocalDraft?.channelRef === channel.channelRef) state.unsentLocalDraft = null;
    const input = $('#messageInput');
    if (input) input.value = '';
    renderComposerTruth();
    return requestRealCompanionReply(channel, pending.content, pending.frameAtSend ?? navigation.semanticFrame(), {
      sourceMessage: message,
      semanticRelayInput: pending.relayInput,
      semanticRelayAction: 'CONFIRM'
    });
  }

  function renderSemanticRelayAttention() {
    const form = $('#composer');
    let panel = form?.querySelector('.semantic-relay-attention');
    if (!semanticRelayAttention || !semanticRelayScopeMatches(semanticRelayAttention.scope)) { panel?.remove(); return; }
    if (!panel) { panel = document.createElement('section'); panel.className = 'semantic-relay-attention'; form?.append(panel); }
    panel.replaceChildren();
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    const title = document.createElement('strong'); title.textContent = t('semantic-relay.attention');
    const detail = document.createElement('p'); detail.textContent = t('semantic-relay.attention.detail');
    panel.append(title, detail);
    const attention = semanticRelayAttention.publicAttention;
    const grid = document.createElement('div'); grid.className = 'semantic-relay-grid';
    addRelayRow(grid, 'semantic-relay.source-language', attention.sourceLanguageRef ?? '—');
    addRelayRow(grid, 'semantic-relay.requested-language', attention.requestedResponseLanguageRef ?? '—');
    addRelayRow(grid, 'semantic-relay.ui-recorded', attention.uiLocaleRef ?? '—');
    addRelayRow(grid, 'semantic-relay.reason', t(attention.reasonCode === 'ORIGINATOR_CONFIRMATION_REQUIRED' ? 'semantic-relay.reason.confirmation' : 'semantic-relay.reason.current'));
    addRelayRow(grid, 'semantic-relay.evidence', (attention.evidenceRefs ?? []).join(' · ') || '—');
    panel.append(grid);
    const actions = document.createElement('div'); actions.className = 'semantic-relay-actions';
    const decisionIdentity = Object.freeze({
      CONFIRM: Object.freeze({ elementRef:'element.semantic-relay.confirm', actionRef:'action.semantic-relay.confirm', permissionRef:'permission.conversation.send', labelRef:'semantic-relay.confirm' }),
      CORRECT: Object.freeze({ elementRef:'element.semantic-relay.correct', actionRef:'action.semantic-relay.correct', permissionRef:'permission.none', labelRef:'semantic-relay.correct' }),
      HOLD: Object.freeze({ elementRef:'element.semantic-relay.hold', actionRef:'action.semantic-relay.hold', permissionRef:'permission.none', labelRef:'semantic-relay.hold' })
    });
    for (const action of ['CONFIRM', 'CORRECT', 'HOLD']) {
      const identity = decisionIdentity[action];
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.relayAction = action;
      button.dataset.nodeRef = identity.elementRef;
      button.dataset.actionRef = identity.actionRef;
      button.dataset.permissionRef = identity.permissionRef;
      button.textContent = t(identity.labelRef);
      button.addEventListener('click', () => { void semanticRelayAttentionAction(action); });
      actions.append(button);
    }
    panel.append(actions);
  }

  const isNearBottom = (element) => element.scrollHeight - element.scrollTop - element.clientHeight < 80;

  function renderMessages(scrollBottom = false) {
    const feed = $('#messageFeed');
    feed.replaceChildren();
    for (const message of listForChannel(currentChannel()) || []) appendMessageNode(message, false);
    if (scrollBottom) feed.scrollTop = feed.scrollHeight;
    updateNewMessageButton();
  }

  function appendMessageNode(message, considerScroll = true) {
    const selectedKey = keyForChannel(currentChannel());
    const messageKey = conversationKey(message.projectRef, message.threadRef, message.channelRef);
    if (messageKey !== selectedKey) return false;
    const feed = $('#messageFeed');
    const wasNearBottom = isNearBottom(feed);
    const article = document.createElement('article');
    article.className = 'message';
    article.dataset.messageRef = message.messageRef;
    article.dataset.projectRef = message.projectRef;
    article.dataset.threadRef = message.threadRef;
    article.dataset.channelRef = message.channelRef;
    article.dataset.speaker = roles[message.speakerKey].actorRef;
    article.dataset.componentRef = 'component.vexlife.message-row';
    article.dataset.instanceRef = `instance.message-row.${message.messageRef}`;
    article.dataset.truthClass = message.truthClass || 'CURRENT_SYNTHETIC_REFERENCE';
    if (message.conversationHeadSha256) article.dataset.conversationHeadSha256 = message.conversationHeadSha256;
    if (message.modelNameOrBoundedTestProfileRef) article.dataset.modelRef = message.modelNameOrBoundedTestProfileRef;
    const speaker = roleLabel(message.speakerKey);
    const recipients = message.recipientKeys.map(roleLabel).join(', ');
    const thread = threadForMessage(message);
    article.innerHTML = `<div class="avatar" aria-hidden="true">${escapeHtml(roles[message.speakerKey].avatar)}</div><div><div class="message-header"><strong>${escapeHtml(speaker)} → ${escapeHtml(recipients)}</strong><span>${escapeHtml(thread ? t(thread.topicRef) : message.threadRef)}</span><span class="message-index">[${String(message.sequence).padStart(2, '0')}]</span></div><div class="message-body"></div></div>`;
    $('.message-body', article).textContent = message.contentRef ? t(message.contentRef, message.contentParams) : message.content;
    renderSemanticRelayDisclosure(article, message);
    if (message.modelTurnFormation) {
      void renderModelTurnFormationDisclosure(article, message.modelTurnFormation, { language: state.language }).catch(() => {});
    }
    feed.append(article);
    if (!considerScroll || wasNearBottom || message.speakerKey === 'victor') feed.scrollTop = feed.scrollHeight;
    else {
      state.unread.set(selectedKey, (state.unread.get(selectedKey) || 0) + 1);
      updateNewMessageButton();
    }
    return true;
  }

  function updateNewMessageButton() {
    const count = state.unread.get(keyForChannel(currentChannel())) || 0;
    $('#newMessagesCount').textContent = count;
    $('#newMessagesButton').hidden = count === 0;
  }

  function renderComposerTruth() {
    const channel = currentChannel();
    const draft = draftForChannel(channel);
    const form = $('#composer');
    const input = $('#messageInput');
    const sendButton = $('#composer button[type="submit"]');
    const channelHint = t('composer.channel-hint', {
      kind: t(channel.kind === 'GROUP' ? 'channel.kind.group' : 'channel.kind.direct'),
      count: channel.memberKeys.length
    });
    const available = channelIsAvailable(channel);
    const slashCandidate = input.value.trim().startsWith('/');
    const commandStatus = composerCommandStatusText();
    const availabilityRef = slashCandidate
      ? 'composer.command.ready'
      : available
        ? 'composer.availability.available'
        : draft
          ? 'composer.availability.unavailable-draft'
          : 'composer.availability.unavailable';
    $('#composerHint').textContent = `${commandStatus ?? t(availabilityRef)} · ${channelHint}`;
    form.dataset.availabilityState = available ? 'AVAILABLE' : 'UNAVAILABLE';
    form.dataset.commandState = composerCommandState.state;
    form.dataset.submitMode = slashCandidate ? 'COMMAND_CHECK' : 'MESSAGE_SEND';
    if (channel.roleKey === 'companion') {
      form.dataset.companionBindingState = companionAvailability?.bindingState ?? 'UNKNOWN';
      form.dataset.companionAvailabilityState = companionAvailabilityState();
      form.dataset.companionRecoveryAvailable = String(browserCompanionRecoveryAvailable(companionAvailability));
      form.dataset.companionTurnPending = String(companionTurnPending);
    } else {
      delete form.dataset.companionBindingState;
      delete form.dataset.companionAvailabilityState;
      delete form.dataset.companionRecoveryAvailable;
      delete form.dataset.companionTurnPending;
    }
    form.dataset.draftState = draft?.state ?? 'NONE';
    input.dataset.draftState = draft?.state ?? 'NONE';
    const submitAvailable = slashCandidate || (channel.roleKey === 'companion' ? !companionTurnPending : available);
    sendButton.disabled = !submitAvailable;
    sendButton.setAttribute('aria-disabled', String(!submitAvailable));
    renderSemanticRelayAttention();
  }

  function updateComposer() {
    const channel = currentChannel();
    const recipients = channel.memberKeys.filter((key) => key !== 'victor').map(roleLabel);
    $('#composerAddress').textContent = `${roleLabel('victor')} → ${recipients.join(', ')}`;
    const draft = draftForChannel(channel);
    const input = $('#messageInput');
    if (draft) {
      if (input.value !== draft.content) input.value = draft.content;
    } else if (state.unsentLocalDraft?.channelRef && state.unsentLocalDraft.channelRef !== channel.channelRef) {
      input.value = '';
    }
    $('#addGroupButton').hidden = !channelsForThread().some((candidate) => candidate.kind === 'GROUP');
    renderComposerTruth();
  }

  function renderContext() {
    const channel = currentChannel();
    $('#contextSummary').innerHTML = [
      [t('context.project'), t(currentProject().stringRef)],
      [t('context.thread'), t(currentThread().stringRef)],
      [t('context.channel'), t(channel.labelRef)],
      [t('context.visible-to'), channel.memberKeys.map(roleLabel).join(' · ')],
      [t('context.current-source'), state.selectedNodeRef]
    ].map(([label, value]) => `<div class="context-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  }

  function simulatedReply(channel, frameAtSend) {
    if (!isVexAvailable() || channel.roleKey === 'companion') return false;
    const list = listForChannel(channel);
    const speakerKey = channel.roleKey;
    const recipientKeys = channel.kind === 'GROUP' ? channel.memberKeys.filter((key) => key !== speakerKey) : ['victor'];
    const contentRef = speakerKey === 'guide' ? 'reply.guide' : speakerKey === 'root' ? 'reply.root' : 'reply.companion';
    const message = createMessage(channel.channelRef, speakerKey, recipientKeys, {
      contentRef,
      contentParams: {
        screenRef: frameAtSend.screenRef,
        projectRef: channel.projectRef,
        threadRef: channel.threadRef,
        channelRef: channel.channelRef,
        selectedNodeRef: frameAtSend.selectedNodeRef
      }
    }, list.length);
    list.push(message);
    if (!appendMessageNode(message)) {
      const messageKey = keyForChannel(channel);
      state.unread.set(messageKey, (state.unread.get(messageKey) || 0) + 1);
    }
    return true;
  }

  function scheduleSimulatedReply(channel, frameAtSend) {
    if (!isVexAvailable() || channel.roleKey === 'companion') return false;
    const timer = window.setTimeout(() => {
      pendingReplyTimers.delete(timer);
      simulatedReply(channel, frameAtSend);
    }, 180);
    pendingReplyTimers.add(timer);
    return true;
  }

  async function refreshCompanionAvailability() {
    if (currentChannel()?.roleKey !== 'companion') return companionAvailabilitySnapshot();
    companionAvailabilityReadState = 'LOADING';
    updateComposer();
    try {
      const response = await fetch(BROWSER_COMPANION_AVAILABILITY_PATH, { method: 'GET', cache: 'no-store' });
      if (!response.ok) throw new Error(`Companion availability HTTP ${response.status}`);
      companionAvailability = normalizeBrowserCompanionAvailability(await response.json());
      companionAvailabilityReadState = companionAvailability.availabilityState;
    } catch {
      companionAvailability = null;
      companionAvailabilityReadState = 'UNAVAILABLE';
    }
    updateComposer();
    return companionAvailabilitySnapshot();
  }

  function restoreCompanionDraft(channel, content, sourceMessage = null) {
    const list = listForChannel(channel);
    if (sourceMessage) {
      const index = list.findIndex((candidate) => candidate.messageRef === sourceMessage.messageRef);
      if (index >= 0) list.splice(index, 1);
    }
    setLocalDraft(channel, content);
    if (currentChannel()?.channelRef === channel.channelRef) {
      const input = $('#messageInput');
      if (input) input.value = content;
    }
    renderMessages();
  }

  async function requestRealCompanionReply(channel, content, frameAtSend, { sourceMessage = null, semanticRelayInput = null, semanticRelayAction = null } = {}) {
    if (channel.roleKey !== 'companion') return false;
    companionTurnPending = true;
    updateComposer();
    try {
      const response = await fetch('/api/v1/companion/turn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          projectRef: channel.projectRef,
          threadRef: channel.threadRef,
          channelRef: channel.channelRef,
          content,
          screenRef: frameAtSend.screenRef,
          selectedNodeRef: frameAtSend.selectedNodeRef,
          ...(semanticRelayInput ? { semanticRelayInput } : {}),
          ...(semanticRelayAction ? { semanticRelayAction } : {})
        })
      });
      const body = await response.json();
      if (response.ok && body?.state === 'CONFIRMATION_REQUIRED' && body?.truthClass === 'CURRENT_SEMANTIC_RELAY_ATTENTION') {
        const list = listForChannel(channel);
        if (sourceMessage) {
          const index = list.findIndex((candidate) => candidate.messageRef === sourceMessage.messageRef);
          if (index >= 0) list.splice(index, 1);
        }
        setLocalDraft(channel, content);
        const input = $('#messageInput');
        if (input) input.value = content;
        setSemanticRelayAttention(body, {
          content,
          relayInput: semanticRelayInput,
          frameAtSend,
          channel
        });
        renderMessages();
        updateComposer();
        return false;
      }
      if (!response.ok || body?.state !== 'TURN_COMPLETED' || body?.truthClass !== 'CURRENT_LOCAL_MODEL' || typeof body.content !== 'string' || !body.content) {
        restoreCompanionDraft(channel, content, sourceMessage);
        return false;
      }
      const list = listForChannel(channel);
      if (sourceMessage && body.requestSemanticRelay) { sourceMessage.semanticRelay = body.requestSemanticRelay; renderMessages(); }
      const message = createMessage(channel.channelRef, 'companion', ['victor'], body.content, list.length);
      message.truthClass = 'CURRENT_LOCAL_MODEL';
      if (body.responseSemanticRelay) message.semanticRelay = body.responseSemanticRelay;
      message.conversationHeadSha256 = body.conversationHeadSha256;
      message.modelNameOrBoundedTestProfileRef = body.modelNameOrBoundedTestProfileRef;
      message.modelTurnFormation = projectBrowserModelTurnFormation({
        modelTurnWitness: body.modelTurnWitness ?? null,
        capabilityRuntime: body.capabilityRuntime ?? null,
        promptContextMaterialization: body.promptContextMaterialization ?? null,
        modelConnectionProjection: body.modelConnectionProjection ?? null,
        selfCapabilityFrame: body.selfCapabilityFrame ?? null
      });
      list.push(message);
      if (!appendMessageNode(message)) {
        const messageKey = keyForChannel(channel);
        state.unread.set(messageKey, (state.unread.get(messageKey) || 0) + 1);
      }
      return true;
    } catch {
      restoreCompanionDraft(channel, content, sourceMessage);
      return false;
    } finally {
      companionTurnPending = false;
      await refreshCompanionAvailability();
    }
  }

  function setVexAvailability(nextState) {
    if (!['AVAILABLE', 'UNAVAILABLE'].includes(nextState)) {
      throw new Error(`Unsupported Vex availability: ${nextState}`);
    }
    if (state.vexAvailability === nextState) {
      updateComposer();
      return state.vexAvailability;
    }
    state.vexAvailability = nextState;
    if (!isVexAvailable()) cancelPendingReplies();
    updateComposer();
    return state.vexAvailability;
  }

  $('#messageInput').addEventListener('input', (event) => {
    const channel = currentChannel();
    const existing = draftForChannel(channel);
    const slashCandidate = event.target.value.trim().startsWith('/');
    resetComposerCommandState();
    if (slashCandidate) {
      if (existing) state.unsentLocalDraft = null;
    } else if (!channelIsAvailable(channel) || existing) {
      setLocalDraft(channel, event.target.value);
    }
    renderComposerTruth();
  });

  const announceShortcutButton = $('#announceShortcutButton');
  if (announceShortcutButton) {
    announceShortcutButton.addEventListener('click', () => {
      const input = $('#messageInput');
      input.value = '/announce';
      input.dispatchEvent(new Event('input', { bubbles:true }));
      input.focus();
    });
  }

  $('#composer').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = $('#messageInput');
    const content = input.value.trim();
    if (!content) return;
    const commandRoute = projectComposerCommand(content);
    if (commandRoute.handled) {
      const channel = currentChannel();
      setLocalDraft(channel, '');
      composerCommandState = commandRoute.state;
      renderComposerTruth();
      return;
    }
    resetComposerCommandState();
    const channel = currentChannel();
    if (channel.roleKey === 'companion' && !channelIsAvailable(channel) && !companionTurnPending) {
      await refreshCompanionAvailability();
    }
    if (!channelIsAvailable(channel)) {
      setLocalDraft(channel, input.value);
      renderComposerTruth();
      return;
    }
    const recipients = channel.memberKeys.filter((key) => key !== 'victor');
    const list = listForChannel(channel);
    const message = createMessage(channel.channelRef, 'victor', recipients, content, list.length);
    list.push(message);
    appendMessageNode(message);
    input.value = '';
    if (state.unsentLocalDraft?.channelRef === channel.channelRef) state.unsentLocalDraft = null;
    renderComposerTruth();
    const frameAtSend = navigation.semanticFrame();
    const consumePendingSemanticRelay = pendingSemanticRelayInput !== null && semanticRelayScopeMatches(pendingSemanticRelayScope, channel);
    const semanticRelayInput = consumePendingSemanticRelay ? pendingSemanticRelayInput : null;
    const semanticRelayAction = consumePendingSemanticRelay ? pendingSemanticRelayAction : null;
    if (consumePendingSemanticRelay) {
      pendingSemanticRelayInput = null;
      pendingSemanticRelayAction = null;
      pendingSemanticRelayScope = null;
    }
    if (channel.roleKey === 'companion') await requestRealCompanionReply(channel, content, frameAtSend, { sourceMessage: message, semanticRelayInput, semanticRelayAction });
    else scheduleSimulatedReply(channel, frameAtSend);
  });
  $('#newMessagesButton').addEventListener('click', () => {
    const feed = $('#messageFeed');
    feed.scrollTop = feed.scrollHeight;
    state.unread.set(keyForChannel(currentChannel()), 0);
    updateNewMessageButton();
  });
  $('#messageFeed').addEventListener('scroll', () => {
    if (isNearBottom($('#messageFeed'))) {
      state.unread.set(keyForChannel(currentChannel()), 0);
      updateNewMessageButton();
    }
  });
  $('#addGroupButton').addEventListener('click', () => {
    const group = channelsForThread().find((channel) => channel.kind === 'GROUP');
    if (group) selectChannel(group, 'element.channel.group');
  });

  return {
    currentProject,
    currentThread,
    currentChannel,
    channelsForThread,
    roleLabel,
    renderProjectRail,
    selectProject,
    selectThread,
    renderChannels,
    selectChannel,
    renderPresence,
    renderMessages,
    updateComposer,
    renderContext,
    setVexAvailability,
    refreshCompanionAvailability,
    setSemanticRelayInput,
    setSemanticRelayAttention,
    semanticRelayAttention: () => semanticRelayAttention?.publicAttention && semanticRelayScopeMatches(semanticRelayAttention.scope)
      ? structuredClone(semanticRelayAttention.publicAttention)
      : null,
    companionBindingState: () => companionAvailability?.bindingState ?? 'UNKNOWN',
    companionAvailabilityState,
    companionAvailability: companionAvailabilitySnapshot,
    companionRecoveryAvailable: () => browserCompanionRecoveryAvailable(companionAvailability),
    composerCommandState: () => structuredClone(composerCommandState),
    pendingReplyCount: () => pendingReplyTimers.size
  };
}

// [VXG RealForever]
