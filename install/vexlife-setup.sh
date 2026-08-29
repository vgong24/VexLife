#!/usr/bin/env bash
set -euo pipefail

SCRIPT_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$SCRIPT_REPO_ROOT"
if [ "$#" -gt 0 ] && [[ "$1" != --* ]]; then
  REPO_ROOT="$1"
  shift
fi
INSTALL_URL="http://127.0.0.1:18110"
DEFAULT_HOME="${VEXLIFE_HOME:-$HOME/.vexlife}"
CONTROLLER_MODE=false
CONTROLLER_HOME=""
CONTROLLER_ACTION=""
NODE_INSTALL_CONSENT="no"
RUNTIME_ACQUISITION_CONSENT="no"

say() { printf '\n%s\n' "$1"; }
fail() { printf '\nVexLife setup stopped: %s\n' "$1" >&2; exit 1; }
controller_state() { printf 'VEXLIFE_CONTROLLER_STATE\t%s\n' "$1"; }
controller_result() { printf 'VEXLIFE_CONTROLLER_RESULT\t%s\n' "$1"; }
controller_actions() { printf 'VEXLIFE_CONTROLLER_ACTIONS\t%s\n' "$1"; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --controller)
      CONTROLLER_MODE=true
      shift
      ;;
    --home)
      [ "$#" -ge 2 ] || fail "--home requires one path value."
      CONTROLLER_HOME="$2"
      shift 2
      ;;
    --action)
      [ "$#" -ge 2 ] || fail "--action requires one controller action."
      CONTROLLER_ACTION="$2"
      shift 2
      ;;
    --node-install-consent)
      [ "$#" -ge 2 ] || fail "--node-install-consent requires yes or no."
      NODE_INSTALL_CONSENT="$2"
      shift 2
      ;;
    --runtime-acquisition-consent)
      [ "$#" -ge 2 ] || fail "--runtime-acquisition-consent requires yes or no."
      RUNTIME_ACQUISITION_CONSENT="$2"
      shift 2
      ;;
    *) fail "unknown setup argument: $1" ;;
  esac
done

if [ "$CONTROLLER_MODE" = true ]; then
  [ -n "$CONTROLLER_ACTION" ] || fail "controller mode requires --action."
  [ -n "$CONTROLLER_HOME" ] || fail "controller mode requires --home."
  case "$CONTROLLER_ACTION" in
    inspect|install-node|first-setup|open|repair|rebuild-preserve|uninstall-preserve) ;;
    *) fail "unknown controller action: $CONTROLLER_ACTION" ;;
  esac
  case "$NODE_INSTALL_CONSENT" in yes|no) ;; *) fail "node install consent must be yes or no." ;; esac
  case "$RUNTIME_ACQUISITION_CONSENT" in yes|no) ;; *) fail "runtime acquisition consent must be yes or no." ;; esac
  case "$CONTROLLER_HOME" in *$'\n'*|*$'\r'*|*$'\t'*) fail "the selected Home path contains unsupported control characters." ;; esac
