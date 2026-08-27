import { semanticHash } from './utils.mjs';

export const REVIEW_PROCESS_REF = 'process.vexlife.review.compile-expectations-and-coverage';
export const REVIEW_EXPECTATION_SCHEMA = 'vexlife.review-expectation-set/v1';
export const REVIEW_COVERAGE_SCHEMA = 'vexlife.review-coverage-receipt/v1';
export const REVIEW_COMPOSITION_SCHEMA = 'vexlife.review-composition-result/v1';
export const REVIEW_SOURCE_VERIFICATION_SCHEMA = 'vexlife.review-source-binding-verification/v1';

export const REQUIRED_REVIEW_SOURCE_KINDS = Object.freeze([
  'FEATURE_REGISTRY',
  'REVIEW_LENS_REGISTRY',
  'INTERFACE_SCREEN_AND_SHARED_SURFACE',
  'ACTION_PERMISSION_EFFECT',
  'STATE_DOMAIN_OWNER',
  'EXPERIENCE_PROFILE_GESTURE_VESSEL',
  'TEST_AND_OWNER_DOMAIN_EVIDENCE',
  'EXPERIENCE_REVIEW_CAPTURE_SEAM'
]);

export const REVIEW_FEEDBACK_STATES = Object.freeze([
  'IDLE',
  'FOCUSED',
  'HOVERED',
  'PRESSED',
  'ARMED',
  'EXPANDED',
  'COLLAPSED',
  'SELECTED',
  'CURRENT',
  'BUSY',
  'DISABLED_WITH_REASON',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'UNDO_AVAILABLE',
  'RECOVERED'
]);

export const REVIEW_COVERAGE_DIMENSIONS = Object.freeze([
  'canonicalIdentity',
  'renderBinding',
  'typedActionPermissionEffect',
  'stateOwner',
  'interactionFeedback',
  'journeyEntry',
  'journeyDepth',
  'inverseOrRecovery',
  'keyboard',
  'accessibility',
  'localization',
  'viewport',
  'inputModality',
  'reducedMotion',
  'platform',
  'negativePath',
  'adversarial',
  'evidenceMilestone'
]);

const HEX40 = /^[0-9a-f]{40}$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
const SOURCE_PRIMARY_ID_KEYS = Object.freeze({
  FEATURE_REGISTRY: Object.freeze(['featureRef']),
  REVIEW_LENS_REGISTRY: Object.freeze(['lensRef']),
  INTERFACE_SCREEN_AND_SHARED_SURFACE: Object.freeze(['elementRef', 'regionRef', 'screenRef', 'componentRef']),
  ACTION_PERMISSION_EFFECT: Object.freeze(['actionRef', 'permissionRef', 'effectRef']),
  STATE_DOMAIN_OWNER: Object.freeze(['stateRef', 'stateOwnerRef']),
  EXPERIENCE_PROFILE_GESTURE_VESSEL: Object.freeze(['experienceProfileRef', 'gestureRef', 'vesselRef']),
  TEST_AND_OWNER_DOMAIN_EVIDENCE: Object.freeze(['testRef', 'evidenceRef']),
  EXPERIENCE_REVIEW_CAPTURE_SEAM: Object.freeze(['captureRef'])
});

const ALL_PRIMARY_ID_KEYS = Object.freeze(
  [...new Set(Object.values(SOURCE_PRIMARY_ID_KEYS).flat())]
);

function fail(code, detail, extra = {}) {
  const error = new Error(detail);
  error.name = 'ReviewCompositionError';
  error.code = code;
  Object.assign(error, extra);
  throw error;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('MALFORMED_INPUT', `${label} must be an object`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail('MALFORMED_INPUT', `${label} must be a non-empty string`);
  return value;
}

function requireStringArray(value, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    fail('MALFORMED_INPUT', `${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array`);
  }
  const result = value.map((item, index) => requireString(item, `${label}[${index}]`));
  if (new Set(result).size !== result.length) fail('DUPLICATE_IDENTITY', `${label} contains duplicate values`);
  return result;
}

function sortedUnique(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))].sort();
}

function deepFreezeSafeClone(value) {
  return structuredClone(value);
}

function recordIdentity(record, identityKeys = ALL_PRIMARY_ID_KEYS) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  for (const key of identityKeys) {
    if (typeof record[key] === 'string' && record[key].length > 0) return record[key];
  }
  return null;
}

function walkRecords(value, visitor, seen = new Set(), identityKeys = ALL_PRIMARY_ID_KEYS) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (!Array.isArray(value)) {
    const identity = recordIdentity(value, identityKeys);
    if (identity) visitor(identity, value);
    for (const child of Object.values(value)) walkRecords(child, visitor, seen, identityKeys);
    return;
  }
  for (const child of value) walkRecords(child, visitor, seen, identityKeys);
}

function collectRefs(value, refs = new Set(), seen = new Set()) {
  if (typeof value === 'string') {
    if (value.includes('.') && !value.includes(' ')) refs.add(value);
    return refs;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return refs;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const child of value) collectRefs(child, refs, seen);
    return refs;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key.endsWith('Ref') && typeof child === 'string') refs.add(child);
    else if (key.endsWith('Refs') && Array.isArray(child)) {
      for (const ref of child) if (typeof ref === 'string') refs.add(ref);
    }
    collectRefs(child, refs, seen);
  }
  return refs;
}

function normalizeSourceEntry(entry, index) {
  requireObject(entry, `sourceBundle.sources[${index}]`);
  const sourceKind = requireString(entry.sourceKind, `sourceBundle.sources[${index}].sourceKind`);
  const envelope = requireObject(entry.envelope, `sourceBundle.sources[${index}].envelope`);
  if (envelope.sourceKind !== sourceKind) fail('SOURCE_KIND_MISMATCH', `${sourceKind} envelope sourceKind mismatch`);
  requireString(envelope.repositoryRef, `${sourceKind}.repositoryRef`);
  if (!HEX40.test(envelope.commitRef ?? '')) fail('UNVERIFIED_SOURCE_BINDING', `${sourceKind}.commitRef must be exact lowercase Git object hex`);
  if (envelope.treeRefOrNull !== null && !HEX40.test(envelope.treeRefOrNull ?? '')) {
    fail('UNVERIFIED_SOURCE_BINDING', `${sourceKind}.treeRefOrNull must be null or exact lowercase Git object hex`);
  }
  requireString(envelope.sourcePathRef, `${sourceKind}.sourcePathRef`);
  if (!HEX40.test(envelope.blobRef ?? '')) fail('UNVERIFIED_SOURCE_BINDING', `${sourceKind}.blobRef must be exact lowercase Git object hex`);
  if (envelope.currentness !== 'CURRENT') fail('STALE_SOURCE_BINDING', `${sourceKind} currentness must be CURRENT`);
  if (envelope.bindingState !== 'VERIFIED') fail('UNVERIFIED_SOURCE_BINDING', `${sourceKind} bindingState must be VERIFIED`);
  requireString(envelope.verificationRef, `${sourceKind}.verificationRef`);
  if (!HEX64.test(envelope.valueSemanticHash ?? '')) fail('UNVERIFIED_SOURCE_BINDING', `${sourceKind}.valueSemanticHash must be lowercase SHA-256 hex`);
  const actualValueHash = semanticHash(entry.value);
  if (actualValueHash !== envelope.valueSemanticHash) {
    fail('SOURCE_VALUE_HASH_MISMATCH', `${sourceKind} normalized value does not match verified semantic hash`, {
      sourceKind,
      expected: envelope.valueSemanticHash,
      observed: actualValueHash
    });
  }
  return { sourceKind, envelope: deepFreezeSafeClone(envelope), value: deepFreezeSafeClone(entry.value) };
}

