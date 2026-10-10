#!/usr/bin/env node
// [VXG RealForever]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT=path.dirname(fileURLToPath(import.meta.url));
const SRC=path.resolve(process.argv[2]??'');
if(!SRC)throw new Error('Usage: node PATCH-PREVIEW.mjs <exact-vexlife-checkout>');
const binding=JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT,'BINDING.json'),'utf8'));
const additions=JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT,'payload/strings-additions.json'),'utf8'));
const read=(rel)=>fs.readFileSync(path.join(SRC,rel),'utf8');
const write=(rel,value)=>{const target=path.join(SRC,rel);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,value,'utf8')};
const git=(...args)=>execFileSync('git',args,{cwd:SRC,encoding:'utf8'}).trim();
const assert=(value,message)=>{if(!value)throw new Error(message)};

assert(git('rev-parse','HEAD')===binding.predecessorSourceHead,`HEAD_BINDING_MISMATCH:${git('rev-parse','HEAD')}!=${binding.predecessorSourceHead}`);
const predecessorPatch=path.resolve(PACKAGE_ROOT,binding.predecessorPatch);
execFileSync(process.execPath,[predecessorPatch,SRC],{cwd:SRC,stdio:['ignore','pipe','pipe'],encoding:'utf8',maxBuffer:32*1024*1024});

for(const language of ['en','zh','ja']){
  const rel=`blueprint/strings/${language}.json`,catalog=JSON.parse(read(rel));
  for(const [ref,value] of Object.entries(additions[language])){assert(!Object.hasOwn(catalog,ref),`LOCALIZATION_REF_COLLISION:${language}:${ref}`);catalog[ref]=value;}
  write(rel,JSON.stringify(catalog,null,2)+'\n');
}

write('reference/browser/evolution/assortment-continuity-projection.js',fs.readFileSync(path.join(PACKAGE_ROOT,'payload/assortment-continuity-projection.js'),'utf8'));
write('reference/browser/evolution/assortment-fixtures.json',fs.readFileSync(path.join(PACKAGE_ROOT,'payload/assortment-fixtures.json'),'utf8'));
const cssRel='reference/browser/evolution/assortment-continuity.css';
const css=read(cssRel),extension=fs.readFileSync(path.join(PACKAGE_ROOT,'payload/live-evolution.css'),'utf8');
assert(!css.includes('assortment-truth-switch'),'LIVE_EVOLUTION_CSS_ALREADY_PRESENT');
write(cssRel,css.trimEnd()+'\n'+extension);

const changed=git('status','--short').split('\n').filter(Boolean);
const result={schemaVersion:'vexlife-assortment.live-evolution-practicum-patch/v1',previewRef:binding.candidatePreviewRef,state:'FORMED',head:binding.predecessorSourceHead,changed,truthDefault:binding.defaults.truthMode,fixtureFallbackInLive:binding.defaults.fixtureFallbackInLive};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
// [VXG RealForever]
