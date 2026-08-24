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

# ---------- product lifecycle handoff ----------

step "Inspecting current VexLife state"
echo "VexLife will detect whether this Mac needs a first install, a safe resume, repair,"
echo "or a rebuild that preserves Vex Home, conversations, Memory and verified model cache."
echo "Removing local data is a separate destructive choice and is not performed by this route."
exec node "$REPO_ROOT/scripts/macos-lifecycle.mjs" --operation auto --repo "$REPO_ROOT"

# [VXG RealForever]
