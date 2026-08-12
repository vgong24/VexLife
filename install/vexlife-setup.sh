#!/usr/bin/env bash
#
# VexLife zero-context setup (Mac)
#
# What this script does, in plain words:
#   1. Checks that Node.js 20 or newer is on this Mac (offers to install it, with your permission).
#   2. Finds the VexLife folder (the extracted repository).
#   3. Asks where Vex should keep its home (default: a folder called .vexlife in your home folder).
#   4. Runs the VexLife bootstrap, which creates Vex's home. If Vex already has a home there,
#      bootstrap leaves it in place without deleting, moving, or migrating it; setup then continues.
#   5. Asks ONE optional question about model weights. Skipping is fine and safe.
#   6. Starts the local VexLife page and opens it in your browser.
#   7. Writes a plain-English receipt next to Vex's own bootstrap receipt.
#
# This script downloads nothing except, with your explicit permission:
#   - Node.js itself (via Homebrew), if it is missing.
#   - The VexLife source zip, only if you ran this script without the repository present
#     (that only works once the repository is public).
#   - A model artifact, only if you say yes and supply a URL plus a SHA-256 checksum,
#     a source reference and a license reference. VexLife never downloads model weights
#     without a checksum and those references.
#
set -uo pipefail

STARTED_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
INSTALL_PORT=18110
INSTALL_URL="http://127.0.0.1:18110"
REPO_ROOT="${1:-}"

step() { printf '\n== %s\n' "$1"; }

read_with_default() {
  local question="$1" default="$2" answer
  printf '%s [%s]: ' "$question" "$default" >&2
  read -r answer || true
  if [ -z "${answer//[[:space:]]/}" ]; then printf '%s' "$default"; else printf '%s' "$answer"; fi
}

read_yes_no() {
  # $1 question, $2 default ("y" or "n"); prints "y" or "n"
  local question="$1" default="$2" hint="y/N" answer
  if [ "$default" = "y" ]; then hint="Y/n"; fi
  printf '%s [%s]: ' "$question" "$hint" >&2
  read -r answer || true
  answer="$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  if [ -z "$answer" ]; then printf '%s' "$default"; return; fi
  case "$answer" in
    y|yes) printf 'y' ;;
    *) printf 'n' ;;
  esac
}

node_major() {
  local v
  v="$(node --version 2>/dev/null)" || { printf 'none'; return; }
  case "$v" in
    v[0-9]*) v="${v#v}"; printf '%s' "${v%%.*}" ;;
    *) printf 'none' ;;
  esac
}

find_repo_root() {
  local dir="$1"
  [ -z "$dir" ] && return 1
  while [ -n "$dir" ] && [ "$dir" != "/" ]; do
    if [ -f "$dir/scripts/bootstrap.mjs" ]; then printf '%s' "$dir"; return 0; fi
    dir="$(dirname "$dir")"
  done
  if [ -f "/scripts/bootstrap.mjs" ]; then printf '/'; return 0; fi
  return 1
}

# ---------- step 1: Node.js ----------

step "Checking for Node.js 20 or newer"
NODE_SOURCE="preinstalled"
MAJOR="$(node_major)"
if [ "$MAJOR" = "none" ] || [ "$MAJOR" -lt 20 ] 2>/dev/null; then
  if [ "$MAJOR" = "none" ]; then
    echo "Node.js is not installed on this Mac. VexLife needs Node.js 20 or newer to run."
  else
    echo "This Mac has Node.js v$MAJOR, but VexLife needs Node.js 20 or newer."
  fi
  if command -v brew >/dev/null 2>&1; then
    echo ""
    echo "I can install it for you with this one command (Homebrew):"
    echo "    brew install node"
    ANSWER="$(read_yes_no "May I run that command now? (one-time permission)" "y")"
    if [ "$ANSWER" = "y" ]; then
      if ! brew install node; then
        echo ""
        echo "The Node.js install command did not finish successfully." >&2
        echo "You can install Node.js 20+ yourself from https://nodejs.org/ and then run this script again."
        exit 1
      fi
      NODE_SOURCE="installed-via-homebrew"
      MAJOR="$(node_major)"
      if [ "$MAJOR" = "none" ] || [ "$MAJOR" -lt 20 ] 2>/dev/null; then
        echo ""
        echo "Node.js was installed, but this terminal cannot see it yet." >&2
        echo "Please open a NEW terminal window and run this script again. Nothing else is needed."
        exit 0
      fi
    else
      echo ""
      echo "No problem. Install Node.js 20 or newer from https://nodejs.org/ and run this script again."
      exit 0
    fi
  else
    echo ""
    echo "This Mac does not have Homebrew, so I cannot install Node.js for you."
    echo "Please install Node.js 20 or newer from https://nodejs.org/ (the LTS button is fine),"
    echo "then run this script again."
    exit 0
  fi
