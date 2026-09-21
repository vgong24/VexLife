const BOOTSTRAP_SCHEMA = 'vexlife.browser-family-room-bootstrap/v1';
const FAMILY_PROJECT_REF = 'project.vexlife.root-hub';
const FAMILY_THREAD_REF = 'thread.root-hub.welcome';
const FAMILY_NODE_REF = 'element.channel.group';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.length > 0;
const count = (value) => Number.isSafeInteger(value) && value >= 0;

function heldSnapshot(failureCode = 'FAMILY_SESSION_AUTHORITY_UNAVAILABLE') {
  return Object.freeze({
    schemaVersion: BOOTSTRAP_SCHEMA,
    state: 'HELD_UNAVAILABLE',
    truthClass: 'HELD_UNAVAILABLE',
    currentPrincipalRef: null,
    rooms: Object.freeze([]),
    workStatus: Object.freeze({
      state: 'HELD_UNAVAILABLE',
      pendingCount: null,
      activeCount: null,
      dueCount: null,
      attentionCount: null,
      sourceRef: null
    }),
    failureCode
  });
}

function normalizedAudience(value) {
  if (!Array.isArray(value)) throw new TypeError('Family room audience must be an array');
  const audience = value.map((member) => {
    if (!object(member) || !text(member.principalRef) || !text(member.role)) {
      throw new TypeError('Family room audience member is invalid');
    }
    return Object.freeze({ principalRef: member.principalRef, role: member.role });
  });
  if (new Set(audience.map((member) => member.principalRef)).size !== audience.length) {
    throw new TypeError('Family room audience principal refs must be unique');
  }
  return Object.freeze(audience);
}

function normalizedRoom(value) {
  if (
    !object(value)
    || !text(value.spaceRef)
    || !text(value.channelRef)
    || !text(value.threadRef)
    || value.kind !== 'GROUP'
    || !count(value.membershipGeneration)
    || !text(value.familyCompanionLineageRef)
    || value.familyCompanionIncluded !== true
  ) {
    throw new TypeError('Family room projection is invalid');
  }
  const audience = normalizedAudience(value.audience);
  return Object.freeze({
    spaceRef: value.spaceRef,
    channelRef: value.channelRef,
    threadRef: value.threadRef,
    kind: value.kind,
    membershipGeneration: value.membershipGeneration,
    audience,
    familyCompanionLineageRef: value.familyCompanionLineageRef,
    familyCompanionIncluded: true
  });
}

function normalizedWorkStatus(value) {
  if (!object(value)) throw new TypeError('Family room work status is invalid');
  if (value.state === 'HELD_UNAVAILABLE') {
    return Object.freeze({
      state: 'HELD_UNAVAILABLE',
      pendingCount: null,
      activeCount: null,
      dueCount: null,
      attentionCount: null,
      sourceRef: null
    });
  }
  if (
    value.state !== 'CURRENT'
    || !count(value.pendingCount)
    || !count(value.activeCount)
    || !count(value.dueCount)
    || !count(value.attentionCount)
    || !text(value.sourceRef)
  ) throw new TypeError('Family room work status is not current');
  return Object.freeze({
    state: 'CURRENT',
    pendingCount: value.pendingCount,
    activeCount: value.activeCount,
    dueCount: value.dueCount,
    attentionCount: value.attentionCount,
    sourceRef: value.sourceRef
  });
}

