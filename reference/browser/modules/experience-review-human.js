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
  const context = validateHumanReviewContext(input);
  const payload = JSON.stringify(context).replaceAll('<', '\\u003c');
  const candidateTitle = htmlEscape(context.current.title);
  const candidateRef = htmlEscape(context.current.sourceVersionRef);
  const comparatorTitle = htmlEscape(context.baseline.title);
  const comparatorExplanation = htmlEscape(context.baseline.explanation);
  const question = htmlEscape(context.reviewQuestion);
  const contextSentence = htmlEscape(context.contextSentence);
  const returnFilename = htmlEscape(context.handoff.returnFilename);
  return `<!doctype html>
<html lang="en" data-review-framing="E2.7_ROOT_FIRST">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VexLife E2.7-rooted human convergence review</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#091018;color:#f3f7fa}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#091018;color:#f3f7fa}button,textarea,input{font:inherit}button{min-height:44px}header{padding:18px 22px;border-bottom:1px solid #314151;background:#0f1821}.eyebrow{font-size:12px;letter-spacing:.12em;color:#8da3b5;font-weight:800}.headline{margin:4px 0 6px;font-size:24px}.context{margin:0;max-width:900px;color:#b8c7d2;line-height:1.5}main{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(340px,.7fr);height:calc(100vh - 112px)}.stage{min-width:0;display:flex;flex-direction:column}.stagebar{display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid #314151;background:#0c141c}.stagebar button{border:1px solid #425668;border-radius:10px;background:#162433;color:#dfe8ef;padding:0 14px;font-weight:750}.stagebar button[aria-pressed="true"]{background:#72a8ff;color:#071019;border-color:#72a8ff}.ref{margin-left:auto;color:#7f93a4;font:12px ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:45%}iframe{width:100%;flex:1;border:0;background:#111}.panel{overflow:auto;padding:20px 22px;border-left:1px solid #314151;background:#101923}.panel h2{font-size:18px;margin:0 0 8px}.decision{padding:15px;border:1px solid #38516a;border-radius:14px;background:#111f2c;margin-bottom:18px}.decision strong{display:block;font-size:18px;margin-bottom:7px}.quiet{padding:12px 14px;border-radius:12px;background:#0c141c;color:#9fb2c0;margin:14px 0;line-height:1.5}.comparator-note{display:none;padding:12px 14px;border:1px solid #425668;border-radius:12px;color:#b7c7d2;margin:10px 0 18px}.comparator-note.is-visible{display:block}fieldset{border:0;padding:0;margin:0 0 16px}legend{font-weight:800;margin-bottom:7px}label.choice{display:block;padding:7px 0;color:#d9e3ea}textarea{width:100%;min-height:92px;padding:10px 12px;border:1px solid #425668;border-radius:10px;background:#091018;color:#f3f7fa;resize:vertical}label.prompt{display:block;margin:14px 0 6px;font-weight:750}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.primary{border:0;border-radius:10px;background:#72a8ff;color:#071019;font-weight:850;padding:0 18px}.secondary{border:1px solid #425668;border-radius:10px;background:#172431;color:#e5edf2;padding:0 15px}.status{margin-top:12px;padding:11px 13px;border-radius:10px;background:#162433;color:#cbd9e2}.complete{display:none;margin-top:12px;padding:16px;border-radius:12px;background:#123020;border:1px solid #2c7450}.complete.is-visible{display:block}.complete strong{display:block;margin-bottom:5px}@media(max-width:920px){main{display:block;height:auto}.stage{height:66vh}.panel{border-left:0;border-top:1px solid #314151}.ref{display:none}}
</style>
<header>
  <div class="eyebrow">E2.7-ROOTED CURRENT OBJECT Â· HUMAN CONVERGENCE REVIEW</div>
  <h1 class="headline">You are reviewing the E2.7-rooted VexLife candidate: ${candidateTitle}</h1>
  <p class="context">${contextSentence}</p>
</header>
<main>
  <section class="stage" aria-label="E2.7-rooted review pBË ôˆdÈ8Ö¶vVB2Æ6öFSâG·&WGW&äf–ÆVæÖWÓÂö6öFSââW‡Æ÷&W"v–ÆÂ÷Vâ÷6VÆV7B—BWFöÖF–6ÆÇ’âF†—2&Wf–Wrv–æF÷rv–ÆÂ6Æ÷6R–bF†R'&÷w6W"W&Ö—G2—BãÂöF—cà¢Â÷6V7F–öãà£ÂöÖ–ãà£Ç67&—Cà¦6öç7B3ÒG·–ÆöGÓ¶6öç7Bg&ÖSÖFö7VÖVçBçVW'•6VÆV7F÷"‚r7&Wf–Wtg&ÖRr’Æ6æF–FFT'WGFöãÖFö7VÖVçBçVW'•6VÆV7F÷"‚r76†÷t7W'&VçBr’Ç&ö÷D'WGFöãÖFö7VÖVçBçVW'•6VÆV7F÷"‚r76†÷t&6VÆ–æRr’Ç6÷W&6U&VcÖFö7VÖVçBçVW'•6VÆV7F÷"‚r76÷W&6U&Vbr’Æ6ö×&F÷$æ÷FSÖFö7VÖVçBçVW'•6VÆV7F÷"‚r6&6VÆ–æTæ÷FRr’Ç7FGW3ÖFö7VÖVçBçVW'•6VÆV7F÷"‚r77FGW2r’Æ6ö×ÆWFSÖFö7VÖVçBçVW'•6VÆV7F÷"‚r66ö×ÆWFRr“°¦gVæ7F–öâ6†÷r†¶–æB—¶6öç7B&ö÷CÖ¶–æCÓÓÒw&ö÷C¶g&ÖRç7&3×&ö÷Cô2æ&6VÆ–æRçW&Ã¤2æ7W'&VçBçW&Ã¶g&ÖRçF—FÆS×&ö÷CòtWF†÷&—FF—fRS"ãr&ö÷B6ö×&F÷"s¢tS"ãr×&ö÷FVBfW„Æ–fR6æF–FFRs¶6æF–FFT'WGFöâç6WDGG&–'WFR‚v&–×&W76VBrÅ7G&–ær‚&ö÷B’“·&ö÷D'WGFöâç6WDGG&–'WFR‚v&–×&W76VBrÅ7G&–ær‡&ö÷B’“·6÷W&6U&VbçFW‡D6öçFVçC×&ö÷Cô2æ&6VÆ–æRæ'F–f7E&Vc¤2æ7W'&VçBç6÷W&6UfW'6–öå&Vc¶6ö×&F÷$æ÷FRæ6Æ74Æ—7BçFövvÆR‚v—2×f—6–&ÆRrÇ&ö÷B—Ð¦6æF–FFT'WGFöâæöæ6Æ–6³Ò‚“Óç6†÷r‚v6æF–FFRr“·&ö÷D'WGFöâæöæ6Æ–6³Ò‚“Óç6†÷r‚w&ö÷Br“°¦7–æ2gVæ7F–öâ6VæB†ÖöFR—¶6öç7B÷fW&ÆÃÖFö7VÖVçBçVW'•6VÆV7F÷"‚v–çWE¶æÖSÖ÷fW&ÆÅÓ¦6†V6¶VBr“òçfÇVWÇÂrs¶–b†ÖöFSÓÓÒu5T$Ô•Brbb÷fW&ÆÂ—·7FGW2çFW‡D6öçFVçCÒt6†ö÷6RF†R6Æ÷6W7B&V7F–öâf—'7Bâs·&WGW&çÖ6öç7B&Wf–Ws×¶ÖöFRÆ÷fW&ÆÂÆ6†ævS¦6†ævRçfÇVRÇ&W6W'fS§&W6W'fRçfÇVRÆW‡G&¦W‡G&çfÇVRÇ&Wf–WtWö6…&Vc¤2ç&Wf–WtWö6…&VbÇ7V&Ö—GFVDC¦æWrFFR‚’çFô•4õ7G&–ær‚’Ç&Wf–Wtö&¦V7D6Æ73¤2æg&Ö–æræ6æF–FFT6Æ72Æ6ö×&F÷$6Æ73¤2æg&Ö–æræ6ö×&F÷$6Æ77Ó·7FGW2çFW‡D6öçFVçCÒu7V&Ö—GF–ær&Wf–WræB&W&–ærF†R†æFöfn(
n(	“¶ÆWB&W7öç6S·G'—·&W7öç6SÖv—BfWF6‚„2ç7V&Ö—EF‚Ç¶ÖWF†öC¢uõ5BrÆ†VFW'3§²v6öçFVçB×G—Rs¢vÆ–6F–öâö§6öâwÒÆ&öG“¤¥4ôâç7G&–æv–g’‡&Wf–Wr—Ò—Ö6F6‚†W'&÷"—·7FGW2çFW‡D6öçFVçCÒu7V&Ö—76–öâf–ÆVC¢r¶W'&÷"æÖW76vS·&WGW&çÖ–b‚&W7öç6Ræö²—·7FGW2çFW‡D6öçFVçCÒu7V&Ö—76–öâf–ÆVBâ¶VWF†—2v–æF÷r÷VâæBG'’v–ââs·&WGW&çÖFö7VÖVçBçVW'•6VÆV7F÷$ÆÂ‚v'WGFöâÇFW‡F&VÆ–çWBr’æf÷$V6‚‚†VÆVÖVçB“ÓæVÆVÖVçBæF—6&ÆVC×G'VR“¶6ö×ÆWFRæ6Æ74Æ—7BæFB‚v—2×f—6–&ÆRr“·7FGW2çFW‡D6öçFVçCÒu7V&Ö—GFVB7V66W76gVÆÇ’âW‡Æ÷&W"—2÷Væ–ærF†R6æöæ–6Â&WGW&â¤•âs·6WEF–ÖV÷WB‚‚“Óç·G'—·v–æF÷ræ6Æ÷6R‚—Ö6F6‡·×ÒÃs“·6WEF–ÖV÷WB‚‚“Óç¶–b‚v–æF÷ræ6Æ÷6VB—¶Fö7VÖVçBæ&öG’æFF6WBæ†æFöfd6ö×ÆWFSÒwG'VRw×ÒÃC—Ð¦Fö7VÖVçBçVW'•6VÆV7F÷"‚r77V&Ö—Br’æöæ6Æ–6³Ò‚“Óç6VæB‚u5T$Ô•Br“¶Fö7VÖVçBçVW'•6VÆV7F÷"‚r77F÷r’æöæ6Æ–6³Ò‚“Óç6VæB‚u5DõôäõôDT4•4”ôâr“°£Â÷67&—Cà£Âö‡FÖÃæ°§Ð ¢òòµe„r&VÄf÷&WfW%Ð