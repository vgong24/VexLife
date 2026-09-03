#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BROWSER_COMPANION_API_PATH,
  BROWSER_COMPANION_STATUS_PATH,
  BrowserCompanionBridgeError,
  browserCompanionFailurePayload,
  createBrowserCompanionBridge,
  loadBrowserCompanionHomeIdentity
} from '../src/core/browser-companion-bridge.mjs';
import {
  CAPABILITY_ASSIMILATION_MODES,
  createCapabilityAssimilationRuntime
} from '../src/core/capability-assimilation-runtime.mjs';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import {
  BROWSER_LIVING_JOURNAL_ARCHIVE_API_PATH,
  BROWSER_LIVING_JOURNAL_MEMORY_API_PATH,
  BrowserLivingJournalMemoryBridgeError,
  browserLivingJournalArchiveFailurePayload,
  browserLivingJournalMemoryFailurePayload,
  createBrowserLivingJournalMemoryBridge
} from '../src/core/browser-living-journal-memory-bridge.mjs';
import {
  BrowserRelationshipsPersistenceError,
  createBrowserRelationshipsPersistenceBridge
} from '../src/core/browser-relationships-persistence-bridge.mjs';
import {
  BROWSER_RELATIONSHIPS_RUNTIME_API_PATH,
  BROWSER_RELATIONSHIPS_RUNTIME_MAX_BODY_BYTES,
  BrowserRelationshipsRuntimeBridgeError,
  browserRelationshipsRuntimeFailurePayload,
  createBrowserRelationshipsRuntimeBridge
} from '../src/core/browser-relationships-runtime-bridge.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.VEXLIFE_PORT ?? 18110);
const home = path.resolve(process.env.VEXLIFE_HOME ?? path.join(os.homedir(), '.vexlife'));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
export const BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH = '/api/v1/relationships/persistence';
export const BROWSER_RELATIONSHIPS_PERSISTENCE_MAX_BODY_BYTES = 16 * 1024;
const RELATIONSHIPS_PERSISTENCE_REQUEST_KEYS = new Set(['localOwnerBinding', 'input']);

function readRelationshipsRuntimeSourceJson(sourceRoot, relativePath, label) {
  const file = path.resolve(sourceRoot, relativePath);
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    throw new BrowserRelationshipsRuntimeBridgeError(
      'RELATIONSHIPS_RUNTIME_SOURCE_UNAVAILABLE',
      `${label} is unavailable`,
      503,
      error?.message ?? String(error)
    );
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new BrowserRelationshipsRuntimeBridgeError(
      'RELATIONSHIPS_RUNTIME_SOURCE_NOT_CURRENT',
      `${label} must be one regular non-link file`,
      503,
      null
    );
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new BrowserRelationshipsRuntimeBridgeError(
      'RELATIONSHIPS_RUNTIME_SOURCE_NOT_CURRENT',
      `${label} is not valid JSON`,
      503,
      error?.message ?? String(error)
    );
  }
}

export function loadBrowserRelationshipsRuntimeSources(sourceRoot = root) {
  const canonical = path.resolve(sourceRoot);
  return Object.freeze({
    relationshipsRegistry: readRelationshipsRuntimeSourceJson(
      canonical,
      'blueprint/relationships-browser-registry.json',
      'Relationships registry'
    ),
    cdrRegistry: readRelationshipsRuntimeSourceJson(
      canonical,
      'blueprint/cdr-s5-closed-alpha-browser-registry.json',
      'CDR S5 registry'
    )
  });
}

const capabilityRuntimeMode = process.env.VEXLIFE_CAPABILITY_RUNTIME_MODE ??
  CAPABILITY_ASSIMILATION_MODES.DIRECT_SINGLE_TURN;
if (!Object.values(CAPABILITY_ASSIMILATION_MODES).includes(capabilityRuntimeMode)) {
  throw new Error(`Unsupported VEXLIFE_CAPABILITY_RUNTIME_MODE: ${capabilityRuntimeMode}`);
}
const capabilityRuntimeBundle = capabilityRuntimeMode === CAPABILITY_ASSIMILATION_MODES.DIRECT_SINGLE_TURN
  ? null
  : loadBlueprint(root);
