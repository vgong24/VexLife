export const RENDER_LAB_SCHEMA = 'vexlife.browser-render-lab/v1';
export const RENDER_LAB_HASH = '#render-lab';

const SPECIMEN_BLUEPRINTS = Object.freeze([
  Object.freeze({
    specimenRef: 'specimen.render-lab.terrain-pan',
    title: 'Terrain pan',
    purpose: 'Review direct-manipulation affordance without turning the gesture into a button or granting action authority.',
    featureRef: 'feature.vexlife.terrain',
    targetBinding: Object.freeze({
      targetRef: 'region.terrain.canvas',
      targetKind: 'REGION',
      screenRefOrNull: 'screen.vexlife.terrain',
      regionRefOrNull: 'region.terrain.canvas',
      componentRefOrNull: null,
      slotRefOrNull: null,
      instanceRefOrNull: null,
      entityRefOrNull: null,
      selectionRefOrNull: null,
      bindingPolicy: 'STATIC_CANONICAL_TARGET'
    }),
    interactionCue: Object.freeze({
      actionRefOrNull: 'action.terrain.canvas.pan',
      interactionRefOrNull: null,
      gestureRefOrNull: 'gesture.vexlife.terrain-pan',
      componentRefOrNull: null,
      slotRefOrNull: null
    }),
    formRefOrNull: null,
    expectedStateRef: 'state.terrain',
    currentStateRef: 'state.terrain',
    visualKind: 'DIRECT_MANIPULATION'
  }),
  Object.freeze({
    specimenRef: 'specimen.render-lab.instrumentation-toggle',
    title: 'Instrumentation toggle',
    purpose: 'Review a source-identified action control while keeping the element identity separate from its displayed label.',
    featureRef: 'feature.vexlife.terrain',
    targetBinding: Object.freeze({
      targetRef: 'element.terrain.instrumentation-toggle',
      targetKind: 'ELEMENT',
      screenRefOrNull: 'screen.vexlife.terrain',
      regionRefOrNull: 'region.terrain.instrumentation',
      componentRefOrNull: null,
      slotRefOrNull: null,
      instanceRefOrNull: null,
      entityRefOrNull: null,
      selectionRefOrNull: null,
      bindingPolicy: 'STATIC_CANONICAL_TARGET'
    }),
    interactionCue: Object.freeze({
      actionRefOrNull: 'action.terrain.instrumentation.toggle',
      interactionRefOrNull: null,
      gestureRefOrNull: null,
      componentRefOrNull: null,
      slotRefOrNull: null
    }),
    formRefOrNull: 'form.vexlife.human.button',
    expectedStateRef: 'state.terrain',
    currentStateRef: 'state.terrain',
    visualKind: 'ACTION_CONTROL'
  }),
  Object.freeze({
    specimenRef: 'specimen.render-lab.manual-layout-toggle',
    title: 'Manual layout toggle',
    purpose: 'Review available, held and unavailable visual treatment over one stable semantic action identity.',
    featureRef: 'feature.vexlife.terrain',
    targetBinding: Object.freeze({
      targetRef: 'element.terrain.manual-layout-toggle',
      targetKind: 'ELEMENT',
      screenRefOrNull: 'screen.vexlife.terrain',
      regionRefOrNull: 'region.terrain.instrumentation',
      componentRefOrNull: null,
      slotRefOrNull: null,
      instanceRefOrNull: null,
      entityRefOrNull: null,
      selectionRefOrNull: null,
      bindingPolicy: 'STATIC_CANONICAL_TARGET'
    }),
    interactionCue: Object.freeze({
      actionRefOrNull: 'action.terrain.manual-layout.toggle',
      interactionRefOrNull: null,
      gestureRefOrNull: null,
      componentRefOrNull: null,
      slotRefOrNull: null
    }),
    formRefOrNull: 'form.vexlife.human.button',
    expectedStateRef: 'state.terrain',
    currentStateRef: 'state.terrain',
    visualKind: 'STATE_VARIANTS'
  })
]);

