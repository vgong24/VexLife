import { semanticHash } from './utils.mjs';

export const PORTABLE_BEHAVIOR_SCHEMA_VERSION = 'vexlife.portable-behavior-contract/v1';

export const PORTABLE_BEHAVIOR_ROW_FIELDS = Object.freeze([
  'rowRef',
  'sourceStateRef',
  'controlRefOrNull',
  'resolvedActRefOrNull',
  'effectRefOrNull',
  'admission',
  'expectedProjectionRefOrNull',
  'sourceRefs'
]);

export const PORTABLE_BEHAVIOR_REQUIRED_INVARIANTS = Object.freeze([
  'CONTROL_ACT_EFFECT_DISTINCTION',
  'EFFECT_NOT_PROVIDER_SUCCESS',
  'ADMITTED_INTENT_NOT_PROVIDER_ACKNOWLEDGEMENT',
  'NEWER_ADMITTED_INTENT_SURVIVES_STALE_PROVIDER_OBSERVATION',
  'MATCHING_ACKNOWLEDGEMENT_CLEARS_PENDING_INTENT',
  'PENDING_INTENT_CHANGES_NEXT_CONTROL_PROJECTION',
  'SEMANTIC_STATE_NOT_DISPLAY_STATE',
  'PROJECTION_NOT_EXECUTION_AUTHORITY',
  'SOURCE_DESCENT',
  'PROOF_OBLIGATION_IDENTITY',
  'NEWER_ADMITTED_INTENT_REPLACES_OLDER_PENDING_INTENT',
  'INCOMPATIBLE_TERMINAL_OBSERVATION_CLEARS_PENDING_INTENT'
]);

const ADMISSIONS = new Set([
  'DENIED_UNAVAILABLE',
  'DENIED_DUPLICATE_PENDING_INTENT',
  'ADMITTED_INTENT_PENDING_PROVIDER_ACKNOWLEDGEMENT',
  'PRESERVED_NEWER_ADMITTED_INTENT',
  'CLEARED_MATCHING_PROVIDER_ACKNOWLEDGEMENT',
  'ADMITTED_INTENT_REPLACES_PENDING_PROVIDER_ACKNOWLEDGEMENT',
  'CLEARED_INCOMPATIBLE_TERMINAL_OBSERVATION'
]);

const HEX40 = /^[0-9a-f]{40}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#@+-]{0,511}$/u;

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return JSON.stringify(actual) === JSON.stringify([...expected].sort());
}

function collectIdentities(contract, errors) {
  const specs = [
    ['stateIdentities', 'stateRef'],
    ['controlIdentities', 'controlRef'],
    ['actIdentities', 'actRef'],
    ['effectIdentities', 'effectRef'],
    ['projectionIdentities', 'projectionRef'],
    ['invariantIdentities', 'invariantRef'],
    ['semanticLawRows', 'rowRef'],
    ['sourceBindings', 'sourceRef']
  ];
  const all = new Set([contract.contractRef, contract.behaviorRef]);
  const byField = {};
  for (const [field, refField] of specs) {
    const items = contract[field];
    const refs = new Set();
    byField[field] = refs;
    if (!Array.isArray(items) || items.length === 0) {
      errors.push(`${contract.contractRef ?? 'portable behavior contract'} ${field} must be a non-empty array`);
      continue;
    }
    for (const [index, item] of items.entries()) {
      const ref = item?.[refField];
      if (!nonEmptyString(ref) || !REF.test(ref)) {
        errors.push(`${contract.contractRef ?? 'portable behavior contract'} ${field}[${index}] missing valid ${refField}`);
        continue;
      }
      if (refs.has(ref)) errors.push(`${contract.contractRef} duplicate ${refField} ${ref}`);
      if (all.has(ref)) errors.push(`${contract.contractRef} duplicate stable identity ${ref}`);
      refs.add(ref);
      all.add(ref);
    }
  }
  return { all, byField };
}

