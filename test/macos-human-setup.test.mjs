import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { qualifiedInitializationFromCurrentHome } from '../scripts/macos-lifecycle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const setupCommand = fs.readFileSync(path.join(ROOT, 'setup-vexlife.command'), 'utf8');
const setup = fs.readFileSync(path.join(ROOT, 'install', 'vexlife-setup.sh'), 'utf8');
const lifecycle = fs.readFileSync(path.join(ROOT, 'scripts', 'macos-lifecycle.mjs'), 'utf8');

test('MACHUMAN01 root Mac front door is both standalone source bootstrap and one-hop repository delegate', () => {
  assert.match(setupCommand, /^#!\/bin\/bash/m);
  assert.match(setupCommand, /REPOSITORY="vgong24\/VexLife"/);
  assert.match(setupCommand, /VEXLIFE_SOURCE_REF:-main/);
  assert.match(setupCommand, /api\.github\.com\/repos\/\$REPOSITORY\/commits\/\$SOURCE_REF/);
  assert.match(setupCommand, /codeload\.github\.com\/\$REPOSITORY\/tar\.gz\/\$SOURCE_SHA/);
  assert.match(setupCommand, /install\/vexlife-setup\.sh/);
  assert.doesNotMatch(setupCommand, /initialize-vex\.mjs/);
  assert.doesNotMatch(setupCommand, /macos-lifecycle\.mjs/);
});

test('MACHUMAN01B standalone bootstrap resolves one exact Git source before downloading and persists source outside Vex Home', () => {
  const resolveIndex = setupCommand.indexOf('api.github.com/repos/$REPOSITORY/commits/$SOURCE_REF');
  const downloadIndex = setupCommand.indexOf('codeload.github.com/$REPOSITORY/tar.gz/$SOURCE_SHA');
  assert.ok(resolveIndex >= 0);
  assert.ok(downloadIndex > resolveIndex);
  assert.match(setupCommand, /\[ "\$\{#SOURCE_SHA\}" -eq 40 \]/);
  assert.match(setupCommand, /Application Support\/VexLife\/source/);
  assert.match(setupCommand, /TARGET="\$SOURCE_ROOT\/\$SOURCE_SHA"/);
  assert.doesNotMatch(setupCommand, /\.vexlife\/source/);
});

test('MACHUMAN01C downloaded archive is topology-checked before extraction and exact source delegates to repository setup', () => {
  const topologyIndex = setupCommand.indexOf('tar -tzf "$ARCHIVE"');
  const extractIndex = setupCommand.indexOf('tar -xzf "$ARCHIVE"');
  assert.ok(topologyIndex >= 0);
  assert.ok(extractIndex > topologyIndex);
  assert.match(setupCommand, /downloaded source is missing the Mac setup owner/);
  assert.match(setupCommand, /exec \/bin\/bash "\$TARGET\/install\/vexlife-setup\.sh" "\$TARGET"/);
});

test('MACHUMAN02 setup inspects machine state before asking lifecycle choices', () => {
  assert.match(setup, /macos-lifecycle\.mjs" --operation status/);
  assert.match(setup, /case "\$STATE" in/);
  assert.match(setup, /ABSENT\)/);
  assert.match(setup, /EXISTING_HEALTHY\)/);
  assert.match(setup, /EXISTING_DEGRADED_REPAIRABLE\)/);
  assert.match(setup, /HELD_NONCANONICAL_HOME\)/);
  assert.doesNotMatch(setup, /macos-lifecycle\.mjs" --operation auto/);
});

test('MACHUMAN03 fresh setup does not offer repair rebuild or uninstall before Home exists', () => {
  const absent = setup.slice(setup.indexOf('  ABSENT)'), setup.indexOf('  EXISTING_HEALTHY)'));
  assert.match(absent, /This is a first setup/);
  assert.match(absent, /Create this Vex Home and continue/);
  assert.doesNotMatch(absent, /run_lifecycle repair/);
  assert.doesNotMatch(absent, /run_lifecycle rebuild-preserve/);
  assert.doesNotMatch(absent, /run_lifecycle uninstall-preserve/);
});

