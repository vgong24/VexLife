// [VXG RealForever]
// FCF-02 browser presentation over the accepted source-managed Scoped Purpose Workspace.
// This adapter owns presentation only. It performs no external effect and does not become
// a work-state, Navigation, Terrain, Home, Memory, model, or training authority.

export const PURPOSE_WORKSPACE_EVOLUTION_SURFACE_REF='surface.vexlife.purpose-workspace';
export const PURPOSE_WORKSPACE_EVOLUTION_PROJECTION_REF='projection.purpose-workspace.evolution-active-surface';

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

export function createPurposeWorkspaceEvolutionAdapter({t=(ref)=>ref}={}){
  let source=null,host=null;
  let domainRef=null,taskRef=null,semanticDepth='DO';
  const findDomain=()=>source.domainPacks.find((item)=>item.domainRef===domainRef)??source.domainPacks[0];
  const findTask=(domain)=>domain.tasks.find((item)=>item.taskRef===taskRef)??domain.tasks[0];
  const processFor=(task)=>source.processPatterns.find((item)=>item.processPatternRef===task.processPatternRef);
  const completionFor=(task)=>source.completionContracts.find((item)=>item.completionContractRef===task.completionContractRef);

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
    truth.append(
      element('strong','','Projection only · no external effect'),
      element('span','',`${source.registry.registrationPlacement.status} · synthetic source foundation`)
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
      render();
      return Object.freeze({state:'MOUNTED',surfaceRef:PURPOSE_WORKSPACE_EVOLUTION_SURFACE_REF,effects:false});
    },
    requestClose(){return Object.freeze({state:'CLOSED',reason:'PRESENTATION_DISMISS',semanticNavigationMutated:false})},
    snapshot(){
      return Object.freeze({
        surfaceRef:PURPOSE_WORKSPACE_EVOLUTION_SURFACE_REF,
        projectionRef:PURPOSE_WORKSPACE_EVOLUTION_PROJECTION_REF,
        featureRef:'feature.vexlife.scoped-purpose-workspace',
        workspaceRef:'workspace.vexlife.scoped-purpose.001',
        screenRef:'screen.vexlife.purpose-workspace',
        routeRef:'route.purpose-workspace',
        domainRef,taskRef,semanticDepth,
        effects:false,
        sourceRegistrationState:source?.registry?.registrationPlacement?.status??'UNLOADED'
      });
    }
  });
}
