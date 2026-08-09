export const PORTABLE_CONTRACT_REF='contract.vextreme.experience-review.portable.v0';
export const PORTABLE_SCHEMA_VERSION='vextreme.experience-review.portable-contract/v0';
export const VEXLIFE_REVIEW_REQUEST_SCHEMA='vexlife.experience-review.request/v0';
export const TRUTH_CLASSES=Object.freeze(['CURRENT_ACCEPTED_IMPLEMENTATION','CURRENT_SYNTHETIC_REFERENCE','IN_FLIGHT_CANDIDATE','ARCHITECTURAL_TARGET_ONLY','A_B_VARIANT_PROPOSAL']);
const truth=new Set(TRUTH_CLASSES);
const forbidden=new Set(['selector','playwrightSelector','pageUrl','url','browserCommand','shellCommand','executable','captureFunction','backendCommand']);

function obj(v,n){if(!v||typeof v!=='object'||Array.isArray(v))throw new TypeError(`${n} must be an object`);return v}
function str(v,n){if(typeof v!=='string'||!v.trim())throw new TypeError(`${n} must be a non-empty string`);return v}
function uniq(a,n){if(new Set(a).size!==a.length)throw new Error(`${n} contains duplicate refs`)}
function scan(v,p='captureRequest'){if(!v||typeof v!=='object')return null;for(const[k,x]of Object.entries(v)){if(forbidden.has(k))return`${p}.${k}`;const f=scan(x,`${p}.${k}`);if(f)return f}return null}
function locale(ref){const m=str(ref,'localeRef').match(/^locale\.([a-z]{2})$/u);if(!m)throw new Error(`Unsupported localeRef: ${ref}`);return m[1]}
function theme(ref){const v=str(ref,'themeRef').replace(/^theme\./u,'');if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(v))throw new Error(`Unsupported themeRef: ${ref}`);return v}
function esc(v){return String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;")}
function dim(ref,prefix){return typeof ref==='string'&&ref.startsWith(prefix)?ref.slice(prefix.length):ref||''}

function validateCapture(c){
  obj(c,'captureRequest');
  for(const k of ['captureRequestRef','reviewEpochRef','reviewCaseRef','platformRef','experienceProfileRef','routeRef','initialStateRef','deviceProfileRef','sourceVersionRef'])str(c[k],`captureRequest.${k}`);
  locale(c.localeRef);theme(c.themeRef);if(!truth.has(c.truthClass))throw new Error(`Unknown truthClass: ${c.truthClass}`);
  if(!Array.isArray(c.steps)||!Array.isArray(c.captureAtStepRefs))throw new TypeError('captureRequest steps/captureAtStepRefs must be arrays');
  uniq(c.captureAtStepRefs,'captureAtStepRefs');const refs=new Set();
  c.steps.forEach((s,i)=>{obj(s,`steps[${i}]`);for(const k of ['reviewStepRef','actionRef','targetNodeRef','expectedStateRef'])str(s[k],`steps[${i}].${k}`);if(!Number.isInteger(s.sequence)||s.sequence<0)throw new TypeError('step.sequence must be a non-negative integer');if(refs.has(s.reviewStepRef))throw new Error(`Duplicate reviewStepRef: ${s.reviewStepRef}`);refs.add(s.reviewStepRef)});
  for(const r of c.captureAtStepRefs)if(!refs.has(r))throw new Error(`captureAtStepRef missing from steps: ${r}`);
  const f=scan(c);if(f)throw new Error(`Renderer/backend field is forbidden inside portable ExperienceCaptureRequest: ${f}`);
  return c
}

export function validateReviewRequestBundle(b){
  obj(b,'bundle');if(b.schemaVersion!==VEXLIFE_REVIEW_REQUEST_SCHEMA)throw new Error(`Unsupported VexLife review request schema: ${b.schemaVersion}`);
  if(b.portableContractRef!==PORTABLE_CONTRACT_REF)throw new Error(`Portable contract mismatch: ${b.portableContractRef}`);
  if(b.portableSchemaVersionRef!==PORTABLE_SCHEMA_VERSION)throw new Error(`Portable schema mismatch: ${b.portableSchemaVersionRef}`);
  const e=obj(b.reviewEpoch,'reviewEpoch');str(e.reviewEpochRef,'reviewEpochRef');str(e.sourceVersionRef,'sourceVersionRef');if(!truth.has(e.truthClass))throw new Error(`Unknown epoch truthClass: ${e.truthClass}`);if(e.truthClass==='A_B_VARIANT_PROPOSAL'&&!e.baselineReviewEpochRef)throw new Error('A_B_VARIANT_PROPOSAL requires baselineReviewEpochRef');
  const r=obi(b.reviewRequest,'reviewRequest');str(r.reviewRequestRef,'reviewRequestRef');if(r.reviewEpochRef!==e.reviewEpochRef)throw new Error('reviewRequest epoch mismatch');if(!Array.isArray(r.reviewCaseRefs)||!Array.isArray(r.captureRequestRefs))throw new TypeError('review request refs must be arrays');uniq(r.reviewCaseRefs,'reviewCaseRefs');uniq(r.captureRequestRefs,'captureRequestRefs');
  if(!Array.isArray(b.reviewCases)||!Array.isArray(b.captureRequests))throw new TypeError('reviewCases/captureRequests must be arrays');
  const cases=new Map(b.reviewCases.map(c=>{obj(c,'reviewCase');str(c.reviewCaseRef,'reviewCaseRef');if(!truth.has(c.truthClass))throw new Error(`Unknown case truthClass: ${c.truthClass}`);return[c.reviewCaseRef,c]}));
  const captures=new Map();for(const c of b.captureRequests){validateCapture(c);if(c.reviewEpochRef!==e.reviewEpochRef)throw new Error(`Capture epoch mismatch: ${c.captureRequestRef}`);if(!cases.has(c.reviewCaseRef))throw new Error(`Unknown review case: ${c.reviewCaseRef}`);if(captures.has(c.captureRequestRef))throw new Error(`Duplicate captureRequestRef: ${c.captureRequestRef}`);captures.set(c.captureRequestRef,c)}
  for(const x of r.reviewCaseRefs)if(!cases.has(x))throw new Error(`Unknown review case ref: ${x}`);for(const x of r.captureRequestRefs)if(!captures.has(x))throw new Error(`Unknown capture ref: ${x}`);
  return{bundle:b,epoch:e,reviewRequest:r,caseByRef:cases,captureByRef:captures}
}

export function screenshotEvidenceFilename({slug,localeRef,themeRef,viewport}){
  str(slug,'slug');if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug))throw new Error('slug must be lowercase kebab-case');if(!Number.isInteger(viewport)||viewport<1)throw new TypeError('viewport must be positive integer');
  return`${slug}-${locale(localeRef)}-${theme(themeRef)}-${viewport}.png`
}