export function normalizeFamilyRoomBootstrap(value) {
  if (!object(value) || value.schemaVersion !== BOOTSTRAP_SCHEMA) {
    throw new TypeError('Family room bootstrap schema is invalid');
  }
  if (value.state === 'HELD_UNAVAILABLE') {
    if (
      value.truthClass !== 'HELD_UNAVAILABLE'
      || value.currentPrincipalRef !== null
      || !Array.isArray(value.rooms)
      || value.rooms.length !== 0
      || !text(value.failureCode)
    ) {
      throw new TypeError('Held Family room bootstrap truth is invalid');
    }
    return Object.freeze({
      schemaVersion: BOOTSTRAP_SCHEMA,
      state: 'HELD_UNAVAILABLE',
      truthClass: 'HELD_UNAVAILABLE',
      currentPrincipalRef: null,
      rooms: Object.freeze([]),
      workStatus: normalizedWorkStatus(value.workStatus),
      failureCode: value.failureCode
    });
  }
  if (!['CURRENT', 'EMPTY'].includes(value.state) || value.truthClass !== 'CURRENT_LIVE_FAMILY') {
    throw new TypeError('Family room bootstrap truth is invalid');
  }
  if (!text(value.currentPrincipalRef) || !Array.isArray(value.rooms)) {
    throw new TypeError('Family room bootstrap identity is invalid');
  }
  const rooms = Object.freeze(value.rooms.map(normalizedRoom));
  if (value.state === 'CURRENT' && rooms.length === 0) {
    throw new TypeError('CURRENT Family room bootstrap requires at least one room');
  }
  if (value.state === 'EMPTY' && rooms.length !== 0) {
    throw new TypeError('EMPTY Family room bootstrap cannot contain rooms');
  }
  return Object.freeze({
    schemaVersion: BOOTSTRAP_SCHEMA,
    state: value.state,
    truthClass: value.truthClass,
    currentPrincipalRef: value.currentPrincipalRef,
    rooms,
    workStatus: normalizedWorkStatus(value.workStatus),
    failureCode: null
  });
}

export function familyRoomViewModel(snapshot) {
  const room = snapshot.rooms[0] ?? null;
  return Object.freeze({
    state: snapshot.state,
    truthClass: snapshot.truthClass,
    roomCount: snapshot.rooms.length,
    audienceCount: room?.audience.length ?? 0,
    familyVexCount: room?.familyCompanionIncluded === true ? 1 : 0,
    workState: snapshot.workStatus.state,
    pendingCount: snapshot.workStatus.pendingCount,
    activeCount: snapshot.workStatus.activeCount,
    dueCount: snapshot.workStatus.dueCount,
    attentionCount: snapshot.workStatus.attentionCount
  });
}

function roleKeyFor(roles, principalRef, index) {
  const existing = Object.entries(roles).find(([, role]) => role?.actorRef === principalRef);
  if (existing) return existing[0];
  return 'family-human-' + String(index + 1);
}

function ensureStatusHost(documentRef) {
  let host = documentRef.getElementById('familyRoomProjection');
  if (host) return host;
  const view = documentRef.getElementById('view-chat');
  if (!view) return null;
  host = documentRef.createElement('section');
  host.id = 'familyRoomProjection';
  host.className = 'e27-context-card';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  const heading = view.querySelector('.e27-context-heading');
  if (heading?.nextSibling) view.insertBefore(host, heading.nextSibling);
  else view.append(host);
  return host;
}