fi
NODE_VERSION="$(node --version 2>/dev/null)"
echo "Found Node.js $NODE_VERSION - good."

# ---------- step 2: find the VexLife folder ----------

step "Finding the VexLife folder"
REPO_OBTAINED_VIA="unknown"
REPO_DOWNLOAD_URL=""
if [ -n "$REPO_ROOT" ]; then
  REPO_ROOT="$(cd "$REPO_ROOT" 2>/dev/null && pwd)" || { echo "The folder you gave me does not exist: $1" >&2; exit 1; }
  if [ ! -f "$REPO_ROOT/scripts/bootstrap.mjs" ]; then
    echo "The folder you gave me does not look like VexLife: $REPO_ROOT" >&2
    echo "I expected to find scripts/bootstrap.mjs inside it."
    exit 1
  fi
  REPO_OBTAINED_VIA="parameter"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$PWD}")" 2>/dev/null && pwd || echo "$PWD")"
  REPO_ROOT="$(find_repo_root "$SCRIPT_DIR" || true)"
  if [ -z "$REPO_ROOT" ]; then REPO_ROOT="$(find_repo_root "$PWD" || true)"; fi
  if [ -n "$REPO_ROOT" ]; then REPO_OBTAINED_VIA="found-near-script"; fi
fi

if [ -z "$REPO_ROOT" ]; then
  echo "I could not find the VexLife folder next to this script or in the current folder."
  echo ""
  echo "This can happen when the script is run by itself (not from an extracted VexLife zip)."
  echo "Once the VexLife repository is PUBLIC, I can download it for you. If the repository"
  echo "is still private, please download the zip from the repository page (Code -> Download ZIP),"
  echo "extract it, and run this script from inside the extracted folder."
  ANSWER="$(read_yes_no "Try to download the VexLife source now? (only works once the repository is public)" "n")"
  if [ "$ANSWER" != "y" ]; then
    echo "Stopping. Nothing was installed or changed."
    exit 0
  fi
  REPO_DOWNLOAD_URL="https://codeload.github.com/vgong24/VexLife/zip/refs/heads/main"
  ZIP_PATH="$(mktemp /tmp/vexlife-main-XXXXXX.zip)"
  echo "Downloading $REPO_DOWNLOAD_URL ..."
  if ! curl -fsSL "$REPO_DOWNLOAD_URL" -o "$ZIP_PATH"; then
    echo ""
    echo "The download did not work. Most likely the repository is still private." >&2
    echo "Download the zip from the repository page (Code -> Download ZIP), extract it,"
    echo "and run this script from inside the extracted folder."
    rm -f "$ZIP_PATH"
    exit 1
  fi
  echo "Extracting..."
  if ! unzip -qo "$ZIP_PATH" -d "$HOME"; then
    echo "Extraction failed." >&2
    rm -f "$ZIP_PATH"
    exit 1
  fi
  rm -f "$ZIP_PATH"
  REPO_ROOT="$HOME/VexLife-main"
  if [ ! -f "$REPO_ROOT/scripts/bootstrap.mjs" ]; then
    echo "The downloaded archive did not contain what I expected at $REPO_ROOT" >&2
    exit 1
  fi
  REPO_OBTAINED_VIA="downloaded-zip"
  echo "VexLife source is now at: $REPO_ROOT"
fi
echo "VexLife folder: $REPO_ROOT"

# ---------- step 3: choose Vex's home ----------

