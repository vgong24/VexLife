import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGeometrySnapshot,
  createPresentationObserver,
  normalizeExecutionContext,
  projectJourneyEvent
} from '../scripts/presentation-graph-observer.mjs';

const eventClasses = [
  'SEMANTIC_SCREEN_ENTER',
  'SEMANTIC_SCREEN_EXIT',
  'PRESENTATION_MOUNT',
  'PRESENTATION_UNMOUNT',
  'TRANSIENT_LAYER_OPEN',
  'TRANSIENT_LAYER_CLOSE',
  'ELEMENT_ACTIVATED',
  'FOCUS_ENTER',
  'FOCUS_EXIT',
  'STATE_PROJECTION_CHANGE',
  'LAYOUT_SETTLED',
  'VIEWPORT_CHANGED'
];
const coordinateSpaces = ['VIEWPORT', 'WINDOW', 'SCREEN', 'ACTIVE_SURFACE', 'PARENT_CONTAINER', 'NORMALIZED_PARENT'];

function clockFrom(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

test('observer keeps actual timestamps primary and derives duration without replacing events', () => {
  const observer = createPresentationObserver({
    eventClasses,
    coordinateSpaces,
    clock: clockFrom(['2026-09-26T00:00:00.000Z', '2026-09-26T00:00:00.250Z']),
    maxEvents: 8
  });
  const opened = observer.record({ eventClass: 'TRANSIENT_LAYER_OPEN' });
  const closed = observer.record({ eventClass: 'TRANSIENT_LAYER_CLOSE' });
  assert.equal(opened.formedAt, '2026-09-26T00:00:00.000Z');
  assert.equal(closed.formedAt, '2026-09-26T00:00:00.250Z');
  assert.equal(observer.durationBetween(opened.eventRef, closed.eventRef), 250);
  assert.equal(observer.trace().durationDerivedOnly, true);
});

test('observer rejects raw pointer streams as canonical trace events', () => {
  const observer = createPresentationObserver({
    eventClasses,
    coordinateSpaces,
    clock: () => '2026-09-26T00:00:00.000Z'
  });
  assert.throws(() => observer.record({ eventClass: 'POINTER_MOVE' }), /raw input event/u);
});

test('semantic current context remains separate from interaction provenance', () => {
  const observer = createPresentationObserver({
    eventClasses,
    coordinateSpaces,
    clock: () => '2026-09-26T00:00:00.000Z'
  });
  const event = observer.record({
    eventClass: 'ELEMENT_ACTIVATED',
    semanticContext: { screenRef: 'screen.vexlife.living-journal', selectedNodeRef: 'terrain.root' },
    provenance: {
      elementRef: 'element.living-journal.archive.open',
      interactionRef: 'interaction.living-journal.archive.open',
      actionRef: 'action.living-journal.archive.open'
    }
  });
  assert.equal(event.semanticContext.screenRef, 'screen.vexlife.living-journal');
  assert.equal(event.provenance.elementRef, 'element.living-journal.archive.open');
  assert.notEqual(event.semanticContext.selectedNodeRef, event.provenance.elementRef);
});

test('geometry reports containment, clipping and normalized parent-relative posture explicitly', () => {
  const contained = createGeometrySnapshot({
    coordinateSpace: 'PARENT_CONTAINER',
    parentRect: { x: 10, y: 20, width: 200, height: 100 },
    elementRect: { x: 20, y: 30, width: 50, height: 25 },
    declaredParentRef: 'presentation.parent',
    observedParentRef: 'presentation.parent'
  }, { allowedCoordinateSpaces: coordinateSpaces });
  assert.equal(contained.clipped, false);
  assert.equal(contained.outOfBounds, false);
  assert.deepEqual(contained.normalizedParentRect, { x: 0.05, y: 0.1, width: 0.25, height: 0.25 });

  const clipped = createGeometrySnapshot({
    coordinateSpace: 'PARENT_CONTAINER',
    parentRect: { x: 0, y: 0, width: 100, height: 100 },
    elementRect: { x: 80, y: 80, width: 40, height: 40 }
  }, { allowedCoordinateSpaces: coordinateSpaces });
  assert.equal(clipped.clipped, true);
  assert.equal(clipped.outOfBounds, true);
  assert.equal(clipped.outOfBoundsPx.right, 20);
  assert.equal(clipped.outOfBoundsPx.bottom, 20);
});

test('Journey projection keeps canonical Journey authority and only enriches it', () => {
  const projected = projectJourneyEvent({
    journeyRef: 'journey.browser.example',
    elementRef: 'element.living-journal.archive.open',
    interactionRef: 'interaction.living-journal.archive.open',
    actionRef: 'action.living-journal.archive.open',
    before: { screenRef: 'screen.vexlife.living-journal' },
    after: { screenRef: 'screen.vexlife.living-journal' },
    formedAt: '2026-09-26T00:00:00.000Z'
  }, {
    presentationContext: { layerRef: 'presentation.fixture.options' }
  });
  assert.equal(projected.canonicalJourneyRef, 'journey.browser.example');
  assert.equal(projected.semanticAuthority, false);
  assert.equal(projected.journeyAuthority, 'CANONICAL_JOURNEY');
});

test('ExecutionContext lineage remains independent of presentation containment', () => {
  const context = normalizeExecutionContext({
    executionContextRef: 'execution.fixture.child',
    parentExecutionContextRefOrNull: 'execution.fixture.parent',
    concurrencyGroupRefOrNull: 'concurrency.fixture',
    ownerScreenRefOrNull: 'screen.vexlife.living-journal',
    ownerComponentRefOrNull: 'component.vexlife.action-vessel',
    ownerActionRefOrNull: 'action.living-journal.archive.open',
    supervisionPolicy: 'SUPERVISOR_ISOLATION',
    cancellationScopeRefOrNull: 'cancel.fixture.screen',
    startedAt: '2026-09-26T00:00:00.000Z',
    endedAtOrNull: '2026-09-26T00:00:00.500Z',
    terminalStateOrNull: 'COMPLETED',
    failureClassOrNull: null
  });
  assert.equal(context.parentExecutionContextRefOrNull, 'execution.fixture.parent');
  assert.equal(context.ownerComponentRefOrNull, 'component.vexlife.action-vessel');
  assert.notEqual(context.parentExecutionContextRefOrNull, context.ownerComponentRefOrNull);
});

test('bounded trace drops oldest events instead of becoming an unbounded telemetry stream', () => {
  const observer = createPresentationObserver({
    eventClasses,
    coordinateSpaces,
    clock: () => '2026-09-26T00:00:00.000Z',
    maxEvents: 2
  });
  observer.record({ eventClass: 'PRESENTATION_MOUNT' });
  observer.record({ eventClass: 'LAYOUT_SETTLED' });
  observer.record({ eventClass: 'PRESENTATION_UNMOUNT' });
  const trace = observer.trace();
  assert.equal(trace.events.length, 2);
  assert.deepEqual(trace.events.map((item) => item.eventClass), ['LAYOUT_SETTLED', 'PRESENTATION_UNMOUNT']);
  assert.equal(trace.rawPointerLogging, false);
});
