import { $, $$, loadJson, saveJson } from './dom.js';

export const GUIDE_INTENTS = Object.freeze({
  CURRENT: 'intent.guide.current', NEXT: 'intent.guide.next', PROTECTS: 'intent.guide.protects', ARCHITECTURE: 'intent.guide.architecture'
});
const PROMPT_REF_BY_INTENT = Object.freeze({
  [GUIDE_INTENTS.CURRENT]: 'guide.ask.current', [GUIDE_INTENTS.NEXT]: 'guide.mode.next',
  [GUIDE_INTENTS.PROTECTS]: 'guide.ask.protects', [GUIDE_INTENTS.ARCHITECTURE]: 'architecture.open'
});
const MIN_WIDTH = 320;
const MIN_HEIGHT = 330;

export function createGuideController({ state, t, navigation, elementByRef, chat }) {
  const records = [];
  const windowElement = $('#guideWindow');

  function updateFrame() {
    const frame = navigation.semanticFrame();
    const selected = elementByRef.get(frame.selectedNodeRef);
    $('#guideBreadcrumb').textContent = `${t(chat.currentProject().stringRef)} · ${t(chat.currentThread().stringRef)} · ${t(chat.currentChannel().labelRef)}`;
    $('#guideTrajectory').textContent = t('guide.trajectory', {
      screenRef: frame.screenRef, selectedNodeRef: selected?.ref || frame.selectedNodeRef,
      steps: navigation.journeyProjection().fullEventCount
    });
  }
  function responseForIntent(intentRef) {
    const frame = navigation.semanticFrame(); const selected = elementByRef.get(frame.selectedNodeRef);
    if (intentRef === GUIDE_INTENTS.CURRENT) return { contentRef: 'guide.answer.current', contentParams: { ...frame, selectedNodeRef: selected?.ref || frame.selectedNodeRef } };
    if (intentRef === GUIDE_INTENTS.NEXT) return { contentRef: state.view === 'terrain' ? 'guide.answer.next.terrain' : 'guide.answer.next.chat', contentParams: {} };
    if (intentRef === GUIDE_INTENTS.PROTECTS) return { contentRef: 'guide.answer.protects', contentParams: {} };
    if (intentRef === GUIDE_INTENTS.ARCHITECTURE) return { contentRef: 'guide.answer.architecture', contentParams: {} };
    throw new Error(`Unknown Guide intentRef: ${intentRef}`);
  }
  function renderMessages() {
    const host = $('#guideMessages'); host.replaceChildren();
    for (const record of records) {
      const div = document.createElement('div'); div.className = `guide-message ${record.kind}`;
      div.dataset.componentRef = 'component.vexlife.guide-message'; div.dataset.instanceRef = record.instanceRef;
      if (record.intentRef) div.dataset.intentRef = record.intentRef; if (record.contentRef) div.dataset.contentRef = record.contentRef;
      div.textContent = record.contentRef ? t(record.contentRef, record.contentParams) : record.content; host.append(div);
    }
    host.scrollTop = host.scrollHeight;
  }
  function addMessage(kind, payload) {
    const normalized = typeof payload === 'string' ? { content: payload } : payload;
    records.push({ kind, content: normalized.content ?? null, contentRef: normalized.contentRef ?? null,
      contentParams: normalized.contentParams ?? {}, intentRef: normalized.intentRef ?? null,
      instanceRef: `instance.guide-message.${crypto.randomUUID()}` }); renderMessages();
  }
  function askIntent(intentRef) {
    const promptRef = PROMPT_REF_BY_INTENT[intentRef]; if (!promptRef) throw new Error(`Unknown Guide intentRef: ${intentRef}`);
    addMessage('user', { contentRef: promptRef, intentRef }); addMessage('guide', { ...responseForIntent(intentRef), intentRef });
  }
  function ask(question) { addMessage('user', question); addMessage('guide', { contentRef: 'guide.answer.freeform', contentParams: { question } }); }
  function setOpen(open, { focus = false } = {}) {
    state.guideOpen = open; windowElement.hidden = !open; localStorage.setItem('vexlife.guide.open', String(open));
    if (open) { updateFrame(); if (focus) $('#guideInput')?.focus(); }
  }
  function summon() {
    navigation.navigate('element.vex.summon', {}, 'action.vex.summon');
    setOpen(true, { focus: true });
  }
  function persistGeometry() {
    const rect = windowElement.getBoundingClientRect();
    saveJson('vexlife.guide.geometry', { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  }
  function restoreGeometry() {
    const saved = loadJson('vexlife.guide.geometry', loadJson('vexlife.guide.position', null)); if (!saved) return;
    if (Number.isFinite(saved.left)) { windowElement.style.left = `${saved.left}px`; windowElement.style.right = 'auto'; }
    if (Number.isFinite(saved.top)) windowElement.style.top = `${saved.top}px`;
    if (Number.isFinite(saved.width)) windowElement.style.width = `${Math.max(MIN_WIDTH, saved.width)}px`;
    if (Number.isFinite(saved.height)) windowElement.style.height = `${Math.max(MIN_HEIGHT, saved.height)}px`;
  }
  function makeDraggable() {
    const handle = $('#guideHandle'); let drag = null;
    handle.addEventListener('pointerdown', (event) => { if (event.target.closest('button')) return; const rect = windowElement.getBoundingClientRect(); drag = { x:event.clientX,y:event.clientY,left:rect.left,top:rect.top }; handle.setPointerCapture(event.pointerId); });
    handle.addEventListener('pointermove', (event) => { if (!drag || !handle.hasPointerCapture(event.pointerId)) return; const left=Math.max(4,Math.min(window.innerWidth-120,drag.left+event.clientX-drag.x)); const top=Math.max(4,Math.min(window.innerHeight-64,drag.top+event.clientY-drag.y)); windowElement.style.left=`${left}px`; windowElement.style.top=`${top}px`; windowElement.style.right='auto'; });
    handle.addEventListener('pointerup', (event) => { if (!drag) return; handle.releasePointerCapture(event.pointerId); drag=null; persistGeometry(); });
  }
  function resizeFromCorner(corner, deltaX, deltaY, origin) {
    let { left, top, width, height } = origin;
    if (corner.includes('e')) width += deltaX; if (corner.includes('s')) height += deltaY;
    if (corner.includes('w')) { width -= deltaX; left += deltaX; } if (corner.includes('n')) { height -= deltaY; top += deltaY; }
    if (width < MIN_WIDTH) { if (corner.includes('w')) left -= MIN_WIDTH - width; width = MIN_WIDTH; }
    if (height < MIN_HEIGHT) { if (corner.includes('n')) top -= MIN_HEIGHT - height; height = MIN_HEIGHT; }
    width = Math.min(width, window.innerWidth - Math.max(4,left) - 4); height = Math.min(height, window.innerHeight - Math.max(4,top) - 4);
    windowElement.style.left=`${Math.max(4,left)}px`; windowElement.style.top=`${Math.max(4,top)}px`; windowElement.style.right='auto'; windowElement.style.width=`${width}px`; windowElement.style.height=`${height}px`;
  }
  function makeResizable() {
    $$('[data-resize-corner]').forEach((handle) => {
      let drag = null; const corner = handle.dataset.resizeCorner;
      handle.addEventListener('pointerdown', (event) => { const rect=windowElement.getBoundingClientRect(); drag={x:event.clientX,y:event.clientY,origin:{left:rect.left,top:rect.top,width:rect.width,height:rect.height}}; handle.setPointerCapture(event.pointerId); event.preventDefault(); });
      handle.addEventListener('pointermove', (event) => { if (!drag || !handle.hasPointerCapture(event.pointerId)) return; resizeFromCorner(corner,event.clientX-drag.x,event.clientY-drag.y,drag.origin); });
      handle.addEventListener('pointerup', (event) => { if (!drag) return; handle.releasePointerCapture(event.pointerId); drag=null; persistGeometry(); });
      handle.addEventListener('keydown', (event) => { const step=event.shiftKey?24:8; const deltaX=event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0; const deltaY=event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0; if (!deltaX&&!deltaY) return; const rect=windowElement.getBoundingClientRect(); resizeFromCorner(corner,deltaX,deltaY,{left:rect.left,top:rect.top,width:rect.width,height:rect.height}); persistGeometry(); event.preventDefault(); });
    });
  }
  $$('[data-guide-intent-ref]').forEach((button) => button.addEventListener('click', () => askIntent(button.dataset.guideIntentRef)));
  $('#guideComposer').addEventListener('submit', (event) => { event.preventDefault(); const input=$('#guideInput'); const value=input.value.trim(); if (!value) return; ask(value); input.value=''; });
  $('#guideToggle').addEventListener('click', () => setOpen(!state.guideOpen, { focus: !state.guideOpen }));
  $('#vexSummon')?.addEventListener('click', summon);
  $('#guideClose').addEventListener('click', () => setOpen(false));
  $('#guideMinimize').addEventListener('click', () => { state.guideMinimized=!state.guideMinimized; windowElement.classList.toggle('is-minimized',state.guideMinimized); });
  restoreGeometry(); makeDraggable(); makeResizable();
  return { updateFrame, responseForIntent, askIntent, ask, addMessage, renderMessages, setOpen, summon, persistGeometry };
}

// [VXG RealForever]
