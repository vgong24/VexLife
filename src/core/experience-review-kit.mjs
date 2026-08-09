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
  const r=obj(b.reviewRequest,'reviewRequest');str(r.reviewRequestRef,'reviewRequestRef');if(r.reviewEpochRef!==e.reviewEpochRef)throw new Error('reviewRequest epoch mismatch');if(!Array.isArray(r.reviewCaseRefs)||!Array.isArray(r.captureRequestRefs))throw new TypeError('review request refs must be arrays');uniq(r.reviewCaseRefs,'reviewCaseRefs');uniq(r.captureRequestRefs,'captureRequestRefs');
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
  const tasks=[];for(const ref of v.reviewRequest.captureRequestRefs){const c=v.captureByRef.get(ref);if(c.platformRef!=='platform.browser')continue;const b=map.get(ref);if(!b)throw new Error(`Missing browser binding for ${ref}`);for(const stepRef of c.captureAtStepRefs){const step=c.steps.find(s=>s.reviewStepRef===stepRef);const slug=b.artifactSlugs?.[stepRef];str(slug,`artifactSlugs.${stepRef}`);tasks.push({taskRef˜œ›İÜÙ\‹]\ÚË‰Ü™YŸK‰Üİ\™YŸXØ\\™T™\]Y\İ˜Ëİ\š[™[™Î˜‹\Y˜Xİš[S˜[YNœØÜ™Y[œÚİ]šY[˜ÙQš[[˜[YJÜÛYËØØ[T™Y˜Ë›ØØ[T™Y‹[YT™Y˜Ë[YT™Y‹šY]ÜÜ˜‹šY]ÜÜÚYJ_J__Bˆ™]\›Ü[”™Y˜Ü\œÙKXœ›İÜÙ\‹\[‹‰İ‹œ™]šY]Ô™\]Y\İœ™]šY]Ô™\]Y\İ™YŸXX]š^ÛXŞN‰ÑVPÒUĞĞTT‘WÔ‘TUQTÕ×ÓÓ“IË]]ÛX]XĞØ\\ÚX[‘^[œÚ[Û™˜[ÙK\ÚÜßBŸB‚™^Ü[˜İ[ÛˆÜ™X]Q^\šY[˜ÙT™]šY]Ñ]šY[˜ÙJİ\ÚËY\\”™Y‹Y\\•™\œÚ[Û”™Y‹Ø\\™Tİ]KØœÙ\™Y]\Y˜Xİ[[[œİ\ÜYØ\Xš[]Y\ÏV×K]šX][ÛœÏV×K[Z]][ÛœÏV×KÙ\Ó›İ›İ™OV×_J^ÂˆØšŠ\ÚË	İ\ÚÉÊNÚYŠVÉĞĞTT‘Q	Ë	ÕS”ÕTÔ•Q	Ë	ÑRSQÔĞQ‘I×Kš[˜ÛY\ÊØ\\™Tİ]JJ]›İÈ™]È\œ›ÜŠ[œİ\ÜYØ\\™Tİ]Nˆ	ØØ\\™Tİ]_X
NÚYŠ
Ø\\™Tİ]OOOIĞĞTT‘Q	ÊHOOHHX\Y˜Xİ
]›İÈ™]È\œ›ÜŠ	ØØ\\™Tİ]_H\Y˜XİZ\ÛX]Ú
NÂˆÛÛœİÏ]\ÚË˜Ø\\™T™\]Y\İÏ]\ÚËœİ\Ü™]\›Ù]šY[˜ÙT™Y˜™]šY]ËY]šY[˜ÙK‰ØË˜Ø\\™T™\]Y\İ™YŸK‰ÜËœ™]šY]Ôİ\™YŸXØ\\™T™\]Y\İ™Y˜Ë˜Ø\\™T™\]Y\İ™Y‹™]šY]Ñ\ØÚ™Y˜Ëœ™]šY]Ñ\ØÚ™Y‹™]šY]ĞØ\ÙT™Y˜Ëœ™]šY]ĞØ\ÙT™Y‹™]šY]Ôİ\™YœËœ™]šY]Ôİ\™Y‹]›Ü›T™Y˜Ëœ]›Ü›T™Y‹Y\\”™YœİŠY\\”™Y‹	ØY\\”™Y‰ÊKY\\•™\œÚ[Û”™YœİŠY\\•™\œÚ[Û”™Y‹	ØY\\•™\œÚ[Û”™Y‰ÊKÛİ\˜ÙU™\œÚ[Û”™Y˜ËœÛİ\˜ÙU™\œÚ[Û”™Y‹]Û\ÜÎ˜Ë]Û\ÜËØœÙ\™Y]œİŠØœÙ\™Y]	ÛØœÙ\™Y]	ÊKØ\\™Tİ]K\Y˜Xİ[Z]][ÛœÎ–Ë‹‹›[Z]][Ûœ×KÙ\Ó›İ›İ™N–Ë‹‹™Ù\Ó›İ›İ™WKY\\”™XÙZ\Ü™\]Y\İØ]\ÙšYY˜Ø\\™Tİ]OOOIĞĞTT‘Q	Ë[œİ\ÜYØ\Xš[]Y\Î–Ë‹‹[œİ\ÜYØ\Xš[]Y\×K]šX][ÛœÎ–Ë‹‹™]šX][Ûœ×__BŸB‚™^Ü[˜İ[ÛˆÜ™X]T™]šY]ÕšY]Ù\“[Ù[
[™K]šY[˜ÙKÚ[\˜Xİ]™Q[šY\ÏV×_O^ßJ^ÂˆÛÛœİ]˜[Y]T™]šY]Ô™\]Y\İ[™J[™JNØÛÛœİ[šY\ÏV×NÂˆ›ÜŠÛÛœİÙˆ]šY[˜ÙJ^ÚYŠ˜Ø\\™Tİ]HOOIĞĞTT‘Q	ß^˜\Y˜XİËœ]
XÛÛ[YNØÛÛœİÏ]‹˜Ø\\™PT™Y‹™Ù]
˜Ø\\™T™\]Y\İ™YŠK˜Ï]‹˜Ø\ÙPT™Y‹™Ù]
Ëœ™]šY]ĞØ\ÙT™YŠNÙ[šY\Ëœ\Ú
ÚÚ[™‰ÔĞÔ‘QS”ÒÕ	ËX™[œ˜Ë]_˜Ëœ™]šY]Ô]Y\İ[ÛŸ˜Ëœ™]šY]ĞØ\ÙT™Y‹\Y˜Xİ]˜\Y˜Xİœ]ØØ[N™[JË›ØØ[T™Y‹	ÛØØ[K‰ÊK[YN™[JË[YT™Y‹	İ[YK‰ÊK]šXÙN™[JË™]šXÙT›Ùš[T™Y‹	Ù]šXÙK‰ÊK]›Ü›N™[JËœ]›Ü›T™Y‹œ]›Ü›KˆŠK]Û\ÜÎ]Û\ÜßJ_Bˆ›ÜŠÛÛœİÙˆ[\˜Xİ]™Q[šY\Ê^ÛØšŠ	Ú[\˜Xİ]™Q[IÊNÙ[šY\Ëœ\Ú
ÚÚ[™‰ÒS•TPÕU‘WÒS	ËX™[œİŠ›X™[	ÛX™[	ÊK\Y˜Xİ]œİŠ˜\Y˜Xİ]	Ø\Y˜Xİ]	ÊKØØ[N›ØØ[_	ÉË[YN[Y_	ÉË]šXÙN™]šXÙ_	ÉË]›Ü›Nœ]›Ü›_	Øœ›İÜÙ\‰Ë]Û\ÜÎ]Û\Üß‹™\ØÚ]Û\ÜßJ_BˆÛÛœİ˜[Y\ÏZÏO–Ë‹‹›™]ÈÙ]
[šY\Ë›X\
OÚ×JK™š[\Š›ÛÛX[ŠJWKœÛÜ

NÜ™]\›Ü™]šY]Ñ\ØÚ™Y‹™\ØÚœ™]šY]Ñ\ØÚ™Y‹]N˜[™KœXÚØYÙOË]_	Õ™^Y™H^\šY[˜ÙH™]šY]ÉË[šY\ËÙ[XİÜœÎÚÚ[™˜[Y\Ê	ÚÚ[™	ÊKØØ[N˜[Y\Ê	ÛØØ[IÊK[YN˜[Y\Ê	İ[YIÊK]šXÙN˜[Y\Ê	Ù]šXÙIÊK]›Ü›N˜[Y\Ê	Ü]›Ü›IÊ__BŸB‚™^Ü[˜İ[Ûˆ™[™\”İ\\™R[
J^ÂˆØšŠK	İšY]Ù\“[Ù[	ÊNØÛÛœİ^[ØYR”ÓÓ‹œİš[™ÚYJJKœ™\XÙP[
	Ï	Ë	×LØÉÊK]OY\ØÊK]_	Õ™^Y™H^\šY[˜ÙH™]šY]ÉÊNÂˆ™]\›˜YØİ\H[[[™ÏH™[ˆXYY]HÚ\œÙ]H]‹NY]H˜[YOHšY]ÜÜˆÛÛ[HÚYY]šXÙK]ÚY[š]X[\ØØ[OLH]O‰İ]_Oİ]Oİ[Oœ›ÛİØÛÛÜ‹\ØÚ[YN™\šÎÙ›ÛY˜[Z[N’[\‹Ş\İ[K]ZKØ[œË\Ù\šYØ˜XÚÙÜ›İ[™ˆÌŒLØÛÛÜˆÙYßJØ›Ş\Ú^š[™Î˜›Ü™\‹X›ŞX›Ù^ÛX\™Ú[ŒKœÚ[ÛX^]ÚYŒMLÛX\™Ú[˜]]ÎÜY[™ÎŒZ^Ù›Û\Ú^™N˜Û[\
ËLœ
_KÛÛ˜\Ù\Ü^N™›^Ù›^]Ü˜\Ü˜\ÙØ\ÛX\™Ú[ŒŒK™ŞÙ\Ü^N™›^ÙØ\\Ø[YÛ‹Z][\Î˜Ù[\Ø›Ü™\Œ\ÛÛYÌÍÎMNØ›Ü™\‹\˜Y]\ÎŒLœÜY[™Î\K™ÈÜ[Ù›ÛÌL[Û›ÜÜXÙNØÛÛÜˆÎLNXMNİ^]˜[œÙ›Ü›N\\˜Ø\Ù_K™È]ÛØ›Ü™\ŒØ›Ü™\‹\˜Y]\ÎÜY[™ÎØ˜XÚÙÜ›İ[™˜[œÜ\™[ØÛÛÜˆØØÙŸK™È]Û‹›ÛØ˜XÚÙÜ›İ[™ˆÙ™™ØÛÛÜˆÌLL_KœİYÙ^Ø›Ü™\Œ\ÛÛYÌÍÎMNØ›Ü™\‹\˜Y]\ÎŒMœÛİ™\™›İÎšY[ŸKšXYÙ\Ü^N™›^Ú\İYKXÛÛ[œÜXÙKX™]ÙY[ÜY[™ÎŒLœMœØ›Ü™\‹X›İÛNŒ\ÛÛYÌÍÎM_K˜›Ù^Ù\Ü^N™ÜšYÜXÙKZ][\Î˜Ù[\ÛZ[‹ZZYÚŒÌØ˜XÚÙÜ›İ[™ˆÌLŒ_K˜›ÙH[YŞÛX^]ÚYŒL	_K˜›ÙHYœ˜[Y^İÚYŒL	NÚZYÚ›Z[ŠÎšL
NØ›Ü™\ŒØ˜XÚÙÜ›İ[™ˆÙ™™ŸK]Ù›ÛÌL[Û›ÜÜXÙ_KœİXØÛÛÜˆØXXŒ˜_OÜİ[OÚXY›ÙOXZ[ˆÛ\ÜÏHœÚ[O‰İ]_OÚOÛ\ÜÏHœİXˆ“Û™HİYÙH]H[YKˆÙ[XİÜœÈİØ\HØ[YHİ\™˜XÙNÈØÜ™Y[œÚİÈ\™H^XÚ]™XÙZ\Ë›İHØ\\ÚX[ˆØ[Ü]ˆYHÛÛ˜\ˆˆÛ\ÜÏHÛÛ˜\ˆÙ]ÙXİ[ÛˆÛ\ÜÏHœİYÙH]ˆÛ\ÜÏHšXYÜ[ˆYH›X™[ÜÜ[Ü[ˆYH]ˆÛ\ÜÏH]ÜÜ[Ù]]ˆYHœİYÙHˆÛ\ÜÏH˜›ÙHÙ]ÜÙXİ[ÛÛXZ[ØÜš\˜ÛÛœİOIÜ^[ØYKÏ^ÚÚ[™ˆˆ‹ØØ[Nˆˆ‹[YNˆˆ‹]šXÙNˆˆ‹]›Ü›NˆˆŸKYØİ[Y[œ]Y\TÙ[XİÜŠˆİÛÛ˜\ˆŠKÏYØİ[Y[œ]Y\TÙ[XİÜŠˆÜİYÙHŠKYØİ[Y[œ]Y\TÙ[XİÜŠˆÛX™[ŠKYØİ[Y[œ]Y\TÙ[XİÜŠˆİ]ŠNÙ[˜İ[ÛˆXÚÊ
^Ü™]\›ˆK™[šY\Ë™š[™
OO“Øš™Xİ™[šY\ÊÊK™]™\J
ÚË—JOOˆ]ŸVÚ×OOO]ŠJ_K™[šY\ÖÌ_Y[˜İ[ÛˆİYÙJ
^ØÛÛœİO\XÚÊ
NÑËœ™\XÙPÚ[™[Š
NÚYŠYJ^ÑË^ÛÛ[H“›ÈØ\\™Y]šY[˜ÙHÜ™]\›ŸS^ÛÛ[YK›X™[Ô‹^ÛÛ[YK]Û\ÜÎØÛÛœİYØİ[Y[˜Ü™X]Q[[Y[
KšÚ[™OOH’S•TPÕU‘WÒSÈšYœ˜[YHˆš[YÈŠNÚYŠKšÚ[™OOH’S•TPÕU‘WÒSŠ^Û‹œÜ˜ÏYK˜\Y˜Xİ]Û‹]OYK›X™[Y[Ù^Û‹œÜ˜ÏYK˜\Y˜Xİ]Û‹˜[YK›X™[QË˜\[™
Š_Y[˜İ[ÛˆÛÛ›ÛÊ
^Õœ™\XÙPÚ[™[Š
NÙ›ÜŠÛÛœİÈÙˆØš™XİšÙ^\ÊÊJ^ØÛÛœİœÏSKœÙ[XİÜœÖÚ×_×NÚYŠ]œË›[™İ
XÛÛ[YNØÛÛœİÏYØİ[Y[˜Ü™X]Q[[Y[
™]ˆŠNÙË˜Û\ÜÓ˜[YOH™ÈØÛÛœİÏYØİ[Y[˜Ü™X]Q[[Y[
œÜ[ˆŠNØË^ÛÛ[ZÎÙË˜\[™
ÊNÙ›ÜŠÛÛœİˆÙˆœÊ^ØÛÛœİYØİ[Y[˜Ü™X]Q[[Y[
˜]ÛˆŠNØ‹^ÛÛ[]Ø‹˜Û\ÜÓ\İÙÙÛJ›Ûˆ‹ÖÚ×OOO]ŠNØ‹›Û˜ÛXÚÏJ
OOÔÖÚ×OTÖÚ×OOO]ÈˆØÛÛ›ÛÊ
NÜİYÙJ
_NÙË˜\[™
Š_U˜\[™
Ê__XÛÛ›ÛÊ
NÜİYÙJ
NÏÜØÜš\Ø›ÙOÚ[˜ŸB‚™^Ü[˜İ[ÛˆZ[™]šY]ÔXÚØYÙU^š[\Ê[™K]šY[˜ÙKÛİ\˜ÙT™XÙZ\Ü[ÛœÏ^ßJ^ÂˆØšŠÛİ\˜ÙT™XÙZ\	ÜÛİ\˜ÙT™XÙZ\	ÊNØÛÛœİ]˜[Y]T™]šY]Ô™\]Y\İ[™J[™JKšY]Ù\XÜ™X]T™]šY]ÕšY]Ù\“[Ù[
[™K]šY[˜ÙKÜ[ÛœÊKØ\\™YY]šY[˜ÙK™š[\ŠO˜Ø\\™Tİ]OOOIĞĞTT‘Q	ÊK›[™İÂˆÛÛœİš[\Ï^ÉÔÕT•RT‘Kš[	Îœ™[™\”İ\\™R[
šY]Ù\ŠK	Ô‘U’QUË›Y	Î˜È	Ø[™KœXÚØYÙOË]_	Õ™^Y™H^\šY[˜ÙH™]šY]ÉßW—”™]šY]È\ØÚˆ	İ‹™\ØÚœ™]šY]Ñ\ØÚ™YŸW—Ø\\™Y]šY[˜ÙNˆ
Š‰ØØ\\™YKÉÙ]šY[˜ÙK›[™İJŠ——“Ü[ˆÕT•RT‘Kš[ˆ]Øİ\œ™[™\ÜÈ™[XZ[œÈ]XÚYÈXXÚ\Y˜Xİ——–Õ–È™X[›Ü™]™\—W˜	Ñ‘QQPÒË›Y	Î˜È[X[ˆ™YY˜XÚ×—”™]šY]È\ØÚˆ	İ‹™\ØÚœ™]šY]Ñ\ØÚ™YŸW—•Üš]H˜]\˜[NÈ›ÈÙ]™\š]KÛİÛ™\‹Û[œÈÛ\ÜÚYšXØ][Ûˆ\È™\]Z\™Y——ˆÈÈÚ]™[šYÚ×——ˆÈÈÚ]ÛÛ™\ÙYÜˆİ\œš\ÙY[İO×——ˆÈÈÚ]Y[İH^Xİ[œİXY×——ˆÈÈ[][™È™^Úİ[™\Ù\™O×——–Õ–È™X[›Ü™]™\—W˜	Ü™]šY]Ë\™\]Y\İšœÛÛ‰Î˜	Ò”ÓÓ‹œİš[™ÚYJ[™K[Š_W˜	Ü™]šY]ËY]šY[˜ÙKšœÛÛ‰Î˜	Ò”ÓÓ‹œİš[™ÚYJ]šY[˜ÙK[Š_W˜	ÜÛİ\˜ÙK\™XÙZ\šœÛÛ‰Î˜	Ò”ÓÓ‹œİš[™ÚYJÛİ\˜ÙT™XÙZ\[Š_W˜NÂˆÛÛœİ˜ÏX[™Kœ™]šY]ĞØ\Ù\Ë™š[\ŠO]Û\ÜÈOOIĞÕT”‘S•ĞPĞÑTQÒSTSQS•USÓ‰ÊNÚYŠ˜Ë›[™İ
Yš[\ÖÉÒÓ“ÕÓ‹S“ÕPÕT”‘S•›Y	×OXÈÛ›İÛˆ›İXİ\œ™[X]\šX[—‰Û˜Ë›X\
O˜H	Şœ™]šY]ĞØ\ÙT™YŸW8 %
Š‰Ş]Û\ÜßJŠ˜
Kš›Ú[Š	×‰Ê_W—‘È›İ[\œ™]›ÜÜØ[ÜŞ[]XËØØ[™Y]Kİ\™Ù]]šY[˜ÙH\Èİ\œ™[[\[Y[][Û‹——–Õ–È™X[›Ü™]™\—W˜Ü™]\›ˆš[\ÂŸB‹ËÈÕ–È™X[›Ü™]™\—B