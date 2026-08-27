#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
INSTALL_URL="http://127.0.0.1:18110"
DEFAULT_HOME="${VEXLIFE_HOME:-$HOME/.vexlife}"

say() { printf '\n%s\n' "$1"; }
ask_yes_no() {
  local question="$1" default="${2:-y}" answer hint="Y/n"
  if [ "$default" = "n" ]; then hint="y/N"; fi
  printf '%s [%s] ' "$question" "$hint"
  read -r answer || true
  answer="$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  if [ -z "$answer" ]; then [ "$default" = "y" ]; return; fi
  [ "$answer" = "y" ] || [ "$answer" = "yes" ]
}
node_major() {
  local value
  value="$(node --version 2>/dev/null)" || { printf 'none'; return; }
  value="${value#v}"
  printf '%s' "${value%%.*}"
}
parse_json_state() {
  node -e '
    let s="";
    process.stdin.on("data", d => s += d);
    process.stdin.on("end", () => {
      try { console.log(JSON.parse(s).state || "UNKNOWN"); }
      catch { console.log("UNKNOWN"); }
    });
  '
}
reconcile_prior_browser_source() {
  if ! node --input-type=module - "$REPO_ROOT/scripts/macos-lifecycle.mjs" "$VEX_HOME" "$REPO_ROOT" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [modulePathRaw, homeRaw, currentRepoRaw] = process.argv.slice(2);
const modulePath = path.resolve(modulePathRaw);
const home = path.resolve(homeRaw);
const currentRepo = path.resolve(currentRepoRaw);
const receiptPath = path.join(home, 'recovery', 'browser-process.json');

try {
  if (!fs.existsSync(receiptPath)) process.exit(0);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  if (!receipt || receipt.state !== 'RUNNING') process.exit(0);
  if (!receipt.vexHomePath || path.resolve(String(receipt.vexHomePath)) !== home) {
    throw new Error('browser process receipt Home identity does not match the selected Vex Home');
  }
  if (!receipt.repoRootPath) {
    throw new Error('browser process receipt does not identify the source that launched it');
  }
  const priorRepo = path.resolve(String(receipt.repoRootPath));
  if (priorRepo === currentRepo) process.exit(0);

  const lifecycle = await import(pathToFileURL(modulePath).href);
  const result = await lifecycle.stopOwnedBrowser(home, priorRepo);
  if (!result || !['EXACT_BROWSER_STOPPED', 'ALREADY_STOPPED', 'NO_BROWSER_RECEIPT'].includes(result.disposition)) {
    throw new Error(`prior-source browser stop returned an unexpected disposition: ${result?.disposition || 'UNKNOWN'}`);
  }
} catch (error) {
  console.error(`VEXLIFE_BROWSER_SOURCE_ROTATION_HELD: ${error.message}`);
  process.exit(1);
}
NODE
  then
    say "VexLife found browser state from an earlier source version but could not prove it was safe to stop. Nothing else was changed."
    return 1
  fi
}
run_lifecycle() {
  local operation="$1" result
  reconcile_prior_browser_source || return 1
  if ! result="$(node "$REPO_ROOT/scripts/macos-lifecycle.mjs" --operation "$operation" --repo "$REPO_ROOT" --home "$VEX_HOME")"; then
    printf '\nVexLife stopped safely before completing %s.\n' "$operation" >&2
    return 1
  fi
  printf '%s' "$result"
}
open_vex() {
  /usr/bin/open "$INSTALL_URL" >/dev/null 2>&1 || true
  say "VexLife is ready. Your browser should open at $INSTALL_URL"
}

printf '\nVexLife setup for Mac\n'
printf '%s\n' '---------------------'
printf 'I will check this Mac first, then ask only before choices or effects that belong to you.\n'

# Node is a prerequisite, so inspect it instead of asking the user to diagnose it.
MAJOR="$(node_major)"
if [ "$MAJOR" = "none" ] || [ "$MAJOR" -lt 20 ] 2>/dev/null; then
  say "VexLife needs Node.js 20 or newer."
  if command -v brew >/dev/null 2>&1; then
    if ask_yes_no "May I install Node.js with Homebrew?" n; then
      brew install node
      MAJOR="$(node_major)"
      if [ "$MAJOR" = "none" ] || [ "$MAJOR" -lt 20 ] 2>/dev/null; then
        say "Node.js was installed, but this Terminal cannot see it yet. Open a new Terminal and run setup-vexlife.command again."
        exit 0
      fi
    else
      say "No changes were made. Install Node.js 20+ when you are ready, then run setup-vexlife.command again."
      exit 0
    fi
  else
    say "Install Node.js 20+ from nodejs.org, then run setup-vexlife.command again."
    exit 0
  fi
fi
printf 'Node.js %s is ready.\n' "$(node --version)"

printf '\nWhere should Vex keep its local Home?\n'
printf '[%s] ' "$DEFAULT_HOME"
read -r HOME_INPUT || true
if [ -z "${HOME_INPUT//[[:space:]]/}" ]; then
  VEX_HOME="$DEFAULT_HOME"
else
  case "$HOME_INPUT" in
    '~') VEX_HOME="$HOME" ;;
    '~/'*) VEX_HOME="$HOME/${HOME_INPUT#\~/}" ;;
    *) VEX_HOME="$HOME_INPUT" ;;
  esac
