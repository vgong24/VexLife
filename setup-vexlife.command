#!/bin/bash
set -euo pipefail

REPOSITORY="vgong24/VexLife"
SOURCE_REF="${VEXLIFE_SOURCE_REF:-main}"
SOURCE_ROOT="${VEXLIFE_SOURCE_ROOT:-$HOME/Library/Application Support/VexLife/source}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say() { printf '\n%s\n' "$1"; }
fail() { printf '\nVexLife setup stopped: %s\n' "$1" >&2; exit 1; }

# When this file is already inside exact VexLife source, do not download a second copy.
if [ -f "$SCRIPT_DIR/install/vexlife-setup.sh" ]; then
  exec /bin/bash "$SCRIPT_DIR/install/vexlife-setup.sh" "$SCRIPT_DIR"
fi

[ "$(uname -s)" = "Darwin" ] || fail "this bootstrap is for macOS."
case "$SOURCE_REF" in
  ''|*[!A-Za-z0-9._-]*) fail "the requested source ref is not a supported GitHub ref." ;;
esac
for tool in /usr/bin/curl /usr/bin/tar /usr/bin/plutil /usr/bin/mktemp; do
  [ -x "$tool" ] || fail "a required macOS system tool is unavailable: $tool"
done

say "Getting VexLife..."
TMP_ROOT="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/vexlife-bootstrap.XXXXXX")"
trap '/bin/rm -rf "$TMP_ROOT"' EXIT
META="$TMP_ROOT/source.json"
ARCHIVE="$TMP_ROOT/vexlife.tar.gz"
EXTRACT_ROOT="$TMP_ROOT/extracted"
/bin/mkdir -p "$EXTRACT_ROOT"

/usr/bin/curl --proto '=https' --tlsv1.2 -fsSL --retry 3 \
  "https://api.github.com/repos/$REPOSITORY/commits/$SOURCE_REF" -o "$META" \
  || fail "the VexLife source could not be resolved from GitHub."
SOURCE_SHA="$(/usr/bin/plutil -extract sha raw -o - "$META" 2>/dev/null || true)"
case "$SOURCE_SHA" in
  ????????) fail "GitHub returned an abbreviated source identity." ;;
  *[!0-9a-fA-F]*|'') fail "GitHub did not return one exact source identity." ;;
esac
[ "${#SOURCE_SHA}" -eq 40 ] || fail "GitHub did not return one exact source identity."
SOURCE_SHA="$(printf '%s' "$SOURCE_SHA" | tr '[:upper:]' '[:lower:]')"

/usr/bin/curl --proto '=https' --tlsv1.2 -fsSL --retry 3 \
  "https://codeload.github.com/$REPOSITORY/tar.gz/$SOURCE_SHA" -o "$ARCHIVE" \
  || fail "the exact VexLife source could not be downloaded."

while IFS= read -r entry; do
  case "$entry" in
    /*|../*|*/../*|*/..) fail "the downloaded source archive contained an unsafe path." ;;
  esac
done < <(/usr/bin/tar -tzf "$ARCHIVE")
/usr/bin/tar -xzf "$ARCHIVE" -C "$EXTRACT_ROOT"

shopt -s nullglob dotglob
entries=("$EXTRACT_ROOT"/*)
shopt -u nullglob dotglob
[ "${#entries[@]}" -eq 1 ] && [ -d "${entries[0]}" ] \
  || fail "the downloaded VexLife source did not contain one source root."
DOWNLOADED_ROOT="${entries[0]}"
[ -f "$DOWNLOADED_ROOT/install/vexlife-setup.sh" ] \
  || fail "the downloaded source is missing the Mac setup owner."
[ -f "$DOWNLOADED_ROOT/SOURCE-MANIFEST.json" ] \
  || fail "the downloaded source is missing its Source Manifest."

TARGET="$SOURCE_ROOT/$SOURCE_SHA"
/bin/mkdir -p "$SOURCE_ROOT"
if [ -e "$TARGET" ]; then
  [ -d "$TARGET" ] && [ -f "$TARGET/install/vexlife-setup.sh" ] \
    || fail "the existing VexLife source location is not reusable safely."
else
  /bin/mv "$DOWNLOADED_ROOT" "$TARGET"
fi

say "VexLife source is ready."
exec /bin/bash "$TARGET/install/vexlife-setup.sh" "$TARGET"

# [VXG RealForever]
