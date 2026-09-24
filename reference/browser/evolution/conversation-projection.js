export const CONVERSATION_EVOLUTION_SURFACE_REF = 'surface.vexlife.conversation';
export const CONVERSATION_EVOLUTION_PROJECTION_REF = 'projection.conversation.evolution-shadow';

const REQUIRED_CHAT_METHODS = Object.freeze([
  'currentProject',
  'currentThread',
  'currentChannel',
  'channelsForThread',
  'roleLabel',
  'selectChannel',
  'companionAvailabilityState',
  'companionAvailability',
  'companionRecoveryAvailable'
]);

function assertBinding(binding) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    throw new TypeError('Conversation Evolution requires one canonical browser binding');
  }
  const { state, chat, roles, messages, conversationKey, t } = binding;
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new TypeError('canonical state is required');
  if (!chat || typeof chat !== 'object' || Array.isArray(chat)) throw new TypeError('canonical chat controller is required');
  for (const method of REQUIRED_CHAT_METHODS) {
    if (typeof chat[method] !== 'function') throw new TypeError(`chat.${method} must be a function`);
  }
  if (!roles || typeof roles !== 'object' || Array.isArray(roles)) throw new TypeError('canonical roles are required');
  if (!(messages instanceof Map)) throw new TypeError('canonical message Map is required');
  if (typeof conversationKey !== 'function' || typeof t !== 'function') throw new TypeError('canonical conversationKey/t are required');
  return binding;
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function canonicalFamilySecurityStatus(binding, channel) {
  if (channel.kind !== 'GROUP' || channel.familyRoomProjection !== true) return null;
  const familyRoom = binding.familyRoom ?? globalThis.__VEXLIFE_APP__?.familyRoom ?? null;
  if (!familyRoom || typeof familyRoom.snapshot !== 'function') return null;
  const snapshot = familyRoom.snapshot();
  return snapshot?.securityStatus ? clone(snapshot.securityStatus) : null;
}

function participant(binding, keyOrRef) {
  if (binding.roles[keyOrRef]) {
    return Object.freeze({
      key: keyOrRef,
      actorRef: binding.roles[keyOrRef].actorRef ?? keyOrRef,
      label: binding.chat.roleLabel(keyOrRef)
    });
  }
  const match = Object.entries(binding.roles).find(([, role]) => role?.actorRef === keyOrRef);
  if (match) {
    return Object.freeze({ key: match[0], actorRef: match[1].actorRef, label: binding.chat.roleLabel(match[0]) });
  }
  return Object.freeze({ key: null, actorRef: keyOrRef ?? null, label: keyOrRef ?? '—' });
}

function projectMessage(binding, channel, message) {
  const recipients = (message.recipientKeys ?? message.recipientRefs ?? []).map((value) => participant(binding, value));
  const witnesses = (message.witnessRefs?.length ? message.witnessRefs : channel.memberKeys ?? []).map((value) => participant(binding, value));
  const content = message.contentRef ? binding.t(message.contentRef, message.contentParams ?? {}) : (message.content ?? '');
  return Object.freeze({
    messageRef: message.messageRef ?? null,
    sequence: Number.isInteger(message.sequence) ? message.sequence : null,
    speaker: participant(binding, message.speakerKey ?? message.speakerRef),
    recipients,
    witnesses,
    content,
    truthClass: message.truthClass ?? 'CURRENT_SYNTHETIC_REFERENCE',
    semanticRelay: clone(message.semanticRelay ?? null),
    conversationHeadSha256: message.conversationHeadSha256 ?? null,
    modelNameOrBoundedTestProfileRef: message.modelNameOrBoundedTestProfileRef ?? null
  });
}

