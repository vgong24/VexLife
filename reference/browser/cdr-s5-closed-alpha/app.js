const REGISTRY_URL = '../../../blueprint/cdr-s5-closed-alpha-browser-registry.json';

const state = {
  locale: 'en',
  alphaConsentAcknowledged: false,
  invitation: 'NONE',
  decision: 'DEFER',
  identity: 'VERIFIED_CURRENT',
  presence: 'AVAILABLE_FOR_INVITES',
  route: 'DIRECT_CANDIDATE',
  failure: 'NONE',
  delivery: 'NOT_CONNECTED',
  revoked: false,
  withdrawn: false,
  exported: false,
  disconnected: false
};

let registry;

const $ = (id) => document.getElementById(id);
const text = (key) => registry.strings[state.locale][key] ?? registry.strings.en[key] ?? key;

function setOptions(id, values) {
  const select = $(id);
  select.replaceChildren(...values.map((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    return option;
  }));
}

function renderLocale() {
  document.documentElement.lang = state.locale === 'zh' ? 'zh-Hans' : state.locale;
  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = text(node.dataset.i18n);
  }
  $('consent').textContent = state.alphaConsentAcknowledged ? text('consentReady') : text('consentButton');
  renderRecovery();
}

function routeMetadata(routeClass) {
  if (routeClass === 'RELAYED') return ['BOUNDED_RELAY', 'REPLACEABLE_RELAY'];
  if (routeClass === 'STORE_FORWARD') return ['STORE_FORWARD', 'REPLACEABLE_THIN_HUB'];
  if (routeClass === 'UNAVAILABLE') return ['UNKNOWN', 'UNKNOWN'];
  return ['LOCAL_OR_DIRECT', 'NONE_LOCAL'];
}

function invitationHeld() {
  return state.invitation === 'RECEIVED_HELD_IDENTITY' || state.invitation === 'EXPIRED_OR_REVOKED';
}

function invitationCurrent() {
  return state.invitation === 'CREATED_LOCAL_REFERENCE' || state.invitation === 'RECEIVED_VERIFIED_REFERENCE';
}

function canAdvanceDelivery() {
  return !state.withdrawn
    && !state.revoked
    && state.alphaConsentAcknowledged
    && invitationCurrent()
    && state.identity === 'VERIFIED_CURRENT'
    && state.route !== 'UNAVAILABLE'
    && state.failure === 'NONE';
}

function renderDelivery() {
  const current = state.delivery;
  const items = registry.deliveryStates.map((value) => {
    const li = document.createElement('li');
    li.textContent = value;
    li.dataset.current = String(value === current);
    return li;
  });
  $('delivery-ladder').replaceChildren(...items);
  $('delivery-status')?.remove?.();
}

function renderRecovery() {
  const out = $('recovery-status');
  if (!out) return;
  if (state.withdrawn) out.textContent = text('withdrawn');
  else if (state.revoked) out.textContent = text('revoked');
  else if (state.exported) out.textContent = text('exported');
  else if (state.disconnected) out.textContent = text('disconnected');
  else out.textContent = text('active');
}

function render() {
  $('consent-status').textContent = state.alphaConsentAcknowledged
    ? 'ALPHA_CONSENT_REFERENCE_ACKNOWLEDGED'
    : 'HELD_ALPHA_CONSENT_NOT_ACKNOWLEDGED';

  $('invitation').value = state.invitation;
  $('invitation-status').textContent = invitationHeld() ? `HELD_${state.invitation}` : state.invitation;

  $('decision').value = state.decision;
  if (state.withdrawn) $('decision-status').textContent = 'HELD_PARTICIPATION_WITHDRAWN';
  else if (state.revoked) $('decision-status').textContent = 'HELD_INVITATION_OR_SESSION_REVOKED';
  else if (invitationHeld()) $('decision-status').textContent = `HELD_${state.invitation}`;
  else $('decision-status').textContent = state.decision;

  $('identity').value = state.identity;
  $('identity-status').textContent = state.identity === 'VERIFIED_CURRENT'
    ? 'VERIFIED_CURRENT'
    : `HELD_${state.identity}`;

  $('presence').value = state.presence;
  $('presence-status').textContent = state.presence;

  $('route').value = state.route;
  const [cost, provider] = routeMetadata(state.route);
  $('cost').textContent = cost;
  $('provider').textContent = provider;

  $('failure').value = state.failure;
  $('failure-status').textContent = state.failure === 'NONE' ? 'NONE' : `HELD_${state.failure}`;

  $('delivery').value = state.delivery;
  renderDelivery();
  renderLocale();
}