step "Choosing where Vex lives (VexHome)"
DEFAULT_HOME="$HOME/.vexlife"
VEXHOME_DEFAULT_USED="true"
echo "By default, Vex keeps its home (memories, settings, receipts) outside the VexLife folder. You may choose another path."
VEX_HOME="$(read_with_default "Where should Vex's home be? Press Enter for the default" "$DEFAULT_HOME")"
if [ "$VEX_HOME" != "$DEFAULT_HOME" ]; then VEXHOME_DEFAULT_USED="false"; fi
echo "VexHome: $VEX_HOME"

# ---------- step 4: bootstrap ----------

step "Creating Vex's home (bootstrap)"
BOOTSTRAP_ARGS=("$REPO_ROOT/scripts/bootstrap.mjs" --device-name "$(scutil --get ComputerName 2>/dev/null || hostname)")
if [ "$VEXHOME_DEFAULT_USED" = "false" ]; then
  BOOTSTRAP_ARGS+=(--home "$VEX_HOME")
fi
BOOTSTRAP_EXIT=0
node "${BOOTSTRAP_ARGS[@]}" || BOOTSTRAP_EXIT=$?
BOOTSTRAP_OUTCOME="FAILED"
if [ "$BOOTSTRAP_EXIT" -eq 0 ]; then
  BOOTSTRAP_OUTCOME="CREATED_NEW_HOME"
  echo "Vex's home was created."
elif [ "$BOOTSTRAP_EXIT" -eq 3 ]; then
  BOOTSTRAP_OUTCOME="EXISTING_HOME_PRESERVED"
  echo ""
  echo "Vex already has a home here. Bootstrap left it in place; setup is resuming without deleting, moving, or migrating it."
  echo "(Setup may add or refresh its own runtime logs and install receipt inside this Home.)"
else
  echo ""
  echo "Bootstrap stopped with exit code $BOOTSTRAP_EXIT." >&2
  echo "Vex's home could not be set up. The message above is the exact reason."
  echo "Nothing else was started. You can fix the cause and run this script again - it is safe to re-run."
  exit "$BOOTSTRAP_EXIT"
fi

# ---------- step 5: optional model provisioning ----------

step "Model weights (optional - skipping is completely fine)"
if [ "$BOOTSTRAP_OUTCOME" = "EXISTING_HOME_PRESERVED" ]; then
  echo "This existing Home's prior model configuration was left in place. This setup run has not established whether a model endpoint or artifact is already configured."
else
  echo "This freshly created Home starts with its AI model UNCONFIGURED."
