import { $, escapeHtml } from './dom.js';
import { createNavigationController } from './navigation-controller.js';
import { createTerrainController } from './terrain-controller.js';

const PUBLIC_PROJECTION_SCHEMA = 'vexlife.public-learning-projection/v1';
const BROWSER_REGISTRY_SCHEMA = 'vexlife.public-learning-browser-registry/v1';
const BROWSER_STRINGS_SCHEMA = 'vexlife.public-learning-browser-strings/v1';
const RETURN_SCHEMA = 'vexlife.public-learning-leaf-return/v1';
const LOCALES = Object.freeze(['en', 'ja', 'zh']);
const clone = (value) => structuredClone(value);
const need = (condition, message) => { if (!condition) throw new Error(message); };
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const normalizeRoute = (value) => {
  const route = String(value || '/');
  return route.endsWith('/') ? route : `${route}/`;
};

export function validatePublicLearningBrowserInputs({ projection, registry, catalogs }) {
  need(projection?.schemaVersion === PUBLIC_PROJECTION_SCHEMA, 'Stage 7 requires a public-learning projection');
  need(registry?.schemaVersion === BROWSER_REGISTRY_SCHEMA, 'invalid public-learning browser registry');
  need(registry.projectionRef === projection.projectionRef, 'browser registry projectionRef mismatch');
  need(registry.returnSchemaVersion === RETURN_SCHEMA, 'browser return schema mismatch');
  need(JSON.stringify(registry.requiredLocales) === JSON.stringify(LOCALES), 'browser locales must be exactly en/ja/zh');
  need(registry.presentationPolicy?.entryRef === projection.prototype?.entryRef, 'browser entryRef must reuse the B1 prototype entry');
  need(JSON.stringify(registry.presentationPolicy?.childEdgeTypes) === JSON.stringify(['PUBLIC_GROUP','PUBLIC_MEMBER']), 'presentation hierarchy must use only forward B1 child edges');
  need(registry.presentationPolicy?.canonicalParentMutation === false, 'public presentation cannot claim canonical parent authority');
  need(registry.presentationPolicy?.leafOpenSemanticNavigation === false, 'leaf open cannot be semantic navigation');
  need(registry.presentationPolicy?.leafOpenJourneyAppend === false, 'leaf open cannot append Journey');
  need(registry.presentationPolicy?.leafScrollMutatesTerrain === false, 'leaf scroll cannot mutate Terrain');
  need(registry.presentationPolicy?.browserHistoryEntryIsJourneyEvent === false, 'browser history cannot become Journey');
  need(registry.presentationPolicy?.nonSpatialProjectionSharesTerrainRefs === true, 'non-spatial projection must share the same Terrain refs');
  need(registry.controls?.askVex?.effectState === 'HELD' && registry.controls?.askVex?.executable === false, 'Ask Vex must remain held');
  need(registry.controls?.browseList?.controlRef && registry.controls?.browseList?.labelRef, 'accessible browse-list control is required');
  for (const key of ['breadcrumb','zoomControls','languageSelect','browseNav']) need(typeof registry.accessibleNameRefs?.[key] === 'string', `missing accessible name ref: ${key}`);
  need(typeof registry.technicalRelationshipDetailsLabelRef === 'string', 'technical relationship details label is required');
  need(Object.values(projection.effects ?? {}).length > 0 && Object.values(projection.effects).every((value) => value === false), 'public projection effects must all remain false');

  const keySets = [];
  for (const locale of LOCALES) {
    const catalog = catalogs?.[locale];
    need(catalog?.schemaVersion === BROWSER_STRINGS_SCHEMA, `${locale} browser catalog schema is invalid`);
    need(catalog.registryRef === registry.registryRef && catalog.locale === locale && catalog.sourceLocale === 'en', `${locale} browser catalog identity is invalid`);
    need(catalog.strings && typeof catalog.strings === 'object', `${locale} browser catalog is incomplete`);
    need(Object.values(catalog.strings).every((value) => typeof value === 'string' && value.trim()), `${locale} browser catalog contains empty copy`);
    keySets.push(Object.keys(catalog.strings).sort());
  }
  need(keySets.slice(1).every((keys) => JSON.stringify(keys) === JSON.stringify(keySets[0])), 'browser locale key sets differ');

  const routes = new Set();
  for (const leaf of projection.leaves ?? []) {
    need(typeof leaf.routePath === 'string' && /^\/learn\/architecture\/[a-z0-9-]+\/$/u.test(leaf.routePath), `invalid B1 leaf route: ${leaf.routePath}`);
    need(!routes.has(leaf.routePath), `duplicate B1 leaf route: ${leaf.routePath}`);
    routes.add(leaf.routePath);
  }
  return { localeKeys: keySets[0], leafRoutes: [...routes].sort() };
}