function bind() {
  $('language').addEventListener('change', (event) => {
    state.locale = event.target.value;
    renderLocale();
  });

  $('consent').addEventListener('click', () => {
    if (!state.withdrawn) state.alphaConsentAcknowledged = true;
    render();
  });

  $('invitation').addEventListener('change', (event) => {
    state.invitation = event.target.value;
    if (invitationHeld()) {
      state.decision = 'DEFER';
      state.delivery = 'NOT_CONNECTED';
    }
    render();
  });

  $('decision').addEventListener('change', (event) => {
    if (!state.withdrawn && !state.revoked && !invitationHeld()) state.decision = event.target.value;
    render();
  });

  $('identity').addEventListener('change', (event) => {
    state.identity = event.target.value;
    if (state.identity !== 'VERIFIED_CURRENT') {
      state.failure = 'IDENTITY_CHECK_FAILED';
      state.delivery = 'NOT_CONNECTED';
    } else if (state.failure === 'IDENTITY_CHECK_FAILED') {
      state.failure = 'NONE';
    }
    render();
  });

  $('presence').addEventListener('change', (event) => {
    state.presence = event.target.value;
    if (state.presence === 'UNREACHABLE_OR_LEASE_EXPIRED') {
      state.failure = 'PEER_UNREACHABLE';
      state.delivery = 'NOT_CONNECTED';
    } else if (state.failure === 'PEER_UNREACHABLE') {
      state.failure = 'NONE';
    }
    render();
  });

  $('route').addEventListener('change', (event) => {
    state.route = event.target.value;
    if (state.route === 'UNAVAILABLE') {
      state.failure = 'RELAY_UNAVAILABLE';
      state.delivery = 'NOT_CONNECTED';
    } else if (state.failure === 'RELAY_UNAVAILABLE') {
      state.failure = 'NONE';
    }
    render();
  });

  $('failure').addEventListener('change', (event) => {
    state.failure = event.target.value;
    if (state.failure !== 'NONE') state.delivery = 'NOT_CONNECTED';
    render();
  });

  $('delivery').addEventListener('change', (event) => {
    if (canAdvanceDelivery()) state.delivery = event.target.value;
    render();
  });

  $('support').addEventListener('click', () => {
    $('support-panel').hidden = !$('support-panel').hidden;
  });

  $('revoke').addEventListener('click', () => {
    state.revoked = true;
    state.invitation = 'EXPIRED_OR_REVOKED';
    state.decision = 'DEFER';
    state.delivery = 'NOT_CONNECTED';
    render();
  });

  $('withdraw').addEventListener('click', () => {
    state.withdrawn = true;
    state.delivery = 'NOT_CONNECTED';
    render();
  });

  $('export').addEventListener('click', () => {
    state.exported = true;
    renderRecovery();
  });

  $('disconnect').addEventListener('click', () => {
    state.disconnected = true;
    state.delivery = 'NOT_CONNECTED';
    render();
  });

  $('reset').addEventListener('click', () => {
    Object.assign(state, {
      alphaConsentAcknowledged: false,
      invitation: 'NONE',
      decision: 'DEFER',
      identity: 'VERIFIED_CURRENT',
      presence: 'AVAILABLE_FOR_INVITES',
      route: 'DIRECT_CANDIDATE',
      failure: 'NONE',
      delivery: 'NOT_CONNECTED',
      revoked: false,
      withdrawn: false,
      exported: false,
      disconnected: false
    });
    render();
  });
}

async function boot() {
  const response = await fetch(REGISTRY_URL, { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error('CDR S5 reference registry unavailable');
  registry = await response.json();
  setOptions('invitation', registry.invitationStates);
  setOptions('decision', registry.decisions);
  setOptions('identity', registry.identityStates);
  setOptions('presence', registry.presenceStates);
  setOptions('route', registry.routeClasses);
  setOptions('failure', registry.failureStates);
  setOptions('delivery', registry.deliveryStates);
  bind();
  render();
  document.documentElement.dataset.cdrS5Ready = 'true';
}

boot().catch((error) => {
  document.documentElement.dataset.cdrS5Ready = 'false';
  $('effect-status').textContent = `SAFE_REFERENCE_FAILURE: ${error.message}`;
});
