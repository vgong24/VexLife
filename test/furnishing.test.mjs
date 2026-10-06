import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOT,
  compileFurnishingRegistry,
  loadFurnishingRegistry,
  projectFurnishings,
  selectFurnishingNeighborhood,
  validateMovement
} from '../scripts/furnishing.mjs';

const foundation = loadFurnishingRegistry(ROOT);

function placement(placementRef, { terrain = null, presentation = null, route = null } = {}) {
  return {
    placementRef,
    terrainNodeRefOrNull: terrain,
    presentationRefOrNull: presentation,
    routeRefOrNull: route,
    experienceDispositionRefOrNull: null,
    ownerRefs: ['github.issue.vexlife.719'],
    sourceRefs: ['blueprint/presentation-graph-registry.json']
  };
}

function binding(bindingRef, ownerRef, sourceRef, required = true) {
  return { bindingRef, ownerRef, sourceRef, required };
}

function baseRecord({
  furnishingRef,
  subjectClass,
  subjectRef,
  resourceRefOrNull = null,
  semanticOwnerRefs = [],
  posture = 'UNPLACED',
  primary = null,
  contextual = [],
  currentness = [],
  visibility = [],
  attention = [],
  recovery = [],
  orientationRelations = [],
  platformProjections = [],
  wakePredicates = [],
  subjectSourceRefs = ['source.fixture.subject']
}) {
  return {
    furnishingRef,
    subject: {
      subjectClass,
      subjectRef,
      resourceRefOrNull,
      semanticOwnerRefs,
      sourceRefs: subjectSourceRefs
    },
    placement: { posture, primary, contextual },
    bindings: { currentness, visibility, attention, recovery },
    orientationRelations,
    platformProjections,
    wakePredicates
  };
}

function knownRefs(extra = []) {
  return new Set([
    'feature.vexlife.relationships',
    'terrain.resource.relationships',
    'presentation.vexlife.relationships.active-surface',
    'presentation.vexlife.relationships.connect-panel',
    'route.relationships',
    'github.issue.vexlife.237',
    'github.issue.vexlife.719',
    'github.issue.vexlife.783',
    'github.issue.localvex.8',
    'github.issue.vexlife.634',
    'blueprint/feature-registry.json',
    'blueprint/presentation-graph-registry.json',
    'source.relationships.currentness',
    'source.relationships.visibility',
    'source.relationships.attention',
    'source.relationships.recovery',
    'source.continue.resumable',
    'source.vex.presence',
    'source.music.currentness',
    'platform.browser',
    'platform.android',
    'derived.vexlife.continue',
    'presence.vexlife.current-companion',
    'external-service.vexstream.music',
    'source.fixture.subject',
    ...extra
  ]);
}

function registryWith(...records) {
  const copy = structuredClone(foundation);
  copy.furnishings = records;
  return copy;
}

function relationshipsRecord() {
  return baseRecord({
    furnishingRef: 'furnishing.vexlife.relationships',
    subjectClass: 'RESOURCE_PLACEMENT',
    subjectRef: 'feature.vexlife.relationships',
    resourceRefOrNull: 'feature.vexlife.relationships',
    semanticOwnerRefs: ['github.issue.vexlife.237'],
    subjectSourceRefs: ['blueprint/feature-registry.json'],
    posture: 'PLACED',
    primary: placement('furnishing-placement.vexlife.relationships.self-development', {
      terrain: 'terrain.resource.relationships',
      presentation: 'presentation.vexlife.relationships.active-surface',
      route: 'route.relationships'
    }),
    contextual: [placement('furnishing-placement.vexlife.relationships.connect-panel', {
      presentation: 'presentation.vexlife.relationships.connect-panel'
    })],
    currentness: [binding('binding.relationships.currentness', 'github.issue.vexlife.237', 'source.relationships.currentness')],
    visibility: [binding('binding.relationships.visibility', 'github.issue.vexlife.719', 'source.relationships.visibility')],
    attention: [binding('binding.relationships.attention', 'github.issue.vexlife.237', 'source.relationships.attention', false)],
    recovery: [binding('binding.relationships.recovery', 'github.issue.vexlife.237', 'source.relationships.recovery', false)],
    platformProjections: [
      {
        projectionRef: 'furnishing-platform.relationships.browser',
        platformRef: 'platform.browser',
        posture: 'SHARED_IDENTITY',
        ownerRef: 'github.issue.vexlife.719',
        sourceRef: 'blueprint/presentation-graph-registry.json'
      }
    ]
  });
}

