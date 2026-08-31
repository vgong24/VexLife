import { rootContractSuite } from './integration/root-contract-suite.js';
import { journeySuite } from './integration/journey-suite.js';
import { guideVexSuite } from './integration/guide-vex-suite.js';
import { featurePerceptibilitySuite } from './integration/feature-perceptibility-suite.js';
import { terrainSuite } from './integration/terrain-suite.js';
import { contextualConversationSuite } from './integration/contextual-conversation-suite.js';
import { livingJournalSuite } from './integration/living-journal-suite.js';
import { crossFeatureSuite } from './integration/cross-feature-suite.js';
import { identityLocalizationSuite } from './integration/identity-localization-suite.js';
import { globalizationSemanticRelaySuite } from './integration/globalization-semantic-relay-suite.js';
import { securityAccessPreviewSuite } from './integration/security-access-android-preview-suite.js';

export const MANDATORY_SUITE_REFS = Object.freeze([
  'suite.vexlife.browser.root-contract/v1',
  'suite.vexlife.browser.journey/v1',
  'suite.vexlife.browser.guide-vex/v1',
  'suite.vexlife.browser.feature-perceptibility/v1',
  'suite.vexlife.browser.terrain/v1',
  'suite.vexlife.browser.contextual-conversation/v1',
  'suite.vexlife.browser.living-journal/v1',
  'suite.vexlife.browser.cross-feature/v1',
  'suite.vexlife.browser.identity-localization/v1',
  'suite.vexlife.browser.globalization-semantic-relay/v1',
  'suite.vexlife.browser.security-access-android-preview/v1'
]);

export const MANDATORY_SUITES = Object.freeze([
  rootContractSuite,
  journeySuite,
  guideVexSuite,
  featurePerceptibilitySuite,
  terrainSuite,
  contextualConversationSuite,
  livingJournalSuite,
  crossFeatureSuite,
  identityLocalizationSuite,
  globalizationSemanticRelaySuite,
  securityAccessPreviewSuite
]);

