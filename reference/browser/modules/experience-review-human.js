export const HUMAN_REVIEW_SCHEMA_VERSION = 'vexlife.experience-review.human-continuity/v1';

export const HUMAN_REVIEW_FRAMING = Object.freeze({
  candidateClass: 'E2.7_ROOTED_CURRENT_CANDIDATE',
  comparatorClass: 'AUTHORITATIVE_E2.7_ROOT',
  currentFirstFraming: false,
  machineEvidenceSubstitutesForHumanConvergence: false
});

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
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) throw new Error(`${name} must remain local to the review host`);
    return url;
  }
  if (!url.startsWith('/') && !url.startsWith('./')) throw new Error(`${name} must be a local absolute or relative review path`);
  return url;
};

export function validateHumanReviewContext(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('human review context must be an object');
  if (input.schemaVersion !== HUMAN_REVIEW_SCHEMA_VERSION) throw new Error('Unsupported human review context schema');
  const { current, baseline, machineEvidence: evidence, handoff } = input;
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
    framing: { ...HUMAN_REVIEW_FRAMING },
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
    handoff: { returnFilename: text(handoff.returnFilename, 'handoff.returnFilename'), explorerWillOpen: true }
  };
}

export function renderHumanContinuityReviewHtml(input) {
  const C = validateHumanReviewContext(input);
  const payload = JSON.stringify(C).replaceAll('<', '\\u003c');
  const candidateTitle = htmlEscape(C.current.title);
  const candidateRef = htmlEscape(C.current.sourceVersionRef);
  const comparatorTitle = htmlEscape(C.baseline.title);
  const comparatorExplanation = htmlEscape(C.baseline.explanation);
  const question = htmlEscape(C.reviewQuestion);
  const contextSentence = htmlEscape(C.contextSentence);
  const returnFilename = htmlEscape(C.handoff.returnFilename);
  return `<!doctype html>
<html lang="en" data-review-framing="E2.7_ROOT_FIRST">
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VexLife E2.7-rooted human convergence review</title>
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#091018;color:#f3f7fa}*{box-sizing:border-box}body{margin:0;background:#091018;color:#f3f7fa}button,textarea,input{font:inherit}button{min-height:44px}header{padding:18px 22px;border-bottom:1px solid #314151;background:#0f1821}.eyebrow{font-size:12px;letter-spacing:.1em;color:#9fb2c0;font-weight:800}.headline{margin:5px 0}.context,.quiet{color:#b8c7d2;line-height:1.5}main{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(330px,.7fr);height:calc(100vh - 112px)}.stage{display:flex;flex-direction:column;min-width:0}.stagebar{display:flex;gap:8px;align-items:center;padding:10px 14px;background:#0c141c;border-bottom:1px solid #314151}.stagebar button{border:1px solid #425668;border-radius:9px;background:#162433;color:#e5edf2;padding:0 12px}.stagebar button[aria-pressed="true"]{background:#72a8ff;color:#071019}.ref{margin-left:auto;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px ui-monospace,monospace;color:#8da3b5}iframe{border:0;flex:1;width:100%;background:#111}.panel{overflow:auto;padding:20px;border-left:1px solid #314151;background:#101923}.decision,.quiet,.comparator-note{padding:12px 14px;border-radius:11px;background:#0c141c;margin-bottom:14px}.decision{border:1px solid #38516a}.comparator-note{display:none;border:1px solid #425668}.comparator-note.is-visible{display:block}fieldset{border:0;padding:0}label.choice{display:block;padding:7px 0}label.prompt{display:block;margin:13px 0 6px;font-weight:700}textarea{width:100%;min-height:82px;background:#091018;color:#f3f7fa;border:1px solid #425668;border-radius:9px;padding:9px}.actions{display:flex;gap:8px;margin-top:14px}.primary,.secondary{border-radius:9px;padding:0 14px}.primary{border:0;background:#72a8ff;color:#071019;font-weight:800}.secondary{border:1px solid #425668;background:#172431;color:#e5edf2}.status,.complete{margin-top:12px;padding:11px 13px;border-radius:10px;background:#162433}.complete{display:none;background:#123020;border:1px solid #2c7450}.complete.is-visible{display:block}@media(max-width:900px){main{display:block;height:auto}.stage{height:64vh}.panel{border-left:0;border-top:1px solid #314151}.ref{display:none}}
</style>
<header><div class="eyebrow">E2.7-ROOTED CURRENT OBJECT - HUMAN CONVERGENCE REVIEW</div>
<h1 class="headline">You are reviewing the E2.7-rooted VexLife candidate: ${candidateTitle}</h1>
<p class="context">${contextSentence}</p></header>
<main>
<section class="stage" aria-label="E2.7-rooted review surface"><div class="stagebar">
<button id="showCurrent" aria-pressed="true">E2.7-rooted candidate</button>
<button id="showBaseline" aria-pressed="false">Authoritative E2.7 root</button>
<span class="ref" id="sourceRef">${candidateRef}</span></div>
<iframe id="reviewFrame" src="${htmlEscape(C.current.url)}" title="E2.7-rooted VexLife candidate"></iframe></section>
<section class="panel">
<div class="decision"><strong>What am I deciding?</strong><div>${question}</div></div>
<div class="quiet">Machine evidence (${C.machineEvidence.caseCount} supporting cases, state ${htmlEscape(C.machineEvidence.state)}) supports technical confidence only. It does <strong>not</strong> decide human design convergence.</div>
<div class="comparator-note" id="comparatorNote"><strong>${comparatorTitle}</strong><br>${comparatorExplanation}</div>
<fieldset><legend>Closest reaction</legend>
<label class="choice"><input type="radio" name="overall" value="DIRECTION_FEELS_RIGHT"> The E2.7-rooted candidate feels aligned</label>
<label class="choice"><input type="radio" name="overall" value="DIRECTION_NEEDS_CHANGE"> The E2.7-rooted candidate needs changes</label>
<label class="choice"><input type="radio" name="overall" value="UNSURE"> I'm not sure yet</label></fieldset>
<label class="prompt" for="change">What should change in this E2.7-rooted candidate?</label><textarea id="change"></textarea>
<label class="prompt" for="preserve">What should stay or be preserved?</label><textarea id="preserve"></textarea>
<label class="prompt" for="extra">Anything else?</label><textarea id="extra"></textarea>
<div class="actions"><button class="primary" id="submit">Submit review</button><button class="secondary" id="stop">Stop without a decision</button></div>
<div class="status" id="status">Review the exact E2.7-rooted candidate first. Open the authoritative E2.7 root only when the sealed design comparator helps.</div>
<div class="complete" id="complete"><strong>Handoff complete.</strong>Your return is being packaged as <code>${returnFilename}</code>. Explorer will open/select it automatically. This review window will close if the browser permits it.</div>
</section></main>
<script>
const C=${payload},frame=document.querySelector('#reviewFrame'),currentButton=document.querySelector('#showCurrent'),baselineButton=document.querySelector('#showBaseline'),sourceRef=document.querySelector('#sourceRef'),comparatorNote=document.querySelector('#comparatorNote'),status=document.querySelector('#status'),complete=document.querySelector('#complete');
function show(kind){const root=kind==='baseline';frame.src=root?C.baseline.url:C.current.url;frame.title=root?'Authoritative E2.7 root comparator':'E2.7-rooted VexLife candidate';currentButton.setAttribute('aria-pressed',String(!root));baselineButton.setAttribute('aria-pressed',String(root));sourceRef.textContent=root?C.baseline.artifactRef:C.current.sourceVersionRef;comparatorNote.classList.toggle('is-visible',root)}
currentButton.onclick=()=>show('current');baselineButton.onclick=()=>show('baseline');
async function send(mode){const overall=document.querySelector('input[name=overall]:checked')?.value||'';if(mode==='SUBMIT'&&!overall){status.textContent='Choose the closest reaction first.';return}const body={mode,overall,change:document.querySelector('#change').value,preserve:document.querySelector('#preserve').value,extra:document.querySelector('#extra').value,reviewEpochRef:C.reviewEpochRef,reviewObjectClass:C.framing.candidateClass,comparatorClass:C.framing.comparatorClass,submittedAt:new Date().toISOString()};status.textContent='Submitting review and preparing the handoff...';let response;try{response=await fetch(C.submitPath,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})}catch(error){status.textContent='Submission failed: '+error.message;return}if(!response.ok){status.textContent='Submission failed. Keep this window open and try again.';return}document.querySelectorAll('button,textarea,input').forEach((element)=>{element.disabled=true});complete.classList.add('is-visible');status.textContent='Submitted successfully. Explorer is opening the canonical return ZIP.';setTimeout(()=>{try{window.close()}catch{}},700);setTimeout(()=>{if(!window.closed)document.body.dataset.handoffComplete='true'},1400)}
document.querySelector('#submit').onclick=()=>send('SUBMIT');document.querySelector('#stop').onclick=()=>send('STOP_NO_DECISION');
</script></html>`;
}

// [VXG RealForever]
