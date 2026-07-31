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
    const speaker = roleLabel(message.speakerKey);
    const recipients = message.recipientKeys.map(roleLabel).join(', ');
    const thread = threadForMessage(message);
    article.innerHTML = `<div class="avatar" aria-hidden="true">${escapeHtml(roles[message.speakerKey].avatar)}</div><div><div class="message-header"><strong>${escapeHtml(speaker)} → ${escapeHtml(recipients)}</strong><span>${escapeHtml(thread ? t(thread.topicRef) : message.threadRef)}</span><span class="message-index">[${String(message.sequence).padStart(2, '0')}]</span></div><div class="message-body"></div></div>`;
    $('.message-body', article).textContent = message.contentRef ? t(message.contentRef, message.contentParams) : message.content;
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

  function updateComposer() {
    const channel = currentChannel();
    const recipients = channel.memberKeys.filter((key) => key !== 'victor').map(roleLabel);
    $('#composerAddress').textContent = `${roleLabel('victor')} → ${recipients.join(', ')}`;
    $('#composerHint').textContent = t('composer.channel-hint', {
      kind: t(channel.kind === 'GROUP' ? 'channel.kind.group' : 'channel.kind.direct'),
      count: channel.memberKeys.length
    });
    $('#addGroupButton').hidden = !channelsForThread().some((candidate) => candidate.kind === 'GROUP');
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
  }

  $('#composer').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#messageInput');
    const content = input.value.trim();
    if (!content) return;
    const channel = currentChannel();
    const recipients = channel.memberKeys.filter((key) => key !== 'victor');
    const list = listForChannel(channel);
    const message = createMessage(channel.channelRef, 'victor', recipients, content, list.length);
    list.push(message);
    appendMessageNode(message);
    input.value = '';
    const frameAtSend = navigation.semanticFrame();
    window.setTimeout(() => simulatedReply(channel, frameAtSend), 180);
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
    renderContext
  };
}

// [VXG RealForever]