function verificationReceiptCore(receipt) {
  return {
    schemaVersion: receipt.schemaVersion,
    verificationRef: receipt.verificationRef,
    verifierRef: receipt.verifierRef,
    verificationClass: receipt.verificationClass,
    verificationState: receipt.verificationState,
    sourceKind: receipt.sourceKind,
    repositoryRef: receipt.repositoryRef,
    commitRef: receipt.commitRef,
    treeRefOrNull: receipt.treeRefOrNull,
    sourcePathRef: receipt.sourcePathRef,
    blobRef: receipt.blobRef,
    valueSemanticHash: receipt.valueSemanticHash
  };
}

function verifyIndependentSourceBinding(source, repositoryEvidenceProvider) {
  if (repositoryEvidenceProvider == null) {
    fail('UNVERIFIED_SOURCE_BINDING', 'independent repositoryEvidenceProvider is required for actual source-object binding');
  }
  requireObject(repositoryEvidenceProvider, 'repositoryEvidenceProvider');
  if (repositoryEvidenceProvider.verificationClass !== 'INDEPENDENT_REPOSITORY_EVIDENCE') {
    fail('UNVERIFIED_SOURCE_BINDING', 'repositoryEvidenceProvider must declare INDEPENDENT_REPOSITORY_EVIDENCE');
  }
  const verifierRef = requireString(repositoryEvidenceProvider.verifierRef, 'repositoryEvidenceProvider.verifierRef');
  if (typeof repositoryEvidenceProvider.verifySourceBinding !== 'function') {
    fail('UNVERIFIED_SOURCE_BINDING', 'repositoryEvidenceProvider must expose verifySourceBinding()');
  }

  let receipt;
  try {
    receipt = repositoryEvidenceProvider.verifySourceBinding({
      sourceKind: source.sourceKind,
      envelope: deepFreezeSafeClone(source.envelope),
      valueSemanticHash: source.envelope.valueSemanticHash
    });
  } catch (error) {
    fail('UNVERIFIED_SOURCE_BINDING', `${source.sourceKind} independent repository evidence rejected the source binding: ${error?.message ?? error}`);
  }
  requireObject(receipt, `${source.sourceKind} repository verification receipt`);
  const expected = {
    schemaVersion: REVIEW_SOURCE_VERIFICATION_SCHEMA,
    verificationRef: source.envelope.verificationRef,
    verifierRef,
    verificationClass: 'INDEPENDENT_REPOSITORY_EVIDENCE',
    verificationState: 'VERIFIED_CURRENT',
    sourceKind: source.sourceKind,
    repositoryRef: source.envelope.repositoryRef,
    commitRef: source.envelope.commitRef,
    treeRefOrNull: source.envelope.treeRefOrNull,
    sourcePathRef: source.envelope.sourcePathRef,
    blobRef: source.envelope.blobRef,
    valueSemanticHash: source.envelope.valueSemanticHash
  };
  const actual = verificationReceiptCore(receipt);
  if (semanticHash(actual) !== semanticHash(expected)) {
    fail('UNVERIFIED_SOURCE_BINDING', `${source.sourceKind} repository verification receipt does not exactly bind the supplied source object`);
  }
  if (!HEX64.test(receipt.semanticFingerprint ?? '') || receipt.semanticFingerprint !== semanticHash(actual)) {
    fail('UNVERIFIED_SOURCE_BINDING', `${source.sourceKind} repository verification receipt fingerprint is invalid`);
  }
  return { ...actual, semanticFingerprint: receipt.semanticFingerprint };
}

export function inspectReviewSourceBundle(sourceBundle, { repositoryEvidenceProvider } = {}) {
  requireObject(sourceBundle, 'sourceBundle');
  const sources = Array.isArray(sourceBundle.sources) ? sourceBundle.sources.map(normalizeSourceEntry) : fail('MALFORMED_INPUT', 'sourceBundle.sources must be an array');
  const seenKinds = new Set();
  for (const source of sources) {
    if (seenKinds.has(source.sourceKind)) fail('DUPLICATE_SOURCE_KIND', `duplicate source kind ${source.sourceKind}`);
    seenKinds.add(source.sourceKind);
  }
  const missingKinds = REQUIRED_REVIEW_SOURCE_KINDS.filter((kind) => !seenKinds.has(kind));
  if (missingKinds.length) fail('MISSING_SOURCE_KIND', `missing required review source kinds: ${missingKinds.join(', ')}`, { missingKinds });
  const ordered = [...sources].sort((a, b) => a.sourceKind.localeCompare(b.sourceKind));

  const versions = new Set(ordered.map(({ envelope }) => semanticHash({
    repositoryRef: envelope.repositoryRef,
    commitRef: envelope.commitRef,
    treeRefOrNull: envelope.treeRefOrNull
  })));
  if (versions.size !== 1) {
    fail('MIXED_SOURCE_VERSION', 'review source bundle must bind one exact repository/commit/tree version');
  }

  const verificationReceipts = ordered.map((source) => verifyIndependentSourceBinding(source, repositoryEvidenceProvider));
  const verificationByRef = new Map(verificationReceipts.map((receipt) => [receipt.verificationRef, receipt]));
  const sourceBindingCore = ordered.map(({ sourceKind, envelope }) => {
    const verification = verificationByRef.get(envelope.verificationRef);
    return {
      sourceKind,
      repositoryRef: envelope.repositoryRef,
      commitRef: envelope.commitRef,
      treeRefOrNull: envelope.treeRefOrNull,
      sourcePathRef: envelope.sourcePathRef,
      blobRef: envelope.blobRef,
      schemaVersionOrNull: envelope.schemaVersionOrNull ?? null,
      registryRefOrNull: envelope.registryRefOrNull ?? null,
      registryVersionOrNull: envelope.registryVersionOrNull ?? null,
      currentness: envelope.currentness,
      bindingState: envelope.bindingState,
      verificationRef: envelope.verificationRef,
      verifierRef: verification.verifierRef,
      verificationState: verification.verificationState,
      verificationFingerprint: verification.semanticFingerprint,
      valueSemanticHash: envelope.valueSemanticHash
    };
  });
  const sourceBundleHash = semanticHash(sourceBindingCore);
  return {
    sources: ordered,
    sourceBundleRef: `source-bundle.vexlife.review.${sourceBundleHash.slice(0, 24)}`,
    sourceVersionRef: `source-version.vexlife.review.${sourceBundleHash.slice(0, 24)}`,
    sourceBundleHash,
    sourceEnvelopes: sourceBindingCore
  };
}

