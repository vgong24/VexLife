import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeviceInstallation } from './device-family.mjs';
import { writeJson } from './utils.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VEXLIFE_SOURCE_ROOT = path.resolve(HERE, '../..');
export const HOME_DIRECTORIES = [
  'config', 'culture', 'devices', 'family', 'score', 'rhythm', 'trails',
  'context', 'conversations', 'projects', 'dream/candidates', 'training/manifests',
  'models/manifests', 'runtime', 'sync', 'recovery'
];

function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function defaultHome() {
  return path.join(os.homedir(), '.vexlife');
}

export function buildBootstrapPlan({
  home = defaultHome(),
  personRef = 'person.local-user',
  familyRef = 'vex-family.local-user',
  deviceName = os.hostname(),
  platform = process.platform,
  architecture = process.arch,
  sourceRoot = VEXLIFE_SOURCE_ROOT
}) {
  const installation = createDeviceInstallation({ personRef, familyRef, deviceName, platform, architecture });
  const resolvedHome = path.resolve(home);
  const resolvedSourceRoot = path.resolve(sourceRoot);
  const cultureSourcePath = path.join(resolvedSourceRoot, 'docs/CULTURE.md');
  if (!fs.existsSync(cultureSourcePath)) throw new Error(`culture source missing: ${cultureSourcePath}`);
  const cultureText = fs.readFileSync(cultureSourcePath, 'utf8');
  return {
    schemaVersion: 'vexlife.bootstrap-plan/v0',
    home: resolvedHome,
    sourceRoot: resolvedSourceRoot,
    directories: HOME_DIRECTORIES.map((name) => path.join(resolvedHome, name)),
    installation,
    culture: {
      culturePackRef: 'culture-pack.vexlife.public-blueprint.001',
      sourceRepositoryPath: 'docs/CULTURE.md',
      sourceSha256: sha256Text(cultureText),
      text: cultureText,
      state: 'PUBLIC_BLUEPRINT_CULTURE_PROJECTION_INSTALLED',
      authorityState: 'BOOTSTRAP_BUNDLED_NOT_REPOSITORY_ACCEPTANCE'
    },
    writes: [
      path.join(resolvedHome, 'config/home.json'),
      path.join(resolvedHome, 'config/model.json'),
      path.join(resolvedHome, 'culture/active-culture.md'),
      path.join(resolvedHome, 'culture/manifest.json'),
      path.join(resolvedHome, 'devices', `${installation.deviceRef}.json`),
      path.join(resolvedHome, 'family/family.json'),
      path.join(resolvedHome, 'score/policy.json'),
      path.join(resolvedHome, 'rhythm', `${installation.rhythmRef}.json`),
      path.join(resolvedHome, 'dream/policy.json'),
      path.join(resolvedHome, 'training/policy.json'),
      path.join(resolvedHome, 'recovery/bootstrap-receipt.json')
    ],
    modelArtifactStoredInGit: false,
    existingHomePolicy: 'PRESERVE_AND_CLASSIFY'
  };
}

