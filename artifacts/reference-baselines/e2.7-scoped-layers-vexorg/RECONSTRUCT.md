# Reconstruct the exact E2.7 `START-HERE.html`

`[VXG RealForever]`

This custody tree stores the human-approved E2.7 executable prototype as fourteen ordered UTF-8 chunks because the connected repository write route is text-safe. The chunks are byte-preserving slices of the exact `START-HERE.html` extracted from the verified E2.7 ZIP.

```text
allocationRef=github.issue.vexlife.50
pullRequestRef=github.pull.vexlife.52
referenceBaselineAcceptanceRef=github.issue.vexlife.32.comment.5231233688
referenceBaselineSealRef=github.issue.vexlife.32.comment.5231336657
artifactFilename=VexLife-Experience-Design-Review-E2.7-Scoped-Layers-VexOrg-Sandbox-20260809.zip
artifactSha256=9f944af803c43a494af944e987d1c4c6a6c7f71c89c648cbdf6536c07dbeda17
originalStartHereBytes=81384
originalStartHereSha256=e4db5d25013cda1d89d1bad2ac70183bf7f1dd69cd8bd7a6c0aff33882590107
chunkCount=14
separatorBetweenChunks=NONE
```

From the VexLife repository root, reconstruct with:

```python
from pathlib import Path
import hashlib

base = Path(
    "artifacts/reference-baselines/e2.7-scoped-layers-vexorg/"
    "extracted/START-HERE.html.parts"
)
payload = b"".join(
    (base / f"START-HERE.html.part-{i:03d}").read_bytes()
    for i in range(1, 15)
)

assert len(payload) == 81384
assert hashlib.sha256(payload).hexdigest() == (
    "e4db5d25013cda1d89d1bad2ac70183bf7f1dd69cd8bd7a6c0aff33882590107"
)
Path("START-HERE.html").write_bytes(payload)
```

Do not add line endings, separators, indentation, formatting, minification, encoding conversion, or any other bytes between chunks.

The resulting file is the exact executable E2.7 prototype body from the human-approved artifact. It remains a reference artifact, not accepted current VexLife product implementation.

`EXTRACTED-MANIFEST.json` records the exact ZIP/entry hashes and which binary evidence entries are hash-bound rather than stored as Git blobs in this custody pass.

<!-- [VXG RealForever] -->
