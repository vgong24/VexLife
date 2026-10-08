import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_OPERATIONS,
  choicesForLifecycleState,
  cleanStop
} from '../scripts/macos-lifecycle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('macOS lifecycle exposes ordinary stop without collapsing it into uninstall', () => {
  assert.ok(ALLOWED_OPERATIONS.includes('stop'));
  assert.ok(choicesForLifecycleState('EXISTING_HEALTHY').includes('stop'));
  assert.ok(choicesForLifecycleState('EXISTING_DEGRADED_REPAIRABLE').includes('stop'));
});

test('macOS clean stop preserves protected Home when no owned processes are running', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vexlife-clean-stop-'));
  const home=path.join(root,'home'); const repo=path.join(root,'repo');
  try {
    fs.mkdirSync(path.join(home,'config'),{recursive:true}); fs.mkdirSync(repo,{recursive:true});
    fs.writeFileSync(path.join(home,'config','home.json'),JSON.stringify({schemaVersion:'vexlife.home/v0',homeRef:'vex-home.stop-test'}));
    fs.writeFileSync(path.join(home,'protected.txt'),'keep me\n');
    const result=await cleanStop(home,repo);
    assert.equal(result.state,'CLEAN_STOP_COMPLETED');
    assert.equal(result.continuityPreserved,true);
    assert.equal(result.uninstallPerformed,false);
    assert.equal(result.HomeDeleted,false); assert.equal(result.MemoryDeleted,false); assert.equal(result.modelArtifactsDeleted,false);
    assert.equal(result.foreignProcessStopped,false);
    assert.equal(fs.readFileSync(path.join(home,'protected.txt'),'utf8'),'keep me\n');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('Windows launcher exposes clean stop as a distinct non-destructive operation', () => {
  const source=fs.readFileSync(path.join(ROOT,'start-vexlife.ps1'),'utf8');
  assert.match(source,/ValidateSet\("start", "stop", "uninstall-preserve"\)/u);
  const start=source.indexOf('function Invoke-CleanStop'); const end=source.indexOf('function Invoke-UninstallPreserveContinuity');
  assert.ok(start>=0&&end>start); const stopSource=source.slice(start,end);
  assert.match(stopSource,/Stop-ExactQualifiedRuntime/u); assert.match(stopSource,/STOPPED_BY_CLEAN_STOP/u);
  assert.match(stopSource,/uninstallPerformed = \$false/u); assert.match(stopSource,/HomeDeleted = \$false/u); assert.match(stopSource,/MemoryDeleted = \$false/u); assert.match(stopSource,/modelArtifactsDeleted = \$false/u);
  assert.doesNotMatch(stopSource,/Remove-Item/u);
});

// [VXG RealForever]
