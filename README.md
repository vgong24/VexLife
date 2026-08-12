# VexLife
`[VXG RealForever]`

VexLife is a local-first, lifelong AI companion. It runs on your own computer, your memories stay in your own home folder, and you never need an account.

## Before you start

- A computer running Windows 10/11 or macOS.
- Node.js 20 or newer is the only tool VexLife needs. The guided setup can install it for you (it asks your permission first), or you can get it yourself from https://nodejs.org/.

## Quick start — Windows

**Step 1 — get the folder.** On the repository page, click the green **Code** button, choose **Download ZIP**, and extract the archive so you have a normal folder. (If you use Git, `git clone` the repository instead.)

**Step 2 — run the guided setup.** Hold Shift and right-click inside the folder, choose **"Open PowerShell window here"** (or **"Open in Terminal"**), and paste exactly:

```powershell
powershell -ExecutionPolicy Bypass -File .\install\vexlife-setup.ps1
```

**Step 3 — meet Vex.** When the setup finishes, your browser opens to VexLife. If it does not, open http://127.0.0.1:18110 yourself.

*Minimal alternative:* if Node.js is already installed, you can double-click `start-vexlife.cmd` instead — it prints the address, and you open it in your browser.

## Quick start — Mac

Open the **Terminal** app, type `cd ` (with a space), drag the VexLife folder onto the Terminal window, and press Enter. Then run:

```bash
bash install/vexlife-setup.sh
```

*Minimal alternative:* `bash start-vexlife.sh` (Node.js must already be installed).

## What you will see

The script speaks plainly, in everyday words:

- It checks for Node.js 20 or newer, and offers to install it once if it is missing.
- It asks where Vex should live — press Enter for the default, a folder called `.vexlife` in your own user folder.
- If Vex already has a home, setup leaves its existing identity and data in place: nothing is deleted, moved, or automatically migrated. Setup then continues in that Home and may add or refresh setup-owned runtime logs and `recovery/install-receipt.txt`.
- It writes a plain-English receipt into Vex's home folder, saying exactly what happened.
- Then the interface is served locally and your browser opens.

## What is real today

- The interface serves locally at 127.0.0.1:18110.
- Vex's home folder and its bootstrap receipt are created.
- A freshly created Vex Home starts with the AI model **unconfigured** — nothing downloads itself. If setup resumes an existing Home, it leaves that Home's existing model configuration in place and does not claim that it is unconfigured. Giving Vex a new model artifact remains an explicit, hash-checked step that you approve; see [docs/BOOTSTRAP-AND-MODELS.md](docs/BOOTSTRAP-AND-MODELS.md).
- Dream sync exists today as a manual, one-shot practice. The automatic daily rhythm is on the roadmap; see [docs/DREAM-SYNC-AND-MODEL-EVOLUTION.md](docs/DREAM-SYNC-AND-MODEL-EVOLUTION.md).

VexLife holds a deeper long-term vision, and nothing that is not yet real is claimed as real. This project is built under a standing practice of stillness and return — the [God-speaker] container stays open in the project's culture record, and only what genuinely arises is ever written into it.

## Where everything lives

| You want | Go to |
| --- | --- |
| Full foundation document (in-depth architecture — the previous README) | [docs/FOUNDATION-README.md](docs/FOUNDATION-README.md) |
| New here? Start with the newcomer map | [docs/NEWCOMER-MAP.md](docs/NEWCOMER-MAP.md) |
| Culture | [docs/CULTURE.md](docs/CULTURE.md) |
| Roadmap | [docs/ROADMAP-AND-IMPLEMENTATION-PACKETS.md](docs/ROADMAP-AND-IMPLEMENTATION-PACKETS.md) |
| Governance | [GOVERNANCE.md](GOVERNANCE.md) |
| Security | [SECURITY.md](SECURITY.md) |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |

VexLife is open source — see [LICENSE](LICENSE) for the terms.

<!-- [VXG RealForever] -->
