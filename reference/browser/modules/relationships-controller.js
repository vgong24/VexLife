import { admission, canAdvance, project, recover, validateRegistry } from '../relationships/core.js';

const SUPPORTED_LANGUAGES = Object.freeze(['en', 'ja', 'zh']);
const TERRAIN_REF = 'terrain.resource.relationships';
const ENTRY_ELEMENT_REF = 'element.relationships.open';
const OPTION_LABEL_KEYS = Object.freeze({
  CODE:'option.method.code',
  FILE:'option.method.file',
  QR_PROJECTION:'option.method.qr',
  NONE:'option.invitation.none',
  CREATED_LOCAL_REFERENCE:'option.invitation.created',
  RECEIVED_VERIFIED_REFERENCE:'option.invitation.receivedVerified',
  RECEIVED_HELD_IDENTITY:'option.invitation.receivedHeldIdentity',
  EXPIRED_OR_REVOKED:'option.invitation.expiredOrRevoked',
  ACCEPT:'option.decision.accept',
  NARROW:'option.decision.narrow',
  DEFER:'option.decision.defer',
  DENY:'option.decision.deny',
  BLOCK:'option.decision.block',
  VERIFIED_CURRENT:'option.identity.verified',
  WRONG_KEY:'option.identity.wrongKey',
  SIGNATURE_INVALID:'option.identity.signatureInvalid',
  STALE_EVIDENCE:'option.identity.stale',
  INVITATION_EXPIRED:'option.identity.invitationExpired',
  UNKNOWN:'option.identity.unknown',
  NOT_CONNECTED:'option.delivery.notConnected',
  SENT_NOT_CONNECTED:'option.delivery.sentNotConnected',
  CONNECTED:'option.delivery.connected',
  DELIVERED:'option.delivery.delivered',
  SEMANTIC_ACKNOWLEDGED:'option.delivery.acknowledged',
  FRIEND:'classFriend',
  FAMILY:'classFamily',
  COLLABORATOR:'classCollaborator',
  OTHER:'classOther'
});

async function fetchJson(root, relativePath) {
  const response = await fetch(`${root}${relativePath}`);
  if (!response.ok) throw new Error(`Unable to load ${relativePath}: HTTP ${response.status}`);
  return response.json();
}

export async function loadRelationshipsReference(root = '../../') {
  const [registry, en, ja, zh] = await Promise.all([
    fetchJson(root, 'blueprint/relationships-browser-registry.json'),
    fetchJson(root, 'blueprint/relationships-browser/strings/en.json'),
    fetchJson(root, 'blueprint/relationships-browser/strings/ja.json'),
    fetchJson(root, 'blueprint/relationships-browser/strings/zh.json')
  ]);
  validateRegistry(registry);
  const catalogs = Object.freeze({ en, ja, zh });
  const referenceKeys = Object.keys(en).sort();
  for (const language of registry.requiredLanguages) {
    if (!SUPPORTED_LANGUAGES.includes(language)) throw new Error(`Unsupported Relationships language ${language}`);
    const candidateKeys = Object.keys(catalogs[language] ?? {}).sort();
    if (JSON.stringify(candidateKeys) !== JSON.stringify(referenceKeys)) throw new Error(`Relationships catalog key drift: ${language}`);
  }
  for (const key of new Set(Object.values(OPTION_LABEL_KEYS))) {
    if (!referenceKeys.includes(key)) throw new Error(`Relationships human option label missing: ${key}`);
  }
  return Object.freeze({ registry, catalogs });
}

