const PLAN_DISPOSITIONS = new Set(['WALKTHROUGH', 'EXPLANATION_ONLY']);
const NO_PLAN_DISPOSITIONS = new Set(['DISCOVERABLE_ONLY', 'NONE_JUSTIFIED']);

export const FEATURE_WALKTHROUGH_RUNNER_STATES = Object.freeze({
  READY:'READY', ACTIVE:'ACTIVE', HELD:'HELD', NOT_REQUIRED:'NOT_REQUIRED',
  DEFERRED:'DEFERRED', SUPPRESSED:'SUPPRESSED', UNAVAILABLE:'UNAVAILABLE',
  PLAN_STAGES_EXHAUSTED:'PLAN_STAGES_EXHAUSTED'
});
export const FEATURE_WALKTHROUGH_PREFERENCE_STATES = Object.freeze({ DEFERRED:'DEFERRED', SUPPRESSED:'SUPPRESSED' });

const PREFERENCE_PREFIX='vexlife.guide.feature-introduction';
const NO_EFFECTS=Object.freeze({journeyCompletionCreated:false,memoryWritten:false,protectedActionExecuted:false,modelCalled:false,networkCalled:false,publicationPerformed:false});
const clone=(value)=>value==null?value:structuredClone(value);
const nonempty=(value)=>typeof value==='string'&&value.length>0;
const nullableRef=(value)=>value===null||nonempty(value);
const effects=()=>({...NO_EFFECTS});

function identity({featureRef,planRef,sourceVersionRef}){
  if(![featureRef,planRef,sourceVersionRef].every(nonempty)) throw new Error('featureRef, planRef and sourceVersionRef are required for Guide-local introduction preference identity');
  return {featureRef,planRef,sourceVersionRef};
}
export function featureWalkthroughPreferenceKey(value){
  const id=identity(value);
  return [PREFERENCE_PREFIX,id.featureRef,id.planRef,id.sourceVersionRef].map(encodeURIComponent).join('/');
}
export function createLocalStorageFeatureWalkthroughPreferenceStore(storage=globalThis.localStorage){
  if(!storage||['getItem','setItem','removeItem'].some((key)=>typeof storage[key]!=='function')) throw new Error('Guide-local feature introduction preferences require Storage-compatible getItem/setItem/removeItem methods');
  return Object.freeze({
    read(key){
      const raw=storage.getItem(key);
      if(raw===null)return null;
      const value=JSON.parse(raw);
      if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('Guide-local feature introduction preference is malformed');
      return clone(value);
    },
    write(key,value){storage.setItem(key,JSON.stringify(value));return clone(value);},
    remove(key){storage.removeItem(key);}
  });
}
function requireStore(store){
  if(!store||['read','write','remove'].some((key)=>typeof store[key]!=='function')) throw new Error('preferenceStore must provide read/write/remove');
  return store;
}
function indexBy(items,key){
  const values=new Map(),duplicates=new Set();
  for(const item of items??[]){const ref=item?.[key];if(!nonempty(ref))continue;if(values.has(ref))duplicates.add(ref);else values.set(ref,item);}
  return {values,duplicates};
}
function unavailable(featureRef,reason,details={}){return {state:FEATURE_WALKTHROUGH_RUNNER_STATES.UNAVAILABLE,featureRef,reason,...details,effects:effects()};}
function held(featureRef,intro){return {state:FEATURE_WALKTHROUGH_RUNNER_STATES.HELD,featureRef,disposition:intro?.disposition??null,planRef:intro?.planRefOrNull??null,reason:'HUMAN_INTRODUCTION_ROUTE_HELD',effects:effects()};}
function notRequired(featureRef,intro){return {state:FEATURE_WALKTHROUGH_RUNNER_STATES.NOT_REQUIRED,featureRef,disposition:intro?.disposition??null,reason:'PLAN_DRIVEN_INTRODUCTION_NOT_DECLARED',effects:effects()};}
function preferenceMatches(value,id){
  return Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&value.featureRef===id.featureRef&&value.planRef===id.planRef&&value.sourceVersionRef===id.sourceVersionRef&&Object.values(FEATURE_WALKTHROUGH_PREFERENCE_STATES).includes(value.state));
}
function validStage(stage,index){
  return Boolean(stage&&typeof stage==='object'&&stage.sequence===index&&nonempty(stage.stageRef)&&
    [stage.purposeClass,stage.contentStringRef,stage.expectedOutcomeClass,stage.recoveryClass].every(nonempty)&&
    nullableRef(stage.targetRefOrNull)&&nullableRef(stage.actionRefOrNull));
}

