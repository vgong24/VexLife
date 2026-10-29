#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import './capability-runtime-policy-bootstrap.mjs';
import { CAPABILITY_ASSIMILATION_MODES } from '../src/core/capability-assimilation-runtime.mjs';
import {
  createServerOwnedBrowserCompanionBridge,
  createVexLifeBrowserServer as createCoreVexLifeBrowserServer,
} from './serve-browser-core.mjs';
import { loadBrowserCompanionHomeIdentity } from '../src/core/browser-companion-bridge.mjs';
import { createCompanionRecoveryOwner } from '../src/core/browser-companion-recovery-owner.mjs';
import {
  formHereticPersistentRuntimeLink,
  formHereticPersistentRuntimeObservedLink,
  validateHereticPersistentRuntimeReceipt,
} from '../src/core/heretic-runtime-link.mjs';
import { observeHereticPersistentRuntimeResource } from '../src/core/heretic-persistent-runtime-owner.mjs';
import { runHereticNormalStart } from './establish-heretic-runtime.mjs';
import {
  assertUxEvolutionRegistry,
  resolveUxProjectionHostSelection,
} from '../src/core/ux-evolution.mjs';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { projectIntentStatus } from '../src/core/intent-projection.mjs';
import { compileProjectContinuity } from '../src/core/project-continuity.mjs';
import { readIntentWorkgraphRuntimeSnapshotEntries } from '../src/core/intent-workgraph-runtime-snapshot.mjs';
import { createCompanionVoicePlaybackAdapter } from '../src/core/companion-voice-playback.mjs';
import {
  PURPOSE_WORKSPACE_BOARD_MOVE_SCHEMA,
  PURPOSE_WORKSPACE_PROJECT_PROJECTION_SCHEMA,
  heldPurposeWorkspaceProjectProjection,
  preparePurposeWorkspaceBoardMove,
  projectPurposeWorkspaceProject,
} from '../src/core/purpose-workspace-project.mjs';
export * from './serve-browser-core.mjs';

import {
  BROWSER_RELATIONSHIPS_INVITATION_MAX_BYTES,
  BROWSER_RELATIONSHIPS_INVITATION_PRODUCT_API_PATH,
  BrowserRelationshipsInvitationProductBridgeError,
  browserRelationshipsInvitationProductFailurePayload,
  createBrowserRelationshipsInvitationProductBridge,
} from '../src/core/browser-relationships-invitation-product-bridge.mjs';

const uxEvolutionRegistry = JSON.parse(fs.readFileSync(new URL('../blueprint/ux-evolution-registry.json', import.meta.url), 'utf8'));
assertUxEvolutionRegistry(uxEvolutionRegistry);
const port = Number(process.env.VEXLIFE_PORT ?? 18110);
const home = path.resolve(process.env.VEXLIFE_HOME ?? path.join(os.homedir(), '.vexlife'));
const intentSourceBundle = loadBlueprint();
const intentTrustSnapshot = JSON.parse(fs.readFileSync(new URL('../blueprint/intent-trust-snapshot.json', import.meta.url), 'utf8'));
const projectContinuityRegistry = JSON.parse(fs.readFileSync(new URL('../blueprint/project-continuity-registry.json', import.meta.url), 'utf8'));
const toCompletionProjectDefinition = JSON.parse(fs.readFileSync(new URL('../blueprint/projects/vexlife-tocompletion.project.json', import.meta.url), 'utf8'));
const toCompletionBoardView = JSON.parse(fs.readFileSync(new URL('../blueprint/projects/vexlife-tocompletion.board.view.json', import.meta.url), 'utf8'));
export const BROWSER_RELATIONSHIPS_INVITATION_REQUEST_MAX_BYTES = BROWSER_RELATIONSHIPS_INVITATION_MAX_BYTES * 2;
export const BROWSER_INTENT_PROJECT_STATUS_PATH = '/api/v1/intent/project-status';
export const BROWSER_INTENT_PROJECT_STATUS_SCHEMA = 'vexlife.browser-intent-project-status/v1';
export const BROWSER_PURPOSE_WORKSPACE_PROJECT_PATH = '/api/v1/purpose-workspace/project';
export const BROWSER_PURPOSE_WORKSPACE_PROJECT_MOVE_PATH = '/api/v1/purpose-workspace/project/move';
export const BROWSER_PURPOSE_WORKSPACE_PROJECT_SCHEMA = PURPOSE_WORKSPACE_PROJECT_PROJECTION_SCHEMA;
export const BROWSER_PURPOSE_WORKSPACE_PROJECT_MOVE_SCHEMA = PURPOSE_WORKSPACE_BOARD_MOVE_SCHEMA;
export const BROWSER_PURPOSE_WORKSPACE_MOVE_REQUEST_MAX_BYTES = 16 * 1024;

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

