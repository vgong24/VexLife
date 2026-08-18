import { $, escapeHtml } from './dom.js';

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

export function createChatController({ state, projects, roles, channels, messages, createMessage, conversationKey, t, navigation }) {
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
  let companionBindingState = 'UNKNOWN';
  let pendingSemanticRelayInput = null;
  let pendingSemanticRelayAction = null;
  let semanticRelayAttention = null;
  const isVexAvailable = () => state.vexAvailability === 'AVAILABLE';
  const channelIsAvailable = (channel = currentChannel()) =>
    channel.roleKey === 'companion' ? companionBindingState === 'BOUND' : isVexAvailable();
  const draftForChannel = (channel = currentChannel()) =>
    state.unsentLocalDraft?.channelRef === channel.channelRef ? state.unsentLocalDraft : null;

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
    if (channel.roleKey === 'companion') void refreshCompanionAvailability();
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
    if (channel.roleKey === 'companion') void refreshCompanionAvailability();
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

  function setSemanticRelayInput(value, action = null) {
    if (action !== null && action !== 'CORRECT') throw new Error('only a corrected relay may be pre-staged for the next send');
    pendingSemanticRelayInput = value ? structuredClone(value) : null;
    pendingSemanticRelayAction = value ? action : null;
    return pendingSemanticRelayInput ? structuredClone(pendingSemanticRelayInput) : null;
  }

  function setSemanticRelayAttention(value, options = {}) {
    semanticRelayAttention = value ? {
      publicAttention: structuredClone(value),
      content: String(options.content ?? ''),
      relayInput: options.relayInput ? structuredClone(options.relayInput) : null,
      frameAtSend: options.frameAtSend ? structuredClone(options.frameAtSend) : null
    } : null;
    renderSemanticRelayAttention();
    return semanticRelayAttention?.publicAttention ? structuredClone(semanticRelayAttention.publicAttention) : null;
  }

  async function semanticRelayAttentionAction(action) {
    const pending = semanticRelayAttention;
    if (!pending || !['CONFIRM', 'CORRECT', 'HOLD'].includes(action)) return false;
    const channel = currentChannel();
    if (action !== 'CONFIRM' || !pending.relayInput) {
      semanticRelayAttention = null;
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
    if (!semanticRelayAttention) { panel?.remove(); return; }
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
    const availabilityRef = available
      ? 'composer.availability.available'
      : draft
        ? 'composer.availability.unavailable-draft'
        : 'composer.availability.unavailable';
    $('#composerHint').textContent = `${t(availabilityRef)} · ${channelHint}`;
    form.dataset.availabilityState = available ? 'AVAILABLE' : 'UNAVAILABLE';
    if (channel.roleKey === 'companion') form.dataset.companionBindingState = companionBindingState;
    else delete form.dataset.companionBindingState;
    form.dataset.draftState = draft?.state ?? 'NONE';
    input.dataset.draftState = draft?.state ?? 'NONE';
    sendButton.disabled = !available;
    sendButton.setAttribute('aria-disabled', String(!available));
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
    if (currentChannel()?.roleKey !== 'companion') return companionBindingState;
    try {
      const response = await fetch('/api/v1/companion/status', { method: 'GET', cache: 'no-store' });
      const body = await response.json();
      companionBindingState = response.ok && body?.state === 'BOUND' ? 'BOUND' : 'UNAVAILABLE';
    } catch {
      companionBindingState = 'UNAVAILABLE';
    }
    updateComposer();
    return companionBindingState;
  }

  async function requestRealCompanionReply(channel, content, frameAtSend, { sourceMessage = null, semanticRelayInput = null, semanticRelayAction = null } = {}) {
    if (channel.roleKey !== 'companion') return false;
    companionBindingState = 'BUSY';
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
        companionBindingState = 'BOUND';
        setLocalDraft(channel, content);
        const input = $('#messageInput');
        if (input) input.value = content;
        semanticRelayAttention = {
          publicAttention: structuredClone(body),
          content,
          relayInput: semanticRelayInput ? structuredClone(semanticRelayInput) : null,
          frameAtSend: structuredClone(frameAtSend)
        };
        renderMessages();
        updateComposer();
        return false;
      }
      if (!response.ok || body?.state !== 'TURN_COMPLETED' || body?.truthClass !== 'CURRENT_LOCAL_MODEL' || typeof body.content !== 'string' || !body.content) {
        companionBindingState = 'UNAVAILABLE';
        updateComposer();
        return false;
      }
      const list = listForChannel(channel);
      if (sourceMessage && body.requestSemanticRelay) { sourceMessage.semanticRelay = body.requestSemanticRelay; renderMessages(); }
      const message = createMessage(channel.channelRef, 'companion', ['victor'], body.content, list.length);
      message.truthClass = 'CURRENT_LOCAL_MODEL';
      if (body.responseSemanticRelay) message.semanticRelay = body.responseSemanticRelay;
      message.conversationHeadSha256 = body.conversationHeadSha256;
      message.modelNameOrBoundedTestProfileRef = body.modelNameOrBoundedTestProfileRef;
      list.push(message);
      if (!appendMessageNode(message)) {
        const messageKey = keyForChannel(channel);
        state.unread.set(messageKey, (state.unread.get(messageKey) || 0) + 1);
      }
      companionBindingState = 'BOUND';
      updateComposer();
      return true;
    } catch {
      companionBindingState = 'UNAVAILABLE';
      updateComposer();
      return false;
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
    if (!channelIsAvailable(channel) || existing) setLocalDraft(channel, event.target.value);
    renderComposerTruth();
  });

  $('#composer').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = $('#messageInput');
    const content = input.value.trim();
    if (!content) return;
    const channel = currentChannel();
    if (channel.roleKey === 'companion' && companionBindingState === 'UNKNOWN') await refreshCompanionAvailability();
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
    const semanticRelayInput = pendingSemanticRelayInput;
    const semanticRelayAction = pendingSemanticRelayAction;
    pendingSemanticRelayInput = null;
    pendingSemanticRelayAction = null;
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

  if (currentChannel()?.roleKey === 'companion') void refreshCompanionAvailability();

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
    semanticRelayAttention: () => semanticRelayAttention?.publicAttention ? structuredClone(semanticRelayAttention.publicAttention) : null,
    companionBindingState: () => companionBindingState,
    pendingReplyCount: () => pendingReplyTimers.size
  };
}

// [VXG RealForever]
