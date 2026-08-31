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

function makeFakeNode(binRoot, state = 'ABSENT', choices = null) {
  const defaultChoices = state === 'ABSENT' ? ['start'] : state === 'EXISTING_HEALTHY' ? ['start', 'repair', 'rebuild-preserve', 'uninstall-preserve'] : state === 'EXISTING_DEGRADED_REPAIRABLE' ? ['repair', 'rebuild-preserve', 'uninstall-preserve'] : [];
  const lifecycleJson = JSON.stringify({ state, choices: choices ?? defaultChoices });
  const fake = [
    '#!/bin/bash',
    'set -euo pipefail',
    'if [ "${1:-}" = "--version" ]; then echo v22.0.0; exit 0; fi',
    'if [ "${1:-}" = "--input-type=module" ]; then cat >/dev/null; exit 0; fi',
    'if [ "${1:-}" = "-e" ]; then',
    '  script="${2:-}"',
    '  if [[ "$script" == *"path"*"resolve"* ]]; then python3 -c \'import os,sys; print(os.path.abspath(sys.argv[1]))\' "${3:-.}"; exit 0; fi',
    '  input="$(cat)"',
    `  if [[ "$script" == *"choices.join"* ]]; then printf '%s' "$input" | python3 -c 'import json,sys; print(",".join(map(str,json.load(sys.stdin).get("choices",[]))))'; exit 0; fi`,
    '  value="$(printf \'%s\' "$input" | sed -n \'s/.*"state"[[:space:]]*:[[:space:]]*"\\([^\"]*\\)".*/\\1/p\' | head -n1)"',
    '  printf \'%s\\n\' "${value:-UNKNOWN}"',
    '  exit 0',
    'fi',
    'case "${1:-}" in',
    '  */scripts/initialize-vex.mjs)',
    '    shift',
    '    probe_home=""',
    '    while [ "$#" -gt 0 ]; do',
    '      if [ "$1" = "--home" ] && [ "$#" -ge 2 ]; then probe_home="$2"; break; fi',
    '      shift',
    '    done',
    '    if [ -n "${VEX_FAKE_EXPECT_PROBE_ROOT:-}" ] && [[ "$probe_home" != "$VEX_FAKE_EXPECT_PROBE_ROOT"/.vexlife-host-eligibility-* ]]; then',
    '      printf \'%s\\n\' \'{"state":"PROBE_HOME_MISMATCH"}\'',
    '      exit 7',
    '    fi',
    '    if [ "${VEX_FAKE_HOST_ELIGIBLE:-yes}" = "yes" ]; then printf \'%s\\n\' \'{"state":"HOME_NOT_ESTABLISHED"}\'; exit 5; else printf \'%s\\n\' \'{"state":"UNSUPPORTED_HOST"}\'; exit 6; fi',
    '    ;;',
    '  */scripts/macos-lifecycle.mjs)',
    '    if [ "${VEX_FAKE_LIFECYCLE_START_FAIL:-no}" = "yes" ] && [[ " $* " == *" --operation start "* ]]; then echo FAKE_LIFECYCLE_START_REACHED >&2; exit 92; fi',
    `    printf '%s\\n' '${lifecycleJson}'; exit 0 ;;`,
    '  *) echo "UNEXPECTED_FAKE_NODE_CALL: $*" >&2; exit 91 ;;',
    'esac',
    ''
  ].join('\n');
  const file = path.join(binRoot, 'node');
  fs.writeFileSync(file, fake, { mode: 0o755 });
}

