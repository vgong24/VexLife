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
  createBrowserCompanionBridge
} from '../src/core/browser-companion-bridge.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.VEXLIFE_PORT ?? 18110);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const companion = createBrowserCompanionBridge({
  home: path.resolve(process.env.VEXLIFE_HOME ?? path.join(os.homedir(), '.vexlife')),
  endpoint: process.env.VEXLIFE_COMPANION_ENDPOINT ?? null,
  model: process.env.VEXLIFE_COMPANION_MODEL ?? null
});

function sendJson(response, statusCode, value) {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  response.end(body);
}

async function readBoundedJson(request, maxBytes = 64 * 1024) {
  const contentType = String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new BrowserCompanionBridgeError('COMPANION_REQUEST_NOT_ADMITTED', 'Companion request must use application/json', 415);
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) {
      throw new BrowserCompanionBridgeError('COMPANION_REQUEST_NOT_ADMITTED', 'Companion request exceeds the bounded body size', 413);
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new BrowserCompanionBridgeError('COMPANION_REQUEST_NOT_ADMITTED', 'Companion request body is not valid JSON', 400);
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || `127.0.0.1:${port}`}`);

    if (url.pathname === BROWSER_COMPANION_STATUS_PATH) {
      if (request.method !== 'GET') {
        response.writeHead(405, { Allow: 'GET', 'Cache-Control': 'no-store' });
        response.end();
        return;
      }
      sendJson(response, 200, companion.status());
      return;
    }

    if (url.pathname === BROWSER_COMPANION_API_PATH) {
      if (request.method !== 'POST') {
        response.writeHead(405, { Allow: 'POST', 'Cache-Control': 'no-store' });
        response.end();
        return;
      }
      const input = await readBoundedJson(request);
      const result = await companion.performTurn(input);
      sendJson(response, 200, result);
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
    const filePath = path.resolve(root, `.${relative}`);
    if (!filePath.startsWith(root + path.sep) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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

server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  console.log(`VexLife browser reference: http://127.0.0.1:${address.port}`);
  console.log(`VexLife browser companion binding: ${companion.status().state}`);
});

// [VXG RealForever]