function continueRecord() {
  return baseRecord({
    furnishingRef: 'furnishing.vexlife.continue',
    subjectClass: 'DERIVED_COLLECTION',
    subjectRef: 'derived.vexlife.continue',
    resourceRefOrNull: null,
    subjectSourceRefs: ['source.continue.resumable'],
    posture: 'UNPLACED',
    currentness: [binding('binding.continue.currentness', 'github.issue.vexlife.634', 'source.continue.resumable')],
    orientationRelations: [
      {
        relationRef: 'relation.continue.relationships',
        relationClass: 'CONTINUATION_ENTRY',
        targetSubjectRef: 'feature.vexlife.relationships',
        ownerRef: 'github.issue.vexlife.237',
        sourceRef: 'source.relationships.currentness'
      }
    ]
  });
}

function vexPresenceRecord() {
  return baseRecord({
    furnishingRef: 'furnishing.vexlife.vex-presence',
    subjectClass: 'PRESENCE',
    subjectRef: 'presence.vexlife.current-companion',
    semanticOwnerRefs: ['github.issue.vexlife.634'],
    subjectSourceRefs: ['source.vex.presence'],
    posture: 'HELD',
    currentness: [binding('binding.vex.currentness', 'github.issue.vexlife.634', 'source.vex.presence')],
    visibility: [binding('binding.vex.visibility', 'github.issue.vexlife.719', 'source.relationships.visibility', false)]
  });
}

function musicRecord() {
  return baseRecord({
    furnishingRef: 'furnishing.localvex.vexstream-music',
    subjectClass: 'EXTERNAL_SERVICE',
    subjectRef: 'external-service.vexstream.music',
    semanticOwnerRefs: ['github.issue.localvex.8'],
    subjectSourceRefs: ['source.music.currentness'],
    posture: 'HELD',
    currentness: [binding('binding.music.currentness', 'github.issue.localvex.8', 'source.music.currentness')],
    platformProjections: [
      {
        projectionRef: 'furnishing-platform.music.android',
        platformRef: 'platform.android',
        posture: 'HELD',
        ownerRef: 'github.issue.vexlife.783',
        sourceRef: 'source.music.currentness'
      }
    ]
  });
}

test('VF02A-00 foundation registry is inert and claims no semantic/current/effect authority', () => {
  const compiled = compileFurnishingRegistry(foundation);
  assert.equal(compiled.furnishings.length, 0);
  assert.equal(compiled.semanticAuthority, false);
  assert.equal(compiled.currentStateAuthority, false);
  assert.equal(compiled.effectAuthority, false);
  assert.equal(foundation.contract.projectionPolicy.registryStoresDynamicTruth, false);
});

test('VF02A-01 furnishing refs are unique and subject classes are closed', () => {
  const rel = relationshipsRecord();
  assert.doesNotThrow(() => compileFurnishingRegistry(registryWith(rel), { knownRefs: knownRefs() }));
  const duplicate = structuredClone(rel);
  duplicate.subject.subjectRef = 'derived.vexlife.continue';
  duplicate.subject.subjectClass = 'DERIVED_COLLECTION';
  duplicate.subject.resourceRefOrNull = null;
  duplicate.subject.semanticOwnerRefs = [];
  duplicate.placement = { posture: 'UNPLACED', primary: null, contextual: [] };
  duplicate.furnishingRef = rel.furnishingRef;
  assert.throws(() => compileFurnishingRegistry(registryWith(rel, duplicate), { knownRefs: knownRefs() }), /duplicate furnishingRef/u);
  const badClass = structuredClone(rel);
  badClass.subject.subjectClass = 'MAGIC_MENU';
  assert.throws(() => compileFurnishingRegistry(registryWith(badClass), { knownRefs: knownRefs() }), /unsupported subjectClass/u);
});

