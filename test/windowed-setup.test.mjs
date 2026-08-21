import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const windowed = read('install/vexlife-setup-window.ps1');
const backend = read('install/vexlife-setup.ps1');
const launcher = read('setup-vexlife.cmd');
const readme = read('README.md');

test('windowed setup is a thin WPF projection over the accepted setup engine', () => {
  assert.match(windowed, /#requires -Version 5\.1/u);
  assert.match(windowed, /Add-Type -AssemblyName PresentationFramework/u);
  assert.match(windowed, /Title="Continue with Vex"/u);
  assert.match(windowed, /install\\vexlife-setup\.ps1/u);
  assert.match(windowed, /-RedirectStandardInput \$stdinPath/u);
  assert.match(windowed, /"-RepoRoot"/u);
  assert.match(windowed, /"-VexHome"/u);
  assert.match(windowed, /WINDOWED_SETUP_UI_READY_NO_EFFECT/u);
  assert.match(windowed, /backendInvoked = \$false/u);
});

test('windowed setup collects explicit decisions before invoking the backend', () => {
  assert.match(windowed, /NodeConsentCheck/u);
  assert.match(windowed, /RuntimeConsentCheck/u);
  assert.match(windowed, /Node\.js installation permission was not granted\. Nothing was changed\./u);
  assert.match(windowed, /Model\/runtime permission was not granted\. Nothing was changed\./u);
  assert.match(windowed, /\$inputLines\.Add\("yes"\)/u);
  assert.ok(windowed.indexOf('RuntimeConsentCheck') < windowed.indexOf('Start-Process -FilePath "powershell.exe"'));
});

test('windowed setup does not duplicate model runtime Home or process effect ownership', () => {
  const forbidden = [
    /huggingface/iu,
    /\.gguf/iu,
    /sha-?256/iu,
    /downloadVerifiedArtifact/u,
    /scripts\\bootstrap\.mjs/u,
    /scripts\\initialize-vex\.mjs/u,
    /Stop-Process/u,
    /Remove-Item[^\r\n]*(?:\.vexlife|VexHome)/iu,
    /platforms\\windows/iu
  ];
  for (const pattern of forbidden) assert.doesNotMatch(windowed, pattern);
});

test('accepted backend prompt order remains compatible with deterministic controller transcript', () => {
  const nodePrompt = backend.indexOf('May I install Node.js LTS now?');
  const runtimePrompt = backend.indexOf('Continue with the verified local model/runtime?');
  assert.ok(nodePrompt >= 0);
  assert.ok(runtimePrompt > nodePrompt);
  assert.match(backend, /param\(\s*\[string\]\$RepoRoot = "",\s*\[string\]\$VexHome = ""\s*\)/u);
  assert.match(backend, /if \(\[string\]::IsNullOrWhiteSpace\(\$VexHome\)\)/u);
});

test('root setup launcher is one hop into the windowed controller', () => {
  assert.match(launcher, /^@echo off\r?\nsetlocal\r?\n/u);
  assert.match(launcher, /powershell\.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%install\\vexlife-setup-window\.ps1" -RepoRoot "%ROOT%" %\*/u);
  assert.equal((launcher.match(/powershell\.exe/giu) ?? []).length, 1);
  assert.doesNotMatch(launcher, /node|winget|model|runtime|curl|Invoke-WebRequest/iu);
});

test('README exposes the source-local window without claiming a signed public build', () => {
  assert.match(readme, /setup-vexlife\.cmd/u);
  assert.match(readme, /Continue with Vex/u);
  assert.match(readme, /source-local window/u);
  assert.match(readme, /not a signed\/public `OFFICIAL_VERIFIED_BUILD`/u);
  assert.match(readme, /PowerShell fallback/u);
  assert.match(readme, /model\/runtime artifacts remain external/u);
});

test('controller files do not introduce model artifacts or the full native Windows shell', () => {
  for (const relative of ['install/vexlife-setup-window.ps1', 'setup-vexlife.cmd']) {
    const source = read(relative);
    assert.doesNotMatch(source, /(?:qwen|llama-server|model-projector|gguf|huggingface)/iu);
  }
});

// [VXG RealForever]
