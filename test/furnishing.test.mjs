import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadFurnishingRegistry,
  validateFurnishingRegistry,
  compileFurnishingRegistry,
  validateMovement,
  selectFurnishingNeighborhood,
  projectFurnishings,
  SUBJECT_CLASSES,
  PLACEMENT_POSTURES,
  ADDRESSABILITY_LINK_CLASSES,
  STATE_VOCABULARIES,
  ACTION_AVAILABILITY_STATES
} from '../scripts/furnishing.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const foundation = loadFurnishingRegistry(root);

function registryWith(...records) {
  return { ...structuredClone(foundation), furnishings: records };
}

function placement(placementRef, { terrain = null, presentation = null, route = null } = {}) {
  return {
    placementRef,
    terrainNodeRefOrNull: terrain,
    presentationRefOrNull: presentation,
    routeRefOrNull: route,
    experienceDispositionRefOrNull: null,
    ownerRefs: ['github.issue.vexlife.719'],
    sourceRefs: ['source.presentation-graph']
  };
}

function binding(bindingRef, ownerRef, sourceRef, required = true) {
  return { bindingRef, ownerRef, sourceRef, required };
}

function emptyBindings() {
  return Object.fromEntries(Object.keys(STATE_VOCABULARIES).map((axis) => [axis, []]));
}

function baseRecord({ furnishingRef, subjectClass, subjectRef, resourceRefOrNull = null, ownerRefs = [], sourceRefs = ['source.fixture'] }) {
  return {
    furnishingRef,
    subject: {
      subjectClass,
      subjectRef,
      resourceRefOrNull,
      semanticOwnerRefs: ownerRefs,
      sourceRefs
    },
    placement: { posture: 'HELD', primary: null, contextual: [] },
    bindings: emptyBindings(),
    actionBindings: [],
    addressabilityLinks: [],
    platformProjections: [],
    wakePredicates: []
  };
}

function relationshipsRecord() {
  const record = baseRecord({
    furnishingRef: 'furnishing.vexlife.relationships',
    subjectClass: 'RESOURCE_PLACEMENT',
    subjectRef: 'feature.vexlife.relationships',
    resourceRefOrNull: 'feature.vexlife.relationships',
    ownerRefs: ['github.issue.vexlife.237'],
    sourceRefs: ['source.feature-registry.relationships']
  });
  record.placement = {
    posture: 'PLACED',
    primary: placement('furnishing-placement.vexlife.relationships.primary', {
      terrain: 'terrain.resource.relationships',
      presentation: 'presentation.vexlife.relationships.active-surface',
      route: 'route.relationships'
    }),
    contextual: []
  };
  record.bindings.currentness = [binding('binding.relationships.currentness', 'github.issue.vexlife.237', 'source.relationships.currentness')];
  record.bindings.visibility = [binding('binding.relationships.visibility', 'github.issue.vexlife.719', 'source.relationships.visibility')];
  record.bindings.reachability = [binding('binding.relationships.reachability', 'github.issue.vexlife.719', 'source.relationships.reachability')];
  record.bindings.availability = [binding('binding.relationships.availability', 'github.issue.vexlife.237', 'source.relationships.availability')];
  record.actionBindings = [{
    actionBindingRef: 'action-binding.relationships.open',
    actionRef: 'action.context.open',
    permissionRefOrNull: 'permission.none',
    actionSourceRef: 'source.blueprint.actions',
    availabilityBindingRef: 'binding.relationships.action.open.availability',
    availabilityOwnerRef: 'github.issue.vexlife.237',
    availabilitySourceRef: 'source.relationships.action-availability',
    required: true
  }];
  record.platformProjections = [{
    projectionRef: 'projection.furnishing.relationships.browser',
    platformRef: 'platform.browser',
    posture: 'SHARED_IDENTITY',
    ownerRef: 'github.issue.vexlife.719',
    sourceRef: 'source.presentation-graph'
  }];
  return record;
}

