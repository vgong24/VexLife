import {
  LIVING_JOURNAL_SURFACE_REF,
  assertLivingJournalActiveSurfaceContract,
  createLivingJournalEvolutionSurfaceAdapter
} from './living-journal-projection.js';

async function loadJson(fetchImpl,path){
  const response=await fetchImpl(path,{cache:'no-store'});
  if(!response.ok)throw new Error('Unable to load '+path+': HTTP '+response.status);
  return response.json();
}

export function registerLivingJournalEvolutionSurface(app,{registry,shellScaffold,documentImpl=globalThis.document}={}){
  const contract=assertLivingJournalActiveSurfaceContract({registry,shellScaffold});
  if(typeof app?.uxProjectionShell?.registerEvolutionSurfaceAdapter!=='function')throw new TypeError('Canonical Evolution active-surface host is required');
  const adapter=createLivingJournalEvolutionSurfaceAdapter(app,{documentImpl});
  const shellReceipt=app.uxProjectionShell.registerEvolutionSurfaceAdapter(LIVING_JOURNAL_SURFACE_REF,adapter);
  return Object.freeze({
    schemaVersion:'vexlife.living-journal.evolution-active-surface-registration/v1',
    state:'REGISTERED',
    surfaceRef:LIVING_JOURNAL_SURFACE_REF,
    projectionRef:contract.projectionRef,
    hostRef:contract.hostRef,
    oneSemanticState:true,
    oneActiveRenderer:true,
    semanticOwnerMutation:false,
    memoryOwnerMutation:false,
    shellReceipt
  });
}

export async function loadAndRegisterLivingJournalEvolutionSurface(app,{fetchImpl=globalThis.fetch,documentImpl=globalThis.document}={}){
  const [registry,shellScaffold]=await Promise.all([
    loadJson(fetchImpl,'../../blueprint/ux-evolution-registry.json'),
    loadJson(fetchImpl,'../../blueprint/ux-evolution-shell-scaffold.json')
  ]);
  return registerLivingJournalEvolutionSurface(app,{registry,shellScaffold,documentImpl});
}

// [VXG RealForever]