test('VF02A-02 resource placement requires supplied rightful resource identity and source bindings', () => {
  const rel = relationshipsRecord();
  rel.subject.resourceRefOrNull = null;
  assert.throws(() => compileFurnishingRegistry(registryWith(rel), { knownRefs: knownRefs() }), /RESOURCE_PLACEMENT requires/u);
  const sourceUnknown = relationshipsRecord();
  sourceUnknown.subject.sourceRefs = ['source.missing'];
  assert.throws(() => compileFurnishingRegistry(registryWith(sourceUnknown), { knownRefs: knownRefs() }), /unknown ref source\.missing/u);
});

test('VF02A-03 derived Continue cannot establish a canonical store', () => {
  const cont = continueRecord();
  assert.doesNotThrow(() => compileFurnishingRegistry(registryWith(cont), { knownRefs: knownRefs() }));
  cont.subject.resourceRefOrNull = 'feature.vexlife.relationships';
  assert.throws(() => compileFurnishingRegistry(registryWith(cont), { knownRefs: knownRefs() }), /must not claim a canonical resource store/u);
});

test('VF02A-04 placement policy references known current identities or is explicitly UNPLACED/HELD', () => {
  const rel = relationshipsRecord();
  const compiled = compileFurnishingRegistry(registryWith(rel), { knownRefs: knownRefs() });
  assert.equal(compiled.furnishings[0].placement.primary.terrainNodeRefOrNull, 'terrain.resource.relationships');
  const missing = relationshipsRecord();
  missing.placement.primary.presentationRefOrNull = 'presentation.vexlife.missing';
  assert.throws(() => compileFurnishingRegistry(registryWith(missing), { knownRefs: knownRefs() }), /unknown ref presentation\.vexlife\.missing/u);
  const unplaced = continueRecord();
  assert.equal(compileFurnishingRegistry(registryWith(unplaced), { knownRefs: knownRefs() }).furnishings[0].placement.posture, 'UNPLACED');
});

test('VF02A-05 dynamic CURRENT/HELD/ATTENTION derives from bound observations, never registry truth', () => {
  const compiled = compileFurnishingRegistry(registryWith(relationshipsRecord()), { knownRefs: knownRefs() });
  const projection = projectFurnishings(compiled, {
    currentSemanticContextRefOrNull: 'context.vexlife.self-development',
    selectedFurnishingRefOrNull: 'furnishing.vexlife.relationships',
    observations: [
      { bindingRef: 'binding.relationships.currentness', ownerRef: 'github.issue.vexlife.237', sourceRef: 'source.relationships.currentness', state: 'CURRENT', reasonRefs: ['reason.relationships.accepted-current'], evidenceRefs: ['github.issue.vexlife.237.comment.5974499583'], effectAuthorityGranted: false },
      { bindingRef: 'binding.relationships.visibility', ownerRef: 'github.issue.vexlife.719', sourceRef: 'source.relationships.visibility', state: 'VISIBLE', reasonRefs: ['reason.relationships.current-door'], evidenceRefs: ['blueprint/presentation-graph-registry.json'], effectAuthorityGranted: false },
      { bindingRef: 'binding.relationships.attention', ownerRef: 'github.issue.vexlife.237', sourceRef: 'source.relationships.attention', state: 'ATTENTION', reasonRefs: ['reason.relationships.pending-human-attention'], evidenceRefs: [], effectAuthorityGranted: false }
    ]
  });
  const current = projection.furnishings[0];
  assert.equal(current.currentness.state, 'CURRENT');
  assert.equal(current.visibility.state, 'VISIBLE');
  assert.equal(current.attention.state, 'ATTENTION');
  assert.deepEqual(current.whyVisible, ['reason.relationships.current-door']);
  assert.equal(current.effectAuthorityGranted, false);
});

test('VF02A-06 Relationships reuses existing semantic, Terrain, Presentation and route identity', () => {
  const compiled = compileFurnishingRegistry(registryWith(relationshipsRecord()), { knownRefs: knownRefs() });
  const rel = compiled.furnishings[0];
  assert.equal(rel.subject.resourceRefOrNull, 'feature.vexlife.relationships');
  assert.equal(rel.placement.primary.terrainNodeRefOrNull, 'terrain.resource.relationships');
  assert.equal(rel.placement.primary.presentationRefOrNull, 'presentation.vexlife.relationships.active-surface');
  assert.equal(rel.placement.primary.routeRefOrNull, 'route.relationships');
});