function continueRecord() {
  const record = baseRecord({
    furnishingRef: 'furnishing.vexlife.continue',
    subjectClass: 'DERIVED_COLLECTION',
    subjectRef: 'projection.furnishing.continue',
    resourceRefOrNull: null,
    ownerRefs: [],
    sourceRefs: ['source.furnishing.continue-policy']
  });
  record.placement = { posture: 'UNPLACED', primary: null, contextual: [] };
  record.bindings.currentness = [binding('binding.continue.currentness', 'github.issue.vexlife.811', 'source.continue.resumable')];
  record.addressabilityLinks = [{
    linkRef: 'addressability.continue.relationships',
    linkClass: 'CONTINUATION_ENTRY',
    targetSubjectRef: 'feature.vexlife.relationships',
    ownerRef: 'github.issue.vexlife.237',
    sourceRef: 'source.relationships.currentness',
    semanticRelationAuthority: false
  }];
  return record;
}

function vexPresenceRecord() {
  const record = baseRecord({
    furnishingRef: 'furnishing.vexlife.vex-presence',
    subjectClass: 'PRESENCE',
    subjectRef: 'presence.vex.current',
    resourceRefOrNull: null,
    ownerRefs: ['github.issue.vexlife.634'],
    sourceRefs: ['source.vex.presence']
  });
  record.placement = { posture: 'HELD', primary: null, contextual: [] };
  record.bindings.currentness = [binding('binding.vex.currentness', 'github.issue.vexlife.634', 'source.vex.presence')];
  record.bindings.visibility = [binding('binding.vex.visibility', 'github.issue.vexlife.719', 'source.vex.visibility')];
  record.bindings.availability = [binding('binding.vex.availability', 'github.issue.vexlife.634', 'source.vex.availability')];
  return record;
}

function musicRecord() {
  const record = baseRecord({
    furnishingRef: 'furnishing.vexlife.vexstream-music',
    subjectClass: 'EXTERNAL_SERVICE',
    subjectRef: 'external-service.localvex.vexstream-music',
    resourceRefOrNull: null,
    ownerRefs: ['github.issue.localvex.8'],
    sourceRefs: ['source.localvex.vexstream-music']
  });
  record.placement = { posture: 'HELD', primary: null, contextual: [] };
  record.bindings.currentness = [binding('binding.music.currentness', 'github.issue.localvex.8', 'source.localvex.vexstream-music.currentness')];
  record.bindings.availability = [binding('binding.music.availability', 'github.issue.localvex.8', 'source.localvex.vexstream-music.availability')];
  return record;
}

function multiHomeFixture() {
  const record = baseRecord({
    furnishingRef: 'furnishing.fixture.multi-home',
    subjectClass: 'RESOURCE_PLACEMENT',
    subjectRef: 'feature.fixture.multi-home',
    resourceRefOrNull: 'feature.fixture.multi-home',
    ownerRefs: ['owner.fixture.multi-home'],
    sourceRefs: ['source.fixture.multi-home']
  });
  record.placement = {
    posture: 'MULTI_HOME',
    primary: placement('placement.fixture.primary', { terrain: 'terrain.fixture.primary' }),
    contextual: [placement('placement.fixture.contextual', { route: 'route.fixture.contextual' })]
  };
  return record;
}

function knownRefs() {
  return new Set([
    'feature.vexlife.relationships',
    'github.issue.vexlife.237', 'github.issue.vexlife.719', 'github.issue.vexlife.811', 'github.issue.vexlife.634',
    'github.issue.localvex.8',
    'source.feature-registry.relationships', 'source.presentation-graph', 'source.relationships.currentness',
    'source.relationships.visibility', 'source.relationships.reachability', 'source.relationships.availability',
    'source.relationships.action-availability', 'source.blueprint.actions', 'source.continue.resumable',
    'source.furnishing.continue-policy', 'source.vex.presence', 'source.vex.visibility', 'source.vex.availability',
    'source.localvex.vexstream-music', 'source.localvex.vexstream-music.currentness',
    'source.localvex.vexstream-music.availability',
    'terrain.resource.relationships', 'presentation.vexlife.relationships.active-surface', 'route.relationships',
    'action.context.open', 'permission.none', 'platform.browser',
    'feature.fixture.multi-home', 'owner.fixture.multi-home', 'source.fixture.multi-home',
    'terrain.fixture.primary', 'route.fixture.contextual',
    'source.fixture'
  ]);
}