function runController(extraArgs, { state = 'ABSENT', choices = null, withBrew = false, hostEligible = true, lifecycleStartFails = false } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-mac-window-test-'));
  const bin = path.join(temp, 'bin');
  const repo = path.join(temp, 'repo');
  const selectedHome = path.join(temp, 'home');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'install'), { recursive: true });
  fs.copyFileSync(backendPath, path.join(repo, 'install', 'vexlife-setup.sh'));
  makeFakeNode(bin, state, choices);
  if (withBrew) {
    fs.writeFileSync(path.join(bin, 'brew'), '#!/bin/bash\necho brew-effect >> "$VEX_EFFECT_LOG"\n', { mode: 0o755 });
  }
  const effectLog = path.join(temp, 'effects.log');
  const result = spawnSync('/bin/bash', [path.join(repo, 'install', 'vexlife-setup.sh'), repo, '--controller', '--home', selectedHome, ...extraArgs], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      VEX_EFFECT_LOG: effectLog,
      VEX_FAKE_HOST_ELIGIBLE: hostEligible ? 'yes' : 'no',
      VEX_FAKE_EXPECT_PROBE_ROOT: selectedHome,
      VEX_FAKE_LIFECYCLE_START_FAIL: lifecycleStartFails ? 'yes' : 'no'
    }
  });
  return { ...result, effectLog, temp, selectedHome };
}

test('MAC-WIN-00/03/12 exact-source bootstrap defaults to an app-hosted AppKit window and keeps explicit Terminal fallback', () => {
  shellSyntax(bootstrapPath);
  assert.match(bootstrap, /SETUP_MODE="\$\{VEXLIFE_SETUP_MODE:-window\}"/u);
  assert.match(bootstrap, /WINDOW_APP="\$TMP_ROOT\/VexLife Setup\.app"/u);
  assert.match(bootstrap, /\/usr\/bin\/osacompile -o "\$WINDOW_APP" "\$WINDOW"/u);
  assert.match(bootstrap, /\/usr\/bin\/plutil -insert VexLifeSourceRoot -string "\$TARGET" "\$INFO_PLIST"/u);
  assert.match(bootstrap, /BOUND_SOURCE_ROOT=.*VexLifeSourceRoot/u);
  assert.match(bootstrap, /\/usr\/bin\/open -W -n "\$WINDOW_APP"/u);
  assert.doesNotMatch(bootstrap, /exec \/usr\/bin\/osascript "\$WINDOW" "\$TARGET"/u);
  assert.match(bootstrap, /exec \/bin\/bash "\$TARGET\/install\/vexlife-setup\.sh" "\$TARGET"/u);
  assert.match(bootstrap, /SOURCE_SHA/u);
  assert.ok(bootstrap.indexOf('SOURCE_SHA') < bootstrap.indexOf('osacompile -o "$WINDOW_APP"'));
});

test('MAC-WIN-01/02 controller vocabulary is closed and unknown actions fail before effect', () => {
  shellSyntax(backendPath);
  assert.match(backend, /inspect\|install-node\|first-setup\|open\|repair\|rebuild-preserve\|uninstall-preserve/u);
  const result = runController(['--action', 'definitely-not-admitted', '--node-install-consent', 'no', '--runtime-acquisition-consent', 'no']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown controller action/u);
  assert.equal(fs.existsSync(result.effectLog), false);
});


test('MAC-WIN-02 lifecycle owner choices, not the state label alone, govern controller admission', () => {
  const inspect = runController(['--action', 'inspect', '--node-install-consent', 'no', '--runtime-acquisition-consent', 'no'], {
    state: 'EXISTING_HEALTHY', choices: ['repair']
  });
  assert.equal(inspect.status, 0, inspect.stderr);
  assert.match(inspect.stdout, /VEXLIFE_CONTROLLER_ACTIONS\trepair/u);
  assert.doesNotMatch(inspect.stdout, /VEXLIFE_CONTROLLER_ACTIONS\t[^\n]*open/u);

  const rejected = runController(['--action', 'open', '--node-install-consent', 'no', '--runtime-acquisition-consent', 'no'], {
    state: 'EXISTING_HEALTHY', choices: ['repair']
  });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /not admitted by the lifecycle owner's current choices/u);
  assert.equal(fs.existsSync(rejected.effectLog), false);
});