const RENDER_LAB_BOUNDARIES = Object.freeze([
  'RENDER_LAB != CANONICAL_REGISTRY',
  'RENDER_LAB != PRODUCT_STATE_OWNER',
  'RENDER_LAB != ACTION_AUTHORITY',
  'RENDER_LAB_SPECIMEN != LIVE_PRODUCT_EFFECT',
  'GUIDANCE_TARGET != DOM_ID',
  'ELEMENT_REF != INSTANCE_REF',
  'ENTITY_REF != DISPLAY_LABEL',
  'DISPLAY_TEXT != AUTOMATION_IDENTITY',
  'GESTURE != BUTTON',
  'DIRECT_MANIPULATION != BUTTON'
]);

function requiredString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function asArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function cloneRecord(value) {
  if (Array.isArray(value)) return value.map(cloneRecord);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneRecord(child)]));
  return value;
}

function lookupFeature(featureRegistry, featureRef) {
  const feature = asArray(featureRegistry.features, 'featureRegistry.features').find((entry) => entry?.featureRef === featureRef);
  if (!feature) throw new Error(`Render Lab requires canonical feature ${featureRef}`);
  return feature;
}

function validateTargetBinding(binding, experienceGuidance, feature) {
  requiredString(binding.targetRef, 'targetBinding.targetRef');
  requiredString(binding.targetKind, 'targetBinding.targetKind');
  requiredString(binding.bindingPolicy, 'targetBinding.bindingPolicy');
  if (!asArray(experienceGuidance.targetBinding?.targetKinds, 'experienceGuidance.targetBinding.targetKinds').includes(binding.targetKind)) {
    throw new Error(`Render Lab target kind is not accepted by Experience Guidance: ${binding.targetKind}`);
  }
  if (!asArray(experienceGuidance.targetBinding?.bindingPolicies, 'experienceGuidance.targetBinding.bindingPolicies').includes(binding.bindingPolicy)) {
    throw new Error(`Render Lab binding policy is not accepted by Experience Guidance: ${binding.bindingPolicy}`);
  }
  const canonicalRefs = new Set(feature.canonicalNodeRefs ?? []);
  for (const ref of [binding.targetRef, binding.screenRefOrNull, binding.regionRefOrNull].filter(Boolean)) {
    if (!canonicalRefs.has(ref)) throw new Error(`Render Lab target ref is not canonical for ${feature.featureRef}: ${ref}`);
  }
  if (binding.instanceRefOrNull !== null && typeof binding.instanceRefOrNull !== 'string') throw new Error('Render Lab instanceRefOrNull must be null or string');
  if (binding.entityRefOrNull !== null && typeof binding.entityRefOrNull !== 'string') throw new Error('Render Lab entityRefOrNull must be null or string');
}

function validateInteractionCue(cue, experienceRegistry, experienceGuidance, feature) {
  const allowedFields = new Set(experienceGuidance.interactionCue?.referenceFields ?? []);
  for (const field of ['actionRefOrNull', 'interactionRefOrNull', 'gestureRefOrNull', 'componentRefOrNull', 'slotRefOrNull']) {
    if (!allowedFields.has(field)) throw new Error(`Render Lab requires accepted InteractionCue field ${field}`);
  }
  if (cue.actionRefOrNull && !asArray(feature.actionRefs ?? [], 'feature.actionRefs').includes(cue.actionRefOrNull)) {
    throw new Error(`Render Lab action ref is not canonical for ${feature.featureRef}: ${cue.actionRefOrNull}`);
  }
  if (cue.gestureRefOrNull) {
    const gesture = asArray(experienceRegistry.gestureContracts, 'experienceRegistry.gestureContracts')
      .find((entry) => entry?.gestureRef === cue.gestureRefOrNull);
    if (!gesture) throw new Error(`Render Lab gesture ref is not canonical: ${cue.gestureRefOrNull}`);
    if (gesture.resultActionRef !== cue.actionRefOrNull) {
      throw new Error(`Render Lab gesture/action mismatch: ${cue.gestureRefOrNull} -> ${gesture.resultActionRef}`);
    }
  }
}

