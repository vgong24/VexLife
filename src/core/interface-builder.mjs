import { IdentityRegistry } from './registry.mjs';

function requireRef(value, label) {
  if (!value || typeof value !== 'string') throw new Error(`${label} is required`);
  return value;
}

export class UniversalInterfaceBuilder {
  constructor({ registry = new IdentityRegistry({ registryRef: 'registry.vexlife.interface-builder' }) } = {}) {
    this.registry = registry;
    this.screens = new Map();
    this.regions = new Map();
    this.elements = new Map();
    this.components = new Map();
    this.vessels = new Map();
    this.gestureBindings = new Map();
  }



  defineVessel({ id, componentRef, labelStringRef, actionRefs = [], placement = {}, accessibility = {} }) {
    const vessel = { vesselRef: requireRef(id, 'vessel id'), componentRef: requireRef(componentRef, 'vessel componentRef'), labelStringRef: requireRef(labelStringRef, 'vessel labelStringRef'), actionRefs: [...actionRefs], placement: structuredClone(placement), accessibility: structuredClone(accessibility) };
    if (!this.components.has(vessel.componentRef)) throw new Error(`${vessel.vesselRef} references missing component ${vessel.componentRef}`);
    if (this.vessels.has(vessel.vesselRef)) throw new Error(`duplicate vessel ${vessel.vesselRef}`);
    this.vessels.set(vessel.vesselRef, vessel);
    return vessel;
  }

  bindGesture(elementRef, gestureRef) {
    this.requireElement(elementRef);
    const refs = this.gestureBindings.get(elementRef) ?? [];
    if (!refs.includes(gestureRef)) refs.push(requireRef(gestureRef, 'gestureRef'));
    this.gestureBindings.set(elementRef, refs);
    return { elementRef, gestureRefs: [...refs] };
  }

  defineComponent({ id, purpose, instanceRefPattern, slots = [] }) {
    const component = { componentRef: requireRef(id, 'component id'), purpose: requireRef(purpose, 'component purpose'), instanceRefPattern: requireRef(instanceRefPattern, 'component instance pattern'), slots: structuredClone(slots) };
    if (this.components.has(component.componentRef)) throw new Error(`duplicate component ${component.componentRef}`);
    if (!component.instanceRefPattern.includes('{')) throw new Error(`${component.componentRef} instance pattern requires a placeholder`);
    this.components.set(component.componentRef, component);
    return component;
  }

