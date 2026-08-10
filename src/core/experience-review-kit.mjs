export const PORTABLE_CONTRACT_REF = 'contract.vextreme.experience-review.portable.v0';
export const PORTABLE_SCHEMA_VERSION = 'vextreme.experience-review.portable-contract/v0';
export const VEXLIFE_REVIEW_REQUEST_SCHEMA = 'vexlife.experience-review.request/v0';
export const TRUTH_CLASSES = Object.freeze([
  'CURRENT_ACCEPTED_IMPLEMENTATION',
  'CURRENT_SYNTHETIC_REFERENCE',
  'IN_FLIGHT_CANDIDATE',
  'ARCHITECTURAL_TARGET_ONLY',
  'A_B_VARIANT_PROPOSAL'
]);

const TRUTH_CLASS_SET = new Set(TRUTH_CLASSES);
const PORTABLE_FORBIDDEN_CAPTURE_KEYS = new Set([
  'playwright',
  'playwrightSelector',
  'cssSelector',
  'xpath',
  'browserCommand',
  'shellCommand',
  'executable',
  'scriptPath',
  'captureFunction',
  // VexLife additionally refuses other renderer/location aliases inside portable requests.
  'selector',
  'pageUrl',
  'url',
  'backendCommand'
]);

const object = (value, name) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
};

const string = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return value;
};

const uniqueStrings = (values, name, { minItems = 0 } = {}) => {
  if (!Array.isArray(values)) throw new TypeError(`${name} must be an array`);
  if (values.length < minItems) throw new Error(`${name} requires at least ${minItems} item(s)`);
  for (const [index, value] of values.entries()) string(value, `${name}[${index}]`);
  if (new Set(values).size !== values.length) throw new Error(`${name} contains duplicate refs`);
  return values;
};

const scanForbiddenCaptureFields = (value, path = 'captureRequest') => {
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    if (PORTABLE_FORBIDDEN_CAPTURE_KEYS.has(key)) return `${path}.${key}`;
    const hit = scanForbiddenCaptureFields(child, `${path}.${key}`);
    if (hit) return hit;
  }
  return null;
};

const localeCode = (value) => {
  const match = string(value, 'localeRef').match(/^locale\.([a-z]{2})$/);
  if (!match) throw new Error(`Unsupported localeRef: ${value}`);
  return match[1];
};

const themeCode = (value) => {
  const normalized = string(value, 'themeRef').replace(/^theme\./, '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) throw new Error(`Unsupported themeRef: ${value}`);
  return normalized;
};

const dimension = (value, prefix) => value?.startsWith(prefix) ? value.slice(prefix.length) : value || '';

const safeArtifactPath = (value, name = 'artifactPath') => {
  const normalized = string(value, name).replaceAll('\\', '/');
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized) || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error(`${name} must be a safe relative artifact path`);
  }
  return normalized;
};

const htmlEscape = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function validateCaptureRequest(captureRequest) {
  const capture = object(captureRequest, 'captureRequest');
  for (const key of [
    'captureRequestRef',
    'reviewEpochRef',
    'reviewCaseRef',
    'platformRef',
    'experienceProfileRef',
    'routeRef',
    'initialStateRef',
    'localeRef',
    'themeRef',
    'deviceProfileRef',
    'sourceVersionRef',
    'truthClass'
  ]) string(capture[key], key);

  if (!TRUTH_CLASS_SET.has(capture.truthClass)) throw new Error(`Unknown truthClass: ${capture.truthClass}`);
  if (capture.truthClass === 'A_B_VARIANT_PROPOSAL') string(capture.baselineReviewEpochRef, 'baselineReviewEpochRef');

  if (!Array.isArray(capture.steps) || capture.steps.length === 0) throw new Error('steps requires at least 1 item(s)');
  const stepRefs = [];
  for (const [index, value] of capture.steps.entries()) {
    const step = object(value, `steps[${index}]`);
    for (const key of ['reviewStepRef', 'actionRef', 'expectedStateRef']) string(step[key], `steps[${index}].${key}`);
    if (step.targetNodeRef !== null && step.targetNodeRef !== undefined) {
      string(step.targetNodeRef, `steps[${index}].targetNodeRef`);
    }
    if (step.sequence !== index) throw new Error('step sequence must be contiguous and zero-based');
    stepRefs.push(step.reviewStepRef);
  }
  if (new Set(stepRefs).size !== stepRefs.length) throw new Error('reviewStepRef values must be unique');

  uniqueStrings(capture.captureAtStepRefs, 'captureAtStepRefs', { minItems: 1 });
  const knownStepRefs = new Set(stepRefs);
  for (const ref of capture.captureAtStepRefs) {
    if (!knownStepRefs.has(ref)) throw new Error(`captureAtStepRef missing from steps: ${ref}`);
  }

  const reviewOverlay = object(capture.reviewOverlay, 'reviewOverlay');
  const overlayKeys = ['highlightTarget', 'showStableRef', 'showAction'];
  for (const key of overlayKeys) {
    if (typeof reviewOverlay[key] !== 'boolean') throw new Error(`reviewOverlay.${key} must be boolean`);
  }
  const extraOverlayKeys = Object.keys(reviewOverlay).filter((key) => !overlayKeys.includes(key));
  if (extraOverlayKeys.length) throw new Error(`reviewOverlay contains unsupported field: ${extraOverlayKeys[0]}`);

  const forbidden = scanForbiddenCaptureFields(capture);
  if (forbidden) {
    throw new Error(`Renderer/backend field is forbidden inside portable ExperienceCaptureRequest: ${forbidden}`);
  }
  return capture;
}