fi

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
parse_json_choices() {
  node -e '
    let s="";
    process.stdin.on("data", d => s += d);
    process.stdin.on("end", () => {
      try {
        const value = JSON.parse(s);
        const choices = Array.isArray(value.choices) ? value.choices.map(String) : [];
        console.log(choices.join(","));
      } catch { console.log(""); }
    });
  '
}
csv_has_choice() {
  local csv="$1" expected="$2"
  case ",$csv," in
    *",$expected,"*) return 0 ;;
    *) return 1 ;;
  esac
}
append_action() {
  local current="$1" action="$2"
  if [ -z "$current" ]; then printf '%s' "$action"; else printf '%s,%s' "$current" "$action"; fi
}
controller_actions_from_lifecycle() {
  local state="$1" choices="$2" host_eligible="${3:-yes}" actions=""
  if [ "$host_eligible" = "yes" ] && csv_has_choice "$choices" start; then
    if [ "$state" = "ABSENT" ]; then actions="$(append_action "$actions" first-setup)"; fi
    if [ "$state" = "EXISTING_HEALTHY" ]; then actions="$(append_action "$actions" open)"; fi
  fi
  if [ "$host_eligible" = "yes" ]; then
    for action in repair rebuild-preserve; do
      if csv_has_choice "$choices" "$action"; then actions="$(append_action "$actions" "$action")"; fi
    done
  fi
  if csv_has_choice "$choices" uninstall-preserve; then
    actions="$(append_action "$actions" uninstall-preserve)"
  fi
  printf '%s' "$actions"
}
controller_choices_require_host() {
  local choices="$1"
  csv_has_choice "$choices" start ||
    csv_has_choice "$choices" repair ||
    csv_has_choice "$choices" rebuild-preserve
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
canonicalize_home() {
  local raw="$1"
  case "$raw" in
    '~') raw="$HOME" ;;
    '~/'*) raw="$HOME/${raw#\~/}" ;;
  esac
  node -e 'const p=require("node:path"); console.log(p.resolve(process.argv[1]))' "$raw"
}
controller_host_eligibility_state() {
  local selected_home="$1" probe_home="" output state attempt
  for attempt in 1 2 3; do
    probe_home="${selected_home%/}/.vexlife-host-eligibility-${BASHPID}-${RANDOM}-${RANDOM}"
    [ ! -e "$probe_home" ] && break
    probe_home=""
  done
  [ -n "$probe_home" ] || { printf 'HOST_PREFLIGHT_UNAVAILABLE'; return 1; }

  set +e
  output="$(node "$REPO_ROOT/scripts/initialize-vex.mjs" --home "$probe_home" --plan-only 2>/dev/null)"
  set -e

  if [ -e "$probe_home" ]; then
    printf 'HOST_PREFLIGHT_MUTATED'
    return 1
  fi
  state="$(printf '%s' "$output" | tail -n 1 | parse_json_state)"
  case "$state" in
    HOME_NOT_ESTABLISHED|PLAN_READY_NO_EFFECT)
      printf 'HOST_ELIGIBLE'
      return 0
      ;;
    ''|UNKNOWN)
      printf 'HOST_PREFLIGHT_UNAVAILABLE'
      return 1
      ;;
    *)
      printf '%s' "$state"
      return 1
      ;;
  esac
}
controller_inspect() {
  local major status_json state lifecycle_choices actions host_state host_eligible="yes"
  major="$(node_major)"
  if [ "$major" = "none" ] || [ "$major" -lt 20 ] 2>/dev/null; then
    if command -v brew >/dev/null 2>&1; then
      controller_state "NODE_REQUIRED_HOMEBREW_AVAILABLE"
      controller_actions "install-node"
    else
      controller_state "NODE_REQUIRED_MANUAL_INSTALL"
      controller_actions ""
    fi
    return 0
  fi
  VEX_HOME="$(canonicalize_home "$CONTROLLER_HOME")"
  status_json="$(node "$REPO_ROOT/scripts/macos-lifecycle.mjs" --operation status --repo "$REPO_ROOT" --home "$VEX_HOME")"
  state="$(printf '%s' "$status_json" | parse_json_state)"
  lifecycle_choices="$(printf '%s' "$status_json" | parse_json_choices)"

  if controller_choices_require_host "$lifecycle_choices"; then
    if ! host_state="$(controller_host_eligibility_state "$VEX_HOME")"; then
      host_eligible="no"
    fi
  fi

  actions="$(controller_actions_from_lifecycle "$state" "$lifecycle_choices" "$host_eligible")"
  if [ "$host_eligible" = "no" ] && [ -z "$actions" ]; then
    controller_state "HOST_ELIGIBILITY_HELD"
    controller_actions ""
    printf 'VexLife setup held: the accepted initialization/profile owner could not prove this Mac eligible (%s). Nothing was changed.\n' "$host_state" >&2
    return 4
  fi

  controller_state "$state"
  controller_actions "$actions"
}
controller_run() {
  local major status_json state lifecycle_choices required_lifecycle_action plan_output plan_state receipt host_state
  major="$(node_major)"
  if [ "$CONTROLLER_ACTION" = "install-node" ]; then
    if [ "$major" != "none" ] && [ "$major" -ge 20 ] 2>/dev/null; then
      controller_result "NODE_ALREADY_READY"
      return 0
    fi
    [ "$NODE_INSTALL_CONSENT" = "yes" ] || fail "Node.js installation was not authorized."
    command -v brew >/dev/null 2>&1 || fail "Homebrew is unavailable; install Node.js 20+ manually, then reopen setup."
    brew install node
    major="$(node_major)"
    if [ "$major" = "none" ] || [ "$major" -lt 20 ] 2>/dev/null; then
      fail "Node.js was installed, but this process cannot see Node.js 20+ yet. Reopen setup after the shell environment refreshes."
    fi
    controller_result "NODE_INSTALLED"
    return 0
  fi

  if [ "$major" = "none" ] || [ "$major" -lt 20 ] 2>/dev/null; then
    fail "Node.js 20+ is required before this controller action."
  fi

  VEX_HOME="$(canonicalize_home "$CONTROLLER_HOME")"
  status_json="$(node "$REPO_ROOT/scripts/macos-lifecycle.mjs" --operation status --repo "$REPO_ROOT" --home "$VEX_HOME")"
  state="$(printf '%s' "$status_json" | parse_json_state)"
  lifecycle_choices="$(printf '%s' "$status_json" | parse_json_choices)"

  if [ "$CONTROLLER_ACTION" = "inspect" ]; then
    controller_inspect
    return 0
  fi

  case "$CONTROLLER_ACTION" in
    first-setup|open) required_lifecycle_action="start" ;;
    repair|rebuild-preserve|uninstall-preserve) required_lifecycle_action="$CONTROLLER_ACTION" ;;
    *) fail "controller action '$CONTROLLER_ACTION' has no lifecycle-owner mapping." ;;
  esac
  csv_has_choice "$lifecycle_choices" "$required_lifecycle_action" \
    || fail "controller action '$CONTROLLER_ACTION' is not admitted by the lifecycle owner's current choices for state '$state'."

  if [ "$CONTROLLER_ACTION" != "uninstall-preserve" ]; then
    if ! host_state="$(controller_host_eligibility_state "$VEX_HOME")"; then
      fail "the accepted initialization/profile owner could not prove this Mac eligible ($host_state); no setup/recovery effect was performed."
    fi
  fi

  case "$state:$CONTROLLER_ACTION" in
    ABSENT:first-setup)
      [ "$RUNTIME_ACQUISITION_CONSENT" = "yes" ] || fail "model/runtime acquisition was not authorized."
      node "$REPO_ROOT/scripts/bootstrap.mjs" --device-name "$(scutil --get ComputerName 2>/dev/null || hostname)" --home "$VEX_HOME" >/dev/null
      if ! plan_output="$(node "$REPO_ROOT/scripts/initialize-vex.mjs" --home "$VEX_HOME" --plan-only)"; then
        fail "this Mac is not currently eligible for automatic VexLife setup; no model/runtime download was started."
      fi
      plan_state="$(printf '%s' "$plan_output" | tail -n 1 | parse_json_state)"
      [ "$plan_state" = "PLAN_READY_NO_EFFECT" ] || fail "this Mac is not currently eligible for automatic VexLife setup; no model/runtime download was started."
      if ! node "$REPO_ROOT/scripts/initialize-vex.mjs" --home "$VEX_HOME" --yes; then
        fail "setup stopped safely before Vex was ready."
      fi
      receipt="$VEX_HOME/recovery/vex-initialization-receipt.json"
      [ -f "$receipt" ] || fail "setup stopped before model/runtime activation."
      run_lifecycle start >/dev/null
      open_vex
      controller_result "FIRST_SETUP_COMPLETE"
      ;;
    EXISTING_HEALTHY:open)
      run_lifecycle start >/dev/null
      open_vex
      controller_result "VEX_OPENED"
      ;;
    EXISTING_HEALTHY:repair|EXISTING_DEGRADED_REPAIRABLE:repair)
      [ "$RUNTIME_ACQUISITION_CONSENT" = "yes" ] || fail "repair was not authorized to verify or reacquire required runtime files."
      run_lifecycle repair >/dev/null
      open_vex
      controller_result "REPAIR_COMPLETE"
      ;;
    EXISTING_HEALTHY:rebuild-preserve|EXISTING_DEGRADED_REPAIRABLE:rebuild-preserve)
      [ "$RUNTIME_ACQUISITION_CONSENT" = "yes" ] || fail "rebuild-preserve was not authorized to reacquire required runtime files."
      run_lifecycle rebuild-preserve >/dev/null
      open_vex
      controller_result "REBUILD_PRESERVE_COMPLETE"
      ;;
    EXISTING_HEALTHY:uninstall-preserve|EXISTING_DEGRADED_REPAIRABLE:uninstall-preserve)
      run_lifecycle uninstall-preserve >/dev/null
      controller_result "UNINSTALL_PRESERVE_COMPLETE"
      ;;
    *)
      fail "controller action '$CONTROLLER_ACTION' is not admitted by the actual current VexLife state '$state'."
      ;;
  esac
}

if [ "$CONTROLLER_MODE" = true ]; then
  if [ "$CONTROLLER_ACTION" = "inspect" ]; then
    controller_inspect
  else
    controller_run
  fi
  exit 0
fi

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
VEX_HOME="$(canonicalize_home "$VEX_HOME")"
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