function sourceManagedGenericFollowThroughResolver(runtimeHome) {
  const homeRoot = path.resolve(runtimeHome);
  let resolverPromise = null;
  return async function resolveFamilyWorkProjection() {
    try {
      if (resolverPromise === null) {
        resolverPromise = import('../src/core/generic-follow-through-runtime-projection.mjs')
          .then(({ createGenericFollowThroughRuntimeProjectionResolver }) =>
            createGenericFollowThroughRuntimeProjectionResolver({ home: homeRoot }));
      }
      const resolve = await resolverPromise;
      return await resolve();
    } catch {
      return null;
    }
  };
}

function heldIntentProjectStatus(projectRef, reason) {
  return Object.freeze({
    schemaVersion: BROWSER_INTENT_PROJECT_STATUS_SCHEMA,
    state: 'HELD_UNAVAILABLE',
    currentness: 'UNKNOWN',
    projectRef: projectRef ?? null,
    projectionRef: 'projection.intent.status',
    runtimeSourceRef: 'source.vexlife.intent-workgraph.runtime-snapshot.001',
    statusProjections: Object.freeze([]),
    reason,
    effects: false,
    executionAuthority: 'NONE'
  });
}

export function projectBrowserIntentProjectStatus({
  projectRef,
  workgraphs,
  sourceBundle = intentSourceBundle,
  trustSnapshot = intentTrustSnapshot
} = {}) {
  if (typeof projectRef !== 'string' || !/^project\.[A-Za-z0-9._-]+$/u.test(projectRef) || projectRef.length > 256) {
    throw new TypeError('Intent project status requires one bounded projectRef');
  }
  if (!Array.isArray(workgraphs)) return heldIntentProjectStatus(projectRef, 'CURRENT_WORKGRAPH_UNAVAILABLE');
  const statusProjections = workgraphs
    .filter((graph) => graph?.intent?.projectRef === projectRef)
    .sort((left, right) => left.graphRef.localeCompare(right.graphRef))
    .map((graph) => projectIntentStatus(graph, {
      registry: sourceBundle.intentRegistry,
      registeredProcessRefs: sourceBundle.factory.processes.map((item) => item.processRef),
      registeredRoleRefs: sourceBundle.blueprint.roles.map((item) => item.roleRef),
      trustSnapshot
    }));
  if (statusProjections.some((status) => (status.validation?.errors ?? []).length > 0)) {
    return heldIntentProjectStatus(projectRef, 'INTENT_STATUS_VALIDATION_BLOCKED');
  }
  return Object.freeze({
    schemaVersion: BROWSER_INTENT_PROJECT_STATUS_SCHEMA,
    state: 'CURRENT',
    currentness: 'CURRENT',
    projectRef,
    projectionRef: 'projection.intent.status',
    runtimeSourceRef: 'source.vexlife.intent-workgraph.runtime-snapshot.001',
    statusProjections: Object.freeze(statusProjections.map((status) => Object.freeze(structuredClone(status)))),
    effects: false,
    executionAuthority: 'NONE'
  });
}

function sourceManagedIntentProjectStatusResolver(runtimeHome) {
  const homeRoot = path.resolve(runtimeHome);
  let readerPromise = null;
  return async function resolveIntentProjectStatus(projectRef) {
    try {
      if (readerPromise === null) {
        readerPromise = import('../src/core/intent-workgraph-runtime-snapshot.mjs')
          .then(({ readIntentWorkgraphRuntimeSnapshots }) => readIntentWorkgraphRuntimeSnapshots);
      }
      const readCurrentWorkgraphs = await readerPromise;
      return projectBrowserIntentProjectStatus({
        projectRef,
        workgraphs: readCurrentWorkgraphs({ home: homeRoot })
      });
    } catch {
      return heldIntentProjectStatus(projectRef, 'CURRENT_WORKGRAPH_UNAVAILABLE');
    }
  };
}