function validateReviewCase(reviewCase, index) {
  const value = object(reviewCase, `reviewCases[${index}]`);
  for (const key of [
    'reviewCaseRef',
    'featureOrJourneyRef',
    'whyItMatters',
    'reviewQuestion',
    'truthClass',
    'startingStateRef',
    'routeRef'
  ]) string(value[key], `reviewCases[${index}].${key}`);
  if (!TRUTH_CLASS_SET.has(value.truthClass)) throw new Error(`Unknown review case truthClass: ${value.truthClass}`);
  uniqueStrings(value.reviewStepRefs, `reviewCases[${index}].reviewStepRefs`, { minItems: 1 });
  if (!Array.isArray(value.knownLimitations)) throw new TypeError(`reviewCases[${index}].knownLimitations must be an array`);
  if (!Array.isArray(value.doesNotProve) || value.doesNotProve.length === 0) {
    throw new Error(`reviewCases[${index}].doesNotProve must contain at least one limitation`);
  }
  return value;
}

export function validateReviewRequestBundle(bundle) {
  const value = object(bundle, 'bundle');
  if (value.schemaVersion !== VEXLIFE_REVIEW_REQUEST_SCHEMA) throw new Error('Unsupported VexLife review request schema');
  if (value.portableContractRef !== PORTABLE_CONTRACT_REF) throw new Error('Portable contract mismatch');
  if (value.portableSchemaVersionRef !== PORTABLE_SCHEMA_VERSION) throw new Error('Portable schema mismatch');

  const epoch = object(value.reviewEpoch, 'reviewEpoch');
  for (const key of ['reviewEpochRef', 'reviewPlanRef', 'reviewRequestRef', 'sourceVersionRef', 'truthClass']) {
    string(epoch[key], `reviewEpoch.${key}`);
  }
  if (!TRUTH_CLASS_SET.has(epoch.truthClass)) throw new Error(`Unknown epoch truthClass: ${epoch.truthClass}`);
  if (epoch.truthClass === 'A_B_VARIANT_PROPOSAL') string(epoch.baselineReviewEpochRef, 'reviewEpoch.baselineReviewEpochRef');

  const plan = object(value.reviewPlan, 'reviewPlan');
  if (plan.reviewPlanRef !== epoch.reviewPlanRef) throw new Error('reviewPlan epoch binding mismatch');
  uniqueStrings(plan.reviewCaseRefs, 'reviewPlan.reviewCaseRefs', { minItems: 1 });

  const request = object(value.reviewRequest, 'reviewRequest');
  if (request.reviewEpochRef !== epoch.reviewEpochRef) throw new Error('reviewRequest epoch mismatch');
  if (request.reviewRequestRef !== epoch.reviewRequestRef) throw new Error('reviewRequest identity mismatch');
  uniqueStrings(request.reviewCaseRefs, 'reviewRequest.reviewCaseRefs', { minItems: 1 });
  uniqueStrings(request.captureRequestRefs, 'reviewRequest.captureRequestRefs', { minItems: 1 });

  if (!Array.isArray(value.reviewCases) || value.reviewCases.length === 0) throw new Error('reviewCases requires at least one item');
  const caseByRef = new Map();
  for (const [index, rawCase] of value.reviewCases.entries()) {
    const reviewCase = validateReviewCase(rawCase, index);
    if (caseByRef.has(reviewCase.reviewCaseRef)) throw new Error(`Duplicate review case ref: ${reviewCase.reviewCaseRef}`);
    caseByRef.set(reviewCase.reviewCaseRef, reviewCase);
  }

  if (!Array.isArray(value.captureRequests) || value.captureRequests.length === 0) throw new Error('captureRequests requires at least one item');
  const captureByRef = new Map();
  for (const rawCapture of value.captureRequests) {
    const capture = validateCaptureRequest(rawCapture);
    if (capture.reviewEpochRef !== epoch.reviewEpochRef) throw new Error('Capture epoch mismatch');
    if (!caseByRef.has(capture.reviewCaseRef)) throw new Error(`Unknown review case: ${capture.reviewCaseRef}`);
    if (captureByRef.has(capture.captureRequestRef)) throw new Error(`Duplicate capture ref: ${capture.captureRequestRef}`);
    captureByRef.set(capture.captureRequestRef, capture);
  }

  for (const ref of request.reviewCaseRefs) if (!caseByRef.has(ref)) throw new Error(`Unknown review case ref: ${ref}`);
  for (const ref of request.captureRequestRefs) if (!captureByRef.has(ref)) throw new Error(`Unknown capture ref: ${ref}`);

  return { bundle: value, epoch, reviewPlan: plan, reviewRequest: request, caseByRef, captureByRef };
}

