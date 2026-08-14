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

test('companion physical-navigation vocabulary is requestable and non-executable at C0', () => {
  const bundle = loadBlueprint();
  const semanticNavigation = bundle.capabilities.capabilities.find(
    (item) => item.capabilityRef === 'capability.vexlife.navigation'
  );
  const companionNavigation = bundle.capabilities.capabilities.find(
    (item) => item.capabilityRef === 'capability.vexlife.companion-navigation'
  );

  assert.ok(semanticNavigation);
  assert.ok(companionNavigation);
  assert.notEqual(companionNavigation.capabilityRef, semanticNavigation.capabilityRef);
  assert.equal(semanticNavigation.effectClass, 'LOCAL_NAVIGATION');
  assert.equal(companionNavigation.defaultStage, 'REQUESTABLE');
  assert.equal(companionNavigation.effectClass, 'PHYSICAL_NAVIGATION_GUIDANCE');
  assert.equal(companionNavigation.permissionRef, 'permission.none');
  assert.deepEqual(companionNavigation.actionRefs, []);

  for (const roleRef of companionNavigation.roleRefs) {
    for (const platformRef of companionNavigation.platformRefs) {
      const frame = compileCapabilityFrame(bundle.capabilities, { roleRef, platformRef });
      const entry = frame.entries.find(
        (item) => item.capabilityRef === 'capability.vexlife.companion-navigation'
      );
      assert.ok(entry, `${roleRef}/${platformRef} omitted companion navigation`);
      assert.equal(entry.stage, 'REQUESTABLE');
      assert.equal(entry.executable, false);
      assert.equal(requireExecutable(frame, entry.capabilityRef).state, 'BLOCKED_CAPABILITY_STAGE');
    }
  }
});

// [VXG RealForever]