export function projectConversationEvolutionState(input) {
  const binding = assertBinding(input);
  const { state, chat } = binding;
  const project = chat.currentProject();
  const thread = chat.currentThread();
  const channel = chat.currentChannel();
  if (!project || !thread || !channel) throw new Error('canonical chat frame is incomplete');
  if (channel.projectRef !== state.projectRef || channel.threadRef !== state.threadRef || channel.channelRef !== state.channelRef) {
    throw new Error('canonical chat frame disagrees with shared browser state');
  }
  const channels = chat.channelsForThread();
  if (!Array.isArray(channels) || !channels.some((candidate) => candidate.channelRef === channel.channelRef)) {
    throw new Error('canonical current channel is absent from its thread channel set');
  }
  const key = binding.conversationKey(channel.projectRef, channel.threadRef, channel.channelRef);
  const list = binding.messages.get(key);
  if (!Array.isArray(list)) throw new Error(`canonical message Map is missing ${key}`);

  const companion = channel.roleKey === 'companion';
  const availability = companion ? chat.companionAvailability() : null;
  const availabilityState = companion ? chat.companionAvailabilityState() : (state.vexAvailability === 'AVAILABLE' ? 'AVAILABLE' : 'UNAVAILABLE');
  const draft = state.unsentLocalDraft?.channelRef === channel.channelRef ? clone(state.unsentLocalDraft) : null;
  const familySecurityStatus = canonicalFamilySecurityStatus(binding, channel);
  return Object.freeze({
    schemaVersion: 'vexlife.ux-evolution.conversation-projection/v1',
    surfaceRef: CONVERSATION_EVOLUTION_SURFACE_REF,
    projectionRef: CONVERSATION_EVOLUTION_PROJECTION_REF,
    semanticOwnerRef: 'module.vexlife.core.conversation',
    interactionOwnerRef: 'module.vexlife.browser.chat-controller',
    oneSemanticState: true,
    projectRef: state.projectRef,
    threadRef: state.threadRef,
    channelRef: state.channelRef,
    selectedNodeRef: state.selectedNodeRef ?? null,
    projectLabel: binding.t(project.stringRef),
    threadLabel: binding.t(thread.stringRef),
    channelLabel: binding.t(channel.labelRef),
    channelKind: channel.kind,
    channelRoleKey: channel.roleKey,
    audience: (channel.memberKeys ?? []).map((value) => participant(binding, value)),
    channels: channels.map((candidate) => Object.freeze({
      channelRef: candidate.channelRef,
      kind: candidate.kind,
      roleKey: candidate.roleKey,
      label: binding.t(candidate.labelRef),
      selected: candidate.channelRef === channel.channelRef,
      memberCount: candidate.memberKeys?.length ?? 0
    })),
    availability: Object.freeze({
      state: availabilityState,
      readyForRealTurn: companion ? availabilityState === 'READY' : state.vexAvailability === 'AVAILABLE',
      recoveryAvailable: companion ? chat.companionRecoveryAvailable() === true : false,
      bindingState: availability?.bindingState ?? null,
      recoveryClass: availability?.recoveryClass ?? null,
      modelRefOrNull: availability?.modelRefOrNull ?? null,
      generationRefOrNull: availability?.generationRefOrNull ?? null,
      runtimeAdapterRef: availability?.runtimeAdapterRef ?? null
    }),
    draft,
    familySecurityStatus,
    messages: list.map((message) => projectMessage(binding, channel, message))
  });
}

function el(document, tag, className = null, text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = String(text);
  return node;
}

function canonicalComposer(document) {
  const form = document.querySelector('#composer');
  const input = document.querySelector('#messageInput');
  const submit = form?.querySelector('button[type="submit"]') ?? null;
  const hint = document.querySelector('#composerHint');
  if (!form || !input || !submit) throw new Error('Conversation Evolution requires the canonical browser composer seam');
  return { form, input, submit, hint };
}

function canonicalChannelNodeRef(document, channelRef) {
  for (const node of document.querySelectorAll('#channelTabs [data-channel-ref]')) {
    if (node.dataset.channelRef === channelRef && node.dataset.nodeRef) return node.dataset.nodeRef;
  }
  throw new Error(`canonical browser channel control is missing ${channelRef}`);
}

function appendFact(document, host, label, value) {
  const row = el(document, 'div', 'conversation-evolution__fact');
  row.append(el(document, 'span', null, label), el(document, 'strong', null, value ?? '—'));
  host.append(row);
}

