#!/usr/bin/env node
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createVexLifeBrowserServer as createCoreVexLifeBrowserServer,
} from './serve-browser-core.mjs';
export * from './serve-browser-core.mjs';

import {
  BROWSER_RELATIONSHIPS_INVITATION_MAX_BYTES,
  BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_API_PATH,
  BrowserRelationshipsInvitationProductBridgeError,
  browserRelationshipsInvitationProductFailurePayload,
  createBrowserRelationshipsInvitationProductBridge,
} from '../src/core/browser-relationships-invitation-product-bridge.mjs';

const port = Number(process.env.VEXLIFE_PORT ?? 18110);
const home = path.resolve(process.env.VEXLIFE_HOME ?? path.join(os.homedir(), '.vexlife'));
export const BROWSER_RELATIONSHIPS_INVITATION_REQUEST_MAX_BYTES = BROWSER_RELATIONSHIPS_INVITATION_MAX_BYTES * 2;

function sendJson(response, statusCode, value) {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

function invitationRequestError(message, httpStatus) {
  return new BrowserRelationshipsInvitationProductBridgeError(
    'RELATIONSHIPS_INVITATION_REQUEST_INVALID',
    message,
    httpStatus,
  );
}

async function readInvitationRequest(request) {
  const contentType = String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw invitationRequestError('Relationships invitation request must use application/json', 415);
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > BROWSER_RELATIONSHIPS_INVITATION_REQUEST_MAX_BYTES) {
      throw invitationRequestError('Relationships invitation request exceeds the bounded body size', 413);
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw invitationRequestError('Relationships invitation request body is not valid JSON', 400);
  }
}

function invitationBridgeOrThrow(value) {
  if (!value || typeof value !== 'object' || typeof value.execute !== 'function') {
    throw new TypeError('Relationships invitation product bridge must expose execute(request)');
  }
  return value;
}

function compactFamilyWorkProjection(genericRuntimeSnapshot, {
  principalRef,
  rooms
} = {}, expectedSchemaVersion) {
  if (
    !genericRuntimeSnapshot
    || typeof genericRuntimeSnapshot !== 'object'
    || Array.isArray(genericRuntimeSnapshot)
    || genericRuntimeSnapshot.schemaVersion !== expectedSchemaVersion
    || genericRuntimeSnapshot.state !== 'CURRENT'
    || genericRuntimeSnapshot.currentness !== 'CURRENT'
    || typeof genericRuntimeSnapshot.sourceRef !== 'string'
    || genericRuntimeSnapshot.sourceRef.length === 0
    || !Array.isArray(genericRuntimeSnapshot.workgraphs)
    || !Array.isArray(genericRuntimeSnapshot.schedulerAggregates)
    || typeof principalRef !== 'string'
    || principalRef.length === 0
    || !Array.isArray(rooms)
  ) {
    throw new Error('Generic follow-through runtime projection is unavailable for Family work status');
  }

  const roomByChannelRef = new Map();
  for (const room of rooms) {
    if (
      !room
      || typeof room !== 'object'
      || room.kind !== 'GROUP'
      || typeof room.channelRef !== 'string'
      || typeof room.threadRef !== 'string'
      || !Array.isArray(room.audience)
      || !room.audience.some((member) => member?.principalRef === principalRef)
      || roomByChannelRef.has(room.channelRef)
    ) {
      throw new Error('Family work scope is unavailable or ambiguous');
    }
    roomByChannelRef.set(room.channelRef, room);
  }

  const assignmentsByGraphFingerprint = new Map();
  for (const graph of genericRuntimeSnapshot.workgraphs) {
    const room = roomByChannelRef.get(graph?.intent?.channelRef) ?? null;
    if (!room || graph?.intent?.threadRef !== room.threadRef) continue;
    const visibleActorRefs = new Set([
      ...room.audience.map((member) => member?.principalRef).filter(Boolean),
      room.familyCompanionLineageRef
    ]);
    if (!visibleActorRefs.has(graph?.intent?.originSpeakerRef)) continue;
    const nodeRefs = new Set((graph.nodes ?? []).map((node) => node?.workNodeRef).filter(Boolean));
    const currentAssignments = new Set();
    for (const assignment of graph.acceptedAssignments ?? []) {
      if (
        assignment?.assignmentState === 'CURRENT'
        && assignment.sourceIntentRef === graph.rootIntentRef
        && nodeRefs.has(assignment.workNodeRef)
      ) currentAssignments.add(assignment.workNodeRef);
    }
    assignmentsByGraphFingerprint.set(graph.semanticFingerprint, currentAssignments);
  }

  const pendingRefs = new Set();
  const activeRefs = new Set();
  for (const aggregate of genericRuntimeSnapshot.schedulerAggregates) {
    const queueAssignments = assignmentsByGraphFingerprint.get(aggregate?.queue?.graphFingerprint) ?? null;
    if (queueAssignments) {
      if (aggregate.queue?.currentness !== 'CURRENT') {
        throw new Error('Family-scoped Scheduler queue is not current');
      }
      for (const entry of aggregate.queue.admittedReady ?? []) {
        if (queueAssignments.has(entry?.workNodeRef)) pendingRefs.add(entry.workNodeRef);
      }
    }
    const activeAssignments = assignmentsByGraphFingerprint.get(aggregate?.active?.graphFingerprint) ?? null;
    if (activeAssignments?.has(aggregate?.active?.workNodeRef)) {
      activeRefs.add(aggregate.active.workNodeRef);
      pendingRefs.delete(aggregate.active.workNodeRef);
    }
  }

  return Object.freeze({
    state: 'CURRENT',
    pendingCount: pendingRefs.size,
    activeCount: activeRefs.size,
    sourceRef: genericRuntimeSnapshot.sourceRef
  });
}