fi
VEX_HOME="$(node -e 'const p=require("node:path"); console.log(p.resolve(process.argv[1]))' "$VEX_HOME")"
printf 'Vex Home: %s\n' "$VEX_HOME"

STATUS_JSON="$(node "$REPO_ROOT/scripts/macos-lifecycle.mjs" --operation status --repo "$REPO_ROOT" --home "$VEX_HOME")"
STATE="$(printf '%s' "$STATUS_JSON" | parse_json_state)"

case "$STATE" in
  ABSENT)
    say "No VexLife Home was found here. This is a first setup."
    if ! ask_yes_no "Create this Vex Home and continue?" y; then
      say "Stopped. Nothing was installed."
      exit 0
    fi

    node "$REPO_ROOT/scripts/bootstrap.mjs" --device-name "$(scutil --get ComputerName 2>/dev/null || hostname)" --home "$VEX_HOME" >/dev/null

    say "Checking whether this Mac matches a release-qualified VexLife profile..."
    if ! PLAN_OUTPUT="$(node "$REPO_ROOT/scripts/initialize-vex.mjs" --home "$VEX_HOME" --plan-only)"; then
      say "This Mac is not currently eligible for automatic VexLife setup. No model/runtime download was started."
      exit 1
    fi
    PLAN_STATE="$(printf '%s' "$PLAN_OUTPUT" | tail -n 1 | parse_json_state)"
    if [ "$PLAN_STATE" != "PLAN_READY_NO_EFFECT" ]; then
      say "This Mac is not currently eligible for automatic VexLife setup. No model/runtime download was started."
      exit 1
    fi

    say "This Mac is supported. VexLife will now ask before downloading several GB of verified model/runtime files and starting the local model."
    if ! node "$REPO_ROOT/scripts/initialize-vex.mjs" --home "$VEX_HOME"; then
      say "Setup stopped safely before Vex was ready."
      exit 1
    fi
    RECEIPT="$VEX_HOME/recovery/vex-initialization-receipt.json"
    if [ ! -f "$RECEIPT" ]; then
      say "Setup stopped before model/runtime activation. Nothing else was started."
      exit 0
    fi

    run_lifecycle start >/dev/null
    open_vex
    ;;

  EXISTING_HEALTHY)
    say "VexLife is already set up and healthy here."
    printf 'Press [Enter] to open Vex, [r] repair, [b] rebuild while preserving Home, [u] uninstall-preserve, or [q] quit: '
    read -r CHOICE || true
    CHOICE="$(printf '%s' "$CHOICE" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
    case "$CHOICE" in
      '' ) run_lifecycle start >/dev/null; open_vex ;;
      r )
        ask_yes_no "Repair may verify or reacquire required runtime files. Continue?" n || { say "Stopped. No repair was performed."; exit 0; }
        run_lifecycle repair >/dev/null; open_vex
        ;;
      b )
        ask_yes_no "Rebuild-preserve removes only runtime/transient state, preserves Home/Memory/model cache, and may reacquire runtime files. Continue?" n || { say "Stopped. No rebuild was performed."; exit 0; }
        run_lifecycle rebuild-preserve >/dev/null; open_vex
        ;;
      u )
        ask_yes_no "Uninstall-preserve stops owned processes and removes runtime/transient state while preserving Home, Memory, conversations, and verified model files. Continue?" n || { say "Stopped. Nothing was uninstalled."; exit 0; }
        run_lifecycle uninstall-preserve >/dev/null
        say "VexLife runtime was removed while your Vex Home and preserved data stayed in place."
        ;;
      q ) say "Stopped. No changes were made." ;;
      * ) say "That choice is not available for the current VexLife state. Nothing was changed."; exit 1 ;;
    esac
    ;;

  EXISTING_DEGRADED_REPAIRABLE)
    say "VexLife found an existing Home that needs recovery before it can start."
    printf 'Choose [Enter] repair, [b] rebuild while preserving Home, [u] uninstall-preserve, or [q] quit: '
    read -r CHOICE || true
    CHOICE="$(printf '%s' "$CHOICE" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
    case "$CHOICE" in
      ''|r )
        ask_yes_no "Repair may verify or reacquire required runtime files. Continue?" n || { say "Stopped. No repair was performed."; exit 0; }
        run_lifecycle repair >/dev/null; open_vex
        ;;
      b )
        ask_yes_no "Rebuild-preserve keeps Home, Memory, conversations, and verified model cache while rebuilding runtime state. Continue?" n || { say "Stopped. No rebuild was performed."; exit 0; }
        run_lifecycle rebuild-preserve >/dev/null; open_vex
        ;;
      u )
        ask_yes_no "Uninstall-preserve keeps Home, Memory, conversations, and verified model files. Continue?" n || { say "Stopped. Nothing was uninstalled."; exit 0; }
        run_lifecycle uninstall-preserve >/dev/null
        say "VexLife runtime was removed while your Vex Home and preserved data stayed in place."
        ;;
      q ) say "Stopped. No changes were made." ;;
      * ) say "That choice is not available for the current VexLife state. Nothing was changed."; exit 1 ;;
    esac
    ;;

  HELD_NONCANONICAL_HOME)
    say "VexLife found files at that location but cannot safely identify them as a Vex Home. Nothing will be overwritten, repaired, or deleted. Choose another Home location or inspect that folder first."
    exit 1
    ;;

  *)
    say "VexLife could not classify this Home safely. Nothing was changed."
    exit 1
    ;;
esac

# [VXG RealForever]