export function createSourceManagedPurposeWorkspaceProjectResolver(runtimeHome = home) {
  const homeRoot = path.resolve(runtimeHome);
  return async function resolvePurposeWorkspaceProject(projectRef) {
    if (projectRef !== toCompletionProjectDefinition.projectRef) {
      return heldPurposeWorkspaceProjectProjection(projectRef, 'PROJECT_SOURCE_NOT_REGISTERED');
    }

    let workgraphEntries;
    try {
      workgraphEntries = readIntentWorkgraphRuntimeSnapshotEntries({ home: homeRoot });
    } catch (error) {
      if (error?.code === 'INTENT_WORKGRAPH_RUNTIME_UNAVAILABLE') {
        return heldPurposeWorkspaceProjectProjection(projectRef, 'CURRENT_WORKGRAPH_UNAVAILABLE');
      }
      if (String(error?.code ?? '').startsWith('INTENT_WORKGRAPH_RUNTIME_')) {
        return heldPurposeWorkspaceProjectProjection(projectRef, 'CURRENT_WORKGRAPH_INVALID');
      }
      throw error;
    }

    if (!workgraphEntries.some((entry) => entry?.graph?.intent?.projectRef === projectRef)) {
      return heldPurposeWorkspaceProjectProjection(projectRef, 'CURRENT_WORKGRAPH_UNAVAILABLE');
    }

    const projectSnapshot = compileProjectContinuity({
      registry: projectContinuityRegistry,
      intentRegistry: intentSourceBundle.intentRegistry,
      project: toCompletionProjectDefinition,
      workgraphEntries,
      intentValidationContext: {
        registeredProcessRefs: intentSourceBundle.factory.processes.map((item) => item.processRef),
        registeredRoleRefs: intentSourceBundle.blueprint.roles.map((item) => item.roleRef),
        trustSnapshot: intentTrustSnapshot,
      },
      registeredFeatureRefs: intentSourceBundle.featureRegistry.features.map((item) => item.featureRef),
    });

    return projectPurposeWorkspaceProject({
      projectRegistry: projectContinuityRegistry,
      intentRegistry: intentSourceBundle.intentRegistry,
      projectSnapshot,
      boardView: toCompletionBoardView,
    });
  };
}

function sourceManagedPurposeWorkspaceMoveResolver(resolvePurposeWorkspaceProject) {
  return async function resolvePurposeWorkspaceMove(input) {
    const projection = await resolvePurposeWorkspaceProject(input.projectRef);
    if (projection.currentness !== 'CURRENT') {
      return Object.freeze({
        schemaVersion: PURPOSE_WORKSPACE_BOARD_MOVE_SCHEMA,
        state: 'EXECUTION_HELD',
        reason: projection.reason ?? 'PROJECT_SOURCE_UNAVAILABLE',
        projectRef: input.projectRef,
        authoritativeProjection: projection,
        effects: false,
        executionAuthority: 'NONE',
      });
    }
    return preparePurposeWorkspaceBoardMove({
      projection,
      projectSnapshot: null,
      workgraphEntry: null,
      intentRegistry: intentSourceBundle.intentRegistry,
      workNodeRef: input.workNodeRef,
      targetLaneRef: input.targetLaneRef,
      targetStateOrNull: input.targetStateOrNull,
      expectedProjectSnapshotFingerprint: input.expectedProjectSnapshotFingerprint,
      expectedState: input.expectedState,
      actorBinding: null,
    });
  };
}