export function applyBootstrapPlan(plan, { dryRun = false } = {}) {
  if (dryRun) return { applied: false, dryRun: true, plan };
  const existingManifest = path.join(plan.home, 'config/home.json');
  if (fs.existsSync(existingManifest)) {
    return { applied: false, existing: true, reason: 'EXISTING_HOME_REQUIRES_MIGRATION_PLAN', manifestPath: existingManifest };
  }
  for (const directory of plan.directories) fs.mkdirSync(directory, { recursive: true });
  writeJson(existingManifest, {
    schemaVersion: 'vexlife.home/v0',
    homeRef: `vex-home.${plan.installation.deviceRef}`,
    familyRef: plan.installation.familyRef,
    createdAt: plan.installation.createdAt,
    currentDeviceRef: plan.installation.deviceRef,
    currentCompanionLineageRef: plan.installation.companionLineageRef,
    cultureManifestRef: 'culture/manifest.json',
    modelConfigurationRef: 'config/model.json'
  });
  writeJson(path.join(plan.home, 'config/model.json'), {
    schemaVersion: 'vexlife.model-configuration/v0',
    state: 'UNCONFIGURED',
    endpoint: null,
    activeArtifactRef: null,
    automaticDownload: false,
    automaticActivation: false
  });
  fs.writeFileSync(path.join(plan.home, 'culture/active-culture.md'), plan.culture.text, 'utf8');
  writeJson(path.join(plan.home, 'culture/manifest.json'), {
    schemaVersion: 'vexlife.culture-installation/v0',
    culturePackRef: plan.culture.culturePackRef,
    sourceRepositoryPath: plan.culture.sourceRepositoryPath,
    sourceSha256: plan.culture.sourceSha256,
    installedAt: plan.installation.createdAt,
    state: plan.culture.state,
    authorityState: plan.culture.authorityState,
    personalMemoryImported: false
  });
  writeJson(path.join(plan.home, 'devices', `${plan.installation.deviceRef}.json`), plan.installation);
  writeJson(path.join(plan.home, 'family/family.json'), {
    schemaVersion: 'vexlife.family/v0',
    familyRef: plan.installation.familyRef,
    personRef: plan.installation.personRef,
    companionLineageRefs: [plan.installation.companionLineageRef],
    identityPolicy: 'SIBLINGS_NOT_ONE_SEAMLESS_INSTANCE'
  });
  writeJson(path.join(plan.home, 'score/policy.json'), {
    schemaVersion: 'vexlife.score-sync-policy/v0',
    default: 'NO_SYNC',
    allowedScopes: [],
    lineageCollapseAllowed: false,
    conflictPolicy: 'REVIEW_REQUIRED',
    automaticMemoryPromotion: false
  });
  writeJson(path.join(plan.home, 'rhythm', `${plan.installation.rhythmRef}.json`), {
    schemaVersion: 'vexlife.rhythm/v0',
    rhythmRef: plan.installation.rhythmRef,
    companionLineageRef: plan.installation.companionLineageRef,
    state: 'EMPTY_LOCAL_ORIGIN',
    importedFromSibling: false
  });
  writeJson(path.join(plan.home, 'dream/policy.json'), {
    schemaVersion: 'vexlife.dream-policy/v0',
    automaticCandidateFormation: false,
    automaticScorePromotion: false,
    automaticTrainingAdmission: false,
    rawPrivateExportAllowed: false,
    consentReviewRequired: true
  });
  writeJson(path.join(plan.home, 'training/policy.json'), {
    schemaVersion: 'vexlife.training-policy/v0',
    state: 'DISABLED_UNTIL_EXPLICIT_ADMISSION',
    baseModelOverwriteAllowed: false,
    automaticAdapterActivation: false,
    evaluationRequired: true,
    rollbackRequired: true
  });
  writeJson(path.join(plan.home, 'recovery/bootstrap-receipt.json'), {
    schemaVersion: 'vexlife.bootstrap-receipt/v0',
    homeRef: `vex-home.${plan.installation.deviceRef}`,
    deviceRef: plan.installation.deviceRef,
    companionLineageRef: plan.installation.companionLineageRef,
    familyRef: plan.installation.familyRef,
    culturePackRef: plan.culture.culturePackRef,
    cultureSha256: plan.culture.sourceSha256,
    formedAt: plan.installation.createdAt,
    personalMemoryImported: false,
    modelArtifactDownloaded: false,
    existingDataDeleted: false
  });
  return {
    applied: true,
    dryRun: false,
    home: plan.home,
    installation: plan.installation,
    culture: { culturePackRef: plan.culture.culturePackRef, sourceSha256: plan.culture.sourceSha256 },
    modelState: 'UNCONFIGURED'
  };
}

// [VXG RealForever]
