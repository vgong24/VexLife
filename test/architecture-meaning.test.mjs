import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ACCEPTED_SDK_MEANING_PRODUCER,
  projectArchitectureMeaningAtlasNode,
  validateArchitectureMeaningEnvelope
} from '../src/core/architecture-meaning.mjs';
import { Atlas } from '../src/core/atlas.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function producer(profile = 'atlas') {
  return {
    repository: 'vgong24/Vextreme-SDK',
    registrySchemaVersion: 'vextreme.architecture-meaning-registry/v1',
    projectionIndexSchemaVersion: 'vextreme.architecture-meaning-projection-index/v1',
    registryRef: 'registry.vextreme.architecture-meaning.maa00.v1',
    registryPath: 'docs/private-continuity/architecture-accessibility/meaning-addressability-registry.json',
    projectionPath: 'docs/private-continuity/architecture-accessibility/meaning-addressability-projections.json',
    topologyRedacted: false,
    sourceDigestSha256: ACCEPTED_SDK_MEANING_PRODUCER.sourceDigestSha256,
    projectionBundleDigestSha256: ACCEPTED_SDK_MEANING_PRODUCER.projectionBundleDigestSha256,
    profileDigestSha256: ACCEPTED_SDK_MEANING_PRODUCER.profileDigestsSha256[profile]
  };
}

function atlasEnvelope() {
  return {
    schemaVersion: 'vextreme.architecture-meaning-consumer-envelope/v1',
    status: 'RESOLVED',
    resolutionKey: 'G04B',
    profile: 'atlas',
    profileVisibilityRef: 'visibility.private-institutional',
    subjectRef: 'github.issue.vexlife.220',
    projection: {
      subjectRef: 'github.issue.vexlife.220',
      subjectClass: 'STAGE_OR_TRAJECTORY',
      brief: 'The Vex Birth stage that must execute real training and produce a provenance-bound candidate whose neural weights actually changed, rather than another simulated candidate.',
      purpose: 'Prove that Vex learning can enter neural parameters while deterministic boundaries remain separately enforced.',
      proofBoundary: {
        proves: ['A real weight-changing candidate path exists.'],
        doesNotProve: ['The candidate is accepted or current.']
      },
      sourceRoutes: ['github.issue.vexlife.220'],
      liveContextRoutes: ['github.issue.vextreme-sdk.231'],
      rewalkEntryRefs: ['github.issue.vexlife.220']
    },
    producer: producer('atlas'),
    meaningSourceRefs: ['github.issue.vexlife.220'],
    liveContextRouteRefs: ['github.issue.vextreme-sdk.231'],
    coverage: null,
    guessedMeaning: false,
    publicationAuthority: false,
    mutationAuthorityGranted: false
  };
}

function humanEnvelope() {
  const envelope = atlasEnvelope();
  envelope.profile = 'human';
  envelope.producer = producer('human');
  envelope.projection = {
    subjectRef: envelope.subjectRef,
    canonicalName: 'G04B real neural foundation evolution',
    humanShortName: 'Vex changed-weight training',
    oneSentenceMeaning: envelope.projection.brief,
    purpose: envelope.projection.purpose,
    answers: { whatItProves: ['changed weights'], whatItDoesNotProve: ['acceptance'] }
  };
  return envelope;
}

test('VLMA-00 accepted atlas and human envelopes validate and project one thin attributed node', () => {
  for (const envelope of [atlasEnvelope(), humanEnvelope()]) {
    const validated = validateArchitectureMeaningEnvelope(envelope);
    assert.equal(validated.subjectRef, 'github.issue.vexlife.220');
    const node = projectArchitectureMeaningAtlasNode(envelope);
    assert.equal(node.ref, envelope.subjectRef);
    assert.equal(node.kind, 'EXTERNAL_MEANING');
    assert.equal(node.currentness, 'SOURCE_BOUND_EXTERNAL_MEANING');
    assert.equal(node.meaningSource, 'SDK_MAA_CONSUMER_ENVELOPE');
    assert.equal(node.canonicalOwnerRepositoryRef, 'vgong24/Vextreme-SDK');
    assert.deepEqual(node.edges, []);
    assert.match(node.stateHash, /^[0-9a-f]{64}$/);
  }
});

