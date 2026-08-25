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
import re
import sys
import time
from pathlib import Path
from typing import Any

SCHEMA = "vexlife.foundation-training-manifest/v1"
HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
REPO_ROOT = Path(__file__).resolve().parents[2]


class FoundationEvaluationError(RuntimeError):
    pass


def fail(message: str) -> None:
    raise FoundationEvaluationError(message)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(1024 * 1024)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


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
    if not HEX40.fullmatch(str(manifest.get("sourceModelRevision", ""))):
        fail("sourceModelRevision must be one exact 40-character lowercase commit identity")
    if not HEX64.fullmatch(str(manifest.get("heldoutDatasetSha256", ""))):
        fail("heldoutDatasetSha256 must be lowercase SHA-256")
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
    torch, AutoProcessor, AutoModel = import_runtime()
    local_only = not bool(manifest.get("modelDownloadAuthorized", False))
    common = {
        "revision": manifest["sourceModelRevision"],
        "trust_remote_code": False,
        "local_files_only": local_only,
    }
    processor = AutoProcessor.from_pretrained(manifest["sourceModelRepo"], **common)
    source = AutoModel.from_pretrained(
        manifest["sourceModelRepo"],
        torch_dtype=dtype_for(torch, manifest.get("precision", "bf16")),
        **common,
    )
    if not candidate.is_dir():
        fail(f"candidate directory is missing: {candidate}")
    receipt_path = candidate / "vex-foundation-training-receipt.json"
    if not receipt_path.is_file():
        fail("candidate directory has no vex-foundation-training-receipt.json")
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    if receipt.get("trainingActuallyExecuted") is not True or receipt.get("modelWeightsChanged") is not True:
        fail("candidate receipt does not prove a real weight-changing training execution")
    trained = AutoModel.from_pretrained(
        str(candidate),
        torch_dtype=dtype_for(torch, manifest.get("precision", "bf16")),
        trust_remote_code=False,
        local_files_only=True,
    )
    candidate_processor = AutoProcessor.from_pretrained(str(candidate), trust_remote_code=False, local_files_only=True)
    return torch, processor, source, candidate_processor, trained, receipt, local_only


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
        torch, source_processor, source_model, candidate_processor, candidate_model, training_receipt, local_only = load_model_pair(manifest, candidate)
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
            "trainingReceiptFingerprint": hashlib.sha256(json.dumps(training_receipt, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest(),
            "sourceModelRepo": manifest["sourceModelRepo"],
            "sourceModelRevision": manifest["sourceModelRevision"],
            "candidateArtifactFingerprint": training_receipt.get("candidateArtifactFingerprint"),
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