function observation(bindingRef, ownerRef, sourceRef, state, reasonRefs = [], evidenceRefs = []) {
  return { bindingRef, ownerRef, sourceRef, state, reasonRefs, evidenceRefs, effectAuthorityGranted: false };
}

test('VF02A-00 foundation is inert and owns no semantic/current/effect authority', () => {
  const validated = validateFurnishingRegistry(foundation);
  assert.equal(validated.ok, true);
  assert.equal(validated.furnishingCount, 0);
  assert.ok(Object.values(foundation.effects).every((value) => value === false));
  const compiled = compileFurnishingRegistry(foundation);
  assert.equal(compiled.semanticAuthority, false);
  assert.equal(compiled.semanticRelationAuthority, false);
  assert.equal(compiled.currentStateAuthority, false);
  assert.equal(compiled.effectAuthority, false);
});

test('VF02A-01 typed subject and placement vocabularies are closed and multi-home is first-class', () => {
  assert.deepEqual([...SUBJECT_CLASSES], ['RESOURCE_PLACEMENT','DERIVED_COLLECTION','PRESENCE','CONTEXTUAL_INDEX','EXTERNAL_SERVICE']);
  assert.deepEqual([...PLACEMENT_POSTURES], ['PLACED','MULTI_HOME','UNPLACED','HELD']);
  assert.ok(ADDRESSABILITY_LINK_CLASSES.includes('CONTINUATION_ENTRY'));
  assert.deepEqual([...ACTION_AVAILABILITY_STATES], ['AVAILABLE','HELD','UNAVAILABLE','UNKNOWN']);
  assert.ok(Object.hasOwn(STATE_VOCABULARIES, 'reachability'));
  assert.ok(Object.hasOwn(STATE_VOCABULARIES, 'availability'));
});

test('VF02A-02 resource placement requires rightful resource identity and external service may remain unresolved', () => {
  const broken = relationshipsRecord();
  broken.subject.resourceRefOrNull = null;
  assert.throws(() => compileFurnishingRegistry(registryWith(broken), { knownRefs: knownRefs() }), /RESOURCE_PLACEMENT requires resourceRefOrNull/u);
  const music = compileFurnishingRegistry(registryWith(musicRecord()), { knownRefs: knownRefs() }).furnishings[0];
  assert.equal(music.subject.subjectClass, 'EXTERNAL_SERVICE');
  assert.equal(music.subject.resourceRefOrNull, null);
});

test('VF02A-03 derived collection cannot become a second canonical store', () => {
  const good = compileFurnishingRegistry(registryWith(continueRecord()), { knownRefs: knownRefs() }).furnishings[0];
  assert.equal(good.subject.resourceRefOrNull, null);
  const broken = continueRecord();
  broken.subject.resourceRefOrNull = 'resource.vexlife.continue-store';
  assert.throws(() => compileFurnishingRegistry(registryWith(broken), { knownRefs: knownRefs() }), /must not claim a canonical resource store/u);
});

