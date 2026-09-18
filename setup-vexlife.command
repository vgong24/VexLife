#!/bin/bash
set -euo pipefail

REPOSITORY="vgong24/VexLife"
SOURCE_REF="${VEXLIFE_SOURCE_REF:-main}"
SOURCE_ROOT="${VEXLIFE_SOURCE_ROOT:-$HOME/Library/Application Support/VexLife/source}"
SETUP_MODE="${VEXLIFE_SETUP_MODE:-window}"

say() { printf '\n%s\n' "$1"; }
fail() { printf '\nVexLife setup stopped: %s\n' "$1" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "this bootstrap is for macOS."
case "$SOURCE_REF" in
  ''|*[!A-Za-z0-9._-]*) fail "the requested source ref is not a supported GitHub ref." ;;
esac
case "$SETUP_MODE" in
  window|terminal) ;;
  *) fail "VEXLIFE_SETUP_MODE must be 'window' or 'terminal'." ;;
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

/bin/mkdir -p "$SOURCE_ROOT"
# A SHA-shaped shared path is never execution authority. Every invocation reserves
# one private execution parent before materialization, so a concurrent same-SHA
# setup cannot create or substitute the execution target between a check and move.
RUN_PARENT="$(/usr/bin/mktemp -d "$SOURCE_ROOT/$SOURCE_SHA.run.XXXXXX")" \
  || fail "a fresh exact-source location could not be reserved safely."
TARGET="$RUN_PARENT/source"
/bin/mv "$DOWNLOADED_ROOT" "$TARGET" \
  || fail "the fresh exact VexLife source could not be materialized safely."
[ -f "$TARGET/install/vexlife-setup.sh" ] && [ -f "$TARGET/SOURCE-MANIFEST.json" ] \
  || fail "the fresh exact VexLife source did not materialize completely."

say "VexLife source is ready."
if [ "$SETUP_MODE" = "terminal" ]; then
  exec /bin/bash "$TARGET/install/vexlife-setup.sh" "$TARGET"
fi

WINDOW="$TARGET/install/vexlife-setup-window.applescript"
[ -f "$WINDOW" ] || fail "the exact VexLife source is missing the Mac setup window. Run again with VEXLIFE_SETUP_MODE=terminal for the accepted Terminal route."
[ -x /usr/bin/osacompile ] || fail "macOS AppleScript compilation is unavailable. Run again with VEXLIFE_SETUP_MODE=terminal for the accepted Terminal route."
[ -x /usr/bin/open ] || fail "macOS application launch is unavailable. Run again with VEXLIFE_SETUP_MODE=terminal for the accepted Terminal route."

# The ordinary human window runs as a real source-local macOS application. The
# command-line bootstrap remains only the exact-source materializer/launcher; it
# does not host the AppKit controls itself. The temporary app carries one exact
# source-root binding in its private bundle metadata and is discarded with TMP_ROOT.
WINDOW_APP="$TMP_ROOT/VexLife Setup.app"
/usr/bin/osacompile -o "$WINDOW_APP" "$WINDOW" \
  || fail "the exact VexLife source-local Mac setup app could not be compiled. Run again with VEXLIFE_SETUP_MODE=terminal for the accepted Terminal route."
INFO_PLIST="$WINDOW_APP/Contents/Info.plist"
[ -f "$INFO_PLIST" ] || fail "the source-local Mac setup app is missing its bundle metadata."
/usr/bin/plutil -insert VexLifeSourceRoot -string "$TARGET" "$INFO_PLIST" \
  || fail "the exact source root could not be bound to the source-local Mac setup app."
BOUND_SOURCE_ROOT="$(/usr/bin/plutil -extract VexLifeSourceRoot raw -o - "$INFO_PLIST" 2>/dev/null || true)"
[ "$BOUND_SOURCE_ROOT" = "$TARGET" ] \
  || fail "the source-local Mac setup app did not retain the exact source-root binding."

/usr/bin/open -W -n "$WINDOW_APP" \
  || fail "the source-local Mac setup app could not be opened. Run again with VEXLIFE_SETUP_MODE=terminal for the accepted Terminal route."

# [VXG RealForever]
