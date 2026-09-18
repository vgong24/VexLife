export const $ = (selector, parent = document) => parent.querySelector(selector);
export const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

export function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
}
export function compileInterfaceEntries(source) {
  const entries = [];
  for (const screen of source.screens) {
    entries.push({ ref: screen.screenRef, kind: 'SCREEN', brief: screen.titleStringRef, parentRef: null, routeRef: screen.routeRef });
    for (const region of screen.regions) {
      entries.push({ ref: region.regionRef, kind: 'REGION', brief: region.labelStringRef, parentRef: screen.screenRef, screenRef: screen.screenRef });
      for (const element of region.elements) entries.push({
        ref: element.elementRef, kind: 'ELEMENT', brief: element.labelStringRef,
        parentRef: region.regionRef, screenRef: screen.screenRef, actionRef: element.actionRef,
        navigationRef: element.navigationRef, selectionGroupRef: element.selectionGroupRef,
        permissionRef: element.permissionRef
      });
    }
  }
  return entries;
}

// [VXG RealForever]