function validateContract(contract, contractIndex, errors) {
  const label = contract?.contractRef ?? `portable behavior contract ${contractIndex}`;
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    errors.push(`portable behavior contract ${contractIndex} must be an object`);
    return { rows: 0, ownedRefs: 0 };
  }
  for (const field of ['contractRef', 'behaviorRef', 'ownerBlueprintRef', 'purpose']) {
    if (!nonEmptyString(contract[field]) || (field !== 'purpose' && !REF.test(contract[field]))) {
      errors.push(`${label} missing valid ${field}`);
    }
  }
  if (contract.schemaVersion !== PORTABLE_BEHAVIOR_SCHEMA_VERSION) {
    errors.push(`${label} schemaVersion must be ${PORTABLE_BEHAVIOR_SCHEMA_VERSION}`);
  }
  if (contract.ownerBlueprintRef !== 'blueprint.vexlife.universal.001') {
    errors.push(`${label} ownerBlueprintRef must remain blueprint.vexlife.universal.001`);
  }
  if (contract.canonicalSource?.repository !== 'vgong24/VexLife' ||
      !nonEmptyString(contract.canonicalSource?.path) ||
      contract.canonicalSource?.compositionField !== 'behaviorContracts') {
    errors.push(`${label} canonicalSource must bind the VexLife behaviorContracts composition`);
  }
  const authority = contract.authority ?? {};
  if (authority.portableMeaningOwner !== true ||
      authority.platformRealizationOwner !== false ||
      authority.providerSuccessOwner !== false ||
      authority.executionAuthorityOwner !== false) {
    errors.push(`${label} authority boundary is malformed`);
  }

  const { all, byField } = collectIdentities(contract, errors);
  const states = byField.stateIdentities ?? new Set();
  const controls = byField.controlIdentities ?? new Set();
  const acts = byField.actIdentities ?? new Set();
  const effects = byField.effectIdentities ?? new Set();
  const projections = byField.projectionIdentities ?? new Set();
  const sources = byField.sourceBindings ?? new Set();

  for (const state of contract.stateIdentities ?? []) {
    if (!nonEmptyString(state.kind) || !nonEmptyString(state.brief)) errors.push(`${state.stateRef} requires kind and brief`);
    if (!Array.isArray(state.conditions) || state.conditions.length === 0 ||
        state.conditions.some((condition) => !nonEmptyString(condition))) {
      errors.push(`${state.stateRef} conditions must be a non-empty string array`);
    }
    if (state.semanticState !== true || state.displayState !== false) {
      errors.push(`${state.stateRef} must remain semantic state and not display state`);
    }
  }
  for (const control of contract.controlIdentities ?? []) {
    if (!nonEmptyString(control.name) || !nonEmptyString(control.brief)) errors.push(`${control.controlRef} requires name and brief`);
  }
  for (const act of contract.actIdentities ?? []) {
    if (!nonEmptyString(act.name) || !nonEmptyString(act.brief)) errors.push(`${act.actRef} requires name and brief`);
  }
  for (const effect of contract.effectIdentities ?? []) {
    if (!nonEmptyString(effect.name) || !nonEmptyString(effect.brief)) errors.push(`${effect.effectRef} requires name and brief`);
    if (!states.has(effect.admittedStateRef)) errors.push(`${effect.effectRef} references missing admittedStateRef ${effect.admittedStateRef}`);
    if (effect.providerSuccessClaimed !== false) errors.push(`${effect.effectRef} must not claim provider success`);
  }
  for (const projection of contract.projectionIdentities ?? []) {
    if (!nonEmptyString(projection.name) || !nonEmptyString(projection.brief)) errors.push(`${projection.projectionRef} requires name and brief`);
    if (projection.executionAuthority !== false) errors.push(`${projection.projectionRef} must not grant execution authority`);
  }

  const invariantCodes = new Set();
  for (const invariant of contract.invariantIdentities ?? []) {
    if (!nonEmptyString(invariant.code) || !nonEmptyString(invariant.statement)) {
      errors.push(`${invariant.invariantRef} requires code and statement`);
      continue;
    }
    if (invariantCodes.has(invariant.code)) errors.push(`${label} duplicate invariant code ${invariant.code}`);
    invariantCodes.add(invariant.code);
  }
  for (const required of PORTABLE_BEHAVIOR_REQUIRED_INVARIANTS) {
    if (!invariantCodes.has(required)) errors.push(`${label} missing required invariant ${required}`);
  }

  for (const [index, row] of (contract.semanticLawRows ?? []).entries()) {
    if (!exactKeys(row, PORTABLE_BEHAVIOR_ROW_FIELDS)) {
      errors.push(`${label} semanticLawRows[${index}] must use the exact portable row fields`);
      continue;
    }
    if (!states.has(row.sourceStateRef)) errors.push(`${row.rowRef} references missing source state ${row.sourceStateRef}`);
    if (row.controlRefOrNull !== null && !controls.has(row.controlRefOrNull)) {
      errors.push(`${row.rowRef} references missing control ${row.controlRefOrNull}`);
    }
    if (row.resolvedActRefOrNull !== null && !acts.has(row.resolvedActRefOrNull)) {
      errors.push(`${row.rowRef} references missing act ${row.resolvedActRefOrNull}`);
    }
    if (row.effectRefOrNull !== null && !effects.has(row.effectRefOrNull)) {
      errors.push(`${row.rowRef} references missing effect ${row.effectRefOrNull}`);
    }
    if (row.expectedProjectionRefOrNull !== null && !projections.has(row.expectedProjectionRefOrNull)) {
      errors.push(`${row.rowRef} references missing projection ${row.expectedProjectionRefOrNull}`);
    }
    if (!ADMISSIONS.has(row.admission)) errors.push(`${row.rowRef} has unsupported admission ${row.admission}`);
    if (!Array.isArray(row.sourceRefs) || row.sourceRefs.length === 0 ||
        row.sourceRefs.some((sourceRef) => !sources.has(sourceRef))) {
      errors.push(`${row.rowRef} sourceRefs must bind existing sourceBindings`);
    }
    if (row.controlRefOrNull === null &&
        (row.resolvedActRefOrNull !== null || row.effectRefOrNull !== null)) {
      errors.push(`${row.rowRef} observation reconciliation cannot invent an act or effect`);
    }
    if (row.resolvedActRefOrNull === null && row.effectRefOrNull !== null) {
      errors.push(`${row.rowRef} effect requires a resolved act`);
    }
    if (row.effectRefOrNull !== null &&
        (row.controlRefOrNull === null || row.resolvedActRefOrNull === null)) {
      errors.push(`${row.rowRef} admitted effect requires control and act`);
    }
  }

  for (const source of contract.sourceBindings ?? []) {
    if (!nonEmptyString(source.repository) || !HEX40.test(source.commit ?? '') ||
        !nonEmptyString(source.role) || !Array.isArray(source.paths) || source.paths.length === 0 ||
        source.paths.some((sourcePath) => !nonEmptyString(sourcePath))) {
      errors.push(`${source.sourceRef} source binding is malformed`);
    }
  }
  if (!Array.isArray(contract.heldRealizations) || contract.heldRealizations.length === 0 ||
      contract.heldRealizations.some((item) => !nonEmptyString(item)) ||
      new Set(contract.heldRealizations).size !== contract.heldRealizations.length) {
    errors.push(`${label} heldRealizations must be unique and non-empty`);
  }

  return {
    rows: contract.semanticLawRows?.length ?? 0,
    ownedRefs: all.size
  };
}