export function buildPublicPresentationTerrain(projection) {
  need(projection?.schemaVersion === PUBLIC_PROJECTION_SCHEMA, 'invalid public projection');
  const byRef = new Map((projection.nodes ?? []).map((node) => [node.ref, node]));
  const rootRef = projection.prototype?.entryRef;
  const root = byRef.get(rootRef);
  need(root?.nodeClass === 'PUBLIC_GROUPING_NODE', 'B1 prototype entry must resolve to a public grouping node');
  const parentByRef = new Map([[rootRef, null]]);
  const queue = [rootRef];
  const ordered = [];
  while (queue.length) {
    const ref = queue.shift();
    const node = byRef.get(ref);
    need(node, `presentation node unavailable: ${ref}`);
    ordered.push(ref);
    const children = (node.edges ?? [])
      .filter((edge) => edge.type === 'PUBLIC_GROUP' || edge.type === 'PUBLIC_MEMBER')
      .map((edge) => edge.to)
      .sort();
    for (const childRef of children) {
      need(byRef.has(childRef), `forward B1 presentation edge targets an unavailable ref: ${childRef}`);
      if (parentByRef.has(childRef)) {
        need(parentByRef.get(childRef) === ref, `B1 presentation child has multiple presentation parents: ${childRef}`);
        continue;
      }
      parentByRef.set(childRef, ref);
      queue.push(childRef);
    }
  }
  return ordered.map((ref) => {
    const source = byRef.get(ref);
    need(typeof source.titleRef === 'string', `presentation node lacks titleRef: ${ref}`);
    if (source.nodeClass === 'CANONICAL_NODE') need(source.parentRef === null, `canonical parentage was unexpectedly present for ${ref}`);
    return {
      terrainNodeRef: ref,
      parentRef: parentByRef.get(ref),
      kind: source.nodeClass === 'PUBLIC_GROUPING_NODE' ? 'PUBLIC_GROUP' : source.kind,
      labelStringRef: source.titleRef,
      presentationParentRef: parentByRef.get(ref),
      canonicalParentRef: source.parentRef ?? null
    };
  });
}