function renderMessage(document, message) {
  const article = el(document, 'article', 'conversation-evolution__message');
  if (message.messageRef) article.dataset.messageRef = message.messageRef;
  article.dataset.truthClass = message.truthClass;
  const heading = el(document, 'div', 'conversation-evolution__message-heading');
  heading.append(
    el(document, 'strong', null, `${message.speaker.label} → ${message.recipients.map((item) => item.label).join(', ') || '—'}`),
    el(document, 'span', null, message.sequence === null ? '' : `[${String(message.sequence).padStart(2, '0')}]`)
  );
  article.append(heading, el(document, 'p', 'conversation-evolution__message-body', message.content));
  if (message.semanticRelay) {
    const details = el(document, 'details', 'conversation-evolution__relay');
    details.append(el(document, 'summary', null, 'Semantic relay'));
    details.append(el(document, 'code', null, message.semanticRelay.relayRef ?? 'source-bound relay'));
    article.append(details);
  }
  return article;
}

function composerTruth(snapshot, canonical, value) {
  const slash = value.trim().startsWith('/');
  const hint = canonical.hint?.textContent || (
    slash ? 'Command input · canonical browser checks before any message is sent.'
      : snapshot.availability.readyForRealTurn ? 'Ready for a real turn · sending still requires your explicit action.'
        : snapshot.draft ? 'Unavailable · this text remains an unsent local draft.'
          : snapshot.availability.recoveryAvailable ? 'Recoverable · recovery is available, but this is not READY.'
            : 'Unavailable · nothing will be sent.'
  );
  return Object.freeze({ hint, submitAvailable: !canonical.submit.disabled });
}