function validateForm(formRefOrNull, experienceFoundation) {
  if (formRefOrNull === null) return;
  if (!asArray(experienceFoundation.interactionForms, 'experienceFoundation.interactionForms')
    .some((entry) => entry?.formRef === formRefOrNull)) {
    throw new Error(`Render Lab form ref is not canonical: ${formRefOrNull}`);
  }
}

function projectTokenGroup(value, groupRef) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Render Lab token group missing: ${groupRef}`);
  return Object.entries(value).map(([tokenRef, tokenValue]) => ({ tokenRef: `${groupRef}.${tokenRef}`, tokenValue }));
}

export function buildRenderLabProjection({
  featureRegistry,
  experienceRegistry,
  experienceFoundation,
  experienceGuidance,
  designTokens
}) {
  if (featureRegistry?.schemaVersion !== 'vexlife.feature-registry/v0') throw new Error('Render Lab requires the accepted feature registry schema');
  if (experienceRegistry?.schemaVersion !== 'vexlife.experience-registry/v0') throw new Error('Render Lab requires the accepted experience registry schema');
  if (experienceFoundation?.schemaVersion !== 'vexlife.experience-foundation/v1') throw new Error('Render Lab requires the accepted Experience Foundation schema');
  if (experienceGuidance?.schemaVersion !== 'vexlife.experience-guidance/v1') throw new Error('Render Lab requires the accepted Experience Guidance schema');
  if (designTokens?.schemaVersion !== 'vexlife.design-tokens/v0') throw new Error('Render Lab requires the accepted design token schema');
  if (experienceFoundation.parentExperienceRegistryRef !== experienceRegistry.registryRef) throw new Error('Render Lab Experience Foundation is not bound to the supplied experience registry');
  if (experienceGuidance.parentExperienceFoundationRef !== experienceFoundation.foundationRef) throw new Error('Render Lab Experience Guidance is not bound to the supplied Experience Foundation');
  if (experienceGuidance.featurePerceptibilityOwnerRef !== featureRegistry.registryRef) throw new Error('Render Lab Experience Guidance is not bound to the supplied feature registry');
  if (experienceFoundation.effects !== false || experienceGuidance.effects !== false) throw new Error('Render Lab refuses effect-bearing Experience sources');

  const specimens = SPECIMEN_BLUEPRINTS.map((blueprint) => {
    const feature = lookupFeature(featureRegistry, blueprint.featureRef);
    validateTargetBinding(blueprint.targetBinding, experienceGuidance, feature);
    validateInteractionCue(blueprint.interactionCue, experienceRegistry, experienceGuidance, feature);
    validateForm(blueprint.formRefOrNull, experienceFoundation);
    if (!asArray(feature.stateRefs ?? [], 'feature.stateRefs').includes(blueprint.expectedStateRef)) {
      throw new Error(`Render Lab expected state ref is not canonical for ${feature.featureRef}: ${blueprint.expectedStateRef}`);
    }
    if (!asArray(feature.stateRefs ?? [], 'feature.stateRefs').includes(blueprint.currentStateRef)) {
      throw new Error(`Render Lab current state ref is not canonical for ${feature.featureRef}: ${blueprint.currentStateRef}`);
    }
    return cloneRecord(blueprint);
  });

  const availabilityStates = asArray(experienceFoundation.availabilityStates, 'experienceFoundation.availabilityStates')
    .map((entry) => ({
      availabilityRef: requiredString(entry.availabilityRef, 'availability.availabilityRef'),
      availabilityState: requiredString(entry.availabilityState, 'availability.availabilityState'),
      operable: entry.operable === true,
      reasonRequired: entry.reasonRequired === true
    }));

  return deepFreeze({
    schemaVersion: RENDER_LAB_SCHEMA,
    truthClass: 'SOURCE_BOUND_MOCK_VISUAL_SPECIMEN_PROJECTION',
    effects: false,
    mockOnly: true,
    authorityGranted: false,
    canonicalRegistryCreated: false,
    automationIdentityCreated: false,
    sourceRefs: {
      featureRegistryRef: featureRegistry.registryRef,
      experienceRegistryRef: experienceRegistry.registryRef,
      experienceFoundationRef: experienceFoundation.foundationRef,
      experienceGuidanceRef: experienceGuidance.guidanceRef,
      tokenSetRef: designTokens.tokenSetRef
    },
    tokenGroups: {
      color: projectTokenGroup(designTokens.color, 'color'),
      typography: projectTokenGroup(designTokens.typography, 'typography'),
      space: projectTokenGroup(designTokens.space, 'space'),
      radius: projectTokenGroup(designTokens.radius, 'radius')
    },
    availabilityStates,
    specimens,
    boundaries: [...RENDER_LAB_BOUNDARIES]
  });
}

export function renderLabSpecimenMatchesQuery(specimen, query) {
  const normalized = String(query ?? '').trim().toLowerCase();
  if (!normalized) return true;
  return JSON.stringify(specimen).toLowerCase().includes(normalized);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

function refRow(label, value) {
  if (!value) return '';
  return `<dt>${escapeHtml(label)}</dt><dd><code>${escapeHtml(value)}</code></dd>`;
}

function specimenMarkup(specimen) {
  const binding = specimen.targetBinding;
  const cue = specimen.interactionCue;
  const identityAttributes = [
    ['data-render-lab-target-ref', binding.targetRef],
    ['data-render-lab-screen-ref', binding.screenRefOrNull],
    ['data-render-lab-region-ref', binding.regionRefOrNull],
    ['data-render-lab-component-ref', binding.componentRefOrNull],
    ['data-render-lab-instance-ref', binding.instanceRefOrNull],
    ['data-render-lab-action-ref', cue.actionRefOrNull],
    ['data-render-lab-interaction-ref', cue.interactionRefOrNull],
    ['data-render-lab-gesture-ref', cue.gestureRefOrNull],
    ['data-render-lab-expected-state-ref', specimen.expectedStateRef],
    ['data-render-lab-current-state-ref', specimen.currentStateRef]
  ].filter(([, value]) => value).map(([name, value]) => `${name}="${escapeHtml(value)}"`).join(' ');
  const direct = specimen.visualKind === 'DIRECT_MANIPULATION';
  const visual = direct
    ? `<div class="e30-direct-manipulation" aria-label="Static visual specimen for Terrain pan"><span>Blank Terrain canvas</span><span class="e30-pan-vector" aria-hidden="true">↔ ↕</span></div>`
    : `<div class="e30-control-specimen" aria-label="Static visual specimen for ${escapeHtml(specimen.title)}"><span>${escapeHtml(specimen.title)}</span><span class="e30-control-indicator" aria-hidden="true"></span></div>`;
  return `<article class="e30-specimen" data-render-lab-search="${escapeHtml(JSON.stringify(specimen).toLowerCase())}" ${identityAttributes}>
    <header><small>${escapeHtml(specimen.visualKind.replaceAll('_', ' '))}</small><h3>${escapeHtml(specimen.title)}</h3><p>${escapeHtml(specimen.purpose)}</p></header>
    ${visual}
    <dl>
      ${refRow('Target', binding.targetRef)}
      ${refRow('Screen', binding.screenRefOrNull)}
      ${refRow('Region', binding.regionRefOrNull)}
      ${refRow('Component', binding.componentRefOrNull)}
      ${refRow('Instance', binding.instanceRefOrNull)}
      ${refRow('Action', cue.actionRefOrNull)}
      ${refRow('Interaction', cue.interactionRefOrNull)}
      ${refRow('Gesture', cue.gestureRefOrNull)}
      ${refRow('Expected state owner', specimen.expectedStateRef)}
      ${refRow('Current state owner', specimen.currentStateRef)}
      ${refRow('Form', specimen.formRefOrNull)}
    </dl>
    <p class="e30-specimen-note">Static review object only. The visible mock does not execute the referenced action.</p>
  </article>`;
}

function tokenMarkup(projection) {
  const colors = projection.tokenGroups.color.map(({ tokenRef, tokenValue }) => `<div class="e30-token"><span class="e30-swatch" style="--e30-swatch:${escapeHtml(tokenValue)}"></span><code>${escapeHtml(tokenRef)}</code><small>${escapeHtml(tokenValue)}</small></div>`).join('');
  const metrics = [...projection.tokenGroups.typography, ...projection.tokenGroups.space, ...projection.tokenGroups.radius]
    .map(({ tokenRef, tokenValue }) => `<div class="e30-metric"><code>${escapeHtml(tokenRef)}</code><strong>${escapeHtml(tokenValue)}</strong></div>`).join('');
  return `<div class="e30-token-grid">${colors}</div><div class="e30-metric-grid">${metrics}</div>`;
}

function availabilityMarkup(projection) {
  return projection.availabilityStates.map((state) => `<div class="e30-state e30-state-${escapeHtml(state.availabilityState.toLowerCase())}">
    <strong>${escapeHtml(state.availabilityState)}</strong><code>${escapeHtml(state.availabilityRef)}</code>
    <small>${state.operable ? 'operable' : 'not operable'}${state.reasonRequired ? ' · reason required' : ''}</small>
  </div>`).join('');
}

function renderLabMarkup(projection) {
  return `<header class="e30-render-lab-head">
      <div><small>UX REVIEW · SOURCE-BOUND MOCKS</small><h2 id="renderLabTitle">Render Lab</h2>
      <p>Inspect visual tokens, semantic target bindings and interaction-state specimens without creating product truth or executing product actions.</p></div>
      <button id="renderLabClose" type="button" aria-label="Close Render Lab">×</button>
    </header>
    <div class="e30-boundary" role="note"><strong>Mock-only:</strong> stable refs come from accepted Experience/Feature sources. DOM ids and display text remain implementation details, never automation identity.</div>
    <label class="e30-search"><span>Filter specimens</span><input id="renderLabSearch" type="search" placeholder="Terrain, gesture, action, state…" autocomplete="off"></label>
    <output id="renderLabMatchCount" class="e30-match" aria-live="polite"></output>
    <section><h3>Design tokens</h3><p>Current accepted token values from <code>${escapeHtml(projection.sourceRefs.tokenSetRef)}</code>.</p>${tokenMarkup(projection)}</section>
    <section><h3>Availability states</h3><p>Visual-state vocabulary projected from Experience Foundation; these cards do not claim current product availability.</p><div class="e30-state-grid">${availabilityMarkup(projection)}</div></section>
    <section><h3>Semantic specimens</h3><p>Canonical target/action/gesture refs are carried as source-bound data attributes; the mock visuals remain inert.</p><div class="e30-specimen-grid">${projection.specimens.map(specimenMarkup).join('')}</div></section>
    <section><h3>Permanent boundaries</h3><div class="e30-boundaries">${projection.boundaries.map((rule) => `<code>${escapeHtml(rule)}</code>`).join('')}</div></section>`;
}

function ensureStylesheet(documentRef) {
  if (documentRef.querySelector('#renderLabStyles')) return;
  const link = documentRef.createElement('link');
  link.id = 'renderLabStyles';
  link.rel = 'stylesheet';
  link.href = './render-lab.css';
  documentRef.head.append(link);
}

export function createRenderLabController({
  featureRegistry,
  experienceRegistry,
  experienceFoundation,
  experienceGuidance,
  designTokens,
  documentRef = globalThis.document,
  windowRef = globalThis
} = {}) {
  const projection = buildRenderLabProjection({ featureRegistry, experienceRegistry, experienceFoundation, experienceGuidance, designTokens });
  let openButton = null;
  let drawer = null;
  let priorFocus = null;
  let bound = false;

  function visible() {
    return Boolean(drawer && !drawer.hidden);
  }

  function applyFilter(query = '') {
    if (!drawer) return 0;
    const specimens = [...drawer.querySelectorAll('[data-render-lab-search]')];
    let matches = 0;
    for (const specimen of specimens) {
      const match = renderLabSpecimenMatchesQuery(specimen.dataset.renderLabSearch ?? '', query);
      specimen.hidden = !match;
      if (match) matches += 1;
    }
    const output = drawer.querySelector('#renderLabMatchCount');
    if (output) output.textContent = `${matches} visible specimens`;
    return matches;
  }

  function setHash(open) {
    if (!windowRef?.history?.replaceState || !windowRef?.location) return;
    const url = new URL(windowRef.location.href);
    url.hash = open ? RENDER_LAB_HASH : '';
    windowRef.history.replaceState(windowRef.history.state, '', url);
  }

  function open({ updateHash = true } = {}) {
    if (!drawer) return false;
    priorFocus = documentRef.activeElement;
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    documentRef.body.dataset.renderLabOpen = 'true';
    const menu = documentRef.querySelector('#surfaceMenu');
    if (menu) menu.hidden = true;
    const menuButton = documentRef.querySelector('#surfaceMenuButton');
    if (menuButton) menuButton.setAttribute('aria-expanded', 'false');
    if (updateHash) setHash(true);
    drawer.querySelector('#renderLabSearch')?.focus();
    return true;
  }

  function close({ updateHash = true, restoreFocus = true } = {}) {
    if (!drawer) return false;
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    delete documentRef.body.dataset.renderLabOpen;
    if (updateHash && windowRef?.location?.hash === RENDER_LAB_HASH) setHash(false);
    if (restoreFocus && priorFocus && typeof priorFocus.focus === 'function') priorFocus.focus();
    priorFocus = null;
    return true;
  }

  function syncHash() {
    if (windowRef?.location?.hash === RENDER_LAB_HASH) open({ updateHash: false });
    else if (visible()) close({ updateHash: false, restoreFocus: false });
  }

  function bind() {
    if (bound) return snapshot();
    if (!documentRef?.body) throw new Error('Render Lab requires a browser document');
    const surfaceMenu = documentRef.querySelector('#surfaceMenu');
    const app = documentRef.querySelector('#app');
    if (!surfaceMenu || !app) throw new Error('Render Lab requires the accepted browser shell');
    ensureStylesheet(documentRef);

    openButton = documentRef.createElement('button');
    openButton.id = 'openRenderLab';
    openButton.type = 'button';
    openButton.textContent = 'Render Lab';
    openButton.dataset.renderLabUtility = 'true';
    const before = documentRef.querySelector('#terrainCenter');
    surfaceMenu.insertBefore(openButton, before ?? null);

    drawer = documentRef.createElement('aside');
    drawer.id = 'renderLab';
    drawer.className = 'e30-render-lab scroll-scope';
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('aria-labelledby', 'renderLabTitle');
    drawer.innerHTML = renderLabMarkup(projection);
    app.append(drawer);

    openButton.addEventListener('click', () => open());
    drawer.querySelector('#renderLabClose')?.addEventListener('click', () => close());
    drawer.querySelector('#renderLabSearch')?.addEventListener('input', (event) => applyFilter(event.currentTarget.value));
    windowRef.addEventListener?.('hashchange', syncHash);
    windowRef.addEventListener?.('keydown', (event) => {
      if (event.key !== 'Escape' || !visible()) return;
      event.preventDefault();
      event.stopImmediatePropagation?.();
      close();
    });
    applyFilter('');
    bound = true;
    syncHash();
    return snapshot();
  }

  function snapshot() {
    return Object.freeze({
      schemaVersion: RENDER_LAB_SCHEMA,
      bound,
      visible: visible(),
      hashEntry: RENDER_LAB_HASH,
      effects: false,
      mockOnly: true,
      authorityGranted: false,
      specimenCount: projection.specimens.length
    });
  }

  return Object.freeze({ projection, bind, open, close, visible, applyFilter, snapshot });
}

export { RENDER_LAB_BOUNDARIES, SPECIMEN_BLUEPRINTS };