test('VLMA-01/05/06/07 producer, schema, profile, visibility, digest and authority contradictions fail closed', () => {
  const cases = [
    ['ARCHITECTURE_MEANING_PRODUCER_REPOSITORY_MISMATCH', (e) => { e.producer.repository = 'vgong24/VexLife'; }],
    ['ARCHITECTURE_MEANING_SOURCE_DIGEST_MISMATCH', (e) => { e.producer.sourceDigestSha256 = '0'.repeat(64); }],
    ['ARCHITECTURE_MEANING_BUNDLE_DIGEST_MISMATCH', (e) => { e.producer.projectionBundleDigestSha256 = '0'.repeat(64); }],
    ['ARCHITECTURE_MEANING_PROFILE_DIGEST_MISMATCH', (e) => { e.producer.profileDigestSha256 = ACCEPTED_SDK_MEANING_PRODUCER.profileDigestsSha256.human; }],
    ['UNSUPPORTED_ARCHITECTURE_MEANING_ENVELOPE_SCHEMA', (e) => { e.schemaVersion = 'v0'; }],
    ['UNSUPPORTED_ARCHITECTURE_MEANING_PROFILE', (e) => { e.profile = 'auditor'; }],
    ['ARCHITECTURE_MEANING_VISIBILITY_MISMATCH', (e) => { e.profileVisibilityRef = 'visibility.public'; }],
    ['MEANING_MUTATION_AUTHORITY_FORBIDDEN', (e) => { e.mutationAuthorityGranted = true; }]
  ];
  for (const [code, mutate] of cases) {
    const envelope = atlasEnvelope();
    mutate(envelope);
    assert.throws(() => validateArchitectureMeaningEnvelope(envelope), (error) => error?.code === code, code);
  }
});

test('VLMA-04 private envelope cannot be consumed through a public projection path', () => {
  const expected = { ...ACCEPTED_SDK_MEANING_PRODUCER, consumerVisibilityRef: 'visibility.public' };
  assert.throws(
    () => validateArchitectureMeaningEnvelope(atlasEnvelope(), expected),
    (error) => error?.code === 'PRIVATE_MEANING_ENVELOPE_ON_PUBLIC_PATH'
  );
});

test('hostile volatile current-status fields are rejected even when nested', () => {
  const envelope = atlasEnvelope();
  envelope.projection.proofBoundary.currentHead = 'abc';
  assert.throws(
    () => validateArchitectureMeaningEnvelope(envelope),
    (error) => error?.code === 'VOLATILE_MEANING_ENVELOPE_FIELD'
  );
});

test('VLMA-02/08/09 external meaning composes for one bounded query without collision or persistence', () => {
  const canonical = { ref: 'module.vexlife.core.atlas', kind: 'MODULE', brief: 'Atlas', edges: [] };
  const atlas = new Atlas([canonical]);
  const external = projectArchitectureMeaningAtlasNode(atlasEnvelope());
  const out = atlas.query({
    startRefs: [external.ref],
    externalNodes: [external],
    depthLimit: 0,
    resultLimit: 1,
    tokenBudget: 400
  });
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].ref, external.ref);
  assert.equal(out.results[0].currentness, 'SOURCE_BOUND_EXTERNAL_MEANING');
  assert.equal(out.results[0].meaningSource, 'SDK_MAA_CONSUMER_ENVELOPE');
  assert.equal(out.results[0].canonicalOwnerRepositoryRef, 'vgong24/Vextreme-SDK');
  assert.equal(out.coverage.resultLimit, 1);
  assert.equal(out.coverage.depthLimit, 0);
  assert.equal(atlas.get(external.ref), null, 'query-scoped node must not persist');

  const collisionEnvelope = atlasEnvelope();
  collisionEnvelope.subjectRef = canonical.ref;
  collisionEnvelope.projection.subjectRef = canonical.ref;
  const collision = projectArchitectureMeaningAtlasNode(collisionEnvelope);
  assert.throws(
    () => atlas.query({ externalNodes: [collision] }),
    (error) => error?.code === 'ATLAS_EXTERNAL_REF_COLLISION'
  );
});

test('external node state hash and edge admission cannot be forged', () => {
  const atlas = new Atlas([]);
  const forgedHash = { ...projectArchitectureMeaningAtlasNode(atlasEnvelope()), stateHash: '0'.repeat(64) };
  assert.throws(() => atlas.query({ externalNodes: [forgedHash] }), (error) => error?.code === 'ATLAS_EXTERNAL_STATE_HASH_MISMATCH');

  const withEdge = projectArchitectureMeaningAtlasNode(atlasEnvelope());
  const forgedEdge = { ...withEdge, edges: [{ type: 'ROUTES_TO', to: 'x' }] };
  assert.throws(() => atlas.query({ externalNodes: [forgedEdge] }), (error) => error?.code === 'ATLAS_EXTERNAL_EDGES_NOT_ADMITTED');
});

test('VLMA-03/09 adapter does not copy SDK registry bytes or gain filesystem/network/effect machinery', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/core/architecture-meaning.mjs'), 'utf8');
  for (const forbidden of [
    'meaning-addressability-registry.json', 'meaningCards', 'writeFile', 'fetch(', 'https://', 'http://',
    'child_process', 'spawn(', 'exec('
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

test('VLMA-10 architecture meaning adapter is registered in the core module registry', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint/module-registry/core.json'), 'utf8'));
  const entry = registry.find((item) => item.moduleRef === 'module.vexlife.core.architecture-meaning');
  assert.ok(entry);
  assert.equal(entry.path, 'src/core/architecture-meaning.mjs');
  assert.deepEqual(entry.tests, ['test/architecture-meaning.test.mjs']);
  assert.equal(entry.writes.length, 0);
});

// [VXG RealForever]