export function createPublicLearningController({ projection, registry, catalogs, root = document }) {
  validatePublicLearningBrowserInputs({ projection, registry, catalogs });
  const presentation = buildPublicPresentationTerrain(projection);
  const projectionByRef = new Map(projection.nodes.map((node) => [node.ref, node]));
  const terrainByRef = new Map(presentation.map((node) => [node.terrainNodeRef, node]));
  const childrenByRef = new Map();
  for (const item of presentation) {
    if (!item.parentRef) continue;
    const list = childrenByRef.get(item.parentRef) ?? [];
    list.push(item.terrainNodeRef);
    childrenByRef.set(item.parentRef, list);
  }
  for (const list of childrenByRef.values()) list.sort();
  const leafByCanonical = new Map(projection.leaves.map((leaf) => [leaf.canonicalRef, leaf]));
  const leafByRoute = new Map(projection.leaves.map((leaf) => [normalizeRoute(leaf.routePath), leaf]));
  const initialLeaf = leafByRoute.get(normalizeRoute(location.pathname)) ?? null;
  const rootRef = registry.presentationPolicy.entryRef;
  const initialRef = initialLeaf?.canonicalRef ?? rootRef;
  need(terrainByRef.has(initialRef), `initial public ref is outside the Stage-7 presentation tree: ${initialRef}`);

  let locale = LOCALES.includes(new URL(location.href).searchParams.get('lang')) ? new URL(location.href).searchParams.get('lang') : 'en';
  let terrain = null;
  let currentLeaf = null;
  let currentReturnBundle = null;
  let lastReturnReceipt = null;

  const strings = () => ({ ...(projection.strings?.[locale] ?? {}), ...(catalogs[locale]?.strings ?? {}) });
  const t = (ref, params = {}) => {
    let value = strings()[ref] ?? ref;
    for (const [key, replacement] of Object.entries(params)) value = value.replaceAll(`{${key}}`, String(replacement));
    return value;
  };
  const state = {
    view: 'terrain',
    contextProjection: null,
    projectRef: null,
    threadRef: null,
    channelRef: null,
    selectedNodeRef: initialRef,
    selections: new Map(),
    journey: [],
    terrain: { selected: initialRef }
  };
  const elementByRef = new Map(presentation.map((node) => [node.terrainNodeRef, { ref: node.terrainNodeRef, parentRef: node.parentRef }]));
  const navigation = createNavigationController({
    state,
    elementByRef,
    getProject: () => null,
    getThread: () => null,
    getChannel: () => null,
    resolveSemanticNodeRef: (ref) => terrainByRef.has(ref) ? ref : null,
    resolveInteractionRef: () => null,
    onFrameChange: () => queueMicrotask(renderCurrentDetail)
  });
  navigation.seedCurrentJourney(initialRef, 'action.public-learning.entry');

  const leafPanel = $('#publicLeaf', root);
  const leafScroller = $('#publicLeafScroller', root);
  const localeSelect = $('#languageSelect', root);
  const askVex = $('#vexSummon', root);
  askVex.disabled = true;
  askVex.dataset.effectState = 'HELD';

  function relationRows(node, leaf) {
    const rows = [];
    for (const edge of node?.edges ?? []) rows.push({ type: edge.type, ref: edge.to });
    for (const ref of leaf?.relatedRefs ?? []) if (!rows.some((row) => row.type === 'PUBLIC_RELATED' && row.ref === ref)) rows.push({ type: 'PUBLIC_RELATED', ref });
    return rows.sort((a, b) => `${a.type}:${a.ref}`.localeCompare(`${b.type}:${b.ref}`));
  }

  function renderRelationshipList(container, node, leaf) {
    container.replaceChildren();
    for (const relation of relationRows(node, leaf)) {
      const item = document.createElement('li');
      item.dataset.relationshipType = relation.type;
      item.dataset.relationshipRef = relation.ref;
      const target = projectionByRef.get(relation.ref);
      const label = target?.titleRef ? t(target.titleRef) : relation.ref;
      const strong = document.createElement('strong');
      strong.textContent = label;
      const details = document.createElement('details');
      details.dataset.relationshipTechnical = 'true';
      const summary = document.createElement('summary');
      summary.textContent = t(registry.technicalRelationshipDetailsLabelRef);
      const code = document.createElement('code');
      code.textContent = `${relation.type} · ${relation.ref}`;
      details.append(summary, code);
      item.append(strong, details);
      container.append(item);
    }
  }

  function readFocusRef(canonicalRef) { return `control.public-learning.read-leaf.${canonicalRef}`; }

  function directionTo(targetRef) {
    const current = terrain.currentRef();
    if (terrainByRef.get(targetRef)?.parentRef === current) return 'in';
    if (terrainByRef.get(current)?.parentRef === targetRef) return 'out';
    return 'sibling';
  }

  function renderBrowseBranch(ref, list) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.publicListRef = ref;
    button.dataset.focusRef = `control.public-learning.browse.${ref}`;
    button.textContent = t(terrainByRef.get(ref).labelStringRef);
    if (terrain?.currentRef() === ref) button.setAttribute('aria-current', 'page');
    button.onclick = async () => {
      if (terrain.currentRef() === ref) return;
      await terrain.travel(ref, directionTo(ref));
      renderCurrentDetail();
    };
    item.append(button);
    const children = childrenByRef.get(ref) ?? [];
    if (children.length) {
      const nested = document.createElement('ul');
      for (const child of children) renderBrowseBranch(child, nested);
      item.append(nested);
    }
    list.append(item);
  }

  function renderBrowseList() {
    const list = $('#publicBrowseList', root);
    list.replaceChildren();
    renderBrowseBranch(rootRef, list);
  }

  function renderCurrentDetail() {
    if (!terrain) return;
    const ref = terrain.currentRef();
    const node = projectionByRef.get(ref);
    const detail = $('#publicCurrentDetail', root);
    detail.dataset.currentRef = ref;
    $('#publicDetailEyebrow', root).textContent = t('public.browser.current-context');
    $('#publicDetailTitle', root).textContent = node?.titleRef ? t(node.titleRef) : ref;
    $('#publicDetailBrief', root).textContent = node?.briefRef ? t(node.briefRef) : node?.brief ?? '';
    const action = $('#publicDetailAction', root);
    const leaf = leafByCanonical.get(ref) ?? null;
    action.replaceChildren();
    if (leaf) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'public-primary-action';
      button.dataset.publicAction = 'read-leaf';
      button.dataset.focusRef = readFocusRef(ref);
      button.textContent = t(registry.controls.readLeaf.labelRef);
      button.onclick = () => openLeaf(leaf, { direct: false });
      action.append(button);
    } else {
      const note = document.createElement('p');
      note.textContent = t('public.browser.no-leaf');
      action.append(note);
    }
    renderBrowseList();
    renderRelationshipList($('#publicDetailRelationships', root), node, leaf);
  }

  function renderLeaf(leaf) {
    const node = projectionByRef.get(leaf.canonicalRef);
    $('#publicLeafEyebrow', root).textContent = t('public.browser.prototype-label');
    $('#publicLeafTitle', root).textContent = t(leaf.titleRef);
    $('#publicLeafSummary', root).textContent = t(leaf.summaryRef);
    const sections = $('#publicLeafSections', root);
    sections.replaceChildren();
    for (const key of ['what','why','how','when','boundaries','related']) {
      const section = document.createElement('section');
      section.dataset.leafSection = key;
      const heading = document.createElement('h2');
      heading.textContent = t(registry.sectionLabelRefs[key]);
      const copy = document.createElement('p');
      copy.textContent = t(leaf.sectionRefs[key]);
      section.append(heading, copy);
      sections.append(section);
    }
    renderRelationshipList($('#publicLeafRelationships', root), node, leaf);
    $('#publicAskVexLabel', root).textContent = t(registry.controls.askVex.labelRef);
    $('#publicAskVexNote', root).textContent = t(registry.controls.askVex.noteRef);
    $('#publicLeafBackNote', root).textContent = t('public.browser.back-note');
    $('#publicLeafReturn', root).textContent = t(registry.controls.returnField.labelRef);
    leafPanel.dataset.canonicalRef = leaf.canonicalRef;
    leafPanel.dataset.leafRef = leaf.leafRef;
  }

  function applyLocalizedChrome() {
    document.documentElement.lang = locale;
    $('#publicAppTitle', root).textContent = t('public.browser.app-title');
    $('#publicPrototypeLabel', root).textContent = t('public.browser.prototype-label');
    $('#publicSourceNote', root).textContent = t('public.browser.source-note');
    $('#publicLanguageLabel', root).textContent = t('public.browser.language');
    localeSelect.setAttribute('aria-label', t(registry.accessibleNameRefs.languageSelect));
    $('#terrainBreadcrumb', root).setAttribute('aria-label', t(registry.accessibleNameRefs.breadcrumb));
    $('#terrainToolbar', root).setAttribute('aria-label', t(registry.accessibleNameRefs.zoomControls));
    $('#publicBrowseNav', root).setAttribute('aria-label', t(registry.accessibleNameRefs.browseNav));
    $('#publicBrowseSummary', root).textContent = t(registry.controls.browseList.labelRef);
    $('#publicBrowseNote', root).textContent = t(registry.controls.browseList.noteRef);
    $('#publicDetailRelationshipsHeading', root).textContent = t('public.browser.relationships');
    $('#publicLeafRelationshipsHeading', root).textContent = t('public.browser.relationships');
    $('#terrainUp', root).textContent = t('public.browser.up-one-layer');
    $('#terrainReset', root).textContent = t('public.browser.reset-view');
    $('#terrainZoomIn', root).setAttribute('aria-label', t('public.browser.zoom-in'));
    $('#terrainZoomOut', root).setAttribute('aria-label', t('public.browser.zoom-out'));
    askVex.textContent = t(registry.controls.askVex.labelRef);
    askVex.title = t(registry.controls.askVex.noteRef);
    $('#publicAskVexHeaderNote', root).textContent = t(registry.controls.askVex.noteRef);
  }

  function formReturnBundle(leaf, historyClass) {
    return {
      schemaVersion: registry.returnSchemaVersion,
      semanticFrame: clone(navigation.semanticFrame()),
      terrainPresentation: clone(terrain.presentationSnapshot()),
      leafScrollState: { scrollTop: 0 },
      stableFocusRef: readFocusRef(leaf.canonicalRef),
      routeState: {
        fieldRoutePath: registry.fieldRoutePath,
        leafRoutePath: leaf.routePath,
        historyClass
      }
    };
  }

  function openLeaf(leaf, { direct = false } = {}) {
    need(leafByCanonical.get(leaf.canonicalRef)?.leafRef === leaf.leafRef, 'leaf is not registered in the B1 projection');
    currentLeaf = leaf;
    currentReturnBundle = formReturnBundle(leaf, direct ? 'DIRECT' : 'PUSHED');
    renderLeaf(leaf);
    leafPanel.hidden = false;
    leafScroller.scrollTop = 0;
    if (direct) {
      history.replaceState({ vexlifePublic: 'DIRECT_LEAF', canonicalRef: leaf.canonicalRef }, '', leaf.routePath);
    } else {
      history.pushState({ vexlifePublic: 'LEAF', canonicalRef: leaf.canonicalRef }, '', leaf.routePath);
    }
    leafScroller.focus({ preventScroll: true });
    return clone(currentReturnBundle);
  }

  function restoreField(bundle, { replaceRoute = false } = {}) {
    need(bundle?.schemaVersion === RETURN_SCHEMA, 'invalid public leaf return bundle');
    const currentFrame = navigation.semanticFrame();
    const frameExact = same(currentFrame, bundle.semanticFrame);
    const terrainResult = terrain.restorePresentation(bundle.terrainPresentation);
    if (replaceRoute) history.replaceState({ vexlifePublic: 'FIELD', canonicalRef: terrain.currentRef() }, '', bundle.routeState.fieldRoutePath);
    leafPanel.hidden = true;
    const leafScrollTop = currentReturnBundle?.leafScrollState?.scrollTop ?? 0;
    currentLeaf = null;
    currentReturnBundle = null;
    renderCurrentDetail();
    const focusTarget = root.querySelector(`[data-focus-ref="${CSS.escape(bundle.stableFocusRef)}"]`);
    focusTarget?.focus({ preventScroll: true });
    lastReturnReceipt = {
      schemaVersion: 'vexlife.public-learning-browser-return-receipt/v1',
      state: frameExact && terrainResult.restored ? 'PASS' : 'FAILED',
      semanticFrameExact: frameExact,
      terrain: terrainResult,
      leafScrollState: { scrollTop: leafScrollTop },
      stableFocusRef: bundle.stableFocusRef,
      routePath: location.pathname,
      journeyEventCount: navigation.fullJourney().length
    };
    return clone(lastReturnReceipt);
  }

  terrain = createTerrainController({
    state,
    blueprint: { terrain: presentation },
    t,
    navigation,
    semanticPatchForNode: (ref) => ({ selectedNodeRef: ref }),
    onCurrentNode: () => queueMicrotask(renderCurrentDetail)
  });

  $('#terrainUp', root).onclick = () => terrain.up();
  $('#terrainReset', root).onclick = () => { terrain.reset(); renderCurrentDetail(); };
  $('#terrainCenter', root).onclick = () => terrain.centerOn();
  $('#terrainJourneyClose', root).onclick = () => terrain.closeJourney();
  $('#terrainFullJourneyToggle', root).onclick = () => terrain.openJourney();
  $('#publicLeafReturn', root).onclick = () => currentReturnBundle && restoreField(currentReturnBundle, { replaceRoute: true });
  leafScroller.addEventListener('scroll', () => {
    if (currentReturnBundle) currentReturnBundle.leafScrollState.scrollTop = leafScroller.scrollTop;
  }, { passive: true });

  localeSelect.value = locale;
  localeSelect.onchange = () => {
    const next = localeSelect.value;
    if (!LOCALES.includes(next)) return;
    const scrollTop = leafScroller.scrollTop;
    locale = next;
    applyLocalizedChrome();
    terrain.render(false);
    renderCurrentDetail();
    if (currentLeaf) { renderLeaf(currentLeaf); leafScroller.scrollTop = scrollTop; }
  };

  applyLocalizedChrome();
  renderCurrentDetail();

  history.replaceState({ vexlifePublic: initialLeaf ? 'DIRECT_LEAF' : 'FIELD', canonicalRef: initialRef }, '', initialLeaf ? initialLeaf.routePath : registry.fieldRoutePath);
  addEventListener('popstate', () => {
    if (currentLeaf && currentReturnBundle) restoreField(currentReturnBundle, { replaceRoute: false });
  });
  if (initialLeaf) queueMicrotask(() => openLeaf(initialLeaf, { direct: true }));

  const proof = () => ({
    schemaVersion: 'vexlife.public-learning-browser-proof-snapshot/v1',
    locale,
    sourceProjectionRef: projection.projectionRef,
    sourceProjectionHash: projection.projectionHash,
    currentRef: terrain.currentRef(),
    semanticFrame: clone(navigation.semanticFrame()),
    terrainPresentation: clone(terrain.presentationSnapshot()),
    journeyEventCount: navigation.fullJourney().length,
    leafOpen: !leafPanel.hidden,
    leafRef: currentLeaf?.leafRef ?? null,
    routePath: location.pathname,
    accessibleListRefs: [...root.querySelectorAll('[data-public-list-ref]')].map((item) => item.dataset.publicListRef),
    returnBundle: currentReturnBundle ? clone(currentReturnBundle) : null,
    lastReturnReceipt: lastReturnReceipt ? clone(lastReturnReceipt) : null
  });

  return {
    state,
    navigation,
    terrain,
    presentation: clone(presentation),
    proof,
    openLeafByCanonicalRef: (ref) => { const leaf = leafByCanonical.get(ref); need(leaf, `unknown public leaf canonical ref: ${ref}`); return openLeaf(leaf); },
    restoreCurrentLeaf: () => currentReturnBundle ? restoreField(currentReturnBundle) : null,
    setLocale: (next) => { localeSelect.value = next; localeSelect.onchange(); return locale; }
  };
}

// [VXG RealForever]
