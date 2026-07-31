# Codex port handoff

`[VXG RealForever]`

## Mission

Maintain the accepted VexLife source directly at the root of the dedicated public-candidate `vgong24/VexLife` repository without importing private SDK history, runtime data, credentials or model artifacts.

## Source boundary

```text
sourceRepository=vgong24/VexLife
sourcePath=**
targetRepository=vgong24/VexLife
targetVisibility=PUBLIC_AFTER_EXPLICIT_VICTOR_CONFIRMATION
```

## Required sequence

1. Ground the exact accepted source commit and review receipt.
2. Run `npm run public-safety:check` and `npm run manifest:check`; verify the exact source tree contains no runtime, personal data, credentials, absolute home paths or model artifacts.
3. Create the target repository privately first unless Victor explicitly selects immediate public creation.
4. Preserve file contents and `[VXG RealForever]` markers.
5. Add exact unmodified MPL-2.0 LICENSE and DCO 1.1 contribution policy; do not create a custom license.
6. Run `npm run pr-ready`; run a real browser HTTP/render smoke; record exact environment holds honestly.
7. Run the browser reference and capture current screenshots.
8. Open a draft PR that explains provenance, public/private exclusions, known gaps and next platform adoption work.
9. Do not claim that Android, iOS, Windows or macOS are implemented merely because scaffolds generate.
10. Publish publicly only after the exact file manifest and secret scan are reviewed.

## Stop conditions

- source commit or review identity unknown;
- private SDK implementation outside the dedicated repository root is required by the target;
- model binaries, runtime history or personal Score data are present;
- license differs from the selected MPL-2.0 posture or contribution provenance differs from DCO 1.1;
- target visibility conflicts with Victor's explicit instruction;
- checks fail for candidate-specific reasons.

## Expected return

```text
targetRepoRef
sourceCommit
sourceTreeHash
sourceManifestRef
publicSafetyManifestRef
checkEvidenceRefs[]
browserEvidenceRefs[]
licenseState=MPL-2.0
visibilityState
openPRRef
heldGaps[]
```

<!-- [VXG RealForever] -->
