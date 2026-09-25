export const LIVING_JOURNAL_EVOLUTION_PROJECTION_REF='projection.living-journal.evolution-active-surface';
export const LIVING_JOURNAL_FEATURE_REF='feature.vexlife.living-journal';
export const LIVING_JOURNAL_SURFACE_REF='surface.vexlife.living-journal';
export const LIVING_JOURNAL_SHELL_HOST_REF='host.vexlife.shell.evolution-active-surface.001';

const clone=(value)=>structuredClone(value);
const requireValue=(ok,errors,code)=>{if(!ok)errors.push(code);};

export function assertLivingJournalActiveSurfaceContract({registry,shellScaffold}={}){
  const errors=[];
  const host=registry?.projectionHost;
  const projection=host?.activeSurfaceProjection;
  const record=registry?.migrationRecords?.find((item)=>item.semanticRef===LIVING_JOURNAL_FEATURE_REF);
  const surface=shellScaffold?.surfaceInventory?.find((item)=>item.surfaceRef===LIVING_JOURNAL_SURFACE_REF);
  requireValue(shellScaffold?.activeSurfaceHost?.hostRef===LIVING_JOURNAL_SHELL_HOST_REF,errors,'SHELL_HOST_REF_INVALID');
  requireValue(shellScaffold?.activeSurfaceHost?.shellOwnsSurfaceTitle===true,errors,'SHELL_TITLE_OWNERSHIP_REQUIRED');
  requireValue(shellScaffold?.activeSurfaceHost?.shellOwnsCloseControl===true,errors,'SHELL_CLOSE_OWNERSHIP_REQUIRED');
  requireValue(shellScaffold?.activeSurfaceHost?.semanticCloseOwnerPolicy==='REGISTERED_ADAPTER_REQUEST_CLOSE',errors,'SHELL_CLOSE_DELEGATION_REQUIRED');
  requireValue(shellScaffold?.invariants?.oneSemanticState===true,errors,'ONE_SEMANTIC_STATE_REQUIRED');
  requireValue(shellScaffold?.invariants?.oneActiveRenderer===true,errors,'ONE_ACTIVE_RENDERER_REQUIRED');
  requireValue(surface?.semanticRef===LIVING_JOURNAL_FEATURE_REF,errors,'JOURNAL_SURFACE_INVENTORY_INVALID');
  requireValue(host?.hostRef===LIVING_JOURNAL_SHELL_HOST_REF,errors,'REGISTRY_HOST_REF_INVALID');
  requireValue(host?.defaultProjection==='REFERENCE_PROJECTION',errors,'REFERENCE_DEFAULT_REQUIRED');
  requireValue(host?.rendererTransitionClass==='SHELL_ACTIVE_SURFACE',errors,'ACTIVE_SURFACE_TRANSITION_REQUIRED');
  requireValue(host?.priorRendererDisposition==='REFERENCE_SURFACE_RETAINED_HIDDEN',errors,'REFERENCE_SURFACE_RETENTION_REQUIRED');
  requireValue(host?.oneActiveRenderer===true&&host?.dualRendererMountAllowed===false,errors,'ONE_RENDERER_REQUIRED');
  requireValue(host?.evolutionHostLoadsReferenceRenderer===true,errors,'CANONICAL_SHELL_DOCUMENT_REQUIRED');
  requireValue(projection?.surfaceRef===LIVING_JOURNAL_SURFACE_REF,errors,'ACTIVE_SURFACE_REF_INVALID');
  requireValue(projection?.semanticRef===LIVING_JOURNAL_FEATURE_REF,errors,'ACTIVE_SURFACE_SEMANTIC_REF_INVALID');
  requireValue(projection?.projectionRef===LIVING_JOURNAL_EVOLUTION_PROJECTION_REF,errors,'ACTIVE_SURFACE_PROJECTION_REF_INVALID');
  requireValue(projection?.stateOwnerPolicy==='UNCHANGED_SERVICE_CONTEXT',errors,'STATE_OWNER_POLICY_INVALID');
  requireValue(projection?.memoryOwnerPolicy==='UNCHANGED_ACCEPTED_MEMORY_OWNERS',errors,'MEMORY_OWNER_POLICY_INVALID');
  requireValue(projection?.journeyOwnerPolicy==='UNCHANGED_NAVIGATION_JOURNEY_OWNER',errors,'JOURNEY_OWNER_POLICY_INVALID');
  requireValue(projection?.semanticBackOwnerRef==='module.vexlife.core.navigation',errors,'SEMANTIC_BACK_OWNER_INVALID');
  requireValue(projection?.shellOwnsSurfaceTitle===true&&projection?.shellOwnsCloseControl===true,errors,'SHELL_CHROME_OWNERSHIP_INVALID');
  requireValue(projection?.semanticClosePolicy==='REGISTERED_ADAPTER_REQUEST_CLOSE',errors,'SEMANTIC_CLOSE_POLICY_INVALID');
  requireValue(projection?.referenceFallbackRequired===true&&projection?.projectionFallbackMutatesSemanticJourney===false,errors,'REFERENCE_FALLBACK_BOUNDARY_INVALID');
  requireValue(projection?.localMarginaliaDurability==='SESSION_ONLY_NON_MEMORY',errors,'MARGINALIA_BOUNDARY_INVALID');
  requireValue(projection?.newSemanticCapabilityAuthority===false,errors,'NEW_SEMANTICS_FORBIDDEN');
  requireValue(projection?.cutoverAuthority===false&&projection?.retirementAuthority===false,errors,'LIFECYCLE_AUTHORITY_FORBIDDEN');
  requireValue(record?.evolutionProjectionRefs?.includes(LIVING_JOURNAL_EVOLUTION_PROJECTION_REF)===true,errors,'MIGRATION_RECORD_BINDING_REQUIRED');
  requireValue(record?.migrationLifecycleState==='SHADOW_IMPLEMENTED',errors,'SHADOW_IMPLEMENTED_REQUIRED');
  requireValue(record?.semanticOwnerRefs?.every((ref)=>!ref.includes('ux-evolution'))===true,errors,'UX_EVOLUTION_CANNOT_OWN_JOURNAL_SEMANTICS');
  if(errors.length){
    const error=new Error('LIVING_JOURNAL_ACTIVE_SURFACE_CONTRACT_INVALID:'+errors.join('|'));
    error.errors=errors;
    throw error;
  }
  return Object.freeze({state:'PASS',surfaceRef:LIVING_JOURNAL_SURFACE_REF,semanticRef:LIVING_JOURNAL_FEATURE_REF,projectionRef:LIVING_JOURNAL_EVOLUTION_PROJECTION_REF,hostRef:LIVING_JOURNAL_SHELL_HOST_REF});
}