export function screenshotEvidenceFilename({ slug, localeRef, themeRef, viewport }) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(string(slug, 'slug'))) throw new Error('slug must be lowercase kebab-case');
  if (!Number.isInteger(viewport) || viewport < 1) throw new TypeError('viewport must be positive integer');
  return `${slug}-${localeCode(localeRef)}-${themeCode(themeRef)}-${viewport}.png`;
}

export function buildSparseBrowserCapturePlan(bundle, bindings = []) {
  const validated = validateReviewRequestBundle(bundle);
  if (!Array.isArray(bindings)) throw new TypeError('bindings must be an array');
  const bindingByCaptureRef = new Map();
  for (const binding of bindings) {
    object(binding, 'browser binding');
    const ref = string(binding.captureRequestRef, 'browser binding captureRequestRef');
    if (bindingByCaptureRef.has(ref)) throw new Error(`Duplicate browser binding for ${ref}`);
    bindingByCaptureRef.set(ref, binding);
  }

  const tasks = [];
  for (const ref of validated.reviewRequest.captureRequestRefs) {
    const capture = validated.captureByRef.get(ref);
    if (capture.platformRef !== 'platform.browser') continue;
    const binding = bindingByCaptureRef.get(ref);
    if (!binding) throw new Error(`Missing browser binding for ${ref}`);
    if (!binding.viewport || !Number.isInteger(binding.viewport.width) || binding.viewport.width < 1) {
      throw new Error(`Browser binding ${ref} requires a positive integer viewport.width`);
    }
    for (const stepRef of capture.captureAtStepRefs) {
      const step = capture.steps.find((candidate) => candidate.reviewStepRef === stepRef);
      const slug = binding.artifactSlugs?.[stepRef];
      tasks.push({
        taskRef: `browser-task.${ref}.${stepRef}`,
        captureRequest: capture,
        step,
        binding,
        artifactFileName: screenshotEvidenceFilename({
          slug,
          localeRef: capture.localeRef,
          themeRef: capture.themeRef,
          viewport: binding.viewport.width
        })
      });
    }
  }
  return {
    planRef: `sparse-browser-plan.${validated.reviewRequest.reviewRequestRef}`,
    matrixPolicy: 'EXPLICIT_CAPTURE_REQUESTS_ONLY',
    automaticCartesianExpansion: false,
    tasks
  };
}

function validatePortableArtifact(artifact) {
  const value = object(artifact, 'artifact');
  const keys = Object.keys(value).sort();
  const expectedKeys = ['artifactRef', 'mediaType', 'sha256'];
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error('Captured artifact must contain only artifactRef, sha256, and mediaType');
  }
  string(value.artifactRef, 'artifact.artifactRef');
  if (!/^[a-f0-9]{64}$/.test(value.sha256 ?? '')) throw new Error('artifact.sha256 must be lowercase SHA-256');
  string(value.mediaType, 'artifact.mediaType');
  return value;
}

