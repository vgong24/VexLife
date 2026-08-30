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
    registryPath: 'producer-registry-path',
    projectionPath: 'producer-projection-path',
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
      liveContextRoutes: ['github.issue.vexlife.308'],
      rewalkEntryRefs: ['github.issue.vexlife.220']
    },
    producer: producer('atlas'),
    meaningSourceRefs: ['github.issue.vexlife.220'],
    liveContextRouteRefs: ['github.issue.vexlife.308'],
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
    answers: {
      subjectRef: envelope.subjectRef,
      whatIsThis: envelope.projection.brief,
      whyDoesItExist: envelope.projection.purpose,
      whereDoesItBelong: [],
      whatMustPrecedeIt: { refs: [], plainLanguage: [] },
      whatDoesItProduceOrUnlock: {
        producesRefs: [],
        producesPlainLanguage: [],
        unlocksRefs: [],
        unlocksPlainLanguage: []
      },
      whatItProves: ['changed weights'],
      whatItDoesNotProve: ['acceptance'],
      liveStatusRoute: ['github.issue.vexlife.308'],
      deeperSourceRoutes: ['github.issue.vexlife.220'],
      recommendedRewalkEntryRefs: ['github.issue.vexlife.220']
    }
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

test('external meaning stateHash is deterministic over stable envelope semantics rather than query alias', () => {
  const envelope = atlasEnvelope();
  const first = projectArchitectureMeaningAtlasNode(envelope);
  const repeated = projectArchitectureMeaningAtlasNode(atlasEnvelope());
  assert.equal(first.stateHash, repeated.stateHash);

  const alias = atlasEnvelope();
  alias.resolutionKey = 'foundation-changing training';
  assert.equal(projectArchitectureMeaningAtlasNode(alias).stateHash, first.stateHash);

  const changedMeaning = atlasEnvelope();
  changedMeaning.projection.purpose = `${changedMeaning.projection.purpose} Exact stable semantic change.`;
  assert.notEqual(projectArchitectureMeaningAtlasNode(changedMeaning).stateHash, first.stateHash);
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

test('profile provenance routes must remain inside envelope-level source and live-context bounds', () => {
  const sourceEscape = atlasEnvelope();
  sourceEscape.projection.sourceRoutes = ['github.issue.vexlife.999'];
  assert.throws(
    () => validateArchitectureMeaningEnvelope(sourceEscape),
    (error) => error?.code === 'ATLAS_MEANING_SOURCE_ROUTE_OUTSIDE_ENVELOPE'
  );

  const rewalkEscape = atlasEnvelope();
  rewalkEscape.projection.rewalkEntryRefs = ['github.issue.vexlife.999'];
  assert.throws(
    () => validateArchitectureMeaningEnvelope(rewalkEscape),
    (error) => error?.code === 'ATLAS_MEANING_REWALK_REF_OUTSIDE_ENVELOPE'
  );

  const liveEscape = atlasEnvelope();
  liveEscape.projection.liveContextRoutes = ['github.issue.vexlife.999'];
  assert.throws(
    () => validateArchitectureMeaningEnvelope(liveEscape),
    (error) => error?.code === 'ATLAS_MEANING_LIVE_ROUTE_OUTSIDE_ENVELOPE'
  );
});

test('human projection uses the accepted answer schema and bounded provenance routes', () => {
  const schemaDrift = humanEnvelope();
  schemaDrift.projection.answers.currentStatus = 'CURRENT';
  assert.throws(
    () => validateArchitectureMeaningEnvelope(schemaDrift),
    (error) => error?.code === 'HUMAN_MEANING_ANSWERS_SCHEMA_DRIFT'
  );

  const sourceEscape = humanEnvelope();
  sourceEscape.projection.answers.deeperSourceRoutes = ['github.issue.vexlife.999'];
  assert.throws(
    () => validateArchitectureMeaningEnvelope(sourceEscape),
    (error) => error?.code === 'HUMAN_MEANING_SOURCE_ROUTE_OUTSIDE_ENVELOPE'
  );

  const liveEscape = humanEnvelope();
  liveEscape.projection.answers.liveStatusRoute = ['github.issue.vexlife.999'];
  assert.throws(
    () => validateArchitectureMeaningEnvelope(liveEscape),
    (error) => error?.code === 'HUMAN_MEANING_LIVE_ROUTE_OUTSIDE_ENVELOPE'
  );
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

test('VLMA-02/08/09 Atlas validates envelopes itself, remains bounded and does not persist external meaning', () => {
  const canonical = { ref: 'module.vexlife.core.atlas', kind: 'MODULE', brief: 'Atlas', edges: [] };
  const atlas = new Atlas([canonical]);
  const envelope = atlasEnvelope();
  const out = atlas.query({
    startRefs: [envelope.subjectRef],
    externalMeaningEnvelopes: [envelope],
    depthLimit: 0,
    resultLimit: 1,
    tokenBudget: 400
  });
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].ref, envelope.subjectRef);
  assert.equal(out.results[0].currentness, 'SOURCE_BOUND_EXTERNAL_MEANING');
  assert.equal(out.results[0].meaningSource, 'SDK_MAA_CONSUMER_ENVELOPE');
  assert.equal(out.results[0].canonicalOwnerRepositoryRef, 'vgong24/Vextreme-SDK');
  assert.equal(out.coverage.resultLimit, 1);
  assert.equal(out.coverage.depthLimit, 0);
  assert.equal(atlas.get(envelope.subjectRef), null, 'query-scoped node must not persist');

  const collisionEnvelope = atlasEnvelope();
  collisionEnvelope.subjectRef = canonical.ref;
  collisionEnvelope.projection.subjectRef = canonical.ref;
  assert.throws(
    () => atlas.query({ externalMeaningEnvelopes: [collisionEnvelope] }),
    (error) => error?.code === 'ATLAS_EXTERNAL_REF_COLLISION'
  );
});

test('direct prebuilt external-node injection is not an admitted Atlas input surface', () => {
  const atlas = new Atlas([]);
  const projected = projectArchitectureMeaningAtlasNode(atlasEnvelope());
  assert.throws(
    () => atlas.query({ externalNodes: [projected] }),
    (error) => error?.code === 'ATLAS_DIRECT_EXTERNAL_NODE_INJECTION_FORBIDDEN'
  );
});

test('hostile envelope mutation cannot bypass Atlas validation by recomputing a node hash', () => {
  const atlas = new Atlas([]);
  const envelope = atlasEnvelope();
  envelope.producer.sourceDigestSha256 = '0'.repeat(64);
  assert.throws(
    () => atlas.query({ externalMeaningEnvelopes: [envelope] }),
    (error) => error?.code === 'ARCHITECTURE_MEANING_SOURCE_DIGEST_MISMATCH'
  );
});

test('VLMA-03/09 adapter does not copy SDK registry bytes or gain filesystem/network/effect machinery', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/core/architecture-meaning.mjs'), 'utf8');
  const fixture = fs.readFileSync(path.join(ROOT, 'test/architecture-meaning.test.mjs'), 'utf8');
  for (const forbidden of [
    'meaning-addressability-registry.json', 'meaningCards', 'writeFile', 'fetch(', 'https://', 'http://',
    'child_process', 'spawn(', 'exec('
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.equal(fixture.includes('docs/private-continuity/'), false, 'public test fixture must not persist private SDK source paths');
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
