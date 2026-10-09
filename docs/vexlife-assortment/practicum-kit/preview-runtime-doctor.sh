#!/bin/bash
set -u
MODE="${1:---report}"
case "$MODE" in --report|--clean-stale) ;; *) echo "Usage: $0 [--report|--clean-stale]" >&2; exit 2;; esac

resolve_exec(){ for candidate in "$@"; do if [ -n "$candidate" ] && [ -x "$candidate" ]; then printf '%s' "$candidate"; return 0; fi; done; return 1; }
PS="$(resolve_exec /bin/ps /usr/bin/ps "$(command -v ps 2>/dev/null || true)")" || { echo "Preview doctor: ps unavailable; no process claim made."; exit 0; }
LSOF="$(resolve_exec /usr/sbin/lsof /usr/bin/lsof /opt/homebrew/bin/lsof /usr/local/bin/lsof "$(command -v lsof 2>/dev/null || true)" || true)"
AWK="$(resolve_exec /usr/bin/awk /bin/awk "$(command -v awk 2>/dev/null || true)" || true)"
SED="$(resolve_exec /usr/bin/sed /bin/sed "$(command -v sed 2>/dev/null || true)" || true)"

if [ -z "$LSOF" ] || [ -z "$AWK" ] || [ -z "$SED" ]; then
  echo "Preview doctor: lsof/awk/sed unavailable; safe stale-process cleanup cannot be proved, so nothing will be killed."
  exit 0
fi

owned_processes(){
  "$PS" -axo pid=,ppid=,command= | while IFS= read -r line; do
    pid="$(printf '%s\n' "$line" | "$AWK" '{print $1}')"
    ppid="$(printf '%s\n' "$line" | "$AWK" '{print $2}')"
    cmd="$(printf '%s\n' "$line" | "$SED" -E 's/^[[:space:]]*[0-9]+[[:space:]]+[0-9]+[[:space:]]+//')"
    [ -n "$pid" ] || continue
    case "$cmd" in
      *serve-browser.mjs*)
        cwd="$($LSOF -a -p "$pid" -d cwd -Fn 2>/dev/null | "$SED" -n 's/^n//p' | head -1)"
        case "$cwd" in
          *vexlife-assortment-*/VexLife) printf 'SERVER|%s|%s|%s|%s\n' "$pid" "$ppid" "$cwd" "$cmd" ;;
        esac
        ;;
      *--user-data-dir=*vexlife-assortment-*/browser-profile*|*--user-data-dir=*vexlife-assortment-*/smoke-profile*)
        printf 'BROWSER|%s|%s||%s\n' "$pid" "$ppid" "$cmd"
        ;;
    esac
  done
}

snapshot="$(owned_processes)"
if [ -z "$snapshot" ]; then
  echo "Preview runtime doctor: no stale Assortment preview-owned process found."
  exit 0
fi

echo "Preview runtime doctor: found package-owned preview runtime process(es):"
printf '%s\n' "$snapshot" | while IFS='|' read -r kind pid ppid cwd cmd; do
  listener="$($LSOF -Pan -p "$pid" -iTCP -sTCP:LISTEN -Fn 2>/dev/null | "$SED" -n 's/^n//p' | head -1)"
  printf '  %s pid=%s ppid=%s' "$kind" "$pid" "$ppid"
  [ -z "$listener" ] || printf ' listener=%s' "$listener"
  [ -z "$cwd" ] || printf ' cwd=%s' "$cwd"
  printf '\n'
done

[ "$MODE" = "--clean-stale" ] || exit 0

echo "Preview runtime doctor: cleaning only proved Assortment preview-owned processes..."
printf '%s\n' "$snapshot" | while IFS='|' read -r kind pid ppid cwd cmd; do [ "$kind" = "BROWSER" ] && kill -TERM "$pid" >/dev/null 2>&1 || true; done
sleep 0.5
printf '%s\n' "$snapshot" | while IFS='|' read -r kind pid ppid cwd cmd; do [ "$kind" = "SERVER" ] && kill -TERM "$pid" >/dev/null 2>&1 || true; done
sleep 0.8
printf '%s\n' "$snapshot" | while IFS='|' read -r kind pid ppid cwd cmd; do if kill -0 "$pid" >/dev/null 2>&1; then kill -KILL "$pid" >/dev/null 2>&1 || true; fi; done

echo "Preview runtime doctor: cleanup complete. Unrelated VexLife/product/Node processes were not targeted."