test('VF02A-04 placement grammar distinguishes single-home, multi-home, unplaced and held', () => {
  const rel = compileFurnishingRegistry(registryWith(relationshipsRecord()), { knownRefs: knownRefs() }).furnishings[0];
  assert.equal(rel.placement.posture, 'PLACED');
  assert.equal(rel.placement.contextual.length, 0);
  const multi = compileFurnishingRegistry(registryWith(multiHomeFixture()), { knownRefs: knownRefs() }).furnishings[0];
  assert.equal(multi.placement.posture, 'MULTI_HOME');
  assert.equal(1 + multi.placement.contextual.length, 2);
  const badPlaced = relationshipsRecord();
  badPlaced.placement.contextual.push(placement('placement.bad.second-home', { route: 'route.fixture.contextual' }));
  assert.throws(() => compileFurnishingRegistry(registryWith(badPlaced), { knownRefs: knownRefs() }), /use MULTI_HOME/u);
  const badMulti = relationshipsRecord();
  badMulti.placement.posture = 'MULTI_HOME';
  assert.throws(() => compileFurnishingRegistry(registryWith(badMulti), { knownRefs: knownRefs() }), /at least two placements/u);
});

test('VF02A-05 dynamic axes are source-derived and kept orthogonal', () => {
  const compiled = compileFurnishingRegistry(registryWith(relationshipsRecord()), { knownRefs: knownRefs() });
  const projected = projectFurnishings(compiled, { observations: [
    observation('binding.relationships.currentness','github.issue.vexlife.237','source.relationships.currentness','CURRENT'),
    observation('binding.relationships.visibility','github.issue.vexlife.719','source.relationships.visibility','VISIBLE',['reason.relationships.visible']),
    observation('binding.relationships.reachability','github.issue.vexlife.719','source.relationships.reachability','REACHABLE'),
    observation('binding.relationships.availability','github.issue.vexlife.237','source.relationships.availability','HELD',['reason.relationships.effect-held']),
    observation('binding.relationships.action.open.availability','github.issue.vexlife.237','source.relationships.action-availability','AVAILABLE')
  ] });
  const rel = projected.furnishings[0];
  assert.equal(rel.currentness.state, 'CURRENT');
  assert.equal(rel.visibility.state, 'VISIBLE');
  assert.equal(rel.reachability.state, 'REACHABLE');
  assert.equal(rel.availability.state, 'HELD');
  assert.deepEqual(rel.whyVisible, ['reason.relationships.visible']);
});

test('VF02A-06 Relationships reuses canonical semantic, Terrain, Presentation and route identities', () => {
  const rel = compileFurnishingRegistry(registryWith(relationshipsRecord()), { knownRefs: knownRefs() }).furnishings[0];
  assert.equal(rel.subject.subjectRef, 'feature.vexlife.relationships');
  assert.equal(rel.subject.resourceRefOrNull, 'feature.vexlife.relationships');
  assert.equal(rel.placement.primary.terrainNodeRefOrNull, 'terrain.resource.relationships');
  assert.equal(rel.placement.primary.presentationRefOrNull, 'presentation.vexlife.relationships.active-surface');
  assert.equal(rel.placement.primary.routeRefOrNull, 'route.relationships');
});

test('VF02A-07 Continue uses addressability links for findability, not semantic relationship truth', () => {
  const compiled = compileFurnishingRegistry(registryWith(continueRecord(), relationshipsRecord()), { knownRefs: knownRefs() });
  const neighborhood = selectFurnishingNeighborhood(compiled, { seedFurnishingRefs: ['furnishing.vexlife.continue'], maxHops: 1 });
  assert.deepEqual(neighborhood, [
    { furnishingRef: 'furnishing.vexlife.continue', hops: 0 },
    { furnishingRef: 'furnishing.vexlife.relationships', hops: 1 }
  ]);
  const link = compiled.furnishings.find((item) => item.furnishingRef === 'furnishing.vexlife.continue').addressabilityLinks[0];
  assert.equal(link.semanticRelationAuthority, false);
  assert.equal(compiled.semanticRelationAuthority, false);
});