export function createExperienceReviewEvidence({
  task,
  adapterRef,
  adapterVersionRef,
  captureState,
  observedAt,
  artifact = null,
  unsupportedCapabilities = [],
  deviations = [],
  limitations = [],
  doesNotProve = []
}) {
  object(task, 'task');
  const capture = object(task.captureRequest, 'task.captureRequest');
  const step = object(task.step, 'task.step');
  if (!['CAPTURED', 'UNSUPPORTED', 'FAILED_SAFE'].includes(captureState)) {
    throw new Error(`Unsupported captureState: ${captureState}`);
  }
  if (!Array.isArray(limitations)) throw new TypeError('limitations must be an array');
  if (!Array.isArray(deviations)) throw new TypeError('deviations must be an array');
  if (!Array.isArray(unsupportedCapabilities)) throw new TypeError('unsupportedCapabilities must be an array');
  if (!Array.isArray(doesNotProve) || doesNotProve.length === 0) {
    throw new Error('doesNotProve must contain at least one explicit non-proof boundary');
  }
  if (captureState === 'UNSUPPORTED' && unsupportedCapabilities.length === 0) {
    throw new Error('UNSUPPORTED evidence must name at least one unsupported capability');
  }
  if (captureState === 'CAPTURED' && capture.truthClass === 'ARCHITECTURAL_TARGET_ONLY') {
    throw new Error('ARCHITECTURAL_TARGET_ONLY cannot be represented as captured implementation evidence');
  }
  const portableArtifact = captureState === 'CAPTURED' ? validatePortableArtifact(artifact) : null;
  if (captureState !== 'CAPTURED' && artifact !== null && artifact !== undefined) {
    throw new Error(`${captureState} evidence must not carry an artifact`);
  }

  return {
    evidenceRef: `review-evidence.${capture.captureRequestRef}.${step.reviewStepRef}`,
    captureRequestRef: capture.captureRequestRef,
    reviewEpochRef: capture.reviewEpochRef,
    reviewCaseRef: capture.reviewCaseRef,
    reviewStepRef: step.reviewStepRef,
    platformRef: capture.platformRef,
    adapterRef: string(adapterRef, 'adapterRef'),
    adapterVersionRef: string(adapterVersionRef, 'adapterVersionRef'),
    sourceVersionRef: capture.sourceVersionRef,
    truthClass: capture.truthClass,
    observedAt: string(observedAt, 'observedAt'),
    captureState,
    artifact: portableArtifact,
    limitations,
    doesNotProve,
    adapterReceipt: {
      requestSatisfied: captureState === 'CAPTURED',
      unsupportedCapabilities,
      deviations
    }
  };
}

export function createReviewViewerModel(bundle, evidence, { interactiveEntries = [], artifactLocations = {} } = {}) {
  const validated = validateReviewRequestBundle(bundle);
  if (!Array.isArray(evidence)) throw new TypeError('evidence must be an array');
  object(artifactLocations, 'artifactLocations');
  const entries = [];

  for (const record of evidence) {
    if (record.captureState !== 'CAPTURED' || !record.artifact?.artifactRef) continue;
    const capture = validated.captureByRef.get(record.captureRequestRef);
    if (!capture) throw new Error(`Evidence references unknown capture request: ${record.captureRequestRef}`);
    const reviewCase = validated.caseByRef.get(capture.reviewCaseRef);
    const artifactPath = safeArtifactPath(artifactLocations[record.artifact.artifactRef], `artifactLocations.${record.artifact.artifactRef}`);
    entries.push({
      kind: 'SCREENSHOT',
      label: reviewCase.title || reviewCase.reviewQuestion || reviewCase.reviewCaseRef,
      artifactPath,
      locale: dimension(capture.localeRef, 'locale.'),
      theme: dimension(capture.themeRef, 'theme.'),
      device: dimension(capture.deviceProfileRef, 'device.'),
      platform: dimension(capture.platformRef, 'platform.'),
      truthClass: record.truthClass
    });
  }

  for (const entry of interactiveEntries) {
    entries.push({
      kind: 'INTERACTIVE_HTML',
      label: string(entry.label, 'interactive entry label'),
      artifactPath: safeArtifactPath(entry.artifactPath, 'interactive entry artifactPath'),
      locale: entry.locale || '',
      theme: entry.theme || '',
      device: entry.device || '',
      platform: entry.platform || 'browser',
      truthClass: entry.truthClass || validated.epoch.truthClass
    });
  }

  const values = (key) => [...new Set(entries.map((entry) => entry[key]).filter(Boolean))].sort();
  return {
    reviewEpochRef: validated.epoch.reviewEpochRef,
    title: bundle.package?.title || 'VexLife Experience Review',
    entries,
    selectors: {
      kind: values('kind'),
      locale: values('locale'),
      theme: values('theme'),
      device: values('device'),
      platform: values('platform')
    }
  };
}

