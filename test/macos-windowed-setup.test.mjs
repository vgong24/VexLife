import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const bootstrapPath = path.join(ROOT, 'setup-vexlife.command');
const backendPath = path.join(ROOT, 'install', 'vexlife-setup.sh');
const windowPath = path.join(ROOT, 'install', 'vexlife-setup-window.applescript');
const bootstrap = fs.readFileSync(bootstrapPath, 'utf8');
const backend = fs.readFileSync(backendPath, 'utf8');
const windowSource = fs.readFileSync(windowPath, 'utf8');

function shellSyntax(file) {
  const result = spawnSync('/bin/bash', ['-n', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function makeFakeNode(binRoot, state = 'ABSENT') {
  const fake = [
    '#!/bin/bash',
    'set -euo pipefail',
    'if [ "${1:-}" = "--version" ]; then echo v22.0.0; exit 0; fi',
    'if [ "${1:-}" = "-e" ]; then',
    '  script="${2:-}"',
    '  if [[ "$script" == *"path"*"resolve"* ]]; then python3 -c \'import os,sys; print(os.path.abspath(sys.argv[1]))\' "${3:-.}"; exit 0; fi',
    '  input="$(cat)"',
    '  value="$(printf \'%s\' "$input" | sed -n \'s/.*"state"[[:space:]]*:[[:space:]]*"\\([^\"]*\\)".*/\\1/p\' | head -n1)"',
    '  printf \'%s\\n\' "${value:-UNKNOWN}"',
    '  exit 0',
    'fi',
    'case "${1:-}" in',
    `  */scripts/macos-lifecycle.mjs) echo '{"state":"${state}"}'; exit 0 ;;`,
    '  *) echo "UNEXPECTED_FAKE_NODE_CALL: $*" >&2; exit 91 ;;',
    'esac',
    ''
  ].join('\n');
  const file = path.join(binRoot, 'node');
  fs.writeFileSync(file, fake, { mode: 0o755 });
}

function runController(extraArgs, { state = 'ABSENT', withBrew = false } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-mac-window-test-'));
  const bin = path.join(temp, 'bin');
  const repo = path.join(temp, 'repo');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'install'), { recursive: true });
  fs.copyFileSync(backendPath, path.join(repo, 'install', 'vexlife-setup.sh'));
  makeFakeNode(bin, state);
  if (withBrew) {
    fs.writeFileSync(path.join(bin, 'brew'), '#!/bin/bash\necho brew-effect >> "$VEX_EFFECT_LOG"\n', { mode: 0o755 });
  }
  const effectLog = path.join(temp, 'effects.log');
  const result = spawnSync('/bin/bash', [path.join(repo, 'install', 'vexlife-setup.sh'), repo, '--controller', '--home', path.join(temp, 'home'), ...extraArgs], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, VEX_EFFECT_LOG: effectLog }
  });
  return { ...result, effectLog, temp };
}

test('MAC-WIN-00/03/12 exact-source bootstrap defaults to AppKit window and keeps explicit Terminal fallback', () => {
  shellSyntax(bootstrapPath);
  assert.match(bootstrap, /SETUP_MODE="\$\{VEXLIFE_SETUP_MODE:-window\}"/u);
  assert.match(bootstrap, /exec \/usr\/bin\/osascript "\$WINDOW" "\$TARGET"/u);
  assert.match(bootstrap, /exec \/bin\/bash "\$TARGET\/install\/vexlife-setup\.sh" "\$TARGET"/u);
  assert.match(bootstrap, /SOURCE_SHA/u);
  assert.ok(bootstrap.indexOf('SOURCE_SHA') < bootstrap.indexOf('osascript "$WINDOW"'));
});

test('MAC-WIN-01/02 controller vocabulary is closed and unknown actions fail before effect', () => {
  shellSyntax(backendPath);
  assert.match(backend, /inspect\|install-node\|first-setup\|open\|repair\|rebuild-preserve\|uninstall-preserve/u);
  const result = runController(['--action', 'definitely-not-admitted', '--node-install-consent', 'no', '--runtime-acquisition-consent', 'no']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown controller action/u);
  assert.equal(fs.existsSync(result.effectLog), false);
});