test('MAC-WIN-05 host eligibility preflight is selected-Home anchored and remains no-effect', () => {
  const inspect = runController(['--action', 'inspect', '--node-install-consent', 'no', '--runtime-acquisition-consent', 'no'], {
    state: 'ABSENT', hostEligible: true
  });
  assert.equal(inspect.status, 0, inspect.stderr);
  assert.match(inspect.stdout, /VEXLIFE_CONTROLLER_STATE\tABSENT/u);
  assert.match(inspect.stdout, /VEXLIFE_CONTROLLER_ACTIONS\tfirst-setup/u);
  assert.equal(fs.existsSync(inspect.selectedHome), false);
  assert.equal(fs.existsSync(inspect.effectLog), false);
});

test('MAC-WIN-05 unsupported host is held before setup action projection or effect', () => {
  const inspect = runController(['--action', 'inspect', '--node-install-consent', 'no', '--runtime-acquisition-consent', 'no'], {
    state: 'ABSENT', hostEligible: false
  });
  assert.notEqual(inspect.status, 0);
  assert.match(inspect.stdout, /VEXLIFE_CONTROLLER_STATE\tHOST_ELIGIBILITY_HELD/u);
  assert.match(inspect.stdout, /VEXLIFE_CONTROLLER_ACTIONS\t(?:\n|$)/u);
  assert.doesNotMatch(inspect.stdout, /first-setup/u);
  assert.match(inspect.stderr, /could not prove this Mac eligible/u);
  assert.equal(fs.existsSync(inspect.effectLog), false);

  const direct = runController(['--action', 'first-setup', '--node-install-consent', 'no', '--runtime-acquisition-consent', 'yes'], {
    state: 'ABSENT', hostEligible: false
  });
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /could not prove this Mac eligible/u);
  assert.equal(fs.existsSync(direct.effectLog), false);
  assert.equal(fs.existsSync(direct.selectedHome), false);
});

test('MAC-WIN-05/10 host-ineligible existing Home retains only lifecycle-admitted uninstall-preserve', () => {
  const inspect = runController(['--action', 'inspect', '--node-install-consent', 'no', '--runtime-acquisition-consent', 'no'], {
    state: 'EXISTING_DEGRADED_REPAIRABLE',
    choices: ['repair', 'rebuild-preserve', 'uninstall-preserve'],
    hostEligible: false
  });
  assert.equal(inspect.status, 0, inspect.stderr);
  assert.match(inspect.stdout, /VEXLIFE_CONTROLLER_STATE\tEXISTING_DEGRADED_REPAIRABLE/u);
  assert.match(inspect.stdout, /VEXLIFE_CONTROLLER_ACTIONS\tuninstall-preserve(?:\n|$)/u);
  assert.doesNotMatch(inspect.stdout, /VEXLIFE_CONTROLLER_ACTIONS\t[^\n]*(?:repair|rebuild-preserve|first-setup|open)/u);
  assert.equal(fs.existsSync(inspect.effectLog), false);
});

test('MAC-WIN-10 host eligibility cannot veto lifecycle-admitted uninstall-preserve', () => {
  const allowed = runController(['--action', 'uninstall-preserve', '--node-install-consent', 'no', '--runtime-acquisition-consent', 'no'], {
    state: 'EXISTING_DEGRADED_REPAIRABLE',
    choices: ['uninstall-preserve'],
    hostEligible: false
  });
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.match(allowed.stdout, /VEXLIFE_CONTROLLER_RESULT\tUNINSTALL_PRESERVE_COMPLETE/u);
  assert.doesNotMatch(allowed.stderr, /could not prove this Mac eligible/u);

  const rejected = runController(['--action', 'uninstall-preserve', '--node-install-consent', 'no', '--runtime-acquisition-consent', 'no'], {
    state: 'EXISTING_DEGRADED_REPAIRABLE',
    choices: ['repair'],
    hostEligible: false
  });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /not admitted by the lifecycle owner's current choices/u);
  assert.doesNotMatch(rejected.stderr, /could not prove this Mac eligible/u);
});

