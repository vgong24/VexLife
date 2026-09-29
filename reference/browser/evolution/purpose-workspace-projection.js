// [VXG RealForever]
// FCF-04 browser presentation over the accepted source-managed Scoped Purpose Workspace.
// This adapter owns presentation only. It performs no external effect and does not become
// a work-state, Navigation, Terrain, Home, Memory, model, or training authority.

export const PURPOSE_WORKSPACE_EVOLUTION_SURFACE_REF='surface.vexlife.purpose-workspace';
export const PURPOSE_WORKSPACE_EVOLUTION_PROJECTION_REF='projection.purpose-workspace.evolution-active-surface';
export const PURPOSE_WORKSPACE_PROGRESS_API_PATH='/api/v1/intent/project-status';
export const PURPOSE_WORKSPACE_PROGRESS_SCHEMA='vexlife.browser-intent-project-status/v1';

const ROOT=new URL('../../../',import.meta.url);
const json=async(relative)=>{
  const response=await fetch(new URL(relative,ROOT));
  if(!response.ok)throw new Error(`Purpose Workspace source read failed: ${relative} HTTP ${response.status}`);
  return response.json();
};
const element=(tag,className,text)=>{
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=String(text);
  return node;
};
const button=(label,value,selected,onSelect)=>{
  const node=element('button','purpose-workspace-evolution__choice',label);
  node.type='button';
  node.dataset.value=value;
  node.setAttribute('aria-pressed',String(selected));
  node.addEventListener('click',()=>onSelect(value));
  return node;
};

async function loadAcceptedPurposeWorkspace(){
  const registry=await json('blueprint/purpose-workspace-registry.json');
  const registration=await json('blueprint/purpose-workspace/registration.json');
  const domainPacks=await Promise.all(registry.includes.domainPacks.map((path)=>json(path)));
  const processPatterns=await json(registry.includes.processPatterns);
  const completionContracts=await json(registry.includes.completionContracts);
  return Object.freeze({registry,registration,domainPacks,processPatterns,completionContracts});
}

