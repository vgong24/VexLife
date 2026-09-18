#!/usr/bin/env python3
"""Compare the exact G04B source model with one trained candidate.

This evaluator provides reproducible prompt/output and simple fixture checks. It
never promotes a candidate. Human/semantic, privacy, identity and capability
review remain separate acceptance gates.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

SCHEMA = "vexlife.foundation-training-manifest/v1"
EXECUTION_DEVICE_PROFILES = {
    "CUDA": "hardware.windows-x64.nvidia.cuda12-compatible",
    "MPS": "hardware.macos-arm64.apple-m4-pro.metal",
}
HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
REPO_ROOT = Path(__file__).resolve().parents[2]
CANDIDATE_EVIDENCE_FILES = {
    "vex-foundation-training-receipt.json",
    "vex-foundation-evaluation-receipt.json",
}


class FoundationEvaluationError(RuntimeError):
    pass


def fail(message: str) -> None:
    raise FoundationEvaluationError(message)


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def manifest_fingerprint(manifest: dict[str, Any]) -> str:
    return sha256_bytes(canonical_json(manifest))


def prior_model_identity(manifest: dict[str, Any]) -> str:
    payload = {
        "schemaVersion": "vexlife.prior-model-identity/v1",
        "sourceModelRepo": manifest["sourceModelRepo"],
        "sourceModelRevision": manifest["sourceModelRevision"],
        "sourceModelIdentityClass": "EXACT_REPOSITORY_PLUS_COMMIT_REVISION",
    }
    return f"model-source.vexlife.sha256.{sha256_bytes(canonical_json(payload))}"


def candidate_model_identity(manifest: dict[str, Any], candidate_artifact_fingerprint: str) -> str:
    payload = {
        "schemaVersion": "vexlife.candidate-model-identity/v1",
        "priorModelIdentity": prior_model_identity(manifest),
        "trainingRunRef": manifest["trainingRunRef"],
        "candidateArtifactFingerprint": candidate_artifact_fingerprint,
    }
    return f"model-candidate.vexlife.sha256.{sha256_bytes(canonical_json(payload))}"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1024 * 1024)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def candidate_file_digests(candidate: Path) -> dict[str, str]:
    if not candidate.is_dir():
        fail(f"candidate directory is missing: {candidate}")
    result: dict[str, str] = {}
    for path in sorted(candidate.rglob("*")):
        if path.is_file() and path.name not in CANDIDATE_EVIDENCE_FILES:
            result[str(path.relative_to(candidate)).replace(os.sep, "/")] = sha256_file(path)
    if not result:
        fail("candidate checkpoint contains no model/processor files")
    return result


def validate_execution_manifest_binding(manifest: dict[str, Any]) -> tuple[str, str]:
    execution_device = manifest.get("executionDevice")
    if execution_device not in EXECUTION_DEVICE_PROFILES:
        fail("executionDevice must explicitly select CUDA or MPS; G04B evaluation cannot accept implicit CPU/AUTO training provenance")
    expected_profile = EXECUTION_DEVICE_PROFILES[execution_device]
    observed_profile = manifest.get("expectedHardwareProfileRef")
    if observed_profile != expected_profile:
        fail(
            f"executionDevice={execution_device} requires expectedHardwareProfileRef={expected_profile}"
        )
    precision = manifest.get("precision")
    if precision not in {"bf16", "fp16", "fp32"}:
        fail("precision must be bf16, fp16 or fp32")
    return execution_device, expected_profile


def verify_training_host_provenance(receipt: dict[str, Any], manifest: dict[str, Any]) -> dict[str, Any]:
    execution_device, expected_profile = validate_execution_manifest_binding(manifest)

    expected_manifest_fingerprint = manifest_fingerprint(manifest)
    if receipt.get("manifestFingerprint") != expected_manifest_fingerprint:
        fail("candidate receipt manifestFingerprint does not match the exact training manifest bytes")
    if receipt.get("executionDevice") != execution_device:
        fail("candidate receipt executionDevice does not match the exact training manifest")
    if receipt.get("expectedHardwareProfileRef") != expected_profile:
        fail("candidate receipt expectedHardwareProfileRef does not match the exact admitted execution profile")

    observation = receipt.get("executionObservation")
    if not isinstance(observation, dict):
        fail("candidate receipt contains no executionObservation object")
    receipt_observation_fingerprint = receipt.get("executionObservationFingerprint")
    embedded_observation_fingerprint = observation.get("observationFingerprint")
    if not isinstance(receipt_observation_fingerprint, str) or not HEX64.fullmatch(receipt_observation_fingerprint):
        fail("candidate receipt contains no valid executionObservationFingerprint")
    if embedded_observation_fingerprint != receipt_observation_fingerprint:
        fail("candidate receipt execution observation embedded/top-level fingerprints disagree")
    observation_payload = dict(observation)
    observation_payload.pop("observationFingerprint", None)
    recomputed_observation_fingerprint = sha256_bytes(canonical_json(observation_payload))
    if recomputed_observation_fingerprint != receipt_observation_fingerprint:
        fail("candidate receipt executionObservationFingerprint does not match the exact recorded observation bytes")

    if observation.get("executionDevice") != execution_device:
        fail("candidate receipt executionObservation.executionDevice contradicts the exact training manifest")
    if observation.get("expectedHardwareProfileRef") != expected_profile:
        fail("candidate receipt executionObservation.expectedHardwareProfileRef contradicts the exact admitted profile")
    if observation.get("precision") != manifest.get("precision"):
        fail("candidate receipt executionObservation.precision contradicts the exact training manifest")
    if not isinstance(observation.get("torchVersion"), str) or not observation["torchVersion"]:
        fail("candidate receipt executionObservation has no concrete torchVersion")

    device_type = observation.get("deviceType")
    platform_name = observation.get("platform")
    architecture = observation.get("architecture")
    device_name = observation.get("deviceName")
    if not isinstance(device_name, str) or not device_name:
        fail("candidate receipt executionObservation has no concrete deviceName")

    if execution_device == "MPS":
        if device_type != "mps":
            fail("MPS training provenance requires deviceType=mps")
        if platform_name != "darwin" or architecture != "arm64":
            fail("MPS training provenance requires darwin/arm64")
        if device_name != "Apple M4 Pro":
            fail("admitted MPS training provenance requires deviceName=Apple M4 Pro")
        if observation.get("mpsBuilt") is not True or observation.get("mpsAvailable") is not True:
            fail("MPS training provenance requires MPS built=true and available=true")
        if observation.get("cudaRuntimeVersion") is not None:
            fail("MPS training provenance cannot claim a CUDA runtime version")
        accelerator_memory = observation.get("acceleratorMemoryBytes")
        if accelerator_memory is not None and (not isinstance(accelerator_memory, int) or accelerator_memory <= 0):
            fail("MPS acceleratorMemoryBytes must be null or a positive integer")
    elif execution_device == "CUDA":
        if device_type != "cuda":
            fail("CUDA training provenance requires deviceType=cuda")
        if platform_name != "win32" or architecture not in {"amd64", "x86_64"}:
            fail("CUDA training provenance requires Windows x64")
        if "nvidia" not in device_name.casefold():
            fail("CUDA training provenance requires a concrete NVIDIA deviceName")
        cuda_runtime = observation.get("cudaRuntimeVersion")
        if not isinstance(cuda_runtime, str) or not cuda_runtime.startswith("12."):
            fail("CUDA training provenance requires a CUDA 12.x runtime")
        if observation.get("mpsBuilt") is not False or observation.get("mpsAvailable") is not False:
            fail("CUDA training provenance cannot claim MPS built/available")
        accelerator_memory = observation.get("acceleratorMemoryBytes")
        if not isinstance(accelerator_memory, int) or accelerator_memory <= 0:
            fail("CUDA training provenance requires positive acceleratorMemoryBytes")
        capability = observation.get("computeCapability")
        if (
            not isinstance(capability, list)
            or len(capability) != 2
            or any(not isinstance(item, int) or item < 0 for item in capability)
        ):
            fail("CUDA training provenance requires a concrete two-part computeCapability")

    return {
        "manifestFingerprint": expected_manifest_fingerprint,
        "executionDevice": execution_device,
        "expectedHardwareProfileRef": expected_profile,
        "executionObservationFingerprint": receipt_observation_fingerprint,
        "deviceType": device_type,
        "platform": platform_name,
        "architecture": architecture,
        "deviceName": device_name,
        "torchVersion": observation["torchVersion"],
        "precision": observation["precision"],
        "historicalTrainingHostEvidenceVerified": True,
        "historicalTrainingHostReobservedByEvaluator": False,
    }


def verify_candidate_receipt_binding(
    candidate: Path,
    manifest: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, str], str, dict[str, Any]]:
    receipt_path = candidate / "vex-foundation-training-receipt.json"
    if not receipt_path.is_file():
        fail("candidate directory has no vex-foundation-training-receipt.json")
    try:
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise FoundationEvaluationError(f"candidate training receipt could not be read: {exc}") from exc
    if receipt.get("schemaVersion") != "vexlife.foundation-training-receipt/v1":
        fail("candidate training receipt schema is not current")
    if receipt.get("trainingActuallyExecuted") is not True or receipt.get("modelWeightsChanged") is not True:
        fail("candidate receipt does not prove a real weight-changing training execution")
    if int(receipt.get("changedParameterCount", 0)) <= 0:
        fail("candidate receipt reports no changed parameters")
    for field in (
        "trainingRunRef",
        "sourceModelRepo",
        "sourceModelRevision",
        "sourceModelSnapshotFingerprint",
        "sourceManifestFingerprint",
        "trainingDatasetSha256",
        "heldoutDatasetSha256",
    ):
        if receipt.get(field) != manifest.get(field):
            fail(f"candidate receipt {field} does not match the exact training manifest")
    if receipt.get("sourceModelIdentityClass") != "EXACT_REPOSITORY_PLUS_COMMIT_REVISION":
        fail("candidate receipt does not preserve the generation-1 exact source identity class")
    if receipt.get("sourceModelSnapshotFingerprintObserved") is not False:
        fail("candidate receipt must not represent the declared source snapshot fingerprint as independently observed")
    if receipt.get("sourceManifestFingerprintObserved") is not False:
        fail("candidate receipt must not represent the admitted Source Manifest fingerprint as independently observed by Python")

    training_host_provenance = verify_training_host_provenance(receipt, manifest)

    expected_prior_identity = prior_model_identity(manifest)
    if receipt.get("priorModelIdentity") != expected_prior_identity:
        fail("candidate receipt priorModelIdentity does not match the deterministic exact source-model identity")

    expected_digests = receipt.get("candidateArtifactDigests")
    expected_fingerprint = receipt.get("candidateArtifactFingerprint")
    if not isinstance(expected_digests, dict) or not expected_digests:
        fail("candidate receipt contains no exact artifact digest map")
    if not isinstance(expected_fingerprint, str) or not HEX64.fullmatch(expected_fingerprint):
        fail("candidate receipt contains no valid candidate artifact fingerprint")
    actual_digests = candidate_file_digests(candidate)
    if actual_digests != expected_digests:
        expected_paths = set(expected_digests)
        actual_paths = set(actual_digests)
        missing = sorted(expected_paths - actual_paths)
        extra = sorted(actual_paths - expected_paths)
        changed = sorted(path for path in expected_paths & actual_paths if expected_digests[path] != actual_digests[path])
        fail(f"candidate bytes drifted after training: missing={missing} extra={extra} changed={changed}")
    actual_fingerprint = sha256_bytes(canonical_json(actual_digests))
    if actual_fingerprint != expected_fingerprint:
        fail("candidate artifact fingerprint does not match the exact observed candidate bytes")

    expected_candidate_identity = candidate_model_identity(manifest, actual_fingerprint)
    if receipt.get("candidateModelIdentity") != expected_candidate_identity:
        fail("candidate receipt candidateModelIdentity does not match parent + run + exact candidate bytes")
    return receipt, actual_digests, actual_fingerprint, training_host_provenance


def resolve_repo_path(raw: str, label: str) -> Path:
    target = (REPO_ROOT / raw).resolve()
    try:
        target.relative_to(REPO_ROOT.resolve())
    except ValueError as exc:
        raise FoundationEvaluationError(f"{label} escapes repository root") from exc
    return target


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise FoundationEvaluationError(f"manifest could not be read: {exc}") from exc
    if manifest.get("schemaVersion") != SCHEMA:
        fail(f"manifest.schemaVersion must be {SCHEMA}")
    if not isinstance(manifest.get("sourceModelRepo"), str) or "/" not in manifest["sourceModelRepo"]:
        fail("sourceModelRepo must be an exact owner/repository identity")
    if not HEX40.fullmatch(str(manifest.get("sourceModelRevision", ""))):
        fail("sourceModelRevision must be one exact 40-character lowercase commit identity")
    if not HEX64.fullmatch(str(manifest.get("sourceModelSnapshotFingerprint", ""))):
        fail("sourceModelSnapshotFingerprint must be a declared lowercase SHA-256 expectation")
    if not HEX64.fullmatch(str(manifest.get("sourceManifestFingerprint", ""))):
        fail("sourceManifestFingerprint must be the exact lowercase Source Manifest tree SHA-256 admitted by preflight")
    if not HEX64.fullmatch(str(manifest.get("trainingDatasetSha256", ""))):
        fail("trainingDatasetSha256 must be lowercase SHA-256")
    if not HEX64.fullmatch(str(manifest.get("heldoutDatasetSha256", ""))):
        fail("heldoutDatasetSha256 must be lowercase SHA-256")
    validate_execution_manifest_binding(manifest)
    if manifest.get("activationAuthorized") is not False:
        fail("evaluation requires the training manifest to preserve activationAuthorized=false")
    if manifest.get("publicUploadAuthorized") is not False:
        fail("evaluation requires the training manifest to preserve publicUploadAuthorized=false")
    if "modelDownloadAuthorized" in manifest:
        fail("training manifest cannot carry modelDownloadAuthorized; source-model provisioning authority is external to G04B evaluation")
    return manifest


def load_heldout(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    path = resolve_repo_path(manifest["heldoutDatasetPath"], "heldoutDatasetPath")
    if not path.is_file():
        fail(f"held-out dataset is missing: {path}")
    observed = sha256_file(path)
    if observed != manifest["heldoutDatasetSha256"]:
        fail(f"held-out dataset SHA-256 mismatch: expected {manifest['heldoutDatasetSha256']}, observed {observed}")
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, raw in enumerate(handle, 1):
            if not raw.strip():
                continue
            try:
                row = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise FoundationEvaluationError(f"invalid JSONL at line {line_number}: {exc}") from exc
            if not isinstance(row.get("exampleRef"), str) or not row["exampleRef"]:
                fail(f"held-out row {line_number} requires exampleRef")
            messages = row.get("messages")
            if not isinstance(messages, list) or not messages:
                fail(f"held-out row {line_number} requires messages")
            for message in messages:
                if message.get("role") not in {"system", "user", "assistant"}:
                    fail(f"held-out row {line_number} contains unsupported role")
                if not isinstance(message.get("content"), str):
                    fail(f"held-out row {line_number} supports text-only content in generation 1")
            if messages[-1].get("role") == "assistant":
                prompt_messages = messages[:-1]
            else:
                prompt_messages = messages
            if not prompt_messages:
                fail(f"held-out row {line_number} leaves no prompt messages")
            for field in ("expectedContains", "forbiddenContains"):
                value = row.get(field, [])
                if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
                    fail(f"held-out row {line_number}.{field} must be an array of strings")
            rows.append({
                "exampleRef": row["exampleRef"],
                "messages": prompt_messages,
                "expectedContains": row.get("expectedContains", []),
                "forbiddenContains": row.get("forbiddenContains", []),
                "evaluationClass": row.get("evaluationClass", "UNCLASSIFIED"),
                "sourceRefs": row.get("sourceRefs", []),
                "maxNewTokens": int(row.get("maxNewTokens", 160)),
            })
    if not rows:
        fail("held-out dataset is empty")
    return rows


def import_runtime():
    try:
        import torch  # type: ignore
        from transformers import AutoProcessor  # type: ignore
        try:
            from transformers import AutoModelForMultimodalLM as AutoModel  # type: ignore
        except ImportError:
            from transformers import AutoModelForImageTextToText as AutoModel  # type: ignore
    except Exception as exc:  # noqa: BLE001
        raise FoundationEvaluationError(
            "evaluation runtime unavailable; install a qualified PyTorch build and training/foundation-generation/requirements.txt"
        ) from exc
    return torch, AutoProcessor, AutoModel


def dtype_for(torch, precision: str):
    if precision == "bf16":
        return torch.bfloat16
    if precision == "fp16":
        return torch.float16
    return torch.float32


def load_model_pair(manifest: dict[str, Any], candidate: Path):
    receipt, actual_digests, actual_fingerprint, training_host_provenance = verify_candidate_receipt_binding(candidate, manifest)
    torch, AutoProcessor, AutoModel = import_runtime()
    local_only = True
    common = {
        "revision": manifest["sourceModelRevision"],
        "trust_remote_code": False,
        "local_files_only": True,
    }
    processor = AutoProcessor.from_pretrained(manifest["sourceModelRepo"], **common)
    source = AutoModel.from_pretrained(
        manifest["sourceModelRepo"],
        torch_dtype=dtype_for(torch, manifest.get("precision", "bf16")),
        **common,
    )
    trained = AutoModel.from_pretrained(
        str(candidate),
        torch_dtype=dtype_for(torch, manifest.get("precision", "bf16")),
        trust_remote_code=False,
        local_files_only=True,
    )
    candidate_processor = AutoProcessor.from_pretrained(str(candidate), trust_remote_code=False, local_files_only=True)
    return (
        torch,
        processor,
        source,
        candidate_processor,
        trained,
        receipt,
        actual_digests,
        actual_fingerprint,
        training_host_provenance,
        local_only,
    )


def generate(torch, processor: Any, model: Any, messages: list[dict[str, str]], max_new_tokens: int, device: Any) -> str:
    inputs = processor.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    )
    if not isinstance(inputs, dict):
        inputs = dict(inputs)
    inputs = {key: value.to(device) for key, value in inputs.items() if hasattr(value, "to")}
    input_ids = inputs.get("input_ids")
    if input_ids is None:
        fail("processor returned no input_ids")
    with torch.no_grad():
        output = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            use_cache=True,
        )
    generated = output[0][input_ids.shape[-1]:]
    tokenizer = getattr(processor, "tokenizer", processor)
    return tokenizer.decode(generated, skip_special_tokens=True).strip()


def evaluate_output(text: str, expected: list[str], forbidden: list[str]) -> dict[str, Any]:
    lowered = text.casefold()
    expected_results = {item: item.casefold() in lowered for item in expected}
    forbidden_results = {item: item.casefold() in lowered for item in forbidden}
    return {
        "expected": expected_results,
        "forbidden": forbidden_results,
        "expectedPassed": all(expected_results.values()),
        "forbiddenPassed": not any(forbidden_results.values()),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="G04B baseline-versus-candidate evaluator")
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--candidate", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        manifest = load_manifest(args.manifest.resolve())
        rows = load_heldout(manifest)
        candidate = args.candidate.resolve()
        (
            torch,
            source_processor,
            source_model,
            candidate_processor,
            candidate_model,
            training_receipt,
            actual_candidate_digests,
            actual_candidate_fingerprint,
            training_host_provenance,
            local_only,
        ) = load_model_pair(manifest, candidate)
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        source_model.to(device).eval()
        candidate_model.to(device).eval()
        started = time.time()
        cases = []
        for row in rows:
            baseline_text = generate(torch, source_processor, source_model, row["messages"], row["maxNewTokens"], device)
            candidate_text = generate(torch, candidate_processor, candidate_model, row["messages"], row["maxNewTokens"], device)
            baseline_checks = evaluate_output(baseline_text, row["expectedContains"], row["forbiddenContains"])
            candidate_checks = evaluate_output(candidate_text, row["expectedContains"], row["forbiddenContains"])
            cases.append({
                "exampleRef": row["exampleRef"],
                "evaluationClass": row["evaluationClass"],
                "sourceRefs": row["sourceRefs"],
                "baselineOutput": baseline_text,
                "candidateOutput": candidate_text,
                "baselineChecks": baseline_checks,
                "candidateChecks": candidate_checks,
                "simpleFixtureDelta": int(candidate_checks["expectedPassed"] and candidate_checks["forbiddenPassed"]) - int(baseline_checks["expectedPassed"] and baseline_checks["forbiddenPassed"]),
            })
        receipt = {
            "schemaVersion": "vexlife.foundation-evaluation-receipt/v1",
            "trainingRunRef": manifest["trainingRunRef"],
            "trainingReceiptFingerprint": sha256_bytes(canonical_json(training_receipt)),
            "trainingManifestFingerprint": training_host_provenance["manifestFingerprint"],
            "trainingExecutionDevice": training_host_provenance["executionDevice"],
            "trainingExpectedHardwareProfileRef": training_host_provenance["expectedHardwareProfileRef"],
            "trainingExecutionObservationFingerprint": training_host_provenance["executionObservationFingerprint"],
            "trainingExecutionDeviceType": training_host_provenance["deviceType"],
            "trainingExecutionPlatform": training_host_provenance["platform"],
            "trainingExecutionArchitecture": training_host_provenance["architecture"],
            "trainingExecutionDeviceName": training_host_provenance["deviceName"],
            "trainingHostProvenanceVerified": True,
            "trainingHostProvenanceReobserved": False,
            "priorModelIdentity": prior_model_identity(manifest),
            "candidateModelIdentity": candidate_model_identity(manifest, actual_candidate_fingerprint),
            "sourceModelRepo": manifest["sourceModelRepo"],
            "sourceModelRevision": manifest["sourceModelRevision"],
            "sourceModelSnapshotFingerprint": manifest["sourceModelSnapshotFingerprint"],
            "sourceModelSnapshotFingerprintObserved": False,
            "sourceModelIdentityClass": "EXACT_REPOSITORY_PLUS_COMMIT_REVISION",
            "sourceManifestFingerprint": manifest["sourceManifestFingerprint"],
            "sourceManifestFingerprintObserved": False,
            "candidateArtifactFingerprint": actual_candidate_fingerprint,
            "candidateArtifactDigests": actual_candidate_digests,
            "candidateArtifactBytesVerified": True,
            "heldoutDatasetSha256": manifest["heldoutDatasetSha256"],
            "caseCount": len(cases),
            "simpleFixtureDeltaTotal": sum(case["simpleFixtureDelta"] for case in cases),
            "cases": cases,
            "deviceType": device.type,
            "localFilesOnly": local_only,
            "elapsedSeconds": round(time.time() - started, 3),
            "automaticPromotion": False,
            "evaluationDisposition": "REQUIRES_SEMANTIC_PRIVACY_IDENTITY_CAPABILITY_REVIEW",
        }
        output = args.output.resolve() if args.output else candidate / "vex-foundation-evaluation-receipt.json"
        output.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps(receipt, indent=2, sort_keys=True))
        return 0
    except FoundationEvaluationError as exc:
        print(json.dumps({
            "schemaVersion": "vexlife.foundation-evaluation-error/v1",
            "error": str(exc),
            "automaticPromotion": False,
        }, indent=2, sort_keys=True), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
