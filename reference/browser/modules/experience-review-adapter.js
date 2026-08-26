import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createExperienceReviewEvidence } from '../../../src/core/experience-review-kit.mjs';

export const ADAPTER_REF = 'adapter.vexlife.browser.playwright.v0';
export const ADAPTER_VERSION_REF = 'adapter-version.vexlife.browser.playwright.v0.2';

export function stableTargetSelector(ref) {
  if (typeof ref !== 'string' || !ref.trim()) throw new TypeError('targetNodeRef must be a non-empty string');
  return `[data-node-ref="${ref.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`;
}

const CONTEXTUAL_PROJECTION_TARGETS = new Map([
  ['element.nav.chat', 'action.view.select'],
  ['element.nav.health', 'action.view.select']
]);
const CONTEXTUAL_PROJECTION_REVEAL_SELECTOR = '#surfaceMenuButton';
const hash = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
const artifactRefFor = (task) => `artifact.vexlife.browser.${task.captureRequest.captureRequestRef}.${task.step.reviewStepRef}`;

function requireContextualProjectionBinding(step, operation) {
  const operationKeys = Object.keys(operation ?? {}).sort();
  if (operationKeys.length !== 1 || operationKeys[0] !== 'kind') {
    throw new Error('CLICK_CONTEXTUAL_PROJECTION_TARGET accepts only the binding kind');
  }
  const expectedActionRef = CONTEXTUAL_PROJECTION_TARGETS.get(step.targetNodeRef);
  if (!expectedActionRef || step.actionRef !== expectedActionRef) {
    throw new Error(`Unsupported contextual projection target/action: ${step.targetNodeRef ?? 'NULL'} + ${step.actionRef ?? 'NULL'}`);
  }
}

async function clickContextualProjectionTarget(page, target, step, operation) {
  requireContextualProjectionBinding(step, operation);
  if (await target.count() === 0) throw new Error(`Stable review target was not rendered: ${step.targetNodeRef}`);
  if (!(await target.isVisible())) {
    const reveal = page.locator(CONTEXTUAL_PROJECTION_REVEAL_SELECTOR).first();
    if (await reveal.count() === 0 || !(await reveal.isVisible())) {
      throw new Error(`Contextual projection reveal control was unavailable for: ${step.targetNodeRef}`);
    }
    await reveal.click();
    if (!(await target.isVisible())) {
      throw new Error(`Contextual projection target remained hidden after fixed reveal: ${step.targetNodeRef}`);
    }
  }
  return target.click();
}

async function perform(page, step, binding) {
  const operation = binding.stepBindings?.[step.reviewStepRef] ?? { kind: 'CLICK_STABLE_TARGET' };
  if (operation.kind === 'NOOP') return;
  if (step.targetNodeRef == null) throw new Error(`Browser operation ${operation.kind} requires targetNodeRef`);
  const target = page.locator(stableTargetSelector(step.targetNodeRef)).first();
  if (operation.kind === 'CLICK_CONTEXTUAL_PROJECTION_TARGET') return clickContextualProjectionTarget(page, target, step, operation);
  if (await target.count() === 0) throw new Error(`Stable review target was not rendered: ${step.targetNodeRef}`);
  if (operation.kind === 'CLICK_STABLE_TARGET') return target.click();
  if (operation.kind === 'FOCUS_STABLE_TARGET') return target.focus();
  if (operation.kind === 'FILL_STABLE_TARGET') return target.fill(String(operation.value ?? ''));
  if (operation.kind === 'PRESS_STABLE_TARGET') return target.press(String(operation.key ?? 'Enter'));
  if (operation.kind === 'PAN_STABLE_TARGET') {
    const box = await target.boundingBox();
    if (!box) throw new Error(`Stable target has no bounding box: ${step.targetNodeRef}`);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + Number(operation.dx ?? 80), y + Number(operation.dy ?? 40), { steps: 5 });
    return page.mouse.up();
  }
  throw new Error(`Unsupported browser step binding kind: ${operation.kind}`);
}