export function buildSparseBrowserCapturePlan(bundle,bindings=[]){
  const v=validateReviewRequestBundle(bundle);if(!Array.isArray(bindings))throw new TypeError('browserBindings must be an array');const map=new Map();
  for(const x of bindings){obj(x,'browserBinding');str(x.captureRequestRef,'captureRequestRef');str(x.pageUrl,'pageUrl');obj(x.viewport,'viewport');if(!Number.isInteger(x.viewport.width)||!Number.isInteger(x.viewport.height))throw new TypeError('viewport width/height must be integers');if(map.has(x.captureRequestRef))throw new Error(`Duplicate browser binding: ${x.captureRequestRef}`);map.set(x.captureRequestRef,x)}
  const tasks=[];for(const ref of v.reviewRequest.captureRequestRefs){const c=v.captureByRef.get(ref);if(c.platformRef!=='platform.browser')continue;const b=map.get(ref);if(!b)throw new Error(`Missing browser binding for ${ref}`);for(const stepRef of c.captureAtStepRefs){const step=c.steps.find(s=>s.reviewStepRef===stepRef);const slug=b.artifactSlugs?.[stepRef];str(slug,`artifactSlugs.${stepRef}`);tasks.push({taskRef:`browser-task.${ref}.${stepRef}`,captureRequest:c,step,binding:b,artifactFileName:screenshotEvidenceFilename({slug,localeRef:c.localeRef,themeRef:c.themeRef,viewport:b.viewport.width})})}}
  return{planRef:`sparse-browser-plan.${v.reviewRequest.reviewRequestRef}`,matrixPolicy:'EXPLICIT_CAPTURE_REQUESTS_ONLY',automaticCartesianExpansion:false,tasks}
}

