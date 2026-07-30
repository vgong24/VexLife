import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBlueprint } from '../src/core/blueprint.mjs';
import { compileCapabilityFrame, requireExecutable, minimumStage } from '../src/core/capability.mjs';

test('capability frame is generated for a fresh role and platform without a human tool prompt', () => {
  const bundle = loadBlueprint();
  const frame = compileCapabilityFrame(bundle.capabilities, {
    roleRef: 'role.vex.developer',
    platformRef: 'platform.browser',
    projectCapabilityStages: {
      'capability.vexlife.file.read': 'ADMITTED',
      'capability.vexlife.file.edit-with-recovery': 'REQUESTABLE'
    },
    permissionStages: {
      'permission.file.read': 'EXECUTABLE',
      'permission.file.edit': 'REQUESTABLE'
    },
    resourceStages: { IO_BOUNDED: 'EXECUTABLE' }
  });
  assert.ok(frame.entries.some((item) => item.capabilityRef === 'capability.vexlife.navigation'));
  const fileRead = frame.entries.find((item) => item.capabilityRef === 'capability.vexlife.file.read');
  assert.equal(fileRead.stage, 'REQUESTABLE');
  assert.equal(fileRead.executable, false);
  assert.equal(requireExecutable(frame, fileRead.capabilityRef).state, 'BLOCKED_CAPABILITY_STAGE');
});

test('most restrictive capability stage wins and unknown is not executable', () => {
  assert.equal(minimumStage('EXECUTABLE', 'REQUESTABLE', 'COMPLETED'), 'REQUESTABLE');
  const bundle = loadBlueprint();
  const frame = compileCapabilityFrame(bundle.capabilities, { roleRef: 'role.vex.operations', platformRef: 'platform.windows' });
  const training = frame.entries.find((item) => item.capabilityRef === 'capability.vexlife.adapter.training');
  assert.equal(training.stage, 'DISCOVERABLE');
  assert.equal(training.executable, false);
});

// [VXG RealForever]