function indexSourceRecords(bundleInspection) {
  const byRef = new Map();
  const sourceByKind = new Map();
  for (const source of bundleInspection.sources) {
    sourceByKind.set(source.sourceKind, source);
    const identityKeys = SOURCE_PRIMARY_ID_KEYS[source.sourceKind];
    if (!identityKeys) fail('MALFORMED_SOURCE_KIND', `no primary identity policy registered for source kind ${source.sourceKind}`);
    walkRecords(source.value, (ref, record) => {
      if (byRef.has(ref)) {
        fail('DUPLICATE_IDENTITY', `canonical ref ${ref} appears more than once in supplied review sources`, {
          ref,
          firstSourceKind: byRef.get(ref).sourceKind,
          secondSourceKind: source.sourceKind
        });
      }
      byRef.set(ref, { sourceKind: source.sourceKind, record });
    }, new Set(), identityKeys);
  }
  return { byRef, sourceByKind };
}

function findFeatureRecords(sourceByKind) {
  const source = sourceByKind.get('FEATURE_REGISTRY');
  const features = source?.value?.features;
  if (!Array.isArray(features)) fail('MALFORMED_SOURCE_KIND', 'FEATURE_REGISTRY value must expose features[]');
  return features;
}

function findLensRecords(sourceByKind) {
  const source = sourceByKind.get('REVIEW_LENS_REGISTRY');
  const lenses = source?.value?.lenses;
  if (!Array.isArray(lenses)) fail('MALFORMED_SOURCE_KIND', 'REVIEW_LENS_REGISTRY value must expose lenses[]');
  return lenses;
}

function normalizeRequest(request) {
  requireObject(request, 'request');
  return {
    subjectRefs: [...requireStringArray(request.subjectRefs, 'request.subjectRefs', { allowEmpty: false })].sort(),
    purposeRefs: [...requireStringArray(request.purposeRefs, 'request.purposeRefs', { allowEmpty: false })].sort(),
    reviewDepthPolicyRef: requireString(request.reviewDepthPolicyRef, 'request.reviewDepthPolicyRef'),
    expectationOverrideRefs: [...requireStringArray(request.expectationOverrideRefs ?? [], 'request.expectationOverrideRefs')].sort(),
    libertySuggestionPolicyRef: request.libertySuggestionPolicyRef == null ? null : requireString(request.libertySuggestionPolicyRef, 'request.libertySuggestionPolicyRef'),
    contextRefOrNull: request.contextRefOrNull == null ? null : requireString(request.contextRefOrNull, 'request.contextRefOrNull'),
    contextSourceRefs: [...requireStringArray(request.contextSourceRefs ?? [], 'request.contextSourceRefs')].sort(),
    environmentScope: deepFreezeSafeClone(request.environmentScope ?? {}),
    evidenceBudget: deepFreezeSafeClone(request.evidenceBudget ?? {})
  };
}

function featureRefsForSubjects(subjectRefs, features, byRef) {
  const result = new Set();
  for (const subjectRef of subjectRefs) {
    const direct = byRef.get(subjectRef)?.record;
    if (direct?.featureRef === subjectRef) result.add(subjectRef);
  }
  for (const feature of features) {
    const relations = new Set([
      feature.featureRef,
      ...(feature.canonicalNodeRefs ?? []),
      ...(feature.stateRefs ?? []),
      ...(feature.actionRefs ?? []),
      ...(feature.permissionRefs ?? []),
      ...(feature.processRefs ?? []),
      ...(feature.moduleRefs ?? []),
      ...(feature.projectionRefs ?? [])
    ]);
    if (subjectRefs.some((ref) => relations.has(ref))) result.add(feature.featureRef);
  }
  return [...result].sort();
}

function aggregateFeatureRelationships(features) {
  const aggregate = {
    canonicalNodeRefs: [],
    stateRefs: [],
    actionRefs: [],
    permissionRefs: [],
    processRefs: [],
    moduleRefs: [],
    localizationRefs: [],
    platformRefs: [],
    testRefs: [],
    reviewLensRefs: [],
    rollbackOrRecoveryRefs: [],
    projectionRefs: [],
    effectClasses: []
  };
  for (const feature of features) {
    for (const key of ['canonicalNodeRefs', 'stateRefs', 'actionRefs', 'permissionRefs', 'processRefs', 'moduleRefs', 'localizationRefs', 'platformRefs', 'testRefs', 'reviewLensRefs', 'projectionRefs']) {
      aggregate[key].push(...(feature[key] ?? []));
    }
    if (feature.rollbackRouteRef) aggregate.rollbackOrRecoveryRefs.push(feature.rollbackRouteRef);
    if (feature.effectClass) aggregate.effectClasses.push(feature.effectClass);
  }
  return Object.fromEntries(Object.entries(aggregate).map(([key, value]) => [key, sortedUnique(value)]));
}

function hasAllowedPrefix(ref, allowedPrefixes) {
  return typeof ref === 'string' && allowedPrefixes.some((prefix) => ref.startsWith(prefix));
}

