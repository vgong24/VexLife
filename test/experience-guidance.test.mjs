import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGuidanceProposal,
  buildHelpProjection,
  deriveGuidanceAwareness,
  guidancePreferenceIdentity,
  makeGuidancePreference,
  resolveGuidancePlacement,
  validateGuidanceTargetBinding
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
  assert.equal(result.availableCapacity, 720);
  assert.equal(result.persistedPreferenceMutation, false);
  assert.equal(result.semanticNavigationEffect, false);
  assert.equal(result.journeyEffect, false);
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

// [VXG RealForever]
