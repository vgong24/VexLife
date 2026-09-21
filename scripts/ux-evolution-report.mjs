#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import{assertUxEvolutionRegistry,deriveProjectionCoverageReport}from'../src/core/ux-evolution.mjs';
const a=process.argv.slice(2),json=a.includes('--json'),arg=a.find(x=>x.startsWith('--registry='));
if(a.some(x=>x!=='--json'&&!x.startsWith('--registry=')))throw new Error('Usage: ux-evolution-report [--json] [--registry=<path>]');
const r=JSON.parse(fs.readFileSync(path.resolve(process.cwd(),arg?arg.slice(11):'blueprint/ux-evolution-registry.json'),'utf8')),v=assertUxEvolutionRegistry(r);
const o={schemaVersion:'vexlife.ux-evolution-e0-a-report/v1',registryRef:r.registryRef,stageRef:r.stageRef,baselineRef:r.referenceBaseline.baselineRef,validationState:v.state,browserBehaviorChange:v.browserBehaviorChange,cutoverAllowed:v.cutoverAllowed,migrationRecordCount:v.migrationRecordCount,findingCount:v.findingCount,visualScenarioCount:v.visualScenarioCount,supportingUxSurfaceCount:v.supportingUxSurfaceCount,coverage:deriveProjectionCoverageReport(r)};
process.stdout.write(json?JSON.stringify(o,null,2)+'\n':['UX Evolution E0-A: '+o.validationState,'registry='+o.registryRef,'migrationRecords='+o.migrationRecordCount,'findings='+o.findingCount,'visualScenarios='+o.visualScenarioCount,'supportingUxSurfaces='+o.supportingUxSurfaceCount,'browserBehaviorChange='+o.browserBehaviorChange,'cutoverAllowed='+o.cutoverAllowed,'coverage='+JSON.stringify(o.coverage.counts)].join('\n')+'\n');
// [VXG RealForever]
