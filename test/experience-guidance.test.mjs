import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGuidanceProposal,
  buildHelpProjection,
  buildInteractionCue,
  deriveGuidanceAwareness,
  guidancePreferenceIdentity,
  makeGuidancePreference,
  resolveGuidancePlacement,
  validateGuidanceTargetBinding,
  validateInteractionCue
} from '../src/core/experience-guidance.mjs';

const exactIdentity = Object.freeze({
  featureRef: 'feature.vexlife.example',
  planRef: 'plan.vexlife.feature.example.introduction.001',
  sourceVersionRef: 'source.example.v1'
});

const staticTarget = Object.freeze({
  targetRef: 'element.terrain.reset',
  targetKind: 'ELEMENT',
  screenRefOrNull: 'screen.vexlife.terrain',
  regionRefOrNull: 'region.terrain.canvas',
  componentRefOrNull: null,
  slotRefOrNull: null,
  instanceRefOrNull: null,
  entityRefOrNull: null,
  selectionRefOrNull: null,
  bindingPolicy: 'STATIC_CANONICAL_TARGET'
});

const repeatedTarget = Object.freeze({
  targetRef: 'slot.project-entry.select',
  targetKind: 'COMPONENT_SLOT',
  screenRefOrNull: 'screen.vexlife.chat',
  regionRefOrNull: 'region.chat.projects',
  componentRefOrNull: 'component.vexlife.project-entry',
  slotRefOrNull: 'slot.project-entry.select',
  instanceRefOrNull: 'instance.project-entry.project.root-hub',
  entityRefOrNull: 'project.root-hub',
  selectionRefOrNull: null,
  bindingPolicy: 'EXACT_COMPONENT_SLOT_INSTANCE'
});

const proposalBase = Object.freeze({
  proposalRef: 'proposal.1',
  featureRef: exactIdentity.featureRef,
  currentFrameRef: 'frame.current',
  invocationClass: 'PROACTIVE_INTRODUCTION',
  purposeClass: 'EXPLORE',
  whyRelevantRefs: ['reason.current-intent'],
  awarenessState: 'UNINTRODUCED',
  routeState: 'CURRENT',
  availabilityState: 'AVAILABLE',
  exposureRef: 'exposure.vexlife.contextual'
});

test('GDX-00 UNINTRODUCED is derived and explicit acknowledgement is exact-version local preference', () => {
  assert.equal(deriveGuidanceAwareness({ identity: exactIdentity }), 'UNINTRODUCED');
  assert.equal(deriveGuidanceAwareness({ identity: exactIdentity, offeredThisSession: true }), 'OFFERED_THIS_SESSION');
  const preference = makeGuidancePreference({ state: 'ACKNOWLEDGED', ...exactIdentity });
  assert.deepEqual(guidancePreferenceIdentity(preference), exactIdentity);
  assert.equal(deriveGuidanceAwareness({ identity: exactIdentity, preference }), 'ACKNOWLEDGED');
  assert.equal(Object.hasOwn(preference, 'memoryRef'), false);
});

test('GDX-02 source-version identity prevents silent preference inheritance', () => {
  const prior = makeGuidancePreference({ state: 'SUPPRESSED', ...exactIdentity });
  const next = guidancePreferenceIdentity({ ...exactIdentity, sourceVersionRef: 'source.example.v2' });
  assert.notDeepEqual(guidancePreferenceIdentity(prior), next);
  assert.equal(deriveGuidanceAwareness({ identity: next, preference: prior }), 'UNINTRODUCED');
});

test('GDX-03 proposal requires whyRelevant refs and stays no-effect', () => {
  assert.throws(() => buildGuidanceProposal({ ...proposalBase, whyRelevantRefs: [] }), /whyRelevantRefs/);
  const proposal = buildGuidanceProposal({
    ...proposalBase,
    targetBindingOrNull: staticTarget,
    suggestedActionRefOrNull: 'action.terrain.layout.reset'
  });
  assert.equal(proposal.effects, false);
});

test('GDX-04 held/unavailable proposal cannot expose runnable action', () => {
  for (const [routeState, availabilityState] of [['HELD', 'AVAILABLE'], ['CURRENT', 'UNAVAILABLE']]) {
    assert.throws(() => buildGuidanceProposal({
      ...proposalBase,
      proposalRef: `proposal.${routeState}.${availabilityState}`,
      routeState,
      availabilityState,
      targetBindingOrNull: staticTarget,
      suggestedActionRefOrNull: 'action.terrain.layout.reset'
    }), /cannot suggest a runnable action/);
  }
});

