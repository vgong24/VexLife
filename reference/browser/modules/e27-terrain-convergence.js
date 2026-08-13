const RECENT_LIMIT = 5;
const WORKSPACE_STORAGE_KEY = 'vexlife.workspace.open';

const clampWindowStart = (events, start, size) => {
  const max = Math.max(0, events.length - size);
  return Math.max(0, Math.min(max, Number.isInteger(start) ? start : max));
};

export function journeyWindow(events, start = null, size = RECENT_LIMIT) {
  if (!Array.isArray(events)) throw new TypeError('events must be an array');
  if (!Number.isInteger(size) || size < 1) throw new TypeError('size must be a positive integer');
  const resolvedStart = start === null ? Math.max(0, events.length - size) : clampWindowStart(events, start, size);
  return { start: resolvedStart, entries: events.slice(resolvedStart, resolvedStart + size), total: events.length };
}

export function historicalFramePatch(event) {
  const frame = event?.after;
  if (!frame || typeof frame !== 'object') throw new TypeError('journey event.after must be an object');
  const patch = {};
  const screenTail = String(frame.screenRef || '').split('.').at(-1);
  if (screenTail) patch.view = screenTail;
  for (const key of ['projectRef', 'threadRef', 'channelRef', 'selectedNodeRef']) {
    if (frame[key] !== null && frame[key] !== undefined) patch[key] = frame[key];
  }
  return patch;
}

function createButton({ id, className = '', text = '', ariaLabel = '', actionRef = '' }) {
  const button = document.createElement('button');
  button.type = 'button';
  if (id) button.id = id;
  if (className) button.className = className;
  if (text) button.textContent = text;
  if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
  if (actionRef) button.dataset.actionRef = actionRef;
  return button;
}

function terrainLabelMap() {
  return new Map([...document.querySelectorAll('.terrain-node[data-node-ref]')].map((node) => [
    node.dataset.nodeRef,
    node.querySelector('h3')?.textContent?.trim() || node.dataset.nodeRef
  ]));
}

function labelJourneyEvent(event, app) {
  const labels = terrainLabelMap();
  const selected = event?.after?.selectedNodeRef;
  if (selected && labels.has(selected)) return labels.get(selected);
  const screenRef = event?.after?.screenRef;
  if (screenRef) {
    const screen = String(screenRef).split('.').at(-1);
    const ref = `screen.${screen}.title`;
    const value = app.t(ref);
    if (!value.startsWith('[')) return value;
  }
  return selected || event?.elementRef || screenRef || event?.actionRef || '—';
}

function waitForApp(timeoutMs = 5000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      if (globalThis.__VEXLIFE_APP__) return resolve(globalThis.__VEXLIFE_APP__);
      if (Date.now() - started >= timeoutMs) return reject(new Error('VexLife app did not become ready for E2.7 convergence'));
      setTimeout(probe, 20);
    };
    probe();
  });
}