export function createExperienceReviewEvidence({task,adapterRef,adapterVersionRef,captureState,observedAt,artifact=null,unsupportedCapabilities=[],deviations=[],limitations=[],doesNotProve=[]}){
  obj(task,'task');if(!['CAPTURED','UNSUPPORTED','FAILED_SAFE'].includes(captureState))throw new Error(`Unsupported captureState: ${captureState}`);if((captureState==='CAPTURED')!==!!artifact)throw new Error(`${captureState} artifact mismatch`);
  const c=task.captureRequest,s=task.step;return{evidenceRef:`review-evidence.${c.captureRequestRef}.${s.reviewStepRef}`,captureRequestRef:c.captureRequestRef,reviewEpochRef:c.reviewEpochRef,reviewCaseRef:c.reviewCaseRef,reviewStepRef:s.reviewStepRef,platformRef:c.platformRef,adapterRef:str(adapterRef,'adapterRef'),adapterVersionRef:str(adapterVersionRef,'adapterVersionRef'),sourceVersionRef:c.sourceVersionRef,truthClass:c.truthClass,observedAt:str(observedAt,'observedAt'),captureState,artifact,limitations:[...limitations],doesNotProve:[...doesNotProve],adapterReceipt:{requestSatisfied:captureState==='CAPTURED',unsupportedCapabilities:[...unsupportedCapabilities],deviations:[...deviations]}}
}

export function createReviewViewerModel(bundle,evidence,{interactiveEntries=[]}={}){
  const v=validateReviewRequestBundle(bundle);const entries=[];
  for(const x of evidence){if(x.captureState!=='CAPTURED'||!x.artifact?.path)continue;const c=v.captureByRef.get(x.captureRequestRef),rc=v.caseByRef.get(c.reviewCaseRef);entries.push({kind:'SCREENSHOT',label:rc.title||rc.reviewQuestion||rc.reviewCaseRef,artifactPath:x.artifact.path,locale:dim(c.localeRef,'locale.'),theme:dim(c.themeRef,'theme.'),device:dim(c.deviceProfileRef,'device.'),platform:dim(c.platformRef,"platform."),truthClass:x.truthClass})}
  for(const x of interactiveEntries){obj(x,'interactiveEntry');entries.push({kind:'INTERACTIVE_HTML',label:str(x.label,'label'),artifactPath:str(x.artifactPath,'artifactPath'),locale:x.locale||'',theme:x.theme||'',device:x.device||'',platform:x.platform||'browser',truthClass:x.truthClass||v.epoch.truthClass})}
  const values=k=>[...new Set(entries.map(x=>x[k]).filter(Boolean))].sort();return{reviewEpochRef:v.epoch.reviewEpochRef,title:bundle.package?.title||'VexLife Experience Review',entries,selectors:{kind:values('kind'),locale:values('locale'),theme:values('theme'),device:values('device'),platform:values('platform')}}
}

