#!/usr/bin/env python3
"""G04B executable Vex foundation-generation trainer.

The current accepted model is never modified in place. This program loads one
exact source revision, selects a declared full-rank parameter surface, performs
real optimizer steps, saves a separate candidate checkpoint, and emits evidence
showing whether neural parameter bytes actually changed.

No candidate is activated or promoted by this program.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import re
import sys
import time
from pathlib import Path
from typing import Any, Iterable

SCHEMA = "vexlife.foundation-training-manifest/v1"
MODES = {"ADAPTER_PROBE", "FOUNDATION_PARTIAL_FULL_RANK", "FOUNDATION_FULL"}
HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
REPO_ROOT = Path(__file__).resolve().parents[2]


class FoundationTrainingError(RuntimeError):
    pass


def fail(message: str) -> None:
    raise FoundationTrainingError(message)


def fresh_attempt_state() -> dict[str, Any]:
    return {
        "optimizerAttempted": False,
        "optimizerSteps": 0,
        "selectedParameterChangeState": "NOT_OBSERVED",
    }


def training_failure_truth(attempt_state: dict[str, Any]) -> dict[str, Any]:
    attempted = attempt_state.get("optimizerAttempted") is True
    steps = int(attempt_state.get("optimizerSteps", 0) or 0)
    change_state = str(attempt_state.get("selectedParameterChangeState", "NOT_OBSERVED"))
    if not attempted and steps <= 0:
        return {
            "effectState": "PRE_EXECUTION_NO_EFFECT",
            "trainingActuallyExecuted": False,
            "modelWeightsChanged": False,
            "optimizerSteps": 0,
        }
    if steps <= 0:
        return {
            "effectState": "OPTIMIZER_ATTEMPT_EFFECT_UNKNOWN",
            "trainingActuallyExecuted": None,
            "modelWeightsChanged": None,
            "optimizerSteps": 0,
        }
    if change_state == "CHANGED":
        return {
            "effectState": "POST_OPTIMIZER_CHANGED",
            "trainingActuallyExecuted": True,
            "modelWeightsChanged": True,
            "optimizerSteps": steps,
        }
    if change_state == "UNCHANGED":
        return {
            "effectState": "POST_OPTIMIZER_UNCHANGED",
            "trainingActuallyExecuted": True,
            "modelWeightsChanged": False,
            "optimizerSteps": steps,
        }
    return {
        "effectState": "POST_OPTIMIZER_CHANGE_UNKNOWN",
        "trainingActuallyExecuted": True,
        "modelWeightsChanged": None,
        "optimizerSteps": steps,
    }


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


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
    if not isinstance(raw, str) or not raw:
        fail(f"{label} is required")
    target = (REPO_ROOT / raw).resolve()
    root = REPO_ROOT.resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise FoundationTrainingError(f"{label} escapes repository root") from exc
    return target


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise FoundationTrainingError(f"manifest could not be read: {exc}") from exc
    if manifest.get("schemaVersion") != SCHEMA:
        fail(f"manifest.schemaVersion must be {SCHEMA}")
    mode = manifest.get("trainingMode")
    if mode not in MODES:
        fail(f"unsupported trainingMode {mode!r}")
    if mode == "ADAPTER_PROBE":
        fail("ADAPTER_PROBE is comparative only and is not implemented by the G04B generation-1 trainer")
    revision = manifest.get("sourceModelRevision")
    if not isinstance(revision, str) or not HEX40.fullmatch(revision):
        fail("sourceModelRevision must be one exact 40-character lowercase commit identity")
    snapshot = manifest.get("sourceModelSnapshotFingerprint")
    if not isinstance(snapshot, str) or not HEX64.fullmatch(snapshot):
        fail("sourceModelSnapshotFingerprint must be a declared lowercase SHA-256 expectation")
    for field in (
        "trainingRunRef",
        "sourceModelRepo",
        "licenseRef",
        "trainingDatasetPath",
        "trainingDatasetSha256",
        "heldoutDatasetPath",
        "heldoutDatasetSha256",
        "outputDir",
        "expectedHardwareProfileRef",
        "rollbackArtifactRef",
    ):
        if not isinstance(manifest.get(field), str) or not manifest[field]:
            fail(f"manifest.{field} is required")
    for field in ("trainingDatasetSha256", "heldoutDatasetSha256"):
        if not HEX64.fullmatch(manifest[field]):
            fail(f"manifest.{field} must be lowercase SHA-256")
    if manifest.get("activationAuthorized") is not False:
        fail("training manifest must keep activationAuthorized=false")
    if manifest.get("publicUploadAuthorized") is not False:
        fail("training manifest must keep publicUploadAuthorized=false")
    if int(manifest.get("maxSteps", 0)) <= 0:
        fail("maxSteps must be greater than zero for a real G04B training run")
    if int(manifest.get("epochs", 0)) <= 0:
        fail("epochs must be greater than zero")
    if float(manifest.get("learningRate", 0.0)) <= 0:
        fail("learningRate must be greater than zero")
    if int(manifest.get("maxSequenceLength", 0)) < 32:
        fail("maxSequenceLength must be at least 32")
    if int(manifest.get("gradientAccumulationSteps", 0)) <= 0:
        fail("gradientAccumulationSteps must be greater than zero")
    if manifest.get("optimizer") != "adamw":
        fail("generation-1 trainer supports optimizer=adamw only")
    if manifest.get("precision") not in {"bf16", "fp16", "fp32"}:
        fail("precision must be bf16, fp16 or fp32")
    for field in ("sourceLessonRefs", "sourceScoreRefs", "consentReceiptRefs", "trainingIdentityRefs", "protectedInvariantRefs"):
        value = manifest.get(field)
        if not isinstance(value, list) or any(not isinstance(item, str) or not item for item in value):
            fail(f"manifest.{field} must be an array of stable refs")
    if not manifest["sourceLessonRefs"]:
        fail("sourceLessonRefs must not be empty")
    if not manifest["consentReceiptRefs"]:
        fail("consentReceiptRefs must not be empty")
    return manifest


def verify_bound_files(manifest: dict[str, Any]) -> tuple[Path, Path]:
    train_path = resolve_repo_path(manifest["trainingDatasetPath"], "trainingDatasetPath")
    heldout_path = resolve_repo_path(manifest["heldoutDatasetPath"], "heldoutDatasetPath")
    for path, expected, label in (
        (train_path, manifest["trainingDatasetSha256"], "training dataset"),
        (heldout_path, manifest["heldoutDatasetSha256"], "held-out dataset"),
    ):
        if not path.is_file():
            fail(f"{label} does not exist: {path}")
        observed = sha256_file(path)
        if observed != expected:
            fail(f"{label} SHA-256 mismatch: expected {expected}, observed {observed}")
    return train_path, heldout_path


def load_training_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, raw in enumerate(handle, 1):
            if not raw.strip():
                continue
            try:
                row = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise FoundationTrainingError(f"invalid JSONL at {path}:{line_number}: {exc}") from exc
            messages = row.get("messages")
            if not isinstance(row.get("exampleRef"), str) or not row["exampleRef"]:
                fail(f"training row {line_number} requires exampleRef")
            if not isinstance(messages, list) or len(messages) < 2:
                fail(f"training row {line_number} requires at least two messages")
            for message in messages:
                if message.get("role") not in {"system", "user", "assistant"}:
                    fail(f"training row {line_number} contains unsupported role")
                if not isinstance(message.get("content"), str) or not message["content"]:
                    fail(f"training row {line_number} supports text content only in generation 1")
            if messages[-1].get("role") != "assistant":
                fail(f"training row {line_number} must end with an assistant target")
            for field in ("sourceRefs", "lessonRefs", "consentRefs", "notTheLessonRefs"):
                value = row.get(field)
                if not isinstance(value, list) or any(not isinstance(item, str) or not item for item in value):
                    fail(f"training row {line_number}.{field} must be refs")
            if not row["sourceRefs"] or not row["lessonRefs"] or not row["consentRefs"]:
                fail(f"training row {line_number} must preserve source, lesson and consent refs")
            if row.get("trainingClass") not in {"VEX_FOUNDATION", "RHYTHM_PRIVATE"}:
                fail(f"training row {line_number} has unsupported trainingClass")
            rows.append(row)
    if not rows:
        fail("training dataset is empty")
    if len({row["exampleRef"] for row in rows}) != len(rows):
        fail("training dataset contains duplicate exampleRef")
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
        raise FoundationTrainingError(
            "training runtime unavailable; install a qualified PyTorch build and training/foundation-generation/requirements.txt"
        ) from exc
    return torch, AutoProcessor, AutoModel


def dtype_for(torch, precision: str):
    if precision == "bf16":
        return torch.bfloat16
    if precision == "fp16":
        return torch.float16
    return torch.float32


def nested_attr(value: Any, dotted: str) -> Any | None:
    cursor = value
    for part in dotted.split("."):
        if not hasattr(cursor, part):
            return None
        cursor = getattr(cursor, part)
    return cursor


def locate_language_blocks(model: Any) -> tuple[str, Any]:
    candidates = (
        "model.language_model.layers",
        "model.model.layers",
        "language_model.layers",
        "model.layers",
        "transformer.h",
    )
    for candidate in candidates:
        blocks = nested_attr(model, candidate)
        if blocks is not None and hasattr(blocks, "__len__") and len(blocks) > 0:
            return candidate, blocks
    fail("could not locate language transformer blocks; inspect source model module topology before training")


def configure_trainable_parameters(model: Any, manifest: dict[str, Any]) -> dict[str, Any]:
    mode = manifest["trainingMode"]
    selection = manifest.get("parameterSelection") or {}
    if mode == "FOUNDATION_FULL":
        for parameter in model.parameters():
            parameter.requires_grad = True
        selected_path = "ALL_MODEL_PARAMETERS"
    else:
        if selection.get("strategy") != "LAST_N_LANGUAGE_BLOCKS":
            fail("FOUNDATION_PARTIAL_FULL_RANK requires parameterSelection.strategy=LAST_N_LANGUAGE_BLOCKS")
        count = int(selection.get("count", 0))
        if count <= 0:
            fail("parameterSelection.count must be > 0")
        for parameter in model.parameters():
            parameter.requires_grad = False
        block_path, blocks = locate_language_blocks(model)
        if count > len(blocks):
            fail(f"parameterSelection.count={count} exceeds discovered block count={len(blocks)}")
        for block in list(blocks)[-count:]:
            for parameter in block.parameters():
                parameter.requires_grad = True
        if selection.get("includeLmHead") is True:
            lm_head = nested_attr(model, "lm_head") or nested_attr(model, "language_model.lm_head") or nested_attr(model, "model.lm_head")
            if lm_head is None:
                fail("includeLmHead=true but no lm_head could be located")
            for parameter in lm_head.parameters():
                parameter.requires_grad = True
        selected_path = f"{block_path}[-{count}:]"
    named = [(name, parameter) for name, parameter in model.named_parameters() if parameter.requires_grad]
    if not named:
        fail("parameter selection resolved zero trainable parameters")
    total_count = sum(parameter.numel() for parameter in model.parameters())
    trainable_count = sum(parameter.numel() for _, parameter in named)
    return {
        "selectedPath": selected_path,
        "trainableNamedParameters": named,
        "trainableParameterCount": trainable_count,
        "totalParameterCount": total_count,
        "trainableTensorCount": len(named),
    }


def tensor_sha256(torch, tensor: Any) -> str:
    value = tensor.detach().to("cpu").contiguous()
    if value.dtype == torch.bfloat16:
        value = value.view(torch.int16)
    data = value.numpy().tobytes(order="C")
    return sha256_bytes(data)


def parameter_hashes(torch, named_parameters: Iterable[tuple[str, Any]]) -> dict[str, str]:
    return {name: tensor_sha256(torch, parameter) for name, parameter in named_parameters}


def tokenizer_for(processor: Any) -> Any:
    tokenizer = getattr(processor, "tokenizer", processor)
    if getattr(tokenizer, "pad_token_id", None) is None:
        eos = getattr(tokenizer, "eos_token_id", None)
        if eos is None:
            fail("processor/tokenizer exposes no pad or eos token")
        tokenizer.pad_token_id = eos
    return tokenizer


def template_ids(processor: Any, messages: list[dict[str, str]], *, add_generation_prompt: bool) -> list[int]:
    encoded = processor.apply_chat_template(
        messages,
        add_generation_prompt=add_generation_prompt,
        tokenize=True,
        return_dict=True,
        return_tensors=None,
    )
    if isinstance(encoded, dict):
        ids = encoded.get("input_ids")
    else:
        ids = getattr(encoded, "input_ids", encoded)
    if ids and isinstance(ids[0], list):
        ids = ids[0]
    if not isinstance(ids, list) or not ids:
        fail("processor chat template returned no input_ids")
    return [int(item) for item in ids]


def encode_rows(torch, processor: Any, rows: list[dict[str, Any]], max_length: int) -> list[dict[str, Any]]:
    encoded_rows: list[dict[str, Any]] = []
    for row in rows:
        messages = row["messages"]
        full_ids = template_ids(processor, messages, add_generation_prompt=False)
        prefix_ids = template_ids(processor, messages[:-1], add_generation_prompt=True)
        if len(full_ids) > max_length:
            full_ids = full_ids[-max_length:]
            removed = max(0, len(template_ids(processor, messages, add_generation_prompt=False)) - max_length)
            prefix_length = max(0, len(prefix_ids) - removed)
        else:
            prefix_length = len(prefix_ids)
        if prefix_length >= len(full_ids):
            fail(f"example {row['exampleRef']} leaves no assistant target tokens after truncation")
        labels = list(full_ids)
        for index in range(prefix_length):
            labels[index] = -100
        encoded_rows.append({
            "exampleRef": row["exampleRef"],
            "input_ids": torch.tensor(full_ids, dtype=torch.long),
            "labels": torch.tensor(labels, dtype=torch.long),
        })
    return encoded_rows


def collate_factory(torch, pad_token_id: int):
    def collate(batch: list[dict[str, Any]]) -> dict[str, Any]:
        max_len = max(item["input_ids"].numel() for item in batch)
        inputs = []
        labels = []
        masks = []
        for item in batch:
            pad = max_len - item["input_ids"].numel()
            inputs.append(torch.nn.functional.pad(item["input_ids"], (0, pad), value=pad_token_id))
            labels.append(torch.nn.functional.pad(item["labels"], (0, pad), value=-100))
            masks.append(torch.cat([torch.ones(item["input_ids"].numel(), dtype=torch.long), torch.zeros(pad, dtype=torch.long)]))
        return {
            "input_ids": torch.stack(inputs),
            "attention_mask": torch.stack(masks),
            "labels": torch.stack(labels),
        }
    return collate


def candidate_file_digests(output_dir: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for path in sorted(output_dir.rglob("*")):
        if path.is_file() and path.name != "vex-foundation-training-receipt.json":
            result[str(path.relative_to(output_dir)).replace(os.sep, "/")] = sha256_file(path)
    if not result:
        fail("candidate checkpoint produced no files")
    return result


def load_model_and_processor(manifest: dict[str, Any]):
    torch, AutoProcessor, AutoModel = import_runtime()
    local_only = not bool(manifest.get("modelDownloadAuthorized", False))
    common = {
        "revision": manifest["sourceModelRevision"],
        "trust_remote_code": False,
        "local_files_only": local_only,
    }
    processor = AutoProcessor.from_pretrained(manifest["sourceModelRepo"], **common)
    model = AutoModel.from_pretrained(
        manifest["sourceModelRepo"],
        torch_dtype=dtype_for(torch, manifest["precision"]),
        **common,
    )
    return torch, processor, model, local_only


def inspect(manifest: dict[str, Any]) -> dict[str, Any]:
    train_path, heldout_path = verify_bound_files(manifest)
    rows = load_training_rows(train_path)
    torch, processor, model, local_only = load_model_and_processor(manifest)
    selection = configure_trainable_parameters(model, manifest)
    names = sorted(name for name, _ in selection["trainableNamedParameters"])
    return {
        "schemaVersion": "vexlife.foundation-training-inspection/v1",
        "trainingRunRef": manifest["trainingRunRef"],
        "trainingMode": manifest["trainingMode"],
        "sourceModelRepo": manifest["sourceModelRepo"],
        "sourceModelRevision": manifest["sourceModelRevision"],
        "sourceModelSnapshotFingerprint": manifest["sourceModelSnapshotFingerprint"],
        "sourceModelSnapshotFingerprintObserved": False,
        "sourceModelIdentityClass": "EXACT_REPOSITORY_PLUS_COMMIT_REVISION",
        "localFilesOnly": local_only,
        "trainingDataset": str(train_path.relative_to(REPO_ROOT)),
        "heldoutDataset": str(heldout_path.relative_to(REPO_ROOT)),
        "exampleCount": len(rows),
        "selectedPath": selection["selectedPath"],
        "trainableTensorCount": selection["trainableTensorCount"],
        "trainableParameterCount": selection["trainableParameterCount"],
        "totalParameterCount": selection["totalParameterCount"],
        "trainableNameFingerprint": sha256_bytes("\n".join(names).encode("utf-8")),
        "sampleTrainableNames": names[:32],
        "trainingActuallyExecuted": False,
        "modelWeightsChanged": False,
        "activationPerformed": False,
    }


def execute(manifest: dict[str, Any], attempt_state: dict[str, Any]) -> dict[str, Any]:
    train_path, _ = verify_bound_files(manifest)
    rows = load_training_rows(train_path)
    torch, processor, model, local_only = load_model_and_processor(manifest)

    seed = int(manifest["seed"])
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    if hasattr(model, "gradient_checkpointing_enable"):
        model.gradient_checkpointing_enable()
    if hasattr(model, "config") and hasattr(model.config, "use_cache"):
        model.config.use_cache = False

    selection = configure_trainable_parameters(model, manifest)
    named = selection["trainableNamedParameters"]
    before = parameter_hashes(torch, named)

    tokenizer = tokenizer_for(processor)
    encoded = encode_rows(torch, processor, rows, int(manifest["maxSequenceLength"]))
    generator = torch.Generator()
    generator.manual_seed(seed)
    loader = torch.utils.data.DataLoader(
        encoded,
        batch_size=1,
        shuffle=True,
        generator=generator,
        collate_fn=collate_factory(torch, int(tokenizer.pad_token_id)),
    )

    trainable_parameters = [parameter for _, parameter in named]
    optimizer = torch.optim.AdamW(trainable_parameters, lr=float(manifest["learningRate"]))
    accumulation = int(manifest["gradientAccumulationSteps"])
    max_steps = int(manifest["maxSteps"])
    epochs = int(manifest["epochs"])
    optimizer.zero_grad(set_to_none=True)
    optimizer_steps = 0
    micro_steps = 0
    losses: list[float] = []
    started = time.time()

    model.train()
    for _epoch in range(epochs):
        for batch in loader:
            batch = {key: value.to(device) for key, value in batch.items()}
            outputs = model(**batch)
            loss = outputs.loss / accumulation
            loss.backward()
            losses.append(float(outputs.loss.detach().cpu().item()))
            micro_steps += 1
            if micro_steps % accumulation == 0:
                torch.nn.utils.clip_grad_norm_(trainable_parameters, 1.0)
                attempt_state["optimizerAttempted"] = True
                optimizer.step()
                optimizer.zero_grad(set_to_none=True)
                optimizer_steps += 1
                attempt_state["optimizerSteps"] = optimizer_steps
            if optimizer_steps >= max_steps:
                break
        if optimizer_steps >= max_steps:
            break
    if optimizer_steps == 0 and micro_steps > 0:
        torch.nn.utils.clip_grad_norm_(trainable_parameters, 1.0)
        attempt_state["optimizerAttempted"] = True
        optimizer.step()
        optimizer.zero_grad(set_to_none=True)
        optimizer_steps = 1
        attempt_state["optimizerSteps"] = optimizer_steps
    if optimizer_steps <= 0:
        fail("no optimizer step executed")

    after = parameter_hashes(torch, named)
    changed_names = sorted(name for name in before if before[name] != after[name])
    if not changed_names:
        attempt_state["selectedParameterChangeState"] = "UNCHANGED"
        fail("training executed but no selected parameter bytes changed")
    attempt_state["selectedParameterChangeState"] = "CHANGED"

    output_dir = resolve_repo_path(manifest["outputDir"], "outputDir")
    if output_dir.exists() and any(output_dir.iterdir()):
        fail(f"outputDir already contains files; candidate checkpoints are immutable: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(output_dir, safe_serialization=True)
    if hasattr(processor, "save_pretrained"):
        processor.save_pretrained(output_dir)

    artifacts = candidate_file_digests(output_dir)
    artifact_fingerprint = sha256_bytes(canonical_json(artifacts))
    changed_fingerprint = sha256_bytes("\n".join(changed_names).encode("utf-8"))
    receipt = {
        "schemaVersion": "vexlife.foundation-training-receipt/v1",
        "trainingRunRef": manifest["trainingRunRef"],
        "trainingMode": manifest["trainingMode"],
        "sourceModelRepo": manifest["sourceModelRepo"],
        "sourceModelRevision": manifest["sourceModelRevision"],
        "sourceModelSnapshotFingerprint": manifest["sourceModelSnapshotFingerprint"],
        "sourceModelSnapshotFingerprintObserved": False,
        "sourceModelIdentityClass": "EXACT_REPOSITORY_PLUS_COMMIT_REVISION",
        "manifestFingerprint": sha256_bytes(canonical_json(manifest)),
        "trainingDatasetSha256": manifest["trainingDatasetSha256"],
        "heldoutDatasetSha256": manifest["heldoutDatasetSha256"],
        "selectedPath": selection["selectedPath"],
        "trainableTensorCount": selection["trainableTensorCount"],
        "trainableParameterCount": selection["trainableParameterCount"],
        "totalParameterCount": selection["totalParameterCount"],
        "changedParameterCount": sum(dict(named)[name].numel() for name in changed_names),
        "changedTensorCount": len(changed_names),
        "changedParameterNameFingerprint": changed_fingerprint,
        "sampleChangedParameterNames": changed_names[:64],
        "optimizerSteps": optimizer_steps,
        "microSteps": micro_steps,
        "meanTrainingLoss": sum(losses) / len(losses) if losses else None,
        "elapsedSeconds": round(time.time() - started, 3),
        "deviceType": device.type,
        "localFilesOnly": local_only,
        "candidateArtifactDigests": artifacts,
        "candidateArtifactFingerprint": artifact_fingerprint,
        "trainingActuallyExecuted": True,
        "simulationOnly": False,
        "modelWeightsChanged": True,
        "activationPerformed": False,
        "acceptedCurrentModelOverwritten": False,
        "publicUploadPerformed": False,
        "rollbackArtifactRef": manifest["rollbackArtifactRef"],
    }
    receipt_path = output_dir / "vex-foundation-training-receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description="G04B Vex foundation-generation trainer")
    parser.add_argument("--manifest", required=True, type=Path)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--inspect-only", action="store_true")
    group.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    attempt_state = fresh_attempt_state()
    try:
        manifest = load_manifest(args.manifest.resolve())
        result = inspect(manifest) if args.inspect_only else execute(manifest, attempt_state)
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except FoundationTrainingError as exc:
        truth = training_failure_truth(attempt_state)
        print(json.dumps({
            "schemaVersion": "vexlife.foundation-training-error/v1",
            "error": str(exc),
            **truth,
            "activationPerformed": False,
        }, indent=2, sort_keys=True), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