const capabilityRuntime = capabilityRuntimeBundle
  ? createCapabilityAssimilationRuntime({
      capabilityRegistry: capabilityRuntimeBundle.capabilities,
      processFactoryDefinition: capabilityRuntimeBundle.factory,
      schedulerRegistry: capabilityRuntimeBundle.schedulerRegistry,
      mode: capabilityRuntimeMode
    })
  : null;
const companion = createBrowserCompanionBridge({
  home,
  endpoint: process.env.VEXLIFE_COMPANION_ENDPOINT ?? null,
  model: process.env.VEXLIFE_COMPANION_MODEL ?? null,
  capabilityRuntime
});
const relationshipsRuntime = createBrowserRelationshipsRuntimeBridge(loadBrowserRelationshipsRuntimeSources(root));

function sendJson(response, statusCode, value) {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  response.end(body);
}

function companionRequestError(message, httpStatus) {
  return new BrowserCompanionBridgeError('COMPANION_REQUEST_NOT_ADMITTED', message, httpStatus);
}

function livingJournalMemoryRequestError(message, httpStatus) {
  return new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_MEMORY_REQUEST_NOT_ADMITTED', message, httpStatus);
}
function livingJournalArchiveRequestError(message, httpStatus) {
  return new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_REQUEST_NOT_ADMITTED', message, httpStatus);
}
function relationshipsRuntimeRequestError(message, httpStatus) {
  return new BrowserRelationshipsRuntimeBridgeError('RELATIONSHIPS_RUNTIME_REQUEST_NOT_ADMITTED', message, httpStatus, null);
}
function relationshipsPersistenceRequestError(message, httpStatus) {
  const error = new BrowserRelationshipsPersistenceError('RELATIONSHIPS_PERSISTENCE_REQUEST_NOT_ADMITTED', message);
  error.httpStatus = httpStatus;
  return error;
}

async function readBoundedJson(request, { maxBytes = 64 * 1024, formError = companionRequestError, requestLabel = 'Companion request' } = {}) {
  const contentType = String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw formError(`${requestLabel} must use application/json`, 415);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw formError(`${requestLabel} exceeds the bounded body size`, 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw formError(`${requestLabel} body is not valid JSON`, 400);
  }
}

function archiveHomeFailure(error) {
  const status = error instanceof BrowserCompanionBridgeError && error.httpStatus === 409 ? 409 : 503;
  return new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_HOME_UNAVAILABLE', 'Living Journal archive Home identity is unavailable', status, null);
}

function memoryHomeFailure(error) {
  const status = error instanceof BrowserCompanionBridgeError && error.httpStatus === 409 ? 409 : 503;
  return new BrowserLivingJournalMemoryBridgeError(
    'LIVING_JOURNAL_MEMORY_HOME_UNAVAILABLE',
    'Living Journal Memory Home identity is unavailable',
    status,
    null
  );
}

function admitRelationshipsPersistenceRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw relationshipsPersistenceRequestError('Relationships persistence request must be one object', 400);
  }
  const keys = Object.keys(value);
  if (keys.length !== RELATIONSHIPS_PERSISTENCE_REQUEST_KEYS.size || keys.some((key) => !RELATIONSHIPS_PERSISTENCE_REQUEST_KEYS.has(key))) {
    throw relationshipsPersistenceRequestError('Relationships persistence request must contain only localOwnerBinding and input', 400);
  }
  if (!value.localOwnerBinding || typeof value.localOwnerBinding !== 'object' || Array.isArray(value.localOwnerBinding)) {
    throw relationshipsPersistenceRequestError('Relationships persistence request requires one explicit local owner binding', 400);
  }
  if (!value.input || typeof value.input !== 'object' || Array.isArray(value.input)) {
    throw relationshipsPersistenceRequestError('Relationships persistence request requires one save input object', 400);
  }
  return value;
}