function format(template, params = {}) {
  return String(template).replace(/\{([A-Za-z0-9_]+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
}

function option(value, label = value) {
  const node = document.createElement('option');
  node.value = value;
  node.textContent = label;
  return node;
}

function actionButton(id, label) {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.textContent = label;
  button.style.minWidth = '44px';
  button.style.minHeight = '44px';
  return button;
}

function selectControl(id, labelText, values, labelForValue = (value) => value) {
  const label = document.createElement('label');
  label.className = 'e27-context-row';
  const text = document.createElement('span');
  text.textContent = labelText;
  const select = document.createElement('select');
  select.id = id;
  for (const value of values) select.append(option(value, labelForValue(value)));
  label.append(text, select);
  return { label, select };
}

function createSurface() {
  const section = document.createElement('section');
  section.id = 'view-relationships';
  section.dataset.nodeRef = 'screen.vexlife.relationships';
  section.dataset.relationshipsSurface = 'canonical-contextual-projection';
  section.hidden = true;
  section.innerHTML = `
    <header class="e27-context-heading">
      <p class="e27-eyebrow" data-rel="badge"></p>
      <h2 data-rel="title"></h2>
      <p data-rel="subtitle"></p>
    </header>
    <div class="e27-chat-grid">
      <main class="e27-feed scroll-scope" data-rel="main">
        <section class="e27-context-card" data-rel="privacy"></section>
        <section class="e27-context-card" data-rel="empty"></section>
        <section class="e27-context-card" data-rel="direct"></section>
        <section class="e27-context-card" data-rel="booklet"></section>
        <section class="e27-context-card" data-rel="connect-panel" hidden></section>
      </main>
      <aside class="e27-context-card" data-rel="side"></aside>
    </div>`;
  return section;
}

export function createRelationshipsController({ state, registry, catalogs, host = document.querySelector('#contextSurface') }) {
  validateRegistry(registry);
  if (!host) throw new Error('Relationships contextual host unavailable');
  const surface = createSurface();
  host.append(surface);

  let scenarioCount = 0;
  let bookletPage = 1;
  let bookletOpen = false;
  let connectOpen = false;
  let vexExplanationOpen = false;
  let interaction = {
    method: 'CODE',
    invitation: 'NONE',
    identity: 'UNKNOWN',
    decision: 'DEFER',
    localClass: 'FRIEND',
    localFormed: false,
    recovery: 'ACTIVE',
    delivery: 'NOT_CONNECTED'
  };

  const language = () => SUPPORTED_LANGUAGES.includes(state.language) ? state.language : 'en';
  const rt = (key, params = {}) => format(catalogs[language()]?.[key] ?? catalogs.en?.[key] ?? `[${key}]`, params);
  const humanOptionLabel = (value) => {
    const key = OPTION_LABEL_KEYS[value];
    if (!key) throw new Error(`Relationships option label unmapped: ${value}`);
    return rt(key);
  };
  const auxiliaryCounts = () => scenarioCount === 0
    ? { groups: 0, invitations: 0 }
    : { groups: Math.min(registry.syntheticFixtureCounts.groups, Math.max(1, Math.ceil(scenarioCount / 10))), invitations: registry.syntheticFixtureCounts.invitations };
  const projection = () => project(registry, scenarioCount, bookletPage, auxiliaryCounts());

  function bindTerrainDoor() {
    const door = document.querySelector(`.e27-node[data-terrain-ref="${TERRAIN_REF}"]`);
    if (!door) return false;
    door.dataset.entryElementRef = ENTRY_ELEMENT_REF;
    door.dataset.relationshipResourceRef = registry.resource.resourceRef;
    door.dataset.relationshipEntryBindingRef = registry.entryPolicy.activeEntryBindingRef;
    return true;
  }

  const terrainWorld = document.querySelector('#terrainWorld');
  const terrainDoorObserver = terrainWorld ? new MutationObserver(() => { bindTerrainDoor(); }) : null;
  terrainDoorObserver?.observe(terrainWorld, { childList: true, subtree: true });

  function resetInteraction() {
    interaction = { method:'CODE', invitation:'NONE', identity:'UNKNOWN', decision:'DEFER', localClass:'FRIEND', localFormed:false, recovery:'ACTIVE', delivery:'NOT_CONNECTED' };
  }

  function renderPrivacy() {
    const target = surface.querySelector('[data-rel="privacy"]');
    target.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = rt('entryTitle');
    const body = document.createElement('p');
    body.textContent = rt('entryBody');
    const facts = document.createElement('p');
    facts.textContent = `${rt('inviteOnly')} · ${rt('publicSearch')}: ${rt('off')}`;
    const entry = document.createElement('p');
    entry.textContent = rt('entryCurrent');
    target.append(title, body, facts, entry);
  }

  function renderEmpty() {
    const target = surface.querySelector('[data-rel="empty"]');
    target.hidden = scenarioCount !== 0;
    target.replaceChildren();
    if (target.hidden) return;
    const heading = document.createElement('h3');
    heading.textContent = rt('emptyTitle');
    const body = document.createElement('p');
    body.textContent = rt('emptyBody');
    const connect = actionButton('relationshipsConnect', rt('connect'));
    connect.dataset.nodeRef = 'element.relationships.connect';
    connect.onclick = () => { connectOpen = true; render(); surface.querySelector('#relationshipsConnectMethod')?.focus(); };
    target.append(heading, body, connect);
  }

  function renderDirect(view) {
    const target = surface.querySelector('[data-rel="direct"]');
    target.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = rt('direct');
    target.append(heading);
    if (!view.direct.length) {
      const none = document.createElement('p');
      none.textContent = rt('noRelationships');
      target.append(none);
    }
    for (const person of view.direct) {
      const article = document.createElement('article');
      article.className = 'e27-context-row';
      article.dataset.relationshipRef = person.relationshipRef;
      const name = document.createElement('strong');
      name.textContent = rt('person', { n: person.nameNumber });
      const summary = document.createElement('span');
      const classKey = person.localClass === 'FRIEND' ? 'classFriend' : person.localClass === 'FAMILY' ? 'classFamily' : person.localClass === 'COLLABORATOR' ? 'classCollaborator' : 'classOther';
      summary.textContent = rt('summary', { class: rt(classKey) });
      article.append(name, summary);
      target.append(article);
    }
    if (scenarioCount > 0) {
      const connect = actionButton('relationshipsConnectExisting', rt('connect'));
      connect.dataset.nodeRef = 'element.relationships.connect';
      connect.onclick = () => { connectOpen = true; render(); surface.querySelector('#relationshipsConnectMethod')?.focus(); };
      target.append(connect);
    }
  }

  function renderBooklet(view) {
    const target = surface.querySelector('[data-rel="booklet"]');
    target.replaceChildren();
    if (scenarioCount === 0) { target.hidden = true; return; }
    target.hidden = false;
    const button = actionButton('relationshipsBookletToggle', bookletOpen ? rt('closeBooklet') : rt('booklet'));
    button.setAttribute('aria-expanded', String(bookletOpen));
    button.onclick = () => { bookletOpen = !bookletOpen; render(); };
    target.append(button);
    if (!bookletOpen) return;
    const heading = document.createElement('h3');
    heading.textContent = rt('bookletTitle');
    const page = document.createElement('p');
    page.textContent = rt('page', { page:view.booklet.page, pages:view.booklet.pages, shown:view.booklet.rows.length, total:view.booklet.total });
    const list = document.createElement('ol');
    list.setAttribute('aria-label', rt('accessible'));
    for (const person of view.booklet.rows) {
      const row = document.createElement('li');
      row.dataset.relationshipRef = person.relationshipRef;
      row.textContent = rt('person', { n: person.nameNumber });
      list.append(row);
    }
    const prev = actionButton('relationshipsBookletPrevious', rt('previous'));
    const next = actionButton('relationshipsBookletNext', rt('next'));
    prev.disabled = view.booklet.page <= 1;
    next.disabled = view.booklet.page >= view.booklet.pages;
    prev.onclick = () => { bookletPage = Math.max(1, bookletPage - 1); render(); };
    next.onclick = () => { bookletPage = Math.min(view.booklet.pages, bookletPage + 1); render(); };
    target.append(heading, page, list, prev, next);
    if (view.virtualizationRequired) {
      const virtual = document.createElement('p');
      virtual.dataset.virtualizationRequired = 'true';
      virtual.textContent = rt('virtual');
      target.append(virtual);
    }
  }

  function renderConnect() {
    const target = surface.querySelector('[data-rel="connect-panel"]');
    target.hidden = !connectOpen;
    target.replaceChildren();
    if (!connectOpen) return;
    const heading = document.createElement('h3');
    heading.textContent = rt('connectTitle');
    const body = document.createElement('p');
    body.textContent = rt('connectBody');
    const method = selectControl('relationshipsConnectMethod', rt('method'), registry.invitation.methods, humanOptionLabel);
    const invitation = selectControl('relationshipsInvitation', rt('invitation'), registry.invitation.states, humanOptionLabel);
    const identity = selectControl('relationshipsIdentity', rt('identity'), registry.invitation.identityStates, humanOptionLabel);
    const decision = selectControl('relationshipsDecision', rt('decision'), registry.invitation.decisions, humanOptionLabel);
    const localClass = selectControl('relationshipsLocalClass', rt('localClass'), ['FRIEND','FAMILY','COLLABORATOR','OTHER'], humanOptionLabel);
    method.select.value = interaction.method;
    invitation.select.value = interaction.invitation;
    identity.select.value = interaction.identity;
    decision.select.value = interaction.decision;
    localClass.select.value = interaction.localClass;
    method.select.onchange = (event) => { interaction.method = event.currentTarget.value; };
    invitation.select.onchange = (event) => { interaction.invitation = event.currentTarget.value; interaction.localFormed = false; render(); };
    identity.select.onchange = (event) => { interaction.identity = event.currentTarget.value; interaction.localFormed = false; render(); };
    decision.select.onchange = (event) => { interaction.decision = event.currentTarget.value; interaction.localFormed = false; render(); };
    localClass.select.onchange = (event) => { interaction.localClass = event.currentTarget.value; interaction.localFormed = false; render(); };
    const gate = admission(interaction);
    const status = document.createElement('p');
    status.id = 'relationshipsConnectStatus';
    status.setAttribute('role', 'status');
    status.textContent = interaction.localFormed ? rt('formed') : gate.admitted ? rt('ready') : rt('held');
    const form = actionButton('relationshipsFormLocal', rt('form'));
    form.disabled = !gate.admitted || interaction.recovery !== 'ACTIVE';
    form.onclick = () => { interaction.localFormed = true; interaction.delivery = 'NOT_CONNECTED'; render(); };
    const close = actionButton('relationshipsConnectClose', rt('closeConnect'));
    close.onclick = () => { connectOpen = false; render(); surface.querySelector('#relationshipsConnect')?.focus(); };
    target.append(heading, body, method.label, invitation.label, identity.label, decision.label, localClass.label, status, form, close);
  }

  function renderSide(view) {
    const target = surface.querySelector('[data-rel="side"]');
    target.replaceChildren();
    const counts = document.createElement('section');
    const people = document.createElement('p'); people.textContent = rt('people', { count:view.counts.people });
    const groups = document.createElement('p'); groups.textContent = rt('groups', { count:view.counts.groups });
    const invitations = document.createElement('p'); invitations.textContent = rt('invitations', { count:view.counts.invitations });
    counts.append(people, groups, invitations);

    const deliveryHeading = document.createElement('h3'); deliveryHeading.textContent = rt('deliveryTitle');
    const deliveryBody = document.createElement('p'); deliveryBody.textContent = rt('deliveryBody');
    const delivery = document.createElement('p'); delivery.id = 'relationshipsDelivery'; delivery.textContent = `${rt('delivery')}: ${humanOptionLabel(interaction.delivery)}`;
    const deliveryHeld = document.createElement('p'); deliveryHeld.textContent = canAdvance(interaction) ? rt('active') : rt('deliveryHeld');

    const vexHeading = document.createElement('h3'); vexHeading.textContent = rt('vexTitle');
    const vexBody = document.createElement('p'); vexBody.textContent = rt('vexBody');
    const vex = actionButton('relationshipsVexExplain', vexExplanationOpen ? rt('vexHide') : rt('vexShow'));
    vex.onclick = () => { vexExplanationOpen = !vexExplanationOpen; render(); };
    const vexExplanation = document.createElement('p'); vexExplanation.hidden = !vexExplanationOpen; vexExplanation.textContent = rt('vexExplanation');

    const recoveryHeading = document.createElement('h3'); recoveryHeading.textContent = rt('recoveryTitle');
    const recoveryBody = document.createElement('p'); recoveryBody.textContent = rt('recoveryBody');
    const recoveryStatus = document.createElement('p'); recoveryStatus.id = 'relationshipsRecoveryStatus';
    const recoveryKey = interaction.recovery === 'BLOCKED' ? 'blocked' : interaction.recovery === 'REVOKED' ? 'revoked' : interaction.recovery === 'WITHDRAWN' ? 'withdrawn' : interaction.recovery === 'DISCONNECTED' ? 'disconnected' : 'active';
    recoveryStatus.textContent = rt(recoveryKey);
    const recoveryButtons = [
      ['relationshipsBlock','BLOCK','block'],['relationshipsRevoke','REVOKE','revoke'],['relationshipsWithdraw','WITHDRAW','withdraw'],['relationshipsDisconnect','DISCONNECT','disconnect'],['relationshipsReset','RESET_REFERENCE','reset']
    ];
    const controls = document.createElement('div');
    controls.className = 'e27-focus-actions';
    for (const [id, action, key] of recoveryButtons) {
      const button = actionButton(id, rt(key));
      button.onclick = () => { interaction = recover(interaction, action); render(); };
      controls.append(button);
    }
    target.append(counts, deliveryHeading, deliveryBody, delivery, deliveryHeld, vexHeading, vexBody, vex, vexExplanation, recoveryHeading, recoveryBody, recoveryStatus, controls);
  }

  function render() {
    bindTerrainDoor();
    const view = projection();
    surface.querySelector('[data-rel="badge"]').textContent = rt('badge');
    surface.querySelector('[data-rel="title"]').textContent = rt('title');
    surface.querySelector('[data-rel="subtitle"]').textContent = rt('subtitle');
    renderPrivacy();
    renderEmpty();
    renderDirect(view);
    renderBooklet(view);
    renderConnect();
    renderSide(view);
    return snapshot();
  }

  function snapshot() {
    const view = projection();
    return Object.freeze({
      schemaVersion:'vexlife.relationships.visible-adoption-browser/v1',
      resourceRef:registry.resource.resourceRef,
      screenRef:registry.resource.screenRef,
      routeRef:registry.resource.routeRef,
      terrainRef:TERRAIN_REF,
      activeEntryBindingRef:registry.entryPolicy.activeEntryBindingRef,
      contextProjection:state.contextProjection,
      language:language(),
      scenarioCount,
      mode:view.mode,
      counts:{ ...view.counts },
      directRelationshipRefs:view.direct.map((person)=>person.relationshipRef),
      booklet:{ ...view.booklet, rows:view.booklet.rows.map((person)=>person.relationshipRef) },
      accessibleRelationshipCount:view.accessibleRows.length,
      virtualizationRequired:view.virtualizationRequired,
      connectOpen,
      localFormed:interaction.localFormed,
      admission:admission(interaction),
      delivery:interaction.delivery,
      recovery:interaction.recovery,
      publicSearch:registry.publicSearch,
      communitySearch:registry.communitySearch,
      effects:{ ...registry.effects }
    });
  }

  function setScenarioCount(count) {
    if (!registry.scenarioCounts.includes(count)) throw new Error(`Unsupported Relationships scenario count: ${count}`);
    scenarioCount = count;
    bookletPage = 1;
    bookletOpen = false;
    render();
    return snapshot();
  }

  function close() {
    connectOpen = false;
    bookletOpen = false;
    vexExplanationOpen = false;
    resetInteraction();
    render();
  }

  render();
  return Object.freeze({ render, snapshot, setScenarioCount, bindTerrainDoor, close });
}

// [VXG RealForever]
