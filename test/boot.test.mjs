import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBootstrapPlan, applyBootstrapPlan, HOME_DIRECTORIES } from '../src/core/boot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('bootstrap dry run is cross-platform descriptive and writes nothing', () => {
  const root = path.join(os.tmpdir(), `vexlife-dry-${Date.now()}`);
  const plan = buildBootstrapPlan({ home: root, deviceName: 'MacBook', platform: 'darwin', architecture: 'arm64' });
  const result = applyBootstrapPlan(plan, { dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(fs.existsSync(root), false);
  assert.equal(plan.installation.platform, 'darwin');
  assert.equal(plan.modelArtifactStoredInGit, false);
  assert.equal(plan.culture.sourceRepositoryPath, 'docs/CULTURE.md');
});

test('bootstrap creates a distinct device lineage and refuses to overwrite existing home', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-home-'));
  fs.rmSync(root, { recursive: true, force: true });
  const plan = buildBootstrapPlan({ home: root, personRef: 'person.victor', familyRef: 'family.victor', deviceName: 'Windows', platform: 'win32', architecture: 'x64' });
  const first = applyBootstrapPlan(plan);
  assert.equal(first.applied, true);
  for (const directory of HOME_DIRECTORIES) assert.equal(fs.existsSync(path.join(root, directory)), true);
  assert.equal(fs.existsSync(path.join(root, 'culture/active-culture.md')), true);
  assert.equal(fs.existsSync(path.join(root, 'culture/manifest.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'dream/policy.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'training/policy.json')), true);
  const culture = JSON.parse(fs.readFileSync(path.join(root, 'culture/manifest.json'), 'utf8'));
  assert.equal(culture.personalMemoryImported, false);
  assert.equal(culture.sourceRepositoryPath, 'docs/CULTURE.md');
  const family = JSON.parse(fs.readFileSync(path.join(root, 'family/family.json'), 'utf8'));
  assert.equal(family.identityPolicy, 'SIBLINGS_NOT_ONE_SEAMLESS_INSTANCE');
  const second = applyBootstrapPlan(plan);
  assert.equal(second.existing, true);
  assert.equal(second.reason, 'EXISTING_HOME_REQUIRES_MIGRATION_PLAN');
  fs.rmSync(root, { recursive: true, force: true });
});

test('W6 Windows launcher exposes only start and uninstall-preserve lifecycle modes', () => {
  const script = fs.readFileSync(path.join(ROOT, 'start-vexlife.ps1'), 'utf8');
  assert.match(script, /ValidateSet\("start", "uninstall-preserve"\)/u);
  assert.match(script, /\[string\]\$Operation = "start"/u);
  assert.match(script, /if \(\$Operation -eq "uninstall-preserve"\) \{\s*Invoke-UninstallPreserveContinuity\s*\}/u);
  assert.ok(
    script.indexOf('Invoke-UninstallPreserveContinuity') < script.indexOf('$ArgsList = @("$Root/scripts/bootstrap.mjs"'),
    'uninstall-preserve must branch before bootstrap/start'
  );
  assert.equal(/ValidateSet\([^)]*remove-local-data/iu.test(script), false);
});


test('W6 Windows launcher never shadows PowerShell automatic HOME with a writable parameter or script variable', () => {
  const script = fs.readFileSync(path.join(ROOT, 'start-vexlife.ps1'), 'utf8');
  assert.match(script, /\[Alias\("Home"\)\]\s*\[string\]\$VexHome = ""/u);
  assert.match(script, /\$resolvedHomeInput = \$VexHome/u);
  assert.match(script, /Join-Path \$HOME "\.vexlife"/u);
  assert.equal(/\[string\]\$Home\b/iu.test(script), false);
  assert.equal(/\$script:Home\b/iu.test(script), false);
  assert.equal(/if \(\$Home -ne ""\)/iu.test(script), false);
});

