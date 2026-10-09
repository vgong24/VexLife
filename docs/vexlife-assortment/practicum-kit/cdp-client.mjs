#!/usr/bin/env node
import http from 'node:http';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function httpJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error(`HTTP ${response.statusCode}: ${url}`));
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

export async function waitForPageTarget(port, baseUrl, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const targets = await httpJson(`http://127.0.0.1:${port}/json/list`);
      const target = targets.find((item) => item.type === 'page' && String(item.url ?? '').startsWith(baseUrl));
      if (target?.webSocketDebuggerUrl) return target;
      last = new Error(`Preview page target not found. Targets: ${targets.map((item) => item.url).join(', ')}`);
    } catch (error) { last = error; }
    await sleep(200);
  }
  throw last ?? new Error('Timed out waiting for preview page target');
}

export class CDP {
  constructor(webSocketUrl) {
    if (typeof WebSocket !== 'function') throw new Error('Node 22+ global WebSocket support is required');
    this.socket = new WebSocket(webSocketUrl);
    this.sequence = 0;
    this.pending = new Map();
    this.opened = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(JSON.stringify(message.error))) : pending.resolve(message.result);
    });
  }

  async send(method, params = {}) {
    await this.opened;
    const id = ++this.sequence;
    return await new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.socket.close(); }
}

export async function evaluate(cdp, expression, { awaitPromise = true } = {}) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime.evaluate exception');
  return result.result?.value;
}

export async function waitFor(cdp, expression, description, timeoutMs = 9000, pollMs = 120) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const value = await evaluate(cdp, expression);
      if (value) return value;
      last = value;
    } catch (error) { last = error.message; }
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for ${description}. Last=${JSON.stringify(last)}`);
}

export async function connectPreview({ debugPort, url, timeoutMs = 12000 }) {
  const target = await waitForPageTarget(debugPort, url, timeoutMs);
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  return cdp;
}
