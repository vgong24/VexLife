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
SESSION_TOKEN=""
SETUP_SESSION_DIR=""
SETUP_SESSION_OWNED="no"

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
    --session-token)
      [ "$#" -ge 2 ] || fail "--session-token requires one value."
      SESSION_TOKEN="$2"
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
  [ -n "$SESSION_TOKEN" ] || fail "controller mode requires --session-token."
  case "$SESSION_TOKEN" in *[!A-Za-z0-9._:-]*) fail "controller session token contains unsupported characters." ;; esac
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
  if csv_has_choice "$choices" start; then
    if [ "$state" = "ABSENT" ] && [ "$host_eligible" = "yes" ]; then
      actions="$(append_action "$actions" first-setup)"
    fi
    if [ "$state" = "EXISTING_HEALTHY" ]; then
      actions="$(append_action "$actions" open)"
    fi
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
  local state="$1" choices="$2"
  { [ "$state" = "ABSENT" ] && csv_has_choice "$choices" start; } ||
    csv_has_choice "$choices" repair ||
    csv_has_choice "$choices" rebuild-preserve
}
setup_session_dir_for_home() {
  local uid key
  uid="$(/usr/bin/id -u)"
  key="$(printf '%s' "$VEX_HOME" | /usr/bin/cksum | /usr/bin/awk '{print $1 "-" $2}')"
  printf '/tmp/vexlife-setup-%s-%s.lock' "$uid" "$key"
}
setup_session_active_owner() {
  local dir="$1" pid token home_path repo_path command_line
  [ -d "$dir" ] && [ ! -L "$dir" ] || return 2
  [ -f "$dir/owner.pid" ] && [ -f "$dir/owner.token" ] && [ -f "$dir/owner.home" ] && [ -f "$dir/owner.repo" ] || return 2
  pid="$(cat "$dir/owner.pid" 2>/dev/null || true)"
  token="$(cat "$dir/owner.token" 2>/dev/null || true)"
  home_path="$(cat "$dir/owner.home" 2>/dev/null || true)"
  repo_path="$(cat "$dir/owner.repo" 2>/dev/null || true)"
  case "$pid" in ''|*[!0-9]*) return 2 ;; esac
  [ "$home_path" = "$VEX_HOME" ] || return 2
  [ -n "$token" ] && [ -n "$repo_path" ] || return 2
  if ! kill -0 "$pid" 2>/dev/null; then return 1; fi
  command_line="$(/bin/ps -ww -p "$pid" -o command= 2>/dev/null || true)"
  case "$command_line" in
    *"$repo_path/install/vexlife-setup.sh"*--controller*"$token"*) printf '%s' "$pid"; return 0 ;;
    *) return 2 ;;
  esac
}
cleanup_stale_setup_session() {
  local dir="$1" entry
  [ -d "$dir" ] && [ ! -L "$dir" ] || return 1
  for entry in owner.pid owner.token owner.home owner.repo owner.action child.pid child.stdout; do
    [ ! -e "$dir/$entry" ] || /bin/rm -f -- "$dir/$entry"
  done
  /bin/rmdir "$dir" 2>/dev/null
}
release_setup_session() {
  [ "$SETUP_SESSION_OWNED" = "yes" ] || return 0
  [ -n "$SETUP_SESSION_DIR" ] || return 0
  if [ -f "$SETUP_SESSION_DIR/owner.pid" ] && [ -f "$SETUP_SESSION_DIR/owner.token" ] &&
     [ "$(cat "$SETUP_SESSION_DIR/owner.pid" 2>/dev/null || true)" = "$$" ] &&
     [ "$(cat "$SETUP_SESSION_DIR/owner.token" 2>/dev/null || true)" = "$SESSION_TOKEN" ]; then
    /bin/rm -f -- "$SETUP_SESSION_DIR/child.pid" "$SETUP_SESSION_DIR/child.stdout"       "$SETUP_SESSION_DIR/owner.action" "$SETUP_SESSION_DIR/owner.repo" "$SETUP_SESSION_DIR/owner.home"       "$SETUP_SESSION_DIR/owner.token" "$SETUP_SESSION_DIR/owner.pid"
    /bin/rmdir "$SETUP_SESSION_DIR" 2>/dev/null || true
  fi
  SETUP_SESSION_OWNED="no"
  SETUP_SESSION_DIR=""
}
cancel_setup_session() {
  local exit_code="${1:-130}" child_pid="" child_parent=""
  if [ "$SETUP_SESSION_OWNED" = "yes" ] && [ -f "$SETUP_SESSION_DIR/child.pid" ]; then
    child_pid="$(cat "$SETUP_SESSION_DIR/child.pid" 2>/dev/null || true)"
    case "$child_pid" in ''|*[!0-9]*) child_pid="" ;; esac
    if [ -n "$child_pid" ] && kill -0 "$child_pid" 2>/dev/null; then
      child_parent="$(/bin/ps -p "$child_pid" -o ppid= 2>/dev/null | tr -d '[:space:]' || true)"
      if [ "$child_parent" = "$$" ]; then
        kill -TERM "$child_pid" 2>/dev/null || true
        wait "$child_pid" 2>/dev/null || true
      fi
    fi
  fi
  release_setup_session
  exit "$exit_code"
}
acquire_setup_session() {
  local action="$1" attempt dir owner_pid probe_status
  if [ "$SETUP_SESSION_OWNED" = "yes" ]; then return 0; fi
  [ -n "$SESSION_TOKEN" ] || fail "setup operation requires one session token."
  dir="$(setup_session_dir_for_home)"
  for attempt in 1 2; do
    if /bin/mkdir "$dir" 2>/dev/null; then
      printf '%s\n' "$$" > "$dir/owner.pid"
      printf '%s\n' "$SESSION_TOKEN" > "$dir/owner.token"
      printf '%s\n' "$VEX_HOME" > "$dir/owner.home"
      printf '%s\n' "$REPO_ROOT" > "$dir/owner.repo"
      printf '%s\n' "$action" > "$dir/owner.action"
      SETUP_SESSION_DIR="$dir"
      SETUP_SESSION_OWNED="yes"
      trap 'cancel_setup_session 130' HUP INT TERM
      trap 'release_setup_session' EXIT
      return 0
    fi
    set +e
    owner_pid="$(setup_session_active_owner "$dir")"
    probe_status=$?
    set -e
    if [ "$probe_status" -eq 0 ]; then
      fail "another exact VexLife setup operation is already active for this Home (pid $owner_pid). Use its Cancel safely control or choose Stop & clean from a fresh setup window."
    fi
    if [ "$probe_status" -eq 2 ]; then
      fail "VexLife found setup coordination state for this Home but could not prove its exact owner. Restart the Mac or inspect the coordination state before another mutating setup action."
    fi
    cleanup_stale_setup_session "$dir" || fail "stale VexLife setup coordination state could not be cleared safely."
  done
  fail "VexLife could not reserve the exact setup operation for this Home."
}
stop_active_setup_session() {
  local dir owner_pid probe_status attempt
  dir="$(setup_session_dir_for_home)"
  [ -e "$dir" ] || return 0
  set +e
  owner_pid="$(setup_session_active_owner "$dir")"
  probe_status=$?
  set -e
  if [ "$probe_status" -eq 1 ]; then
    cleanup_stale_setup_session "$dir" || fail "stale VexLife setup coordination state could not be cleared safely."
    return 0
  fi
  [ "$probe_status" -eq 0 ] || fail "VexLife found setup coordination state but could not prove an exact setup owner; refusing to signal any process."
  [ "$owner_pid" != "$$" ] || return 0
  kill -TERM "$owner_pid" 2>/dev/null || true
  for attempt in $(seq 1 80); do
    if ! kill -0 "$owner_pid" 2>/dev/null; then
      cleanup_stale_setup_session "$dir" || true
      return 0
    fi
    sleep 0.1
  done
  fail "the exact active setup owner did not stop after cancellation; refusing to continue cleanup while it may still be writing."
}
run_owned() {
  local child_pid status
  if [ "$SETUP_SESSION_OWNED" != "yes" ]; then "$@"; return $?; fi
  "$@" &
  child_pid=$!
  printf '%s\n' "$child_pid" > "$SETUP_SESSION_DIR/child.pid"
  set +e
  wait "$child_pid"
  status=$?
  set -e
  /bin/rm -f -- "$SETUP_SESSION_DIR/child.pid"
  return "$status"
}
begin_setup_action() {
  local action="$1"
  if [ "$action" = "uninstall-preserve" ]; then stop_active_setup_session; fi
  acquire_setup_session "$action"
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
  local operation="$1" noninteractive_authorized="${2:-no}" result_file
  local lifecycle_args=("$REPO_ROOT/scripts/macos-lifecycle.mjs" --operation "$operation" --repo "$REPO_ROOT" --home "$VEX_HOME")
  reconcile_prior_browser_source || return 1
  if [ "$noninteractive_authorized" = "yes" ]; then lifecycle_args+=(--yes); fi
  if [ "$SETUP_SESSION_OWNED" = "yes" ]; then
    result_file="$SETUP_SESSION_DIR/child.stdout"
    : > "$result_file"
  else
    result_file="$(/usr/bin/mktemp "${TMPDIR:-/tmp}/vexlife-lifecycle.XXXXXX")"
  fi
  if ! run_owned node "${lifecycle_args[@]}" >"$result_file"; then
    /bin/rm -f -- "$result_file"
    printf '\nVexLife stopped safely before completing %s.\n' "$operation" >&2
    return 1
  fi
  /bin/cat "$result_file"
  /bin/rm -f -- "$result_file"
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
    probe_home="${selected_home%/}/.vexlife-host-eligibility-${BASHPID:-$$}-${RANDOM}-${RANDOM}"
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

  if controller_choices_require_host "$state" "$lifecycle_choices"; then
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
  begin_setup_action "$CONTROLLER_ACTION"
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

  case "$CONTROLLER_ACTION" in
    first-setup|repair|rebuild-preserve)
      if ! host_state="$(controller_host_eligibility_state "$VEX_HOME")"; then
        fail "the accepted initialization/profile owner could not prove this Mac eligible ($host_state); no setup/recovery effect was performed."
      fi
      ;;
    open|uninstall-preserve)
      ;;
  esac

  case "$state:$CONTROLLER_ACTION" in
    ABSENT:first-setup)
      [ "$RUNTIME_ACQUISITION_CONSENT" = "yes" ] || fail "model/runtime acquisition was not authorized."
      if ! run_owned node "$REPO_ROOT/scripts/bootstrap.mjs" --device-name "$(scutil --get ComputerName 2>/dev/null || hostname)" --home "$VEX_HOME" >/dev/null; then
        fail "Vex Home bootstrap stopped before completion."
      fi
      if ! plan_output="$(node "$REPO_ROOT/scripts/initialize-vex.mjs" --home "$VEX_HOME" --plan-only)"; then
        fail "this Mac is not currently eligible for automatic VexLife setup; no model/runtime download was started."
      fi
      plan_state="$(printf '%s' "$plan_output" | tail -n 1 | parse_json_state)"
      [ "$plan_state" = "PLAN_READY_NO_EFFECT" ] || fail "this Mac is not currently eligible for automatic VexLife setup; no model/runtime download was started."
      if ! run_owned node "$REPO_ROOT/scripts/initialize-vex.mjs" --home "$VEX_HOME" --yes; then
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
      run_lifecycle repair yes >/dev/null
      open_vex
      controller_result "REPAIR_COMPLETE"
      ;;
    EXISTING_HEALTHY:rebuild-preserve|EXISTING_DEGRADED_REPAIRABLE:rebuild-preserve)
      [ "$RUNTIME_ACQUISITION_CONSENT" = "yes" ] || fail "rebuild-preserve was not authorized to reacquire required runtime files."
      run_lifecycle rebuild-preserve yes >/dev/null
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
SESSION_TOKEN="terminal-${BASHPID:-$}-${RANDOM}-${RANDOM}"
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

    begin_setup_action "first-setup"
    run_owned node "$REPO_ROOT/scripts/bootstrap.mjs" --device-name "$(scutil --get ComputerName 2>/dev/null || hostname)" --home "$VEX_HOME" >/dev/null

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
    if ! run_owned node "$REPO_ROOT/scripts/initialize-vex.mjs" --home "$VEX_HOME"; then
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
      '' ) begin_setup_action "open"; run_lifecycle start >/dev/null; open_vex ;;
      r )
        ask_yes_no "Repair may verify or reacquire required runtime files. Continue?" n || { say "Stopped. No repair was performed."; exit 0; }
        begin_setup_action "repair"; run_lifecycle repair yes >/dev/null; open_vex
        ;;
      b )
        ask_yes_no "Rebuild-preserve removes only runtime/transient state, preserves Home/Memory/model cache, and may reacquire runtime files. Continue?" n || { say "Stopped. No rebuild was performed."; exit 0; }
        begin_setup_action "rebuild-preserve"; run_lifecycle rebuild-preserve yes >/dev/null; open_vex
        ;;
      u )
        ask_yes_no "Uninstall-preserve stops owned processes and removes runtime/transient state while preserving Home, Memory, conversations, and verified model files. Continue?" n || { say "Stopped. Nothing was uninstalled."; exit 0; }
        begin_setup_action "uninstall-preserve"; run_lifecycle uninstall-preserve >/dev/null
        say "VexLife active setup/runtime state was stopped and cleaned while your Vex Home and preserved data stayed in place."
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
        begin_setup_action "repair"; run_lifecycle repair yes >/dev/null; open_vex
        ;;
      b )
        ask_yes_no "Rebuild-preserve keeps Home, Memory, conversations, and verified model cache while rebuilding runtime state. Continue?" n || { say "Stopped. No rebuild was performed."; exit 0; }
        begin_setup_action "rebuild-preserve"; run_lifecycle rebuild-preserve yes >/dev/null; open_vex
        ;;
      u )
        ask_yes_no "Uninstall-preserve keeps Home, Memory, conversations, and verified model files. Continue?" n || { say "Stopped. Nothing was uninstalled."; exit 0; }
        begin_setup_action "uninstall-preserve"; run_lifecycle uninstall-preserve >/dev/null
        say "VexLife active setup/runtime state was stopped and cleaned while your Vex Home and preserved data stayed in place."
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
