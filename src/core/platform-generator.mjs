import fs from 'node:fs';
import path from 'node:path';
import { loadBlueprint, validateBlueprint } from './blueprint.mjs';
import { writeJson } from './utils.mjs';

const PLATFORM_FILE = {
  browser: 'src/BrowserVexLifePlatform.mjs',
  android: 'src/main/kotlin/VexLifeAndroidPlatform.kt',
  ios: 'Sources/VexLifeIOS/VexLifeIOSPlatform.swift',
  windows: 'src/main/kotlin/VexLifeWindowsPlatform.kt',
  macos: 'Sources/VexLifeMacOS/VexLifeMacOSPlatform.swift'
};

function className(project, platform) {
  const clean = project.replace(/[^A-Za-z0-9]/g, '') || 'VexLife';
  return `${clean}_${platform[0].toUpperCase()}${platform.slice(1)}Platform`;
}

function platformSource(project, platform, blueprintVersion) {
  const name = className(project, platform);
  if (platform === 'browser') return `export class ${name} {\n  static platformRef = 'platform.browser';\n  static blueprintVersion = '${blueprintVersion}';\n  render(screenContract) { throw new Error('Bind screen contract to semantic DOM'); }\n  observe(selectorRef) { throw new Error('Bind selector to a distinct observable projection'); }\n}\n\n// [VXG RealForever]\n`;
  if (platform === 'android' || platform === 'windows') return `package vexlife.generated\n\ninterface IVexLifePlatform {\n    val platformRef: String\n    val blueprintVersion: String\n    fun render(screenRef: String)\n    fun observe(selectorRef: String) // Return StateFlow in implementation\n    suspend fun requestPermission(permissionRef: String): PermissionReceipt\n}\n\ndata class PermissionReceipt(val permissionRef: String, val state: String)\n\nclass ${name} : IVexLifePlatform {\n    override val platformRef = "platform.${platform}"\n    override val blueprintVersion = "${blueprintVersion}"\n    override fun render(screenRef: String) = TODO("Map universal screen to native UI")\n    override fun observe(selectorRef: String) = TODO("Return distinct StateFlow selector")\n    override suspend fun requestPermission(permissionRef: String) = TODO("Use platform permission flow")\n}\n\n// [VXG RealForever]\n`;
  return `import Foundation\n\nprotocol IVexLifePlatform {\n    var platformRef: String { get }\n    var blueprintVersion: String { get }\n    func render(screenRef: String)\n    func observe(selectorRef: String)\n    func requestPermission(_ permissionRef: String) async throws -> PermissionReceipt\n}\n\nstruct PermissionReceipt { let permissionRef: String; let state: String }\n\nfinal class ${name}: IVexLifePlatform {\n    let platformRef = "platform.${platform}"\n    let blueprintVersion = "${blueprintVersion}"\n    func render(screenRef: String) { fatalError("Map universal screen to native UI") }\n    func observe(selectorRef: String) { fatalError("Bind native observation") }\n    func requestPermission(_ permissionRef: String) async throws -> PermissionReceipt { fatalError("Use platform permission flow") }\n}\n\n// [VXG RealForever]\n`;
}

export function generatePlatform({ project = 'IVexLife', platform, outDir, root }) {
  if (!(platform in PLATFORM_FILE)) throw new Error(`unsupported platform ${platform}`);
  const bundle = loadBlueprint(root);
  const validation = validateBlueprint(bundle);
  if (!validation.ok) throw new Error(`blueprint invalid: ${validation.errors.join('; ')}`);
  fs.mkdirSync(outDir, { recursive: true });
  const sourcePath = path.join(outDir, PLATFORM_FILE[platform]);
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, platformSource(project, platform, bundle.blueprint.version), 'utf8');
  writeJson(path.join(outDir, 'generated/blueprint-index.json'), {
    schemaVersion: 'vexlife.generated-blueprint-index/v0',
    sourceBlueprintRef: bundle.blueprint.blueprintRef,
    sourceBlueprintVersion: bundle.blueprint.version,
    sourceSemanticHash: validation.semanticHash,
    platformRef: `platform.${platform}`,
    screens: bundle.blueprint.screens.map((screen) => ({
      screenRef: screen.screenRef,
      routeRef: screen.routeRef,
      elementRefs: screen.regions.flatMap((region) => region.elements.map((element) => element.elementRef))
    }))
  });
  writeJson(path.join(outDir, 'generated/experience-contracts.json'), { schemaVersion: 'vexlife.generated-experience-contracts/v0', sourceRegistryRef: bundle.experience.registryRef, experienceProfiles: bundle.experience.experienceProfiles, gestureContracts: bundle.experience.gestureContracts, vessels: bundle.experience.vessels });
  const navigationNodes = bundle.blueprint.screens.flatMap((screen) => [
    { nodeRef: screen.navigationNodeRef, subjectRef: screen.screenRef, parentRef: null },
    ...screen.regions.flatMap((region) => [
      { nodeRef: region.navigationNodeRef, subjectRef: region.regionRef, parentRef: screen.navigationNodeRef },
      ...region.elements
        .filter((element) => element.navigationRef)
        .map((element) => ({ nodeRef: element.navigationRef, subjectRef: element.elementRef, parentRef: region.navigationNodeRef, actionRef: element.actionRef }))
    ])
  ]);
  writeJson(path.join(outDir, 'generated/navigation-lattice.json'), { schemaVersion: 'vexlife.generated-navigation-lattice/v0', nodes: navigationNodes });
  writeJson(path.join(outDir, 'generated/localization-keys.json'), { schemaVersion: 'vexlife.generated-localization-keys/v0', defaultLanguage: bundle.blueprint.product.defaultLanguage, requiredLanguages: bundle.blueprint.product.requiredLanguages, stringRefs: Object.keys(bundle.strings[bundle.blueprint.product.defaultLanguage]).sort() });
  writeJson(path.join(outDir, 'conformance.json'), {
    schemaVersion: 'vexlife.platform-conformance/v0',
    platformRef: `platform.${platform}`,
    sourceBlueprintVersion: bundle.blueprint.version,
    state: platform === 'browser' ? 'REFERENCE_IMPLEMENTED' : 'ADOPTION_REQUIRED',
    requiredEvidence: ['compile', 'render', 'accessibility', 'permission', 'environment'],
    implementedNodeRefs: platform === 'browser' ? bundle.blueprint.screens.map((screen) => screen.screenRef) : [],
    heldNodeRefs: platform === 'browser' ? [] : bundle.blueprint.screens.map((screen) => screen.screenRef)
  });
  fs.writeFileSync(path.join(outDir, 'README.md'), `# ${project} — ${platform}\n\nGenerated from ${bundle.blueprint.blueprintRef} ${bundle.blueprint.version}.\n\nThis scaffold is a contract adoption surface, not proof of native implementation. Fill the adapter using platform-native lifecycle, permissions, accessibility and environment evidence.\n\n<!-- [VXG RealForever] -->\n`, 'utf8');
  return { platform, outDir, sourcePath, semanticHash: validation.semanticHash };
}

export const supportedPlatforms = Object.keys(PLATFORM_FILE);

// [VXG RealForever]