function relationshipsPersistenceHttpStatus(error) {
  if (Number.isInteger(error?.httpStatus)) return error.httpStatus;
  if (!(error instanceof BrowserRelationshipsPersistenceError)) return 500;
  if (['RELATIONSHIPS_PERSISTENCE_INPUT_INVALID', 'RELATIONSHIPS_PERSISTENCE_IDENTITY_INVALID', 'RELATIONSHIPS_PERSISTENCE_PREPARED_INVALID'].includes(error.code)) return 400;
  if (['RELATIONSHIPS_IDENTITY_BINDING_REQUIRED', 'RELATIONSHIPS_PERSISTENCE_HOME_REQUIRED'].includes(error.code)) return 409;
  return 500;
}

function relationshipsPersistenceFailurePayload(error) {
  if (error instanceof BrowserRelationshipsPersistenceError) {
    return Object.freeze({
      schemaVersion: 'vexlife.browser-relationships-persistence-http-failure/v1',
      state: 'HELD_PERSISTENCE_FAILURE',
      failureCode: error.code,
      message: error.message
    });
  }
  return Object.freeze({
    schemaVersion: 'vexlife.browser-relationships-persistence-http-failure/v1',
    state: 'HELD_PERSISTENCE_FAILURE',
    failureCode: 'RELATIONSHIPS_PERSISTENCE_SAVE_FAILED',
    message: 'Relationships persistence save failed safely'
  });
}