fi
echo "No model weights ever ship with VexLife or this installer. A model artifact downloaded by this setup is stored only as PROVISIONED_INACTIVE (present, verified, not activated)."
echo ""
echo "If you already have a download URL plus its SHA-256 checksum, source reference and"
echo "license reference, I can fetch and verify one model file now. I will never download"
echo "model weights without a checksum and those references."
MODEL_CHOICE="no"
MODEL_STATE="UNCONFIGURED"
[ "$BOOTSTRAP_OUTCOME" = "EXISTING_HOME_PRESERVED" ] && MODEL_STATE="EXISTING_HOME_MODEL_STATE_UNINSPECTED"
PROVISION_EXIT=""
PROV_URL=""; PROV_SHA=""; PROV_NAME=""; PROV_SOURCE_REF=""; PROV_LICENSE_REF=""
PROV_RUNTIME=""; PROV_HARDWARE=""
ANSWER="$(read_yes_no "Provision a model artifact now?" "n")"
if [ "$ANSWER" = "y" ]; then
  MODEL_CHOICE="yes"
  printf 'Model download URL (must start with https://): '; read -r PROV_URL || true
  printf 'Expected SHA-256 checksum (64 hex characters): '; read -r PROV_SHA || true
  PROV_SHA="$(printf '%s' "$PROV_SHA" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  URL_NAME="${PROV_URL##*/}"; URL_NAME="${URL_NAME%%\?*}"; URL_NAME="${URL_NAME%%#*}"
  [ -z "$URL_NAME" ] && URL_NAME="local-model.gguf"
  PROV_NAME="$(read_with_default "File name to store it as" "$URL_NAME")"
  printf 'Source reference (where this artifact came from, e.g. source.model.example): '; read -r PROV_SOURCE_REF || true
  printf 'License reference (e.g. license.model.example): '; read -r PROV_LICENSE_REF || true
  PROV_RUNTIME="$(read_with_default "Runtime family (e.g. llama.cpp)" "llama.cpp")"
  PROV_HARDWARE="$(read_with_default "Hardware profile reference" "hardware.local-device")"
  SHA_OK="no"; URL_OK="no"
  case "$PROV_SHA" in
    *[!0-9a-f]*) SHA_OK="no" ;;
    *) [ "${#PROV_SHA}" -eq 64 ] && SHA_OK="yes" ;;
  esac
  case "$PROV_URL" in https://*) URL_OK="yes" ;; esac
  if [ "$SHA_OK" != "yes" ] || [ "$URL_OK" != "yes" ] || [ -z "$PROV_SOURCE_REF" ] || [ -z "$PROV_LICENSE_REF" ]; then
    echo ""
    echo "That information was incomplete or not in the right shape, so I am NOT downloading anything."
    echo "Vex stays UNCONFIGURED. You can provision a model later with scripts/provision-model.mjs."
    MODEL_STATE="SKIPPED_INCOMPLETE_INPUT"
  else
    PROVISION_EXIT=0
    node "$REPO_ROOT/scripts/provision-model.mjs" \
      --url "$PROV_URL" --sha256 "$PROV_SHA" --name "$PROV_NAME" \
      --source-ref "$PROV_SOURCE_REF" --license-ref "$PROV_LICENSE_REF" \
      --runtime-family "$PROV_RUNTIME" --hardware-profile "$PROV_HARDWARE" \
      --home "$VEX_HOME" || PROVISION_EXIT=$?
    if [ "$PROVISION_EXIT" -eq 0 ]; then
      MODEL_STATE="PROVISIONED_INACTIVE"
      echo ""
      echo "Model file downloaded, checksum verified, and stored as PROVISIONED_INACTIVE."
      echo "That means: present and verified, NOT activated."
    else
      MODEL_STATE="PROVISION_FAILED"
      echo ""
      echo "Model provisioning did not succeed (exit code $PROVISION_EXIT)." >&2
      if [ "$BOOTSTRAP_OUTCOME" = "EXISTING_HOME_PRESERVED" ]; then
        echo "Provisioning did not complete. This setup run still does not classify the existing Home's prior model configuration; review the exact error above before retrying."
      else
        echo "Provisioning did not complete, so this fresh Home remains UNCONFIGURED. Review the exact error above before retrying."
      fi
      echo "Setup will continue."
    fi
  fi
else
  if [ "$BOOTSTRAP_OUTCOME" = "EXISTING_HOME_PRESERVED" ]; then
    echo "Skipping. This setup leaves the existing Home's model configuration in place; this run does not classify it as UNCONFIGURED."
  else
    echo "Skipping. This fresh Home remains UNCONFIGURED until you or your Home Node supplies a model."
  fi
fi

# ---------- step 6: start the browser server and open it ----------

step "Starting VexLife in your browser"
RUNTIME_DIR="$VEX_HOME/runtime"
mkdir -p "$RUNTIME_DIR"
SERVER_LOG="$RUNTIME_DIR/serve-browser.log"
nohup node "$REPO_ROOT/scripts/serve-browser.mjs" >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
disown 2>/dev/null || true
SERVER_UP="false"
i=0
while [ "$i" -lt 60 ]; do
  if curl -fsS -o /dev/null --max-time 1 "$INSTALL_URL" 2>/dev/null; then SERVER_UP="true"; break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
  sleep 0.25
  i=$((i + 1))
done
SERVER_ALIVE="false"
kill -0 "$SERVER_PID" 2>/dev/null && SERVER_ALIVE="true"
SERVER_PID_STATUS="running"
[ "$SERVER_ALIVE" = "false" ] && SERVER_PID_STATUS="exited"
BROWSER_OPENED="false"
if [ "$SERVER_UP" = "true" ] && [ "$SERVER_ALIVE" = "false" ]; then
  echo "Something is already answering at $INSTALL_URL - a VexLife server may already be running."
  echo "(The new server process I started exited; see $SERVER_LOG.) Opening your browser to the running one."
  open "$INSTALL_URL" 2>/dev/null && BROWSER_OPENED="true" || echo "Could not auto-open the browser - please open $INSTALL_URL yourself."
  SERVER_PID_STATUS="exited-port-already-in-use"
