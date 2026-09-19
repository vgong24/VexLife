import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { semanticHash } from '../src/core/utils.mjs';
import {
  BROWSER_FAMILY_CONVERSATION_API_PATH,
  BROWSER_FAMILY_LIFECYCLE_API_PATH,
  createVexLifeBrowserServer
} from '../scripts/serve-browser.mjs';

const T0='2026-09-18T12:00:00.000Z';
const T9='2026-09-18T13:00:00.000Z';

function hash(value,field){
  const core=structuredClone(value);
  return Object.freeze({...core,[field]:semanticHash(core)});
}

function authority(){
  const membership=hash({
    schemaVersion:'vexlife.bridge-device-membership/v1',
    membershipRef:'membership.home.victor',
    homeNodeRef:'home.vf07c0.http',
    principalRef:'principal.victor',
    deviceRef:'device.victor',
    devicePublicKey:'public-key-victor',
    capabilityRefs:['capability.family'],
    approvedBy:'principal.victor',
    approvedAt:'2026-09-18T11:50:00.000Z',
    revocationGeneration:1,
    state:'ACTIVE'
  },'membershipHash');
  const lease=hash({
    schemaVersion:'vexlife.bridge-capability-lease/v1',
    leaseRef:'lease.family.victor.1',
    homeNodeRef:'home.vf07c0.http',
    principalRef:'principal.victor',
    deviceRef:'device.victor',
    capabilityRefs:['capability.family'],
    projectRefs:['project.vex-family'],
    issuedAt:'2026-09-18T11:50:00.000Z',
    expiresAt:T9,
    revocationGeneration:1,
    state:'ACTIVE'
  },'leaseHash');
  return Object.freeze({membership,lease,currentRevocationGeneration:1});
}

function tempHome(t){
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'vf07c0-http-'));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  return home;
}

async function listen(server,t){
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const address=server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function post(base,body){
  const response=await fetch(base+BROWSER_FAMILY_LIFECYCLE_API_PATH,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body)
  });
  return {status:response.status,body:await response.json()};
}

function fakeCompanion(){
  return Object.freeze({
    status(){return Object.freeze({state:'TEST_ONLY'});},
    async performTurn(){
      throw new Error('Family lifecycle HTTP proof must not invoke model work');
    }
  });
}

test('LFB-10 HTTP HOST uses dedicated server lifecycle authority and rejects browser authority fields',async t=>{
  const home=tempHome(t);
  const current=authority();
  const calls=[];
  const server=createVexLifeBrowserServer({
    companionBridge:fakeCompanion(),
    familyConversationHome:home,
    familyLifecycleHome:home,
    familyLifecycleNow:()=>T0,
    familyLifecycleInstanceRef:'instance.vf07c0.http',
    resolveFamilyLifecycleAuthority:async context=>{
      calls.push(context);
      return current;
    }
  });
  const base=await listen(server,t);

  const hosted=await post(base,{
    operation:'HOST',
    intent:{idempotencyKey:'intent.vf07c0.http-host'}
  });
  assert.equal(hosted.status,200);
  assert.equal(hosted.body.operation,'HOST');
  assert.match(hosted.body.result.spaceRef,/^space\.vex\.family\./u);
  assert.equal(calls.length,1);
  assert.equal(calls[0].operation,'HOST');

  const forged=await post(base,{
    operation:'HOST',
    intent:{
      idempotencyKey:'intent.vf07c0.http-forged',
      principalRef:'principal.attacker'
    }
  });
  assert.equal(forged.status,400);
  assert.equal(forged.body.failureCode,'BROWSER_FAMILY_LIFECYCLE_UNTRUSTED_FIELD');
});

test('LFB-10 production-default lifecycle authority absence fails closed',async t=>{
  const home=tempHome(t);
  const server=createVexLifeBrowserServer({
    companionBridge:fakeCompanion(),
    familyLifecycleHome:home,
    familyLifecycleNow:()=>T0
  });
  const base=await listen(server,t);
  const result=await post(base,{
    operation:'HOST',
    intent:{idempotencyKey:'intent.vf07c0.http-held'}
  });
  assert.equal(result.status,503);
  assert.equal(result.body.failureCode,'FAMILY_LIFECYCLE_AUTHORITY_UNAVAILABLE');
});

test('LFB-11 existing Family conversation route remains distinct and method contract unchanged',async t=>{
  const home=tempHome(t);
  const server=createVexLifeBrowserServer({
    companionBridge:fakeCompanion(),
    familyConversationHome:home,
    familyLifecycleHome:home
  });
  const base=await listen(server,t);
  const response=await fetch(base+BROWSER_FAMILY_CONVERSATION_API_PATH,{method:'GET'});
  assert.equal(response.status,405);
  assert.equal(response.headers.get('allow'),'POST');
});

test('LFB-10 lifecycle route admits POST only',async t=>{
  const home=tempHome(t);
  const server=createVexLifeBrowserServer({
    companionBridge:fakeCompanion(),
    familyLifecycleHome:home
  });
  const base=await listen(server,t);
  const response=await fetch(base+BROWSER_FAMILY_LIFECYCLE_API_PATH,{method:'GET'});
  assert.equal(response.status,405);
  assert.equal(response.headers.get('allow'),'POST');
});

// [VXG RealForever]