export function createPurposeWorkspaceEvolutionAdapter({t=(ref)=>ref,projectRefForTerrain=()=>null}={}){
  let source=null,host=null,progress=null,progressProjectRef=null;
  let domainRef=null,taskRef=null,semanticDepth='DO';
  const emptyDraft=()=>({featureRef:'',purpose:'',platformRefs:['platform.browser']});
  let draft=emptyDraft();
  const findDomain=()=>source.domainPacks.find((item)=>item.domainRef===domainRef)??source.domainPacks[0];
  const findTask=(domain)=>domain.tasks.find((item)=>item.taskRef===taskRef)??domain.tasks[0];
  const processFor=(task)=>source.processPatterns.find((item)=>item.processPatternRef===task.processPatternRef);
  const completionFor=(task)=>source.completionContracts.find((item)=>item.completionContractRef===task.completionContractRef);
  const registrationForFeature=()=>source?.registration?.features?.find((item)=>item.featureRef==='feature.vexlife.scoped-purpose-workspace')??null;
  const heldProgress=(reason)=>Object.freeze({schemaVersion:PURPOSE_WORKSPACE_PROGRESS_SCHEMA,state:'HELD_UNAVAILABLE',currentness:'UNKNOWN',projectRef:progressProjectRef,statusProjections:[],effects:false,executionAuthority:'NONE',reason});
  const loadProgress=async()=>{
    const terrainParentRef=source?.registry?.workspaceDefinitions?.[0]?.terrainParentRef??null;
    progressProjectRef=terrainParentRef?projectRefForTerrain(terrainParentRef):null;
    if(!progressProjectRef)return heldProgress('PROJECT_SCOPE_UNAVAILABLE');
    try{
      const response=await fetch(`${PURPOSE_WORKSPACE_PROGRESS_API_PATH}?projectRef=${encodeURIComponent(progressProjectRef)}`,{cache:'no-store'});
      if(!response.ok)return heldProgress('PROGRESS_TRANSPORT_UNAVAILABLE');
      const value=await response.json();
      if(value?.schemaVersion!==PURPOSE_WORKSPACE_PROGRESS_SCHEMA||value?.projectRef!==progressProjectRef||value?.effects!==false||value?.executionAuthority!=='NONE')return heldProgress('PROGRESS_TRANSPORT_INVALID');
      return Object.freeze(value);
    }catch{
      return heldProgress('PROGRESS_TRANSPORT_UNAVAILABLE');
    }
  };
  const appendProgressLane=(parent,label,nodes)=>{
    if(!Array.isArray(nodes)||nodes.length===0)return false;
    const lane=element('section','purpose-workspace-evolution__progress-lane');
    lane.append(element('h4','',label));
    const list=element('ul','purpose-workspace-evolution__progress-list');
    for(const node of nodes){
      const row=element('li','purpose-workspace-evolution__progress-item');
      row.dataset.workNodeRef=node.workNodeRef??'';
      row.append(element('strong','',node.purpose??node.workNodeRef??''),element('small','purpose-workspace-evolution__progress-state',node.state??''));
      list.append(row);
    }
    lane.append(list);
    parent.append(lane);
    return true;
  };

  const render=()=>{
    if(!host||!source)return;
    const domain=findDomain();
    if(domainRef!==domain.domainRef)domainRef=domain.domainRef;
    const task=findTask(domain);
    if(taskRef!==task.taskRef)taskRef=task.taskRef;
    host.replaceChildren();

    const root=element('section','purpose-workspace-evolution');
    root.dataset.featureRef='feature.vexlife.scoped-purpose-workspace';
    root.dataset.workspaceRef='workspace.vexlife.scoped-purpose.001';
    root.dataset.screenRef='screen.vexlife.purpose-workspace';
    root.dataset.routeRef='route.purpose-workspace';
    root.dataset.semanticDepth=semanticDepth;
    root.dataset.effects='false';

    const hero=element('header','purpose-workspace-evolution__hero');
    hero.append(
      element('small','purpose-workspace-evolution__eyebrow','DO · UNDERSTAND · STEWARD'),
      element('h2','',t('screen.purpose-workspace.title')),
      element('p','',domain.purpose)
    );
    root.append(hero);

    const domainNav=element('nav','purpose-workspace-evolution__choices');
    domainNav.setAttribute('aria-label','Purpose domain');
    for(const item of source.domainPacks){
      domainNav.append(button(item.label,item.domainRef,item.domainRef===domainRef,(next)=>{
        domainRef=next;
        const nextDomain=findDomain();
        taskRef=nextDomain.primaryTaskRefs[0];
        render();
      }));
    }
    root.append(domainNav);

    const depthNav=element('nav','purpose-workspace-evolution__choices purpose-workspace-evolution__depths');
    depthNav.setAttribute('aria-label','Semantic depth');
    for(const depth of ['DO','UNDERSTAND','STEWARD']){
      depthNav.append(button(depth,depth,depth===semanticDepth,(next)=>{semanticDepth=next;render()}));
    }
    root.append(depthNav);

    const purpose=element('section','purpose-workspace-evolution__purpose');
    purpose.append(element('strong','',domain.purposeCompletionQuestion));
    root.append(purpose);

    const progressSection=element('section','purpose-workspace-evolution__progress');
    progressSection.dataset.state=progress?.state??'HELD_UNAVAILABLE';
    progressSection.dataset.projectRef=progressProjectRef??'';
    progressSection.append(element('h3','',t('purpose-workspace.progress.title')));
    if(progress?.state!=='CURRENT'){
      progressSection.append(element('p','purpose-workspace-evolution__progress-empty',t('purpose-workspace.progress.unavailable')));
    }else if((progress.statusProjections??[]).length===0){
      progressSection.append(element('p','purpose-workspace-evolution__progress-empty',t('purpose-workspace.progress.empty')));
    }else{
      const graphList=element('div','purpose-workspace-evolution__progress-graphs');
      for(const status of progress.statusProjections){
        const graph=element('article','purpose-workspace-evolution__progress-graph');
        graph.dataset.graphRef=status.graphRef??'';
        const lanes=element('div','purpose-workspace-evolution__progress-lanes');
        let visible=false;
        visible=appendProgressLane(lanes,t('purpose-workspace.progress.happening'),status.whatIsHappeningNow)||visible;
        visible=appendProgressLane(lanes,t('purpose-workspace.progress.ready'),status.ready)||visible;
        visible=appendProgressLane(lanes,t('purpose-workspace.progress.waiting'),status.waiting)||visible;
        visible=appendProgressLane(lanes,t('purpose-workspace.progress.needs-human'),status.needsHuman)||visible;
        visible=appendProgressLane(lanes,t('purpose-workspace.progress.blocked'),status.blocked)||visible;
        if(visible)graph.append(lanes);
        if((status.recentlyCompleted??[]).length){
          graph.append(element('p','purpose-workspace-evolution__progress-meta',`${t('purpose-workspace.progress.recently-completed')} · ${status.recentlyCompleted.length}`));
        }
        const next=status.nextSafeAction;
        if(next?.workNodeRef){
          const candidates=[...(status.whatIsHappeningNow??[]),...(status.ready??[]),...(status.waiting??[]),...(status.needsHuman??[]),...(status.blocked??[])];
          const target=candidates.find((node)=>node.workNodeRef===next.workNodeRef);
          const nextRow=element('p','purpose-workspace-evolution__progress-next');
          nextRow.append(element('strong','',t('purpose-workspace.progress.next-safe-action')),document.createTextNode(` · ${target?.purpose??next.workNodeRef}`));
          graph.append(nextRow);
        }
        graphList.append(graph);
      }
      progressSection.append(graphList);
    }
    root.append(progressSection);

    const draftSurface=element('section','purpose-workspace-evolution__draft-surface');
    draftSurface.dataset.componentRef='component.vexlife.draft-surface';
    draftSurface.dataset.effectClass='LOCAL_DRAFT';
    draftSurface.dataset.authorityClass='authority.draft';
    draftSurface.dataset.persistence='EPHEMERAL_BROWSER_SESSION';
    draftSurface.dataset.canonicalRegistryMutation='false';
    draftSurface.append(element('h3','',t('purpose-workspace.draft.title')));
    const draftGrid=element('div','purpose-workspace-evolution__draft-grid');
    const makeField=(labelRef,input)=>{
      const label=element('label','purpose-workspace-evolution__draft-field');
      label.append(element('span','',t(labelRef)),input);
      return label;
    };
    const featureInput=element('input','purpose-workspace-evolution__draft-input');
    featureInput.type='text';
    featureInput.value=draft.featureRef;
    featureInput.autocomplete='off';
    featureInput.dataset.draftField='featureRef';
    featureInput.addEventListener('input',()=>{draft={...draft,featureRef:featureInput.value};});
    const purposeInput=element('textarea','purpose-workspace-evolution__draft-input purpose-workspace-evolution__draft-purpose');
    purposeInput.rows=3;
    purposeInput.value=draft.purpose;
    purposeInput.dataset.draftField='purpose';
    purposeInput.addEventListener('input',()=>{draft={...draft,purpose:purposeInput.value};});
    const platformInput=element('input','purpose-workspace-evolution__draft-input');
    platformInput.type='text';
    platformInput.value=draft.platformRefs.join(', ');
    platformInput.readOnly=true;
    platformInput.dataset.draftField='platformRefs';
    draftGrid.append(
      makeField('purpose-workspace.draft.feature-ref',featureInput),
      makeField('purpose-workspace.draft.purpose',purposeInput),
      makeField('purpose-workspace.draft.platform',platformInput)
    );
    draftSurface.append(draftGrid);
    const draftFooter=element('div','purpose-workspace-evolution__draft-footer');
    const reset=element('button','purpose-workspace-evolution__draft-reset',t('purpose-workspace.draft.reset'));
    reset.type='button';
    reset.addEventListener('click',()=>{draft=emptyDraft();render();});
    draftFooter.append(element('small','',t('purpose-workspace.draft.local-only')),reset);
    draftSurface.append(draftFooter);
    root.append(draftSurface);

    const taskGrid=element('section','purpose-workspace-evolution__tasks');
    for(const item of domain.tasks){
      const card=element('button','purpose-workspace-evolution__task');
      card.type='button';
      card.dataset.taskRef=item.taskRef;
      card.setAttribute('aria-pressed',String(item.taskRef===taskRef));
      card.append(element('strong','',item.label),element('small','',item.processPatternRef.replace('process-pattern.','').replace('/v1','').replaceAll('-',' ')));
      card.addEventListener('click',()=>{taskRef=item.taskRef;render()});
      taskGrid.append(card);
    }
    root.append(taskGrid);

    const detail=element('section','purpose-workspace-evolution__detail');
    detail.dataset.taskRef=task.taskRef;
    if(semanticDepth==='DO'){
      const process=processFor(task),completion=completionFor(task);
      detail.append(
        element('h3','',task.label),
        element('p','',process?.purpose??task.processPatternRef),
        element('p','purpose-workspace-evolution__meta',completion?.purpose??task.completionContractRef)
      );
    }else if(semanticDepth==='UNDERSTAND'){
      detail.append(element('h3','','UNDERSTAND'));
      const stages=element('ol','purpose-workspace-evolution__stages');
      const process=processFor(task);
      for(const [index,purposeClass] of (process?.stagePurposes??[]).entries()){
        const row=element('li','purpose-workspace-evolution__stage');
        row.append(
          element('strong','',purposeClass),
          element('span','',task.stageOwnerRefs[index]),
          element('small','',`${task.stageEvidenceClasses[index]} · ${task.stageEffectClasses[index]}`)
        );
        stages.append(row);
      }
      detail.append(stages);
    }else{
      detail.append(element('h3','','STEWARD'));
      const roles=element('div','purpose-workspace-evolution__steward-grid');
      for(const role of domain.roleLenses){
        const card=element('article','purpose-workspace-evolution__steward-card');
        card.append(element('strong','',role.label),element('small','',role.authorityClassRefs.join(' · ')));
        roles.append(card);
      }
      detail.append(roles);
      const held=element('p','purpose-workspace-evolution__held',domain.heldBoundaries.join(' · '));
      held.setAttribute('aria-label','Held boundaries');
      detail.append(held);
    }
    root.append(detail);

    const truth=element('footer','purpose-workspace-evolution__truth');
    const currentRegistration=registrationForFeature(),registrationState=currentRegistration?.humanIntroduction?.routeState??'UNLOADED';
    truth.append(
      element('strong','','Projection only · no external effect'),
      element('span','',`${registrationState} introduction · source foundation ${source.registry.registrationPlacement.status}`)
    );
    root.append(truth);
    host.append(root);
  };

  return Object.freeze({
    async mount({body}){
      host=body;
      source??=await loadAcceptedPurposeWorkspace();
      domainRef??=source.domainPacks[0]?.domainRef??null;
      taskRef??=source.domainPacks[0]?.primaryTaskRefs?.[0]??null;
      progress=await loadProgress();
      render();
      return Object.freeze({state:'MOUNTED',surfaceRef:PURPOSE_WORKSPACE_EVOLUTION_SURFACE_REF,effects:false});
    },
    requestClose(){return Object.freeze({state:'CLOSED',reason:'PRESENTATION_DISMISS',semanticNavigationMutated:false})},
    snapshot(){
      const currentRegistration=registrationForFeature();
      return Object.freeze({
        surfaceRef:PURPOSE_WORKSPACE_EVOLUTION_SURFACE_REF,
        projectionRef:PURPOSE_WORKSPACE_EVOLUTION_PROJECTION_REF,
        featureRef:'feature.vexlife.scoped-purpose-workspace',
        workspaceRef:'workspace.vexlife.scoped-purpose.001',
        screenRef:'screen.vexlife.purpose-workspace',
        routeRef:'route.purpose-workspace',
        domainRef,taskRef,semanticDepth,
        effects:false,
        progressState:progress?.state??'HELD_UNAVAILABLE',
        progressProjectRef,
        progressGraphCount:Array.isArray(progress?.statusProjections)?progress.statusProjections.length:0,
        progressExecutionAuthority:progress?.executionAuthority??'NONE',
        draft:Object.freeze({featureRef:draft.featureRef,purpose:draft.purpose,platformRefs:Object.freeze([...draft.platformRefs])}),
        draftEffectClass:'LOCAL_DRAFT',
        draftAuthorityClass:'authority.draft',
        draftPersistence:'EPHEMERAL_BROWSER_SESSION',
        draftCanonicalRegistryMutation:false,
        draftSave:false,
        draftDeploy:false,
        draftPublish:false,
        sourceRegistrationState:currentRegistration?.humanIntroduction?.routeState??'UNLOADED',
        sourceFoundationRegistrationState:source?.registry?.registrationPlacement?.status??'UNLOADED'
      });
    }
  });
}