elif [ "$SERVER_UP" = "true" ]; then
  echo "VexLife is being served at $INSTALL_URL"
  echo "Opening your browser now..."
  open "$INSTALL_URL" 2>/dev/null && BROWSER_OPENED="true" || echo "Could not auto-open the browser - please open $INSTALL_URL yourself."
else
  echo ""
  echo "The local server did not come up within 15 seconds (PID $SERVER_PID)."
  echo "Check the log: $SERVER_LOG"
  echo "You can try opening $INSTALL_URL yourself in a moment."
fi

# ---------- step 7: receipt ----------

step "Writing your receipt"
FINISHED_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
RECOVERY_DIR="$VEX_HOME/recovery"
mkdir -p "$RECOVERY_DIR"
RECEIPT_PATH="$RECOVERY_DIR/install-receipt.txt"

MODEL_LINE="Fresh Home model state: UNCONFIGURED; this setup run provisioned no model artifact."
if [ "$BOOTSTRAP_OUTCOME" = "EXISTING_HOME_PRESERVED" ]; then
  MODEL_LINE="Existing Home model state: left in place and not established by this setup run; this run provisioned no model artifact."
fi
if [ "$MODEL_STATE" = "PROVISIONED_INACTIVE" ]; then
  MODEL_LINE="Model weights: one file was downloaded, checksum-verified and stored as PROVISIONED_INACTIVE (present, not activated). SHA-256: $PROV_SHA"
elif [ "$MODEL_STATE" = "PROVISION_FAILED" ]; then
  if [ "$BOOTSTRAP_OUTCOME" = "EXISTING_HOME_PRESERVED" ]; then
    MODEL_LINE="Model provisioning did not complete (exit code $PROVISION_EXIT); this setup run does not classify the existing Home's prior model configuration. This receipt does not claim that no artifact bytes remain; review the provisioning error before retrying."
  else
    MODEL_LINE="Model provisioning did not complete (exit code $PROVISION_EXIT); this fresh Home remains UNCONFIGURED. This receipt does not claim that no artifact bytes remain; review the provisioning error before retrying."
  fi
elif [ "$MODEL_STATE" = "SKIPPED_INCOMPLETE_INPUT" ]; then
  MODEL_LINE="Model weights: provisioning was requested but the details were incomplete, so nothing was downloaded; Vex is UNCONFIGURED."
fi

BOOTSTRAP_LINE="Vex's home was created fresh."
if [ "$BOOTSTRAP_OUTCOME" = "EXISTING_HOME_PRESERVED" ]; then
  BOOTSTRAP_LINE="Vex already had a home here. Bootstrap did not delete, move, migrate, or rewrite the existing bootstrap receipt (exit code 3 = preserve and resume). Setup then continued in place and may have added or refreshed setup-owned runtime logs and this install receipt."
fi

SERVER_LINE="The local VexLife page is running at $INSTALL_URL (server process id $SERVER_PID) and your browser was opened to it."
if [ "$SERVER_UP" = "true" ] && [ "$SERVER_ALIVE" = "false" ]; then
  SERVER_LINE="Port 18110 was already answering (a VexLife server is likely already running from before); the new server process ($SERVER_PID) exited, and your browser was opened to the running one."
fi
if [ "$SERVER_UP" != "true" ]; then
  SERVER_LINE="The local server was started (process id $SERVER_PID) but did not answer within 15 seconds. Try opening $INSTALL_URL yourself; the log is at $SERVER_LOG."
fi

