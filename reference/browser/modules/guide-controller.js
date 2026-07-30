import { $, $$, loadJson, saveJson } from './dom.js';

export function createGuideController({ state, t, navigation, elementByRef, chat }) {
  function updateFrame() {
    const frame = navigation.semanticFrame(); const selected = elementByRef.get(frame.selectedNodeRef);
    $('#guideBreadcrumb').textContent = `${chat.currentProject().stringRef ? t(chat.currentProject().stringRef) : chat.currentProject().title} · ${chat.currentThread().stringRef ? t(chat.currentThread().stringRef) : chat.currentThread().title} · ${t(chat.currentChannel().labelRef)}`;
    $('#guideTrajectory').textContent = `${frame.screenRef} · selected ${selected?.ref || frame.selectedNodeRef} · ${state.journey.length} semantic steps retained`;
  }
  function answer(question) {
    const frame = navigation.semanticFrame(); const selected = elementByRef.get(frame.selectedNodeRef);
    if (/protect|safe|delete/i.test(question)) return 'The current interface separates visible capability, permission, effect admission, and recovery. Destructive actions require impact disclosure and exact confirmation; raw history remains preserved behind recoverable state transitions.';
    if (/next|recommend/i.test(question)) return state.view === 'terrain' ? 'Select or drag a node, then collapse its children. The user layout changes; canonical parent relationships do not.' : 'Continue in the selected addressed channel, or add explicit participants to the group. Switching channels will not silently change the responder in place.';
    return `You are on ${frame.screenRef}, route ${frame.routeRef}, in project ${frame.projectRef}, thread ${frame.threadRef}, channel ${frame.channelRef}. The selected node is ${selected?.ref || frame.selectedNodeRef}. This frame comes from semantic element identities and journey events, not from recording every pointer click.`;
  }
  function addMessage(kind, content) {
    const div = document.createElement('div'); div.className = `guide-message ${kind}`;
    div.dataset.componentRef = 'component.vexlife.guide-message'; div.dataset.instanceRef = `instance.guide-message.${crypto.randomUUID()}`;
    div.textContent = content; $('#guideMessages').append(div); $('#guideMessages').scrollTop = $('#guideMessages').scrollHeight;
  }
  function ask(question) { addMessage('user', question); addMessage('guide', answer(question)); }
  function setOpen(open) {
    state.guideOpen = open; $('#guideWindow').hidden = !open; localStorage.setItem('vexlife.guide.open', String(open)); if (open) updateFrame();
  }
  function makeDraggable() {
    const windowElement = $('#guideWindow'); const handle = $('#guideHandle'); let drag = null;
    const saved = loadJson('vexlife.guide.position', null);
    if (saved) { windowElement.style.left = `${saved.left}px`; windowElement.style.top = `${saved.top}px`; windowElement.style.right = 'auto'; }
    handle.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      const rect = windowElement.getBoundingClientRect(); drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', (event) => {
      if (!drag || !handle.hasPointerCapture(event.pointerId)) return;
      const left = Math.max(4, Math.min(window.innerWidth - 120, drag.left + event.clientX - drag.x));
      const top = Math.max(4, Math.min(window.innerHeight - 64, drag.top + event.clientY - drag.y));
      windowElement.style.left = `${left}px`; windowElement.style.top = `${top}px`; windowElement.style.right = 'auto';
    });
    handle.addEventListener('pointerup', (event) => {
      if (!drag) return; handle.releasePointerCapture(event.pointerId);
      const rect = windowElement.getBoundingClientRect(); saveJson('vexlife.guide.position', { left: rect.left, top: rect.top }); drag = null;
    });
  }
  $$('[data-guide-question]').forEach((button) => button.addEventListener('click', () => ask(button.textContent.trim())));
  $('#guideComposer').addEventListener('submit', (event) => {
    event.preventDefault(); const input = $('#guideInput'); const value = input.value.trim(); if (!value) return; ask(value); input.value = '';
  });
  $('#guideToggle').addEventListener('click', () => setOpen(!state.guideOpen));
  $('#guideClose').addEventListener('click', () => setOpen(false));
  $('#guideMinimize').addEventListener('click', () => { state.guideMinimized = !state.guideMinimized; $('#guideWindow').classList.toggle('is-minimized', state.guideMinimized); });
  makeDraggable();
  return { updateFrame, answer, ask, addMessage, setOpen };
}

// [VXG RealForever]