test('VF02A-07 Continue derives resumable neighborhood refs without copying content', () => {
  const compiled = compileFurnishingRegistry(registryWith(continueRecord(), relationshipsRecord()), { knownRefs: knownRefs() });
  const neighborhood = selectFurnishingNeighborhood(compiled, { seedFurnishingRefs: ['furnishing.vexlife.continue'], maxHops: 1 });
  assert.deepEqual(neighborhood, [
    { furnishingRef: 'furnishing.vexlife.continue', hops: 0 },
    { furnishingRef: 'furnishing.vexlife.relationships', hops: 1 }
  ]);
  const cont = compiled.furnishings.find((item) => item.furnishingRef === 'furnishing.vexlife.continue');
  assert.equal(cont.subject.resourceRefOrNull, null);
});

test('VF02A-08 visible Vex presence cannot infer READY or effect authority', () => {
  const compiled = compileFurnishingRegistry(registryWith(vexPresenceRecord()), { knownRefs: knownRefs() });
  const projection = projectFurnishings(compiled, {
    observations: [
      { bindingRef: 'binding.vex.currentness', ownerRef: 'github.issue.vexlife.634', sourceRef: 'source.vex.presence', state: 'HELD', reasonRefs: ['reason.vex.not-ready'], evidenceRefs: [], effectAuthorityGranted: false },
      { bindingRef: 'binding.vex.visibility', ownerRef: 'github.issue.vexlife.719', sourceRef: 'source.relationships.visibility', state: 'VISIBLE', reasonRefs: ['reason.vex.chrome-visible'], evidenceRefs: [], effectAuthorityGranted: false }
    ]
  });
  assert.equal(projection.furnishings[0].visibility.state, 'VISIBLE');
  assert.equal(projection.furnishings[0].currentness.state, 'HELD');
  assert.equal(projection.furnishings[0].effectAuthorityGranted, false);
  assert.equal(JSON.stringify(projection).includes('READY'), false);
});

test('VF02A-09 external service may remain HELD without minted resource identity', () => {
  const compiled = compileFurnishingRegistry(registryWith(musicRecord()), { knownRefs: knownRefs() });
  const music = compiled.furnishings[0];
  assert.equal(music.subject.subjectClass, 'EXTERNAL_SERVICE');
  assert.equal(music.subject.resourceRefOrNull, null);
  assert.equal(music.placement.posture, 'HELD');
  const projection = projectFurnishings(compiled, { observations: [] });
  assert.equal(projection.furnishings[0].currentness.state, 'UNKNOWN');
  assert.ok(projection.furnishings[0].unknowns.includes('MISSING_REQUIRED_BINDING:binding.music.currentness'));
});

test('VF02A-10 G/P/V/A preserve semantic identity while static registry owns only P movement', () => {
  const before = relationshipsRecord();
  assert.deepEqual(validateMovement(before, structuredClone(before), 'G'), { ok: true, movementClass: 'G', semanticIdentityPreserved: true });
  assert.deepEqual(validateMovement(before, structuredClone(before), 'V'), { ok: true, movementClass: 'V', semanticIdentityPreserved: true });
  assert.deepEqual(validateMovement(before, structuredClone(before), 'A'), { ok: true, movementClass: 'A', semanticIdentityPreserved: true });
  const after = structuredClone(before);
  after.placement.primary = placement('furnishing-placement.vexlife.relationships.primary-rebound', { presentation: 'presentation.vexlife.relationships.active-surface', route: 'route.relationships' });
  assert.deepEqual(validateMovement(before, after, 'P'), { ok: true, movementClass: 'P', semanticIdentityPreserved: true });
  const bad = structuredClone(before);
  bad.subject.resourceRefOrNull = 'feature.vexlife.other';
  assert.throws(() => validateMovement(before, bad, 'P'), /cannot change Furnishing or semantic subject identity/u);
});

