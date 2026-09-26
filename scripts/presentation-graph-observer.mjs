#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeJson } from '../src/core/utils.mjs';
import { loadPresentationRegistry } from './presentation-graph.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');

const RAW_INPUT_NAMES = new Set([
  'POINTER_MOVE',
  'MOUSE_MOVE',
  'TOUCH_MOVE',
  'POINTER_RAW_UPDATE',
  'RAW_POINTER_STREAM'
]);

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) freeze(item);
  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function canonicalTimestamp(value, label = 'timestamp') {
  if (typeof value !== 'string' || !value) throw new Error(`${label} is required`);
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    throw new Error(`${label} must be canonical ISO-8601 UTC`);
  }
  return epoch;
}

function normalizeRect(rect) {
  if (rect === null || rect === undefined) return null;
  const output = {
    x: Number(rect.x ?? rect.left ?? 0),
    y: Number(rect.y ?? rect.top ?? 0),
    width: Number(rect.width ?? 0),
    height: Number(rect.height ?? 0)
  };
  for (const [key, value] of Object.entries(output)) {
    if (!Number.isFinite(value)) throw new Error(`rect.${key} must be finite`);
  }
  return output;
}

function right(rect) { return rect.x + rect.width; }
function bottom(rect) { return rect.y + rect.height; }