function sourceManagedGenericFollowThroughResolver(runtimeHome) {
  const homeRoot = path.resolve(runtimeHome);
  let resolverPromise = null;
  return async function resolveFamilyWorkProjection(scope = {}) {
    try {
      if (resolverPromise === null) {
        resolverPromise = import('../src/core/generic-follow-through-runtime-projection.mjs')
          .then(({
            createGenericFollowThroughRuntimeProjectionResolver,
            GENERIC_FOLLOW_THROUGH_RUNTIME_PROJECTION_SCHEMA
          }) => Object.freeze({
            schemaVersion: GENERIC_FOLLOW_THROUGH_RUNTIME_PROJECTION_SCHEMA,
            resolve: createGenericFollowThroughRuntimeProjectionResolver({ home: homeRoot })
          }));
      }
      const binding = await resolverPromise;
      return compactFamilyWorkProjection(
        await binding.resolve(),
        scope,
        binding.schemaVersion
      );
    } catch {
      return null;
    }
  };
}


export function createVexLifeBrowserServer(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('VexLife browser server options must be one object');
  }
  const {
    relationshipsInvitationProductBridge = createBrowserRelationshipsInvitationProductBridge(),
    genericFollowThroughRuntimeHome = home,
    resolveFamilyWorkProjection: callerSuppliedFamilyWorkProjection,
    ...coreOptions
  } = options;
  if (callerSuppliedFamilyWorkProjection !== undefined) {
    throw new TypeError('Production VexLife browser follow-through projection is source-managed and cannot be caller supplied');
  }
  const invitationBridge = invitationBridgeOrThrow(relationshipsInvitationProductBridge);
  const resolveFamilyWorkProjection = sourceManagedGenericFollowThroughResolver(
    genericFollowThroughRuntimeHome
  );
  const coreServer = createCoreVexLifeBrowserServer({
    ...coreOptions,
    resolveFamilyWorkProjection
  });
  const coreHandlers = coreServer.listeners('request');
  if (coreHandlers.length !== 1 || typeof coreHandlers[0] !== 'function') {
    throw new Error('VexLife browser core request handler is unavailable');
  }
  const coreHandler = coreHandlers[0];

  return http.createServer(async (request, response) => {
    let url;
    try {
      url = new URL(request.url, `http://${request.headers.host || `127.0.0.1:${port}`}`);
    } catch {
      await coreHandler(request, response);
      return;
    }
    if (url.pathname !== BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_API_PATH) {
      await coreHandler(request, response);
      return;
    }

    if (request.method !== 'POST') {
      response.writeHead(405, { Allow: 'POST', 'Cache-Control': 'no-store' });
      response.end();
      return;
    }

    try {
      const input = await readInvitationRequest(request);
      const result = await invitationBridge.execute(input);
      sendJson(response, 200, result);
    } catch (error) {
      const typed = error instanceof BrowserRelationshipsInvitationProductBridgeError
        ? error
        : new BrowserRelationshipsInvitationProductBridgeError(
          'RELATIONSHIPS_INVITATION_BRIDGE_FAILED',
          'Relationships invitation bridge failed safely',
          500,
        );
      sendJson(response, typed.httpStatus, browserRelationshipsInvitationProductFailurePayload(typed));
    }
  });
}

const server = createVexLifeBrowserServer();

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    console.log(`VexLife browser reference: http://127.0.0.1:${address.port}`);
  });
}

// [VXG RealForever]