function relatedRecordsByStructuralRefs(value, seedRefs, allowedPrefixes, identityKeys) {
  const all = [];
  walkRecords(value, (ref, record) => all.push({ ref, record }), new Set(), identityKeys);
  const selected = new Map();
  const frontier = new Set(seedRefs.filter((ref) => hasAllowedPrefix(ref, allowedPrefixes)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const { ref, record } of all) {
      if (selected.has(ref)) continue;
      const recordRefs = [...collectRefs(record)].filter((candidate) => hasAllowedPrefix(candidate, allowedPrefixes));
      const connected = frontier.has(ref) || recordRefs.some((candidate) => frontier.has(candidate));
      if (!connected) continue;
      selected.set(ref, record);
      if (hasAllowedPrefix(ref, allowedPrefixes)) frontier.add(ref);
      for (const candidate of recordRefs) frontier.add(candidate);
      changed = true;
    }
  }
  return [...selected.values()];
}

function evidenceRefsReferencing(value, targetRefs, idPrefix, identityKeys) {
  const targets = new Set(targetRefs);
  const refs = [];
  walkRecords(value, (ref, record) => {
    if (!ref.startsWith(idPrefix)) return;
    const recordRefs = collectRefs(record);
    if ([...recordRefs].some((candidate) => targets.has(candidate))) refs.push(ref);
  }, new Set(), identityKeys);
  return sortedUnique(refs);
}

function stateOwnerRefsForState(stateRefs, byRef) {
  const refs = [];
  for (const stateRef of stateRefs) {
    const record = byRef.get(stateRef)?.record;
    if (!record) continue;
    for (const key of ['stateOwnerRef', 'ownerRef', 'canonicalOwnerRef']) {
      if (typeof record[key] === 'string') refs.push(record[key]);
    }
  }
  return sortedUnique(refs);
}

function feedbackExpectations(interfaceRecords) {
  const explicit = new Map();
  for (const record of interfaceRecords) {
    for (const stateRef of record.interactionStateRefs ?? []) {
      const normalized = stateRef.split('.').at(-1)?.replace(/-/g, '_').toUpperCase();
      if (REVIEW_FEEDBACK_STATES.includes(normalized)) explicit.set(normalized, stateRef);
    }
    for (const item of record.reviewInteractionStates ?? []) {
      if (!item || typeof item !== 'object' || !REVIEW_FEEDBACK_STATES.includes(item.state)) continue;
      explicit.set(item.state, item.ref ?? null);
    }
  }
  return REVIEW_FEEDBACK_STATES.map((state) => explicit.has(state)
    ? { state, disposition: 'PLACED', refOrNull: explicit.get(state) }
    : { state, disposition: 'UNKNOWN', refOrNull: null, question: `Which accepted source, if any, establishes ${state} feedback for this review subject?` });
}

function lensEvidenceRequirements(reviewLensRefs, lenses) {
  const lensByRef = new Map(lenses.map((lens) => [lens.lensRef, lens]));
  const requirements = [];
  for (const lensRef of reviewLensRefs) {
    const lens = lensByRef.get(lensRef);
    if (!lens) {
      requirements.push({ lensRef, disposition: 'UNKNOWN', requiredEvidence: [], question: `Review Lens ${lensRef} is referenced but absent from the supplied current lens source.` });
      continue;
    }
    requirements.push({
      lensRef,
      disposition: 'PLACED',
      requiredEvidence: sortedUnique(lens.requiredEvidence ?? [])
    });
  }
  return requirements;
}

function environmentCells(request, platformRefs) {
  const scope = requireObject(request.environmentScope ?? {}, 'request.environmentScope');
  const scoped = (value, label) => value == null ? [] : [...requireStringArray(value, label)].sort();
  const platforms = sortedUnique(scoped(scope.platformRefs, 'request.environmentScope.platformRefs').length
    ? scoped(scope.platformRefs, 'request.environmentScope.platformRefs')
    : platformRefs);
  const locales = scoped(scope.localeRefs, 'request.environmentScope.localeRefs');
  const viewports = scoped(scope.viewportClassRefs, 'request.environmentScope.viewportClassRefs');
  const modalities = scoped(scope.inputModalityRefs, 'request.environmentScope.inputModalityRefs');
  const motion = scoped(scope.reducedMotionRefs, 'request.environmentScope.reducedMotionRefs');

  const axes = [
    platforms,
    locales.length ? locales : [null],
    viewports.length ? viewports : [null],
    modalities.length ? modalities : [null],
    motion.length ? motion : [null]
  ];
  const requiredCellCount = axes.reduce((count, axis) => count * axis.length, 1);
  const maxEnvironmentCells = request.evidenceBudget?.maxEnvironmentCells;
  if (maxEnvironmentCells != null && (!Number.isInteger(maxEnvironmentCells) || maxEnvironmentCells < 1)) {
    fail('MALFORMED_INPUT', 'request.evidenceBudget.maxEnvironmentCells must be a positive integer when supplied');
  }
  if (maxEnvironmentCells != null && requiredCellCount > maxEnvironmentCells) {
    fail('EVIDENCE_BUDGET_EXCEEDED',
      `environment scope requires ${requiredCellCount} cells but maxEnvironmentCells is ${maxEnvironmentCells}`,
      { requiredCellCount, maxEnvironmentCells });
  }

  const cells = [];
  for (const platformRef of axes[0]) {
    for (const localeRef of axes[1]) {
      for (const viewportClassRef of axes[2]) {
        for (const inputModalityRef of axes[3]) {
          for (const reducedMotionRef of axes[4]) {
            const identity = { platformRef, localeRef, viewportClassRef, inputModalityRef, reducedMotionRef };
            const cellHash = semanticHash(identity);
            cells.push({
              environmentCellRef: `environment-cell.vexlife.review.${cellHash.slice(0, 24)}`,
              ...identity,
              evidenceState: 'HELD_NO_EXACT_EVIDENCE',
              evidenceRefs: [],
              unresolvedQuestionOrNull: `Which exact current evidence proves environment cell ${platformRef} / ${localeRef ?? 'ANY_LOCALE'} / ${viewportClassRef ?? 'ANY_VIEWPORT'} / ${inputModalityRef ?? 'ANY_INPUT'} / ${reducedMotionRef ?? 'ANY_MOTION'}?`
            });
          }
        }
      }
    }
  }
  return cells.sort((a, b) => a.environmentCellRef.localeCompare(b.environmentCellRef));
}