test('MAC-WIN-05/10 host-ineligible healthy Home retains lifecycle open reuse plus uninstall, not repair/rebuild', () => {
  const inspect = runController(['--action', 'inspect', '--node-install-consent', 'no', '--runtime-acquisition-consent', 'no'], {
    state: 'EXISTING_HEALTHY',
    choices: ['start', 'repair', 'rebuild-preserve', 'uninstall-preserve'],
    hostEligible: false
  });
  assert.equal(inspect.status, 0, inspect.stderr);
  assert.match(inspect.stdout, /VEXLIFE_CONTROLLER_STATE\tEXISTING_HEALTHY/u);
  assert.match(inspect.stdout, /VEXLIFE_CONTROLLER_ACTIONS\topen,uninstall-preserve(?:\n|$)/u);
  assert.doesNotMatch(inspect.stdout, /VEXLIFE_CONTROLLER_ACTIONS\t[^\n]*(?:repair|rebuild-preserve|first-setup)/u);
  assert.equal(fs.existsSync(inspect.effectLog), false);
});

test('MAC-WIN-10 healthy open delegates reuse-or-reinitialize to lifecycle owner instead of controller host veto', () => {
  const opened = runController(['--action', 'open', '--node-install-consent', 'no', '--runtime-acquisition-consent', 'no'], {
    state: 'EXISTING_HEALTHY',
    choices: ['start'],
    hostEligible: false,
    lifecycleStartFails: true
  });
  assert.notEqual(opened.status, 0);
  assert.match(opened.stderr, /FAKE_LIFECYCLE_START_REACHED|stopped safely before completing start/u);
  assert.doesNotMatch(opened.stderr, /could not prove this Mac eligible/u);
});

test('MAC-WIN-05 repair and rebuild remain host-gated after healthy-open reuse correction', () => {
  for (const action of ['repair', 'rebuild-preserve']) {
    const result = runController(['--action', action, '--node-install-consent', 'no', '--runtime-acquisition-consent', 'yes'], {
      state: 'EXISTING_DEGRADED_REPAIRABLE',
      choices: [action],
      hostEligible: false
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /could not prove this Mac eligible/u);
    assert.equal(fs.existsSync(result.effectLog), false);
  }
});

test('MAC-WIN-06 app-hosted source root is bundle-authoritative and remains data without shell interpolation', () => {
  assert.match(windowSource, /use framework "AppKit"/u);
  assert.match(windowSource, /property sourceRootInfoKey : "VexLifeSourceRoot"/u);
  assert.match(windowSource, /set bundledRoot to current application's NSBundle's mainBundle\(\)'s objectForInfoDictionaryKey:sourceRootInfoKey/u);
  assert.match(windowSource, /if bundledRoot is not missing value then[\s\S]*?if \(count of argv\) is not 0 then return missing value[\s\S]*?return boundRoot/u);
  assert.match(windowSource, /if \(count of argv\) is 1 then[\s\S]*?return directRoot/u);
  assert.ok(windowSource.indexOf('if bundledRoot is not missing value then') < windowSource.indexOf('if (count of argv) is 1 then'));
  assert.doesNotMatch(windowSource, /if \(count of argv\) is 1 then[\s\S]*?else if \(count of argv\) is 0 then/u);
  assert.match(windowSource, /NSTask/u);
  assert.match(windowSource, /actionPrefix/u);
  assert.match(windowSource, /hasAction/u);
  assert.match(windowSource, /on promptChoice\(/u);
  assert.doesNotMatch(windowSource, /\b(?:on\s+ask|my\s+ask)\s*\(/u);
  assert.match(windowSource, /panel's \|center\|\(\)/u);
  assert.doesNotMatch(windowSource, /panel's center\(\)/u);
  assert.match(windowSource, /createFileAtPath:outPath \|contents\|:\(missing value\) attributes:\(missing value\)/u);
  assert.match(windowSource, /createFileAtPath:errPath \|contents\|:\(missing value\) attributes:\(missing value\)/u);
  assert.doesNotMatch(windowSource, /createFileAtPath:(?:outPath|errPath) contents:/u);
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

test('MAC-WIN-12/13 long backend work keeps an AppKit progress surface responsive and failures stay fail-closed', () => {
  assert.match(windowSource, /NSProgressIndicator/u);
  assert.match(windowSource, /NSRunLoop/u);
  assert.match(windowSource, /isRunning/u);
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