async function overlay(page, step, request) {
  const options = request.reviewOverlay ?? {};
  if (!options.highlightTarget && !options.showStableRef && !options.showAction) return null;
  if (step.targetNodeRef == null) throw new Error('Review overlay requires targetNodeRef');
  const selector = stableTargetSelector(step.targetNodeRef);
  if (await page.locator(selector).count() === 0) throw new Error(`Review overlay target was not rendered: ${step.targetNodeRef}`);
  const id = `vex-review-overlay-${crypto.randomUUID()}`;
  await page.evaluate(({ selector, id, options, node, action }) => {
    const target = document.querySelector(selector);
    if (!target) throw new Error(`Review overlay target missing: ${node}`);
    const rect = target.getBoundingClientRect();
    const host = document.createElement('div');
    host.id = id;
    host.dataset.vexReviewOverlay = 'true';
    Object.assign(host.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483646' });
    if (options.highlightTarget) {
      const border = document.createElement('div');
      Object.assign(border.style, {
        position: 'fixed',
        left: `${Math.max(0, rect.left - 4)}px`,
        top: `${Math.max(0, rect.top - 4)}px`,
        width: `${rect.width + 8}px`,
        height: `${rect.height + 8}px`,
        border: '3px solid #ffbf47',
        borderRadius: '8px'
      });
      host.append(border);
    }
    if (options.showStableRef || options.showAction) {
      const label = document.createElement('div');
      Object.assign(label.style, {
        position: 'fixed',
        left: `${Math.max(8, Math.min(innerWidth - 420, rect.left))}px`,
        top: `${Math.max(8, rect.top - 44)}px`,
        padding: '8px 10px',
        borderRadius: '8px',
        background: 'rgba(10,12,15,.94)',
        color: '#fff',
        font: '600 12px ui-monospace,monospace',
        whiteSpace: 'pre-wrap'
      });
      label.textContent = [options.showStableRef ? node : '', options.showAction ? action : ''].filter(Boolean).join('\n');
      host.append(label);
    }
    document.documentElement.append(host);
  }, { selector, id, options, node: step.targetNodeRef, action: step.actionRef });
  return id;
}

const removeOverlay = (page, id) => id ? page.evaluate((value) => document.getElementById(value)?.remove(), id) : undefined;
const failedSafe = (task, observedAt, message) => createExperienceReviewEvidence({
  task,
  adapterRef: ADAPTER_REF,
  adapterVersionRef: ADAPTER_VERSION_REF,
  captureState: 'FAILED_SAFE',
  observedAt,
  artifact: null,
  deviations: [message],
  limitations: ['Browser capture failed safe; no substitute platform or truth class was used.'],
  doesNotProve: ['Rendered experience evidence']
});

export function createBrowserExperienceReviewAdapter({ browserType = null, launchOptions = { headless: true }, settleMs = 120 } = {}) {
  return {
    adapterRef: ADAPTER_REF,
    adapterVersionRef: ADAPTER_VERSION_REF,
    platformRef: 'platform.browser',
    async captureTasks(tasks, out) {
      if (!Array.isArray(tasks)) throw new TypeError('tasks must be an array');
      fs.mkdirSync(out, { recursive: true });
      const type = browserType ?? (await import('playwright')).chromium;
      const browser = await type.launch(launchOptions);
      const evidence = [];
      try {
        for (const task of tasks) {
          const observedAt = new Date().toISOString();
          const { captureRequest: capture, step, binding } = task;
          if (capture.platformRef !== 'platform.browser') {
            evidence.push(createExperienceReviewEvidence({
              task,
              adapterRef: ADAPTER_REF,
              adapterVersionRef: ADAPTER_VERSION_REF,
              captureState: 'UNSUPPORTED',
              observedAt,
              artifact: null,
              unsupportedCapabilities: [capture.platformRef],
              limitations: ['Browser adapter does not substitute for native adapters.'],
              doesNotProve: ['Native-platform behavior']
            }));
            continue;
          }
          const page = await browser.newPage({ viewport: binding.viewport });
          const errors = [];
          page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
          page.on('pageerror', (error) => errors.push(error.message));
          try {
            await page.goto(binding.pageUrl, { waitUntil: binding.waitUntil ?? 'load', timeout: binding.timeoutMs ?? 30000 });
            for (const candidateStep of capture.steps) {
              await perform(page, candidateStep, binding);
              if (candidateStep.reviewStepRef === step.reviewStepRef) break;
            }
            if (settleMs > 0) await page.waitForTimeout(binding.settleMs ?? settleMs);
            const overlayId = await overlay(page, step, capture);
            const outputPath = path.join(out, task.artifactFileName);
            await page.screenshot({ path: outputPath, fullPage: binding.fullPage ?? true });
            await removeOverlay(page, overlayId);
            evidence.push(createExperienceReviewEvidence({
              task,
              adapterRef: ADAPTER_REF,
              adapterVersionRef: ADAPTER_VERSION_REF,
              captureState: 'CAPTURED',
              observedAt,
              artifact: {
                artifactRef: artifactRefFor(task),
                sha256: hash(outputPath),
                mediaType: 'image/png'
              },
              deviations: errors.length ? [`Console/page errors observed: ${errors.join(' | ')}`] : [],
              limitations: ['Browser evidence proves only the exact captured request and source version.'],
              doesNotProve: ['Model quality', 'human acceptance', 'native-platform behavior', 'runtime authority']
            }));
          } catch (error) {
            evidence.push(failedSafe(task, observedAt, error.message));
          } finally {
            await page.close();
          }
        }
      } finally {
        await browser.close();
      }
      return evidence;
    }
  };
}

// [VXG RealForever]