export function createConversationEvolutionAdapter(input) {
  const binding = assertBinding(input);
  let observer = null;

  async function mount({ body, surfaceRef, semanticRef, projection }) {
    if (surfaceRef !== CONVERSATION_EVOLUTION_SURFACE_REF) throw new Error(`unexpected Conversation surface ${surfaceRef}`);
    if (semanticRef !== 'feature.vexlife.addressed-conversation') throw new Error(`unexpected Conversation semantic owner ${semanticRef}`);
    if (projection !== 'EVOLUTION_PROJECTION') throw new Error(`unexpected Conversation projection ${projection}`);
    if (!body?.ownerDocument || typeof body.replaceChildren !== 'function') throw new TypeError('Conversation Evolution mount requires the accepted shell body');

    const document = body.ownerDocument;
    const canonical = canonicalComposer(document);

    const render = () => {
      const snapshot = projectConversationEvolutionState(binding);
      const root = el(document, 'section', 'conversation-evolution');
      root.dataset.surfaceRef = snapshot.surfaceRef;
      root.dataset.semanticOwnerRef = snapshot.semanticOwnerRef;
      root.dataset.interactionOwnerRef = snapshot.interactionOwnerRef;
      root.dataset.oneSemanticState = 'true';

      const hero = el(document, 'header', 'conversation-evolution__hero');
      const title = el(document, 'div');
      title.append(
        el(document, 'span', 'conversation-evolution__eyebrow', binding.t('conversation.eyebrow')),
        el(document, 'h2', null, snapshot.channelLabel),
        el(document, 'p', null, binding.t('conversation.description'))
      );
      const availability = el(document, 'div', 'conversation-evolution__availability');
      availability.dataset.availabilityState = snapshot.availability.state;
      availability.dataset.readyForRealTurn = String(snapshot.availability.readyForRealTurn);
      availability.dataset.recoveryAvailable = String(snapshot.availability.recoveryAvailable);
      availability.append(
        el(document, 'strong', null, snapshot.availability.state),
        el(document, 'span', null, snapshot.availability.readyForRealTurn ? 'Real Companion turn available' : snapshot.availability.recoveryAvailable ? 'Recovery available · not READY' : 'No real Companion turn available')
      );
      hero.append(title, availability);
      root.append(hero);

      const address = el(document, 'div', 'conversation-evolution__address');
      address.append(
        el(document, 'strong', null, snapshot.audience.map((item) => item.label).join(' · ')),
        el(document, 'span', null, `${snapshot.channelKind} · ${snapshot.audience.length} present`)
      );
      root.append(address);

      const channels = el(document, 'nav', 'conversation-evolution__channels');
      channels.setAttribute('aria-label', 'Conversation channels');
      for (const candidate of snapshot.channels) {
        const button = el(document, 'button', 'conversation-evolution__channel', candidate.label);
        button.type = 'button';
        button.dataset.channelRef = candidate.channelRef;
        button.setAttribute('aria-current', candidate.selected ? 'true' : 'false');
        button.addEventListener('click', () => {
          const source = binding.chat.channelsForThread().find((item) => item.channelRef === candidate.channelRef);
          if (!source) throw new Error(`canonical channel disappeared: ${candidate.channelRef}`);
          binding.chat.selectChannel(source, canonicalChannelNodeRef(document, candidate.channelRef));
          render();
        });
        channels.append(button);
      }
      root.append(channels);

      if (snapshot.channelKind === 'GROUP') {
        const group = el(document, 'aside', 'conversation-evolution__group');
        group.dataset.groupSemantics = 'CURRENT_CHANNEL_ONLY';
        group.append(el(document, 'strong', null, 'Group audience'), el(document, 'span', null, snapshot.audience.map((item) => item.label).join(' · ')));
        if (snapshot.familySecurityStatus) {
          const security = el(document, 'section', 'conversation-evolution__security');
          const status = snapshot.familySecurityStatus;
          security.dataset.familySecurityState = status.state;
          security.dataset.roleCanAct = String(status.roleCanAct);
          security.dataset.effectAuthorityGranted = String(status.effectAuthorityGranted);
          const securityLabel = el(document, 'strong', null, binding.t('family-room.security.label'));
          const securitySummary = el(document, 'span');
          if (status.state === 'CURRENT') {
            const limited = status.missingCount + status.unknownCount + status.withheldCount + status.telemetryGapCount > 0;
            securitySummary.textContent = binding.t(limited ? 'family-room.security.limited' : 'family-room.security.current');
            if (limited) {
              security.append(
                securityLabel,
                securitySummary,
                el(document, 'small', null, binding.t('family-room.security.gaps', {
                  missing: status.missingCount,
                  unknown: status.unknownCount,
                  withheld: status.withheldCount,
                  telemetry: status.telemetryGapCount
                }))
              );
            } else {
              security.append(securityLabel, securitySummary);
            }
          } else {
            securitySummary.textContent = binding.t('family-room.security.unavailable');
            security.append(securityLabel, securitySummary);
          }
          security.append(el(document, 'small', null, binding.t('family-room.security.scope')));
          group.append(security);
        }
        root.append(group);
      }

      const feed = el(document, 'div', 'conversation-evolution__feed');
      feed.setAttribute('role', 'log');
      feed.setAttribute('aria-live', 'polite');
      for (const message of snapshot.messages) feed.append(renderMessage(document, message));
      root.append(feed);

      const composer = el(document, 'form', 'conversation-evolution__composer');
      composer.dataset.channelRef = snapshot.channelRef;
      composer.dataset.availabilityState = snapshot.availability.state;
      composer.dataset.draftState = snapshot.draft?.state ?? 'NONE';
      const composerAddress = el(document, 'strong', 'conversation-evolution__composer-address', snapshot.channelLabel);
      const textarea = el(document, 'textarea', 'conversation-evolution__input');
      textarea.rows = 3;
      textarea.placeholder = binding.t('composer.placeholder');
      textarea.value = canonical.input.value;
      const footer = el(document, 'div', 'conversation-evolution__composer-footer');
      const hint = el(document, 'span', 'conversation-evolution__hint');
      const send = el(document, 'button', 'conversation-evolution__send', binding.t('composer.send'));
      send.type = 'submit';
      const syncComposer = () => {
        const current = projectConversationEvolutionState(binding);
        const truth = composerTruth(current, canonical, textarea.value);
        composer.dataset.availabilityState = current.availability.state;
        composer.dataset.readyForRealTurn = String(current.availability.readyForRealTurn);
        composer.dataset.recoveryAvailable = String(current.availability.recoveryAvailable);
        composer.dataset.draftState = binding.state.unsentLocalDraft?.channelRef === current.channelRef ? binding.state.unsentLocalDraft.state : 'NONE';
        hint.textContent = truth.hint;
        send.disabled = !truth.submitAvailable;
        send.setAttribute('aria-disabled', String(!truth.submitAvailable));
      };
      textarea.addEventListener('input', () => {
        canonical.input.value = textarea.value;
        canonical.input.dispatchEvent(new document.defaultView.Event('input', { bubbles:true }));
        syncComposer();
      });
      composer.addEventListener('submit', (event) => {
        event.preventDefault();
        canonical.input.value = textarea.value;
        canonical.input.dispatchEvent(new document.defaultView.Event('input', { bubbles:true }));
        if (typeof canonical.form.requestSubmit === 'function') canonical.form.requestSubmit();
        else canonical.form.dispatchEvent(new document.defaultView.Event('submit', { bubbles:true, cancelable:true }));
        queueMicrotask(render);
      });
      footer.append(hint, send);
      composer.append(composerAddress, textarea, footer);
      root.append(composer);

      const context = el(document, 'details', 'conversation-evolution__context');
      context.append(el(document, 'summary', null, binding.t('context.title')));
      const facts = el(document, 'div', 'conversation-evolution__facts');
      appendFact(document, facts, binding.t('context.project'), snapshot.projectLabel);
      appendFact(document, facts, binding.t('context.thread'), snapshot.threadLabel);
      appendFact(document, facts, binding.t('context.channel'), snapshot.channelLabel);
      appendFact(document, facts, binding.t('context.visible-to'), snapshot.audience.map((item) => item.label).join(' · '));
      appendFact(document, facts, binding.t('health.model'), snapshot.availability.modelRefOrNull ?? 'Not source-bound');
      appendFact(document, facts, 'Generation', snapshot.availability.generationRefOrNull ?? 'Not source-bound');
      appendFact(document, facts, binding.t('context.current-source'), snapshot.selectedNodeRef ?? '—');
      context.append(facts);
      root.append(context);

      body.replaceChildren(root);
      feed.scrollTop = feed.scrollHeight;
      syncComposer();
      return snapshot;
    };

    const referenceFeed = document.querySelector('#messageFeed');
    const referenceChannels = document.querySelector('#channelTabs');
    observer?.disconnect();
    if (typeof document.defaultView?.MutationObserver === 'function') {
      observer = new document.defaultView.MutationObserver((mutations) => {
        if (!body.isConnected) return;
        const structural = mutations.some(({ target }) => target === referenceFeed || referenceFeed?.contains(target) || target === referenceChannels || referenceChannels?.contains(target));
        if (structural) render();
        else {
          const mounted = body.querySelector('.conversation-evolution__composer');
          const mountedInput = mounted?.querySelector('.conversation-evolution__input');
          const mountedHint = mounted?.querySelector('.conversation-evolution__hint');
          const mountedSend = mounted?.querySelector('.conversation-evolution__send');
          if (mounted && mountedInput && mountedHint && mountedSend) {
            const current = projectConversationEvolutionState(binding);
            const truth = composerTruth(current, canonical, mountedInput.value);
            mounted.dataset.availabilityState = current.availability.state;
            mounted.dataset.readyForRealTurn = String(current.availability.readyForRealTurn);
            mounted.dataset.recoveryAvailable = String(current.availability.recoveryAvailable);
            mounted.dataset.draftState = binding.state.unsentLocalDraft?.channelRef === current.channelRef ? binding.state.unsentLocalDraft.state : 'NONE';
            mountedHint.textContent = truth.hint;
            mountedSend.disabled = !truth.submitAvailable;
            mountedSend.setAttribute('aria-disabled', String(!truth.submitAvailable));
          }
        }
      });
      for (const target of [referenceFeed, referenceChannels, canonical.form, canonical.hint].filter(Boolean)) {
        observer.observe(target, { subtree:true, childList:true, attributes:true, characterData:true });
      }
    }
    return render();
  }

  return Object.freeze({ mount });
}

// [VXG RealForever]