test('MAC-WIN-06 selected Home is an argv value and AppKit launches Bash without shell interpolation', () => {
  assert.match(windowSource, /use framework "AppKit"/u);
  assert.match(windowSource, /NSTask/u);
  assert.match(windowSource, /setArguments:\{repoRoot & "\/install\/vexlife-setup\.sh", repoRoot, "--controller", "--home", homePath/u);
  assert.doesNotMatch(windowSource, /do shell script/u);
});

test('MAC-WIN-07 inspect and cancel-compatible controller path performs no setup effect', () => {
  const result = runController(['--action', 'inspect', '--node-install-consent', 'no', '--runtime-acquisition-consent', 'no']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /VEXLIFE_CONTROLLER_STATE\tABSENT/u);
  assert.match(result.stdout, /VEXLIFE_CONTROLLER_ACTIONS\tfirst-setup/u);
  assert.equal(fs.existsSync(result.effectLog), false);
});

test('MAC-WIN-08 first setup refuses before Home/bootstrap/runtime effect without explicit runtime consent', () => {
  const result = runController(['--action', 'first-setup', '--node-install-consent', 'no', '--runtime-acquisition-consent', 'no']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /model\/runtime acquisition was not authorized/u);
  assert.equal(fs.existsSync(result.effectLog), false);
});

test('MAC-WIN-09 Node installation requires an exact consent value', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-node-consent-test-'));
  const bin = path.join(temp, 'bin');
  const repo = path.join(temp, 'repo');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(repo, 'install'), { recursive: true });
  fs.copyFileSync(backendPath, path.join(repo, 'install', 'vexlife-setup.sh'));
  fs.writeFileSync(path.join(bin, 'node'), '#!/bin/bash\nexit 127\n', { mode: 0o755 });
  const effectLog = path.join(temp, 'effects.log');
  fs.writeFileSync(path.join(bin, 'brew'), '#!/bin/bash\necho brew-effect >> "$VEX_EFFECT_LOG"\n', { mode: 0o755 });
  const result = spawnSync('/bin/bash', [path.join(repo, 'install', 'vexlife-setup.sh'), repo, '--controller', '--home', path.join(temp, 'home'), '--action', 'install-node', '--node-install-consent', 'no', '--runtime-acquisition-consent', 'no'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, VEX_EFFECT_LOG: effectLog }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Node\.js installation was not authorized/u);
  assert.equal(fs.existsSync(effectLog), false);
});

test('MAC-WIN-04/05/10/11/14 window remains a projection, not model/platform/lifecycle owner', () => {
  assert.doesNotMatch(windowSource, /https?:\/\//u);
  assert.doesNotMatch(windowSource, /sha-?256|qwen|llama\.cpp|artifactRef|profileRef/iu);
  assert.doesNotMatch(windowSource, /M4 Pro|arm64|x64/iu);
  assert.match(windowSource, /runBackend\(repoRoot, homePath, "repair"/u);
  assert.match(windowSource, /runBackend\(repoRoot, homePath, "rebuild-preserve"/u);
  assert.match(windowSource, /runBackend\(repoRoot, homePath, "uninstall-preserve"/u);
  assert.match(windowSource, /not a signed\/public build/u);
});

test('MAC-WIN-13 backend failure is surfaced and no success is synthesized from a failed task', () => {
  assert.match(windowSource, /if \(exitCode of .*\) is not 0 then/u);
  assert.match(windowSource, /showBackendFailure/u);
  assert.doesNotMatch(windowSource, /try[\s\S]*?on error[\s\S]*?exitCode:0/u);
});

test('MAC-WIN-15 Bash sources are syntax-valid; AppleScript compile remains a qualified Mac host proof', () => {
  shellSyntax(backendPath);
  shellSyntax(bootstrapPath);
  assert.match(windowSource, /^use framework "AppKit"/mu);
  assert.match(windowSource, /current application's NSAlert/u);
});
