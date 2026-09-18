# VexLife
`[VXG RealForever]`

VexLife is a local-first, lifelong AI companion. It runs on your own computer, and its Home, conversation state, model binding, and recovery receipts stay local unless a separate capability explicitly says otherwise.

## Before you start

The current **release-qualified source-local companion profiles** are deliberately narrow:

- **Windows 10/11 x64 + compatible NVIDIA GPU/driver** (`nvidia-smi` available), with at least 12 GiB system memory and 6 GiB free disk space.
- **macOS arm64 on Apple M4 Pro**, with at least 12 GiB system memory and 6 GiB free disk space.

Both normal setup routes require Node.js 20 or newer and an internet connection for first model/runtime acquisition. The pinned Qwen3.5-4B model/projector artifacts are several GiB and exact verified cached artifacts are reused on later runs.

These are source-local operational profiles. They are **not a signed/public `OFFICIAL_VERIFIED_BUILD`**, packaged public release, all-Mac installer, all-GPU installer, or P11 fresh-human release proof. Linux bootstrap/development surfaces remain available but do not inherit either release-qualified profile.

## Quick start — Mac M4 Pro

Open Terminal and run this block:

```bash
rm -f /tmp/setup-vexlife.command
curl -fsSL https://raw.githubusercontent.com/vgong24/VexLife/main/setup-vexlife.command -o /tmp/setup-vexlife.command && bash /tmp/setup-vexlife.command
```

This is the stable Mac front door. The first line removes any older temporary bootstrap; the `&&` means VexLife runs only if GitHub returned the new bootstrap successfully. A failed download therefore cannot silently fall through to a stale `/tmp/setup-vexlife.command`.

The command intentionally follows the latest accepted `main`: each run fetches the current bootstrap, resolves `main` to one exact immutable 40-character source commit, and downloads those exact repository bytes. The long source SHA is expected to change as accepted source advances; it is an internal reproducibility/evidence identity, not something an ordinary user has to keep current manually.

That small bootstrap hands control to the repository-owned Mac setup. You do **not** need to download a ZIP, extract the repository, find a launcher, or choose model URLs/checksums yourself.

Setup checks the Mac and Node.js first, then asks only for choices that belong to you. The default Vex Home is:

```text
~/.vexlife
```

Press Enter to use that Home or enter another folder. VexLife inspects the selected Home before offering an action; it does not ask you to guess whether the machine needs a first install, resume, repair, rebuild, or uninstall.

On first setup, VexLife performs a no-effect host/profile check before model/runtime acquisition. If this Mac matches the current release-qualified Apple M4 Pro profile, the initializer separately asks before downloading several GiB of verified model/runtime files and starting the local-only model. After qualification, the browser opens at `http://127.0.0.1:18110`.

### Running Mac setup again

Rerunning the same stable block is the source-local update path. It resolves current accepted source, then classifies the selected Vex Home instead of blindly overwriting it:

- a healthy Home can be opened/resumed directly;
- if an exact owned browser is still running from an older exact VexLife source checkout, current source proves that old process from its recorded ownership receipt, stops only that exact process, and starts the browser again from current source instead of pretending the old browser is current;
- repair and rebuild-preserve are offered only when valid for the observed state;
- `uninstall-preserve` stops exact owned processes and removes runtime/transient state while preserving Vex Home, Memory, conversations, and verified model artifacts;
- an unknown/noncanonical Home or a process whose exact ownership cannot be proven fails closed instead of being overwritten, deleted, or killed.

A future full-delete flow, if provided, is a separate destructive consent boundary. `uninstall-preserve` is intentionally not that operation.

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

> The Windows source-local window and Mac source bootstrap are source-local setup routes. They are **not a signed/public `OFFICIAL_VERIFIED_BUILD`**. Signing, packaged-build provenance, repository visibility, and public release remain separate Distribution Trust / lifecycle decisions.

## What setup does

```text
obtain/verify source route
→ check Node + host eligibility
→ select, establish or preserve Vex Home
→ resolve the matching RELEASE_QUALIFIED operational profile
→ ask before model/runtime acquisition
→ download or reuse exact pinned artifacts
→ verify byte sizes + SHA-256
→ materialize and verify the platform runtime
→ start 127.0.0.1:18080
→ perform a non-user runtime qualification turn
→ write BOUND_QUALIFIED model configuration
→ start the local browser at 127.0.0.1:18110
→ expose the server-owned Companion binding
→ write machine-readable recovery receipts
```

If Vex already has a Home, bootstrap preserves it rather than deleting, moving, or automatically migrating it. An unknown non-empty Home, a mismatched artifact, an unsupported host, or an unowned process on a required port fails closed instead of being overwritten or killed.

The human-facing front doors do not duplicate those effects. They collect the visible Home/permission choices and delegate to the repository-owned platform setup/lifecycle logic.

## What is real today

- The current Windows x64 NVIDIA and macOS arm64 Apple M4 Pro source-local operational profiles are `RELEASE_QUALIFIED`.
- Both profiles pin llama.cpp `b10107` plus Qwen3.5-4B Q4_K_M model/projector artifacts by immutable source/revision, exact byte size, and SHA-256.
- The model runtime is bound only to `127.0.0.1:18080`; the VexLife browser is served at `127.0.0.1:18110`.
- The Browser → Companion path performs a real local HTTP model turn and advances durable request/response/context/head evidence. It does not substitute a synthetic reply when that path fails.
- The Mac profile additionally has accepted repair, rebuild-preserve, uninstall-preserve, restart/resume, exact-owned shutdown, path-with-spaces ownership, and technical continuity evidence on Apple M4 Pro.
- The **Vex Guide overlay is a different surface**: its screen guidance is deterministic application/semantic-frame behavior, not proof that the local model is perceiving every screen or that repository/project context has already been loaded into the model.
- Setup and `uninstall-preserve` can stop exact owned browser/model processes while preserving Home identity, conversation heads, recovery material, Memory, and model artifacts.
- `RELEASE_QUALIFIED` here means eligibility for the matching **source-local normal setup route**. It is not a claim that a signed/public `OFFICIAL_VERIFIED_BUILD`, public download release, all-platform distribution, or P11 fresh-human release proof already exists.
- Dream sync remains a separate capability; automatic daily dreaming/learning is not implied by local-model setup.

For the underlying model/runtime boundaries, advanced custom-model path, and recovery semantics, see [docs/BOOTSTRAP-AND-MODELS.md](docs/BOOTSTRAP-AND-MODELS.md).

## Other platforms

Linux and other hardware/platform combinations do not inherit the Windows or Apple M4 Pro profile's release qualification. Do not treat “same repository,” “same model family,” or a nearby chip/GPU name as proof of platform/runtime qualification.

The source-local setup front doors also do not choose the future full Windows or Mac native application technology. Native Home Node/application-shell adoption remains a separate platform/distribution wave.

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