export function compileReviewExpectationSet({ request, sourceBundle, repositoryEvidenceProvider }) {
  const normalizedRequest = normalizeRequest(request);
  const bundleInspection = inspectReviewSourceBundle(sourceBundle, { repositoryEvidenceProvider });
  const { byRef, sourceByKind } = indexSourceRecords(bundleInspection);
  const features = findFeatureRecords(sourceByKind);
  const lenses = findLensRecords(sourceByKind);

  for (const subjectRef of normalizedRequest.subjectRefs) {
    if (!byRef.has(subjectRef)) fail('UNRESOLVED_REVIEW_SUBJECT', `review subject ${subjectRef} is not present in the supplied current source bundle`, { subjectRef });
  }

  const featureRefs = featureRefsForSubjects(normalizedRequest.subjectRefs, features, byRef);
  const featureByRef = new Map(features.map((feature) => [feature.featureRef, feature]));
  const selectedFeatures = featureRefs.map((ref) => featureByRef.get(ref)).filter(Boolean);
  const aggregate = aggregateFeatureRelationships(selectedFeatures);

  const seedRefs = sortedUnique([...normalizedRequest.subjectRefs, ...aggregate.canonicalNodeRefs]);
  const interfaceValue = sourceByKind.get('INTERFACE_SCREEN_AND_SHARED_SURFACE').value;
  const interfaceIdentityKeys = SOURCE_PRIMARY_ID_KEYS.INTERFACE_SCREEN_AND_SHARED_SURFACE;
  const interfaceRecords = relatedRecordsByStructuralRefs(
    interfaceValue,
    seedRefs,
    ['screen.', 'region.', 'element.', 'component.', 'shared-surface.'],
    interfaceIdentityKeys
  );
  const interfaceRefs = sortedUnique(interfaceRecords.map((record) => recordIdentity(record, interfaceIdentityKeys)));

  const screenRefs = sortedUnique([...normalizedRequest.subjectRefs.filter((ref) => ref.startsWith('screen.')), ...interfaceRefs.filter((ref) => ref.startsWith('screen.'))]);
  const regionRefs = interfaceRefs.filter((ref) => ref.startsWith('region.'));
  const elementRefs = interfaceRefs.filter((ref) => ref.startsWith('element.'));
  const componentRefs = interfaceRefs.filter((ref) => ref.startsWith('component.'));
  const stateOwnerRefs = stateOwnerRefsForState(aggregate.stateRefs, byRef);

  const unknowns = [];
  if (featureRefs.length === 0) {
    unknowns.push({
      unknownRef: `unknown.review.feature-binding.${semanticHash(normalizedRequest.subjectRefs).slice(0, 16)}`,
      kind: 'FEATURE_BINDING',
      subjectRefs: normalizedRequest.subjectRefs,
      question: `Which canonical Feature, if any, owns or binds the review subject ${normalizedRequest.subjectRefs.join(', ')}?`
    });
  }

  const feedback = feedbackExpectations(interfaceRecords);
  for (const item of feedback) {
    if (item.disposition === 'UNKNOWN') {
      unknowns.push({
        unknownRef: `unknown.review.feedback.${item.state.toLowerCase()}.${semanticHash(normalizedRequest.subjectRefs).slice(0, 12)}`,
        kind: 'INTERACTION_FEEDBACK',
        state: item.state,
        question: item.question
      });
    }
  }

  const lensRequirements = lensEvidenceRequirements(aggregate.reviewLensRefs, lenses);
  for (const item of lensRequirements) {
    if (item.disposition === 'UNKNOWN') {
      unknowns.push({
        unknownRef: `unknown.review.lens.${semanticHash(item.lensRef).slice(0, 12)}`,
        kind: 'REVIEW_LENS',
        lensRef: item.lensRef,
        question: item.question
      });
    }
  }

  const experienceValue = sourceByKind.get('EXPERIENCE_PROFILE_GESTURE_VESSEL').value;
  const experienceIdentityKeys = SOURCE_PRIMARY_ID_KEYS.EXPERIENCE_PROFILE_GESTURE_VESSEL;
  const experienceRecords = relatedRecordsByStructuralRefs(
    experienceValue,
    seedRefs,
    ['screen.', 'region.', 'element.', 'component.', 'experience.', 'experience-profile.', 'gesture.', 'vessel.'],
    experienceIdentityKeys
  );
  const experienceRefs = sortedUnique(experienceRecords.map((record) => recordIdentity(record, experienceIdentityKeys)));
  const experienceProfileRefs = experienceRefs.filter((ref) => ref.startsWith('experience.'));
  const gestureRefs = experienceRefs.filter((ref) => ref.startsWith('gesture.'));
  const vesselRefs = experienceRefs.filter((ref) => ref.startsWith('vessel.'));

  const evidenceValue = sourceByKind.get('TEST_AND_OWNER_DOMAIN_EVIDENCE').value;
  const ownerDomainEvidenceRefs = evidenceRefsReferencing(
    evidenceValue,
    aggregate.testRefs,
    'evidence.',
    SOURCE_PRIMARY_ID_KEYS.TEST_AND_OWNER_DOMAIN_EVIDENCE
  );
  const captureValue = sourceByKind.get('EXPERIENCE_REVIEW_CAPTURE_SEAM').value;
  const reviewCaptureRefs = evidenceRefsReferencing(
    captureValue,
    sortedUnique([...screenRefs, ...regionRefs, ...elementRefs]),
    'capture.',
    SOURCE_PRIMARY_ID_KEYS.EXPERIENCE_REVIEW_CAPTURE_SEAM
  );

  const actionRefs = aggregate.actionRefs;
  const journeyExpectations = actionRefs.map((actionRef) => ({
    expectationRef: `review-journey-expectation.${semanticHash({ subjectRefs: normalizedRequest.subjectRefs, actionRef }).slice(0, 20)}`,
    actionRef,
    entryStateRefs: aggregate.stateRefs,
    inverseOrReturnDisposition: aggregate.rollbackOrRecoveryRefs.length ? 'PLACED' : 'UNKNOWN',
    rollbackOrRecoveryRefs: aggregate.rollbackOrRecoveryRefs,
    effectPolicy: 'NO_EFFECT_PLAN_ONLY'
  }));

  const placedRefs = sortedUnique([
    ...normalizedRequest.subjectRefs,
    ...featureRefs,
    ...aggregate.canonicalNodeRefs,
    ...aggregate.stateRefs,
    ...stateOwnerRefs,
    ...aggregate.actionRefs,
    ...aggregate.permissionRefs,
    ...aggregate.processRefs,
    ...aggregate.moduleRefs,
    ...aggregate.localizationRefs,
    ...aggregate.platformRefs,
    ...aggregate.testRefs,
    ...aggregate.reviewLensRefs,
    ...aggregate.rollbackOrRecoveryRefs,
    ...aggregate.projectionRefs,
    ...interfaceRefs,
    ...experienceRefs
  ]);

  const core = {
    schemaVersion: REVIEW_EXPECTATION_SCHEMA,
    sourceVersionRef: bundleInspection.sourceVersionRef,
    reviewSubject: {
      subjectRefs: normalizedRequest.subjectRefs,
      featureRefs,
      screenRefs,
      regionRefs,
      elementRefs,
      sharedSurfaceRefs: sortedUnique(normalizedRequest.subjectRefs.filter((ref) => ref.startsWith('screen.') && featureRefs.length === 0)),
      featureBindingDisposition: featureRefs.length ? 'PLACED' : 'UNKNOWN',
      unresolvedFeatureBindingQuestionOrNull: featureRefs.length ? null : unknowns.find((item) => item.kind === 'FEATURE_BINDING')?.question ?? null
    },
    purposeRefs: normalizedRequest.purposeRefs,
    reviewDepthPolicyRef: normalizedRequest.reviewDepthPolicyRef,
    expectationOverrideRefs: normalizedRequest.expectationOverrideRefs,
    libertySuggestionPolicyRef: normalizedRequest.libertySuggestionPolicyRef,
    contextRefOrNull: normalizedRequest.contextRefOrNull,
    contextSourceRefs: normalizedRequest.contextSourceRefs,
    reviewLensRefs: aggregate.reviewLensRefs,
    lensEvidenceRequirements: lensRequirements,
    canonicalNodeRefs: aggregate.canonicalNodeRefs,
    screenRefs,
    regionRefs,
    elementRefs,
    componentRefs,
    stateRefs: aggregate.stateRefs,
    stateOwnerRefs,
    actionRefs: aggregate.actionRefs,
    permissionRefs: aggregate.permissionRefs,
    effectClasses: aggregate.effectClasses,
    experienceProfileRefs,
    gestureRefs,
    vesselRefs,
    localizationRefs: aggregate.localizationRefs,
    platformRefs: aggregate.platformRefs,
    testRefs: aggregate.testRefs,
    ownerDomainEvidenceRefs,
    reviewCaptureRefs,
    rollbackOrRecoveryRefs: aggregate.rollbackOrRecoveryRefs,
    feedbackExpectations: feedback,
    journeyExpectations,
    environmentCells: environmentCells(normalizedRequest, aggregate.platformRefs),
    placedRefs,
    notApplicable: [],
    deferred: [],
    unknowns,
    doesNotProve: [
      'DERIVED_REVIEW_EXPECTATION_DOES_NOT_REWRITE_CANONICAL_PRODUCT_MEANING',
      'REGISTERED_PLATFORM_DOES_NOT_PROVE_PLATFORM_CONFORMANCE',
      'TEST_REFERENCE_DOES_NOT_PROVE_CURRENT_EXECUTION',
      'NO_EFFECT_REVIEW_PLAN_DOES_NOT_GRANT_LATER_REVIEW_EXECUTION_EFFECTS'
    ],
    sourceEnvelopes: bundleInspection.sourceEnvelopes
  };
  const projectionHash = semanticHash(core);
  return {
    ...core,
    expectationSetRef: `projection.vexlife.review.expectation-set.${projectionHash.slice(0, 24)}`,
    projectionHash
  };
}