json_or_null() { if [ -z "$1" ]; then printf 'null'; else printf '"%s"' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')"; fi; }

cat > "$RECEIPT_PATH" <<EOF
==============================================================
VexLife setup receipt (plain English)
==============================================================
When: $STARTED_UTC  (finished: $FINISHED_UTC)

WHAT HAPPENED
- Node.js $NODE_VERSION was found ($NODE_SOURCE).
- VexLife folder used: $REPO_ROOT ($REPO_OBTAINED_VIA).
- $BOOTSTRAP_LINE
- $MODEL_LINE
- $SERVER_LINE

WHERE VEX LIVES
- VexHome: $VEX_HOME
- Vex's own bootstrap receipt: $RECOVERY_DIR/bootstrap-receipt.json
  (note: on a preserved existing home, VexLife does not rewrite that receipt)
- This receipt: $RECEIPT_PATH

MODEL STATE
- $MODEL_STATE
- Model weights never ship inside VexLife or this installer.

DREAM SYNC
- Dream sync is manual, on your command. Nothing in this setup (or in
  VexLife today) runs dream sync automatically.

TO START VEX NEXT TIME
- Easiest: run this setup script again (it does not delete, move, or automatically migrate an existing Home; setup-owned logs and this install receipt may be refreshed).
- Or run start-vexlife.sh in the VexLife folder, then open
  $INSTALL_URL yourself (that launcher does not open the browser for you).

TO STOP VEX
- Run:  kill $SERVER_PID
- (That stops the local page server. Vex's home stays exactly as it is.)

TIP
- You can ask Vex to summarize this receipt.
==============================================================

---------------- machine block (for Vex and tools) ----------------
BEGIN-INSTALL-RECEIPT-JSON
{
  "schemaVersion": "vextreme.install-receipt/v0",
  "marker": "[VXG RealForever]",
  "timestamps": { "startedUtc": "$STARTED_UTC", "finishedUtc": "$FINISHED_UTC" },
  "platform": { "os": "macos", "uname": "$(uname -srm)", "host": "$(hostname)" },
  "node": { "version": "$NODE_VERSION", "source": "$NODE_SOURCE", "brewCommand": "brew install node" },
  "repo": { "root": "$REPO_ROOT", "obtainedVia": "$REPO_OBTAINED_VIA", "downloadUrl": $(json_or_null "$REPO_DOWNLOAD_URL") },
  "vexHome": { "path": "$VEX_HOME", "defaultUsed": $VEXHOME_DEFAULT_USED, "passedAsFlag": $([ "$VEXHOME_DEFAULT_USED" = "true" ] && echo false || echo true) },
  "bootstrap": {
    "exitCode": $BOOTSTRAP_EXIT,
    "outcome": "$BOOTSTRAP_OUTCOME",
    "existingHomePolicy": "PRESERVE_AND_CLASSIFY",
    "migrationFlowImplemented": false,
    "bootstrapReceiptPath": "$RECOVERY_DIR/bootstrap-receipt.json",
    "bootstrapReceiptRewrittenOnPreserve": false
  },
  "model": {
    "provisionOffered": true,
    "userChoice": "$MODEL_CHOICE",
    "state": "$MODEL_STATE",
    "stateScope": "SETUP_OBSERVATION_OR_PROVISIONING_OUTCOME",
    "existingHomePriorStateInspected": false,
    "provisionExitCode": $(json_or_null "$PROVISION_EXIT"),
    "sha256": $(json_or_null "$PROV_SHA"),
    "sourceRef": $(json_or_null "$PROV_SOURCE_REF"),
    "licenseRef": $(json_or_null "$PROV_LICENSE_REF"),
    "name": $(json_or_null "$PROV_NAME"),
    "runtimeFamily": $(json_or_null "$PROV_RUNTIME"),
    "hardwareProfileRef": $(json_or_null "$PROV_HARDWARE"),
    "weightsShipInRepoOrInstaller": false
  },
  "dreamSync": { "mode": "manual", "automatic": false, "note": "dream sync: manual, on your command" },
  "server": {
    "url": "$INSTALL_URL",
    "pid": $SERVER_PID,
    "pidStatus": "$SERVER_PID_STATUS",
    "respondedWithin15s": $SERVER_UP,
    "browserOpened": $BROWSER_OPENED,
    "log": "$SERVER_LOG",
    "stopCommand": "kill $SERVER_PID"
  },
  "exitCodes": { "bootstrap": $BOOTSTRAP_EXIT, "provisionModel": $(json_or_null "$PROVISION_EXIT") },
  "unknowns": [
    "whether the server kept running after this script exited (check the url or the pid)",
    "license/source reference contents (references were recorded, not verified)"
  ]
}
END-INSTALL-RECEIPT-JSON
[VXG RealForever]
EOF

echo "Receipt written: $RECEIPT_PATH"
echo ""
echo "All done. Vex is set up and (if all went well) open in your browser."
echo "The server keeps running in the background until you stop it: kill $SERVER_PID"
exit 0

# [VXG RealForever]