test('GDX-05 proactive introduction cannot nag after offer/defer/acknowledge/suppression', () => {
  for (const awarenessState of ['OFFERED_THIS_SESSION', 'DEFERRED', 'ACKNOWLEDGED', 'SUPPRESSED']) {
    assert.throws(() => buildGuidanceProposal({ ...proposalBase, awarenessState }), /proactive introduction requires UNINTRODUCED/);
  }
  const explicit = buildGuidanceProposal({
    ...proposalBase,
    invocationClass: 'EXPLICIT_HELP',
    awarenessState: 'SUPPRESSED'
  });
  assert.equal(explicit.invocationClass, 'EXPLICIT_HELP');
});

test('GDX-06 static and repeated instance targets remain distinct and valid', () => {
  assert.deepEqual(validateGuidanceTargetBinding(staticTarget), []);
  assert.deepEqual(validateGuidanceTargetBinding(repeatedTarget, { actionBearing: true }), []);
  assert.notEqual(staticTarget.targetRef, repeatedTarget.targetRef);
  assert.notEqual(repeatedTarget.instanceRefOrNull, repeatedTarget.entityRefOrNull);
});

test('GDX-07 ambiguous action-bearing dynamic target fails closed', () => {
  const ambiguous = {
    ...repeatedTarget,
    instanceRefOrNull: null,
    selectionRefOrNull: null,
    bindingPolicy: 'CURRENT_SELECTED_INSTANCE'
  };
  assert.match(validateGuidanceTargetBinding(ambiguous, { actionBearing: true }).join('\n'), /exact selectionRefOrNull or instanceRefOrNull/);
});

test('GDX-09 placement chooses the safest usable direction with the most room', () => {
  const result = resolveGuidancePlacement({
    targetRect: { left: 400, top: 300, width: 80, height: 44 },
    surfaceSize: { width: 220, height: 100 },
    viewportRect: { left: 0, top: 0, width: 1200, height: 800 },
    navigationRects: [{ left: 360, top: 150, width: 300, height: 120 }],
    preferredDirections: ['BLOCK_START', 'INLINE_END', 'BLOCK_END', 'INLINE_START']
  });
  assert.equal(result.state, 'ANCHORED');
  assert.equal(result.direction, 'INLINE_END');
  assert.equal(result.readingDirection, 'LTR');
  assert.equal(result.availableCapacity, 720);
  assert.equal(result.persistedPreferenceMutation, false);
  assert.equal(result.semanticNavigationEffect, false);
  assert.equal(result.journeyEffect, false);
});

test('GDX-09b logical inline placement respects RTL reading direction', () => {
  const targetRect = { left: 500, top: 300, width: 80, height: 44 };
  const result = resolveGuidancePlacement({
    targetRect,
    surfaceSize: { width: 200, height: 100 },
    viewportRect: { left: 0, top: 0, width: 1200, height: 800 },
    preferredDirections: ['INLINE_END'],
    readingDirection: 'RTL'
  });
  assert.equal(result.state, 'ANCHORED');
  assert.equal(result.direction, 'INLINE_END');
  assert.equal(result.readingDirection, 'RTL');
  assert.ok(result.geometry.right < targetRect.left);
  assert.throws(() => resolveGuidancePlacement({
    targetRect,
    surfaceSize: { width: 200, height: 100 },
    viewportRect: { left: 0, top: 0, width: 1200, height: 800 },
    readingDirection: 'SIDEWAYS'
  }), /unsupported readingDirection/);
});

test('GDX-10 no safe anchored candidate returns bounded fallback without unsafe geometry', () => {
  const result = resolveGuidancePlacement({
    targetRect: { left: 50, top: 50, width: 40, height: 40 },
    surfaceSize: { width: 300, height: 200 },
    viewportRect: { left: 0, top: 0, width: 180, height: 140 },
    navigationRects: [{ left: 0, top: 0, width: 180, height: 140 }]
  });
  assert.equal(result.state, 'FALLBACK_REQUIRED');
  assert.equal(result.geometry, null);
  assert.equal(result.direction, null);
  assert.equal(result.fallbackOrder.at(-1), 'NONVISUAL_DESCRIPTION');
  assert.equal(result.persistedPreferenceMutation, false);
});

test('GDX-13 Help projection is current-context bounded, reopenable and no-effect', () => {
  const help = buildHelpProjection({
    currentFrameRef: 'frame.terrain.current',
    sections: [{ sectionKind: 'WHAT_CAN_VEX_HELP_WITH_HERE', itemRefs: ['feature.vexlife.example'] }],
    proposals: []
  });
  assert.equal(help.currentFrameRef, 'frame.terrain.current');
  assert.equal(help.effects, false);
  assert.equal(help.memoryWritten, false);
  assert.equal(help.networkTelemetry, false);
  assert.equal(help.explicitHelpBlockedBySuppression, false);
});

const knownInteractionRefs = new Set([
  'action.terrain.canvas.pan',
  'gesture.vexlife.terrain-pan',
  'action.terrain.node.move',
  'gesture.vexlife.node-drag'
]);
const isKnownSemanticRef = (ref) => knownInteractionRefs.has(ref);