test('VF02A-08 visible Vex presence cannot infer availability, READY or effect authority', () => {
  const compiled = compileFurnishingRegistry(registryWith(vexPresenceRecord()), { knownRefs: knownRefs() });
  const projected = projectFurnishings(compiled, { observations: [
    observation('binding.vex.currentness','github.issue.vexlife.634','source.vex.presence','CURRENT'),
    observation('binding.vex.visibility','github.issue.vexlife.719','source.vex.visibility','VISIBLE',['reason.vex.chrome-visible']),
    observation('binding.vex.availability','github.issue.vexlife.634','source.vex.availability','HELD',['reason.vex.not-ready'])
  ] });
  const vex = projected.furnishings[0];
  assert.equal(vex.visibility.state, 'VISIBLE');
  assert.equal(vex.availability.state, 'HELD');
  assert.equal(vex.effectAuthorityGranted, false);
  assert.equal(JSON.stringify(projected).includes('READY'), false);
});

test('VF02A-09 held VexStream service remains source-bound and identity-unresolved without minted truth', () => {
  const compiled = compileFurnishingRegistry(registryWith(musicRecord()), { knownRefs: knownRefs() });
  const music = compiled.furnishings[0];
  assert.equal(music.placement.posture, 'HELD');
  assert.equal(music.subject.resourceRefOrNull, null);
  const projected = projectFurnishings(compiled, { observations: [] }).furnishings[0];
  assert.equal(projected.currentness.state, 'UNKNOWN');
  assert.equal(projected.availability.state, 'UNKNOWN');
  assert.ok(projected.unknowns.includes('MISSING_REQUIRED_BINDING:binding.music.currentness'));
  assert.ok(projected.unknowns.includes('MISSING_REQUIRED_BINDING:binding.music.availability'));
});

test('VF02A-10 G/P/V/A preserve subject identity and P changes placement only', () => {
  const before = relationshipsRecord();
  for (const movementClass of ['G','V','A']) {
    assert.deepEqual(validateMovement(before, structuredClone(before), movementClass), { ok:true, movementClass, semanticIdentityPreserved:true });
  }
  const rebound = structuredClone(before);
  rebound.placement.primary = placement('furnishing-placement.vexlife.relationships.rebound', { presentation:'presentation.vexlife.relationships.active-surface', route:'route.relationships' });
  assert.deepEqual(validateMovement(before, rebound, 'P'), { ok:true, movementClass:'P', semanticIdentityPreserved:true });
  const badP = structuredClone(rebound);
  badP.actionBindings = [];
  assert.throws(() => validateMovement(before, badP, 'P'), /placement composition only/u);
  const badIdentity = structuredClone(rebound);
  badIdentity.subject.resourceRefOrNull = 'feature.vexlife.other';
  assert.throws(() => validateMovement(before, badIdentity, 'P'), /cannot change Furnishing or semantic subject identity/u);
});

test('VF02A-11 S semantic migration always routes outside Furnishing', () => {
  const rel = relationshipsRecord();
  assert.throws(() => validateMovement(rel, structuredClone(rel), 'S'), /semantic migration must be routed to the semantic owner/u);
});

test('VF02A-12 unknown, duplicate, semantic-authority and effect-authority acquisition fail closed', () => {
  const duplicate = relationshipsRecord();
  duplicate.bindings.visibility.push(structuredClone(duplicate.bindings.currentness[0]));
  assert.throws(() => compileFurnishingRegistry(registryWith(duplicate), { knownRefs: knownRefs() }), /duplicate bindingRef/u);

  const semanticEdge = continueRecord();
  semanticEdge.addressabilityLinks[0].semanticRelationAuthority = true;
  assert.throws(() => compileFurnishingRegistry(registryWith(semanticEdge, relationshipsRecord()), { knownRefs: knownRefs() }), /cannot acquire semantic relation authority/u);

  const unknown = relationshipsRecord();
  unknown.placement.primary.routeRefOrNull = 'route.unknown';
  assert.throws(() => compileFurnishingRegistry(registryWith(unknown), { knownRefs: knownRefs() }), /unknown ref route.unknown/u);

  const compiled = compileFurnishingRegistry(registryWith(relationshipsRecord()), { knownRefs: knownRefs() });
  assert.throws(() => projectFurnishings(compiled, { observations: [{
    bindingRef:'binding.relationships.action.open.availability', ownerRef:'github.issue.vexlife.237',
    sourceRef:'source.relationships.action-availability', state:'AVAILABLE', reasonRefs:[], evidenceRefs:[], effectAuthorityGranted:true
  }] }), /attempts to grant effect authority/u);
});