async function readPurposeWorkspaceMoveRequest(request) {
  const contentType = String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw Object.assign(new Error('Purpose Workspace move request must use application/json'), { httpStatus: 415 });
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > BROWSER_PURPOSE_WORKSPACE_MOVE_REQUEST_MAX_BYTES) {
      throw Object.assign(new Error('Purpose Workspace move request exceeds the bounded body size'), { httpStatus: 413 });
    }
    chunks.push(chunk);
  }
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Purpose Workspace move request body is not valid JSON'), { httpStatus: 400 });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('Purpose Workspace move request must be one object'), { httpStatus: 400 });
  }
  const expected = [
    'expectedProjectSnapshotFingerprint',
    'expectedState',
    'projectRef',
    'targetLaneRef',
    'targetStateOrNull',
    'workNodeRef',
  ].sort();
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expected)) {
    throw Object.assign(new Error('Purpose Workspace move request fields are not exact'), { httpStatus: 400 });
  }
  if (typeof value.projectRef !== 'string' || !/^project\.[A-Za-z0-9._-]+$/u.test(value.projectRef) ||
      typeof value.workNodeRef !== 'string' || !/^work\.[A-Za-z0-9._-]+$/u.test(value.workNodeRef) ||
      typeof value.targetLaneRef !== 'string' || !/^lane\.[A-Za-z0-9._-]+$/u.test(value.targetLaneRef) ||
      (value.targetStateOrNull !== null && typeof value.targetStateOrNull !== 'string') ||
      typeof value.expectedProjectSnapshotFingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(value.expectedProjectSnapshotFingerprint) ||
      typeof value.expectedState !== 'string') {
    throw Object.assign(new Error('Purpose Workspace move request fields are invalid'), { httpStatus: 400 });
  }
  return Object.freeze({ ...value });
}

