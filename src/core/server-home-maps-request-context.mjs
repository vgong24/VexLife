import { HOME_BRIDGE_SESSION_AUTHORITY_SCHEMA } from './home-bridge-session-authority.mjs';

export const SERVER_HOME_MAPS_REQUEST_CONTEXT_SCHEMA =
  'vexlife.server-home-maps-request-context/v1';

const REF = /^[A-Za-z0-9][A-Za-z0-9._:/#@+-]{0,511}$/u;
const REQUEST_KEYS = new Set(['sessionRef']);
const ENVELOPE_KEYS = new Set(['state', 'value', 'sourceReceiptRefs', 'currentnessRefs']);
const SCOPE_KEYS = new Set(['stableSessionBindingRef', 'capabilityRefs']);
const ENDPOINT_KEYS = new Set(['stableSessionBindingRef', 'rawModelEndpointExposed']);

export class ServerHomeMapsRequestContextError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ServerHomeMapsRequestContextError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new ServerHomeMapsRequestContextError(code, message);
};

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function exact(value, keys, label) {
  if (!object(value)) fail('MAPS_REQUEST_CONTEXT_INVALID', `${label} must be one object`);
  const actual = Object.keys(value);
  const extras = actual.filter((key) => !keys.has(key));
  const missing = [...keys].filter((key) => !Object.hasOwn(value, key));
  if (extras.length || missing.length || actual.length !== keys.size) {
    fail('MAPS_REQUEST_CONTEXT_INVALID', `${label} does not match the accepted shape`);
  }
  return value;
}

function ref(value, label) {
  if (typeof value !== 'string' || !REF.test(value)) {
    fail('MAPS_REQUEST_CONTEXT_INVALID', `${label} must be one safe opaque ref`);
  }
  return value;
}

function refs(values, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    fail(
      'MAPS_REQUEST_CONTEXT_OWNER_EVIDENCE_REQUIRED',
      `${label} must be ${allowEmpty ? 'an' : 'a non-empty'} ref array`
    );
  }
  const normalized = values.map((value, index) => ref(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    fail('MAPS_REQUEST_CONTEXT_INVALID', `${label} must contain unique refs`);
  }
  return Object.freeze([...normalized].sort());
}

function ownerEnvelope(value, label) {
  exact(value, ENVELOPE_KEYS, label);
  if (value.state !== 'CURRENT') {
    fail('MAPS_REQUEST_CONTEXT_OWNER_NOT_CURRENT', `${label} is not current`);
  }
  return Object.freeze({
    value: value.value,
    sourceReceiptRefs: refs(value.sourceReceiptRefs, `${label}.sourceReceiptRefs`),
    currentnessRefs: refs(value.currentnessRefs, `${label}.currentnessRefs`)
  });
}

function currentSessionAuthority(value) {
  if (!object(value)
      || value.schemaVersion !== HOME_BRIDGE_SESSION_AUTHORITY_SCHEMA
      || value.state !== 'CURRENT') {
    fail(
      'MAPS_REQUEST_CONTEXT_SESSION_AUTHORITY_REQUIRED',
      'current Home Bridge session authority is required'
    );
  }
  const stableSessionBindingRef = ref(
    value.stableSessionBindingRef,
    'sessionAuthority.stableSessionBindingRef'
  );
  const principalRef = ref(value.principalRef, 'sessionAuthority.principalRef');
  const deviceRef = ref(value.deviceRef, 'sessionAuthority.deviceRef');
  refs(value.sourceReceiptRefs, 'sessionAuthority.sourceReceiptRefs');
  refs(value.currentnessRefs, 'sessionAuthority.currentnessRefs');
  if (!object(value.effects) || Object.values(value.effects).some((effect) => effect !== false)) {
    fail(
      'MAPS_REQUEST_CONTEXT_SESSION_AUTHORITY_EFFECTFUL',
      'Maps request context requires effect-free Home session authority'
    );
  }
  return Object.freeze({
    value,
    stableSessionBindingRef,
    principalRef,
    deviceRef
  });
}