export function renderStartHereHtml(m){
  obj(m,'viewerModel');const payload=JSON.stringify(m).replaceAll('<','\\u003c'),title=esc(m.title||'VexLife Experience Review');
  return`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#0d0f12;color:#f4f5f7}*{box-sizing:border-box}body{margin:0}.shell{max-width:1500px;margin:auto;padding:24px}h1{font-size:clamp(28px,4vw,52px)}.toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0}.g{display:flex;gap:5px;align-items:center;border:1px solid #343941;border-radius:12px;padding:5px}.g span{font:700 10px monospace;color:#9299a5;text-transform:uppercase}.g button{border:0;border-radius:8px;padding:8px;background:transparent;color:#ccd0d6}.g button.on{background:#fff;color:#111}.stage{border:1px solid #343941;border-radius:16px;overflow:hidden}.head{display:flex;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #343941}.body{display:grid;place-items:center;min-height:300px;background:#090b0e}.body img{max-width:100%}.body iframe{width:100%;height:min(78vh,900px);border:0;background:#fff}.truth{font:700 10px monospace}.sub{color:#aab0ba}</style></head><body><main class="shell"><h1>${title}</h1><p class="sub">One stage at a time. Selectors swap the same surface; screenshots are explicit receipts, not a Cartesian wall.</p><div id="toolbar" class="toolbar"></div><section class="stage"><div class="head"><span id="label"></span><span id="truth" class="truth"></span></div><div id="stage" class="body"></div></section></main><script>const M=${payload},S={kind:"",locale:"",theme:"",device:"",platform:""},T=document.querySelector("#toolbar"),G=document.querySelector("#stage"),L=document.querySelector("#label"),R=document.querySelector("#truth");function pick(){return M.entries.find(e=>Object.entries(S).every(([k,v])=>!v||e[k]===v))||M.entries[0]}function stage(){const e=pick();G.replaceChildren();if(!e){G.textContent="No captured evidence";return}L.textContent=e.label;R.textContent=e.truthClass;const n=document.createElement(e.kind==="INTERACTIVE_HTML"?"iframe":"img");if(e.kind==="INTERACTIVE_HTML"){n.src=e.artifactPath;n.title=e.label}else{n.src=e.artifactPath;n.alt=e.label}G.append(n)}function controls(){T.replaceChildren();for(const k of Object.keys(S)){const vs=M.selectors[k]||[];if(!vs.length)continue;const g=document.createElement("div");g.className="g";const c=document.createElement("span");c.textContent=k;g.append(c);for(const v of vs){const b=document.createElement("button");b.textContent=v;b.classList.toggle("on",S[k]===v);b.onclick=()=>{S[k]=S[k]===v?"":v;controls();stage()};g.append(b)}T.append(g)}}controls();stage();</script></body></html>`
}

export function buildReviewPackageTextFiles(bundle,evidence,sourceReceipt,options={}){
  obj(sourceReceipt,'sourceReceipt');const v=validateReviewRequestBundle(bundle),viewer=createReviewViewerModel(bundle,evidence,options),captured=evidence.filter(x=>x.captureState==='CAPTURED').length;
  const files={'START-HERE.html':renderStartHereHtml(viewer),'REVIEW.md':`# ${bundle.package?.title||'VexLife Experience Review'}\n\nReview epoch: \`${v.epoch.reviewEpochRef}\`\n\nCaptured evidence: **${captured}/${evidence.length}**\n\nOpen \`START-HERE.html\`. Truth/currentness remains attached to each artifact.\n\n[VXG RealForever]\n`,'FEEDBACK.md':`# Human feedback\n\nReview epoch: \`${v.epoch.reviewEpochRef}\`\n\nWrite naturally; no severity/owner/lens classification is required.\n\n## What felt right?\n\n\n## What confused or surprised you?\n\n\n## What did you expect instead?\n\n\n## Anything Vex should preserve?\n\n\n[VXG RealForever]\n`,'review-request.json':`${JSON.stringify(bundle,null,2)}\n`,'review-evidence.json':`${JSON.stringify(evidence,null,2)}\n`,'source-receipt.json':`${JSON.stringify(sourceReceipt,null,2)}\n`};
  const nc=bundle.reviewCases.filter(x=>x.truthClass!=='CURRENT_ACCEPTED_IMPLEMENTATION');if(nc.length)files['KNOWN-NOT-CURRENT.md']=`# Known not-current material\n\n${nc.map(x=>`- \`${x.reviewCaseRef}\` — **${x.truthClass}**`).join('\n')}\n\nDo not interpret proposal/synthetic/candidate/target evidence as current implementation.\n\n[VXG RealForever]\n`;return files
}
// [VXG RealForever]
