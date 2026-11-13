import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SERVER_HOME_MAPS_REQUEST_CONTEXT_SCHEMA,
  ServerHomeMapsRequestContextError,
  createServerHomeMapsRequestContextResolver
} from '../src/core/server-home-maps-request-context.mjs';

const SESSION_REF = 'session.vexlife.home-bridge.remote.synthetic';
const BINDING_REF = 'session-binding.vexlife.maps.synthetic';

function sessionAuthority() {
  return {
    schemaVersion: 'vexlife.home-bridge-session-authority/v1',
    state: 'CURRENT',
    authorityReceiptRef: 'receipt.vexlife.home-bridge-session-authority.synthetic',
    stableSessionBindingRef: BINDING_REF,
    principalRef: 'person.synthetic',
    deviceRef: 'device.synthetic',
    membership: {},
    lease: {},
    currentRevocationGeneration: 3,
    sourceReceiptRefs: ['receipt.session-authority.synthetic'],
    currentnessRefs: ['currentness.session-authority.synthetic'],
    effects: {
      pairingMutation: false,
      principalRebinding: false,
      authenticationMutation: false,
      authorizationMutation: false,
      capabilityLeaseMutation: false,
      revocationMutation: false,
      HomePayloadReadOrWrite: false,
      networkMutation: false,
      MemoryMutation: false,
      RelationshipsMutation: false,
      modelRuntimeEffect: false,
      training: false,
      publication: false
    }
  };
}

function envelope(kind, value) {
  return {
    state: 'CURRENT',
    value,
    sourceReceiptRefs: [`receipt.${kind}.synthetic`],
    currentnessRefs: [`currentness.${kind}.synthetic`]
  };
}

function scope(kind, capabilityRefs) {
  return envelope(kind, {
    stableSessionBindingRef: BINDING_REF,
    capabilityRefs
  });
}

function fixture(overrides = {}) {
  const calls = [];
  const authority = sessionAuthority();
  const resolvers = {
    sessionAuthorityResolver: {
      async resolve(input) {
        calls.push(['session', input]);
        return authority;
      }
    },
    async resolveRoleCapabilityScope(input) {
      calls.push(['role', input]);
      return scope('role', ['capability.vexlife.maps-place-search']);
    },
    async resolveProjectCapabilityScope(input) {
      calls.push(['project', input]);
      return scope('project', []);
    },
    async resolveResourceCapabilityScope(input) {
      calls.push(['resource', input]);
      return scope('resource', ['capability.vexlife.maps-place-search']);
    },
    async resolveRawModelEndpointExposure(input) {
      calls.push(['endpoint', input]);
      return envelope('endpoint', {
        stableSessionBindingRef: BINDING_REF,
        rawModelEndpointExposed: false
      });
    },
    ...overrides
  };
  return {
    calls,
    resolver: createServerHomeMapsRequestContextResolver(resolvers)
  };
}

test('Maps request context resolves independent current server owners without receiving search intent', async () => {
  const f = fixture();
  const result = await f.resolver.resolve({ sessionRef: SESSION_REF });

  assert.equal(result.schemaVersion, SERVER_HOME_MAPS_REQUEST_CONTEXT_SCHEMA);
  assert.equal(result.state, 'CURRENT');
  assert.equal(result.sessionAuthority.stableSessionBindingRef, BINDING_REF);
  assert.deepEqual(result.roleCapabilityRefs, ['capability.vexlife.maps-place-search']);
  assert.deepEqual(result.projectCapabilityRefs, []);
  assert.deepEqual(result.resourceCapabilityRefs, ['capability.vexlife.maps-place-search']);
  assert.equal(result.rawModelEndpointExposed, false);

  assert.deepEqual(f.calls[0], ['session', { sessionRef: SESSION_REF }]);
  for (const [, input] of f.calls.slice(1)) {
    assert.deepEqual(input, {
      stableSessionBindingRef: BINDING_REF,
      principalRef: 'person.synthetic',
      deviceRef: 'device.synthetic'
    });
    assert.equal(Object.hasOwn(input, 'sessionRef'), false);
    assert.equal(Object.hasOwn(input, 'query'), false);
    assert.equal(Object.hasOwn(input, 'intent'), false);
  }

  assert.deepEqual(result.sourceReceiptRefs, [
    'receipt.endpoint.synthetic',
    'receipt.project.synthetic',
    'receipt.resource.synthetic',
    'receipt.role.synthetic',
    'receipt.session-authority.synthetic'
  ]);
  assert.deepEqual(result.currentnessRefs, [
    'currentness.endpoint.synthetic',
    'currentness.project.synthetic',
    'currentness.resource.synthetic',
    'currentness.role.synthetic',
    'currentness.session-authority.synthetic'
  ]);
});