// Stable carried-truth index retained by the composition owner so source-managed
// static proof can verify accepted whole-product coverage without reacquiring
// mutable ownership of the owner-domain assertion leaves.
export const CARRIED_TRUTH_MARKERS = Object.freeze([
  'exact E2.7 body is the first rendered product surface',
  'canonical VexLife topology is projected into the E2.7 body',
  'UNSENT_LOCAL_DRAFT',
  'semantic auto-entry remains opt-in',
  'one visible Vex occupies the E2.7 ambient vessel',
  "state:'PASS'"
]);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const selectLanguage = (language) => { const select = document.querySelector('#languageSelect'); assert(select, 'Missing #languageSelect'); select.value = language; select.dispatchEvent(new Event('change', { bubbles: true })); };
const selectedMessageList = (app) => app.messages.get(`${app.state.projectRef}::${app.state.threadRef}::${app.state.channelRef}`);
const overlaps = (left, right) => !(left.right <= right.left || left.left >= right.right || left.bottom <= right.top || left.top >= right.bottom);
const worldRect = ({ left, top, width, height }) => ({ left:left-width/2, right:left+width/2, top:top-height/2, bottom:top+height/2 });
const pointOnBoundary = (rect, x, y, epsilon=1.1) => x >= rect.left-epsilon && x <= rect.right+epsilon && y >= rect.top-epsilon && y <= rect.bottom+epsilon && [Math.abs(x-rect.left),Math.abs(x-rect.right),Math.abs(y-rect.top),Math.abs(y-rect.bottom)].some((distance)=>distance<=epsilon);
const svgPointToViewport = (line, xAttr, yAttr) => { const svg=line.ownerSVGElement, matrix=svg?.getScreenCTM?.(); assert(svg&&matrix, 'live edge SVG transform unavailable'); const point=svg.createSVGPoint(); point.x=Number(line.getAttribute(xAttr)); point.y=Number(line.getAttribute(yAttr)); const projected=point.matrixTransform(matrix); return { x:projected.x, y:projected.y }; };
const assertLiveEdgeAttachments = (label, epsilon=3) => { const focus=document.querySelector('#terrainFocus'), focusRect=focus?.getBoundingClientRect(), lines=[...document.querySelectorAll('.e27-edge')]; assert(focus&&focusRect&&lines.length>0, `${label} relationship projection unavailable`); for(const line of lines){ const targetRef=line.dataset.targetOwnerRef||line.dataset.terrainRef, target=document.querySelector(`.e27-node[data-terrain-ref="${CSS.escape(targetRef)}"]`); assert(target?.isConnected, `${label} target ${targetRef} unavailable`); assert(line.dataset.anchorKind==='BOUNDARY', `${label} edge ${targetRef} missing boundary anchor kind`); assert(line.dataset.sourceOwnerRef===globalThis.__VEXLIFE_APP__.terrain.currentRef(), `${label} edge ${targetRef} source owner drifted`); assert(line.dataset.targetOwnerRef===targetRef, `${label} edge ${targetRef} target owner drifted`); const sourcePoint=svgPointToViewport(line,'x1','y1'), targetPoint=svgPointToViewport(line,'x2','y2'), targetRect=target.getBoundingClientRect(), sourceCenter={x:focusRect.left+focusRect.width/2,y:focusRect.top+focusRect.height/2}, targetCenter={x:targetRect.left+targetRect.width/2,y:targetRect.top+targetRect.height/2}; if(Math.hypot(targetCenter.x-sourceCenter.x,targetCenter.y-sourceCenter.y)>epsilon){ assert(pointOnBoundary(focusRect,sourcePoint.x,sourcePoint.y,epsilon), `${label} edge ${targetRef} detached from live current-context boundary`); assert(pointOnBoundary(targetRect,targetPoint.x,targetPoint.y,epsilon), `${label} edge ${targetRef} detached from live target boundary`); } } };
const relationshipLine = (targetRef) => { const line=[...document.querySelectorAll('.e27-edge')].find((candidate)=>(candidate.dataset.targetOwnerRef||candidate.dataset.terrainRef)===targetRef); assert(line, `relationship ${targetRef} unavailable for clearance proof`); return line; };
const worldRelationshipClearance = (targetRef) => { const line=relationshipLine(targetRef),x1=Number(line.getAttribute('x1')),y1=Number(line.getAttribute('y1')),x2=Number(line.getAttribute('x2')),y2=Number(line.getAttribute('y2')); return Math.hypot(x2-x1,y2-y1); };
const renderedPixelClose = (actual, expected, epsilon=.02) => Math.abs(actual-expected) <= epsilon;
const geometryDifferences = (expected, actual, epsilon=.35) => {
  const differences = [], exact = (path,left,right) => { if (left !== right) differences.push({path,left,right}); }, numeric = (path,left,right,tolerance=epsilon) => { if (!Number.isFinite(left) || !Number.isFinite(right) || Math.abs(left-right) > tolerance) differences.push({path,left,right,tolerance}); };
  exact('currentRef', expected.currentRef, actual.currentRef); exact('projectionMode', expected.projectionMode, actual.projectionMode); exact('manualOverrideRef', expected.manualOverrideRef, actual.manualOverrideRef);
  exact('current.role', expected.current.role, actual.current.role); for (const key of ['left','top','width','height']) numeric(`current.${key}`, expected.current[key], actual.current[key]);
  const actualNodes = new Map(actual.nodes.map((node)=>[node.ref,node]));
  for (const node of expected.nodes) { const next=actualNodes.get(node.ref); if(!next){differences.push({path:`nodes.${node.ref}`,left:'present',right:'missing'});continue;} for(const key of ['role','relevanceReason','relevanceScore','manualOverride']) exact(`nodes.${node.ref}.${key}`,node[key],next[key]); for(const key of ['left','top','width','height']) numeric(`nodes.${node.ref}.${key}`,node[key],next[key]); exact(`nodes.${node.ref}.localOffset.x`,node.localOffset?.x??0,next.localOffset?.x??0); exact(`nodes.${node.ref}.localOffset.y`,node.localOffset?.y??0,next.localOffset?.y??0); }
  exact('nodeCount', expected.nodes.length, actual.nodes.length);
  const actualEdges = new Map(actual.edges.map((edge)=>[edge.ref,edge])); for(const edge of expected.edges){const next=actualEdges.get(edge.ref);if(!next){differences.push({path:`edges.${edge.ref}`,left:'present',right:'missing'});continue;}for(const key of ['x1','y1','x2','y2'])numeric(`edges.${edge.ref}.${key}`,edge[key],next[key],.75);} exact('edgeCount',expected.edges.length,actual.edges.length);
  return differences;
};
const geometryIdentity = (snapshot) => JSON.stringify({ current:snapshot.current, nodes:snapshot.nodes.map(({ ref,role,relevanceReason,relevanceScore,left,top,width,height,localOffset })=>({ref,role,relevanceReason,relevanceScore,left,top,width,height,localOffset})), edges:snapshot.edges, projectionMode:snapshot.projectionMode, manualOverrideRef:snapshot.manualOverrideRef });
const radialDistance = ({ left, top }) => Math.hypot(left-600,top-400);
const motionCssToken = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const transitionProperties = (style) => style.transitionProperty.split(',').map((value)=>value.trim());
const assertSettledGeometry = (snapshot, label) => { const rects=[worldRect(snapshot.current),...snapshot.nodes.map(worldRect)]; for(let i=0;i<rects.length;i++) for(let j=i+1;j<rects.length;j++) assert(!overlaps(rects[i],rects[j]), `${label} settled geometry overlap ${i}/${j}`); for(const edge of snapshot.edges){const node=snapshot.nodes.find((candidate)=>candidate.ref===edge.ref);assert(node,`${label} edge missing node ${edge.ref}`);assert(pointOnBoundary(worldRect(snapshot.current),edge.x1,edge.y1),`${label} edge ${edge.ref} does not leave actual current geometry`);assert(pointOnBoundary(worldRect(node),edge.x2,edge.y2),`${label} edge ${edge.ref} does not terminate on actual node geometry`);const gap=Math.hypot(edge.x2-edge.x1,edge.y2-edge.y1);assert(gap>=94,`${label} edge ${edge.ref} settled rendered-boundary clearance collapsed below the spatial floor: ${gap}`);} };