function intersection(left, rightRect) {
  if (!left || !rightRect) return null;
  const x1 = Math.max(left.x, rightRect.x);
  const y1 = Math.max(left.y, rightRect.y);
  const x2 = Math.min(right(left), right(rightRect));
  const y2 = Math.min(bottom(left), bottom(rightRect));
  if (x2 <= x1 || y2 <= y1) return { x: x1, y: y1, width: 0, height: 0 };
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function area(rect) {
  return rect ? Math.max(0, rect.width) * Math.max(0, rect.height) : 0;
}

function normalizedParentRect(elementRect, parentRect) {
  if (!elementRect || !parentRect || parentRect.width <= 0 || parentRect.height <= 0) return null;
  return {
    x: (elementRect.x - parentRect.x) / parentRect.width,
    y: (elementRect.y - parentRect.y) / parentRect.height,
    width: elementRect.width / parentRect.width,
    height: elementRect.height / parentRect.height
  };
}

export function createGeometrySnapshot({
  coordinateSpace,
  viewportRect = null,
  windowRect = null,
  screenRect = null,
  activeSurfaceRect = null,
  parentRect = null,
  elementRect = null,
  declaredParentRef = null,
  observedParentRef = null,
  targetWidth = null,
  targetHeight = null,
  occlusionRefs = [],
  occlusionFraction = 0
} = {}, { allowedCoordinateSpaces = null } = {}) {
  if (typeof coordinateSpace !== 'string' || !coordinateSpace) throw new Error('coordinateSpace is required');
  if (allowedCoordinateSpaces && !allowedCoordinateSpaces.includes(coordinateSpace)) {
    throw new Error(`unsupported coordinateSpace ${coordinateSpace}`);
  }
  const normalized = {
    viewportRect: normalizeRect(viewportRect),
    windowRect: normalizeRect(windowRect),
    screenRect: normalizeRect(screenRect),
    activeSurfaceRect: normalizeRect(activeSurfaceRect),
    parentRect: normalizeRect(parentRect),
    elementRect: normalizeRect(elementRect)
  };
  const elementArea = area(normalized.elementRect);
  const parentIntersection = intersection(normalized.elementRect, normalized.parentRect);
  const visibleFraction = elementArea > 0 && parentIntersection ? area(parentIntersection) / elementArea : (elementArea === 0 ? 0 : 1);
  const outOfBoundsPx = normalized.elementRect && normalized.parentRect ? {
    left: Math.max(0, normalized.parentRect.x - normalized.elementRect.x),
    top: Math.max(0, normalized.parentRect.y - normalized.elementRect.y),
    right: Math.max(0, right(normalized.elementRect) - right(normalized.parentRect)),
    bottom: Math.max(0, bottom(normalized.elementRect) - bottom(normalized.parentRect))
  } : null;
  const outOfBounds = outOfBoundsPx ? Object.values(outOfBoundsPx).some((value) => value > 0) : false;
  const clipped = visibleFraction < 1;
  return freeze({
    schemaVersion: 'vexlife.geometry-snapshot/v1',
    coordinateSpace,
    ...normalized,
    normalizedParentRect: normalizedParentRect(normalized.elementRect, normalized.parentRect),
    visibleFraction,
    clipped,
    outOfBounds,
    outOfBoundsPx,
    declaredParentRef,
    observedParentRef,
    targetWidth: targetWidth === null ? null : Number(targetWidth),
    targetHeight: targetHeight === null ? null : Number(targetHeight),
    occlusionRefs: [...occlusionRefs],
    occlusionFraction: Number(occlusionFraction)
  });
}

export function normalizeExecutionContext(value) {
  if (value === null || value === undefined) return null;
  const required = [
    'executionContextRef',
    'parentExecutionContextRefOrNull',
    'concurrencyGroupRefOrNull',
    'ownerScreenRefOrNull',
    'ownerComponentRefOrNull',
    'ownerActionRefOrNull',
    'supervisionPolicy',
    'cancellationScopeRefOrNull',
    'startedAt',
    'endedAtOrNull',
    'terminalStateOrNull',
    'failureClassOrNull'
  ];
  for (const field of required) {
    if (!Object.hasOwn(value, field)) throw new Error(`ExecutionContext missing ${field}`);
  }
  canonicalTimestamp(value.startedAt, 'ExecutionContext.startedAt');
  if (value.endedAtOrNull !== null) {
    const start = canonicalTimestamp(value.startedAt, 'ExecutionContext.startedAt');
    const end = canonicalTimestamp(value.endedAtOrNull, 'ExecutionContext.endedAtOrNull');
    if (end < start) throw new Error('ExecutionContext endedAtOrNull precedes startedAt');
  }
  return freeze(clone(value));
}

export function projectJourneyEvent(journeyEvent, {
  semanticContext = null,
  presentationContext = null,
  geometry = null,
  executionContext = null
} = {}) {
  if (!journeyEvent || typeof journeyEvent !== 'object') throw new Error('journeyEvent is required');
  const canonicalRef = journeyEvent.journeyRef ?? journeyEvent.eventRef ?? null;
  if (!canonicalRef) throw new Error('journeyEvent requires a canonical ref');
  if (journeyEvent.formedAt) canonicalTimestamp(journeyEvent.formedAt, 'journeyEvent.formedAt');
  return freeze({
    schemaVersion: 'vexlife.presentation-journey-projection/v1',
    canonicalJourneyRef: canonicalRef,
    canonicalJourneyEvent: clone(journeyEvent),
    semanticContext: semanticContext ? clone(semanticContext) : null,
    presentationContext: presentationContext ? clone(presentationContext) : null,
    geometry,
    executionContext: normalizeExecutionContext(executionContext),
    semanticAuthority: false,
    journeyAuthority: 'CANONICAL_JOURNEY'
  });
}

export function createPresentationObserver({
  eventClasses,
  coordinateSpaces,
  clock = () => new Date().toISOString(),
  maxEvents = 256
} = {}) {
  const allowed = new Set(eventClasses ?? []);
  if (!allowed.size) throw new Error('eventClasses must be non-empty');
  if (!Number.isInteger(maxEvents) || maxEvents < 1) throw new Error('maxEvents must be a positive integer');
  const events = [];
  let sequence = 0;

  function record({
    eventClass,
    semanticContext = null,
    provenance = null,
    presentationContext = null,
    geometry = null,
    executionContext = null,
    journeyEventRef = null,
    stateBefore = null,
    stateAfter = null,
    evidenceRefs = []
  }) {
    if (RAW_INPUT_NAMES.has(eventClass)) throw new Error(`raw input event is not a canonical presentation event: ${eventClass}`);
    if (!allowed.has(eventClass)) throw new Error(`unsupported presentation event class ${eventClass}`);
    const formedAt = clock();
    canonicalTimestamp(formedAt, 'formedAt');
    sequence += 1;
    const event = freeze({
      schemaVersion: 'vexlife.runtime-presentation-event/v1',
      eventRef: `event.presentation.runtime.${sequence}`,
      sequence,
      eventClass,
      formedAt,
      semanticContext: semanticContext ? clone(semanticContext) : null,
      provenance: provenance ? clone(provenance) : null,
      presentationContext: presentationContext ? clone(presentationContext) : null,
      geometry: geometry ? createGeometrySnapshot(geometry, { allowedCoordinateSpaces: coordinateSpaces }) : null,
      executionContext: normalizeExecutionContext(executionContext),
      journeyEventRef,
      stateBefore: stateBefore ? clone(stateBefore) : null,
      stateAfter: stateAfter ? clone(stateAfter) : null,
      evidenceRefs: [...evidenceRefs]
    });
    events.push(event);
    if (events.length > maxEvents) events.splice(0, events.length - maxEvents);
    return event;
  }

  function durationBetween(startEventRef, endEventRef) {
    const start = events.find((event) => event.eventRef === startEventRef);
    const end = events.find((event) => event.eventRef === endEventRef);
    if (!start || !end) throw new Error('duration endpoints must exist in current bounded trace');
    return canonicalTimestamp(end.formedAt, 'end.formedAt') - canonicalTimestamp(start.formedAt, 'start.formedAt');
  }

  return Object.freeze({
    record,
    durationBetween,
    trace() {
      return freeze({
        schemaVersion: 'vexlife.runtime-presentation-trace/v1',
        bounded: true,
        maxEvents,
        eventTimestampPrimary: true,
        durationDerivedOnly: true,
        rawPointerLogging: false,
        events: events.map((event) => clone(event))
      });
    }
  });
}

export async function collectBrowserSnapshot(page, {
  maxObservedElements = 200
} = {}) {
  if (!Number.isInteger(maxObservedElements) || maxObservedElements < 1) {
    throw new Error('maxObservedElements must be a positive integer');
  }
  return page.evaluate((limit) => {
    const app = globalThis.__VEXLIFE_APP__ ?? null;
    const frame = app?.navigation?.semanticFrame?.() ?? null;
    const journey = app?.navigation?.fullJourney?.() ?? [];
    const nodes = [...document.querySelectorAll('[data-element-ref],[data-node-ref]')].slice(0, limit).map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        ref: element.dataset.elementRef ?? element.dataset.nodeRef ?? null,
        tagName: element.tagName,
        hidden: element.hidden || style.display === 'none' || style.visibility === 'hidden',
        ariaHidden: element.getAttribute('aria-hidden'),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      };
    });
    const focused = document.activeElement;
    return {
      semanticFrame: frame,
      recentJourney: journey.slice(-12),
      viewport: { width: innerWidth, height: innerHeight },
      focusedRef: focused?.dataset?.elementRef ?? focused?.dataset?.nodeRef ?? focused?.id ?? null,
      observedElements: nodes
    };
  }, maxObservedElements);
}

