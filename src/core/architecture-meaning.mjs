import { semanticHash } from './utils.mjs';

export const ARCHITECTURE_MEANING_CONSUMER_SCHEMA = 'vextreme.architecture-meaning-consumer-envelope/v1';
export const ARCHITECTURE_MEANING_SOURCE = 'SDK_MAA_CONSUMER_ENVELOPE';
export const ARCHITECTURE_MEANING_CURRENTNESS = 'SOURCE_BOUND_EXTERNAL_MEANING';

export const ACCEPTED_SDK_MEANING_PRODUCER = Object.freeze({
  repository: 'vgong24/Vextreme-SDK',
  registrySchemaVersion: 'vextreme.architecture-meaning-registry/v1',
  projectionIndexSchemaVersion: 'vextreme.architecture-meaning-projection-index/v1',
  registryRef: 'registry.vextreme.architecture-meaning.maa00.v1',
  sourceDigestSha256: 'b9ea9a453b346bddb83184f2a3979563cd9c99900014f697bf112200f4d4ad65',
  projectionBundleDigestSha256: '10d13a696084dfb217b15dd289ad6d9fd6b7436c5b8e23538ec633a114d94278',
  profileDigestsSha256: Object.freeze({
    human: '5e00ccc9e9516c35f2bea45f59222f7eee54ffb7aa75435a4ddb675ddcfc8ccb',
    atlas: '3691460b438bfc8d51beefe72e7e40eeef58c1245beea940008e71230e427080'
  }),
  profileVisibilityRefs: Object.freeze({
    human: 'visibility.private-institutional',
    atlas: 'visibility.private-institutional'
  })
});

