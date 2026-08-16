import { $, $$, loadJson, saveJson } from './dom.js';

export const GUIDE_INTENTS = Object.freeze({ CURRENT: 'intent.guide.current', NEXT: 'intent.guide.next', PROTECTS: 'intent.guide.protects', ARCHITECTURE: 'intent.guide.architecture' });
export const VEX_PRESENCE_STATES = Object.freeze({ AMBIENT:'AMBIENT', ATTENTIVE:'ATTENTIVE', SUMMONED:'SUMMONED', ACTIVE_CONVERSATION:'ACTIVE_CONVERSATION' });
const PROMPT_REF_BY_INTENT = Object.freeze({ [GUIDE_INTENTS.CURRENT]: 'guide.ask.current', [GUIDE_INTENTS.NEXT]: 'guide.mode.next', [GUIDE_INTENTS.PROTECTS]: 'guide.ask.protects', [GUIDE_INTENTS.ARCHITECTURE]: 'architecture.open' });
const NEXT_TARGET_BY_SCREEN = Object.freeze({
  'screen.vexlife.terrain': 'element.terrain.reset',
  'screen.vexlife.chat': 'element.messages.jump-latest'
});
const PRESENCE_STRING_REF = Object.freeze({
  [VEX_PRESENCE_STATES.AMBIENT]:'vex.presence.ambient',
  [VEX_PRESENCE_STATES.ATTENTIVE]:'vex.presence.attentive',
  [VEX_PRESENCE_STATES.SUMMONED]:'vex.presence.summoned',
  [VEX_PRESENCE_STATES.ACTIVE_CONVERSATION]:'vex.presence.active-conversation'
});
const MIN_WIDTH = 320; const MIN_HEIGHT = 330; const SAFE_MARGIN = 12;
const PREFERRED_GEOMETRY_KEY = 'vexlife.guide.geometry';
const LEGACY_POSITION_KEY = 'vexlife.guide.position';