test('VF02A-13 equivalent input ordering compiles and projects deterministically', () => {
  const regA = registryWith(relationshipsRecord(), continueRecord());
  const regB = registryWith(continueRecord(), relationshipsRecord());
  const one = compileFurnishingRegistry(regA, { knownRefs: knownRefs() });
  const two = compileFurnishingRegistry(regB, { knownRefs: knownRefs() });
  assert.equal(one.registryRevision, two.registryRevision);

  const observations = [
    observation('binding.relationships.currentness','github.issue.vexlife.237','source.relationships.currentness','CURRENT'),
    observation('binding.relationships.visibility','github.issue.vexlife.719','source.relationships.visibility','VISIBLE',['reason.visible']),
    observation('binding.relationships.reachability','github.issue.vexlife.719','source.relationships.reachability','REACHABLE'),
    observation('binding.relationships.availability','github.issue.vexlife.237','source.relationships.availability','AVAILABLE'),
    observation('binding.relationships.action.open.availability','github.issue.vexlife.237','source.relationships.action-availability','AVAILABLE'),
    observation('binding.continue.currentness','github.issue.vexlife.811','source.continue.resumable','CURRENT')
  ];
  const a = projectFurnishings(one, { observations, includeFurnishingRefsOrNull:['furnishing.vexlife.relationships','furnishing.vexlife.continue'] });
  const b = projectFurnishings(two, { observations:[...observations].reverse(), includeFurnishingRefsOrNull:['furnishing.vexlife.continue','furnishing.vexlife.relationships'] });
  assert.deepEqual(a, b);
});

test('VF02A-14 missing current/action producer input remains UNKNOWN with no production fallback', () => {
  const compiled = compileFurnishingRegistry(registryWith(relationshipsRecord()), { knownRefs: knownRefs() });
  const projected = projectFurnishings(compiled, { observations: [] });
  const rel = projected.furnishings[0];
  assert.equal(rel.currentness.state, 'UNKNOWN');
  assert.equal(rel.visibility.state, 'UNKNOWN');
  assert.equal(rel.reachability.state, 'UNKNOWN');
  assert.equal(rel.availability.state, 'UNKNOWN');
  assert.deepEqual(rel.availableActions, []);
  assert.deepEqual(rel.unknownActionRefs, ['action.context.open']);
  assert.deepEqual(projected.unknownActions, [{ furnishingRef:'furnishing.vexlife.relationships', actionRef:'action.context.open' }]);
});

test('VF02A-15 action discoverability remains descriptive and all protected/domain effects remain false', () => {
  assert.ok(Object.values(foundation.effects).every((value) => value === false));
  const compiled = compileFurnishingRegistry(registryWith(relationshipsRecord()), { knownRefs: knownRefs() });
  const projected = projectFurnishings(compiled, { observations: [
    observation('binding.relationships.action.open.availability','github.issue.vexlife.237','source.relationships.action-availability','AVAILABLE')
  ] });
  assert.deepEqual(projected.availableActions, [{ furnishingRef:'furnishing.vexlife.relationships', actionRef:'action.context.open' }]);
  assert.equal(projected.effectAuthorityGranted, false);
  assert.equal(projected.semanticAuthority, false);
  assert.equal(projected.semanticRelationAuthority, false);
  assert.equal(projected.furnishings[0].actions[0].permissionRefOrNull, 'permission.none');
  assert.equal(projected.furnishings[0].actions[0].effectAuthorityGranted, false);
});

// [VXG RealForever]