test('W6 uninstall-preserve is bounded to exact current browser process receipt and exact runtime materialization', () => {
  const script = fs.readFileSync(path.join(ROOT, 'start-vexlife.ps1'), 'utf8');
  for (const required of [
    'vexlife.browser-process-receipt/v1',
    'processInstanceRef',
    'ownerToken',
    '--vexlife-browser-owner-token',
    '--vexlife-home',
    '--vexlife-repo',
    'Get-OwnedBrowserServer',
    'Write-BrowserProcessReceipt',
    'Set-BrowserProcessReceiptStopped',
    '$actualTokens.Count -eq $expectedTokens.Count',
    '$tokens.Count -eq $expected.Count',
    'EXACT_CURRENT_BROWSER_PROCESS_INSTANCE_STOPPED'
  ]) assert.ok(script.includes(required), 'missing exact browser process-instance boundary: ' + required);
  for (const required of [
    'Get-ExactQualifiedRuntimeOwnership',
    'runtime.executableSha256',
    'materialization.executableSha256',
    'process.ExecutablePath',
    'Get-FileHash -LiteralPath $expectedExecutablePath -Algorithm SHA256',
    'expectedModelPath',
    'expectedProjectorPath',
    'argumentTemplate',
    '--n-predict',
    '--reasoning-budget',
    '$actualTokens.Count -eq $expectedTokens.Count',
    'EXACT_QUALIFIED_RUNTIME_STOPPED'
  ]) assert.ok(script.includes(required), 'missing exact runtime-stop ownership boundary: ' + required);
  assert.ok(script.indexOf('$ownedBrowser = Get-OwnedBrowserServer') < script.indexOf('Stop-Process -Id $serverPid'), 'browser ownership proof must precede stop');
  assert.ok(script.indexOf('$runtimeOwnership = Get-ExactQualifiedRuntimeOwnership') < script.indexOf('Stop-Process -Id ([int]$runtimeOwnership.pid)'), 'runtime ownership proof must precede stop');
  assert.equal(script.includes('$machine.server.pid'), false, 'uninstall must consume the durable current browser-process receipt, not a historical install PID');
  assert.match(script, /runtime\/serve-browser\.log/u);
  assert.match(script, /runtime\/serve-browser\.err\.log/u);
  assert.equal(/Remove-Item[^\n]*(?:\$homeRoot|\$Home)[^\n]*-Recurse/iu.test(script), false);
  assert.equal(/Remove-Item[^\n]*(?:models|conversations|context|recovery|memory|score)/iu.test(script), false);
});

test('W6 uninstall-preserve proves continuity fingerprints and denies destructive authority', () => {
  const script = fs.readFileSync(path.join(ROOT, 'start-vexlife.ps1'), 'utf8');
  for (const required of [
    'UNINSTALL_PRESERVE_CONTINUITY',
    'ALREADY_UNINSTALLED_PRESERVE_CONTINUITY',
    'protectedFingerprintBefore',
    'protectedFingerprintAfter',
    'identitySha256Before',
    'identitySha256After',
    'conversationHeads',
    'continuityPreserved = $continuityPreserved',
    'localDataDeleted = $false',
    'MemoryPreserved = $true',
    'recoveryMaterialPreserved = $true',
    'modelArtifactsPreserved = $true',
    'destructiveLocalDataRemovalAvailable = $false',
    'HomeDeletionAuthority = $false',
    'MemoryDeletionAuthority = $false',
    'modelArtifactRemoval = $false',
    'uninstallReceiptGrantsDestructiveAuthority = $false'
  ]) assert.ok(script.includes(required), `missing W6 boundary: ${required}`);
  assert.match(script, /ReparsePoint/u);
  assert.match(script, /UNINSTALL_RUNTIME_REMOVED_CONTINUITY_MISMATCH/u);
});

test('ONB preservation stage binds the executable W6 route without becoming an effect itself', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs/HUMAN-ONBOARDING-GUIDED-LOCAL-ESTABLISHMENT.md'), 'utf8');
  assert.match(doc, /UNDERSTAND_UNINSTALL_AND_PRESERVATION/u);
  assert.match(doc, /effectClass=DECLARATIVE_NO_EFFECT/u);
  assert.match(doc, /start-vexlife\.ps1 -Operation uninstall-preserve -Home/u);
  assert.match(doc, /route\.vexlife\.windows\.uninstall-preserve-continuity\.001/u);
  assert.match(doc, /STOP_SERVER != UNINSTALL_PRODUCT/u);
  assert.match(doc, /UNINSTALL_PRODUCT != DELETE_HOME/u);
  assert.match(doc, /REMOVE_RUNTIME != DELETE_HOME/u);
  assert.match(doc, /REMOVE_MODEL_ARTIFACT != DELETE_HOME/u);
  assert.match(doc, /UNINSTALL_RECEIPT != DESTRUCTIVE_AUTHORITY/u);
  assert.match(doc, /UNINSTALL_AND_REMOVE_LOCAL_DATA[^\n]*not reachable/iu);
});

// [VXG RealForever]
