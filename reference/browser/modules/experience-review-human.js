export const HUMAN_REVIEW_SCHEMA_VERSION = 'vexlife.experience-review.human-continuity/v1';

const htmlEscape = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const text = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
};

const localReviewUrl = (value, name) => {
  const url = text(value, name);
  if (/^javascript:/i.test(url) || /^data:/i.test(url)) throw new Error(`${name} must not be an executable URL`);
  if (/^https?:\/\//i.test(url)) {
    const parsed = new URL(url);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
      throw new Error(`${name} must remain local to the review host`);
    }
    return url;
  }
  if (!url.startsWith('/') && !url.startsWith('./')) throw new Error(`${name} must be a local absolute or relative review path`);
  return url;
};

export function validateHumanReviewContext(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('human review context must be an object');
  if (input.schemaVersion !== HUMAN_REVIEW_SCHEMA_VERSION) throw new Error('Unsupported human review context schema');

  const current = input.current;
  const baseline = input.baseline;
  const evidence = input.machineEvidence;
  const handoff = input.handoff;
  for (const [value, name] of [[current, 'current'], [baseline, 'baseline'], [evidence, 'machineEvidence'], [handoff, 'handoff']]) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  }

  const state = text(evidence.state, 'machineEvidence.state');
  if (!['PASS', 'PARTIAL', 'UNKNOWN'].includes(state)) throw new Error(`Unsupported machine evidence state: ${state}`);
  if (!Number.isInteger(evidence.caseCount) || evidence.caseCount < 0) throw new TypeError('machineEvidence.caseCount must be a non-negative integer');
  if (handoff.explorerWillOpen !== true) throw new Error('handoff.explorerWillOpen must be true for this browser review shell');

  return {
    schemaVersion: HUMAN_REVIEW_SCHEMA_VERSION,
    reviewEpochRef: text(input.reviewEpochRef, 'reviewEpochRef'),
    current: {
      title: text(current.title, 'current.title'),
      sourceVersionRef: text(current.sourceVersionRef, 'current.sourceVersionRef'),
      url: localReviewUrl(current.url, 'current.url')
    },
    baseline: {
      title: text(baseline.title, 'baseline.title'),
      artifactRef: text(baseline.artifactRef, 'baseline.artifactRef'),
      url: localReviewUrl(baseline.url, 'baseline.url'),
      explanation: text(baseline.explanation, 'baseline.explanation')
    },
    machineEvidence: { state, caseCount: evidence.caseCount },
    reviewQuestion: text(input.reviewQuestion, 'reviewQuestion'),
    contextSentence: text(input.contextSentence, 'contextSentence'),
    submitPath: localReviewUrl(input.submitPath || '/submit', 'submitPath'),
    handoff: {
      returnFilename: text(handoff.returnFilename, 'handoff.returnFilename'),
      explorerWillOpen: true
    }
  };
}