function currentScope(envelope, label, stableSessionBindingRef) {
  const current = ownerEnvelope(envelope, label);
  exact(current.value, SCOPE_KEYS, `${label}.value`);
  if (current.value.stableSessionBindingRef !== stableSessionBindingRef) {
    fail(
      'MAPS_REQUEST_CONTEXT_BINDING_MISMATCH',
      `${label} belongs to another stable session binding`
    );
  }
  return Object.freeze({
    capabilityRefs: refs(
      current.value.capabilityRefs,
      `${label}.value.capabilityRefs`,
      { allowEmpty: true }
    ),
    sourceReceiptRefs: current.sourceReceiptRefs,
    currentnessRefs: current.currentnessRefs
  });
}

function currentEndpointExposure(envelope, stableSessionBindingRef) {
  const current = ownerEnvelope(envelope, 'raw model endpoint owner');
  exact(current.value, ENDPOINT_KEYS, 'raw model endpoint owner.value');
  if (current.value.stableSessionBindingRef !== stableSessionBindingRef) {
    fail(
      'MAPS_REQUEST_CONTEXT_BINDING_MISMATCH',
      'raw model endpoint truth belongs to another stable session binding'
    );
  }
  if (typeof current.value.rawModelEndpointExposed !== 'boolean') {
    fail(
      'MAPS_REQUEST_CONTEXT_INVALID',
      'rawModelEndpointExposed must be one current boolean'
    );
  }
  return Object.freeze({
    rawModelEndpointExposed: current.value.rawModelEndpointExposed,
    sourceReceiptRefs: current.sourceReceiptRefs,
    currentnessRefs: current.currentnessRefs
  });
}

function combineRefs(groups) {
  return Object.freeze([...new Set(groups.flat())].sort());
}

export function createServerHomeMapsRequestContextResolver({
  sessionAuthorityResolver,
  resolveRoleCapabilityScope,
  resolveProjectCapabilityScope,
  resolveResourceCapabilityScope,
  resolveRawModelEndpointExposure
} = {}) {
  if (!object(sessionAuthorityResolver) || typeof sessionAuthorityResolver.resolve !== 'function') {
    throw new TypeError('sessionAuthorityResolver.resolve must be one function');
  }
  for (const [label, resolver] of Object.entries({
    resolveRoleCapabilityScope,
    resolveProjectCapabilityScope,
    resolveResourceCapabilityScope,
    resolveRawModelEndpointExposure
  })) {
    if (typeof resolver !== 'function') {
      throw new TypeError(`${label} must be one server-owned resolver function`);
    }
  }

  return Object.freeze({
    async resolve(input = {}) {
      exact(input, REQUEST_KEYS, 'Maps request-context request');
      const sessionRef = ref(input.sessionRef, 'sessionRef');

      const session = currentSessionAuthority(
        await sessionAuthorityResolver.resolve(Object.freeze({ sessionRef }))
      );

      const identity = Object.freeze({
        stableSessionBindingRef: session.stableSessionBindingRef,
        principalRef: session.principalRef,
        deviceRef: session.deviceRef
      });

      const role = currentScope(
        await resolveRoleCapabilityScope(identity),
        'role capability scope owner',
        session.stableSessionBindingRef
      );
      const project = currentScope(
        await resolveProjectCapabilityScope(identity),
        'project capability scope owner',
        session.stableSessionBindingRef
      );
      const resource = currentScope(
        await resolveResourceCapabilityScope(identity),
        'resource capability scope owner',
        session.stableSessionBindingRef
      );
      const endpoint = currentEndpointExposure(
        await resolveRawModelEndpointExposure(identity),
        session.stableSessionBindingRef
      );

      const sourceReceiptRefs = combineRefs([
        session.value.sourceReceiptRefs,
        role.sourceReceiptRefs,
        project.sourceReceiptRefs,
        resource.sourceReceiptRefs,
        endpoint.sourceReceiptRefs
      ]);
      const currentnessRefs = combineRefs([
        session.value.currentnessRefs,
        role.currentnessRefs,
        project.currentnessRefs,
        resource.currentnessRefs,
        endpoint.currentnessRefs
      ]);

      return Object.freeze({
        schemaVersion: SERVER_HOME_MAPS_REQUEST_CONTEXT_SCHEMA,
        state: 'CURRENT',
        sessionAuthority: session.value,
        roleCapabilityRefs: role.capabilityRefs,
        projectCapabilityRefs: project.capabilityRefs,
        resourceCapabilityRefs: resource.capabilityRefs,
        rawModelEndpointExposed: endpoint.rawModelEndpointExposed,
        sourceReceiptRefs,
        currentnessRefs
      });
    }
  });
}

// [VXG RealForever]