const interactionCueBase = Object.freeze({
  cueRef: 'cue.vexlife.terrain.pan.current',
  interactionFamily: 'PAN',
  intentionContentRef: 'gesture.terrain-pan.help',
  routeState: 'CURRENT',
  availabilityState: 'AVAILABLE',
  actionRefOrNull: 'action.terrain.canvas.pan',
  interactionRefOrNull: null,
  gestureRefOrNull: 'gesture.vexlife.terrain-pan',
  componentRefOrNull: null,
  slotRefOrNull: null,
  targetBindingOrNull: staticTarget
});

test('EFX01D-01/02/04/05 builds an authority-free cue over existing action and gesture identities', () => {
  const cue = buildInteractionCue(interactionCueBase, { isKnownSemanticRef });
  assert.equal(cue.interactionFamily, 'PAN');
  assert.equal(cue.actionRefOrNull, 'action.terrain.canvas.pan');
  assert.equal(cue.gestureRefOrNull, 'gesture.vexlife.terrain-pan');
  assert.notEqual(cue.actionRefOrNull, cue.gestureRefOrNull);
  assert.equal(cue.effects, false);
  assert.equal(cue.grantsActionAuthority, false);
  assert.equal(cue.autoExecute, false);
  assert.equal(cue.navigationEffect, false);
  assert.equal(cue.journeyEffect, false);
  assert.equal(cue.persistenceEffect, false);
  assert.equal(cue.memoryWritten, false);
  assert.equal(cue.networkTelemetry, false);
});

test('EFX01D-03/09 empty or unsupported interaction cues fail closed', () => {
  assert.throws(() => buildInteractionCue({
    ...interactionCueBase,
    interactionFamily: 'BUTTONIFY_EVERYTHING'
  }, { isKnownSemanticRef }), /unsupported interaction family/);
  assert.throws(() => buildInteractionCue({
    ...interactionCueBase,
    actionRefOrNull: null,
    gestureRefOrNull: null
  }, { isKnownSemanticRef }), /at least one semantic interaction reference/);
});

test('EFX01D-02/03 requires current semantic-owner validation and rejects unresolved refs', () => {
  assert.match(validateInteractionCue(interactionCueBase).join('\n'), /requires current semantic owner validation/);
  assert.throws(() => buildInteractionCue({
    ...interactionCueBase,
    gestureRefOrNull: 'gesture.vexlife.imaginary-pan'
  }, { isKnownSemanticRef }), /unresolved gestureRefOrNull/);
});

test('EFX01D-06 held or unavailable cues remain descriptive and cannot gain execution authority', () => {
  for (const [routeState, availabilityState] of [['HELD', 'AVAILABLE'], ['CURRENT', 'UNAVAILABLE']]) {
    const cue = buildInteractionCue({
      ...interactionCueBase,
      cueRef: `cue.${routeState}.${availabilityState}`,
      routeState,
      availabilityState
    }, { isKnownSemanticRef });
    assert.equal(cue.actionRefOrNull, 'action.terrain.canvas.pan');
    assert.equal(cue.autoExecute, false);
    assert.equal(cue.grantsActionAuthority, false);
    assert.equal(cue.effects, false);
  }
});

test('EFX01D-07/08 direct-manipulation meaning and human copy remain separate projections', () => {
  const checkedRefs = [];
  const cue = buildInteractionCue({
    ...interactionCueBase,
    cueRef: 'cue.vexlife.node.move.current',
    interactionFamily: 'DRAG_OR_MOVE',
    intentionContentRef: 'gesture.node-drag.help',
    actionRefOrNull: 'action.terrain.node.move',
    gestureRefOrNull: 'gesture.vexlife.node-drag'
  }, {
    isKnownSemanticRef(ref, field) {
      checkedRefs.push([field, ref]);
      return knownInteractionRefs.has(ref);
    }
  });
  assert.deepEqual(checkedRefs, [
    ['actionRefOrNull', 'action.terrain.node.move'],
    ['gestureRefOrNull', 'gesture.vexlife.node-drag']
  ]);
  assert.equal(cue.intentionContentRef, 'gesture.node-drag.help');
  assert.notEqual(cue.intentionContentRef, cue.actionRefOrNull);
  assert.notEqual(cue.intentionContentRef, cue.gestureRefOrNull);
  assert.equal(Object.hasOwn(cue, 'buttonRef'), false);
});

test('EFX01D-10 target context is structural projection only and never upgrades cue effects', () => {
  const cue = buildInteractionCue({
    ...interactionCueBase,
    targetBindingOrNull: repeatedTarget
  }, { isKnownSemanticRef });
  assert.deepEqual(validateGuidanceTargetBinding(cue.targetBindingOrNull), []);
  assert.equal(cue.effects, false);
  assert.equal(cue.navigationEffect, false);
  assert.equal(cue.journeyEffect, false);
  assert.equal(cue.persistenceEffect, false);
});

// [VXG RealForever]