test('VF02A-11 S semantic migration is rejected and routed outside Furnishing', () => {
  const before = relationshipsRecord();
  assert.throws(() => validateMovement(before, structuredClone(before), 'S'), /semantic migration must be routed to the semantic owner/u);
});

test('VF02A-12 duplicate, unknown and authority-acquiring references fail closed', () => {
  const rel = relationshipsRecord();
  rel.bindings.visibility.push(structuredClone(rel.bindings.currentness[0]));
  assert.throws(() => compileFurnishingRegistry(registryWith(rel), { knownRefs: knownRefs() }), /duplicate bindingRef/u);
  const authorityField = relationshipsRecord();
  authorityField.actionRef = 'action.relationships.connect';
  assert.throws(() => compileFurnishingRegistry(registryWith(authorityField), { knownRefs: knownRefs() }), /unsupported field actionRef/u);
  const compiled = compileFurnishingRegistry(registryWith(relationshipsRecord()), { knownRefs: knownRefs() });
  assert.throws(() => projectFurnishings(compiled, { observations: [
    { bindingRef: 'binding.relationships.currentness', ownerRef: 'github.issue.vexlife.237', sourceRef: 'source.relationships.currentness', state: 'CURRENT', reasonRefs: [], evidenceRefs: [], effectAuthorityGranted: true }
  ] }), /attempts to grant effect authority/u);
});

test('VF02A-13 compile and projection are deterministic for equivalent input', () => {
  const registry = registryWith(relationshipsRecord(), continueRecord());
  const a = compileFurnishingRegistry(registry, { knownRefs: knownRefs() });
  const b = compileFurnishingRegistry(structuredClone(registry), { knownRefs: knownRefs() });
  assert.equal(a.registryRevision, b.registryRevision);
  const observations = [
    { bindingRef: 'binding.relationships.currentness', ownerRef: 'github.issue.vexlife.237', sourceRef: 'source.relationships.currentness', state: 'CURRENT', reasonRefs: [], evidenceRefs: [], effectAuthorityGranted: false },
    { bindingRef: 'binding.relationships.visibility', ownerRef: 'github.issue.vexlife.719', sourceRef: 'source.relationships.visibility', state: 'VISIBLE', reasonRefs: ['reason.visible'], evidenceRefs: [], effectAuthorityGranted: false },
    { bindingRef: 'binding.continue.currentness', ownerRef: 'github.issue.vexlife.634', sourceRef: 'source.continue.resumable', state: 'CURRENT', reasonRefs: [], evidenceRefs: [], effectAuthorityGranted: false }
  ];
  const pa = projectFurnishings(a, { observations, includeFurnishingRefsOrNull: ['furnishing.vexlife.relationships', 'furnishing.vexlife.continue'] });
  const pb = projectFurnishings(b, { observations: [...observations].reverse(), includeFurnishingRefsOrNull: ['furnishing.vexlife.continue', 'furnishing.vexlife.relationships'] });
  assert.deepEqual(pa, pb);
});

test('VF02A-14 missing producer input stays UNKNOWN; no production fixture fallback exists', () => {
  const compiled = compileFurnishingRegistry(registryWith(relationshipsRecord()), { knownRefs: knownRefs() });
  const projection = projectFurnishings(compiled, { observations: [] });
  assert.equal(projection.furnishings[0].currentness.state, 'UNKNOWN');
  assert.equal(projection.furnishings[0].visibility.state, 'UNKNOWN');
  assert.ok(projection.furnishings[0].unknowns.includes('MISSING_REQUIRED_BINDING:binding.relationships.currentness'));
});

test('VF02A-15 no protected/domain effect can be granted by registry or projection', () => {
  for (const value of Object.values(foundation.effects)) assert.equal(value, false);
  const compiled = compileFurnishingRegistry(registryWith(relationshipsRecord()), { knownRefs: knownRefs() });
  const projection = projectFurnishings(compiled, { observations: [] });
  assert.equal(projection.semanticAuthority, false);
  assert.equal(projection.effectAuthorityGranted, false);
  assert.equal(projection.furnishings[0].semanticAuthority, false);
  assert.equal(projection.furnishings[0].effectAuthorityGranted, false);
});