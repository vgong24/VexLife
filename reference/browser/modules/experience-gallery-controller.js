export const EXPERIENCE_GALLERY_SCHEMA = 'vexlife.browser-experience-gallery/v1';
export const EXPERIENCE_GALLERY_HASH = '#experience-gallery';

const ACCEPTED_PROJECTION_SURFACES = Object.freeze([
  Object.freeze({
    projectionRef: 'projection.gallery.experience-guidance-owner',
    title: 'Experience Guidance',
    kind: 'GUIDANCE_OWNER',
    sourcePath: 'src/core/experience-guidance.mjs',
    proofPath: 'test/experience-guidance.test.mjs',
    purpose: 'Forms source-bound guidance proposals, target bindings, placement, Help sections and InteractionCue contracts.'
  }),
  Object.freeze({
    projectionRef: 'projection.gallery.human-help',
    title: 'Browser Human Help',
    kind: 'HUMAN_PROJECTION',
    sourcePath: 'reference/browser/modules/experience-guidance-human-projection.js',
    proofPath: 'test/experience-guidance-human-projection.test.mjs',
    purpose: 'Projects accepted guidance into visible and nonvisual browser Help without becoming a second semantic owner.'
  }),
  Object.freeze({
    projectionRef: 'projection.gallery.devex-guidance',
    title: 'Vex / Devex Guidance',
    kind: 'DEVEX_PROJECTION',
    sourcePath: 'src/core/devex-guidance-projection.mjs',
    proofPath: 'test/experience-guidance-devex-perception.test.mjs',
    purpose: 'Projects current Help and bounded self-capability truth for Vex/Devex without granting command or action authority.'
  }),
  Object.freeze({
    projectionRef: 'projection.gallery.typed-command',
    title: 'Typed Command Projection',
    kind: 'COMMAND_PROJECTION',
    sourcePath: 'src/core/experience-command-projection.mjs',
    proofPath: 'test/experience-command-projection.test.mjs',
    purpose: 'Resolves external typed-command classifier receipts to accepted CommandBinding identity while keeping recognition distinct from execution.'
  }),
  Object.freeze({
    projectionRef: 'projection.gallery.self-capability-frame',
    title: 'Vex Self-Capability Frame',
    kind: 'CAPABILITY_FRAME',
    sourcePath: 'src/core/vex-self-capability-frame.mjs',
    proofPath: 'test/vex-self-capability-frame.test.mjs',
    purpose: 'Projects source-bound available, held, unavailable and unknown capability truth without inventing authority.'
  })
]);

const GALLERY_BOUNDARIES = Object.freeze([
  'GALLERY != CANONICAL_REGISTRY',
  'COMPONENT != FEATURE',
  'EXPERIENCE_PATTERN != FEATURE',
  'PROJECTION != CANONICAL_MEANING',
  'DISCOVERABLE != AVAILABLE',
  'AVAILABLE != AUTHORITY',
  'GUIDANCE_RELEVANCE != COMMAND_PERMISSION',
  'INTERACTION_CUE != ACTION_AUTHORITY'
]);

function asArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function cloneStrings(value) {
  return asArray(value ?? [], 'reference list').filter((item) => typeof item === 'string').map(String);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function byRef(left, right) {
  const a = left.featureRef ?? left.patternRef ?? left.formRef ?? left.commandRef ?? left.projectionRef ?? '';
  const b = right.featureRef ?? right.patternRef ?? right.formRef ?? right.commandRef ?? right.projectionRef ?? '';
  return a.localeCompare(b, 'en');
}

function projectFeature(feature) {
  requiredString(feature?.featureRef, 'feature.featureRef');
  requiredString(feature?.purpose, `feature ${feature.featureRef} purpose`);
  requiredString(feature?.status, `feature ${feature.featureRef} status`);
  const humanIntroduction = feature.humanIntroduction && typeof feature.humanIntroduction === 'object'
    ? {
        disposition: feature.humanIntroduction.disposition ?? null,
        routeState: feature.humanIntroduction.routeState ?? null,
        rationale: feature.humanIntroduction.rationale ?? null
      }
    : { disposition: null, routeState: null, rationale: null };
  return {
    featureRef: feature.featureRef,
    purpose: feature.purpose,
    status: feature.status,
    humanIntroduction,
    canonicalNodeRefs: cloneStrings(feature.canonicalNodeRefs),
    actionRefs: cloneStrings(feature.actionRefs),
    moduleRefs: cloneStrings(feature.moduleRefs),
    testRefs: cloneStrings(feature.testRefs),
    platformRefs: cloneStrings(feature.platformRefs),
    projectionRefs: cloneStrings(feature.projectionRefs),
    resourceClass: feature.resourceClass ?? null,
    dataClass: feature.dataClass ?? null,
    effectClass: feature.effectClass ?? null,
    concurrencyClass: feature.concurrencyClass ?? null
  };
}

function projectPattern(pattern) {
  requiredString(pattern?.patternRef, 'pattern.patternRef');
  return {
    patternRef: pattern.patternRef,
    patternKind: pattern.patternKind ?? null,
    purpose: pattern.purpose ?? null,
    formRefs: cloneStrings(pattern.formRefs),
    defaultExposureRef: pattern.defaultExposureRef ?? null
  };
}

function projectForm(form) {
  requiredString(form?.formRef, 'form.formRef');
  return {
    formRef: form.formRef,
    formKind: form.formKind ?? null,
    consumerClass: form.consumerClass ?? null,
    platformRefs: cloneStrings(form.platformRefs),
    purpose: form.purpose ?? null
  };
}

function projectCommand(command) {
  requiredString(command?.commandRef, 'command.commandRef');
  return {
    commandRef: command.commandRef,
    purpose: command.purpose ?? null,
    capabilityRef: command.capabilityRef ?? null,
    actionRefOrNull: command.actionRefOrNull ?? null,
    processRefOrNull: command.processRefOrNull ?? null,
    aliases: asArray(command.aliases ?? [], 'command.aliases').map((alias) => ({
      literal: alias?.literal ?? null,
      formRef: alias?.formRef ?? null
    }))
  };
}

export function buildExperienceGalleryProjection({
  featureRegistry,
  experienceRegistry,
  experienceFoundation,
  experienceGuidance
}) {
  if (featureRegistry?.schemaVersion !== 'vexlife.feature-registry/v0') {
    throw new Error('Experience Gallery requires the accepted feature registry schema');
  }
  if (experienceRegistry?.schemaVersion !== 'vexlife.experience-registry/v0') {
    throw new Error('Experience Gallery requires the accepted experience registry schema');
  }
  if (experienceFoundation?.schemaVersion !== 'vexlife.experience-foundation/v1') {
    throw new Error('Experience Gallery requires the accepted Experience Foundation schema');
  }
  if (experienceGuidance?.schemaVersion !== 'vexlife.experience-guidance/v1') {
    throw new Error('Experience Gallery requires the accepted Experience Guidance schema');
  }
  if (experienceFoundation.parentExperienceRegistryRef !== experienceRegistry.registryRef) {
    throw new Error('Experience Foundation is not bound to the supplied experience registry');
  }
  if (experienceGuidance.parentExperienceFoundationRef !== experienceFoundation.foundationRef) {
    throw new Error('Experience Guidance is not bound to the supplied Experience Foundation');
  }
  if (experienceGuidance.featurePerceptibilityOwnerRef !== featureRegistry.registryRef) {
    throw new Error('Experience Guidance is not bound to the supplied feature registry');
  }
  if (experienceFoundation.effects !== false || experienceGuidance.effects !== false) {
    throw new Error('Experience Gallery refuses effect-bearing Experience sources');
  }

  const productFeatures = asArray(featureRegistry.features, 'featureRegistry.features').map(projectFeature).sort(byRef);
  const experiencePatterns = asArray(experienceFoundation.experiencePatterns, 'experienceFoundation.experiencePatterns').map(projectPattern).sort(byRef);
  const interactionForms = asArray(experienceFoundation.interactionForms, 'experienceFoundation.interactionForms').map(projectForm).sort(byRef);
  const commandBindings = asArray(experienceFoundation.commandBindings, 'experienceFoundation.commandBindings').map(projectCommand).sort(byRef);
  const statusCounts = Object.fromEntries(
    [...new Set(productFeatures.map((feature) => feature.status))].sort().map((status) => [
      status,
      productFeatures.filter((feature) => feature.status === status).length
    ])
  );

  return deepFreeze({
    schemaVersion: EXPERIENCE_GALLERY_SCHEMA,
    truthClass: 'SOURCE_BOUND_BROWSER_REFERENCE_VISIBILITY_PROJECTION',
    effects: false,
    authorityGranted: false,
    canonicalRegistryCreated: false,
    sourceRefs: {
      featureRegistryRef: featureRegistry.registryRef,
      experienceRegistryRef: experienceRegistry.registryRef,
      experienceFoundationRef: experienceFoundation.foundationRef,
      experienceGuidanceRef: experienceGuidance.guidanceRef
    },
    summary: {
      productFeatureCount: productFeatures.length,
      experiencePatternCount: experiencePatterns.length,
      interactionFormCount: interactionForms.length,
      commandBindingCount: commandBindings.length,
      acceptedProjectionSurfaceCount: ACCEPTED_PROJECTION_SURFACES.length,
      statusCounts
    },
    productFeatures,
    experiencePatterns,
    interactionForms,
    commandBindings,
    guidance: {
      helpSectionKinds: cloneStrings(experienceGuidance.help?.sectionKinds),
      presentationKinds: cloneStrings(experienceGuidance.placement?.presentationKinds),
      interactionCueFamilies: cloneStrings(experienceGuidance.interactionCue?.candidateFamilies),
      nonCollapseRules: cloneStrings(experienceGuidance.nonCollapseRules)
    },
    acceptedProjectionSurfaces: ACCEPTED_PROJECTION_SURFACES.map((entry) => ({ ...entry })),
    boundaries: [...GALLERY_BOUNDARIES]
  });
}

export function humanizeGalleryRef(value) {
  const tail = String(value ?? '').split('.').at(-1) || String(value ?? '');
  return tail.replace(/[-_]+/gu, ' ').replace(/\b[a-z]/gu, (letter) => letter.toUpperCase());
}

export function galleryEntryMatchesQuery(entry, query) {
  const normalized = String(query ?? '').trim().toLowerCase();
  if (!normalized) return true;
  return JSON.stringify(entry).toLowerCase().includes(normalized);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

function refsMarkup(label, refs) {
  if (!refs?.length) return '';
  return `<div class="e29-gallery-refs"><strong>${escapeHtml(label)}</strong><div>${refs.map((ref) => `<code>${escapeHtml(ref)}</code>`).join('')}</div></div>`;
}

function featureMarkup(feature) {
  const title = humanizeGalleryRef(feature.featureRef);
  const search = escapeHtml(JSON.stringify(feature).toLowerCase());
  return `<details class="e29-gallery-card" data-gallery-kind="feature" data-gallery-search="${search}">
    <summary><span><small>PRODUCT FEATURE</small><strong>${escapeHtml(title)}</strong></span><span class="e29-gallery-status">${escapeHtml(feature.status)}</span></summary>
    <p>${escapeHtml(feature.purpose)}</p>
    <dl>
      <dt>Feature ref</dt><dd><code>${escapeHtml(feature.featureRef)}</code></dd>
      <dt>Introduction</dt><dd>${escapeHtml(feature.humanIntroduction.disposition ?? 'UNSPECIFIED')} · ${escapeHtml(feature.humanIntroduction.routeState ?? 'UNKNOWN')}</dd>
      <dt>Effect class</dt><dd>${escapeHtml(feature.effectClass ?? 'UNSPECIFIED')}</dd>
    </dl>
    ${feature.humanIntroduction.rationale ? `<p class="e29-gallery-note">${escapeHtml(feature.humanIntroduction.rationale)}</p>` : ''}
    ${refsMarkup('Canonical nodes', feature.canonicalNodeRefs)}
    ${refsMarkup('Actions', feature.actionRefs)}
    ${refsMarkup('Projections', feature.projectionRefs)}
    ${refsMarkup('Modules', feature.moduleRefs)}
    ${refsMarkup('Proof', feature.testRefs)}
    ${refsMarkup('Platforms', feature.platformRefs)}
  </details>`;
}

function simpleCardMarkup(kind, title, ref, purpose, extra = '') {
  const search = escapeHtml(`${kind} ${title} ${ref} ${purpose} ${extra}`.toLowerCase());
  return `<details class="e29-gallery-card" data-gallery-kind="${escapeHtml(kind.toLowerCase())}" data-gallery-search="${search}">
    <summary><span><small>${escapeHtml(kind)}</small><strong>${escapeHtml(title)}</strong></span></summary>
    ${purpose ? `<p>${escapeHtml(purpose)}</p>` : ''}
    <code>${escapeHtml(ref)}</code>${extra}
  </details>`;
}

function foundationMarkup(projection) {
  const patterns = projection.experiencePatterns.map((item) => simpleCardMarkup(
    'EXPERIENCE PATTERN', item.patternKind ?? humanizeGalleryRef(item.patternRef), item.patternRef, item.purpose,
    refsMarkup('Forms', item.formRefs)
  )).join('');
  const forms = projection.interactionForms.map((item) => simpleCardMarkup(
    'INTERACTION FORM', item.formKind ?? humanizeGalleryRef(item.formRef), item.formRef, item.purpose,
    refsMarkup('Platforms', item.platformRefs)
  )).join('');
  const commands = projection.commandBindings.map((item) => {
    const aliases = item.aliases.map((alias) => alias.literal).filter(Boolean);
    const extra = `${refsMarkup('Aliases', aliases)}${refsMarkup('Capability', item.capabilityRef ? [item.capabilityRef] : [])}<p class="e29-gallery-note">Command identity is descriptive here; this Gallery grants no execution authority.</p>`;
    return simpleCardMarkup('COMMAND BINDING', humanizeGalleryRef(item.commandRef), item.commandRef, item.purpose, extra);
  }).join('');
  return { patterns, forms, commands };
}

function guidanceMarkup(projection) {
  const groups = [
    ['HELP SECTION', projection.guidance.helpSectionKinds],
    ['GUIDANCE PRESENTATION', projection.guidance.presentationKinds],
    ['INTERACTION CUE FAMILY', projection.guidance.interactionCueFamilies]
  ];
  return groups.flatMap(([kind, refs]) => refs.map((ref) => simpleCardMarkup(kind, humanizeGalleryRef(ref), ref, null))).join('');
}

function projectionSurfaceMarkup(surface) {
  const sourceHref = `/${surface.sourcePath}`;
  const proofHref = `/${surface.proofPath}`;
  const extra = `<div class="e29-gallery-links"><a href="${escapeHtml(sourceHref)}" target="_blank" rel="noreferrer">Source</a><a href="${escapeHtml(proofHref)}" target="_blank" rel="noreferrer">Proof</a></div><p class="e29-gallery-note">Visibility link only; this surface does not become a new product feature or authority owner.</p>`;
  return simpleCardMarkup(surface.kind, surface.title, surface.projectionRef, surface.purpose, extra);
}

function ensureStylesheet(documentRef) {
  if (documentRef.querySelector('#experienceGalleryStyles')) return;
  const link = documentRef.createElement('link');
  link.id = 'experienceGalleryStyles';
  link.rel = 'stylesheet';
  link.href = './experience-gallery.css';
  documentRef.head.append(link);
}

function galleryMarkup(projection) {
  const foundation = foundationMarkup(projection);
  const status = Object.entries(projection.summary.statusCounts).map(([key, value]) => `<span><strong>${value}</strong> ${escapeHtml(key)}</span>`).join('');
  return `<header class="e29-gallery-head">
      <div><small>UX VISIBILITY · SOURCE-BOUND REFERENCE</small><h2 id="experienceGalleryTitle">Experience Gallery</h2>
      <p>See what VexLife has registered and which reusable Experience pieces are available to consumers. This view is a projection, never a second source of truth.</p></div>
      <button id="experienceGalleryClose" type="button" aria-label="Close Experience Gallery">×</button>
    </header>
    <div class="e29-gallery-boundary" role="note"><strong>No authority upgrade:</strong> discoverable ≠ available ≠ permitted. Guidance, commands and projections remain descriptive here.</div>
    <div class="e29-gallery-summary">
      <span><strong>${projection.summary.productFeatureCount}</strong> product features</span>
      <span><strong>${projection.summary.experiencePatternCount}</strong> patterns</span>
      <span><strong>${projection.summary.interactionFormCount}</strong> forms</span>
      <span><strong>${projection.summary.commandBindingCount}</strong> commands</span>${status}
    </div>
    <label class="e29-gallery-search"><span>Search the gallery</span><input id="experienceGallerySearch" type="search" placeholder="feature, command, Terrain, Help, projection…" autocomplete="off"></label>
    <nav class="e29-gallery-jump" aria-label="Experience Gallery sections">
      <a href="#gallery-product-features">Features</a><a href="#gallery-patterns">Patterns</a><a href="#gallery-forms">Forms</a><a href="#gallery-guidance">Guidance</a><a href="#gallery-commands">Commands</a><a href="#gallery-projections">Projections</a>
    </nav>
    <output id="experienceGalleryMatchCount" class="e29-gallery-match" aria-live="polite"></output>
    <section id="gallery-product-features"><h3>Registered product features</h3><p>Canonical entries from <code>${escapeHtml(projection.sourceRefs.featureRegistryRef)}</code>.</p><div class="e29-gallery-list">${projection.productFeatures.map(featureMarkup).join('')}</div></section>
    <section id="gallery-patterns"><h3>Experience patterns</h3><p>Reusable interaction compositions; patterns are not product features.</p><div class="e29-gallery-list">${foundation.patterns}</div></section>
    <section id="gallery-forms"><h3>Interaction forms</h3><p>Human, native, operator and voice expressions of existing semantics.</p><div class="e29-gallery-list">${foundation.forms}</div></section>
    <section id="gallery-guidance"><h3>Guidance and Help primitives</h3><p>Presentation/teaching vocabulary from <code>${escapeHtml(projection.sourceRefs.experienceGuidanceRef)}</code>.</p><div class="e29-gallery-list">${guidanceMarkup(projection)}</div></section>
    <section id="gallery-commands"><h3>Typed command bindings</h3><p>Registered command identity without execution authority.</p><div class="e29-gallery-list">${foundation.commands}</div></section>
    <section id="gallery-projections"><h3>Accepted Experience projection surfaces</h3><p>Source/proof links for the Human Help, Devex, typed-command and self-capability pieces accepted on main.</p><div class="e29-gallery-list">${projection.acceptedProjectionSurfaces.map(projectionSurfaceMarkup).join('')}</div></section>
    <section><h3>Permanent boundaries</h3><div class="e29-gallery-boundaries">${projection.boundaries.map((rule) => `<code>${escapeHtml(rule)}</code>`).join('')}</div></section>`;
}

export function createExperienceGalleryController({
  featureRegistry,
  experienceRegistry,
  experienceFoundation,
  experienceGuidance,
  documentRef = globalThis.document,
  windowRef = globalThis
} = {}) {
  const projection = buildExperienceGalleryProjection({ featureRegistry, experienceRegistry, experienceFoundation, experienceGuidance });
  let openButton = null;
  let drawer = null;
  let priorFocus = null;
  let bound = false;

  function visible() {
    return Boolean(drawer && !drawer.hidden);
  }

  function applyFilter(query = '') {
    if (!drawer) return 0;
    const cards = [...drawer.querySelectorAll('[data-gallery-search]')];
    let matches = 0;
    for (const card of cards) {
      const match = galleryEntryMatchesQuery(card.dataset.gallerySearch ?? '', query);
      card.hidden = !match;
      if (match) matches += 1;
    }
    const output = drawer.querySelector('#experienceGalleryMatchCount');
    if (output) output.textContent = `${matches} visible entries`;
    return matches;
  }

  function setHash(open) {
    if (!windowRef?.history?.replaceState || !windowRef?.location) return;
    const url = new URL(windowRef.location.href);
    url.hash = open ? EXPERIENCE_GALLERY_HASH : '';
    windowRef.history.replaceState(windowRef.history.state, '', url);
  }

  function open({ updateHash = true } = {}) {
    if (!drawer) return false;
    priorFocus = documentRef.activeElement;
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    documentRef.body.dataset.experienceGalleryOpen = 'true';
    const menu = documentRef.querySelector('#surfaceMenu');
    if (menu) menu.hidden = true;
    const menuButton = documentRef.querySelector('#surfaceMenuButton');
    if (menuButton) menuButton.setAttribute('aria-expanded', 'false');
    if (updateHash) setHash(true);
    drawer.querySelector('#experienceGallerySearch')?.focus();
    return true;
  }

  function close({ updateHash = true, restoreFocus = true } = {}) {
    if (!drawer) return false;
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    delete documentRef.body.dataset.experienceGalleryOpen;
    if (updateHash && windowRef?.location?.hash === EXPERIENCE_GALLERY_HASH) setHash(false);
    if (restoreFocus && priorFocus && typeof priorFocus.focus === 'function') priorFocus.focus();
    priorFocus = null;
    return true;
  }

  function syncHash() {
    if (windowRef?.location?.hash === EXPERIENCE_GALLERY_HASH) open({ updateHash: false });
    else if (visible()) close({ updateHash: false, restoreFocus: false });
  }

  function bind() {
    if (bound) return snapshot();
    if (!documentRef?.body) throw new Error('Experience Gallery requires a browser document');
    const surfaceMenu = documentRef.querySelector('#surfaceMenu');
    const app = documentRef.querySelector('#app');
    if (!surfaceMenu || !app) throw new Error('Experience Gallery requires the accepted browser shell');
    ensureStylesheet(documentRef);

    openButton = documentRef.createElement('button');
    openButton.id = 'openExperienceGallery';
    openButton.type = 'button';
    openButton.textContent = 'Experience Gallery';
    openButton.dataset.galleryUtility = 'true';
    const before = documentRef.querySelector('#terrainCenter');
    surfaceMenu.insertBefore(openButton, before ?? null);

    drawer = documentRef.createElement('aside');
    drawer.id = 'experienceGallery';
    drawer.className = 'e29-experience-gallery scroll-scope';
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('aria-labelledby', 'experienceGalleryTitle');
    drawer.innerHTML = galleryMarkup(projection);
    app.append(drawer);

    openButton.addEventListener('click', () => open());
    drawer.querySelector('#experienceGalleryClose')?.addEventListener('click', () => close());
    drawer.querySelector('#experienceGallerySearch')?.addEventListener('input', (event) => applyFilter(event.currentTarget.value));
    drawer.querySelectorAll('.e29-gallery-jump a').forEach((anchor) => {
      anchor.addEventListener('click', (event) => {
        event.preventDefault();
        drawer.querySelector(anchor.getAttribute('href'))?.scrollIntoView({ block: 'start' });
      });
    });
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
      schemaVersion: EXPERIENCE_GALLERY_SCHEMA,
      bound,
      visible: visible(),
      hashEntry: EXPERIENCE_GALLERY_HASH,
      effects: false,
      authorityGranted: false,
      summary: projection.summary
    });
  }

  return Object.freeze({ projection, bind, open, close, visible, applyFilter, snapshot });
}

export { ACCEPTED_PROJECTION_SURFACES };