export function attachE27TerrainConvergence(app) {
  if (!app?.navigation || !app?.terrain || !app?.state || !app?.t) throw new TypeError('VexLife app bindings are incomplete');
  const shell = document.querySelector('.app-shell');
  const rail = document.querySelector('.project-rail');
  const topActions = document.querySelector('.top-actions');
  const terrainView = document.querySelector('#view-terrain');
  const terrainLayout = document.querySelector('.terrain-layout');
  const terrainCanvas = document.querySelector('#terrainCanvas');
  const terrainDetail = document.querySelector('.terrain-detail');
  const terrainToolbar = document.querySelector('.terrain-toolbar');
  if (!shell || !rail || !topActions || !terrainView || !terrainLayout || !terrainCanvas || !terrainDetail || !terrainToolbar) {
    throw new Error('E2.7 convergence could not resolve the current browser shell');
  }

  const settleVex = () => queueMicrotask(() => {
    if (!app.state.guideOpen || !app.guide?.avoidDeclaredControls) return;
    if (app.guide.avoidDeclaredControls()) app.guide.persistGeometry?.();
  });

  shell.classList.add('e27-converged-shell');
  rail.id = rail.id || 'projectRail';

  const projectToggle = createButton({
    id: 'projectRailToggle',
    className: 'guide-toggle e27-project-toggle',
    text: app.t('region.projects.label'),
    ariaLabel: app.t('project.rail.aria'),
    actionRef: 'action.vessel.expand'
  });
  projectToggle.setAttribute('aria-controls', rail.id);
  topActions.prepend(projectToggle);

  let workspaceOpen = localStorage.getItem(WORKSPACE_STORAGE_KEY) === 'true';
  const setWorkspaceOpen = (open) => {
    workspaceOpen = Boolean(open);
    shell.dataset.workspaceOpen = String(workspaceOpen);
    projectToggle.setAttribute('aria-expanded', String(workspaceOpen));
    rail.setAttribute('aria-hidden', String(!workspaceOpen));
    localStorage.setItem(WORKSPACE_STORAGE_KEY, String(workspaceOpen));
    if (workspaceOpen) settleVex();
  };
  projectToggle.addEventListener('click', () => setWorkspaceOpen(!workspaceOpen));
  setWorkspaceOpen(workspaceOpen);

  terrainDetail.id = terrainDetail.id || 'terrainDetailPanel';
  terrainDetail.classList.add('e27-terrain-detail');
  const detailClose = createButton({
    id: 'terrainDetailClose',
    className: 'e27-close',
    text: '×',
    ariaLabel: app.t('guide.close')
  });
  terrainDetail.prepend(detailClose);
  let detailOpen = false;
  const setDetailOpen = (open) => {
    detailOpen = Boolean(open);
    terrainDetail.classList.toggle('is-open', detailOpen);
    terrainDetail.setAttribute('aria-hidden', String(!detailOpen));
    if (detailOpen) settleVex();
  };
  detailClose.addEventListener('click', () => setDetailOpen(false));
  setDetailOpen(false);

  const detailToggle = createButton({
    id: 'terrainDetailToggle',
    className: 'secondary-button e27-terrain-tool',
    text: app.t('terrain.details'),
    ariaLabel: app.t('terrain.details'),
    actionRef: 'action.context.open'
  });
  detailToggle.setAttribute('aria-controls', terrainDetail.id);
  detailToggle.addEventListener('click', () => {
    const nextOpen = !detailOpen;
    if (nextOpen) setTerrainMenuOpen(false);
    setDetailOpen(nextOpen);
  });

  const workspaceMenuToggle = createButton({
    id: 'terrainWorkspaceMenuToggle',
    className: 'secondary-button e27-terrain-tool e27-menu-toggle',
    text: '⋯',
    ariaLabel: app.t('workspace.label'),
    actionRef: 'action.vessel.expand'
  });
  const workspaceMenu = document.createElement('div');
  workspaceMenu.id = 'terrainWorkspaceMenu';
  workspaceMenu.className = 'e27-terrain-menu';
  workspaceMenu.setAttribute('aria-hidden', 'true');
  workspaceMenuToggle.setAttribute('aria-controls', workspaceMenu.id);
  let workspaceMenuOpen = false;
  const setTerrainMenuOpen = (open) => {
    workspaceMenuOpen = Boolean(open);
    workspaceMenu.classList.toggle('is-open', workspaceMenuOpen);
    workspaceMenu.setAttribute('aria-hidden', String(!workspaceMenuOpen));
    workspaceMenuToggle.setAttribute('aria-expanded', String(workspaceMenuOpen));
    if (workspaceMenuOpen) settleVex();
  };
  workspaceMenuToggle.addEventListener('click', () => setTerrainMenuOpen(!workspaceMenuOpen));

  for (const id of ['terrainCenter', 'terrainReset']) {
    const button = document.querySelector(`#${id}`);
    if (button) workspaceMenu.append(button);
  }
  workspaceMenu.prepend(detailToggle);
  terrainLayout.append(workspaceMenu);
  terrainToolbar.append(workspaceMenuToggle);

  const adjacent = document.createElement('div');
  adjacent.id = 'terrainAdjacent';
  adjacent.className = 'e27-adjacent';
  const previousSibling = document.querySelector('#terrainSiblingPrevious');
  const nextSibling = document.querySelector('#terrainSiblingNext');
  if (previousSibling) { previousSibling.classList.add('e27-adjacent-card', 'previous'); adjacent.append(previousSibling); }
  if (nextSibling) { nextSibling.classList.add('e27-adjacent-card', 'next'); adjacent.append(nextSibling); }
  terrainLayout.append(adjacent);

  const journeyBar = document.createElement('div');
  journeyBar.id = 'terrainJourneyWindow';
  journeyBar.className = 'e27-journey-window';
  const journeyStatus = document.createElement('div');
  journeyStatus.className = 'e27-journey-status';
  const journeyRecent = document.createElement('div');
  journeyRecent.id = 'terrainJourneyRecent';
  journeyRecent.className = 'e27-journey-recent';
  const fullJourneyToggle = createButton({
    id: 'terrainFullJourneyToggle',
    className: 'secondary-button e27-full-journey-toggle',
    text: '↺',
    actionRef: 'action.vessel.expand'
  });
  journeyBar.append(journeyStatus, journeyRecent, fullJourneyToggle);
  terrainView.append(journeyBar);

  const journeyDrawer = document.createElement('aside');
  journeyDrawer.id = 'terrainJourneyDrawer';
  journeyDrawer.className = 'e27-journey-drawer';
  journeyDrawer.setAttribute('aria-hidden', 'true');
  const drawerHeader = document.createElement('header');
  drawerHeader.className = 'e27-drawer-head';
  const drawerTitle = document.createElement('strong');
  const drawerClose = createButton({ className: 'e27-close', text: '×', ariaLabel: app.t('guide.close') });
  drawerHeader.append(drawerTitle, drawerClose);
  const drawerList = document.createElement('div');
  drawerList.id = 'terrainJourneyList';
  drawerList.className = 'e27-journey-list';
  journeyDrawer.append(drawerHeader, drawerList);
  terrainLayout.append(journeyDrawer);
  let journeyDrawerOpen = false;
  const setJourneyDrawerOpen = (open) => {
    journeyDrawerOpen = Boolean(open);
    journeyDrawer.classList.toggle('is-open', journeyDrawerOpen);
    journeyDrawer.setAttribute('aria-hidden', String(!journeyDrawerOpen));
    fullJourneyToggle.setAttribute('aria-expanded', String(journeyDrawerOpen));
    if (journeyDrawerOpen) settleVex();
  };
  fullJourneyToggle.addEventListener('click', () => setJourneyDrawerOpen(!journeyDrawerOpen));
  drawerClose.addEventListener('click', () => setJourneyDrawerOpen(false));

  function visitEvent(event) {
    const patch = historicalFramePatch(event);
    const nodeRef = patch.selectedNodeRef || event.elementRef || event.after?.screenRef || 'product.vexlife';
    app.navigation.navigate(nodeRef, patch, 'action.context.open');
    app.projectCurrentFrame();
    setJourneyDrawerOpen(false);
  }

  function renderJourney() {
    const full = app.navigation.fullJourney();
    const currentFrame = app.navigation.semanticFrame();
    const selectedNodeRef = currentFrame.selectedNodeRef || '—';
    const trajectoryLabel = app.t('guide.trajectory', {
      screenRef: currentFrame.screenRef,
      selectedNodeRef,
      steps: full.length
    });
    journeyStatus.textContent = trajectoryLabel;
    drawerTitle.textContent = trajectoryLabel;
    fullJourneyToggle.setAttribute('aria-label', trajectoryLabel);
    fullJourneyToggle.textContent = `↺ ${full.length}`;

    const window = journeyWindow(full);
    journeyRecent.replaceChildren();
    for (const event of window.entries) {
      const button = createButton({ className: 'e27-journey-chip', text: labelJourneyEvent(event, app), actionRef: 'action.context.open' });
      button.dataset.journeyRef = event.journeyRef;
      button.title = `${event.actionRef} · ${event.journeyRef}`;
      button.addEventListener('click', () => visitEvent(event));
      journeyRecent.append(button);
    }
    if (window.entries.length === 0) {
      const empty = document.createElement('span'); empty.className = 'e27-journey-empty'; empty.textContent = trajectoryLabel; journeyRecent.append(empty);
    }

    drawerList.replaceChildren();
    for (const event of full) {
      const button = createButton({ className: 'e27-history-entry', text: labelJourneyEvent(event, app), actionRef: 'action.context.open' });
      const meta = document.createElement('small'); meta.textContent = `${event.actionRef} · ${event.journeyRef}`;
      button.append(meta);
      button.addEventListener('click', () => visitEvent(event));
      drawerList.append(button);
    }
  }

  function renderAdjacent() {
    const selected = app.state.terrain?.selected;
    const ordered = selected ? app.terrain.siblingRefs(selected) : [];
    const index = ordered.indexOf(selected);
    const labels = terrainLabelMap();
    const pair = [
      [previousSibling, index > 0 ? ordered[index - 1] : null, app.t('terrain.sibling.previous')],
      [nextSibling, index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null, app.t('terrain.sibling.next')]
    ];
    for (const [button, ref, direction] of pair) {
      if (!button) continue;
      button.hidden = !ref;
      button.setAttribute('aria-label', ref ? `${direction}: ${labels.get(ref) || ref}` : direction);
      if (ref) {
        const strong = document.createElement('strong'); strong.textContent = labels.get(ref) || ref;
        const small = document.createElement('small'); small.textContent = direction;
        button.replaceChildren(strong, small);
      }
    }
  }

  function renderState() {
    const terrainActive = app.state.view === 'terrain';
    shell.dataset.terrainActive = String(terrainActive);
    if (!terrainActive) { setDetailOpen(false); setTerrainMenuOpen(false); setJourneyDrawerOpen(false); }
    renderAdjacent();
    renderJourney();
    projectToggle.textContent = app.t('region.projects.label');
    projectToggle.setAttribute('aria-label', app.t('project.rail.aria'));
    detailToggle.textContent = app.t('terrain.details');
    workspaceMenuToggle.setAttribute('aria-label', app.t('workspace.label'));
    if (terrainActive) settleVex();
  }

  const originalNavigate = app.navigation.navigate.bind(app.navigation);
  app.navigation.navigate = (...args) => {
    const result = originalNavigate(...args);
    queueMicrotask(renderState);
    return result;
  };
  const originalBack = app.navigation.back.bind(app.navigation);
  app.navigation.back = (...args) => {
    const result = originalBack(...args);
    queueMicrotask(renderState);
    return result;
  };

  document.querySelector('#languageSelect')?.addEventListener('change', () => queueMicrotask(renderState));
  globalThis.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (journeyDrawerOpen) { event.preventDefault(); setJourneyDrawerOpen(false); return; }
    if (workspaceMenuOpen) { event.preventDefault(); setTerrainMenuOpen(false); return; }
    if (detailOpen) { event.preventDefault(); setDetailOpen(false); return; }
    if (workspaceOpen) { event.preventDefault(); setWorkspaceOpen(false); }
  });

  renderState();
  return { renderState, setWorkspaceOpen, setDetailOpen, setJourneyDrawerOpen, setTerrainMenuOpen };
}

if (typeof document !== 'undefined') {
  waitForApp().then((app) => {
    globalThis.__VEXLIFE_E27_CONVERGENCE__ = attachE27TerrainConvergence(app);
  }).catch((error) => console.error(error));
}

// [VXG RealForever]
