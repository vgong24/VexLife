import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { ExperienceRegistry } from '../src/core/experience.mjs';

const bundle = loadBlueprint();

test('experience, gesture and vessel registry is canonical and localized', () => {
  const result = validateBlueprint(bundle);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(bundle.experience.vessels.length >= 4, true);
  for (const vessel of bundle.experience.vessels) for (const language of bundle.blueprint.product.requiredLanguages) assert.ok(bundle.strings[language][vessel.labelStringRef]);
});

test('ordinary content scrolling and explicit Terrain zoom do not collide', () => {
  const registry = new ExperienceRegistry(bundle.experience);
  const scroll = registry.resolveInteraction({ surfaceKind: 'MESSAGE_FEED', inputType: 'MOUSE_WHEEL' });
  assert.equal(scroll.disposition, 'INTERACTION_RESOLVED');
  assert.equal(scroll.actionRef, 'action.content.scroll');
  const terrainWheel = registry.resolveInteraction({ surfaceKind: 'TERRAIN_CANVAS', inputType: 'MOUSE_WHEEL' });
  assert.equal(terrainWheel.disposition, 'NO_MATCH');
  const zoom = registry.resolveInteraction({ surfaceKind: 'TERRAIN_CANVAS', inputType: 'ZOOM_BUTTON' });
  assert.equal(zoom.actionRef, 'action.terrain.canvas.zoom');
});

test('screen magnification is never captured as product zoom', () => {
  const registry = new ExperienceRegistry(bundle.experience);
  const result = registry.resolveInteraction({ surfaceKind: 'TERRAIN_CANVAS', inputType: 'PINCH', accessibilityMode: 'SCREEN_MAGNIFICATION' });
  assert.equal(result.disposition, 'NO_MATCH');
});

test('persona projections reveal only available bounded regions and roles', () => {
  const registry = new ExperienceRegistry(bundle.experience);
  const projection = registry.buildProfileProjection('experience.vexlife.leadership-root', { availableRegionRefs: ['region.terrain.canvas'], availableRoleRefs: ['role.vex.root-hub'] });
  assert.deepEqual(projection.visibleRegionRefs, ['region.terrain.canvas']);
  assert.equal(projection.defaultRoleRef, 'role.vex.root-hub');
});

// [VXG RealForever]