export function validatePortableBehaviorContracts(contracts) {
  const errors = [];
  if (!Array.isArray(contracts) || contracts.length === 0) {
    return {
      ok: false,
      errors: ['universal blueprint missing portable behaviorContracts composition'],
      stats: { contracts: 0, rows: 0, ownedRefs: 0 }
    };
  }
  const contractRefs = new Set();
  const behaviorRefs = new Set();
  let rows = 0;
  let ownedRefs = 0;
  for (const [index, contract] of contracts.entries()) {
    if (contractRefs.has(contract?.contractRef)) errors.push(`duplicate portable behavior contract ${contract.contractRef}`);
    if (behaviorRefs.has(contract?.behaviorRef)) errors.push(`duplicate portable behavior ${contract.behaviorRef}`);
    if (contract?.contractRef) contractRefs.add(contract.contractRef);
    if (contract?.behaviorRef) behaviorRefs.add(contract.behaviorRef);
    const stats = validateContract(contract, index, errors);
    rows += stats.rows;
    ownedRefs += stats.ownedRefs;
  }
  return {
    ok: errors.length === 0,
    errors,
    stats: { contracts: contracts.length, rows, ownedRefs }
  };
}

function identityEntry({ ref, kind, brief, record, edges = [] }) {
  return Object.freeze({
    ref,
    kind,
    brief,
    stateHash: semanticHash(record),
    edges: Object.freeze(edges.map((edge) => Object.freeze(edge)))
  });
}

