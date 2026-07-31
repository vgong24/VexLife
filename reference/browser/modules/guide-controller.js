import { $, $$, loadJson, saveJson } from './dom.js';

export const GUIDE_INTENTS = Object.freeze({
  CURRENT: 'intent.guide.current',
  NEXT: 'intent.guide.next',
  PROTECTS: 'intent.guide.protects',
  ARCHITECTURE: 'intent.guide.architecture'
});

const PROMPT_REF_BY_INTENT = Object.freeze({
  [GUIDE_INTENTS.CURRENT]: 'guide.ask.current',
  [GUIDE_INTENTS.NEXT]: 'guide.mode.next',
  [GUIDE_INTENTS.PROTECTS]: 'guide.ask.protects',
  [GUIDE_INTENTS.ARCHITECTURE]: 'architecture.open'
});

export function createGuideController({ state, t, navigation, elementByRef, chat }) {
  const records = [];

  function updateFrame() {
    const frame = navigation.semanticFrame();
    const selected = elementByRef.get(frame.selectedNodeRef);
    $('#guideBreadcrumb').textContent = `${t(chat.currentProject().stringRef)} · ${t(chat.currentThread().stringRef)} · ${t(chat.currentChannel().labelRef)}`;
    $('#guideTrajectory').textContent = t('guide.trajectory', {
      screenRef: frame.screenRef,
      selectedNodeRef: selected?.ref || frame.selectedNodeRef,
      steps: state.journey.length
    });
  }

  function responseForIntent(intentRef) {
    const frame = navigation.semanticFrame();
    const selected = elementByRef.get(frame.selectedNodeRef);
    if (intentRef === GUIDE_INTENTS.CURRENT) {
      return {
        contentRef: 'guide.answer.current',
        contentParams: {
          screenRef: frame.screenRef,
          routeRef: frame.routeRef,
          projectRef: frame.projectRef,
          threadRef: frame.threadRef,
          channelRef: frame.channelRef,
          selectedNodeRef: selected?.ref || frame.selectedNodeRef
        }
      };
    }
    if (intentRef === GUIDE_INTENTS.NEXT) {
      return { contentRef: state.view === 'terrain' ? 'guide.answer.next.terrain' : 'guide.answer.next.chat', contentParams: {} };
    }
    if (intentRef === GUIDE_INTENTS.PROTECTS) {
      return { contentRef: 'guide.answer.protects', contentParams: {} };
    }
    if (intentRef === GUIDE_INTENTS.ARCHITECTURE) {
      return { contentRef: 'guide.answer.architecture', contentParams: {} };
    }
    throw new Error(`Unknown Guide intentRef: ${intentRef}`);
  }

  function renderMessages() {
    const host = $('#guideMessages');
    host.replaceChildren();
    for (const record of records) {
      const div = document.createElement('div');
      div.className = `guide-message ${record.kind}`;
      div.dataset.componentRef = 'component.vexlife.guide-message';
      div.dataset.instanceRef = record.instanceRef;
      if (record.intentRef) div.dataset.intentRef = record.intentRef;
      if (record.contentRef) div.dataset.contentRef = record.contentRef;
      div.textContent = record.contentRef ? t(record.contentRef, record.contentParams) : record.content;
      host.append(div);
    }
    host.scrollTop = host.scrollHeight;
  }

  function addMessage(kind, payload) {
    const normalized = typeof payload === 'string' ? { content: payload } : payload;
    records.push({
      kind,
      content: normalized.content ?? null,
      contentRef: normalized.contentRef ?? null,
      contentParams: normalized.contentParams ?? {},
      intentRef: normalized.intentRef ?? null,
      instanceRef: `instance.guide-message.${crypto.randomUUID()}`
    });
    renderMessages();
  }

  function askIntent(intentRef) {
    const promptRef = PROMPT_REF_BY_INTENT[intentRef];
    if (!promptRef) throw new Error(`Unknown Guide intentRef: ${intentRef}`);
    addMessage('user', { contentRef: promptRef, intentRef });
    addMessage('guide', { ...responseForIntent(intentRef), intentRef });
  }

  function ask(question) {
    addMessage('user', question);
    addMessage('guide', { contentRef: 'guide.answer.freeform', contentParams: { question } });
  }

  function setOpen(open) {
    state.guideOpen = open;
    $('#guideWindow').hidden = !open;
    localStorage.setItem('vexlife.guide.open', String(open));
    if (open) updateFrame();
  }

  function makeDraggable() {
    const windowElement = $('#guideWindow');
    const handle = $('#guideHandle');
    let drag = null;
    const saved = loadJson('vexlife.guide.position', null);
    if (saved) {
      windowElement.style.left = `${saved.left}px`;
      windowElement.style.top = `${saved.top}px`;
      windowElement.style.right = 'auto';
    }
    handle.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      const rect = windowElement.getBoundingClientRect();
      drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', (event) => {
      if (!drag || !handle.hasPointerCapture(event.pointerId)) return;
      const left = Math.max(4, Math.min(window.innerWidth - 120, drag.left + event.clientX - drag.x));
      const top = Math.max(4, Math.min(window.innerHeight - 64, drag.top + event.clientY - drag.y));
      windowElement.style.left = `${left}px`;
      windowElement.style.top = `${top}px`;
      windowElement.style.right = 'auto';
    });
    handle.addEventListener('pointerup', (event) => {
      if (!drag) return;
      handle.releasePointerCapture(event.pointerId);
      const rect = windowElement.getBoundingClientRect();
      saveJson('vexlife.guide.position', { left: rect.left, top: rect.top });
      drag = null;
    });
  }

  $$('[data-guide-intent-ref]').forEach((button) => {
    button.addEventListener('click', () => askIntent(button.dataset.guideIntentRef));
  });
  $('#guideComposer').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#guideInput');
    const value = input.value.trim();
    if (!value) return;
    ask(value);
    input.value = '';
  });
  $('#guideToggle').addEventListener('click', () => setOpen(!state.guideOpen));
  $('#guideClose').addEventListener('click', () => setOpen(false));
  $('#guideMinimize').addEventListener('click', () => {
    state.guideMinimized = !state.guideMinimized;
    $('#guideWindow').classList.toggle('is-minimized', state.guideMinimized);
  });
  makeDraggable();
  return { updateFrame, responseForIntent, askIntent, ask, addMessage, renderMessages, setOpen };
}

// [VXG RealForever]