function normalizeEvidenceBundle(evidenceBundle) {
  requireObject(evidenceBundle, 'evidenceBundle');
  const evidence = Array.isArray(evidenceBundle.evidence) ? evidenceBundle.evidence.map((item, index) => {
    requireObject(item, `evidenceBundle.evidence[${index}]`);
    const evidenceRef = requireString(item.evidenceRef, `evidenceBundle.evidence[${index}].evidenceRef`);
    const dimension = requireString(item.dimension, `evidenceBundle.evidence[${index}].dimension`);
    if (!REVIEW_COVERAGE_DIMENSIONS.includes(dimension)) fail('UNKNOWN_COVERAGE_DIMENSION', `unknown coverage dimension ${dimension}`);
    const state = requireString(item.state, `evidenceBundle.evidence[${index}].state`);
    if (!['CURRENT_PROVEN', 'FAILED', 'STALE', 'HELD_NO_EXACT_EVIDENCE', 'UNKNOWN', 'NOT_APPLICABLE'].includes(state)) {
      fail('MALFORMED_EVIDENCE_STATE', `unsupported evidence state ${state}`);
    }
    return {
      evidenceRef,
      dimension,
      state,
      coversRefs: [...requireStringArray(item.coversRefs ?? [], `evidenceBundle.evidence[${index}].coversRefs`)].sort(),
      sourceBindingRef: item.sourceBindingRef == null ? null : requireString(item.sourceBindingRef, `evidenceBundle.evidence[${index}].sourceBindingRef`)
    };
  }) : fail('MALFORMED_INPUT', 'evidenceBundle.evidence must be an array');
  if (new Set(evidence.map((item) => item.evidenceRef)).size !== evidence.length) fail('DUPLICATE_IDENTITY', 'evidenceBundle contains duplicate evidenceRef values');
  const orderedEvidence = [...evidence].sort((a, b) => a.evidenceRef.localeCompare(b.evidenceRef));
  const evidenceBundleHash = semanticHash(orderedEvidence);
  const canonicalEvidenceBundleRef = `evidence-bundle.vexlife.review.${evidenceBundleHash.slice(0, 24)}`;
  if (evidenceBundle.evidenceBundleRef != null && evidenceBundle.evidenceBundleRef !== canonicalEvidenceBundleRef) {
    fail('EVIDENCE_BUNDLE_REF_MISMATCH', 'evidenceBundleRef must be the canonical content identity of normalized evidence');
  }
  return {
    evidence: orderedEvidence,
    evidenceBundleRef: canonicalEvidenceBundleRef,
    evidenceBundleHash
  };
}

