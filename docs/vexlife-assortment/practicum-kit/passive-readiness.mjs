#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connectPreview, evaluate, waitFor } from './cdp-client.mjs';

const args = process.argv.slice(2);
const arg = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const runtimePath = arg('--runtime') ?? path.join(os.homedir(), '.vexlife-preview', 'runtime.json');
const contractPath = arg('--contract');
if (!contractPath) throw new Error('Usage: passive-readiness.mjs --contract <json> [--runtime <runtime.json>]');
const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
if (contract.previewRef && runtime.previewRef !== contract.previewRef) throw new Error('Runtime descriptor belongs to a different preview');

const cdp = await connectPreview({ debugPort: runtime.debugPort, url: runtime.url, timeoutMs: contract.timeoutMs ?? 12000 });
try {
  await waitFor(cdp, `document.readyState==='complete' && !!globalThis.__VEXLIFE_APP__`, 'VexLife application initialization', contract.timeoutMs ?? 12000);
  if (contract.expectedProjection) {
    await waitFor(cdp, `document.querySelector('#app')?.dataset.uxProjection===${JSON.stringify(contract.expectedProjection)}`, `projection ${contract.expectedProjection}`, contract.timeoutMs ?? 12000);
  }
  const controls = Array.isArray(contract.controls) ? contract.controls : [];
  const result = await evaluate(cdp, `(()=>{
    const selectors=${JSON.stringify(controls)};
    const details=[];
    for(const item of selectors){
      const selector=typeof item==='string'?item:item.selector;
      const element=document.querySelector(selector);
      if(!element){details.push({selector,ok:false,reason:'MISSING'});continue;}
      const rect=element.getBoundingClientRect();
      const style=getComputedStyle(element);
      const centerX=rect.left+rect.width/2;
      const centerY=rect.top+rect.height/2;
      const hit=rect.width>0&&rect.height>0?document.elementFromPoint(centerX,centerY):null;
      const hitOwned=Boolean(hit&&(hit===element||element.contains(hit)));
      const inert=Boolean(element.closest('[inert]'));
      const disabled=Boolean(element.disabled||element.getAttribute('aria-disabled')==='true');
      const visible=rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&style.opacity!=='0';
      const pointer=style.pointerEvents!=='none';
      const ok=visible&&pointer&&!inert&&!disabled&&hitOwned;
      details.push({selector,ok,visible,pointer,inert,disabled,hitOwned,tag:element.tagName,text:(element.textContent||'').trim().slice(0,120),rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},hitTag:hit?.tagName??null,hitId:hit?.id??null});
    }
    return {appReady:Boolean(globalThis.__VEXLIFE_APP__),projection:document.querySelector('#app')?.dataset.uxProjection??null,controls:details};
  })()`);
  const failed = result.controls.filter((item) => !item.ok);
  const output = {
    schemaVersion: 'vexlife-assortment.passive-readiness/v1',
    previewRef: runtime.previewRef,
    state: failed.length ? 'FAILED' : 'PASS',
    appReady: result.appReady,
    projection: result.projection,
    controls: result.controls
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failed.length) process.exitCode = 1;
} finally { cdp.close(); }
