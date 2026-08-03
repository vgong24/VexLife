#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { semanticHash } from '../src/core/utils.mjs';
const BA_SHA256 = /^[a-f0-9]{64}$/;
function baClone(value) { return structuredClone(value); }
function baFreeze(value) {
 if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
 for (const child of Object.values(value)) baFreeze(child);
 return Object.freeze(value);
}
function baObject(value, label) {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
 return value;
}
function baTimestamp(value, label) {
 if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
 const date = new Date(value);
 if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new Error(`${label} must be canonical ISO`);
 return value;
}
function baChronology(earlier, later, label, strict = false) {
 const a = Date.parse(baTimestamp(earlier, `${label} earlier`));
 const b = Date.parse(baTimestamp(later, `${label} later`));
 if (strict ? b <= a : b < a) throw new Error(`${label} chronology is invalid`);
}
function baSha256(value, label) { if (!BA_SHA256.test(value ?? '')) throw new Error(`${label} must be lowercase SHA-256`); return value; }
function baAddress(coreInput, refField, prefix) {
 const core = baClone(coreInput); delete core[refField]; delete core.semanticFingerprint;
 const semanticFingerprint = semanticHash(core);
 return baFreeze({ ...core, [refField]: `${prefix}.${semanticFingerprint.slice(0, 24)}`, semanticFingerprint });
}
function baCanonical(value, refField, prefix, label) {
 baObject(value, label); const core = baClone(value); delete core[refField]; delete core.semanticFingerprint;
 const expected = baAddress(core, refField, prefix);
 if (value[refField] !== expected[refField] || value.semanticFingerprint !== expected.semanticFingerprint) throw new Error(`${label} is forged or re-addressed`);
}
function baRegistry(registry) {
 if (!registry || registry.schemaVersion !== 'vexlife.build-admission-registry/v1' || registry.adapter?.effectScope !== 'DISPOSABLE_LOCAL_GIT_REPOSITORY') {
 throw new Error('Build Admission registry is invalid');
 }
 return registry;
}
function baValidateAdmission(admission, request, registry) {
 baRegistry(registry);
 baCanonical(request, 'buildRequestRef', 'request.build-admission', 'build request');
 baCanonical(admission, 'buildAdmissionRef', 'admission.build-admission', 'build admission');
 if (admission.buildRequestRef !== request.buildRequestRef || admission.buildRequestFingerprint !== request.semanticFingerprint ||
 admission.currentness !== 'CURRENT' || admission.externalEffectsAuthorized !== true) throw new Error('build admission lineage mismatch');
}
export function createBuildConcernObservation(recoveryReceipt, { observedAt }, { registry }) {
 const source = baRegistry(registry);
 baObject(recoveryReceipt, 'build recovery receipt');
 const core = {
 schemaVersion: 'vexlife.build-admission-concern-observation/v1',
 contractRef: 'contract.vexlife.build-admission-concern-observation/v1',
 sourceRef: recoveryReceipt.buildRecoveryRef,
 sourceFingerprint: recoveryReceipt.semanticFingerprint,
 sourceRangeOrEventRef: `failure-phase.${recoveryReceipt.failurePhase}`,
 concernClass: recoveryReceipt.humanAttentionRequired ? 'SAFETY_OR_INTEGRITY' : 'RECOVERY_HOLD',
 signalClass: 'RECOVERY_HOLD',
 certaintyClass: 'VERIFIED',
 impactClass: recoveryReceipt.humanAttentionRequired ? 'HIGH' : 'MEDIUM',
 evidenceOriginClass: 'RECOVERY_SYSTEM',
 retryAuthorityGranted: false,
 observedAt: baTimestamp(observedAt, 'concern observedAt')
 };
 return baAddress(core, 'concernObservationRef', 'observation.build-admission');
}
export function createBuildClosure({ request, admission, verification, releaseReceipts, closedAt }, { registry }) {
 const source = baRegistry(registry);
 baValidateAdmission(admission, request, source);
 baObject(verification, 'real effect verification');
 if (verification.buildRequestRef !== request.buildRequestRef || verification.buildAdmissionRef !== admission.buildAdmissionRef) {
 throw new Error('closure verification lineage mismatch');
 }
 if (!Array.isArray(releaseReceipts) || releaseReceipts.length !== 7) throw new Error('closure requires claim plus six lease releases');
 const kinds = releaseReceipts.map((x) => x.kind).sort();
 if (semanticHash(kinds) !== semanticHash(['CAPABILITY','CLAIM','CONTEXT','EFFECT','OCCUPANCY','RESOURCE','WORKER'])) {
 throw new Error('closure release coverage mismatch');
 }
 for (const receipt of releaseReceipts) {
 baObject(receipt, 'release receipt');
 if (receipt.released !== true || receipt.currentness !== 'CURRENT') throw new Error('release receipt is not current and released');
 }
 if (new Set(releaseReceipts.map((x) => x.releaseRef)).size !== releaseReceipts.length) throw new Error('closure release receipts are duplicated');
 const completionEvidenceLineage = baAddress({
 schemaVersion: 'vexlife.build-admission-completion-evidence-lineage/v1',
 realEffectVerificationRef: verification.realEffectVerificationRef,
 realEffectVerificationFingerprint: verification.semanticFingerprint,
 buildEffectReceiptRef: verification.buildEffectReceiptRef,
 buildEffectReceiptFingerprint: verification.buildEffectReceiptFingerprint,
 gateEvidence: verification.gateResultReceipts.map((gate) => ({
 completionGateRef: gate.completionGateRef,
 gateResultRef: gate.gateResultRef,
 gateResultFingerprint: gate.semanticFingerprint,
 sourceObservationRef: gate.sourceObservationRef,
 sourceObservationHash: gate.sourceObservationHash
 })).sort((a,b) => a.completionGateRef.localeCompare(b.completionGateRef))
 }, 'lineageRef', 'lineage.build-admission.completion');
 const workgraphTransition = baAddress({
 schemaVersion: 'vexlife.intent-transition/v1',
 transitionRef: request.expectedTransitionRef,
 workNodeRef: request.workNodeRef,
 nodeFingerprint: request.workNodeFingerprint,
 graphRef: request.workgraphRef,
 graphFingerprint: request.workgraphFingerprint,
 priorState: 'VERIFYING',
 nextState: 'COMPLETED',
 reason: 'REAL_LOCAL_GIT_EFFECT_VERIFIED',
 sourceRefs: [verification.realEffectVerificationRef, verification.buildEffectReceiptRef, ...verification.gateResultReceipts.map((gate) => gate.gateResultRef)],
 completionEvidenceLineage: baClone(completionEvidenceLineage),
 createdAt: baTimestamp(closedAt, 'closedAt')
 }, 'workgraphTransitionReceiptRef', 'transition.build-admission.completed');
 const intentCompletionReceipt = baAddress({
 schemaVersion: 'vexlife.intent-receipt/v1',
 workNodeRef: request.workNodeRef,
 expectedTransitionRef: request.expectedTransitionRef,
 nodeSemanticFingerprint: request.workNodeFingerprint,
 disposition: 'COMPLETED',
 sourceState: 'COMPLETED',
 state: 'PROVEN',
 currentness: 'CURRENT',
 sourceRefs: workgraphTransition.sourceRefs,
 sourceHashes: [verification.semanticFingerprint, verification.buildEffectReceiptFingerprint, ...verification.gateResultReceipts.map((gate) => gate.semanticFingerprint)],
 completionEvidenceLineage: baClone(completionEvidenceLineage),
 formedAt: baTimestamp(closedAt, 'closedAt')
 }, 'intentCompletionReceiptRef', 'receipt.intent.build-admission.completed');
 const core = {
 schemaVersion: 'vexlife.build-admission-closure/v1',
 contractRef: 'contract.vexlife.build-admission-closure/v1',
 buildRequestRef: request.buildRequestRef,
 buildRequestFingerprint: request.semanticFingerprint,
 buildAdmissionRef: admission.buildAdmissionRef,
 buildAdmissionFingerprint: admission.semanticFingerprint,
 realEffectVerificationRef: verification.realEffectVerificationRef,
 realEffectVerificationFingerprint: verification.semanticFingerprint,
 completionEvidenceLineage: baClone(completionEvidenceLineage),
 workgraphTransition: baClone(workgraphTransition),
 intentCompletionReceipt: baClone(intentCompletionReceipt),
 canonicalWorkNodeFinalState: 'COMPLETED',
 claimRef: request.claimRef,
 releaseReceipts: baClone(releaseReceipts).sort((a,b) => a.kind.localeCompare(b.kind)),
 claimReleased: true,
 sixLeasesReleased: true,
 queuePriorityRemoved: true,
 activeProjectionRemoved: true,
 historyRetained: true,
 closedAt: baTimestamp(closedAt, 'closedAt')
 };
 baChronology(verification.consumedAt, core.closedAt, 'closure');
 return baAddress(core, 'buildClosureRef', 'closure.build-admission');
}
export function projectBuildAdmission({ request, admission, effectReceipt, verification, closure, recoveryReceipt = null }, { registry }) {
 const source = baRegistry(registry);
 const closed = Boolean(closure);
 const held = recoveryReceipt?.disposition === 'HELD_UNKNOWN';
 return baAddress({
 schemaVersion: source.projectionContract.schemaVersion,
 sourceRequestRef: request.buildRequestRef,
 sourceRequestFingerprint: request.semanticFingerprint,
 state: held ? 'HELD_UNKNOWN' : closed ? 'CLOSED' : effectReceipt ? 'EFFECT_EXECUTED' : admission ? 'ADMITTED' : 'REQUESTED',
 views: {
 QUEUE: closed ? null : { workNodeRef: request.workNodeRef, state: effectReceipt ? 'VERIFYING' : admission ? 'ADMITTED' : 'PENDING' },
 TERRAIN: closed ? null : { buildRequestRef: request.buildRequestRef, mutationPath: request.mutationPath },
 HEALTH: { state: held ? 'ATTENTION' : closed ? 'CLEAR' : 'ATTENTION', activeBuildRequestRef: closed ? null : request.buildRequestRef },
 GUIDE: closed ? null : { buildRequestRef: request.buildRequestRef, nextRef: recoveryReceipt?.buildRecoveryRef ?? verification?.realEffectVerificationRef ?? effectReceipt?.buildEffectReceiptRef ?? admission?.buildAdmissionRef }
 },
 commitSha: effectReceipt?.commitSha ?? null,
 realEffectVerificationRef: verification?.realEffectVerificationRef ?? null,
 closureRef: closure?.buildClosureRef ?? null,
 rawDiffIncluded: false,
 credentialsIncluded: false
 }, 'projectionRef', 'projection.build-admission');
}
export function createIntegratedBuildAdmissionReceipt(input, { registry }) {
 const source = baRegistry(registry);
 const required = source.simulationContract.requiredJourneyStates;
 if (semanticHash(input.journeyStates) !== semanticHash(required)) throw new Error('integrated Build Admission journey is incomplete');
 const core = {
 schemaVersion: source.simulationContract.schemaVersion,
 contractRef: source.simulationContract.contractRef,
 state: 'PASS',
 currentness: 'CURRENT',
 candidateHeadSha: input.candidateHeadSha ?? null,
 testedCheckoutSha: input.testedCheckoutSha ?? null,
 testedMergeSha: input.testedMergeSha ?? null,
 baseSha: input.baseSha ?? null,
 sourceTreeSha256: baSha256(input.sourceTreeSha256, 'sourceTreeSha256'),
 blueprintHash: baSha256(input.blueprintHash, 'blueprintHash'),
 journeyStates: baClone(input.journeyStates),
 proofRefs: baClone(source.simulationContract.proofRefs),
 buildRequestRef: input.request.buildRequestRef,
 buildRequestFingerprint: input.request.semanticFingerprint,
 buildAdmissionRef: input.admission.buildAdmissionRef,
 buildAdmissionFingerprint: input.admission.semanticFingerprint,
 buildEffectReceiptRef: input.effectReceipt.buildEffectReceiptRef,
 buildEffectReceiptFingerprint: input.effectReceipt.semanticFingerprint,
 realEffectVerificationRef: input.verification.realEffectVerificationRef,
 realEffectVerificationFingerprint: input.verification.semanticFingerprint,
 buildClosureRef: input.closure.buildClosureRef,
 buildClosureFingerprint: input.closure.semanticFingerprint,
 workgraphTransitionReceiptRef: input.closure.workgraphTransition.workgraphTransitionReceiptRef,
 workgraphTransitionFingerprint: input.closure.workgraphTransition.semanticFingerprint,
 intentCompletionReceiptRef: input.closure.intentCompletionReceipt.intentCompletionReceiptRef,
 intentCompletionFingerprint: input.closure.intentCompletionReceipt.semanticFingerprint,
 canonicalWorkNodeFinalState: input.closure.canonicalWorkNodeFinalState,
 projectionRef: input.projection.projectionRef,
 projectionFingerprint: input.projection.semanticFingerprint,
 commitSha: input.effectReceipt.commitSha,
 commitParentSha: input.effectReceipt.commitParentSha,
 commitTreeSha: input.effectReceipt.commitTreeSha,
 beforeBlobSha: input.effectReceipt.beforeBlobSha,
 afterBlobSha: input.effectReceipt.afterBlobSha,
 diffFingerprint: input.effectReceipt.diffFingerprint,
 changedPaths: baClone(input.effectReceipt.changedPaths),
 externalEffectsExecuted: true,
 effectScope: source.adapter.effectScope,
 networkUsed: false,
 remoteConfigured: false,
 implementationCheckoutMutated: false,
 duplicateReplayCreatedSecondCommit: false,
 failureRecoveryProofRefs: baClone(input.failureRecoveryProofRefs ?? []),
 concernObservationRefs: baClone(input.concernObservationRefs ?? []),
 claimReleased: input.closure.claimReleased,
 sixLeasesReleased: input.closure.sixLeasesReleased,
 causalEvidence: {
 request: baClone(input.request),
 admission: baClone(input.admission),
 effectReceipt: baClone(input.effectReceipt),
 verification: baClone(input.verification),
 closure: baClone(input.closure),
 projection: baClone(input.projection)
 }
 };
 return baAddress(core, 'receiptRef', 'receipt.build-admission.integrated');
}
export function validateIntegratedBuildAdmissionReceipt(receipt, { registry }) {
 const source = baRegistry(registry);
 const errors = [];
 try {
 baCanonical(receipt, 'receiptRef', 'receipt.build-admission.integrated', 'integrated Build Admission receipt');
 if (receipt.state !== 'PASS' || receipt.currentness !== 'CURRENT' || receipt.externalEffectsExecuted !== true ||
 receipt.effectScope !== source.adapter.effectScope || receipt.networkUsed !== false || receipt.remoteConfigured !== false ||
 receipt.implementationCheckoutMutated !== false || receipt.duplicateReplayCreatedSecondCommit !== false ||
 receipt.claimReleased !== true || receipt.sixLeasesReleased !== true || receipt.canonicalWorkNodeFinalState !== 'COMPLETED') errors.push('integrated boundary mismatch');
 if (semanticHash(receipt.journeyStates) !== semanticHash(source.simulationContract.requiredJourneyStates) ||
 semanticHash(receipt.proofRefs) !== semanticHash(source.simulationContract.proofRefs)) errors.push('integrated coverage mismatch');
 if (!BA_SHA256.test(receipt.sourceTreeSha256 ?? '') || !BA_SHA256.test(receipt.blueprintHash ?? '')) errors.push('integrated source/Blueprint binding missing');
 const evidence = baObject(receipt.causalEvidence, 'integrated causal evidence');
 for (const [field, object, refField, fingerprint] of [
 ['request', evidence.request, 'buildRequestRef', receipt.buildRequestFingerprint],
 ['admission', evidence.admission, 'buildAdmissionRef', receipt.buildAdmissionFingerprint],
 ['effect', evidence.effectReceipt, 'buildEffectReceiptRef', receipt.buildEffectReceiptFingerprint],
 ['verification', evidence.verification, 'realEffectVerificationRef', receipt.realEffectVerificationFingerprint],
 ['closure', evidence.closure, 'buildClosureRef', receipt.buildClosureFingerprint],
 ['projection', evidence.projection, 'projectionRef', receipt.projectionFingerprint]
 ]) if (!object || object[refField] == null || object.semanticFingerprint !== fingerprint) errors.push(`integrated ${field} detached`);
 if (receipt.commitSha !== evidence.effectReceipt?.commitSha || receipt.commitTreeSha !== evidence.effectReceipt?.commitTreeSha ||
 receipt.afterBlobSha !== evidence.effectReceipt?.afterBlobSha || receipt.diffFingerprint !== evidence.effectReceipt?.diffFingerprint ||
 receipt.workgraphTransitionFingerprint !== evidence.closure?.workgraphTransition?.semanticFingerprint ||
 receipt.intentCompletionFingerprint !== evidence.closure?.intentCompletionReceipt?.semanticFingerprint ||
 semanticHash(receipt.changedPaths) !== semanticHash(evidence.effectReceipt?.changedPaths ?? [])) errors.push('integrated Git readback detached');
 } catch (error) { errors.push(error.message); }
 return { ok: errors.length === 0, state: errors.length ? 'INVALID' : 'EXECUTED_CURRENT', errors };
}
export function createBuildAdmissionConsumptionReceipt(integratedReceipt, consumerRef, { observedAt }, { registry }) {
 const source = baRegistry(registry);
 const validation = validateIntegratedBuildAdmissionReceipt(integratedReceipt, { registry: source });
 if (!validation.ok) throw new Error(`invalid integrated Build Admission receipt: ${validation.errors.join('; ')}`);
 if (!source.simulationContract.consumerRefs.includes(consumerRef)) throw new Error('unknown Build Admission consumer');
 return baAddress({
 schemaVersion: 'vexlife.build-admission-consumption/v1',
 contractRef: 'contract.vexlife.build-admission-consumption/v1',
 consumerRef,
 integratedReceiptRef: integratedReceipt.receiptRef,
 integratedReceiptFingerprint: integratedReceipt.semanticFingerprint,
 integratedState: integratedReceipt.state,
 integratedCurrentness: integratedReceipt.currentness,
 observedAt: baTimestamp(observedAt, 'consumption observedAt'),
 admitted: true
 }, 'consumptionReceiptRef', `consumption.build-admission.${consumerRef.toLowerCase()}`);
}
export function readIntegratedBuildAdmissionReceipt(receiptPath, { registry }) {
 baRegistry(registry);
 const value = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
 return { value, validation: validateIntegratedBuildAdmissionReceipt(value, { registry }) };
}
export const BUILD_ADMISSION_PROOF_REFS = Object.freeze(Array.from({ length: 26 }, (_, i) => `BA${i}`));
// [VXG RealForever]
const direct = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (direct) {
 const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
 const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint/build-admission-registry.json'), 'utf8'));
 const receiptPath = path.join(ROOT, registry.simulationContract.receiptPath);
 let receipt = null;
 try { receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')); } catch {}
 const validation = validateIntegratedBuildAdmissionReceipt(receipt, { registry });
 console.log(JSON.stringify({
 state: validation.ok ? 'BUILD_ADMISSION_CURRENT' : 'BUILD_ADMISSION_UNKNOWN', currentness: validation.state,
 receiptPath: registry.simulationContract.receiptPath, receiptRef: receipt?.receiptRef ?? null,
 semanticFingerprint: receipt?.semanticFingerprint ?? null, commitSha: receipt?.commitSha ?? null,
 sourceTreeSha256: receipt?.sourceTreeSha256 ?? null, blueprintHash: receipt?.blueprintHash ?? null,
 errors: validation.errors
 }, null, 2));
 if (!validation.ok) process.exitCode = 1;
}