test('MACHUMAN04 fresh setup preserves the real initializer consent boundary', () => {
  const absent = setup.slice(setup.indexOf('  ABSENT)'), setup.indexOf('  EXISTING_HEALTHY)'));
  assert.match(absent, /initialize-vex\.mjs" --home "\$VEX_HOME" --plan-only/);
  assert.match(absent, /initialize-vex\.mjs" --home "\$VEX_HOME";/);
  assert.doesNotMatch(absent, /initialize-vex\.mjs[^\n]*--yes/);
});

test('MACHUMAN05 state-derived actions are explicit and browser opens only after start-class completion', () => {
  assert.match(setup, /run_lifecycle start >\/dev\/null; open_vex/);
  assert.match(setup, /run_lifecycle repair >\/dev\/null; open_vex/);
  assert.match(setup, /run_lifecycle rebuild-preserve >\/dev\/null; open_vex/);
  assert.match(setup, /run_lifecycle uninstall-preserve >\/dev\/null/);
  const uninstallTail = setup.slice(setup.lastIndexOf('run_lifecycle uninstall-preserve >/dev/null'));
  assert.doesNotMatch(uninstallTail.split(';;')[0], /open_vex/);
});

test('MACHUMAN06 exact qualified runtime receipt is reused after consent and byte drift fails closed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vexlife-mac-human-runtime-reuse-'));
  const home = path.join(root, 'home');
  for (const dir of ['config', 'recovery', 'runtime']) fs.mkdirSync(path.join(home, dir), { recursive: true });

  const executablePath = path.join(home, 'runtime', 'llama-server');
  const executableBytes = Buffer.from('exact-qualified-runtime-bytes');
  fs.writeFileSync(executablePath, executableBytes);
  const executableSha256 = crypto.createHash('sha256').update(executableBytes).digest('hex');
  const runtimeArguments = ['-m', path.join(home, 'models', 'model.gguf'), '--host', '127.0.0.1', '--port', '18080'];
  const homeRef = 'home.vexlife.test.single-consent';
  const receiptRef = 'receipt.vexlife.initialization.test-single-consent';
  const endpoint = 'http://127.0.0.1:18080';
  const requestModel = 'qwen3.5-test';
  const pid = 4242;

  fs.writeFileSync(path.join(home, 'config', 'home.json'), `${JSON.stringify({ homeRef })}\n`);
  fs.writeFileSync(path.join(home, 'config', 'model.json'), `${JSON.stringify({
    schemaVersion: 'vexlife.model-configuration/v1',
    state: 'BOUND_QUALIFIED',
    profileRef: 'profile.vexlife.test.mac',
    endpoint,
    requestModel,
    runtimePid: pid,
    runtimeExecutablePath: executablePath,
    runtimeExecutableSha256: executableSha256,
    runtimeExecutableSha256SourcePinned: executableSha256,
    runtimeArguments,
    qualificationReceiptRef: receiptRef
  })}\n`);
  fs.writeFileSync(path.join(home, 'recovery', 'vex-initialization-receipt.json'), `${JSON.stringify({
    schemaVersion: 'vexlife.initialization-receipt/v1',
    receiptRef,
    state: 'RUNTIME_QUALIFIED',
    profileRef: 'profile.vexlife.test.mac',
    profileState: 'RELEASE_QUALIFIED',
    home: { homeIdentityRef: homeRef },
    endpoint: { origin: endpoint, requestModel },
    runtime: { pid, executablePath, arguments: runtimeArguments },
    materialization: {
      executableSha256,
      sourcePinnedExecutableSha256: executableSha256
    },
    browserBinding: { origin: 'http://127.0.0.1:18110' }
  })}\n`);

  const processEvidence = {
    platform: 'darwin',
    name: path.basename(executablePath),
    executablePath,
    commandLine: [executablePath, ...runtimeArguments].join(' '),
    commandLineClass: 'DARWIN_PS_FLATTENED_ARGV',
    argvBoundaryPreserved: false,
    tokens: null
  };
  const reused = qualifiedInitializationFromCurrentHome(home, {
    pidAliveImpl: () => true,
    processEvidenceReader: () => processEvidence
  });
  assert.equal(reused?.state, 'RUNTIME_QUALIFIED');
  assert.equal(reused?.reuseDisposition, 'REUSED_CURRENT_QUALIFIED_RUNTIME_RECEIPT');
  assert.equal(reused?.receiptPath, path.join(home, 'recovery', 'vex-initialization-receipt.json'));

  fs.writeFileSync(executablePath, 'drifted-runtime-bytes');
  assert.equal(qualifiedInitializationFromCurrentHome(home, {
    pidAliveImpl: () => true,
    processEvidenceReader: () => processEvidence
  }), null);

  fs.rmSync(root, { recursive: true, force: true });
});

test('MACHUMAN07 lifecycle forwards noninteractive consent only from an explicit caller flag', () => {
  assert.match(lifecycle, /const argv = \[path\.join\(repo, 'scripts', 'initialize-vex\.mjs'\), '--home', home\];/);
  assert.doesNotMatch(lifecycle, /const argv = \[[^\n]*'--yes'[^\n]*\];/);
  assert.match(lifecycle, /if \(options\.noninteractiveAuthorized === true\) argv\.push\('--yes'\);/);
  assert.match(lifecycle, /noninteractiveAuthorized: args\['--yes'\] === true/);
  assert.match(lifecycle, /qualifiedInitializationFromCurrentHome\(home\)/);
});

test('MACHUMAN08 rerun reconciles a prior-source browser through current trusted lifecycle code', () => {
  const helperStart = setup.indexOf('reconcile_prior_browser_source()');
  const helperEnd = setup.indexOf('\nrun_lifecycle()', helperStart);
  assert.ok(helperStart >= 0);
  assert.ok(helperEnd > helperStart);
  const helper = setup.slice(helperStart, helperEnd);

  assert.match(helper, /recovery', 'browser-process\.json/);
  assert.match(helper, /receipt\.repoRootPath/);
  assert.match(helper, /priorRepo === currentRepo/);
  assert.match(helper, /pathToFileURL\(modulePath\)/);
  assert.match(helper, /lifecycle\.stopOwnedBrowser\(home, priorRepo\)/);
  assert.doesNotMatch(helper, /pathToFileURL\(priorRepo/);
  assert.doesNotMatch(helper, /priorRepo[^\n]*macos-lifecycle\.mjs/);

  const runLifecycleStart = setup.indexOf('run_lifecycle()');
  const openVexStart = setup.indexOf('\nopen_vex()', runLifecycleStart);
  const runLifecycle = setup.slice(runLifecycleStart, openVexStart);
  assert.match(runLifecycle, /reconcile_prior_browser_source \|\| return 1/);
  assert.ok(runLifecycle.indexOf('reconcile_prior_browser_source') < runLifecycle.indexOf('macos-lifecycle.mjs" --operation'));
});

// [VXG RealForever]