export function validateMandatorySuites(suites = MANDATORY_SUITES) {
  assert(Array.isArray(suites), 'browser integration mandatory suite composition is not an array');
  assert(suites.length === MANDATORY_SUITE_REFS.length, `browser integration mandatory suite count drifted: expected ${MANDATORY_SUITE_REFS.length}, received ${suites.length}`);
  const seen = new Set();
  suites.forEach((suite, index) => {
    assert(suite && typeof suite === 'object', `browser integration mandatory suite ${index} is unavailable`);
    assert(typeof suite.suiteRef === 'string' && suite.suiteRef.length > 0, `browser integration mandatory suite ${index} lacks stable suiteRef`);
    assert(!seen.has(suite.suiteRef), `browser integration duplicate suiteRef ${suite.suiteRef}`);
    seen.add(suite.suiteRef);
    assert(suite.suiteRef === MANDATORY_SUITE_REFS[index], `browser integration deterministic suite order drifted at ${index}: expected ${MANDATORY_SUITE_REFS[index]}, received ${suite.suiteRef}`);
    assert(typeof suite.run === 'function', `browser integration mandatory suite ${suite.suiteRef} lacks run(context)`);
  });
  return suites;
}

export async function runMandatorySuites(context, suites = MANDATORY_SUITES) {
  const results = [];
  for (const suite of validateMandatorySuites(suites)) {
    context.activeSuiteRef = suite.suiteRef;
    const result = await suite.run(context);
    assert(result && result.suiteRef === suite.suiteRef, `browser integration suite ${suite.suiteRef} returned mismatched identity`);
    assert(result.state === 'PASS', `browser integration suite ${suite.suiteRef} returned ${result.state ?? 'UNKNOWN'}`);
    assert(Array.isArray(result.checks), `browser integration suite ${suite.suiteRef} returned no checks array`);
    context.checks.push(...result.checks);
    results.push(Object.freeze({ ...result, checks:[...result.checks] }));
    context.suiteResults = results;
  }
  context.activeSuiteRef = null;
  return results;
}

export async function runBrowserIntegration() {
  const host = document.createElement('pre'); host.id = 'integrationReceipt'; host.dataset.state = 'RUNNING'; document.body.append(host);
  const app = globalThis.__VEXLIFE_APP__;
  const checks = [];
  const state = Object.create(null);
  const context = {
    app,
    checks,
    state,
    activeSuiteRef:null,
    suiteResults:[],
    helpers:{ delay, assert, selectLanguage, selectedMessageList, overlaps, assertLiveEdgeAttachments, worldRelationshipClearance, renderedPixelClose, geometryDifferences, geometryIdentity, radialDistance, motionCssToken, transitionProperties, assertSettledGeometry }
  };
  try {
    assert(app, 'VexLife browser application context unavailable');
    const suites = await runMandatorySuites(context);
    assert(state.initialJourney?.length >= 1, 'browser integration composed result lacks initial Journey evidence');
    const result = {
      schemaVersion:'vexlife.e27-direct-root-browser-integration/v1',
      state:'PASS',
      checks,
      proofTopology:'STATIC_MANDATORY_OWNER_DOMAIN_SUITES',
      suiteRefs:suites.map((suite)=>suite.suiteRef),
      suiteResults:suites,
      suites,
      presentationFoundation:'EXACT_E2_7_ROOT_BODY',
      currentNodeRef:app.terrain.currentRef(),
      currentFrame:app.navigation.semanticFrame(),
      initialJourneyCount:state.initialJourney.length,
      initialVexState:'AMBIENT_MINIMIZED',
      e28Poc01:state.e28Poc01 ?? null
    };
    host.dataset.state='PASS'; host.textContent=JSON.stringify(result,null,2); globalThis.__VEXLIFE_INTEGRATION_RESULT__=result; return result;
  } catch (error) {
    const result={
      schemaVersion:'vexlife.e27-direct-root-browser-integration/v1',
      state:'FAIL',
      error:error instanceof Error?error.message:String(error),
      checks,
      proofTopology:'STATIC_MANDATORY_OWNER_DOMAIN_SUITES',
      activeSuiteRef:context.activeSuiteRef,
      suites:context.suiteResults,
      e28Poc01:state.e28Poc01 ?? null
    };
    host.dataset.state='FAIL';host.textContent=JSON.stringify(result,null,2);globalThis.__VEXLIFE_INTEGRATION_RESULT__=result;throw error;
  }
}

// [VXG RealForever]