export function createGuideController({ state, t, navigation, elementByRef, chat }) {
  const records = []; const windowElement = $('#guideWindow');
  let preferredGeometry = loadJson(PREFERRED_GEOMETRY_KEY, loadJson(LEGACY_POSITION_KEY, null));
  let resolvedGeometry = null;
  let attentionSourceRef = null;
  let explicitSummoned = false;
  let activeConversation = false;
  const rectFor = ({ left, top, width, height }) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const overlaps = (left, right) => !(left.right + SAFE_MARGIN <= right.left || left.left >= right.right + SAFE_MARGIN || left.bottom + SAFE_MARGIN <= right.top || left.top >= right.bottom + SAFE_MARGIN);
  const samePlacement = (left, right, epsilon=.5) => Boolean(left&&right) && ['left','top','width','height'].every((key)=>Math.abs(Number(left[key])-Number(right[key]))<=epsilon);
  const snapshotGeometry = () => { const rect=windowElement.getBoundingClientRect(); return { left:rect.left, top:rect.top, width:rect.width, height:rect.height }; };
  const normalizePlacement = (geometry, current = snapshotGeometry()) => {
    const width = Number.isFinite(geometry?.width) ? Math.max(MIN_WIDTH, geometry.width) : current.width;
    const height = Number.isFinite(geometry?.height) ? Math.max(MIN_HEIGHT, geometry.height) : current.height;
    const renderedWidth = state.guideMinimized ? current.width : Math.min(width, Math.max(MIN_WIDTH, window.innerWidth - SAFE_MARGIN * 2));
    const renderedHeight = state.guideMinimized ? current.height : Math.min(height, Math.max(MIN_HEIGHT, window.innerHeight - SAFE_MARGIN * 2));
    const maxLeft = Math.max(SAFE_MARGIN, window.innerWidth - renderedWidth - SAFE_MARGIN);
    const maxTop = Math.max(SAFE_MARGIN, window.innerHeight - renderedHeight - SAFE_MARGIN);
    return {
      left:Math.max(SAFE_MARGIN, Math.min(maxLeft, Number.isFinite(geometry?.left) ? geometry.left : current.left)),
      top:Math.max(SAFE_MARGIN, Math.min(maxTop, Number.isFinite(geometry?.top) ? geometry.top : current.top)),
      width:renderedWidth,
      height:renderedHeight
    };
  };
  const applyPlacement = (geometry, { size = false } = {}) => {
    if (!geometry) return;
    if (Number.isFinite(geometry.left)) { windowElement.style.left=`${geometry.left}px`; windowElement.style.right='auto'; }
    if (Number.isFinite(geometry.top)) { windowElement.style.top=`${geometry.top}px`; windowElement.style.bottom='auto'; }
    if (size && !state.guideMinimized) {
      if (Number.isFinite(geometry.width)) windowElement.style.width=`${Math.max(MIN_WIDTH,geometry.width)}px`;
      if (Number.isFinite(geometry.height)) windowElement.style.height=`${Math.max(MIN_HEIGHT,geometry.height)}px`;
    }
  };
  const visibleProtectedRects = () => $$('.topbar, .terrain-toolbar, .terrain-journey-window, .terrain-adjacent-card:not([hidden]), .terrain-detail-drawer.is-open, .terrain-journey-drawer.is-open, .project-rail[aria-hidden="false"], .context-projection:not([hidden]), .e27-appbar, .e27-breadcrumb, .e27-zoom-rail, .e27-focus, .e27-node, .e27-adjacent-card, .e27-recentbar, .e27-context-surface:not([hidden]), .e27-surface-menu:not([hidden]), .e27-terrain-context:not([hidden]), .e27-drawer.show').filter((element) => element !== windowElement && !windowElement.contains(element) && element.getClientRects().length > 0).map((element) => element.getBoundingClientRect());
  const preferredResolvedPlacement = (current = snapshotGeometry()) => preferredGeometry ? normalizePlacement(preferredGeometry,current) : null;
  function currentPresenceState() {
    if (!state.guideOpen || windowElement.hidden) return null;
    if (state.guideMinimized) return attentionSourceRef ? VEX_PRESENCE_STATES.ATTENTIVE : VEX_PRESENCE_STATES.AMBIENT;
    if (activeConversation) return VEX_PRESENCE_STATES.ACTIVE_CONVERSATION;
    return explicitSummoned ? VEX_PRESENCE_STATES.SUMMONED : VEX_PRESENCE_STATES.SUMMONED;
  }
  function presenceStateNode() {
    let node = $('#vexPresenceState');
    if (node) return node;
    node = document.createElement('span');
    node.id = 'vexPresenceState';
    node.className = 'e28-vex-presence-state';
    node.setAttribute('aria-live','polite');
    $('#guideHandle')?.insertBefore(node,$('#guideHandle .guide-controls'));
    return node;
  }
  function projectPresenceState() {
    const presence = currentPresenceState();
    state.guidePresenceState = presence;
    state.guideAttentionSourceRef = attentionSourceRef;
    if (!presence) { delete windowElement.dataset.vesselPresenceState; return null; }
    const label = t(PRESENCE_STRING_REF[presence]);
    const node = presenceStateNode();
    node.textContent = label;
    node.dataset.presenceState = presence;
    windowElement.dataset.vesselPresenceState = presence;
    windowElement.dataset.attentionSourceRef = attentionSourceRef ?? '';
    windowElement.setAttribute('aria-label',`${t('vex.visible.name')} · ${label}`);
    return presence;
  }
  function avoidDeclaredControls({ recoverPreferred = true } = {}) {
    if (windowElement.hidden) return false;
    const current = snapshotGeometry();
    const protectedRects = visibleProtectedRects();
    const preferred = recoverPreferred ? preferredResolvedPlacement(current) : null;
    if (preferred && !protectedRects.some((protectedRect)=>overlaps(rectFor(preferred),protectedRect))) {
      const changed = !samePlacement(current,preferred);
      if (changed) applyPlacement(preferred,{size:!state.guideMinimized});
      resolvedGeometry={...preferred,resolution:'PREFERRED_SAFE'};
      return changed;
    }
    if (!protectedRects.some((protectedRect) => overlaps(rectFor(current), protectedRect))) {
      resolvedGeometry={...current,resolution:preferredGeometry?'CURRENT_SAFE_PREFERRED_UNAVAILABLE':'CURRENT_SAFE_DEFAULT'};
      return false;
    }
    const viewport = { width: window.innerWidth, height: window.innerHeight }; const rawCandidates = [];
    for (const protectedRect of protectedRects) rawCandidates.push({ left: current.left, top: protectedRect.bottom + SAFE_MARGIN }, { left: protectedRect.left - current.width - SAFE_MARGIN, top: current.top }, { left: protectedRect.right + SAFE_MARGIN, top: current.top }, { left: current.left, top: protectedRect.top - current.height - SAFE_MARGIN });
    rawCandidates.push({ left: SAFE_MARGIN, top: viewport.height - current.height - SAFE_MARGIN }, { left: viewport.width - current.width - SAFE_MARGIN, top: viewport.height - current.height - SAFE_MARGIN });
    const candidates = rawCandidates.map((candidate) => ({ left: Math.max(SAFE_MARGIN, Math.min(viewport.width - current.width - SAFE_MARGIN, candidate.left)), top: Math.max(SAFE_MARGIN, Math.min(viewport.height - current.height - SAFE_MARGIN, candidate.top)) })).map((candidate) => ({ ...candidate, width:current.width, height:current.height, rect: rectFor({ ...candidate, width: current.width, height: current.height }) })).filter((candidate) => !protectedRects.some((protectedRect) => overlaps(candidate.rect, protectedRect))).sort((left, right) => ((left.left-current.left)**2+(left.top-current.top)**2)-((right.left-current.left)**2+(right.top-current.top)**2));
    const target = candidates[0] ?? null; if (!target) { resolvedGeometry={...current,resolution:'NO_SAFE_CANDIDATE'}; return false; }
    applyPlacement(target);
    resolvedGeometry={left:target.left,top:target.top,width:current.width,height:current.height,resolution:'AUTO_OBSTRUCTION_RESOLVED'};
    return true;
  }
  function updateFrame() {
    const frame = navigation.semanticFrame(); const selected = elementByRef.get(frame.selectedNodeRef);
    $('#guideBreadcrumb').textContent = `${t(chat.currentProject().stringRef)} · ${t(chat.currentThread().stringRef)} · ${t(chat.currentChannel().labelRef)}`;
    $('#guideTrajectory').textContent = t('guide.trajectory', { screenRef: frame.screenRef, selectedNodeRef: selected?.ref || frame.selectedNodeRef, steps: navigation.journeyProjection().fullEventCount });
    projectPresenceState();
    avoidDeclaredControls();
  }
  function evaluateActionTarget(targetNodeRef, frame = navigation.semanticFrame()) {
    const contract = elementByRef.get(targetNodeRef) ?? null;
    const base = {
      state: 'UNAVAILABLE',
      screenRef: frame.screenRef,
      targetNodeRef,
      actionRef: contract?.actionRef ?? null,
      labelStringRef: contract?.brief ?? null,
      permissionRef: contract?.permissionRef ?? null
    };
    if (!contract || contract.kind !== 'ELEMENT') return { ...base, reason: 'CANONICAL_TARGET_MISSING' };
    if (!contract.actionRef) return { ...base, reason: 'CANONICAL_ACTION_MISSING' };
    if (contract.screenRef !== frame.screenRef) return { ...base, reason: 'TARGET_OUTSIDE_CURRENT_FRAME' };
    if (contract.permissionRef) return { ...base, reason: 'PERMISSION_NOT_ADMITTED_BY_GUIDE' };
    const target = $(`[data-node-ref="${CSS.escape(targetNodeRef)}"]`);
    if (!target) return { ...base, reason: 'RENDERED_TARGET_MISSING' };
    if (target.closest('[hidden], [aria-hidden="true"]')) return { ...base, reason: 'RENDERED_TARGET_HIDDEN' };
    if (target.matches(':disabled') || target.getAttribute('aria-disabled') === 'true') return { ...base, reason: 'RENDERED_TARGET_DISABLED' };
    const style = getComputedStyle(target);
    if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none' || target.getClientRects().length === 0) return { ...base, reason: 'RENDERED_TARGET_NOT_DISCOVERABLE' };
    return { ...base, state: 'AVAILABLE', reason: 'CURRENT_RENDERED_TARGET_EXECUTABLE' };
  }
  function nextRecommendation(frame = navigation.semanticFrame()) {
    const targetNodeRef = NEXT_TARGET_BY_SCREEN[frame.screenRef] ?? null;
    if (!targetNodeRef) return { state: 'UNAVAILABLE', screenRef: frame.screenRef, actionRef: null, targetNodeRef: null, labelStringRef: null, permissionRef: null, reason: 'NO_CURRENT_FRAME_ACTION_CANDIDATE', evaluated: [] };
    const candidate = evaluateActionTarget(targetNodeRef, frame);
    if (candidate.state === 'AVAILABLE') return { ...candidate, evaluated: [candidate] };
    return { state: 'UNAVAILABLE', screenRef: frame.screenRef, actionRef: null, targetNodeRef: null, labelStringRef: null, permissionRef: null, reason: 'NO_CURRENT_EXECUTABLE_RECOMMENDATION', evaluated: [candidate] };
  }
  function responseForIntent(intentRef) {
    const frame = navigation.semanticFrame(); const selected = elementByRef.get(frame.selectedNodeRef);
    if (intentRef === GUIDE_INTENTS.CURRENT) return { contentRef: 'guide.answer.current', contentParams: { ...frame, selectedNodeRef: selected?.ref || frame.selectedNodeRef } };
    if (intentRef === GUIDE_INTENTS.NEXT) {
      const recommendation = nextRecommendation(frame);
      return recommendation.state === 'AVAILABLE'
        ? { contentRef: recommendation.labelStringRef, contentParams: {}, recommendation }
        : { contentRef: 'health.value.unavailable', contentParams: {}, recommendation };
    }
    if (intentRef === GUIDE_INTENTS.PROTECTS) return { contentRef: 'guide.answer.protects', contentParams: {} };
    if (intentRef === GUIDE_INTENTS.ARCHITECTURE) return { contentRef: 'guide.answer.architecture', contentParams: {} };
    throw new Error(`Unknown Guide intentRef: ${intentRef}`);
  }
  function renderMessages() {
    const host = $('#guideMessages'); host.replaceChildren();
    for (const record of records) { const div = document.createElement('div'); div.className = `guide-message ${record.kind}`; div.dataset.componentRef = 'component.vexlife.guide-message'; div.dataset.instanceRef = record.instanceRef; if (record.intentRef) div.dataset.intentRef = record.intentRef; if (record.contentRef) div.dataset.contentRef = record.contentRef; div.textContent = record.contentRef ? t(record.contentRef, record.contentParams) : record.content; host.append(div); }
    host.scrollTop = host.scrollHeight;
  }
  function addMessage(kind, payload) { const normalized = typeof payload === 'string' ? { content: payload } : payload; records.push({ kind, content: normalized.content ?? null, contentRef: normalized.contentRef ?? null, contentParams: normalized.contentParams ?? {}, intentRef: normalized.intentRef ?? null, instanceRef: `instance.guide-message.${crypto.randomUUID()}` }); renderMessages(); }
  function beginActiveConversation() { activeConversation=true; explicitSummoned=true; attentionSourceRef=null; if (!state.guideMinimized) projectPresenceState(); }
  function askIntent(intentRef) { const promptRef = PROMPT_REF_BY_INTENT[intentRef]; if (!promptRef) throw new Error(`Unknown Guide intentRef: ${intentRef}`); beginActiveConversation(); addMessage('user', { contentRef: promptRef, intentRef }); addMessage('guide', { ...responseForIntent(intentRef), intentRef }); }
  function ask(question) { beginActiveConversation(); addMessage('user', question); addMessage('guide', { contentRef: 'guide.answer.freeform', contentParams: { question } }); }
  function setAttentionSource(sourceRef = null) {
    if (sourceRef !== null && !elementByRef.has(sourceRef)) throw new Error(`Unknown attentive sourceRef: ${sourceRef}`);
    attentionSourceRef=sourceRef;
    projectPresenceState();
    return currentPresenceState();
  }
  function setOpen(open, { focus = false, explicit = false } = {}) {
    state.guideOpen = Boolean(open);
    windowElement.hidden = !state.guideOpen;
    localStorage.setItem('vexlife.guide.open', String(state.guideOpen));
    if (!state.guideOpen) { activeConversation=false; explicitSummoned=false; projectPresenceState(); return; }
    windowElement.classList.toggle('is-minimized', state.guideMinimized === true);
    if (explicit && !state.guideMinimized) explicitSummoned=true;
    if (!state.guideMinimized) restorePreferredGeometry();
    updateFrame();
    if (focus && !state.guideMinimized) $('#guideInput')?.focus();
  }
  function summon() {
    navigation.navigate('element.vex.summon', {}, 'action.vex.summon');
    state.guideMinimized = false;
    localStorage.setItem('vexlife.guide.minimized', 'false');
    windowElement.classList.remove('is-minimized');
    activeConversation=false;
    explicitSummoned=true;
    attentionSourceRef=null;
    restorePreferredGeometry();
    setOpen(true, { focus: true, explicit:true });
  }
  function persistPreferredGeometry() {
    preferredGeometry=snapshotGeometry();
    saveJson(PREFERRED_GEOMETRY_KEY, preferredGeometry);
    return structuredClone(preferredGeometry);
  }
  function settleHumanGeometry() { persistPreferredGeometry(); avoidDeclaredControls({recoverPreferred:false}); projectPresenceState(); }
  function restorePreferredGeometry() {
    if (!preferredGeometry) return false;
    const current=snapshotGeometry();
    const preferred=normalizePlacement(preferredGeometry,current);
    applyPlacement(preferred,{size:!state.guideMinimized});
    resolvedGeometry={...snapshotGeometry(),resolution:'RESTORED_PREFERRED'};
    return true;
  }
  function preferredGeometrySnapshot(){return preferredGeometry?structuredClone(preferredGeometry):null;}
  function resolvedGeometrySnapshot(){return resolvedGeometry?structuredClone(resolvedGeometry):structuredClone(snapshotGeometry());}
  function makeDraggable() {
    const handle = $('#guideHandle'); let drag = null;
    handle.addEventListener('pointerdown', (event) => { if (event.target.closest('button')) return; const rect = windowElement.getBoundingClientRect(); drag = { x:event.clientX,y:event.clientY,left:rect.left,top:rect.top }; handle.setPointerCapture(event.pointerId); });
    handle.addEventListener('pointermove', (event) => { if (!drag || !handle.hasPointerCapture(event.pointerId)) return; const left=Math.max(4,Math.min(window.innerWidth-120,drag.left+event.clientX-drag.x)); const top=Math.max(4,Math.min(window.innerHeight-64,drag.top+event.clientY-drag.y)); windowElement.style.left=`${left}px`; windowElement.style.top=`${top}px`; windowElement.style.right='auto'; windowElement.style.bottom='auto'; });
    handle.addEventListener('pointerup', (event) => { if (!drag) return; handle.releasePointerCapture(event.pointerId); drag=null; settleHumanGeometry(); });
  }
  function resizeFromCorner(corner, deltaX, deltaY, origin) {
    let { left, top, width, height } = origin; if (corner.includes('e')) width += deltaX; if (corner.includes('s')) height += deltaY; if (corner.includes('w')) { width -= deltaX; left += deltaX; } if (corner.includes('n')) { height -= deltaY; top += deltaY; }
    if (width < MIN_WIDTH) { if (corner.includes('w')) left -= MIN_WIDTH - width; width = MIN_WIDTH; } if (height < MIN_HEIGHT) { if (corner.includes('n')) top -= MIN_HEIGHT - height; height = MIN_HEIGHT; }
    width = Math.min(width, window.innerWidth - Math.max(4,left) - 4); height = Math.min(height, window.innerHeight - Math.max(4,top) - 4); windowElement.style.left=`${Math.max(4,left)}px`; windowElement.style.top=`${Math.max(4,top)}px`; windowElement.style.right='auto'; windowElement.style.bottom='auto'; windowElement.style.width=`${width}px`; windowElement.style.height=`${height}px`;
  }
  function makeResizable() {
    $$('[data-resize-corner]').forEach((handle) => { let drag = null; const corner = handle.dataset.resizeCorner;
      handle.addEventListener('pointerdown', (event) => { const rect=windowElement.getBoundingClientRect(); drag={x:event.clientX,y:event.clientY,origin:{left:rect.left,top:rect.top,width:rect.width,height:rect.height}}; handle.setPointerCapture(event.pointerId); event.preventDefault(); });
      handle.addEventListener('pointermove', (event) => { if (!drag || !handle.hasPointerCapture(event.pointerId)) return; resizeFromCorner(corner,event.clientX-drag.x,event.clientY-drag.y,drag.origin); });
      handle.addEventListener('pointerup', (event) => { if (!drag) return; handle.releasePointerCapture(event.pointerId); drag=null; settleHumanGeometry(); });
      handle.addEventListener('keydown', (event) => { const step=event.shiftKey?24:8; const deltaX=event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0; const deltaY=event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0; if (!deltaX&&!deltaY) return; const rect=windowElement.getBoundingClientRect(); resizeFromCorner(corner,deltaX,deltaY,{left:rect.left,top:rect.top,width:rect.width,height:rect.height}); settleHumanGeometry(); event.preventDefault(); });
    });
  }
  $$('[data-guide-intent-ref]').forEach((button) => button.addEventListener('click', () => askIntent(button.dataset.guideIntentRef)));
  $('#guideComposer').addEventListener('submit', (event) => { event.preventDefault(); const input=$('#guideInput'); const value=input.value.trim(); if (!value) return; ask(value); input.value=''; });
  $('#guideToggle')?.addEventListener('click', () => setOpen(!state.guideOpen, { focus: !state.guideOpen, explicit:true }));
  $('#vexSummon')?.addEventListener('click', summon);
  $('#guideClose').addEventListener('click', () => setOpen(false,{explicit:true}));
  $('#guideMinimize').addEventListener('click', () => {
    state.guideMinimized=!state.guideMinimized;
    localStorage.setItem('vexlife.guide.minimized', String(state.guideMinimized));
    windowElement.classList.toggle('is-minimized',state.guideMinimized);
    activeConversation=false;
    if (state.guideMinimized) explicitSummoned=false;
    else { explicitSummoned=true; attentionSourceRef=null; restorePreferredGeometry(); }
    projectPresenceState();
    avoidDeclaredControls();
  });
  windowElement.classList.toggle('is-minimized', state.guideMinimized === true);
  restorePreferredGeometry(); makeDraggable(); makeResizable(); projectPresenceState();
  return {
    updateFrame,
    responseForIntent,
    evaluateActionTarget,
    nextRecommendation,
    askIntent,
    ask,
    addMessage,
    renderMessages,
    setOpen,
    summon,
    setAttentionSource,
    currentPresenceState,
    projectPresenceState,
    preferredGeometry:preferredGeometrySnapshot,
    resolvedGeometry:resolvedGeometrySnapshot,
    persistGeometry:persistPreferredGeometry,
    persistPreferredGeometry,
    restorePreferredGeometry,
    avoidDeclaredControls
  };
}

// [VXG RealForever]
