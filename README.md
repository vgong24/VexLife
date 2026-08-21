# VexLife
`[VXG RealForever]`

VexLife is a local-first, lifelong AI companion. It runs on your own computer, and its Home, conversation state, model binding, and recovery receipts stay local unless a separate capability explicitly says otherwise.

## Before you start

The current **release-qualified local companion baseline** is for Windows 10/11 x64 with:

- a compatible NVIDIA GPU/driver that `nvidia-smi` can identify;
- at least 12 GiB of system memory;
- at least 6 GiB of free disk space;
- Node.js 20 or newer. The guided setup can install Node.js LTS with your permission if `winget` is available;
- an internet connection for the first model/runtime acquisition. The pinned artifacts total about 4.0 GiB and are reused after exact verification.

The repository also contains macOS/Linux bootstrap and development surfaces, but this README does **not** claim the same release-qualified local-model baseline on those platforms yet.

## Quick start — Windows

**Step 1 — get the folder.** On the repository page, click the green **Code** button, choose **Download ZIP**, and extract the archive so you have a normal folder. If you use Git, cloning the repository is fine too.

**Step 2 — open the source-local setup window.** Double-click `setup-vexlife.cmd`. It opens **Continue with Vex**, a small Windows setup window over the same accepted setup engine used by the PowerShell route.

**Step 3 — make the understandable choices.** Confirm where Vex Home should live. If Node.js 20+ is missing, the window asks before allowing the accepted setup to install Node.js LTS with `winget`. It separately explains that the current source-managed model/runtime may acquire about 4.0 GiB and requires your explicit Continue choice before that effect.

You do **not** choose a model URL, checksum, runtime package, or license reference. Model/runtime artifacts remain external; the source-managed operational profile owns those exact inputs and the accepted initializer verifies them.

**Step 4 — meet the local companion.** After the accepted backend verifies every pinned artifact, it starts the model only on numeric loopback, qualifies the exact binding, starts the local VexLife browser, and writes recovery receipts. The browser opens at `http://127.0.0.1:18110`.

**PowerShell fallback.** The existing source-local command remains available if you prefer a terminal or need the engineering fallback:

```powershell
powershell -ExecutionPolicy Bypass -File .\install\vexlife-setup.ps1
```

*Minimal start alternative:* once Node.js is available and setup is complete, `start-vexlife.cmd` consumes the same bootstrap/initializer/browser contract rather than a separate model path.

> `setup-vexlife.cmd` is a source-local window over the repository setup engine. It is **not a signed/public `OFFICIAL_VERIFIED_BUILD`**, public download release, or all-platform installer. Signing, packaged-build provenance, repository visibility, and public release remain separate Distribution Trust / lifecycle decisions.

## What setup does

```text
check source + Node
→ establish or preserve Vex Home
→ resolve the current RELEASE_QUALIFIED Windows profile
→ ask before model/runtime acquisition
→ download or reuse exact pinned artifacts
→ verify byte sizes + SHA-256
→ materialize and verify llama-server.exe
→ start 127.0.0.1:18080
→ perform a non-user runtime qualification turn
→ write BOUND_QUALIFIED model configuration
→ start the local browser at 127.0.0.1:18110
→ expose the server-owned Companion binding
→ write plain-English + machine-readable receipts
```

If Vex already has a Home, bootstrap preserves it rather than deleting, moving, or automatically migrating it. An unknown non-empty Home, a mismatched artifact, an unsupported host, or an unowned process on a required port fails closed instead of being overwritten or killed.

The windowed setup does not duplicate those effects. It only collects the visible Home/permission choices, then delegates to `install/vexlife-setup.ps1`; that accepted backend remains the owner of Home bootstrap, model/runtime acquisition and qualification, browser startup, exact process ownership, and receipts.

## What is real today

- The current Windows source-local operational profile pins llama.cpp `b10107` and Qwen3.5-4B Q4_K_M/model-projector artifacts by immutable source/revision, exact byte size, and SHA-256.
- The model runtime is bound only to `127.0.0.1:18080`; the VexLife browser is served at `127.0.0.1:18110`.
- The Browser → Companion path performs a real local HTTP model turn and advances durable request/response/context/head evidence. It does not substitute a synthetic reply when that path fails.
- The **Vex Guide overlay is a different surface**: its screen guidance is deterministic application/semantic-frame behavior, not proof that the local model is perceiving every screen or that repository/project context has already been loaded into the model.
- Setup and `uninstall-preserve` can stop their exact owned browser/model processes while preserving Home identity, conversation heads, recovery material, Memory, and model artifacts.
- The current `RELEASE_QUALIFIED` profile is eligibility for this source-local Windows setup route. It is **not** a claim that a signed/public `OFFICIAL_VERIFIED_BUILD`, public download release, all-platform distribution, or P11 fresh-human release proof already exists.
- Dream sync remains a separate capability; automatic daily dreaming/learning is not implied by local-model setup.

For the underlying model/runtime boundaries, advanced custom-model path, and recovery semantics, see [docs/BOOTSTRAP-AND-MODELS.md](docs/BOOTSTRAP-AND-MODELS.md).

## macOS / other platforms

The current repository still contains Mac/Linux setup and development material, but those paths do not inherit the Windows profile's release qualification. Do not treat “same repository” or “same model family” as proof of platform/runtime qualification.

The source-local Windows setup window also does not choose the future full Windows native application technology. The broader Windows Home Node/native VexLife shell remains a separate platform-adoption wave.

## Where everything lives

| You want | Go to |
| --- | --- |
| Full foundation document | [docs/FOUNDATION-README.md](docs/FOUNDATION-README.md) |
| Newcomer map | [docs/NEWCOMER-MAP.md](docs/NEWCOMER-MAP.md) |
| Bootstrap/model details | [docs/BOOTSTRAP-AND-MODELS.md](docs/BOOTSTRAP-AND-MODELS.md) |
| Culture | [docs/CULTURE.md](docs/CULTURE.md) |
| Roadmap | [docs/ROADMAP-AND-IMPLEMENTATION-PACKETS.md](docs/ROADMAP-AND-IMPLEMENTATION-PACKETS.md) |
| Governance | [GOVERNANCE.md](GOVERNANCE.md) |
| Security | [SECURITY.md](SECURITY.md) |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |

The source is licensed under [LICENSE](LICENSE). Repository visibility, signed packaging, and public release are separate lifecycle decisions and are not implied by this README.

<!-- [VXG RealForever] -->