function assertCanonicalApp(app){
  if(!app||typeof app!=='object')throw new TypeError('Canonical VexLife app is required');
  if(typeof app.openLivingJournal!=='function')throw new TypeError('Canonical openLivingJournal() is required');
  if(typeof app.projectFrame!=='function')throw new TypeError('Canonical projectFrame() is required');
  if(typeof app.navigation?.back!=='function')throw new TypeError('Canonical navigation owner is required');
  if(typeof app.livingJournal?.close!=='function')throw new TypeError('Canonical Living Journal owner is required');
}
function ensureStylesheet(documentImpl){
  if(!documentImpl?.head||typeof documentImpl.createElement!=='function')return null;
  const existing=documentImpl.querySelector?.('link[data-vexlife-lj-evolution-style="true"]');
  if(existing)return existing;
  const link=documentImpl.createElement('link');
  link.rel='stylesheet';
  link.href=new URL('./living-journal.css',import.meta.url).href;
  link.dataset.vexlifeLjEvolutionStyle='true';
  documentImpl.head.append(link);
  return link;
}
function restoreElement(node,parent,nextSibling){
  if(!node||!parent)return;
  if(nextSibling&&nextSibling.parentNode===parent&&typeof parent.insertBefore==='function')parent.insertBefore(node,nextSibling);
  else if(typeof parent.appendChild==='function')parent.appendChild(node);
}
function restoreNode(session){
  const {view,originalParent,originalNextSibling,optionsButton,optionsParent,optionsNextSibling,referenceFallback,referenceParent,referenceNextSibling,closeButton,closeParent,closeNextSibling,closeText}=session;
  view.classList?.remove('living-journal-evolution-active-surface');
  if(view.dataset)delete view.dataset.evolutionSurfacePresentation;
  restoreElement(view,originalParent,originalNextSibling);
  restoreElement(optionsButton,optionsParent,optionsNextSibling);
  restoreElement(referenceFallback,referenceParent,referenceNextSibling);
  if(closeButton)closeButton.textContent=closeText;
  restoreElement(closeButton,closeParent,closeNextSibling);
}