export function createFeatureWalkthroughRunner({featureRegistry,experience,evaluateTarget=null,currentFrame=()=>null,preferenceStore,runRefFactory=()=>`run.vexlife.feature-walkthrough.${crypto.randomUUID()}`}={}){
  const featureIndex=indexBy(featureRegistry?.features,'featureRef');
  const planIndex=indexBy(experience?.featureWalkthroughPlans,'planRef');
  const preferences=requireStore(preferenceStore);
  if(evaluateTarget!==null&&typeof evaluateTarget!=='function') throw new Error('evaluateTarget must be a function when supplied');
  if(typeof currentFrame!=='function') throw new Error('currentFrame must be a function');
  if(typeof runRefFactory!=='function') throw new Error('runRefFactory must be a function');

  function resolve(featureRef,{ignorePreference=false}={}){
    if(featureIndex.duplicates.has(featureRef)) return unavailable(featureRef,'FEATURE_REF_AMBIGUOUS');
    const feature=featureIndex.values.get(featureRef);
    if(!feature) return unavailable(featureRef,'FEATURE_NOT_REGISTERED');
    const intro=feature.humanIntroduction;
    if(!intro||typeof intro!=='object'||Array.isArray(intro)) return unavailable(featureRef,'HUMAN_INTRODUCTION_MISSING');
    if(intro.routeState==='HELD') return held(featureRef,intro);
    if(intro.routeState!=='CURRENT') return unavailable(featureRef,'HUMAN_INTRODUCTION_ROUTE_STATE_INVALID');
    if(NO_PLAN_DISPOSITIONS.has(intro.disposition)) return intro.planRefOrNull===null?notRequired(featureRef,intro):unavailable(featureRef,'NO_PLAN_DISPOSITION_HAS_PLAN_REF');
    if(!PLAN_DISPOSITIONS.has(intro.disposition)) return unavailable(featureRef,'HUMAN_INTRODUCTION_DISPOSITION_INVALID');
    if(!nonempty(intro.planRefOrNull)) return unavailable(featureRef,'CURRENT_PLAN_REF_MISSING');
    if(planIndex.duplicates.has(intro.planRefOrNull)) return unavailable(featureRef,'CURRENT_PLAN_AMBIGUOUS',{planRef:intro.planRefOrNull});
    const plan=planIndex.values.get(intro.planRefOrNull);
    if(!plan) return unavailable(featureRef,'CURRENT_PLAN_MISSING',{planRef:intro.planRefOrNull});
    if(plan.featureRef!==featureRef) return unavailable(featureRef,'PLAN_FEATURE_MISMATCH',{planRef:plan.planRef,planFeatureRef:plan.featureRef});
    if(plan.effects!==false) return unavailable(featureRef,'PLAN_EFFECTS_NOT_FALSE',{planRef:plan.planRef});
    if(![plan.journeyRef,plan.sourceVersionRef,plan.experienceProfileRef].every(nonempty)) return unavailable(featureRef,'PLAN_IDENTITY_INCOMPLETE',{planRef:plan.planRef});
    if(!Array.isArray(plan.stages)||plan.stages.length===0) return unavailable(featureRef,'PLAN_STAGES_MISSING',{planRef:plan.planRef});
    for(const [index,stage] of plan.stages.entries()) if(!validStage(stage,index)) return unavailable(featureRef,'PLAN_STAGE_IDENTITY_INVALID',{planRef:plan.planRef,stageIndex:index});

    const id=identity({featureRef,planRef:plan.planRef,sourceVersionRef:plan.sourceVersionRef});
    const preferenceKey=featureWalkthroughPreferenceKey(id);
    if(!ignorePreference){
      let preference=null;
      try{preference=preferences.read(preferenceKey);}catch{return unavailable(featureRef,'PREFERENCE_READ_FAILED',{planRef:plan.planRef,sourceVersionRef:plan.sourceVersionRef,preferenceKey});}
      if(preference!==null&&!preferenceMatches(preference,id)) return unavailable(featureRef,'PREFERENCE_RECORD_INVALID',{planRef:plan.planRef,sourceVersionRef:plan.sourceVersionRef,preferenceKey});
      if(preference?.state===FEATURE_WALKTHROUGH_PREFERENCE_STATES.SUPPRESSED) return {state:FEATURE_WALKTHROUGH_RUNNER_STATES.SUPPRESSED,featureRef,planRef:plan.planRef,sourceVersionRef:plan.sourceVersionRef,preferenceKey,effects:effects()};
      if(preference?.state===FEATURE_WALKTHROUGH_PREFERENCE_STATES.DEFERRED) return {state:FEATURE_WALKTHROUGH_RUNNER_STATES.DEFERRED,featureRef,planRef:plan.planRef,sourceVersionRef:plan.sourceVersionRef,preferenceKey,effects:effects()};
    }
    return {state:FEATURE_WALKTHROUGH_RUNNER_STATES.READY,featureRef,disposition:intro.disposition,planRef:plan.planRef,journeyRef:plan.journeyRef,sourceVersionRef:plan.sourceVersionRef,experienceProfileRef:plan.experienceProfileRef,replayable:plan.replayable===true,stageCount:plan.stages.length,preferenceKey,plan,effects:effects()};
  }

  function offer(featureRef){const route=resolve(featureRef);if(route.plan)delete route.plan;return clone(route);}
  function showMe(featureRef){
    const route=resolve(featureRef,{ignorePreference:true});if(route.state!==FEATURE_WALKTHROUGH_RUNNER_STATES.READY)return route;
    let runRef;try{runRef=runRefFactory({featureRef,planRef:route.planRef,sourceVersionRef:route.sourceVersionRef});}catch{return unavailable(featureRef,'RUN_REF_FACTORY_FAILED',{planRef:route.planRef});}
    if(!nonempty(runRef)) return unavailable(featureRef,'RUN_REF_FACTORY_INVALID',{planRef:route.planRef});
    return {state:FEATURE_WALKTHROUGH_RUNNER_STATES.ACTIVE,featureRef,runRef,planRef:route.planRef,journeyRef:route.journeyRef,sourceVersionRef:route.sourceVersionRef,stageIndex:0,stageCount:route.stageCount,replayable:route.replayable,effects:effects()};
  }
  function stage(run){
    if(!run||run.state!==FEATURE_WALKTHROUGH_RUNNER_STATES.ACTIVE||![run.featureRef,run.runRef,run.planRef,run.sourceVersionRef].every(nonempty)||!Number.isSafeInteger(run.stageIndex)||run.stageIndex<0) return unavailable(run?.featureRef??null,'RUN_NOT_ACTIVE');
    const route=resolve(run.featureRef,{ignorePreference:true});if(route.state!==FEATURE_WALKTHROUGH_RUNNER_STATES.READY)return route;
    if(route.planRef!==run.planRef||route.sourceVersionRef!==run.sourceVersionRef) return unavailable(run.featureRef,'RUN_SOURCE_VERSION_STALE',{runPlanRef:run.planRef,currentPlanRef:route.planRef,runSourceVersionRef:run.sourceVersionRef,currentSourceVersionRef:route.sourceVersionRef});
    if(run.stageIndex>=route.plan.stages.length) return {state:FEATURE_WALKTHROUGH_RUNNER_STATES.PLAN_STAGES_EXHAUSTED,featureRef:run.featureRef,runRef:run.runRef,planRef:run.planRef,journeyRef:route.journeyRef,sourceVersionRef:run.sourceVersionRef,completionAuthority:'JOURNEY_REQUIRED',effects:effects()};
    const sourceStage=route.plan.stages[run.stageIndex];let frame=null;
    try{frame=currentFrame()??null;}catch{return unavailable(run.featureRef,'CURRENT_FRAME_UNAVAILABLE',{stageRef:sourceStage.stageRef});}
    let targetEvaluation;
    if(sourceStage.targetRefOrNull===null){
      if(sourceStage.actionRefOrNull!==null) return unavailable(run.featureRef,'ACTION_WITHOUT_TARGET_NOT_RUNNABLE',{stageRef:sourceStage.stageRef});
      targetEvaluation={state:'NOT_REQUIRED',reason:'STAGE_HAS_NO_TARGET'};
    }else{
      if(typeof evaluateTarget!=='function') return unavailable(run.featureRef,'TARGET_EVALUATOR_UNAVAILABLE',{stageRef:sourceStage.stageRef,targetRef:sourceStage.targetRefOrNull});
      try{targetEvaluation=evaluateTarget(sourceStage.targetRefOrNull,frame);}catch{return unavailable(run.featureRef,'TARGET_EVALUATION_FAILED',{stageRef:sourceStage.stageRef,targetRef:sourceStage.targetRefOrNull});}
      if(!targetEvaluation||targetEvaluation.state!=='AVAILABLE') return unavailable(run.featureRef,'CURRENT_TARGET_UNAVAILABLE',{stageRef:sourceStage.stageRef,targetRef:sourceStage.targetRefOrNull,targetEvaluation:clone(targetEvaluation)});
      if(sourceStage.actionRefOrNull!==null&&targetEvaluation.actionRef!==sourceStage.actionRefOrNull) return unavailable(run.featureRef,'ACTION_TARGET_MISMATCH',{stageRef:sourceStage.stageRef,declaredActionRef:sourceStage.actionRefOrNull,currentActionRef:targetEvaluation.actionRef??null});
    }
    return {state:FEATURE_WALKTHROUGH_RUNNER_STATES.ACTIVE,featureRef:run.featureRef,runRef:run.runRef,planRef:run.planRef,journeyRef:route.journeyRef,sourceVersionRef:run.sourceVersionRef,stageIndex:run.stageIndex,stageCount:route.plan.stages.length,stage:clone(sourceStage),targetEvaluation:clone(targetEvaluation),autoExecute:false,completionAuthority:'JOURNEY_REQUIRED',effects:effects()};
  }
  function advance(run){const projection=stage(run);return projection.state===FEATURE_WALKTHROUGH_RUNNER_STATES.ACTIVE?{...clone(run),stageIndex:run.stageIndex+1,effects:effects()}:projection;}
  function writePreference(featureRef,state){
    const route=resolve(featureRef,{ignorePreference:true});if(route.state!==FEATURE_WALKTHROUGH_RUNNER_STATES.READY)return route;
    const value=Object.freeze({state,featureRef,planRef:route.planRef,sourceVersionRef:route.sourceVersionRef});
    try{preferences.write(route.preferenceKey,value);}catch{return unavailable(featureRef,'PREFERENCE_WRITE_FAILED',{planRef:route.planRef,sourceVersionRef:route.sourceVersionRef});}
    return {state,featureRef,planRef:route.planRef,sourceVersionRef:route.sourceVersionRef,preferenceKey:route.preferenceKey,completionAuthority:'JOURNEY_REQUIRED',effects:effects()};
  }
  const later=(featureRef)=>writePreference(featureRef,FEATURE_WALKTHROUGH_PREFERENCE_STATES.DEFERRED);
  const suppress=(featureRef)=>writePreference(featureRef,FEATURE_WALKTHROUGH_PREFERENCE_STATES.SUPPRESSED);
  function clearPreference(featureRef){
    const route=resolve(featureRef,{ignorePreference:true});if(route.state!==FEATURE_WALKTHROUGH_RUNNER_STATES.READY)return route;
    try{preferences.remove(route.preferenceKey);}catch{return unavailable(featureRef,'PREFERENCE_CLEAR_FAILED',{planRef:route.planRef,sourceVersionRef:route.sourceVersionRef});}
    return offer(featureRef);
  }
  return Object.freeze({offer,showMe,stage,advance,later,suppress,clearPreference});
}

// [VXG RealForever]