export function createFamilyRoomController({
  state,
  projects,
  roles,
  channels,
  messages,
  conversationKey,
  t,
  navigation,
  chat,
  fetchImpl = globalThis.fetch,
  documentRef = globalThis.document,
  bootstrapPath = '/api/v1/family/bootstrap',
  conversationPath = '/api/v1/family/conversation',
  lifecyclePath = '/api/v1/family/lifecycle',
  idempotencyKeyFactory = () => {
    const random = String(
      globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
    ).toLowerCase().replace(/[^a-z0-9.-]/gu, '');
    return `intent.vex.family.host.${random}`.slice(0, 192);
  },
  onChange = () => {}
} = {}) {
  if (!state || !Array.isArray(projects) || !roles || !Array.isArray(channels) || !messages) {
    throw new TypeError('Family room controller requires existing Chat projection owners');
  }
  if (typeof conversationKey !== 'function' || typeof t !== 'function' || !chat) {
    throw new TypeError('Family room controller requires existing Chat projection functions');
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('Family room controller requires fetch');
  if (typeof idempotencyKeyFactory !== 'function') {
    throw new TypeError('Family room controller requires a lifecycle idempotency-key factory');
  }

  let snapshot = heldSnapshot();
  let lifecycle = Object.freeze({ state: 'IDLE', operation: null, failureCode: null });
  let bound = false;
  const roomByChannel = new Map();
  const injectedRoleKeys = new Set();

  function removeInjectedProjection() {
    for (let index = channels.length - 1; index >= 0; index -= 1) {
      if (channels[index]?.familyRoomProjection === true) {
        const channel = channels[index];
        messages.delete(conversationKey(channel.projectRef, channel.threadRef, channel.channelRef));
        channels.splice(index, 1);
      }
    }
    for (const key of injectedRoleKeys) delete roles[key];
    injectedRoleKeys.clear();
    roomByChannel.clear();
  }

  function installProjection(next) {
    removeInjectedProjection();
    for (const [roomIndex, room] of next.rooms.entries()) {
      const roleByRef = new Map();
      room.audience.forEach((member, index) => {
        const key = roleKeyFor(roles, member.principalRef, index);
        if (!roles[key]) {
          roles[key] = {
            actorRef: member.principalRef,
            label: member.principalRef,
            avatar: String(index + 1),
            familyRoomProjection: true
          };
          injectedRoleKeys.add(key);
        }
        roleByRef.set(member.principalRef, key);
      });
      const vexKey = 'family-vex-' + String(roomIndex + 1);
      roles[vexKey] = {
        actorRef: room.familyCompanionLineageRef,
        labelRef: 'family-room.vex',
        avatar: 'V',
        familyRoomProjection: true
      };
      injectedRoleKeys.add(vexKey);
      roleByRef.set(room.familyCompanionLineageRef, vexKey);
      const channel = {
        projectRef: FAMILY_PROJECT_REF,
        threadRef: FAMILY_THREAD_REF,
        channelRef: room.channelRef,
        labelRef: 'family-room.channel',
        kind: 'GROUP',
        roleKey: vexKey,
        memberKeys: [
          ...room.audience.map((member) => roleByRef.get(member.principalRef)),
          vexKey
        ],
        familyRoomProjection: true
      };
      channels.push(channel);
      messages.set(conversationKey(channel.projectRef, channel.threadRef, channel.channelRef), []);
      roomByChannel.set(channel.channelRef, Object.freeze({ room, channel, roleByRef }));
    }
  }

  function normalizeMessage(entry, message) {
    if (!object(message) || !text(message.messageRef) || !text(message.speakerRef)) return null;
    const speakerKey = entry.roleByRef.get(message.speakerRef);
    if (!speakerKey) return null;
    const recipientKeys = Array.isArray(message.recipientRefs)
      ? message.recipientRefs.map((ref) => entry.roleByRef.get(ref)).filter(Boolean)
      : [];
    return Object.freeze({
      messageRef: message.messageRef,
      projectRef: entry.channel.projectRef,
      threadRef: entry.channel.threadRef,
      channelRef: entry.channel.channelRef,
      speakerKey,
      recipientKeys,
      content: typeof message.content === 'string' ? message.content : '',
      contentRef: null,
      contentParams: {},
      intentRef: null,
      sequence: Number.isSafeInteger(message.sequence) ? message.sequence : 0,
      createdAt: text(message.createdAt) ? message.createdAt : new Date().toISOString(),
      truthClass: 'CURRENT_LIVE_FAMILY'
    });
  }

  async function refreshRoomMessages(entry) {
    const response = await fetchImpl(conversationPath, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operation: 'READ',
        intent: {
          spaceRef: entry.room.spaceRef,
          channelRef: entry.room.channelRef,
          expectedMembershipGeneration: entry.room.membershipGeneration
        }
      })
    });
    let body = null;
    try { body = await response.json(); } catch {}
    if (!response.ok || !Array.isArray(body?.messages)) return false;
    const list = messages.get(conversationKey(
      entry.channel.projectRef,
      entry.channel.threadRef,
      entry.channel.channelRef
    ));
    list.splice(0, list.length, ...body.messages.map((message) => normalizeMessage(entry, message)).filter(Boolean));
    return true;
  }

  function setLifecycleState(stateValue, operation = null, failureCode = null) {
    lifecycle = Object.freeze({ state: stateValue, operation, failureCode });
    render();
    onChange();
    return lifecycle;
  }

  async function executeLifecycle(operation, intent) {
    setLifecycleState('RUNNING', operation, null);
    try {
      const response = await fetchImpl(lifecyclePath, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ operation, intent })
      });
      let body = null;
      try { body = await response.json(); } catch {}
      if (!response.ok) {
        setLifecycleState(
          'HELD_UNAVAILABLE',
          operation,
          body?.failureCode ?? 'FAMILY_LIFECYCLE_UNAVAILABLE'
        );
        return Object.freeze({ ok: false, body });
      }
      await refresh();
      setLifecycleState('SUCCEEDED', operation, null);
      return Object.freeze({ ok: true, body });
    } catch {
      setLifecycleState('HELD_UNAVAILABLE', operation, 'FAMILY_LIFECYCLE_UNAVAILABLE');
      return Object.freeze({ ok: false, body: null });
    }
  }

  async function hostFamily() {
    const idempotencyKey = idempotencyKeyFactory();
    if (!text(idempotencyKey)) {
      setLifecycleState('HELD_UNAVAILABLE', 'HOST', 'FAMILY_LIFECYCLE_INPUT_INVALID');
      return Object.freeze({ ok: false, body: null });
    }
    return executeLifecycle('HOST', { idempotencyKey });
  }

  async function joinFamily(invitationRef) {
    const value = typeof invitationRef === 'string' ? invitationRef.trim() : '';
    if (!value) {
      setLifecycleState('HELD_UNAVAILABLE', 'JOIN', 'FAMILY_LIFECYCLE_INPUT_INVALID');
      return Object.freeze({ ok: false, body: null });
    }
    return executeLifecycle('JOIN', { invitationRef: value });
  }

  async function leaveFamily() {
    const entry = roomByChannel.get(state.channelRef) ?? roomByChannel.values().next().value;
    if (!entry?.room?.spaceRef) {
      setLifecycleState('HELD_UNAVAILABLE', 'LEAVE', 'FAMILY_LIFECYCLE_CURRENT_FAMILY_UNAVAILABLE');
      return Object.freeze({ ok: false, body: null });
    }
    return executeLifecycle('LEAVE', { spaceRef: entry.room.spaceRef });
  }

  async function refresh() {
    try {
      const response = await fetchImpl(bootstrapPath, { method: 'GET', headers: { accept: 'application/json' } });
      let body = null;
      try { body = await response.json(); } catch {}
      if (!response.ok) {
        snapshot = heldSnapshot(body?.failureCode ?? 'FAMILY_ROOM_BOOTSTRAP_UNAVAILABLE');
        removeInjectedProjection();
        render();
        onChange();
        return snapshot;
      }
      const next = normalizeFamilyRoomBootstrap(body);
      snapshot = next;
      installProjection(next);
      for (const entry of roomByChannel.values()) await refreshRoomMessages(entry);
      render();
      onChange();
      return snapshot;
    } catch {
      snapshot = heldSnapshot('FAMILY_ROOM_BOOTSTRAP_UNAVAILABLE');
      removeInjectedProjection();
      render();
      onChange();
      return snapshot;
    }
  }

  function openFirstRoom() {
    const entry = roomByChannel.values().next().value;
    if (!entry) return false;
    const project = projects.find((candidate) => candidate.projectRef === FAMILY_PROJECT_REF);
    const thread = project?.threads.find((candidate) => candidate.threadRef === FAMILY_THREAD_REF);
    if (!project || !thread) return false;
    chat.selectThread(project, thread, 'element.thread.root-welcome');
    chat.selectChannel(entry.channel, FAMILY_NODE_REF);
    onChange();
    return true;
  }

  async function submitCurrentFamilyMessage(event) {
    const entry = roomByChannel.get(state.channelRef);
    if (!entry) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const input = documentRef?.getElementById('messageInput');
    const content = input?.value?.trim();
    if (!content) return;
    const idempotencyKey = 'family-ui-' + String(Date.now()) + '-' + String(globalThis.crypto?.randomUUID?.() ?? Math.random()).replace(/[^A-Za-z0-9]/g, '');
    try {
      const response = await fetchImpl(conversationPath, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operation: 'APPEND',
          intent: {
            spaceRef: entry.room.spaceRef,
            channelRef: entry.room.channelRef,
            content,
            expectedMembershipGeneration: entry.room.membershipGeneration,
            idempotencyKey
          }
        })
      });
      if (!response.ok) {
        snapshot = heldSnapshot('FAMILY_ROOM_APPEND_HELD');
        render();
        return;
      }
      input.value = '';
      await refreshRoomMessages(entry);
      chat.renderMessages(true);
      render();
      onChange();
    } catch {
      snapshot = heldSnapshot('FAMILY_ROOM_APPEND_HELD');
      render();
    }
  }

  function renderLifecycleControls(host, room) {
    const controls = documentRef.createElement('fieldset');
    controls.id = 'familyLifecycleControls';
    controls.className = 'family-lifecycle-controls';

    const legend = documentRef.createElement('legend');
    legend.textContent = t('family-room.lifecycle.heading');
    controls.append(legend);

    const running = lifecycle.state === 'RUNNING';
    const authorityHeld = snapshot.state === 'HELD_UNAVAILABLE';

    const hostButton = documentRef.createElement('button');
    hostButton.id = 'familyHostButton';
    hostButton.type = 'button';
    hostButton.textContent = t('family-room.lifecycle.host');
    hostButton.disabled = running || authorityHeld || snapshot.state !== 'EMPTY';
    hostButton.addEventListener('click', () => { void hostFamily(); });
    controls.append(hostButton);

    const joinLabel = documentRef.createElement('label');
    joinLabel.htmlFor = 'familyJoinInvitationRef';
    joinLabel.textContent = t('family-room.lifecycle.join.label');
    const joinInput = documentRef.createElement('input');
    joinInput.id = 'familyJoinInvitationRef';
    joinInput.type = 'text';
    joinInput.autocomplete = 'off';
    joinInput.placeholder = t('family-room.lifecycle.join.placeholder');
    joinInput.disabled = running || authorityHeld;
    const joinButton = documentRef.createElement('button');
    joinButton.id = 'familyJoinButton';
    joinButton.type = 'button';
    joinButton.textContent = t('family-room.lifecycle.join');
    const syncJoinButton = () => {
      joinButton.disabled = running || authorityHeld || !joinInput.value.trim();
    };
    joinInput.addEventListener('input', syncJoinButton);
    joinButton.addEventListener('click', () => { void joinFamily(joinInput.value); });
    syncJoinButton();
    controls.append(joinLabel, joinInput, joinButton);

    const leaveButton = documentRef.createElement('button');
    leaveButton.id = 'familyLeaveButton';
    leaveButton.type = 'button';
    leaveButton.textContent = t('family-room.lifecycle.leave');
    leaveButton.disabled = running || authorityHeld || !room;
    leaveButton.addEventListener('click', () => { void leaveFamily(); });
    controls.append(leaveButton);

    const lifecycleState = documentRef.createElement('p');
    lifecycleState.id = 'familyLifecycleStatus';
    lifecycleState.setAttribute('role', 'status');
    lifecycleState.setAttribute('aria-live', 'polite');
    lifecycleState.dataset.state = lifecycle.state;
    if (lifecycle.failureCode) lifecycleState.dataset.failureCode = lifecycle.failureCode;
    const statusKey = lifecycle.state === 'RUNNING'
      ? 'family-room.lifecycle.working'
      : lifecycle.state === 'SUCCEEDED'
        ? 'family-room.lifecycle.success'
        : lifecycle.state === 'HELD_UNAVAILABLE'
          ? 'family-room.lifecycle.failed'
          : authorityHeld
            ? 'family-room.lifecycle.held'
            : 'family-room.lifecycle.ready';
    lifecycleState.textContent = t(statusKey);
    controls.append(lifecycleState);

    host.append(controls);
  }

  function render() {
    if (!documentRef) return snapshot;
    const host = ensureStatusHost(documentRef);
    if (!host) return snapshot;
    host.replaceChildren();
    host.dataset.truthClass = snapshot.truthClass;
    host.dataset.familyRoomState = snapshot.state;
    const eyebrow = documentRef.createElement('small');
    eyebrow.textContent = t('family-room.eyebrow');
    const title = documentRef.createElement('h2');
    title.textContent = t('family-room.title');
    const status = documentRef.createElement('span');
    status.className = 'status-pill ' + (snapshot.state === 'CURRENT' ? 'pass' : 'attention');
    status.textContent = t(
      snapshot.state === 'CURRENT'
        ? 'family-room.state.live'
        : snapshot.state === 'EMPTY'
          ? 'family-room.state.empty'
          : 'family-room.state.held'
    );
    host.append(eyebrow, title, status);

    const room = snapshot.rooms[0] ?? null;
    const audience = documentRef.createElement('p');
    audience.textContent = room
      ? t('family-room.audience', { count: room.audience.length })
      : t('family-room.audience.held');
    host.append(audience);

    const work = documentRef.createElement('p');
    work.dataset.workState = snapshot.workStatus.state;
    work.textContent = snapshot.workStatus.state === 'CURRENT'
      ? t('family-room.work.current', {
          active: snapshot.workStatus.activeCount,
          pending: snapshot.workStatus.pendingCount,
          due: snapshot.workStatus.dueCount,
          attention: snapshot.workStatus.attentionCount
        })
      : t('family-room.work.held');
    if (snapshot.workStatus.state === 'CURRENT') {
      work.dataset.pendingCount = String(snapshot.workStatus.pendingCount);
      work.dataset.activeCount = String(snapshot.workStatus.activeCount);
      work.dataset.dueCount = String(snapshot.workStatus.dueCount);
      work.dataset.attentionCount = String(snapshot.workStatus.attentionCount);
    }
    host.append(work);

    const action = documentRef.createElement('button');
    action.type = 'button';
    action.textContent = room ? t('family-room.open') : t('family-room.refresh');
    action.disabled = snapshot.state === 'EMPTY';
    action.addEventListener('click', () => { if (room) openFirstRoom(); else void refresh(); });
    host.append(action);
    renderLifecycleControls(host, room);

    if (room) {
      host.dataset.spaceRef = room.spaceRef;
      host.dataset.channelRef = room.channelRef;
      host.dataset.membershipGeneration = String(room.membershipGeneration);
    } else {
      delete host.dataset.spaceRef;
      delete host.dataset.channelRef;
      delete host.dataset.membershipGeneration;
    }

    const current = roomByChannel.get(state.channelRef);
    if (current) {
      const input = documentRef.getElementById('messageInput');
      const submit = documentRef.querySelector('#composer button[type="submit"]');
      const hint = documentRef.getElementById('composerHint');
      if (input) input.disabled = false;
      if (submit) submit.disabled = false;
      if (hint) hint.textContent = t('family-room.composer.available');
    }
    return snapshot;
  }

  function bind() {
    if (bound || !documentRef) return;
    const composer = documentRef.getElementById('composer');
    composer?.addEventListener('submit', submitCurrentFamilyMessage, true);
    bound = true;
    render();
  }

  return Object.freeze({
    bind,
    refresh,
    render,
    openFirstRoom,
    hostFamily,
    joinFamily,
    leaveFamily,
    lifecycleStatus: () => lifecycle,
    snapshot: () => snapshot,
    roomCount: () => roomByChannel.size,
    isFamilyChannel: (channelRef = state.channelRef) => roomByChannel.has(channelRef)
  });
}

// [VXG RealForever]
