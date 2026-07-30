import { $, escapeHtml } from './dom.js';

const PROJECT_NODE = {
  'project.self-development': 'element.project.self-development', 'project.vexlife.root-hub': 'element.project.root-hub',
  'project.vex-home-product': 'element.project.vex-home-product', 'project.local-vex': 'element.project.local-vex'
};
const THREAD_NODE = {
  'thread.self-development.open-conversation': 'element.thread.open-conversation', 'thread.vex-home.guided-fresh': 'element.thread.guided-fresh',
  'thread.vex-home.product-workshop': 'element.thread.product-workshop', 'thread.local-vex.foundation': 'element.thread.foundation',
  'thread.root-hub.welcome': 'element.thread.root-welcome'
};

export function createChatController({ state, projects, roles, channels, messages, createMessage, t, navigation }) {
  const currentProject = () => projects.find((project) => project.projectRef === state.projectRef) || projects[0];
  const currentThread = () => currentProject().threads.find((thread) => thread.threadRef === state.threadRef) || currentProject().threads[0];
  const currentChannel = () => channels.find((channel) => channel.channelRef === state.channelRef) || channels[0];
  const roleLabel = (key) => roles[key].labelRef ? t(roles[key].labelRef) : roles[key].label;

  function renderProjectRail() {
    const host = $('#projectList'); host.replaceChildren();
    for (const project of projects) {
      const block = document.createElement('section'); block.className = 'project-block'; block.dataset.projectRef = project.projectRef;
      block.classList.toggle('is-selected', project.projectRef === state.projectRef);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'project-button';
      button.dataset.nodeRef = PROJECT_NODE[project.projectRef] || `element.${project.projectRef}`;
      button.dataset.selectionGroup = 'selection.project'; button.dataset.componentRef = 'component.vexlife.project-entry';
      button.dataset.instanceRef = `instance.project-entry.${project.projectRef}`;
      button.innerHTML = `<span aria-hidden="true">⌄</span><span><strong>${escapeHtml(project.stringRef ? t(project.stringRef) : project.title)}</strong><small>${escapeHtml(project.description)}</small></span><span class="dot" aria-label="Healthy"></span>`;
      button.addEventListener('click', () => selectProject(project, button.dataset.nodeRef)); block.append(button);
      const list = document.createElement('div'); list.className = 'thread-list';
      for (const thread of project.threads.slice(0, 10)) {
        const threadButton = document.createElement('button'); threadButton.type = 'button'; threadButton.className = 'thread-button';
        threadButton.dataset.nodeRef = THREAD_NODE[thread.threadRef] || `element.${thread.threadRef}`;
        threadButton.dataset.selectionGroup = 'selection.thread'; threadButton.dataset.componentRef = 'component.vexlife.thread-entry';
        threadButton.dataset.instanceRef = `instance.thread-entry.${thread.threadRef}`;
        threadButton.classList.toggle('is-selected', thread.threadRef === state.threadRef);
        threadButton.innerHTML = `<span class="dot" style="background:#73899a" aria-hidden="true"></span><span><strong>${escapeHtml(thread.stringRef ? t(thread.stringRef) : thread.title)}</strong><small>${escapeHtml(thread.topic)} · current</small></span><span class="count">${thread.count}</span>`;
        threadButton.addEventListener('click', () => selectThread(project, thread, threadButton.dataset.nodeRef)); list.append(threadButton);
      }
      block.append(list); host.append(block);
    }
    navigation.setSelection('selection.project', PROJECT_NODE[state.projectRef] || `element.${state.projectRef}`);
    navigation.setSelection('selection.thread', THREAD_NODE[state.threadRef] || `element.${state.threadRef}`);
  }
  function selectProject(project, nodeRef) {
    const thread = project.threads[0];
    navigation.navigate(nodeRef, { projectRef: project.projectRef, threadRef: thread.threadRef }, 'action.project.select');
    selectThread(project, thread, THREAD_NODE[thread.threadRef] || `element.${thread.threadRef}`, false); renderProjectRail();
  }
  function selectThread(project, thread, nodeRef, refreshRail = true) {
    navigation.navigate(nodeRef, { projectRef: project.projectRef, threadRef: thread.threadRef }, 'action.thread.select');
    $('#threadTitle').textContent = thread.stringRef ? t(thread.stringRef) : thread.title;
    $('#threadDescription').textContent = `${project.description} ${thread.topic}.`;
    if (project.projectRef !== 'project.self-development') state.channelRef = channels[2].channelRef;
    renderChannels(); renderPresence(); renderMessages(true); updateComposer(); renderContext(); if (refreshRail) renderProjectRail();
  }
  function renderChannels() {
    const host = $('#channelTabs'); host.replaceChildren();
    for (const channel of channels) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'channel-tab'; button.role = 'tab';
      button.dataset.nodeRef = channel.roleKey === 'companion' ? 'element.channel.companion' : channel.roleKey === 'guide' && channel.kind === 'DIRECT' ? 'element.channel.guide' : channel.roleKey === 'root' ? 'element.channel.root-hub' : 'element.channel.group';
      button.dataset.selectionGroup = 'selection.channel'; button.dataset.selectionValue = channel.channelRef;
      button.dataset.componentRef = 'component.vexlife.channel-tab'; button.dataset.instanceRef = `instance.channel-tab.${channel.channelRef}`;
      button.textContent = t(channel.labelRef); button.classList.toggle('is-selected', channel.channelRef === state.channelRef);
      button.setAttribute('aria-selected', String(channel.channelRef === state.channelRef));
      button.addEventListener('click', () => selectChannel(channel, button.dataset.nodeRef)); host.append(button);
    }
  }
  function selectChannel(channel, nodeRef) {
    navigation.navigate(nodeRef, { channelRef: channel.channelRef }, 'action.channel.select'); state.unread.set(channel.channelRef, 0);
    renderChannels(); renderPresence(); renderMessages(true); updateComposer(); renderContext();
  }
  function renderPresence() {
    const host = $('#presence'); host.replaceChildren();
    for (const key of currentChannel().memberKeys) { const span = document.createElement('span'); span.textContent = roleLabel(key); host.append(span); }
  }
  const isNearBottom = (element) => element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  function renderMessages(scrollBottom = false) {
    const feed = $('#messageFeed'); feed.replaceChildren();
    for (const message of messages.get(state.channelRef) || []) appendMessageNode(message, false);
    if (scrollBottom) feed.scrollTop = feed.scrollHeight; updateNewMessageButton();
  }
  function appendMessageNode(message, considerScroll = true) {
    const feed = $('#messageFeed'); const wasNearBottom = isNearBottom(feed);
    const article = document.createElement('article'); article.className = 'message'; article.dataset.messageRef = message.messageRef;
    article.dataset.speaker = roles[message.speakerKey].actorRef; article.dataset.componentRef = 'component.vexlife.message-row';
    article.dataset.instanceRef = `instance.message-row.${message.messageRef}`;
    const speaker = roleLabel(message.speakerKey); const recipients = message.recipientKeys.map(roleLabel).join(', ');
    article.innerHTML = `<div class="avatar" aria-hidden="true">${escapeHtml(roles[message.speakerKey].avatar)}</div><div><div class="message-header"><strong>${escapeHtml(speaker)} → ${escapeHtml(recipients)}</strong><span>${escapeHtml(currentThread().topic)}</span><span class="message-index">[${String(message.sequence).padStart(2, '0')}]</span></div><div class="message-body"></div></div>`;
    $('.message-body', article).textContent = message.content; feed.append(article);
    if (!considerScroll || wasNearBottom || message.speakerKey === 'victor') feed.scrollTop = feed.scrollHeight;
    else { state.unread.set(state.channelRef, (state.unread.get(state.channelRef) || 0) + 1); updateNewMessageButton(); }
  }
  function updateNewMessageButton() {
    const count = state.unread.get(state.channelRef) || 0; $('#newMessagesCount').textContent = count; $('#newMessagesButton').hidden = count === 0;
  }
  function updateComposer() {
    const channel = currentChannel(); const recipients = channel.memberKeys.filter((key) => key !== 'victor').map(roleLabel);
    $('#composerAddress').textContent = `${roleLabel('victor')} → ${recipients.join(', ')}`;
    $('#composerHint').textContent = `${channel.kind} channel · ${channel.memberKeys.length} present · raw context isolated to members`;
  }
  function renderContext() {
    const channel = currentChannel();
    $('#contextSummary').innerHTML = [
      ['Project', currentProject().stringRef ? t(currentProject().stringRef) : currentProject().title],
      ['Thread', currentThread().stringRef ? t(currentThread().stringRef) : currentThread().title],
      ['Channel', t(channel.labelRef)], ['Visible to', channel.memberKeys.map(roleLabel).join(' · ')], ['Current source', state.selectedNodeRef]
    ].map(([label, value]) => `<div class="context-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  }
  function simulatedReply(channel) {
    const list = messages.get(channel.channelRef); const speakerKey = channel.roleKey;
    const recipientKeys = channel.kind === 'GROUP' ? channel.memberKeys.filter((key) => key !== speakerKey) : ['victor'];
    const frame = navigation.semanticFrame();
    const response = speakerKey === 'guide'
      ? `I can perceive the current semantic screen frame: ${frame.screenRef}, project ${frame.projectRef}, thread ${frame.threadRef}, channel ${frame.channelRef}, selected ${frame.selectedNodeRef}. I received this from the Navigation Lattice—not from raw pointer logging.`
      : speakerKey === 'root'
        ? 'I can consolidate linked current projections, route a bounded question through role responsibility, and return attributed answers. I do not keep every lower-level relay permanently active.'
        : 'I received this in our direct Companion channel. Sibling Guide and Root Hub conversations are visible only as channel existence unless you explicitly add me to a group or relay a bounded source.';
    const message = createMessage(channel.channelRef, speakerKey, recipientKeys, response, list.length); list.push(message); appendMessageNode(message);
  }
  $('#composer').addEventListener('submit', (event) => {
    event.preventDefault(); const input = $('#messageInput'); const content = input.value.trim(); if (!content) return;
    const channel = currentChannel(); const recipients = channel.memberKeys.filter((key) => key !== 'victor'); const list = messages.get(channel.channelRef);
    const message = createMessage(channel.channelRef, 'victor', recipients, content, list.length); list.push(message); appendMessageNode(message); input.value = '';
    window.setTimeout(() => simulatedReply(channel), 180);
  });
  $('#newMessagesButton').addEventListener('click', () => { const feed = $('#messageFeed'); feed.scrollTop = feed.scrollHeight; state.unread.set(state.channelRef, 0); updateNewMessageButton(); });
  $('#messageFeed').addEventListener('scroll', () => { if (isNearBottom($('#messageFeed'))) { state.unread.set(state.channelRef, 0); updateNewMessageButton(); } });
  $('#addGroupButton').addEventListener('click', () => selectChannel(channels[3], 'element.channel.group'));
  return { currentProject, currentThread, currentChannel, roleLabel, renderProjectRail, selectProject, selectThread, renderChannels, selectChannel, renderPresence, renderMessages, updateComposer, renderContext };
}

// [VXG RealForever]