export function renderHumanContinuityReviewHtml(input) {
  const context = validateHumanReviewContext(input);
  const payload = JSON.stringify(context).replaceAll('<', '\\u003c');
  const currentTitle = htmlEscape(context.current.title);
  const currentRef = htmlEscape(context.current.sourceVersionRef);
  const baselineTitle = htmlEscape(context.baseline.title);
  const baselineExplanation = htmlEscape(context.baseline.explanation);
  const question = htmlEscape(context.reviewQuestion);
  const contextSentence = htmlEscape(context.contextSentence);
  const returnFilename = htmlEscape(context.handoff.returnFilename);

  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VexLife human review</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#091018;color:#f3f7fa}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#091018;color:#f3f7fa}button,textarea,input{font:inherit}button{min-height:44px}
header{padding:18px 22px;border-bottom:1px solid #314151;background:#0f1821}.eyebrow{font-size:12px;letter-spacing:.12em;color:#8da3b5;font-weight:800}.headline{margin:4px 0 6px;font-size:24px}.context{margin:0;max-width:900px;color:#b8c7d2;line-height:1.5}
main{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(340px,.7fr);height:calc(100vh - 112px)}.stage{min-width:0;display:flex;flex-direction:column}.stagebar{display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid #314151;background:#0c141c}.stagebar button{border:1px solid #425668;border-radius:10px;background:#162433;color:#dfe8ef;padding:0 14px;font-weight:750}.stagebar button[aria-pressed="true"]{background:#72a8ff;color:#071019;border-color:#72a8ff}.ref{margin-left:auto;color:#7f93a4;font:12px ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:45%}iframe{width:100%;flex:1;border:0;background:#111}
.panel{overflow:auto;padding:20px 22px;border-left:1px solid #314151;background:#101923}.panel h2{font-size:18px;margin:0 0 8px}.decision{padding:15px;border:1px solid #38516a;border-radius:14px;background:#111f2c;margin-bottom:18px}.decision strong{display:block;font-size:18px;margin-bottom:7px}.note{color:#a9bbc8;line-height:1.5;font-size:14px}.quiet{padding:12px 14px;border-radius:12px;background:#0c141c;color:#9fb2c0;margin:14px 0}.baseline-note{display:none;padding:12px 14px;border:1px solid #425668;border-radius:12px;color:#b7c7d2;margin:10px 0 18px}.baseline-note.is-visible{display:block}
fieldset{border:0;padding:0;margin:0 0 16px}legend{font-weight:800;margin-bottom:7px}label.choice{display:block;padding:7px 0;color:#d9e3ea}textarea{width:100%;min-height:92px;padding:10px 12px;border:1px solid #425668;border-radius:10px;background:#091018;color:#f3f7fa;resize:vertical}label.prompt{display:block;margin:14px 0 6px;font-weight:750}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.primary{border:0;border-radius:10px;background:#72a8ff;color:#071019;font-weight:850;padding:0 18px}.secondary{border:1px solid #425668;border-radius:10px;background:#172431;color:#e5edf2;padding:0 15px}.status{margin-top:12px;padding:11px 13px;border-radius:10px;background:#162433;color:#cbd9e2}.complete{display:none;margin-top:12px;padding:16px;border-radius:12px;background:#123020;border:1px solid #2c7450}.complete.is-visible{display:block}.complete strong{display:block;margin-bottom:5px}
@media(max-width:920px){main{display:block;height:auto}.stage{height:66vh}.panel{border-left:0;border-top:1px solid #314151}.ref{display:none}}
</style>
<header>
  <div class="eyebrow">ONE CURRENT OBJECT · HUMAN DIRECTION REVIEW</div>
  <h1 class="headline">You are reviewing: ${currentTitle}</h1>
  <p class="context">${contextSentence}</p>
</header>
<main>
  <section class="stage" aria-label="Review surface">
    <div class="stagebar">
      <button id="showCurrent" aria-pressed="true">Current VexLife</button>
      <button id="showBaseline" aria-pressed="false">Why E2.7?</button>
      <span class="ref" id="sourceRef">${currentRef}</span>
    </div>
    <iframe id="reviewFrame" src="${htmlEscape(context.current.url)}" title="Current accepted VexLife"></iframe>
  </section>
  <section class="panel">
    <div class="decision">
      <strong>What am I deciding?</strong>
      <div>${question}</div>
    </div>
    <div class="quiet">Technical checks already ran (${context.machineEvidence.caseCount} supporting cases, state ${htmlEscape(context.machineEvidence.state)}). You do <strong>not</strong> need to review those cases individually.</div>
    <div class="baseline-note" id="baselineNote"><strong>${baselineTitle}</strong><br>${baselineExplanation}</div>
    <fieldset>
      <legend>Closest reaction</legend>
      <label class="choice"><input type="radio" name="overall" value="DIRECTION_FEELS_RIGHT"> The current direction feels right</label>
      <label class="choice"><input type="radio" name="overall" value="DIRECTION_NEEDS_CHANGE"> The current direction needs changes</label>
      <label class="choice"><input type="radio" name="overall" value="UNSURE"> I’m not sure yet</label>
    </fieldset>
    <label class="prompt" for="change">What should change in the current VexLife?</label>
    <textarea id="change" placeholder="Write naturally. You do not need to classify the issue."></textarea>
    <label class="prompt" for="preserve">What should stay or be preserved?</label>
    <textarea id="preserve"></textarea>
    <label class="prompt" for="extra">Anything else?</label>
    <textarea id="extra"></textarea>
    <div class="actions"><button class="primary" id="submit">Submit review</button><button class="secondary" id="stop">Stop without a decision</button></div>
    <div class="status" id="status">Review the current VexLife first. Open “Why E2.7?” only when that reference helps explain your expectation.</div>
    <div class="complete" id="complete"><strong>Handoff complete.</strong>Your return is being packaged as <code>${returnFilename}</code>. Explorer will open/select it automatically. This review window will close if the browser permits it.</div>
  </section>
</main>
<script>
const C=${payload};
const frame=document.querySelector('#reviewFrame'),currentButton=document.querySelector('#showCurrent'),baselineButton=document.querySelector('#showBaseline'),sourceRef=document.querySelector('#sourceRef'),baselineNote=document.querySelector('#baselineNote'),status=document.querySelector('#status'),complete=document.querySelector('#complete');
function show(kind){
 const baseline=kind==='baseline';
 frame.src=baseline?C.baseline.url:C.current.url;
 frame.title=baseline?'E2.7 experience-intention reference':'Current accepted VexLife';
 currentButton.setAttribute('aria-pressed',String(!baseline));baselineButton.setAttribute('aria-pressed',String(baseline));
 sourceRef.textContent=baseline?C.baseline.artifactRef:C.current.sourceVersionRef;
 baselineNote.classList.toggle('is-visible',baseline);
}
currentButton.onclick=()=>show('current');baselineButton.onclick=()=>show('baseline');
async function send(mode){
 const overall=document.querySelector('input[name=overall]:checked')?.value||'';
 if(mode==='SUBMIT'&&!overall){status.textContent='Choose the closest reaction first.';return;}
 const payload={mode,overall,change:change.value,preserve:preserve.value,extra:extra.value,reviewEpochRef:C.reviewEpochRef,submittedAt:new Date().toISOString()};
 status.textContent='Submitting review and preparing the handoff…';
 let response;
 try{response=await fetch(C.submitPath,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});}catch(error){status.textContent=`Submission failed: ${error.message}`;return;}
 if(!response.ok){status.textContent='Submission failed. Keep this window open and try again.';return;}
 document.querySelectorAll('button,textarea,input').forEach((element)=>element.disabled=true);
 complete.classList.add('is-visible');status.textContent='Submitted successfully. Explorer is opening the canonical return ZIP.';
 setTimeout(()=>{try{window.close();}catch{}},700);
 setTimeout(()=>{if(!window.closed){document.body.dataset.handoffComplete='true';}},1400);
}
document.querySelector('#submit').onclick=()=>send('SUBMIT');document.querySelector('#stop').onclick=()=>send('STOP_NO_DECISION');
</script>
</html>`;
}

// [VXG RealForever]