const SUPPORTED_PROFILES = new Set(['human', 'atlas']);
const HEX64 = /^[0-9a-f]{64}$/u;
const SUBJECT_REF = /^[A-Za-z0-9][A-Za-z0-9._:/#-]*$/u;
const VOLATILE_KEYS = new Set([
  'currentPr', 'currentPR', 'currentHead', 'currentOwner', 'blocker', 'blockers',
  'lifecycle', 'lifecycleState', 'nextAction'
]);
const TOP_LEVEL_KEYS = [
  'schemaVersion', 'status', 'resolutionKey', 'profile', 'profileVisibilityRef',
  'subjectRef', 'projection', 'producer', 'meaningSourceRefs', 'liveContextRouteRefs',
  'coverage', 'guessedMeaning', 'publicationAuthority', 'mutationAuthorityGranted'
];
const PRODUCER_KEYS = [
  'repository', 'registrySchemaVersion', 'projectionIndexSchemaVersion', 'registryRef',
  'registryPath', 'projectionPath', 'topologyRedacted', 'sourceDigestSha256',
  'projectionBundleDigestSha256', 'profileDigestSha256'
];
const ATLAS_PROJECTION_KEYS = [
  'subjectRef', 'subjectClass', 'brief', 'purpose', 'proofBoundary', 'sourceRoutes',
  'liveContextRoutes', 'rewalkEntryRefs'
];
const HUMAN_PROJECTION_KEYS = [
  'subjectRef', 'canonicalName', 'humanShortName', 'oneSentenceMeaning', 'purpose', 'answers'
];
const MAX_BRIEF_CHARS = 1200;

function fail(code, detail = null) {
  const error = new Error(code);
  error.code = code;
  error.detail = detail;
  throw error;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value, expected, code) {
  if (!isObject(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(code, { actual, expected: wanted });
}

function assertString(value, code) {
  if (typeof value !== 'string' || !value.trim()) fail(code);
  return value;
}

function assertStringArray(value, code) {
  if (!Array.isArray(value)) fail(code);
  const seen = new Set();
  for (const item of value) {
    assertString(item, code);
    if (seen.has(item)) fail(`${code}_DUPLICATE`, item);
    seen.add(item);
  }
  return value;
}

function assertDigest(value, expected, code) {
  if (typeof value !== 'string' || !HEX64.test(value) || value !== expected) fail(code, value ?? null);
}

function assertNoVolatileFields(value) {
  if (Array.isArray(value)) {
    for (const item of value) assertNoVolatileFields(item);
    return;
  }
  if (!isObject(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (VOLATILE_KEYS.has(key)) fail('VOLATILE_MEANING_ENVELOPE_FIELD', key);
    assertNoVolatileFields(item);
  }
}

function assertSubjectRef(value) {
  assertString(value, 'MEANING_SUBJECT_REF_REQUIRED');
  if (!SUBJECT_REF.test(value) || value.includes('..')) fail('MEANING_SUBJECT_REF_INVALID', value);
}

function expectedProducerConfig(expectedProducer) {
  if (!isObject(expectedProducer)) fail('EXPECTED_MEANING_PRODUCER_REQUIRED');
  const profiles = expectedProducer.profileDigestsSha256;
  const visibility = expectedProducer.profileVisibilityRefs;
  if (!isObject(profiles) || !isObject(visibility)) fail('EXPECTED_MEANING_PRODUCER_INVALID');
  return expectedProducer;
}

function isPublicVisibility(value) {
  return typeof value === 'string' && value.toLowerCase().includes('public');
}

function validateAtlasProjection(projection, subjectRef) {
  assertExactKeys(projection, ATLAS_PROJECTION_KEYS, 'ATLAS_MEANING_PROJECTION_SCHEMA_DRIFT');
  if (projection.subjectRef !== subjectRef) fail('MEANING_SUBJECT_PROJECTION_MISMATCH');
  assertString(projection.subjectClass, 'ATLAS_MEANING_SUBJECT_CLASS_REQUIRED');
  assertString(projection.brief, 'ATLAS_MEANING_BRIEF_REQUIRED');
  if (projection.brief.length > MAX_BRIEF_CHARS) fail('ATLAS_MEANING_BRIEF_TOO_LARGE');
  assertString(projection.purpose, 'ATLAS_MEANING_PURPOSE_REQUIRED');
  if (!isObject(projection.proofBoundary)) fail('ATLAS_MEANING_PROOF_BOUNDARY_REQUIRED');
  assertStringArray(projection.proofBoundary.proves, 'ATLAS_MEANING_PROVES_INVALID');
  assertStringArray(projection.proofBoundary.doesNotProve, 'ATLAS_MEANING_DOES_NOT_PROVE_INVALID');
  assertStringArray(projection.sourceRoutes, 'ATLAS_MEANING_SOURCE_ROUTES_INVALID');
  assertStringArray(projection.liveContextRoutes, 'ATLAS_MEANING_LIVE_ROUTES_INVALID');
  assertStringArray(projection.rewalkEntryRefs, 'ATLAS_MEANING_REWALK_REFS_INVALID');
  return projection.brief;
}

function validateHumanProjection(projection, subjectRef) {
  assertExactKeys(projection, HUMAN_PROJECTION_KEYS, 'HUMAN_MEANING_PROJECTION_SCHEMA_DRIFT');
  if (projection.subjectRef !== subjectRef) fail('MEANING_SUBJECT_PROJECTION_MISMATCH');
  assertString(projection.canonicalName, 'HUMAN_MEANING_CANONICAL_NAME_REQUIRED');
  assertString(projection.humanShortName, 'HUMAN_MEANING_SHORT_NAME_REQUIRED');
  assertString(projection.oneSentenceMeaning, 'HUMAN_MEANING_BRIEF_REQUIRED');
  if (projection.oneSentenceMeaning.length > MAX_BRIEF_CHARS) fail('HUMAN_MEANING_BRIEF_TOO_LARGE');
  assertString(projection.purpose, 'HUMAN_MEANING_PURPOSE_REQUIRED');
  if (!isObject(projection.answers)) fail('HUMAN_MEANING_ANSWERS_REQUIRED');
  return projection.oneSentenceMeaning;
}

export function validateArchitectureMeaningEnvelope(envelope, expectedProducer = ACCEPTED_SDK_MEANING_PRODUCER) {
  const expected = expectedProducerConfig(expectedProducer);
  assertExactKeys(envelope, TOP_LEVEL_KEYS, 'ARCHITECTURE_MEANING_ENVELOPE_SCHEMA_DRIFT');
  assertNoVolatileFields(envelope);

  if (envelope.schemaVersion !== ARCHITECTURE_MEANING_CONSUMER_SCHEMA) {
    fail('UNSUPPORTED_ARCHITECTURE_MEANING_ENVELOPE_SCHEMA', envelope.schemaVersion ?? null);
  }
  if (envelope.status !== 'RESOLVED') fail('ARCHITECTURE_MEANING_ENVELOPE_NOT_RESOLVED', envelope.status ?? null);
  assertString(envelope.resolutionKey, 'MEANING_RESOLUTION_KEY_REQUIRED');
  if (!SUPPORTED_PROFILES.has(envelope.profile)) fail('UNSUPPORTED_ARCHITECTURE_MEANING_PROFILE', envelope.profile ?? null);
  assertSubjectRef(envelope.subjectRef);
  if (envelope.guessedMeaning !== false) fail('GUESSED_MEANING_FORBIDDEN');
  if (envelope.publicationAuthority !== false) fail('MEANING_PUBLICATION_AUTHORITY_FORBIDDEN');
  if (envelope.mutationAuthorityGranted !== false) fail('MEANING_MUTATION_AUTHORITY_FORBIDDEN');
  if (envelope.coverage !== null) fail('RESOLVED_MEANING_COVERAGE_MUST_BE_NULL');
  assertStringArray(envelope.meaningSourceRefs, 'MEANING_SOURCE_REFS_INVALID');
  assertStringArray(envelope.liveContextRouteRefs, 'MEANING_LIVE_CONTEXT_REFS_INVALID');

  assertExactKeys(envelope.producer, PRODUCER_KEYS, 'ARCHITECTURE_MEANING_PRODUCER_SCHEMA_DRIFT');
  if (envelope.producer.repository !== expected.repository) fail('ARCHITECTURE_MEANING_PRODUCER_REPOSITORY_MISMATCH');
  if (envelope.producer.registrySchemaVersion !== expected.registrySchemaVersion) fail('ARCHITECTURE_MEANING_REGISTRY_SCHEMA_MISMATCH');
  if (envelope.producer.projectionIndexSchemaVersion !== expected.projectionIndexSchemaVersion) fail('ARCHITECTURE_MEANING_PROJECTION_INDEX_SCHEMA_MISMATCH');
  if (envelope.producer.registryRef !== expected.registryRef) fail('ARCHITECTURE_MEANING_REGISTRY_REF_MISMATCH');
  if (envelope.producer.topologyRedacted !== false) fail('ARCHITECTURE_MEANING_TOPOLOGY_REDACTION_CONTRADICTION');
  assertString(envelope.producer.registryPath, 'ARCHITECTURE_MEANING_REGISTRY_PATH_REQUIRED');
  assertString(envelope.producer.projectionPath, 'ARCHITECTURE_MEANING_PROJECTION_PATH_REQUIRED');
  assertDigest(envelope.producer.sourceDigestSha256, expected.sourceDigestSha256, 'ARCHITECTURE_MEANING_SOURCE_DIGEST_MISMATCH');
  assertDigest(envelope.producer.projectionBundleDigestSha256, expected.projectionBundleDigestSha256, 'ARCHITECTURE_MEANING_BUNDLE_DIGEST_MISMATCH');
  assertDigest(envelope.producer.profileDigestSha256, expected.profileDigestsSha256[envelope.profile], 'ARCHITECTURE_MEANING_PROFILE_DIGEST_MISMATCH');

  const expectedVisibility = expected.profileVisibilityRefs[envelope.profile];
  if (!expectedVisibility || envelope.profileVisibilityRef !== expectedVisibility) {
    fail('ARCHITECTURE_MEANING_VISIBILITY_MISMATCH', envelope.profileVisibilityRef ?? null);
  }
  const consumerVisibilityRef = expected.consumerVisibilityRef ?? expectedVisibility;
  if (isPublicVisibility(consumerVisibilityRef) && !isPublicVisibility(envelope.profileVisibilityRef)) {
    fail('PRIVATE_MEANING_ENVELOPE_ON_PUBLIC_PATH');
  }

  const brief = envelope.profile === 'atlas'
    ? validateAtlasProjection(envelope.projection, envelope.subjectRef)
    : validateHumanProjection(envelope.projection, envelope.subjectRef);

  return Object.freeze({
    schemaVersion: envelope.schemaVersion,
    profile: envelope.profile,
    subjectRef: envelope.subjectRef,
    brief,
    producerRepository: envelope.producer.repository,
    sourceDigestSha256: envelope.producer.sourceDigestSha256,
    projectionBundleDigestSha256: envelope.producer.projectionBundleDigestSha256,
    profileDigestSha256: envelope.producer.profileDigestSha256,
    visibilityRef: envelope.profileVisibilityRef
  });
}

function stableEnvelopeSemantics(envelope) {
  return {
    schemaVersion: envelope.schemaVersion,
    profile: envelope.profile,
    profileVisibilityRef: envelope.profileVisibilityRef,
    subjectRef: envelope.subjectRef,
    projection: envelope.projection,
    producer: {
      repository: envelope.producer.repository,
      registrySchemaVersion: envelope.producer.registrySchemaVersion,
      projectionIndexSchemaVersion: envelope.producer.projectionIndexSchemaVersion,
      registryRef: envelope.producer.registryRef,
      sourceDigestSha256: envelope.producer.sourceDigestSha256,
      projectionBundleDigestSha256: envelope.producer.projectionBundleDigestSha256,
      profileDigestSha256: envelope.producer.profileDigestSha256
    },
    meaningSourceRefs: envelope.meaningSourceRefs,
    liveContextRouteRefs: envelope.liveContextRouteRefs
  };
}

function externalNodeBody(envelope, validated) {
  return {
    ref: validated.subjectRef,
    kind: 'EXTERNAL_MEANING',
    brief: validated.brief,
    stateHash: semanticHash(stableEnvelopeSemantics(envelope)),
    currentness: ARCHITECTURE_MEANING_CURRENTNESS,
    edges: [],
    meaningSource: ARCHITECTURE_MEANING_SOURCE,
    canonicalOwnerRepositoryRef: validated.producerRepository,
    sourceBinding: {
      schemaVersion: validated.schemaVersion,
      profile: validated.profile,
      registryRef: envelope.producer.registryRef,
      sourceDigestSha256: validated.sourceDigestSha256,
      projectionBundleDigestSha256: validated.projectionBundleDigestSha256,
      profileDigestSha256: validated.profileDigestSha256
    }
  };
}

export function projectArchitectureMeaningAtlasNode(envelope, expectedProducer = ACCEPTED_SDK_MEANING_PRODUCER) {
  const validated = validateArchitectureMeaningEnvelope(envelope, expectedProducer);
  return Object.freeze(externalNodeBody(envelope, validated));
}

// [VXG RealForever]