export async function runBrowserObservation({
  root = ROOT,
  outputPath = 'generated/health/presentation-runtime-trace.json',
  urlSuffix = '/reference/browser/',
  maxObservedElements = 200
} = {}) {
  const registry = loadPresentationRegistry(root);
  const observer = createPresentationObserver({
    eventClasses: registry.runtimeEventClasses,
    coordinateSpaces: registry.coordinateSpaces,
    maxEvents: registry.runtimeObservationPolicy.boundedEventLimit
  });

  const playwright = await import('playwright');
  const server = spawn(process.execPath, ['scripts/serve-browser.mjs'], {
    cwd: root,
    env: { ...process.env, VEXLIFE_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.setEncoding('utf8');
  server.stderr.setEncoding('utf8');
  let browser;
  try {
    let stderr = '';
    server.stderr.on('data', (chunk) => { stderr += chunk; });
    const serverUrl = await Promise.race([
      new Promise((resolve, reject) => {
        server.stdout.on('data', (chunk) => {
          const match = chunk.match(/http:\/\/127\.0\.0\.1:\d+/u);
          if (match) resolve(match[0]);
        });
        server.once('error', reject);
        server.once('exit', (code) => reject(new Error(`browser server exited ${code}: ${stderr}`)));
      }),
      delay(10000, undefined, { ref: false }).then(() => { throw new Error('browser server readiness timed out'); })
    ]);

    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`${serverUrl}${urlSuffix}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForFunction(() => Boolean(globalThis.__VEXLIFE_APP__), null, { timeout: 30000 });
    const snapshot = await collectBrowserSnapshot(page, { maxObservedElements });

    const viewportRect = { x: 0, y: 0, width: snapshot.viewport.width, height: snapshot.viewport.height };
    const visible = snapshot.observedElements.filter((item) => !item.hidden);
    observer.record({
      eventClass: 'LAYOUT_SETTLED',
      semanticContext: snapshot.semanticFrame,
      presentationContext: {
        focusedRef: snapshot.focusedRef,
        observedElementCount: snapshot.observedElements.length,
        visibleElementCount: visible.length
      },
      geometry: {
        coordinateSpace: 'VIEWPORT',
        viewportRect,
        parentRect: viewportRect,
        elementRect: viewportRect
      }
    });

    if (snapshot.semanticFrame?.screenRef) {
      observer.record({
        eventClass: 'SEMANTIC_SCREEN_ENTER',
        semanticContext: snapshot.semanticFrame,
        provenance: {
          interactionSourceRef: snapshot.recentJourney.at(-1)?.elementRef ?? null,
          actionRef: snapshot.recentJourney.at(-1)?.actionRef ?? null,
          journeyEventRef: snapshot.recentJourney.at(-1)?.journeyRef ?? null
        },
        presentationContext: { focusedRef: snapshot.focusedRef }
      });
    }

    const output = {
      ...observer.trace(),
      snapshot,
      sourceBinding: {
        registryRef: registry.registryRef,
        ownerRef: registry.ownerRef
      }
    };
    const target = path.join(root, outputPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    writeJson(target, output);
    return output;
  } finally {
    await browser?.close().catch(() => {});
    server.kill();
  }
}

async function main() {
  const output = await runBrowserObservation();
  process.stdout.write(`${JSON.stringify({
    schemaVersion: output.schemaVersion,
    state: 'PASS',
    eventCount: output.events.length,
    rawPointerLogging: output.rawPointerLogging,
    screenRef: output.snapshot.semanticFrame?.screenRef ?? null,
    observedElementCount: output.snapshot.observedElements.length
  }, null, 2)}\n`);
}

const invokedAsMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invokedAsMain) await main();

// [VXG RealForever]