function dimensionExpectedRefs(expectationSet) {
  return {
    canonicalIdentity: sortedUnique([...expectationSet.reviewSubject.subjectRefs, ...expectationSet.canonicalNodeRefs]),
    renderBinding: sortedUnique([...expectationSet.screenRefs, ...expectationSet.regionRefs, ...expectationSet.elementRefs, ...expectationSet.componentRefs]),
    typedActionPermissionEffect: sortedUnique([...expectationSet.actionRefs, ...expectationSet.permissionRefs, ...expectationSet.effectClasses.map((item) => `effect-class.${item}`)]),
    stateOwner: expectationSet.stateOwnerRefs,
    interactionFeedback: expectationSet.feedbackExpectations.map((item) => `feedback.${item.state}.${item.disposition}`),
    journeyEntry: expectationSet.journeyExpectations.map((item) => item.expectationRef),
    journeyDepth: expectationSet.journeyExpectations.map((item) => item.expectationRef),
    inverseOrRecovery: expectationSet.rollbackOrRecoveryRefs,
    keyboard: expectationSet.reviewLensRefs.includes('lens.vexlife.accessibility') ? ['lens.vexlife.accessibility'] : [],
    accessibility: expectationSet.reviewLensRefs.includes('lens.vexlife.accessibility') ? ['lens.vexlife.accessibility'] : [],
    localization: expectationSet.localizationRefs,
    viewport: expectationSet.screenRefs,
    inputModality: expectationSet.gestureRefs,
    reducedMotion: expectationSet.reviewLensRefs.includes('lens.vexlife.accessibility') ? ['lens.vexlife.accessibility'] : [],
    platform: expectationSet.platformRefs,
    negativePath: expectationSet.testRefs,
    adversarial: expectationSet.reviewLensRefs.includes('lens.vexlife.assurance-and-adversarial') ? ['lens.vexlife.assurance-and-adversarial'] : [],
    evidenceMilestone: expectationSet.reviewCaptureRefs
  };
}

function evidenceRefsCovering(evidence, expectedSet, state) {
  return evidence
    .filter((item) => item.state === state && item.coversRefs.some((ref) => expectedSet.has(ref)))
    .map((item) => item.evidenceRef)
    .sort();
}

function coveredRefsForState(evidence, expectedSet, state) {
  return sortedUnique(evidence
    .filter((item) => item.state === state)
    .flatMap((item) => item.coversRefs.filter((ref) => expectedSet.has(ref))));
}

function environmentCoverage(expectationSet, normalizedEvidence) {
  return expectationSet.environmentCells.map((cell) => {
    const relevant = normalizedEvidence.evidence.filter((item) => item.coversRefs.includes(cell.environmentCellRef));
    const current = relevant.filter((item) => item.state === 'CURRENT_PROVEN');
    const failed = relevant.filter((item) => item.state === 'FAILED');
    const stale = relevant.filter((item) => item.state === 'STALE');
    const held = relevant.filter((item) => item.state === 'HELD_NO_EXACT_EVIDENCE');
    let evidenceState = 'UNKNOWN';
    if (failed.length) evidenceState = 'FAILED';
    else if (current.length) evidenceState = 'CURRENT_PROVEN';
    else if (stale.length) evidenceState = 'STALE';
    else if (held.length) evidenceState = 'HELD_NO_EXACT_EVIDENCE';
    return {
      ...cell,
      evidenceState,
      evidenceRefs: relevant.map((item) => item.evidenceRef).sort(),
      unresolvedQuestionOrNull: evidenceState === 'CURRENT_PROVEN' ? null : cell.unresolvedQuestionOrNull
    };
  });
}

export function compileReviewCoverageReceipt({ expectationSet, evidenceBundle }) {
  requireObject(expectationSet, 'expectationSet');
  if (expectationSet.schemaVersion !== REVIEW_EXPECTATION_SCHEMA || !HEX64.test(expectationSet.projectionHash ?? '')) {
    fail('MALFORMED_EXPECTATION_SET', 'expectationSet must be an exact ReviewExpectationSet projection');
  }
  const expectedProjectionHash = semanticHash(Object.fromEntries(Object.entries(expectationSet).filter(([key]) => !['expectationSetRef', 'projectionHash'].includes(key))));
  if (expectedProjectionHash !== expectationSet.projectionHash) {
    fail('EXPECTATION_SET_HASH_MISMATCH', 'expectationSet projection hash does not match its content');
  }

  const normalizedEvidence = normalizeEvidenceBundle(evidenceBundle);
  const validSourceBindingRefs = new Set(expectationSet.sourceEnvelopes.map((envelope) => envelope.verificationRef));
  for (const item of normalizedEvidence.evidence) {
    if (item.sourceBindingRef != null && !validSourceBindingRefs.has(item.sourceBindingRef)) {
      fail('UNBOUND_EVIDENCE_SOURCE', `evidence ${item.evidenceRef} references a source binding outside the exact expectation-set source version`);
    }
    if (['CURRENT_PROVEN', 'FAILED', 'STALE'].includes(item.state) && item.sourceBindingRef == null) {
      fail('UNBOUND_EVIDENCE_SOURCE', `evidence ${item.evidenceRef} with state ${item.state} requires an exact sourceBindingRef`);
    }
  }

  const expectedByDimension = dimensionExpectedRefs(expectationSet);
  const coverageDimensions = {};
  for (const dimension of REVIEW_COVERAGE_DIMENSIONS) {
    const expectedRefs = sortedUnique(expectedByDimension[dimension] ?? []);
    const expectedSet = new Set(expectedRefs);
    const evidence = normalizedEvidence.evidence.filter((item) => item.dimension === dimension);
    const currentCoveredRefs = coveredRefsForState(evidence, expectedSet, 'CURRENT_PROVEN');
    const failedCoveredRefs = coveredRefsForState(evidence, expectedSet, 'FAILED');
    const staleCoveredRefs = coveredRefsForState(evidence, expectedSet, 'STALE');
    const heldCoveredRefs = coveredRefsForState(evidence, expectedSet, 'HELD_NO_EXACT_EVIDENCE');
    const currentEvidenceRefs = evidenceRefsCovering(evidence, expectedSet, 'CURRENT_PROVEN');
    const failedEvidenceRefs = evidenceRefsCovering(evidence, expectedSet, 'FAILED');
    const staleEvidenceRefs = evidenceRefsCovering(evidence, expectedSet, 'STALE');
    const coveredByAnyDisposition = new Set([
      ...currentCoveredRefs,
      ...failedCoveredRefs,
      ...staleCoveredRefs,
      ...heldCoveredRefs,
      ...coveredRefsForState(evidence, expectedSet, 'UNKNOWN'),
      ...coveredRefsForState(evidence, expectedSet, 'NOT_APPLICABLE')
    ]);
    const uncoveredRefs = expectedRefs.filter((ref) => !coveredByAnyDisposition.has(ref));
    let state = 'UNKNOWN';
    if (expectedRefs.length === 0) state = 'NOT_APPLICABLE';
    else if (failedCoveredRefs.length) state = 'FAILED';
    else if (staleCoveredRefs.length) state = 'STALE';
    else if (currentCoveredRefs.length === expectedRefs.length) state = 'CURRENT_PROVEN';
    else if (heldCoveredRefs.length) state = 'HELD_NO_EXACT_EVIDENCE';

    coverageDimensions[dimension] = {
      state,
      expectedRefs,
      currentCoveredRefs,
      failedCoveredRefs,
      staleCoveredRefs,
      heldCoveredRefs,
      uncoveredRefs,
      currentEvidenceRefs,
      failedEvidenceRefs,
      staleEvidenceRefs
    };
  }

  const currentEvidenceRefs = normalizedEvidence.evidence.filter((item) => item.state === 'CURRENT_PROVEN').map((item) => item.evidenceRef).sort();
  const failedEvidenceRefs = normalizedEvidence.evidence.filter((item) => item.state === 'FAILED').map((item) => item.evidenceRef).sort();
  const staleEvidenceRefs = normalizedEvidence.evidence.filter((item) => item.state === 'STALE').map((item) => item.evidenceRef).sort();
  const resolvedEnvironmentCells = environmentCoverage(expectationSet, normalizedEvidence);

  const core = {
    schemaVersion: REVIEW_COVERAGE_SCHEMA,
    sourceVersionRef: expectationSet.sourceVersionRef,
    expectationSetRef: expectationSet.expectationSetRef,
    subjectRefs: expectationSet.reviewSubject.subjectRefs,
    coverageDimensions,
    environmentCells: resolvedEnvironmentCells,
    placedRefs: expectationSet.placedRefs,
    notApplicable: expectationSet.notApplicable,
    deferred: expectationSet.deferred,
    unknowns: expectationSet.unknowns,
    failedEvidenceRefs,
    currentEvidenceRefs,
    staleEvidenceRefs,
    doesNotProve: sortedUnique([
      ...expectationSet.doesNotProve,
      'COVERAGE_RECEIPT_DOES_NOT_EQUAL_HUMAN_ACCEPTANCE',
      'EVIDENCE_REFERENCE_DOES_NOT_EQUAL_EFFECT_AUTHORITY'
    ]),
    nextUnresolvedRefOrNull: expectationSet.unknowns[0]?.unknownRef ?? null,
    effects: {
      sourceMutation: false,
      HomeEffect: false,
      MemoryEffect: false,
      modelRuntimeEffect: false,
      networkEffect: false,
      publicationEffect: false
    },
    evidenceBundleRef: normalizedEvidence.evidenceBundleRef
  };
  const receiptHash = semanticHash(core);
  return {
    ...core,
    receiptRef: `projection.vexlife.review.coverage-receipt.${receiptHash.slice(0, 24)}`,
    receiptHash
  };
}

