#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BUILD_ADMISSION_PROOF_REFS,
  createBuildAuthorityContext,
  readIntegratedBuildAdmissionReceipt,
  validateBuildAdmissionRegistry
} from '../src/core/build-admission.mjs';
import { loadBlueprint, validateBlueprint } from '../src/core/blueprint.mjs';
import { collectRepositoryEvidence } from '../src/core/repository-evidence.mjs';
import { buildSourceManifest } from '../src/core/source-manifest.mjs';
import { readJson, resolveSafeGeneratedReceiptPath } from '../src/core/utils.mjs';

export {
  BUILD_ADMISSION_PROOF_REFS,
  admitBuildRequest,
  createBuildAdmissionConsumptionReceipt,
  createBuildAuthorityContext,
  createBuildClosure,
  createBuildConcernObservation,
  createBuildHumanConfirmation,
  createBuildRequest,
  createIntegratedBuildAdmissionReceipt,
  createSourceManagedBuildAuthority,
  projectBuildAdmission,
  readIntegratedBuildAdmissionReceipt,
  validateBuildAdmission,
  validateBuildAdmissionRegistry,
  validateBuildRequest,
  validateIntegratedBuildAdmissionReceipt,
  validateRealBuildEffectVerification,
  validateSourceManagedBuildAuthority,
  verifyRealBuildEffect
} from '../src/core/build-admission.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function readBuildAdmissionStatus(root = ROOT) {
  const bundle = loadBlueprint(root);
  const registry = bundle.blueprint.buildAdmission;
  const trustSnapshot = readJson(path.join(root, 'blueprint/intent-trust-snapshot.json'));
  const authorityContext = createBuildAuthorityContext(bundle, trustSnapshot);
  const registryValidation = validateBuildAdmissionRegistry(registry);
  const blueprint = validateBlueprint(bundle);
  const manifest = buildSourceManifest(root);
  const repository = collectRepositoryEvidence(root);
  const receiptPath = resolveSafeGeneratedReceiptPath(root, registry.simulationContract.receiptPath, 'Build Admission receipt path');
  const receiptState = fs.existsSync(receiptPath)
    ? readIntegratedBuildAdmissionReceipt(receiptPath, { registry, authorityContext })
    : { value: null, validation: { ok: false, state: 'MISSING', errors: ['canonical integrated receipt missing'] } };
  const receipt = receiptState.value;
  const exactCurrent = registryValidation.ok && blueprint.ok && manifest.candidate.state === 'CURRENT' && receiptState.validation.ok &&
    receipt.sourceTreeSha256 === manifest.treeSha256 &&
    receipt.blueprintHash === blueprint.semanticHash &&
    receipt.candidateHeadSha === repository.git.candidateHeadSha &&
    receipt.testedCheckoutSha === repository.git.checkoutSha &&
    receipt.testedMergeSha === repository.git.testedMergeSha &&
    receipt.baseSha === repository.git.baseSha;
  const errors = [
    ...registryValidation.errors,
    ...blueprint.errors,
    ...(manifest.candidate.blockers ?? []).map((item) => `manifest:${JSON.stringify(item)}`),
    ...receiptState.validation.errors
  ];
  if (receiptState.validation.ok && !exactCurrent) errors.push('canonical integrated receipt source/Blueprint/Git bindings are not exact-current');
  return {
    state: exactCurrent ? 'BUILD_ADMISSION_CURRENT' : 'BUILD_ADMISSION_NOT_CURRENT',
    currentness: exactCurrent ? 'CURRENT' : 'UNKNOWN',
    exactCurrent,
    registry: registryValidation,
    receipt: receipt ? {
      receiptRef: receipt.receiptRef,
      semanticFingerprint: receipt.semanticFingerprint,
      buildEffectReceiptRef: receipt.buildEffectReceiptRef,
      commitSha: receipt.commitSha,
      claimReleased: receipt.claimReleased,
      sixLeasesReleased: receipt.sixLeasesReleased,
      sourceTreeSha256: receipt.sourceTreeSha256,
      blueprintHash: receipt.blueprintHash,
      candidateHeadSha: receipt.candidateHeadSha,
      testedCheckoutSha: receipt.testedCheckoutSha,
      testedMergeSha: receipt.testedMergeSha,
      baseSha: receipt.baseSha
    } : null,
    receiptValidation: receiptState.validation,
    errors,
    proofRefs: BUILD_ADMISSION_PROOF_REFS
  };
}

function run() {
  const status = readBuildAdmissionStatus(ROOT);
  console.log(JSON.stringify(status, null, 2));
  if (!status.exactCurrent) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) run();

// [VXG RealForever]