export function buildPortableBehaviorIdentityEntries(contracts) {
  const validation = validatePortableBehaviorContracts(contracts);
  if (!validation.ok) throw new Error(`Portable Behavior invalid: ${validation.errors.join('; ')}`);
  const entries = [];
  for (const contract of contracts) {
    const parent = contract.contractRef;
    for (const source of contract.sourceBindings) entries.push(identityEntry({
      ref: source.sourceRef,
      kind: 'BEHAVIOR_SOURCE',
      brief: `${source.role}: ${source.repository}@${source.commit}`,
      record: source
    }));
    entries.push(identityEntry({
      ref: contract.contractRef,
      kind: 'BEHAVIOR_CONTRACT',
      brief: contract.purpose,
      record: contract,
      edges: [
        { type: 'OWNS', to: contract.behaviorRef },
        { type: 'OWNER_BLUEPRINT', to: contract.ownerBlueprintRef },
        ...contract.sourceBindings.map((source) => ({ type: 'SOURCE', to: source.sourceRef }))
      ]
    }));
    entries.push(identityEntry({
      ref: contract.behaviorRef,
      kind: 'BEHAVIOR',
      brief: contract.purpose,
      record: { behaviorRef: contract.behaviorRef, contractRef: parent },
      edges: [
        { type: 'CONTRACT', to: parent },
        ...contract.semanticLawRows.map((row) => ({ type: 'LAW', to: row.rowRef }))
      ]
    }));
    for (const state of contract.stateIdentities) entries.push(identityEntry({
      ref: state.stateRef,
      kind: 'BEHAVIOR_STATE',
      brief: state.brief,
      record: state,
      edges: [{ type: 'CONTRACT', to: parent }]
    }));
    for (const control of contract.controlIdentities) entries.push(identityEntry({
      ref: control.controlRef,
      kind: 'BEHAVIOR_CONTROL',
      brief: control.brief,
      record: control,
      edges: [{ type: 'CONTRACT', to: parent }]
    }));
    for (const act of contract.actIdentities) entries.push(identityEntry({
      ref: act.actRef,
      kind: 'BEHAVIOR_ACT',
      brief: act.brief,
      record: act,
      edges: [{ type: 'CONTRACT', to: parent }]
    }));
    for (const effect of contract.effectIdentities) entries.push(identityEntry({
      ref: effect.effectRef,
      kind: 'BEHAVIOR_EFFECT',
      brief: effect.brief,
      record: effect,
      edges: [
        { type: 'CONTRACT', to: parent },
        { type: 'ADMITS_STATE', to: effect.admittedStateRef }
      ]
    }));
    for (const projection of contract.projectionIdentities) entries.push(identityEntry({
      ref: projection.projectionRef,
      kind: 'BEHAVIOR_PROJECTION',
      brief: projection.brief,
      record: projection,
      edges: [{ type: 'CONTRACT', to: parent }]
    }));
    for (const invariant of contract.invariantIdentities) entries.push(identityEntry({
      ref: invariant.invariantRef,
      kind: 'BEHAVIOR_INVARIANT',
      brief: invariant.statement,
      record: invariant,
      edges: [{ type: 'CONTRACT', to: parent }]
    }));
    for (const row of contract.semanticLawRows) entries.push(identityEntry({
      ref: row.rowRef,
      kind: 'BEHAVIOR_LAW_ROW',
      brief: `${row.sourceStateRef} -> ${row.admission}`,
      record: row,
      edges: [
        { type: 'CONTRACT', to: parent },
        { type: 'SOURCE_STATE', to: row.sourceStateRef },
        ...(row.controlRefOrNull ? [{ type: 'CONTROL', to: row.controlRefOrNull }] : []),
        ...(row.resolvedActRefOrNull ? [{ type: 'ACT', to: row.resolvedActRefOrNull }] : []),
        ...(row.effectRefOrNull ? [{ type: 'EFFECT', to: row.effectRefOrNull }] : []),
        ...(row.expectedProjectionRefOrNull ? [{ type: 'PROJECTION', to: row.expectedProjectionRefOrNull }] : []),
        ...row.sourceRefs.map((sourceRef) => ({ type: 'SOURCE', to: sourceRef }))
      ]
    }));
  }
  return Object.freeze(entries);
}

// [VXG RealForever]