export function renderStartHereHtml(viewerModel) {
  const model = object(viewerModel, 'viewerModel');
  const payload = JSON.stringify(model).replaceAll('<', '\\u003c');
  const title = htmlEscape(model.title || 'VexLife Experience Review');
  return `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VexLife Review</title><style>body{font:16px system-ui;margin:20px;background:#111;color:#eee}button{margin:4px;padding:8px}#stage{min-height:320px;border:1px solid #555;display:grid;place-items:center}img,iframe{max-width:100%;width:100%;border:0}iframe{height:75vh}</style><h1>${title}</h1><p>One stage at a time. Selectors swap the same surface.</p><div id="tools"></div><div id="stage"></div><script>const M=${payload},S={},T=document.querySelector('#tools'),G=document.querySelector('#stage');function draw(){const e=M.entries.find(e=>Object.entries(S).every(([k,v])=>!v||e[k]===v))||M.entries[0];G.replaceChildren();if(!e)return G.textContent='No captured evidence';const n=document.createElement(e.kind==='INTERACTIVE_HTML'?'iframe':'img');n.src=e.artifactPath;G.append(n)}for(const[k,vs]of Object.entries(M.selectors))for(const v of vs){const b=document.createElement('button');b.textContent=k+': '+v;b.onclick=()=>{S[k]=S[k]===v?'':v;draw()};T.append(b)}draw()</script></html>`;
}

export function buildReviewPackageTextFiles(bundle, evidence, receipt, options = {}) {
  const validated = validateReviewRequestBundle(bundle);
  const captured = evidence.filter((record) => record.captureState === 'CAPTURED').length;
  const files = {
    'START-HERE.html': renderStartHereHtml(createReviewViewerModel(bundle, evidence, options)),
    'REVIEW.md': `# ${bundle.package?.title || 'VexLife Experience Review'}\n\nReview epoch: \`${validated.epoch.reviewEpochRef}\`\n\nCaptured evidence: **${captured}/${evidence.length}**\n\nOpen \`START-HERE.html\`.\n`,
    'FEEDBACK.md': `# Human feedback\n\nReview epoch: \`${validated.epoch.reviewEpochRef}\`\n\nWrite naturally; no severity/owner/lens classification is required.\n\n## What felt right?\n\n## What confused or surprised you?\n\n## What did you expect instead?\n\n## Anything Vex should preserve?\n`,
    'review-request.json': `${JSON.stringify(bundle, null, 2)}\n`,
    'review-evidence.json': `${JSON.stringify(evidence, null, 2)}\n`,
    'source-receipt.json': `${JSON.stringify(receipt, null, 2)}\n`
  };

  const notCurrent = new Map();
  if (validated.epoch.truthClass !== 'CURRENT_ACCEPTED_IMPLEMENTATION') {
    notCurrent.set(validated.epoch.reviewEpochRef, validated.epoch.truthClass);
  }
  for (const reviewCase of bundle.reviewCases) {
    if (reviewCase.truthClass !== 'CURRENT_ACCEPTED_IMPLEMENTATION') {
      notCurrent.set(reviewCase.reviewCaseRef, reviewCase.truthClass);
    }
  }
  for (const record of evidence) {
    if (record.truthClass !== 'CURRENT_ACCEPTED_IMPLEMENTATION') {
      notCurrent.set(record.evidenceRef, record.truthClass);
    }
  }
  if (notCurrent.size) {
    files['KNOWN-NOT-CURRENT.md'] = '# Known not-current material\n\n'
      + [...notCurrent.entries()].map(([ref, truthClass]) => `- \`${ref}\` — **${truthClass}**`).join('\n')
      + '\n\nDo not interpret proposal/synthetic/candidate/target evidence as current implementation.\n';
  }
  return files;
}

// [VXG RealForever]
