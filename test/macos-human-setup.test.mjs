import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const setupCommand = fs.readFileSync(path.join(ROOT, 'setup-vexlife.command'), 'utf8');
const setup = fs.readFileSync(path.join(ROOT, 'install', 'vexlife-setup.sh'), 'utf8');

test('MACHUMAN01 root Mac front door delegates to one repository setup owner', () => {
  assert.match(setupCommand, /^#!\/bin\/bash/m);
  assert.match(setupCommand, /install\/vexlife-setup\.sh/);
  assert.doesNotMatch(setupCommand, /initialize-vex\.mjs/);
  assert.doesNotMatch(setupCommand, /macos-lifecycle\.mjs/);
});

test('MACHUMAN02 setup inspects machine state before asking lifecycle choices', () => {
  assert.match(setup, /macos-lifecycle\.mjs" --operation status/);
  assert.match(setup, /case "\$STATE" in/);
  assert.match(setup, /ABSENT\)/);
  assert.match(setup, /EXISTING_HEALTHY\)/);
  assert.match(setup, /EXISTING_DEGRADED_REPAIRABLE\)/);
  assert.match(setup, /HELD_NONCANONICAL_HOME\)/);
  assert.doesNotMatch(setup, /--operation auto/);
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

// [VXG RealForever]