export function createLivingJournalEvolutionSurfaceAdapter(app,{documentImpl=globalThis.document}={}){
  assertCanonicalApp(app);
  let session=null;
  const snapshot=()=>Object.freeze({
    schemaVersion:'vexlife.living-journal.evolution-active-surface-receipt/v1',
    state:session?'MOUNTED':'IDLE',
    surfaceRef:LIVING_JOURNAL_SURFACE_REF,
    semanticRef:LIVING_JOURNAL_FEATURE_REF,
    projectionRef:LIVING_JOURNAL_EVOLUTION_PROJECTION_REF,
    oneSemanticState:true,
    oneActiveRenderer:true,
    canonicalJournalOwnerReused:true,
    canonicalNavigationOwnerReused:true,
    memoryOwnerMutation:false,
    userDataFork:false,
    publicationAuthority:false,
    cutoverAuthority:false,
    singleVisibleSurfaceHeader:true,
    primaryPresentation:'ENTRY_FEED',
    primaryReportChromeVisible:false
  });
  async function mount({body,actions,surfaceRef,semanticRef,projection}={}){
    if(surfaceRef!==LIVING_JOURNAL_SURFACE_REF||semanticRef!==LIVING_JOURNAL_FEATURE_REF||projection!=='EVOLUTION_PROJECTION')throw new Error('Living Journal active-surface mount binding mismatch');
    if(!body||typeof body.replaceChildren!=='function')throw new TypeError('Shell active-surface body is required');
    if(!actions||typeof actions.prepend!=='function')throw new TypeError('Shell active-surface actions row is required');
    if(session)throw new Error('Living Journal Evolution surface is already mounted');
    const view=documentImpl?.querySelector?.('#view-living-journal');
    const optionsButton=documentImpl?.querySelector?.('#livingJournalOptionsOpen');
    const surfaceActions=documentImpl?.querySelector?.('#livingJournalSurfaceActions');
    const referenceFallback=documentImpl?.querySelector?.('#evolutionReferenceFallback');
    const closeButton=documentImpl?.querySelector?.('#evolutionActiveSurfaceClose');
    if(!view||!view.parentNode||!optionsButton||!optionsButton.parentNode||!surfaceActions||!referenceFallback||!referenceFallback.parentNode||!closeButton||!closeButton.parentNode)throw new Error('Living Journal shell composition controls are unavailable');
    ensureStylesheet(documentImpl);
    const originalParent=view.parentNode,originalNextSibling=view.nextSibling??null;
    const optionsParent=optionsButton.parentNode,optionsNextSibling=optionsButton.nextSibling??null;
    const referenceParent=referenceFallback.parentNode,referenceNextSibling=referenceFallback.nextSibling??null;
    const closeParent=closeButton.parentNode,closeNextSibling=closeButton.nextSibling??null,closeText=closeButton.textContent;
    await app.openLivingJournal({loadMemory:true});
    view.hidden=false;
    if(view.dataset)view.dataset.evolutionSurfacePresentation='true';
    view.classList?.add('living-journal-evolution-active-surface');
    actions.prepend(optionsButton);
    surfaceActions.append(referenceFallback,closeButton);
    closeButton.textContent='Close';
    body.replaceChildren(view);
    session={body,view,originalParent,originalNextSibling,optionsButton,optionsParent,optionsNextSibling,referenceFallback,referenceParent,referenceNextSibling,closeButton,closeParent,closeNextSibling,closeText};
    app.projectFrame();
    view.focus?.({preventScroll:true});
    return snapshot();
  }
  async function requestClose({reason='SHELL_CLOSE'}={}){
    if(!session)return Object.freeze({state:'CLOSED',reason:'NO_ACTIVE_JOURNAL_SURFACE',surfaceRef:LIVING_JOURNAL_SURFACE_REF,semanticNavigationMutation:false});
    const closing=session;
    session=null;
    app.livingJournal.dismissOptions?.('SURFACE_TRANSITION');
    restoreNode(closing);
    if(reason==='REFERENCE_FALLBACK'){
      app.projectFrame();
      return Object.freeze({state:'CLOSED',reason,surfaceRef:LIVING_JOURNAL_SURFACE_REF,referenceFallback:true,semanticNavigationMutation:false,canonicalJournalStatePreserved:true,userDataRollbackPerformed:false});
    }
    app.livingJournal.close();
    const backReceipt=app.navigation.back();
    app.projectFrame();
    return Object.freeze({
      state:'CLOSED',
      reason,
      surfaceRef:LIVING_JOURNAL_SURFACE_REF,
      referenceFallback:false,
      semanticNavigationMutation:Boolean(backReceipt?.changed),
      canonicalJourneyOwnerRef:'module.vexlife.core.navigation',
      canonicalBackReceipt:clone(backReceipt??{}),
      userDataRollbackPerformed:false
    });
  }
  return Object.freeze({mount,requestClose,snapshot});
}

// [VXG RealForever]
