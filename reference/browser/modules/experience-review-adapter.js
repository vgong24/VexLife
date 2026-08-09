import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createExperienceReviewEvidence } from '../../../src/core/experience-review-kit.mjs';

export const ADAPTER_REF='adapter.vexlife.browser.playwright.v0';
export const ADAPTER_VERSION_REF='adapter-version.vexlife.browser.playwright.v0.1';
export function stableTargetSelector(ref){if(typeof ref!=='string'||!ref.trim())throw new TypeError('targetNodeRef must be a non-empty string');return `[data-node-ref="${ref.replaceAll('\\','\\\\').replaceAll('"','\\"')}"]`}
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

async function perform(page,step,binding){
  const op=binding.stepBindings?.[step.reviewStepRef]??{kind:'CLICK_STABLE_TARGET'};
  if(op.kind==='NOOP')return;
  const target=page.locator(stableTargetSelector(step.targetNodeRef)).first();
  if(await target.count()===0)throw new Error(`Stable review target was not rendered: ${step.targetNodeRef}`);
  if(op.kind==='CLICK_STABLE_TARGET')return target.click();
  if(op.kind==='FOCUS_STABLE_TARGET')return target.focus();
  if(op.kind==='FILL_STABLE_TARGET')return target.fill(String(op.value??''));
  if(op.kind==='PRESS_STABLE_TARGET')return target.press(String(op.key??'Enter'));
  if(op.kind==='PAN_STABLE_TARGET'){
    const b=await target.boundingBox();if(!b)throw new Error(`Stable target has no bounding box: ${step.targetNodeRef}`);
    const x=b.x+b.width/2,y=b.y+b.height/2;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+Number(op.dx??80),y+Number(op.dy??40),{steps:5});return page.mouse.up();
  }
  throw new Error(`Unsupported browser step binding kind: ${op.kind}`);
}

async function overlay(page,step,request){
  const o=request.reviewOverlay??{};if(!o.highlightTarget&&!o.showStableRef&&!o.showAction)return null;
  const selector=stableTargetSelector(step.targetNodeRef);if(await page.locator(selector).count()===0)throw new Error(`Review overlay target was not rendered: ${step.targetNodeRef}`);
  const id=`vex-review-overlay-${crypto.randomUUID()}`;
  await page.evaluate(({selector,id,o,node,action})=>{
    const t=document.querySelector(selector);if(!t)throw new Error(`Review overlay target missing: ${node}`);const r=t.getBoundingClientRect(),h=document.createElement('div');h.id=id;h.dataset.vexReviewOverlay='true';Object.assign(h.style,{position:'fixed',inset:'0',pointerEvents:'none',zIndex:'2147483646'});
    if(o.highlightTarget){const b=document.createElement('div');Object.assign(b.style,{position:'fixed',left:`${Math.max(0,r.left-4)}px`,top:`${Math.max(0,r.top-4)}px`,width:`${r.width+8}px`,height:`${r.height+8}px`,border:'3px solid #ffbf47',borderRadius:'8px'});h.append(b)}
    if(o.showStableRef||o.showAction){const l=document.createElement('div');Object.assign(l.style,{position:'fixed',left:`${Math.max(8,Math.min(innerWidth-420,r.left))}px`,top:`${Math.max(8,r.top-44)}px`,padding:'8px 10px',borderRadius:'8px',background:'rgba(10,12,15,.94)',color:'#fff',font:'600 12px ui-monospace,monospace',whiteSpace:'pre-wrap'});l.textContent=[o.showStableRef?node:'',o.showAction?action:''].filter(Boolean).join('\n');h.append(l)}document.documentElement.append(h)
  },{selector,id,o,node:step.targetNodeRef,action:step.actionRef});return id;
}
const remove=(page,id)=>id?page.evaluate(x=>document.getElementById(x)?.remove(),id):undefined;
const failed=(task,observedAt,msg)=>createExperienceReviewEvidence({task,adapterRef:ADAPTER_REF,adapterVersionRef:ADAPTER_VERSION_REF,captureState:'FAILED_SAFE',observedAt,artifact:null,deviations:[msg],limitations:['Browser capture failed safe; no substitute platform or truth class was used.'],doesNotProve:['Rendered experience evidence']});

export function createBrowserExperienceReviewAdapter({browserType=null,launchOptions={headless:true},settleMs=120}={}){
  return {adapterRef:ADAPTER_REF,adapterVersionRef:ADAPTER_VERSION_REF,platformRef:'platform.browser',async captureTasks(tasks,out){
    if(!Array.isArray(tasks))throw new TypeError('tasks must be an array');fs.mkdirSync(out,{recursive:true});const type=browserType??(await import('playwright')).chromium,browser=await type.launch(launchOptions),evidence=[];
    try{for(const task of tasks){const observedAt=new Date().toISOString(),{captureRequest:c,step,binding}=task;if(c.platformRef!=='platform.browser'){evidence.push(createExperienceReviewEvidence({task,adapterRef:ADAPTER_REF,adapterVersionRef:ADAPTER_VERSION_REF,captureState:'UNSUPPORTED',observedAt,artifact:null,unsupportedCapabilities:[c.platformRef],limitations:['Browser adapter does not substitute for native adapters.'],doesNotProve:['Native-platform behavior']}));continue}
      const page=await browser.newPage({viewport:binding.viewport});const errors=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('pageerror',e=>errors.push(e.message));
      try{await page.goto(binding.pageUrl,{waitUntil:binding.waitUntil??'load',timeout:binding.timeoutMs??30000});for(const s of c.steps){await perform(page,s,binding);if(s.reviewStepRef===step.reviewStepRef)break}if(settleMs>0)await page.waitForTimeout(binding.settleMs??settleMs);const id=await overlay(page,step,c),p=path.join(out,task.artifactFileName);await page.screenshot({path:p,fullPage:binding.fullPage??true});await remove(page,id);evidence.push(createExperienceReviewEvidence({task,adapterRef:ADAPTER_REF,adapterVersionRef:ADAPTER_VERSION_REF,captureState:'CAPTURED',observedAt,artifact:{path:path.posix.join('screenshots',task.artifactFileName),bytes:fs.statSync(p).size,sha256:hash(p),mediaType:'image/png'},deviations:errors.length?[`Console/page errors observed: ${errors.join(' | ')}`]:[],limitations:['Browser evidence proves only the exact captured request and source version.'],doesNotProve:['Model quality','human acceptance','native-platform behavior','runtime authority']}))}catch(e){evidence.push(failed(task,observedAt,e.message))}finally{await page.close()}}
    }finally{await browser.close()}return evidence;
  }};
}
// [VXG RealForever]
