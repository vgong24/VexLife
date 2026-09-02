#!/bin/bash
set -euo pipefail

EXPECTED_COMMIT='3d2ef4c81a5b6b5a7ba717178fb3479511299e08'
EXPECTED_TREE='8f8f945e8a448b191f85dfc327c135f54a296398'
EXPECTED_SHA256='a09867eb2e827cb3f4ca84b11eae87420ba58738e4dec68de8b11cce3cd84eca'
EXPECTED_BYTES='8765440'
TAR_NAME='vexlife-source-3d2ef4c81a5b6b5a7ba717178fb3479511299e08.tar'

fail() { printf 'VexLife setup package stopped: %s\n' "$1" >&2; exit 2; }
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
RESOURCE_ROOT="$APP_ROOT/Resources"
SOURCE_TAR="$RESOURCE_ROOT/$TAR_NAME"
[ -f "$SOURCE_TAR" ] || fail "embedded source archive is missing"

OBSERVED_BYTES="$(/usr/bin/stat -f '%z' "$SOURCE_TAR")"
[ "$OBSERVED_BYTES" = "$EXPECTED_BYTES" ] || fail "embedded source byte length mismatch"
OBSERVED_SHA256="$(/usr/bin/shasum -a 256 "$SOURCE_TAR" | /usr/bin/awk '{print $1}')"
[ "$OBSERVED_SHA256" = "$EXPECTED_SHA256" ] || fail "embedded source SHA-256 mismatch"

while IFS= read -r entry; do
  [ -n "$entry" ] || fail "embedded source archive contains an empty path"
  case "$entry" in
    /*|//*|[A-Za-z]:/*) fail "embedded source archive contains an absolute path" ;;
  esac
  old_ifs="$IFS"; IFS='/'; read -r -a parts <<< "$entry"; IFS="$old_ifs"
  for part in "${parts[@]}"; do
    [ "$part" != '..' ] && [ "$part" != '.' ] || fail "embedded source archive contains traversal"
  done
done < <(/usr/bin/tar -tf "$SOURCE_TAR")

SOURCE_PARENT="$HOME/Library/Application Support/VexLife/source-packages/$EXPECTED_COMMIT"
/bin/mkdir -p "$SOURCE_PARENT"
RUN_ROOT="$(/usr/bin/mktemp -d "$SOURCE_PARENT/run.XXXXXX")" || fail "fresh source location could not be reserved"
/usr/bin/tar -xf "$SOURCE_TAR" -C "$RUN_ROOT" || fail "exact embedded source could not be materialized"

WINDOW_SOURCE="$RUN_ROOT/install/vexlife-setup-window.applescript"
BACKEND="$RUN_ROOT/install/vexlife-setup.sh"
[ -f "$WINDOW_SOURCE" ] && [ -f "$BACKEND" ] || fail "accepted Mac setup source is missing after extraction"
[ -x /usr/bin/osacompile ] && [ -x /usr/bin/plutil ] && [ -x /usr/bin/open ] || fail "required macOS setup tools are unavailable"

TMP_ROOT="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/vexlife-packaged-setup.XXXXXX")"
trap '/bin/rm -rf "$TMP_ROOT"' EXIT
WINDOW_APP="$TMP_ROOT/VexLife Setup.app"
/usr/bin/osacompile -o "$WINDOW_APP" "$WINDOW_SOURCE" || fail "accepted setup window could not be compiled"
INFO_PLIST="$WINDOW_APP/Contents/Info.plist"
/usr/bin/plutil -insert VexLifeSourceRoot -string "$RUN_ROOT" "$INFO_PLIST" || fail "exact source root could not be bound to setup window"
BOUND_ROOT="$(/usr/bin/plutil -extract VexLifeSourceRoot raw -o - "$INFO_PLIST" 2>/dev/null || true)"
[ "$BOUND_ROOT" = "$RUN_ROOT" ] || fail "setup window source-root binding did not round-trip"

RECEIPT_ROOT="$HOME/Library/Application Support/VexLife/release-bootstrap-receipts"
/bin/mkdir -p "$RECEIPT_ROOT"
RECEIPT="$RECEIPT_ROOT/macos-bootstrap-$EXPECTED_COMMIT-$(/usr/bin/uuidgen).json"
/bin/cat > "$RECEIPT" <<JSON
{
  "schemaVersion": "vexlife.release-bootstrap-launch-receipt/v1",
  "platform": "macos",
  "sourceCommit": "$EXPECTED_COMMIT",
  "sourceTree": "$EXPECTED_TREE",
  "sourceTarSha256": "$OBSERVED_SHA256",
  "sourceTarBytes": $OBSERVED_BYTES,
  "signing": false,
  "notarization": false,
  "publication": false,
  "officialVerifiedBuildPromotion": false,
  "modelRuntimeBundled": false,
  "HomeBundled": false,
  "MemoryBundled": false
}
JSON

/usr/bin/open -W -n "$WINDOW_APP" || fail "accepted setup window could not be opened"

# [VXG RealForever]