test('empty current capability scopes remain lawful evidence for downstream C1 denial', async () => {
  const f = fixture({
    async resolveRoleCapabilityScope() {
      return scope('role', []);
    },
    async resolveProjectCapabilityScope() {
      return scope('project', []);
    },
    async resolveResourceCapabilityScope() {
      return scope('resource', []);
    }
  });
  const result = await f.resolver.resolve({ sessionRef: SESSION_REF });
  assert.deepEqual(result.roleCapabilityRefs, []);
  assert.deepEqual(result.projectCapabilityRefs, []);
  assert.deepEqual(result.resourceCapabilityRefs, []);
});

test('raw model endpoint exposure is preserved as current truth rather than normalized away', async () => {
  const f = fixture({
    async resolveRawModelEndpointExposure() {
      return envelope('endpoint', {
        stableSessionBindingRef: BINDING_REF,
        rawModelEndpointExposed: true
      });
    }
  });
  const result = await f.resolver.resolve({ sessionRef: SESSION_REF });
  assert.equal(result.rawModelEndpointExposed, true);
});

test('scope owner must be CURRENT and bound to the same stable session binding', async () => {
  const stale = fixture({
    async resolveRoleCapabilityScope() {
      return {
        ...scope('role', ['capability.vexlife.maps-place-search']),
        state: 'STALE'
      };
    }
  });
  await assert.rejects(
    () => stale.resolver.resolve({ sessionRef: SESSION_REF }),
    (error) => error instanceof ServerHomeMapsRequestContextError
      && error.code === 'MAPS_REQUEST_CONTEXT_OWNER_NOT_CURRENT'
  );

  const mismatched = fixture({
    async resolveProjectCapabilityScope() {
      return envelope('project', {
        stableSessionBindingRef: 'session-binding.other',
        capabilityRefs: ['capability.vexlife.maps-place-search']
      });
    }
  });
  await assert.rejects(
    () => mismatched.resolver.resolve({ sessionRef: SESSION_REF }),
    (error) => error instanceof ServerHomeMapsRequestContextError
      && error.code === 'MAPS_REQUEST_CONTEXT_BINDING_MISMATCH'
  );
});

test('request context accepts only sessionRef and rejects remote-authored semantic or authority fields', async () => {
  const f = fixture();
  for (const extra of [
    ['query', 'coffee'],
    ['roleCapabilityRefs', ['capability.vexlife.maps-place-search']],
    ['principalRef', 'person.forged']
  ]) {
    await assert.rejects(
      () => f.resolver.resolve({ sessionRef: SESSION_REF, [extra[0]]: extra[1] }),
      (error) => error instanceof ServerHomeMapsRequestContextError
        && error.code === 'MAPS_REQUEST_CONTEXT_INVALID'
    );
  }
});

test('effectful Home session authority is rejected before scope resolution', async () => {
  const authority = sessionAuthority();
  authority.effects.networkMutation = true;
  const f = fixture({
    sessionAuthorityResolver: {
      async resolve() {
        return authority;
      }
    }
  });
  await assert.rejects(
    () => f.resolver.resolve({ sessionRef: SESSION_REF }),
    (error) => error instanceof ServerHomeMapsRequestContextError
      && error.code === 'MAPS_REQUEST_CONTEXT_SESSION_AUTHORITY_EFFECTFUL'
  );
});

// [VXG RealForever]