export function createReviewFor({
  processFactory,
  request,
  sourceBundle,
  repositoryEvidenceProvider,
  evidenceBundle,
  currentFoundationVersions = {},
  resourceBudget = {},
  recipientRef = null,
  now = new Date().toISOString()
}) {
  try {
    requireObject(processFactory, 'processFactory');
    if (typeof processFactory.compile !== 'function' || typeof processFactory.renderReceipt !== 'function' || typeof processFactory.requireProcess !== 'function') {
      fail('INVALID_PROCESS_FACTORY', 'processFactory must expose requireProcess(), compile() and renderReceipt()');
    }
    const normalizedRequest = normalizeRequest(request);
    const sourceInspection = inspectReviewSourceBundle(sourceBundle, { repositoryEvidenceProvider });
    const evidenceInspection = normalizeEvidenceBundle(evidenceBundle);
    const process = processFactory.requireProcess(REVIEW_PROCESS_REF);
    const missingFoundationCurrentness = (process.foundationDependencies ?? []).filter((ref) => currentFoundationVersions[ref] === undefined);
    if (missingFoundationCurrentness.length) {
      return {
        schemaVersion: REVIEW_COMPOSITION_SCHEMA,
        state: 'BLOCKED_CURRENTNESS_BINDING',
        processRef: REVIEW_PROCESS_REF,
        missingFoundationCurrentness,
        effects: { all: false }
      };
    }

    const processInputs = {
      subjectRefs: normalizedRequest.subjectRefs,
      purposeRefs: normalizedRequest.purposeRefs,
      reviewDepthPolicyRef: normalizedRequest.reviewDepthPolicyRef,
      sourceBundleRef: sourceInspection.sourceBundleRef,
      evidenceBundleRef: evidenceInspection.evidenceBundleRef
    };
    const sourceRefs = Object.fromEntries(sourceInspection.sourceEnvelopes.map((envelope) => [envelope.sourceKind, envelope.verificationRef]));
    const admission = processFactory.compile({
      processRef: REVIEW_PROCESS_REF,
      inputs: processInputs,
      sourceRefs,
      currentFoundationVersions,
      authority: { effects: [] },
      resourceBudget,
      recipientRef,
      now
    });
    if (admission.state !== 'PLAN_READY_NO_EFFECT') {
      return {
        schemaVersion: REVIEW_COMPOSITION_SCHEMA,
        state: admission.state,
        processRef: REVIEW_PROCESS_REF,
        admission,
        effects: { all: false }
      };
    }
    if ((admission.plan.authorityEnvelope?.effects ?? []).length !== 0 || (admission.plan.authorityEnvelope?.pathScope ?? []).length !== 0) {
      fail('PROCESS_EFFECT_BOUNDARY_VIOLATION', 'review composition process must remain no-effect and pathless');
    }

    const expectationSet = compileReviewExpectationSet({ request: normalizedRequest, sourceBundle, repositoryEvidenceProvider });
    const coverageReceipt = compileReviewCoverageReceipt({ expectationSet, evidenceBundle });
    const processReceipt = processFactory.renderReceipt(admission.plan, {
      disposition: 'REVIEW_COMPOSITION_READY',
      outputRefs: [expectationSet.expectationSetRef, coverageReceipt.receiptRef],
      effectReceiptRefs: [],
      now
    });
    return {
      schemaVersion: REVIEW_COMPOSITION_SCHEMA,
      state: 'REVIEW_COMPOSITION_READY_NO_EFFECT',
      reviewPlan: admission.plan,
      processReceipt,
      expectationSet,
      coverageReceipt,
      unresolved: expectationSet.unknowns,
      libertySuggestionSlots: [],
      effects: {
        sourceMutation: false,
        HomeEffect: false,
        MemoryEffect: false,
        modelRuntimeEffect: false,
        networkEffect: false,
        publicationEffect: false
      }
    };
  } catch (error) {
    if (error?.name !== 'ReviewCompositionError') throw error;
    return {
      schemaVersion: REVIEW_COMPOSITION_SCHEMA,
      state: 'BLOCKED_REVIEW_COMPOSITION',
      blocker: { code: error.code, detail: error.message },
      effects: { all: false }
    };
  }
}

// [VXG RealForever]