  instantiateComponent(componentRef, bindings) {
    const component = this.components.get(componentRef);
    if (!component) throw new Error(`missing component ${componentRef}`);
    const instanceRef = component.instanceRefPattern.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key) => {
      if (!(key in bindings)) throw new Error(`${componentRef} missing binding ${key}`);
      return String(bindings[key]).replace(/[^A-Za-z0-9._-]/g, '-');
    });
    return { instanceRef, componentRef, bindings: structuredClone(bindings), slots: structuredClone(component.slots) };
  }

  defineScreen({ id, conceptRef, route, title, observes = [], tests = [] }) {
    const screen = { screenRef: requireRef(id, 'screen id'), conceptRef: requireRef(conceptRef, 'screen conceptRef'), routeRef: requireRef(route, 'screen route'), titleStringRef: requireRef(title, 'screen title'), stateSelectorRefs: [...observes], testRefs: [...tests], regionRefs: [] };
    if (this.screens.has(screen.screenRef)) throw new Error(`duplicate screen ${screen.screenRef}`);
    this.screens.set(screen.screenRef, screen);
    return screen;
  }

  defineRegion({ id, conceptRef, parent, label }) {
    const screen = this.screens.get(requireRef(parent, 'region parent'));
    if (!screen) throw new Error(`missing screen ${parent}`);
    const region = { regionRef: requireRef(id, 'region id'), conceptRef: requireRef(conceptRef, 'region conceptRef'), parentScreenRef: parent, labelStringRef: requireRef(label, 'region label'), elementRefs: [] };
    if (this.regions.has(region.regionRef)) throw new Error(`duplicate region ${region.regionRef}`);
    this.regions.set(region.regionRef, region);
    screen.regionRefs.push(region.regionRef);
    return region;
  }

  defineElement({ id, conceptRef, parent, kind, label, action = null, permission = null, selectionGroup = null, terrain = null, navigation = null, accessibility = {}, tests = [] }) {
    const region = this.regions.get(requireRef(parent, 'element parent'));
    if (!region) throw new Error(`missing region ${parent}`);
    const element = {
      elementRef: requireRef(id, 'element id'), conceptRef: requireRef(conceptRef, 'element conceptRef'), parentRegionRef: parent,
      screenRef: region.parentScreenRef, kind: requireRef(kind, 'element kind'), labelStringRef: requireRef(label, 'element label'),
      actionRef: action, permissionRef: permission, selectionGroupRef: selectionGroup, terrainNodeRef: terrain,
      navigationRef: navigation, accessibility: structuredClone(accessibility), testRefs: [...tests]
    };
    if (this.elements.has(element.elementRef)) throw new Error(`duplicate element ${element.elementRef}`);
    if (element.actionRef && !element.accessibility.stableIdentifierRef) throw new Error(`${element.elementRef} requires an accessibility stableIdentifierRef`);
    this.elements.set(element.elementRef, element);
    region.elementRefs.push(element.elementRef);
    return element;
  }

  bindAction(elementRef, actionRef) { this.requireElement(elementRef).actionRef = requireRef(actionRef, 'actionRef'); return this.requireElement(elementRef); }
  requirePermission(elementRef, permissionRef) { this.requireElement(elementRef).permissionRef = requireRef(permissionRef, 'permissionRef'); return this.requireElement(elementRef); }
  observeState(screenRef, selectorRef) { const screen = this.requireScreen(screenRef); if (!screen.stateSelectorRefs.includes(selectorRef)) screen.stateSelectorRefs.push(selectorRef); return screen; }
  localize(elementRef, stringRef) { this.requireElement(elementRef).labelStringRef = requireRef(stringRef, 'stringRef'); return this.requireElement(elementRef); }
  placeOnTerrain(elementRef, terrainNodeRef) { this.requireElement(elementRef).terrainNodeRef = requireRef(terrainNodeRef, 'terrainNodeRef'); return this.requireElement(elementRef); }
  proveWith(elementRef, testRef) { const element = this.requireElement(elementRef); if (!element.testRefs.includes(testRef)) element.testRefs.push(testRef); return element; }
  requireScreen(ref) { const value = this.screens.get(ref); if (!value) throw new Error(`missing screen ${ref}`); return value; }
  requireElement(ref) { const value = this.elements.get(ref); if (!value) throw new Error(`missing element ${ref}`); return value; }

  build() {
    return [...this.screens.values()].map((screen) => ({
      ...structuredClone(screen),
      regions: screen.regionRefs.map((regionRef) => {
        const region = this.regions.get(regionRef);
        return { ...structuredClone(region), elements: region.elementRefs.map((elementRef) => ({ ...structuredClone(this.elements.get(elementRef)), gestureRefs: [...(this.gestureBindings.get(elementRef) ?? [])] })) };
      })
    }));
  }
}

export function buildInterfaceContracts(blueprint) {
  const builder = new UniversalInterfaceBuilder();
  for (const component of blueprint.components ?? []) builder.defineComponent({ id: component.componentRef, purpose: component.purpose, instanceRefPattern: component.instanceRefPattern, slots: component.slots });
  for (const screen of blueprint.screens) {
    builder.defineScreen({ id: screen.screenRef, conceptRef: screen.conceptRef, route: screen.routeRef, title: screen.titleStringRef, observes: screen.stateSelectorRefs, tests: screen.testRefs });
    for (const region of screen.regions) {
      builder.defineRegion({ id: region.regionRef, conceptRef: region.conceptRef, parent: screen.screenRef, label: region.labelStringRef });
      for (const element of region.elements) builder.defineElement({
        id: element.elementRef, conceptRef: element.conceptRef, parent: region.regionRef, kind: element.kind,
        label: element.labelStringRef, action: element.actionRef, permission: element.permissionRef,
        selectionGroup: element.selectionGroupRef, terrain: element.terrainNodeRef, navigation: element.navigationRef,
        accessibility: element.accessibility, tests: element.testRefs
      });
    }
  }
  return builder;
}

// [VXG RealForever]