export function createVexLifeBrowserServer({
  staticRoot = root,
  companionBridge = companion,
  relationshipsRuntimeBridge = relationshipsRuntime,
  relationshipsPersistenceHome = home,
  relationshipsPersistenceBridgeFactory = (localOwnerBinding) => createBrowserRelationshipsPersistenceBridge({
    home: relationshipsPersistenceHome,
    localOwnerBinding
  }),
  resolveHomeIdentity = () => loadBrowserCompanionHomeIdentity(home),
  createLivingJournalMemoryBridge = (identity) => createBrowserLivingJournalMemoryBridge({ identity })
} = {}) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || `127.0.0.1:${port}`}`);

      if (url.pathname === BROWSER_COMPANION_STATUS_PATH) {
        if (request.method !== 'GET') {
          response.writeHead(405, { Allow: 'GET', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        sendJson(response, 200, companionBridge.status());
        return;
      }

      if (url.pathname === BROWSER_COMPANION_API_PATH) {
        if (request.method !== 'POST') {
          response.writeHead(405, { Allow: 'POST', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        const input = await readBoundedJson(request);
        const result = await companionBridge.performTurn(input);
        sendJson(response, 200, result);
        return;
      }

      if (url.pathname === BROWSER_RELATIONSHIPS_PERSISTENCE_API_PATH) {
        if (request.method !== 'POST') {
          response.writeHead(405, { Allow: 'POST', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        try {
          const requestValue = admitRelationshipsPersistenceRequest(await readBoundedJson(request, {
            maxBytes: BROWSER_RELATIONSHIPS_PERSISTENCE_MAX_BODY_BYTES,
            formError: relationshipsPersistenceRequestError,
            requestLabel: 'Relationships persistence request'
          }));
          const persistenceBridge = relationshipsPersistenceBridgeFactory(requestValue.localOwnerBinding);
          const prepared = persistenceBridge.prepare(requestValue.input);
          const result = persistenceBridge.commit(prepared);
          sendJson(response, 200, result);
        } catch (error) {
          sendJson(response, relationshipsPersistenceHttpStatus(error), relationshipsPersistenceFailurePayload(error));
        }
        return;
      }

      if (url.pathname === BROWSER_RELATIONSHIPS_RUNTIME_API_PATH) {
        if (request.method !== 'POST') {
          response.writeHead(405, { Allow: 'POST', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        try {
          const input = await readBoundedJson(request, {
            maxBytes: BROWSER_RELATIONSHIPS_RUNTIME_MAX_BODY_BYTES,
            formError: relationshipsRuntimeRequestError,
            requestLabel: 'Relationships runtime request'
          });
          const result = relationshipsRuntimeBridge.prepare(input);
          sendJson(response, 200, result);
        } catch (error) {
          const typed = error instanceof BrowserRelationshipsRuntimeBridgeError
            ? error
            : new BrowserRelationshipsRuntimeBridgeError(
              'RELATIONSHIPS_RUNTIME_PLAN_FAILED',
              'Relationships runtime plan failed safely',
              500,
              null
            );
          sendJson(response, typed.httpStatus, browserRelationshipsRuntimeFailurePayload(typed));
        }
        return;
      }

      if (url.pathname === BROWSER_LIVING_JOURNAL_MEMORY_API_PATH) {
        if (request.method !== 'POST') {
          response.writeHead(405, { Allow: 'POST', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        try {
          const input = await readBoundedJson(request, { maxBytes: 8 * 1024, formError: livingJournalMemoryRequestError, requestLabel: 'Living Journal Memory request' });
          let identity;
          try {
            identity = resolveHomeIdentity();
          } catch (error) {
            throw memoryHomeFailure(error);
          }
          const result = createLivingJournalMemoryBridge(identity).read(input);
          sendJson(response, 200, result);
        } catch (error) {
          const typed = error instanceof BrowserLivingJournalMemoryBridgeError
            ? error
            : new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_MEMORY_READ_FAILED', 'Living Journal Memory read failed safely', 500, null);
          sendJson(response, typed.httpStatus, browserLivingJournalMemoryFailurePayload(typed));
        }
        return;
      }

      if (url.pathname === BROWSER_LIVING_JOURNAL_ARCHIVE_API_PATH) {
        if (request.method !== 'POST') {
          response.writeHead(405, { Allow: 'POST', 'Cache-Control': 'no-store' });
          response.end();
          return;
        }
        try {
          const input = await readBoundedJson(request, { maxBytes: 8 * 1024, formError: livingJournalArchiveRequestError, requestLabel: 'Living Journal archive request' });
          let identity;
          try { identity = resolveHomeIdentity(); } catch (error) { throw archiveHomeFailure(error); }
          const result = createLivingJournalMemoryBridge(identity).readArchive(input);
          sendJson(response, 200, result);
        } catch (error) {
          const typed = error instanceof BrowserLivingJournalMemoryBridgeError
            ? error
            : new BrowserLivingJournalMemoryBridgeError('LIVING_JOURNAL_ARCHIVE_READ_FAILED', 'Living Journal archive read failed safely', 500, null);
          sendJson(response, typed.httpStatus, browserLivingJournalArchiveFailurePayload(typed));
        }
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end();
        return;
      }

      let relative = decodeURIComponent(url.pathname);
      if (relative === '/') {
        response.writeHead(302, { Location: '/reference/browser/' });
        response.end();
        return;
      }
      if (relative === '/reference/browser/') relative = '/reference/browser/index.html';
      const filePath = path.resolve(staticRoot, `.${relative}`);
      if (!filePath.startsWith(staticRoot + path.sep) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        response.writeHead(404); response.end('Not found'); return;
      }
      response.writeHead(200, { 'Content-Type': types[path.extname(filePath)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      fs.createReadStream(filePath).pipe(response);
    } catch (error) {
      const typed = error instanceof BrowserCompanionBridgeError
        ? error
        : new BrowserCompanionBridgeError('COMPANION_TURN_FAILED', 'Local companion turn failed safely', 500, error?.message ?? String(error));
      sendJson(response, typed.httpStatus, browserCompanionFailurePayload(typed));
    }
  });
}

const server = createVexLifeBrowserServer();

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    console.log(`VexLife browser reference: http://127.0.0.1:${address.port}`);
    console.log(`VexLife browser companion binding: ${companion.status().state}`);
  });
}

// [VXG RealForever]