function readHereticPersistentRuntimeReceipt(runtimeReceiptPath) {
  if (runtimeReceiptPath === null || runtimeReceiptPath === '') return null;
  const receiptPath = path.resolve(runtimeReceiptPath);
  let stat;
  try {
    stat = fs.lstatSync(receiptPath);
  } catch (error) {
    throw new Error(`Heretic runtime receipt is unavailable: ${error.message}`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error('Heretic runtime receipt must be one regular non-link file');
  }
  let receipt;
  try {
    receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  } catch (error) {
    throw new Error(`Heretic runtime receipt is not valid JSON: ${error.message}`);
  }
  return Object.freeze({ receiptPath, receipt });
}

export function resolveHereticPersistentRuntimeLink({
  runtimeReceiptPath = process.env.VEXLIFE_HERETIC_RUNTIME_RECEIPT_PATH ?? null,
  runtimeHome = home,
} = {}) {
  const record = readHereticPersistentRuntimeReceipt(runtimeReceiptPath);
  if (record === null) return null;
  const homeIdentity = loadBrowserCompanionHomeIdentity(runtimeHome);
  return formHereticPersistentRuntimeLink({ receipt: record.receipt, homeIdentity });
}

export function resolveHereticPersistentRuntimeCurrentLink({
  runtimeReceiptPath = process.env.VEXLIFE_HERETIC_RUNTIME_RECEIPT_PATH ?? null,
  runtimeHome = home,
  resourceObserver = observeHereticPersistentRuntimeResource,
} = {}) {
  if (typeof resourceObserver !== 'function') {
    throw new TypeError('Heretic current runtime resolver requires one resource observer');
  }
  const record = readHereticPersistentRuntimeReceipt(runtimeReceiptPath);
  if (record === null) return null;
  const homeIdentity = loadBrowserCompanionHomeIdentity(runtimeHome);
  const resourceObservation = resourceObserver({ receiptPath: record.receiptPath });
  return formHereticPersistentRuntimeObservedLink({
    receipt: record.receipt,
    homeIdentity,
    resourceObservation,
  });
}

export async function recoverHereticPersistentRuntimeFromCurrentHome({
  runtimeHome = home,
  runNormalStart = runHereticNormalStart,
} = {}) {
  if (typeof runNormalStart !== 'function') {
    throw new TypeError('Heretic Browser recovery requires the existing normal-start owner');
  }
  const homePath = path.resolve(runtimeHome);
  const result = await runNormalStart(['--home', homePath]);
  if (!result || result.state !== 'HERETIC_RUNTIME_ESTABLISHED') {
    throw new Error('Heretic Browser recovery normal-start owner did not establish the runtime');
  }
  const record = readHereticPersistentRuntimeReceipt(result.runtimeReceiptPath);
  if (record === null) throw new Error('Heretic Browser recovery did not return a runtime receipt');
  const receipt = validateHereticPersistentRuntimeReceipt(record.receipt);
  if (receipt.runtime.pid !== result.runtimePid
      || receipt.endpoint !== result.endpoint
      || receipt.requestModel !== result.requestModel) {
    throw new Error('Heretic Browser recovery result does not match the exact current runtime receipt');
  }
  return Object.freeze({
    disposition: result.runtimeDisposition,
    pid: result.runtimePid,
    endpoint: result.endpoint,
    requestModel: result.requestModel,
    receipt,
  });
}

export function hereticRuntimeBrowserOptions(runtimeLink, {
  companionHome = home,
  resolveCurrentRuntimeLink = null,
  recoverPersistentHereticRuntime = null,
  recoveryOwnerFactory = createCompanionRecoveryOwner,
  serverCompanionBridgeFactory = createServerOwnedBrowserCompanionBridge,
} = {}) {
  if (runtimeLink === null) return Object.freeze({});
  if (!runtimeLink || runtimeLink.state !== 'BOUND_CURRENT') {
    throw new TypeError('Heretic runtime Browser options require one current runtime link');
  }
  if (resolveCurrentRuntimeLink !== null && typeof resolveCurrentRuntimeLink !== 'function') {
    throw new TypeError('Heretic runtime Browser current-link resolver must be null or one function');
  }
  if (recoverPersistentHereticRuntime !== null && typeof recoverPersistentHereticRuntime !== 'function') {
    throw new TypeError('Heretic runtime Browser recovery effect must be null or one function');
  }
  if (typeof recoveryOwnerFactory !== 'function' || typeof serverCompanionBridgeFactory !== 'function') {
    throw new TypeError('Heretic runtime Browser composition factories must be functions');
  }

  const currentRuntimeLink = async () => {
    const current = resolveCurrentRuntimeLink === null ? runtimeLink : await resolveCurrentRuntimeLink();
    if (!current || current.state !== 'BOUND_CURRENT') {
      throw new Error('Heretic runtime Browser current link is unavailable');
    }
    if (current.companionBinding.bindingRef !== runtimeLink.companionBinding.bindingRef
        || current.modelRef !== runtimeLink.modelRef
        || current.runtimeAdapterRef !== runtimeLink.runtimeAdapterRef
        || current.endpoint !== runtimeLink.endpoint
        || current.requestModel !== runtimeLink.requestModel) {
      throw new Error('Heretic runtime Browser current link drifted from the accepted binding');
    }
    return current;
  };
  const boundRecoveryOwnerFactory = recoverPersistentHereticRuntime === null
    ? recoveryOwnerFactory
    : (options) => recoveryOwnerFactory({ ...options, recoverPersistentHereticRuntime });
  const companionBridge = serverCompanionBridgeFactory({
    companionHome,
    endpoint: runtimeLink.endpoint,
    model: runtimeLink.requestModel,
    runtimeMode: CAPABILITY_ASSIMILATION_MODES.ADOPTED_READ_ONLY,
    recoveryOwnerFactory: boundRecoveryOwnerFactory,
  });
  return Object.freeze({
    companionBridge,
    resolveCompanionBinding: async () => (await currentRuntimeLink()).companionBinding,
    resolveCompanionRuntimeObservation: async () => (await currentRuntimeLink()).runtimeObservation,
  });
}

export function createVexLifeBrowserServer(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('VexLife browser server options must be one object');
  }
  const {
    relationshipsInvitationProductBridge = createBrowserRelationshipsInvitationProductBridge(),
    genericFollowThroughRuntimeHome = home,
    companionVoicePlayback = createCompanionVoicePlaybackAdapter(),
    resolveFamilyWorkProjection: callerSuppliedFamilyWorkProjection,
    resolveIntentProjectStatus: callerSuppliedIntentProjectStatus,
    ...coreOptions
  } = options;
  if (callerSuppliedFamilyWorkProjection !== undefined) {
    throw new TypeError('Production VexLife browser follow-through projection is source-managed and cannot be caller supplied');
  }
  if (callerSuppliedIntentProjectStatus !== undefined) {
    throw new TypeError('Production VexLife browser Intent status projection is source-managed and cannot be caller supplied');
  }
  const invitationBridge = invitationBridgeOrThrow(relationshipsInvitationProductBridge);
  const resolveFamilyWorkProjection = sourceManagedGenericFollowThroughResolver(
    genericFollowThroughRuntimeHome
  );
  const resolveIntentProjectStatus = sourceManagedIntentProjectStatusResolver(
    genericFollowThroughRuntimeHome
  );
  const resolvePurposeWorkspaceProject = createSourceManagedPurposeWorkspaceProjectResolver(
    genericFollowThroughRuntimeHome
  );
  const resolvePurposeWorkspaceMove = sourceManagedPurposeWorkspaceMoveResolver(
    resolvePurposeWorkspaceProject
  );
  const coreServer = createCoreVexLifeBrowserServer({
    ...coreOptions,
    companionVoicePlayback,
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
    const projectionParam = uxEvolutionRegistry.projectionHost.selectionQueryParam;
    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/' && url.searchParams.has(projectionParam)) {
      const selection = resolveUxProjectionHostSelection(uxEvolutionRegistry, {
        requestedProjection: url.searchParams.get(projectionParam),
        localExecution: true,
      });
      if (selection.state !== 'PASS') {
        sendJson(response, 400, selection);
        return;
      }
      const target = new URL(selection.route, 'http://127.0.0.1');
      for (const [key, value] of url.searchParams) {
        if (key !== projectionParam) target.searchParams.append(key, value);
      }
      response.writeHead(302, {
        Location: target.pathname + target.search,
        'Cache-Control': 'no-store',
        'X-VexLife-Projection': selection.selectedProjection,
      });
      response.end();
      return;
    }

    if (url.pathname === BROWSER_INTENT_PROJECT_STATUS_PATH) {
      if (request.method !== 'GET') {
        response.writeHead(405, { Allow: 'GET', 'Cache-Control': 'no-store' });
        response.end();
        return;
      }
      const projectRef = url.searchParams.get('projectRef');
      if (url.searchParams.size !== 1 || typeof projectRef !== 'string' || !/^project\.[A-Za-z0-9._-]+$/u.test(projectRef) || projectRef.length > 256) {
        sendJson(response, 400, heldIntentProjectStatus(null, 'PROJECT_SCOPE_INVALID'));
        return;
      }
      const result = await resolveIntentProjectStatus(projectRef);
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === BROWSER_PURPOSE_WORKSPACE_PROJECT_PATH) {
      if (request.method !== 'GET') {
        response.writeHead(405, { Allow: 'GET', 'Cache-Control': 'no-store' });
        response.end();
        return;
      }
      const projectRef = url.searchParams.get('projectRef');
      if (url.searchParams.size !== 1 || typeof projectRef !== 'string' || !/^project\.[A-Za-z0-9._-]+$/u.test(projectRef) || projectRef.length > 256) {
        sendJson(response, 400, heldPurposeWorkspaceProjectProjection(null, 'PROJECT_SCOPE_INVALID'));
        return;
      }
      sendJson(response, 200, await resolvePurposeWorkspaceProject(projectRef));
      return;
    }

    if (url.pathname === BROWSER_PURPOSE_WORKSPACE_PROJECT_MOVE_PATH) {
      if (request.method !== 'POST') {
        response.writeHead(405, { Allow: 'POST', 'Cache-Control': 'no-store' });
        response.end();
        return;
      }
      try {
        const input = await readPurposeWorkspaceMoveRequest(request);
        sendJson(response, 200, await resolvePurposeWorkspaceMove(input));
      } catch (error) {
        sendJson(response, Number.isInteger(error?.httpStatus) ? error.httpStatus : 400, {
          schemaVersion: PURPOSE_WORKSPACE_BOARD_MOVE_SCHEMA,
          state: 'INVALID_REJECTED',
          reason: 'MOVE_REQUEST_INVALID',
          projectRef: null,
          authoritativeProjection: null,
          effects: false,
          executionAuthority: 'NONE',
        });
      }
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

const hereticRuntimeLink = resolveHereticPersistentRuntimeLink();
const server = createVexLifeBrowserServer(
  hereticRuntimeBrowserOptions(hereticRuntimeLink, {
    companionHome: home,
    resolveCurrentRuntimeLink: hereticRuntimeLink === null
      ? null
      : () => resolveHereticPersistentRuntimeCurrentLink({ runtimeHome: home }),
    recoverPersistentHereticRuntime: hereticRuntimeLink === null
      ? null
      : () => recoverHereticPersistentRuntimeFromCurrentHome({ runtimeHome: home }),
  }),
);

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    console.log(`VexLife browser reference: http://127.0.0.1:${address.port}`);
  });
}

// [VXG RealForever]
